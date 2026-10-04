'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { readError } from '@/lib/http';

interface Jugador { id: string; name: string }

/**
 * Targeta de l'inici per al jugador: «qui ets» i, quan el director crea una
 * ronda, el botó per dir si hi seràs.
 *
 * La identitat és declarada (§15.2): només recorda la tria en aquest mòbil.
 */
export default function PresenciaJugador({
  tournamentId,
  jugadors,
  entryId,
  roundNumber,
  estat,
}: {
  tournamentId: string;
  jugadors: Jugador[];
  /** El jugador que aquest dispositiu ha triat, si n'hi ha. */
  entryId: string | null;
  /** La ronda que el director acaba de crear i encara no té aparellaments. */
  roundNumber: number | null;
  estat: 'present' | 'absent' | 'pending';
}) {
  const router = useRouter();
  const [triat, setTriat] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function crida(url: string, method: string, body?: object) {
    setLoading(true);
    setError('');
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) setError(await readError(res, 'Error en desar'));
    setLoading(false);
    router.refresh();
  }

  const identifica = () => crida(`/api/tournaments/${tournamentId}/identify`, 'POST', { entryId: triat });
  const oblida = () => crida(`/api/tournaments/${tournamentId}/identify`, 'DELETE');
  const marca = (status: 'present' | 'absent') =>
    crida(`/api/tournaments/${tournamentId}/presence`, 'POST', { roundNumber, status });

  const jo = jugadors.find((j) => j.id === entryId);

  // Amb una ronda esperant resposta, la targeta es destaca amb fons de color:
  // és l'únic que s'ha de fer en entrar. Fora d'això, discreta.
  const urgent = roundNumber !== null;
  const targeta = `rounded-2xl border p-4 space-y-3 ${
    urgent ? 'bg-accent-tint border-accent shadow-sm' : 'bg-surface border-border'
  }`;

  if (!jo) {
    return (
      <div className={targeta}>
        <div>
          <h3 className="font-display font-bold text-ink">Qui ets?</h3>
          <p className="text-sm text-ink-3">
            Tria el teu nom per poder dir si jugues la ronda següent i enviar resultats com a tu.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Select value={triat} onChange={(e) => setTriat(e.target.value)} aria-label="El teu nom">
              <option value="">Tria el teu nom…</option>
              {jugadors.map((j) => (
                <option key={j.id} value={j.id}>{j.name}</option>
              ))}
            </Select>
          </div>
          <Button disabled={!triat} loading={loading} onClick={identifica}>Sóc jo</Button>
        </div>
        {error && <p className="text-sm text-loss">{error}</p>}
      </div>
    );
  }

  return (
    <div className={targeta}>
      {roundNumber !== null && (
        <div className="space-y-2">
          <div>
            <h3 className="font-display font-bold text-ink">Jugaràs la ronda {roundNumber}?</h3>
            <p className="text-sm text-ink-3">
              Estem preparant els aparellaments. Si marxes, avisa&apos;ns i no et posarem taula.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant={estat === 'present' ? 'primary' : 'secondary'}
              loading={loading}
              onClick={() => marca('present')}
            >
              Hi seré
            </Button>
            <Button
              className="flex-1"
              variant={estat === 'absent' ? 'danger' : 'secondary'}
              loading={loading}
              onClick={() => marca('absent')}
            >
              No hi seré
            </Button>
          </div>
          <p className="text-xs text-ink-3">
            {estat === 'pending'
              ? 'Encara no has respost.'
              : estat === 'present'
                ? 'Has confirmat que jugues.'
                : 'Has avisat que no jugues.'}
          </p>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-ink-3">
        <span>
          Ets <strong className="text-ink-2">{jo.name}</strong> en aquest dispositiu.
        </span>
        <button type="button" onClick={oblida} disabled={loading} className="text-accent-ink hover:underline">
          No sóc jo
        </button>
      </div>
      {error && <p className="text-sm text-loss">{error}</p>}
    </div>
  );
}
