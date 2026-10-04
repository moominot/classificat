import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import {
  entries,
  matchAnswers,
  matchParticipants,
  matchRevisions,
  matches,
  people,
  phases,
  questionDefinitions,
  rounds,
} from '@/db/schema';
import { requireTournamentAccess } from '@/lib/authz';
import { loadRoundMatches } from '@/lib/db-helpers';
import { scoreMatch } from '@/lib/pairing/scoring';
import { saveAnswers } from '@/lib/pairing/match-answers';
import {
  buildResultsCsvColumns,
  buildResultsCsvRow,
  escapeCsvField,
  parseCsvLine,
  parseResultsCsvRow,
  type AnswerValue,
  type ResultsCsvColumn,
  type SeatData,
} from '@/lib/pairing/utils/results-csv';

type Params = { params: Promise<{ tournamentId: string; roundId: string }> };

/**
 * CSV de resultats, una fila per partida (vegeu `lib/pairing/utils/results-csv.ts`
 * pel format exacte de columnes). Exportació i importació fan servir la
 * MATEIXA generació de columnes perquè vagin alineades per posició.
 */

async function loadColumns(tournamentId: string, phaseId: string): Promise<ResultsCsvColumn[]> {
  const [phase] = await db.select().from(phases).where(eq(phases.id, phaseId));
  const questions = await db
    .select()
    .from(questionDefinitions)
    .where(eq(questionDefinitions.tournamentId, tournamentId))
    .orderBy(questionDefinitions.order);

  return buildResultsCsvColumns(questions, phase?.participantsPerMatch ?? 2);
}

export async function GET(_req: Request, { params }: Params) {
  const { tournamentId, roundId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.tournamentId, tournamentId)));
  if (!round) return NextResponse.json({ error: 'Ronda no trobada' }, { status: 404 });

  const columns = await loadColumns(tournamentId, round.phaseId);
  const roundMatches = await loadRoundMatches(roundId);

  const entryRows = await db
    .select({ id: entries.id, displayName: people.displayName, barrufNumero: people.barrufNumero })
    .from(entries)
    .innerJoin(people, eq(people.id, entries.personId))
    .where(eq(entries.tournamentId, tournamentId));
  const entryInfo = new Map(entryRows.map((r) => [r.id, r]));

  const matchIds = roundMatches.map((m) => m.id);
  const answerRows = matchIds.length
    ? await db.select().from(matchAnswers).where(inArray(matchAnswers.matchId, matchIds))
    : [];
  const answersByMatch = new Map<string, typeof answerRows>();
  for (const a of answerRows) {
    answersByMatch.set(a.matchId, [...(answersByMatch.get(a.matchId) ?? []), a]);
  }

  // L'última revisió de cada partida és quan es va enviar/corregir el
  // resultat per últim cop — no hi ha cap altra marca de temps fiable per a
  // "quan s'ha jugat" (vegeu comentari a `matches.createdAt`, que és quan es
  // va generar l'aparellament, no quan es va jugar).
  const revisionRows = matchIds.length
    ? await db.select().from(matchRevisions).where(inArray(matchRevisions.matchId, matchIds))
    : [];
  const lastRevisionByMatch = new Map<string, Date>();
  for (const r of revisionRows) {
    const prev = lastRevisionByMatch.get(r.matchId);
    if (!prev || r.createdAt > prev) lastRevisionByMatch.set(r.matchId, r.createdAt);
  }

  const toAnswerValue = (a: { questionId: string; textValue: string | null; numberValue: number | null; imageUrl: string | null }): AnswerValue => ({
    questionId: a.questionId,
    textValue: a.textValue,
    numberValue: a.numberValue,
    imageUrl: a.imageUrl,
  });

  const lines = roundMatches.map((match) => {
    const matchAnswersRows = answersByMatch.get(match.id) ?? [];
    const participantIdByEntry = new Map(match.participants.map((p) => [p.id, p.entryId]));
    const commonAnswers = matchAnswersRows.filter((a) => a.participantId === null).map(toAnswerValue);

    const seats: Array<SeatData | null> = match.participants.map((p) => ({
      entryId: p.entryId,
      name: entryInfo.get(p.entryId)?.displayName ?? '',
      barrufNumero: entryInfo.get(p.entryId)?.barrufNumero ?? null,
      score: p.score,
      answers: matchAnswersRows
        .filter((a) => a.participantId === p.id || (a.participantId && participantIdByEntry.get(a.participantId) === p.entryId))
        .map(toAnswerValue),
    }));

    const row = buildResultsCsvRow(columns, {
      matchId: match.id,
      timestamp: lastRevisionByMatch.get(match.id)?.toISOString() ?? '',
      roundNumber: round.number,
      seats,
      common: commonAnswers,
    });

    return row.map(escapeCsvField).join(',');
  });

  const header = columns.map((c) => escapeCsvField(c.header)).join(',');

  return new Response([header, ...lines].join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ronda-${round.number}.csv"`,
    },
  });
}

