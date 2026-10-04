'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import JugadorForm from './JugadorForm';
import ImportarJugadors from './ImportarJugadors';
import NomBarrufInput, { type BarrufResultat } from './NomBarrufInput';
import { useCanManage } from '@/components/ViewerContext';
import { readError } from '@/lib/http';
import type { Tag } from '@/lib/pairing/types';

interface Jugador {
  id: string;
  name: string;
  rating: number | null;
  tagIds: string[];
  phone: string | null;
  club: string | null;
  barrufNumero: number | null;
  isActive: boolean;
}

export default function JugadorsClient({
  tournamentId,
  jugadors,
  tags,
}: {
  tournamentId: string;
  jugadors: Jugador[];
  tags: Tag[];
}) {
  const router = useRouter();
  const canManage = useCanManage();
  const [mode, setMode] = useState<'llista' | 'importar'>('llista');
  const [editant, setEditant] = useState<string | null>(null);
  const [ordre, setOrdre] = useState<'nom' | 'elo'>('nom');

  const tagMap = new Map(tags.map(t => [t.id, t.name]));

  function sortJugadors(jj: Jugador[]) {
    if (ordre === 'elo') {
      return [...jj].sort((a, b) => {
        if (a.rating == null && b.rating == null) return a.name.localeCompare(b.name);
        if (a.rating == null) return 1;
        if (b.rating == null) return -1;
        return b.rating - a.rating;
      });
    }
    return [...jj].sort((a, b) => a.name.localeCompare(b.name));
  }

  async function toggleActiu(jugador: Jugador) {
    await fetch(`/api/tournaments/${tournamentId}/entries/${jugador.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !jugador.isActive }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Capçalera amb accions */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-ink-3 mr-2">
          {jugadors.length} jugador{jugadors.length !== 1 ? 's' : ''}
        </span>
        {mode === 'llista' ? (
          <>
            {canManage && (
              <Button size="sm" variant="secondary" onClick={() => setMode('importar')}>
                Importar CSV
              </Button>
            )}
            <div className="ml-auto flex items-center gap-1 text-xs text-ink-3">
              <span>Ordenar per:</span>
              {(['nom', 'elo'] as const).map(op => (
                <button
                  key={op}
                  onClick={() => setOrdre(op)}
                  className={`px-2 py-1 rounded capitalize transition-colors ${ordre === op ? 'bg-accent-tint text-accent-ink font-medium' : 'hover:bg-surface-2'}`}
                >
                  {op === 'nom' ? 'Nom' : 'BARRUF'}
                </button>
              ))}
            </div>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setMode('llista')}>
            ← Tornar
          </Button>
        )}
      </div>

      {/* Afegir ràpidament: sempre visible per no haver de canviar de pantalla */}
      {mode === 'llista' && canManage && (
        <AfegeixRapid tournamentId={tournamentId} />
      )}

      {/* Formulari importació CSV */}
      {mode === 'importar' && (
        <Card>
          <CardHeader><CardTitle>Importar jugadors</CardTitle></CardHeader>
          <ImportarJugadors tournamentId={tournamentId} />
        </Card>
      )}

      {/* Llista de jugadors */}
      {mode === 'llista' && (
        jugadors.length === 0 ? (
          <div className="text-center py-16 text-ink-3">
            <p className="text-sm">Cap jugador afegit. Comença afegint el primer jugador.</p>
          </div>
        ) : (
          <Card padding={false}>
            <JugadorsLlista
              jugadors={sortJugadors(jugadors)}
              tagMap={tagMap}
              tournamentId={tournamentId}
              tags={tags}
              editant={editant}
              setEditant={setEditant}
              toggleActiu={toggleActiu}
            />
          </Card>
        )
      )}
    </div>
  );
}

/** Camp sempre visible a sobre del llistat: afegeix un jugador sense canviar de pantalla. */
function AfegeixRapid({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [nom, setNom] = useState('');
  const [barrufNumero, setBarrufNumero] = useState<number | null>(null);
  const [barrufNom, setBarrufNom] = useState<string | null>(null);
  const [club, setClub] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleNomChange(v: string) {
    setNom(v);
    if (barrufNumero != null && v !== barrufNom) {
      setBarrufNumero(null);
      setBarrufNom(null);
      setClub(null);
      setRating(null);
    }
  }

  function handlePick(b: BarrufResultat) {
    setNom(b.nom);
    setBarrufNumero(b.numero);
    setBarrufNom(b.nom);
    setClub(b.club ?? null);
    setRating(b.barruf ?? null);
  }

  async function afegeix() {
    if (!nom.trim() || loading) return;
    setLoading(true);
    setError('');
    const res = await fetch(`/api/tournaments/${tournamentId}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: nom.trim(), club, rating, barrufNumero }),
    });
    if (res.ok) {
      setNom('');
      setBarrufNumero(null);
      setBarrufNom(null);
      setClub(null);
      setRating(null);
      router.refresh();
      inputRef.current?.focus();
    } else {
      setError(await readError(res, 'Error en afegir el jugador'));
    }
    setLoading(false);
  }

  return (
    <Card className="space-y-2">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <NomBarrufInput
            ref={inputRef}
            value={nom}
            onChange={handleNomChange}
            onPick={handlePick}
            placeholder="Nom del jugador — cerca automàticament al BARRUF…"
            onKeyDownEnter={afegeix}
          />
        </div>
        <Button onClick={afegeix} loading={loading} disabled={!nom.trim()}>
          + Afegeix
        </Button>
      </div>
      {barrufNumero != null && (
        <div className="flex items-center gap-2 bg-accent-tint text-accent-ink text-xs font-medium px-3 py-2 rounded-lg">
          <span>Vinculat al BARRUF #{barrufNumero}{club ? ` · ${club}` : ''}{rating != null ? ` · BARRUF ${rating}` : ''}</span>
          <button
            type="button"
            onClick={() => { setBarrufNumero(null); setBarrufNom(null); setClub(null); setRating(null); }}
            className="ml-auto text-accent-ink hover:opacity-70 cursor-pointer"
            aria-label="Desvincula"
          >
            ✕
          </button>
        </div>
      )}
      {error && <p className="text-xs text-loss">{error}</p>}
    </Card>
  );
}

