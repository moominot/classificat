import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, entries, entryClaims, people, tournamentAdmins, tournaments } from '@/db/schema';
import { DEVICE_COOKIE, sessionOptions } from '@/lib/session';
import type { SessionData } from '@/lib/session';
import type { Role } from '@/db/types';

/**
 * Punt únic d'autenticació i autorització (docs/pla-rols.md §4).
 *
 * Abans, el control de rol vivia només a la interfície: de 23 rutes d'API,
 * només una comprovava la sessió. Tot el que escrigui o llegeixi dades
 * restringides ha de passar per aquí.
 */

export interface CurrentAccount {
  id: string;
  personId: string;
  role: Role;
  displayName: string;
}

// ─── Sessió ───────────────────────────────────────────────────────────────────

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

/**
 * El compte de la sessió, rellegit de la base de dades.
 *
 * No ens refiem del rol desat a la cookie: un compte pot haver estat
 * desactivat o haver-li canviat el rol després d'iniciar sessió.
 */
export async function getCurrentAccount(): Promise<CurrentAccount | null> {
  const session = await getSession();
  if (!session.accountId) return null;

  const [row] = await db
    .select({
      id: accounts.id,
      personId: accounts.personId,
      role: accounts.role,
      isActive: accounts.isActive,
      displayName: people.displayName,
    })
    .from(accounts)
    .innerJoin(people, eq(people.id, accounts.personId))
    .where(eq(accounts.id, session.accountId));

  if (!row || !row.isActive) return null;
  return { id: row.id, personId: row.personId, role: row.role, displayName: row.displayName };
}

// ─── Respostes d'error ────────────────────────────────────────────────────────

/** 401: no s'ha identificat. 403: identificat però sense permís. */
export function unauthorized() {
  return NextResponse.json({ error: 'Cal iniciar sessió' }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: 'No tens permís per fer això' }, { status: 403 });
}

export type Guard =
  | { account: CurrentAccount; error?: undefined }
  | { account?: undefined; error: NextResponse };

// ─── Comprovacions ────────────────────────────────────────────────────────────

/** Qualsevol compte actiu. */
export async function requireAccount(): Promise<Guard> {
  const account = await getCurrentAccount();
  return account ? { account } : { error: unauthorized() };
}

/** Un dels rols indicats. El superadmin passa sempre. */
export async function requireRole(...roles: Role[]): Promise<Guard> {
  const account = await getCurrentAccount();
  if (!account) return { error: unauthorized() };
  if (account.role === 'superadmin' || roles.includes(account.role)) return { account };
  return { error: forbidden() };
}

/**
 * Accés de gestió a una competició: superadmin sempre; admin si n'és
 * propietari o coadministrador. Les dues vies es resolen aquí i enlloc més
 * (docs/esquema-proposat.md §8.3).
 */
export async function canManageTournament(
  account: CurrentAccount,
  tournamentId: string
): Promise<boolean> {
  if (account.role === 'superadmin') return true;
  if (account.role !== 'admin') return false;

  const [owned] = await db
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(and(eq(tournaments.id, tournamentId), eq(tournaments.ownerId, account.id)));
  if (owned) return true;

  const [coAdmin] = await db
    .select({ accountId: tournamentAdmins.accountId })
    .from(tournamentAdmins)
    .where(
      and(
        eq(tournamentAdmins.tournamentId, tournamentId),
        eq(tournamentAdmins.accountId, account.id)
      )
    );
  return Boolean(coAdmin);
}

export async function requireTournamentAccess(tournamentId: string): Promise<Guard> {
  const account = await getCurrentAccount();
  if (!account) return { error: unauthorized() };
  if (await canManageTournament(account, tournamentId)) return { account };
  return { error: forbidden() };
}

/** Les competicions que un compte pot gestionar (per al desplegable de l'admin, §7.3). */
export async function listManagedTournaments(account: CurrentAccount) {
  if (account.role === 'superadmin') {
    return db.select().from(tournaments).orderBy(tournaments.createdAt);
  }
  if (account.role !== 'admin') return [];

  const owned = await db.select().from(tournaments).where(eq(tournaments.ownerId, account.id));
  const shared = await db
    .select({ tournament: tournaments })
    .from(tournamentAdmins)
    .innerJoin(tournaments, eq(tournaments.id, tournamentAdmins.tournamentId))
    .where(eq(tournamentAdmins.accountId, account.id));

  const byId = new Map(owned.map((t) => [t.id, t]));
  for (const row of shared) byId.set(row.tournament.id, row.tournament);
  return [...byId.values()].sort((a, b) => +a.createdAt - +b.createdAt);
}

// ─── Identitat del visitant ───────────────────────────────────────────────────

/**
 * Qui està mirant l'aplicació (docs/pla-rols.md §15.2).
 *
 * **Aquest és l'únic lloc on es resol la identitat.** Avui un jugador es tria
 * d'un desplegable i la tria es recorda al dispositiu; el dia que hi hagi
 * comptes per a tothom, només canvia aquesta funció i cap pantalla se
 * n'assabenta.
 */
export type Viewer =
  | { kind: 'guest'; deviceId: string | null; entryId: null; account: null }
  | { kind: 'device'; deviceId: string; entryId: string; account: null }
  | { kind: 'account'; deviceId: string | null; entryId: string | null; account: CurrentAccount };

export async function getViewer(tournamentId?: string): Promise<Viewer> {
  const cookieStore = await cookies();
  const deviceId = cookieStore.get(DEVICE_COOKIE)?.value ?? null;
  const account = await getCurrentAccount();

  if (account) {
    const entryId = tournamentId ? await findEntryForPerson(tournamentId, account.personId) : null;
    return { kind: 'account', deviceId, entryId, account };
  }

  if (deviceId && tournamentId) {
    const entryId = await findClaimedEntry(tournamentId, deviceId);
    if (entryId) return { kind: 'device', deviceId, entryId, account: null };
  }

  return { kind: 'guest', deviceId, entryId: null, account: null };
}

async function findEntryForPerson(tournamentId: string, personId: string) {
  const [row] = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.tournamentId, tournamentId), eq(entries.personId, personId)));
  return row?.id ?? null;
}

/** El jugador que aquest dispositiu ha triat en aquesta competició. */
async function findClaimedEntry(tournamentId: string, deviceId: string) {
  const [row] = await db
    .select({ id: entries.id })
    .from(entryClaims)
    .innerJoin(entries, eq(entries.id, entryClaims.entryId))
    .where(and(eq(entryClaims.deviceId, deviceId), eq(entries.tournamentId, tournamentId)));
  return row?.id ?? null;
}

/**
 * Pot enviar o corregir el resultat d'aquesta partida?
 *
 * La gràcia de l'aplicació és la gestió autònoma de la classificació:
 * qualsevol persona present, encara que no hagi iniciat sessió ni sigui
 * un dels participants, pot registrar el resultat d'una taula mentre la
 * ronda estigui oberta — no cal esperar el director. Un cop tancada, només
 * el director pot corregir-la (§15.7).
 */
export function canReportResult(
  _viewer: Viewer,
  opts: { participantEntryIds: string[]; roundIsOpen: boolean; managesTournament: boolean }
): boolean {
  return opts.managesTournament || opts.roundIsOpen;
}
