import { db } from '@/db';
import { matchParticipants, matches, phases, rounds } from '@/db/schema';
import { asc, eq, inArray } from 'drizzle-orm';
import Link from 'next/link';
import Badge from '@/components/ui/Badge';
import { canManageTournament, getCurrentAccount } from '@/lib/authz';
import NouaRonda from './NouaRonda';

export const dynamic = 'force-dynamic';

export default async function RondesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getCurrentAccount();
  const canManage = account ? await canManageTournament(account, id) : false;

  const [totes_fases, totes_rondes] = await Promise.all([
    db.select().from(phases).where(eq(phases.tournamentId, id)).orderBy(asc(phases.order)),
    db.select().from(rounds).where(eq(rounds.tournamentId, id)).orderBy(asc(rounds.number)),
  ]);

  // Partides per ronda i quantes en tenen resultat. Un bye no compta com a
  // partida per jugar: ja neix resolt.
  const rondes_amb_stats = await Promise.all(
    totes_rondes.map(async (r) => {
      const partides = await db.select({ id: matches.id }).from(matches).where(eq(matches.roundId, r.id));
      if (partides.length === 0) return { ...r, totals: 0, jugades: 0 };

      const participants = await db
        .select({ matchId: matchParticipants.matchId, rank: matchParticipants.rank })
        .from(matchParticipants)
        .where(inArray(matchParticipants.matchId, partides.map((p) => p.id)));

      const perPartida = partides.map((p) => participants.filter((x) => x.matchId === p.id));
      const jugables = perPartida.filter((rows) => rows.length > 1);

      return {
        ...r,
        totals: jugables.length,
        jugades: jugables.filter((rows) => rows.every((x) => x.rank !== null)).length,
      };
    })
  );

  const faseMap = new Map(totes_fases.map(f => [f.id, f]));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-3">
          {totes_rondes.length} ronda{totes_rondes.length !== 1 ? 'es' : ''} creades
        </p>
        {totes_fases.length > 0 && (
          <NouaRonda tournamentId={id} fases={totes_fases} rondesExistents={totes_rondes.map(r => r.number)} />
        )}
      </div>

      {totes_fases.length === 0 && (
        <div className="rounded-xl bg-accent-tint border border-accent p-4 text-sm text-accent-ink">
          Cal crear almenys una <Link href={`/campionat/${id}/fases`} className="underline font-medium">fase</Link> abans de poder crear rondes.
        </div>
      )}

      {rondes_amb_stats.length === 0 && totes_fases.length > 0 && (
        <div className="text-center py-16 text-ink-3 text-sm">
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
                  <span className="text-xs font-semibold text-ink-3 uppercase tracking-wide">
                    {fase.name}
                  </span>
                  <span className="text-xs text-ink-3">·</span>
                  <span className="text-xs text-ink-3">
                    Rondes {fase.startRound}–{fase.endRound}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {rondes_fase.map(r => {
                    // Una ronda en esborrany no existeix per als jugadors (la
                    // pàgina dóna 404): es veu, però no és un enllaç.
                    const inert = r.status === 'draft' && !canManage;
                    const classe = 'flex items-center gap-4 bg-surface border border-border rounded-xl px-4 py-3';
                    const contingut = (
                      <>
                      <div className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center text-sm font-display font-bold text-ink-2 flex-shrink-0 tabular-nums">
                        {r.number}
                      </div>
                      <div className="flex-1">
                        <span className="font-display font-semibold text-sm text-ink group-hover:text-accent-ink">
                          Ronda {r.number}
                        </span>
                        <div className="text-xs text-ink-3 mt-0.5 tabular-nums">
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
                        ) : r.status === 'closed' ? (
                          <Badge color="green">Tancada</Badge>
                        ) : r.status === 'draft' ? (
                          <Badge color="gray">Esborrany</Badge>
                        ) : r.jugades === r.totals && r.totals > 0 ? (
                          <Badge color="blue">Jugada</Badge>
                        ) : (
                          <Badge color="yellow">En curs</Badge>
                        )}
                        {!inert && (
                          <svg className="w-4 h-4 text-ink-3 group-hover:text-accent-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </div>
                      </>
                    );
                    return inert ? (
                      <div key={r.id} className={classe}>
                        {contingut}
                      </div>
                    ) : (
                      <Link
                        key={r.id}
                        href={`/campionat/${id}/rondes/${r.id}`}
                        className={`${classe} hover:border-accent hover:shadow-sm transition-all group`}
                      >
                        {contingut}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
