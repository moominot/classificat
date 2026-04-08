import type {
  PairingContext,
  PairingEngineResult,
  GeneratedPairing,
  PairingWarning,
  RoundRobinConfig,
} from '../types';

/**
 * Motor d'aparellaments round robin.
 *
 * Utilitza l'algorisme de la taula de Berger (mètode del cercle):
 * - Fixa el jugador 1 (o el bye si el nombre és imparell)
 * - Rota la resta de jugadors en sentit antihorari
 * - Cada rotació genera una ronda diferent
 *
 * Suporta:
 * - intra_group: round robin independent dins de cada grup
 * - inter_group: round robin creuant grups (útil per a fases intergrups)
 * - all: round robin global sense grups
 */
export function generateRoundRobinPairings(ctx: PairingContext): PairingEngineResult {
  const config = ctx.phase.config as RoundRobinConfig;
  const warnings: PairingWarning[] = [];

  // Determina la ronda relativa dins de la fase (1, 2, 3, ...)
  const relativeRound = ctx.roundNumber - ctx.phase.startRound + 1;

  let pairings: GeneratedPairing[];

  if (config.scope === 'intra_group') {
    pairings = generateIntraGroupRoundRobin(ctx, relativeRound, config, warnings);
  } else if (config.scope === 'inter_group') {
    pairings = generateInterGroupRoundRobin(ctx, relativeRound, warnings);
  } else {
    // 'all': tots els jugadors sense distinció de grup
    const players = ctx.players.filter((p) => p.isActive);
    const sched = bergerSchedule(players.map((p) => p.id), relativeRound, config.doubleRound);
    if (sched === null) {
      warnings.push({
        type: 'incomplete_round_robin',
        message: `La ronda relativa ${relativeRound} supera el nombre de rondes possibles del round robin.`,
        affectedPlayerIds: [],
      });
      pairings = [];
    } else {
      pairings = sched;
    }
  }

  return { pairings, warnings };
}

// ─── Round robin intragrupal ──────────────────────────────────────────────────

function generateIntraGroupRoundRobin(
  ctx: PairingContext,
  relativeRound: number,
  config: RoundRobinConfig,
  warnings: PairingWarning[]
): GeneratedPairing[] {
  const result: GeneratedPairing[] = [];
  let tableCounter = 1;

  // Agrupa els jugadors per grup
  const groups = new Map<string, string[]>();
  for (const player of ctx.players.filter((p) => p.isActive)) {
    const gid = player.groupId ?? '__nogrup__';
    if (!groups.has(gid)) groups.set(gid, []);
    groups.get(gid)!.push(player.id);
  }

  // Filtra grups si s'especifica
  const targetGroupIds = config.groupIds && config.groupIds.length > 0
    ? new Set(config.groupIds)
    : null;

  for (const [groupId, playerIds] of groups) {
    if (targetGroupIds && !targetGroupIds.has(groupId)) continue;

    const sched = bergerSchedule(playerIds, relativeRound, config.doubleRound);
    if (sched === null) {
      warnings.push({
        type: 'incomplete_round_robin',
        message: `Grup ${groupId}: la ronda ${relativeRound} supera el nombre de rondes possibles.`,
        affectedPlayerIds: playerIds,
      });
      continue;
    }

    for (const pairing of sched) {
      result.push({ ...pairing, tableNumber: tableCounter++ });
    }
  }

  return result;
}

// ─── Round robin intergrupal ─────────────────────────────────────────────────

/**
 * Aparellament entre grups: jugadors del grup A s'enfronten als del grup B, etc.
 * Útil per a fases de competició creuada entre grups.
 * Implementa una variació de la taula de Berger per a parelles de grups.
 */
function generateInterGroupRoundRobin(
  ctx: PairingContext,
  relativeRound: number,
  warnings: PairingWarning[]
): GeneratedPairing[] {
  const result: GeneratedPairing[] = [];
  let tableCounter = 1;

  // Agrupa els jugadors per grup i els ordena
  const groupMap = new Map<string, string[]>();
  for (const player of ctx.players.filter((p) => p.isActive)) {
    const gid = player.groupId ?? '__nogrup__';
    if (!groupMap.has(gid)) groupMap.set(gid, []);
    groupMap.get(gid)!.push(player.id);
  }

  const groupNames = [...groupMap.keys()].sort();
  if (groupNames.length < 2) {
    warnings.push({
      type: 'incomplete_round_robin',
      message: 'Cal almenys 2 grups per a un round robin intergrupal.',
      affectedPlayerIds: [],
    });
    return [];
  }

  // Per a cada parella de grups, aplica la rotació de Berger
  // Parelles: (grup0, grup1), (grup0, grup2), (grup1, grup2), etc.
  for (let i = 0; i < groupNames.length; i++) {
    for (let j = i + 1; j < groupNames.length; j++) {
      const g1 = groupMap.get(groupNames[i])!;
      const g2 = groupMap.get(groupNames[j])!;
      const crossPairings = crossGroupRound(g1, g2, relativeRound);
      for (const p of crossPairings) {
        result.push({ ...p, tableNumber: tableCounter++ });
      }
    }
  }

  return result;
}

