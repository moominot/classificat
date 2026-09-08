/**
 * Tests del motor d'aparellaments.
 * Executa amb: npx tsx lib/pairing/__tests__/engine.test.ts
 */

// S'importen els mètodes directament i no des de '../engine': el motor arrossega
// @echecs/swiss, que és només ESM i no es pot carregar amb tsx en mode CommonJS.
// La tria de mètode i la validació de mida de taula es proven per separat.
import { generateSwissPairings } from '../methods/swiss';
import { generateKingOfTheHillPairings } from '../methods/king-of-the-hill';
import { generateRoundRobinPairings, bergerSchedule, roundRobinTotalRounds } from '../methods/round-robin';
import { supportsTableSize, tableSizeError } from '../validation';
import type {
  Entrant,
  GeneratedMatch,
  KingOfTheHillConfig,
  PairingContext,
  Phase,
  PhaseConfig,
  PreviousMatch,
  RoundRobinConfig,
  Standing,
  SwissConfig,
} from '../types';
import { DEFAULT_SCORING } from '@/db/types';

let failed = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FALLA ${name}\n    obtingut: ${JSON.stringify(got)}\n    esperat:  ${JSON.stringify(want)}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntrant(id: string, groupId?: string): Entrant {
  return {
    id,
    tournamentId: 't1',
    personId: `person-${id}`,
    displayName: `Jugador ${id}`,
    isActive: true,
    groupId: groupId ?? null,
    teamId: null,
  };
}

function makeStanding(entryId: string, rank: number, points: number): Standing {
  return {
    entryId,
    rank,
    points,
    wins: points,
    losses: 0,
    draws: 0,
    byes: 0,
    gamesPlayed: points,
    metrics: { wins: points, spread: points * 10, total_score: 0, avg_score: 0 },
  };
}

function makePhase(
  method: Phase['method'],
  config: PhaseConfig,
  participantsPerMatch = 2
): Phase {
  return {
    id: 'phase1',
    tournamentId: 't1',
    order: 1,
    name: 'Fase de prova',
    method,
    config,
    participantsPerMatch,
    scoring: DEFAULT_SCORING,
    tiebreakers: ['spread', 'wins'],
    standingsScope: ['global'],
    startRound: 1,
    endRound: 10,
    isComplete: false,
  };
}

function makeCtx(
  phase: Phase,
  entrants: Entrant[],
  standings: Standing[],
  previousMatches: PreviousMatch[] = []
): PairingContext {
  return { phase, roundNumber: 1, entrants, standings, previousMatches };
}

const SWISS_CONFIG: SwissConfig = {
  method: 'swiss',
  avoidRematches: true,
  byeHandling: 'lowest_ranked',
  scoreGroupWindowSize: 2,
  carryStandingsFromPhaseIds: [],
  seedingCriteria: ['points', 'elo', 'name'],
};

/** Tots els participants apareixen exactament un cop. */
function coversEveryone(matches: GeneratedMatch[], entryIds: string[]): boolean {
  const seen = matches.flatMap((m) => m.entryIds);
  return seen.length === entryIds.length && new Set(seen).size === entryIds.length;
}

// ─── Taula de Berger ──────────────────────────────────────────────────────────

console.log('\n=== Taula de Berger ===');
{
  const ids = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
  check('6 jugadors → 5 rondes', roundRobinTotalRounds(6, false), 5);

  const seen = new Set<string>();
  let repeats = 0;
  let complete = true;

  for (let round = 1; round <= 5; round++) {
    const matches = bergerSchedule(ids, round, false) ?? [];
    if (!coversEveryone(matches, ids)) complete = false;
    for (const match of matches) {
      const key = [...match.entryIds].sort().join(':');
      if (seen.has(key)) repeats++;
      seen.add(key);
    }
  }

  check('cada ronda aparella tothom', complete, true);
  check('cap revanxa en tot el round robin', repeats, 0);
  check('les 15 parelles possibles s\'han jugat', seen.size, 15);
  check('ronda més enllà del calendari', bergerSchedule(ids, 6, false), null);
}

console.log('\n=== Berger amb nombre imparell ===');
{
  const ids = ['P1', 'P2', 'P3', 'P4', 'P5'];
  const byesPerRound = [];
  for (let round = 1; round <= 5; round++) {
    const matches = bergerSchedule(ids, round, false) ?? [];
    byesPerRound.push(matches.filter((m) => m.entryIds.length === 1).length);
  }
  check('exactament un bye per ronda', byesPerRound, [1, 1, 1, 1, 1]);
}

// ─── Sistema suís ─────────────────────────────────────────────────────────────

console.log('\n=== Sistema suís ===');
{
  const entrants = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map((id) => makeEntrant(id));
  const standings = entrants.map((e, i) => makeStanding(e.id, i + 1, 0));
  const result = generateSwissPairings(makeCtx(makePhase('swiss', SWISS_CONFIG), entrants, standings));

  check('3 taules amb 6 jugadors', result.matches.length, 3);
  check('tothom aparellat un sol cop', coversEveryone(result.matches, entrants.map((e) => e.id)), true);
  check('sense avisos', result.warnings.length, 0);
  check('taules numerades des d\'1', result.matches.map((m) => m.tableNumber).sort(), [1, 2, 3]);
}

