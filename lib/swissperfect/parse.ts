/**
 * Lectura dels fitxers d'un campionat de SwissPerfect 98.
 *
 * Un campionat són tres fitxers amb el mateix nom base:
 *  - `.trn`: els jugadors (taula tipus dBase: capçalera de 32 bytes, un
 *    descriptor de 32 bytes per camp acabat en 0x0D, registres de text d'ample
 *    fix, el primer byte és la marca d'esborrat, i un 0x1A final);
 *  - `.sco`: els aparellaments i resultats, amb el mateix format;
 *  - `.ini`: la configuració del campionat (format INI).
 *
 * Aquest mòdul no depèn de la base de dades: només converteix bytes en dades.
 */

export interface SpPlayer {
  /** Número d'inici: és el que fan servir `.sco` per referir-se al jugador. */
  id: number;
  surname: string;
  firstName: string;
  club: string;
  rating: number | null;
  /** Primera ronda que juga (1 = des de l'inici). */
  firstRound: number;
  /** Primera ronda que ja no juga (retirat); `null` si arriba al final. */
  withdrawnFromRound: number | null;
}

export interface SpGame {
  round: number;
  white: number;
  /** `null` = bye (el rival és el 0). */
  black: number | null;
  /** Punts de partida (2 victòria, 1 empat, 0 derrota). */
  whiteMatchPoints: number;
  blackMatchPoints: number;
  /** Punts de joc (el «minor score»); `null` al bye. */
  whiteScore: number | null;
  blackScore: number | null;
  /** `false` si encara no s'ha introduït el resultat. */
  played: boolean;
}

export interface SpTournament {
  name: string;
  organiser: string;
  arbiter: string;
  rounds: number;
  players: SpPlayer[];
  games: SpGame[];
  warnings: string[];
}

interface DbfField {
  name: string;
  length: number;
}

/** El Windows-1252 de SwissPerfect: «Xurí», «Esperança»... */
const decoder = new TextDecoder('windows-1252');

function readDbf(buf: Uint8Array): Array<Record<string, string>> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const headerLength = view.getUint16(8, true);
  const recordLength = view.getUint16(10, true);

  const fields: DbfField[] = [];
  for (let p = 32; p < headerLength && buf[p] !== 0x0d; p += 32) {
    let end = p;
    while (end < p + 11 && buf[end] !== 0) end++;
    fields.push({ name: decoder.decode(buf.subarray(p, end)), length: buf[p + 16] });
  }

  const rows: Array<Record<string, string>> = [];
  for (let start = headerLength; start + recordLength <= buf.length; start += recordLength) {
    if (buf[start] === 0x2a) continue; // '*': registre esborrat
    const row: Record<string, string> = {};
    let offset = start + 1;
    let blank = true;
    for (const f of fields) {
      const value = decoder.decode(buf.subarray(offset, offset + f.length)).trim();
      if (value) blank = false;
      row[f.name] = value;
      offset += f.length;
    }
    // La capçalera declara més registres dels que hi ha en ús: s'omplen de blancs.
    if (!blank) rows.push(row);
  }
  return rows;
}

function parseIni(text: string): Record<string, Record<string, string>> {
  const sections: Record<string, Record<string, string>> = {};
  let current = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    const header = /^\[(.+)\]$/.exec(line);
    if (header) {
      current = header[1];
      sections[current] ??= {};
      continue;
    }
    const eq = line.indexOf('=');
    if (eq > 0) (sections[current] ??= {})[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return sections;
}

function int(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/** Els valors «2e-9» són el zero d'un nombre en coma flotant mal arrodonit. */
function score(value: string | undefined): number {
  const n = int(value) ?? 0;
  return Math.abs(n) < 1e-3 ? 0 : Math.round(n);
}

/**
 * El «minor score» que desa SwissPerfect és el doble dels punts reals de la
 * partida (922 al `.sco` = 461 punts a la taula de resultats).
 */
function gameScore(value: string | undefined, warn: (m: string) => void, where: string): number {
  const n = score(value);
  if (n % 2 !== 0) warn(`${where}: el minor score ${n} és senar`);
  return Math.round(n / 2);
}

export function parseSwissPerfect(files: {
  trn: Uint8Array;
  sco: Uint8Array;
  ini?: Uint8Array | string;
}): SpTournament {
  const warnings: string[] = [];

  const players: SpPlayer[] = readDbf(files.trn).flatMap((r) => {
    const id = int(r.ID) ?? int(r.START_NO);
    if (id === null) return [];
    const rating = int(r.INTL_RTG) ?? int(r.LOC_RTG);
    return [
      {
        id,
        surname: r.SURNAME ?? '',
        firstName: r.FIRSTNAME ?? '',
        club: r.CLUB ?? '',
        rating: rating && rating > 0 ? rating : null,
        firstRound: int(r.LATE_ENTRY) ?? 1,
        withdrawnFromRound: int(r.WITHDRAWAL),
      },
    ];
  });

  const playerIds = new Set(players.map((p) => p.id));
  const games: SpGame[] = [];
  for (const r of readDbf(files.sco)) {
    const round = int(r.ROUND);
    const white = int(r.WHITE);
    if (round === null || white === null) continue;
    const black = int(r.BLACK);
    const isBye = !black; // 0 o «0.000»
    const whiteType = int(r.W_TYPE) ?? 0;
    const blackType = int(r.B_TYPE) ?? 0;
    // Una partida sense resultat té tots dos tipus a 0; el bye només marca el seu.
    const played = isBye ? whiteType !== 0 : whiteType !== 0 && blackType !== 0;

    for (const id of isBye ? [white] : [white, black as number]) {
      if (!playerIds.has(id)) warnings.push(`Ronda ${round}: el jugador ${id} no és a la llista`);
    }
    if (played && (whiteType > 1 || blackType > 1)) {
      warnings.push(`Ronda ${round}, ${white}-${black ?? 'bye'}: tipus de resultat ${whiteType}/${blackType} desconegut`);
    }

    games.push({
      round,
      white,
      black: isBye ? null : black,
      whiteMatchPoints: score(r.W_SCORE),
      blackMatchPoints: score(r.B_SCORE),
      whiteScore: isBye || !played ? null : gameScore(r.W_SUBSCO, (m) => warnings.push(m), `Ronda ${round}, ${white}`),
      blackScore: isBye || !played ? null : gameScore(r.B_SUBSCO, (m) => warnings.push(m), `Ronda ${round}, ${black}`),
      played,
    });
  }

  const ini = files.ini
    ? parseIni(typeof files.ini === 'string' ? files.ini : decoder.decode(files.ini))
    : {};
  const info = ini['Tournament Info'] ?? {};
  const lastRound = games.reduce((max, g) => Math.max(max, g.round), 0);

  return {
    name: info.Name ?? '',
    organiser: info.Organiser ?? '',
    arbiter: info.Arbiter ?? '',
    rounds: Math.max(int(info.Rounds) ?? 0, lastRound),
    players,
    games,
    warnings,
  };
}
