import { db } from '@/db';
import { players, phases, groups } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { computeStandings } from '@/lib/pairing/standings';
import { loadEngineRounds, loadPlayerGames } from '@/lib/db-helpers';
import type { Phase as EnginePhase } from '@/lib/pairing/types';
import Badge from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';

export const dynamic = 'force-dynamic';

export default async function JugadorDetallPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>;
}) {
  const { id, pid } = await params;

  const [jugador, tots_jugadors, totes_fases, tots_grups] = await Promise.all([
    db.select().from(players).where(eq(players.id, pid)).then(r => r[0]),
    db.select().from(players).where(eq(players.tournamentId, id)),
    db.select().from(phases).where(eq(phases.tournamentId, id)).orderBy(asc(phases.order)),
    db.select().from(groups).where(eq(groups.tournamentId, id)),
  ]);

  if (!jugador || jugador.tournamentId !== id) notFound();

  const grupNom = tots_grups.find(g => g.id === jugador.groupId)?.name;

  const [engineRounds, partides] = await Promise.all([
    loadEngineRounds(id),
    loadPlayerGames(id, pid),
  ]);

  // Classificació global
  const tiebreakers = (totes_fases[0]?.tiebreakers ?? ['median_buchholz', 'buchholz', 'spread']) as EnginePhase['tiebreakers'];
  const standings = computeStandings(engineRounds, tots_jugadors.map(p => p.id), tiebreakers);
  const myStanding = standings.find(s => s.playerId === pid);

  const playerMap = new Map(tots_jugadors.map(p => [p.id, p]));

  // Estadístiques derivades de les partides
  const partidesjugades = partides.filter(p => !p.isBye && p.outcome !== null);
  const totalScrabbles = partides.reduce((acc, p) => acc + (p.myScrabbles ?? 0), 0);
  const totalPtsAFavor = partidesjugades.reduce((acc, p) => acc + (p.myScore ?? 0), 0);
  const totalPtsEnContra = partidesjugades.reduce((acc, p) => acc + (p.oppScore ?? 0), 0);
  const mitjanaPFavor = partidesjugades.length > 0 ? (totalPtsAFavor / partidesjugades.length) : 0;
  const mitjanaPEnContra = partidesjugades.length > 0 ? (totalPtsEnContra / partidesjugades.length) : 0;

  // Millors jugades
  const millorJugada = partides
    .filter(p => p.myBestWord && p.myBestWordScore)
    .sort((a, b) => (b.myBestWordScore ?? 0) - (a.myBestWordScore ?? 0))[0];

  const millorPartida = partidesjugades
    .filter(p => p.myScore !== null)
    .sort((a, b) => (b.myScore ?? 0) - (a.myScore ?? 0))[0];

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-ink-3">
        <Link href={`/campionat/${id}/jugadors`} className="hover:text-accent-ink">Jugadors</Link>
        <span>/</span>
        <span className="text-ink">{jugador.name}</span>
      </div>

      {/* Capçalera */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-accent-tint flex items-center justify-center text-accent-ink text-2xl font-display font-bold flex-shrink-0">
          {jugador.name[0]?.toUpperCase()}
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display text-2xl font-bold text-ink">{jugador.name}</h2>
            {grupNom && <Badge color="gray">Grup {grupNom}</Badge>}
            {jugador.rating != null && <Badge color="blue">BARRUF {jugador.rating}</Badge>}
            {!jugador.isActive && <Badge color="gray">Inactiu</Badge>}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-ink-3 mt-1.5">
            {myStanding && myStanding.gamesPlayed > 0 && (
              <span className="tabular-nums">Posició {myStanding.rank} · {myStanding.points} punt{myStanding.points !== 1 ? 's' : ''}</span>
            )}
            {jugador.club && <span>{jugador.club}</span>}
            {jugador.phone && <span>{jugador.phone}</span>}
          </div>
        </div>
      </div>

      {/* Estadístiques principals */}
      {myStanding && myStanding.gamesPlayed > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Partides" value={myStanding.gamesPlayed.toString()} />
          <StatCard label="Victòries" value={myStanding.wins.toString()} color="green" />
          <StatCard label="Derrotes" value={myStanding.losses.toString()} color="red" />
          <StatCard
            label="Spread total"
            value={(myStanding.spread > 0 ? '+' : '') + myStanding.spread}
            color={myStanding.spread > 0 ? 'green' : myStanding.spread < 0 ? 'red' : 'gray'}
          />
          <StatCard label="Mitjana a favor" value={mitjanaPFavor.toFixed(1)} />
          <StatCard label="Mitjana en contra" value={mitjanaPEnContra.toFixed(1)} />
          <StatCard label="Total bingos" value={totalScrabbles.toString()} color="blue" />
          <StatCard
            label="Mitjana bingos"
            value={partidesjugades.length > 0 ? (totalScrabbles / partidesjugades.length).toFixed(2) : '—'}
          />
        </div>
      )}

      {/* Desempats */}
      {myStanding && myStanding.gamesPlayed > 0 && (
        <Card>
          <CardHeader><CardTitle>Desempats</CardTitle></CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-ink-3 mb-0.5">Buchholz</p>
              <p className="font-display font-semibold text-ink tabular-nums">{myStanding.tiebreakers.buchholz.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-3 mb-0.5">Median Buchholz</p>
              <p className="font-display font-semibold text-ink tabular-nums">{myStanding.tiebreakers.medianBuchholz.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-3 mb-0.5">Berger</p>
              <p className="font-display font-semibold text-ink tabular-nums">{myStanding.tiebreakers.berger.toFixed(1)}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Millors registres */}
      {(millorJugada || millorPartida) && (
        <Card>
          <CardHeader><CardTitle>Millors registres</CardTitle></CardHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {millorPartida && (
              <div className="bg-win-tint rounded-lg p-3">
                <p className="text-xs text-win font-semibold uppercase tracking-wide mb-1">Millor partida</p>
                <p className="font-display text-2xl font-bold text-win tabular-nums">{millorPartida.myScore}</p>
                <p className="text-xs text-win mt-0.5">
                  vs {playerMap.get(millorPartida.opponentId ?? '')?.name ?? '?'} · Ronda {millorPartida.roundNumber}
                </p>
              </div>
            )}
            {millorJugada && (
              <div className="bg-accent-tint rounded-lg p-3">
                <p className="text-xs text-accent-ink font-semibold uppercase tracking-wide mb-1">Millor jugada</p>
                <p className="font-display text-2xl font-bold text-accent-ink uppercase">{millorJugada.myBestWord}</p>
                <p className="text-xs text-accent-ink mt-0.5">
                  {millorJugada.myBestWordScore} punts · Ronda {millorJugada.roundNumber}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Historial de partides */}
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
            {partides.map((p) => {
              const adversari = p.opponentId ? playerMap.get(p.opponentId) : null;
              const outcomeColor =
                p.isBye ? 'gray' :
                p.outcome === 'win' ? 'green' :
                p.outcome === 'loss' ? 'red' :
                p.outcome === 'draw' ? 'blue' : 'gray';
              const outcomeLabel =
                p.isBye ? 'Bye' :
                p.outcome === 'win' ? 'V' :
                p.outcome === 'loss' ? 'D' :
                p.outcome === 'draw' ? 'E' : '—';

              return (
                <li key={p.pairingId}>
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors group">
                    {/* Ronda */}
                    <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center text-xs font-display font-bold text-ink-2 flex-shrink-0 tabular-nums">
                      {p.roundNumber}
                    </div>

                    {/* Adversari */}
                    <div className="flex-1 min-w-0">
                      {p.isBye ? (
                        <span className="text-sm text-ink-3 italic">Bye</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          {adversari ? (
                            <Link
                              href={`/campionat/${id}/jugadors/${adversari.id}`}
                              className="text-sm font-medium text-ink-2 hover:text-accent-ink transition-colors"
                            >
                              {adversari.name}
                            </Link>
                          ) : (
                            <span className="text-sm font-medium text-ink-3">?</span>
                          )}
                          {p.myBestWord && (
                            <span className="text-xs text-ink-3 hidden sm:inline">
                              Millor: {p.myBestWord} ({p.myBestWordScore}pts)
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Resultat */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {!p.isBye && p.myScore !== null && (
                        <span className="tabular-nums text-sm text-ink font-semibold">
                          {p.myScore} – {p.oppScore}
                        </span>
                      )}
                      {p.myScrabbles !== null && p.myScrabbles > 0 && (
                        <span className="text-xs text-accent-ink hidden sm:inline">
                          {p.myScrabbles}B
                        </span>
                      )}
                      <Badge color={outcomeColor as 'green' | 'red' | 'blue' | 'gray'}>
                        {outcomeLabel}
                      </Badge>
                    </div>

                    <Link
                      href={`/campionat/${id}/partida/${p.pairingId}`}
                      aria-label="Veure partida"
                      className="flex-shrink-0"
                    >
                      <svg className="w-4 h-4 text-ink-3 group-hover:text-ink-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

function StatCard({
  label,
  value,
  color = 'gray',
}: {
  label: string;
  value: string;
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
    </div>
  );
}
