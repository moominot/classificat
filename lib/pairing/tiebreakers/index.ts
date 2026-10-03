import type { Standing, StandingsScopeKey, TiebreakerContext, TiebreakerDef } from '../types';
import { isTiebreakerApplicable } from '../types';
import { berger, buchholz, directEncounter, medianBuchholz } from './opponent-based';
import { avgScore, metricTiebreaker, spread, totalScore, wins } from './metric-based';

/**
 * Registre de desempats (docs/pla-rols.md §11.3).
 *
 * Substitueix la unió tancada de vuit cadenes que hi havia abans, on afegir un
 * desempat obligava a tocar el tipus, l'estructura de valors, el càlcul i el
 * comparador. Ara és un mòdul més al registre.
 */
const REGISTRY: TiebreakerDef[] = [
  wins,
  spread,
  totalScore,
  avgScore,
  buchholz,
  medianBuchholz,
  berger,
  directEncounter,
];

const BY_KEY = new Map(REGISTRY.map((def) => [def.key, def]));

/** Prefix de les claus que apunten a una mètrica derivada d'una pregunta. */
export const METRIC_PREFIX = 'metric:';

/**
 * Resol una clau de desempat. Les que comencen per `metric:` es construeixen
 * al vol a partir de les preguntes amb agregació, de manera que "bingos" o
 * "millor jugada" es configuren sense tocar codi.
 */
export function resolveTiebreaker(key: string, label?: string): TiebreakerDef | null {
  if (key.startsWith(METRIC_PREFIX)) {
    const metric = key.slice(METRIC_PREFIX.length);
    if (!metric) return null;
    return metricTiebreaker(key, label ?? metric, { metric });
  }
  return BY_KEY.get(key) ?? null;
}

/**
 * Els desempats que es poden oferir en una fase.
 *
 * Els basats en oponents (Buchholz, mediana, Berger, encontre directe) no
 * apareixen quan la fase té taules de més de dos: la noció d'oponent deixa de
 * ser única (§12.10). Cal validar-ho també en desar, perquè canviar els
 * participants per partida d'una fase ja configurada no hi deixi un desempat
 * impossible.
 */
export function availableTiebreakers(opts: {
  participantsPerMatch: number;
  scope?: StandingsScopeKey;
}): TiebreakerDef[] {
  return REGISTRY.filter(
    (def) =>
      isTiebreakerApplicable(def, opts.participantsPerMatch) &&
      (!opts.scope || def.scopes.includes(opts.scope))
  );
}

export function isValidTiebreakerConfig(
  keys: string[],
  opts: { participantsPerMatch: number; scope?: StandingsScopeKey }
): boolean {
  const allowed = new Set(availableTiebreakers(opts).map((d) => d.key));
  return keys.every((key) => key.startsWith(METRIC_PREFIX) || allowed.has(key));
}

// ─── Ordenació ────────────────────────────────────────────────────────────────

const EPSILON = 1e-9;

/**
 * Ordena una classificació: primer els punts, després els desempats en l'ordre
 * configurat.
 *
 * Els desempats de grup (l'encontre directe) es resolen **dins de cada bloc
 * d'empatats**, que és l'únic lloc on tenen sentit; abans això era un forat
 * conegut (`injectDirectEncounter` retornava la llista sense tocar).
 */
export function sortStandings<T extends Pick<Standing, 'entryId' | 'points'>>(
  standings: T[],
  tiebreakerKeys: string[],
  ctx: TiebreakerContext
): T[] {
  const defs = tiebreakerKeys
    .map((key) => resolveTiebreaker(key))
    .filter((def): def is TiebreakerDef => def !== null);

  // Els valors escalars es calculen un sol cop per a tota la classificació.
  const scalarValues = new Map<string, Map<string, number>>();
  for (const def of defs) {
    if (def.compute) scalarValues.set(def.key, def.compute(ctx));
  }

  // Els punts són el primer criteri, sempre — abans de qualsevol desempat
  // configurat. Cal agrupar-hi primer: si es passés la llista sencera a
  // `resolveTies` amb profunditat 0 directament, el primer desempat la
  // reordenaria sencera i els punts deixarien de pintar res.
  const byPoints = [...standings].sort((a, b) => b.points - a.points);
  const pointBlocks = splitIntoTiedBlocks(byPoints, (s) => s.points);
  return pointBlocks.flatMap((block) => resolveTies(block, 0));

  function resolveTies(group: T[], depth: number): T[] {
    if (group.length <= 1 || depth >= defs.length) return group;

    const def = defs[depth];
    const values = def.compute
      ? scalarValues.get(def.key)!
      : def.resolveGroup!(group.map((s) => s.entryId), ctx);
    const sign = def.higherIsBetter ? -1 : 1;

    const sorted = [...group].sort((a, b) => {
      const diff = (values.get(a.entryId) ?? 0) - (values.get(b.entryId) ?? 0);
      return Math.abs(diff) < EPSILON ? 0 : diff * sign;
    });

    // Els que continuen empatats passen al desempat següent.
    const blocks = splitIntoTiedBlocks(sorted, (s) => values.get(s.entryId) ?? 0);
    return blocks.flatMap((block) => resolveTies(block, depth + 1));
  }
}

/** Parteix una llista ja ordenada en blocs d'elements empatats (mateix valor de `keyOf`). */
function splitIntoTiedBlocks<T>(items: T[], keyOf: (item: T) => number): T[][] {
  const blocks: T[][] = [];
  let block: T[] = [];
  for (const item of items) {
    const previous = block[block.length - 1];
    const tied = previous !== undefined && Math.abs(keyOf(previous) - keyOf(item)) < EPSILON;
    if (previous !== undefined && !tied) {
      blocks.push(block);
      block = [];
    }
    block.push(item);
  }
  if (block.length > 0) blocks.push(block);
  return blocks;
}

export { REGISTRY as TIEBREAKERS };
export { metricTiebreaker };
