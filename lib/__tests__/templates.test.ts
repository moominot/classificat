/**
 * Tests de les plantilles de campionat.
 * Executa amb: npx tsx lib/__tests__/templates.test.ts
 */

import { instantiateTemplate, positionEliminationPhases, templateFromTournament } from '../templates';
import type { TournamentSnapshot } from '../templates';
import type { RoundRobinConfig, SwissConfig, TemplatePhase } from '@/db/types';
import { DEFAULT_SCORING, DEFAULT_VISIBILITY } from '@/db/types';

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

const base: Omit<TemplatePhase, 'name' | 'config' | 'startRound' | 'endRound'> = {
  method: 'swiss',
  participantsPerMatch: 2,
  scoring: DEFAULT_SCORING,
  tiebreakers: ['spread'],
  standingsScope: ['global'],
  teamAggregation: null,
  standingsLive: false,
};

const swiss: SwissConfig = {
  method: 'swiss', avoidRematches: true, byeHandling: 'lowest_ranked', scoreGroupWindowSize: 1,
  carryStandingsFromPhaseIds: [], seedingCriteria: ['points'], scope: 'intra_tag', tagIds: ['tag-a'],
  entryExclusions: [{ mode: 'forbid', entryIds: ['e1', 'e2'] }],
};

const snapshot: TournamentSnapshot = {
  settings: { visibility: DEFAULT_VISIBILITY, presencePendingAs: 'present', askPresence: false },
  questions: [
    { key: 'score', type: 'value', scope: 'participant', label: 'Resultat', aggregate: 'sum', usableAsTiebreaker: true, showInRanking: false, order: 1, isBuiltin: true },
    { key: 'extra', type: 'value', scope: 'participant', label: 'Extra', aggregate: 'sum', usableAsTiebreaker: false, showInRanking: true, order: 2, isBuiltin: false },
  ],
  phases: [
    { ...base, id: 'p1', name: 'Classificatòria', config: swiss, startRound: 1, endRound: 3 },
    { ...base, id: 'p2', name: 'Final', config: { ...swiss, scope: 'all', tagIds: [], carryStandingsFromPhaseIds: ['p1'] }, startRound: 4, endRound: 5 },
  ],
  tags: [{ id: 'tag-a', name: 'Sub-16' }, { id: 'tag-b', name: 'Club Nord' }],
};

console.log('desar com a plantilla');
const template = templateFromTournament(snapshot);
check('etiquetes per nom, només les que fan servir les fases', template.tags, ['Sub-16']);
check('les fases hi són en ordre', template.phases.map((p) => p.name), ['Classificatòria', 'Final']);
check('tagIds per nom', (template.phases[0].config as SwissConfig).tagIds, ['Sub-16']);
check('fases arrossegades per índex', (template.phases[1].config as SwissConfig).carryStandingsFromPhaseIds, ['0']);
check('sense exclusions entre jugadors', (template.phases[0].config as SwissConfig).entryExclusions, []);
check('sense ids de fase', template.phases.some((p) => 'id' in p), false);
check('ajustos', template.settings.askPresence, false);

console.log('\ncrear des de plantilla');
let n = 0;
const created = instantiateTemplate(template, () => `nou-${++n}`);
const tagId = created.tags[0].id;
check('crea les etiquetes', created.tags.map((t) => t.name), ['Sub-16']);
check('tagIds amb els ids nous', (created.phases[0].config as SwissConfig).tagIds, [tagId]);
check('arrossega la fase nova', (created.phases[1].config as SwissConfig).carryStandingsFromPhaseIds, [created.phases[0].id]);
check('ordre 1..N', created.phases.map((p) => p.order), [1, 2]);
check('preguntes amb el seu isBuiltin', created.questions.map((q) => q.isBuiltin), [true, false]);
check(
  'una pregunta de perfil sense isBuiltin compta com de sèrie',
  instantiateTemplate({ ...template, questions: [{ ...template.questions[0], isBuiltin: undefined }] }, () => 'x').questions[0].isBuiltin,
  true
);

console.log('\neliminatòria per posicions');
const generated = positionEliminationPhases(8);
if ('error' in generated) {
  check('8 jugadors', generated.error, null);
} else {
  check('3 fases', generated.map((p) => p.name), ['Fase 1: grups de 8', 'Fase 2: grups de 4', 'Fase 3: parelles']);
  check('dues rondes cadascuna', generated.map((p) => [p.startRound, p.endRound]), [[1, 2], [3, 4], [5, 6]]);
  const configs = generated.map((p) => p.config as RoundRobinConfig);
  check('la primera de tothom, les altres per grups', configs.map((c) => c.scope), ['all', 'intra_tag', 'intra_tag']);
  check('sorteig, anada i tornada i partir', configs.every((c) => c.randomDraw && c.doubleRound && c.splitGroups), true);

  // Desar-la com a plantilla no hi ha de deixar els grups que posa el tancament.
  const amb = templateFromTournament({
    ...snapshot,
    phases: generated.map((p, i) => ({
      ...p, id: `g${i}`,
      config: i === 0 ? p.config : { ...p.config, tagIds: ['tag-b'], resultTagIds: ['tag-b'] } as RoundRobinConfig,
    })),
  });
  check('es desa com a generador, no com a fases fixes', [amb.phaseGenerator, amb.phases.length], ['position_elimination', 0]);
  check('amb la puntuació i els desempats de la primera fase', amb.generatorDefaults?.tiebreakers, ['spread', 'avg_score']);
  check('ni etiquetes', amb.tags, []);

  // Si s'hi afegeix una fase que no és d'eliminatòria, es desen les fases.
  const mixta = templateFromTournament({
    ...snapshot,
    phases: [
      ...generated.map((p, i) => ({ ...p, id: `g${i}`, config: i === 0 ? p.config : { ...p.config, tagIds: ['tag-b'], resultTagIds: ['tag-b'] } as RoundRobinConfig })),
      { ...base, id: 'extra', name: 'Extra', config: { ...swiss, scope: 'all', tagIds: [] }, startRound: 7, endRound: 7 },
    ],
  });
  check('mixta: fases fixes', mixta.phases.length, 4);
  check('sense els grups que posa el tancament', mixta.phases.slice(0, 3).map((p) => (p.config as RoundRobinConfig).tagIds), [[], [], []]);
  check('ni resultTagIds', mixta.phases.some((p) => 'resultTagIds' in p.config), false);
}
check('amb 6 jugadors no', 'error' in positionEliminationPhases(6), true);

if (failed > 0) {
  console.log(`\n${failed} prova(es) han fallat`);
  process.exit(1);
}
console.log('\nTotes les proves passen');
