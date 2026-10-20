import type {
  Entrant,
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
 *
 * El calendari de l'1v1 es calcula sobre `ctx.roster` (tots els actius, en
 * ordre estable), no sobre els presents: així una absència no mou els rivals
 * de les altres rondes. Qui es queda sense rival perquè l'altre és absent fa
 * bye (`byePoints`), com amb el bye del nombre senar; l'absent no juga ni
 * puntua, igual que als altres mètodes. Vegeu `withoutAbsentees()`.
 */
export function generateRoundRobinPairings(ctx: PairingContext): PairingEngineResult {
  const config = ctx.phase.config as RoundRobinConfig;
  const warnings: PairingWarning[] = [];
  const relativeRound = ctx.roundNumber - ctx.phase.startRound + 1;

  if (ctx.phase.participantsPerMatch > 2) {
    return generateMultiTables(ctx, warnings);
  }

  let matches: GeneratedMatch[];
  const present = new Set(ctx.entrants.filter((e) => e.isActive).map((e) => e.id));
  const roster = (ctx.roster ?? ctx.entrants).filter((e) => e.isActive);
  const absenceByes: string[] = [];

  if (config.scope === 'intra_tag') {
    matches = intraTag(roster, present, absenceByes, relativeRound, config, warnings);
  } else if (config.scope === 'inter_tag') {
    matches = interTag(roster, present, absenceByes, relativeRound, config, warnings);
  } else {
    const schedule = bergerSchedule(roster.map((e) => e.id), relativeRound, config.doubleRound);
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
      matches = withoutAbsentees(schedule, present, absenceByes).map((match, i) => ({
        ...match,
        tableNumber: i + 1,
      }));
    }
  }

  if (absenceByes.length > 0) {
    warnings.push({
      type: 'opponent_absent',
      message:
        absenceByes.length !== 1
          ? `${absenceByes.length} jugadors no tenen rival aquesta ronda perquè el que els tocava és absent: se'ls assigna bye.`
          : `1 jugador no té rival aquesta ronda perquè el que li tocava és absent: se li assigna bye.`,
      affectedEntryIds: absenceByes,
    });
  }

  return { matches, warnings };
}

/**
 * Treu els absents d'un calendari fet sobre tots els inscrits.
 *
 * - Tots dos presents: la partida es manté.
 * - Un absent: el present fa bye (taula d'un), que la ruta desa amb
 *   `byePoints`. No es crea la partida per resoldre-la després com a
 *   incompareixença: el motor de puntuació no sap derivar `forfeit` ni
 *   aplicar `forfeitPoints`, i deixaria una taula pendent que ningú jugarà.
 * - Tots dos absents, o l'absent tenia el bye del nombre senar: no hi ha taula.
 *
 * Els presents que fan bye per aquest motiu s'afegeixen a `absenceByes`.
 */
function withoutAbsentees(
  matches: GeneratedMatch[],
  present: Set<string>,
  absenceByes: string[]
): GeneratedMatch[] {
  const result: GeneratedMatch[] = [];
  for (const match of matches) {
    const here = match.entryIds.filter((id) => present.has(id));
    if (here.length === 0) continue;
    if (here.length < match.entryIds.length) absenceByes.push(...here);
    result.push({ ...match, entryIds: here });
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
  roster: Entrant[],
  present: Set<string>,
  absenceByes: string[],
  relativeRound: number,
  config: RoundRobinConfig,
  warnings: PairingWarning[]
): GeneratedMatch[] {
  const result: GeneratedMatch[] = [];
  let tableNumber = 1;

  const { partitions, warnings: tagWarnings } = partitionByTags(roster, config.tagIds ?? []);
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

    for (const match of withoutAbsentees(schedule, present, absenceByes)) {
      result.push({ ...match, tableNumber: tableNumber++ });
    }
  }

  return result;
}

// ─── Round robin entre etiquetes ──────────────────────────────────────────────

function interTag(
  roster: Entrant[],
  present: Set<string>,
  absenceByes: string[],
  relativeRound: number,
  config: RoundRobinConfig,
  warnings: PairingWarning[]
): GeneratedMatch[] {
  const { partitions, warnings: tagWarnings } = partitionByTags(roster, config.tagIds ?? []);
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

  // Les parelles es fan amb tots els inscrits perquè la rotació no depengui
  // de qui falta; els absents es treuen al final.
  const pairs: GeneratedMatch[] = [];
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
        pairs.push({ tableNumber: 0, entryIds: [first[k], rotated[k]] });
        matched.add(first[k]);
        matched.add(rotated[k]);
      }
    }
  }

  let tableNumber = 1;
  const result: GeneratedMatch[] = withoutAbsentees(pairs, present, absenceByes).map((match) => ({
    ...match,
    tableNumber: match.entryIds.length > 1 ? tableNumber++ : -1,
  }));

  // Una exclusió entre etiquetes pot deixar algú (o tota una etiqueta) sense
  // cap aparellament aquesta ronda: no es deixa en silenci.
  for (const key of keys) {
    const ids = partitions.get(key)!.filter((id) => present.has(id));
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
