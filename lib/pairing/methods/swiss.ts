import type {
  Entrant,
  GeneratedMatch,
  PairingContext,
  PairingEngineResult,
  PairingWarning,
  SeedingCriterion,
  Standing,
  SwissConfig,
} from '../types';
import { DEFAULT_SEEDING_CRITERIA } from '../types';
import { buildRematchSet, hasPlayed } from '../utils/rematch';
import { assignBye } from '../utils/bye';
import { partitionByTags } from './tag-partition';

/**
 * Sistema suís (holandès), adaptat.
 *
 * - Agrupa per punts i aparella la meitat superior de cada grup amb la inferior
 * - Evita revanxes i gestiona flotadors entre grups
 * - Relaxa restriccions si no hi ha solució
 *
 * Només 1 contra 1: amb taules de més de dos, la proximitat de punts que
 * sustenta el sistema deixa de tenir sentit (docs/pla-rols.md §13.1 #8). El
 * motor no ofereix aquest mètode en fases així.
 */
export function generateSwissPairings(ctx: PairingContext): PairingEngineResult {
  const config = ctx.phase.config as SwissConfig;
  const active = ctx.entrants.filter((e) => e.isActive);

  // Igual que Swiss FIDE/Rei del turó: cada etiqueta triada calcula el seu
  // propi aparellament, independent de les altres bosses (docs/pla-rols.md
  // §13.1 #8, Fase 2). El numerat de taules es fa un sol cop al final,
  // sobre el conjunt sencer, perquè la taula 1 continuï sent la dels
  // capdavanters globals.
  if (config.scope === 'intra_tag') {
    const { partitions, warnings: tagWarnings } = partitionByTags(active, config.tagIds ?? []);
    const entrantById = new Map(active.map((e) => [e.id, e]));
    const matches: GeneratedMatch[] = [];
    const warnings: PairingWarning[] = [...tagWarnings];
    const seedingOrder: string[] = [];

    for (const entryIds of partitions.values()) {
      const pool = entryIds.map((id) => entrantById.get(id)!);
      const poolIdSet = new Set(entryIds);
      const poolCtx: PairingContext = {
        ...ctx,
        entrants: pool,
        standings: ctx.standings.filter((s) => poolIdSet.has(s.entryId)),
        previousMatches: ctx.previousMatches.filter((m) => m.entryIds.every((id) => poolIdSet.has(id))),
      };
      const result = pairSwissPool(poolCtx);
      matches.push(...result.matches);
      warnings.push(...result.warnings);
      if (result.seedingOrder) seedingOrder.push(...result.seedingOrder);
    }

    assignTableNumbers(
      matches,
      new Map(ctx.standings.map((s) => [s.entryId, s])),
      new Map(ctx.entrants.map((e) => [e.id, e.rating ?? null]))
    );
    return { matches, warnings, seedingOrder };
  }

  return pairSwissPool(ctx);
}

