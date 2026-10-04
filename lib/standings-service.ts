import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { phases, teams, tournaments } from '@/db/schema';
import { DEFAULT_VISIBILITY } from '@/db/types';
import type { StandingsMode, TeamAggregation } from '@/db/types';
import { computeStandings, computeTeamStandings } from '@/lib/pairing/standings';
import type { Standing, TeamStanding } from '@/lib/pairing/types';
import { loadEntrants, loadQuestionMetrics, loadScoredMatches } from '@/lib/db-helpers';

/**
 * Classificació d'una competició, amb la visibilitat aplicada **al servidor**.
 *
 * Amagar la classificació a la interfície no serveix de res si l'API la
 * continua servint (docs/pla-rols.md §8.3), així que la decisió es pren aquí i
 * les pantalles només mostren el que reben.
 */

export interface StandingRow extends Standing {
  displayName: string;
  groupId: string | null;
  teamId: string | null;
  tagIds: string[];
}

export interface TeamStandingRow extends TeamStanding {
  name: string;
}

export interface StandingsView {
  visible: boolean;
  /** Mode aplicat realment: per a qui gestiona sempre és `live`. */
  mode: StandingsMode;
  frozenRound: number | null;
  /** Fases en temps real: en mode `closed_rounds` també hi compten les rondes obertes. */
  livePhaseIds: string[];
  standings: StandingRow[];
  teamStandings: TeamStandingRow[] | null;
}

const HIDDEN: StandingsView = {
  visible: false,
  mode: 'hidden',
  frozenRound: null,
  livePhaseIds: [],
  standings: [],
  teamStandings: null,
};

export async function loadStandings(
  tournamentId: string,
  opts: { canManage: boolean; phaseId?: string | null; upToRound?: number | null } = { canManage: false }
): Promise<StandingsView> {
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!tournament) return HIDDEN;

  const visibility = tournament.visibility ?? DEFAULT_VISIBILITY;

  // Qui gestiona la competició la veu sempre i sencera: si no, no podria
  // comprovar què està publicant (§8.3).
  const mode: StandingsMode = opts.canManage ? 'live' : visibility.standingsMode;
  if (mode === 'hidden') return HIDDEN;

  const allPhases = await db
    .select()
    .from(phases)
    .where(eq(phases.tournamentId, tournamentId))
    .orderBy(asc(phases.order));

  const activePhases = opts.phaseId ? allPhases.filter((p) => p.id === opts.phaseId) : allPhases;
  const referencePhase = activePhases[activePhases.length - 1] ?? null;
  const livePhaseIds = allPhases.filter((p) => p.standingsLive).map((p) => p.id);

  const scopedMatches = await loadScoredMatches(tournamentId, {
    onlyClosedRounds: mode === 'closed_rounds',
    livePhaseIds,
    upToRound:
      opts.upToRound ??
      (mode === 'frozen_at' && visibility.frozenRound !== null ? visibility.frozenRound : undefined),
    phaseIds: opts.phaseId ? activePhases.map((p) => p.id) : undefined,
  });

  const entrants = await loadEntrants(tournamentId);
  const { metrics, answers } = await loadQuestionMetrics(tournamentId, {
    onlyClosedRounds: mode === 'closed_rounds',
    livePhaseIds,
    phaseIds: opts.phaseId ? activePhases.map((p) => p.id) : undefined,
  });

  const standings = computeStandings({
    entryIds: entrants.map((e) => e.id),
    matches: scopedMatches,
    tiebreakers: referencePhase?.tiebreakers ?? [],
    questionMetrics: metrics,
    answers,
  });

  const entrantById = new Map(entrants.map((e) => [e.id, e]));
  const rows: StandingRow[] = standings.map((standing) => ({
    ...standing,
    displayName: entrantById.get(standing.entryId)?.displayName ?? 'Desconegut',
    groupId: entrantById.get(standing.entryId)?.groupId ?? null,
    teamId: entrantById.get(standing.entryId)?.teamId ?? null,
    tagIds: entrantById.get(standing.entryId)?.tagIds ?? [],
  }));

  return {
    visible: true,
    mode,
    frozenRound: visibility.frozenRound,
    livePhaseIds,
    standings: rows,
    teamStandings: await maybeTeamStandings(tournamentId, activePhases, scopedMatches, standings),
  };
}

async function maybeTeamStandings(
  tournamentId: string,
  activePhases: Array<{ standingsScope: string[]; teamAggregation: TeamAggregation | null }>,
  matches: Awaited<ReturnType<typeof loadScoredMatches>>,
  standings: Standing[]
): Promise<TeamStandingRow[] | null> {
  const teamPhase = activePhases.find((p) => p.standingsScope?.includes('team'));
  if (!teamPhase) return null;

  const teamRows = await db.select().from(teams).where(eq(teams.tournamentId, tournamentId));
  const nameById = new Map(teamRows.map((t) => [t.id, t.name]));

  return computeTeamStandings({
    matches,
    aggregation: teamPhase.teamAggregation ?? { rule: 'sum' },
    standings,
  }).map((team) => ({ ...team, name: nameById.get(team.teamId) ?? 'Equip' }));
}
