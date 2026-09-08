import type { Match, TiebreakerContext } from '../types';

/** Les partides amb resultat on hi participa aquesta inscripció. */
export function matchesOf(entryId: string, matches: Match[]): Match[] {
  return matches.filter(
    (m) =>
      m.participants.some((p) => p.entryId === entryId) &&
      m.participants.every((p) => p.rank !== null)
  );
}

/**
 * Els oponents d'una partida: tots els altres participants.
 *
 * Amb taules de més de dos n'hi ha diversos, i és precisament per això que
 * els desempats basats en oponents queden desactivats en aquestes fases
 * (docs/pla-rols.md §12.10) — aquesta funció existeix per als casos on sí
 * que són aplicables, i per a mètriques com l'spread.
 */
export function opponentsIn(match: Match, entryId: string) {
  return match.participants.filter((p) => p.entryId !== entryId);
}

/** Punts acumulats d'una inscripció, 0 si no en tenim. */
export function pointsOf(ctx: TiebreakerContext, entryId: string): number {
  return ctx.points.get(entryId) ?? 0;
}

/** Suma dels punts dels oponents de totes les partides jugades. */
export function opponentPoints(ctx: TiebreakerContext, entryId: string): number[] {
  return matchesOf(entryId, ctx.matches).flatMap((match) =>
    opponentsIn(match, entryId).map((opponent) => pointsOf(ctx, opponent.entryId))
  );
}

export function emptyValues(entryIds: string[]): Map<string, number> {
  return new Map(entryIds.map((id) => [id, 0]));
}