function pairSwissPool(ctx: PairingContext): PairingEngineResult {
  const config = ctx.phase.config as SwissConfig;
  const warnings: PairingWarning[] = [];

  const active = ctx.entrants.filter((e) => e.isActive);

  const standingMap = new Map(ctx.standings.map((s) => [s.entryId, s]));
  const isFirstRound = ctx.roundNumber === ctx.phase.startRound;
  const ratingMap = new Map(ctx.entrants.map((e) => [e.id, e.rating ?? null]));
  const nameMap = new Map(ctx.entrants.map((e) => [e.id, e.displayName]));

  const seedingCriteria = config.seedingCriteria?.length
    ? config.seedingCriteria
    : [...DEFAULT_SEEDING_CRITERIA];

  // Cal ordenar abans d'assignar el bye, perquè a la primera ronda el rep el
  // darrer del sembrat.
  const allSorted = sortBySeeding(active, standingMap, ratingMap, nameMap, seedingCriteria);
  const rematchSet = buildRematchSet(ctx.previousMatches);

  const byes: GeneratedMatch[] = [];
  let sorted: Array<{ id: string }>;

  if (allSorted.length % 2 !== 0) {
    if (isFirstRound) {
      const byeEntrant = allSorted[allSorted.length - 1];
      sorted = allSorted.slice(0, -1);
      byes.push({ tableNumber: -1, entryIds: [byeEntrant.id] });
    } else {
      const { byeEntryId, remaining } = assignBye(
        active,
        ctx.standings,
        ctx.previousMatches,
        config.byeHandling
      );
      sorted = sortBySeeding(remaining, standingMap, ratingMap, nameMap, seedingCriteria);
      byes.push({ tableNumber: -1, entryIds: [byeEntryId] });
    }
  } else {
    sorted = allSorted;
  }

  // Primer amb la restricció de revanxes; si no hi ha solució, es relaxa.
  let result = tryPair(sorted, standingMap, rematchSet, false);

  if (result === null) {
    warnings.push({
      type: 'rematch_forced',
      message: "No s'ha pogut evitar una revanxa. S'ha permès excepcionalment.",
      affectedEntryIds: [],
    });
    result = tryPair(sorted, standingMap, rematchSet, true);
  }

  if (result === null) {
    result = fallbackPair(sorted);
    warnings.push({
      type: 'rematch_forced',
      message: 'Aparellament de fallback sense restriccions. Reviseu-lo manualment.',
      affectedEntryIds: sorted.map((e) => e.id),
    });
  }

  const matches: GeneratedMatch[] = [...result, ...byes];
  assignTableNumbers(matches, standingMap, ratingMap);

  return { matches, warnings, seedingOrder: sorted.map((e) => e.id) };
}

// ─── Sembrat ──────────────────────────────────────────────────────────────────

