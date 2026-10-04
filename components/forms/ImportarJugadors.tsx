'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { readError } from '@/lib/http';

interface FilaCSV {
  nom: string;
  elo: number | null;
  etiquetes: string[];
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
    // Diverses etiquetes en una cel·la, separades per ";" (el club no deixa
    // de ser-ne una més: "Club Nord;Sub-16" hi encaixa igual).
    const etiquetes = (cols[2] ?? '').split(';').map(e => e.trim()).filter(Boolean);
    const club = cols[3]?.trim() || null;
    const phone = cols[4]?.trim() || null;
    return [{ nom, elo, etiquetes, club, phone }];
  });
}

export default function ImportarJugadors({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<FilaCSV[]>([]);
  const [resultat, setResultat] = useState<{ ok: string[]; errors: string[]; tagsCreades: string[] } | null>(null);
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

  function totesLesEtiquetes(): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const f of files) {
      for (const nom of f.etiquetes) {
        const key = nom.toLowerCase();
        if (!seen.has(key)) { seen.add(key); result.push(nom); }
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
    const tagsCreades: string[] = [];

    // L'API ja és idempotent (torna l'etiqueta existent si el nom coincideix),
    // així que no cal saber d'entrada quines ja existien.
    const tagMap = new Map<string, string>();
    for (const nom of totesLesEtiquetes()) {
      const res = await fetch(`/api/tournaments/${tournamentId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nom }),
      });
      if (res.ok) {
        const t = await res.json();
        tagMap.set(nom.toLowerCase(), t.id);
        if (res.status === 201) tagsCreades.push(nom);
      } else {
        errors.push(`Etiqueta "${nom}": no s'ha pogut crear`);
      }
    }

    for (const fila of files) {
      const tagIds = fila.etiquetes.map(nom => tagMap.get(nom.toLowerCase())).filter((id): id is string => !!id);
      const res = await fetch(`/api/tournaments/${tournamentId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: fila.nom,
          rating: fila.elo,
          tagIds,
          club: fila.club,
          phone: fila.phone,
        }),
      });
      if (res.ok) ok.push(fila.nom);
      else {
        errors.push(`${fila.nom}: ${await readError(res, 'error')}`);
      }
    }

    setResultat({ ok, errors, tagsCreades });
    setLoading(false);
    if (ok.length > 0 || tagsCreades.length > 0) router.refresh();
  }

  const novesEtiquetes = totesLesEtiquetes();

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-accent-tint border border-accent p-3 text-sm text-accent-ink">
        <p className="font-medium mb-1">Format CSV esperat:</p>
        <code className="block text-xs font-mono mt-1 text-accent-ink">nom,barruf,etiquetes,club,telèfon</code>
        <code className="block text-xs font-mono text-accent-ink">Anna Garcia,1500,Club Nord;Sub-16,Club BCN,612345678</code>
        <code className="block text-xs font-mono text-accent-ink">Pere Mas,,Club Sud,,</code>
        <code className="block text-xs font-mono text-accent-ink">Maria Llull,1200,,,</code>
        <p className="mt-2 text-xs text-accent-ink">
          Totes les columnes excepte <em>nom</em> són opcionals. La capçalera és opcional.
          Diverses etiquetes en una cel·la se separen amb &quot;;&quot;. Les etiquetes noves es creen automàticament.
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
            className="text-xs text-ink-3 hover:text-ink-2"
          >
            Esborrar
          </button>
        )}
      </div>

      <textarea
        value={text}
        onChange={e => handleText(e.target.value)}
        placeholder={"nom,barruf,etiquetes,club,telèfon\nAnna Garcia,1500,Club Nord;Sub-16,Club BCN,612345678\nPere Mas,,Club Sud,,\nMaria Llull,1200,,,"}
        rows={6}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent"
      />

      {files.length > 0 && !resultat && (
        <div className="rounded-lg border border-border overflow-hidden text-sm">
          <div className="px-3 py-2 bg-surface-2 border-b border-border text-xs font-medium text-ink-3 flex items-center gap-2">
            <span>{files.length} jugador{files.length !== 1 ? 's' : ''} detectat{files.length !== 1 ? 's' : ''}</span>
            {novesEtiquetes.length > 0 && (
              <span className="text-accent-ink bg-accent-tint border border-accent rounded px-2 py-0.5">
                Etiquetes: {novesEtiquetes.join(', ')}
              </span>
            )}
          </div>
          <ul className="divide-y divide-border max-h-56 overflow-y-auto">
            {files.map((f, i) => (
              <li key={i} className="flex gap-3 px-3 py-2 text-xs text-ink-2 flex-wrap">
                <span className="font-medium text-ink flex-1 min-w-0">{f.nom}</span>
                {f.elo != null && <span className="text-ink-3">BARRUF {f.elo}</span>}
                {f.etiquetes.map(nom => (
                  <span key={nom} className="text-accent-ink">{nom}</span>
                ))}
                {f.club && <span className="text-ink-3">{f.club}</span>}
                {f.phone && <span className="text-ink-3">{f.phone}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button onClick={handleImport} loading={loading} disabled={files.length === 0}>
        Importar {files.length > 0 ? `${files.length} jugador${files.length !== 1 ? 's' : ''}` : 'jugadors'}
      </Button>

      {resultat && (
        <div className="space-y-2">
          {resultat.tagsCreades.length > 0 && (
            <div className="rounded-lg bg-accent-tint border border-accent p-3">
              <p className="text-sm font-medium text-accent-ink mb-1">
                {resultat.tagsCreades.length} etiqueta{resultat.tagsCreades.length !== 1 ? 'es' : ''} creada{resultat.tagsCreades.length !== 1 ? 'es' : ''}:
              </p>
              <ul className="text-sm text-accent-ink space-y-0.5">
                {resultat.tagsCreades.map(n => <li key={n}>+ {n}</li>)}
              </ul>
            </div>
          )}
          {resultat.ok.length > 0 && (
            <div className="rounded-lg bg-win-tint border border-win p-3">
              <p className="text-sm font-medium text-win mb-1">
                {resultat.ok.length} jugador{resultat.ok.length !== 1 ? 's' : ''} importat{resultat.ok.length !== 1 ? 's' : ''}:
              </p>
              <ul className="text-sm text-win space-y-0.5">
                {resultat.ok.map(n => <li key={n}>✓ {n}</li>)}
              </ul>
            </div>
          )}
          {resultat.errors.length > 0 && (
            <div className="rounded-lg bg-loss-tint border border-loss p-3">
              <p className="text-sm font-medium text-loss mb-1">Errors:</p>
              <ul className="text-sm text-loss space-y-0.5">
                {resultat.errors.map((e, i) => <li key={i}>✗ {e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
