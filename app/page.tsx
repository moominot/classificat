import { count, eq } from 'drizzle-orm';
import { db } from '@/db';
import { entries, rounds } from '@/db/schema';
import { getCurrentAccount, listManagedTournaments } from '@/lib/authz';
import NouCampionat from '@/components/forms/NouCampionat';

export const dynamic = 'force-dynamic';

/**
 * Portada.
 *
 * La llista de competicions és una eina de gestió: un jugador no hi arriba
 * mai, perquè entra per invitació directa a la seva (docs/pla-rols.md §7.3).
 */
export default async function HomePage() {
  const account = await getCurrentAccount();

  if (!account || account.role === 'user') {
    return <SenseCompeticions hasAccount={Boolean(account)} />;
  }

  const gestionades = await listManagedTournaments(account);

  const ambDades = await Promise.all(
    gestionades.map(async (tournament) => {
      const [inscrits] = await db
        .select({ count: count() })
        .from(entries)
        .where(eq(entries.tournamentId, tournament.id));
      const [numRondes] = await db
        .select({ count: count() })
        .from(rounds)
        .where(eq(rounds.tournamentId, tournament.id));
      return { ...tournament, inscrits: inscrits.count, rondes: numRondes.count };
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Competicions</h1>
          <p className="text-sm text-ink-3 mt-1">
            {account.role === 'superadmin' ? 'Totes les competicions' : 'Les competicions que gestiones'}
          </p>
        </div>
        <NouCampionat />
      </div>

      {ambDades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-accent-tint flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-accent-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h2 className="font-display text-lg font-semibold text-ink mb-2">Cap competició encara</h2>
          <p className="text-ink-3 text-sm">Crea la primera per començar</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ambDades.map((tournament) => (
            <a
              key={tournament.id}
              href={`/campionat/${tournament.id}/jugadors`}
              className="bg-surface border border-border rounded-2xl p-5 hover:border-accent transition-colors group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-display font-semibold text-ink group-hover:text-accent-ink transition-colors">
                    {tournament.name}
                  </h2>
                  <p className="text-xs text-ink-3 mt-1">/{tournament.slug}</p>
                </div>
                <svg
                  className="w-4 h-4 text-ink-3 group-hover:text-accent-ink transition-colors mt-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <div className="mt-4 flex gap-4 text-sm text-ink-3 tabular-nums">
                <span>{tournament.inscrits} inscrits</span>
                <span>{tournament.rondes} rondes</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function SenseCompeticions({ hasAccount }: { hasAccount: boolean }) {
  return (
    <div className="max-w-md mx-auto text-center py-24">
      <h1 className="font-display text-xl font-bold text-ink">Classificat</h1>
      <p className="text-sm text-ink-3 mt-3">
        {hasAccount
          ? "Encara no participes en cap competició. Quan t'hi inscriguin, hi entraràs des de l'enllaç que et passi l'organitzador."
          : "Per veure una competició, fes servir l'enllaç o el codi QR que t'hagi passat l'organitzador."}
      </p>
    </div>
  );
}
