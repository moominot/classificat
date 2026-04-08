import { db } from '@/db';
import { players, groups } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import JugadorsClient from '@/components/forms/JugadorsClient';

export const dynamic = 'force-dynamic';

export default async function JugadorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [tots, grups] = await Promise.all([
    db.select().from(players).where(eq(players.tournamentId, id)).orderBy(asc(players.name)),
    db.select().from(groups).where(eq(groups.tournamentId, id)).orderBy(asc(groups.order)),
  ]);

  return (
    <JugadorsClient
      tournamentId={id}
      jugadors={tots}
      grups={grups}
    />
  );
}
