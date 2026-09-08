import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { tournaments } from '@/db/schema';
import { canManageTournament, getCurrentAccount, getViewer } from '@/lib/authz';
import { ViewerProvider } from '@/components/ViewerContext';
import QrCompartir from '@/components/QrCompartir';
import NavTabs from './NavTabs';

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
      <div className="space-y-5">
        {/*
          El nom de la competició surt un sol cop, a la barra de pestanyes:
          abans es repetia al fil d'Ariadna i al títol (docs/pla-rols.md §15.1).
        */}
        <div className="flex items-center gap-2 text-sm text-ink-3">
          {canManage && (
            <>
              <a href="/" className="hover:text-accent-ink">
                Competicions
              </a>
              <div className="ml-auto">
                <QrCompartir tournamentId={id} />
              </div>
            </>
          )}
        </div>

        <NavTabs id={id} name={tournament.name} />

        {children}
      </div>
    </ViewerProvider>
  );
}
