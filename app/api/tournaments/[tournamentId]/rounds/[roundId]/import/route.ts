import { NextResponse } from 'next/server';
import { db } from '@/db';
import { rounds, pairings, phases, players, roundAbsences } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { parseCsvForManualImport } from '@/lib/pairing/methods/manual';

type Params = { params: Promise<{ tournamentId: string; roundId: string }> };

/**
 * POST /api/tournaments/:tid/rounds/:rid/import
 * Importa aparellaments manuals per a una ronda de fase "manual".
 * Body JSON: { csv: string } o { pairings: [{tableNumber, player1Id, player2Id|null}] }
 */
export async function POST(req: Request, { params }: Params) {
  const { tournamentId, roundId } = await params;

  const [round] = await db.select().from(rounds).where(
    and(eq(rounds.id, roundId), eq(rounds.tournamentId, tournamentId))
  );
  if (!round) return NextResponse.json({ error: 'Ronda no trobada' }, { status: 404 });
  if (round.isComplete) return NextResponse.json({ error: 'La ronda ja està tancada' }, { status: 409 });

  // Comprova que la fase és de tipus manual
  const [phase] = await db.select().from(phases).where(eq(phases.id, round.phaseId));
  if (!phase) return NextResponse.json({ error: 'Fase no trobada' }, { status: 404 });
  if (phase.method !== 'manual') {
    return NextResponse.json(
      { error: `Aquesta ronda pertany a una fase de tipus "${phase.method}", no "manual". Usa el botó de generar aparellaments.` },
      { status: 409 }
    );
  }

  // Comprova que no hi hagi ja aparellaments
  const existing = await db.select({ id: pairings.id }).from(pairings).where(eq(pairings.roundId, roundId));
  if (existing.length > 0) {
    return NextResponse.json(
      { error: 'La ronda ja té aparellaments. Elimina\'ls primer per reimportar.' },
      { status: 409 }
    );
  }

  // Carrega jugadors vàlids
  const allPlayers = await db.select().from(players).where(eq(players.tournamentId, tournamentId));
  const validIds = new Set(allPlayers.map(p => p.id));

  const body = await req.json();

  // Accepta dos formats: CSV text o array directe
  let rows: Array<{ tableNumber: number; player1Id: string; player2Id: string | null }>;
  const errors: string[] = [];

  if (typeof body.csv === 'string') {
    const parsed = parseCsvForManualImport(body.csv, validIds);
    if (parsed.errors.length > 0) {
      return NextResponse.json({ error: 'Errors al CSV', details: parsed.errors }, { status: 400 });
    }
    rows = parsed.rows;
  } else if (Array.isArray(body.pairings)) {
    rows = body.pairings;
  } else {
    return NextResponse.json({ error: 'Cal { csv } o { pairings: [] }' }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Cap aparellament trobat' }, { status: 400 });
  }

  // Valida i insereix
  const toInsert = [];
  for (const row of rows) {
    if (!validIds.has(row.player1Id)) {
      errors.push(`Jugador desconegut: ${row.player1Id}`);
      continue;
    }
    if (row.player2Id && !validIds.has(row.player2Id)) {
      errors.push(`Jugador desconegut: ${row.player2Id}`);
      continue;
    }
    toInsert.push({
      id: uuid(),
      roundId,
      tableNumber: row.tableNumber,
      player1Id: row.player1Id,
      player2Id: row.player2Id ?? null,
      ...(row.player2Id === null ? { outcome1: 'bye' as const } : {}),
    });
  }

  if (errors.length > 0 && toInsert.length === 0) {
    return NextResponse.json({ error: 'Cap aparellament vàlid', details: errors }, { status: 400 });
  }

  if (toInsert.length > 0) {
    await db.insert(pairings).values(toInsert);
  }

  return NextResponse.json({ inserted: toInsert.length, errors }, { status: 201 });
}

/**
 * DELETE /api/tournaments/:tid/rounds/:rid/import
 * Elimina tots els aparellaments d'una ronda (per reimportar o regenerar).
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { tournamentId, roundId } = await params;

  const [round] = await db.select().from(rounds).where(
    and(eq(rounds.id, roundId), eq(rounds.tournamentId, tournamentId))
  );
  if (!round) return NextResponse.json({ error: 'Ronda no trobada' }, { status: 404 });
  if (round.isComplete) return NextResponse.json({ error: 'La ronda ja està tancada' }, { status: 409 });

  await db.delete(roundAbsences).where(eq(roundAbsences.roundId, roundId));
  await db.delete(pairings).where(eq(pairings.roundId, roundId));
  return new NextResponse(null, { status: 204 });
}
