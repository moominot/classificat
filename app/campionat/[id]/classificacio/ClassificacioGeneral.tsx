'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import type { StandingRow } from '@/lib/standings-service';

export interface DesempatCol {
  key: string;
  label: string;
}

/**
 * Classificació general: taula a pc, targetes a mòbil.
 *
 * Les columnes són els criteris de desempat configurats a la fase, en el seu
 * ordre — és el que explica per què algú va per davant d'un altre, no una
 * llista arbitrària de mètriques (docs/pla-rols.md §11.3). Al mòbil una
 * taula amb tantes columnes es converteix en microtext il·legible, així que
 * la informació bàsica va a la targeta i els desempats al desplegable.
 */
export default function ClassificacioGeneral({
  tournamentId,
  standings,
  desempats,
}: {
  tournamentId: string;
  standings: StandingRow[];
  desempats: DesempatCol[];
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

  return (
    <>
      {/* Pc: taula amb els desempats com a columnes */}
      <Card padding={false} className="hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3 border-b border-border">
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-2 py-2 font-semibold">Jugador</th>
                <th className="px-2 py-2 font-semibold text-right whitespace-nowrap">Partides</th>
                <th className="px-2 py-2 font-semibold text-right">V-E-D</th>
                <th className="px-2 py-2 font-semibold text-right">Punts</th>
                {desempats.map((d) => (
                  <th key={d.key} className="px-2 py-2 font-semibold text-right whitespace-nowrap">
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {standings.map((s) => (
                <tr key={s.entryId} className="hover:bg-surface-2 transition-colors">
                  <td className="px-3 py-2.5 font-display font-bold text-ink-2 tabular-nums">{s.rank}</td>
                  <td className="px-2 py-2.5 min-w-[9rem]">
                    <Link
                      href={`/campionat/${tournamentId}/jugadors/${s.entryId}`}
                      className="font-medium text-ink hover:text-accent-ink transition-colors"
                    >
                      {s.displayName}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-ink-3">{s.gamesPlayed}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-ink-3 whitespace-nowrap">
                    {s.wins}-{s.draws}-{s.losses}
                  </td>
                  <td className="px-2 py-2.5 text-right font-display font-bold text-ink tabular-nums">
                    {formatMetric('points', s.points)}
                  </td>
                  {desempats.map((d) => (
                    <td key={d.key} className="px-2 py-2.5 text-right tabular-nums text-ink-2">
                      {formatMetric(d.key, s.metrics[d.key] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mòbil: targeta amb el bàsic a la vista i els desempats al desplegable */}
      <div className="sm:hidden space-y-2.5">
        {standings.map((s) => {
          const obert = oberts.has(s.entryId);
          return (
            <div key={s.entryId} className="border-2 border-border rounded-xl overflow-hidden bg-surface">
              <button
                type="button"
                onClick={() => desempats.length > 0 && toggle(s.entryId)}
                className="w-full text-left p-4 flex items-center gap-3"
              >
                <span className="w-9 h-9 rounded-full bg-accent-tint text-accent-ink flex items-center justify-center font-display font-bold flex-shrink-0 tabular-nums">
                  {s.rank}
                </span>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/campionat/${tournamentId}/jugadors/${s.entryId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="block text-lg font-display font-bold text-ink hover:text-accent-ink transition-colors truncate"
                  >
                    {s.displayName}
                  </Link>
                  <span className="text-sm text-ink-3 tabular-nums">
                    {s.gamesPlayed} partides · {s.wins}-{s.draws}-{s.losses}
                  </span>
                </div>
                <span className="font-display font-black text-xl text-ink tabular-nums flex-shrink-0">
                  {formatMetric('points', s.points)}
                </span>
                {desempats.length > 0 && (
                  <svg
                    className={`w-5 h-5 text-ink-3 flex-shrink-0 transition-transform ${obert ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>

              {obert && desempats.length > 0 && (
                <div className="border-t border-border divide-y divide-border">
                  {desempats.map((d) => (
                    <div key={d.key} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-sm text-ink-2">{d.label}</span>
                      <span className="font-semibold text-ink tabular-nums">
                        {formatMetric(d.key, s.metrics[d.key] ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function formatMetric(key: string, value: number): string {
  if (key === 'spread' && value > 0) return `+${formatNumber(value)}`;
  return formatNumber(value);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}
