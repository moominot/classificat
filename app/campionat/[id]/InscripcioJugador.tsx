'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import NomBarrufInput, { type BarrufResultat } from '@/components/forms/NomBarrufInput';
import { readError } from '@/lib/http';

interface Jugador { id: string; name: string }

/**
 * Targeta de l'inici amb les inscripcions obertes: substitueix el «qui ets»
 * i el combina amb el formulari per inscriure's.
 *
 *  - Amb compte, n'hi ha prou a dir que s'hi vol adherir.
 *  - Sense compte, escriu el nom (amb suggeriments del BARRUF) o, si ja
 *    l'han inscrit, el tria de la llista com al «qui ets».
 *
 * La sol·licitud queda pendent fins que qui gestiona la competició la valida.
 */
export default function InscripcioJugador({
  tournamentId,
  jugadors,
  entryId,
  compte,
  sollicitud,
}: {
  tournamentId: string;
  jugadors: Jugador[];
  /** La inscripció de qui mira, si ja en té. */
  entryId: string | null;
  /** El nom del compte amb què ha iniciat sessió, si n'hi ha. */
  compte: string | null;
  /** La seva última sol·licitud encara no acceptada. */
  sollicitud: { displayName: string; status: 'pending' | 'rejected' } | null;
}) {
  const router = useRouter();
  const [nom, setNom] = useState('');
  const [barruf, setBarruf] = useState<BarrufResultat | null>(null);
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
    const ok = res.ok;
    if (!ok) setError(await readError(res, 'Error en desar'));
    setLoading(false);
    router.refresh();
    return ok;
  }

  function canviaNom(v: string) {
    setNom(v);
    if (barruf && v !== barruf.nom) setBarruf(null);
  }

  async function inscriu() {
    const body = compte
      ? {}
      : {
          displayName: nom.trim(),
          barrufNumero: barruf?.numero,
          club: barruf?.club ?? undefined,
          rating: barruf?.barruf ?? undefined,
        };
    if (await crida(`/api/tournaments/${tournamentId}/registrations`, 'POST', body)) {
      setNom('');
      setBarruf(null);
    }
  }

  const retira = () => crida(`/api/tournaments/${tournamentId}/registrations`, 'DELETE');
  const identifica = () => crida(`/api/tournaments/${tournamentId}/identify`, 'POST', { entryId: triat });
  const oblida = () => crida(`/api/tournaments/${tournamentId}/identify`, 'DELETE');

  const targeta = 'rounded-2xl border p-4 space-y-3';
  const jo = jugadors.find((j) => j.id === entryId);

  if (jo) {
    return (
      <div className={`${targeta} bg-surface border-border`}>
        <p className="text-sm text-ink-2">
          Estàs inscrit com a <strong className="text-ink">{jo.name}</strong>.
        </p>
        {!compte && (
          <button type="button" onClick={oblida} disabled={loading} className="text-xs text-accent-ink hover:underline">
            No sóc jo
          </button>
        )}
        {error && <p className="text-sm text-loss">{error}</p>}
      </div>
    );
  }

  if (sollicitud?.status === 'pending') {
    return (
      <div className={`${targeta} bg-accent-tint border-accent`}>
        <div>
          <h3 className="font-display font-bold text-ink">Inscripció enviada</h3>
          <p className="text-sm text-ink-2">
            Has demanat inscriure&apos;t com a <strong className="text-ink">{sollicitud.displayName}</strong>.
            L&apos;organització l&apos;ha de validar.
          </p>
        </div>
        <button type="button" onClick={retira} disabled={loading} className="text-xs text-accent-ink hover:underline">
          Retira la sol·licitud
        </button>
        {error && <p className="text-sm text-loss">{error}</p>}
      </div>
    );
  }

  return (
    <div className={`${targeta} bg-accent-tint border-accent shadow-sm`}>
      <div>
        <h3 className="font-display font-bold text-ink">Inscripcions obertes</h3>
        <p className="text-sm text-ink-3">
          {compte
            ? "Apunta-t'hi i l'organització validarà la inscripció."
            : "Escriu el teu nom. Si surts al BARRUF, tria't de la llista."}
        </p>
      </div>

      {sollicitud?.status === 'rejected' && (
        <p className="text-sm text-loss">
          La sol·licitud com a {sollicitud.displayName} no s&apos;ha acceptat. Si creus que és un error, parla amb
          l&apos;organització.
        </p>
      )}

      {compte ? (
        <Button className="w-full" loading={loading} onClick={inscriu}>
          Inscriu-me com a {compte}
        </Button>
      ) : (
        <>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <NomBarrufInput
                value={nom}
                onChange={canviaNom}
                onPick={(r) => {
                  setNom(r.nom);
                  setBarruf(r);
                }}
                placeholder="Nom i llinatges"
                tournamentId={tournamentId}
                onKeyDownEnter={() => nom.trim() && inscriu()}
              />
            </div>
            <Button disabled={!nom.trim()} loading={loading} onClick={inscriu}>
              Inscriu-me
            </Button>
          </div>
          {barruf && (
            <p className="text-xs text-accent-ink">
              BARRUF #{barruf.numero}
              {barruf.club ? ` · ${barruf.club}` : ''}
            </p>
          )}

          {jugadors.length > 0 && (
            <div className="pt-2 border-t border-border space-y-2">
              <p className="text-xs text-ink-3">Ja t&apos;han inscrit? Tria el teu nom per identificar-te en aquest mòbil.</p>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Select value={triat} onChange={(e) => setTriat(e.target.value)} aria-label="El teu nom">
                    <option value="">Tria el teu nom…</option>
                    {jugadors.map((j) => (
                      <option key={j.id} value={j.id}>{j.name}</option>
                    ))}
                  </Select>
                </div>
                <Button variant="secondary" disabled={!triat} loading={loading} onClick={identifica}>
                  Sóc jo
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {error && <p className="text-sm text-loss">{error}</p>}
    </div>
  );
}
