import type { Outcome, ScoringConfig } from '@/db/types';

/**
 * Puntuació d'una partida (docs/pla-rols.md §12.10).
 *
 * **Aquest és l'únic lloc on es deriven `rank`, `outcome` i `points`.** Es
 * desen calculats a `match_participants` per comoditat de consulta, però cap
 * ruta els ha d'escriure pel seu compte: si ho fa, tindrem dues fonts de
 * veritat que divergeixen a la primera correcció.
 */

/**
 * Posicions a partir de les puntuacions, amb empats compartint posició i
 * saltant les següents: 450, 400, 400, 370 → 1, 2, 2, 4.
 *
 * Retorna null a les posicions on falta la puntuació: una partida només té
 * resultat quan el tenen tots els participants.
 */
export function ranksFromScores(scores: (number | null)[]): (number | null)[] {
  if (scores.some((s) => s === null || s === undefined)) return scores.map(() => null);

  const values = scores as number[];
  return values.map((score) => 1 + values.filter((other) => other > score).length);
}

/**
 * Els punts d'una posició concreta. Més enllà de la taula configurada,
 * `trailingPoints` (habitualment 0).
 */
export function pointsForPosition(scoring: ScoringConfig, position: number): number {
  return scoring.positionPoints[position - 1] ?? scoring.trailingPoints;
}

/**
 * Reparteix els punts entre els participants segons la posició.
 *
 * Els empats **reparteixen els punts de les posicions que ocupen**: amb la
 * taula [3, 2, 1, 0], dos segons es queden (2 + 1) / 2 = 1,5 cadascun i el
 * següent cau a la quarta posició. Així el total repartit per partida no
 * depèn dels empats.
 *
 * Per això els punts no són sempre enters — cal formatar-los sense decimals
 * només quan no en calguin.
 */
export function distributePoints(ranks: number[], scoring: ScoringConfig): number[] {
  return ranks.map((rank) => {
    const tied = ranks.filter((r) => r === rank).length;
    let total = 0;
    for (let offset = 0; offset < tied; offset++) {
      total += pointsForPosition(scoring, rank + offset);
    }
    return total / tied;
  });
}

/**
 * `outcome` derivat de la posició.
 *
 * A l'1v1 coincideix amb el de tota la vida: posició 1 en solitari és
 * victòria i posició 1 compartida és empat. Amb més participants és una
 * etiqueta gruixuda —guanya qui és primer, la resta perd— i el detall real
 * el dona `rank`.
 */
export function deriveOutcome(rank: number | null, allRanks: (number | null)[]): Outcome | null {
  if (rank === null) return null;
  if (allRanks.length === 1) return 'bye';

  const best = Math.min(...allRanks.filter((r): r is number => r !== null));
  if (rank > best) return 'loss';
  return allRanks.filter((r) => r === rank).length > 1 ? 'draw' : 'win';
}

/** Resultat complet d'una partida, derivat de les puntuacions. */
export interface ScoredParticipant {
  entryId: string;
  score: number | null;
  rank: number | null;
  outcome: Outcome | null;
  points: number | null;
}

/**
 * Calcula posicions, resultats i punts d'una partida sencera. Les rutes que
 * desen un resultat han de passar per aquí.
 */
export function scoreMatch(
  participants: Array<{ entryId: string; score: number | null; rank?: number | null }>,
  scoring: ScoringConfig,
  opts: { isBye?: boolean } = {}
): ScoredParticipant[] {
  if (opts.isBye || participants.length === 1) {
    return participants.map((p) => ({
      entryId: p.entryId,
      score: p.score ?? null,
      rank: 1,
      outcome: 'bye' as const,
      points: scoring.byePoints,
    }));
  }

  // Les posicions poden venir donades (jocs sense puntuació numèrica) o
  // derivar-se de les puntuacions.
  const explicit = participants.map((p) => p.rank ?? null);
  const ranks = explicit.every((r) => r !== null)
    ? (explicit as number[])
    : (ranksFromScores(participants.map((p) => p.score)) as (number | null)[]);

  if (ranks.some((r) => r === null)) {
    return participants.map((p) => ({
      entryId: p.entryId,
      score: p.score ?? null,
      rank: null,
      outcome: null,
      points: null,
    }));
  }

  const finalRanks = ranks as number[];
  const points = distributePoints(finalRanks, scoring);

  return participants.map((p, i) => ({
    entryId: p.entryId,
    score: p.score ?? null,
    rank: finalRanks[i],
    outcome: deriveOutcome(finalRanks[i], finalRanks),
    points: points[i],
  }));
}
