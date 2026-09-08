import type { TiebreakerDef } from '../types';
import { emptyValues, matchesOf, opponentPoints, opponentsIn, pointsOf } from './utils';

/**
 * Desempats que miren com han anat els rivals.
 *
 * Tots tenen `opponentBased: true`, cosa que els deixa **fora de les fases amb
 * taules de més de dos** (docs/pla-rols.md §12.10): amb tres rivals per ronda,
 * "la força dels oponents" ja no vol dir el mateix i el número enganya més que
 * informa.
 */

/** Suma dels punts dels oponents. */
export const buchholz: TiebreakerDef = {
  key: 'buchholz',
  label: 'Buchholz',
  higherIsBetter: true,
  scopes: ['global', 'group'],
  opponentBased: true,
  compute(ctx) {
    const values = emptyValues(ctx.entryIds);
    for (const entryId of ctx.entryIds) {
      values.set(entryId, opponentPoints(ctx, entryId).reduce((sum, p) => sum + p, 0));
    }
    return values;
  },
};

/** Buchholz descartant el millor i el pitjor oponent. */
export const medianBuchholz: TiebreakerDef = {
  key: 'median_buchholz',
  label: 'Buchholz mediana',
  higherIsBetter: true,
  scopes: ['global', 'group'],
  opponentBased: true,
  compute(ctx) {
    const values = emptyValues(ctx.entryIds);
    for (const entryId of ctx.entryIds) {
      const points = opponentPoints(ctx, entryId).sort((a, b) => a - b);
      // Amb menys de tres oponents no hi ha res a descartar.
      const trimmed = points.length >= 3 ? points.slice(1, -1) : points;
      values.set(entryId, trimmed.reduce((sum, p) => sum + p, 0));
    }
    return values;
  },
};

/** Sonneborn-Berger: punts dels oponents batuts, la meitat dels empatats. */
export const berger: TiebreakerDef = {
  key: 'berger',
  label: 'Sonneborn-Berger',
  higherIsBetter: true,
  scopes: ['global', 'group'],
  opponentBased: true,
  compute(ctx) {
    const values = emptyValues(ctx.entryIds);
    for (const entryId of ctx.entryIds) {
      let total = 0;
      for (const match of matchesOf(entryId, ctx.matches)) {
        const own = match.participants.find((p) => p.entryId === entryId);
        if (!own) continue;
        const weight = own.outcome === 'win' || own.outcome === 'bye' ? 1 : own.outcome === 'draw' ? 0.5 : 0;
        if (weight === 0) continue;
        for (const opponent of opponentsIn(match, entryId)) {
          total += weight * pointsOf(ctx, opponent.entryId);
        }
      }
      values.set(entryId, total);
    }
    return values;
  },
};

/**
 * Encontre directe: no és un valor absolut, sinó una mini-lliga **entre els
 * empatats**. Per això es resol sobre el grup i no sobre tota la
 * classificació.
 */
export const directEncounter: TiebreakerDef = {
  key: 'direct_encounter',
  label: 'Encontre directe',
  higherIsBetter: true,
  scopes: ['global', 'group'],
  opponentBased: true,
  resolveGroup(entryIds, ctx) {
    const values = emptyValues(entryIds);
    const group = new Set(entryIds);

    for (const match of ctx.matches) {
      // Només compten les partides jugades íntegrament entre els empatats.
      if (match.participants.length < 2) continue;
      if (!match.participants.every((p) => group.has(p.entryId))) continue;
      if (!match.participants.every((p) => p.rank !== null)) continue;

      for (const participant of match.participants) {
        values.set(participant.entryId, (values.get(participant.entryId) ?? 0) + (participant.points ?? 0));
      }
    }
    return values;
  },
};
