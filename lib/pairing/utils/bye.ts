import type { Player, Standing, ByeHandling, PreviousPairing } from '../types';
import { countByes } from './rematch';

/**
 * Selecciona el jugador que rep el bye, el retira de la llista de jugadors actius
 * i retorna tant el jugador com la llista restant.
 */
export function assignBye(
  players: Player[],
  standings: Standing[],
  previousPairings: PreviousPairing[],
  handling: ByeHandling
): { byePlayerId: string; remaining: Player[] } {
  // Ordenem els jugadors per la seva posició a la classificació (pitjor primer)
  const standingMap = new Map(standings.map((s) => [s.playerId, s]));
  const sorted = [...players].sort((a, b) => {
    const ra = standingMap.get(a.id)?.rank ?? 9999;
    const rb = standingMap.get(b.id)?.rank ?? 9999;
    return rb - ra; // pitjor classificat primer
  });

  let byePlayerId: string;

  if (handling === 'lowest_ranked') {
    byePlayerId = sorted[0].id;
  } else if (handling === 'least_byes') {
    // Entre els jugadors del darrer grup de punts, el que menys byes ha rebut
    const lowestPoints = standingMap.get(sorted[0].id)?.points ?? 0;
    const lastGroup = sorted.filter(
      (p) => (standingMap.get(p.id)?.points ?? 0) === lowestPoints
    );
    lastGroup.sort(
      (a, b) =>
        countByes(a.id, previousPairings) - countByes(b.id, previousPairings)
    );
    byePlayerId = lastGroup[0].id;
  } else {
    // random_last_group
    const lowestPoints = standingMap.get(sorted[0].id)?.points ?? 0;
    const lastGroup = sorted.filter(
      (p) => (standingMap.get(p.id)?.points ?? 0) === lowestPoints
    );
    byePlayerId = lastGroup[Math.floor(Math.random() * lastGroup.length)].id;
  }

  const remaining = players.filter((p) => p.id !== byePlayerId);
  return { byePlayerId, remaining };
}
