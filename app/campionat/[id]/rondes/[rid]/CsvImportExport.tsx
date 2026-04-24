'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';

interface Props {
  tournamentId: string;
  roundId: string;
  roundNumber: number;
  rondaTancada: boolean;
}

export default function CsvImportExport({ tournamentId, roundId, roundNumber, rondaTancada }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
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
      const data = await res.json();

      if (!res.ok) {
        setMissatge({ tipus: 'error', text: data.error ?? 'Error en importar' });
      } else {
        const extres = data.errors?.length ? ` (${data.errors.length} errors)` : '';
        setMissatge({ tipus: 'ok', text: `${data.updated} resultats importats${extres}` });
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
        <span className={`text-xs ${missatge.tipus === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
          {missatge.text}
        </span>
      )}
    </div>
  );
}

// ─── Parser CSV client-side ───────────────────────────────────────────────────

type ImportRow = {
  pairingId: string;
  p1Score: number;
  p2Score: number;
  p1Scrabbles: number | null;
  p2Scrabbles: number | null;
  p1BestWord: string | null;
  p1BestWordScore: number | null;
  p2BestWord: string | null;
  p2BestWordScore: number | null;
  location: string | null;
  comments: string | null;
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
    // id,taula,jugador1,jugador2,punts_j1,punts_j2,bingos_j1,bingos_j2,
    // millor_j1,pts_millor_j1,millor_j2,pts_millor_j2,localitat,comentaris
    const [id, , , , p1Str, p2Str, p1ScrStr, p2ScrStr, p1Word, p1WordPts, p2Word, p2WordPts, location, comments] = parts;

    if (!id) continue;
    if (p1Str === 'bye' || p2Str === '') continue; // saltem byes i files sense jugador2

    const p1Score = parseInt(p1Str, 10);
    const p2Score = parseInt(p2Str, 10);

    if (isNaN(p1Score) || isNaN(p2Score)) {
      errors.push(`Línia ${i + 1}: puntuacions invàlides ("${p1Str}", "${p2Str}")`);
      continue;
    }

    rows.push({
      pairingId: id,
      p1Score,
      p2Score,
      p1Scrabbles: p1ScrStr ? parseInt(p1ScrStr, 10) || null : null,
      p2Scrabbles: p2ScrStr ? parseInt(p2ScrStr, 10) || null : null,
      p1BestWord: p1Word || null,
      p1BestWordScore: p1WordPts ? parseInt(p1WordPts, 10) || null : null,
      p2BestWord: p2Word || null,
      p2BestWordScore: p2WordPts ? parseInt(p2WordPts, 10) || null : null,
      location: location || null,
      comments: comments || null,
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