import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  entries,
  entryTags,
  matchAnswers,
  matchParticipants,
  matches,
  people,
  phases,
  questionDefinitions,
  rounds,
  tags,
  tournaments,
} from '@/db/schema';
import { DEFAULT_SCORING } from '@/db/types';
import type { ScoringConfig } from '@/db/types';
import type { Entrant, Match, PreviousMatch, RoundStatus, Tag } from '@/lib/pairing/types';
import type { MetricAnswer, QuestionMetric, ScoredMatch } from '@/lib/pairing/standings';

/**
 * Càrrega de dades per al motor d'aparellaments i les classificacions.
 *
 * Tot el que surt d'aquí parla d'inscripcions (`entries`), no de persones: el
 * motor no sap qui hi ha al darrere (docs/pla-rols.md §12.3).
 */

/**
 * Les etiquetes de cada inscripció, com a mapa — una consulta a part perquè
 * Drizzle no fa arrays en un sol `select()` (§ etiquetes, substitueixen els
 * grups com a mecanisme de categorització).
 */
async function loadTagIdsByEntry(entryIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (entryIds.length === 0) return result;

  const rows = await db
    .select({ entryId: entryTags.entryId, tagId: entryTags.tagId })
    .from(entryTags)
    .where(inArray(entryTags.entryId, entryIds));

  for (const row of rows) {
    result.set(row.entryId, [...(result.get(row.entryId) ?? []), row.tagId]);
  }
  return result;
}

/** Les etiquetes d'una competició. */
export async function loadTags(tournamentId: string): Promise<Tag[]> {
  return db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(eq(tags.tournamentId, tournamentId))
    .orderBy(asc(tags.name));
}

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

  const tagIdsByEntry = await loadTagIdsByEntry(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, tagIds: tagIdsByEntry.get(r.id) ?? [] }));
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

/**
 * Les rondes que compten per a tot el que és públic — classificació general,
 * mètriques de preguntes i el seu historial: tancades i amb els resultats
 * fets públics (§8.2, §15.6). `resultsVisible` ja existia per amagar el
 * marcador d'una partida concreta; cal el mateix filtre aquí perquè una
 * ronda amagada no es colés per la porta del darrere via les classificacions
 * secundàries (Bingos, Millor jugada...), que no passaven per aquest sedàs.
 */
