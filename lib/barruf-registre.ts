import { getBarrufConfig } from '@/lib/settings';

export interface BarrufJugador {
  numero: number;
  nom: string;
  club: string | null;
  barruf: number | null;
  categoria: string | null;
  estat: string;
  alies?: string[];
}

// El registre sencer es pot guardar en memòria cau un minut (docs/api.md).
// Compartit pel procés: cada petició amb un `q` diferent es filtra en
// memòria en lloc de tornar a demanar-lo riu amunt.
let cache: { fetchedAt: number; jugadors: BarrufJugador[] } | null = null;
const CACHE_MS = 60_000;

export async function loadRegistre(apiUrl: string): Promise<BarrufJugador[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache.jugadors;

  const res = await fetch(`${apiUrl}/jugadors`);
  if (!res.ok) throw new Error(`El BARRUF ha respost amb un error (${res.status})`);
  // L'API embolcalla el registre: {data, edicio, temporada, jugadors: [...]}.
  const body = await res.json();
  const jugadors: unknown = Array.isArray(body) ? body : body?.jugadors;
  if (!Array.isArray(jugadors)) throw new Error('Format inesperat del BARRUF');
  cache = { fetchedAt: Date.now(), jugadors };
  return jugadors;
}

/** Registre sencer, o null si la connexió amb el BARRUF no està configurada. */
export async function loadRegistreConfigurat(): Promise<BarrufJugador[] | null> {
  const config = await getBarrufConfig();
  if (!config) return null;
  return loadRegistre(config.apiUrl);
}

export function normalitzaNom(nom: string): string {
  return nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
