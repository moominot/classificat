import type {
  GeneratedMatch,
  PairingContext,
  PairingEngineResult,
  PairingWarning,
  RoundRobinConfig,
} from '../types';
import { buildRematchSet, countRematches, hasPlayed } from '../utils/rematch';
import { partitionByTags } from './tag-partition';
import { isTagPairExcluded } from './exclusion-partition';

/**
 * Round robin.
 *
 * Amb taules de dos fa servir la taula de Berger (mètode del cercle), que
 * garanteix que tothom juga contra tothom exactament un cop.
 *
 * Amb taules de més de dos, un round robin complet no sempre existeix (és el
 * problema del "social golfer"), de manera que es fan taules que **minimitzen
 * les repeticions** i s'avisa. Vegeu `generateMultiTables()`.
 */
export function generateRoundRobinPairings(ctx: PairingContext): PairingEngineResult {
  const config = ctx.phase.config as RoundRobinConfig;
  const warnings: PairingWarning[] = [];
  const relativeRound = ctx.roundNumber - ctx.phase.startRound + 1;

  if (ctx.phase.participantsPerMatch > 2) {
    if (config.randomDraw) {
      warnings.push({
        type: 'uneven_table',
        message: "El sorteig només és per a partides d'1 contra 1: s'aparella com un round robin de taules grans.",
        affectedEntryIds: [],
      });
    }
    return generateMultiTables(ctx, warnings);
  }

  if (config.randomDraw) {
    return generateDraw(ctx, config, relativeRound);
  }

  // Anada i tornada seguides: les rondes senars són les de Berger, una
  // volta; cada ronda parella copia l'anterior amb els seients girats.
  if (config.doubleRound && config.consecutiveLegs) {
    if (relativeRound % 2 === 0) return returnLeg(ctx, warnings);
    return singleRoundRobin(ctx, (relativeRound + 1) / 2, { ...config, doubleRound: false }, warnings);
  }

  return singleRoundRobin(ctx, relativeRound, config, warnings);
}

function singleRoundRobin(
  ctx: PairingContext,
  relativeRound: number,
  config: RoundRobinConfig,
  warnings: PairingWarning[]
): PairingEngineResult {
  let matches: GeneratedMatch[];

  if (config.scope === 'intra_tag') {
    matches = intraTag(ctx, relativeRound, config, warnings);
  } else if (config.scope === 'inter_tag') {
    matches = interTag(ctx, relativeRound, config, warnings);
  } else {
    const active = ctx.entrants.filter((e) => e.isActive);
    const schedule = bergerSchedule(active.map((e) => e.id), relativeRound, config.doubleRound);
    if (schedule === null) {
      warnings.push({
        type: 'incomplete_round_robin',
        message: `La ronda ${relativeRound} supera el nombre de rondes possibles del round robin.`,
        affectedEntryIds: [],
      });
      matches = [];
    } else {
      // bergerSchedule() numera totes les taules a 0 (no sap de numeració
      // global); cal renumerar-les aquí o l'inserció xoca amb l'únic
      // (roundId, tableNumber) en repetir el 0 a totes les files.
      matches = schedule.map((match, i) => ({ ...match, tableNumber: i + 1 }));
    }
  }

  return { matches, warnings };
}

// ─── Sorteig ──────────────────────────────────────────────────────────────────

/**
 * Sorteig dins de cada etiqueta: una ronda del round robin a l'atzar, i amb
 * `doubleRound`, la tornada (docs/eliminatoria-per-posicions.md §4).
 *
 * Triar una ronda de Berger a l'atzar sobre la llista en ordre fix només pot
 * donar n−1 emparellaments diferents. Barrejant la llista abans, qualsevol
 * emparellament és igual de probable, i n'hi ha prou amb la primera ronda.
 *
 * Un grup senar (algú ha abandonat) fa servir el fantasma de Berger: qui li
 * toca fa bye.
 */
