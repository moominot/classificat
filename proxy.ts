import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/session';
import type { SessionData } from '@/lib/session';

/**
 * Primera barrera, deliberadament gruixuda.
 *
 * Aquí només es comprova que hi hagi sessió: el proxy no toca la base de
 * dades, així que no pot saber si aquest compte gestiona **aquesta**
 * competició. Aquesta comprovació la fa `lib/authz.ts` a cada ruta
 * (docs/pla-rols.md §4); això d'aquí evita que arribin peticions anònimes.
 */

const PUBLIC_API_WRITES = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/preferences/theme',
  // El jugador s'identifica amb un desplegable, no amb un compte (§15.2).
  '/api/uploads/score-sheets',
  // Acceptar una invitació és, per definició, sense sessió (§14.2).
  '/api/invitations',
]);

const RESULT_SUBMISSION = /^\/api\/tournaments\/[^/]+\/rounds\/[^/]+\/result$/;

/** Pàgines de gestió: sense sessió, cap a la pantalla d'entrada. */
const ACCOUNT_ONLY_PAGES = new Set(['/', '/usuaris']);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  if (ACCOUNT_ONLY_PAGES.has(pathname)) {
    const res = NextResponse.next();
    const session = await getIronSession<SessionData>(request, res, sessionOptions);
    if (!session.accountId) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  if (method === 'GET') return NextResponse.next();

  if (PUBLIC_API_WRITES.has(pathname)) return NextResponse.next();
  // El resultat d'una partida el pot enviar un jugador sense compte; qui pot
  // fer-ho de debò ho decideix la ruta amb `canReportResult()` (§15.6).
  if (method === 'PUT' && RESULT_SUBMISSION.test(pathname)) return NextResponse.next();

  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(request, res, sessionOptions);

  if (!session.accountId) {
    return NextResponse.json({ error: 'Cal iniciar sessió' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/usuaris', '/api/:path*'],
};
