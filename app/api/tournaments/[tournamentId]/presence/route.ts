import { NextResponse } from 'next/server';
import { canManageTournament, getViewer } from '@/lib/authz';
import {
  clearPresence,
  entryBelongsTo,
  lastPlannedRound,
  awaitingRound,
  loadPresence,
  needsAnswer,
  roundIsPaired,
  setPresence,
} from '@/lib/presence';

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * GET — Què li toca respondre a qui mira: la ronda que espera confirmació i el
 * seu estat. És el que consulten els mòbils cada pocs segons (no exposa res
 * més que l'estat propi).
 */
export async function GET(_req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const viewer = await getViewer(tournamentId);
  const round = await awaitingRound(tournamentId);
  const roundNumber = round?.number ?? null;
  if (!round || !viewer.entryId) {
    return NextResponse.json({ roundNumber, status: 'pending' });
  }
  const row = (await loadPresence(tournamentId, round.number)).get(viewer.entryId);
  // `pending` vol dir «pregunta-li»: no ha dit res o només hi ha una previsió d'abans de la ronda.
  return NextResponse.json({
    roundNumber,
    status: needsAnswer(row, round.createdAt) ? 'pending' : (row?.status ?? 'pending'),
  });
}

/**
 * POST { roundNumber, status: 'present' | 'absent' | 'pending', entryId? }
 *
 * Un jugador identificat marca el seu propi estat. El director pot marcar
 * qualsevol jugador, i el que marca mana sobre la resta. `pending` només el
 * pot posar el director (desfà la seva marca).
 *
 * La identitat és declarada, no demostrada (§15.2): és un avís per estalviar
 * refer aparellaments, no un pany. Per això queda traça de qui i des d'on.
 */
export async function POST(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const body = await req.json().catch(() => ({}));
  const roundNumber = Number(body.roundNumber);
  const status = body.status as string;

  if (!Number.isInteger(roundNumber) || roundNumber < 1) {
    return NextResponse.json({ error: 'Ronda no vàlida' }, { status: 400 });
  }
  if (status !== 'present' && status !== 'absent' && status !== 'pending') {
    return NextResponse.json({ error: 'Estat no vàlid' }, { status: 400 });
  }

  const viewer = await getViewer(tournamentId);
  const manages = viewer.account ? await canManageTournament(viewer.account, tournamentId) : false;

  const entryId: string | null = manages && typeof body.entryId === 'string' ? body.entryId : viewer.entryId;
  if (!entryId) {
    return NextResponse.json({ error: "Cal que t'identifiquis com a jugador" }, { status: 403 });
  }
  if (!(await entryBelongsTo(tournamentId, entryId))) {
    return NextResponse.json({ error: 'Jugador no trobat' }, { status: 404 });
  }
  if (status === 'pending' && !manages) {
    return NextResponse.json({ error: 'Només el director pot tornar a pendent' }, { status: 403 });
  }
  if (roundNumber > (await lastPlannedRound(tournamentId))) {
    return NextResponse.json({ error: 'Aquesta ronda no és prevista' }, { status: 400 });
  }
  if (await roundIsPaired(tournamentId, roundNumber)) {
    return NextResponse.json({ error: 'Els aparellaments d’aquesta ronda ja estan fets' }, { status: 409 });
  }

  if (status === 'pending') {
    await clearPresence(tournamentId, roundNumber, entryId);
    return NextResponse.json({ ok: true });
  }

  const saved = await setPresence({
    tournamentId,
    roundNumber,
    entryId,
    status,
    source: manages ? 'admin' : 'player',
    deviceId: viewer.deviceId,
    accountId: viewer.account?.id ?? null,
  });
  if (!saved) {
    return NextResponse.json({ error: 'El director ja ha marcat aquest jugador' }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
