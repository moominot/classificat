import { pair } from '@echecs/swiss/dutch';
import type { Game } from '@echecs/swiss/dutch';
import type {
  Entrant,
  GeneratedMatch,
  Outcome,
  PairingContext,
  PairingEngineResult,
  PairingWarning,
  PreviousMatch,
  SwissFideConfig,
} from '../types';
import { partitionByTags } from './tag-partition';
import { buildEntryExclusionSets } from './exclusion-partition';
import { hasPlayed } from '../utils/rematch';
import type { EntryPairExclusion } from '@/db/types';

/**
 * Sistema suís holandès FIDE, delegat a `@echecs/swiss`.
 *
 * Fa un aparellament òptim global (blossom d'Edmonds) en lloc de decisions
 * locals, cosa que evita revanxes forçades en rondes posteriors.
 *
 * Només 1 contra 1, com el suís propi.
 */
export function generateSwissFidePairings(ctx: PairingContext): PairingEngineResult {
  const config = ctx.phase.config as SwissFideConfig;

  // La llibreria pren l'ordre d'entrada com a número de sembrat: primer per
  // valoració descendent, després per nom.
  const active = ctx.entrants
    .filter((e) => e.isActive)
    .sort((a, b) => {
      const ratingA = a.rating ?? -1;
      const ratingB = b.rating ?? -1;
      if (ratingB !== ratingA) return ratingB - ratingA;
      return a.displayName.localeCompare(b.displayName);
    });

  return config.scope === 'intra_tag'
    ? pairByTags(active, ctx, config)
    : pairAll(active, ctx, config);
}

function pairAll(
  active: Entrant[],
  ctx: PairingContext,
  config: SwissFideConfig
): PairingEngineResult {
  const warnings: PairingWarning[] = [];
  if (active.length <= 1) {
    if (active.length === 1) {
      warnings.push({
        type: 'no_pairings_possible',
        message: 'Un sol jugador actiu: no hi ha cap aparellament possible.',
        affectedEntryIds: [active[0].id],
      });
      return { matches: [{ tableNumber: -1, entryIds: [active[0].id] }], warnings };
    }
    return { matches: [], warnings };
  }

  const standingMap = new Map(ctx.standings.map((s) => [s.entryId, s]));
  const result = pair(
    active.map((e) => ({ id: e.id, rating: e.rating ?? undefined })),
    buildGameHistory(ctx.previousMatches),
    { expectedRounds: config.expectedRounds }
  );

  const { pairings, byes } = resolveExclusions(
    result.pairings.map((p) => [p.white, p.black] as [string, string]),
    result.byes.map((b) => b.player),
    config.entryExclusions,
    warnings
  );

  const matches = sortAndNumber(pairings, standingMap);
  const byeMatches: GeneratedMatch[] = byes.map((id) => ({ tableNumber: -1, entryIds: [id] }));

  return { matches: [...matches, ...byeMatches], warnings };
}

function pairByTags(
  active: Entrant[],
  ctx: PairingContext,
  config: SwissFideConfig
): PairingEngineResult {
  const standingMap = new Map(ctx.standings.map((s) => [s.entryId, s]));
  const entrantById = new Map(active.map((e) => [e.id, e]));

  const { partitions, warnings } = partitionByTags(active, config.tagIds ?? []);

  const allPairings: Array<[string, string]> = [];
  const allByes: string[] = [];

  for (const entryIds of partitions.values()) {
    if (entryIds.length <= 1) {
      if (entryIds.length === 1) {
        warnings.push({
          type: 'no_pairings_possible',
          message: 'Una etiqueta té un sol jugador actiu: no hi ha cap aparellament possible.',
          affectedEntryIds: entryIds,
        });
        allByes.push(entryIds[0]);
      }
      continue;
    }

    const tagEntrants = entryIds.map((id) => entrantById.get(id)!);
    const tagIdSet = new Set(entryIds);
    const tagHistory = ctx.previousMatches.filter((m) => m.entryIds.every((id) => tagIdSet.has(id)));

    const result = pair(
      tagEntrants.map((e) => ({ id: e.id, rating: e.rating ?? undefined })),
      buildGameHistory(tagHistory),
      { expectedRounds: config.expectedRounds }
    );

    const { pairings, byes } = resolveExclusions(
      result.pairings.map((p) => [p.white, p.black] as [string, string]),
      result.byes.map((b) => b.player),
      config.entryExclusions,
      warnings
    );

    allPairings.push(...pairings);
    allByes.push(...byes);
  }

  const byeMatches: GeneratedMatch[] = allByes.map((id) => ({ tableNumber: -1, entryIds: [id] }));
  return { matches: [...sortAndNumber(allPairings, standingMap), ...byeMatches], warnings };
}

/**
 * Post-procés per a les exclusions de parella: la llibreria externa no
 * exposa cap paràmetre d'exclusió (només l'historial de partides), i
 * injectar-hi una partida fictícia contaminaria la puntuació real amb
 * punts fantasma. Per això es corregeix el resultat ja calculat: s'intenta
 * un intercanvi local amb una altra parella; si no n'hi ha cap de legal,
 * "evitar" es deixa estar (avisa però mai deixa ningú sense jugar) i
 * "prohibir" converteix els dos jugadors en bye (mai es permet l'aparellament).
 */
