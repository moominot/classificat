import type { GameProfileConfig } from './types';
import { DEFAULT_SCORING } from './types';

/**
 * Perfils de joc "de sèrie".
 *
 * Són plantilles: en crear una competició, la configuració es **copia** i
 * després es pot ajustar lliurement (docs/pla-rols.md §13.1 #4). Per això
 * canviar un perfil no altera les competicions ja creades.
 */
export const BUILTIN_GAME_PROFILES: Array<{ name: string; config: GameProfileConfig }> = [
  {
    name: 'Scrabble',
    config: {
      scoring: DEFAULT_SCORING,
      tiebreakers: ['spread', 'wins', 'buchholz'],
      participantsPerMatch: 2,
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
    name: 'Escacs',
    config: {
      scoring: DEFAULT_SCORING,
      tiebreakers: ['buchholz', 'median_buchholz', 'berger', 'wins'],
      participantsPerMatch: 2,
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
    name: 'Genèric',
    config: {
      scoring: DEFAULT_SCORING,
      tiebreakers: ['wins'],
      participantsPerMatch: 2,
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
