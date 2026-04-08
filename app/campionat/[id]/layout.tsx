import { db } from '@/db';
import { tournaments } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
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

  return (
    <div className="space-y-5">
      {/* Capçalera del campionat */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <a href="/" className="hover:text-blue-600">Campionats</a>
        <span>/</span>
        <span className="text-gray-900 font-medium">{tournament.name}</span>
      </div>

      {/* Pestanyes de navegació */}
      <NavTabs id={id} name={tournament.name} />

      {/* Contingut */}
      {children}
    </div>
  );
}
