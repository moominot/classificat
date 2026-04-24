import { NextResponse } from 'next/server';
import { db } from '@/db';
import { rounds, pairings, players } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import type { GameOutcome } from '@/lib/pairing/types';

type Params = { params: Promise<{ tournamentId: string; roundId: string }> };

const CSV_HEADERS =
  'id,taula,jugador1,jugador2,punts_j1,punts_j2,bingos_j1,bingos_j2,millor_j1,pts_millor_j1,millor_j2,pts_millor_j2,localitat,comentaris';

function esc(val: string | number | null | undefined): string {
  if (val == null) return '';
  const s = String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export async function GET(_req: Request, { params }: Params) {
  const { tournamentId, roundId } = await params;

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.tournamentId, tournamentId)));

  if (!round) return NextResponse.json({ error: 'Ronda no trobada' }, { status: 404 });

  const allPairings = await db
    .select()
    .from(pairings)
    .where(eq(pairings.roundId, roundId))
    .orderBy(pairings.tableNumber);

  const allPlayers = await db
    .select()
    .from(players)
    .where(eq(players.tournamentId, tournamentId));
  const playerMap = new Map(allPlayers.map((p) => [p.id, p.name]));

  const rows = allPairings.map((p) => {
    const isBye = p.player2Id === null;
    return [
      p.id,
      p.tableNumber,
      esc(playerMap.get(p.player1Id)),
      isBye ? '' : esc(playerMap.get(p.player2Id ?? '')),
      isBye ? 'bye' : esc(p.p1Score),
      isBye ? '' : esc(p.p2Score),
      esc(p.p1Scrabbles),
      esc(p.p2Scrabbles),
      esc(p.p1BestWord),
      esc(p.p1BestWordScore),
      esc(p.p2BestWord),
      esc(p.p2BestWordScore),
      esc(p.location),
      esc(p.comments),
    ].join(',');
  });

  const csv = [CSV_HEADERS, ...rows].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ronda-${round.number}.csv"`,
    },
  });
}

type ImportRow = {
  pairingId: string;
  p1Score: number;
  p2Score: number;
  p1Scrabbles?: number | null;
  p2Scrabbles?: number | null;
  p1BestWord?: string | null;
  p1BestWordScore?: number | null;
  p2BestWord?: string | null;
  p2BestWordScore?: number | null;
  location?: string | null;
  comments?: string | null;
};

export async function POST(req: Request, { params }: Params) {
  const { tournamentId, roundId } = await params;

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.tournamentId, tournamentId)));

  if (!round) return NextResponse.json({ error: 'Ronda no trobada' }, { status: 404 });
  if (round.isComplete) return NextResponse.json({ error: 'La ronda ja està tancada' }, { status: 409 });

  const body = (await req.json()) as ImportRow[];
  if (!Array.isArray(body)) {
    return NextResponse.json({ error: 'Cal un array de resultats' }, { status: 400 });
  }

  const allPairings = await db.select().from(pairings).where(eq(pairings.roundId, roundId));
  const pairingMap = new Map(allPairings.map((p) => [p.id, p]));

  const errors: string[] = [];
  let updated = 0;

  for (const row of body) {
    const pairing = pairingMap.get(row.pairingId);
    if (!pairing) {
      errors.push(`Aparellament no trobat: ${row.pairingId}`);
      continue;
    }
    if (pairing.player2Id === null) continue;

    let o1: GameOutcome, o2: GameOutcome;
    if (row.p1Score > row.p2Score) { o1 = 'win'; o2 = 'loss'; }
    else if (row.p2Score > row.p1Score) { o1 = 'loss'; o2 = 'win'; }
    else { o1 = 'draw'; o2 = 'draw'; }

    await db.update(pairings).set({
      p1Score: row.p1Score,
      p2Score: row.p2Score,
      outcome1: o1,
      outcome2: o2,
      p1Scrabbles: row.p1Scrabbles ?? null,
      p2Scrabbles: row.p2Scrabbles ?? null,
      p1BestWord: row.p1BestWord ?? null,
      p1BestWordScore: row.p1BestWordScore ?? null,
      p2BestWord: row.p2BestWord ?? null,
      p2BestWordScore: row.p2BestWordScore ?? null,
      location: row.location ?? null,
      comments: row.comments ?? null,
      reportedAt: new Date(),
    }).where(eq(pairings.id, row.pairingId));

    updated++;
  }

  return NextResponse.json({ updated, errors });
}