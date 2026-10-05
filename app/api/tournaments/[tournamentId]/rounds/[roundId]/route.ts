import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { entries, matches, people, rounds, tournaments } from '@/db/schema';
import { DEFAULT_VISIBILITY } from '@/db/types';
import type { RoundStatus } from '@/db/types';
import { canManageTournament, getCurrentAccount, requireTournamentAccess } from '@/lib/authz';
import { loadRoundMatches } from '@/lib/db-helpers';

type Params = { params: Promise<{ tournamentId: string; roundId: string }> };

const STATUSES: RoundStatus[] = ['draft', 'open', 'closed'];

export async function GET(_req: Request, { params }: Params) {
  const { tournamentId, roundId } = await params;

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.tournamentId, tournamentId)));
  if (!round) return NextResponse.json({ error: 'Ronda no trobada' }, { status: 404 });

  const account = await getCurrentAccount();
  const canManage = account ? await canManageTournament(account, tournamentId) : false;

  if (!canManage && round.status === 'draft') {
    return NextResponse.json({ error: 'Ronda no trobada' }, { status: 404 });
  }

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  const visibility = tournament?.visibility ?? DEFAULT_VISIBILITY;
  const pairingsVisible = round.pairingsVisible ?? visibility.pairingsVisible;
  const resultsVisible = round.resultsVisible ?? visibility.resultsVisible;

  if (!canManage && !pairingsVisible) {
    return NextResponse.json({ ...round, matches: [], pairingsVisible: false });
  }

  const roundMatches = await loadRoundMatches(roundId);

  const names = new Map(
    (
      await db
        .select({ id: entries.id, displayName: people.displayName })
        .from(entries)
        .innerJoin(people, eq(people.id, entries.personId))
        .where(eq(entries.tournamentId, tournamentId))
    ).map((row) => [row.id, row.displayName])
  );

  // Amb els resultats no publicats, el jugador veu qui juga contra qui però no
  // els marcadors: es buiden aquí, no a la pantalla (§8.3).
  const hideResults = !canManage && !resultsVisible;

  return NextResponse.json({
    ...round,
    pairingsVisible: true,
    resultsVisible: !hideResults,
    matches: roundMatches.map((match) => ({
      ...match,
      participants: match.participants.map((participant) => ({
        ...participant,
        displayName: names.get(participant.entryId) ?? '?',
        ...(hideResults ? { rank: null, score: null, outcome: null, points: null } : {}),
      })),
    })),
  });
}

/**
 * PATCH — Els interruptors de la ronda al panell (§8.5): obrir-la, tancar-la,
 * publicar aparellaments o resultats.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { tournamentId, roundId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.tournamentId, tournamentId)));
  if (!round) return NextResponse.json({ error: 'Ronda no trobada' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const updates: Partial<typeof round> = {};

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Estat de ronda no vàlid' }, { status: 400 });
    }
    updates.status = body.status;
  }
  if (body.pairingsVisible !== undefined) {
    updates.pairingsVisible = body.pairingsVisible === null ? null : !!body.pairingsVisible;
  }
  if (body.resultsVisible !== undefined) {
    updates.resultsVisible = body.resultsVisible === null ? null : !!body.resultsVisible;
  }

  await db.update(rounds).set(updates).where(eq(rounds.id, roundId));
  return NextResponse.json({ ...round, ...updates });
}

/**
 * DELETE — Esborra una ronda que encara no té aparellaments.
 *
 * Només la darrera: esborrar-ne una del mig deixaria un forat a la numeració
 * (la ronda següent es crea com a «màxim + 1»). Amb aparellaments hi ha
 * resultats en joc: això es fa esborrant-los primer, a propòsit.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { tournamentId, roundId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.tournamentId, tournamentId)));
  if (!round) return NextResponse.json({ error: 'Ronda no trobada' }, { status: 404 });

  const [match] = await db.select({ id: matches.id }).from(matches).where(eq(matches.roundId, roundId)).limit(1);
  if (match) {
    return NextResponse.json(
      { error: 'La ronda té aparellaments. Esborra\'ls primer si vols eliminar-la.' },
      { status: 409 }
    );
  }

  const all = await db.select({ number: rounds.number }).from(rounds).where(eq(rounds.tournamentId, tournamentId));
  if (all.some((r) => r.number > round.number)) {
    return NextResponse.json({ error: 'Només es pot esborrar la darrera ronda' }, { status: 409 });
  }

  await db.delete(rounds).where(eq(rounds.id, roundId));
  return new NextResponse(null, { status: 204 });
}
