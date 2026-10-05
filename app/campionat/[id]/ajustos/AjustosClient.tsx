'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { readError } from '@/lib/http';
import type { PresencePendingAs, StandingsMode, TournamentStatus, TournamentVisibility } from '@/db/types';

const ESTATS: { value: TournamentStatus; label: string }[] = [
  { value: 'draft', label: 'Esborrany' },
  { value: 'active', label: 'En joc' },
  { value: 'finished', label: 'Acabada' },
];

const MODES: { value: StandingsMode; label: string; hint: string }[] = [
  { value: 'closed_rounds', label: 'Només rondes tancades', hint: 'Cada fase decideix si hi compta també la ronda oberta (vegeu Fases).' },
  { value: 'live', label: 'En temps real', hint: 'Compten tots els resultats, també els de la ronda oberta, a totes les fases.' },
  { value: 'frozen_at', label: 'Congelada', hint: 'Es mostra tal com era en acabar una ronda concreta.' },
  { value: 'hidden', label: 'Amagada', hint: 'Els jugadors no veuen cap classificació. Qui gestiona la competició la veu sempre.' },
];

interface CompteAdmin {
  id: string;
  username: string;
  role: string;
  displayName: string;
}

interface Admins {
  owner: CompteAdmin | null;
  admins: CompteAdmin[];
  candidates: CompteAdmin[];
}

/**
 * Ajustos de la competició, agrupats per funcionalitat. Cada grup es desa pel
 * seu compte, perquè un error en un no deixi els altres a mig fer.
 */
export default function AjustosClient({
  tournamentId,
  nom,
  estat,
  visibilitat,
  currentAccountId,
  pendentsCompten,
}: {
  tournamentId: string;
  nom: string;
  estat: TournamentStatus;
  visibilitat: TournamentVisibility;
  currentAccountId: string;
  pendentsCompten: PresencePendingAs;
}) {
  return (
    <div className="space-y-6 max-w-3xl">
      <General tournamentId={tournamentId} nom={nom} estat={estat} />
      <ClassificacioPublica tournamentId={tournamentId} visibilitat={visibilitat} />
      <PublicacioRondes tournamentId={tournamentId} visibilitat={visibilitat} />
      <PresenciaRondes tournamentId={tournamentId} pendentsCompten={pendentsCompten} />
      <Administradors tournamentId={tournamentId} currentAccountId={currentAccountId} />
      <ZonaPerill tournamentId={tournamentId} nom={nom} />
    </div>
  );
}

// ─── Peces comunes ────────────────────────────────────────────────────────────

function Grup({ titol, descripcio, children }: { titol: string; descripcio?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display font-bold text-ink">{titol}</h2>
        {descripcio && <p className="text-sm text-ink-3">{descripcio}</p>}
      </div>
      <Card className="space-y-4">{children}</Card>
    </section>
  );
}

function Interruptor({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-current text-accent"
      />
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-ink-3">{hint}</span>
      </span>
    </label>
  );
}

function PeuDesar({ loading, error, desat, onSave }: { loading: boolean; error: string; desat: boolean; onSave: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <Button size="sm" onClick={onSave} loading={loading}>Desar</Button>
      {desat && !error && <span className="text-sm text-ink-3">Desat.</span>}
      {error && <span className="text-sm text-loss">{error}</span>}
    </div>
  );
}