function generateDraw(ctx: PairingContext, config: RoundRobinConfig, relativeRound: number): PairingEngineResult {
  const warnings: PairingWarning[] = [];
  const legs = config.doubleRound ? 2 : 1;

  if (config.scope === 'inter_tag') {
    warnings.push({
      type: 'no_pairings_possible',
      message: 'El sorteig només funciona dins de cada etiqueta o amb tothom, no entre etiquetes.',
      affectedEntryIds: [],
    });
    return { matches: [], warnings };
  }

  if (relativeRound > legs) {
    warnings.push({
      type: 'incomplete_round_robin',
      message: config.doubleRound
        ? `El sorteig és d'anada i tornada: la ronda ${relativeRound} de la fase sobra.`
        : `El sorteig és d'una sola ronda: la ronda ${relativeRound} de la fase sobra.`,
      affectedEntryIds: [],
    });
    return { matches: [], warnings };
  }

  if (relativeRound === 2) return returnLeg(ctx, warnings);

  const random = ctx.random ?? Math.random;
  const active = ctx.entrants.filter((e) => e.isActive);
  let pools: string[][];
  if (config.scope === 'intra_tag') {
    const { partitions, warnings: tagWarnings } = partitionByTags(active, config.tagIds ?? []);
    warnings.push(...tagWarnings);
    pools = [...partitions.values()];
  } else {
    pools = [active.map((e) => e.id)];
  }

  const matches: GeneratedMatch[] = [];
  let tableNumber = 1;
  for (const pool of pools) {
    for (const match of bergerSchedule(shuffle(pool, random), 1, false) ?? []) {
      matches.push({ ...match, tableNumber: tableNumber++ });
    }
  }
  return { matches, warnings };
}

/**
 * La tornada **copia l'anada** amb els seients girats, en lloc de tornar a
 * calcular Berger: si algú ha abandonat entre les dues partides, la llista
 * canvia i Berger donaria parelles diferents. Així, qui s'ha quedat sense
 * rival fa bye.
 */
function returnLeg(ctx: PairingContext, warnings: PairingWarning[]): PairingEngineResult {
  const firstLeg = ctx.previousMatches.filter(
    (m) => m.phaseId === ctx.phase.id && m.roundNumber === ctx.roundNumber - 1
  );
  if (firstLeg.length === 0) {
    warnings.push({
      type: 'no_pairings_possible',
      message: "Cal generar l'anada abans de la tornada.",
      affectedEntryIds: [],
    });
    return { matches: [], warnings };
  }

  const active = new Set(ctx.entrants.filter((e) => e.isActive).map((e) => e.id));
  const placed = new Set<string>();
  const matches: GeneratedMatch[] = [];
  let tableNumber = 1;

  for (const previous of firstLeg) {
    const ids = previous.entryIds.filter((id) => active.has(id));
    ids.forEach((id) => placed.add(id));
    if (ids.length === 2) {
      matches.push({ tableNumber: tableNumber++, entryIds: [ids[1], ids[0]] });
    } else if (ids.length === 1) {
      if (previous.entryIds.length > 1) {
        warnings.push({
          type: 'bye_reassigned',
          message: "El rival de l'anada no hi és: a la tornada fa bye.",
          affectedEntryIds: ids,
        });
      }
      matches.push({ tableNumber: 0, entryIds: ids });
    }
  }

  // Qui no era a l'anada (p. ex. absent) no té rival assignat.
  const unplaced = [...active].filter((id) => !placed.has(id));
  if (unplaced.length > 0) {
    warnings.push({
      type: 'no_pairings_possible',
      message: "No eren a l'anada i no tenen rival a la tornada: fan bye.",
      affectedEntryIds: unplaced,
    });
    for (const id of unplaced) matches.push({ tableNumber: 0, entryIds: [id] });
  }

  return { matches, warnings };
}

/** Fisher-Yates amb la font d'atzar donada. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ─── Taules de més de dos ─────────────────────────────────────────────────────

/**
 * Taules de N amb el mínim de repeticions.
 *
 * Amb més de dos per taula no hi ha cap rotació que garanteixi que tothom
 * coincideixi amb tothom un sol cop, així que es va omplint cada taula amb qui
 * menys ha coincidit amb els que ja hi són. És una heurística: fa la seva
 * feina i avisa quan no pot evitar repeticions.
 */
