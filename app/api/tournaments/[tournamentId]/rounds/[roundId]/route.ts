import { NextResponse } from 'next/server';
import { db } from '@/db';
import { rounds, pairings, players } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

type Params = { params: Promise<{ tournamentId: string; roundId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { tournamentId, roundId } = await params;

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.tournamentId, tournamentId)));

  if (!round) return NextResponse.json({ error: 'Ronda no trobada' }, { status: 404 });

  const allPairings = await db
    .select()
    .from(pairings)
    .where(eq(pairings.roundId, roundId));

  // Enriqueix amb noms de jugadors
  const playerIds = new Set<string>();
  allPairings.forEach((p) => {
    playerIds.add(p.player1Id);
    if (p.player2Id) playerIds.add(p.player2Id);
  });

  const allPlayers = await db.select().from(players);
  const playerMap = new Map(allPlayers.map((p) => [p.id, p.name]));

  const enrichedPairings = allPairings.map((p) => ({
    ...p,
    player1Name: playerMap.get(p.player1Id) ?? '?',
    player2Name: p.player2Id ? (playerMap.get(p.player2Id) ?? '?') : null,
  }));

  return NextResponse.json({ ...round, pairings: enrichedPairings });
}

export async function PATCH(req: Request, { params }: Params) {
  const { tournamentId, roundId } = await params;
  const body = await req.json();

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.tournamentId, tournamentId)));

  if (!round) return NextResponse.json({ error: 'Ronda no trobada' }, { status: 404 });

  const updates: Partial<typeof round> = {};
  if (body.isComplete !== undefined) updates.isComplete = body.isComplete;

  await db.update(rounds).set(updates).where(eq(rounds.id, roundId));
  return NextResponse.json({ ...round, ...updates });
}
