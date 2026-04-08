import type {
  PairingContext,
  PairingEngineResult,
  GeneratedPairing,
  KingOfTheHillConfig,
} from '../types';
import { buildRematchSet, hasPlayed } from '../utils/rematch';
import { buildComparator } from '../tiebreakers';

/**
 * Motor d'aparellaments "Rei del turó" (King of the Hill).
 *
 * Ordena els jugadors per classificació actual i els aparella:
 *   1r vs 2n, 3r vs 4t, 5è vs 6è, etc.
 *
 * Si hi ha un nombre imparell de jugadors:
 * - El darrer rep un bye.
 *
 * Si un aparellament seria una revanxa, s'intenta canviar l'adversari
 * amb el que té el rang adjacent (p.ex. 1r vs 3r, 2n vs 4t).
 */
export function generateKingOfTheHillPairings(ctx: PairingContext): PairingEngineResult {
  const config = ctx.phase.config as KingOfTheHillConfig;
  const warnings = [];

  const rematchSet = buildRematchSet(ctx.previousPairings);
  const comparator = buildComparator(ctx.phase.tiebreakers);

  // Ordena per classificació
  let sorted = [...ctx.standings]
    .sort(comparator)
    .map((s) => s.playerId);

  // Restricció als N millors si s'ha configurat
  if (config.topN != null && config.topN > 0) {
    sorted = sorted.slice(0, config.topN);
  }

  // Aparellament greedy respectant l'ordre de rang
  const pairings: GeneratedPairing[] = [];
  const paired = new Set<string>();
  let tableNumber = 1;

  for (let i = 0; i < sorted.length; i++) {
    if (paired.has(sorted[i])) continue;

    const p1 = sorted[i];
    let found = false;

    // Primer intenta l'adversari natural (i+1), llavors els adjacents
    for (let j = i + 1; j < sorted.length; j++) {
      if (paired.has(sorted[j])) continue;
      const p2 = sorted[j];

      if (!hasPlayed(p1, p2, rematchSet)) {
        pairings.push({ tableNumber: tableNumber++, player1Id: p1, player2Id: p2 });
        paired.add(p1);
        paired.add(p2);
        found = true;
        break;
      }
    }

    if (!found) {
      // Revanxa inevitable: aparella amb el natural i avisa
      for (let j = i + 1; j < sorted.length; j++) {
        if (paired.has(sorted[j])) continue;
        const p2 = sorted[j];
        pairings.push({ tableNumber: tableNumber++, player1Id: p1, player2Id: p2 });
        paired.add(p1);
        paired.add(p2);
        warnings.push({
          type: 'rematch_forced' as const,
          message: `Revanxa inevitable entre els jugadors ${p1} i ${p2}.`,
          affectedPlayerIds: [p1, p2],
        });
        found = true;
        break;
      }
    }

    if (!found) {
      // Jugador sense parella → bye
      pairings.push({ tableNumber: 0, player1Id: p1, player2Id: null });
      paired.add(p1);
    }
  }

  return { pairings, warnings };
}
