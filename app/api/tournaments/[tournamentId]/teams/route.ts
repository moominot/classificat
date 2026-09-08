import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { teams, tournaments } from '@/db/schema';
import { requireTournamentAccess } from '@/lib/authz';

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * Equips d'una competició.
 *
 * Es juga sempre individualment: l'equip només serveix per agregar els
 * resultats dels seus membres a una classificació paral·lela (§12.9). La
 * pertinença viu a `entries.teamId`, per això aquí no hi ha cap taula de
 * membres.
 */
export async function GET(_req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const all = await db
    .select()
    .from(teams)
    .where(eq(teams.tournamentId, tournamentId))
    .orderBy(asc(teams.order));
  return NextResponse.json(all);
}

export async function POST(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const { name, order } = body;
  if (!name) return NextResponse.json({ error: "Cal un nom per a l'equip" }, { status: 400 });

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!tournament) return NextResponse.json({ error: 'Competició no trobada' }, { status: 404 });

  const existing = await db.select().from(teams).where(eq(teams.tournamentId, tournamentId));
  const newTeam = {
    id: uuid(),
    tournamentId,
    name: String(name).trim(),
    order: order ?? existing.length + 1,
  };

  await db.insert(teams).values(newTeam);
  return NextResponse.json(newTeam, { status: 201 });
}
