'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { readError } from '@/lib/http';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (res.ok) {
      router.push('/');
      router.refresh();
    } else {
      setError(await readError(res, 'Error en iniciar sessió'));
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16 space-y-4">
      <div className="text-center space-y-1">
        <div className="w-10 h-10 mx-auto rounded-xl bg-accent-tint border border-border flex items-center justify-center relative">
          <span className="font-display font-bold text-lg text-ink">C</span>
          <span className="absolute bottom-1 right-1.5 text-[8px] font-bold text-accent-ink">3</span>
        </div>
        <h1 className="font-display text-xl font-bold text-ink pt-2">Accés director</h1>
        <p className="text-sm text-ink-3">Inicia sessió per gestionar el campionat</p>
      </div>
      <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-6 space-y-4">
        <Input
          label="Usuari"
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoFocus
          required
        />
        <Input
          label="Contrasenya"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-loss">{error}</p>}
        <Button type="submit" disabled={loading || !password || !username} loading={loading} className="w-full">
          Entrar
        </Button>
      </form>
    </div>
  );
}
