'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { useIsDirector } from '@/components/DirectorContext';
import { readError } from '@/lib/http';

interface Fase { id: string; name: string; startRound: number; endRound: number; order: number }

export default function NouaRonda({
  tournamentId,
  fases,
  rondesExistents,
}: {
  tournamentId: string;
  fases: Fase[];
  rondesExistents: number[];
}) {
  const router = useRouter();
  const isDirector = useIsDirector();
  const [obert, setObert] = useState(false);
  const [faseId, setFaseId] = useState(fases[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Calcula el pròxim número de ronda disponible
  const maxExistent = rondesExistents.length > 0 ? Math.max(...rondesExistents) : 0;
  const propera = maxExistent + 1;

  async function crearRonda() {
    setLoading(true);
    setError('');
    const res = await fetch(`/api/tournaments/${tournamentId}/rounds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phaseId: faseId }),
    });

    if (res.ok) {
      const data = await res.json();
      setObert(false);
      router.push(`/campionat/${tournamentId}/rondes/${data.id}`);
    } else {
      setError(await readError(res, 'Error en crear la ronda'));
      setLoading(false);
    }
  }

  if (!isDirector) return null;

  if (!obert) {
    return (
      <Button size="sm" onClick={() => setObert(true)}>
        + Ronda {propera}
      </Button>
    );
  }

  return (
    <div className="flex items-end gap-2 bg-surface border border-border rounded-xl p-3 shadow-sm">
      {fases.length > 1 && (
        <Select
          label="Fase"
          value={faseId}
          onChange={e => setFaseId(e.target.value)}
          className="min-w-40"
        >
          {fases.map(f => (
            <option key={f.id} value={f.id}>
              {f.name} (rondes {f.startRound}–{f.endRound})
            </option>
          ))}
        </Select>
      )}
      <div className="flex flex-col gap-1">
        {error && <p className="text-xs text-loss">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={crearRonda} loading={loading}>
            Crear ronda {propera}
          </Button>
          <Button variant="ghost" onClick={() => setObert(false)}>
            Cancel·lar
          </Button>
        </div>
      </div>
    </div>
  );
}
