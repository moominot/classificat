'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { readError } from '@/lib/http';

interface Director {
  id: string;
  username: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export default function DirectorsClient({
  directors,
  currentDirectorId,
}: {
  directors: Director[];
  currentDirectorId: string | undefined;
}) {
  const router = useRouter();
  const [obert, setObert] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Gestió d&apos;usuaris</h1>
          <p className="text-sm text-ink-3 mt-1">Comptes de director amb accés a l&apos;aplicació.</p>
        </div>
        <Button onClick={() => setObert(o => !o)}>{obert ? 'Cancel·la' : 'Afegeix director'}</Button>
      </div>

      {obert && <NouDirectorForm onDone={() => { setObert(false); router.refresh(); }} />}

      <Card padding={false}>
        <ul className="divide-y divide-border">
          {directors.map(d => (
            <DirectorRow key={d.id} director={d} isSelf={d.id === currentDirectorId} onChanged={() => router.refresh()} />
          ))}
        </ul>
      </Card>
    </div>
  );
}

function NouDirectorForm({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/directors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, name, password }),
    });
    if (res.ok) {
      onDone();
    } else {
      setError(await readError(res, 'Error en crear el director'));
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Nou director</CardTitle></CardHeader>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="Nom" value={name} onChange={e => setName(e.target.value)} required />
          <Input label="Usuari" value={username} onChange={e => setUsername(e.target.value)} required />
          <Input label="Contrasenya" type="password" value={password} onChange={e => setPassword(e.target.value)} required hint="Mínim 6 caràcters" />
        </div>
        {error && <p className="text-sm text-loss">{error}</p>}
        <Button type="submit" loading={loading}>Crea el director</Button>
      </form>
    </Card>
  );
}

function DirectorRow({
  director, isSelf, onChanged,
}: {
  director: Director;
  isSelf: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');

  async function toggleActive() {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/directors/${director.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !director.isActive }),
    });
    if (res.ok) onChanged();
    else setError(await readError(res, 'Error en actualitzar'));
    setBusy(false);
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch(`/api/directors/${director.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword }),
    });
    if (res.ok) {
      setResetting(false);
      setNewPassword('');
      onChanged();
    } else {
      setError(await readError(res, 'Error en canviar la contrasenya'));
    }
    setBusy(false);
  }

  return (
    <li className="p-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center font-display font-semibold text-sm text-ink-2 flex-shrink-0">
          {director.name[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-ink">{director.name}</span>
            <span className="text-xs text-ink-3">@{director.username}</span>
            {isSelf && <Badge color="blue">Tu</Badge>}
            {!director.isActive && <Badge color="gray">Desactivat</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setResetting(r => !r)}>Contrasenya</Button>
          {!isSelf && (
            <Button variant="ghost" size="sm" onClick={toggleActive} disabled={busy}>
              {director.isActive ? 'Desactiva' : 'Activa'}
            </Button>
          )}
        </div>
      </div>

      {resetting && (
        <form onSubmit={resetPassword} className="mt-3 flex items-end gap-2">
          <Input
            label="Contrasenya nova"
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            hint="Mínim 6 caràcters"
            required
            className="max-w-xs"
          />
          <Button type="submit" size="sm" loading={busy}>Desa</Button>
        </form>
      )}
      {error && <p className="text-xs text-loss mt-2">{error}</p>}
    </li>
  );
}
