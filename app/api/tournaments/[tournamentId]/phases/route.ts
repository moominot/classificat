import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { phases, tournaments } from '@/db/schema';
import { DEFAULT_SCORING } from '@/db/types';
import type { PhaseConfig, ScoringConfig, StandingsScopeKey, TeamAggregation } from '@/db/types';
import { requireTournamentAccess } from '@/lib/authz';
import { validatePhaseConfig } from '@/lib/pairing/validation';

type Params = { params: Promise<{ tournamentId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const all = await db
    .select()
    .from(phases)
    .where(eq(phases.tournamentId, tournamentId))
    .orderBy(asc(phases.order));
  return NextResponse.json(all);
}

/**
 * POST — Crea una fase.
 *
 * El que no s'especifica **s'hereta de la fase anterior** (§12.6): puntuació,
 * desempats, àmbits de classificació i agregació d'equips. Així no cal
 * reconfigurar-ho tot a cada fase, que és d'on surten la meitat dels errors.
 */
export async function POST(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!tournament) return NextResponse.json({ error: 'Competició no trobada' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { name, method, startRound, endRound, config, order } = body;

  if (!name || !method || startRound == null || endRound == null || !config) {
    return NextResponse.json(
      { error: 'Camps obligatoris: name, method, startRound, endRound, config' },
      { status: 400 }
    );
  }
  if (startRound > endRound) {
    return NextResponse.json({ error: 'startRound ha de ser ≤ endRound' }, { status: 400 });
  }

  const existingPhases = await db
    .select()
    .from(phases)
    .where(eq(phases.tournamentId, tournamentId))
    .orderBy(asc(phases.order));

  for (const phase of existingPhases) {
    if (startRound <= phase.endRound && endRound >= phase.startRound) {
      return NextResponse.json(
        {
          error: `Les rondes ${startRound}–${endRound} se solapen amb la fase "${phase.name}" (rondes ${phase.startRound}–${phase.endRound})`,
        },
        { status: 409 }
      );
    }
  }

  const previous = existingPhases[existingPhases.length - 1] ?? null;

  const participantsPerMatch = body.participantsPerMatch ?? previous?.participantsPerMatch ?? 2;
  const scoring: ScoringConfig = body.scoring ?? previous?.scoring ?? DEFAULT_SCORING;
  const tiebreakers: string[] = body.tiebreakers ?? previous?.tiebreakers ?? [];
  const standingsScope: StandingsScopeKey[] =
    body.standingsScope ?? previous?.standingsScope ?? ['global'];
  const teamAggregation: TeamAggregation | null =
    body.teamAggregation ?? previous?.teamAggregation ?? null;

  const standingsLive: boolean = typeof body.standingsLive === 'boolean' ? body.standingsLive : (previous?.standingsLive ?? false);

  const invalid = validatePhaseConfig({ method, participantsPerMatch, tiebreakers });
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const newPhase = {
    id: uuid(),
    tournamentId,
    order: order ?? existingPhases.length + 1,
    name,
    method,
    config: config as PhaseConfig,
    participantsPerMatch,
    scoring,
    tiebreakers,
    standingsScope,
    teamAggregation,
    standingsLive,
    startRound,
    endRound,
    isComplete: false,
  };

  await db.insert(phases).values(newPhase);
  return NextResponse.json(newPhase, { status: 201 });
}
