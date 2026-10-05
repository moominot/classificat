'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { useCanManage } from '@/components/ViewerContext';
import { readError } from '@/lib/http';

interface Props {
  tournamentId: string;
  roundId: string;
  roundNumber: number;
  rondaTancada: boolean;
}

/**
 * Format ample (docs a app/api/.../csv/route.ts): una fila per partida, amb
 * un bloc de columnes per jugador (nom, idBARRUF, punts, preguntes pròpies)
 * i les preguntes comunes de partida al final. El parsing es fa al servidor
 * perquè les columnes depenen de les preguntes configurades — aquí només es
 * llegeix el fitxer i es reenvia tal qual.
 */
export default function CsvImportExport({ tournamentId, roundId, roundNumber, rondaTancada }: Props) {
  const router = useRouter();
  const canManage = useCanManage();
  const fileRef = useRef<HTMLInputElement>(null);

  if (!canManage) return null;
  const [importing, setImporting] = useState(false);
  const [missatge, setMissatge] = useState<{ tipus: 'ok' | 'error'; text: string } | null>(null);

  function handleExport() {
    window.location.href = `/api/tournaments/${tournamentId}/rounds/${roundId}/csv`;
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setMissatge(null);

    try {
      const csv = await file.text();
      const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${roundId}/csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      if (!res.ok) {
        setMissatge({ tipus: 'error', text: await readError(res, 'Error en importar') });
      } else {
        const data = await res.json();
        const extres = data.errors?.length ? ` (${data.errors.length} errors)` : '';
        setMissatge({ tipus: 'ok', text: `${data.updated} partides actualitzades${extres}` });
        router.refresh();
      }
    } catch {
      setMissatge({ tipus: 'error', text: 'Error llegint el fitxer' });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" onClick={handleExport} title={`Descarrega la ronda ${roundNumber} en CSV`}>
        ↓ Exportar CSV
      </Button>

      {!rondaTancada && (
        <>
          <Button
            variant="secondary"
            size="sm"
            loading={importing}
            onClick={() => fileRef.current?.click()}
            title="Importa resultats des d'un CSV exportat prèviament"
          >
            ↑ Importar resultats
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleImport}
          />
        </>
      )}

      {missatge && (
        <span className={`text-xs ${missatge.tipus === 'ok' ? 'text-win' : 'text-loss'}`}>
          {missatge.text}
        </span>
      )}
    </div>
  );
}
