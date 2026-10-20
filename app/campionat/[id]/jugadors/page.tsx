import { canManageTournament, getCurrentAccount } from '@/lib/authz';
import { loadEntrantsWithContact, loadTags } from '@/lib/db-helpers';
import { loadPendingRequests, toSollicitud } from '@/lib/registrations';
import JugadorsClient from '@/components/forms/JugadorsClient';
import SollicitudsInscripcio from '../SollicitudsInscripcio';

export const dynamic = 'force-dynamic';

export default async function JugadorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const account = await getCurrentAccount();
  const canManage = account ? await canManageTournament(account, id) : false;

  const [inscrits, tags, pendents] = await Promise.all([
    loadEntrantsWithContact(id),
    loadTags(id),
    canManage ? loadPendingRequests(id) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-4">
      {canManage && <SollicitudsInscripcio tournamentId={id} sollicituds={pendents.map(toSollicitud)} />}
      <JugadorsClient
        tournamentId={id}
        jugadors={inscrits
          .map((entrant) => ({
            id: entrant.id,
            name: entrant.displayName,
            rating: entrant.rating ?? null,
            barrufNumero: entrant.barrufNumero ?? null,
            tagIds: entrant.tagIds,
            // El contacte no surt del servidor si qui mira no gestiona la
            // competició (docs/pla-rols.md §14.4).
            club: canManage ? entrant.club : null,
            phone: canManage ? entrant.phone : null,
            isActive: entrant.isActive,
          }))
          .sort((a, b) => a.name.localeCompare(b.name))}
        tags={tags}
      />
    </div>
  );
}
