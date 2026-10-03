import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { entries, groups, people, teams, tournaments } from '@/db/schema';
import { requireTournamentAccess } from '@/lib/authz';
import { loadEntrants } from '@/lib/db-helpers';

type Params = { params: Promise<{ tournamentId: string }> };

/** Els inscrits, amb el nom que ve del registre de persones. */
export async function GET(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const groupId = new URL(req.url).searchParams.get('groupId');

  const all = (await loadEntrants(tournamentId)).sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );

  return NextResponse.json(groupId ? all.filter((e) => e.groupId === groupId) : all);
}

/**
 * POST — Inscriu una persona a la competició.
 *
 * Dues vies, que són les dues cares del registre silenciós (§14.2):
 *  - `personId`: la persona ja existeix al registre (d'una altra competició o
 *    del club) i només se li crea la inscripció.
 *  - `displayName`: persona nova, creada en silenci per l'admin. El jugador no
 *    s'ha de registrar mai.
 */
export async function POST(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const { personId, displayName, club, phone, email, rating, groupId, teamId, barrufNumero } = body;

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!tournament) return NextResponse.json({ error: 'Competició no trobada' }, { status: 404 });

  if (groupId) {
    const [group] = await db
      .select()
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.tournamentId, tournamentId)));
    if (!group) return NextResponse.json({ error: 'Grup no trobat' }, { status: 404 });
  }
  if (teamId) {
    const [team] = await db
      .select()
      .from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.tournamentId, tournamentId)));
    if (!team) return NextResponse.json({ error: 'Equip no trobat' }, { status: 404 });
  }

  let person;

  if (personId) {
    [person] = await db.select().from(people).where(eq(people.id, personId));
    if (!person) return NextResponse.json({ error: 'Persona no trobada' }, { status: 404 });

    const [already] = await db
      .select({ id: entries.id })
      .from(entries)
      .where(and(eq(entries.tournamentId, tournamentId), eq(entries.personId, personId)));
    if (already) {
      return NextResponse.json({ error: 'Aquesta persona ja està inscrita' }, { status: 409 });
    }
  } else {
    if (!displayName || typeof displayName !== 'string' || displayName.trim().length === 0) {
      return NextResponse.json({ error: 'Cal un nom de jugador' }, { status: 400 });
    }
    person = {
      id: uuid(),
      displayName: displayName.trim(),
      fullName: null,
      alias: null,
      photoUrl: null,
      club: club ?? null,
      rating: rating ?? null,
      barrufNumero: barrufNumero ?? null,
      phone: phone ?? null,
      email: email ?? null,
      isAnonymized: false,
      createdBy: guard.account.id,
      createdAt: new Date(),
    };
    await db.insert(people).values(person);
  }

  const entry = {
    id: uuid(),
    tournamentId,
    personId: person.id,
    groupId: groupId ?? null,
    teamId: teamId ?? null,
    // La valoració global sembra la de la competició, i després es pot ajustar
    // aquí sense tocar la fitxa de la persona.
    rating: rating ?? person.rating ?? null,
    isActive: true,
    createdAt: new Date(),
  };

  await db.insert(entries).values(entry);

  return NextResponse.json({ ...entry, displayName: person.displayName }, { status: 201 });
}
