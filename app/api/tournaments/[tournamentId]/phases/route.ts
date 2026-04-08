import { NextResponse } from 'next/server';
import { db } from '@/db';
import { phases, rounds, tournaments } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import type { PhaseConfig, Tiebreaker } from '@/lib/pairing/types';

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

export async function POST(req: Request, { params }: Params) {
  const { tournamentId } = await params;

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!tournament) return NextResponse.json({ error: 'Campionat no trobat' }, { status: 404 });

  const body = await req.json();
  const { name, method, startRound, endRound, tiebreakers, config, order } = body;

  // Validació bàsica
  if (!name || !method || startRound == null || endRound == null || !config) {
    return NextResponse.json(
      { error: 'Camps obligatoris: name, method, startRound, endRound, config' },
      { status: 400 }
    );
  }
  if (startRound > endRound) {
    return NextResponse.json({ error: 'startRound ha de ser ≤ endRound' }, { status: 400 });
  }

  // Valida solapaments de rondes amb fases existents
  const existingPhases = await db
    .select()
    .from(phases)
    .where(eq(phases.tournamentId, tournamentId));

  for (const ep of existingPhases) {
    const overlap =
      startRound <= ep.endRound && endRound >= ep.startRound;
    if (overlap) {
      return NextResponse.json(
        { error: `Les rondes ${startRound}–${endRound} se solapen amb la fase "${ep.name}" (rondes ${ep.startRound}–${ep.endRound})` },
        { status: 409 }
      );
    }
  }

  const newPhase = {
    id: uuid(),
    tournamentId,
    order: order ?? existingPhases.length + 1,
    name,
    method,
    startRound,
    endRound,
    tiebreakers: (tiebreakers ?? []) as Tiebreaker[],
    config: config as PhaseConfig,
    isComplete: false,
  };

  await db.insert(phases).values(newPhase);
  return NextResponse.json(newPhase, { status: 201 });
}
