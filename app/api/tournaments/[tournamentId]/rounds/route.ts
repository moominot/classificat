import { NextResponse } from 'next/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { matchParticipants, matches, phases, rounds } from '@/db/schema';
import { canManageTournament, getCurrentAccount, requireTournamentAccess } from '@/lib/authz';

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * GET — Les rondes visibles per a qui pregunta.
 *
 * Les rondes en esborrany només existeixen per a qui gestiona la competició
 * (docs/pla-rols.md §8.2): el filtre es fa aquí i no a la interfície, perquè
 * amagar-ho a la pantalla deixaria l'API servint-ho igualment (§8.3).
 */
export async function GET(_req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const account = await getCurrentAccount();
  const canManage = account ? await canManageTournament(account, tournamentId) : false;

  const allRounds = await db
    .select()
    .from(rounds)
    .where(eq(rounds.tournamentId, tournamentId))
    .orderBy(asc(rounds.number));

  const visible = canManage ? allRounds : allRounds.filter((r) => r.status !== 'draft');
  if (visible.length === 0) return NextResponse.json([]);

  const roundMatches = await db
    .select({ id: matches.id, roundId: matches.roundId })
    .from(matches)
    .where(inArray(matches.roundId, visible.map((r) => r.id)));

  const participants = roundMatches.length
    ? await db
        .select({ matchId: matchParticipants.matchId, rank: matchParticipants.rank })
        .from(matchParticipants)
        .where(inArray(matchParticipants.matchId, roundMatches.map((m) => m.id)))
    : [];

  const enriched = visible.map((round) => {
    const ids = roundMatches.filter((m) => m.roundId === round.id).map((m) => m.id);
    const played = ids.filter((id) => {
      const rows = participants.filter((p) => p.matchId === id);
      return rows.length > 0 && rows.every((p) => p.rank !== null);
    });

    return { ...round, totalMatches: ids.length, playedMatches: played.length };
  });

  return NextResponse.json(enriched);
}

/**
 * POST — Crea una ronda. Neix en esborrany: l'admin decideix quan es publica.
 */
export async function POST(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const { phaseId, number: requestedNumber } = body;
  if (!phaseId) return NextResponse.json({ error: 'Cal phaseId' }, { status: 400 });

  const [phase] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.id, phaseId), eq(phases.tournamentId, tournamentId)));

  if (!phase) return NextResponse.json({ error: 'Fase no trobada' }, { status: 404 });
  if (phase.isComplete) return NextResponse.json({ error: 'La fase ja està tancada' }, { status: 409 });

  const existing = await db.select().from(rounds).where(eq(rounds.tournamentId, tournamentId));
  const number = requestedNumber ?? existing.reduce((max, r) => Math.max(max, r.number), 0) + 1;

  if (number < phase.startRound || number > phase.endRound) {
    return NextResponse.json(
      { error: `La ronda ${number} està fora del rang de la fase (${phase.startRound}–${phase.endRound})` },
      { status: 400 }
    );
  }
  if (existing.some((r) => r.number === number)) {
    return NextResponse.json({ error: `La ronda ${number} ja existeix` }, { status: 409 });
  }

  const newRound = {
    id: uuid(),
    tournamentId,
    phaseId,
    number,
    status: 'draft' as const,
    pairingsVisible: null,
    resultsVisible: null,
    createdAt: new Date(),
  };

  await db.insert(rounds).values(newRound);
  return NextResponse.json(newRound, { status: 201 });
}
