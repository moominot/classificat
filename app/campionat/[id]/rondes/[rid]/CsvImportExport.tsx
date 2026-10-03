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
 * Format llarg (docs a app/api/.../csv/route.ts): una fila per participant,
 * perquè amb taules de N jugadors no hi ha columnes fixes per "jugador 2".
 *   partida,taula,jugador,jugador_id,puntuacio,posicio,localitat,comentaris
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
      const text = await file.text();
      const { rows, errors } = parseCsvResults(text);

      if (errors.length > 0) {
        setMissatge({ tipus: 'error', text: errors.join(' · ') });
        return;
      }
      if (rows.length === 0) {
        setMissatge({ tipus: 'error', text: "No s'han trobat resultats al CSV" });
        return;
      }

      const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${roundId}/csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows),
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

// ─── Parser CSV client-side ───────────────────────────────────────────────────

type ImportRow = {
  matchId: string;
  entryId: string;
  score: number | null;
  rank: number | null;
};

function parseCsvResults(csvText: string): { rows: ImportRow[]; errors: string[] } {
  const lines = csvText.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  const errors: string[] = [];
  const rows: ImportRow[] = [];

  if (lines.length < 2) {
    errors.push('El CSV és buit o no té dades');
    return { rows, errors };
  }

  // Salta la capçalera (primera línia)
  for (let i = 1; i < lines.length; i++) {
    const parts = parseLine(lines[i]);
    // partida,taula,jugador,jugador_id,puntuacio,posicio,localitat,comentaris
    const [matchId, , , entryId, scoreStr, rankStr] = parts;

    if (!matchId || !entryId) continue;

    const score = scoreStr ? parseInt(scoreStr, 10) : NaN;
    const rank = rankStr ? parseInt(rankStr, 10) : NaN;

    if (isNaN(score) && isNaN(rank)) {
      // Fila de bye o sense resultat encara: se salta sense avisar.
      continue;
    }

    rows.push({
      matchId,
      entryId,
      score: isNaN(score) ? null : score,
      rank: isNaN(rank) ? null : rank,
    });
  }

  return { rows, errors };
}

function parseLine(line: string): string[] {
  const result: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      let val = '';
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else { val += line[i++]; }
      }
      result.push(val);
      if (line[i] === ',') i++;
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) { result.push(line.slice(i)); break; }
      result.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return result;
}
