import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import type { CombinedMatchRow } from '@/lib/db-helpers';

/**
 * Rànquing de "millor partida conjunta": no és un mèrit d'un jugador, sinó
 * de la taula — es classifica de més a menys per la suma dels punts dels
 * participants, no hi ha desplegable d'historial (cada fila ja és una sola
 * partida).
 */
export default function RanquingPartidaConjunta({
  tournamentId,
  rows,
  nomPerEntry,
}: {
  tournamentId: string;
  rows: CombinedMatchRow[];
  nomPerEntry: Record<string, string>;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-ink-3 text-center py-10">Encara no hi ha partides amb resultat.</p>;
  }

  return (
    <>
      {/* Pc: taula */}
      <Card padding={false} className="hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3 border-b border-border">
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-2 py-2 font-semibold text-right whitespace-nowrap">Σ punts</th>
                <th className="px-2 py-2 font-semibold">Jugadors</th>
                <th className="px-2 py-2 font-semibold text-right">Ronda</th>
                <th className="px-3 py-2 font-semibold text-right">Taula</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, i) => (
                <tr key={row.matchId} className="hover:bg-surface-2 transition-colors">
                  <td className="px-3 py-2.5 font-display font-bold text-ink-2 tabular-nums">{i + 1}</td>
                  <td className="px-2 py-2.5 text-right font-display font-bold text-ink tabular-nums">
                    <Link href={`/campionat/${tournamentId}/partida/${row.matchId}`} className="hover:text-accent-ink">
                      {formatValue(row.combinedScore)}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5 text-ink-2">
                    {row.participants.map((p, j) => (
                      <span key={p.entryId}>
                        {j > 0 && <span className="text-ink-3"> · </span>}
                        {nomPerEntry[p.entryId] ?? '?'}{' '}
                        <span className="font-semibold text-ink tabular-nums">({formatValue(p.score)})</span>
                      </span>
                    ))}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-ink-3">{row.roundNumber}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-3">{row.tableNumber}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mòbil: targetes */}
      <div className="sm:hidden space-y-3">
        {rows.map((row, i) => (
          <Link
            key={row.matchId}
            href={`/campionat/${tournamentId}/partida/${row.matchId}`}
            className="block border-2 border-border rounded-xl bg-surface p-4 hover:border-accent transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-accent-tint text-accent-ink flex items-center justify-center font-display font-bold flex-shrink-0 tabular-nums">
                {i + 1}
              </span>
              <span className="flex-1 text-lg font-display font-bold text-ink truncate">
                Σ punts: {formatValue(row.combinedScore)}
              </span>
              <span
                title={`Ronda ${row.roundNumber}`}
                className="flex-shrink-0 px-2.5 py-1 rounded-full bg-surface-2 text-ink-2 text-xs font-bold tabular-nums"
              >
                Ronda {row.roundNumber}
              </span>
            </div>
            <div className="pl-12 mt-1.5 space-y-0.5">
              {row.participants.map((p) => (
                <div key={p.entryId} className="text-sm text-ink-2">
                  {nomPerEntry[p.entryId] ?? '?'}:{' '}
                  <span className="font-semibold text-ink tabular-nums">{formatValue(p.score)} punts</span>
                </div>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}
