/**
 * Test del lector de SwissPerfect 98.
 * Executa amb: npx tsx lib/__tests__/swissperfect.test.ts
 */
import fs from 'fs';
import path from 'path';
import { parseSwissPerfect } from '../swissperfect/parse';
import { writeSwissPerfect } from '../swissperfect/write';
import { exportResultsTsv } from '../swissperfect/export';

const dir = path.join(__dirname, 'fixtures/swissperfect');
const read = (f: string) => new Uint8Array(fs.readFileSync(path.join(dir, f)));
const t = parseSwissPerfect({ trn: read('manacor.trn'), sco: read('manacor.sco'), ini: read('manacor.ini') });

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(ok ? `  ok   ${name}` : `  FALLA ${name}\n    obtingut: ${JSON.stringify(got)}\n    esperat:  ${JSON.stringify(want)}`);
}

check('nom', t.name, 'X Campionat de Scrabble Ciutat de Manacor');
check('rondes', t.rounds, 6);
check('jugadors', t.players.length, 43);
check('accents', t.players[0].surname, 'Xurí');
check('valoració', t.players[0].rating, 1399);
check('entrada tardana', [t.players[6].id, t.players[6].firstRound], [7, 4]);
check('retirada', [t.players[40].firstRound, t.players[40].withdrawnFromRound], [3, 5]);
check('partides', t.games.length, 112);
check('primera partida', t.games[0], { round: 1, white: 1, black: 15, whiteMatchPoints: 2, blackMatchPoints: 0, whiteScore: 461, blackScore: 413, played: true });
check('bye', t.games.find((g) => g.round === 1 && g.black === null), { round: 1, white: 40, black: null, whiteMatchPoints: 2, blackMatchPoints: 0, whiteScore: null, blackScore: null, played: true });
check('ronda 6 sense jugar', t.games.filter((g) => g.round === 6 && !g.played).length, 17);
check('avisos', t.warnings, []);

const rows = exportResultsTsv(t).trimEnd().split('\n').map((l) => l.split('\t'));
check('columnes', rows[0].length, 29);
check('capçalera', rows[0].slice(0, 8).join(','), 'Ronda,Jugador1,Jugador2,idJug1,idJug2,ID,Puntuacio_1,Puntuacio_2');
const r = rows[1];
check('fila 1', [r[0], r[1], r[2], r[3], r[4], r[6], r[7], r[21], r[23], r[24], r[25], r[28]], ['1', 'Mateu Xurí', 'Antònia Riera', '1', '15', '461', '413', '874', '1', '0', 'Ronda tancada', '1']);
const bye = rows.find((x) => x[2] === 'BYE' && x[0] === '1')!;
check('bye', [bye[1], bye[4], bye[6], bye[7], bye[18], bye[23], bye[24], bye[28]], ['Sebastià Quetglas', '0', '0', '0', 'Victòria automàtica que no afecta a les mitjanes', '1', '0', '19']);
check('files', rows.length - 1, 112);

// Anada i tornada: llegir, escriure i tornar a llegir ha de donar el mateix.
const out = writeSwissPerfect(t);
check('.sco idèntic byte a byte', Buffer.compare(Buffer.from(out.sco), Buffer.from(read('manacor.sco'))), 0);
const again = parseSwissPerfect(out);
check('anada i tornada', JSON.stringify(again), JSON.stringify(t));
check('.ini', Buffer.from(out.ini).toString('latin1').includes('Name=X Campionat de Scrabble Ciutat de Manacor'), true);

process.exit(failed ? 1 : 0);
