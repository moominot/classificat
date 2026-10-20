import type { Match } from '@/lib/pairing/types';

/**
 * Eliminatòria per posicions: en tancar una fase, cada grup es parteix per
 * la meitat. El guanyador de cada eliminatòria va a la meitat alta i el
 * perdedor a la baixa (docs/eliminatoria-per-posicions.md §3–§4).
 *
 * Tot és pur: rep les partides i les mètriques i retorna el repartiment.
 */

export interface SplitGroupInput {
  /** Etiqueta del grup; null quan la fase és de tothom (sense etiquetes). */
  tagId: string | null;
  /** Tots els membres del grup, també els qui han abandonat. */
  memberIds: string[];
}

export interface SplitInput {
  /** En l'ordre de la classificació apilada: el primer és el de dalt. */
  groups: SplitGroupInput[];
  /** Les partides de la fase, totes amb resultat. */
  matches: Match[];
  /** Inscripcions actives: qui ha abandonat perd sempre l'eliminatòria. */
  activeIds: Set<string>;
  /** Mitjana de punts a favor de tot el campionat. */
  avgScore: Map<string, number>;
  /** Bingos de tot el campionat (segon desempat). */
  bingos: Map<string, number>;
  /** Eliminatòries que ha decidit l'admin: clau de parella → guanyador. */
  decisions: Record<string, string>;
}

export interface SplitHalf {
  name: string;
  entryIds: string[];
}

export interface SplitGroupResult {
  tagId: string | null;
  top: SplitHalf;
  bottom: SplitHalf;
}

export interface UnresolvedTie {
  key: string;
  entryIds: [string, string];
  /** Punts sumats de les partides de l'eliminatòria, alineats amb `entryIds`. */
  totals: [number, number];
}

export type SplitResult =
  | { ok: true; groups: SplitGroupResult[] }
  | { ok: false; unresolved: UnresolvedTie[] };

/** Clau estable d'una parella, independent de l'ordre. */
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

export function isPowerOfTwo(n: number): boolean {
  return n >= 2 && (n & (n - 1)) === 0;
}

/** «17-32», o «5» quan el grup és d'una sola posició. */
export function rangeName(from: number, to: number): string {
  return from === to ? String(from) : `${from}-${to}`;
}

const EPSILON = 1e-9;

export function splitPhase(input: SplitInput): SplitResult {
  const unresolved: UnresolvedTie[] = [];
  const results: SplitGroupResult[] = [];
  let offset = 0;

  for (const group of input.groups) {
    const members = new Set(group.memberIds);
    const size = group.memberIds.length;
    const from = offset + 1;
    const to = offset + size;
    const cut = Math.ceil(size / 2);
    const middle = offset + cut;
    offset += size;

    // 0 = guanya l'eliminatòria (o ha fet bye), 1 = la perd, 2 = ha abandonat.
    const tier = new Map<string, number>();
    const totals = new Map<string, Map<string, number>>();   // jugador → rival → punts sumats

    for (const match of input.matches) {
      const ids = match.participants.map((p) => p.entryId).filter((id) => members.has(id));
      if (ids.length === 1 && match.participants.length === 1) {
        if (!tier.has(ids[0])) tier.set(ids[0], 0);
        continue;
      }
      if (ids.length !== 2) continue;
      for (const p of match.participants) {
        const rival = ids.find((id) => id !== p.entryId)!;
        const own = totals.get(p.entryId) ?? new Map<string, number>();
        own.set(rival, (own.get(rival) ?? 0) + (p.score ?? 0));
        totals.set(p.entryId, own);
      }
    }

    const decided = new Set<string>();
    for (const [a, rivals] of totals) {
      for (const [b, aTotal] of rivals) {
        const key = pairKey(a, b);
        if (decided.has(key)) continue;
        decided.add(key);
        const bTotal = totals.get(b)?.get(a) ?? 0;
        const winner = tieWinner(a, b, aTotal, bTotal, input);
        if (winner === undefined) {
          unresolved.push({ key, entryIds: [a, b], totals: [aTotal, bTotal] });
          continue;
        }
        if (winner !== null) {
          tier.set(winner, 0);
          tier.set(winner === a ? b : a, 1);
        }
      }
    }

    // Qui ha abandonat va sempre a baix, faci el que faci a les partides.
    for (const id of group.memberIds) {
      if (!input.activeIds.has(id)) tier.set(id, 2);
      else if (!tier.has(id)) tier.set(id, 1);
    }

    const ordered = [...group.memberIds].sort(
      (x, y) =>
        tier.get(x)! - tier.get(y)! ||
        (input.avgScore.get(y) ?? 0) - (input.avgScore.get(x) ?? 0) ||
        (input.bingos.get(y) ?? 0) - (input.bingos.get(x) ?? 0) ||
        x.localeCompare(y)
    );
    results.push({
      tagId: group.tagId,
      top: { name: rangeName(from, middle), entryIds: ordered.slice(0, cut) },
      bottom: { name: rangeName(middle + 1, to), entryIds: ordered.slice(cut) },
    });
  }

  if (unresolved.length > 0) return { ok: false, unresolved };
  return { ok: true, groups: results.filter((g) => g.top.entryIds.length + g.bottom.entryIds.length > 1) };
}

/**
 * Qui guanya una eliminatòria. `null` = cap dels dos hi continua (han
 * abandonat tots dos), `undefined` = empat que ha de decidir l'admin.
 */
function tieWinner(a: string, b: string, aTotal: number, bTotal: number, input: SplitInput): string | null | undefined {
  const aActive = input.activeIds.has(a);
  const bActive = input.activeIds.has(b);
  if (aActive !== bActive) return aActive ? a : b;
  if (!aActive) return null;

  if (Math.abs(aTotal - bTotal) > EPSILON) return aTotal > bTotal ? a : b;

  const aAvg = input.avgScore.get(a) ?? 0;
  const bAvg = input.avgScore.get(b) ?? 0;
  if (Math.abs(aAvg - bAvg) > EPSILON) return aAvg > bAvg ? a : b;

  const aBingos = input.bingos.get(a) ?? 0;
  const bBingos = input.bingos.get(b) ?? 0;
  if (Math.abs(aBingos - bBingos) > EPSILON) return aBingos > bBingos ? a : b;

  const decision = input.decisions[pairKey(a, b)];
  return decision === a || decision === b ? decision : undefined;
}