export async function loadVisibleRoundIds(tournamentId: string): Promise<Set<string>> {
  const [tournament] = await db
    .select({ visibility: tournaments.visibility })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId));
  const defaultResultsVisible = tournament?.visibility?.resultsVisible ?? true;

  const roundRows = await db
    .select({ id: rounds.id, status: rounds.status, resultsVisible: rounds.resultsVisible })
    .from(rounds)
    .where(eq(rounds.tournamentId, tournamentId));

  return new Set(
    roundRows
      .filter((r) => r.status === 'closed' && (r.resultsVisible ?? defaultResultsVisible))
      .map((r) => r.id)
  );
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
  const visibleIds = opts.onlyClosedRounds ? await loadVisibleRoundIds(tournamentId) : null;

  const usable = roundRows.filter((r) => {
    if (visibleIds && !visibleIds.has(r.id)) return false;
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
export async function loadQuestionMetrics(
  tournamentId: string,
  opts: { onlyClosedRounds?: boolean; phaseIds?: string[] } = {}
): Promise<{
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
  const visibleIds = opts.onlyClosedRounds ? await loadVisibleRoundIds(tournamentId) : null;
  const phaseFilter = opts.phaseIds ? new Set(opts.phaseIds) : null;

  const rows = await db
    .select({
      questionId: matchAnswers.questionId,
      numberValue: matchAnswers.numberValue,
      entryId: matchParticipants.entryId,
      roundId: matches.roundId,
      phaseId: rounds.phaseId,
    })
    .from(matchAnswers)
    .innerJoin(matchParticipants, eq(matchParticipants.id, matchAnswers.participantId))
    .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
    .innerJoin(rounds, eq(rounds.id, matches.roundId))
    .where(inArray(matchAnswers.questionId, definitions.map((d) => d.id)));

  const answers: MetricAnswer[] = rows
    .filter(
      (r) =>
        r.numberValue !== null &&
        (!visibleIds || visibleIds.has(r.roundId)) &&
        (!phaseFilter || phaseFilter.has(r.phaseId))
    )
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
 * Les paraules de les preguntes "paraula + valor" (type wordvalue), perquè
 * els destacats i la classificació puguin mostrar-la al costat del valor.
 *
 * Un `sum`/`avg`/`count` no té "la" resposta — en són diverses sumades — però
 * `max` sí: la paraula que ha fet aquell punt és la que es mostra.
 */
async function loadWordAnswers(
  tournamentId: string,
  entryId: string,
  opts: { onlyClosedRounds?: boolean } = {}
): Promise<Map<string, { value: number; text: string }>> {
  const wordQuestions = await db
    .select({ id: questionDefinitions.id, key: questionDefinitions.key })
    .from(questionDefinitions)
    .where(
      and(eq(questionDefinitions.tournamentId, tournamentId), eq(questionDefinitions.type, 'wordvalue'))
    );
  if (wordQuestions.length === 0) return new Map();

  const visibleIds = opts.onlyClosedRounds ? await loadVisibleRoundIds(tournamentId) : null;

  const rows = await db
    .select({
      questionId: matchAnswers.questionId,
      textValue: matchAnswers.textValue,
      numberValue: matchAnswers.numberValue,
      roundId: matches.roundId,
    })
    .from(matchAnswers)
    .innerJoin(matchParticipants, eq(matchParticipants.id, matchAnswers.participantId))
    .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
    .where(
      and(
        eq(matchParticipants.entryId, entryId),
        inArray(matchAnswers.questionId, wordQuestions.map((q) => q.id))
      )
    );

  const keyByQuestionId = new Map(wordQuestions.map((q) => [q.id, q.key]));
  const best = new Map<string, { value: number; text: string }>();
  for (const row of rows) {
    if (!row.textValue) continue;
    if (visibleIds && !visibleIds.has(row.roundId)) continue;
    const key = keyByQuestionId.get(row.questionId);
    if (!key) continue;
    const value = row.numberValue ?? 0;
    const current = best.get(key);
    if (!current || value > current.value) best.set(key, { value, text: row.textValue });
  }
  return best;
}

/** La paraula de cada pregunta wordvalue d'un únic jugador (per als destacats). */
export async function loadEntryWordAnswers(
  tournamentId: string,
  entryId: string,
  opts: { onlyClosedRounds?: boolean } = {}
): Promise<Map<string, string>> {
  const best = await loadWordAnswers(tournamentId, entryId, opts);
  return new Map([...best].map(([key, v]) => [key, v.text]));
}

/**
 * Com `loadEntrants()`, però amb les dades de contacte de la persona.
 *
 * Només per a les pantalles de gestió: el telèfon i el correu es veuen si
 * l'admin té aquella persona en una competició seva (docs/pla-rols.md §14.4).
 */
export async function loadEntrantsWithContact(tournamentId: string) {
  const rows = await db
    .select({
      id: entries.id,
      tournamentId: entries.tournamentId,
      personId: entries.personId,
      displayName: people.displayName,
      club: people.club,
      phone: people.phone,
      barrufNumero: people.barrufNumero,
      rating: entries.rating,
      groupId: entries.groupId,
      teamId: entries.teamId,
      isActive: entries.isActive,
    })
    .from(entries)
    .innerJoin(people, eq(people.id, entries.personId))
    .where(eq(entries.tournamentId, tournamentId));

  const tagIdsByEntry = await loadTagIdsByEntry(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, tagIds: tagIdsByEntry.get(r.id) ?? [] }));
}

// ─── Historial d'una mètrica ───────────────────────────────────────────────────

export interface MetricHistoryRow {
  roundNumber: number;
  matchId: string;
  value: number;
  /** Només a les preguntes "paraula + valor" (p.ex. Millor jugada). */
  word: string | null;
  opponentNames: string[];
}

/**
 * Totes les respostes d'una pregunta (una per ronda jugada), perquè el
 * rànquing d'una mètrica pugui desplegar l'historial complet d'un jugador en
 * lloc de només el millor valor (docs/pla-rols.md §12.1 i §15.3).
 */
export async function loadMetricHistory(
  tournamentId: string,
  questionKey: string,
  opts: { onlyClosedRounds?: boolean; phaseIds?: string[] } = {}
): Promise<Map<string, MetricHistoryRow[]>> {
  const result = new Map<string, MetricHistoryRow[]>();

  const [question] = await db
    .select({ id: questionDefinitions.id })
    .from(questionDefinitions)
    .where(and(eq(questionDefinitions.tournamentId, tournamentId), eq(questionDefinitions.key, questionKey)));
  if (!question) return result;

  const visibleIds = opts.onlyClosedRounds ? await loadVisibleRoundIds(tournamentId) : null;
  const phaseFilter = opts.phaseIds ? new Set(opts.phaseIds) : null;

  const roundRows = (
    await db
      .select({ id: rounds.id, number: rounds.number, phaseId: rounds.phaseId })
      .from(rounds)
      .where(eq(rounds.tournamentId, tournamentId))
  ).filter((r) => (!visibleIds || visibleIds.has(r.id)) && (!phaseFilter || phaseFilter.has(r.phaseId)));
  if (roundRows.length === 0) return result;
  const roundNumberById = new Map(roundRows.map((r) => [r.id, r.number]));

  const matchRows = await db
    .select({ id: matches.id, roundId: matches.roundId })
    .from(matches)
    .where(inArray(matches.roundId, roundRows.map((r) => r.id)));
  if (matchRows.length === 0) return result;
  const roundIdByMatch = new Map(matchRows.map((m) => [m.id, m.roundId]));

  const [participantRows, answerRows, entrants] = await Promise.all([
    db
      .select({ id: matchParticipants.id, matchId: matchParticipants.matchId, entryId: matchParticipants.entryId })
      .from(matchParticipants)
      .where(inArray(matchParticipants.matchId, matchRows.map((m) => m.id))),
    db
      .select({ participantId: matchAnswers.participantId, numberValue: matchAnswers.numberValue, textValue: matchAnswers.textValue })
      .from(matchAnswers)
      .where(eq(matchAnswers.questionId, question.id)),
    loadEntrants(tournamentId),
  ]);

  const nameByEntry = new Map(entrants.map((e) => [e.id, e.displayName]));
  const answerByParticipant = new Map(
    answerRows.filter((a) => a.participantId !== null).map((a) => [a.participantId as string, a])
  );

  const byMatch = new Map<string, typeof participantRows>();
  for (const p of participantRows) {
    const list = byMatch.get(p.matchId) ?? [];
    list.push(p);
    byMatch.set(p.matchId, list);
  }

  for (const [matchId, parts] of byMatch) {
    if (parts.length < 2) continue; // un bye no té resposta a cap pregunta
    const roundNumber = roundNumberById.get(roundIdByMatch.get(matchId)!);
    if (roundNumber === undefined) continue;

    for (const p of parts) {
      const answer = answerByParticipant.get(p.id);
      if (!answer || answer.numberValue === null) continue;
      const opponentNames = parts.filter((x) => x.id !== p.id).map((x) => nameByEntry.get(x.entryId) ?? '?');
      const list = result.get(p.entryId) ?? [];
      list.push({ roundNumber, matchId, value: answer.numberValue, word: answer.textValue, opponentNames });
      result.set(p.entryId, list);
    }
  }

  for (const list of result.values()) list.sort((a, b) => b.value - a.value);
  return result;
}
