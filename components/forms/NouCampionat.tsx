'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function NouCampionat() {
  const router = useRouter();
  const [obert, setObert] = useState(false);
  const [nom, setNom] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      const data = await res.json();
      setError(data.error ?? 'Error en crear el campionat');
      setLoading(false);
    }
  }

  if (!obert) {
    return (
      <Button onClick={() => setObert(true)}>
        + Nou campionat
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-4 flex gap-3 items-end shadow-sm">
      <div className="flex-1">
        <Input
          label="Nom del campionat"
          value={nom}
          onChange={e => setNom(e.target.value)}
          placeholder="ex. ManaCup 25-26"
          error={error}
          autoFocus
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" loading={loading} disabled={!nom.trim()}>
          Crear
        </Button>
        <Button type="button" variant="ghost" onClick={() => { setObert(false); setNom(''); setError(''); }}>
          Cancel·lar
        </Button>
      </div>
    </form>
  );
}
