'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
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
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push('/');
      router.refresh();
    } else {
      const d = await res.json();
      setError(d.error ?? 'Error en iniciar sessió');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16 space-y-4">
      <div className="text-center space-y-1">
        <h1 className="text-xl font-bold text-gray-900">Accés director</h1>
        <p className="text-sm text-gray-500">Introdueix la contrasenya per gestionar el campionat</p>
      </div>
      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Contrasenya</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Entrant...' : 'Entrar com a director'}
        </button>
      </form>
    </div>
  );
}
