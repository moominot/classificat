import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { phases, rounds, tournaments } from '@/db/schema';
import { DEFAULT_VISIBILITY } from '@/db/types';
import { loadEntrants, loadRoundMatches } from '@/lib/db-helpers';
import { loadStandings } from '@/lib/standings-service';
import Projector from './Projector';

export const dynamic = 'force-dynamic';

/**
 * Vista per projectar a pantalla completa (aparellaments i classificació).
 *
 * Es calcula sempre com la veuen els jugadors, també per a qui gestiona: si
 * els aparellaments o els resultats encara no estan publicats, no es
 * projecten per error. La ronda és la darrera visible, o la de `?r=`.
 */
export default async function ProjectorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  const visibility = tournament?.visibility ?? DEFAULT_VISIBILITY;

  const totesRondes = await db.select().from(rounds).where(eq(rounds.tournamentId, id)).orderBy(asc(rounds.number));
  const amb = (r: (typeof totesRondes)[number]) => r.status !== 'draft' && (r.pairingsVisible ?? visibility.pairingsVisible);
  const disponibles = totesRondes.filter(amb);
  const demanada = sp.r ? parseInt(sp.r, 10) : NaN;
  const ronda = disponibles.find((r) => r.number === demanada) ?? disponibles[disponibles.length - 1] ?? null;

  let aparellaments: {
    ronda: number;
    fase: string | null;
    taules: { id: string; taula: number; jugadors: { nom: string; punts: number | null }[] }[];
  } | null = null;

  const [inscrits, vista, totesFases] = await Promise.all([
    loadEntrants(id),
    loadStandings(id, { canManage: false }),
    db.select().from(phases).where(eq(phases.tournamentId, id)),
  ]);

  if (ronda) {
    const resultatsVisibles = ronda.resultsVisible ?? visibility.resultsVisible;
    const nom = new Map(inscrits.map((e) => [e.id, e.displayName]));
    const partides = await loadRoundMatches(ronda.id);
    aparellaments = {
      ronda: ronda.number,
      fase: totesFases.find((f) => f.id === ronda.phaseId)?.name ?? null,
      taules: partides.map((p) => ({
        id: p.id,
        taula: p.tableNumber,
        jugadors: p.participants.map((x) => ({
          nom: nom.get(x.entryId) ?? '?',
          punts: resultatsVisibles && p.participants.length > 1 ? x.score : null,
        })),
      })),
    };
  }

  const classificacio = vista.visible
    ? vista.standings.map((s) => ({
        id: s.entryId,
        rank: s.rank,
        nom: s.displayName,
        partides: s.gamesPlayed,
        v: s.wins,
        e: s.draws,
        d: s.losses,
        punts: s.points,
      }))
    : null;

  return (
    <Projector
      nomCampionat={tournament?.name ?? ''}
      aparellaments={aparellaments}
      classificacio={classificacio}
      inicial={sp.v === 'classificacio' ? 'classificacio' : 'aparellaments'}
    />
  );
}
