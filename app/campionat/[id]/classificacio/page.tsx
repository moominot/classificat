import { db } from '@/db';
import { phases, players } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import Link from 'next/link';
import { computeStandings } from '@/lib/pairing/standings';
import { loadEngineRounds, loadAllPairings } from '@/lib/db-helpers';
import type { Phase as EnginePhase, Tiebreaker, Standing } from '@/lib/pairing/types';

const TIEBREAKER_COL: Record<Tiebreaker, {
  label: string;
  cell: (s: Standing) => string;
  className?: string;
} | null> = {
  median_buchholz:  { label: 'Med.Buch.',   cell: s => s.tiebreakers.medianBuchholz.toFixed(1) },
  buchholz:         { label: 'Buchholz',    cell: s => s.tiebreakers.buchholz.toFixed(1) },
  berger:           { label: 'Berger',      cell: s => s.tiebreakers.berger.toFixed(1) },
  spread:           { label: 'Spread',      cell: s => (s.spread > 0 ? '+' : '') + s.spread, className: 'spread' },
  wins:             null,
  cumulative:       { label: 'Total PF',    cell: s => s.tiebreakers.cumulative.toFixed(0) },
  avg_score:        { label: 'Mitjana PF',  cell: s => s.tiebreakers.avgScore.toFixed(1) },
  direct_encounter: { label: 'Enc.dir.',    cell: s => s.tiebreakers.directEncounterResult >= 0 ? s.tiebreakers.directEncounterResult.toFixed(1) : '—' },
};

const TIEBREAKER_LABEL: Record<Tiebreaker, string> = {
  median_buchholz:  'Buchholz medià',
  buchholz:         'Buchholz',
  berger:           'Berger',
  spread:           'Diferència',
  wins:             'Victòries',
  cumulative:       'Total punts a favor',
  avg_score:        'Mitjana punts a favor',
  direct_encounter: 'Enc. directe',
};
import { Card } from '@/components/ui/Card';

export const dynamic = 'force-dynamic';

type Pestanya = 'general' | 'scrabbles' | 'jugada' | 'conjunta' | 'individual';

const PESTANYES: { id: Pestanya; label: string }[] = [
  { id: 'general',    label: 'General' },
  { id: 'scrabbles',  label: 'Scrabbles' },
  { id: 'jugada',     label: 'Jugada' },
  { id: 'conjunta',   label: 'Partida conjunta' },
  { id: 'individual', label: 'Partida individual' },
];

