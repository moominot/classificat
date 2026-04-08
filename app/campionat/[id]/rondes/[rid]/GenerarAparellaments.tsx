'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { PairingWarning } from '@/lib/pairing/types';

export default function GenerarAparellaments({
  tournamentId,
  roundId,
  roundNumber,
}: {
  tournamentId: string;
  roundId: string;
  roundNumber: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [warnings, setWarnings] = useState<PairingWarning[]>([]);
  const [error, setError] = useState('');

  async function generar() {
    setLoading(true);
    setError('');
    setWarnings([]);

    const res = await fetch(
      `/api/tournaments/${tournamentId}/rounds/${roundId}/generate`,
      { method: 'POST' }
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

  return (
    <Card>
      <div className="flex flex-col items-center text-center gap-4 py-4">
        <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
          <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Generar aparellaments</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-xs">
            El motor generarà els aparellaments per a la ronda {roundNumber} segons la configuració de la fase.
          </p>
        </div>

        {error && (
          <div className="w-full rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 text-left">
            {error}
          </div>
        )}
        {warnings.length > 0 && (
          <div className="w-full rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 text-left space-y-1">
            {warnings.map((w, i) => <p key={i}>⚠ {w.message}</p>)}
          </div>
        )}

        <Button onClick={generar} loading={loading}>
          Generar aparellaments
        </Button>
      </div>
    </Card>
  );
}
