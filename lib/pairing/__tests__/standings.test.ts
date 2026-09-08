/**
 * Tests de puntuació i classificació.
 * Executa amb: npx tsx lib/pairing/__tests__/standings.test.ts
 */

import { deriveOutcome, distributePoints, scoreMatch } from '../scoring';
import { computeStandings, computeTeamStandings } from '../standings';
import type { ScoredMatch } from '../standings';
import type { Outcome } from '../types';
import type { ScoringConfig } from '@/db/types';

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

const SCRABBLE: ScoringConfig = { positionPoints: [1, 0], trailingPoints: 0, byePoints: 1, forfeitPoints: 0 };
const FOUR: ScoringConfig = { positionPoints: [3, 2, 1, 0], trailingPoints: 0, byePoints: 3, forfeitPoints: 0 };

type P = [entryId: string, rank: number, score: number, outcome: Outcome, teamId?: string];

function makeMatch(id: string, parts: P[], scoring: ScoringConfig): ScoredMatch {
  return {
    id,
    roundId: 'r1',
    tableNumber: 1,
    scoring,
    participants: parts.map(([entryId, rank, score, outcome, teamId], i) => ({
      id: `${id}-${i}`,
      entryId,
      seat: i,
      rank,
      score,
      outcome,
      points: null,
      teamId: teamId ?? null,
    })),
  };
}

// ─── Repartiment de punts per posició (§12.10) ────────────────────────────────

console.log('\n=== Punts per posició ===');
check('1v1 sense empat', distributePoints([1, 2], SCRABBLE), [1, 0]);
check('1v1 empat', distributePoints([1, 1], SCRABBLE), [0.5, 0.5]);
check('4 jugadors sense empat', distributePoints([1, 2, 3, 4], FOUR), [3, 2, 1, 0]);
// Els empatats es reparteixen els punts de les posicions que ocupen: (2+1)/2.
check('4 jugadors, empat a 2n', distributePoints([1, 2, 2, 4], FOUR), [3, 1.5, 1.5, 0]);
check('4 jugadors, triple empat a 1r', distributePoints([1, 1, 1, 4], FOUR), [2, 2, 2, 0]);
check(
  'el total repartit no depèn dels empats',
  distributePoints([1, 2, 2, 4], FOUR).reduce((a, b) => a + b, 0),
  6
);

// ─── Resultat derivat de la posició ───────────────────────────────────────────

console.log('\n=== Outcome derivat ===');
check('1v1 guanyador', deriveOutcome(1, [1, 2]), 'win');
check('1v1 empat', deriveOutcome(1, [1, 1]), 'draw');
check('4 jugadors, empat a 2n no és empat', deriveOutcome(2, [1, 2, 2, 4]), 'loss');
check('bye', deriveOutcome(1, [1]), 'bye');
check('sense resultat', deriveOutcome(null, [null, null]), null);

console.log('\n=== scoreMatch ===');
check(
  'deriva posicions de les puntuacions',
  scoreMatch([{ entryId: 'a', score: 412 }, { entryId: 'b', score: 378 }], SCRABBLE)
    .map((p) => [p.entryId, p.rank, p.outcome, p.points]),
  [['a', 1, 'win', 1], ['b', 2, 'loss', 0]]
);
check(
  'sense totes les puntuacions, no hi ha resultat',
  scoreMatch([{ entryId: 'a', score: 412 }, { entryId: 'b', score: null }], SCRABBLE)
    .map((p) => p.rank),
  [null, null]
);

// ─── Spread amb N participants (§12.11) ───────────────────────────────────────

console.log('\n=== Spread ===');
const s1v1 = computeStandings({
  entryIds: ['a', 'b'],
  tiebreakers: ['spread'],
  matches: [makeMatch('m1', [['a', 1, 412, 'win'], ['b', 2, 378, 'loss']], SCRABBLE)],
});
check("a l'1v1 és la resta de sempre", s1v1.map((s) => [s.entryId, s.metrics.spread]), [['a', 34], ['b', -34]]);

