// Motor d'aparellaments — API pública
export { generatePairings } from './engine';
export { computeStandings } from './standings';
export { buildComparator } from './tiebreakers';
export { bergerSchedule, roundRobinTotalRounds } from './methods/round-robin';
export { parseCsvForManualImport } from './methods/manual';

// Tipus
export type {
  PairingMethod,
  Tiebreaker,
  GameOutcome,
  ByeHandling,
  Player,
  Group,
  Phase,
  PhaseConfig,
  SwissConfig,
  RoundRobinConfig,
  KingOfTheHillConfig,
  ManualConfig,
  Round,
  Pairing,
  PairingResult,
  Standing,
  TiebreakerValues,
  PreviousPairing,
  PairingContext,
  PairingEngineResult,
  PairingWarning,
  GeneratedPairing,
  CsvPairingRow,
} from './types';