console.log('\n=== Suís amb nombre imparell (bye) ===');
{
  const entrants = ['P1', 'P2', 'P3', 'P4', 'P5'].map((id) => makeEntrant(id));
  const standings = entrants.map((e, i) => makeStanding(e.id, i + 1, 0));
  const result = generateSwissPairings(makeCtx(makePhase('swiss', SWISS_CONFIG), entrants, standings));

  const byes = result.matches.filter((m) => m.entryIds.length === 1);
  check('hi ha un bye', byes.length, 1);
  check('el bye és per al darrer del sembrat', byes[0].entryIds, ['P5']);
  check('ningú es queda fora', coversEveryone(result.matches, entrants.map((e) => e.id)), true);
}

console.log('\n=== Suís amb revanxa inevitable ===');
{
  const entrants = ['P1', 'P2', 'P3', 'P4'].map((id) => makeEntrant(id));
  const standings = [
    makeStanding('P1', 1, 1), makeStanding('P2', 2, 1),
    makeStanding('P3', 3, 0), makeStanding('P4', 4, 0),
  ];
  // Tothom ha jugat contra tothom: qualsevol aparellament serà revanxa.
  const previous: PreviousMatch[] = [
    { roundNumber: 1, phaseId: 'phase1', entryIds: ['P1', 'P2'], ranks: [1, 2] },
    { roundNumber: 1, phaseId: 'phase1', entryIds: ['P3', 'P4'], ranks: [1, 2] },
    { roundNumber: 2, phaseId: 'phase1', entryIds: ['P1', 'P3'], ranks: [1, 2] },
    { roundNumber: 2, phaseId: 'phase1', entryIds: ['P2', 'P4'], ranks: [1, 2] },
    { roundNumber: 3, phaseId: 'phase1', entryIds: ['P1', 'P4'], ranks: [1, 2] },
    { roundNumber: 3, phaseId: 'phase1', entryIds: ['P2', 'P3'], ranks: [1, 2] },
  ];
  const result = generateSwissPairings(makeCtx(makePhase('swiss', SWISS_CONFIG), entrants, standings, previous));

  check('genera aparellaments igualment', result.matches.length, 2);
  check('i avisa de la revanxa', result.warnings[0]?.type, 'rematch_forced');
}

// ─── Rei del turó ─────────────────────────────────────────────────────────────

console.log('\n=== Rei del turó ===');
{
  const entrants = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map((id) => makeEntrant(id));
  const standings = [
    makeStanding('P1', 1, 5), makeStanding('P2', 2, 4), makeStanding('P3', 3, 3),
    makeStanding('P4', 4, 3), makeStanding('P5', 5, 2), makeStanding('P6', 6, 1),
  ];
  const config: KingOfTheHillConfig = { method: 'king_of_the_hill', topN: null, carryStandingsFromPhaseIds: [] };
  const result = generateKingOfTheHillPairings(makeCtx(makePhase('king_of_the_hill', config), entrants, standings));

  check('1r amb 2n, 3r amb 4t, 5è amb 6è', result.matches.map((m) => m.entryIds), [
    ['P1', 'P2'], ['P3', 'P4'], ['P5', 'P6'],
  ]);
}

// ─── Taules de més de dos (§12.2) ─────────────────────────────────────────────

console.log('\n=== Taules de quatre ===');
{
  const entrants = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'].map((id) => makeEntrant(id));
  const standings = entrants.map((e, i) => makeStanding(e.id, i + 1, 0));
  const config: RoundRobinConfig = { method: 'round_robin', scope: 'all', doubleRound: false };
  const result = generateRoundRobinPairings(makeCtx(makePhase('round_robin', config, 4), entrants, standings));

  check('8 jugadors → 2 taules de 4', result.matches.map((m) => m.entryIds.length), [4, 4]);
  check('tothom assegut un sol cop', coversEveryone(result.matches, entrants.map((e) => e.id)), true);
}

console.log('\n=== Taules de quatre amb residu ===');
{
  const entrants = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map((id) => makeEntrant(id));
  const standings = entrants.map((e, i) => makeStanding(e.id, i + 1, 0));
  const config: RoundRobinConfig = { method: 'round_robin', scope: 'all', doubleRound: false };
  const result = generateRoundRobinPairings(makeCtx(makePhase('round_robin', config, 4), entrants, standings));

  check('6 jugadors → una taula de 4 i una de 2', result.matches.map((m) => m.entryIds.length), [4, 2]);
  check('i avisa de la taula incompleta', result.warnings.some((w) => w.type === 'uneven_table'), true);
}

console.log('\n=== Els mètodes d\'1v1 no accepten taules grans ===');
{
  // El suís es basa en la proximitat de punts entre dos: amb quatre a taula
  // val més aturar-se que inventar-se un aparellament (§13.1 #8).
  check('round robin admet taules de 4', supportsTableSize('round_robin', 4), true);
  check('manual admet taules de 4', supportsTableSize('manual', 4), true);
  check('el suís no', supportsTableSize('swiss', 4), false);
  check('el suís FIDE tampoc', supportsTableSize('swiss_fide', 4), false);
  check('ni el rei del turó', supportsTableSize('king_of_the_hill', 4), false);
  check('tots admeten 1v1', ['swiss', 'swiss_fide', 'king_of_the_hill', 'round_robin', 'manual'].every((m) => supportsTableSize(m as never, 2)), true);
  check('i ho explica', tableSizeError('swiss', 4)?.includes('només funciona amb taules de dos'), true);
}

console.log(failed === 0 ? '\n✓ Tots els tests passen.\n' : `\n✗ ${failed} fallades.\n`);
process.exit(failed === 0 ? 0 : 1);
