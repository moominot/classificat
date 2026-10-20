import { db } from '@/db';
import { phases, tournaments, tournamentTemplates } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { loadEntrants, loadTags } from '@/lib/db-helpers';
import FasesClient from './FasesClient';

export const dynamic = 'force-dynamic';

export default async function FasesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [totes, tags, inscrits, [plantilla]] = await Promise.all([
    db.select().from(phases).where(eq(phases.tournamentId, id)).orderBy(asc(phases.order)),
    loadTags(id),
    loadEntrants(id),
    db
      .select({ config: tournamentTemplates.config })
      .from(tournaments)
      .innerJoin(tournamentTemplates, eq(tournamentTemplates.id, tournaments.templateId))
      .where(eq(tournaments.id, id)),
  ]);

  const entrants = inscrits
    .filter((e) => e.isActive)
    .map((e) => ({ id: e.id, displayName: e.displayName }));

  return (
    <FasesClient
      tournamentId={id}
      fases={totes}
      tags={tags}
      entrants={entrants}
      eliminatoriaPerPosicions={plantilla?.config.phaseGenerator === 'position_elimination'}
    />
  );
}
