/**
 * Tests de l'eliminatòria per posicions (partir grups en tancar la fase).
 * Executa amb: npx tsx lib/__tests__/position-split.test.ts
 */

import { isPowerOfTwo, pairKey, rangeName, splitPhase } from '../position-split';
import type { SplitInput } from '../position-split';
import type { Match } from '../pairing/types';

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

let n = 0;
/** Partida amb puntuacions: [['A', 400], ['B', 350]]. Un sol participant = bye. */
function match(...scores: [string, number | null][]): Match {
  n++;
  return {
    id: `m${n}`,
    roundId: 'r',
    tableNumber: n,
    participants: scores.map(([entryId, score], seat) => ({
      id: `p${n}-${seat}`, entryId, seat, rank: 1, score, outcome: null, points: null, teamId: null,
    })),
  };
}

function input(partial: Partial<SplitInput>): SplitInput {
  return {
    groups: [],
    matches: [],
    activeIds: new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']),
    avgScore: new Map(),
    bingos: new Map(),
    decisions: {},
    ...partial,
  };
}

const names = (r: ReturnType<typeof splitPhase>) =>
  r.ok ? r.groups.map((g) => [g.top.name, g.top.entryIds, g.bottom.name, g.bottom.entryIds]) : r.unresolved;

console.log('auxiliars');
check('potències de 2', [1, 2, 3, 4, 6, 8, 32].map(isPowerOfTwo), [false, true, false, true, false, true, true]);
check('noms de rang', [rangeName(1, 16), rangeName(5, 5)], ['1-16', '5']);
check('clau de parella simètrica', pairKey('B', 'A') === pairKey('A', 'B'), true);

console.log('\nguanya qui suma més a les dues partides');
{
  // A guanya l'anada de 10 i perd la tornada de 40: la suma és per a B.
  const r = splitPhase(input({
    groups: [{ tagId: 't', memberIds: ['A', 'B', 'C', 'D'] }],
    matches: [match(['A', 400], ['B', 390]), match(['B', 420], ['A', 380]), match(['C', 300], ['D', 500]), match(['D', 300], ['C', 350])],
  }));
  check('meitats', names(r), [['1-2', ['B', 'D'], '3-4', ['A', 'C']]]);
}

console.log('\nposicions contínues entre grups');
{
  const r = splitPhase(input({
    groups: [{ tagId: 'dalt', memberIds: ['A', 'B'] }, { tagId: 'baix', memberIds: ['C', 'D'] }],
    matches: [match(['A', 400], ['B', 300]), match(['B', 400], ['A', 350]), match(['C', 300], ['D', 310]), match(['D', 300], ['C', 305])],
  }));
  check('1, 2, 3, 4', names(r), [['1', ['A'], '2', ['B']], ['3', ['D'], '4', ['C']]]);
}

console.log('\nempat en el global');
{
  const empat = [match(['A', 400], ['B', 350]), match(['B', 400], ['A', 350])];
  const groups = [{ tagId: 't', memberIds: ['A', 'B'] }];
  check('desempata la mitjana del campionat', names(splitPhase(input({ groups, matches: empat, avgScore: new Map([['A', 380], ['B', 390]]) }))),
    [['1', ['B'], '2', ['A']]]);
  check('després, els bingos', names(splitPhase(input({ groups, matches: empat, bingos: new Map([['A', 3], ['B', 1]]) }))),
    [['1', ['A'], '2', ['B']]]);
  const r = splitPhase(input({ groups, matches: empat }));
  check("si tot empata, ho ha de decidir l'admin", r.ok ? null : r.unresolved.map((u) => [u.key, u.totals]), [[pairKey('A', 'B'), [750, 750]]]);
  check("i amb la decisió, passa", names(splitPhase(input({ groups, matches: empat, decisions: { [pairKey('A', 'B')]: 'B' } }))),
    [['1', ['B'], '2', ['A']]]);
}

console.log('\nabandonaments');
{
  // D ha abandonat abans de la fase: C ha fet bye a les dues partides.
  const r = splitPhase(input({
    groups: [{ tagId: 't', memberIds: ['A', 'B', 'C', 'D'] }],
    matches: [match(['A', 400], ['B', 300]), match(['B', 400], ['A', 350]), match(['C', null]), match(['C', null])],
    activeIds: new Set(['A', 'B', 'C']),
  }));
  check('el del bye puja i qui ha abandonat baixa', names(r), [['1-2', ['A', 'C'], '3-4', ['B', 'D']]]);
}
{
  // B guanya l'anada però abandona: la tornada és bye per a A.
  const r = splitPhase(input({
    groups: [{ tagId: 't', memberIds: ['A', 'B'] }],
    matches: [match(['A', 300], ['B', 450]), match(['A', null])],
    activeIds: new Set(['A']),
  }));
  check("qui abandona perd l'eliminatòria", names(r), [['1', ['A'], '2', ['B']]]);
}
{
  // Dos abandonaments al mateix grup: el perdedor d'una partida jugada va davant.
  const r = splitPhase(input({
    groups: [{ tagId: 't', memberIds: ['A', 'B', 'C', 'D'] }],
    matches: [match(['A', 400], ['B', 300]), match(['B', 300], ['A', 400])],
    activeIds: new Set(['A', 'B']),
  }));
  check('les meitats queden igualades', names(r), [['1-2', ['A', 'B'], '3-4', ['C', 'D']]]);
}

console.log('\nfase sense etiquetes');
{
  const r = splitPhase(input({
    groups: [{ tagId: null, memberIds: ['A', 'B'] }],
    matches: [match(['A', 300], ['B', 400]), match(['B', 300], ['A', 350])],
  }));
  check('un sol grup de tothom', r.ok ? r.groups.map((g) => g.tagId) : r, [null]);
}

if (failed > 0) {
  console.log(`\n${failed} prova(es) han fallat`);
  process.exit(1);
}
console.log('\nTotes les proves passen');
