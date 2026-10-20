/**
 * Tests de la classificació apilada per grups.
 * Executa amb: npx tsx lib/__tests__/tag-groups.test.ts
 */

import { phaseGroupTagIds, sortGroupTags, stackByGroups } from '../tag-groups';
import type { Tag } from '../pairing/types';

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

const dalt: Tag = { id: 'dalt', name: '1-2' };
const baix: Tag = { id: 'baix', name: '3-4' };
const row = (entryId: string, rank: number, tagIds: string[]) => ({ entryId, rank, tagIds });

console.log('stackByGroups');
{
  // Classificació global: C va primer per punts, però és al grup de baix.
  const blocks = stackByGroups(
    [row('C', 1, ['baix']), row('A', 2, ['dalt', 'club']), row('D', 3, ['baix']), row('B', 4, ['dalt'])],
    [dalt, baix]
  );
  check('ordre dels grups', blocks.map((b) => b.tag?.name), ['1-2', '3-4']);
  check(
    'posicions contínues',
    blocks.map((b) => b.rows.map((r) => `${r.entryId}${r.rank}`)),
    [['A1', 'B2'], ['C3', 'D4']]
  );
}
{
  const blocks = stackByGroups([row('A', 1, ['dalt']), row('B', 1, ['dalt']), row('C', 3, ['dalt'])], [dalt]);
  check('els empats comparteixen posició', blocks[0].rows.map((r) => r.rank), [1, 1, 3]);
}
{
  const blocks = stackByGroups([row('A', 1, []), row('B', 2, ['baix'])], [dalt, baix]);
  check('sense grup, al final', blocks.map((b) => b.tag?.name ?? null), ['3-4', null]);
  check('sense grup continua la numeració', blocks[1].rows[0].rank, 2);
}
{
  const blocks = stackByGroups([row('A', 1, ['baix', 'dalt'])], [dalt, baix]);
  check('amb dos grups, al primer', blocks[0].tag?.id, 'dalt');
}
{
  check('cap grup buit', stackByGroups([row('A', 1, ['dalt'])], [dalt, baix]).length, 1);
}

console.log('sortGroupTags');
check(
  'ordre natural',
  sortGroupTags(['17-24', '9-16', '25-32', '1-8'].map((name) => ({ id: name, name }))).map((t) => t.name),
  ['1-8', '9-16', '17-24', '25-32']
);

console.log('phaseGroupTagIds');
const swiss = {
  method: 'swiss' as const, avoidRematches: true, byeHandling: 'lowest_ranked' as const, scoreGroupWindowSize: 1,
  carryStandingsFromPhaseIds: [], seedingCriteria: [], entryExclusions: [],
};
check('global: cap grup', phaseGroupTagIds({ ...swiss, scope: 'all', tagIds: ['x'] }), []);
check('per etiqueta: les de la fase', phaseGroupTagIds({ ...swiss, scope: 'intra_tag', tagIds: ['x', 'y'] }), ['x', 'y']);
check('manual: cap grup', phaseGroupTagIds({ method: 'manual', allowCsvImport: true }), []);

if (failed > 0) {
  console.log(`\n${failed} prova(es) han fallat`);
  process.exit(1);
}
console.log('\nTotes les proves passen');
