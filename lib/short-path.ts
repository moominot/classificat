/**
 * Adreça curta d'un campionat: `/<shortPath>` redirigeix a `/campionat/<id>`.
 *
 * És independent del `slug`, que fa d'`id_extern` al BARRUF i no es pot
 * canviar sense que el BARRUF el prengui per un campionat nou.
 */

/** Rutes de primer nivell de l'aplicació: una adreça curta no les pot tapar. */
const RESERVED = new Set([
  'api', 'campionat', 'configuracio', 'login', 'preferencies', 'uploads', 'usuaris', 'favicon',
]);

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // elimina diacrítics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Torna l'adreça normalitzada, o un missatge d'error. */
export function validateShortPath(raw: string): { value: string } | { error: string } {
  const value = slugify(raw);
  if (value.length < 2) return { error: "L'adreça curta ha de tenir almenys 2 caràcters" };
  if (value.length > 40) return { error: "L'adreça curta no pot passar de 40 caràcters" };
  if (RESERVED.has(value)) return { error: `«${value}» és una adreça reservada de l'aplicació` };
  return { value };
}
