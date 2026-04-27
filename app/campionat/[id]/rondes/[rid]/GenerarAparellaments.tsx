'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { PairingWarning } from '@/lib/pairing/types';

interface Jugador {
  id: string;
  name: string;
  rating?: number | null;
}

interface SeedEntry {
  seed: number;
  playerId: string;
  name: string;
  rating: number | null;
  points: number;
  rank: number | null;
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
  const [absentIds, setAbsentIds] = useState<Set<string>>(new Set(previousAbsentIds));
  const [modal, setModal] = useState<{
    isFirstRound: boolean;
    seedingOrder: SeedEntry[];
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingGenerar, setLoadingGenerar] = useState(false);
  const [warnings, setWarnings] = useState<PairingWarning[]>([]);
  const [error, setError] = useState('');

  function toggleAbsent(id: string) {
    setAbsentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function previsualitzar() {
    setLoadingPreview(true);
    setError('');
    const absentParam = [...absentIds].join(',');
    const res = await fetch(
      `/api/tournaments/${tournamentId}/rounds/${roundId}/seeding${absentParam ? `?absentIds=${absentParam}` : ''}`
    );
    if (res.ok) {
      const data = await res.json();
      setModal(data);
    } else {
      const d = await res.json();
      setError(d.error ?? 'Error en carregar el seeding');
    }
    setLoadingPreview(false);
  }

  async function generar() {
    setLoadingGenerar(true);
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
      setModal(null);
      router.refresh();
    } else {
      const d = await res.json();
      setError(d.error ?? 'Error en generar els aparellaments');
    }
    setLoadingGenerar(false);
  }

  const playing = players.filter(p => !absentIds.has(p.id));
  const byes = playing.length % 2 === 1 ? 1 : 0;

  return (
    <>
      <Card>
        <div className="space-y-5">
          {/* Selecció de participants */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Participants ronda {roundNumber}</h3>
              <span className="text-xs text-gray-400">
                {playing.length} jugadors · {Math.floor(playing.length / 2)} partides{byes ? ' + 1 bye' : ''}
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
              onClick={previsualitzar}
              loading={loadingPreview}
              disabled={playing.length < 2}
              title={playing.length < 2 ? 'Cal almenys 2 jugadors per generar aparellaments' : undefined}
            >
              Generar aparellaments
            </Button>
          </div>
        </div>
      </Card>

      {/* Modal de seeding */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModal(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm flex flex-col max-h-[80vh]">
            {/* Capçalera */}
            <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-gray-900">Ordre de seeding</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {modal.isFirstRound
                  ? 'Primera ronda — ordenat per BARRUF descendent'
                  : 'Ordenat per classificació actual'}
              </p>
            </div>

            {/* Llista */}
            <ol className="overflow-y-auto flex-1 divide-y divide-gray-100 px-1 py-1">
              {modal.seedingOrder.map(s => (
                <li key={s.playerId} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-6 text-right text-xs text-gray-400 font-mono flex-shrink-0">
                    {s.seed}
                  </span>
                  <span className="flex-1 font-medium text-gray-900 truncate">{s.name}</span>
                  <div className="flex gap-2 text-xs text-gray-400 flex-shrink-0">
                    {s.rating != null && <span>BARRUF {s.rating}</span>}
                    {!modal.isFirstRound && <span>{s.points} pts</span>}
                  </div>
                </li>
              ))}
            </ol>

            {/* Peu */}
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
              <Button variant="ghost" onClick={() => setModal(null)} disabled={loadingGenerar}>
                Cancel·lar
              </Button>
              <Button onClick={generar} loading={loadingGenerar}>
                Generar aparellaments
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
