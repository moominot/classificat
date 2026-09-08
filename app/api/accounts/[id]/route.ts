import { NextResponse } from 'next/server';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, people } from '@/db/schema';
import type { Role } from '@/db/types';
import { hashPassword } from '@/lib/auth';
import { requireRole } from '@/lib/authz';

type Params = { params: Promise<{ id: string }> };

const ROLES: Role[] = ['superadmin', 'admin', 'user'];

/** Queden altres superadmins actius a part d'aquest? */
async function otherActiveSuperadmins(id: string): Promise<number> {
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(ne(accounts.id, id), eq(accounts.isActive, true), eq(accounts.role, 'superadmin')));
  return rows.length;
}

export async function PATCH(req: Request, { params }: Params) {
  const guard = await requireRole('superadmin');
  if (guard.error) return guard.error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { displayName, password, isActive, role } = body;

  const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
  if (!account) return NextResponse.json({ error: 'Compte no trobat' }, { status: 404 });

  // No es pot deixar l'aplicació sense ningú que la pugui administrar.
  const losesSuperadmin =
    account.role === 'superadmin' && (isActive === false || (role !== undefined && role !== 'superadmin'));
  if (losesSuperadmin && !(await otherActiveSuperadmins(id))) {
    return NextResponse.json(
      { error: "No es pot desactivar l'últim superadmin actiu" },
      { status: 409 }
    );
  }
  if (password !== undefined && (typeof password !== 'string' || password.length < 6)) {
    return NextResponse.json(
      { error: 'La contrasenya ha de tenir com a mínim 6 caràcters' },
      { status: 400 }
    );
  }
  if (role !== undefined && !ROLES.includes(role)) {
    return NextResponse.json({ error: 'Rol no vàlid' }, { status: 400 });
  }

  const updates: Partial<typeof account> = {};
  if (isActive !== undefined) updates.isActive = !!isActive;
  if (role !== undefined) updates.role = role;
  if (password) updates.passwordHash = hashPassword(password);

  if (Object.keys(updates).length > 0) {
    await db.update(accounts).set(updates).where(eq(accounts.id, id));
  }
  if (displayName !== undefined) {
    await db
      .update(people)
      .set({ displayName: String(displayName).trim() })
      .where(eq(people.id, account.personId));
  }

  return NextResponse.json({
    id: account.id,
    username: account.username,
    role: updates.role ?? account.role,
    isActive: updates.isActive ?? account.isActive,
  });
}

/**
 * DELETE — Esborra el compte, **no la persona**: el seu historial de partides
 * penja del registre i ha de sobreviure (§14.1).
 */
export async function DELETE(_req: Request, { params }: Params) {
  const guard = await requireRole('superadmin');
  if (guard.error) return guard.error;

  const { id } = await params;
  const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
  if (!account) return NextResponse.json({ error: 'Compte no trobat' }, { status: 404 });

  if (account.role === 'superadmin' && account.isActive && !(await otherActiveSuperadmins(id))) {
    return NextResponse.json({ error: "No es pot esborrar l'últim superadmin actiu" }, { status: 409 });
  }

  await db.delete(accounts).where(eq(accounts.id, id));
  return new NextResponse(null, { status: 204 });
}
