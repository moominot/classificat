import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { accounts, people } from '@/db/schema';
import type { Role } from '@/db/types';
import { hashPassword } from '@/lib/auth';
import { requireRole } from '@/lib/authz';

const ROLES: Role[] = ['superadmin', 'admin', 'user'];

/**
 * Comptes de l'aplicació.
 *
 * Només el superadmin: exposa noms d'usuari i rols. L'admin gestiona el
 * registre de persones i les invitacions, no els comptes (docs/pla-rols.md §1).
 */
export async function GET() {
  const guard = await requireRole('superadmin');
  if (guard.error) return guard.error;

  const all = await db
    .select({
      id: accounts.id,
      username: accounts.username,
      role: accounts.role,
      isActive: accounts.isActive,
      createdAt: accounts.createdAt,
      personId: accounts.personId,
      displayName: people.displayName,
    })
    .from(accounts)
    .innerJoin(people, eq(people.id, accounts.personId));

  return NextResponse.json(all);
}

/**
 * POST — Crea un compte per a una persona del registre.
 *
 * La via normal per als jugadors és la invitació (§14.2); això és per donar
 * d'alta administradors.
 */
export async function POST(req: Request) {
  const guard = await requireRole('superadmin');
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const { username, password, role, personId, displayName } = body;

  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    return NextResponse.json({ error: "Cal un nom d'usuari" }, { status: 400 });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return NextResponse.json(
      { error: 'La contrasenya ha de tenir com a mínim 6 caràcters' },
      { status: 400 }
    );
  }
  if (role !== undefined && !ROLES.includes(role)) {
    return NextResponse.json({ error: 'Rol no vàlid' }, { status: 400 });
  }

  const existing = await db.select().from(accounts).where(eq(accounts.username, username.trim()));
  if (existing.length > 0) {
    return NextResponse.json({ error: `Ja existeix un usuari "${username}"` }, { status: 409 });
  }

  let person;
  if (personId) {
    [person] = await db.select().from(people).where(eq(people.id, personId));
    if (!person) return NextResponse.json({ error: 'Persona no trobada' }, { status: 404 });

    const [taken] = await db.select().from(accounts).where(eq(accounts.personId, personId));
    if (taken) return NextResponse.json({ error: 'Aquesta persona ja té compte' }, { status: 409 });
  } else {
    if (!displayName || typeof displayName !== 'string' || displayName.trim().length === 0) {
      return NextResponse.json({ error: 'Cal un nom' }, { status: 400 });
    }
    person = {
      id: uuid(),
      displayName: displayName.trim(),
      createdBy: guard.account.id,
      createdAt: new Date(),
      isAnonymized: false,
    };
    await db.insert(people).values(person);
  }

  const account = {
    id: uuid(),
    personId: person.id,
    username: username.trim(),
    passwordHash: hashPassword(password),
    role: (role ?? 'user') as Role,
    isActive: true,
    preferences: {},
    createdAt: new Date(),
  };

  await db.insert(accounts).values(account);

  return NextResponse.json(
    {
      id: account.id,
      username: account.username,
      role: account.role,
      isActive: account.isActive,
      displayName: person.displayName,
    },
    { status: 201 }
  );
}
