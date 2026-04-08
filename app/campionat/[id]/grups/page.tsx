import { db } from '@/db';
import { groups, players } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import GrupsClient from './GrupsClient';

export const dynamic = 'force-dynamic';

export default async function GrupsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [grups, tots_jugadors] = await Promise.all([
    db.select().from(groups).where(eq(groups.tournamentId, id)).orderBy(asc(groups.order)),
    db.select().from(players).where(eq(players.tournamentId, id)).orderBy(asc(players.name)),
  ]);

  return <GrupsClient tournamentId={id} grups={grups} jugadors={tots_jugadors} />;
}
