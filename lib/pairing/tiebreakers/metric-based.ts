import type { StandingsScopeKey, TiebreakerDef } from '../types';

/**
 * Desempats que només ordenen per una mètrica ja calculada.
 *
 * És la idea del punt §12.1 del pla: si les mètriques es deriven dels
 * resultats i de les preguntes, un desempat no és més que "ordena per la
 * mètrica X". Per això afegir "desempat per bingos" no és programar res: la
 * pregunta declara la seva agregació i apareix aquí sola.
 */
export function metricTiebreaker(
  key: string,
  label: string,
  opts: { metric?: string; scopes?: StandingsScopeKey[]; higherIsBetter?: boolean } = {}
): TiebreakerDef {
  const metric = opts.metric ?? key;
  return {
    key,
    label,
    higherIsBetter: opts.higherIsBetter ?? true,
    scopes: opts.scopes ?? ['global', 'group', 'team'],
    opponentBased: false,
    compute(ctx) {
      const values = new Map<string, number>();
      for (const entryId of ctx.entryIds) {
        values.set(entryId, ctx.metrics.get(entryId)?.[metric] ?? 0);
      }
      return values;
    },
  };
}

export const wins = metricTiebreaker('wins', 'Victòries');

/**
 * Diferència de puntuació. Amb més de dos participants és la puntuació pròpia
 * menys **la mitjana dels altres** de la taula, de manera que a l'1v1 continua
 * sent exactament l'spread de tota la vida (§12.11).
 */
export const spread = metricTiebreaker('spread', 'Spread');

/** Suma de la puntuació pròpia (l'antic "cumulative"). */
export const totalScore = metricTiebreaker('total_score', 'Punts a favor');

/** Mitjana de puntuació per partida jugada, sense comptar els byes. */
export const avgScore = metricTiebreaker('avg_score', 'Mitjana per partida');
