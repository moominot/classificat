import { db } from '@/db';
import { players, phases } from '@/db/schema';
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

  const [jugador, tots_jugadors, totes_fases] = await Promise.all([
    db.select().from(players).where(eq(players.id, pid)).then(r => r[0]),
    db.select().from(players).where(eq(players.tournamentId, id)),
    db.select().from(phases).where(eq(phases.tournamentId, id)).orderBy(asc(phases.order)),
  ]);

  if (!jugador || jugador.tournamentId !== id) notFound();

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
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href={`/campionat/${id}/jugadors`} className="hover:text-blue-600">Jugadors</Link>
        <span>/</span>
        <span className="text-gray-900">{jugador.name}</span>
      </div>

      {/* Capçalera */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-2xl font-bold flex-shrink-0">
          {jugador.name[0]?.toUpperCase()}
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-bold text-gray-900">{jugador.name}</h2>
            {!jugador.isActive && <Badge color="gray">Inactiu</Badge>}
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-gray-500 mt-1">
            {myStanding && myStanding.gamesPlayed > 0 && (
              <span>Posició {myStanding.rank} · {myStanding.points} punt{myStanding.points !== 1 ? 's' : ''}</span>
            )}
            {jugador.rating != null && (
              <span className="font-medium text-blue-700">BARRUF {jugador.rating}</span>
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
              <p className="text-xs text-gray-400 mb-0.5">Buchholz</p>
              <p className="font-semibold text-gray-900">{myStanding.tiebreakers.buchholz.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Median Buchholz</p>
              <p className="font-semibold text-gray-900">{myStanding.tiebreakers.medianBuchholz.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Berger</p>
              <p className="font-semibold text-gray-900">{myStanding.tiebreakers.berger.toFixed(1)}</p>
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
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-xs text-green-600 font-semibold uppercase tracking-wide mb-1">Millor partida</p>
                <p className="text-2xl font-bold text-green-800">{millorPartida.myScore}</p>
                <p className="text-xs text-green-600 mt-0.5">
                  vs {playerMap.get(millorPartida.opponentId ?? '')?.name ?? '?'} · Ronda {millorPartida.roundNumber}
                </p>
              </div>
            )}
            {millorJugada && (
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-1">Millor jugada</p>
                <p className="text-2xl font-bold text-blue-800">{millorJugada.myBestWord}</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  {millorJugada.myBestWordScore} punts · Ronda {millorJugada.roundNumber}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Historial de partides */}
      <Card padding={false}>
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-sm text-gray-900">
            Historial de partides
            <span className="text-gray-400 font-normal ml-2">({partides.length})</span>
          </h3>
        </div>

        {partides.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">Cap partida jugada encara.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
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
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group">
                    {/* Ronda */}
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">
                      {p.roundNumber}
                    </div>

                    {/* Adversari */}
                    <div className="flex-1 min-w-0">
                      {p.isBye ? (
                        <span className="text-sm text-gray-400 italic">Bye</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          {adversari ? (
                            <Link
                              href={`/campionat/${id}/jugadors/${adversari.id}`}
                              className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
                            >
                              {adversari.name}
                            </Link>
                          ) : (
                            <span className="text-sm font-medium text-gray-500">?</span>
                          )}
                          {p.myBestWord && (
                            <span className="text-xs text-gray-400 hidden sm:inline">
                              Millor: {p.myBestWord} ({p.myBestWordScore}pts)
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Resultat */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {!p.isBye && p.myScore !== null && (
                        <span className="tabular-nums text-sm text-gray-700 font-medium">
                          {p.myScore} – {p.oppScore}
                        </span>
                      )}
                      {p.myScrabbles !== null && p.myScrabbles > 0 && (
                        <span className="text-xs text-blue-500 hidden sm:inline">
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
                      <svg className="w-4 h-4 text-gray-200 group-hover:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
    gray: 'text-gray-900',
    green: 'text-green-600',
    red: 'text-red-600',
    blue: 'text-blue-600',
  }[color];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}
