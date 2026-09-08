import { NextResponse } from 'next/server';
import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { db } from '@/db';
import { matchParticipants, matches, phases, rounds } from '@/db/schema';
import type { PhaseConfig } from '@/db/types';
import { requireTournamentAccess } from '@/lib/authz';
import { validatePhaseConfig } from '@/lib/pairing/validation';

type Params = { params: Promise<{ tournamentId: string; phaseId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { tournamentId, phaseId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const [phase] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.id, phaseId), eq(phases.tournamentId, tournamentId)));
  if (!phase) return NextResponse.json({ error: 'Fase no trobada' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { name, startRound, endRound, config } = body;

  if (!name || startRound == null || endRound == null) {
    return NextResponse.json({ error: 'Camps obligatoris: name, startRound, endRound' }, { status: 400 });
  }
  if (startRound > endRound) {
    return NextResponse.json({ error: 'startRound ha de ser ≤ endRound' }, { status: 400 });
  }

  const others = await db
    .select()
    .from(phases)
    .where(and(eq(phases.tournamentId, tournamentId), ne(phases.id, phaseId)));

  for (const other of others) {
    if (startRound <= other.endRound && endRound >= other.startRound) {
      return NextResponse.json(
        {
          error: `Les rondes ${startRound}–${endRound} se solapen amb la fase "${other.name}" (rondes ${other.startRound}–${other.endRound})`,
        },
        { status: 409 }
      );
    }
  }

  const participantsPerMatch = body.participantsPerMatch ?? phase.participantsPerMatch;
  const tiebreakers = body.tiebreakers ?? phase.tiebreakers;

  // Es revalida en desar: canviar la mida de taula d'una fase ja configurada
  // hi podria deixar un desempat impossible (§12.10).
  const invalid = validatePhaseConfig({
    method: body.method ?? phase.method,
    participantsPerMatch,
    tiebreakers,
  });
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  await db
    .update(phases)
    .set({
      name,
      startRound,
      endRound,
      config: (config ?? phase.config) as PhaseConfig,
      participantsPerMatch,
      tiebreakers,
      scoring: body.scoring ?? phase.scoring,
      standingsScope: body.standingsScope ?? phase.standingsScope,
      teamAggregation: body.teamAggregation ?? phase.teamAggregation,
    })
    .where(eq(phases.id, phaseId));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { tournamentId, phaseId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const [phase] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.id, phaseId), eq(phases.tournamentId, tournamentId)));
  if (!phase) return NextResponse.json({ error: 'Fase no trobada' }, { status: 404 });

  const phaseRounds = await db.select().from(rounds).where(eq(rounds.phaseId, phaseId));

  if (phaseRounds.length > 0) {
    const phaseMatches = await db
      .select({ id: matches.id })
      .from(matches)
      .where(inArray(matches.roundId, phaseRounds.map((r) => r.id)));

    if (phaseMatches.length > 0) {
      const [withResult] = await db
        .select({ id: matchParticipants.id })
        .from(matchParticipants)
        .where(
          and(
            inArray(matchParticipants.matchId, phaseMatches.map((m) => m.id)),
            isNotNull(matchParticipants.rank)
          )
        )
        .limit(1);

      if (withResult) {
        return NextResponse.json(
          { error: 'No es pot esborrar una fase amb resultats registrats' },
          { status: 409 }
        );
      }
    }
  }

  await db.delete(phases).where(eq(phases.id, phaseId));
  return NextResponse.json({ ok: true });
}
