import { NextResponse } from 'next/server';

const VALID = new Set(['light', 'dark', 'system']);

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { theme } = body;

  if (!VALID.has(theme)) {
    return NextResponse.json({ error: 'Tema no vàlid' }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  if (theme === 'system') {
    response.cookies.delete('theme');
  } else {
    response.cookies.set('theme', theme, {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });
  }
  return response;
}
