import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { entries, groups, matchParticipants, people, teams } from '@/db/schema';
import { requireTournamentAccess } from '@/lib/authz';

type Params = { params: Promise<{ tournamentId: string; entryId: string }> };

async function findEntry(tournamentId: string, entryId: string) {
  const [row] = await db
    .select()
    .from(entries)
    .where(and(eq(entries.id, entryId), eq(entries.tournamentId, tournamentId)));
  return row ?? null;
}

export async function GET(_req: Request, { params }: Params) {
  const { tournamentId, entryId } = await params;

  const [row] = await db
    .select({
      id: entries.id,
      tournamentId: entries.tournamentId,
      personId: entries.personId,
      displayName: people.displayName,
      alias: people.alias,
      club: people.club,
      photoUrl: people.photoUrl,
      rating: entries.rating,
      groupId: entries.groupId,
      teamId: entries.teamId,
      isActive: entries.isActive,
    })
    .from(entries)
    .innerJoin(people, eq(people.id, entries.personId))
    .where(and(eq(entries.id, entryId), eq(entries.tournamentId, tournamentId)));

  if (!row) return NextResponse.json({ error: 'Inscripció no trobada' }, { status: 404 });
  return NextResponse.json(row);
}

/**
 * PATCH — Canvia la inscripció i, si cal, les dades de la persona.
 *
 * El nom, el club i el contacte viuen a `people` i es comparteixen entre
 * competicions; el grup, l'equip i la valoració són d'aquesta competició.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { tournamentId, entryId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const entry = await findEntry(tournamentId, entryId);
  if (!entry) return NextResponse.json({ error: 'Inscripció no trobada' }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  if (body.groupId) {
    const [group] = await db
      .select()
      .from(groups)
      .where(and(eq(groups.id, body.groupId), eq(groups.tournamentId, tournamentId)));
    if (!group) return NextResponse.json({ error: 'Grup no trobat' }, { status: 404 });
  }
  if (body.teamId) {
    const [team] = await db
      .select()
      .from(teams)
      .where(and(eq(teams.id, body.teamId), eq(teams.tournamentId, tournamentId)));
    if (!team) return NextResponse.json({ error: 'Equip no trobat' }, { status: 404 });
  }

  const entryUpdates: Partial<typeof entry> = {};
  if (body.rating !== undefined) entryUpdates.rating = body.rating;
  if (body.groupId !== undefined) entryUpdates.groupId = body.groupId;
  if (body.teamId !== undefined) entryUpdates.teamId = body.teamId;
  if (body.isActive !== undefined) entryUpdates.isActive = !!body.isActive;

  const personUpdates: Record<string, unknown> = {};
  if (body.displayName !== undefined) personUpdates.displayName = String(body.displayName).trim();
  if (body.club !== undefined) personUpdates.club = body.club;
  if (body.phone !== undefined) personUpdates.phone = body.phone;
  if (body.email !== undefined) personUpdates.email = body.email;

  if (Object.keys(entryUpdates).length > 0) {
    await db.update(entries).set(entryUpdates).where(eq(entries.id, entryId));
  }
  if (Object.keys(personUpdates).length > 0) {
    await db.update(people).set(personUpdates).where(eq(people.id, entry.personId));
  }

  return NextResponse.json({ ...entry, ...entryUpdates, ...personUpdates });
}

/**
 * DELETE — Treu la inscripció.
 *
 * No s'esborra la persona: viu al registre i pot tenir historial en altres
 * competicions (§14.1). Si ja ha jugat, es desactiva en lloc d'esborrar-la,
 * perquè esborrar-la reescriuria resultats.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { tournamentId, entryId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const entry = await findEntry(tournamentId, entryId);
  if (!entry) return NextResponse.json({ error: 'Inscripció no trobada' }, { status: 404 });

  const [played] = await db
    .select({ id: matchParticipants.id })
    .from(matchParticipants)
    .where(eq(matchParticipants.entryId, entryId))
    .limit(1);

  if (played) {
    return NextResponse.json(
      { error: 'Aquest jugador ja té partides. Desactiva\'l en comptes d\'esborrar-lo.' },
      { status: 409 }
    );
  }

  await db.delete(entries).where(eq(entries.id, entryId));
  return new NextResponse(null, { status: 204 });
}
