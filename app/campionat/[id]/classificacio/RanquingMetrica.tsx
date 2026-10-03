'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { StandingRow } from '@/lib/standings-service';
import type { MetricHistoryRow } from '@/lib/db-helpers';

/**
 * Rànquing d'una sola mètrica, en targetes grans (no taula): al mòbil una
 * fila densa amb el nom petit i el valor enganxat es llegeix malament.
 * Cada targeta es pot desplegar per veure l'historial complet, ronda a
 * ronda, en lloc de només el millor valor.
 */
export default function RanquingMetrica({
  tournamentId,
  standings,
  metrica,
  etiqueta,
  isWordMetric,
  historyByEntry,
}: {
  tournamentId: string;
  standings: StandingRow[];
  metrica: string;
  etiqueta: string;
  /** Preguntes "paraula + valor" (p.ex. Millor jugada) mostren la paraula; la resta, total + mitjana. */
  isWordMetric: boolean;
  historyByEntry: Record<string, MetricHistoryRow[]>;
}) {
  const [oberts, setOberts] = useState<Set<string>>(new Set());

  function toggle(entryId: string) {
    setOberts((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  const ordenat = [...standings]
    .filter((s) => (s.metrics[metrica] ?? 0) !== 0 || s.gamesPlayed > 0)
    .sort((a, b) => (b.metrics[metrica] ?? 0) - (a.metrics[metrica] ?? 0));

  if (ordenat.length === 0) {
    return <p className="text-sm text-ink-3 text-center py-10">Encara no hi ha dades de {etiqueta.toLowerCase()}.</p>;
  }

  return (
    <div className="space-y-3">
      {ordenat.map((s, i) => {
        const history = historyByEntry[s.entryId] ?? [];
        const best = history[0] ?? null;
        const total = s.metrics[metrica] ?? 0;
        const realGames = Math.max(0, s.gamesPlayed - s.byes);
        const mitjana = realGames > 0 ? total / realGames : 0;
        const obert = oberts.has(s.entryId);

        return (
          <div key={s.entryId} className="border-2 border-border rounded-xl overflow-hidden bg-surface">
            <button
              type="button"
              onClick={() => history.length > 0 && toggle(s.entryId)}
              className="w-full text-left p-4"
            >
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-accent-tint text-accent-ink flex items-center justify-center font-display font-bold flex-shrink-0 tabular-nums">
                  {i + 1}
                </span>
                <Link
                  href={`/campionat/${tournamentId}/jugadors/${s.entryId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 text-lg font-display font-bold text-ink hover:text-accent-ink transition-colors truncate"
                >
                  {s.displayName}
                </Link>
                {history.length > 0 && (
                  <svg
                    className={`w-5 h-5 text-ink-3 flex-shrink-0 transition-transform ${obert ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </div>

              <div className="pl-12 mt-1.5 space-y-0.5">
                {isWordMetric && best?.word && (
                  <div className="text-xl font-display font-black text-accent-ink uppercase tracking-wide leading-tight">
                    {best.word}
                  </div>
                )}
                <div className="text-sm text-ink-2">
                  {isWordMetric ? 'Punts' : `Total ${etiqueta}`}:{' '}
                  <span className="font-semibold text-ink tabular-nums">
                    {formatValue(isWordMetric ? (best?.value ?? total) : total)}
                  </span>
                </div>
                {isWordMetric && best && best.opponentNames.length > 0 && (
                  <div className="text-sm text-ink-3">Adversari: {best.opponentNames.join(', ')}</div>
                )}
                {!isWordMetric && realGames > 0 && (
                  <div className="text-sm text-ink-2">
                    Mitjana: <span className="font-semibold text-ink tabular-nums">{formatValue(mitjana)}</span>
                  </div>
                )}
              </div>
            </button>

            {obert && history.length > 0 && (
              <div className="border-t border-border divide-y divide-border">
                {history.map((row) => (
                  <Link
                    key={row.matchId}
                    href={`/campionat/${tournamentId}/partida/${row.matchId}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 transition-colors"
                  >
                    <span className="text-xs text-ink-3 w-16 flex-shrink-0">Ronda {row.roundNumber}</span>
                    <span className="font-display font-bold text-ink tabular-nums w-10 flex-shrink-0">
                      {formatValue(row.value)}
                    </span>
                    {isWordMetric && row.word && (
                      <span className="font-display font-black text-ink uppercase text-sm truncate">
                        {row.word}
                      </span>
                    )}
                    <span className="flex-1 text-sm text-ink-3 truncate text-right">
                      {row.opponentNames.join(', ')}
                    </span>
                    <svg className="w-4 h-4 text-ink-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}
