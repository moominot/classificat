import { eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/db';
import { tournaments } from '@/db/schema';
import { DEFAULT_VISIBILITY } from '@/db/types';
import { canManageTournament, getCurrentAccount } from '@/lib/authz';
import AjustosClient from './AjustosClient';

export const dynamic = 'force-dynamic';

/** Ajustos de la competició: només per a qui la gestiona (les rutes d'API ho tornen a comprovar). */
export default async function AjustosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const account = await getCurrentAccount();
  if (!account || !(await canManageTournament(account, id))) redirect(`/campionat/${id}`);

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  if (!tournament) notFound();

  return (
    <AjustosClient
      tournamentId={id}
      nom={tournament.name}
      estat={tournament.status}
      visibilitat={tournament.visibility ?? DEFAULT_VISIBILITY}
      currentAccountId={account.id}
      pendentsCompten={tournament.presencePendingAs}
      preguntaPresencia={tournament.askPresence}
    />
  );
}
