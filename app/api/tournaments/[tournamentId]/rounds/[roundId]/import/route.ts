import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { matchParticipants, matches, phases, roundAbsences, rounds } from '@/db/schema';
import { requireTournamentAccess } from '@/lib/authz';
import { parseCsvForManualImport } from '@/lib/pairing/methods/manual';
import { loadEntrants } from '@/lib/db-helpers';

type Params = { params: Promise<{ tournamentId: string; roundId: string }> };

/**
 * POST — Importa aparellaments fets a mà en una ronda de fase manual.
 *
 * Accepta `{ csv }` (una fila per taula, amb tants jugadors com calgui) o
 * `{ matches: [{ tableNumber, entryIds }] }`.
 */
export async function POST(req: Request, { params }: Params) {
  const { tournamentId, roundId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.tournamentId, tournamentId)));
  if (!round) return NextResponse.json({ error: 'Ronda no trobada' }, { status: 404 });
  if (round.status === 'closed') {
    return NextResponse.json({ error: 'La ronda ja està tancada' }, { status: 409 });
  }

  const [phase] = await db.select().from(phases).where(eq(phases.id, round.phaseId));
  if (!phase) return NextResponse.json({ error: 'Fase no trobada' }, { status: 404 });
  if (phase.method !== 'manual') {
    return NextResponse.json(
      {
        error: `Aquesta ronda pertany a una fase de tipus "${phase.method}", no "manual". Feu servir el botó de generar aparellaments.`,
      },
      { status: 409 }
    );
  }

  const existing = await db.select({ id: matches.id }).from(matches).where(eq(matches.roundId, roundId));
  if (existing.length > 0) {
    return NextResponse.json(
      { error: 'La ronda ja té aparellaments. Elimineu-los primer per reimportar-los.' },
      { status: 409 }
    );
  }

  const entrants = await loadEntrants(tournamentId);
  const validIds = new Set(entrants.map((e) => e.id));
  const teamByEntry = new Map(entrants.map((e) => [e.id, e.teamId ?? null]));

  const body = await req.json().catch(() => ({}));

  let rows: Array<{ tableNumber: number; entryIds: string[] }>;
  if (typeof body.csv === 'string') {
    const parsed = parseCsvForManualImport(body.csv, validIds);
    if (parsed.errors.length > 0) {
      return NextResponse.json({ error: 'Errors al CSV', details: parsed.errors }, { status: 400 });
    }
    rows = parsed.rows;
  } else if (Array.isArray(body.matches)) {
    rows = body.matches;
  } else {
    return NextResponse.json({ error: 'Cal { csv } o { matches: [] }' }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Cap aparellament trobat' }, { status: 400 });
  }

  const errors: string[] = [];
  const toInsert: Array<{ id: string; tableNumber: number; entryIds: string[] }> = [];

  for (const row of rows) {
    const unknown = (row.entryIds ?? []).filter((id) => !validIds.has(id));
    if (unknown.length > 0) {
      errors.push(`Jugador desconegut: ${unknown[0]}`);
      continue;
    }
    if (!row.entryIds?.length) {
      errors.push(`La taula ${row.tableNumber} no té jugadors`);
      continue;
    }
    toInsert.push({ id: uuid(), tableNumber: row.tableNumber, entryIds: row.entryIds });
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ error: 'Cap aparellament vàlid', details: errors }, { status: 400 });
  }

  await db.insert(matches).values(
    toInsert.map((match) => ({
      id: match.id,
      roundId,
      tableNumber: match.tableNumber,
      location: null,
      comments: null,
      createdAt: new Date(),
    }))
  );

  await db.insert(matchParticipants).values(
    toInsert.flatMap((match) =>
      match.entryIds.map((entryId, seat) => ({
        id: uuid(),
        matchId: match.id,
        entryId,
        seat,
        rank: match.entryIds.length === 1 ? 1 : null,
        score: null,
        outcome: match.entryIds.length === 1 ? ('bye' as const) : null,
        points: match.entryIds.length === 1 ? phase.scoring.byePoints : null,
        teamId: teamByEntry.get(entryId) ?? null,
      }))
    )
  );

  return NextResponse.json({ inserted: toInsert.length, errors }, { status: 201 });
}

/** DELETE — Esborra els aparellaments d'una ronda per tornar-los a fer. */
export async function DELETE(_req: Request, { params }: Params) {
  const { tournamentId, roundId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.tournamentId, tournamentId)));
  if (!round) return NextResponse.json({ error: 'Ronda no trobada' }, { status: 404 });
  if (round.status === 'closed') {
    return NextResponse.json({ error: 'La ronda ja està tancada' }, { status: 409 });
  }

  await db.delete(roundAbsences).where(eq(roundAbsences.roundId, roundId));
  await db.delete(matches).where(eq(matches.roundId, roundId));
  return new NextResponse(null, { status: 204 });
}
