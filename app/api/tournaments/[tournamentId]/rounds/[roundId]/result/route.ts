import { NextResponse } from 'next/server';
import { db } from '@/db';
import { pairings, rounds } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import type { GameOutcome } from '@/lib/pairing/types';

type Params = { params: Promise<{ tournamentId: string; roundId: string }> };

/**
 * PUT /api/tournaments/:tid/rounds/:rid/result
 * Body: { pairingId, p1Score, p2Score, outcome1, outcome2, p1Scrabbles?, p2Scrabbles?,
 *         p1BestWord?, p2BestWord?, p1BestWordScore?, p2BestWordScore?,
 *         location?, comments? }
 */
export async function PUT(req: Request, { params }: Params) {
  const { roundId } = await params;
  const body = await req.json();

  const {
    pairingId, p1Score, p2Score, outcome1, outcome2,
    p1Scrabbles, p2Scrabbles,
    p1BestWord, p2BestWord, p1BestWordScore, p2BestWordScore,
    location, comments,
  } = body;

  if (!pairingId) return NextResponse.json({ error: 'Cal pairingId' }, { status: 400 });

  const [pairing] = await db.select().from(pairings).where(eq(pairings.id, pairingId));
  if (!pairing) return NextResponse.json({ error: 'Aparellament no trobat' }, { status: 404 });
  if (pairing.roundId !== roundId) return NextResponse.json({ error: 'L\'aparellament no pertany a aquesta ronda' }, { status: 400 });

  // Verifica que la ronda no estigui tancada
  const [round] = await db.select().from(rounds).where(eq(rounds.id, roundId));
  if (round?.isComplete) {
    return NextResponse.json({ error: 'La ronda ja està tancada' }, { status: 409 });
  }

  // Si és un bye, el resultat és automàtic
  if (pairing.player2Id === null) {
    await db.update(pairings)
      .set({ outcome1: 'bye', p1Score: null, p2Score: null, reportedAt: new Date() })
      .where(eq(pairings.id, pairingId));
    return NextResponse.json({ ok: true });
  }

  // Valida que els resultats siguin coherents
  if (p1Score == null || p2Score == null) {
    return NextResponse.json({ error: 'Cal p1Score i p2Score' }, { status: 400 });
  }

  // Calcula els resultats automàticament si no s'especifiquen
  let o1: GameOutcome = outcome1;
  let o2: GameOutcome = outcome2;
  if (!o1 || !o2) {
    if (p1Score > p2Score) { o1 = 'win'; o2 = 'loss'; }
    else if (p2Score > p1Score) { o1 = 'loss'; o2 = 'win'; }
    else { o1 = 'draw'; o2 = 'draw'; }
  }

  await db.update(pairings).set({
    p1Score,
    p2Score,
    outcome1: o1,
    outcome2: o2,
    p1Scrabbles: p1Scrabbles ?? null,
    p2Scrabbles: p2Scrabbles ?? null,
    p1BestWord: p1BestWord ?? null,
    p2BestWord: p2BestWord ?? null,
    p1BestWordScore: p1BestWordScore ?? null,
    p2BestWordScore: p2BestWordScore ?? null,
    location: location ?? null,
    comments: comments ?? null,
    reportedAt: new Date(),
  }).where(eq(pairings.id, pairingId));

  return NextResponse.json({ ok: true });
}
