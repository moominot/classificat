import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { hashPassword } from '../lib/auth';
import { BUILTIN_TEMPLATES } from './builtin-templates';

// Determina la ruta de la base de dades
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), '.data');
const DB_PATH = path.join(DATA_DIR, 'classificat.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const sqlite = new Database(DB_PATH);

sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
// Next.js compila aquest mòdul en bundles separats (rutes d'API vs.
// renderitzat SSR), cadascun amb la seva pròpia connexió SQLite. Sense
// busy_timeout, dues connexions que escriuen gairebé alhora es donen
// SQLITE_BUSY a l'instant en lloc d'esperar-se.
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;

// ─── Migracions ───────────────────────────────────────────────────────────────
// Versionades amb drizzle-kit (`npx drizzle-kit generate`), no SQL imperatiu.
// Substitueix els CREATE TABLE IF NOT EXISTS i els ALTER TABLE condicionals que
// hi havia aquí: eren la font de les migracions trencades (docs/pla-rols.md §10.2).

// Next compila aquest mòdul en diversos bundles i tots s'inicialitzen alhora,
// de manera que dues instàncies poden migrar i sembrar al mateix temps. Tot el
// que hi ha aquí sota ha de ser **idempotent i tolerant a curses**: és el
// mateix problema que va trencar les migracions de fases abans del redisseny.
try {
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'db/migrations') });
} catch (err) {
  // Una altra instància ha aplicat la mateixa migració mentrestant. Drizzle
  // embolcalla l'error d'SQLite: el motiu és a `cause`, no al missatge.
  const motiu = `${(err as Error)?.message} ${((err as Error)?.cause as Error | undefined)?.message ?? ''}`;
  if (!/already exists|duplicate column/i.test(motiu)) throw err;
}

// ─── Sembra ───────────────────────────────────────────────────────────────────

seedBuiltinTemplates();
seedSuperadmin();

/**
 * Les plantilles de sèrie, sempre al dia: l'id és fix i un canvi al codi
 * s'hi aplica en arrencar. Les competicions ja creades no en depenen: se'n
 * copien. (Els antics perfils de joc, `game_profiles`, ja no se sembren.)
 */
function seedBuiltinTemplates() {
  const upsert = sqlite.prepare(
    `INSERT INTO tournament_templates (id, name, owner_id, is_builtin, config) VALUES (?, ?, NULL, 1, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, config = excluded.config`
  );
  for (const template of BUILTIN_TEMPLATES) {
    upsert.run(template.id, template.name, JSON.stringify(template.config));
  }
}

/**
 * Crea el primer superadmin a partir de SUPERADMIN_PASSWORD. Només si encara
 * no hi ha cap compte, per no xafar-ne cap de creat després.
 */
function seedSuperadmin() {
  const password = process.env.SUPERADMIN_PASSWORD ?? process.env.DIRECTOR_PASSWORD;
  if (!password) return;

  const personId = uuid();

  // En una sola transacció, i amb OR IGNORE al compte: si dues instàncies hi
  // arriben alhora, la segona no fa res en lloc de petar amb UNIQUE.
  sqlite.transaction(() => {
    const { c } = sqlite.prepare('SELECT count(*) c FROM accounts').get() as { c: number };
    if (c > 0) return;

    sqlite.prepare('INSERT INTO people (id, display_name) VALUES (?, ?)').run(personId, 'Superadmin');
    sqlite
      .prepare(
        'INSERT OR IGNORE INTO accounts (id, person_id, username, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, 1)'
      )
      .run(uuid(), personId, 'admin', hashPassword(password), 'superadmin');
  })();
}
