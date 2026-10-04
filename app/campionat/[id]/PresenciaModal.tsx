'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';

const POLL_MS = 30_000;

type Estat = { roundNumber: number | null; status: 'present' | 'absent' | 'pending' };

/**
 * El botó d'home mort, perquè no calgui ser a l'inici per veure'l: cada 30 s
 * (i en tornar a la pestanya) pregunta al servidor si hi ha una ronda
 * esperant resposta. Si és així i el jugador no ha respost, surt un modal
 * a qualsevol pàgina del campionat.
 *
 * A l'inici no surt el modal —hi ha la targeta—, però s'hi refresca la pàgina
 * perquè la targeta aparegui sola.
 */
export default function PresenciaModal({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const aInici = pathname === `/campionat/${tournamentId}`;

  const [estat, setEstat] = useState<Estat | null>(null);
  const [descartada, setDescartada] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const darrerSenyal = useRef<string | null>(null);

  const consulta = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/presence`, { cache: 'no-store' });
      if (!res.ok) return;
      const dades: Estat = await res.json();
      setEstat(dades);
      // A l'inici, si la pregunta apareix o canvia, la targeta s'ha d'actualitzar.
      const senyal = `${dades.roundNumber}:${dades.status}`;
      if (darrerSenyal.current !== null && darrerSenyal.current !== senyal && pathname === `/campionat/${tournamentId}`) {
        router.refresh();
      }
      darrerSenyal.current = senyal;
    } catch {
      // Sense xarxa: es torna a provar al proper cicle.
    }
  }, [tournamentId, pathname, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    consulta();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') consulta();
    }, POLL_MS);
    const alTornar = () => document.visibilityState === 'visible' && consulta();
    document.addEventListener('visibilitychange', alTornar);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', alTornar);
    };
  }, [consulta]);

  async function marca(status: 'present' | 'absent') {
    if (!estat?.roundNumber) return;
    setLoading(true);
    setError('');
    const res = await fetch(`/api/tournaments/${tournamentId}/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundNumber: estat.roundNumber, status }),
    });
    setLoading(false);
    if (res.ok) {
      setEstat({ ...estat, status });
      router.refresh();
    } else {
      setError('No s\'ha pogut desar. Torna-ho a provar.');
    }
  }

  const roundNumber = estat?.roundNumber ?? null;
  const obert = roundNumber !== null && estat?.status === 'pending' && !aInici && descartada !== roundNumber;

  return (
    <Modal open={obert} onClose={() => setDescartada(roundNumber)} title={`Jugaràs la ronda ${roundNumber}?`}>
      <div className="space-y-4">
        <p className="text-sm text-ink-2">
          Estem preparant els aparellaments. Si marxes, avisa&apos;ns i no et posarem taula.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" loading={loading} onClick={() => marca('present')}>
            Hi seré
          </Button>
          <Button size="lg" variant="danger" loading={loading} onClick={() => marca('absent')}>
            No hi seré
          </Button>
        </div>
        {error && <p className="text-sm text-loss">{error}</p>}
        <button
          type="button"
          onClick={() => setDescartada(roundNumber)}
          className="block mx-auto text-xs text-ink-3 hover:underline"
        >
          Més tard
        </button>
      </div>
    </Modal>
  );
}
