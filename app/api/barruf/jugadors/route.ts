import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { getBarrufConfig } from '@/lib/settings';

/**
 * Cerca al registre de jugadors del BARRUF (docs/api.md), per vincular-los
 * en donar d'alta un inscrit. La lectura és pública riu amunt, però aquí es
 * manté darrere `requireRole` perquè és una eina de gestió, no un cercador
 * obert a qualsevol visitant.
 */

interface BarrufJugador {
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

async function loadRegistre(apiUrl: string): Promise<BarrufJugador[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache.jugadors;

  const res = await fetch(`${apiUrl}/jugadors`);
  if (!res.ok) throw new Error(`El BARRUF ha respost amb un error (${res.status})`);
  const jugadors = (await res.json()) as BarrufJugador[];
  cache = { fetchedAt: Date.now(), jugadors };
  return jugadors;
}

export async function GET(req: Request) {
  const guard = await requireRole('admin');
  if (guard.error) return guard.error;

  const config = await getBarrufConfig();
  if (!config) {
    return NextResponse.json(
      { error: "La connexió amb el BARRUF no està configurada (Configuració)" },
      { status: 503 }
    );
  }

  const query = (new URL(req.url).searchParams.get('q') ?? '').trim().toLowerCase();
  if (query.length < 2) return NextResponse.json([]);

  let registre: BarrufJugador[];
  try {
    registre = await loadRegistre(config.apiUrl);
  } catch {
    return NextResponse.json({ error: 'No s\'ha pogut contactar amb el BARRUF' }, { status: 502 });
  }

  const matches = registre.filter((j) => {
    if (j.nom.toLowerCase().includes(query)) return true;
    if (j.club?.toLowerCase().includes(query)) return true;
    return j.alies?.some((a) => a.toLowerCase().includes(query)) ?? false;
  });

  return NextResponse.json(
    matches.slice(0, 20).map((j) => ({
      numero: j.numero,
      nom: j.nom,
      club: j.club,
      barruf: j.barruf,
      categoria: j.categoria,
      estat: j.estat,
    }))
  );
}
