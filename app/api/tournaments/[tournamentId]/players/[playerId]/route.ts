import { NextResponse } from 'next/server';
import { db } from '@/db';
import { players, groups, pairings } from '@/db/schema';
import { eq, and, or } from 'drizzle-orm';

type Params = { params: Promise<{ tournamentId: string; playerId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { tournamentId, playerId } = await params;

  const [player] = await db
    .select()
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.tournamentId, tournamentId)));

  if (!player) return NextResponse.json({ error: 'Jugador no trobat' }, { status: 404 });
  return NextResponse.json(player);
}

export async function PATCH(req: Request, { params }: Params) {
  const { tournamentId, playerId } = await params;
  const body = await req.json();

  const [player] = await db
    .select()
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.tournamentId, tournamentId)));

  if (!player) return NextResponse.json({ error: 'Jugador no trobat' }, { status: 404 });

  if (body.groupId) {
    const [group] = await db.select().from(groups).where(
      and(eq(groups.id, body.groupId), eq(groups.tournamentId, tournamentId))
    );
    if (!group) return NextResponse.json({ error: 'Grup no trobat' }, { status: 404 });
  }

  const updates: Partial<typeof player> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.rating !== undefined) updates.rating = body.rating;
  if (body.groupId !== undefined) updates.groupId = body.groupId;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.club !== undefined) updates.club = body.club;
  if (body.isActive !== undefined) updates.isActive = body.isActive;

  await db.update(players).set(updates).where(eq(players.id, playerId));
  return NextResponse.json({ ...player, ...updates });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { tournamentId, playerId } = await params;

  const [player] = await db
    .select()
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.tournamentId, tournamentId)));

  if (!player) return NextResponse.json({ error: 'Jugador no trobat' }, { status: 404 });

  const [existing] = await db
    .select({ id: pairings.id })
    .from(pairings)
    .where(or(eq(pairings.player1Id, playerId), eq(pairings.player2Id, playerId)))
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { error: 'No es pot esborrar un jugador que ja té aparellaments. Desactiva\'l en canvi.' },
      { status: 409 }
    );
  }

  await db.delete(players).where(eq(players.id, playerId));
  return new NextResponse(null, { status: 204 });
}
