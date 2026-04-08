/**
 * Tests bàsics del motor d'aparellaments.
 * Executa amb: npx tsx lib/pairing/__tests__/engine.test.ts
 */

import { generatePairings } from '../engine';
import { computeStandings } from '../standings';
import { bergerSchedule } from '../methods/round-robin';
import type {
  Phase, Player, Standing, Round, PairingContext,
  SwissConfig, RoundRobinConfig, KingOfTheHillConfig,
} from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePlayer(id: string, groupId?: string): Player {
  return { id, tournamentId: 't1', name: `Jugador ${id}`, isActive: true, groupId: groupId ?? null, createdAt: new Date() };
}

function makeStanding(playerId: string, rank: number, points: number): Standing {
  return {
    playerId,
    rank,
    points,
    wins: points,
    losses: 0,
    draws: 0,
    byes: 0,
    gamesPlayed: points,
    spread: points * 10,
    tiebreakers: { buchholz: 0, medianBuchholz: 0, berger: 0, cumulative: 0, spread: 0, wins: points, directEncounterResult: -1 },
  };
}

function makePhase(method: Phase['method'], config: Phase['config']): Phase {
  return {
    id: 'phase1',
    tournamentId: 't1',
    order: 1,
    name: 'Fase de prova',
    method,
    startRound: 1,
    endRound: 10,
    tiebreakers: ['median_buchholz', 'buchholz', 'spread'],
    config,
    isComplete: false,
  };
}

function makeCtx(phase: Phase, players: Player[], standings: Standing[]): PairingContext {
  return { phase, roundNumber: 1, players, standings, previousPairings: [] };
}

// ─── Test 1: Berger schedule ──────────────────────────────────────────────────

console.log('\n=== Test 1: Taula de Berger (Round Robin) ===');
{
  const playerIds = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
  const totalRounds = 5; // 6 jugadors → 5 rondes

  for (let r = 1; r <= totalRounds; r++) {
    const pairings = bergerSchedule(playerIds, r, false);
    console.log(`  Ronda ${r}:`, pairings?.map(p => `${p.player1Id} vs ${p.player2Id ?? 'BYE'}`).join(', '));
  }

  // Verifica que cap parella es repeteix
  const seen = new Set<string>();
  let hasRepeat = false;
  for (let r = 1; r <= totalRounds; r++) {
    const pairings = bergerSchedule(playerIds, r, false) ?? [];
    for (const p of pairings) {
      const key = [p.player1Id, p.player2Id].sort().join(':');
      if (seen.has(key)) { hasRepeat = true; }
      seen.add(key);
    }
  }
  console.log(`  Cap revanxa: ${!hasRepeat ? '✓' : '✗ ERROR'}`);
}

// ─── Test 2: Round Robin amb nombre imparell ──────────────────────────────────

console.log('\n=== Test 2: Berger amb 5 jugadors (imparell = bye) ===');
{
  const playerIds = ['P1', 'P2', 'P3', 'P4', 'P5'];
  for (let r = 1; r <= 5; r++) {
    const pairings = bergerSchedule(playerIds, r, false);
    console.log(`  Ronda ${r}:`, pairings?.map(p => `${p.player1Id} vs ${p.player2Id ?? 'BYE'}`).join(', '));
  }
}

// ─── Test 3: Sistema suís bàsic ───────────────────────────────────────────────

console.log('\n=== Test 3: Sistema suís (6 jugadors, ronda 1) ===');
{
  const players = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(id => makePlayer(id));
  const standings = players.map((p, i) => makeStanding(p.id, i + 1, 0)); // tots a 0 punts

  const phase = makePhase('swiss', {
    method: 'swiss',
    avoidRematches: true,
    byeHandling: 'lowest_ranked',
    scoreGroupWindowSize: 2,
    carryStandingsFromPhaseIds: [],
  } as SwissConfig);

  const ctx = makeCtx(phase, players, standings);
  const result = generatePairings(ctx);

  console.log('  Aparellaments:');
  result.pairings.forEach(p => {
    console.log(`    Taula ${p.tableNumber}: ${p.player1Id} vs ${p.player2Id ?? 'BYE'}`);
  });
  console.log(`  Avisos: ${result.warnings.length === 0 ? 'cap' : result.warnings.map(w => w.message).join(', ')}`);
}

// ─── Test 4: Sistema suís amb revanxa forçada ─────────────────────────────────

