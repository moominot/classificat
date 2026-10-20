import { randomUUID } from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { registrationRequests, tournaments } from '@/db/schema';
import { getViewer, requireTournamentAccess } from '@/lib/authz';
import { findDuplicate, findViewerRequest, loadPendingRequests } from '@/lib/registrations';
import { DEVICE_COOKIE, DEVICE_COOKIE_OPTIONS } from '@/lib/session';

type Params = { params: Promise<{ tournamentId: string }> };

/** GET — Les sol·licituds pendents de validar (només qui gestiona la competició). */
export async function GET(_req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  return NextResponse.json(await loadPendingRequests(tournamentId));
}

/**
 * POST — El jugador demana inscriure's. Només amb les inscripcions obertes.
 *
 * Dues vies:
 *  - amb compte: n'hi ha prou amb dir que s'hi vol adherir (`{}`), la
 *    persona ja la sabem;
 *  - sense compte: `{ displayName, barrufNumero?, club?, rating? }`, amb les
 *    dades del BARRUF si ha triat un dels suggeriments.
 *
 * Com el «qui ets», no hi ha cap prova d'identitat (§15.2): per això ho ha
 * de validar qui gestiona la competició.
 */
export async function POST(req: Request, { params }: Params) {
  const { tournamentId } = await params;

  const [tournament] = await db
    .select({ status: tournaments.status })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId));
  if (!tournament) return NextResponse.json({ error: 'Competició no trobada' }, { status: 404 });
  if (tournament.status !== 'registration') {
    return NextResponse.json({ error: 'Les inscripcions no estan obertes' }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));

  const store = await cookies();
  const deviceId = store.get(DEVICE_COOKIE)?.value ?? randomUUID();
  store.set(DEVICE_COOKIE, deviceId, DEVICE_COOKIE_OPTIONS);

  const viewer = await getViewer(tournamentId);
  if (viewer.entryId) return NextResponse.json({ error: 'Ja estàs inscrit' }, { status: 409 });

  const account = viewer.account;
  const displayName = account
    ? account.displayName
    : typeof body.displayName === 'string'
      ? body.displayName.trim()
      : '';
  if (!displayName) return NextResponse.json({ error: 'Cal el teu nom' }, { status: 400 });

  const barrufNumero = !account && Number.isInteger(body.barrufNumero) ? (body.barrufNumero as number) : null;
  const personId = account?.personId ?? null;

  // Una sol·licitud nova d'aquest mateix mòbil o compte substitueix la que
  // tingués pendent o rebutjada (p. ex. si s'havia equivocat de nom).
  const anterior = await findViewerRequest(tournamentId, { ...viewer, deviceId });

  const duplicat = await findDuplicate(tournamentId, { personId, barrufNumero, exceptRequestId: anterior?.id });
  if (duplicat === 'entry') {
    return NextResponse.json({ error: 'Aquest jugador ja està inscrit' }, { status: 409 });
  }
  if (duplicat === 'request') {
    return NextResponse.json({ error: 'Aquest jugador ja té una inscripció pendent de validar' }, { status: 409 });
  }

  const request = {
    id: uuid(),
    tournamentId,
    personId,
    accountId: account?.id ?? null,
    displayName,
    club: !account && typeof body.club === 'string' ? body.club : null,
    rating: !account && Number.isInteger(body.rating) ? (body.rating as number) : null,
    barrufNumero,
    deviceId,
    status: 'pending' as const,
    createdAt: new Date(),
  };
  if (anterior) await db.delete(registrationRequests).where(eq(registrationRequests.id, anterior.id));
  await db.insert(registrationRequests).values(request);
  return NextResponse.json(request, { status: 201 });
}

/** DELETE — El jugador retira la seva sol·licitud pendent. */
export async function DELETE(_req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const viewer = await getViewer(tournamentId);
  const request = await findViewerRequest(tournamentId, viewer);
  if (request) {
    await db
      .delete(registrationRequests)
      .where(and(eq(registrationRequests.id, request.id), eq(registrationRequests.tournamentId, tournamentId)));
  }
  return NextResponse.json({ ok: true });
}
