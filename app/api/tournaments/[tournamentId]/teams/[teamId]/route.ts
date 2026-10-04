import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { teams } from '@/db/schema';
import { requireTournamentAccess } from '@/lib/authz';

type Params = { params: Promise<{ tournamentId: string; teamId: string }> };

async function findTeam(tournamentId: string, teamId: string) {
  const [team] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.tournamentId, tournamentId)));
  return team ?? null;
}

export async function PATCH(req: Request, { params }: Params) {
  const { tournamentId, teamId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const team = await findTeam(tournamentId, teamId);
  if (!team) return NextResponse.json({ error: 'Equip no trobat' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: "Cal un nom per a l'equip" }, { status: 400 });

  await db.update(teams).set({ name }).where(eq(teams.id, teamId));
  return NextResponse.json({ ...team, name });
}

/**
 * DELETE — Esborra l'equip. Els jugadors se'n queden sense (`set null`), i
 * les partides ja jugades també perden la instantània de l'equip.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { tournamentId, teamId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const team = await findTeam(tournamentId, teamId);
  if (!team) return NextResponse.json({ error: 'Equip no trobat' }, { status: 404 });

  await db.delete(teams).where(eq(teams.id, teamId));
  return new NextResponse(null, { status: 204 });
}
