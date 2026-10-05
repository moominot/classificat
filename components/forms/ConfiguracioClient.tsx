'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { readError } from '@/lib/http';

export default function ConfiguracioClient({
  barrufApiUrl,
  barrufApiKeyConfigured,
}: {
  barrufApiUrl: string;
  barrufApiKeyConfigured: boolean;
}) {
  const router = useRouter();
  const [apiUrl, setApiUrl] = useState(barrufApiUrl);
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const [test, setTest] = useState<{ status: 'idle' | 'loading' | 'ok' | 'error'; message?: string }>({
    status: 'idle',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSaved(false);

    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barrufApiUrl: apiUrl.trim(), barrufApiKey: apiKey.trim() || undefined }),
    });

    if (res.ok) {
      setApiKey('');
      setSaved(true);
      router.refresh();
    } else {
      setError(await readError(res, 'Error en desar la configuració'));
    }
    setLoading(false);
  }

  async function handleTest() {
    setTest({ status: 'loading' });
    const base = apiUrl.trim().replace(/\/+$/, '');
    if (!base) {
      setTest({ status: 'error', message: "Cal l'adreça de l'API" });
      return;
    }
    try {
      const res = await fetch(`${base}/barruf`);
      if (!res.ok) {
        setTest({ status: 'error', message: `L'adreça respon amb un error (${res.status})` });
        return;
      }
      const data = await res.json();
      setTest({
        status: 'ok',
        message: `Edició ${data.edicio} · temporada ${data.temporada} (${data.jugadors?.length ?? 0} jugadors)`,
      });
    } catch {
      setTest({ status: 'error', message: 'No s\'ha pogut connectar amb aquesta adreça' });
    }
  }

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Configuració</h1>
        <p className="text-sm text-ink-3 mt-1">Ajustos d&apos;abast general de l&apos;aplicació.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Connexió amb el BARRUF</CardTitle></CardHeader>
        <p className="text-sm text-ink-3 -mt-2 mb-4">
          Permet cercar jugadors del registre del BARRUF en donar-los d&apos;alta a un campionat, i
          enviar-hi els resultats perquè un gestor els revisi. La clau es crea des de
          <span className="font-medium text-ink-2"> Gestió › Connexions</span> al programa del BARRUF.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Adreça de l'API"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://.../api/v1"
          />
          <Input
            label="Clau d'aplicació"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={barrufApiKeyConfigured ? '•••••••• (configurada — deixa-ho en blanc per no canviar-la)' : 'barruf_…'}
          />

          {error && <p className="text-sm text-loss">{error}</p>}
          {saved && <p className="text-sm text-win">Configuració desada.</p>}

          <div className="flex items-center gap-2 flex-wrap">
            <Button type="submit" loading={loading}>Desa</Button>
            <Button type="button" variant="secondary" onClick={handleTest} loading={test.status === 'loading'}>
              Prova la connexió
            </Button>
          </div>

          {test.status === 'ok' && <p className="text-sm text-win">{test.message}</p>}
          {test.status === 'error' && <p className="text-sm text-loss">{test.message}</p>}
        </form>
      </Card>
    </div>
  );
}
