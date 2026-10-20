'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { readError } from '@/lib/http';

export interface Sollicitud {
  id: string;
  displayName: string;
  club: string | null;
  barrufNumero: number | null;
  /** Ho ha demanat des d'un compte de l'aplicació, no amb un nom escrit. */
  ambCompte: boolean;
}

/**
 * Les sol·licituds d'inscripció pendents, per a qui gestiona la competició.
 * Acceptar-ne una la converteix en inscripció; la resta de vies d'alta
 * (afegir ràpid, importar CSV) segueixen funcionant igual.
 */
export default function SollicitudsInscripcio({
  tournamentId,
  sollicituds,
}: {
  tournamentId: string;
  sollicituds: Sollicitud[];
}) {
  const router = useRouter();
  const [ocupat, setOcupat] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (sollicituds.length === 0) return null;

  async function resol(ids: string[], action: 'accept' | 'reject') {
    setError('');
    for (const id of ids) {
      setOcupat(id);
      const res = await fetch(`/api/tournaments/${tournamentId}/registrations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        setError(await readError(res, 'Error en desar'));
        break;
      }
    }
    setOcupat(null);
    router.refresh();
  }

  return (
    <Card padding={false}>
      <div className="px-4 pt-3.5 pb-2 flex items-center gap-2">
        <div className="flex-1">
          <CardTitle>Sol·licituds d&apos;inscripció ({sollicituds.length})</CardTitle>
        </div>
        {sollicituds.length > 1 && (
          <Button size="sm" variant="secondary" disabled={ocupat !== null} onClick={() => resol(sollicituds.map((s) => s.id), 'accept')}>
            Accepta-les totes
          </Button>
        )}
      </div>
      <ul className="divide-y divide-border">
        {sollicituds.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink truncate">{s.displayName}</p>
              <p className="text-xs text-ink-3">
                {[
                  s.ambCompte ? 'Té compte' : null,
                  s.barrufNumero != null ? `BARRUF #${s.barrufNumero}` : 'Sense vincular al BARRUF',
                  s.club,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <Button size="sm" loading={ocupat === s.id} disabled={ocupat !== null} onClick={() => resol([s.id], 'accept')}>
              Accepta
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-loss hover:bg-loss-tint"
              disabled={ocupat !== null}
              onClick={() => resol([s.id], 'reject')}
            >
              Rebutja
            </Button>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-loss px-4 pb-3">{error}</p>}
    </Card>
  );
}
