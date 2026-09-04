import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/session';
import type { SessionData } from '@/lib/session';
import { db } from '@/db';
import { directors } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword } from '@/lib/auth';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { username, password } = body;

  if (!username || !password) {
    return NextResponse.json({ error: 'Cal usuari i contrasenya' }, { status: 400 });
  }

  const [director] = await db.select().from(directors).where(eq(directors.username, username));

  if (!director || !director.isActive || !verifyPassword(password, director.passwordHash)) {
    return NextResponse.json({ error: 'Usuari o contrasenya incorrectes' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  const session = await getIronSession<SessionData>(req, response, sessionOptions);
  session.isDirector = true;
  session.directorId = director.id;
  session.directorName = director.name;
  await session.save();

  return response;
}
