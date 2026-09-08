import { and, eq, inArray } from 'drizzle-orm';
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
} from '@/db/schema';
import { DEFAULT_SCORING } from '@/db/types';
import type { ScoringConfig } from '@/db/types';
import type { Entrant, Match, PreviousMatch, RoundStatus } from '@/lib/pairing/types';
import type { MetricAnswer, QuestionMetric, ScoredMatch } from '@/lib/pairing/standings';

/**
 * Càrrega de dades per al motor d'aparellaments i les classificacions.
 *
 * Tot el que surt d'aquí parla d'inscripcions (`entries`), no de persones: el
 * motor no sap qui hi ha al darrere (docs/pla-rols.md §12.3).
 */

/** Les inscripcions d'una competició, amb el nom que es mostra. */
export async function loadEntrants(tournamentId: string): Promise<Entrant[]> {
  const rows = await db
    .select({
      id: entries.id,
      tournamentId: entries.tournamentId,
      personId: entries.personId,
      displayName: people.displayName,
      rating: entries.rating,
      groupId: entries.groupId,
      teamId: entries.teamId,
      isActive: entries.isActive,
    })
    .from(entries)
    .innerJoin(people, eq(people.id, entries.personId))
    .where(eq(entries.tournamentId, tournamentId));

  return rows;
}

interface RoundRow {
  id: string;
  number: number;
  status: RoundStatus;
  phaseId: string;
  scoring: ScoringConfig;
}

/**
 * Rondes d'una competició amb la puntuació de la seva fase.
 *
 * Els punts es reparteixen segons la fase, així que qualsevol càlcul necessita
 * saber de quina fase ve cada partida.
 */
async function loadRoundRows(tournamentId: string): Promise<RoundRow[]> {
  return db
    .select({
      id: rounds.id,
      number: rounds.number,
      status: rounds.status,
      phaseId: rounds.phaseId,
      scoring: phases.scoring,
    })
    .from(rounds)
    .innerJoin(phases, eq(phases.id, rounds.phaseId))
    .where(eq(rounds.tournamentId, tournamentId));
}

async function loadParticipants(roundIds: string[]) {
  if (roundIds.length === 0) return { matchRows: [], participantRows: [] };

  const matchRows = await db.select().from(matches).where(inArray(matches.roundId, roundIds));
  if (matchRows.length === 0) return { matchRows, participantRows: [] };

  const participantRows = await db
    .select()
    .from(matchParticipants)
    .where(inArray(matchParticipants.matchId, matchRows.map((m) => m.id)));

  return { matchRows, participantRows };
}

function buildMatch(
  matchRow: { id: string; roundId: string; tableNumber: number },
  participantRows: Array<typeof matchParticipants.$inferSelect>
): Match {
  return {
    id: matchRow.id,
    roundId: matchRow.roundId,
    tableNumber: matchRow.tableNumber,
    participants: participantRows
      .filter((p) => p.matchId === matchRow.id)
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        id: p.id,
        entryId: p.entryId,
        seat: p.seat,
        rank: p.rank,
        score: p.score,
        outcome: p.outcome,
        points: p.points,
        teamId: p.teamId,
      })),
  };
}

/**
 * Totes les partides d'una competició amb la puntuació de la seva fase, a
 * punt per a `computeStandings()`.
 *
 * `onlyClosedRounds` serveix el mode de classificació `closed_rounds`, i
 * `upToRound` el mode congelat (§8.2): la classificació congelada és **fins a
 * quina ronda es mostra**, no una còpia desada.
 */
export async function loadScoredMatches(
  tournamentId: string,
  opts: { onlyClosedRounds?: boolean; upToRound?: number; phaseIds?: string[] } = {}
): Promise<ScoredMatch[]> {
  const roundRows = await loadRoundRows(tournamentId);
  const phaseFilter = opts.phaseIds ? new Set(opts.phaseIds) : null;

  const usable = roundRows.filter((r) => {
    if (opts.onlyClosedRounds && r.status !== 'closed') return false;
    if (opts.upToRound !== undefined && r.number > opts.upToRound) return false;
    if (phaseFilter && !phaseFilter.has(r.phaseId)) return false;
    return true;
  });

  const { matchRows, participantRows } = await loadParticipants(usable.map((r) => r.id));
  const scoringByRound = new Map(usable.map((r) => [r.id, r.scoring ?? DEFAULT_SCORING]));

  return matchRows.map((matchRow) => ({
    ...buildMatch(matchRow, participantRows),
    scoring: scoringByRound.get(matchRow.roundId) ?? DEFAULT_SCORING,
  }));
}

