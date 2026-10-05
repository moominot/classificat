import type { ByeHandling, Entrant, PreviousMatch, Standing } from '../types';
import { countByes } from './rematch';

/**
 * Tria qui es queda sense partida i el retira de la llista.
 *
 * El bye és, en el model nou, una partida amb un sol participant (§12.2).
 */
export function assignBye(
  entrants: Entrant[],
  standings: Standing[],
  previousMatches: PreviousMatch[],
  handling: ByeHandling
): { byeEntryId: string; remaining: Entrant[] } {
  const standingMap = new Map(standings.map((s) => [s.entryId, s]));

  // Pitjor classificat primer
  const sorted = [...entrants].sort((a, b) => {
    const ra = standingMap.get(a.id)?.rank ?? 9999;
    const rb = standingMap.get(b.id)?.rank ?? 9999;
    return rb - ra;
  });

  let byeEntryId: string;

  if (handling === 'lowest_ranked') {
    byeEntryId = sorted[0].id;
  } else {
    // Entre els del darrer grup de punts: el que menys byes ha rebut, o a l'atzar
    const lowestPoints = standingMap.get(sorted[0].id)?.points ?? 0;
    const lastGroup = sorted.filter((e) => (standingMap.get(e.id)?.points ?? 0) === lowestPoints);

    if (handling === 'least_byes') {
      lastGroup.sort(
        (a, b) => countByes(a.id, previousMatches) - countByes(b.id, previousMatches)
      );
      byeEntryId = lastGroup[0].id;
    } else {
      byeEntryId = lastGroup[Math.floor(Math.random() * lastGroup.length)].id;
    }
  }

  return { byeEntryId, remaining: entrants.filter((e) => e.id !== byeEntryId) };
}
