'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';

interface Grup { id: string; name: string }
interface Jugador { id: string; name: string; rating: number | null; groupId: string | null; isActive: boolean }

interface JugadorFormProps {
  tournamentId: string;
  grups: Grup[];
  jugador?: Jugador;   // si s'edita
  onDone?: () => void;
}

export default function JugadorForm({ tournamentId, grups, jugador, onDone }: JugadorFormProps) {
  const router = useRouter();
  const [nom, setNom] = useState(jugador?.name ?? '');
  const [rating, setRating] = useState(jugador?.rating?.toString() ?? '');
  const [grupId, setGrupId] = useState(jugador?.groupId ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim()) return;
    setLoading(true);
    setError('');

    const url = jugador
      ? `/api/tournaments/${tournamentId}/players/${jugador.id}`
      : `/api/tournaments/${tournamentId}/players`;
    const method = jugador ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nom.trim(),
        rating: rating ? parseInt(rating) : null,
        groupId: grupId || null,
      }),
    });

    if (res.ok) {
      router.refresh();
      onDone?.();
    } else {
      const data = await res.json();
      setError(data.error ?? 'Error en desar el jugador');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input
        label="Nom"
        value={nom}
        onChange={e => setNom(e.target.value)}
        placeholder="Nom complet del jugador"
        error={error}
        autoFocus
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Puntuació ELO (opcional)"
          type="number"
          value={rating}
          onChange={e => setRating(e.target.value)}
          placeholder="ex. 1200"
        />
        {grups.length > 0 && (
          <Select
            label="Grup"
            value={grupId}
            onChange={e => setGrupId(e.target.value)}
          >
            <option value="">Sense grup</option>
            {grups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </Select>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="submit" loading={loading} disabled={!nom.trim()}>
          {jugador ? 'Desar canvis' : 'Afegir jugador'}
        </Button>
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel·lar
          </Button>
        )}
      </div>
    </form>
  );
}
