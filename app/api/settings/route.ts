import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { getSetting, setSetting } from '@/lib/settings';

/**
 * Configuració global de l'aplicació. Avui només la connexió amb el BARRUF,
 * però la clau és genèrica per si n'hi ha d'altres més endavant.
 */

export async function GET() {
  const guard = await requireRole('admin');
  if (guard.error) return guard.error;

  const [apiUrl, apiKey] = await Promise.all([
    getSetting('barruf_api_url'),
    getSetting('barruf_api_key'),
  ]);

  // La clau no es torna mai, igual que les contrasenyes: només si n'hi ha una desada.
  return NextResponse.json({ barrufApiUrl: apiUrl, barrufApiKeyConfigured: Boolean(apiKey) });
}

export async function PATCH(req: Request) {
  const guard = await requireRole('superadmin');
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const { barrufApiUrl, barrufApiKey } = body;

  if (barrufApiUrl !== undefined) {
    if (typeof barrufApiUrl !== 'string' || barrufApiUrl.trim().length === 0) {
      return NextResponse.json({ error: "Cal l'adreça de l'API" }, { status: 400 });
    }
    await setSetting('barruf_api_url', barrufApiUrl.trim());
  }

  // Una clau buida es descarta en lloc d'esborrar l'existent: el formulari
  // la deixa en blanc quan no se'n vol canviar el valor desat.
  if (typeof barrufApiKey === 'string' && barrufApiKey.trim().length > 0) {
    await setSetting('barruf_api_key', barrufApiKey.trim());
  }

  return NextResponse.json({ ok: true });
}