function generateMultiTables(ctx: PairingContext, warnings: PairingWarning[]): PairingEngineResult {
  const size = ctx.phase.participantsPerMatch;
  const rematchSet = buildRematchSet(ctx.previousMatches);
  const standingMap = new Map(ctx.standings.map((s) => [s.entryId, s]));

  const remaining = ctx.entrants
    .filter((e) => e.isActive)
    .sort((a, b) => (standingMap.get(a.id)?.rank ?? 9999) - (standingMap.get(b.id)?.rank ?? 9999))
    .map((e) => e.id);

  const matches: GeneratedMatch[] = [];
  let tableNumber = 1;
  let repeats = 0;

  while (remaining.length > 0) {
    const table = [remaining.shift()!];

    while (table.length < size && remaining.length > 0) {
      // De la resta, el que menys ha coincidit amb els que ja seuen a la taula;
      // a igualtat, el més ben classificat (l'ordre en què ja venen).
      let bestIndex = 0;
      let bestClashes = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const clashes = table.filter((seated) => hasPlayed(seated, remaining[i], rematchSet)).length;
        if (clashes < bestClashes) {
          bestClashes = clashes;
          bestIndex = i;
          if (clashes === 0) break;
        }
      }
      table.push(remaining.splice(bestIndex, 1)[0]);
    }

    repeats += countRematches(table, rematchSet);

    if (table.length < size && table.length > 1) {
      warnings.push({
        type: 'uneven_table',
        message: `La darrera taula té ${table.length} jugadors en lloc de ${size}.`,
        affectedEntryIds: table,
      });
    }

    matches.push({ tableNumber: tableNumber++, entryIds: table });
  }

  if (repeats > 0) {
    warnings.push({
      type: 'rematch_forced',
      message:
        `Amb taules de ${size} no hi ha cap distribució sense repeticions: ` +
        `${repeats} parelles ja s'havien trobat.`,
      affectedEntryIds: [],
    });
  }

  return { matches, warnings };
}

// ─── Round robin dins de cada etiqueta ────────────────────────────────────────

function intraTag(
  ctx: PairingContext,
  relativeRound: number,
  config: RoundRobinConfig,
  warnings: PairingWarning[]
): GeneratedMatch[] {
  const result: GeneratedMatch[] = [];
  let tableNumber = 1;

  const { partitions, warnings: tagWarnings } = partitionByTags(ctx.entrants, config.tagIds ?? []);
  warnings.push(...tagWarnings);

  for (const [tagId, entryIds] of partitions) {
    const schedule = bergerSchedule(entryIds, relativeRound, config.doubleRound);
    if (schedule === null) {
      warnings.push({
        type: 'incomplete_round_robin',
        message: `Etiqueta ${tagId}: la ronda ${relativeRound} supera el nombre de rondes possibles.`,
        affectedEntryIds: entryIds,
      });
      continue;
    }

    for (const match of schedule) {
      result.push({ ...match, tableNumber: tableNumber++ });
    }
  }

  return result;
}

// ─── Round robin entre etiquetes ──────────────────────────────────────────────

