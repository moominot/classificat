import { db } from '@/db';
import { tournaments } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/session';
import type { SessionData } from '@/lib/session';
import NavTabs from './NavTabs';
import { DirectorProvider } from '@/components/DirectorContext';
import QrCompartir from '@/components/QrCompartir';

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

  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  const isDirector = session.isDirector ?? false;

  return (
    <DirectorProvider isDirector={isDirector}>
      <div className="space-y-5">
        {/* Capçalera del campionat */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          {isDirector ? (
            <a href="/" className="hover:text-blue-600">Campionats</a>
          ) : (
            <span>Campionats</span>
          )}
          <span>/</span>
          <span className="text-gray-900 font-medium">{tournament.name}</span>
          {isDirector && (
            <div className="ml-auto">
              <QrCompartir tournamentId={id} />
            </div>
          )}
        </div>

        {/* Pestanyes de navegació */}
        <NavTabs id={id} name={tournament.name} />

        {/* Contingut */}
        {children}
      </div>
    </DirectorProvider>
  );
}
