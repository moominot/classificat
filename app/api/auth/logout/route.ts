import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/session';
import type { SessionData } from '@/lib/session';

export async function POST(req: Request) {
  const response = NextResponse.json({ ok: true });
  const session = await getIronSession<SessionData>(req, response, sessionOptions);
  session.destroy();
  return response;
}
