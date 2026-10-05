import type { EntryPairExclusion, TagPairExclusion } from '@/db/types';
import { pairKey } from '../utils/rematch';

export interface ExclusionSets {
  /** Parelles a evitar: restricció tova, es relaxa si cal (com les revanxes). */
  avoidSet: Set<string>;
  /** Parelles prohibides: mai es permeten, encara que calgui donar un bye. */
  forbidSet: Set<string>;
}

/** Construeix els sets d'exclusió de parella concreta (Suís, Suís FIDE, Rei del turó). */
export function buildEntryExclusionSets(rules: EntryPairExclusion[] | undefined): ExclusionSets {
  const avoidSet = new Set<string>();
  const forbidSet = new Set<string>();
  for (const rule of rules ?? []) {
    const key = pairKey(rule.entryIds[0], rule.entryIds[1]);
    if (rule.mode === 'forbid') forbidSet.add(key);
    else avoidSet.add(key);
  }
  return { avoidSet, forbidSet };
}

/** Només per a Round Robin interetiquetes: diu si dues etiquetes estan excloses entre si. */
export function isTagPairExcluded(
  rules: TagPairExclusion[] | undefined,
  tagA: string,
  tagB: string
): boolean {
  const key = pairKey(tagA, tagB);
  return (rules ?? []).some((r) => pairKey(r.tagIds[0], r.tagIds[1]) === key);
}
