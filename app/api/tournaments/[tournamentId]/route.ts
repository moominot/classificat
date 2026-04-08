import { NextResponse } from 'next/server';
import { db } from '@/db';
import { tournaments, phases, rounds, players, groups } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

type Params = { params: Promise<{ tournamentId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { tournamentId } = await params;

  const [tournament] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId));

  if (!tournament) {
    return NextResponse.json({ error: 'Campionat no trobat' }, { status: 404 });
  }

  const [allPhases, allPlayers, allGroups] = await Promise.all([
    db.select().from(phases).where(eq(phases.tournamentId, tournamentId)).orderBy(asc(phases.order)),
    db.select().from(players).where(eq(players.tournamentId, tournamentId)).orderBy(asc(players.name)),
    db.select().from(groups).where(eq(groups.tournamentId, tournamentId)).orderBy(asc(groups.order)),
  ]);

  return NextResponse.json({ ...tournament, phases: allPhases, players: allPlayers, groups: allGroups });
}

export async function PATCH(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const body = await req.json();

  const [existing] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!existing) return NextResponse.json({ error: 'Campionat no trobat' }, { status: 404 });

  const updates: Partial<typeof existing> = {};
  if (body.name) updates.name = body.name;
  updates.updatedAt = new Date();

  await db.update(tournaments).set(updates).where(eq(tournaments.id, tournamentId));
  return NextResponse.json({ ...existing, ...updates });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { tournamentId } = await params;

  const [existing] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!existing) return NextResponse.json({ error: 'Campionat no trobat' }, { status: 404 });

  await db.delete(tournaments).where(eq(tournaments.id, tournamentId));
  return new NextResponse(null, { status: 204 });
}
