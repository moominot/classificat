// ─── Enumerations ────────────────────────────────────────────────────────────

export type PairingMethod = 'swiss' | 'round_robin' | 'king_of_the_hill' | 'manual';

export type Tiebreaker =
  | 'median_buchholz'   // Buchholz menys el millor i pitjor oponent
  | 'buchholz'          // Suma de punts dels oponents
  | 'berger'            // Sonneborn-Berger: suma de punts dels oponents batuts
  | 'wins'              // Nombre de victòries
  | 'direct_encounter'  // Resultat directe entre jugadors empatats
  | 'cumulative'        // Suma acumulada de punts per ronda
  | 'spread';           // Diferència de puntuació total (específic Scrabble)

export type GameOutcome = 'win' | 'loss' | 'draw' | 'bye' | 'forfeit';

export type ByeHandling =
  | 'lowest_ranked'     // Bye al jugador millor classificat del darrer grup de punts
  | 'random_last_group' // Aleatori del darrer grup de punts
  | 'least_byes';       // Jugador amb menys byes anteriors

// ─── Core Domain ─────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  tournamentId: string;
  name: string;
  rating?: number | null;   // Puntuació ELO/FIDE opcional per sembrar
  groupId?: string | null;  // null = sense grup (fase suïssa global)
  isActive: boolean;
  createdAt: Date;
}

export interface Group {
  id: string;
  tournamentId: string;
  name: string;             // "A", "B", "C"
}

// ─── Configuració de fases ────────────────────────────────────────────────────

export interface SwissConfig {
  method: 'swiss';
  avoidRematches: boolean;
  byeHandling: ByeHandling;
  scoreGroupWindowSize: number;  // quants grups considerar per creuaments
  carryStandingsFromPhaseIds: string[];
}

export interface RoundRobinConfig {
  method: 'round_robin';
  scope: 'intra_group' | 'inter_group' | 'all';
  groupIds?: string[];      // si intra_group, quins grups participen
  doubleRound: boolean;     // cada oponent es juga dues vegades
}

export interface KingOfTheHillConfig {
  method: 'king_of_the_hill';
  topN?: number | null;     // restringir als N millors; null = tots
  carryStandingsFromPhaseIds: string[];
}

export interface ManualConfig {
  method: 'manual';
  allowCsvImport: boolean;
}

export type PhaseConfig =
  | SwissConfig
  | RoundRobinConfig
  | KingOfTheHillConfig
  | ManualConfig;

// ─── Fase ────────────────────────────────────────────────────────────────────

export interface Phase {
  id: string;
  tournamentId: string;
  order: number;
  name: string;
  method: PairingMethod;
  startRound: number;
  endRound: number;
  tiebreakers: Tiebreaker[];
  config: PhaseConfig;
  isComplete: boolean;
}

// ─── Ronda / Aparellament ────────────────────────────────────────────────────

export interface Round {
  id: string;
  tournamentId: string;
  phaseId: string;
  number: number;
  pairings: Pairing[];
  isComplete: boolean;
  createdAt: Date;
}

export interface Pairing {
  id: string;
  roundId: string;
  tableNumber: number;
  player1Id: string;
  player2Id: string | null;   // null = bye
  result: PairingResult | null;
}

export interface PairingResult {
  p1Score: number;
  p2Score: number | null;     // null si és bye
  outcome1: GameOutcome;
  outcome2: GameOutcome | null;
  reportedAt: Date;
  reportedBy?: string | null;
}

// ─── Classificació ───────────────────────────────────────────────────────────

export interface Standing {
  playerId: string;
  rank: number;
  points: number;             // victòria=1, empat=0.5, derrota=0, bye=1
  wins: number;
  losses: number;
  draws: number;
  byes: number;
  gamesPlayed: number;
  spread: number;             // diferència total de puntuació Scrabble
  tiebreakers: TiebreakerValues;
}

export interface TiebreakerValues {
  buchholz: number;
  medianBuchholz: number;
  berger: number;
  cumulative: number;
  spread: number;
  wins: number;
  directEncounterResult: number; // 1=victòria, 0.5=empat, 0=derrota, -1=no s'han enfrontat
}

// ─── Context i resultat del motor ────────────────────────────────────────────

export interface PreviousPairing {
  player1Id: string;
  player2Id: string;
  roundNumber: number;
  phaseId: string;
}

export interface PairingContext {
  phase: Phase;
  roundNumber: number;
  players: Player[];
  standings: Standing[];
  previousPairings: PreviousPairing[];
}

export interface GeneratedPairing {
  tableNumber: number;
  player1Id: string;
  player2Id: string | null;
}

export interface PairingEngineResult {
  pairings: GeneratedPairing[];
  warnings: PairingWarning[];
}

export interface PairingWarning {
  type: 'rematch_forced' | 'bye_reassigned' | 'cross_group_pair' | 'incomplete_round_robin';
  message: string;
  affectedPlayerIds: string[];
}

// ─── CSV Import ──────────────────────────────────────────────────────────────

export interface CsvPairingRow {
  tableNumber: number;
  player1Id: string;
  player2Id: string | null; // buit = bye
}
