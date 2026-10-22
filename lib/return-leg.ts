import type { PhaseConfig } from '@/db/types';

/**
 * Anada i tornada (Round Robin amb `doubleRound`, si és amb sorteig o amb
 * `consecutiveLegs`): la tornada és la ronda següent, l'anada amb els seients
 * girats, així que les dues rondes es creen i es generen alhora
 * (docs/eliminatoria-per-posicions.md §4). Només 1 contra 1.
 */

type PhaseLike = { config: PhaseConfig; startRound: number; endRound: number; participantsPerMatch?: number };

export function isReturnLegPhase(phase: Omit<PhaseLike, 'startRound' | 'endRound'>): boolean {
  const config = phase.config;
  return (
    config.method === 'round_robin' &&
    !!config.doubleRound &&
    (!!config.randomDraw || !!config.consecutiveLegs) &&
    (phase.participantsPerMatch ?? 2) === 2
  );
}

/**
 * El número de la tornada si `roundNumber` és una anada d'aquesta fase (les
 * rondes senars de la fase); si no, null.
 */
export function returnLegNumber(phase: PhaseLike, roundNumber: number): number | null {
  if (!isReturnLegPhase(phase)) return null;
  const relative = roundNumber - phase.startRound + 1;
  if (relative < 1 || relative % 2 === 0 || roundNumber + 1 > phase.endRound) return null;
  return roundNumber + 1;
}
