'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import JugadorForm from './JugadorForm';
import ImportarJugadors from './ImportarJugadors';

interface Grup { id: string; name: string }
interface Jugador {
  id: string;
  name: string;
  rating: number | null;
  groupId: string | null;
  phone: string | null;
  club: string | null;
  isActive: boolean;
}

export default function JugadorsClient({
  tournamentId,
  jugadors,
  grups,
}: {
  tournamentId: string;
  jugadors: Jugador[];
  grups: Grup[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'llista' | 'nou' | 'importar'>('llista');
  const [editant, setEditant] = useState<string | null>(null);
  const [ordre, setOrdre] = useState<'nom' | 'elo' | 'grup'>('nom');

  const grupMap = new Map(grups.map(g => [g.id, g.name]));

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

  // Quan s'ordena per grup, els grups s'ordenen alfabèticament
  const grupsSorted = ordre === 'grup'
    ? [...grups].sort((a, b) => a.name.localeCompare(b.name))
    : grups;

  async function toggleActiu(jugador: Jugador) {
    await fetch(`/api/tournaments/${tournamentId}/players/${jugador.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !jugador.isActive }),
    });
    router.refresh();
  }

  // Agrupa jugadors per grup
  const perGrup = new Map<string | null, Jugador[]>();
  for (const j of jugadors) {
    const key = j.groupId ?? null;
    if (!perGrup.has(key)) perGrup.set(key, []);
    perGrup.get(key)!.push(j);
  }

  return (
    <div className="space-y-4">
      {/* Capçalera amb accions */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-500 mr-2">
          {jugadors.length} jugador{jugadors.length !== 1 ? 's' : ''}
        </span>
        {mode === 'llista' ? (
          <>
            <Button size="sm" onClick={() => setMode('nou')}>+ Afegir jugador</Button>
            <Button size="sm" variant="secondary" onClick={() => setMode('importar')}>
              Importar CSV
            </Button>
            <div className="ml-auto flex items-center gap-1 text-xs text-gray-500">
              <span>Ordenar per:</span>
              {(['nom', 'elo', ...(grups.length > 0 ? ['grup'] : [])] as ('nom' | 'elo' | 'grup')[]).map(op => (
                <button
                  key={op}
                  onClick={() => setOrdre(op)}
                  className={`px-2 py-1 rounded capitalize transition-colors ${ordre === op ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-100'}`}
                >
                  {op === 'nom' ? 'Nom' : op === 'elo' ? 'BARRUF' : 'Grup'}
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

      {/* Formulari nou jugador */}
      {mode === 'nou' && (
        <Card>
          <CardHeader><CardTitle>Nou jugador</CardTitle></CardHeader>
          <JugadorForm
            tournamentId={tournamentId}
            grups={grups}
            onDone={() => setMode('llista')}
          />
        </Card>
      )}

      {/* Formulari importació CSV */}
      {mode === 'importar' && (
        <Card>
          <CardHeader><CardTitle>Importar jugadors</CardTitle></CardHeader>
          <ImportarJugadors tournamentId={tournamentId} grups={grups} />
        </Card>
      )}

      {/* Llista de jugadors */}
      {mode === 'llista' && (
        jugadors.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">Cap jugador afegit. Comença afegint el primer jugador.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Si hi ha grups, mostra per grup; si no, tots junts */}
            {grups.length > 0 ? (
              <>
                {grupsSorted.map(g => {
                  const jj = sortJugadors(perGrup.get(g.id) ?? []);
                  return (
                    <Card key={g.id} padding={false}>
                      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                        <span className="font-semibold text-sm text-gray-700">Grup {g.name}</span>
                        <Badge color="blue">{jj.length}</Badge>
                      </div>
                      <JugadorsLlista
                        jugadors={jj}
                        grupMap={grupMap}
                        tournamentId={tournamentId}
                        grups={grups}
                        editant={editant}
                        setEditant={setEditant}
                        toggleActiu={toggleActiu}
                      />
                    </Card>
                  );
                })}
                {(perGrup.get(null)?.length ?? 0) > 0 && (
                  <Card padding={false}>
                    <div className="px-4 py-3 border-b border-gray-100">
                      <span className="font-semibold text-sm text-gray-500">Sense grup</span>
                    </div>
                    <JugadorsLlista
                      jugadors={sortJugadors(perGrup.get(null) ?? [])}
                      grupMap={grupMap}
                      tournamentId={tournamentId}
                      grups={grups}
                      editant={editant}
                      setEditant={setEditant}
                      toggleActiu={toggleActiu}
                    />
                  </Card>
                )}
              </>
            ) : (
              <Card padding={false}>
                <JugadorsLlista
                  jugadors={sortJugadors(jugadors)}
                  grupMap={grupMap}
                  tournamentId={tournamentId}
                  grups={grups}
                  editant={editant}
                  setEditant={setEditant}
                  toggleActiu={toggleActiu}
                />
              </Card>
            )}
          </div>
        )
      )}
    </div>
  );
}

function JugadorsLlista({
  jugadors,
  grupMap,
  tournamentId,
  grups,
  editant,
  setEditant,
  toggleActiu,
}: {
  jugadors: Jugador[];
  grupMap: Map<string, string>;
  tournamentId: string;
  grups: Grup[];
  editant: string | null;
  setEditant: (id: string | null) => void;
  toggleActiu: (j: Jugador) => void;
}) {
  return (
    <ul className="divide-y divide-gray-100">
      {jugadors.map((j) => (
        <JugadorRow
          key={j.id}
          jugador={j}
          grupMap={grupMap}
          tournamentId={tournamentId}
          grups={grups}
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
  grupMap,
  tournamentId,
  grups,
  editant,
  setEditant,
  toggleActiu,
}: {
  jugador: Jugador;
  grupMap: Map<string, string>;
  tournamentId: string;
  grups: Grup[];
  editant: string | null;
  setEditant: (id: string | null) => void;
  toggleActiu: (j: Jugador) => void;
}) {
  const router = useRouter();
  const [confirmDel, setConfirmDel] = useState(false);
  const [delError, setDelError] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    setDelError('');
    const res = await fetch(`/api/tournaments/${tournamentId}/players/${j.id}`, { method: 'DELETE' });
    if (res.ok) {
      router.refresh();
    } else {
      const d = await res.json();
      setDelError(d.error ?? 'Error en esborrar el jugador');
      setDeleting(false);
      setConfirmDel(false);
    }
  }

  if (editant === j.id) {
    return (
      <li className="p-4">
        <JugadorForm
          tournamentId={tournamentId}
          grups={grups}
          jugador={j}
          onDone={() => setEditant(null)}
        />
      </li>
    );
  }

  return (
    <li>
      <div className={`flex items-center gap-3 px-4 py-3 ${!j.isActive ? 'opacity-50' : ''}`}>
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm flex-shrink-0">
          {j.name[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/campionat/${tournamentId}/jugadors/${j.id}`}
              className="font-medium text-sm text-gray-900 hover:text-blue-600 transition-colors truncate"
            >
              {j.name}
            </Link>
            {!j.isActive && <Badge color="gray">Inactiu</Badge>}
          </div>
          <div className="flex gap-3 text-xs text-gray-400 mt-0.5 flex-wrap">
            {j.rating && <span>BARRUF {j.rating}</span>}
            {j.groupId && <span>Grup {grupMap.get(j.groupId)}</span>}
            {j.club && <span>{j.club}</span>}
            {j.phone && <span>{j.phone}</span>}
          </div>
          {delError && <p className="text-xs text-red-600 mt-1">{delError}</p>}
        </div>
        <div className="flex gap-1 flex-shrink-0 items-center">
          {confirmDel ? (
            <>
              <span className="text-xs text-red-600 mr-1">Esborrar?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-2 py-1 rounded text-xs bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >Sí</button>
              <button
                onClick={() => setConfirmDel(false)}
                className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100"
              >No</button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditant(j.id)}
                className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
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
                    ? 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'
                    : 'text-green-600 hover:bg-green-50'
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
                className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
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
      </div>
    </li>
  );
}
