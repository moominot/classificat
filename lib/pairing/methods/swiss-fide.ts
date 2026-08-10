import { pair } from '@echecs/swiss/dutch';
import type { Game } from '@echecs/swiss/dutch';
import type {
  PairingContext,
  PairingEngineResult,
  GeneratedPairing,
  Player,
  PreviousPairing,
  GameOutcome,
  SwissFideConfig,
} from '../types';

/**
 * Adapta el context intern al format que espera @echecs/swiss i en retorna
 * el resultat en el format del nostre motor.
 *
 * Utilitza el sistema holandès FIDE amb matching global òptim (algorisme
 * blossom d'Edmonds), que evita decisions greedy locals que poden generar
 * revanxes forçades en rondes posteriors.
 *
 * Si scope === 'intra_group', cada grup es processa de forma independent.
 */
export function generateSwissFidePairings(ctx: PairingContext): PairingEngineResult {
  const config = ctx.phase.config as SwissFideConfig;
  // La llibreria usa l'ordre d'entrada com a TPN (Tournament Player Number),
  // per tant cal pre-ordenar: primer per rating desc, després per nom asc.
  const activePlayers = ctx.players
    .filter((p) => p.isActive)
    .sort((a, b) => {
      const rA = a.rating ?? -1;
      const rB = b.rating ?? -1;
      if (rB !== rA) return rB - rA;
      return a.name.localeCompare(b.name);
    });

  if (config.scope === 'intra_group') {
    return pairByGroups(activePlayers, ctx, config);
  }
  return pairAll(activePlayers, ctx, config);
}

function pairAll(
  activePlayers: Player[],
  ctx: PairingContext,
  config: SwissFideConfig,
): PairingEngineResult {
  const standingMap = new Map(ctx.standings.map((s) => [s.playerId, s]));
  const echecsPlayers = activePlayers.map((p) => ({ id: p.id, rating: p.rating ?? undefined }));
  const games = buildGameHistory(ctx.previousPairings);

  const result = pair(echecsPlayers, games, { expectedRounds: config.expectedRounds });

  const pairings = sortAndNumber(result.pairings.map((p) => ({ player1Id: p.white, player2Id: p.black })), standingMap);
  const byes: GeneratedPairing[] = result.byes.map((b) => ({ tableNumber: -1, player1Id: b.player, player2Id: null }));

  return { pairings: [...pairings, ...byes], warnings: [] };
}

function pairByGroups(
  activePlayers: Player[],
  ctx: PairingContext,
  config: SwissFideConfig,
): PairingEngineResult {
  const standingMap = new Map(ctx.standings.map((s) => [s.playerId, s]));

  // Agrupa jugadors per groupId (null = sense grup → tractat com a grup únic)
  const groupMap = new Map<string, Player[]>();
  for (const p of activePlayers) {
    const key = p.groupId ?? '__ungrouped__';
    const list = groupMap.get(key) ?? [];
    list.push(p);
    groupMap.set(key, list);
  }

  const allPairings: Omit<GeneratedPairing, 'tableNumber'>[] = [];
  const allByes: GeneratedPairing[] = [];

  for (const groupPlayers of groupMap.values()) {
    const playerIds = new Set(groupPlayers.map((p) => p.id));
    const groupPreviousPairings = ctx.previousPairings.filter(
      (pp) => playerIds.has(pp.player1Id) && (pp.player2Id === null || playerIds.has(pp.player2Id)),
    );

    const echecsPlayers = groupPlayers.map((p) => ({ id: p.id, rating: p.rating ?? undefined }));
    const games = buildGameHistory(groupPreviousPairings);

    const result = pair(echecsPlayers, games, { expectedRounds: config.expectedRounds });

    allPairings.push(...result.pairings.map((p) => ({ player1Id: p.white, player2Id: p.black })));
    allByes.push(...result.byes.map((b) => ({ tableNumber: -1, player1Id: b.player, player2Id: null })));
  }

  const numbered = sortAndNumber(allPairings, standingMap);
  return { pairings: [...numbered, ...allByes], warnings: [] };
}

function sortAndNumber(
  pairings: Omit<GeneratedPairing, 'tableNumber'>[],
  standingMap: Map<string, { points: number }>,
): GeneratedPairing[] {
  return pairings
    .sort((a, b) => {
      const scoreA = Math.max(standingMap.get(a.player1Id)?.points ?? 0, standingMap.get(a.player2Id ?? '')?.points ?? 0);
      const scoreB = Math.max(standingMap.get(b.player1Id)?.points ?? 0, standingMap.get(b.player2Id ?? '')?.points ?? 0);
      return scoreB - scoreA;
    })
    .map((p, i) => ({ tableNumber: i + 1, ...p }));
}

function buildGameHistory(previousPairings: PreviousPairing[]): Game[][] {
  const byRound = new Map<number, Game[]>();

  for (const pp of previousPairings) {
    const roundGames = byRound.get(pp.roundNumber) ?? [];

    if (pp.player2Id === null) {
      // Bye: oponent fictici amb el mateix jugador perquè la llibreria
      // computi correctament els punts acumulats (1pt = pairing-bye)
      roundGames.push({ white: pp.player1Id, black: pp.player1Id, result: 1, kind: 'pairing-bye' });
    } else {
      const result = outcomeToResult(pp.outcome1);
      if (result !== null) {
        roundGames.push({ white: pp.player1Id, black: pp.player2Id, result });
      }
    }

    byRound.set(pp.roundNumber, roundGames);
  }

  if (byRound.size === 0) return [];

  const maxRound = Math.max(...byRound.keys());
  const games: Game[][] = [];
  for (let r = 1; r <= maxRound; r++) {
    games.push(byRound.get(r) ?? []);
  }
  return games;
}

function outcomeToResult(outcome: GameOutcome | null): 0 | 0.5 | 1 | null {
  switch (outcome) {
    case 'win':
    case 'forfeit':
      return 1;
    case 'loss':
      return 0;
    case 'draw':
      return 0.5;
    default:
      return null;
  }
}
