'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
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

      <Modal open={obert} onClose={tanca} title="Nou campionat">
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
      </Modal>
    </>
  );
}
