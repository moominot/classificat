import { NextResponse } from 'next/server';
import { db } from '@/db';
import { players, tournaments, groups } from '@/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

type Params = { params: Promise<{ tournamentId: string }> };

export async function GET(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const url = new URL(req.url);
  const groupId = url.searchParams.get('groupId');

  let query = db
    .select()
    .from(players)
    .where(eq(players.tournamentId, tournamentId));

  const all = await query.orderBy(asc(players.name));

  const filtered = groupId
    ? all.filter((p) => p.groupId === groupId)
    : all;

  return NextResponse.json(filtered);
}

export async function POST(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const body = await req.json();
  const { name, rating, groupId, phone, club } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Cal un nom de jugador' }, { status: 400 });
  }

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!tournament) return NextResponse.json({ error: 'Campionat no trobat' }, { status: 404 });

  if (groupId) {
    const [group] = await db.select().from(groups).where(
      and(eq(groups.id, groupId), eq(groups.tournamentId, tournamentId))
    );
    if (!group) return NextResponse.json({ error: 'Grup no trobat' }, { status: 404 });
  }

  const newPlayer = {
    id: uuid(),
    tournamentId,
    name: name.trim(),
    rating: rating ?? null,
    groupId: groupId ?? null,
    phone: phone ?? null,
    club: club ?? null,
    isActive: true,
    createdAt: new Date(),
  };

  await db.insert(players).values(newPlayer);
  return NextResponse.json(newPlayer, { status: 201 });
}
