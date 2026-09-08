import { MULTI_PARTICIPANT_METHODS } from '@/db/types';
import type { PairingMethod } from './types';
import { isValidTiebreakerConfig } from './tiebreakers';

/**
 * Quins mètodes admeten taules de més de dos (docs/pla-rols.md §13.1 #8).
 *
 * Viu en un mòdul propi perquè la mateixa regla fa falta en tres llocs:
 * l'editor de fases (per no oferir el que no toca), la ruta que desa la fase
 * (per validar-ho) i el motor (per no generar aparellaments sense sentit).
 */
export function supportsTableSize(method: PairingMethod, participantsPerMatch: number): boolean {
  return participantsPerMatch <= 2 || MULTI_PARTICIPANT_METHODS.includes(method);
}

/** Missatge d'error corresponent, o null si la combinació és vàlida. */
export function tableSizeError(
  method: PairingMethod,
  participantsPerMatch: number
): string | null {
  if (supportsTableSize(method, participantsPerMatch)) return null;
  return (
    `El mètode "${method}" només funciona amb taules de dos. ` +
    `Per a taules de ${participantsPerMatch}, useu round robin o manual.`
  );
}

/**
 * Valida la configuració d'una fase sencera.
 *
 * Es crida en crear i en **desar**: canviar la mida de taula d'una fase ja
 * configurada hi podria deixar un desempat que no s'hi pot aplicar (§12.10).
 */
export function validatePhaseConfig(opts: {
  method: string;
  participantsPerMatch: number;
  tiebreakers: string[];
}): string | null {
  if (opts.participantsPerMatch < 1) return 'Cal com a mínim un participant per partida';

  const sizeError = tableSizeError(opts.method as PairingMethod, opts.participantsPerMatch);
  if (sizeError) return sizeError;

  if (!isValidTiebreakerConfig(opts.tiebreakers, { participantsPerMatch: opts.participantsPerMatch })) {
    return 'Hi ha desempats que no es poden aplicar amb aquesta mida de taula';
  }
  return null;
}
