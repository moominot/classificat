/**
 * Extreu el missatge d'error d'una resposta fetch no-ok sense petar si el cos
 * no és JSON vàlid (p.ex. una resposta buida per un error 500 no gestionat).
 */
export async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return fallback;
    const data = JSON.parse(text);
    return data?.error ?? fallback;
  } catch {
    return fallback;
  }
}
