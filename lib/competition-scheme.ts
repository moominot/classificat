import type { PhaseConfig } from '@/db/types';
import { isPowerOfTwo, rangeName } from '@/lib/position-split';

/**
 * Esquema de la competició: de la inscripció a la classificació final, per
 * entendre-la d'un cop d'ull (pestanya Format). Tot és pur: rep les fases i
 * el nombre de jugadors i retorna què s'ha de dibuixar.
 *
 * Les fases d'eliminatòria per posicions seguides s'agrupen en un sol quadre:
 * a cada fase, cada grup es parteix per la meitat, guanyadors a dalt
 * (docs/eliminatoria-per-posicions.md).
 */

export interface SchemePhase {
  id: string;
  name: string;
  startRound: number;
  endRound: number;
  config: PhaseConfig;
  isComplete: boolean;
}

export type SchemeStep =
  | { kind: 'registration'; players: number; open: boolean; requirement: string | null }
  | { kind: 'phase'; phase: SchemePhase; current: boolean }
  | { kind: 'bracket'; phases: SchemePhase[]; playerCount: number; currentLevel: number | null; provisional: boolean }
  | { kind: 'final'; current: boolean };

function isSplit(config: PhaseConfig): boolean {
  return config.method === 'round_robin' && !!config.randomDraw && !!config.splitGroups;
}

export function buildScheme(input: {
  phases: SchemePhase[];
  activePlayers: number;
  registrationOpen: boolean;
  /** El campionat ve d'una plantilla d'eliminatòria i encara no té fases. */
  positionEliminationPlanned: boolean;
}): SchemeStep[] {
  const steps: SchemeStep[] = [];
  const hasBracket = input.phases.some((p) => isSplit(p.config)) || input.positionEliminationPlanned;
  const fits = isPowerOfTwo(input.activePlayers);

  steps.push({
    kind: 'registration',
    players: input.activePlayers,
    open: input.registrationOpen,
    requirement: hasBracket && !fits ? 'Calen 2, 4, 8, 16, 32… jugadors perquè el quadre quadri.' : null,
  });

  // La fase en curs: la primera sense tancar.
  const currentId = input.phases.find((p) => !p.isComplete)?.id ?? null;

  for (let i = 0; i < input.phases.length; i++) {
    const phase = input.phases[i];
    if (!isSplit(phase.config)) {
      steps.push({ kind: 'phase', phase, current: phase.id === currentId });
      continue;
    }
    const run: SchemePhase[] = [];
    while (i < input.phases.length && isSplit(input.phases[i].config)) run.push(input.phases[i++]);
    i--;
    const currentIndex = run.findIndex((p) => p.id === currentId);
    const finished = run.every((p) => p.isComplete);
    steps.push({
      kind: 'bracket',
      phases: run,
      playerCount: 2 ** run.length,
      currentLevel: currentIndex >= 0 ? currentIndex : finished ? run.length : null,
      provisional: false,
    });
  }

  // Sense fases encara: un quadre orientatiu amb els jugadors d'ara (o amb
  // la potència de 2 més propera per sobre).
  if (input.phases.length === 0 && input.positionEliminationPlanned) {
    const count = fits ? input.activePlayers : nextPowerOfTwo(Math.max(input.activePlayers, 4));
    steps.push({ kind: 'bracket', phases: [], playerCount: count, currentLevel: null, provisional: true });
  }

  steps.push({ kind: 'final', current: input.phases.length > 0 && input.phases.every((p) => p.isComplete) });
  return steps;
}

export function nextPowerOfTwo(n: number): number {
  let p = 2;
  while (p < n) p *= 2;
  return p;
}

// ─── Quadre ───────────────────────────────────────────────────────────────────

export interface BracketNode {
  /** 0 = abans de la primera fase; `levels` = posicions finals. */
  level: number;
  index: number;
  from: number;
  to: number;
  name: string;
}

export interface BracketEdge {
  parent: BracketNode;
  child: BracketNode;
  kind: 'win' | 'loss';
}

/**
 * Els grups de cada nivell: el nivell i té 2^i grups de N/2^i jugadors, i
 * cada grup té dos fills, la meitat de dalt (qui guanya) i la de baix.
 */
export function bracketTree(playerCount: number): { levels: BracketNode[][]; edges: BracketEdge[] } {
  const depth = Math.log2(playerCount);
  const levels: BracketNode[][] = [];
  for (let level = 0; level <= depth; level++) {
    const size = playerCount / 2 ** level;
    levels.push(
      Array.from({ length: 2 ** level }, (_, index) => {
        const from = index * size + 1;
        const to = from + size - 1;
        return { level, index, from, to, name: rangeName(from, to) };
      })
    );
  }
  const edges: BracketEdge[] = [];
  for (let level = 0; level < depth; level++) {
    for (const parent of levels[level]) {
      edges.push({ parent, child: levels[level + 1][parent.index * 2], kind: 'win' });
      edges.push({ parent, child: levels[level + 1][parent.index * 2 + 1], kind: 'loss' });
    }
  }
  return { levels, edges };
}

/**
 * El camí d'un jugador: a cada fase, guanya (true) o perd (false). Retorna
 * el grup de cada nivell fins on arriben les decisions.
 */
export function pathFor(playerCount: number, results: boolean[]): { from: number; to: number }[] {
  const path = [{ from: 1, to: playerCount }];
  for (const won of results) {
    const { from, to } = path[path.length - 1];
    if (from === to) break;
    const middle = from + (to - from + 1) / 2 - 1;
    path.push(won ? { from, to: middle } : { from: middle + 1, to });
  }
  return path;
}

/**
 * El grup actual d'un jugador a partir de les seves etiquetes: la més
 * estreta que sigui un rang del quadre («9-16», «5»…).
 */
export function currentRange(playerCount: number, tagNames: string[]): { from: number; to: number } | null {
  let best: { from: number; to: number } | null = null;
  for (const name of tagNames) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(name.trim());
    if (!m) continue;
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    const size = to - from + 1;
    // Ha de ser un grup del quadre: mida potència de 2 i ben alineat.
    if (to > playerCount || from < 1 || !(size === 1 || isPowerOfTwo(size)) || (from - 1) % size !== 0) continue;
    if (!best || size < best.to - best.from + 1) best = { from, to };
  }
  return best;
}

/** Els grups pels quals ha passat qui és ara a `range`: els que el contenen. */
export function ancestorsOf(playerCount: number, range: { from: number; to: number }): { from: number; to: number }[] {
  const result: { from: number; to: number }[] = [];
  for (let size = playerCount; size >= range.to - range.from + 1; size /= 2) {
    const from = Math.floor((range.from - 1) / size) * size + 1;
    result.push({ from, to: from + size - 1 });
    if (size === 1) break;
  }
  return result;
}
