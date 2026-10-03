'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { readError } from '@/lib/http';

export default function NouCampionat() {
  const router = useRouter();
  const [obert, setObert] = useState(false);
  const [nom, setNom] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function tanca() {
    setObert(false);
    setNom('');
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim()) return;
    setLoading(true);
    setError('');

    const res = await fetch('/api/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nom.trim() }),
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/campionat/${data.id}/jugadors`);
    } else {
      setError(await readError(res, 'Error en crear el campionat'));
      setLoading(false);
    }
  }

  return (
    <>
      <Button onClick={() => setObert(true)}>
        + Nou campionat
      </Button>

      {obert && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={tanca} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="nou-campionat-titol"
            className="relative bg-surface w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-5 sm:p-6 max-h-[92vh] sm:max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 id="nou-campionat-titol" className="font-display text-lg font-bold text-ink">Nou campionat</h2>
              <button
                type="button"
                onClick={tanca}
                className="text-ink-3 hover:text-ink text-2xl leading-none cursor-pointer p-1 -m-1"
                aria-label="Tanca"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Nom del campionat"
                value={nom}
                onChange={e => setNom(e.target.value)}
                placeholder="ex. ManaCup 25-26"
                error={error}
                autoFocus
              />
              <div className="flex gap-2 pt-1">
                <Button type="submit" loading={loading} disabled={!nom.trim()} className="flex-1 sm:flex-none">
                  Crear
                </Button>
                <Button type="button" variant="ghost" onClick={tanca}>
                  Cancel·lar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
