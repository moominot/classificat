/**
 * Tipus de les columnes JSON i dels enums de l'esquema.
 *
 * Viuen aquí i no a `lib/pairing/types.ts` perquè l'esquema no depengui del
 * motor d'aparellaments: la classificació passa a ser modular i les claus de
 * desempat surten d'un registre, no d'una unió tancada (docs/pla-rols.md §11.3).
 */

// ─── Rols i identitat ─────────────────────────────────────────────────────────

export type Role = 'superadmin' | 'admin' | 'user';

/** Com s'ha identificat qui fa una acció (docs/pla-rols.md §15.2). */
export type ActorKind = 'guest' | 'device' | 'account';

export interface AccountPreferences {
  theme?: 'light' | 'dark' | 'system';
}

// ─── Competició ───────────────────────────────────────────────────────────────

export type TournamentStatus = 'draft' | 'active' | 'finished';

/** Com es mostra la classificació al jugador (docs/pla-rols.md §8.2 i §15.5). */
export type StandingsMode =
  | 'live'            // es recalcula i es mostra a l'instant
  | 'closed_rounds'   // només compten les rondes tancades
  | 'frozen_at'       // congelada: es mostra tal com era en acabar `frozenRound`
  | 'hidden';         // el jugador no en veu cap

export interface TournamentVisibility {
  standingsMode: StandingsMode;
  /** Ronda fins a la qual es mostra la classificació quan el mode és `frozen_at`. */
  frozenRound: number | null;
  /** Defectes que hereten les rondes que no els sobreescriuen. */
  pairingsVisible: boolean;
  resultsVisible: boolean;
}

export const DEFAULT_VISIBILITY: TournamentVisibility = {
  standingsMode: 'closed_rounds',
  frozenRound: null,
  pairingsVisible: true,
  resultsVisible: true,
};

// ─── Fases ────────────────────────────────────────────────────────────────────

export type PairingMethod = 'swiss' | 'swiss_fide' | 'round_robin' | 'king_of_the_hill' | 'manual';

/** Mètodes que saben aparellar taules de més de dos (docs/pla-rols.md §13.1 #8). */
export const MULTI_PARTICIPANT_METHODS: PairingMethod[] = ['round_robin', 'manual'];

/**
 * Puntuació per posició (docs/pla-rols.md §12.10).
 *
 * `positionPoints[0]` són els punts del primer classificat de la partida. Els
 * empats reparteixen els punts de les posicions empatades, de manera que el
 * total repartit per partida no depèn dels empats.
 */
export interface ScoringConfig {
  positionPoints: number[];
  /** Punts per a les posicions més enllà de `positionPoints`. */
  trailingPoints: number;
  byePoints: number;
  forfeitPoints: number;
}

/** L'1v1 clàssic: victòria 1, derrota 0, empat 0,5 pel repartiment. */
export const DEFAULT_SCORING: ScoringConfig = {
  positionPoints: [1, 0],
  trailingPoints: 0,
  byePoints: 1,
  forfeitPoints: 0,
};

/** Àmbits de classificació que publica una fase (docs/pla-rols.md §12.5). */
export type StandingsScopeKey = 'global' | 'group' | 'team';

/** Com s'agreguen els resultats dels membres per a la classificació d'equips. */
export interface TeamAggregation {
  rule: 'sum' | 'avg' | 'top_n';
  /** Nombre de membres que compten quan la regla és `top_n`. */
  n?: number;
}

// ─── Configuració per mètode d'aparellament ───────────────────────────────────

export type ByeHandling = 'lowest_ranked' | 'random_last_group' | 'least_byes';
export type SeedingCriterion = 'points' | 'elo' | 'rank' | 'name';

/**
 * Partició per etiqueta, comuna als quatre mètodes automàtics (docs/pla-rols.md
 * §13.1 #8, Fase 2 de la migració grups→etiquetes). `tagIds` són les etiquetes
 * triades pel director com a particions d'aquesta fase — no "totes les
 * etiquetes de tothom", que amb etiquetes múltiples no definiria particions
 * netes. Només Round Robin admet `inter_tag` (enfrontar una etiqueta contra
 * una altra); als altres tres, partir vol dir calcular-hi dins una
 * classificació independent per partició, no té sentit un "inter".
 */
