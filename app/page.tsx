import { db } from '@/db';
import { tournaments, players, rounds } from '@/db/schema';
import { eq, count } from 'drizzle-orm';
import NouCampionat from '@/components/forms/NouCampionat';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const tots = await db.select().from(tournaments).orderBy(tournaments.createdAt);

  const amb_stats = await Promise.all(
    tots.map(async (t) => {
      const [numJugadors] = await db
        .select({ count: count() })
        .from(players)
        .where(eq(players.tournamentId, t.id));
      const [numRondes] = await db
        .select({ count: count() })
        .from(rounds)
        .where(eq(rounds.tournamentId, t.id));
      return {
        ...t,
        numJugadors: numJugadors.count,
        numRondes: numRondes.count,
      };
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campionats</h1>
          <p className="text-sm text-gray-500 mt-1">Gestiona els teus campionats de Scrabble</p>
        </div>
        <NouCampionat />
      </div>

      {amb_stats.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-700 mb-2">Cap campionat encara</h2>
          <p className="text-gray-500 text-sm">Crea el primer campionat per començar</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {amb_stats.map((t) => (
            <a
              key={t.id}
              href={`/campionat/${t.id}/jugadors`}
              className="bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                    {t.name}
                  </h2>
                  <p className="text-xs text-gray-400 mt-1">/{t.slug}</p>
                </div>
                <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <div className="mt-4 flex gap-4 text-sm text-gray-500">
                <span>{t.numJugadors} jugadors</span>
                <span>{t.numRondes} rondes</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
