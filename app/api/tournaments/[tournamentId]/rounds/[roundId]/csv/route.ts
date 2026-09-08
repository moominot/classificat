import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { entries, matchParticipants, people, phases, rounds } from '@/db/schema';
import { requireTournamentAccess } from '@/lib/authz';
import { loadRoundMatches } from '@/lib/db-helpers';
import { scoreMatch } from '@/lib/pairing/scoring';

type Params = { params: Promise<{ tournamentId: string; roundId: string }> };

/**
 * CSV de resultats en format llarg: **una fila per participant**.
 *
 * Amb taules de N no hi ha manera de tenir columnes fixes per jugador
 * (`punts_j1`, `punts_j2`…), així que cada fila és una participació. Per a
 * l'1v1 això són dues files per partida, i continua sent llegible amb un full
 * de càlcul.
 */
const CSV_HEADERS = 'partida,taula,jugador,jugador_id,puntuacio,posicio,localitat,comentaris';

function esc(value: string | number | null | undefined): string {
  if (value == null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(_req: Request, { params }: Params) {
  const { tournamentId, roundId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.tournamentId, tournamentId)));
  if (!round) return NextResponse.json({ error: 'Ronda no trobada' }, { status: 404 });

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

  const rows = roundMatches.flatMap((match) =>
    match.participants.map((participant) =>
      [
        match.id,
        match.tableNumber,
        esc(names.get(participant.entryId)),
        participant.entryId,
        esc(participant.score),
        esc(participant.rank),
        esc(match.participants.length === 1 ? 'bye' : ''),
        '',
      ].join(',')
    )
  );

  return new Response([CSV_HEADERS, ...rows].join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ronda-${round.number}.csv"`,
    },
  });
}

interface ResultRow {
  matchId: string;
  entryId: string;
  score?: number | null;
  rank?: number | null;
}

/**
 * POST — Importa resultats en bloc.
 *
 * Accepta files soltes (partida + jugador + puntuació) i les agrupa per
 * partida, perquè el resultat d'una taula només es pot calcular sencer.
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

  const [phase] = await db.select().from(phases).where(eq(phases.id, round.phaseId));
  if (!phase) return NextResponse.json({ error: 'Fase no trobada' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const rows: ResultRow[] = Array.isArray(body) ? body : body?.rows;
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: 'Cal un array de resultats' }, { status: 400 });
  }

  const roundMatches = await loadRoundMatches(roundId);
  const byMatch = new Map<string, ResultRow[]>();
  for (const row of rows) {
    byMatch.set(row.matchId, [...(byMatch.get(row.matchId) ?? []), row]);
  }

  const errors: string[] = [];
  let updated = 0;

  for (const [matchId, matchRows] of byMatch) {
    const match = roundMatches.find((m) => m.id === matchId);
    if (!match) {
      errors.push(`Partida no trobada: ${matchId}`);
      continue;
    }
    if (match.participants.length === 1) continue; // bye

    const inputs = match.participants.map((participant) => {
      const row = matchRows.find((r) => r.entryId === participant.entryId);
      return {
        entryId: participant.entryId,
        score: row?.score ?? null,
        rank: row?.rank ?? null,
      };
    });

    if (inputs.some((i) => i.score == null && i.rank == null)) {
      errors.push(`Falten resultats de la partida ${matchId}`);
      continue;
    }

    const scored = scoreMatch(inputs, phase.scoring);
    for (const participant of match.participants) {
      const result = scored.find((s) => s.entryId === participant.entryId);
      if (!result) continue;
      await db
        .update(matchParticipants)
        .set({ rank: result.rank, score: result.score, outcome: result.outcome, points: result.points })
        .where(eq(matchParticipants.id, participant.id));
    }
    updated++;
  }

  return NextResponse.json({ updated, errors });
}
