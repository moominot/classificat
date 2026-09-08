import { NextResponse } from 'next/server';
import { like, or } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { people } from '@/db/schema';
import { requireRole } from '@/lib/authz';

/**
 * El registre de persones (docs/pla-rols.md §14).
 *
 * Qualsevol admin hi pot cercar per vincular algú que ja hi consta d'una altra
 * competició o del club. Les **dades de contacte no es retornen** a la cerca:
 * el nom i el club són prou per identificar la persona, i així el registre no
 * es converteix en una agenda de telèfons oberta (§14.4).
 */
export async function GET(req: Request) {
  const guard = await requireRole('admin');
  if (guard.error) return guard.error;

  const query = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (query.length < 2) return NextResponse.json([]);

  const pattern = `%${query}%`;
  const rows = await db
    .select({
      id: people.id,
      displayName: people.displayName,
      alias: people.alias,
      club: people.club,
      rating: people.rating,
      photoUrl: people.photoUrl,
    })
    .from(people)
    .where(or(like(people.displayName, pattern), like(people.alias, pattern), like(people.club, pattern)))
    .limit(20);

  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const guard = await requireRole('admin');
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const { displayName, fullName, alias, club, phone, email, rating } = body;

  if (!displayName || typeof displayName !== 'string' || displayName.trim().length === 0) {
    return NextResponse.json({ error: 'Cal un nom' }, { status: 400 });
  }

  const person = {
    id: uuid(),
    displayName: displayName.trim(),
    fullName: fullName ?? null,
    alias: alias ?? null,
    photoUrl: null,
    club: club ?? null,
    rating: rating ?? null,
    phone: phone ?? null,
    email: email ?? null,
    isAnonymized: false,
    createdBy: guard.account.id,
    createdAt: new Date(),
  };

  await db.insert(people).values(person);
  return NextResponse.json(person, { status: 201 });
}
