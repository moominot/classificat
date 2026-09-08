import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { accounts, invitations, people } from '@/db/schema';
import { hashPassword } from '@/lib/auth';
import { requireRole } from '@/lib/authz';

/**
 * Invitacions (docs/pla-rols.md §14.2).
 *
 * És l'única via per crear un compte: no hi ha auto-registre. La persona ja
 * existeix al registre —l'admin l'ha donada d'alta en silenci—, així que en
 * acceptar la invitació el jugador es troba tot el seu historial fet.
 */
export async function POST(req: Request) {
  const guard = await requireRole('admin');
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const { personId, tournamentId, expiresInDays } = body;

  if (!personId) return NextResponse.json({ error: 'Cal personId' }, { status: 400 });

  const [person] = await db.select().from(people).where(eq(people.id, personId));
  if (!person) return NextResponse.json({ error: 'Persona no trobada' }, { status: 404 });

  const [existingAccount] = await db.select().from(accounts).where(eq(accounts.personId, personId));
  if (existingAccount) {
    return NextResponse.json({ error: 'Aquesta persona ja té compte' }, { status: 409 });
  }

  const days = Number(expiresInDays) > 0 ? Number(expiresInDays) : 30;
  const invitation = {
    id: uuid(),
    token: randomBytes(24).toString('base64url'),
    personId,
    tournamentId: tournamentId ?? null,
    createdBy: guard.account.id,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    acceptedAt: null,
  };

  await db.insert(invitations).values(invitation);

  return NextResponse.json(
    { id: invitation.id, token: invitation.token, expiresAt: invitation.expiresAt },
    { status: 201 }
  );
}

/**
 * PUT — Accepta una invitació i crea el compte.
 *
 * Ruta oberta a propòsit: qui la fa servir encara no té compte. El token d'un
 * sol ús és el que autoritza.
 */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { token, username, password } = body;

  if (!token || !username || !password) {
    return NextResponse.json({ error: 'Cal token, usuari i contrasenya' }, { status: 400 });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return NextResponse.json(
      { error: 'La contrasenya ha de tenir com a mínim 6 caràcters' },
      { status: 400 }
    );
  }

  const [invitation] = await db.select().from(invitations).where(eq(invitations.token, token));
  if (!invitation) return NextResponse.json({ error: 'Invitació no vàlida' }, { status: 404 });
  if (invitation.acceptedAt) {
    return NextResponse.json({ error: 'Aquesta invitació ja s\'ha fet servir' }, { status: 409 });
  }
  if (invitation.expiresAt && invitation.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: 'Aquesta invitació ha caducat' }, { status: 409 });
  }

  const taken = await db.select().from(accounts).where(eq(accounts.username, String(username).trim()));
  if (taken.length > 0) {
    return NextResponse.json({ error: 'Aquest nom d\'usuari ja existeix' }, { status: 409 });
  }

  const account = {
    id: uuid(),
    personId: invitation.personId,
    username: String(username).trim(),
    passwordHash: hashPassword(password),
    role: 'user' as const,
    isActive: true,
    preferences: {},
    createdAt: new Date(),
  };

  await db.insert(accounts).values(account);
  await db
    .update(invitations)
    .set({ acceptedAt: new Date() })
    .where(eq(invitations.id, invitation.id));

  return NextResponse.json({ ok: true, tournamentId: invitation.tournamentId }, { status: 201 });
}