export type ExclusionMode = 'avoid' | 'forbid';

/**
 * Exclusió entre dues inscripcions concretes (Suís, Suís FIDE, Rei del
 * turó): "evitar" és una restricció tova que es relaxa si cal (com ja fa
 * avui l'evitar revanxes); "prohibir" és dura i pot deixar algú en bye.
 */
export interface EntryPairExclusion {
  mode: ExclusionMode;
  entryIds: [string, string];
}

/**
 * Exclusió entre dues etiquetes, només té sentit a Round Robin
 * interetiquetes (és l'únic mètode on dues etiquetes s'enfronten
 * directament). Sense mode: aquí no hi ha cap cerca alternativa a
 * relaxar, "evitar" i "prohibir" tindrien el mateix efecte, així que
 * sempre és una prohibició.
 */
export interface TagPairExclusion {
  tagIds: [string, string];
}

export interface SwissConfig {
  method: 'swiss';
  avoidRematches: boolean;
  byeHandling: ByeHandling;
  scoreGroupWindowSize: number;
  carryStandingsFromPhaseIds: string[];
  seedingCriteria: SeedingCriterion[];
  scope: 'all' | 'intra_tag';
  tagIds: string[];
  entryExclusions: EntryPairExclusion[];
}

export interface SwissFideConfig {
  method: 'swiss_fide';
  scope: 'all' | 'intra_tag';
  tagIds: string[];
  carryStandingsFromPhaseIds: string[];
  expectedRounds?: number;
  entryExclusions: EntryPairExclusion[];
}

export interface RoundRobinConfig {
  method: 'round_robin';
  scope: 'all' | 'intra_tag' | 'inter_tag';
  tagIds: string[];
  doubleRound: boolean;
  tagExclusions: TagPairExclusion[];
}

export interface KingOfTheHillConfig {
  method: 'king_of_the_hill';
  topN?: number | null;
  carryStandingsFromPhaseIds: string[];
  scope: 'all' | 'intra_tag';
  tagIds: string[];
  entryExclusions: EntryPairExclusion[];
}

export interface ManualConfig {
  method: 'manual';
  allowCsvImport: boolean;
}

export type PhaseConfig =
  | SwissConfig
  | SwissFideConfig
  | RoundRobinConfig
  | KingOfTheHillConfig
  | ManualConfig;

// ─── Partides ─────────────────────────────────────────────────────────────────

export type RoundStatus = 'draft' | 'open' | 'closed';

/** Derivat de `rank`; es desa, però el calcula una sola funció (esquema §8.2). */
export type Outcome = 'win' | 'draw' | 'loss' | 'bye' | 'forfeit';

// ─── Preguntes ────────────────────────────────────────────────────────────────

export type QuestionType = 'value' | 'wordvalue' | 'image';
export type QuestionScope = 'match' | 'participant';
export type AnswerType = 'text' | 'number';

/** Com es converteix una pregunta en mètrica de classificació (§12.1). */
export type QuestionAggregate = 'sum' | 'avg' | 'max' | 'count' | 'none';

// ─── Perfils de joc ───────────────────────────────────────────────────────────

/** Plantilla que es copia en crear una competició (docs/pla-rols.md §13.1 #4). */
export interface GameProfileConfig {
  scoring: ScoringConfig;
  tiebreakers: string[];
  participantsPerMatch: number;
  questions: GameProfileQuestion[];
}

export interface GameProfileQuestion {
  key: string;
  type: QuestionType;
  scope: QuestionScope;
  label: string;
  label1?: string;
  label2?: string;
  answerType?: AnswerType;
  aggregate: QuestionAggregate;
  usableAsTiebreaker: boolean;
  showInRanking: boolean;
  order: number;
}

// ─── Trobades ─────────────────────────────────────────────────────────────────

export type AttendanceStatus = 'confirmed' | 'declined' | 'pending';
