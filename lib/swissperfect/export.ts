import type { SpTournament } from './parse';

/** Columnes del full de resultats de partides, en ordre. */
export const RESULT_COLUMNS = [
  'Ronda', 'Jugador1', 'Jugador2', 'idJug1', 'idJug2', 'ID', 'Puntuacio_1', 'Puntuacio_2',
  'Mot_1', 'Puntsmot_1', 'Scrabbles_1', 'Mot_2', 'Puntsmot_2', 'Scrabbles_2',
  'Lletra_1', 'Punts_lletra_1', 'Lletra_2', 'Punts_lletra_2',
  'Comentaris', 'Full', 'Tauler', 'Suma_punts', 'Data', 'Punts_1', 'Punts_2',
  'Estat', 'Nova', 'Pos_Conjunta', 'Taula',
] as const;

const BYE_COMMENT = 'Victòria automàtica que no afecta a les mitjanes';

/** Punts de classificació amb coma decimal: 1, 0 o 0,5. */
const points = (matchPoints: number) => String(matchPoints / 2).replace('.', ',');

/** Camp de TSV: sense tabuladors ni salts de línia que trencarien la fila. */
const cell = (v: string | number) => String(v).replace(/[\t\r\n]+/g, ' ');

/**
 * Exporta els resultats d'un campionat de SwissPerfect al full de resultats de
 * partides (TSV, una fila per partida, bye inclòs).
 *
 * Es poden omplir: ronda, jugadors, puntuacions, suma, punts de partida,
 * estat de la ronda, taula i posició conjunta (ranquing de la suma de punts
 * entre totes les partides jugades, amb els empats a la mateixa posició).
 * SwissPerfect no té paraules, bingos, lletres, fotos ni data: queden buits.
 * `ID` no existeix a l'origen: és `ronda × 1000 + taula`, únic i estable.
 */
export function exportResultsTsv(sp: SpTournament): string {
  const name = (id: number) => {
    const p = sp.players.find((x) => x.id === id);
    return p ? `${p.firstName} ${p.surname}`.trim() : `Jugador ${id}`;
  };

  const sums = sp.games
    .filter((g) => g.black !== null && g.played)
    .map((g) => (g.whiteScore ?? 0) + (g.blackScore ?? 0));
  const position = (sum: number) => 1 + sums.filter((s) => s > sum).length;

  const closed = new Map<number, boolean>();
  for (const g of sp.games) closed.set(g.round, (closed.get(g.round) ?? true) && g.played);

  const tableOf = new Map<unknown, number>();
  const counters = new Map<number, number>();
  for (const g of sp.games) {
    const n = (counters.get(g.round) ?? 0) + 1;
    counters.set(g.round, n);
    tableOf.set(g, n);
  }

  const lines: string[] = [RESULT_COLUMNS.join('\t')];
  for (const g of sp.games) {
    const table = tableOf.get(g) as number;
    const row: Record<(typeof RESULT_COLUMNS)[number], string | number> = Object.fromEntries(
      RESULT_COLUMNS.map((c) => [c, '']),
    ) as never;
    row.Ronda = g.round;
    row.Jugador1 = name(g.white);
    row.idJug1 = g.white;
    row.ID = g.round * 1000 + table;
    row.Estat = closed.get(g.round) ? 'Ronda tancada' : 'Ronda oberta';
    row.Taula = table;

    if (g.black === null) {
      row.Jugador2 = 'BYE';
      row.idJug2 = 0;
      row.Puntuacio_1 = 0;
      row.Puntuacio_2 = 0;
      row.Comentaris = BYE_COMMENT;
      row.Suma_punts = 1;
      row.Punts_1 = 1;
      row.Punts_2 = 0;
    } else {
      row.Jugador2 = name(g.black);
      row.idJug2 = g.black;
      if (g.played) {
        const sum = (g.whiteScore ?? 0) + (g.blackScore ?? 0);
        row.Puntuacio_1 = g.whiteScore ?? 0;
        row.Puntuacio_2 = g.blackScore ?? 0;
        row.Suma_punts = sum;
        row.Punts_1 = points(g.whiteMatchPoints);
        row.Punts_2 = points(g.blackMatchPoints);
        row.Pos_Conjunta = position(sum);
      }
    }
    lines.push(RESULT_COLUMNS.map((c) => cell(row[c])).join('\t'));
  }
  return lines.join('\n') + '\n';
}
