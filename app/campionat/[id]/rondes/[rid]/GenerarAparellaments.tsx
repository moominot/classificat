'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { PairingWarning } from '@/lib/pairing/types';

interface Jugador {
  id: string;
  name: string;
}

export default function GenerarAparellaments({
  tournamentId,
  roundId,
  roundNumber,
  players = [],
  previousAbsentIds = [],
}: {
  tournamentId: string;
  roundId: string;
  roundNumber: number;
  players?: Jugador[];
  previousAbsentIds?: string[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [warnings, setWarnings] = useState<PairingWarning[]>([]);
  const [error, setError] = useState('');
  const [absentIds, setAbsentIds] = useState<Set<string>>(new Set(previousAbsentIds));

  function toggleAbsent(id: string) {
    setAbsentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generar() {
    setLoading(true);
    setError('');
    setWarnings([]);

    const res = await fetch(
      `/api/tournaments/${tournamentId}/rounds/${roundId}/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ absentPlayerIds: [...absentIds] }),
      }
    );

    if (res.ok) {
      const data = await res.json();
      if (data.warnings?.length > 0) setWarnings(data.warnings);
      router.refresh();
    } else {
      const d = await res.json();
      setError(d.error ?? 'Error en generar els aparellaments');
    }
    setLoading(false);
  }

  const playing = players.filter(p => !absentIds.has(p.id));
  const byes = playing.length % 2 === 1 ? 1 : 0;

  return (
    <Card>
      <div className="space-y-5">
        {/* Selecció de participants */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Participants ronda {roundNumber}</h3>
            <span className="text-xs text-gray-400">
              {playing.length} jugadors · {playing.length - byes * 2 === 0 ? Math.floor(playing.length / 2) : Math.floor(playing.length / 2)} partides{byes ? ' + 1 bye' : ''}
            </span>
          </div>

          {players.length === 0 ? (
            <p className="text-sm text-gray-400">No hi ha jugadors actius al campionat.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {players.map(p => {
                const absent = absentIds.has(p.id);
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors text-sm select-none ${
                      absent
                        ? 'bg-red-50 border-red-200 text-red-500 line-through'
                        : 'bg-green-50 border-green-200 text-green-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!absent}
                      onChange={() => toggleAbsent(p.id)}
                      className="rounded accent-green-600 flex-shrink-0"
                    />
                    <span className="truncate">{p.name}</span>
                  </label>
                );
              })}
            </div>
          )}

          {previousAbsentIds.length > 0 && absentIds.size === 0 && (
            <p className="text-xs text-gray-400 mt-2">
              Tots els jugadors participen (la ronda anterior tenia absents pre-marcats, però has desmarcat tots).
            </p>
          )}
          {previousAbsentIds.length > 0 && absentIds.size > 0 && [...absentIds].every(id => previousAbsentIds.includes(id)) && (
            <p className="text-xs text-amber-600 mt-2">
              Absents pre-marcats de la ronda anterior.
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {warnings.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 space-y-1">
            {warnings.map((w, i) => <p key={i}>⚠ {w.message}</p>)}
          </div>
        )}

        <div className="flex items-center justify-end">
          <Button
            onClick={generar}
            loading={loading}
            disabled={playing.length < 2}
            title={playing.length < 2 ? 'Cal almenys 2 jugadors per generar aparellaments' : undefined}
          >
            Generar aparellaments
          </Button>
        </div>
      </div>
    </Card>
  );
}
