import type {
  PairingContext,
  PairingEngineResult,
  GeneratedPairing,
  PairingWarning,
  Standing,
  SwissConfig,
} from '../types';
import { buildRematchSet, hasPlayed } from '../utils/rematch';
import { assignBye } from '../utils/bye';

/**
 * Motor d'aparellaments sistema suís.
 *
 * Implementa el sistema holandès (Dutch System) adaptat per a Scrabble:
 * - Agrupa jugadors per punts
 * - Aparella la meitat superior de cada grup amb la inferior
 * - Evita revanxes (configurable)
 * - Gestiona flotadors entre grups
 * - Relaxa restriccions si no hi ha solució perfecta
 */
export function generateSwissPairings(ctx: PairingContext): PairingEngineResult {
  const config = ctx.phase.config as SwissConfig;
  const warnings: PairingWarning[] = [];

  // Filtra jugadors actius
  let activePlayers = ctx.players.filter((p) => p.isActive);

  // Construeix el Set de revanxes
  const rematchSet = buildRematchSet(ctx.previousPairings);

  // Genera bye si el nombre de jugadors és imparell
  const byes: GeneratedPairing[] = [];
  if (activePlayers.length % 2 !== 0) {
    const { byePlayerId, remaining } = assignBye(
      activePlayers,
      ctx.standings,
      ctx.previousPairings,
      config.byeHandling
    );
    activePlayers = remaining;
    byes.push({ tableNumber: -1, player1Id: byePlayerId, player2Id: null });
  }

  // Construeix un mapa de classificació per a accés ràpid
  const standingMap = new Map(ctx.standings.map((s) => [s.playerId, s]));

  // Ordena els jugadors per punts (descendent), llavors pels desempats configurats
  const sorted = sortByStanding(activePlayers, standingMap);

  // Intenta aparellar amb avoidRematches = true primer,
  // si no és possible relaxa la restricció
  let result = tryPair(sorted, standingMap, rematchSet, config, warnings, false);

  if (result === null) {
    // Relaxa: permet revanxes (avisa)
    warnings.push({
      type: 'rematch_forced',
      message: 'No s\'ha pogut evitar una revanxa. S\'ha permès excepcionalment.',
      affectedPlayerIds: [],
    });
    result = tryPair(sorted, standingMap, rematchSet, config, warnings, true);
  }

  if (result === null) {
    // Fallback extrem: aparellament seqüencial sense cap restricció
    result = fallbackPair(sorted);
    warnings.push({
      type: 'rematch_forced',
      message: 'Aparellament de fallback sense restriccions. Reviseu manualment.',
      affectedPlayerIds: sorted.map((p) => p.id),
    });
  }

  // Afegeix el bye i assigna números de taula
  const allPairings: GeneratedPairing[] = [...result, ...byes];
  assignTableNumbers(allPairings, standingMap);

  return { pairings: allPairings, warnings };
}

// ─── Ordenació ────────────────────────────────────────────────────────────────

function sortByStanding(
  players: { id: string }[],
  standingMap: Map<string, Standing>
): { id: string }[] {
  return [...players].sort((a, b) => {
    const sa = standingMap.get(a.id);
    const sb = standingMap.get(b.id);
    const ra = sa?.rank ?? 9999;
    const rb = sb?.rank ?? 9999;
    return ra - rb; // millor classificat primer
  });
}

// ─── Algorisme principal d'aparellament ──────────────────────────────────────

interface Player { id: string }

/**
 * Intenta generar aparellaments suïssos.
 * Retorna null si no és possible amb les restriccions donades.
 */
function tryPair(
  sorted: Player[],
  standingMap: Map<string, Standing>,
  rematchSet: Set<string>,
  config: SwissConfig,
  warnings: PairingWarning[],
  allowRematches: boolean
): GeneratedPairing[] | null {
  // Agrupa per punts
  const scoreGroups = buildScoreGroups(sorted, standingMap);

  const paired = new Set<string>();
  const result: GeneratedPairing[] = [];
  const floaters: Player[] = [];

  for (let gi = 0; gi < scoreGroups.length; gi++) {
    // Prepend flotadors del grup anterior
    const group = [...floaters, ...scoreGroups[gi]];
    floaters.length = 0;

    // Filtra jugadors ja aparellats
    const available = group.filter((p) => !paired.has(p.id));
    if (available.length === 0) continue;

    // Sistema holandès: divideix en meitat superior (S1) i inferior (S2)
    const mid = Math.floor(available.length / 2);
    const s1 = available.slice(0, mid);
    const s2 = available.slice(mid);

    const groupPairings = pairHalves(s1, s2, rematchSet, allowRematches);

    if (groupPairings === null) {
      // No s'ha pogut aparellar el grup — tots els jugadors passen al grup següent
      floaters.push(...available);
      continue;
    }

    for (const { p1, p2 } of groupPairings.paired) {
      paired.add(p1.id);
      paired.add(p2.id);
      result.push({ tableNumber: 0, player1Id: p1.id, player2Id: p2.id });
    }

    // El jugador sense parella del grup passa com a flotador
    if (groupPairings.leftover) {
      floaters.push(groupPairings.leftover);
    }
  }

  // Si queden flotadors sense aparellar, ha fallat
  if (floaters.length > 0) return null;

  return result;
}

