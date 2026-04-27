'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';

interface Grup { id: string; name: string }

interface FilaCSV {
  nom: string;
  elo: number | null;
  grupNom: string | null;
  club: string | null;
  phone: string | null;
}

function parseLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { cols.push(cur); cur = ''; continue; }
    cur += ch;
  }
  cols.push(cur);
  return cols;
}

function parseCSV(text: string): FilaCSV[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const firstLower = lines[0].toLowerCase();
  const hasHeader = firstLower.startsWith('nom') || firstLower.startsWith('name') || firstLower.includes(',elo') || firstLower.includes(',barruf');
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.flatMap(line => {
    const cols = parseLine(line);
    const nom = cols[0]?.trim() ?? '';
    if (!nom) return [];
    const eloRaw = parseInt(cols[1]?.trim() ?? '');
    const elo = isNaN(eloRaw) ? null : eloRaw;
    const grupNom = cols[2]?.trim() || null;
    const club = cols[3]?.trim() || null;
    const phone = cols[4]?.trim() || null;
    return [{ nom, elo, grupNom, club, phone }];
  });
}

export default function ImportarJugadors({ tournamentId, grups }: { tournamentId: string; grups: Grup[] }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<FilaCSV[]>([]);
  const [resultat, setResultat] = useState<{ ok: string[]; errors: string[]; grupsCreats: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleText(val: string) {
    setText(val);
    setFiles(parseCSV(val));
    setResultat(null);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const content = ev.target?.result as string;
      setText(content);
      setFiles(parseCSV(content));
      setResultat(null);
    };
    reader.readAsText(file, 'UTF-8');
  }

  // Returns the unique group names in the CSV that don't already exist
  function newGroupNames(): string[] {
    const existingNames = new Set(grups.map(g => g.name.toLowerCase().trim()));
    const seen = new Set<string>();
    const result: string[] = [];
    for (const f of files) {
      if (!f.grupNom) continue;
      const key = f.grupNom.toLowerCase().trim();
      if (!existingNames.has(key) && !seen.has(key)) {
        seen.add(key);
        result.push(f.grupNom.trim());
      }
    }
    return result;
  }

  async function handleImport() {
    if (files.length === 0) return;
    setLoading(true);
    setResultat(null);

    const ok: string[] = [];
    const errors: string[] = [];
    const grupsCreats: string[] = [];

    // Build a working map of group name → id from existing groups
    const grupMap = new Map<string, string>(grups.map(g => [g.name.toLowerCase().trim(), g.id]));

    // Create missing groups first
    for (const nom of newGroupNames()) {
      const res = await fetch(`/api/tournaments/${tournamentId}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nom }),
      });
      if (res.ok) {
        const g = await res.json();
        grupMap.set(nom.toLowerCase().trim(), g.id);
        grupsCreats.push(nom);
      } else {
        errors.push(`Grup "${nom}": no s'ha pogut crear`);
      }
    }

    // Import players
    for (const fila of files) {
      const grupId = fila.grupNom ? (grupMap.get(fila.grupNom.toLowerCase().trim()) ?? null) : null;
      const res = await fetch(`/api/tournaments/${tournamentId}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fila.nom,
          rating: fila.elo,
          groupId: grupId,
          club: fila.club,
          phone: fila.phone,
        }),
      });
      if (res.ok) ok.push(fila.nom);
      else {
        const d = await res.json();
        errors.push(`${fila.nom}: ${d.error ?? 'error'}`);
      }
    }

    setResultat({ ok, errors, grupsCreats });
    setLoading(false);
    if (ok.length > 0 || grupsCreats.length > 0) router.refresh();
  }

  const nouGrups = newGroupNames();

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
        <p className="font-medium mb-1">Format CSV esperat:</p>
        <code className="block text-xs font-mono mt-1 text-blue-900">nom,barruf,grup,club,telèfon</code>
        <code className="block text-xs font-mono text-blue-900">Anna Garcia,1500,A,Club BCN,612345678</code>
        <code className="block text-xs font-mono text-blue-900">Pere Mas,,B,,</code>
        <code className="block text-xs font-mono text-blue-900">Maria Llull,1200,,,</code>
        <p className="mt-2 text-xs text-blue-600">
          Totes les columnes excepte <em>nom</em> són opcionals. La capçalera és opcional.
          Els grups nous es creen automàticament.
          {grups.length > 0 && (
            <> Grups existents: {grups.map(g => g.name).join(', ')}.</>
          )}
        </p>
      </div>

      <div className="flex gap-2 items-center">
        <input ref={inputRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
        <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
          Triar fitxer CSV
        </Button>
        {text && (
          <button
            onClick={() => { setText(''); setFiles([]); setResultat(null); }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Esborrar
          </button>
        )}
      </div>

      <textarea
        value={text}
        onChange={e => handleText(e.target.value)}
        placeholder={"nom,barruf,grup,club,telèfon\nAnna Garcia,1500,A,Club BCN,612345678\nPere Mas,,B,,\nMaria Llull,1200,,,"}
        rows={6}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {files.length > 0 && !resultat && (
        <div className="rounded-lg border border-gray-200 overflow-hidden text-sm">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 flex items-center gap-2">
            <span>{files.length} jugador{files.length !== 1 ? 's' : ''} detectat{files.length !== 1 ? 's' : ''}</span>
            {nouGrups.length > 0 && (
              <span className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                Grups nous: {nouGrups.join(', ')}
              </span>
            )}
          </div>
          <ul className="divide-y divide-gray-100 max-h-56 overflow-y-auto">
            {files.map((f, i) => (
              <li key={i} className="flex gap-3 px-3 py-2 text-xs text-gray-600 flex-wrap">
                <span className="font-medium text-gray-900 flex-1 min-w-0">{f.nom}</span>
                {f.elo != null && <span className="text-gray-400">BARRUF {f.elo}</span>}
                {f.grupNom && (
                  <span className={nouGrups.includes(f.grupNom) ? 'text-amber-700 font-medium' : 'text-gray-400'}>
                    Grup {f.grupNom}{nouGrups.includes(f.grupNom) ? ' (nou)' : ''}
                  </span>
                )}
                {f.club && <span className="text-gray-400">{f.club}</span>}
                {f.phone && <span className="text-gray-400">{f.phone}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button onClick={handleImport} loading={loading} disabled={files.length === 0}>
        Importar {files.length > 0 ? `${files.length} jugador${files.length !== 1 ? 's' : ''}` : 'jugadors'}
        {nouGrups.length > 0 && ` + ${nouGrups.length} grup${nouGrups.length !== 1 ? 's' : ''}`}
      </Button>

      {resultat && (
        <div className="space-y-2">
          {resultat.grupsCreats.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-sm font-medium text-amber-800 mb-1">
                {resultat.grupsCreats.length} grup{resultat.grupsCreats.length !== 1 ? 's' : ''} creat{resultat.grupsCreats.length !== 1 ? 's' : ''}:
              </p>
              <ul className="text-sm text-amber-700 space-y-0.5">
                {resultat.grupsCreats.map(n => <li key={n}>+ {n}</li>)}
              </ul>
            </div>
          )}
          {resultat.ok.length > 0 && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3">
              <p className="text-sm font-medium text-green-800 mb-1">
                {resultat.ok.length} jugador{resultat.ok.length !== 1 ? 's' : ''} importat{resultat.ok.length !== 1 ? 's' : ''}:
              </p>
              <ul className="text-sm text-green-700 space-y-0.5">
                {resultat.ok.map(n => <li key={n}>✓ {n}</li>)}
              </ul>
            </div>
          )}
          {resultat.errors.length > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-sm font-medium text-red-800 mb-1">Errors:</p>
              <ul className="text-sm text-red-700 space-y-0.5">
                {resultat.errors.map((e, i) => <li key={i}>✗ {e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
