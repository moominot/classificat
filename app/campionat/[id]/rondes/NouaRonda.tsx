'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { useCanManage } from '@/components/ViewerContext';
import { readError } from '@/lib/http';
import type { PhaseConfig } from '@/db/types';
import { returnLegNumber } from '@/lib/return-leg';

interface Fase { id: string; name: string; startRound: number; endRound: number; order: number; config: PhaseConfig }

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
  const canManage = useCanManage();
  const [obert, setObert] = useState(false);
  // Calcula el pròxim número de ronda disponible
  const maxExistent = rondesExistents.length > 0 ? Math.max(...rondesExistents) : 0;
  const propera = maxExistent + 1;

  // Per defecte, la fase on cau la ronda que toca.
  const [faseId, setFaseId] = useState(
    (fases.find(f => propera >= f.startRound && propera <= f.endRound) ?? fases[0])?.id ?? ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fase = fases.find(f => f.id === faseId);
  const tornada = fase ? returnLegNumber(fase, propera) : null;

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

  if (!canManage) return null;

  return (
    <>
      <Button size="sm" onClick={() => setObert(true)}>
        + Ronda {propera}
      </Button>

      <Modal open={obert} onClose={() => setObert(false)} title={`Crear ronda ${propera}`}>
        <div className="space-y-4">
          {fases.length > 1 && (
            <Select
              label="Fase"
              value={faseId}
              onChange={e => setFaseId(e.target.value)}
            >
              {fases.map(f => (
                <option key={f.id} value={f.id}>
                  {f.name} (rondes {f.startRound}–{f.endRound})
                </option>
              ))}
            </Select>
          )}
          {tornada !== null && (
            <div className="rounded-lg bg-accent-tint border border-accent px-4 py-3 text-sm text-accent-ink">
              Aquesta fase és d&apos;anada i tornada: es crearan de cop les rondes {propera} i {tornada}. En generar
              els aparellaments de l&apos;anada es generaran també els de la tornada, amb les mateixes parelles i els
              seients girats.
            </div>
          )}
          {error && <p className="text-sm text-loss">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button onClick={crearRonda} loading={loading} className="flex-1 sm:flex-none">
              {tornada !== null ? `Crear rondes ${propera} i ${tornada}` : `Crear ronda ${propera}`}
            </Button>
            <Button variant="ghost" onClick={() => setObert(false)}>
              Cancel·lar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