/**
 * Genera els aparellaments d'una ronda concreta entre dos grups.
 * Rota el grup2 per a cada ronda.
 */
function crossGroupRound(
  g1: string[],
  g2: string[],
  relativeRound: number
): GeneratedPairing[] {
  const result: GeneratedPairing[] = [];
  const n = Math.max(g1.length, g2.length);
  const rotated = rotateArray(g2, (relativeRound - 1) % g2.length);

  for (let i = 0; i < Math.min(g1.length, rotated.length); i++) {
    result.push({ tableNumber: 0, player1Id: g1[i], player2Id: rotated[i] });
  }

  return result;
}

// ─── Algorisme de la taula de Berger ─────────────────────────────────────────

/**
 * Genera els aparellaments per a la ronda `roundNumber` (1-indexed) d'un round robin
 * utilitzant el mètode del cercle (Berger table).
 *
 * Per a N jugadors (N parell):
 *   - N/2 partides per ronda
 *   - N-1 rondes en total (o 2*(N-1) si doubleRound)
 *
 * Si N és imparell s'afegeix un bye fictici.
 *
 * Retorna null si roundNumber supera el màxim de rondes possibles.
 */
export function bergerSchedule(
  playerIds: string[],
  roundNumber: number,
  doubleRound: boolean
): GeneratedPairing[] | null {
  let ids = [...playerIds];
  const hasBye = ids.length % 2 !== 0;
  if (hasBye) ids.push('__bye__');

  const n = ids.length;
  const totalRounds = doubleRound ? n - 1 : Math.ceil((n - 1) / 1);
  const halfRounds = n - 1; // rondes en una sola volta

  const effectiveRound = doubleRound
    ? ((roundNumber - 1) % halfRounds) + 1
    : roundNumber;

  if (roundNumber > totalRounds) return null;

  // Mètode del cercle: fixa el primer element, rota la resta
  const fixed = ids[0];
  const rotating = ids.slice(1);

  // Rotació per a la ronda actual
  const shift = (effectiveRound - 1) % rotating.length;
  const rotated = rotateArray(rotating, shift);

  const pairings: GeneratedPairing[] = [];
  const half = n / 2;

  for (let i = 0; i < half; i++) {
    let p1: string;
    let p2: string;

    if (i === 0) {
      p1 = fixed;
      p2 = rotated[0];
    } else {
      p1 = rotated[i];
      p2 = rotated[n - 1 - i];
    }

    // En la segona volta (doubleRound), inverteix l'ordre dels colors/posicions
    if (doubleRound && roundNumber > halfRounds) {
      [p1, p2] = [p2, p1];
    }

    // Ignora les partides amb el bye fictici
    if (p1 === '__bye__' || p2 === '__bye__') {
      const realPlayer = p1 === '__bye__' ? p2 : p1;
      if (realPlayer !== '__bye__') {
        pairings.push({ tableNumber: 0, player1Id: realPlayer, player2Id: null });
      }
    } else {
      pairings.push({ tableNumber: 0, player1Id: p1, player2Id: p2 });
    }
  }

  return pairings;
}

/**
 * Retorna quantes rondes té un round robin per N jugadors.
 */
export function roundRobinTotalRounds(playerCount: number, doubleRound: boolean): number {
  const n = playerCount % 2 === 0 ? playerCount : playerCount + 1;
  return doubleRound ? (n - 1) * 2 : n - 1;
}

// ─── Utils ───────────────────────────────────────────────────────────────────

function rotateArray<T>(arr: T[], shift: number): T[] {
  if (arr.length === 0) return [];
  const n = arr.length;
  const s = ((shift % n) + n) % n;
  return [...arr.slice(s), ...arr.slice(0, s)];
}
