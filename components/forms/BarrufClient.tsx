'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { useCanManage } from '@/components/ViewerContext';
import { readError } from '@/lib/http';

interface Estat {
  enviat: boolean;
  versio?: number;
  estat?: 'pendent' | 'importada' | 'descartada';
  barruf?: number | null;
  enllac?: string;
}

const ETIQUETA_ESTAT: Record<string, string> = {
  pendent: 'Pendent de revisió',
  importada: 'Importada al BARRUF',
  descartada: 'Descartada pel gestor',
};

function avui(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BarrufClient({ tournamentId }: { tournamentId: string }) {
  const canManage = useCanManage();
  const [estat, setEstat] = useState<Estat | null>(null);
  const [carregant, setCarregant] = useState(true);
  const [estatError, setEstatError] = useState('');

  const [data, setData] = useState(avui());
  const [organitzador, setOrganitzador] = useState('');
  const [clubOrganitzador, setClubOrganitzador] = useState('');
  const [enviant, setEnviant] = useState(false);
  const [resultat, setResultat] = useState<{ ok: boolean; missatge: string; errors?: string[] } | null>(null);

  useEffect(() => {
    if (!canManage) return;
    carregaEstat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  async function carregaEstat() {
    setCarregant(true);
    setEstatError('');
    const res = await fetch(`/api/tournaments/${tournamentId}/barruf/estat`);
    if (res.ok) {
      setEstat(await res.json());
    } else {
      setEstatError(await readError(res, 'Error en consultar l\'estat'));
    }
    setCarregant(false);
  }

  async function handleEnviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviant(true);
    setResultat(null);

    const res = await fetch(`/api/tournaments/${tournamentId}/barruf/enviar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, organitzador: organitzador.trim(), clubOrganitzador: clubOrganitzador.trim() }),
    });
    const body = await res.json().catch(() => ({}));

    if (res.ok) {
      let missatge = body.missatge ?? 'Rebut. Queda pendent que un gestor el revisi i l\'importi.';
      if (body.partidesOmeses > 0) {
        missatge += ` (${body.partidesOmeses} partida${body.partidesOmeses !== 1 ? 's' : ''} de més de 2 jugadors no s'ha${body.partidesOmeses !== 1 ? 'n' : ''} pogut enviar.)`;
      }
      setResultat({ ok: true, missatge });
      carregaEstat();
    } else {
      setResultat({
        ok: false,
        missatge: body.error ?? 'Error en enviar el campionat',
        errors: body.errors,
      });
    }
    setEnviant(false);
  }

  if (!canManage) {
    return <p className="text-sm text-ink-3">Només qui gestiona la competició pot veure aquesta secció.</p>;
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">BARRUF</h1>
        <p className="text-sm text-ink-3 mt-1">
          Envia els resultats d&apos;aquest campionat perquè un gestor del BARRUF els revisi i els importi.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Estat actual</CardTitle></CardHeader>
        {carregant ? (
          <p className="text-sm text-ink-3">Consultant…</p>
        ) : estatError ? (
          <p className="text-sm text-loss">{estatError}</p>
        ) : estat?.enviat ? (
          <div className="space-y-1 text-sm">
            <p className="text-ink">
              <span className="font-medium">{ETIQUETA_ESTAT[estat.estat ?? ''] ?? estat.estat}</span>
              {estat.versio != null && <span className="text-ink-3"> · versió {estat.versio}</span>}
            </p>
            {estat.barruf != null && (
              <p className="text-ink-3">Edició {estat.barruf} del BARRUF.</p>
            )}
            {estat.enllac && (
              <a href={estat.enllac} target="_blank" rel="noreferrer" className="text-accent-ink hover:underline">
                Veure al BARRUF →
              </a>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-3">Encara no s&apos;ha enviat cap resultat d&apos;aquest campionat.</p>
        )}
      </Card>

      <Card>
        <CardHeader><CardTitle>Enviar resultats</CardTitle></CardHeader>
        <form onSubmit={handleEnviar} className="space-y-3">
          <Input
            label="Data del campionat"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Organitzador (opcional)"
              value={organitzador}
              onChange={(e) => setOrganitzador(e.target.value)}
              placeholder="ex. CS Manacor"
            />
            <Input
              label="Club organitzador (opcional)"
              value={clubOrganitzador}
              onChange={(e) => setClubOrganitzador(e.target.value)}
              placeholder="ex. Manacor"
            />
          </div>

          <Button type="submit" loading={enviant}>Enviar al BARRUF</Button>

          {resultat && (
            <div className={`text-sm rounded-lg px-3 py-2 ${resultat.ok ? 'bg-win-tint text-win' : 'bg-loss-tint text-loss'}`}>
              <p>{resultat.missatge}</p>
              {resultat.errors && resultat.errors.length > 0 && (
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  {resultat.errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              )}
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}