function JugadorsLlista({
  jugadors,
  tagMap,
  tournamentId,
  tags,
  editant,
  setEditant,
  toggleActiu,
}: {
  jugadors: Jugador[];
  tagMap: Map<string, string>;
  tournamentId: string;
  tags: Tag[];
  editant: string | null;
  setEditant: (id: string | null) => void;
  toggleActiu: (j: Jugador) => void;
}) {
  return (
    <ul className="divide-y divide-border">
      {jugadors.map((j) => (
        <JugadorRow
          key={j.id}
          jugador={j}
          tagMap={tagMap}
          tournamentId={tournamentId}
          tags={tags}
          editant={editant}
          setEditant={setEditant}
          toggleActiu={toggleActiu}
        />
      ))}
    </ul>
  );
}

function JugadorRow({
  jugador: j,
  tagMap,
  tournamentId,
  tags,
  editant,
  setEditant,
  toggleActiu,
}: {
  jugador: Jugador;
  tagMap: Map<string, string>;
  tournamentId: string;
  tags: Tag[];
  editant: string | null;
  setEditant: (id: string | null) => void;
  toggleActiu: (j: Jugador) => void;
}) {
  const router = useRouter();
  const canManage = useCanManage();
  const [confirmDel, setConfirmDel] = useState(false);
  const [delError, setDelError] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    setDelError('');
    const res = await fetch(`/api/tournaments/${tournamentId}/entries/${j.id}`, { method: 'DELETE' });
    if (res.ok) {
      router.refresh();
    } else {
      setDelError(await readError(res, 'Error en esborrar el jugador'));
      setDeleting(false);
      setConfirmDel(false);
    }
  }

  if (editant === j.id) {
    return (
      <li className="p-4">
        <JugadorForm
          tournamentId={tournamentId}
          tags={tags}
          jugador={j}
          onDone={() => setEditant(null)}
        />
      </li>
    );
  }

  return (
    <li>
      <div className={`flex items-center gap-3 px-4 py-3 ${!j.isActive ? 'opacity-50' : ''}`}>
        <div className="w-8 h-8 rounded-full bg-accent-tint flex items-center justify-center text-accent-ink font-semibold text-sm flex-shrink-0">
          {j.name[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/campionat/${tournamentId}/jugadors/${j.id}`}
              className="font-medium text-sm text-ink hover:text-accent-ink transition-colors truncate"
            >
              {j.name}
            </Link>
            {!j.isActive && <Badge color="gray">Inactiu</Badge>}
          </div>
          <div className="flex gap-3 text-xs text-ink-3 mt-0.5 flex-wrap">
            {j.rating && <span>BARRUF {j.rating}</span>}
            {j.barrufNumero && <span className="text-accent-ink font-medium">#{j.barrufNumero}</span>}
            {j.tagIds.map((id) => (
              <span key={id} className="px-1.5 py-0.5 rounded bg-accent-tint text-accent-ink">
                {tagMap.get(id) ?? '?'}
              </span>
            ))}
            {j.club && <span>{j.club}</span>}
            {j.phone && <span>{j.phone}</span>}
          </div>
          {delError && <p className="text-xs text-loss mt-1">{delError}</p>}
        </div>
        {canManage && (
          <div className="flex gap-1 flex-shrink-0 items-center">
            {confirmDel ? (
              <>
                <span className="text-xs text-loss mr-1">Esborrar?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-2 py-1 rounded text-xs bg-loss text-white hover:opacity-90 disabled:opacity-50"
                >Sí</button>
                <button
                  onClick={() => setConfirmDel(false)}
                  className="px-2 py-1 rounded text-xs text-ink-3 hover:bg-surface-2"
                >No</button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditant(j.id)}
                  className="p-1.5 rounded text-ink-3 hover:text-ink-2 hover:bg-surface-2 transition-colors"
                  title="Editar"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => toggleActiu(j)}
                  className={`p-1.5 rounded transition-colors ${
                    j.isActive
                      ? 'text-ink-3 hover:text-accent-ink hover:bg-accent-tint'
                      : 'text-win hover:bg-win-tint'
                  }`}
                  title={j.isActive ? 'Desactivar' : 'Activar'}
                >
                  {j.isActive ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => { setConfirmDel(true); setDelError(''); }}
                  className="p-1.5 rounded text-ink-3 hover:text-loss hover:bg-loss-tint transition-colors"
                  title="Esborrar jugador"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
