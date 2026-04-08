import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

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

// Crea les taules si no existeixen (migració automàtica bàsica)
sqlite.exec(`
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
    method TEXT NOT NULL CHECK(method IN ('swiss','round_robin','king_of_the_hill','manual')),
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

  CREATE INDEX IF NOT EXISTS groups_tournament_idx ON groups(tournament_id);
  CREATE INDEX IF NOT EXISTS players_tournament_idx ON players(tournament_id);
  CREATE INDEX IF NOT EXISTS players_group_idx ON players(group_id);
  CREATE INDEX IF NOT EXISTS phases_tournament_idx ON phases(tournament_id);
  CREATE INDEX IF NOT EXISTS rounds_phase_idx ON rounds(phase_id);
  CREATE INDEX IF NOT EXISTS pairings_round_idx ON pairings(round_id);
  CREATE INDEX IF NOT EXISTS pairings_player1_idx ON pairings(player1_id);
  CREATE INDEX IF NOT EXISTS pairings_player2_idx ON pairings(player2_id);
`);

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
