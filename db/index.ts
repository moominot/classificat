import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { hashPassword } from '../lib/auth';
import { BUILTIN_QUESTIONS } from '../lib/question-defs';

// Determina la ruta de la base de dades
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), '.data');
const DB_PATH = path.join(DATA_DIR, 'classificat.db');

// Assegura que el directori existeix
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Crea o obre la base de dades SQLite
const sqlite = new Database(DB_PATH);

// Activa WAL per a millor rendiment en concurrència
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
// Next.js compila aquest mòdul en bundles separats (rutes d'API vs.
// renderitzat SSR), cadascun amb la seva pròpia connexió SQLite. Sense
// busy_timeout, dues connexions que escriuen gairebé alhora es donen
// SQLITE_BUSY a l'instant en lloc d'esperar-se.
sqlite.pragma('busy_timeout = 5000');

// Crea les taules si no existeixen (migració automàtica bàsica)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS directors (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    rating INTEGER,
    group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS phases (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    "order" INTEGER NOT NULL,
    name TEXT NOT NULL,
    method TEXT NOT NULL CHECK(method IN ('swiss','swiss_fide','round_robin','king_of_the_hill','manual')),
    start_round INTEGER NOT NULL,
    end_round INTEGER NOT NULL,
    tiebreakers TEXT NOT NULL DEFAULT '[]',
    config TEXT NOT NULL,
    is_complete INTEGER NOT NULL DEFAULT 0,
    UNIQUE(tournament_id, "order")
  );

  CREATE TABLE IF NOT EXISTS rounds (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    is_complete INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(tournament_id, number)
  );

  CREATE TABLE IF NOT EXISTS pairings (
    id TEXT PRIMARY KEY,
    round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    table_number INTEGER NOT NULL,
    player1_id TEXT NOT NULL REFERENCES players(id),
    player2_id TEXT REFERENCES players(id),
    p1_score INTEGER,
    p2_score INTEGER,
    outcome1 TEXT CHECK(outcome1 IN ('win','loss','draw','bye','forfeit')),
    outcome2 TEXT CHECK(outcome2 IN ('win','loss','draw','bye','forfeit')),
    reported_at INTEGER,
    reported_by TEXT,
    p1_scrabbles INTEGER,
    p2_scrabbles INTEGER,
    p1_best_word TEXT,
    p2_best_word TEXT,
    p1_best_word_score INTEGER,
    p2_best_word_score INTEGER,
    location TEXT,
    comments TEXT,
    sheet_image_url TEXT,
    board_image_url TEXT
  );

  CREATE TABLE IF NOT EXISTS round_absences (
    round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    PRIMARY KEY (round_id, player_id)
  );

  CREATE TABLE IF NOT EXISTS question_definitions (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL CHECK(type IN ('value','wordvalue','image')),
    scope TEXT NOT NULL CHECK(scope IN ('match','player')),
    label TEXT NOT NULL,
    label1 TEXT,
    label2 TEXT,
    answer_type TEXT CHECK(answer_type IN ('text','number')),
    show_in_ranking INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(tournament_id, key)
  );

  CREATE TABLE IF NOT EXISTS pairing_answers (
    id TEXT PRIMARY KEY,
    pairing_id TEXT NOT NULL REFERENCES pairings(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES question_definitions(id) ON DELETE CASCADE,
    player INTEGER,
    text_value TEXT,
    number_value INTEGER,
    image_url TEXT,
    UNIQUE(pairing_id, question_id, player)
  );

  CREATE INDEX IF NOT EXISTS groups_tournament_idx ON groups(tournament_id);
  CREATE INDEX IF NOT EXISTS players_tournament_idx ON players(tournament_id);
  CREATE INDEX IF NOT EXISTS players_group_idx ON players(group_id);
  CREATE INDEX IF NOT EXISTS phases_tournament_idx ON phases(tournament_id);
  CREATE INDEX IF NOT EXISTS rounds_phase_idx ON rounds(phase_id);
  CREATE INDEX IF NOT EXISTS pairings_round_idx ON pairings(round_id);
  CREATE INDEX IF NOT EXISTS pairings_player1_idx ON pairings(player1_id);
  CREATE INDEX IF NOT EXISTS pairings_player2_idx ON pairings(player2_id);
  CREATE INDEX IF NOT EXISTS round_absences_round_idx ON round_absences(round_id);
  CREATE INDEX IF NOT EXISTS question_definitions_tournament_idx ON question_definitions(tournament_id);
  CREATE INDEX IF NOT EXISTS pairing_answers_pairing_idx ON pairing_answers(pairing_id);
  CREATE INDEX IF NOT EXISTS pairing_answers_question_idx ON pairing_answers(question_id);
`);

// Migracions incrementals per a columnes afegides posteriorment
const playerCols = new Set(
  (sqlite.pragma('table_info(players)') as { name: string }[]).map(c => c.name)
);
if (!playerCols.has('phone')) sqlite.exec('ALTER TABLE players ADD COLUMN phone TEXT');
if (!playerCols.has('club'))  sqlite.exec('ALTER TABLE players ADD COLUMN club TEXT');

// Migració: el mètode 'swiss_fide' es va afegir després de crear la taula phases,
// i SQLite no permet alterar un CHECK existent, cal reconstruir la taula.
//
// IMPORTANT: mai renombrem la taula ORIGINAL (amb dades i amb dependents que
// hi apunten per FK). Des de SQLite 3.25, "ALTER TABLE x RENAME TO y" reescriu
// automàticament les clàusules REFERENCES de les taules que apunten a x
// perquè apuntin a y — si renombréssim "phases" a "phases_old" i després
// l'esborréssim, la taula "rounds" es quedaria apuntant per FK a un
// "phases_old" inexistent (exactament el bug que això corregeix: qualsevol
// consulta sobre "rounds" petava amb "no such table: main.phases_old").
// Patró segur: crear la taula nova amb un nom temporal, copiar-hi les dades,
// esborrar la taula vella (un DROP no reescriu res, només ho fa el RENAME) i
// només llavors renombrar la nova cap al nom definitiu.
//
// La comprovació i l'execució van juntes DINS la transacció (no abans), perquè
// aquest mòdul es carrega per duplicat (bundle de rutes d'API vs. bundle SSR)
// i cada instància obre la seva pròpia connexió. Si totes dues hi entren
// gairebé alhora, la segona ha d'esperar el lock (busy_timeout) i, en re-
// comprovar un cop dins la transacció, veure que ja no cal fer res.
sqlite.pragma('foreign_keys = OFF');

const migratePhasesIfNeeded = sqlite.transaction(() => {
  const phasesTableSql = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='phases'")
    .get() as { sql: string } | undefined;
  if (!phasesTableSql || phasesTableSql.sql.includes('swiss_fide')) return;

  sqlite.exec(`
    DROP TABLE IF EXISTS phases_new;
    CREATE TABLE phases_new (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      "order" INTEGER NOT NULL,
      name TEXT NOT NULL,
      method TEXT NOT NULL CHECK(method IN ('swiss','swiss_fide','round_robin','king_of_the_hill','manual')),
      start_round INTEGER NOT NULL,
      end_round INTEGER NOT NULL,
      tiebreakers TEXT NOT NULL DEFAULT '[]',
      config TEXT NOT NULL,
      is_complete INTEGER NOT NULL DEFAULT 0,
      UNIQUE(tournament_id, "order")
    );
    INSERT INTO phases_new SELECT * FROM phases;
    DROP TABLE phases;
    ALTER TABLE phases_new RENAME TO phases;
    CREATE INDEX IF NOT EXISTS phases_tournament_idx ON phases(tournament_id);
  `);
});
migratePhasesIfNeeded();

// Reparació: si un desplegament ja va patir el bug descrit a dalt (la taula
// "phases" ja té 'swiss_fide' però "rounds" encara referencia "phases_old"),
// reconstruïm "rounds" amb el mateix patró segur per corregir-li la FK.
const repairRoundsIfNeeded = sqlite.transaction(() => {
  const roundsTableSql = sqlite
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='rounds'")
    .get() as { sql: string } | undefined;
  if (!roundsTableSql || !roundsTableSql.sql.includes('phases_old')) return;

  sqlite.exec(`
    DROP TABLE IF EXISTS rounds_new;
    CREATE TABLE rounds_new (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      is_complete INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(tournament_id, number)
    );
    INSERT INTO rounds_new SELECT * FROM rounds;
    DROP TABLE rounds;
    ALTER TABLE rounds_new RENAME TO rounds;
    CREATE INDEX IF NOT EXISTS rounds_phase_idx ON rounds(phase_id);
  `);
});
repairRoundsIfNeeded();

sqlite.pragma('foreign_keys = ON');

// Sembra el director inicial a partir de DIRECTOR_PASSWORD (compatibilitat amb
// desplegaments existents que encara usaven una única contrasenya compartida).
// Només s'executa si la taula és buida, per no xafar comptes ja creats.
const directorCount = sqlite.prepare('SELECT count(*) c FROM directors').get() as { c: number };
if (directorCount.c === 0 && process.env.DIRECTOR_PASSWORD) {
  sqlite.prepare(
    'INSERT INTO directors (id, username, password_hash, name, is_active) VALUES (?, ?, ?, ?, 1)'
  ).run(uuid(), 'director', hashPassword(process.env.DIRECTOR_PASSWORD), 'Director');
}

// Sembra les preguntes bàsiques (Resultat, Bingos, Millor jugada, Full de
// puntuació, Foto del tauler) per a qualsevol torneig que encara no en tingui
// cap — cobreix tant torneigs existents (migració) com el desplegament
// inicial. Els torneigs nous ja les sembren en crear-se (POST /api/tournaments).
const seedQuestionStmt = sqlite.prepare(`
  INSERT INTO question_definitions
    (id, tournament_id, key, is_builtin, type, scope, label, label1, label2, answer_type, show_in_ranking, "order")
  VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const tournamentsWithoutQuestions = sqlite.prepare(`
  SELECT t.id FROM tournaments t
  WHERE NOT EXISTS (SELECT 1 FROM question_definitions q WHERE q.tournament_id = t.id)
`).all() as { id: string }[];
for (const t of tournamentsWithoutQuestions) {
  for (const q of BUILTIN_QUESTIONS) {
    seedQuestionStmt.run(
      uuid(), t.id, q.key, q.type, q.scope, q.label,
      q.label1 ?? null, q.label2 ?? null, q.answerType ?? null,
      q.showInRanking ? 1 : 0, q.order
    );
  }
}

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
