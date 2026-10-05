import { asc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/db';
import { questionDefinitions } from '@/db/schema';
import Badge from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { canManageTournament, getCurrentAccount } from '@/lib/authz';
import { loadEntrantsWithContact, loadEntryMatches, loadEntryWordAnswers, loadLivePhaseIds, loadTags, loadVisibleRoundIds } from '@/lib/db-helpers';
import { loadStandings } from '@/lib/standings-service';

export const dynamic = 'force-dynamic';

/** Etiquetes de les mètriques estructurals; la resta venen de les preguntes. */
const METRIC_LABELS: Record<string, string> = {
  wins: 'Victòries',
  spread: 'Spread',
  total_score: 'Punts a favor',
  avg_score: 'Mitjana per partida',
};

export default async function JugadorDetallPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>;
}) {
  const { id, pid } = await params;

  const account = await getCurrentAccount();
  const canManage = account ? await canManageTournament(account, id) : false;

  const [inscrits, tots_tags, questions] = await Promise.all([
    loadEntrantsWithContact(id),
    loadTags(id),
    db
      .select()
      .from(questionDefinitions)
      .where(eq(questionDefinitions.tournamentId, id))
      .orderBy(asc(questionDefinitions.order)),
  ]);

  const jugador = inscrits.find((e) => e.id === pid);
  if (!jugador) notFound();

  const tagMap = new Map(tots_tags.map((t) => [t.id, t.name]));
  const nomPerEntry = new Map(inscrits.map((e) => [e.id, e.displayName]));

  const livePhaseIds = canManage ? [] : await loadLivePhaseIds(id);
  const [vista, partidesReals, paraulesDestacades, visiblesIds] = await Promise.all([
    loadStandings(id, { canManage }),
    loadEntryMatches(id, pid),
    loadEntryWordAnswers(id, pid, { onlyClosedRounds: !canManage, livePhaseIds }),
    canManage ? null : loadVisibleRoundIds(id, livePhaseIds),
  ]);

  // Una ronda sense resultats publicats és, per a qui no gestiona, com si no
  // s'hagués jugat encara: el marcador es buida aquí, no al motor d'historial
  // (mateix criteri que a la ronda i a la partida individuals, §8.2/§15.6).
  const partides = partidesReals.map((p) =>
    !canManage && !p.isBye && !visiblesIds?.has(p.roundId)
      ? { ...p, me: { ...p.me, score: null, rank: null, outcome: null }, opponents: p.opponents.map((o) => ({ ...o, score: null, rank: null, outcome: null })) }
      : p
  );

  const myStanding = vista.standings.find((s) => s.entryId === pid);

  const etiquetaMetrica = (key: string) =>
    METRIC_LABELS[key] ?? questions.find((q) => q.key === key)?.label ?? key;

  const metriques = myStanding
    ? Object.entries(myStanding.metrics).filter(([key]) => key !== 'wins')
    : [];

  const jugades = partides.filter((p) => !p.isBye && p.me.rank !== null);
  const millorPartida = [...jugades].sort((a, b) => (b.me.score ?? 0) - (a.me.score ?? 0))[0];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-ink-3">
        <Link href={`/campionat/${id}/jugadors`} className="hover:text-accent-ink">
          Jugadors
        </Link>
        <span>/</span>
        <span className="text-ink">{jugador.displayName}</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-accent-tint flex items-center justify-center text-accent-ink text-2xl font-display font-bold flex-shrink-0">
          {jugador.displayName[0]?.toUpperCase()}
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display text-2xl font-bold text-ink">{jugador.displayName}</h2>
            {jugador.tagIds.map((tid) => (
              <Badge key={tid} color="gray">{tagMap.get(tid) ?? '?'}</Badge>
            ))}
            {jugador.rating != null && <Badge color="blue">BARRUF {jugador.rating}</Badge>}
            {!jugador.isActive && <Badge color="gray">Inactiu</Badge>}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-ink-3 mt-1.5">
            {myStanding && myStanding.gamesPlayed > 0 && (
              <span className="tabular-nums">
                Posició {myStanding.rank} · {formatNumber(myStanding.points)} punt
                {myStanding.points !== 1 ? 's' : ''}
              </span>
            )}
            {jugador.club && <span>{jugador.club}</span>}
            {/* El contacte només per a qui gestiona la competició (§14.4) */}
            {canManage && jugador.phone && <span>{jugador.phone}</span>}
          </div>
        </div>
      </div>

      {myStanding && myStanding.gamesPlayed > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Partides" value={myStanding.gamesPlayed.toString()} />
          <StatCard label="Victòries" value={myStanding.wins.toString()} color="green" />
          <StatCard label="Derrotes" value={myStanding.losses.toString()} color="red" />
          {/*
            Les mètriques no són una llista fixa: surten de la configuració de
            les preguntes (docs/pla-rols.md §12.1 i §15.3).
          */}
          {metriques.map(([key, value]) => (
            <StatCard
              key={key}
              label={etiquetaMetrica(key)}
              value={key === 'spread' && value > 0 ? `+${formatNumber(value)}` : formatNumber(value)}
              sublabel={paraulesDestacades.get(key)}
              color={key === 'spread' ? (value > 0 ? 'green' : value < 0 ? 'red' : 'gray') : 'gray'}
            />
          ))}
        </div>
      )}

      {millorPartida && (
        <Card>
          <CardHeader>
            <CardTitle>Millor partida</CardTitle>
          </CardHeader>
          <div className="bg-win-tint rounded-lg p-3">
            <p className="font-display text-2xl font-bold text-win tabular-nums">{millorPartida.me.score}</p>
            <p className="text-xs text-win mt-0.5">
              {millorPartida.opponents.length > 0 && (
                <>vs {millorPartida.opponents.map((o) => nomPerEntry.get(o.entryId) ?? '?').join(', ')} · </>
              )}
              Ronda {millorPartida.roundNumber}
            </p>
          </div>
        </Card>
      )}

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm text-ink">
            Historial de partides
            <span className="text-ink-3 font-normal ml-2">({partides.length})</span>
          </h3>
        </div>

        {partides.length === 0 ? (
          <p className="text-sm text-ink-3 text-center py-10">Cap partida jugada encara.</p>
        ) : (
          <ul className="divide-y divide-border">
            {partides.map((partida) => {
              const outcome = partida.me.outcome;
              const outcomeColor = partida.isBye
                ? 'gray'
                : outcome === 'win'
                  ? 'green'
                  : outcome === 'loss'
                    ? 'red'
                    : outcome === 'draw'
                      ? 'blue'
                      : 'gray';
              const outcomeLabel = partida.isBye
                ? 'Bye'
                : outcome === 'win'
                  ? 'V'
                  : outcome === 'loss'
                    ? 'D'
                    : outcome === 'draw'
                      ? 'E'
                      : '—';

              return (
                <li key={partida.matchId}>
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors group">
                    <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center text-xs font-display font-bold text-ink-2 flex-shrink-0 tabular-nums">
                      {partida.roundNumber}
                    </div>

                    <div className="flex-1 min-w-0">
                      {partida.isBye ? (
                        <span className="text-sm text-ink-3 italic">Bye</span>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          {partida.opponents.map((opponent) => (
                            <Link
                              key={opponent.entryId}
                              href={`/campionat/${id}/jugadors/${opponent.entryId}`}
                              className="text-sm font-medium text-ink-2 hover:text-accent-ink transition-colors"
                            >
                              {nomPerEntry.get(opponent.entryId) ?? '?'}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {!partida.isBye && partida.me.score !== null && (
                        <span className="tabular-nums text-sm text-ink font-semibold">
                          {partida.me.score}
                          {partida.opponents.length === 1 && ` – ${partida.opponents[0].score ?? '—'}`}
                        </span>
                      )}
                      <Badge color={outcomeColor as 'green' | 'red' | 'blue' | 'gray'}>{outcomeLabel}</Badge>
                    </div>

                    <Link
                      href={`/campionat/${id}/partida/${partida.matchId}`}
                      aria-label="Veure la partida"
                      className="flex-shrink-0"
                    >
                      <svg
                        className="w-4 h-4 text-ink-3 group-hover:text-ink-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Els punts i l'spread poden tenir decimals (§12.10 i §12.11): sense soroll. */
function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function StatCard({
  label,
  value,
  sublabel,
  color = 'gray',
}: {
  label: string;
  value: string;
  /** La paraula d'una pregunta "paraula + valor" (p.ex. la millor jugada). */
  sublabel?: string;
  color?: 'gray' | 'green' | 'red' | 'blue';
}) {
  const colorClass = {
    gray: 'text-ink',
    green: 'text-win',
    red: 'text-loss',
    blue: 'text-accent-ink',
  }[color];

  return (
    <div className="bg-surface border border-border rounded-xl p-3 text-center">
      <p className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide mb-1">{label}</p>
      <p className={`font-display text-xl font-bold tabular-nums ${colorClass}`}>{value}</p>
      {sublabel && <p className="text-xs text-ink-3 mt-0.5 truncate">{sublabel}</p>}
    </div>
  );
}
