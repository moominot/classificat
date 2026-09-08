import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { groups, phases, teams, tournaments } from '@/db/schema';
import { getCurrentAccount, canManageTournament, requireTournamentAccess } from '@/lib/authz';
import { loadEntrants } from '@/lib/db-helpers';

type Params = { params: Promise<{ tournamentId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { tournamentId } = await params;

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!tournament) return NextResponse.json({ error: 'Competició no trobada' }, { status: 404 });

  const [allPhases, entrants, allGroups, allTeams] = await Promise.all([
    db.select().from(phases).where(eq(phases.tournamentId, tournamentId)).orderBy(asc(phases.order)),
    loadEntrants(tournamentId),
    db.select().from(groups).where(eq(groups.tournamentId, tournamentId)).orderBy(asc(groups.order)),
    db.select().from(teams).where(eq(teams.tournamentId, tournamentId)).orderBy(asc(teams.order)),
  ]);

  const account = await getCurrentAccount();
  const canManage = account ? await canManageTournament(account, tournamentId) : false;

  return NextResponse.json({
    ...tournament,
    // La configuració de visibilitat és cosa de qui gestiona: al jugador li
    // arriben les dades ja filtrades, no les regles.
    visibility: canManage ? tournament.visibility : undefined,
    canManage,
    phases: allPhases,
    entries: entrants.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    groups: allGroups,
    teams: allTeams,
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const [existing] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!existing) return NextResponse.json({ error: 'Competició no trobada' }, { status: 404 });

  const updates: Partial<typeof existing> = { updatedAt: new Date() };
  if (body.name) updates.name = String(body.name).trim();
  if (body.status) updates.status = body.status;
  // Els interruptors del panell: mode de classificació, ronda congelada i els
  // defectes de publicació (docs/pla-rols.md §8.5).
  if (body.visibility) updates.visibility = { ...existing.visibility, ...body.visibility };

  await db.update(tournaments).set(updates).where(eq(tournaments.id, tournamentId));
  return NextResponse.json({ ...existing, ...updates });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const [existing] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!existing) return NextResponse.json({ error: 'Competició no trobada' }, { status: 404 });

  await db.delete(tournaments).where(eq(tournaments.id, tournamentId));
  return new NextResponse(null, { status: 204 });
}
