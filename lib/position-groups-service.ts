import type { PhaseConfig, RoundRobinConfig } from '@/db/types';
import { loadEntrants, loadPreviousMatches, loadTags } from '@/lib/db-helpers';
import type { Entrant } from '@/lib/pairing/types';
import type { SplitGroupInput } from '@/lib/position-split';
import { sortGroupTags } from '@/lib/tag-groups';

/**
 * Peces de base de dades de l'eliminatòria per posicions
 * (docs/eliminatoria-per-posicions.md). La lògica és a `lib/position-split.ts`.
 */

type PhaseRow = { method: string; config: PhaseConfig };

/** La configuració, si la fase és una eliminatòria per posicions. */
export function splitGroupsConfig(phase: { method: string; config: PhaseConfig }): RoundRobinConfig | null {
  const config = phase.config;
  return config.method === 'round_robin' && config.randomDraw && config.splitGroups ? config : null;
}

export interface BracketGroups {
  groups: (SplitGroupInput & { name: string | null })[];
  activeIds: Set<string>;
  /** Actius sense cap de les etiquetes de la fase: no són a cap grup. */
  outside: Entrant[];
  entrants: Entrant[];
}

/**
 * Els grups de la fase amb tots els seus membres, en l'ordre de la
 * classificació apilada.
 *
 * Membre = inscripció activa, o inactiva que ja ha jugat alguna partida:
 * qui abandona continua ocupant la seva plaça (sempre a baix) perquè els
 * grups mantinguin la mida. Qui es va donar de baixa abans de jugar, no.
 */
export async function loadBracketGroups(tournamentId: string, phase: PhaseRow): Promise<BracketGroups> {
  const config = splitGroupsConfig(phase);
  const [entrants, previous, tags] = await Promise.all([
    loadEntrants(tournamentId),
    loadPreviousMatches(tournamentId),
    loadTags(tournamentId),
  ]);
  const played = new Set(previous.flatMap((m) => m.entryIds));
  const members = entrants.filter((e) => e.isActive || played.has(e.id));
  const activeIds = new Set(entrants.filter((e) => e.isActive).map((e) => e.id));

  if (!config || config.scope === 'all') {
    return { groups: [{ tagId: null, name: null, memberIds: members.map((e) => e.id) }], activeIds, outside: [], entrants };
  }

  // Mateixa regla que l'aparellament (partitionByTags): mana la primera de
  // les etiquetes de la fase, en l'ordre triat.
  const groupTagIds = config.tagIds ?? [];
  const byTag = new Map<string, string[]>(groupTagIds.map((id) => [id, []]));
  const outside: Entrant[] = [];
  for (const e of members) {
    const tagId = groupTagIds.find((id) => e.tagIds?.includes(id));
    if (tagId) byTag.get(tagId)!.push(e.id);
    else if (e.isActive) outside.push(e);
  }

  const ordered = sortGroupTags(tags.filter((t) => byTag.has(t.id)));
  return {
    groups: ordered.map((t) => ({ tagId: t.id, name: t.name, memberIds: byTag.get(t.id)! })),
    activeIds,
    outside,
    entrants,
  };
}
