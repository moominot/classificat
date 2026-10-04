import { db } from '@/db';
import { phases } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { loadTags } from '@/lib/db-helpers';
import FasesClient from './FasesClient';

export const dynamic = 'force-dynamic';

export default async function FasesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [totes, tags] = await Promise.all([
    db.select().from(phases).where(eq(phases.tournamentId, id)).orderBy(asc(phases.order)),
    loadTags(id),
  ]);

  return <FasesClient tournamentId={id} fases={totes} tags={tags} />;
}
