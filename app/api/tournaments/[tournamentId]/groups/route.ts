import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { groups, tournaments } from '@/db/schema';
import { requireTournamentAccess } from '@/lib/authz';

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
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const { name, order } = body;
  if (!name) return NextResponse.json({ error: 'Cal un nom per al grup' }, { status: 400 });

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!tournament) return NextResponse.json({ error: 'Competició no trobada' }, { status: 404 });

  const existing = await db.select().from(groups).where(eq(groups.tournamentId, tournamentId));
  const newGroup = {
    id: uuid(),
    tournamentId,
    name: String(name).trim(),
    order: order ?? existing.length + 1,
  };

  await db.insert(groups).values(newGroup);
  return NextResponse.json(newGroup, { status: 201 });
}
