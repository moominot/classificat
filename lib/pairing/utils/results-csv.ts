import type { AnswerType, QuestionScope, QuestionType } from '@/db/types';

/**
 * CSV de resultats, en format ample: una fila per partida (no per
 * participant), amb columnes fixes per jugador — `idPartida`, `timestamp`,
 * `Ronda`, i després un bloc "Jugador N" repetit per cada seient de la
 * taula (nom, idBARRUF, punts, preguntes pròpies), seguit de les preguntes
 * comunes de la partida. El nombre de blocs ve de `participantsPerMatch`
 * de la fase, no del nombre real de participants de cada taula concreta:
 * així la capçalera és estable per a tota la ronda encara que alguna
 * taula tingui un bye o estigui incompleta (es deixa en blanc).
 *
 * Exportació i importació comparteixen aquesta mateixa generació de
 * columnes perquè sempre vagin alineades per posició, no per contingut de
 * la capçalera (els noms de pregunta són text lliure i no es poden fer
 * servir com a clau fiable).
 */

export interface ResultsCsvQuestion {
  id: string;
  key: string;
  type: QuestionType;
  scope: QuestionScope;
  label: string;
  label1: string | null;
  label2: string | null;
  answerType: AnswerType | null;
}

type AnswerPart = 'text' | 'number' | 'image';

type ColumnField =
  | 'idPartida'
  | 'timestamp'
  | 'ronda'
  | 'jugadorNom'
  | 'idBarruf'
  | 'score'
  | { questionId: string; part: AnswerPart };

export interface ResultsCsvColumn {
  header: string;
  /** null = columna fixa (idPartida/timestamp/Ronda) o pregunta comuna de partida. */
  seatIndex: number | null;
  field: ColumnField;
}

export interface AnswerValue {
  questionId: string;
  textValue: string | null;
  numberValue: number | null;
  imageUrl: string | null;
}

export interface SeatData {
  entryId: string;
  name: string;
  barrufNumero: number | null;
  score: number | null;
  answers: AnswerValue[];
}

export interface ResultsCsvRowData {
  matchId: string;
  timestamp: string;
  roundNumber: number;
  /** Un element per seient (0-indexat); null = sense participant (bye o taula incompleta). */
  seats: Array<SeatData | null>;
  common: AnswerValue[];
}

export function buildResultsCsvColumns(
  questions: ResultsCsvQuestion[],
  maxParticipants: number
): ResultsCsvColumn[] {
  const participantQuestions = questions.filter((q) => q.scope === 'participant' && q.key !== 'score');
  const matchQuestions = questions.filter((q) => q.scope === 'match');

  const columns: ResultsCsvColumn[] = [
    { header: 'idPartida', seatIndex: null, field: 'idPartida' },
    { header: 'timestamp', seatIndex: null, field: 'timestamp' },
    { header: 'Ronda', seatIndex: null, field: 'ronda' },
  ];

  for (let seat = 0; seat < maxParticipants; seat++) {
    const n = seat + 1;
    columns.push({ header: `Jugador ${n}`, seatIndex: seat, field: 'jugadorNom' });
    columns.push({ header: `idBARRUF jug${n}`, seatIndex: seat, field: 'idBarruf' });
    columns.push({ header: `Punts jug${n}`, seatIndex: seat, field: 'score' });
    for (const q of participantQuestions) {
      columns.push(...questionColumns(q, `jug${n}`, seat));
    }
  }

  for (const q of matchQuestions) {
    columns.push(...questionColumns(q, null, null));
  }

  return columns;
}

function questionColumns(
  q: ResultsCsvQuestion,
  suffix: string | null,
  seatIndex: number | null
): ResultsCsvColumn[] {
  const withSuffix = (label: string) => (suffix ? `${label} ${suffix}` : label);

  if (q.type === 'wordvalue') {
    // Prefixat amb l'etiqueta de la pregunta perquè "Punts" (label2 habitual)
    // no col·lideixi amb la columna fixa "Punts jugN" de la puntuació.
    return [
      { header: withSuffix(`${q.label} - ${q.label1 ?? 'Text'}`), seatIndex, field: { questionId: q.id, part: 'text' } },
      { header: withSuffix(`${q.label} - ${q.label2 ?? 'Valor'}`), seatIndex, field: { questionId: q.id, part: 'number' } },
    ];
  }
  if (q.type === 'image') {
    return [{ header: withSuffix(q.label), seatIndex, field: { questionId: q.id, part: 'image' } }];
  }
  return [
    {
      header: withSuffix(q.label),
      seatIndex,
      field: { questionId: q.id, part: q.answerType === 'number' ? 'number' : 'text' },
    },
  ];
}

