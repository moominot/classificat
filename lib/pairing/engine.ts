import type { CsvMatchRow, PairingContext, PairingEngineResult } from './types';
import { tableSizeError } from './validation';
import { generateSwissPairings } from './methods/swiss';
import { generateSwissFidePairings } from './methods/swiss-fide';
import { generateRoundRobinPairings } from './methods/round-robin';
import { generateKingOfTheHillPairings } from './methods/king-of-the-hill';
import { generateManualPairings } from './methods/manual';

/**
 * Motor d'aparellaments: decideix quin algorisme toca segons la fase i hi
 * delega. Afegir un sistema nou continua sent afegir un fitxer a `methods/` i
 * una branca aquí.
 */
export function generatePairings(
  ctx: PairingContext,
  csvRows?: CsvMatchRow[]
): PairingEngineResult {
  const { method, participantsPerMatch } = ctx.phase;

  // La interfície no hauria d'oferir mètodes d'1v1 en fases de taules més
  // grans; si hi arriben igualment, val més aturar-se que generar
  // aparellaments que no volen dir res.
  const sizeError = tableSizeError(method, participantsPerMatch);
  if (sizeError) {
    return {
      matches: [],
      warnings: [{ type: 'uneven_table', message: sizeError, affectedEntryIds: [] }],
    };
  }

  const result = dispatch(method, ctx, csvRows);
  normalizeByeTableNumbers(result);
  return result;
}

function dispatch(
  method: PairingContext['phase']['method'],
  ctx: PairingContext,
  csvRows?: CsvMatchRow[]
): PairingEngineResult {
  switch (method) {
    case 'swiss':
      return generateSwissPairings(ctx);

    case 'swiss_fide':
      return generateSwissFidePairings(ctx);

    case 'round_robin':
      return generateRoundRobinPairings(ctx);

    case 'king_of_the_hill':
      return generateKingOfTheHillPairings(ctx);

    case 'manual':
      if (!csvRows || csvRows.length === 0) {
        return {
          matches: [],
          warnings: [
            {
              type: 'incomplete_round_robin',
              message: "Aparellament manual: no s'han proporcionat taules.",
              affectedEntryIds: [],
            },
          ],
        };
      }
      return generateManualPairings(ctx, csvRows);

    default:
      throw new Error(`Mètode d'aparellament desconegut: ${method}`);
  }
}

/**
 * Cada mètode marca els byes amb `tableNumber: -1` o `0` com a placeholder;
 * (roundId, tableNumber) és únic a la base de dades, així que amb més d'un
 * bye a la mateixa ronda (possible des que les exclusions "prohibir" poden
 * forçar-ne diversos) calen números diferents abans de desar-los.
 */
function normalizeByeTableNumbers(result: PairingEngineResult): void {
  const played = result.matches.filter((m) => m.entryIds.length > 1);
  const maxPlayed = played.reduce((max, m) => Math.max(max, m.tableNumber), 0);
  let nextByeTable = maxPlayed + 1;
  for (const match of result.matches) {
    if (match.entryIds.length === 1) match.tableNumber = nextByeTable++;
  }
}