export default async function ClassificacioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const pestanya: Pestanya = (PESTANYES.some(p => p.id === sp.t) ? sp.t : 'general') as Pestanya;

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

  const playerMap = new Map(tots_jugadors.map(p => [p.id, p]));

  const [engineRounds, totesPart] = await Promise.all([
    loadEngineRounds(id),
    loadAllPairings(id),
  ]);

  const tiebreakers = (totes_fases[0]?.tiebreakers ?? ['median_buchholz', 'buchholz', 'spread']) as EnginePhase['tiebreakers'];
  const standings = computeStandings(engineRounds, tots_jugadors.map(p => p.id), tiebreakers);
  const rondesJugades = engineRounds.filter(r => r.pairings.some(p => p.result !== null)).length;

  // ── Estadístiques per pestanyes ──────────────────────────────────────────────

  // Scrabbles: total bingos per jugador
  const scrabbleMap = new Map<string, { total: number; partides: number; maxPartida: number }>();
  for (const p of totesPart) {
    if (!p.outcome1) continue;
    const registra = (pid: string, n: number | null) => {
      if (!n && n !== 0) return;
      const prev = scrabbleMap.get(pid) ?? { total: 0, partides: 0, maxPartida: 0 };
      scrabbleMap.set(pid, {
        total: prev.total + n,
        partides: prev.partides + 1,
        maxPartida: Math.max(prev.maxPartida, n),
      });
    };
    registra(p.player1Id, p.p1Scrabbles);
    if (p.player2Id) registra(p.player2Id, p.p2Scrabbles);
  }
  const rankingScrabbles = tots_jugadors
    .map(j => ({ jugador: j, ...( scrabbleMap.get(j.id) ?? { total: 0, partides: 0, maxPartida: 0 }) }))
    .filter(x => x.partides > 0)
    .sort((a, b) => b.total - a.total || b.maxPartida - a.maxPartida);

  // Millor jugada: max p1BestWordScore / p2BestWordScore per jugador
  const jugadaMap = new Map<string, { paraula: string; punts: number; ronda: number; rival: string }>();
  for (const p of totesPart) {
    if (!p.outcome1) continue;
    const actualitza = (pid: string, word: string | null, score: number | null, ronda: number, rivalId: string | null) => {
      if (!word || !score) return;
      const prev = jugadaMap.get(pid);
      if (!prev || score > prev.punts) {
        jugadaMap.set(pid, { paraula: word, punts: score, ronda, rival: rivalId ?? 'bye' });
      }
    };
    actualitza(p.player1Id, p.p1BestWord, p.p1BestWordScore, p.roundNumber, p.player2Id);
    if (p.player2Id) actualitza(p.player2Id, p.p2BestWord, p.p2BestWordScore, p.roundNumber, p.player1Id);
  }
  const rankingJugada = [...jugadaMap.entries()]
    .map(([pid, d]) => ({ jugador: playerMap.get(pid)!, ...d }))
    .filter(x => x.jugador)
    .sort((a, b) => b.punts - a.punts);

  // Partida conjunta: p1Score + p2Score per aparellament
  const partidesConjuntes = totesPart
    .filter(p => p.outcome1 && p.player2Id && p.p1Score != null && p.p2Score != null)
    .map(p => ({
      ronda: p.roundNumber,
      jugador1: playerMap.get(p.player1Id)!,
      jugador2: playerMap.get(p.player2Id!)!,
      p1Score: p.p1Score!,
      p2Score: p.p2Score!,
      total: p.p1Score! + p.p2Score!,
    }))
    .filter(x => x.jugador1 && x.jugador2)
    .sort((a, b) => b.total - a.total);

  // Partida individual: millor puntuació d'una sola partida per jugador
  const individualMap = new Map<string, { punts: number; ronda: number; rival: string }>();
  for (const p of totesPart) {
    if (!p.outcome1) continue;
    const actualitza = (pid: string, score: number | null, ronda: number, rivalId: string | null) => {
      if (score == null) return;
      const prev = individualMap.get(pid);
      if (!prev || score > prev.punts) {
        individualMap.set(pid, { punts: score, ronda, rival: rivalId ?? 'bye' });
      }
    };
    actualitza(p.player1Id, p.p1Score, p.roundNumber, p.player2Id);
    if (p.player2Id) actualitza(p.player2Id, p.p2Score, p.roundNumber, p.player1Id);
  }
  const rankingIndividual = [...individualMap.entries()]
    .map(([pid, d]) => ({ jugador: playerMap.get(pid)!, ...d }))
    .filter(x => x.jugador)
    .sort((a, b) => b.punts - a.punts);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Pestanyes */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {PESTANYES.map(({ id: tid, label }) => (
          <Link
            key={tid}
            href={`/campionat/${id}/classificacio?t=${tid}`}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              pestanya === tid
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* ── General ── */}
      {pestanya === 'general' && (() => {
        // Columnes de desempat en l'ordre configurat (excloent 'wins', que ja és columna fixa)
        const tbCols = tiebreakers
          .map(t => ({ key: t, def: TIEBREAKER_COL[t] }))
          .filter((x): x is { key: Tiebreaker; def: NonNullable<typeof TIEBREAKER_COL[Tiebreaker]> } => x.def !== null);
        // Classes responsive: 1a → sm, 2a → md, resta → lg
        const responsiveClass = (i: number) =>
          i === 0 ? 'hidden sm:table-cell' : i === 1 ? 'hidden md:table-cell' : 'hidden lg:table-cell';

        return (
          <>
            <p className="text-sm text-gray-500">
              {rondesJugades} ronda{rondesJugades !== 1 ? 'es' : ''} computades
              {' · '}
              {standings.filter(s => s.gamesPlayed > 0).length} jugadors amb partides
            </p>
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
                      {tbCols.map(({ key, def }, i) => (
                        <th key={key} className={`text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${responsiveClass(i)}`}>
                          {def.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {standings.map((s) => {
                      const jugador = playerMap.get(s.playerId);
                      const isPodi = s.rank <= 3 && s.gamesPlayed > 0;
                      return (
                        <tr key={s.playerId} className={`${isPodi ? 'bg-amber-50' : 'hover:bg-gray-50'} transition-colors`}>
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
                            <Link href={`/campionat/${id}/jugadors/${s.playerId}`} className="font-medium text-gray-900 hover:text-blue-600 transition-colors">
                              {jugador?.name ?? '?'}
                            </Link>
                            {!jugador?.isActive && <span className="text-xs text-gray-400 ml-2">Inactiu</span>}
                          </td>
                          <td className="px-3 py-3 text-center font-bold text-gray-900">{s.points}</td>
                          <td className="px-3 py-3 text-center text-green-600 font-medium">{s.wins}</td>
                          <td className="px-3 py-3 text-center text-red-500 font-medium">{s.losses}</td>
                          <td className="px-3 py-3 text-center text-gray-500 hidden sm:table-cell">{s.gamesPlayed}</td>
                          {tbCols.map(({ key, def }, i) => (
                            <td key={key} className={`px-3 py-3 text-center ${responsiveClass(i)} ${
                              def.className === 'spread'
                                ? s.spread > 0 ? 'text-green-600 font-medium' : s.spread < 0 ? 'text-red-500 font-medium' : 'text-gray-400'
                                : 'text-gray-500'
                            }`}>
                              {def.cell(s)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
            <p className="text-xs text-gray-400 text-right">
              Desempats: {tiebreakers.map(t => TIEBREAKER_LABEL[t]).join(' → ')}
            </p>
          </>
        );
      })()}

      {/* ── Scrabbles ── */}
      {pestanya === 'scrabbles' && (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Jugador</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Mitjana</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Màx. partida</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rankingScrabbles.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">Sense dades de scrabbles registrades</td></tr>
                ) : rankingScrabbles.map((x, i) => (
                  <tr key={x.jugador.id} className={`${i < 3 ? 'bg-amber-50' : 'hover:bg-gray-50'} transition-colors`}>
                    <td className="px-4 py-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0 ? 'bg-amber-400 text-amber-900' :
                        i === 1 ? 'bg-gray-300 text-gray-700' :
                        i === 2 ? 'bg-amber-600 text-white' :
                        'bg-gray-100 text-gray-500'
                      }`}>{i + 1}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/campionat/${id}/jugadors/${x.jugador.id}`} className="font-medium text-gray-900 hover:text-blue-600 transition-colors">
                        {x.jugador.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-gray-900">{x.total}</td>
                    <td className="px-3 py-3 text-center text-gray-500 hidden sm:table-cell">
                      {(x.total / x.partides).toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-500 hidden sm:table-cell">{x.maxPartida}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Millor jugada ── */}
      {pestanya === 'jugada' && (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Jugador</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Paraula</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Punts</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Ronda</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Rival</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rankingJugada.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">Sense dades de millors jugades registrades</td></tr>
                ) : rankingJugada.map((x, i) => (
                  <tr key={x.jugador.id} className={`${i < 3 ? 'bg-amber-50' : 'hover:bg-gray-50'} transition-colors`}>
                    <td className="px-4 py-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0 ? 'bg-amber-400 text-amber-900' :
                        i === 1 ? 'bg-gray-300 text-gray-700' :
                        i === 2 ? 'bg-amber-600 text-white' :
                        'bg-gray-100 text-gray-500'
                      }`}>{i + 1}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/campionat/${id}/jugadors/${x.jugador.id}`} className="font-medium text-gray-900 hover:text-blue-600 transition-colors">
                        {x.jugador.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 font-mono font-semibold text-gray-800 uppercase">{x.paraula}</td>
                    <td className="px-3 py-3 text-center font-bold text-blue-600">{x.punts}</td>
                    <td className="px-3 py-3 text-center text-gray-500 hidden sm:table-cell">{x.ronda}</td>
                    <td className="px-3 py-3 text-gray-500 hidden md:table-cell">
                      {playerMap.get(x.rival)?.name ?? (x.rival === 'bye' ? 'Bye' : '?')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Partida conjunta ── */}
      {pestanya === 'conjunta' && (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Ronda</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Jugadors</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {partidesConjuntes.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">Sense partides registrades</td></tr>
                ) : partidesConjuntes.map((x, i) => (
                  <tr key={`${x.jugador1.id}-${x.ronda}`} className={`${i < 3 ? 'bg-amber-50' : 'hover:bg-gray-50'} transition-colors`}>
                    <td className="px-4 py-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0 ? 'bg-amber-400 text-amber-900' :
                        i === 1 ? 'bg-gray-300 text-gray-700' :
                        i === 2 ? 'bg-amber-600 text-white' :
                        'bg-gray-100 text-gray-500'
                      }`}>{i + 1}</div>
                    </td>
                    <td className="px-3 py-3 text-center text-gray-500 hidden sm:table-cell">{x.ronda}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{x.jugador1.name}</span>
                      <span className="text-gray-400 mx-1">·</span>
                      <span className="font-medium text-gray-900">{x.jugador2.name}</span>
                      <span className="text-xs text-gray-400 ml-2">({x.p1Score} + {x.p2Score})</span>
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-blue-600">{x.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Partida individual ── */}
      {pestanya === 'individual' && (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Jugador</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Punts</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Ronda</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Rival</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rankingIndividual.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">Sense partides registrades</td></tr>
                ) : rankingIndividual.map((x, i) => (
                  <tr key={x.jugador.id} className={`${i < 3 ? 'bg-amber-50' : 'hover:bg-gray-50'} transition-colors`}>
                    <td className="px-4 py-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0 ? 'bg-amber-400 text-amber-900' :
                        i === 1 ? 'bg-gray-300 text-gray-700' :
                        i === 2 ? 'bg-amber-600 text-white' :
                        'bg-gray-100 text-gray-500'
                      }`}>{i + 1}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/campionat/${id}/jugadors/${x.jugador.id}`} className="font-medium text-gray-900 hover:text-blue-600 transition-colors">
                        {x.jugador.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-blue-600">{x.punts}</td>
                    <td className="px-3 py-3 text-center text-gray-500 hidden sm:table-cell">{x.ronda}</td>
                    <td className="px-3 py-3 text-gray-500 hidden md:table-cell">
                      {playerMap.get(x.rival)?.name ?? (x.rival === 'bye' ? 'Bye' : '?')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}