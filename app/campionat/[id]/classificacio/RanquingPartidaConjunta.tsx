import Link from 'next/link';
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
    <div className="space-y-3">
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
              {row.participants.map((p) => nomPerEntry[p.entryId] ?? '?').join(' – ')}
            </span>
            <span className="flex-shrink-0 px-2.5 py-1 rounded-full bg-accent text-surface text-sm font-bold tabular-nums">
              {formatValue(row.combinedScore)}
            </span>
          </div>
          <div className="pl-12 mt-1.5 text-sm text-ink-3">
            Ronda {row.roundNumber}
            {' · '}
            {row.participants.map((p) => `${nomPerEntry[p.entryId] ?? '?'}: ${formatValue(p.score)}`).join(' · ')}
          </div>
        </Link>
      ))}
    </div>
  );
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}
