import { NextResponse } from 'next/server';
import { db } from '@/db';
import { groups, tournaments } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

type Params = { params: Promise<{ tournamentId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const all = await db
    .select()
    .from(groups)
    .where(eq(groups.tournamentId, tournamentId))
    .orderBy(asc(groups.order));
  return NextResponse.json(all);
}

export async function POST(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const body = await req.json();
  const { name, order } = body;

  if (!name) return NextResponse.json({ error: 'Cal un nom pel grup' }, { status: 400 });

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!tournament) return NextResponse.json({ error: 'Campionat no trobat' }, { status: 404 });

  const existingGroups = await db.select().from(groups).where(eq(groups.tournamentId, tournamentId));
  const newGroup = {
    id: uuid(),
    tournamentId,
    name,
    order: order ?? existingGroups.length + 1,
  };

  await db.insert(groups).values(newGroup);
  return NextResponse.json(newGroup, { status: 201 });
}
