export interface BuiltinQuestionDef {
  key: 'score' | 'bingos' | 'best_word' | 'sheet_image' | 'board_image';
  type: 'value' | 'wordvalue' | 'image';
  scope: 'match' | 'player';
  label: string;
  label1?: string;
  label2?: string;
  answerType?: 'text' | 'number';
  showInRanking: boolean;
  order: number;
}

/**
 * Les 5 preguntes "de sèrie" — alimenten columnes fixes de `pairings` i el
 * motor d'aparellaments/classificacions, per això el director en pot editar
 * l'etiqueta/ordre/rànquing però no el tipus ni l'àmbit (vegeu AGENTS del
 * formulari de resultats).
 */
export const BUILTIN_QUESTIONS: BuiltinQuestionDef[] = [
  { key: 'score',       type: 'value',     scope: 'player', label: 'Resultat',      answerType: 'number', showInRanking: false, order: 1 },
  { key: 'bingos',      type: 'value',     scope: 'player', label: 'Bingos',        answerType: 'number', showInRanking: true,  order: 2 },
  { key: 'best_word',   type: 'wordvalue', scope: 'player', label: 'Millor jugada', label1: 'Paraula', label2: 'Punts', showInRanking: true, order: 3 },
  { key: 'sheet_image', type: 'image',     scope: 'match',  label: 'Full de puntuació', showInRanking: false, order: 4 },
  { key: 'board_image', type: 'image',     scope: 'match',  label: 'Foto del tauler',   showInRanking: false, order: 5 },
];
