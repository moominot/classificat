import type { TagKind } from '@/db/types';
import type { Tag } from '@/lib/pairing/types';

/**
 * Grups de classificació: etiquetes amb `kind = 'group'` i un ordre. La
 * classificació els apila l'un sota l'altre i les posicions continuen d'un
 * grup al següent: el grup «17-32» comença a la posició 17
 * (docs/eliminatoria-per-posicions.md).
 */

/** Un grup nou va al final de la classificació apilada. */
export function nextGroupOrder(existing: Array<{ kind: TagKind; order: number }>): number {
  return existing.filter((t) => t.kind === 'group').reduce((max, t) => Math.max(max, t.order), 0) + 1;
}

export function groupTags(tags: Tag[]): Tag[] {
  return tags
    .filter((t) => t.kind === 'group')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
}

export interface GroupBlock<T> {
  /** null = jugadors sense cap grup, al final. */
  tag: Tag | null;
  rows: T[];
}

/**
 * Reparteix una classificació ja ordenada en blocs per grup, en l'ordre dels
 * grups, i renumera les posicions de manera contínua.
 *
 * Dins de cada grup es manté l'ordre de la classificació (punts i
 * desempats) i els empats continuen compartint posició. Qui té més d'un grup
 * va al primer; qui no en té cap, a un bloc final.
 */
export function stackByGroups<T extends { tagIds: string[]; rank: number }>(
  standings: T[],
  tags: Tag[]
): GroupBlock<T>[] {
  const groups = groupTags(tags);
  const blockByTag = new Map<string, T[]>(groups.map((g) => [g.id, []]));
  const withoutGroup: T[] = [];

  for (const row of standings) {
    const first = groups.find((g) => row.tagIds.includes(g.id));
    if (first) blockByTag.get(first.id)!.push(row);
    else withoutGroup.push(row);
  }

  const blocks: GroupBlock<T>[] = groups.map((tag) => ({ tag, rows: blockByTag.get(tag.id)! }));
  if (withoutGroup.length > 0) blocks.push({ tag: null, rows: withoutGroup });

  let offset = 0;
  return blocks
    .filter((block) => block.rows.length > 0)
    .map((block) => {
      let previous: T | null = null;
      let rank = 0;
      const rows = block.rows.map((row, i) => {
        if (!previous || row.rank !== previous.rank) rank = offset + i + 1;
        previous = row;
        return { ...row, rank };
      });
      offset += block.rows.length;
      return { tag: block.tag, rows };
    });
}
