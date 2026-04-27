import { NextResponse } from 'next/server';
import { db } from '@/db';
import { rounds, pairings as pairingsTable, phases, players } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { computeStandings } from '@/lib/pairing/standings';
import type {
  Phase as EnginePhase,
  Round as EngineRound,
  SwissConfig,
  KingOfTheHillConfig,
  SeedingCriterion,
} from '@/lib/pairing/types';
import { DEFAULT_SEEDING_CRITERIA } from '@/lib/pairing/types';

type Params = { params: Promise<{ tournamentId: string; roundId: string }> };

function getCarryPhaseIds(config: EnginePhase['config']): string[] {
  if (config.method === 'swiss') return (config as SwissConfig).carryStandingsFromPhaseIds;
  if (config.method === 'king_of_the_hill') return (config as KingOfTheHillConfig).carryStandingsFromPhaseIds;
  return [];
}

export async function GET(req: Request, { params }: Params) {
  const { tournamentId, roundId } = await params;
  const url = new URL(req.url);
  const absentIds = new Set(
    (url.searchParams.get('absentIds') ?? '').split(',').filter(Boolean)
  );

  const [round] = await db.select().from(rounds).where(
    and(eq(rounds.id, roundId), eq(rounds.tournamentId, tournamentId))
  );
  if (!round) return NextResponse.json({ error: 'Ronda no trobada' }, { status: 404 });

  const [phase] = await db.select().from(phases).where(eq(phases.id, round.phaseId));
  if (!phase) return NextResponse.json({ error: 'Fase no trobada' }, { status: 404 });

  const dbPlayers = await db
    .select()
    .from(players)
    .where(and(eq(players.tournamentId, tournamentId), eq(players.isActive, true)));

  const activePlayers = dbPlayers.filter(p => !absentIds.has(p.id));
  const playerIds = activePlayers.map(p => p.id);

  const carryPhaseIds = getCarryPhaseIds(phase.config as EnginePhase['config']);
  const phaseIdsForStandings = [...carryPhaseIds, phase.id];

  const relevantRounds = await db
    .select()
    .from(rounds)
    .where(inArray(rounds.phaseId, phaseIdsForStandings));

  const relevantRoundIds = relevantRounds.map(r => r.id);
  const allPairings = relevantRoundIds.length > 0
    ? await db.select().from(pairingsTable).where(inArray(pairingsTable.roundId, relevantRoundIds))
    : [];

  const engineRounds: EngineRound[] = relevantRounds.map(r => ({
    id: r.id,
    tournamentId: r.tournamentId,
    phaseId: r.phaseId,
    number: r.number,
    isComplete: r.isComplete,
    createdAt: new Date((r.createdAt as unknown as number) * 1000),
    pairings: allPairings
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
          reportedAt: new Date((p.reportedAt as unknown as number) * 1000),
          reportedBy: p.reportedBy ?? null,
        } : null,
      })),
  }));

  const standings = computeStandings(
    engineRounds,
    playerIds,
    phase.tiebreakers as EnginePhase['tiebreakers']
  );
  const standingMap = new Map(standings.map(s => [s.playerId, s]));

  const isFirstRound = round.number === phase.startRound;
  const config = phase.config as SwissConfig;
  const criteria: SeedingCriterion[] = config.seedingCriteria?.length
    ? config.seedingCriteria
    : DEFAULT_SEEDING_CRITERIA;

  const sorted = [...activePlayers].sort((a, b) => {
    for (const criterion of criteria) {
      let cmp = 0;
      if (criterion === 'points') {
        const pa = standingMap.get(a.id)?.points ?? 0;
        const pb = standingMap.get(b.id)?.points ?? 0;
        cmp = pb - pa;
      } else if (criterion === 'elo') {
        const ra = a.rating ?? null;
        const rb = b.rating ?? null;
        if (ra === null && rb === null) cmp = 0;
        else if (ra === null) cmp = 1;
        else if (rb === null) cmp = -1;
        else cmp = rb - ra;
      } else if (criterion === 'rank') {
        cmp = (standingMap.get(a.id)?.rank ?? 9999) - (standingMap.get(b.id)?.rank ?? 9999);
      } else if (criterion === 'name') {
        cmp = a.name.localeCompare(b.name);
      }
      if (cmp !== 0) return cmp;
    }
    return 0;
  });

  return NextResponse.json({
    isFirstRound,
    seedingOrder: sorted.map((p, i) => ({
      seed: i + 1,
      playerId: p.id,
      name: p.name,
      rating: p.rating ?? null,
      points: standingMap.get(p.id)?.points ?? 0,
      rank: standingMap.get(p.id)?.rank ?? null,
    })),
  });
}