function interTag(
  ctx: PairingContext,
  relativeRound: number,
  config: RoundRobinConfig,
  warnings: PairingWarning[]
): GeneratedMatch[] {
  const { partitions, warnings: tagWarnings } = partitionByTags(ctx.entrants, config.tagIds ?? []);
  warnings.push(...tagWarnings);
  // Ordre determinista: el que ha triat el director, no l'alfabètic.
  const keys = (config.tagIds ?? []).filter((t) => partitions.has(t));

  if (keys.length < 2) {
    warnings.push({
      type: 'incomplete_round_robin',
      message: 'Cal triar com a mínim 2 etiquetes per a un round robin interetiquetes.',
      affectedEntryIds: [],
    });
    return [];
  }

  const result: GeneratedMatch[] = [];
  let tableNumber = 1;
  const matched = new Set<string>();

  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (isTagPairExcluded(config.tagExclusions, keys[i], keys[j])) continue;

      const first = partitions.get(keys[i])!;
      const second = partitions.get(keys[j])!;
      if (second.length === 0) continue;

      const rotated = rotateArray(second, (relativeRound - 1) % second.length);
      for (let k = 0; k < Math.min(first.length, rotated.length); k++) {
        // Amb 3+ etiquetes triades, un jugador pot sortir en més d'una
        // combinació de parelles aquesta ronda: un cop ja aparellat, no se'l
        // torna a fer jugar una segona vegada la mateixa ronda.
        if (matched.has(first[k]) || matched.has(rotated[k])) continue;
        result.push({ tableNumber: tableNumber++, entryIds: [first[k], rotated[k]] });
        matched.add(first[k]);
        matched.add(rotated[k]);
      }
    }
  }

  // Una exclusió entre etiquetes pot deixar algú (o tota una etiqueta) sense
  // cap aparellament aquesta ronda: no es deixa en silenci.
  for (const key of keys) {
    const ids = partitions.get(key)!;
    if (ids.length === 0) continue;
    const unmatched = ids.filter((id) => !matched.has(id));
    if (unmatched.length === 0) continue;

    if (unmatched.length === ids.length) {
      warnings.push({
        type: 'no_pairings_possible',
        message:
          'Cap aparellament possible per a aquesta etiqueta aquesta ronda: les combinacions amb les altres ' +
          'etiquetes triades estan excloses.',
        affectedEntryIds: ids,
      });
    } else {
      result.push(...unmatched.map((id) => ({ tableNumber: -1, entryIds: [id] })));
      warnings.push({
        type: 'forbidden_bye',
        message: `${unmatched.length} jugador${unmatched.length !== 1 ? 's' : ''} sense aparellament aquesta ronda per una exclusió entre etiquetes: se li assigna bye.`,
        affectedEntryIds: unmatched,
      });
    }
  }

  return result;
}

// ─── Taula de Berger ──────────────────────────────────────────────────────────

/**
 * Aparellaments de la ronda `roundNumber` (des de 1) pel mètode del cercle.
 *
 * Amb N parell: N/2 partides per ronda i N-1 rondes (el doble si `doubleRound`).
 * Amb N senar s'afegeix un bye fictici. Retorna null si la ronda demanada
 * supera el màxim.
 */
export function bergerSchedule(
  entryIds: string[],
  roundNumber: number,
  doubleRound: boolean
): GeneratedMatch[] | null {
  const ids = [...entryIds];
  if (ids.length % 2 !== 0) ids.push('__bye__');

  const n = ids.length;
  if (n < 2) return null;

  const halfRounds = n - 1;
  const totalRounds = doubleRound ? halfRounds * 2 : halfRounds;
  if (roundNumber > totalRounds) return null;

  const effectiveRound = doubleRound ? ((roundNumber - 1) % halfRounds) + 1 : roundNumber;

  const fixed = ids[0];
  const rotating = ids.slice(1);
  const rotated = rotateArray(rotating, (effectiveRound - 1) % rotating.length);

  const matches: GeneratedMatch[] = [];

  for (let i = 0; i < n / 2; i++) {
    let first: string;
    let second: string;

    if (i === 0) {
      first = fixed;
      second = rotated[0];
    } else {
      first = rotated[i];
      second = rotated[n - 1 - i];
    }

    // A la segona volta s'inverteix l'ordre a la taula.
    if (doubleRound && roundNumber > halfRounds) [first, second] = [second, first];

    if (first === '__bye__' || second === '__bye__') {
      const real = first === '__bye__' ? second : first;
      if (real !== '__bye__') matches.push({ tableNumber: 0, entryIds: [real] });
    } else {
      matches.push({ tableNumber: 0, entryIds: [first, second] });
    }
  }

  return matches;
}

/** Rondes que té un round robin per a N participants. */
export function roundRobinTotalRounds(participantCount: number, doubleRound: boolean): number {
  const n = participantCount % 2 === 0 ? participantCount : participantCount + 1;
  return doubleRound ? (n - 1) * 2 : n - 1;
}

function rotateArray<T>(arr: T[], shift: number): T[] {
  if (arr.length === 0) return [];
  const s = ((shift % arr.length) + arr.length) % arr.length;
  return [...arr.slice(s), ...arr.slice(0, s)];
}