/** L'historial d'enfrontaments que necessita el motor per evitar revanxes. */
export async function loadPreviousMatches(tournamentId: string): Promise<PreviousMatch[]> {
  const roundRows = await loadRoundRows(tournamentId);
  const { matchRows, participantRows } = await loadParticipants(roundRows.map((r) => r.id));
  const roundById = new Map(roundRows.map((r) => [r.id, r]));

  return matchRows.map((matchRow) => {
    const round = roundById.get(matchRow.roundId);
    const participants = participantRows
      .filter((p) => p.matchId === matchRow.id)
      .sort((a, b) => a.seat - b.seat);

    return {
      roundNumber: round?.number ?? 0,
      phaseId: round?.phaseId ?? '',
      entryIds: participants.map((p) => p.entryId),
      ranks: participants.map((p) => p.rank),
    };
  });
}

/** Les partides d'una ronda concreta. */
export async function loadRoundMatches(roundId: string): Promise<Match[]> {
  const { matchRows, participantRows } = await loadParticipants([roundId]);
  return matchRows
    .sort((a, b) => a.tableNumber - b.tableNumber)
    .map((matchRow) => buildMatch(matchRow, participantRows));
}

/** Les partides d'una inscripció, amb el número de ronda i els rivals. */
export async function loadEntryMatches(tournamentId: string, entryId: string) {
  const roundRows = await loadRoundRows(tournamentId);
  const { matchRows, participantRows } = await loadParticipants(roundRows.map((r) => r.id));
  const roundById = new Map(roundRows.map((r) => [r.id, r]));

  const myMatchIds = new Set(
    participantRows.filter((p) => p.entryId === entryId).map((p) => p.matchId)
  );

  return matchRows
    .filter((m) => myMatchIds.has(m.id))
    .map((matchRow) => {
      const round = roundById.get(matchRow.roundId)!;
      const all = participantRows
        .filter((p) => p.matchId === matchRow.id)
        .sort((a, b) => a.seat - b.seat);
      const mine = all.find((p) => p.entryId === entryId)!;

      return {
        matchId: matchRow.id,
        roundId: matchRow.roundId,
        roundNumber: round.number,
        roundStatus: round.status,
        tableNumber: matchRow.tableNumber,
        location: matchRow.location,
        comments: matchRow.comments,
        me: mine,
        opponents: all.filter((p) => p.entryId !== entryId),
        isBye: all.length === 1,
      };
    })
    .sort((a, b) => a.roundNumber - b.roundNumber);
}

// ─── Mètriques de preguntes ───────────────────────────────────────────────────

/**
 * Les preguntes que alimenten mètriques de classificació i les respostes
 * corresponents (§12.1).
 *
 * Aquesta és la peça que converteix "bingos" o "millor jugada" en columnes i
 * desempats sense codi específic.
 */
export async function loadQuestionMetrics(tournamentId: string): Promise<{
  metrics: QuestionMetric[];
  answers: MetricAnswer[];
}> {
  const definitions = await db
    .select({
      id: questionDefinitions.id,
      key: questionDefinitions.key,
      aggregate: questionDefinitions.aggregate,
    })
    .from(questionDefinitions)
    .where(
      and(
        eq(questionDefinitions.tournamentId, tournamentId),
        // `none` vol dir que la pregunta es captura però no agrega res.
        inArray(questionDefinitions.aggregate, ['sum', 'avg', 'max', 'count'])
      )
    );

  if (definitions.length === 0) return { metrics: [], answers: [] };

  const keyByQuestionId = new Map(definitions.map((d) => [d.id, d.key]));

  const rows = await db
    .select({
      questionId: matchAnswers.questionId,
      numberValue: matchAnswers.numberValue,
      entryId: matchParticipants.entryId,
    })
    .from(matchAnswers)
    .innerJoin(matchParticipants, eq(matchParticipants.id, matchAnswers.participantId))
    .where(inArray(matchAnswers.questionId, definitions.map((d) => d.id)));

  const answers: MetricAnswer[] = rows
    .filter((r) => r.numberValue !== null)
    .map((r) => ({
      entryId: r.entryId,
      key: keyByQuestionId.get(r.questionId)!,
      value: r.numberValue as number,
    }));

  return {
    metrics: definitions.map((d) => ({
      key: d.key,
      aggregate: d.aggregate as QuestionMetric['aggregate'],
    })),
    answers,
  };
}

/**
 * Com `loadEntrants()`, però amb les dades de contacte de la persona.
 *
 * Només per a les pantalles de gestió: el telèfon i el correu es veuen si
 * l'admin té aquella persona en una competició seva (docs/pla-rols.md §14.4).
 */
export async function loadEntrantsWithContact(tournamentId: string) {
  return db
    .select({
      id: entries.id,
      tournamentId: entries.tournamentId,
      personId: entries.personId,
      displayName: people.displayName,
      club: people.club,
      phone: people.phone,
      rating: entries.rating,
      groupId: entries.groupId,
      teamId: entries.teamId,
      isActive: entries.isActive,
    })
    .from(entries)
    .innerJoin(people, eq(people.id, entries.personId))
    .where(eq(entries.tournamentId, tournamentId));
}
