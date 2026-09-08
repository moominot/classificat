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
