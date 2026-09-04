import { NextResponse } from 'next/server';
import { db } from '@/db';
import { directors } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/session';
import type { SessionData } from '@/lib/session';
import { hashPassword } from '@/lib/auth';

// GET no és públic per a aquest recurs (a diferència de la resta de l'API):
// exposaria noms d'usuari de director. Comprovem la sessió aquí mateix.
export async function GET(req: Request) {
  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  if (!session.isDirector) {
    return NextResponse.json({ error: 'No autoritzat' }, { status: 401 });
  }

  const all = await db
    .select({
      id: directors.id,
      username: directors.username,
      name: directors.name,
      isActive: directors.isActive,
      createdAt: directors.createdAt,
    })
    .from(directors);

  return NextResponse.json(all);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { username, password, name } = body;

  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    return NextResponse.json({ error: 'Cal un nom d\'usuari' }, { status: 400 });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return NextResponse.json({ error: 'La contrasenya ha de tenir com a mínim 6 caràcters' }, { status: 400 });
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Cal un nom' }, { status: 400 });
  }

  const existing = await db.select().from(directors).where(eq(directors.username, username.trim()));
  if (existing.length > 0) {
    return NextResponse.json({ error: `Ja existeix un usuari "${username}"` }, { status: 409 });
  }

  const newDirector = {
    id: uuid(),
    username: username.trim(),
    passwordHash: hashPassword(password),
    name: name.trim(),
    isActive: true,
    createdAt: new Date(),
  };

  await db.insert(directors).values(newDirector);
  return NextResponse.json({
    id: newDirector.id,
    username: newDirector.username,
    name: newDirector.name,
    isActive: newDirector.isActive,
    createdAt: newDirector.createdAt,
  }, { status: 201 });
}
