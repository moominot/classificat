import { db } from '@/db';
import { phases } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { loadEntrants, loadTags } from '@/lib/db-helpers';
import FasesClient from './FasesClient';

export const dynamic = 'force-dynamic';

export default async function FasesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [totes, tags, inscrits] = await Promise.all([
    db.select().from(phases).where(eq(phases.tournamentId, id)).orderBy(asc(phases.order)),
    loadTags(id),
    loadEntrants(id),
  ]);

  const entrants = inscrits
    .filter((e) => e.isActive)
    .map((e) => ({ id: e.id, displayName: e.displayName }));

  return <FasesClient tournamentId={id} fases={totes} tags={tags} entrants={entrants} />;
}
