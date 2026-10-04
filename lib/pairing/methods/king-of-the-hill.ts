import type {
  GeneratedMatch,
  KingOfTheHillConfig,
  PairingContext,
  PairingEngineResult,
  PairingWarning,
  PreviousMatch,
  Standing,
} from '../types';
import { buildRematchSet, hasPlayed } from '../utils/rematch';
import { partitionByTags } from './tag-partition';
import { buildEntryExclusionSets } from './exclusion-partition';
import type { EntryPairExclusion } from '@/db/types';

/**
 * Rei del turó: 1r contra 2n, 3r contra 4t, etc.
 *
 * Si un aparellament fos revanxa, es busca el següent disponible que no ho
 * sigui. L'últim sense parella rep bye.
 *
 * Només 1 contra 1: amb taules de més de dos, "el següent de la llista" deixa
 * de definir un enfrontament.
 */
export function generateKingOfTheHillPairings(ctx: PairingContext): PairingEngineResult {
  const config = ctx.phase.config as KingOfTheHillConfig;

  // Cada etiqueta triada fa el seu propi "rei del turó" independent — topN
  // s'aplica dins de cada bossa, no al conjunt sencer (docs/pla-rols.md
  // §13.1 #8, Fase 2).
  if (config.scope === 'intra_tag') {
    const active = ctx.entrants.filter((e) => e.isActive);
    const { partitions, warnings: tagWarnings } = partitionByTags(active, config.tagIds ?? []);

    const matches: GeneratedMatch[] = [];
    const warnings: PairingWarning[] = [...tagWarnings];

    for (const entryIds of partitions.values()) {
      if (entryIds.length <= 1) {
        if (entryIds.length === 1) {
          warnings.push({
            type: 'no_pairings_possible',
            message: 'Una etiqueta té un sol jugador actiu: no hi ha cap aparellament possible.',
            affectedEntryIds: entryIds,
          });
          matches.push({ tableNumber: -1, entryIds });
        }
        continue;
      }
      const idSet = new Set(entryIds);
      const poolStandings = ctx.standings.filter((s) => idSet.has(s.entryId));
      const result = pairPool(poolStandings, ctx.previousMatches, config.topN, config.entryExclusions);
      matches.push(...result.matches);
      warnings.push(...result.warnings);
    }

    renumberTables(matches);
    return { matches, warnings };
  }

  return pairPool(ctx.standings, ctx.previousMatches, config.topN, config.entryExclusions);
}

function pairPool(
  standings: Standing[],
  previousMatches: PreviousMatch[],
  topN: number | null | undefined,
  entryExclusions: EntryPairExclusion[] | undefined
): PairingEngineResult {
  const warnings: PairingWarning[] = [];
  const rematchSet = buildRematchSet(previousMatches);
  const { avoidSet, forbidSet } = buildEntryExclusionSets(entryExclusions);

  // Les classificacions ja arriben ordenades i amb `rank` assignat: aquí només
  // cal respectar-ne l'ordre (abans es reordenava amb un comparador propi).
  let ordered = [...standings].sort((a, b) => a.rank - b.rank).map((s) => s.entryId);

  if (topN != null && topN > 0) {
    ordered = ordered.slice(0, topN);
  }

  if (ordered.length <= 1) {
    if (ordered.length === 1) {
      warnings.push({
        type: 'no_pairings_possible',
        message: 'Un sol jugador actiu: no hi ha cap aparellament possible.',
        affectedEntryIds: ordered,
      });
      return { matches: [{ tableNumber: -1, entryIds: ordered }], warnings };
    }
    return { matches: [], warnings };
  }

  const matches: GeneratedMatch[] = [];
  const paired = new Set<string>();
  let tableNumber = 1;

  for (let i = 0; i < ordered.length; i++) {
    const first = ordered[i];
    if (paired.has(first)) continue;

    const candidates = ordered.slice(i + 1).filter((id) => !paired.has(id));
    if (candidates.length === 0) {
      matches.push({ tableNumber: 0, entryIds: [first] });
      paired.add(first);
      continue;
    }

    // Primer, cap col·lisió (revanxa, "evitar" o "prohibir").
    let second = candidates.find(
      (id) => !hasPlayed(first, id, rematchSet) && !hasPlayed(first, id, avoidSet) && !hasPlayed(first, id, forbidSet)
    );

    if (second === undefined) {
      // Es relaxen revanxa/"evitar", però "prohibir" mai es relaxa.
      second = candidates.find((id) => !hasPlayed(first, id, forbidSet));
    }

    if (second === undefined) {
      // Tots els restants estan prohibits amb `first`: queda en bye.
      warnings.push({
        type: 'forbidden_bye',
        message: 'Sense cap parella permesa per una exclusió "prohibir": se li assigna bye.',
        affectedEntryIds: [first],
      });
      matches.push({ tableNumber: 0, entryIds: [first] });
      paired.add(first);
      continue;
    }

    if (hasPlayed(first, second, rematchSet) || hasPlayed(first, second, avoidSet)) {
      const isAvoid = !hasPlayed(first, second, rematchSet) && hasPlayed(first, second, avoidSet);
      warnings.push({
        type: isAvoid ? 'pair_excluded' : 'rematch_forced',
        message: isAvoid
          ? 'No s\'ha pogut evitar una parella marcada com a "evitar". S\'ha permès excepcionalment.'
          : 'Revanxa inevitable en aquest aparellament.',
        affectedEntryIds: [first, second],
      });
    }

    matches.push({ tableNumber: tableNumber++, entryIds: [first, second] });
    paired.add(first);
    paired.add(second);
  }

  // Cada bye necessita una taula pròpia: amb exclusions "prohibir" hi pot
  // haver més d'un bye a la mateixa ronda.
  let nextByeTable = tableNumber;
  for (const match of matches) {
    if (match.entryIds.length === 1) match.tableNumber = nextByeTable++;
  }

  return { matches, warnings };
}

/** Renumera taula 1..N per a les jugades i deixa els byes a la darrera. */
function renumberTables(matches: GeneratedMatch[]): void {
  let tableNumber = 1;
  for (const match of matches) {
    if (match.entryIds.length > 1) match.tableNumber = tableNumber++;
  }
  let nextByeTable = tableNumber;
  for (const match of matches) {
    if (match.entryIds.length === 1) match.tableNumber = nextByeTable++;
  }
}
