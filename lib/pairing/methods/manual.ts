import type {
  PairingContext,
  PairingEngineResult,
  CsvPairingRow,
} from '../types';
import { parsePairingCsv } from '../utils/csv';

/**
 * Motor d'aparellaments manual.
 *
 * Accepta aparellaments ja generats externament (via CSV o JSON directe).
 * Valida que tots els jugadors existeixin i que no hi hagi duplicats.
 */
export function generateManualPairings(
  ctx: PairingContext,
  rows: CsvPairingRow[]
): PairingEngineResult {
  const validPlayerIds = new Set(ctx.players.map((p) => p.id));
  const warnings = [];
  const pairings = [];

  for (const row of rows) {
    if (!validPlayerIds.has(row.player1Id)) {
      warnings.push({
        type: 'cross_group_pair' as const,
        message: `Jugador desconegut: ${row.player1Id}`,
        affectedPlayerIds: [row.player1Id],
      });
      continue;
    }
    if (row.player2Id !== null && !validPlayerIds.has(row.player2Id)) {
      warnings.push({
        type: 'cross_group_pair' as const,
        message: `Jugador desconegut: ${row.player2Id}`,
        affectedPlayerIds: [row.player2Id],
      });
      continue;
    }

    pairings.push({
      tableNumber: row.tableNumber,
      player1Id: row.player1Id,
      player2Id: row.player2Id,
    });
  }

  return { pairings, warnings };
}

/**
 * Parseja un CSV i retorna les files d'aparellaments o errors.
 */
export function parseCsvForManualImport(
  csvText: string,
  validPlayerIds: Set<string>
): { rows: CsvPairingRow[]; errors: string[] } {
  return parsePairingCsv(csvText, validPlayerIds);
}
