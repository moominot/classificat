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
  const standingMap = new Map(ctx.standings.map((s) => [s.entryId, s]));
  const result = pair(
    active.map((e) => ({ id: e.id, rating: e.rating ?? undefined })),
    buildGameHistory(ctx.previousMatches),
    { expectedRounds: config.expectedRounds }
  );

  const matches = sortAndNumber(
    result.pairings.map((p) => [p.white, p.black]),
    standingMap
  );
  const byes: GeneratedMatch[] = result.byes.map((b) => ({ tableNumber: -1, entryIds: [b.player] }));

  return { matches: [...matches, ...byes], warnings: [] };
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
  const allByes: GeneratedMatch[] = [];

  for (const entryIds of partitions.values()) {
    const tagEntrants = entryIds.map((id) => entrantById.get(id)!);
    const tagIdSet = new Set(entryIds);
    const tagHistory = ctx.previousMatches.filter((m) => m.entryIds.every((id) => tagIdSet.has(id)));

    const result = pair(
      tagEntrants.map((e) => ({ id: e.id, rating: e.rating ?? undefined })),
      buildGameHistory(tagHistory),
      { expectedRounds: config.expectedRounds }
    );

    allPairings.push(...result.pairings.map((p) => [p.white, p.black] as [string, string]));
    allByes.push(...result.byes.map((b) => ({ tableNumber: -1, entryIds: [b.player] })));
  }

  return { matches: [...sortAndNumber(allPairings, standingMap), ...allByes], warnings };
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
