import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, people, tournamentAdmins, tournaments } from '@/db/schema';
import { requireTournamentAccess } from '@/lib/authz';

type Params = { params: Promise<{ tournamentId: string }> };

/** Comptes que poden gestionar una competició: tenen rol admin (o superadmin) i estan actius. */
const accountColumns = {
  id: accounts.id,
  username: accounts.username,
  role: accounts.role,
  displayName: people.displayName,
};

/**
 * GET — Propietari, coadministradors i comptes que es poden afegir.
 *
 * Només per a qui gestiona la competició. Els candidats són els comptes amb
 * rol `admin` (un compte `user` no podria gestionar-la encara que hi constés,
 * vegeu `canManageTournament`).
 */
export async function GET(_req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!tournament) return NextResponse.json({ error: 'Competició no trobada' }, { status: 404 });

  const [owner] = await db
    .select(accountColumns)
    .from(accounts)
    .innerJoin(people, eq(people.id, accounts.personId))
    .where(eq(accounts.id, tournament.ownerId));

  const coAdmins = await db
    .select(accountColumns)
    .from(tournamentAdmins)
    .innerJoin(accounts, eq(accounts.id, tournamentAdmins.accountId))
    .innerJoin(people, eq(people.id, accounts.personId))
    .where(eq(tournamentAdmins.tournamentId, tournamentId));

  const taken = new Set([tournament.ownerId, ...coAdmins.map((a) => a.id)]);
  const candidates = (
    await db
      .select(accountColumns)
      .from(accounts)
      .innerJoin(people, eq(people.id, accounts.personId))
      .where(and(eq(accounts.role, 'admin'), eq(accounts.isActive, true)))
  )
    .filter((a) => !taken.has(a.id))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return NextResponse.json({ owner: owner ?? null, admins: coAdmins, candidates });
}

/** POST { accountId } — Afegeix un coadministrador. */
export async function POST(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const accountId = typeof body.accountId === 'string' ? body.accountId : '';

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!tournament) return NextResponse.json({ error: 'Competició no trobada' }, { status: 404 });

  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!account || !account.isActive) {
    return NextResponse.json({ error: 'Compte no trobat' }, { status: 404 });
  }
  if (account.role !== 'admin' && account.role !== 'superadmin') {
    return NextResponse.json({ error: "Només es poden afegir comptes amb rol d'administrador" }, { status: 400 });
  }
  if (account.id === tournament.ownerId) {
    return NextResponse.json({ error: 'Aquest compte ja és el propietari' }, { status: 409 });
  }

  await db.insert(tournamentAdmins).values({ tournamentId, accountId }).onConflictDoNothing();
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** DELETE { accountId } — Treu un coadministrador. El propietari no es pot treure. */
export async function DELETE(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const accountId = typeof body.accountId === 'string' ? body.accountId : '';

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!tournament) return NextResponse.json({ error: 'Competició no trobada' }, { status: 404 });
  if (accountId === tournament.ownerId) {
    return NextResponse.json({ error: 'El propietari no es pot treure' }, { status: 400 });
  }

  await db
    .delete(tournamentAdmins)
    .where(and(eq(tournamentAdmins.tournamentId, tournamentId), eq(tournamentAdmins.accountId, accountId)));
  return NextResponse.json({ ok: true });
}
