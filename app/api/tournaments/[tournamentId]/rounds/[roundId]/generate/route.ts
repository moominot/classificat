import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { matchParticipants, matches, phases, roundAbsences, rounds } from '@/db/schema';
import type { PhaseConfig } from '@/db/types';
import { requireTournamentAccess } from '@/lib/authz';
import { generatePairings } from '@/lib/pairing/engine';
import { computeStandings } from '@/lib/pairing/standings';
import type { Entrant, PairingContext, Phase as EnginePhase } from '@/lib/pairing/types';
import { loadEntrants, loadPreviousMatches, loadQuestionMetrics, loadScoredMatches } from '@/lib/db-helpers';

type Params = { params: Promise<{ tournamentId: string; roundId: string }> };

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

  const existing = await db.select({ id: matches.id }).from(matches).where(eq(matches.roundId, roundId));
  if (existing.length > 0) {
    return NextResponse.json(
      { error: 'Aquesta ronda ja té aparellaments. Elimineu-los primer si voleu regenerar-los.' },
      { status: 409 }
    );
  }

  const [phase] = await db.select().from(phases).where(eq(phases.id, round.phaseId));
  if (!phase) return NextResponse.json({ error: 'Fase no trobada' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const absentEntryIds: string[] = Array.isArray(body.absentEntryIds)
    ? body.absentEntryIds.filter((x: unknown) => typeof x === 'string')
    : [];

  if (absentEntryIds.length > 0) {
    await db
      .insert(roundAbsences)
      .values(absentEntryIds.map((entryId) => ({ roundId, entryId })))
      .onConflictDoNothing();
  }

  const absent = new Set(absentEntryIds);
  const entrants: Entrant[] = (await loadEntrants(tournamentId)).filter(
    (e) => e.isActive && !absent.has(e.id)
  );

  // La classificació de partida inclou les fases que la fase actual arrossega.
  const carryPhaseIds = getCarryPhaseIds(phase.config as PhaseConfig);
  const scoredMatches = await loadScoredMatches(tournamentId, {
    phaseIds: [...carryPhaseIds, phase.id],
  });
  const { metrics, answers } = await loadQuestionMetrics(tournamentId);

  const standings = computeStandings({
    entryIds: entrants.map((e) => e.id),
    matches: scoredMatches,
    tiebreakers: phase.tiebreakers,
    questionMetrics: metrics,
    answers,
  });

  const enginePhase: EnginePhase = {
    id: phase.id,
    tournamentId: phase.tournamentId,
    order: phase.order,
    name: phase.name,
    method: phase.method,
    config: phase.config,
    participantsPerMatch: phase.participantsPerMatch,
    scoring: phase.scoring,
    tiebreakers: phase.tiebreakers,
    standingsScope: phase.standingsScope,
    teamAggregation: phase.teamAggregation,
    startRound: phase.startRound,
    endRound: phase.endRound,
    isComplete: phase.isComplete,
  };

  const ctx: PairingContext = {
    phase: enginePhase,
    roundNumber: round.number,
    entrants,
    standings,
    previousMatches: await loadPreviousMatches(tournamentId),
  };

  const result = generatePairings(ctx);

  // L'equip es desa a cada participació: és una instantània del moment de
  // jugar, perquè un canvi d'equip no reescrigui la història (§12.9).
  const teamByEntry = new Map(entrants.map((e) => [e.id, e.teamId ?? null]));

  const newMatches = result.matches.map((generated) => ({
    id: uuid(),
    roundId: round.id,
    tableNumber: generated.tableNumber,
    location: null,
    comments: null,
    createdAt: new Date(),
    entryIds: generated.entryIds,
  }));

  if (newMatches.length > 0) {
    await db.insert(matches).values(
      newMatches.map(({ entryIds: _entryIds, ...match }) => match)
    );

    await db.insert(matchParticipants).values(
      newMatches.flatMap((match) =>
        match.entryIds.map((entryId, seat) => ({
          id: uuid(),
          matchId: match.id,
          entryId,
          seat,
          // El bye ja té resultat: una taula d'un sol participant.
          rank: match.entryIds.length === 1 ? 1 : null,
          score: null,
          outcome: match.entryIds.length === 1 ? ('bye' as const) : null,
          points: match.entryIds.length === 1 ? phase.scoring.byePoints : null,
          teamId: teamByEntry.get(entryId) ?? null,
        }))
      )
    );
  }

  const nameByEntry = new Map(entrants.map((e) => [e.id, e]));

  return NextResponse.json(
    {
      roundId: round.id,
      roundNumber: round.number,
      matches: newMatches.map((m) => ({
        id: m.id,
        tableNumber: m.tableNumber,
        participants: m.entryIds.map((entryId) => ({
          entryId,
          displayName: nameByEntry.get(entryId)?.displayName ?? entryId,
        })),
      })),
      warnings: result.warnings,
      seedingOrder: (result.seedingOrder ?? []).map((entryId, i) => ({
        seed: i + 1,
        entryId,
        displayName: nameByEntry.get(entryId)?.displayName ?? entryId,
        rating: nameByEntry.get(entryId)?.rating ?? null,
      })),
    },
    { status: 201 }
  );
}

/** Fases de les quals aquesta arrossega la classificació. */
function getCarryPhaseIds(config: PhaseConfig): string[] {
  if (config.method === 'swiss' || config.method === 'swiss_fide' || config.method === 'king_of_the_hill') {
    return config.carryStandingsFromPhaseIds ?? [];
  }
  return [];
}
