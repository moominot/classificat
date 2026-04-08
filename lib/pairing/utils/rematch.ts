import type { PreviousPairing } from '../types';

/**
 * Construeix la clau canònica d'un parell de jugadors (ordenada per ID).
 * Garanteix que (A,B) i (B,A) generin la mateixa clau.
 */
function pairKey(p1Id: string, p2Id: string): string {
  return p1Id < p2Id ? `${p1Id}:${p2Id}` : `${p2Id}:${p1Id}`;
}

/**
 * Construeix un Set amb totes les parelles que ja s'han enfrontat.
 */
export function buildRematchSet(previousPairings: PreviousPairing[]): Set<string> {
  const set = new Set<string>();
  for (const p of previousPairings) {
    set.add(pairKey(p.player1Id, p.player2Id));
  }
  return set;
}

/**
 * Comprova si dos jugadors ja s'han enfrontat.
 */
export function hasPlayed(
  p1Id: string,
  p2Id: string,
  rematchSet: Set<string>
): boolean {
  return rematchSet.has(pairKey(p1Id, p2Id));
}

/**
 * Compta quantes vegades un jugador ha rebut un bye.
 */
export function countByes(playerId: string, previousPairings: PreviousPairing[]): number {
  return previousPairings.filter(
    (p) => (p.player1Id === playerId || p.player2Id === playerId) && p.player2Id === null
  ).length;
}
