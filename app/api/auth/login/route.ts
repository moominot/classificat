import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/session';
import type { SessionData } from '@/lib/session';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  if (!body.password || body.password !== process.env.DIRECTOR_PASSWORD) {
    return NextResponse.json({ error: 'Contrasenya incorrecta' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  const session = await getIronSession<SessionData>(req, response, sessionOptions);
  session.isDirector = true;
  await session.save();

  return response;
}
