import { sqliteTable, text, integer, real, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type {
  AccountPreferences,
  AnswerType,
  AttendanceStatus,
  GameProfileConfig,
  Outcome,
  PairingMethod,
  PhaseConfig,
  QuestionAggregate,
  QuestionScope,
  QuestionType,
  Role,
  RoundStatus,
  ScoringConfig,
  StandingsScopeKey,
  TeamAggregation,
  TournamentStatus,
  TournamentVisibility,
} from './types';

// ══════════════════════════════════════════════════════════════════════════════
// 1. IDENTITAT
//
// Tres capes (docs/pla-rols.md §14): la persona persisteix entre competicions,
// l'entrada la fa participar en una, i el compte —opcional— li dona accés.
// ══════════════════════════════════════════════════════════════════════════════

/** La persona. Existeix encara que mai no es registri: la crea l'admin. */
export const people = sqliteTable('people', {
  id:            text('id').primaryKey(),
  displayName:   text('display_name').notNull(),
  fullName:      text('full_name'),
  alias:         text('alias'),
  photoUrl:      text('photo_url'),
  club:          text('club'),
  rating:        integer('rating'),           // valoració global; sembra la de cada competició
  barrufNumero:  integer('barruf_numero'),    // identificador al registre del BARRUF (docs/api.md)
  phone:         text('phone'),               // contacte: visibilitat restringida (§14.4)
  email:         text('email'),
  isAnonymized:  integer('is_anonymized', { mode: 'boolean' }).notNull().default(false),
  createdBy:     text('created_by'),          // accounts.id — FK afegida sota, per la circularitat
  createdAt:     integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  index('people_display_name_idx').on(t.displayName),
  index('people_club_idx').on(t.club),
]);

/** Credencials i rol. Opcional: com a molt un compte per persona. */
export const accounts = sqliteTable('accounts', {
  id:           text('id').primaryKey(),
  personId:     text('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  username:     text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  role:         text('role').$type<Role>().notNull().default('user'),
  isActive:     integer('is_active', { mode: 'boolean' }).notNull().default(true),
  preferences:  text('preferences', { mode: 'json' }).$type<AccountPreferences>().notNull().default(sql`'{}'`),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('accounts_username_uniq').on(t.username),
  uniqueIndex('accounts_person_uniq').on(t.personId),
]);

/** L'única via per crear un compte: no hi ha auto-registre (§14.2). */
export const invitations = sqliteTable('invitations', {
  id:           text('id').primaryKey(),
  token:        text('token').notNull(),
  personId:     text('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  tournamentId: text('tournament_id').references(() => tournaments.id, { onDelete: 'set null' }),
  createdBy:    text('created_by').notNull().references(() => accounts.id),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  expiresAt:    integer('expires_at', { mode: 'timestamp' }),
  acceptedAt:   integer('accepted_at', { mode: 'timestamp' }),
}, (t) => [
  uniqueIndex('invitations_token_uniq').on(t.token),
  index('invitations_person_idx').on(t.personId),
]);

/**
 * Auditoria de fusions de duplicats (§14.6).
 * `undoPayload` desa quines entrades es van reapuntar, per poder desfer-ho.
 */
export const personMerges = sqliteTable('person_merges', {
  id:             text('id').primaryKey(),
  sourcePersonId: text('source_person_id').notNull(),
  targetPersonId: text('target_person_id').notNull(),
  performedBy:    text('performed_by').notNull().references(() => accounts.id),
  performedAt:    integer('performed_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  undoPayload:    text('undo_payload', { mode: 'json' }).$type<{ entryIds: string[] }>().notNull(),
  undoneAt:       integer('undone_at', { mode: 'timestamp' }),
}, (t) => [
  index('person_merges_target_idx').on(t.targetPersonId),
]);

// ══════════════════════════════════════════════════════════════════════════════
// 2. COMPETICIÓ
// ══════════════════════════════════════════════════════════════════════════════

export const tournaments = sqliteTable('tournaments', {
  id:            text('id').primaryKey(),
  name:          text('name').notNull(),
  slug:          text('slug').notNull(),
  gameProfileId: text('game_profile_id').references(() => gameProfiles.id, { onDelete: 'set null' }),
  ownerId:       text('owner_id').notNull().references(() => accounts.id),
  status:        text('status').$type<TournamentStatus>().notNull().default('draft'),
  visibility:    text('visibility', { mode: 'json' }).$type<TournamentVisibility>().notNull(),
  createdAt:     integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt:     integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('tournaments_slug_uniq').on(t.slug),
  index('tournaments_owner_idx').on(t.ownerId),
]);

/** Coadministradors. El propietari no cal que hi consti. */
export const tournamentAdmins = sqliteTable('tournament_admins', {
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  accountId:    text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  addedAt:      integer('added_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  primaryKey({ columns: [t.tournamentId, t.accountId] }),
  index('tournament_admins_account_idx').on(t.accountId),
]);

export const groups = sqliteTable('groups', {
  id:           text('id').primaryKey(),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  name:         text('name').notNull(),
  order:        integer('order').notNull().default(0),
}, (t) => [
  index('groups_tournament_idx').on(t.tournamentId),
]);

/**
 * Etiquetes d'una competició: substitueixen els grups per a tot el que
 * calgui filtrar/aparellar/mostrar per categoria. A diferència d'un grup,
 * un jugador en pot tenir qualsevol nombre (`entry_tags`), club inclòs
 * ("el club no deixa de ser una etiqueta més"). `groups`/`entries.groupId`
 * es mantenen per ara (migració no destructiva, docs/pla-rols.md pendent).
 */
export const tags = sqliteTable('tags', {
  id:           text('id').primaryKey(),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  name:         text('name').notNull(),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  index('tags_tournament_idx').on(t.tournamentId),
]);

export const entryTags = sqliteTable('entry_tags', {
  entryId: text('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  tagId:   text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => [
  uniqueIndex('entry_tags_uniq').on(t.entryId, t.tagId),
  index('entry_tags_entry_idx').on(t.entryId),
  index('entry_tags_tag_idx').on(t.tagId),
]);

/**
 * Equips d'una competició. No hi ha taula de membres: la pertinença viu a
 * `entries.teamId`, perquè un jugador té un sol equip per competició (§13.1 #5).
 */
export const teams = sqliteTable('teams', {
  id:           text('id').primaryKey(),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  name:         text('name').notNull(),
  order:        integer('order').notNull().default(0),
}, (t) => [
  index('teams_tournament_idx').on(t.tournamentId),
]);

/** La participació d'una persona en una competició (abans `players`). */
export const entries = sqliteTable('entries', {
  id:           text('id').primaryKey(),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  personId:     text('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  groupId:      text('group_id').references(() => groups.id, { onDelete: 'set null' }),
  teamId:       text('team_id').references(() => teams.id, { onDelete: 'set null' }),
  rating:       integer('rating'),            // valoració per a aquesta competició
  isActive:     integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('entries_tournament_person_uniq').on(t.tournamentId, t.personId),
  index('entries_tournament_idx').on(t.tournamentId),
  index('entries_person_idx').on(t.personId),
  index('entries_group_idx').on(t.groupId),
  index('entries_team_idx').on(t.teamId),
]);

// ══════════════════════════════════════════════════════════════════════════════
// 3. FASES, RONDES I PARTIDES
// ══════════════════════════════════════════════════════════════════════════════

export const phases = sqliteTable('phases', {
  id:                   text('id').primaryKey(),
  tournamentId:         text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  order:                integer('order').notNull(),
  name:                 text('name').notNull(),
  method:               text('method').$type<PairingMethod>().notNull(),
  config:               text('config', { mode: 'json' }).$type<PhaseConfig>().notNull(),
  // Més de 2 només amb round_robin o manual (§13.1 #8). Es valida a l'aplicació.
  participantsPerMatch: integer('participants_per_match').notNull().default(2),
  scoring:              text('scoring', { mode: 'json' }).$type<ScoringConfig>().notNull(),
  // Claus del registre de desempats (§11.3): llista oberta, no una unió tancada.
  tiebreakers:          text('tiebreakers', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  standingsScope:       text('standings_scope', { mode: 'json' }).$type<StandingsScopeKey[]>().notNull().default(sql`'["global"]'`),
  teamAggregation:      text('team_aggregation', { mode: 'json' }).$type<TeamAggregation>(),
  startRound:           integer('start_round').notNull(),
  endRound:             integer('end_round').notNull(),
  isComplete:           integer('is_complete', { mode: 'boolean' }).notNull().default(false),
}, (t) => [
  index('phases_tournament_idx').on(t.tournamentId),
  uniqueIndex('phases_order_uniq').on(t.tournamentId, t.order),
]);

/**
 * `status` separa el pany d'edició de la visibilitat (§8.2), cosa que
 * l'antic `isComplete` barrejava. `open` és també la condició perquè un
 * jugador pugui corregir el seu resultat (§15.6).
 */
export const rounds = sqliteTable('rounds', {
  id:              text('id').primaryKey(),
  tournamentId:    text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  phaseId:         text('phase_id').notNull().references(() => phases.id, { onDelete: 'cascade' }),
  number:          integer('number').notNull(),
  status:          text('status').$type<RoundStatus>().notNull().default('draft'),
  // null = hereta el valor per defecte de la competició
  pairingsVisible: integer('pairings_visible', { mode: 'boolean' }),
  resultsVisible:  integer('results_visible', { mode: 'boolean' }),
  createdAt:       integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('rounds_tournament_number_uniq').on(t.tournamentId, t.number),
  index('rounds_phase_idx').on(t.phaseId),
]);

/** La partida (abans `pairings`). El resultat viu a `matchParticipants`. */
export const matches = sqliteTable('matches', {
  id:          text('id').primaryKey(),
  roundId:     text('round_id').notNull().references(() => rounds.id, { onDelete: 'cascade' }),
  tableNumber: integer('table_number').notNull(),
  location:    text('location'),
  comments:    text('comments'),
  createdAt:   integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  index('matches_round_idx').on(t.roundId),
  uniqueIndex('matches_round_table_uniq').on(t.roundId, t.tableNumber),
]);

/**
 * Una fila per participant. L'1v1 és el cas de dues files i el bye, el d'una.
 *
 * `rank` és el resultat primari (§12.10); `outcome` se'n deriva i es desa
 * calculat. `teamId` és una instantània de l'equip en el moment de jugar, per
 * no reescriure la història si el jugador canvia d'equip (§12.9).
 */
export const matchParticipants = sqliteTable('match_participants', {
  id:       text('id').primaryKey(),
  matchId:  text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  entryId:  text('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  seat:     integer('seat').notNull(),
  rank:     integer('rank'),
  score:    integer('score'),
  outcome:  text('outcome').$type<Outcome>(),
  points:   real('points'),                   // punts de classificació; decimals pels empats repartits
  teamId:   text('team_id').references(() => teams.id, { onDelete: 'set null' }),
}, (t) => [
  uniqueIndex('match_participants_match_entry_uniq').on(t.matchId, t.entryId),
  uniqueIndex('match_participants_match_seat_uniq').on(t.matchId, t.seat),
  index('match_participants_entry_idx').on(t.entryId),
  index('match_participants_team_idx').on(t.teamId),
]);

export const roundAbsences = sqliteTable('round_absences', {
  roundId: text('round_id').notNull().references(() => rounds.id, { onDelete: 'cascade' }),
  entryId: text('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.roundId, t.entryId] }),
  index('round_absences_round_idx').on(t.roundId),
]);

// ══════════════════════════════════════════════════════════════════════════════
// 4. PREGUNTES I MÈTRIQUES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Defineix què es captura de cada partida i com es converteix en mètrica de
 * classificació (§12.1). És el que fa que "bingos" o "millor jugada" siguin
 * columnes i desempats configurables en comptes de codi.
 */
export const questionDefinitions = sqliteTable('question_definitions', {
  id:                 text('id').primaryKey(),
  tournamentId:       text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  key:                text('key').notNull(),
  isBuiltin:          integer('is_builtin', { mode: 'boolean' }).notNull().default(false),
  type:               text('type').$type<QuestionType>().notNull(),
  scope:              text('scope').$type<QuestionScope>().notNull(),
  label:              text('label').notNull(),
  label1:             text('label1'),
  label2:             text('label2'),
  answerType:         text('answer_type').$type<AnswerType>(),
  aggregate:          text('aggregate').$type<QuestionAggregate>().notNull().default('none'),
  usableAsTiebreaker: integer('usable_as_tiebreaker', { mode: 'boolean' }).notNull().default(false),
  showInRanking:      integer('show_in_ranking', { mode: 'boolean' }).notNull().default(false),
  order:              integer('order').notNull().default(0),
  createdAt:          integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  index('question_definitions_tournament_idx').on(t.tournamentId),
  uniqueIndex('question_definitions_tournament_key_uniq').on(t.tournamentId, t.key),
]);

export const matchAnswers = sqliteTable('match_answers', {
  id:            text('id').primaryKey(),
  matchId:       text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  // null quan la pregunta és d'àmbit `match`
  participantId: text('participant_id').references(() => matchParticipants.id, { onDelete: 'cascade' }),
  questionId:    text('question_id').notNull().references(() => questionDefinitions.id, { onDelete: 'cascade' }),
  textValue:     text('text_value'),
  numberValue:   integer('number_value'),
  imageUrl:      text('image_url'),
}, (t) => [
  index('match_answers_match_idx').on(t.matchId),
  index('match_answers_question_idx').on(t.questionId),
  uniqueIndex('match_answers_uniq').on(t.matchId, t.questionId, t.participantId),
]);

/** Plantilla de joc: es copia en crear una competició, no s'hi enllaça (§13.1 #4). */
export const gameProfiles = sqliteTable('game_profiles', {
  id:        text('id').primaryKey(),
  name:      text('name').notNull(),
  isBuiltin: integer('is_builtin', { mode: 'boolean' }).notNull().default(false),
  config:    text('config', { mode: 'json' }).$type<GameProfileConfig>().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  uniqueIndex('game_profiles_name_uniq').on(t.name),
]);

// ══════════════════════════════════════════════════════════════════════════════
// 5. IDENTITAT DEL VISITANT I TRAÇA
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Qui diu ser qui, per dispositiu (§15.2). Només serveix per marcar els
 * jugadors "ja agafats": és un avís, mai un pany (§15.6).
 */
export const entryClaims = sqliteTable('entry_claims', {
  entryId:    text('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  deviceId:   text('device_id').notNull(),
  claimedAt:  integer('claimed_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  primaryKey({ columns: [t.entryId, t.deviceId] }),
  index('entry_claims_entry_idx').on(t.entryId),
]);

/**
 * Procedència i auditoria de cada resultat (§15.2, §15.7): qui el va enviar,
 * qui l'ha corregit i què deia abans. És el que permet explicar una
 * classificació que ha canviat després de tancar una ronda.
 */
export const matchRevisions = sqliteTable('match_revisions', {
  id:             text('id').primaryKey(),
  matchId:        text('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  actorKind:      text('actor_kind').$type<'guest' | 'device' | 'account'>().notNull(),
  actorAccountId: text('actor_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  actorEntryId:   text('actor_entry_id').references(() => entries.id, { onDelete: 'set null' }),
  deviceId:       text('device_id'),
  createdAt:      integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  before:         text('before', { mode: 'json' }),
  after:          text('after', { mode: 'json' }),
}, (t) => [
  index('match_revisions_match_idx').on(t.matchId),
]);

// ══════════════════════════════════════════════════════════════════════════════
// 6. CONTINGUT
//
// Definit ara per no haver de redissenyar dues vegades (§13.1 #2);
// la implementació ve després.
// ══════════════════════════════════════════════════════════════════════════════

export const announcements = sqliteTable('announcements', {
  id:           text('id').primaryKey(),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  category:     text('category'),
  title:        text('title').notNull(),
  body:         text('body'),
  imageUrl:     text('image_url'),
  publishedAt:  integer('published_at', { mode: 'timestamp' }),
  createdBy:    text('created_by').references(() => accounts.id, { onDelete: 'set null' }),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  index('announcements_tournament_idx').on(t.tournamentId),
]);

export const meetups = sqliteTable('meetups', {
  id:           text('id').primaryKey(),
  tournamentId: text('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  roundId:      text('round_id').references(() => rounds.id, { onDelete: 'set null' }),
  title:        text('title').notNull(),
  startsAt:     integer('starts_at', { mode: 'timestamp' }).notNull(),
  location:     text('location'),
  description:  text('description'),
}, (t) => [
  index('meetups_tournament_idx').on(t.tournamentId),
]);

export const meetupAttendance = sqliteTable('meetup_attendance', {
  meetupId:  text('meetup_id').notNull().references(() => meetups.id, { onDelete: 'cascade' }),
  entryId:   text('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  status:    text('status').$type<AttendanceStatus>().notNull().default('pending'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, (t) => [
  primaryKey({ columns: [t.meetupId, t.entryId] }),
]);

// ══════════════════════════════════════════════════════════════════════════════
// 7. CONFIGURACIÓ GLOBAL
// ══════════════════════════════════════════════════════════════════════════════

/** Clau-valor genèric per a configuració d'abast d'aplicació (p. ex. la connexió amb el BARRUF). */
export const appSettings = sqliteTable('app_settings', {
  key:       text('key').primaryKey(),
  value:     text('value'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

// ══════════════════════════════════════════════════════════════════════════════
// TIPUS EXPORTATS
// ══════════════════════════════════════════════════════════════════════════════

export type Person = typeof people.$inferSelect;
export type NewPerson = typeof people.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type PersonMerge = typeof personMerges.$inferSelect;
export type Tournament = typeof tournaments.$inferSelect;
export type NewTournament = typeof tournaments.$inferInsert;
export type TournamentAdmin = typeof tournamentAdmins.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
export type Phase = typeof phases.$inferSelect;
export type NewPhase = typeof phases.$inferInsert;
export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
export type MatchParticipant = typeof matchParticipants.$inferSelect;
export type NewMatchParticipant = typeof matchParticipants.$inferInsert;
export type RoundAbsence = typeof roundAbsences.$inferSelect;
export type QuestionDefinition = typeof questionDefinitions.$inferSelect;
export type NewQuestionDefinition = typeof questionDefinitions.$inferInsert;
export type MatchAnswer = typeof matchAnswers.$inferSelect;
export type NewMatchAnswer = typeof matchAnswers.$inferInsert;
export type GameProfile = typeof gameProfiles.$inferSelect;
export type NewGameProfile = typeof gameProfiles.$inferInsert;
export type EntryClaim = typeof entryClaims.$inferSelect;
export type MatchRevision = typeof matchRevisions.$inferSelect;
export type NewMatchRevision = typeof matchRevisions.$inferInsert;
export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;
export type Meetup = typeof meetups.$inferSelect;
export type NewMeetup = typeof meetups.$inferInsert;
export type MeetupAttendance = typeof meetupAttendance.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;
