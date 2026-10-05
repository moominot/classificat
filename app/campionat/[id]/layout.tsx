import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { tournaments } from '@/db/schema';
import { canManageTournament, getCurrentAccount, getViewer } from '@/lib/authz';
import { ViewerProvider } from '@/components/ViewerContext';
import { SetHeaderTitle } from '@/components/HeaderTitleContext';
import NavTabs from './NavTabs';
import ConfigSidebar from './ConfigSidebar';
import AutoRefresh from './AutoRefresh';
import PresenciaModal from './PresenciaModal';

/**
 * Cada campionat s'ha de sentir com una aplicació pròpia: el nom del
 * campionat és el títol principal, i tota la navegació hi viu a sota —
 * no repartida entre una capçalera genèrica, un fil d'Ariadna i les
 * pestanyes. Al mòbil tot va en una barra de pestanyes que llisca; a
 * l'escriptori, el que és "configuració" (Grups, Fases, Preguntes, BARRUF)
 * passa a un panell lateral i només queda a dalt el contingut que es
 * consulta sovint (Jugadors, Rondes, Classificació).
 */
export default async function CampionatLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  if (!tournament) notFound();

  const account = await getCurrentAccount();
  const canManage = account ? await canManageTournament(account, id) : false;
  const viewer = await getViewer(id);

  return (
    <ViewerProvider
      viewer={{
        role: account?.role ?? null,
        canManage,
        displayName: account?.displayName ?? null,
        entryId: viewer.entryId,
      }}
    >
      <SetHeaderTitle name={tournament.name} id={id} />
      {canManage ? <AutoRefresh tournamentId={id} /> : viewer.entryId ? <PresenciaModal tournamentId={id} /> : null}
      <div className="lg:flex lg:gap-6 lg:items-start">
        {canManage && <ConfigSidebar id={id} />}
        <div className="flex-1 min-w-0 space-y-5">
          <NavTabs id={id} />
          {children}
        </div>
      </div>
    </ViewerProvider>
  );
}
