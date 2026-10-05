// Motor d'aparellaments i classificacions — API pública

export { generatePairings } from './engine';
export { computeStandings, computeTeamStandings } from './standings';
export type { ScoredMatch, StandingsInput, MetricAnswer, QuestionMetric } from './standings';

export { deriveOutcome, distributePoints, pointsForPosition, ranksFromScores, scoreMatch } from './scoring';
export type { ScoredParticipant } from './scoring';

export {
  availableTiebreakers,
  isValidTiebreakerConfig,
  resolveTiebreaker,
  sortStandings,
  METRIC_PREFIX,
  TIEBREAKERS,
} from './tiebreakers';

export { bergerSchedule, roundRobinTotalRounds } from './methods/round-robin';
export { parseCsvForManualImport } from './methods/manual';

export type {
  ByeHandling,
  CsvMatchRow,
  Entrant,
  GeneratedMatch,
  Group,
  KingOfTheHillConfig,
  ManualConfig,
  Match,
  MatchParticipant,
  Outcome,
  PairingContext,
  PairingEngineResult,
  PairingMethod,
  PairingWarning,
  Phase,
  PhaseConfig,
  PreviousMatch,
  Round,
  RoundRobinConfig,
  RoundStatus,
  ScoringConfig,
  SeedingCriterion,
  Standing,
  StandingsScopeKey,
  SwissConfig,
  SwissFideConfig,
  Team,
  TeamAggregation,
  TeamStanding,
  TiebreakerContext,
  TiebreakerDef,
} from './types';

export { hasResult, isBye, isTiebreakerApplicable } from './types';
