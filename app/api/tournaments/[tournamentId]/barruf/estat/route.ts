import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { tournaments } from '@/db/schema';
import { requireTournamentAccess } from '@/lib/authz';
import { getBarrufConfig } from '@/lib/settings';

type Params = { params: Promise<{ tournamentId: string }> };

/** GET — En quin punt és l'últim enviament d'aquesta competició (docs/api.md). */
export async function GET(_req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const config = await getBarrufConfig();
  if (!config) return NextResponse.json({ enviat: false });

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!tournament) return NextResponse.json({ error: 'Competició no trobada' }, { status: 404 });

  let upstream: Response;
  try {
    upstream = await fetch(`${config.apiUrl}/campionats/${encodeURIComponent(tournament.slug)}`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
  } catch {
    return NextResponse.json({ error: 'No s\'ha pogut contactar amb el BARRUF' }, { status: 502 });
  }

  if (upstream.status === 404) return NextResponse.json({ enviat: false });

  const body = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return NextResponse.json(body, { status: upstream.status });

  return NextResponse.json({ enviat: true, ...body });
}
