import type { PreviousMatch } from '../types';

/**
 * Historial d'enfrontaments.
 *
 * Amb taules de més de dos, "ja s'han enfrontat" vol dir que han coincidit a
 * la mateixa taula: d'una partida de quatre en surten sis parelles.
 */

/** Clau canònica d'una parella, perquè (A,B) i (B,A) siguin la mateixa. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Unió de diversos sets de parelles (p. ex. revanxes + exclusions "evitar"). */
export function unionSets(...sets: Set<string>[]): Set<string> {
  const result = new Set<string>();
  for (const set of sets) for (const key of set) result.add(key);
  return result;
}

/** Totes les parelles que han coincidit en alguna partida. */
export function buildRematchSet(previousMatches: PreviousMatch[]): Set<string> {
  const set = new Set<string>();
  for (const match of previousMatches) {
    for (let i = 0; i < match.entryIds.length; i++) {
      for (let j = i + 1; j < match.entryIds.length; j++) {
        set.add(pairKey(match.entryIds[i], match.entryIds[j]));
      }
    }
  }
  return set;
}

export function hasPlayed(a: string, b: string, rematchSet: Set<string>): boolean {
  return rematchSet.has(pairKey(a, b));
}

/** Quantes vegades una inscripció ha quedat sola a la taula (bye). */
export function countByes(entryId: string, previousMatches: PreviousMatch[]): number {
  return previousMatches.filter((m) => m.entryIds.length === 1 && m.entryIds[0] === entryId).length;
}

/** Quants dels participants d'una taula ja s'havien trobat abans. */
export function countRematches(entryIds: string[], rematchSet: Set<string>): number {
  let count = 0;
  for (let i = 0; i < entryIds.length; i++) {
    for (let j = i + 1; j < entryIds.length; j++) {
      if (hasPlayed(entryIds[i], entryIds[j], rematchSet)) count++;
    }
  }
  return count;
}
