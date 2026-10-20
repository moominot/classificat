import type {
  GameProfileQuestion,
  PhaseConfig,
  PresencePendingAs,
  RoundRobinConfig,
  ScoringConfig,
  TemplateConfig,
  TemplatePhase,
  TournamentVisibility,
} from '@/db/types';
import { DEFAULT_SCORING } from '@/db/types';
import { isPowerOfTwo } from '@/lib/position-split';

/**
 * Plantilles de campionat (docs/eliminatoria-per-posicions.md §4).
 *
 * Desar com a plantilla treu tot el que és d'aquest campionat (jugadors,
 * resultats, ids) i deixa les referències internes de les fases per nom o
 * per posició; crear-ne un fa el camí invers amb ids nous. Tot és pur.
 */

// ─── Referències de la configuració de fase ───────────────────────────────────

/**
 * Tradueix les referències d'una configuració de fase. Les exclusions entre
 * jugadors es descarten (són d'aquest campionat) i els grups resultants d'una
 * eliminatòria tancada també.
 */
function mapRefs(
  config: PhaseConfig,
  tag: (ref: string) => string | null,
  phase: (ref: string) => string | null
): PhaseConfig {
  const next = { ...config } as PhaseConfig & Record<string, unknown>;
  const tags = (refs: string[]) => refs.map(tag).filter((r): r is string => r !== null);

  if ('tagIds' in next && Array.isArray(next.tagIds)) next.tagIds = tags(next.tagIds);
  if ('carryStandingsFromPhaseIds' in next && Array.isArray(next.carryStandingsFromPhaseIds)) {
    next.carryStandingsFromPhaseIds = next.carryStandingsFromPhaseIds
      .map(phase)
      .filter((r): r is string => r !== null);
  }
  if ('entryExclusions' in next) next.entryExclusions = [];
  if ('tagExclusions' in next && Array.isArray(next.tagExclusions)) {
    next.tagExclusions = next.tagExclusions
      .map((ex) => ({ tagIds: ex.tagIds.map(tag) }))
      .filter((ex): ex is { tagIds: [string, string] } => ex.tagIds.every((r: string | null) => r !== null));
  }
  delete next.resultTagIds;
  return next;
}

// ─── Desar com a plantilla ────────────────────────────────────────────────────

export interface TournamentSnapshot {
  settings: { visibility: TournamentVisibility; presencePendingAs: PresencePendingAs; askPresence: boolean };
  questions: (GameProfileQuestion & { isBuiltin: boolean })[];
  /** En ordre. */
  phases: (TemplatePhase & { id: string })[];
  tags: { id: string; name: string }[];
}

export function templateFromTournament(snapshot: TournamentSnapshot): TemplateConfig {
  const tagName = new Map(snapshot.tags.map((t) => [t.id, t.name]));
  const phaseIndex = new Map(snapshot.phases.map((p, i) => [p.id, String(i)]));
  let previousSplit = false;

  const phases: TemplatePhase[] = snapshot.phases.map(({ id: _id, ...phase }) => {
    let config = mapRefs(phase.config, (id) => tagName.get(id) ?? null, (id) => phaseIndex.get(id) ?? null);
    // Els grups d'una eliminatòria per posicions que en segueix una altra els
    // posa el tancament de l'anterior: a la plantilla no hi pinten res.
    const split = isSplit(config);
    if (split && previousSplit) config = { ...config, scope: 'intra_tag', tagIds: [] } as RoundRobinConfig;
    previousSplit = split;
    return { ...phase, config };
  });

  const common = {
    version: 1 as const,
    questions: snapshot.questions.map((q) => ({ ...q })),
    settings: { ...snapshot.settings },
  };

  // Una eliminatòria per posicions pura depèn del nombre de jugadors: es desa
  // com a generador, perquè la plantilla serveixi per a 8, 16 o 32.
  const first = phases[0];
  if (first && phases.every((p) => isSplit(p.config)) && 'scope' in first.config && first.config.scope === 'all') {
    return {
      ...common,
      tags: [],
      phases: [],
      phaseGenerator: 'position_elimination',
      generatorDefaults: { scoring: first.scoring, tiebreakers: first.tiebreakers },
    };
  }

  const usedTags = new Set(phases.flatMap((p) => referencedTagNames(p.config)));
  return {
    ...common,
    tags: snapshot.tags.map((t) => t.name).filter((name) => usedTags.has(name)),
    phases,
  };
}

function isSplit(config: PhaseConfig): boolean {
  return config.method === 'round_robin' && !!config.randomDraw && !!config.splitGroups;
}

function referencedTagNames(config: PhaseConfig): string[] {
  const names: string[] = [];
  if ('tagIds' in config) names.push(...(config.tagIds ?? []));
  if (config.method === 'round_robin') names.push(...(config.tagExclusions ?? []).flatMap((ex) => ex.tagIds));
  return names;
}

// ─── Crear des d'una plantilla ────────────────────────────────────────────────

export interface InstantiatedTemplate {
  tags: { id: string; name: string }[];
  /** En ordre; `order` comença per 1. */
  phases: (TemplatePhase & { id: string; order: number })[];
  questions: (GameProfileQuestion & { isBuiltin: boolean })[];
}

export function instantiateTemplate(config: TemplateConfig, newId: () => string): InstantiatedTemplate {
  const tags = [...new Set(config.tags)].map((name) => ({ id: newId(), name }));
  const tagId = new Map(tags.map((t) => [t.name, t.id]));
  const phaseIds = config.phases.map(() => newId());

  const phases = config.phases.map((phase, i) => ({
    ...phase,
    id: phaseIds[i],
    order: i + 1,
    config: mapRefs(
      phase.config,
      (name) => tagId.get(name) ?? null,
      (index) => phaseIds[Number(index)] ?? null
    ),
  }));

  return {
    tags,
    phases,
    questions: config.questions.map((q) => ({ ...q, isBuiltin: q.isBuiltin ?? true })),
  };
}

// ─── Fases de l'eliminatòria per posicions ────────────────────────────────────

/**
 * Les fases d'una eliminatòria per posicions per a `playerCount` jugadors:
 * log₂ N fases, cadascuna amb sorteig i anada i tornada. La primera és de
 * tothom; les següents aparellen dins dels grups que deixa l'anterior.
 */
export function positionEliminationPhases(
  playerCount: number,
  opts: { scoring?: ScoringConfig; tiebreakers?: string[] } = {}
): TemplatePhase[] | { error: string } {
  if (!isPowerOfTwo(playerCount)) {
    return { error: `Calen 2, 4, 8, 16, 32… jugadors actius, i n'hi ha ${playerCount}.` };
  }

  const phases: TemplatePhase[] = [];
  for (let i = 0, size = playerCount; size >= 2; i++, size /= 2) {
    const config: RoundRobinConfig = {
      method: 'round_robin',
      scope: i === 0 ? 'all' : 'intra_tag',
      tagIds: [],
      doubleRound: true,
      tagExclusions: [],
      randomDraw: true,
      splitGroups: true,
    };
    phases.push({
      name: size === 2 ? `Fase ${i + 1}: parelles` : `Fase ${i + 1}: grups de ${size}`,
      method: 'round_robin',
      config,
      participantsPerMatch: 2,
      scoring: opts.scoring ?? DEFAULT_SCORING,
      tiebreakers: opts.tiebreakers ?? ['spread', 'avg_score'],
      standingsScope: ['global'],
      teamAggregation: null,
      standingsLive: false,
      startRound: 2 * i + 1,
      endRound: 2 * i + 2,
    });
  }
  return phases;
}
