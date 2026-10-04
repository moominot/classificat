'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import NomBarrufInput, { type BarrufResultat } from './NomBarrufInput';
import TagInput from './TagInput';
import { readError } from '@/lib/http';
import type { Tag } from '@/lib/pairing/types';

interface Jugador {
  id: string;
  name: string;
  rating: number | null;
  tagIds: string[];
  phone: string | null;
  club: string | null;
  barrufNumero?: number | null;
  isActive: boolean;
}

interface JugadorFormProps {
  tournamentId: string;
  tags: Tag[];
  jugador?: Jugador;
  onDone?: () => void;
}

export default function JugadorForm({ tournamentId, tags, jugador, onDone }: JugadorFormProps) {
  const router = useRouter();
  const [nom, setNom] = useState(jugador?.name ?? '');
  const [rating, setRating] = useState(jugador?.rating?.toString() ?? '');
  const [tagsSeleccionades, setTagsSeleccionades] = useState<Tag[]>(
    tags.filter((t) => jugador?.tagIds.includes(t.id))
  );
  const [phone, setPhone] = useState(jugador?.phone ?? '');
  const [club, setClub] = useState(jugador?.club ?? '');
  const [barrufNumero, setBarrufNumero] = useState<number | null>(jugador?.barrufNumero ?? null);
  const [barrufNom, setBarrufNom] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim()) return;
    setLoading(true);
    setError('');

    const url = jugador
      ? `/api/tournaments/${tournamentId}/entries/${jugador.id}`
      : `/api/tournaments/${tournamentId}/entries`;
    const method = jugador ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: nom.trim(),
        rating: rating ? parseInt(rating) : null,
        tagIds: tagsSeleccionades.map((t) => t.id),
        phone: phone.trim() || null,
        club: club.trim() || null,
        barrufNumero,
      }),
    });

    if (res.ok) {
      router.refresh();
      onDone?.();
    } else {
      setError(await readError(res, 'Error en desar el jugador'));
      setLoading(false);
    }
  }

  function handleNomChange(v: string) {
    setNom(v);
    if (barrufNumero != null && v !== barrufNom) {
      setBarrufNumero(null);
      setBarrufNom(null);
    }
  }

  function handleBarrufPick(b: BarrufResultat) {
    setNom(b.nom);
    if (b.club) setClub(b.club);
    if (b.barruf != null) setRating(String(b.barruf));
    setBarrufNumero(b.numero);
    setBarrufNom(b.nom);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <NomBarrufInput
        label="Nom"
        value={nom}
        onChange={handleNomChange}
        onPick={handleBarrufPick}
        placeholder="Nom complet del jugador — cerca automàticament al BARRUF"
        autoFocus
      />
      {error && <p className="text-xs text-loss">{error}</p>}

      {barrufNumero != null && (
        <div className="flex items-center gap-2 bg-accent-tint text-accent-ink text-xs font-medium px-3 py-2 rounded-lg">
          <span>Vinculat al BARRUF #{barrufNumero}{barrufNom ? ` · ${barrufNom}` : ''}</span>
          <button
            type="button"
            onClick={() => { setBarrufNumero(null); setBarrufNom(null); }}
            className="ml-auto text-accent-ink hover:opacity-70 cursor-pointer"
            aria-label="Desvincula"
          >
            ✕
          </button>
        </div>
      )}

      <Input
        label="BARRUF (opcional)"
        type="number"
        value={rating}
        onChange={e => setRating(e.target.value)}
        placeholder="ex. 1200"
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Club (opcional)"
          value={club}
          onChange={e => setClub(e.target.value)}
          placeholder="ex. Club Escrabble BCN"
        />
        <Input
          label="Telèfon (opcional)"
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="ex. 612 345 678"
        />
      </div>
      <TagInput
        tournamentId={tournamentId}
        value={tagsSeleccionades}
        onChange={setTagsSeleccionades}
        label="Etiquetes (opcional)"
        placeholder="ex. Club Nord, Sub-16..."
      />
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