function sortBySeeding(
  entrants: Array<{ id: string }>,
  standingMap: Map<string, Standing>,
  ratingMap: Map<string, number | null>,
  nameMap: Map<string, string>,
  criteria: SeedingCriterion[]
): Array<{ id: string }> {
  return [...entrants].sort((a, b) => {
    for (const criterion of criteria) {
      let cmp = 0;
      if (criterion === 'points') {
        cmp = (standingMap.get(b.id)?.points ?? 0) - (standingMap.get(a.id)?.points ?? 0);
      } else if (criterion === 'elo') {
        const ra = ratingMap.get(a.id) ?? null;
        const rb = ratingMap.get(b.id) ?? null;
        if (ra === null && rb === null) cmp = 0;
        else if (ra === null) cmp = 1;
        else if (rb === null) cmp = -1;
        else cmp = rb - ra;
      } else if (criterion === 'rank') {
        cmp = (standingMap.get(a.id)?.rank ?? 9999) - (standingMap.get(b.id)?.rank ?? 9999);
      } else if (criterion === 'name') {
        cmp = (nameMap.get(a.id) ?? '').localeCompare(nameMap.get(b.id) ?? '');
      }
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}

// ─── Aparellament ─────────────────────────────────────────────────────────────

interface Seed {
  id: string;
}

/** Retorna null si no hi ha solució amb les restriccions donades. */
function tryPair(
  sorted: Seed[],
  standingMap: Map<string, Standing>,
  rematchSet: Set<string>,
  allowRematches: boolean
): GeneratedMatch[] | null {
  const scoreGroups = buildScoreGroups(sorted, standingMap);

  const paired = new Set<string>();
  const result: GeneratedMatch[] = [];
  const floaters: Seed[] = [];

  for (const scoreGroup of scoreGroups) {
    const group = [...floaters, ...scoreGroup];
    floaters.length = 0;

    const available = group.filter((e) => !paired.has(e.id));
    if (available.length === 0) continue;

    // Sistema holandès: meitat superior contra meitat inferior.
    const mid = Math.floor(available.length / 2);
    const groupPairings = pairHalves(available.slice(0, mid), available.slice(mid), rematchSet, allowRematches);

    if (groupPairings === null) {
      floaters.push(...available);
      continue;
    }

    for (const { first, second } of groupPairings.paired) {
      paired.add(first.id);
      paired.add(second.id);
      result.push({ tableNumber: 0, entryIds: [first.id, second.id] });
    }

    if (groupPairings.leftover) floaters.push(groupPairings.leftover);
  }

  return floaters.length > 0 ? null : result;
}

function pairHalves(
  s1: Seed[],
  s2: Seed[],
  rematchSet: Set<string>,
  allowRematches: boolean
): { paired: Array<{ first: Seed; second: Seed }>; leftover: Seed | null } | null {
  if (s1.length === 0) {
    if (s2.length === 1) return { paired: [], leftover: s2[0] };
    if (s2.length === 0) return { paired: [], leftover: null };
  }

  for (const perm of generatePermutations(s2)) {
    const n = Math.min(s1.length, perm.length);

    if (!allowRematches) {
      let valid = true;
      for (let i = 0; i < n; i++) {
        if (hasPlayed(s1[i].id, perm[i].id, rematchSet)) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;
    }

    const paired: Array<{ first: Seed; second: Seed }> = [];
    for (let i = 0; i < n; i++) paired.push({ first: s1[i], second: perm[i] });

    let leftover: Seed | null = null;
    if (perm.length > s1.length) leftover = perm[perm.length - 1];
    else if (s1.length > perm.length) leftover = s1[s1.length - 1];

    return { paired, leftover };
  }

  return null;
}

/** Permutacions completes per a grups petits; només rotacions si són grans. */
function generatePermutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  if (arr.length > 8) return rotations(arr);

  const result: T[][] = [];
  function permute(current: T[], remaining: T[]) {
    if (remaining.length === 0) {
      result.push(current);
      return;
    }
    for (let i = 0; i < remaining.length; i++) {
      permute([...current, remaining[i]], [...remaining.slice(0, i), ...remaining.slice(i + 1)]);
    }
  }
  permute([], arr);
  return result;
}

function rotations<T>(arr: T[]): T[][] {
  return arr.map((_, i) => [...arr.slice(i), ...arr.slice(0, i)]);
}

function buildScoreGroups(sorted: Seed[], standingMap: Map<string, Standing>): Seed[][] {
  const groups: Seed[][] = [];
  let current: Seed[] = [];
  let currentPoints = -1;

  for (const seed of sorted) {
    const points = standingMap.get(seed.id)?.points ?? 0;
    if (current.length === 0 || points === currentPoints) {
      current.push(seed);
      currentPoints = points;
    } else {
      groups.push(current);
      current = [seed];
      currentPoints = points;
    }
  }
  if (current.length > 0) groups.push(current);

  return groups;
}

function fallbackPair(entrants: Seed[]): GeneratedMatch[] {
  const result: GeneratedMatch[] = [];
  for (let i = 0; i < entrants.length - 1; i += 2) {
    result.push({ tableNumber: 0, entryIds: [entrants[i].id, entrants[i + 1].id] });
  }
  return result;
}

// ─── Numeració de taules ──────────────────────────────────────────────────────

/** Taula 1 per als capdavanters; el bye, a la darrera. */
function assignTableNumbers(
  matches: GeneratedMatch[],
  standingMap: Map<string, Standing>,
  ratingMap: Map<string, number | null>
): void {
  const played = matches
    .filter((m) => m.entryIds.length > 1)
    .sort((a, b) => {
      const [pointsA, eloA] = bestStats(a.entryIds, standingMap, ratingMap);
      const [pointsB, eloB] = bestStats(b.entryIds, standingMap, ratingMap);
      if (pointsA !== pointsB) return pointsB - pointsA;
      if (eloA === eloB) return 0;
      if (eloA === null) return 1;
      if (eloB === null) return -1;
      return eloB - eloA;
    });

  played.forEach((match, i) => {
    match.tableNumber = i + 1;
  });

  const lastTable = played.length + 1;
  for (const match of matches) {
    if (match.entryIds.length === 1) match.tableNumber = lastTable;
  }
}

/** Punts i ELO del millor participant de la taula. */
function bestStats(
  entryIds: string[],
  standingMap: Map<string, Standing>,
  ratingMap: Map<string, number | null>
): [number, number | null] {
  const points = Math.max(...entryIds.map((id) => standingMap.get(id)?.points ?? 0));
  const elos = entryIds
    .filter((id) => (standingMap.get(id)?.points ?? 0) === points)
    .map((id) => ratingMap.get(id) ?? null)
    .filter((elo): elo is number => elo !== null);

  return [points, elos.length > 0 ? Math.max(...elos) : null];
}
