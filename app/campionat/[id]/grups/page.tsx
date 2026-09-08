import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { groups } from '@/db/schema';
import { loadEntrants } from '@/lib/db-helpers';
import GrupsClient from './GrupsClient';

export const dynamic = 'force-dynamic';

export default async function GrupsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [grups, inscrits] = await Promise.all([
    db.select().from(groups).where(eq(groups.tournamentId, id)).orderBy(asc(groups.order)),
    loadEntrants(id),
  ]);

  return (
    <GrupsClient
      tournamentId={id}
      grups={grups}
      jugadors={inscrits
        .map((e) => ({ id: e.id, name: e.displayName, groupId: e.groupId ?? null, isActive: e.isActive }))
        .sort((a, b) => a.name.localeCompare(b.name))}
    />
  );
}
