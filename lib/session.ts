import type { SessionOptions } from 'iron-session';

export interface SessionData {
  isDirector?: boolean;
  directorId?: string;
  directorName?: string;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? 'dev-only-secret-32-chars-minimum!!',
  cookieName: 'classificat-dir',
  cookieOptions: {
    secure: process.env.COOKIE_SECURE === 'true',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 dies
  },
};
