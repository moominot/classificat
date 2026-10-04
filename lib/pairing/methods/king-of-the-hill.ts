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
      const idSet = new Set(entryIds);
      const poolStandings = ctx.standings.filter((s) => idSet.has(s.entryId));
      const result = pairPool(poolStandings, ctx.previousMatches, config.topN);
      matches.push(...result.matches);
      warnings.push(...result.warnings);
    }

    renumberTables(matches);
    return { matches, warnings };
  }

  return pairPool(ctx.standings, ctx.previousMatches, config.topN);
}

function pairPool(
  standings: Standing[],
  previousMatches: PreviousMatch[],
  topN: number | null | undefined
): PairingEngineResult {
  const warnings: PairingWarning[] = [];
  const rematchSet = buildRematchSet(previousMatches);

  // Les classificacions ja arriben ordenades i amb `rank` assignat: aquí només
  // cal respectar-ne l'ordre (abans es reordenava amb un comparador propi).
  let ordered = [...standings].sort((a, b) => a.rank - b.rank).map((s) => s.entryId);

  if (topN != null && topN > 0) {
    ordered = ordered.slice(0, topN);
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

    let second = candidates.find((id) => !hasPlayed(first, id, rematchSet));

    if (second === undefined) {
      second = candidates[0];
      warnings.push({
        type: 'rematch_forced',
        message: 'Revanxa inevitable en aquest aparellament.',
        affectedEntryIds: [first, second],
      });
    }

    matches.push({ tableNumber: tableNumber++, entryIds: [first, second] });
    paired.add(first);
    paired.add(second);
  }

  // El bye va a l'última taula.
  const lastTable = tableNumber;
  for (const match of matches) {
    if (match.entryIds.length === 1) match.tableNumber = lastTable;
  }

  return { matches, warnings };
}

/** Renumera taula 1..N per a les jugades i deixa els byes a la darrera. */
function renumberTables(matches: GeneratedMatch[]): void {
  let tableNumber = 1;
  for (const match of matches) {
    if (match.entryIds.length > 1) match.tableNumber = tableNumber++;
  }
  const lastTable = tableNumber;
  for (const match of matches) {
    if (match.entryIds.length === 1) match.tableNumber = lastTable;
  }
}