function resolveExclusions(
  pairings: Array<[string, string]>,
  byes: string[],
  entryExclusions: EntryPairExclusion[] | undefined,
  warnings: PairingWarning[]
): { pairings: Array<[string, string]>; byes: string[] } {
  const { avoidSet, forbidSet } = buildEntryExclusionSets(entryExclusions);
  if (avoidSet.size === 0 && forbidSet.size === 0) return { pairings, byes };

  let result = [...pairings];
  let outByes = [...byes];

  const fix = (set: Set<string>, mustResolve: boolean, warnType: 'pair_excluded' | 'forbidden_bye') => {
    for (let i = 0; i < result.length; i++) {
      const [a, b] = result[i];
      if (!hasPlayed(a, b, set)) continue;

      const swap = findLegalSwap(result, i, set);
      if (swap !== null) {
        result[swap.j] = swap.pairJ;
        result[i] = swap.pairI;
        warnings.push({
          type: warnType,
          message:
            warnType === 'forbidden_bye'
              ? 'Una exclusió "prohibir" s\'ha evitat intercanviant un aparellament.'
              : 'Una exclusió "evitar" s\'ha evitat intercanviant un aparellament.',
          affectedEntryIds: [a, b],
        });
        continue;
      }

      if (mustResolve) {
        result.splice(i, 1);
        i--;
        outByes.push(a, b);
        warnings.push({
          type: 'forbidden_bye',
          message: 'Sense cap intercanvi legal per respectar una exclusió "prohibir": ambdós passen a bye.',
          affectedEntryIds: [a, b],
        });
      } else {
        warnings.push({
          type: 'pair_excluded',
          message: 'No s\'ha pogut evitar una parella marcada com a "evitar". S\'ha permès excepcionalment.',
          affectedEntryIds: [a, b],
        });
      }
    }
  };

  fix(forbidSet, true, 'forbidden_bye');
  fix(avoidSet, false, 'pair_excluded');

  return { pairings: result, byes: outByes };
}

/** Cerca una altra parella amb qui intercanviar per desfer una col·lisió amb `set`. */
function findLegalSwap(
  pairings: Array<[string, string]>,
  i: number,
  set: Set<string>
): { j: number; pairI: [string, string]; pairJ: [string, string] } | null {
  const [a, b] = pairings[i];
  for (let j = 0; j < pairings.length; j++) {
    if (j === i) continue;
    const [c, d] = pairings[j];

    // Intercanvia b amb c: (a,c) i (b,d).
    if (!hasPlayed(a, c, set) && !hasPlayed(b, d, set)) {
      return { j, pairI: [a, c], pairJ: [b, d] };
    }
    // Intercanvia b amb d: (a,d) i (c,b).
    if (!hasPlayed(a, d, set) && !hasPlayed(c, b, set)) {
      return { j, pairI: [a, d], pairJ: [c, b] };
    }
  }
  return null;
}

function sortAndNumber(
  pairs: Array<[string, string]>,
  standingMap: Map<string, { points: number }>
): GeneratedMatch[] {
  return pairs
    .sort((a, b) => {
      const bestA = Math.max(...a.map((id) => standingMap.get(id)?.points ?? 0));
      const bestB = Math.max(...b.map((id) => standingMap.get(id)?.points ?? 0));
      return bestB - bestA;
    })
    .map((entryIds, i) => ({ tableNumber: i + 1, entryIds }));
}

/**
 * Historial en el format de la llibreria. Com que el suís FIDE és 1v1, només
 * es tenen en compte les partides de dos participants i els byes.
 */
function buildGameHistory(previousMatches: PreviousMatch[]): Game[][] {
  const byRound = new Map<number, Game[]>();

  for (const match of previousMatches) {
    const games = byRound.get(match.roundNumber) ?? [];

    if (match.entryIds.length === 1) {
      // Bye: la llibreria l'espera com una partida contra un mateix.
      games.push({ white: match.entryIds[0], black: match.entryIds[0], result: 1, kind: 'pairing-bye' });
    } else if (match.entryIds.length === 2) {
      const result = resultFromRanks(match.ranks);
      if (result !== null) {
        games.push({ white: match.entryIds[0], black: match.entryIds[1], result });
      }
    }

    byRound.set(match.roundNumber, games);
  }

  if (byRound.size === 0) return [];

  const maxRound = Math.max(...byRound.keys());
  const rounds: Game[][] = [];
  for (let r = 1; r <= maxRound; r++) rounds.push(byRound.get(r) ?? []);
  return rounds;
}

/** Resultat del primer participant a partir de les posicions. */
function resultFromRanks(ranks: (number | null)[]): 0 | 0.5 | 1 | null {
  const [first, second] = ranks;
  if (first === null || second === null || first === undefined || second === undefined) return null;
  if (first === second) return 0.5;
  return first < second ? 1 : 0;
}

/** Per si algun dia cal traduir un `outcome` desat en lloc de les posicions. */
export function resultFromOutcome(outcome: Outcome | null): 0 | 0.5 | 1 | null {
  switch (outcome) {
    case 'win':
    case 'bye':
      return 1;
    case 'loss':
      return 0;
    case 'draw':
      return 0.5;
    default:
      return null;
  }
}
