'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { useCanManage } from '@/components/ViewerContext';
import type { RoundStatus } from '@/db/types';

interface AccionsRondaProps {
  tournamentId: string;
  roundId: string;
  estat: RoundStatus;
  teAparellaments: boolean;
  teResultats: boolean;
}

/**
 * Els interruptors de la ronda (docs/pla-rols.md §8.5).
 *
 * Els tres estats són explícits: en esborrany la ronda no existeix per als
 * jugadors, oberta accepta resultats i tancada els bloqueja —per als
 * jugadors, no per a l'admin, que pot corregir sempre (§15.7).
 */
export default function AccionsRonda({
  tournamentId,
  roundId,
  estat,
  teAparellaments,
  teResultats,
}: AccionsRondaProps) {
  const router = useRouter();
  const canManage = useCanManage();
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmEsborrar, setConfirmEsborrar] = useState(false);

  if (!canManage) return null;

  async function canviarEstat(status: RoundStatus, etiqueta: string) {
    setLoading(etiqueta);
    await fetch(`/api/tournaments/${tournamentId}/rounds/${roundId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setLoading(null);
    router.refresh();
  }

  async function esborrarAparellaments() {
    setLoading('esborrar');
    await fetch(`/api/tournaments/${tournamentId}/rounds/${roundId}/import`, { method: 'DELETE' });
    setLoading(null);
    setConfirmEsborrar(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {estat === 'draft' && teAparellaments && (
        <Button
          size="sm"
          onClick={() => canviarEstat('open', 'publicar')}
          loading={loading === 'publicar'}
          title="Els jugadors veuran la ronda i podran enviar resultats"
        >
          Publica la ronda
        </Button>
      )}

      {estat === 'open' && teResultats && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => canviarEstat('closed', 'tancar')}
          loading={loading === 'tancar'}
          title="Els jugadors ja no podran editar resultats"
        >
          Tanca la ronda
        </Button>
      )}

      {estat === 'closed' && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => canviarEstat('open', 'reobrir')}
          loading={loading === 'reobrir'}
          title="Torna a permetre que els jugadors editin els resultats"
        >
          Reobre la ronda
        </Button>
      )}

      {estat !== 'closed' && teAparellaments && (
        <>
          {!confirmEsborrar ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmEsborrar(true)}
              className="text-loss hover:text-loss hover:bg-loss-tint"
              title="Elimina tots els aparellaments per regenerar-los"
            >
              Esborra els aparellaments
            </Button>
          ) : (
            <div className="flex items-center gap-2 bg-loss-tint border border-loss rounded-lg px-3 py-1.5">
              <span className="text-xs text-loss">Segur? S&apos;esborrarà tot.</span>
              <Button
                size="sm"
                variant="danger"
                onClick={esborrarAparellaments}
                loading={loading === 'esborrar'}
              >
                Sí, esborra
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
