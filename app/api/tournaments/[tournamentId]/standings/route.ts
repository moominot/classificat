import { NextResponse } from 'next/server';
import { db } from '@/db';
import { rounds, pairings, phases, players } from '@/db/schema';
import { eq, and, inArray, lte } from 'drizzle-orm';
import { computeStandings } from '@/lib/pairing/standings';
import type { Round as EngineRound, Phase as EnginePhase } from '@/lib/pairing/types';

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * GET /api/tournaments/:tid/standings
 * Query params:
 *   ?phaseId=   (filtra a una fase)
 *   ?afterRound= (classificació fins a aquesta ronda)
 *   ?grouped=true (retorna classificació per grups)
 */
export async function GET(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const url = new URL(req.url);
  const phaseId = url.searchParams.get('phaseId');
  const afterRoundStr = url.searchParams.get('afterRound');
  const afterRound = afterRoundStr ? parseInt(afterRoundStr) : null;

  // Determina quines fases incloure
  let allPhases = await db
    .select()
    .from(phases)
    .where(eq(phases.tournamentId, tournamentId));

  if (phaseId) {
    allPhases = allPhases.filter((p) => p.id === phaseId);
    if (allPhases.length === 0) {
      return NextResponse.json({ error: 'Fase no trobada' }, { status: 404 });
    }
  }

  const phaseIds = allPhases.map((p) => p.id);

  // Carrega les rondes d'aquestes fases
  let allRounds = await db
    .select()
    .from(rounds)
    .where(inArray(rounds.phaseId, phaseIds));

  if (afterRound !== null) {
    allRounds = allRounds.filter((r) => r.number <= afterRound);
  }

  const roundIds = allRounds.map((r) => r.id);

  // Carrega els aparellaments
  const allPairings = roundIds.length > 0
    ? await db.select().from(pairings).where(inArray(pairings.roundId, roundIds))
    : [];

  // Carrega els jugadors
  const allPlayers = await db
    .select()
    .from(players)
    .where(eq(players.tournamentId, tournamentId));

  // Construeix les rondes del motor
  const engineRounds: EngineRound[] = allRounds.map((r) => ({
    id: r.id,
    tournamentId: r.tournamentId,
    phaseId: r.phaseId,
    number: r.number,
    isComplete: r.isComplete,
    createdAt: new Date(),
    pairings: allPairings
      .filter((p) => p.roundId === r.id)
      .map((p) => ({
        id: p.id,
        roundId: p.roundId,
        tableNumber: p.tableNumber,
        player1Id: p.player1Id,
        player2Id: p.player2Id ?? null,
        result: p.outcome1 ? {
          p1Score: p.p1Score ?? 0,
          p2Score: p.p2Score ?? null,
          outcome1: p.outcome1,
          outcome2: p.outcome2 ?? null,
          reportedAt: new Date(),
          reportedBy: p.reportedBy ?? null,
        } : null,
      })),
  }));

  // Usa el primer desempat de la primera fase com a referència
  // (o un default raonable)
  const primaryPhase = allPhases[0];
  const tiebreakers = (primaryPhase?.tiebreakers ?? ['median_buchholz', 'buchholz', 'spread']) as EnginePhase['tiebreakers'];

  const playerIds = allPlayers.map((p) => p.id);
  const standings = computeStandings(engineRounds, playerIds, tiebreakers);

  // Enriqueix amb noms de jugadors
  const playerMap = new Map(allPlayers.map((p) => [p.id, p]));
  const enriched = standings.map((s) => ({
    ...s,
    playerName: playerMap.get(s.playerId)?.name ?? 'Desconegut',
    groupId: playerMap.get(s.playerId)?.groupId ?? null,
  }));

  return NextResponse.json(enriched);
}
