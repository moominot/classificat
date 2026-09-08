import { NextResponse } from 'next/server';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import {
  matchAnswers,
  matchParticipants,
  matchRevisions,
  matches,
  phases,
  questionDefinitions,
  rounds,
} from '@/db/schema';
import { canManageTournament, canReportResult, getViewer } from '@/lib/authz';
import { scoreMatch } from '@/lib/pairing/scoring';

type Params = { params: Promise<{ tournamentId: string; roundId: string }> };

interface ParticipantInput {
  entryId: string;
  score?: number | null;
  rank?: number | null;
}

interface AnswerInput {
  questionId: string;
  /** null quan la pregunta és d'àmbit `match`. */
  entryId?: string | null;
  textValue?: string | null;
  numberValue?: number | null;
  imageUrl?: string | null;
}

/**
 * PUT — Registra o corregeix el resultat d'una partida.
 *
 * Qui hi pot escriure (docs/pla-rols.md §15.6 i §15.7):
 *  - l'admin, **sempre**, encara que la ronda estigui tancada;
 *  - un jugador, només les seves partides i mentre la ronda sigui oberta.
 *
 * Tot el que entra queda amb traça a `match_revisions`: qui era, des d'on i
 * què deia abans. És el que permet explicar després una classificació que ha
 * canviat.
 */
export async function PUT(req: Request, { params }: Params) {
  const { tournamentId, roundId } = await params;
  const body = await req.json().catch(() => ({}));
  const { matchId, participants, answers, location, comments } = body as {
    matchId?: string;
    participants?: ParticipantInput[];
    answers?: AnswerInput[];
    location?: string;
    comments?: string;
  };

  if (!matchId) return NextResponse.json({ error: 'Cal matchId' }, { status: 400 });

  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) return NextResponse.json({ error: 'Partida no trobada' }, { status: 404 });
  if (match.roundId !== roundId) {
    return NextResponse.json({ error: 'La partida no pertany a aquesta ronda' }, { status: 400 });
  }

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.tournamentId, tournamentId)));
  if (!round) return NextResponse.json({ error: 'Ronda no trobada' }, { status: 404 });

  const existingParticipants = await db
    .select()
    .from(matchParticipants)
    .where(eq(matchParticipants.matchId, matchId))
    .orderBy(matchParticipants.seat);

  const viewer = await getViewer(tournamentId);
  const managesTournament = viewer.account
    ? await canManageTournament(viewer.account, tournamentId)
    : false;

  const allowed = canReportResult(viewer, {
    participantEntryIds: existingParticipants.map((p) => p.entryId),
    roundIsOpen: round.status === 'open',
    managesTournament,
  });

  if (!allowed) {
    return NextResponse.json(
      {
        error:
          round.status === 'open'
            ? 'Només pots enviar el resultat de les teves partides'
            : 'La ronda està tancada: només el director pot corregir el resultat',
      },
      { status: 403 }
    );
  }

  const [phase] = await db.select().from(phases).where(eq(phases.id, round.phaseId));
  if (!phase) return NextResponse.json({ error: 'Fase no trobada' }, { status: 404 });

  const before = existingParticipants.map((p) => ({
    entryId: p.entryId,
    rank: p.rank,
    score: p.score,
    points: p.points,
  }));

  // El bye no es reporta: ja té resultat des que es generen els aparellaments.
  if (existingParticipants.length === 1) {
    return NextResponse.json({ ok: true, bye: true });
  }

  const inputByEntry = new Map((participants ?? []).map((p) => [p.entryId, p]));
  const missing = existingParticipants.filter((p) => {
    const input = inputByEntry.get(p.entryId);
    return !input || (input.score == null && input.rank == null);
  });
  if (missing.length > 0) {
    return NextResponse.json(
      { error: 'Cal el resultat de tots els participants de la partida' },
      { status: 400 }
    );
  }

  // Posicions, resultats i punts es deriven en un sol lloc (§12.10).
  const scored = scoreMatch(
    existingParticipants.map((p) => ({
      entryId: p.entryId,
      score: inputByEntry.get(p.entryId)?.score ?? null,
      rank: inputByEntry.get(p.entryId)?.rank ?? null,
    })),
    phase.scoring
  );

  for (const participant of existingParticipants) {
    const result = scored.find((s) => s.entryId === participant.entryId);
    if (!result) continue;
    await db
      .update(matchParticipants)
      .set({ rank: result.rank, score: result.score, outcome: result.outcome, points: result.points })
      .where(eq(matchParticipants.id, participant.id));
  }

  await db
    .update(matches)
    .set({ location: location ?? null, comments: comments ?? null })
    .where(eq(matches.id, matchId));

  await saveAnswers(tournamentId, matchId, existingParticipants, answers ?? []);

  await db.insert(matchRevisions).values({
    id: uuid(),
    matchId,
    actorKind: viewer.kind,
    actorAccountId: viewer.account?.id ?? null,
    actorEntryId: viewer.entryId ?? null,
    deviceId: viewer.deviceId ?? null,
    createdAt: new Date(),
    before,
    after: scored.map((s) => ({ entryId: s.entryId, rank: s.rank, score: s.score, points: s.points })),
  });

  return NextResponse.json({ ok: true, participants: scored });
}

/**
 * Desa les respostes de les preguntes.
 *
 * Ja no hi ha columnes fixes d'Scrabble: bingos, millor jugada i fotos són
 * respostes com qualsevol altra, i les que tenen agregació alimenten les
 * mètriques de la classificació (§12.1).
 */
async function saveAnswers(
  tournamentId: string,
  matchId: string,
  participants: Array<{ id: string; entryId: string }>,
  answers: AnswerInput[]
) {
  if (answers.length === 0) return;

  const questionIds = [...new Set(answers.map((a) => a.questionId))];
  const questions = await db
    .select()
    .from(questionDefinitions)
    .where(
      and(
        eq(questionDefinitions.tournamentId, tournamentId),
        inArray(questionDefinitions.id, questionIds)
      )
    );
  const known = new Set(questions.map((q) => q.id));
  const participantIdByEntry = new Map(participants.map((p) => [p.entryId, p.id]));

  for (const answer of answers) {
    if (!known.has(answer.questionId)) continue;

    const participantId = answer.entryId ? participantIdByEntry.get(answer.entryId) ?? null : null;
    if (answer.entryId && !participantId) continue;

    await db
      .delete(matchAnswers)
      .where(
        and(
          eq(matchAnswers.matchId, matchId),
          eq(matchAnswers.questionId, answer.questionId),
          participantId === null
            ? isNull(matchAnswers.participantId)
            : eq(matchAnswers.participantId, participantId)
        )
      );

    const hasValue =
      answer.textValue != null || answer.numberValue != null || answer.imageUrl != null;
    if (!hasValue) continue;

    await db.insert(matchAnswers).values({
      id: uuid(),
      matchId,
      participantId,
      questionId: answer.questionId,
      textValue: answer.textValue ?? null,
      numberValue: answer.numberValue ?? null,
      imageUrl: answer.imageUrl ?? null,
    });
  }
}
