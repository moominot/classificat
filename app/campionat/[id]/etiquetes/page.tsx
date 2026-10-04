import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { teams } from '@/db/schema';
import { loadEntrants, loadTags } from '@/lib/db-helpers';
import EtiquetesClient from './EtiquetesClient';

export const dynamic = 'force-dynamic';

export default async function EtiquetesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [tags, inscrits, equips] = await Promise.all([
    loadTags(id),
    loadEntrants(id),
    db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.tournamentId, id)).orderBy(asc(teams.name)),
  ]);

  return (
    <EtiquetesClient
      tournamentId={id}
      tags={tags}
      equips={equips}
      jugadors={inscrits
        .map((e) => ({ id: e.id, name: e.displayName, tagIds: e.tagIds ?? [], teamId: e.teamId ?? null, isActive: e.isActive }))
        .sort((a, b) => a.name.localeCompare(b.name))}
    />
  );
}
