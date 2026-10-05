import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { phases, rounds } from '@/db/schema';
import type { PhaseConfig, SeedingCriterion } from '@/db/types';
import { requireTournamentAccess } from '@/lib/authz';
import { computeStandings } from '@/lib/pairing/standings';
import { DEFAULT_SEEDING_CRITERIA } from '@/lib/pairing/types';
import { loadEntrants, loadQuestionMetrics, loadScoredMatches } from '@/lib/db-helpers';

type Params = { params: Promise<{ tournamentId: string; roundId: string }> };

/**
 * GET — Previsualització de l'ordre de sembrat d'una ronda.
 *
 * Serveix perquè l'admin vegi amb quin ordre s'aparellarà abans de generar res.
 */
export async function GET(req: Request, { params }: Params) {
  const { tournamentId, roundId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const absentIds = new Set(
    (new URL(req.url).searchParams.get('absentIds') ?? '').split(',').filter(Boolean)
  );

  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, roundId), eq(rounds.tournamentId, tournamentId)));
  if (!round) return NextResponse.json({ error: 'Ronda no trobada' }, { status: 404 });

  const [phase] = await db.select().from(phases).where(eq(phases.id, round.phaseId));
  if (!phase) return NextResponse.json({ error: 'Fase no trobada' }, { status: 404 });

  const entrants = (await loadEntrants(tournamentId)).filter(
    (e) => e.isActive && !absentIds.has(e.id)
  );

  const carryPhaseIds = getCarryPhaseIds(phase.config);
  const matches = await loadScoredMatches(tournamentId, {
    phaseIds: [...carryPhaseIds, phase.id],
  });
  const { metrics, answers } = await loadQuestionMetrics(tournamentId);

  const standings = computeStandings({
    entryIds: entrants.map((e) => e.id),
    matches,
    tiebreakers: phase.tiebreakers,
    questionMetrics: metrics,
    answers,
  });
  const standingByEntry = new Map(standings.map((s) => [s.entryId, s]));

  const config = phase.config as { seedingCriteria?: SeedingCriterion[] };
  const criteria: SeedingCriterion[] = config.seedingCriteria?.length
    ? config.seedingCriteria
    : [...DEFAULT_SEEDING_CRITERIA];

  const sorted = [...entrants].sort((a, b) => {
    for (const criterion of criteria) {
      let cmp = 0;
      if (criterion === 'points') {
        cmp = (standingByEntry.get(b.id)?.points ?? 0) - (standingByEntry.get(a.id)?.points ?? 0);
      } else if (criterion === 'elo') {
        const ra = a.rating ?? null;
        const rb = b.rating ?? null;
        if (ra === null && rb === null) cmp = 0;
        else if (ra === null) cmp = 1;
        else if (rb === null) cmp = -1;
        else cmp = rb - ra;
      } else if (criterion === 'rank') {
        cmp = (standingByEntry.get(a.id)?.rank ?? 9999) - (standingByEntry.get(b.id)?.rank ?? 9999);
      } else if (criterion === 'name') {
        cmp = a.displayName.localeCompare(b.displayName);
      }
      if (cmp !== 0) return cmp;
    }
    return 0;
  });

  return NextResponse.json({
    isFirstRound: round.number === phase.startRound,
    participantsPerMatch: phase.participantsPerMatch,
    seedingOrder: sorted.map((entrant, i) => ({
      seed: i + 1,
      entryId: entrant.id,
      displayName: entrant.displayName,
      rating: entrant.rating ?? null,
      points: standingByEntry.get(entrant.id)?.points ?? 0,
      rank: standingByEntry.get(entrant.id)?.rank ?? null,
    })),
  });
}

function getCarryPhaseIds(config: PhaseConfig): string[] {
  if (config.method === 'swiss' || config.method === 'swiss_fide' || config.method === 'king_of_the_hill') {
    return config.carryStandingsFromPhaseIds ?? [];
  }
  return [];
}
