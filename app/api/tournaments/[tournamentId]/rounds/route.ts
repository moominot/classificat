import { NextResponse } from 'next/server';
import { db } from '@/db';
import { rounds, pairings, phases, players, tournaments } from '@/db/schema';
import { eq, asc, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

type Params = { params: Promise<{ tournamentId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { tournamentId } = await params;

  const allRounds = await db
    .select()
    .from(rounds)
    .where(eq(rounds.tournamentId, tournamentId))
    .orderBy(asc(rounds.number));

  // Per a cada ronda, compta aparellaments jugats vs totals
  const enriched = await Promise.all(
    allRounds.map(async (r) => {
      const allPairings = await db
        .select({ id: pairings.id, outcome1: pairings.outcome1 })
        .from(pairings)
        .where(eq(pairings.roundId, r.id));

      const played = allPairings.filter((p) => p.outcome1 !== null).length;
      return {
        ...r,
        totalPairings: allPairings.length,
        playedPairings: played,
      };
    })
  );

  return NextResponse.json(enriched);
}

/**
 * POST — Crea una nova ronda per a una fase.
 * Body: { phaseId, number? }
 * Si no s'especifica number, s'assigna automàticament el següent disponible.
 */
export async function POST(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const body = await req.json();
  const { phaseId, number: requestedNumber } = body;

  if (!phaseId) return NextResponse.json({ error: 'Cal phaseId' }, { status: 400 });

  const [phase] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.id, phaseId), eq(phases.tournamentId, tournamentId)));

  if (!phase) return NextResponse.json({ error: 'Fase no trobada' }, { status: 404 });
  if (phase.isComplete) return NextResponse.json({ error: 'La fase ja està tancada' }, { status: 409 });

  // Determina el número de ronda
  const existingRounds = await db
    .select()
    .from(rounds)
    .where(eq(rounds.tournamentId, tournamentId));

  let roundNumber = requestedNumber;
  if (!roundNumber) {
    const maxRound = existingRounds.reduce((max, r) => Math.max(max, r.number), 0);
    roundNumber = maxRound + 1;
  }

  // Verifica que el número de ronda sigui dins el rang de la fase
  if (roundNumber < phase.startRound || roundNumber > phase.endRound) {
    return NextResponse.json(
      { error: `El número de ronda ${roundNumber} està fora del rang de la fase (${phase.startRound}–${phase.endRound})` },
      { status: 400 }
    );
  }

  // Verifica que no existeixi ja
  const existing = existingRounds.find((r) => r.number === roundNumber);
  if (existing) {
    return NextResponse.json({ error: `La ronda ${roundNumber} ja existeix` }, { status: 409 });
  }

  const newRound = {
    id: uuid(),
    tournamentId,
    phaseId,
    number: roundNumber,
    isComplete: false,
    createdAt: new Date(),
  };

  await db.insert(rounds).values(newRound);
  return NextResponse.json(newRound, { status: 201 });
}
