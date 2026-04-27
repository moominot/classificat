import { NextResponse } from 'next/server';
import { db } from '@/db';
import { rounds, pairings, phases, players, groups, roundAbsences } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { generatePairings } from '@/lib/pairing/engine';
import { computeStandings } from '@/lib/pairing/standings';
import type {
  PairingContext,
  Round as EngineRound,
  Player as EnginePlayer,
  PreviousPairing,
  Phase as EnginePhase,
  SwissConfig,
  KingOfTheHillConfig,
} from '@/lib/pairing/types';

type Params = { params: Promise<{ tournamentId: string; roundId: string }> };

export async function POST(req: Request, { params }: Params) {
  const { tournamentId, roundId } = await params;

  // Carrega la ronda
  const [round] = await db.select().from(rounds).where(
    and(eq(rounds.id, roundId), eq(rounds.tournamentId, tournamentId))
  );
  if (!round) return NextResponse.json({ error: 'Ronda no trobada' }, { status: 404 });
  if (round.isComplete) return NextResponse.json({ error: 'La ronda ja està tancada' }, { status: 409 });

  // Comprova que la ronda no tingui ja aparellaments generats
  const existingPairings = await db.select().from(pairings).where(eq(pairings.roundId, roundId));
  if (existingPairings.length > 0) {
    return NextResponse.json(
      { error: 'Aquesta ronda ja té aparellaments. Elimineu-los primer si voleu regenerar.' },
      { status: 409 }
    );
  }

  // Carrega la fase
  const [phase] = await db.select().from(phases).where(eq(phases.id, round.phaseId));
  if (!phase) return NextResponse.json({ error: 'Fase no trobada' }, { status: 404 });

  // Llegeix els absents del cos de la petició
  let absentPlayerIds: string[] = [];
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body.absentPlayerIds)) {
      absentPlayerIds = body.absentPlayerIds.filter((x: unknown) => typeof x === 'string');
    }
  } catch { /* body buit, cap absent */ }

  // Desa les absències
  if (absentPlayerIds.length > 0) {
    await db.insert(roundAbsences).values(
      absentPlayerIds.map(pid => ({ roundId, playerId: pid }))
    ).onConflictDoNothing();
  }

  // Carrega els jugadors actius del campionat (excloent absents)
  const dbPlayersAll = await db
    .select()
    .from(players)
    .where(and(eq(players.tournamentId, tournamentId), eq(players.isActive, true)));

  const absentSet = new Set(absentPlayerIds);
  const dbPlayers = dbPlayersAll.filter(p => !absentSet.has(p.id));

  // Determina quines fases cal incloure per al càlcul de classificació
  const carryPhaseIds = getCarryPhaseIds(phase.config as EnginePhase['config']);
  const phaseIdsForStandings = [...carryPhaseIds, phase.id];

  // Carrega totes les rondes de les fases rellevants
  const relevantRounds = await db
    .select()
    .from(rounds)
    .where(inArray(rounds.phaseId, phaseIdsForStandings));

  const relevantRoundIds = relevantRounds.map((r) => r.id);

  // Carrega els aparellaments amb resultats d'aquestes rondes
  const allPairings = relevantRoundIds.length > 0
    ? await db.select().from(pairings).where(inArray(pairings.roundId, relevantRoundIds))
    : [];

  // Construeix les rondes del motor d'aparellaments
  const engineRounds: EngineRound[] = relevantRounds.map((r) => ({
    id: r.id,
    tournamentId: r.tournamentId,
    phaseId: r.phaseId,
    number: r.number,
    isComplete: r.isComplete,
    createdAt: new Date(r.createdAt as unknown as number * 1000),
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
          reportedAt: new Date((p.reportedAt as unknown as number) * 1000),
          reportedBy: p.reportedBy ?? null,
        } : null,
      })),
  }));

  // Calcula la classificació actual
  const playerIds = dbPlayers.map((p) => p.id);
  const standings = computeStandings(
    engineRounds,
    playerIds,
    phase.tiebreakers as EnginePhase['tiebreakers']
  );

  // Construeix l'historial d'aparellaments previs per evitar revanxes
  const previousPairings: PreviousPairing[] = allPairings
    .filter((p) => p.player2Id !== null)
    .map((p) => {
      const r = relevantRounds.find((rr) => rr.id === p.roundId)!;
      return {
        player1Id: p.player1Id,
        player2Id: p.player2Id!,
        roundNumber: r.number,
        phaseId: r.phaseId,
      };
    });

  // Construeix el context del motor
  const enginePlayers: EnginePlayer[] = dbPlayers.map((p) => ({
    id: p.id,
    tournamentId: p.tournamentId,
    name: p.name,
    rating: p.rating ?? null,
    groupId: p.groupId ?? null,
    isActive: p.isActive,
    createdAt: new Date((p.createdAt as unknown as number) * 1000),
  }));

  const enginePhase: EnginePhase = {
    id: phase.id,
    tournamentId: phase.tournamentId,
    order: phase.order,
    name: phase.name,
    method: phase.method as EnginePhase['method'],
    startRound: phase.startRound,
    endRound: phase.endRound,
    tiebreakers: phase.tiebreakers as EnginePhase['tiebreakers'],
    config: phase.config as EnginePhase['config'],
    isComplete: phase.isComplete,
  };

  const ctx: PairingContext = {
    phase: enginePhase,
    roundNumber: round.number,
    players: enginePlayers,
    standings,
    previousPairings,
  };

  // Genera els aparellaments
  const result = generatePairings(ctx);

  // Desa els aparellaments en una transacció
  const newPairings = result.pairings.map((p) => ({
    id: uuid(),
    roundId: round.id,
    tableNumber: p.tableNumber,
    player1Id: p.player1Id,
    player2Id: p.player2Id ?? null,
    // Bye: resultat automàtic
    ...(p.player2Id === null ? {
      outcome1: 'bye' as const,
      p1Score: null,
      p2Score: null,
    } : {}),
  }));

  if (newPairings.length > 0) {
    await db.insert(pairings).values(newPairings);
  }

  const playerInfoMap = new Map(enginePlayers.map((p) => [p.id, { name: p.name, rating: p.rating ?? null }]));
  const seedingOrder = (result.seedingOrder ?? []).map((id, i) => ({
    seed: i + 1,
    playerId: id,
    name: playerInfoMap.get(id)?.name ?? id,
    rating: playerInfoMap.get(id)?.rating ?? null,
  }));

  return NextResponse.json({
    roundId: round.id,
    roundNumber: round.number,
    pairings: newPairings,
    warnings: result.warnings,
    seedingOrder,
  }, { status: 201 });
}

function getCarryPhaseIds(config: EnginePhase['config']): string[] {
  if (config.method === 'swiss') return (config as SwissConfig).carryStandingsFromPhaseIds;
  if (config.method === 'king_of_the_hill') return (config as KingOfTheHillConfig).carryStandingsFromPhaseIds;
  return [];
}
