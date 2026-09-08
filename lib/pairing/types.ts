import type {
  Outcome,
  PairingMethod,
  PhaseConfig,
  ScoringConfig,
  StandingsScopeKey,
  TeamAggregation,
} from '@/db/types';

export type { Outcome, PairingMethod, PhaseConfig, ScoringConfig, StandingsScopeKey, TeamAggregation };
export type { ByeHandling, SeedingCriterion } from '@/db/types';

export const DEFAULT_SEEDING_CRITERIA = ['points', 'elo', 'name'] as const;

// ─── Domini ───────────────────────────────────────────────────────────────────

/**
 * Qui competeix: una participació (`entries`), no una persona.
 *
 * El motor no sap res de persones ni de comptes; treballa amb inscripcions
 * d'una competició concreta (docs/pla-rols.md §12.3).
 */
export interface Entrant {
  id: string;               // entries.id
  tournamentId: string;
  personId: string;
  displayName: string;      // de `people`, per al sembrat alfabètic
  rating?: number | null;
  groupId?: string | null;
  teamId?: string | null;
  isActive: boolean;
}

export interface Group {
  id: string;
  tournamentId: string;
  name: string;
}

export interface Team {
  id: string;
  tournamentId: string;
  name: string;
}

// ─── Fase ─────────────────────────────────────────────────────────────────────

export interface Phase {
  id: string;
  tournamentId: string;
  order: number;
  name: string;
  method: PairingMethod;
  config: PhaseConfig;
  /** 2 per a l'1v1; més només amb round_robin o manual (§13.1 #8). */
  participantsPerMatch: number;
  scoring: ScoringConfig;
  /** Claus del registre de desempats, en ordre d'aplicació (§11.3). */
  tiebreakers: string[];
  standingsScope: StandingsScopeKey[];
  teamAggregation?: TeamAggregation | null;
  startRound: number;
  endRound: number;
  isComplete: boolean;
}

// ─── Rondes i partides ────────────────────────────────────────────────────────

export type RoundStatus = 'draft' | 'open' | 'closed';

export interface Round {
  id: string;
  tournamentId: string;
  phaseId: string;
  number: number;
  status: RoundStatus;
  matches: Match[];
  createdAt: Date;
}

/**
 * Una partida amb N participants. L'1v1 en té dos i el bye, un de sol
 * (docs/pla-rols.md §12.2).
 */
export interface Match {
  id: string;
  roundId: string;
  tableNumber: number;
  participants: MatchParticipant[];
}

export interface MatchParticipant {
  id: string;
  entryId: string;
  seat: number;
  /** Resultat primari: posició a la partida. null mentre no s'ha registrat (§12.10). */
  rank: number | null;
  /** Puntuació bruta del joc: fitxes, gols, punts. Alimenta mètriques i desempats. */
  score: number | null;
  /** Derivat de `rank`. Es desa, però el calcula `deriveOutcome()` i ningú més. */
  outcome: Outcome | null;
  /** Punts de classificació. Decimal: els empats reparteixen posicions (§12.10). */
  points: number | null;
  /** Instantània de l'equip en el moment de jugar (§12.9). */
  teamId: string | null;
}

/** Una partida té resultat quan tots els participants tenen posició. */
export function hasResult(match: Match): boolean {
  return match.participants.length > 0 && match.participants.every((p) => p.rank !== null);
}

export function isBye(match: Match): boolean {
  return match.participants.length === 1;
}

// ─── Classificació ────────────────────────────────────────────────────────────

/**
 * Les mètriques ja no són camps fixos: `spread`, `bingos` o `avgScore` són
 * entrades de `metrics`, derivades de les preguntes amb agregació (§12.1).
 * Això és el que permet que l'aplicació serveixi per a altres jocs sense
 * arrossegar columnes d'Scrabble.
 */
export interface Standing {
  entryId: string;
  rank: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  byes: number;
  gamesPlayed: number;
  metrics: Record<string, number>;
}

/** Classificació d'equips: agregació dels membres, mai partides equip-contra-equip (§12.9). */
export interface TeamStanding {
  teamId: string;
  rank: number;
  points: number;
  memberEntryIds: string[];
  /** Membres que han comptat quan la regla és `top_n`. */
  countedEntryIds: string[];
  metrics: Record<string, number>;
}

// ─── Registre de desempats ────────────────────────────────────────────────────

/**
 * Cada desempat és un mòdul registrat, no una branca d'un `switch`
 * (docs/pla-rols.md §11.3). Afegir-ne un és afegir un fitxer.
 */
export interface TiebreakerDef {
  key: string;
  label: string;
  higherIsBetter: boolean;
  /** Àmbits on té sentit. El directe, per exemple, no en té per a equips. */
  scopes: StandingsScopeKey[];
  /**
   * Cert si es basa en els oponents (Buchholz, Berger). Aquests desempats
   * queden **desactivats** quan la fase té taules de més de dos, perquè la
   * noció d'oponent deixa de ser única (§12.10).
   */
  opponentBased: boolean;
  /** Valor escalar per participació. La via normal. */
  compute?(ctx: TiebreakerContext): Map<string, number>;
  /**
   * Desempats que només tenen sentit dins d'un grup d'empatats, com
   * l'encontre directe: es calculen sobre el grup, no sobre tota la
   * classificació.
   */
  resolveGroup?(entryIds: string[], ctx: TiebreakerContext): Map<string, number>;
}

export interface TiebreakerContext {
  entryIds: string[];
  matches: Match[];
  /** Punts acumulats per participació, ja calculats. */
  points: Map<string, number>;
  /** Mètriques derivades de preguntes, per si el desempat n'és una. */
  metrics: Map<string, Record<string, number>>;
}

/** Un desempat és aplicable a una fase? (§12.10) */
export function isTiebreakerApplicable(def: TiebreakerDef, participantsPerMatch: number): boolean {
  return !def.opponentBased || participantsPerMatch === 2;
}

// ─── Context i resultat del motor ─────────────────────────────────────────────

/** Partida anterior, per evitar repeticions. Els oponents són els altres participants. */
export interface PreviousMatch {
  roundNumber: number;
  phaseId: string;
  entryIds: string[];
  /** Posicions finals, alineades amb `entryIds`. null si no hi ha resultat. */
  ranks: (number | null)[];
}

export interface PairingContext {
  phase: Phase;
  roundNumber: number;
  entrants: Entrant[];
  standings: Standing[];
  previousMatches: PreviousMatch[];
}

/** Una taula generada: N participacions. Una de sola vol dir bye. */
export interface GeneratedMatch {
  tableNumber: number;
  entryIds: string[];
}

export interface PairingEngineResult {
  matches: GeneratedMatch[];
  warnings: PairingWarning[];
  /** Ordre de sembrat emprat, per poder-lo mostrar i depurar. */
  seedingOrder?: string[];
}

export interface PairingWarning {
  type:
    | 'rematch_forced'
    | 'bye_reassigned'
    | 'cross_group_pair'
    | 'incomplete_round_robin'
    | 'uneven_table';
  message: string;
  affectedEntryIds: string[];
}

// ─── Importació CSV ───────────────────────────────────────────────────────────

export interface CsvMatchRow {
  tableNumber: number;
  /** Buit o amb un sol element = bye. */
  entryIds: string[];
}
