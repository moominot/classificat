import { NextResponse } from 'next/server';
import { requireTournamentAccess } from '@/lib/authz';
import { getBarrufConfig } from '@/lib/settings';
import { buildCampionatPayload } from '@/lib/barruf-export';

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * POST — Envia els resultats d'una competició al BARRUF (docs/api.md).
 *
 * No es publica directament: el BARRUF ho deixa pendent fins que un gestor
 * el revisa i l'importa. Es pot enviar a mig torneig; cada enviament és una
 * versió nova del mateix `id_extern` (el slug de la competició).
 */
export async function POST(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const config = await getBarrufConfig();
  if (!config) {
    return NextResponse.json(
      { error: "La connexió amb el BARRUF no està configurada (Configuració)" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { data, organitzador, clubOrganitzador } = body;
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: 'Cal la data del campionat (AAAA-MM-DD)' }, { status: 400 });
  }

  const { payload, partidesOmeses } = await buildCampionatPayload(tournamentId, {
    data,
    organitzador: organitzador || undefined,
    clubOrganitzador: clubOrganitzador || undefined,
  });

  let upstream: Response;
  try {
    upstream = await fetch(`${config.apiUrl}/campionats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(payload),
    });
  } catch {
    return NextResponse.json({ error: 'No s\'ha pogut contactar amb el BARRUF' }, { status: 502 });
  }

  const upstreamBody = await upstream.json().catch(() => ({}));
  return NextResponse.json({ ...upstreamBody, partidesOmeses }, { status: upstream.status });
}