const s4 = computeStandings({
  entryIds: ['a', 'b', 'c', 'd'],
  tiebreakers: ['spread'],
  matches: [
    makeMatch('m2', [['a', 1, 450, 'win'], ['b', 2, 400, 'loss'], ['c', 3, 380, 'loss'], ['d', 4, 370, 'loss']], FOUR),
  ],
});
const spreads = s4.map((s) => s.metrics.spread);
// 450 - (400+380+370)/3 = 450 - 383,33
check('amb 4 jugadors, contra la mitjana dels altres', Math.round(spreads[0] * 100) / 100, 66.67);
check('els spreads d\'una taula sumen zero', Math.abs(spreads.reduce((a, b) => a + b, 0)) < 1e-9, true);
check('punts de la taula de 4', s4.map((s) => [s.entryId, s.points]), [['a', 3], ['b', 2], ['c', 1], ['d', 0]]);

// ─── Desempats ────────────────────────────────────────────────────────────────

console.log('\n=== Desempats ===');
const tied = computeStandings({
  entryIds: ['a', 'b'],
  tiebreakers: ['spread'],
  matches: [
    makeMatch('m3', [['a', 1, 500, 'win'], ['x', 2, 300, 'loss']], SCRABBLE),
    makeMatch('m4', [['b', 1, 400, 'win'], ['y', 2, 390, 'loss']], SCRABBLE),
  ],
});
check('mateixos punts, desempata l\'spread', tied.map((s) => [s.entryId, s.rank]), [['a', 1], ['b', 2]]);

const byQuestion = computeStandings({
  entryIds: ['a', 'b'],
  tiebreakers: ['metric:bingos'],
  matches: [
    makeMatch('m5', [['a', 1, 400, 'win'], ['x', 2, 300, 'loss']], SCRABBLE),
    makeMatch('m6', [['b', 1, 400, 'win'], ['y', 2, 300, 'loss']], SCRABBLE),
  ],
  questionMetrics: [{ key: 'bingos', aggregate: 'sum' }],
  answers: [
    { entryId: 'a', key: 'bingos', value: 2 },
    { entryId: 'b', key: 'bingos', value: 5 },
  ],
});
// Una pregunta amb agregació esdevé desempat sense tocar codi (§12.1).
check('desempat per una mètrica de pregunta', byQuestion.map((s) => [s.entryId, s.rank]), [['b', 1], ['a', 2]]);

// ─── Classificació d'equips (§12.9) ───────────────────────────────────────────

console.log('\n=== Equips ===');
const teamMatches = [
  makeMatch('t1', [['a', 1, 450, 'win', 'EQ1'], ['b', 2, 400, 'loss', 'EQ2']], SCRABBLE),
  makeMatch('t2', [['c', 1, 430, 'win', 'EQ1'], ['d', 2, 410, 'loss', 'EQ2']], SCRABBLE),
  makeMatch('t3', [['e', 1, 420, 'win', 'EQ2'], ['f', 2, 400, 'loss', 'EQ1']], SCRABBLE),
];
const individual = computeStandings({
  entryIds: ['a', 'b', 'c', 'd', 'e', 'f'],
  tiebreakers: [],
  matches: teamMatches,
});
check(
  'suma dels membres',
  computeTeamStandings({ matches: teamMatches, aggregation: { rule: 'sum' }, standings: individual })
    .map((t) => [t.teamId, t.points]),
  [['EQ1', 2], ['EQ2', 1]]
);
check(
  'només compta el millor membre (top_n = 1)',
  computeTeamStandings({ matches: teamMatches, aggregation: { rule: 'top_n', n: 1 }, standings: individual })
    .map((t) => [t.teamId, t.points, t.countedEntryIds.length]),
  [['EQ1', 1, 1], ['EQ2', 1, 1]]
);

console.log(failed === 0 ? '\n✓ Tots els tests passen.\n' : `\n✗ ${failed} fallades.\n`);
process.exit(failed === 0 ? 0 : 1);