/**
 * Aparella les dues meitats d'un grup per sistema holandès.
 * Intenta permutacions per evitar revanxes.
 */
function pairHalves(
  s1: Player[],
  s2: Player[],
  rematchSet: Set<string>,
  allowRematches: boolean
): { paired: Array<{ p1: Player; p2: Player }>; leftover: Player | null } | null {
  // Cas amb nombre imparell: el darrer jugador de s2 és el "leftover" candidat
  // Si s1 i s2 no son iguals, un jugador quedarà sense parella dins del grup
  if (s1.length === 0) {
    if (s2.length === 1) return { paired: [], leftover: s2[0] };
    if (s2.length === 0) return { paired: [], leftover: null };
  }

  // Intenta totes les permutacions de s2 per trobar un aparellament vàlid
  const s2Permutations = generatePermutations(s2);

  for (const perm of s2Permutations) {
    const n = Math.min(s1.length, perm.length);
    let valid = true;

    if (!allowRematches) {
      for (let i = 0; i < n; i++) {
        if (hasPlayed(s1[i].id, perm[i].id, rematchSet)) {
          valid = false;
          break;
        }
      }
    }

    if (valid) {
      const paired: Array<{ p1: Player; p2: Player }> = [];
      for (let i = 0; i < n; i++) {
        paired.push({ p1: s1[i], p2: perm[i] });
      }

      // El jugador sobrant (si s1.length !== s2.length) és el leftover
      let leftover: Player | null = null;
      if (perm.length > s1.length) {
        leftover = perm[perm.length - 1];
      } else if (s1.length > perm.length) {
        leftover = s1[s1.length - 1];
      }

      return { paired, leftover };
    }
  }

  return null; // Cap permutació vàlida
}

/**
 * Genera totes les permutacions d'un array (per a grups petits).
 * Per a grups grans limitem a permutacions parcials (rotació).
 */
function generatePermutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  if (arr.length > 8) {
    // Per a grups grans: només rotacions (eficient i pràctic)
    return rotations(arr);
  }

  const result: T[][] = [];
  function permute(current: T[], remaining: T[]) {
    if (remaining.length === 0) {
      result.push(current);
      return;
    }
    for (let i = 0; i < remaining.length; i++) {
      permute(
        [...current, remaining[i]],
        [...remaining.slice(0, i), ...remaining.slice(i + 1)]
      );
    }
  }
  permute([], arr);
  return result;
}

function rotations<T>(arr: T[]): T[][] {
  return arr.map((_, i) => [...arr.slice(i), ...arr.slice(0, i)]);
}

// ─── Grups de puntuació ───────────────────────────────────────────────────────

function buildScoreGroups(
  sorted: Player[],
  standingMap: Map<string, Standing>
): Player[][] {
  const groups: Player[][] = [];
  let currentGroup: Player[] = [];
  let currentPoints = -1;

  for (const player of sorted) {
    const pts = standingMap.get(player.id)?.points ?? 0;
    if (currentGroup.length === 0 || pts === currentPoints) {
      currentGroup.push(player);
      currentPoints = pts;
    } else {
      groups.push(currentGroup);
      currentGroup = [player];
      currentPoints = pts;
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  return groups;
}

// ─── Fallback ────────────────────────────────────────────────────────────────

function fallbackPair(players: Player[]): GeneratedPairing[] {
  const result: GeneratedPairing[] = [];
  for (let i = 0; i < players.length - 1; i += 2) {
    result.push({
      tableNumber: 0,
      player1Id: players[i].id,
      player2Id: players[i + 1].id,
    });
  }
  return result;
}

// ─── Numeració de taules ─────────────────────────────────────────────────────

function assignTableNumbers(
  pairings: GeneratedPairing[],
  standingMap: Map<string, Standing>
): void {
  // Ordena per rang mitjà dels jugadors (millors jugadors = taula 1)
  const withRanks = pairings
    .filter((p) => p.player2Id !== null)
    .sort((a, b) => {
      const avgA = avgRank(a.player1Id, a.player2Id!, standingMap);
      const avgB = avgRank(b.player1Id, b.player2Id!, standingMap);
      return avgA - avgB;
    });

  withRanks.forEach((p, i) => {
    p.tableNumber = i + 1;
  });

  // El bye és l'última taula (o marcada amb 0)
  pairings.filter((p) => p.player2Id === null).forEach((p) => {
    p.tableNumber = 0;
  });
}

function avgRank(
  p1Id: string,
  p2Id: string,
  standingMap: Map<string, Standing>
): number {
  const r1 = standingMap.get(p1Id)?.rank ?? 9999;
  const r2 = standingMap.get(p2Id)?.rank ?? 9999;
  return (r1 + r2) / 2;
}
