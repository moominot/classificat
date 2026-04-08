import { db } from '@/db';
import { phases, groups } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import FasesClient from './FasesClient';

export const dynamic = 'force-dynamic';

export default async function FasesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [totes, grups] = await Promise.all([
    db.select().from(phases).where(eq(phases.tournamentId, id)).orderBy(asc(phases.order)),
    db.select().from(groups).where(eq(groups.tournamentId, id)).orderBy(asc(groups.order)),
  ]);

  return <FasesClient tournamentId={id} fases={totes} grups={grups} />;
}