/**
 * POST — Importa resultats en bloc des del mateix format que exporta el GET.
 *
 * S'identifica la partida per `idPartida`; els seients es llegeixen per
 * posició de columna (Jugador 1 = primer participant per `seat`, etc.), no
 * pel nom ni per `idBARRUF` — aquestes dues columnes són només informatives.
 */
export async function POST(req: Request, { params }: Params) {
  const { tournamentId, roundId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.tournamentId, tournamentId)));
  if (!round) return NextResponse.json({ error: 'Ronda no trobada' }, { status: 404 });

  const [phase] = await db.select().from(phases).where(eq(phases.id, round.phaseId));
  if (!phase) return NextResponse.json({ error: 'Fase no trobada' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const csv: string | undefined = body?.csv;
  if (typeof csv !== 'string' || !csv.trim()) {
    return NextResponse.json({ error: 'Cal el contingut del CSV' }, { status: 400 });
  }

  const columns = await loadColumns(tournamentId, round.phaseId);
  const expectedHeader = columns.map((c) => c.header).join(',');

  const lines = csv.trim().split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.length > 0);
  if (lines.length < 1) {
    return NextResponse.json({ error: 'El CSV és buit' }, { status: 400 });
  }
  if (lines[0].trim() !== expectedHeader) {
    return NextResponse.json(
      { error: "La capçalera del CSV no coincideix amb l'esperada. Exporta de nou i edita's sobre aquella base." },
      { status: 400 }
    );
  }

  const roundMatches = await loadRoundMatches(roundId);
  const matchById = new Map(roundMatches.map((m) => [m.id, m]));

  const errors: string[] = [];
  let updated = 0;

  for (let i = 1; i < lines.length; i++) {
    const parsed = parseResultsCsvRow(columns, parseCsvLine(lines[i]));
    if (!parsed.matchId) continue;

    const match = matchById.get(parsed.matchId);
    if (!match) {
      errors.push(`Partida no trobada: ${parsed.matchId}`);
      continue;
    }
    if (match.participants.length <= 1) continue; // bye: ja té resultat assignat

    const seatData = parsed.perSeat.slice(0, match.participants.length);
    if (seatData.some((s) => s === null)) {
      errors.push(`Falten resultats de la partida ${parsed.matchId}`);
      continue;
    }

    const before = match.participants.map((p) => ({ entryId: p.entryId, rank: p.rank, score: p.score, points: p.points }));

    const inputs = match.participants.map((p, seat) => ({
      entryId: p.entryId,
      score: seatData[seat]!.score,
      rank: null,
    }));
    const scored = scoreMatch(inputs, phase.scoring);

    for (const participant of match.participants) {
      const result = scored.find((s) => s.entryId === participant.entryId);
      if (!result) continue;
      await db
        .update(matchParticipants)
        .set({ rank: result.rank, score: result.score, outcome: result.outcome, points: result.points })
        .where(eq(matchParticipants.id, participant.id));
    }

    const perSeatAnswers = match.participants.flatMap((p, seat) =>
      seatData[seat]!.answers.map((a) => ({ ...a, entryId: p.entryId }))
    );
    await saveAnswers(
      tournamentId,
      match.id,
      match.participants,
      [...perSeatAnswers, ...parsed.common.map((a) => ({ ...a, entryId: null }))]
    );

    await db.insert(matchRevisions).values({
      id: uuid(),
      matchId: match.id,
      actorKind: 'account',
      actorAccountId: guard.account.id,
      actorEntryId: null,
      deviceId: null,
      createdAt: new Date(),
      before,
      after: scored.map((s) => ({ entryId: s.entryId, rank: s.rank, score: s.score, points: s.points })),
    });

    updated++;
  }

  return NextResponse.json({ updated, errors });
}
