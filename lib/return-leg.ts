import type { PhaseConfig } from '@/db/types';

/**
 * Anada i tornada (Round Robin amb sorteig i `doubleRound`): la tornada és
 * l'anada amb els seients girats, així que les dues rondes es creen i es
 * generen alhora (docs/eliminatoria-per-posicions.md §4).
 */

export function isReturnLegPhase(phase: { config: PhaseConfig }): boolean {
  const config = phase.config;
  return config.method === 'round_robin' && !!config.randomDraw && !!config.doubleRound;
}

/** El número de la tornada si `roundNumber` és l'anada d'aquesta fase; si no, null. */
export function returnLegNumber(
  phase: { config: PhaseConfig; startRound: number; endRound: number },
  roundNumber: number
): number | null {
  if (!isReturnLegPhase(phase)) return null;
  if (roundNumber !== phase.startRound || phase.startRound + 1 > phase.endRound) return null;
  return roundNumber + 1;
}
