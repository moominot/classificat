'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { readError } from '@/lib/http';
import type { Role } from '@/db/types';

export interface Compte {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

const ETIQUETA_ROL: Record<Role, string> = {
  superadmin: 'Superadmin',
  admin: 'Administrador',
  user: 'Jugador',
};

export default function ComptesClient({
  comptes,
  currentAccountId,
}: {
  comptes: Compte[];
  currentAccountId: string | undefined;
}) {
  const router = useRouter();
  const [obert, setObert] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Comptes</h1>
          <p className="text-sm text-ink-3 mt-1">Qui pot entrar a l&apos;aplicació i amb quin rol.</p>
        </div>
        <Button onClick={() => setObert((o) => !o)}>{obert ? 'Cancel·la' : 'Afegeix compte'}</Button>
      </div>

      {obert && (
        <NouCompteForm
          onDone={() => {
            setObert(false);
            router.refresh();
          }}
        />
      )}

      <Card padding={false}>
        <ul className="divide-y divide-border">
          {comptes.map((compte) => (
            <CompteRow
              key={compte.id}
              compte={compte}
              isSelf={compte.id === currentAccountId}
              onChanged={() => router.refresh()}
            />
          ))}
        </ul>
      </Card>
    </div>
  );
}

/**
 * Alta directa d'un compte.
 *
 * És la via per donar d'alta administradors. Els jugadors no es creen aquí:
 * arriben per invitació a una persona que ja consta al registre
 * (docs/pla-rols.md §14.2).
 */
function NouCompteForm({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, displayName, password, role }),
    });
    if (res.ok) {
      onDone();
    } else {
      setError(await readError(res, 'Error en crear el compte'));
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nou compte</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="Nom" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          <Input label="Usuari" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <Input
            label="Contrasenya"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            hint="Mínim 6 caràcters"
          />
        </div>
        <label className="block text-sm">
          <span className="text-ink-2">Rol</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="mt-1 block w-full max-w-xs rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="admin">Administrador</option>
            <option value="superadmin">Superadmin</option>
            <option value="user">Jugador</option>
          </select>
        </label>
        {error && <p className="text-sm text-loss">{error}</p>}
        <Button type="submit" loading={loading}>
          Crea el compte
        </Button>
      </form>
    </Card>
  );
}

function CompteRow({
  compte,
  isSelf,
  onChanged,
}: {
  compte: Compte;
  isSelf: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');

  async function patch(body: Record<string, unknown>, fallback: string) {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/accounts/${compte.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) onChanged();
    else setError(await readError(res, fallback));
    setBusy(false);
    return res.ok;
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    const ok = await patch({ password: newPassword }, 'Error en canviar la contrasenya');
    if (ok) {
      setResetting(false);
      setNewPassword('');
    }
  }

  return (
    <li className="p-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center font-display font-semibold text-sm text-ink-2 flex-shrink-0">
          {compte.displayName[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-ink">{compte.displayName}</span>
            <span className="text-xs text-ink-3">@{compte.username}</span>
            <Badge color={compte.role === 'user' ? 'gray' : 'blue'}>{ETIQUETA_ROL[compte.role]}</Badge>
            {isSelf && <Badge color="blue">Tu</Badge>}
            {!compte.isActive && <Badge color="gray">Desactivat</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setResetting((r) => !r)}>
            Contrasenya
          </Button>
          {!isSelf && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => patch({ isActive: !compte.isActive }, 'Error en actualitzar')}
            >
              {compte.isActive ? 'Desactiva' : 'Activa'}
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
            onChange={(e) => setNewPassword(e.target.value)}
            hint="Mínim 6 caràcters"
            required
            className="max-w-xs"
          />
          <Button type="submit" size="sm" loading={busy}>
            Desa
          </Button>
        </form>
      )}
      {error && <p className="text-xs text-loss mt-2">{error}</p>}
    </li>
  );
}
