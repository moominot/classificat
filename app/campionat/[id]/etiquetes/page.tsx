import { loadEntrants, loadTags } from '@/lib/db-helpers';
import EtiquetesClient from './EtiquetesClient';

export const dynamic = 'force-dynamic';

export default async function EtiquetesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [tags, inscrits] = await Promise.all([
    loadTags(id),
    loadEntrants(id),
  ]);

  return (
    <EtiquetesClient
      tournamentId={id}
      tags={tags}
      jugadors={inscrits
        .map((e) => ({ id: e.id, name: e.displayName, tagIds: e.tagIds ?? [], isActive: e.isActive }))
        .sort((a, b) => a.name.localeCompare(b.name))}
    />
  );
}
