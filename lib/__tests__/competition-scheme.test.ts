/**
 * Tests de l'esquema de la competició.
 * Executa amb: npx tsx lib/__tests__/competition-scheme.test.ts
 */

import { ancestorsOf, bracketTree, buildScheme, currentRange, nextPowerOfTwo, pathFor } from '../competition-scheme';
import type { SchemePhase } from '../competition-scheme';
import type { RoundRobinConfig, SwissConfig } from '@/db/types';

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

const split: RoundRobinConfig = {
  method: 'round_robin', scope: 'all', tagIds: [], doubleRound: true, tagExclusions: [], randomDraw: true, splitGroups: true,
};
const swiss: SwissConfig = {
  method: 'swiss', avoidRematches: true, byeHandling: 'lowest_ranked', scoreGroupWindowSize: 1,
  carryStandingsFromPhaseIds: [], seedingCriteria: ['points'], scope: 'all', tagIds: [], entryExclusions: [],
};
const phase = (id: string, config: SwissConfig | RoundRobinConfig, isComplete = false, start = 1): SchemePhase => ({
  id, name: id, startRound: start, endRound: start + 1, config, isComplete,
});

console.log('buildScheme');
{
  const steps = buildScheme({
    phases: [phase('lliga', swiss, true), phase('e1', split, true), phase('e2', split), phase('e3', split)],
    activePlayers: 8,
    registrationOpen: false,
    positionEliminationPlanned: false,
  });
  check('inscripció, lliga, quadre i final', steps.map((s) => s.kind), ['registration', 'phase', 'bracket', 'final']);
  const bracket = steps[2];
  check('el quadre agrupa les fases d\'eliminatòria', bracket.kind === 'bracket' ? bracket.phases.map((p) => p.id) : null, ['e1', 'e2', 'e3']);
  check('8 jugadors', bracket.kind === 'bracket' ? bracket.playerCount : null, 8);
  check('la fase en curs és la segona del quadre', bracket.kind === 'bracket' ? bracket.currentLevel : null, 1);
  check('la lliga ja no és la fase en curs', steps[1].kind === 'phase' ? steps[1].current : null, false);
}
{
  const steps = buildScheme({ phases: [], activePlayers: 6, registrationOpen: true, positionEliminationPlanned: true });
  check('sense fases: quadre orientatiu', steps.map((s) => s.kind), ['registration', 'bracket', 'final']);
  check('amb la potència de 2 de sobre', steps[1].kind === 'bracket' ? [steps[1].playerCount, steps[1].provisional] : null, [8, true]);
  check('avisa que no quadra', steps[0].kind === 'registration' ? steps[0].requirement !== null : null, true);
}
{
  const steps = buildScheme({ phases: [phase('lliga', swiss)], activePlayers: 6, registrationOpen: false, positionEliminationPlanned: false });
  check('sense quadre no hi ha requisit', steps[0].kind === 'registration' ? steps[0].requirement : 'x', null);
}

console.log('\nquadre');
{
  const { levels, edges } = bracketTree(8);
  check('nivells', levels.map((l) => l.map((n) => n.name)), [['1-8'], ['1-4', '5-8'], ['1-2', '3-4', '5-6', '7-8'], ['1', '2', '3', '4', '5', '6', '7', '8']]);
  check('dues arestes per grup', edges.length, 14);
  check('guanya a dalt, perd a baix', edges.slice(0, 2).map((e) => [e.child.name, e.kind]), [['1-4', 'win'], ['5-8', 'loss']]);
}

console.log('\ncamins');
check('guanyar-ho tot', pathFor(8, [true, true, true]).map((r) => [r.from, r.to]), [[1, 8], [1, 4], [1, 2], [1, 1]]);
check('perdre la primera i guanyar la resta', pathFor(8, [false, true, true]).at(-1), { from: 5, to: 5 });
check('a mig camí', pathFor(16, [true, false]).at(-1), { from: 5, to: 8 });
check('grup actual per etiqueta', currentRange(16, ['Club Nord', '1-8', '5-8']), { from: 5, to: 8 });
check('un rang mal alineat no és del quadre', currentRange(16, ['3-6']), null);
check('posició final', currentRange(8, ['3']), { from: 3, to: 3 });
check('grups pels quals ha passat', ancestorsOf(16, { from: 5, to: 8 }), [{ from: 1, to: 16 }, { from: 1, to: 8 }, { from: 5, to: 8 }]);
check('potència de 2 de sobre', [nextPowerOfTwo(4), nextPowerOfTwo(5), nextPowerOfTwo(20)], [4, 8, 32]);

if (failed > 0) {
  console.log(`\n${failed} prova(es) han fallat`);
  process.exit(1);
}
console.log('\nTotes les proves passen');
