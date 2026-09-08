import type {
  CsvMatchRow,
  GeneratedMatch,
  PairingContext,
  PairingEngineResult,
  PairingWarning,
} from '../types';
import { parseMatchCsv } from '../utils/csv';

/**
 * Aparellament manual: accepta taules ja fetes (CSV o directament).
 *
 * Admet qualsevol nombre de participants per taula, perquè és el mètode que
 * fa servir qui munta les taules a mà.
 */
export function generateManualPairings(
  ctx: PairingContext,
  rows: CsvMatchRow[]
): PairingEngineResult {
  const validEntryIds = new Set(ctx.entrants.map((e) => e.id));
  const warnings: PairingWarning[] = [];
  const matches: GeneratedMatch[] = [];
  const size = ctx.phase.participantsPerMatch;

  for (const row of rows) {
    const unknown = row.entryIds.filter((id) => !validEntryIds.has(id));
    if (unknown.length > 0) {
      warnings.push({
        type: 'cross_group_pair',
        message: `Jugador desconegut: ${unknown[0]}`,
        affectedEntryIds: unknown,
      });
      continue;
    }

    // Una taula més curta és legítima (un bye, o el residu del repartiment),
    // però val la pena dir-ho perquè sovint és un error de transcripció.
    if (row.entryIds.length !== size && row.entryIds.length !== 1) {
      warnings.push({
        type: 'uneven_table',
        message: `La taula ${row.tableNumber} té ${row.entryIds.length} jugadors i la fase n'espera ${size}.`,
        affectedEntryIds: row.entryIds,
      });
    }

    matches.push({ tableNumber: row.tableNumber, entryIds: row.entryIds });
  }

  return { matches, warnings };
}

export function parseCsvForManualImport(
  csvText: string,
  validEntryIds: Set<string>
): { rows: CsvMatchRow[]; errors: string[] } {
  return parseMatchCsv(csvText, validEntryIds);
}
