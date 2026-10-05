'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import type { StandingRow } from '@/lib/standings-service';
import type { MetricHistoryRow } from '@/lib/db-helpers';

/**
 * Rànquing d'una sola mètrica: taula a pc i targetes grans al mòbil (una
 * fila densa amb el nom petit i el valor enganxat es llegeix malament).
 * Cada fila/targeta es pot desplegar per veure l'historial complet, ronda a
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
    <>
      {/* Pc: taula */}
      <Card padding={false} className="hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3 border-b border-border">
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-2 py-2 font-semibold">Jugador</th>
                {isWordMetric && <th className="px-2 py-2 font-semibold">Paraula</th>}
                <th className="px-2 py-2 font-semibold text-right whitespace-nowrap">
                  {isWordMetric ? 'Punts' : `Total ${etiqueta}`}
                </th>
                {isWordMetric ? (
                  <th className="px-2 py-2 font-semibold">Adversari</th>
                ) : (
                  <th className="px-2 py-2 font-semibold text-right">Mitjana</th>
                )}
                <th className="px-2 py-2 font-semibold text-right whitespace-nowrap">Darrera ronda</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ordenat.map((s, i) => {
                const d = dadesFila(s, historyByEntry[s.entryId] ?? [], metrica);
                const obert = oberts.has(s.entryId);
                return (
                  <Fragment key={s.entryId}>
                    <tr
                      onClick={() => d.history.length > 0 && toggle(s.entryId)}
                      className={`hover:bg-surface-2 transition-colors ${d.history.length > 0 ? 'cursor-pointer' : ''}`}
                    >
                      <td className="px-3 py-2.5 font-display font-bold text-ink-2 tabular-nums">{i + 1}</td>
                      <td className="px-2 py-2.5 min-w-[9rem]">
                        <Link
                          href={`/campionat/${tournamentId}/jugadors/${s.entryId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-ink hover:text-accent-ink transition-colors"
                        >
                          {s.displayName}
                        </Link>
                      </td>
                      {isWordMetric && (
                        <td className="px-2 py-2.5 font-display font-black text-accent-ink uppercase tracking-wide">
                          {d.best?.word ?? '—'}
                        </td>
                      )}
                      <td className="px-2 py-2.5 text-right font-display font-bold text-ink tabular-nums">
                        {formatValue(isWordMetric ? (d.best?.value ?? d.total) : d.total)}
                      </td>
                      {isWordMetric ? (
                        <td className="px-2 py-2.5 text-ink-3">{d.best?.opponentNames.join(', ') ?? ''}</td>
                      ) : (
                        <td className="px-2 py-2.5 text-right tabular-nums text-ink-2">
                          {d.realGames > 0 ? formatValue(d.mitjana) : '—'}
                        </td>
                      )}
                      <td className="px-2 py-2.5 text-right tabular-nums text-ink-2 whitespace-nowrap">
                        {d.darrera
                          ? isWordMetric
                            ? d.esMillora
                              ? `Millora (R${d.darrera.roundNumber})`
                              : `R${d.darrera.roundNumber}`
                            : `+${formatValue(d.darrera.value)} (R${d.darrera.roundNumber})`
                          : '—'}
                      </td>
                      <td className="pr-3 text-ink-3">
                        {d.history.length > 0 && (
                          <svg
                            className={`w-4 h-4 transition-transform ${obert ? 'rotate-180' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                      </td>
                    </tr>
                    {obert && d.history.length > 0 && (
                      <tr>
                        <td colSpan={isWordMetric ? 7 : 6} className="p-0 bg-surface-2/40">
                          <HistorialFiles tournamentId={tournamentId} history={d.history} isWordMetric={isWordMetric} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mòbil: targetes */}
      <div className="sm:hidden space-y-3">
      {ordenat.map((s, i) => {
        const { history, best, total, realGames, mitjana, darrera, esMillora } = dadesFila(
          s,
          historyByEntry[s.entryId] ?? [],
          metrica
        );
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
                {isWordMetric
                  ? esMillora && (
                      <span
                        title={`Ronda ${darrera!.roundNumber}`}
                        className="flex-shrink-0 px-2.5 py-1 rounded-full bg-accent text-surface text-xs font-bold"
                      >
                        Millora
                      </span>
                    )
                  : darrera && (
                      <span
                        title={`Ronda ${darrera.roundNumber}`}
                        className="flex-shrink-0 px-2.5 py-1 rounded-full bg-accent text-surface text-xs font-bold tabular-nums"
                      >
                        +{formatValue(darrera.value)}
                      </span>
                    )}
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
              <HistorialFiles tournamentId={tournamentId} history={history} isWordMetric={isWordMetric} />
            )}
          </div>
        );
      })}
      </div>
    </>
  );
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

/** Valors derivats d'un jugador per a una mètrica — compartits per la taula i les targetes. */
function dadesFila(s: StandingRow, history: MetricHistoryRow[], metrica: string) {
  const best = history[0] ?? null;
  const total = s.metrics[metrica] ?? 0;
  const realGames = Math.max(0, s.gamesPlayed - s.byes);
  const mitjana = realGames > 0 ? total / realGames : 0;
  // El valor de la darrera ronda jugada, no el millor (que ja es veu a part):
  // és el que acaba de passar, el que més interessa d'un cop d'ull quan es
  // consulta la classificació entre rondes.
  const darrera = history.reduce<MetricHistoryRow | null>(
    (acc, row) => (!acc || row.roundNumber > acc.roundNumber ? row : acc),
    null
  );
  // A "paraula + valor" (p.ex. Millor jugada) el nombre no diu res per si
  // sol — el que interessa és si la darrera jugada ha millorat les
  // anteriors, no el seu valor absolut.
  const anteriorsMillor = history
    .filter((row) => row !== darrera)
    .reduce((max, row) => Math.max(max, row.value), -Infinity);
  const esMillora = darrera !== null && darrera.value >= anteriorsMillor;
  return { history, best, total, realGames, mitjana, darrera, esMillora };
}

/** Historial ronda a ronda d'un jugador, desplegat sota la seva fila o targeta. */
function HistorialFiles({
  tournamentId,
  history,
  isWordMetric,
}: {
  tournamentId: string;
  history: MetricHistoryRow[];
  isWordMetric: boolean;
}) {
  return (
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
            <span className="font-display font-black text-ink uppercase text-sm truncate">{row.word}</span>
          )}
          <span className="flex-1 text-sm text-ink-3 truncate text-right">{row.opponentNames.join(', ')}</span>
          <svg className="w-4 h-4 text-ink-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      ))}
    </div>
  );
}
