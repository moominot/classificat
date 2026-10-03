import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  entries,
  matchAnswers,
  matchParticipants,
  matches,
  people,
  phases,
  questionDefinitions,
  rounds,
  tournaments,
} from '@/db/schema';

/**
 * Construeix el cos de `POST /api/v1/campionats` del BARRUF (docs/api.md)
 * a partir de les dades d'una competició.
 *
 * BARRUF és 1v1: les partides de més de 2 participants (equips) no es
 * poden representar i se salten — es compten a `partidesOmeses` perquè la
 * UI ho pugui dir. `bingos`/`best_word`/`sheet_image`/`board_image` només
 * surten si la competició té aquestes preguntes (no totes en tenen: p. ex.
 * Escacs o Genèric).
 */

export interface CampionatExtra {
  data: string; // AAAA-MM-DD
  organitzador?: string;
  clubOrganitzador?: string;
}

export async function buildCampionatPayload(tournamentId: string, extra: CampionatExtra) {
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!tournament) throw new Error('Competició no trobada');

  const [faseRows, entryRows, roundRows, questionRows] = await Promise.all([
    db.select().from(phases).where(eq(phases.tournamentId, tournamentId)),
    db
      .select({
        id: entries.id,
        displayName: people.displayName,
        barrufNumero: people.barrufNumero,
      })
      .from(entries)
      .innerJoin(people, eq(people.id, entries.personId))
      .where(eq(entries.tournamentId, tournamentId)),
    db.select().from(rounds).where(eq(rounds.tournamentId, tournamentId)),
    db
      .select({ id: questionDefinitions.id, key: questionDefinitions.key })
      .from(questionDefinitions)
      .where(eq(questionDefinitions.tournamentId, tournamentId)),
  ]);

  const roundIds = roundRows.map((r) => r.id);
  const roundNumberById = new Map(roundRows.map((r) => [r.id, r.number]));

  const matchRows = roundIds.length
    ? await db.select().from(matches).where(inArray(matches.roundId, roundIds))
    : [];
  const matchIds = matchRows.map((m) => m.id);

  const participantRows = matchIds.length
    ? await db.select().from(matchParticipants).where(inArray(matchParticipants.matchId, matchIds))
    : [];

  const questionIdByKey = new Map(questionRows.map((q) => [q.key, q.id]));
  const answerRows =
    questionRows.length && matchIds.length
      ? await db
          .select()
          .from(matchAnswers)
          .where(inArray(matchAnswers.matchId, matchIds))
      : [];

  // participantId → { key → answer }
  const answersByParticipant = new Map<string, Map<string, typeof answerRows[number]>>();
  // matchId → answer (preguntes d'àmbit `match`, participantId null)
  const answersByMatch = new Map<string, Map<string, typeof answerRows[number]>>();
  const keyByQuestionId = new Map(questionRows.map((q) => [q.id, q.key]));
  for (const a of answerRows) {
    const key = keyByQuestionId.get(a.questionId);
    if (!key) continue;
    if (a.participantId) {
      if (!answersByParticipant.has(a.participantId)) answersByParticipant.set(a.participantId, new Map());
      answersByParticipant.get(a.participantId)!.set(key, a);
    } else {
      if (!answersByMatch.has(a.matchId)) answersByMatch.set(a.matchId, new Map());
      answersByMatch.get(a.matchId)!.set(key, a);
    }
  }

  const hasQuestion = (key: string) => questionIdByKey.has(key);

  const participants = entryRows.map((e) => ({
    id: e.id,
    nom: e.displayName,
    ...(e.barrufNumero != null ? { numero: e.barrufNumero } : {}),
  }));

  let partidesOmeses = 0;
  const partides: Record<string, unknown>[] = [];

  for (const match of matchRows) {
    const ronda = roundNumberById.get(match.roundId);
    if (ronda === undefined) continue;

    const parts = participantRows
      .filter((p) => p.matchId === match.id)
      .sort((a, b) => a.seat - b.seat);

    if (parts.length === 1) {
      partides.push({ ronda, jugador_1: parts[0].entryId, jugador_2: null });
      continue;
    }

    if (parts.length !== 2) {
      if (parts.length > 2) partidesOmeses++;
      continue;
    }

    const [p1, p2] = parts;
    if (p1.score == null || p2.score == null) continue; // encara no jugada

    const partida: Record<string, unknown> = {
      ronda,
      jugador_1: p1.entryId,
      jugador_2: p2.entryId,
      punts_1: p1.score,
      punts_2: p2.score,
    };

    if (hasQuestion('bingos')) {
      const b1 = answersByParticipant.get(p1.id)?.get('bingos')?.numberValue;
      const b2 = answersByParticipant.get(p2.id)?.get('bingos')?.numberValue;
      if (b1 != null) partida.scrabbles_1 = b1;
      if (b2 != null) partida.scrabbles_2 = b2;
    }
    if (hasQuestion('best_word')) {
      const w1 = answersByParticipant.get(p1.id)?.get('best_word');
      const w2 = answersByParticipant.get(p2.id)?.get('best_word');
      if (w1?.textValue) { partida.mot_1 = w1.textValue; if (w1.numberValue != null) partida.punts_mot_1 = w1.numberValue; }
      if (w2?.textValue) { partida.mot_2 = w2.textValue; if (w2.numberValue != null) partida.punts_mot_2 = w2.numberValue; }
    }

    const dades: Record<string, unknown> = {};
    if (match.tableNumber != null) dades.taula = match.tableNumber;
    if (match.location) dades.lloc = match.location;
    if (match.comments) dades.comentaris = match.comments;
    if (hasQuestion('sheet_image')) {
      const full = answersByMatch.get(match.id)?.get('sheet_image')?.imageUrl;
      if (full) dades.full = full;
    }
    if (hasQuestion('board_image')) {
      const tauler = answersByMatch.get(match.id)?.get('board_image')?.imageUrl;
      if (tauler) dades.tauler = tauler;
    }
    if (Object.keys(dades).length > 0) partida.dades = dades;

    partides.push(partida);
  }

  const rondesPrevistes = faseRows.length
    ? Math.max(...faseRows.map((f) => f.endRound))
    : undefined;

  return {
    payload: {
      id_extern: tournament.slug,
      campionat: {
        nom: tournament.name,
        data: extra.data,
        ...(extra.organitzador ? { organitzador: extra.organitzador } : {}),
        ...(extra.clubOrganitzador ? { club_organitzador: extra.clubOrganitzador } : {}),
        ...(rondesPrevistes !== undefined ? { rondes_previstes: rondesPrevistes } : {}),
        acabat: tournament.status === 'finished',
      },
      participants,
      partides,
    },
    partidesOmeses,
  };
}
