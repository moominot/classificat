import type { PhaseConfig } from '@/db/types';
import type { Tag } from '@/lib/pairing/types';

/**
 * Classificació apilada per grups (docs/eliminatoria-per-posicions.md).
 *
 * Els grups no són un tipus d'etiqueta nou: són **les etiquetes que la fase
 * ja fa servir per partir els jugadors** (`scope: 'intra_tag'` o
 * `'inter_tag'`). L'ordre surt del nom amb ordenació natural, de manera que
 * «1-8», «9-16», «17-24» queden en aquest ordre sense haver-lo de configurar.
 */

/** Les etiquetes amb què una fase parteix els jugadors, si en té. */
export function phaseGroupTagIds(config: PhaseConfig): string[] {
  if (config.method === 'manual' || config.scope === 'all') return [];
  return config.tagIds ?? [];
}

/** Ordre natural pel nom: «2» abans que «10», «9-16» abans que «17-32». */
export function sortGroupTags(tags: Tag[]): Tag[] {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name, 'ca', { numeric: true }));
}

export interface GroupBlock<T> {
  /** null = jugadors sense cap dels grups, al final. */
  tag: Tag | null;
  rows: T[];
}

/**
 * Reparteix una classificació ja ordenada en blocs, un per grup i en l'ordre
 * donat, i renumera les posicions de manera contínua: el segon bloc comença
 * on acaba el primer.
 *
 * Dins de cada grup es manté l'ordre de la classificació (punts i
 * desempats) i els empats continuen compartint posició. Qui és a més d'un
 * grup va al primer; qui no és a cap, a un bloc final.
 */
export function stackByGroups<T extends { tagIds: string[]; rank: number }>(
  standings: T[],
  groups: Tag[]
): GroupBlock<T>[] {
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
