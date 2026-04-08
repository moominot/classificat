import type {
  PairingContext,
  PairingEngineResult,
  CsvPairingRow,
} from './types';
import { generateSwissPairings } from './methods/swiss';
import { generateRoundRobinPairings } from './methods/round-robin';
import { generateKingOfTheHillPairings } from './methods/king-of-the-hill';
import { generateManualPairings } from './methods/manual';

/**
 * Motor d'aparellaments principal — orquestrador modular.
 *
 * Decideix quin algorisme d'aparellament aplicar en funció del mètode
 * configurat a la fase activa i delega al mòdul corresponent.
 *
 * @param ctx      Context complet amb fase, jugadors, classificació i historial
 * @param csvRows  Files CSV per a aparellament manual (opcional)
 */
export function generatePairings(
  ctx: PairingContext,
  csvRows?: CsvPairingRow[]
): PairingEngineResult {
  const { method } = ctx.phase;

  switch (method) {
    case 'swiss':
      return generateSwissPairings(ctx);

    case 'round_robin':
      return generateRoundRobinPairings(ctx);

    case 'king_of_the_hill':
      return generateKingOfTheHillPairings(ctx);

    case 'manual':
      if (!csvRows || csvRows.length === 0) {
        return {
          pairings: [],
          warnings: [
            {
              type: 'incomplete_round_robin',
              message: 'Aparellament manual: no s\'han proporcionat aparellaments.',
              affectedPlayerIds: [],
            },
          ],
        };
      }
      return generateManualPairings(ctx, csvRows);

    default:
      throw new Error(`Mètode d'aparellament desconegut: ${method}`);
  }
}
