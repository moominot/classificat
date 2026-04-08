import { db } from '@/db';
import { rounds, pairings, phases, players } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { computeStandings } from '@/lib/pairing/standings';
import type { Round as EngineRound, Phase as EnginePhase } from '@/lib/pairing/types';
import Badge from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

export const dynamic = 'force-dynamic';

export default async function ClassificacioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [totes_fases, tots_jugadors] = await Promise.all([
    db.select().from(phases).where(eq(phases.tournamentId, id)).orderBy(asc(phases.order)),
    db.select().from(players).where(eq(players.tournamentId, id)).orderBy(asc(players.name)),
  ]);

  if (totes_fases.length === 0 || tots_jugadors.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-sm">Cal tenir jugadors i fases configurades per veure la classificació.</p>
      </div>
    );
  }

  // Carrega totes les rondes i aparellaments
  const totes_rondes = await db
    .select()
    .from(rounds)
    .where(eq(rounds.tournamentId, id))
    .orderBy(asc(rounds.number));

  const tots_aparellaments = totes_rondes.length > 0
    ? await db.select().from(pairings).where(
        eq(pairings.roundId, totes_rondes[0].id)  // workaround: caldria inArray
      )
    : [];

  // Construïm l'inArray manualment per eficiència
  const allPairings = [];
  for (const r of totes_rondes) {
    const rPairings = await db.select().from(pairings).where(eq(pairings.roundId, r.id));
    allPairings.push(...rPairings);
  }

  // Construeix rondes del motor
  const engineRounds: EngineRound[] = totes_rondes.map(r => ({
    id: r.id,
    tournamentId: r.tournamentId,
    phaseId: r.phaseId,
    number: r.number,
    isComplete: r.isComplete,
    createdAt: new Date(),
    pairings: allPairings
      .filter(p => p.roundId === r.id)
      .map(p => ({
        id: p.id,
        roundId: p.roundId,
        tableNumber: p.tableNumber,
        player1Id: p.player1Id,
        player2Id: p.player2Id ?? null,
        result: p.outcome1 ? {
          p1Score: p.p1Score ?? 0,
          p2Score: p.p2Score ?? null,
          outcome1: p.outcome1,
          outcome2: p.outcome2 ?? null,
          reportedAt: new Date(),
          reportedBy: null,
        } : null,
      })),
  }));

  // Usa els desempats de la primera fase com a referència
  const tiebreakers = (totes_fases[0]?.tiebreakers ?? ['median_buchholz', 'buchholz', 'spread']) as EnginePhase['tiebreakers'];
  const playerIds = tots_jugadors.map(p => p.id);
  const standings = computeStandings(engineRounds, playerIds, tiebreakers);

  const playerMap = new Map(tots_jugadors.map(p => [p.id, p]));
  const rondesJugades = engineRounds.filter(r => r.pairings.some(p => p.result !== null)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {rondesJugades} ronda{rondesJugades !== 1 ? 'es' : ''} computades · {standings.filter(s => s.gamesPlayed > 0).length} jugadors amb partides
        </p>
      </div>

      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Jugador</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pts</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">V</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">D</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">PJ</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Spread</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Buchholz</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Med. Buch.</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Berger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {standings.map((s) => {
                const jugador = playerMap.get(s.playerId);
                const isPodi = s.rank <= 3 && s.gamesPlayed > 0;
                return (
                  <tr
                    key={s.playerId}
                    className={`${isPodi ? 'bg-amber-50' : 'hover:bg-gray-50'} transition-colors`}
                  >
                    <td className="px-4 py-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        s.rank === 1 ? 'bg-amber-400 text-amber-900' :
                        s.rank === 2 ? 'bg-gray-300 text-gray-700' :
                        s.rank === 3 ? 'bg-amber-600 text-white' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {s.rank}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{jugador?.name ?? '?'}</div>
                      {!jugador?.isActive && <span className="text-xs text-gray-400">Inactiu</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="font-bold text-gray-900">{s.points}</span>
                    </td>
                    <td className="px-3 py-3 text-center text-green-600 font-medium">{s.wins}</td>
                    <td className="px-3 py-3 text-center text-red-500 font-medium">{s.losses}</td>
                    <td className="px-3 py-3 text-center text-gray-500 hidden sm:table-cell">{s.gamesPlayed}</td>
                    <td className={`px-3 py-3 text-center hidden md:table-cell font-medium ${
                      s.spread > 0 ? 'text-green-600' : s.spread < 0 ? 'text-red-500' : 'text-gray-400'
                    }`}>
                      {s.spread > 0 ? '+' : ''}{s.spread}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-500 hidden md:table-cell">
                      {s.tiebreakers.buchholz.toFixed(1)}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-500 hidden lg:table-cell">
                      {s.tiebreakers.medianBuchholz.toFixed(1)}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-500 hidden lg:table-cell">
                      {s.tiebreakers.berger.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-gray-400 text-right">
        Desempats: {(tiebreakers as string[]).join(' → ')}
      </p>
    </div>
  );
}