console.log('\n=== Test 4: Sistema suís (4 jugadors, 2a ronda amb revanxa) ===');
{
  const players = ['P1', 'P2', 'P3', 'P4'].map(id => makePlayer(id));
  const standings = [
    makeStanding('P1', 1, 1),
    makeStanding('P2', 2, 1),
    makeStanding('P3', 3, 0),
    makeStanding('P4', 4, 0),
  ];

  const phase = makePhase('swiss', {
    method: 'swiss',
    avoidRematches: true,
    byeHandling: 'lowest_ranked',
    scoreGroupWindowSize: 2,
    carryStandingsFromPhaseIds: [],
  } as SwissConfig);

  // Tots ja s'han enfrontat a tots
  const previousPairings = [
    { player1Id: 'P1', player2Id: 'P2', roundNumber: 1, phaseId: 'phase1' },
    { player1Id: 'P3', player2Id: 'P4', roundNumber: 1, phaseId: 'phase1' },
  ];

  const ctx: PairingContext = { ...makeCtx(phase, players, standings), previousPairings };
  const result = generatePairings(ctx);

  console.log('  Aparellaments:');
  result.pairings.forEach(p => {
    console.log(`    Taula ${p.tableNumber}: ${p.player1Id} vs ${p.player2Id ?? 'BYE'}`);
  });
  if (result.warnings.length > 0) {
    console.log(`  Avís: ${result.warnings[0].message}`);
  }
}

// ─── Test 5: Rei del turó ─────────────────────────────────────────────────────

console.log('\n=== Test 5: Rei del turó ===');
{
  const players = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(id => makePlayer(id));
  const standings = [
    makeStanding('P1', 1, 5),
    makeStanding('P2', 2, 4),
    makeStanding('P3', 3, 3),
    makeStanding('P4', 4, 3),
    makeStanding('P5', 5, 2),
    makeStanding('P6', 6, 1),
  ];

  const phase = makePhase('king_of_the_hill', {
    method: 'king_of_the_hill',
    topN: null,
    carryStandingsFromPhaseIds: [],
  } as KingOfTheHillConfig);

  const ctx = makeCtx(phase, players, standings);
  const result = generatePairings(ctx);

  console.log('  Aparellaments:');
  result.pairings.forEach(p => {
    console.log(`    Taula ${p.tableNumber}: ${p.player1Id} vs ${p.player2Id ?? 'BYE'}`);
  });
}

// ─── Test 6: Càlcul de classificació ─────────────────────────────────────────

console.log('\n=== Test 6: Càlcul de classificació amb Buchholz ===');
{
  // Simula 3 rondes amb 4 jugadors
  const engineRounds: Round[] = [
    {
      id: 'r1', tournamentId: 't1', phaseId: 'p1', number: 1, isComplete: true, createdAt: new Date(),
      pairings: [
        { id: 'a1', roundId: 'r1', tableNumber: 1, player1Id: 'P1', player2Id: 'P2',
          result: { p1Score: 350, p2Score: 280, outcome1: 'win', outcome2: 'loss', reportedAt: new Date(), reportedBy: null } },
        { id: 'a2', roundId: 'r1', tableNumber: 2, player1Id: 'P3', player2Id: 'P4',
          result: { p1Score: 320, p2Score: 310, outcome1: 'win', outcome2: 'loss', reportedAt: new Date(), reportedBy: null } },
      ],
    },
    {
      id: 'r2', tournamentId: 't1', phaseId: 'p1', number: 2, isComplete: true, createdAt: new Date(),
      pairings: [
        { id: 'a3', roundId: 'r2', tableNumber: 1, player1Id: 'P1', player2Id: 'P3',
          result: { p1Score: 400, p2Score: 300, outcome1: 'win', outcome2: 'loss', reportedAt: new Date(), reportedBy: null } },
        { id: 'a4', roundId: 'r2', tableNumber: 2, player1Id: 'P2', player2Id: 'P4',
          result: { p1Score: 280, p2Score: 320, outcome1: 'loss', outcome2: 'win', reportedAt: new Date(), reportedBy: null } },
      ],
    },
  ];

  const standings = computeStandings(engineRounds, ['P1', 'P2', 'P3', 'P4'], ['buchholz', 'spread']);
  standings.forEach(s => {
    console.log(`  ${s.rank}. ${s.playerId}: ${s.points}pts, spread:${s.spread}, Buchholz:${s.tiebreakers.buchholz}`);
  });
}

console.log('\n✓ Tots els tests completats.\n');
