'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';

interface AccionsRondaProps {
  tournamentId: string;
  roundId: string;
  rondaTancada: boolean;
  teAparellaments: boolean;
  teResultats: boolean;
}

export default function AccionsRonda({
  tournamentId,
  roundId,
  rondaTancada,
  teAparellaments,
  teResultats,
}: AccionsRondaProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmEsborrar, setConfirmEsborrar] = useState(false);

  async function tancarRonda() {
    setLoading('tancar');
    await fetch(`/api/tournaments/${tournamentId}/rounds/${roundId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isComplete: true }),
    });
    setLoading(null);
    router.refresh();
  }

  async function reobrirRonda() {
    setLoading('reobrir');
    await fetch(`/api/tournaments/${tournamentId}/rounds/${roundId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isComplete: false }),
    });
    setLoading(null);
    router.refresh();
  }

  async function esborrarAparellaments() {
    setLoading('esborrar');
    await fetch(`/api/tournaments/${tournamentId}/rounds/${roundId}/import`, {
      method: 'DELETE',
    });
    setLoading(null);
    setConfirmEsborrar(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!rondaTancada && teResultats && (
        <Button
          size="sm"
          variant="secondary"
          onClick={tancarRonda}
          loading={loading === 'tancar'}
          title="Marca la ronda com a tancada (no es podran editar resultats)"
        >
          Tancar ronda
        </Button>
      )}

      {rondaTancada && (
        <Button
          size="sm"
          variant="ghost"
          onClick={reobrirRonda}
          loading={loading === 'reobrir'}
          title="Reobre la ronda per poder editar resultats"
        >
          Reobrir ronda
        </Button>
      )}

      {!rondaTancada && teAparellaments && (
        <>
          {!confirmEsborrar ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmEsborrar(true)}
              className="text-red-500 hover:text-red-700 hover:bg-red-50"
              title="Elimina tots els aparellaments per regenerar-los"
            >
              Esborrar aparellaments
            </Button>
          ) : (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              <span className="text-xs text-red-700">Segur? S&apos;esborrarà tot.</span>
              <Button
                size="sm"
                variant="danger"
                onClick={esborrarAparellaments}
                loading={loading === 'esborrar'}
              >
                Sí, esborrar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmEsborrar(false)}>
                No
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
