/**
 * Tests dels grups de classificació apilats.
 * Executa amb: npx tsx lib/__tests__/tag-groups.test.ts
 */

import { nextGroupOrder, stackByGroups } from '../tag-groups';
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

const tags: Tag[] = [
  { id: 'baix', name: '3-4', kind: 'group', order: 2 },
  { id: 'club', name: 'Club Nord', kind: 'label', order: 0 },
  { id: 'dalt', name: '1-2', kind: 'group', order: 1 },
];

const row = (entryId: string, rank: number, tagIds: string[]) => ({ entryId, rank, tagIds });

console.log('stackByGroups');
{
  // Classificació global: C va primer per punts, però és al grup de baix.
  const blocks = stackByGroups(
    [row('C', 1, ['baix']), row('A', 2, ['dalt', 'club']), row('D', 3, ['baix']), row('B', 4, ['dalt'])],
    tags
  );
  check('ordre dels grups', blocks.map((b) => b.tag?.name), ['1-2', '3-4']);
  check(
    'posicions contínues',
    blocks.map((b) => b.rows.map((r) => `${r.entryId}${r.rank}`)),
    [['A1', 'B2'], ['C3', 'D4']]
  );
}
{
  const blocks = stackByGroups([row('A', 1, ['dalt']), row('B', 1, ['dalt']), row('C', 3, ['dalt'])], tags);
  check('els empats comparteixen posició', blocks[0].rows.map((r) => r.rank), [1, 1, 3]);
}
{
  const blocks = stackByGroups([row('A', 1, []), row('B', 2, ['baix'])], tags);
  check('sense grup, al final', blocks.map((b) => b.tag?.name ?? null), ['3-4', null]);
  check('sense grup continua la numeració', blocks[1].rows[0].rank, 2);
}
{
  const blocks = stackByGroups([row('A', 1, ['baix', 'dalt'])], tags);
  check('amb dos grups, al primer', blocks[0].tag?.id, 'dalt');
}
{
  check('cap grup buit', stackByGroups([row('A', 1, ['dalt'])], tags).length, 1);
}

console.log('nextGroupOrder');
check('primer grup', nextGroupOrder([{ kind: 'label', order: 0 }]), 1);
check('després del darrer', nextGroupOrder([{ kind: 'group', order: 1 }, { kind: 'group', order: 4 }]), 5);

if (failed > 0) {
  console.log(`\n${failed} prova(es) han fallat`);
  process.exit(1);
}
console.log('\nTotes les proves passen');
