import type { Entrant, PairingWarning } from '../types';

/** Bossa dels inscrits actius que no tenen cap de les etiquetes triades. */
export const SENSE_ETIQUETA = '__sense_etiqueta__';

/**
 * Parteix els inscrits actius en bosses segons quina de les `tagIds`
 * triades pel director té cadascun (docs/pla-rols.md §13.1 #8, Fase 2).
 *
 * A diferència d'un grup (un sol valor), un jugador pot tenir diverses de
 * les etiquetes triades alhora — no hi ha una partició "natural". La regla:
 * la primera, per l'ordre en què el director les ha triades; es genera un
 * avís perquè no quedi en silenci. Qui no en té cap de les triades cau a
 * `SENSE_ETIQUETA`, igual que abans queia a "sense grup".
 */
export function partitionByTags(
  entrants: Entrant[],
  tagIds: string[]
): { partitions: Map<string, string[]>; warnings: PairingWarning[] } {
  const partitions = new Map<string, string[]>();
  const warnings: PairingWarning[] = [];
  const ambiguus: string[] = [];

  for (const entrant of entrants.filter((e) => e.isActive)) {
    const seves = tagIds.filter((t) => entrant.tagIds?.includes(t));
    const key = seves[0] ?? SENSE_ETIQUETA;
    if (seves.length > 1) ambiguus.push(entrant.id);
    partitions.set(key, [...(partitions.get(key) ?? []), entrant.id]);
  }

  if (ambiguus.length > 0) {
    warnings.push({
      type: 'multiple_tag_match',
      message:
        ambiguus.length !== 1
          ? `${ambiguus.length} jugadors tenen més d'una de les etiquetes triades: s'ha fet servir la primera (per l'ordre triat).`
          : `1 jugador té més d'una de les etiquetes triades: s'ha fet servir la primera (per l'ordre triat).`,
      affectedEntryIds: ambiguus,
    });
  }

  return { partitions, warnings };
}
