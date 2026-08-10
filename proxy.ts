import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/session';
import type { SessionData } from '@/lib/session';

const PUBLIC_API_WRITES = new Set(['/api/auth/login', '/api/auth/logout']);

const RESULT_SUBMISSION = /^\/api\/tournaments\/[^/]+\/rounds\/[^/]+\/result$/;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Pàgina principal: només directors
  if (pathname === '/') {
    const res = NextResponse.next();
    const session = await getIronSession<SessionData>(request, res, sessionOptions);
    if (!session.isDirector) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  // GET requests d'API són sempre públics
  if (method === 'GET') return NextResponse.next();

  // Endpoints d'auth i enviament de resultats per jugadors: públics
  if (PUBLIC_API_WRITES.has(pathname)) return NextResponse.next();
  if (method === 'PUT' && RESULT_SUBMISSION.test(pathname)) return NextResponse.next();

  // Totes les altres mutacions d'API requereixen sessió de director
  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(request, res, sessionOptions);

  if (!session.isDirector) {
    return NextResponse.json({ error: 'No autoritzat' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/api/:path*'],
};
