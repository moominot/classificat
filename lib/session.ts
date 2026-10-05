import type { SessionOptions } from 'iron-session';
import type { Role } from '@/db/types';

/**
 * Dades desades a la cookie de sessió.
 *
 * Substitueix l'antic `{ isDirector }` binari: ara hi ha tres rols
 * (docs/pla-rols.md §1) i el compte és opcional, perquè un jugador pot fer
 * servir l'aplicació sense registrar-se (§15.2).
 *
 * És una foto del moment d'iniciar sessió: `lib/authz.ts` sempre rellegeix el
 * compte de la base de dades per detectar canvis de rol o desactivacions.
 */
export interface SessionData {
  accountId?: string;
  personId?: string;
  role?: Role;
  displayName?: string;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? 'dev-only-secret-32-chars-minimum!!',
  cookieName: 'classificat-session',
  cookieOptions: {
    secure: process.env.COOKIE_SECURE === 'true',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 dies
  },
};

/**
 * Identificador del dispositiu per als jugadors sense compte: és el que lliga
 * un mòbil amb el jugador que s'ha triat al desplegable (§15.2). No és cap
 * credencial —la identitat es declara, no es demostra—, només serveix per
 * recordar la tria i per deixar traça de qui envia cada resultat.
 */
export const DEVICE_COOKIE = 'classificat-device';

export const DEVICE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 365,
  path: '/',
};
