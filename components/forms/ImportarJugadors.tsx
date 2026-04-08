'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';

interface Grup { id: string; name: string }

export default function ImportarJugadors({
  tournamentId,
  grups,
}: {
  tournamentId: string;
  grups: Grup[];
}) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [grupId, setGrupId] = useState('');
  const [resultat, setResultat] = useState<{ ok: string[]; errors: string[] } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleImport() {
    const noms = text
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    if (noms.length === 0) return;
    setLoading(true);
    setResultat(null);

    const ok: string[] = [];
    const errors: string[] = [];

    for (const nom of noms) {
      const res = await fetch(`/api/tournaments/${tournamentId}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nom, groupId: grupId || null }),
      });
      if (res.ok) ok.push(nom);
      else {
        const d = await res.json();
        errors.push(`${nom}: ${d.error ?? 'error'}`);
      }
    }

    setResultat({ ok, errors });
    setLoading(false);
    if (ok.length > 0) router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">Un nom per línia. S'ignoraran les línies buides.</p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={"Anna Garcia\nPere Mas\nMaria Llull"}
        rows={8}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {grups.length > 0 && (
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Assignar al grup</label>
          <select
            value={grupId}
            onChange={e => setGrupId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Sense grup</option>
            {grups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      )}
      <Button onClick={handleImport} loading={loading} disabled={!text.trim()}>
        Importar jugadors
      </Button>

      {resultat && (
        <div className="space-y-2">
          {resultat.ok.length > 0 && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3">
              <p className="text-sm font-medium text-green-800 mb-1">
                {resultat.ok.length} jugador{resultat.ok.length > 1 ? 's' : ''} importat{resultat.ok.length > 1 ? 's' : ''}:
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
