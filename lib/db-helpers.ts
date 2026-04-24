import { db } from '@/db';
import { rounds, pairings } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import type { Round as EngineRound } from '@/lib/pairing/types';
import type { Pairing } from '@/db/schema';

/**
 * Carrega totes les rondes i els seus aparellaments per a un campionat.
 * Retorna les rondes en format del motor d'aparellaments.
 */
export async function loadEngineRounds(tournamentId: string): Promise<EngineRound[]> {
  const totes_rondes = await db
    .select()
    .from(rounds)
    .where(eq(rounds.tournamentId, tournamentId));

  if (totes_rondes.length === 0) return [];

  const tots_aparellaments: Pairing[] = await db
    .select()
    .from(pairings)
    .where(inArray(pairings.roundId, totes_rondes.map(r => r.id)));

  return totes_rondes
    .sort((a, b) => a.number - b.number)
    .map(r => ({
      id: r.id,
      tournamentId: r.tournamentId,
      phaseId: r.phaseId,
      number: r.number,
      isComplete: r.isComplete,
      createdAt: new Date(),
      pairings: tots_aparellaments
        .filter(p => p.roundId === r.id)
        .map(p => ({
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
}

/**
 * Retorna tots els aparellaments d'un campionat amb tots els camps (inclosos Scrabble).
 */
export async function loadAllPairings(tournamentId: string): Promise<Array<Pairing & { roundNumber: number }>> {
  const totes_rondes = await db
    .select()
    .from(rounds)
    .where(eq(rounds.tournamentId, tournamentId));

  if (totes_rondes.length === 0) return [];

  const roundNumberMap = new Map(totes_rondes.map(r => [r.id, r.number]));
  const roundIds = totes_rondes.map(r => r.id);

  const tots_aparellaments: Pairing[] = await db
    .select()
    .from(pairings)
    .where(inArray(pairings.roundId, roundIds));

  return tots_aparellaments.map(p => ({
    ...p,
    roundNumber: roundNumberMap.get(p.roundId) ?? 0,
  }));
}

/**
 * Retorna les partides d'un jugador (aparellaments on ha participat) amb info de ronda.
 */
export async function loadPlayerGames(tournamentId: string, playerId: string) {
  const totes_rondes = await db
    .select()
    .from(rounds)
    .where(eq(rounds.tournamentId, tournamentId));

  if (totes_rondes.length === 0) return [];

  const roundIds = totes_rondes.map(r => r.id);
  const roundMap = new Map(totes_rondes.map(r => [r.id, r]));

  const tots_aparellaments: Pairing[] = await db
    .select()
    .from(pairings)
    .where(inArray(pairings.roundId, roundIds));

  return tots_aparellaments
    .filter(p => p.player1Id === playerId || p.player2Id === playerId)
    .map(p => {
      const isP1 = p.player1Id === playerId;
      const round = roundMap.get(p.roundId)!;
      return {
        pairingId: p.id,
        roundId: p.roundId,
        roundNumber: round.number,
        opponentId: isP1 ? p.player2Id : p.player1Id,
        myScore: isP1 ? p.p1Score : p.p2Score,
        oppScore: isP1 ? p.p2Score : p.p1Score,
        outcome: isP1 ? p.outcome1 : p.outcome2,
        myScrabbles: isP1 ? p.p1Scrabbles : p.p2Scrabbles,
        myBestWord: isP1 ? p.p1BestWord : p.p2BestWord,
        myBestWordScore: isP1 ? p.p1BestWordScore : p.p2BestWordScore,
        oppBestWord: isP1 ? p.p2BestWord : p.p1BestWord,
        oppBestWordScore: isP1 ? p.p2BestWordScore : p.p1BestWordScore,
        location: p.location,
        comments: p.comments,
        isBye: p.player2Id === null,
      };
    })
    .sort((a, b) => a.roundNumber - b.roundNumber);
}
