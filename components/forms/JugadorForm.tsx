'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { readError } from '@/lib/http';

interface Grup { id: string; name: string }
interface Jugador {
  id: string;
  name: string;
  rating: number | null;
  groupId: string | null;
  phone: string | null;
  club: string | null;
  barrufNumero?: number | null;
  isActive: boolean;
}

interface BarrufResultat {
  numero: number;
  nom: string;
  club: string | null;
  barruf: number | null;
  categoria: string | null;
  estat: string;
}

interface JugadorFormProps {
  tournamentId: string;
  grups: Grup[];
  jugador?: Jugador;
  onDone?: () => void;
}

export default function JugadorForm({ tournamentId, grups, jugador, onDone }: JugadorFormProps) {
  const router = useRouter();
  const [nom, setNom] = useState(jugador?.name ?? '');
  const [rating, setRating] = useState(jugador?.rating?.toString() ?? '');
  const [grupId, setGrupId] = useState(jugador?.groupId ?? '');
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
        groupId: grupId || null,
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

  function handleBarrufPick(b: BarrufResultat) {
    setNom(b.nom);
    if (b.club) setClub(b.club);
    if (b.barruf != null) setRating(String(b.barruf));
    setBarrufNumero(b.numero);
    setBarrufNom(b.nom);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <BarrufCerca onPick={handleBarrufPick} />

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
          label="BARRUF (opcional)"
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

/** Cerca al registre del BARRUF (docs/api.md) per preomplir nom/club/valoració. */
function BarrufCerca({ onPick }: { onPick: (b: BarrufResultat) => void }) {
  const [obert, setObert] = useState(false);
  const [q, setQ] = useState('');
  const [resultats, setResultats] = useState<BarrufResultat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResultats([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      setError('');
      const res = await fetch(`/api/barruf/jugadors?q=${encodeURIComponent(q.trim())}`);
      if (res.ok) {
        setResultats(await res.json());
      } else {
        setResultats([]);
        setError(await readError(res, 'Error en cercar al BARRUF'));
      }
      setLoading(false);
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  if (!obert) {
    return (
      <button
        type="button"
        onClick={() => setObert(true)}
        className="text-xs font-medium text-accent-ink hover:opacity-80 cursor-pointer"
      >
        Cercar al BARRUF…
      </button>
    );
  }

  return (
    <div className="bg-surface-2 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Nom del jugador…"
          autoFocus
          className="flex-1"
        />
        <button
          type="button"
          onClick={() => { setObert(false); setQ(''); setResultats([]); }}
          className="text-ink-3 hover:text-ink text-lg leading-none cursor-pointer"
        >
          ×
        </button>
      </div>

      {loading && <p className="text-xs text-ink-3">Cercant…</p>}
      {error && <p className="text-xs text-loss">{error}</p>}

      {resultats.length > 0 && (
        <ul className="divide-y divide-border bg-surface rounded-lg overflow-hidden">
          {resultats.map(b => (
            <li key={b.numero}>
              <button
                type="button"
                onClick={() => { onPick(b); setObert(false); setQ(''); setResultats([]); }}
                className="w-full text-left px-3 py-2 hover:bg-surface-2 cursor-pointer"
              >
                <div className="text-sm font-medium text-ink">{b.nom}</div>
                <div className="text-xs text-ink-3">
                  #{b.numero}{b.club ? ` · ${b.club}` : ''}{b.barruf != null ? ` · BARRUF ${b.barruf}` : ''}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
