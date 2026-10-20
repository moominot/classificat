import type { GameProfileQuestion, TemplateConfig } from './types';
import { DEFAULT_VISIBILITY } from './types';

/**
 * Plantilles de campionat de sèrie.
 *
 * Abans eren «perfils de joc», que només aportaven les preguntes: ara un
 * perfil és una plantilla sense fases. Es **copien** en crear una competició
 * (docs/pla-rols.md §13.1 #4), així que canviar-ne una no altera les
 * competicions ja creades. L'id és fix perquè el sembrat les pugui
 * actualitzar sense duplicar-les.
 */

const PROFILES: Array<{ id: string; name: string; config: { questions: GameProfileQuestion[] } }> = [
  {
    id: 'builtin:scrabble',
    name: 'Scrabble',
    config: {
      questions: [
        {
          key: 'score', type: 'value', scope: 'participant', label: 'Resultat',
          answerType: 'number', aggregate: 'sum', usableAsTiebreaker: true,
          showInRanking: false, order: 1,
        },
        {
          key: 'bingos', type: 'value', scope: 'participant', label: 'Bingos',
          answerType: 'number', aggregate: 'sum', usableAsTiebreaker: true,
          showInRanking: true, order: 2,
        },
        {
          key: 'best_word', type: 'wordvalue', scope: 'participant', label: 'Millor jugada',
          label1: 'Paraula', label2: 'Punts', aggregate: 'max', usableAsTiebreaker: true,
          showInRanking: true, order: 3,
        },
        {
          key: 'sheet_image', type: 'image', scope: 'match', label: 'Full de puntuació',
          aggregate: 'none', usableAsTiebreaker: false, showInRanking: false, order: 4,
        },
        {
          key: 'board_image', type: 'image', scope: 'match', label: 'Foto del tauler',
          aggregate: 'none', usableAsTiebreaker: false, showInRanking: false, order: 5,
        },
      ],
    },
  },
  {
    id: 'builtin:escacs',
    name: 'Escacs',
    config: {
      questions: [
        {
          key: 'score', type: 'value', scope: 'participant', label: 'Resultat',
          answerType: 'number', aggregate: 'sum', usableAsTiebreaker: false,
          showInRanking: false, order: 1,
        },
      ],
    },
  },
  {
    id: 'builtin:generic',
    name: 'Genèric',
    config: {
      questions: [
        {
          key: 'score', type: 'value', scope: 'participant', label: 'Puntuació',
          answerType: 'number', aggregate: 'sum', usableAsTiebreaker: true,
          showInRanking: true, order: 1,
        },
      ],
    },
  },
];

function plain(questions: GameProfileQuestion[]): TemplateConfig {
  return {
    version: 1,
    questions,
    settings: { visibility: DEFAULT_VISIBILITY, presencePendingAs: 'present', askPresence: true },
    tags: [],
    phases: [],
  };
}

/** La plantilla per defecte quan no se'n tria cap. */
export const DEFAULT_TEMPLATE_ID = 'builtin:scrabble';

export const BUILTIN_TEMPLATES: Array<{ id: string; name: string; config: TemplateConfig }> = [
  ...PROFILES.map((p) => ({ id: p.id, name: p.name, config: plain(p.config.questions) })),
  {
    // Les fases depenen del nombre de jugadors: es creen des de Fases.
    id: 'builtin:position-elimination',
    name: 'Eliminatòria per posicions (Scrabble)',
    config: {
      ...plain(PROFILES[0].config.questions),
      settings: { visibility: DEFAULT_VISIBILITY, presencePendingAs: 'present', askPresence: false },
      phaseGenerator: 'position_elimination',
    },
  },
];