/** PATCH de la competició; torna l'error ja llegit, o '' si ha anat bé. */
async function patchCompeticio(tournamentId: string, body: object): Promise<string> {
  const res = await fetch(`/api/tournaments/${tournamentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.ok ? '' : readError(res, 'Error en desar');
}

// ─── Grups ────────────────────────────────────────────────────────────────────

function General({ tournamentId, nom, estat }: { tournamentId: string; nom: string; estat: TournamentStatus }) {
  const router = useRouter();
  const [nomNou, setNomNou] = useState(nom);
  const [estatNou, setEstatNou] = useState<TournamentStatus>(estat);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [desat, setDesat] = useState(false);

  async function desa() {
    if (!nomNou.trim()) {
      setError('El nom no pot ser buit');
      return;
    }
    setLoading(true);
    setDesat(false);
    const err = await patchCompeticio(tournamentId, { name: nomNou.trim(), status: estatNou });
    setError(err);
    setDesat(!err);
    setLoading(false);
    if (!err) router.refresh();
  }

  return (
    <Grup titol="General">
      <Input label="Nom de la competició" value={nomNou} onChange={(e) => setNomNou(e.target.value)} />
      <Select label="Estat" value={estatNou} onChange={(e) => setEstatNou(e.target.value as TournamentStatus)}>
        {ESTATS.map((e) => (
          <option key={e.value} value={e.value}>{e.label}</option>
        ))}
      </Select>
      <PeuDesar loading={loading} error={error} desat={desat} onSave={desa} />
    </Grup>
  );
}

function ClassificacioPublica({ tournamentId, visibilitat }: { tournamentId: string; visibilitat: TournamentVisibility }) {
  const router = useRouter();
  const [mode, setMode] = useState<StandingsMode>(visibilitat.standingsMode);
  const [ronda, setRonda] = useState(visibilitat.frozenRound?.toString() ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [desat, setDesat] = useState(false);

  async function desa() {
    if (mode === 'frozen_at' && !(parseInt(ronda, 10) >= 0)) {
      setError('Indica fins a quina ronda es congela');
      return;
    }
    setLoading(true);
    setDesat(false);
    const err = await patchCompeticio(tournamentId, {
      visibility: { standingsMode: mode, frozenRound: mode === 'frozen_at' ? parseInt(ronda, 10) : null },
    });
    setError(err);
    setDesat(!err);
    setLoading(false);
    if (!err) router.refresh();
  }

  return (
    <Grup
      titol="Classificació pública"
      descripcio="El que veuen els jugadors. Qui gestiona la competició veu sempre la classificació sencera i en temps real."
    >
      <Select
        label="Mode"
        value={mode}
        onChange={(e) => setMode(e.target.value as StandingsMode)}
        hint={MODES.find((m) => m.value === mode)?.hint}
      >
        {MODES.map((m) => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </Select>
      {mode === 'frozen_at' && (
        <Input
          label="Congelada fins a la ronda"
          type="number"
          min={0}
          value={ronda}
          onChange={(e) => setRonda(e.target.value)}
        />
      )}
      <PeuDesar loading={loading} error={error} desat={desat} onSave={desa} />
    </Grup>
  );
}

function PublicacioRondes({ tournamentId, visibilitat }: { tournamentId: string; visibilitat: TournamentVisibility }) {
  const router = useRouter();
  const [aparellaments, setAparellaments] = useState(visibilitat.pairingsVisible);
  const [resultats, setResultats] = useState(visibilitat.resultsVisible);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [desat, setDesat] = useState(false);

  async function desa() {
    setLoading(true);
    setDesat(false);
    const err = await patchCompeticio(tournamentId, {
      visibility: { pairingsVisible: aparellaments, resultsVisible: resultats },
    });
    setError(err);
    setDesat(!err);
    setLoading(false);
    if (!err) router.refresh();
  }

  return (
    <Grup
      titol="Publicació de rondes"
      descripcio="Valors per defecte: cada ronda els pot sobreescriure des de la seva pantalla."
    >
      <Interruptor
        label="Aparellaments visibles"
        hint="Els jugadors veuen amb qui juguen en cada ronda."
        value={aparellaments}
        onChange={setAparellaments}
      />
      <Interruptor
        label="Resultats visibles"
        hint="Els resultats de les rondes tancades es publiquen i compten a la classificació pública."
        value={resultats}
        onChange={setResultats}
      />
      <PeuDesar loading={loading} error={error} desat={desat} onSave={desa} />
    </Grup>
  );
}

function PresenciaRondes({ tournamentId, pendentsCompten }: { tournamentId: string; pendentsCompten: PresencePendingAs }) {
  const router = useRouter();
  const [valor, setValor] = useState<PresencePendingAs>(pendentsCompten);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [desat, setDesat] = useState(false);

  async function desa() {
    setLoading(true);
    setDesat(false);
    const err = await patchCompeticio(tournamentId, { presencePendingAs: valor });
    setError(err);
    setDesat(!err);
    setLoading(false);
    if (!err) router.refresh();
  }

  return (
    <Grup
      titol="Presència a la ronda següent"
      descripcio="Els jugadors diuen si continuen (a l'inici en crear la ronda i en enviar el resultat). Qui no ha dit res és pendent."
    >
      <Select
        label="En aparellar, els pendents compten com a"
        value={valor}
        onChange={(e) => setValor(e.target.value as PresencePendingAs)}
        hint={
          valor === 'present'
            ? "No perjudica qui no té mòbil o no s'hi ha fixat. Seguiràs veient els pendents abans d'aparellar."
            : "Només juga qui ha confirmat. Cal que tothom pugui confirmar (o que el director passi llista)."
        }
      >
        <option value="present">Presents (recomanat)</option>
        <option value="absent">Absents</option>
      </Select>
      <PeuDesar loading={loading} error={error} desat={desat} onSave={desa} />
    </Grup>
  );
}

function Administradors({ tournamentId, currentAccountId }: { tournamentId: string; currentAccountId: string }) {
  const [dades, setDades] = useState<Admins | null>(null);
  const [triat, setTriat] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const carrega = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${tournamentId}/admins`);
    if (res.ok) setDades(await res.json());
    else setError(await readError(res, "Error en carregar els administradors"));
  }, [tournamentId]);

  useEffect(() => {
    carrega();
  }, [carrega]);

  async function canvia(method: 'POST' | 'DELETE', accountId: string) {
    setLoading(true);
    setError('');
    const res = await fetch(`/api/tournaments/${tournamentId}/admins`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId }),
    });
    if (!res.ok) setError(await readError(res, 'Error en desar'));
    else setTriat('');
    setLoading(false);
    await carrega();
  }

  return (
    <Grup
      titol="Administradors"
      descripcio="Qui pot gestionar aquesta competició. Només es poden afegir comptes amb rol d'administrador."
    >
      {!dades ? (
        <p className="text-sm text-ink-3">Carregant…</p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {dades.owner && (
              <li className="flex items-center gap-3 py-2">
                <span className="flex-1 min-w-0">
                  <span className="font-medium text-ink">{dades.owner.displayName}</span>{' '}
                  <span className="text-xs text-ink-3">@{dades.owner.username}</span>
                </span>
                <Badge color="gray">Propietari</Badge>
              </li>
            )}
            {dades.admins.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2">
                <span className="flex-1 min-w-0">
                  <span className="font-medium text-ink">{a.displayName}</span>{' '}
                  <span className="text-xs text-ink-3">@{a.username}</span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-loss hover:bg-loss-tint"
                  disabled={loading}
                  onClick={() => canvia('DELETE', a.id)}
                >
                  {a.id === currentAccountId ? 'Sortir-ne' : 'Treure'}
                </Button>
              </li>
            ))}
          </ul>

          {dades.candidates.length > 0 ? (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select label="Afegir administrador" value={triat} onChange={(e) => setTriat(e.target.value)}>
                  <option value="">Tria un compte…</option>
                  {dades.candidates.map((c) => (
                    <option key={c.id} value={c.id}>{c.displayName} (@{c.username})</option>
                  ))}
                </Select>
              </div>
              <Button disabled={!triat} loading={loading} onClick={() => canvia('POST', triat)}>
                Afegir
              </Button>
            </div>
          ) : (
            <p className="text-xs text-ink-3">
              No hi ha més comptes d&apos;administrador per afegir. Cal que el superadmin en creï de nous a Usuaris.
            </p>
          )}
        </>
      )}
      {error && <p className="text-sm text-loss">{error}</p>}
    </Grup>
  );
}

function ZonaPerill({ tournamentId, nom }: { tournamentId: string; nom: string }) {
  const router = useRouter();
  const [obert, setObert] = useState(false);
  const [confirmacio, setConfirmacio] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function esborra() {
    setLoading(true);
    const res = await fetch(`/api/tournaments/${tournamentId}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/');
      router.refresh();
    } else {
      setError(await readError(res, 'Error en esborrar la competició'));
      setLoading(false);
    }
  }

  return (
    <Grup titol="Zona de perill">
      {!obert ? (
        <Button variant="secondary" className="text-loss" onClick={() => setObert(true)}>
          Esborrar la competició…
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">
            S&apos;esborraran jugadors, fases, rondes i resultats. No es pot desfer. Escriu <strong>{nom}</strong> per confirmar.
          </p>
          <Input value={confirmacio} onChange={(e) => setConfirmacio(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="danger" disabled={confirmacio !== nom} loading={loading} onClick={esborra}>
              Esborrar definitivament
            </Button>
            <Button variant="ghost" onClick={() => { setObert(false); setConfirmacio(''); }}>Cancel·lar</Button>
          </div>
          {error && <p className="text-sm text-loss">{error}</p>}
        </div>
      )}
    </Grup>
  );
}
