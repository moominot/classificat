import { eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/db';
import { tournaments } from '@/db/schema';

export const dynamic = 'force-dynamic';

/**
 * Adreça curta d'un campionat (`/open-soller`): redirigeix a la seva pàgina.
 * Les rutes estàtiques (`/login`, `/usuaris`...) tenen prioritat sobre
 * aquesta, i `lib/short-path.ts` impedeix triar-ne cap com a adreça.
 */
export default async function AdrecaCurta({ params }: { params: Promise<{ curt: string }> }) {
  const { curt } = await params;
  const [tournament] = await db
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(eq(tournaments.shortPath, decodeURIComponent(curt).toLowerCase()));
  if (!tournament) notFound();

  // Temporal (307): l'adreça curta es pot canviar o reaprofitar.
  redirect(`/campionat/${tournament.id}`);
}