function answerValue(answers: AnswerValue[], questionId: string): AnswerValue | undefined {
  return answers.find((a) => a.questionId === questionId);
}

/** Valors (sense escapar) d'una fila, en el mateix ordre que `columns`. */
export function buildResultsCsvRow(columns: ResultsCsvColumn[], data: ResultsCsvRowData): string[] {
  return columns.map((col) => {
    if (col.field === 'idPartida') return data.matchId;
    if (col.field === 'timestamp') return data.timestamp;
    if (col.field === 'ronda') return String(data.roundNumber);

    const seat = col.seatIndex !== null ? data.seats[col.seatIndex] : null;

    if (col.field === 'jugadorNom') return seat?.name ?? '';
    if (col.field === 'idBarruf') return seat?.barrufNumero != null ? String(seat.barrufNumero) : '';
    if (col.field === 'score') return seat?.score != null ? String(seat.score) : '';

    const answers = col.seatIndex !== null ? (seat?.answers ?? []) : data.common;
    const ans = answerValue(answers, col.field.questionId);
    if (!ans) return '';
    if (col.field.part === 'text') return ans.textValue ?? '';
    if (col.field.part === 'number') return ans.numberValue != null ? String(ans.numberValue) : '';
    return ans.imageUrl ?? '';
  });
}

export interface ParsedResultsCsvRow {
  matchId: string;
  /** Només informatiu: no s'usa per decidir res en importar. */
  roundNumber: number | null;
  /** Un element per seient; null = cap dada per a aquest seient (bye). */
  perSeat: Array<{ score: number | null; answers: AnswerValue[] } | null>;
  common: AnswerValue[];
}

/** Interpreta una fila de valors (ja partida per columnes) segons `columns`. */
export function parseResultsCsvRow(columns: ResultsCsvColumn[], values: string[]): ParsedResultsCsvRow {
  let matchId = '';
  let roundNumber: number | null = null;
  const seatNames: Array<string | null> = [];
  const seatScores: Array<number | null> = [];
  const seatAnswers: Map<string, AnswerValue>[] = [];
  const commonAnswers = new Map<string, AnswerValue>();

  function ensureSeat(i: number) {
    while (seatNames.length <= i) {
      seatNames.push(null);
      seatScores.push(null);
      seatAnswers.push(new Map());
    }
  }

  function setAnswerPart(map: Map<string, AnswerValue>, questionId: string, part: AnswerPart, raw: string) {
    const entry = map.get(questionId) ?? { questionId, textValue: null, numberValue: null, imageUrl: null };
    if (part === 'text') entry.textValue = raw || null;
    else if (part === 'number') entry.numberValue = raw ? Number(raw) : null;
    else entry.imageUrl = raw || null;
    map.set(questionId, entry);
  }

  columns.forEach((col, i) => {
    const raw = (values[i] ?? '').trim();

    if (col.field === 'idPartida') { matchId = raw; return; }
    if (col.field === 'timestamp') return; // informatiu, mai s'importa
    if (col.field === 'ronda') { roundNumber = raw ? parseInt(raw, 10) : null; return; }

    if (col.seatIndex === null) {
      if (typeof col.field !== 'string') setAnswerPart(commonAnswers, col.field.questionId, col.field.part, raw);
      return;
    }

    ensureSeat(col.seatIndex);
    if (col.field === 'jugadorNom') { seatNames[col.seatIndex] = raw || null; return; }
    if (col.field === 'idBarruf') return; // informatiu, mai s'importa
    if (col.field === 'score') { seatScores[col.seatIndex] = raw ? Number(raw) : null; return; }
    setAnswerPart(seatAnswers[col.seatIndex], col.field.questionId, col.field.part, raw);
  });

  const perSeat = seatNames.map((name, i) => {
    const answers = [...seatAnswers[i].values()];
    if (name === null && seatScores[i] == null && answers.length === 0) return null;
    return { score: seatScores[i], answers };
  });

  return { matchId, roundNumber, perSeat, common: [...commonAnswers.values()] };
}

/** Línia CSV, amb cometes només on calen. */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value == null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Parser de línia CSV amb camps entre cometes (admet comes i salts de línia escapats). */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      let val = '';
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else { val += line[i++]; }
      }
      result.push(val);
      if (line[i] === ',') i++;
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) { result.push(line.slice(i)); break; }
      result.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return result;
}
