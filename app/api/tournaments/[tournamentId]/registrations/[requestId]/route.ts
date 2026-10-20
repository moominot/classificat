import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { registrationRequests } from '@/db/schema';
import { requireTournamentAccess } from '@/lib/authz';
import { acceptRequest } from '@/lib/registrations';

type Params = { params: Promise<{ tournamentId: string; requestId: string }> };

/**
 * PATCH { action: 'accept' | 'reject' } — Qui gestiona la competició valida
 * una sol·licitud d'inscripció. Acceptar-la crea la inscripció; rebutjar-la
 * la deixa marcada perquè el jugador ho vegi a l'inici.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { tournamentId, requestId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  if (body.action !== 'accept' && body.action !== 'reject') {
    return NextResponse.json({ error: 'Acció no vàlida' }, { status: 400 });
  }

  const [request] = await db
    .select()
    .from(registrationRequests)
    .where(and(eq(registrationRequests.id, requestId), eq(registrationRequests.tournamentId, tournamentId)));
  if (!request) return NextResponse.json({ error: 'Sol·licitud no trobada' }, { status: 404 });
  if (request.status !== 'pending') {
    return NextResponse.json({ error: 'Aquesta sol·licitud ja està resolta' }, { status: 409 });
  }

  if (body.action === 'reject') {
    await db
      .update(registrationRequests)
      .set({ status: 'rejected', reviewedBy: guard.account.id, reviewedAt: new Date() })
      .where(eq(registrationRequests.id, requestId));
    return NextResponse.json({ ok: true });
  }

  const entryId = await acceptRequest(request, guard.account.id);
  return NextResponse.json({ ok: true, entryId });
}
