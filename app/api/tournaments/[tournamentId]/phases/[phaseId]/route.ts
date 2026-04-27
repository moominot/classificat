import { NextResponse } from 'next/server';
import { db } from '@/db';
import { phases, rounds, pairings } from '@/db/schema';
import { eq, and, ne, inArray, isNotNull } from 'drizzle-orm';
import type { PhaseConfig, Tiebreaker } from '@/lib/pairing/types';

type Params = { params: Promise<{ tournamentId: string; phaseId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { tournamentId, phaseId } = await params;

  const [phase] = await db.select().from(phases).where(
    and(eq(phases.id, phaseId), eq(phases.tournamentId, tournamentId))
  );
  if (!phase) return NextResponse.json({ error: 'Fase no trobada' }, { status: 404 });

  const body = await req.json();
  const { name, startRound, endRound, tiebreakers, config } = body;

  if (!name || startRound == null || endRound == null) {
    return NextResponse.json({ error: 'Camps obligatoris: name, startRound, endRound' }, { status: 400 });
  }
  if (startRound > endRound) {
    return NextResponse.json({ error: 'startRound ha de ser ≤ endRound' }, { status: 400 });
  }

  const otherPhases = await db.select().from(phases).where(
    and(eq(phases.tournamentId, tournamentId), ne(phases.id, phaseId))
  );
  for (const op of otherPhases) {
    if (startRound <= op.endRound && endRound >= op.startRound) {
      return NextResponse.json(
        { error: `Les rondes ${startRound}–${endRound} se solapen amb la fase "${op.name}" (rondes ${op.startRound}–${op.endRound})` },
        { status: 409 }
      );
    }
  }

  await db.update(phases).set({
    name,
    startRound,
    endRound,
    tiebreakers: (tiebreakers ?? []) as Tiebreaker[],
    config: config as PhaseConfig,
  }).where(eq(phases.id, phaseId));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { tournamentId, phaseId } = await params;

  const [phase] = await db.select().from(phases).where(
    and(eq(phases.id, phaseId), eq(phases.tournamentId, tournamentId))
  );
  if (!phase) return NextResponse.json({ error: 'Fase no trobada' }, { status: 404 });

  const phaseRounds = await db.select().from(rounds).where(eq(rounds.phaseId, phaseId));
  if (phaseRounds.length > 0) {
    const roundIds = phaseRounds.map(r => r.id);
    const withResults = await db.select({ id: pairings.id }).from(pairings).where(
      and(inArray(pairings.roundId, roundIds), isNotNull(pairings.outcome1))
    ).limit(1);
    if (withResults.length > 0) {
      return NextResponse.json(
        { error: 'No es pot esborrar una fase amb resultats registrats' },
        { status: 409 }
      );
    }
  }

  await db.delete(phases).where(eq(phases.id, phaseId));
  return NextResponse.json({ ok: true });
}
