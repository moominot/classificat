import { INI_TEMPLATE, SCO_HEADER_B64, TRN_HEADER_B64 } from './templates';
import type { SpTournament } from './parse';

/**
 * Escriu els fitxers de SwissPerfect 98 (`.trn`, `.sco`, `.ini`) a partir d'un
 * campionat: és l'invers de `parseSwissPerfect`. Serveix de còpia de seguretat
 * si Classificat falla: els fitxers s'obren amb SwissPerfect per continuar.
 */

const TRN_FIELDS: Array<[string, number]> = [
  ['ORDER', 5], ['ID', 5], ['START_NO', 5], ['SURNAME', 25], ['FIRSTNAME', 25], ['FEDER', 4],
  ['CLUB', 30], ['INTL_RTG', 4], ['LOC_RTG', 4], ['LOC_RTG2', 4], ['INTL_ID', 12], ['LOC_ID', 12],
  ['TITLE', 3], ['SEX', 1], ['BIRTH_DATE', 10], ['LATE_ENTRY', 2], ['WITHDRAWAL', 2], ['ABSENT', 16],
  ['BONUS', 3], ['TECH_SCORE', 3], ['FORB_PAIRS', 3], ['TEAM', 3], ['BOARD', 3], ['MEMO', 20],
];

const SCO_FIELDS: Array<[string, number]> = [
  ['ROUND', 3], ['WHITE', 5], ['BLACK', 5], ['W_SCORE', 3], ['B_SCORE', 3],
  ['W_TYPE', 2], ['B_TYPE', 2], ['W_SUBSCO', 4], ['B_SUBSCO', 4],
];

/** Camp d'ample fix, alineat a l'esquerra i retallat; Windows‑1252 (≈ Latin‑1). */
const pad = (value: string | number, width: number) => String(value).padEnd(width).slice(0, width);

function table(headerB64: string, fields: Array<[string, number]>, rows: Array<Record<string, string | number>>): Uint8Array {
  const header = Buffer.from(headerB64, 'base64');
  header.writeUInt32LE(rows.length, 4);
  const body = rows.map((r) => ' ' + fields.map(([name, width]) => pad(r[name] ?? '', width)).join(''));
  return new Uint8Array(Buffer.concat([header, Buffer.from(body.join(''), 'latin1'), Buffer.from([0x1a])]));
}

export interface SwissPerfectFiles {
  trn: Uint8Array;
  sco: Uint8Array;
  ini: Uint8Array;
}

export function writeSwissPerfect(sp: SpTournament): SwissPerfectFiles {
  const trn = table(
    TRN_HEADER_B64,
    TRN_FIELDS,
    sp.players.map((p) => ({
      ORDER: p.id, ID: p.id, START_NO: p.id,
      SURNAME: p.surname, FIRSTNAME: p.firstName, CLUB: p.club,
      INTL_RTG: p.rating ?? '',
      LATE_ENTRY: p.firstRound > 1 ? p.firstRound : '',
      WITHDRAWAL: p.withdrawnFromRound ?? '',
    })),
  );

  // SwissPerfect escriu el bye d'una ronda ja acabada amb el rival «0.000», tots
  // dos tipus a 1 i un minor score ~0 («2e-9»); mentre la ronda no s'ha acabat,
  // el rival és «0» i només el tipus del jugador val 1.
  const roundDone = new Map<number, boolean>();
  for (const g of sp.games) if (g.black !== null) roundDone.set(g.round, (roundDone.get(g.round) ?? true) && g.played);

  const sco = table(
    SCO_HEADER_B64,
    SCO_FIELDS,
    sp.games.map((g) => {
      const doneBye = g.black === null && g.played && (roundDone.get(g.round) ?? true);
      return {
        ROUND: g.round, WHITE: g.white, BLACK: doneBye ? '0.000' : (g.black ?? 0),
        W_SCORE: g.whiteMatchPoints, B_SCORE: g.blackMatchPoints,
        W_TYPE: g.played ? 1 : 0, B_TYPE: g.played && (g.black !== null || doneBye) ? 1 : 0,
        // El «minor score» de SwissPerfect és el doble dels punts reals.
        W_SUBSCO: doneBye ? '2e-9' : (g.whiteScore ?? 0) * 2, B_SUBSCO: (g.blackScore ?? 0) * 2,
      };
    }),
  );

  const set = (ini: string, key: string, value: string | number) =>
    ini.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
  let ini = INI_TEMPLATE;
  ini = set(ini, 'Name', sp.name);
  ini = set(ini, 'Arbiter', sp.arbiter);
  ini = set(ini, 'Organiser', sp.organiser);
  ini = set(ini, 'Rounds', sp.rounds);
  // L'acceleració del campionat original depenia dels seus grups de jugadors.
  ini = set(ini, 'UseAccelerated', 0);

  return { trn, sco, ini: new Uint8Array(Buffer.from(ini, 'latin1')) };
}

// ─── ZIP (sense compressió) per baixar els tres fitxers d'un cop ──────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipStore(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // nom en UTF‑8
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(f.data.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, Buffer.from(f.data));

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(f.data.length, 20);
    entry.writeUInt32LE(f.data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += 30 + name.length + f.data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, centralBuf, end]));
}
