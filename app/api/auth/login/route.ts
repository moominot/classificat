import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, people } from '@/db/schema';
import { verifyPassword } from '@/lib/auth';
import { getSession } from '@/lib/authz';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { username, password } = body;

  if (!username || !password) {
    return NextResponse.json({ error: 'Cal usuari i contrasenya' }, { status: 400 });
  }

  const [account] = await db
    .select({
      id: accounts.id,
      personId: accounts.personId,
      passwordHash: accounts.passwordHash,
      role: accounts.role,
      isActive: accounts.isActive,
      displayName: people.displayName,
    })
    .from(accounts)
    .innerJoin(people, eq(people.id, accounts.personId))
    .where(eq(accounts.username, username));

  if (!account || !account.isActive || !verifyPassword(password, account.passwordHash)) {
    return NextResponse.json({ error: 'Usuari o contrasenya incorrectes' }, { status: 401 });
  }

  const session = await getSession();
  session.accountId = account.id;
  session.personId = account.personId;
  session.role = account.role;
  session.displayName = account.displayName;
  await session.save();

  return NextResponse.json({ ok: true, role: account.role });
}
