import { db } from '@/db';
import { rounds, pairings, phases } from '@/db/schema';
import { eq, asc, count } from 'drizzle-orm';
import Link from 'next/link';
import Badge from '@/components/ui/Badge';
import NouaRonda from './NouaRonda';

export const dynamic = 'force-dynamic';

export default async function RondesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [totes_fases, totes_rondes] = await Promise.all([
    db.select().from(phases).where(eq(phases.tournamentId, id)).orderBy(asc(phases.order)),
    db.select().from(rounds).where(eq(rounds.tournamentId, id)).orderBy(asc(rounds.number)),
  ]);

  // Per a cada ronda, obtenim les estadístiques d'aparellaments
  const rondes_amb_stats = await Promise.all(
    totes_rondes.map(async (r) => {
      const tots = await db
        .select({ id: pairings.id, outcome1: pairings.outcome1, player2Id: pairings.player2Id })
        .from(pairings)
        .where(eq(pairings.roundId, r.id));
      const totals = tots.filter(p => p.player2Id !== null).length;
      const jugades = tots.filter(p => p.outcome1 !== null && p.outcome1 !== 'bye').length;
      return { ...r, totals, jugades };
    })
  );

  const faseMap = new Map(totes_fases.map(f => [f.id, f]));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {totes_rondes.length} ronda{totes_rondes.length !== 1 ? 'es' : ''} creades
        </p>
        {totes_fases.length > 0 && (
          <NouaRonda tournamentId={id} fases={totes_fases} rondesExistents={totes_rondes.map(r => r.number)} />
        )}
      </div>

      {totes_fases.length === 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
          Cal crear almenys una <Link href={`/campionat/${id}/fases`} className="underline font-medium">fase</Link> abans de poder crear rondes.
        </div>
      )}

      {rondes_amb_stats.length === 0 && totes_fases.length > 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">
          Cap ronda creada. Crea la primera ronda per poder generar aparellaments.
        </div>
      )}

      {rondes_amb_stats.length > 0 && (
        <div className="space-y-2">
          {totes_fases.map(fase => {
            const rondes_fase = rondes_amb_stats.filter(r => r.phaseId === fase.id);
            if (rondes_fase.length === 0) return null;

            return (
              <div key={fase.id}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    {fase.name}
                  </span>
                  <span className="text-xs text-gray-300">·</span>
                  <span className="text-xs text-gray-400">
                    Rondes {fase.startRound}–{fase.endRound}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {rondes_fase.map(r => (
                    <Link
                      key={r.id}
                      href={`/campionat/${id}/rondes/${r.id}`}
                      className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-blue-300 hover:shadow-sm transition-all group"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600 flex-shrink-0">
                        {r.number}
                      </div>
                      <div className="flex-1">
                        <span className="font-medium text-sm text-gray-900 group-hover:text-blue-700">
                          Ronda {r.number}
                        </span>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {r.totals === 0 ? (
                            'Sense aparellaments generats'
                          ) : (
                            `${r.jugades} / ${r.totals} partides jugades`
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.totals === 0 ? (
                          <Badge color="yellow">Pendent</Badge>
                        ) : r.isComplete ? (
                          <Badge color="green">Tancada</Badge>
                        ) : r.jugades === r.totals && r.totals > 0 ? (
                          <Badge color="blue">Jugada</Badge>
                        ) : (
                          <Badge color="yellow">En curs</Badge>
                        )}
                        <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
