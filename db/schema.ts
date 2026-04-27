import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { PhaseConfig, Tiebreaker, GameOutcome } from '@/lib/pairing/types';

// ─── Campionats ───────────────────────────────────────────────────────────────

export const tournaments = sqliteTable('tournaments', {
  id:        text('id').primaryKey(),
  name:      text('name').notNull(),
  slug:      text('slug').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('tournaments_slug_uniq').on(t.slug),
]);

// ─── Grups ────────────────────────────────────────────────────────────────────

export const groups = sqliteTable('groups', {
  id:           text('id').primaryKey(),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  name:         text('name').notNull(),  // "A", "B", "C"
  order:        integer('order').notNull().default(0),
}, (t) => [
  index('groups_tournament_idx').on(t.tournamentId),
]);

// ─── Jugadors ────────────────────────────────────────────────────────────────

export const players = sqliteTable('players', {
  id:           text('id').primaryKey(),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  name:         text('name').notNull(),
  rating:       integer('rating'),
  groupId:      text('group_id').references(() => groups.id, { onDelete: 'set null' }),
  phone:        text('phone'),
  club:         text('club'),
  isActive:     integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  index('players_tournament_idx').on(t.tournamentId),
  index('players_group_idx').on(t.groupId),
]);

// ─── Fases ────────────────────────────────────────────────────────────────────

export const phases = sqliteTable('phases', {
  id:           text('id').primaryKey(),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  order:        integer('order').notNull(),
  name:         text('name').notNull(),
  method:       text('method', { enum: ['swiss', 'round_robin', 'king_of_the_hill', 'manual'] }).notNull(),
  startRound:   integer('start_round').notNull(),
  endRound:     integer('end_round').notNull(),
  // Columnes JSON: Drizzle gestiona la serialització
  tiebreakers:  text('tiebreakers', { mode: 'json' }).$type<Tiebreaker[]>().notNull().default(sql`'[]'`),
  config:       text('config', { mode: 'json' }).$type<PhaseConfig>().notNull(),
  isComplete:   integer('is_complete', { mode: 'boolean' }).notNull().default(false),
}, (t) => [
  index('phases_tournament_idx').on(t.tournamentId),
  uniqueIndex('phases_order_uniq').on(t.tournamentId, t.order),
]);

// ─── Rondes ───────────────────────────────────────────────────────────────────

export const rounds = sqliteTable('rounds', {
  id:           text('id').primaryKey(),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  phaseId:      text('phase_id').notNull().references(() => phases.id, { onDelete: 'cascade' }),
  number:       integer('number').notNull(),
  isComplete:   integer('is_complete', { mode: 'boolean' }).notNull().default(false),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('rounds_tournament_number_uniq').on(t.tournamentId, t.number),
  index('rounds_phase_idx').on(t.phaseId),
]);

// ─── Aparellaments ────────────────────────────────────────────────────────────

export const pairings = sqliteTable('pairings', {
  id:          text('id').primaryKey(),
  roundId:     text('round_id').notNull().references(() => rounds.id, { onDelete: 'cascade' }),
  tableNumber: integer('table_number').notNull(),
  player1Id:   text('player1_id').notNull().references(() => players.id),
  player2Id:   text('player2_id').references(() => players.id),  // null = bye

  // Resultat (null fins que no es registra)
  p1Score:     integer('p1_score'),
  p2Score:     integer('p2_score'),
  outcome1:    text('outcome1').$type<GameOutcome>(),
  outcome2:    text('outcome2').$type<GameOutcome>(),
  reportedAt:  integer('reported_at', { mode: 'timestamp' }),
  reportedBy:  text('reported_by'),

  // Camps extra per a Scrabble
  p1Scrabbles: integer('p1_scrabbles'),   // nombre de bingos jugador 1
  p2Scrabbles: integer('p2_scrabbles'),
  p1BestWord:  text('p1_best_word'),      // millor paraula jugador 1
  p2BestWord:  text('p2_best_word'),
  p1BestWordScore: integer('p1_best_word_score'),
  p2BestWordScore: integer('p2_best_word_score'),
  location:    text('location'),           // localitat on s'ha jugat
  comments:    text('comments'),
  sheetImageUrl:  text('sheet_image_url'), // foto del full de puntuació
  boardImageUrl:  text('board_image_url'), // foto del tauler
}, (t) => [
  index('pairings_round_idx').on(t.roundId),
  index('pairings_player1_idx').on(t.player1Id),
  index('pairings_player2_idx').on(t.player2Id),
]);

// ─── Absències per ronda ──────────────────────────────────────────────────────

export const roundAbsences = sqliteTable('round_absences', {
  roundId:  text('round_id').notNull().references(() => rounds.id, { onDelete: 'cascade' }),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.roundId, t.playerId] }),
  index('round_absences_round_idx').on(t.roundId),
]);

// ─── Tipus exportats per a ús a l'aplicació ───────────────────────────────────

export type Tournament = typeof tournaments.$inferSelect;
export type NewTournament = typeof tournaments.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type Phase = typeof phases.$inferSelect;
export type NewPhase = typeof phases.$inferInsert;
export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;
export type Pairing = typeof pairings.$inferSelect;
export type NewPairing = typeof pairings.$inferInsert;
export type RoundAbsence = typeof roundAbsences.$inferSelect;
