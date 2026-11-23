'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { readError } from '@/lib/http';

export default function ConfiguracioClient({
  barrufApiUrl,
  barrufApiKeyConfigured,
  isSuperadmin,
}: {
  barrufApiUrl: string;
  barrufApiKeyConfigured: boolean;
  isSuperadmin: boolean;
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

  const fileRef = useRef<HTMLInputElement>(null);
  const [dbState, setDbState] = useState<{ status: 'idle' | 'loading' | 'restarting' | 'error'; message?: string }>({
    status: 'idle',
  });

  /** Espera que l'app tornï a respondre després del reinici i va a l'entrada. */
  async function waitForRestart() {
    setDbState({ status: 'restarting', message: "Base de dades importada. L'aplicació es reinicia…" });
    await new Promise((r) => setTimeout(r, 2500));
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch('/login', { cache: 'no-store' });
        if (res.ok) {
          window.location.href = '/login';
          return;
        }
      } catch {
        // encara reiniciant-se
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    setDbState({
      status: 'error',
      message: "L'aplicació no ha tornat a respondre. Si no corre amb reinici automàtic (Docker), arrenca-la a mà.",
    });
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const ok = window.confirm(
      `Importar "${file.name}" SUBSTITUIRÀ totes les dades actuals (competicions, comptes, resultats) ` +
        `i reiniciarà l'aplicació. Se'n fa una còpia automàtica de l'actual al servidor.\n\nVols continuar?`
    );
    if (!ok) return;

    setDbState({ status: 'loading' });
    try {
      const res = await fetch('/api/database/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
      });
      if (!res.ok) {
        setDbState({ status: 'error', message: await readError(res, "No s'ha pogut importar la base de dades") });
        return;
      }
    } catch {
      setDbState({ status: 'error', message: "No s'ha pogut enviar el fitxer" });
      return;
    }
    await waitForRestart();
  }

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

      {isSuperadmin && (
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
      )}

      <Card>
        <CardHeader><CardTitle>Còpia de seguretat de la base de dades</CardTitle></CardHeader>
        <p className="text-sm text-ink-3 -mt-2 mb-4">
          Exporta tota la base de dades en un fitxer, o importa'n una per substituir l&apos;actual
          (p. ex. en passar a un altre ordinador). Les imatges pujades no hi van incloses. El fitxer
          conté els comptes i la clau del BARRUF: guarda&apos;l amb cura.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <a href="/api/database/export" download>
            <Button type="button" variant="secondary">Exporta la BD</Button>
          </a>
          <Button
            type="button"
            variant="danger"
            loading={dbState.status === 'loading'}
            disabled={dbState.status === 'restarting'}
            onClick={() => fileRef.current?.click()}
          >
            Importa una BD…
          </Button>
          <input ref={fileRef} type="file" accept=".db,.sqlite,.sqlite3" className="hidden" onChange={handleImport} />
        </div>
        {dbState.status === 'restarting' && <p className="text-sm text-win mt-3">{dbState.message}</p>}
        {dbState.status === 'error' && <p className="text-sm text-loss mt-3">{dbState.message}</p>}
      </Card>
    </div>
  );
}
