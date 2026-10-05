'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useCanManage } from '@/components/ViewerContext';
import type { PairingMethod, PairingWarning } from '@/lib/pairing/types';
import { readError } from '@/lib/http';

interface Jugador {
  id: string;
  name: string;
  rating?: number | null;
}

interface SeedEntry {
  seed: number;
  entryId: string;
  displayName: string;
  rating: number | null;
  points: number;
  rank: number | null;
}

interface Taula {
  tableNumber: number;
  entryIds: string[];
}

export default function GenerarAparellaments({
  tournamentId,
  roundId,
  roundNumber,
  method,
  participantsPerMatch,
  players = [],
  previousAbsentIds = [],
  presencia = {},
  pendentsCompten = 'present',
}: {
  tournamentId: string;
  roundId: string;
  roundNumber: number;
  method: PairingMethod;
  participantsPerMatch: number;
  players?: Jugador[];
  previousAbsentIds?: string[];
  /** Qui ha respost si juga la ronda; qui no hi surt és pendent. */
  presencia?: Record<string, 'present' | 'absent'>;
  /** Com compten els pendents en aparellar (Ajustos). */
  pendentsCompten?: 'present' | 'absent';
}) {
  const router = useRouter();
  const canManage = useCanManage();
  // Absents per defecte: els que han dit que no hi seran, els pendents si la
  // política ho vol, i els de la ronda anterior que no han confirmat que
  // tornen. Es calcula a cada render perquè les respostes dels jugadors
  // arriben mentre el director té la pantalla oberta. El que marca el director
  // es desa al servidor (`source = admin`) i el veuen els altres dispositius i
  // administradors; `pendent` només estalvia l'espera fins que el refresc
  // porta la resposta del servidor.
  const [pendent, setPendent] = useState<Map<string, boolean>>(new Map());
  const absentPerDefecte = (id: string) =>
    presencia[id]
      ? presencia[id] === 'absent'
      : pendentsCompten === 'absent' || previousAbsentIds.includes(id);
  const absentIds = new Set(players.filter((p) => pendent.get(p.id) ?? absentPerDefecte(p.id)).map((p) => p.id));

  // Quan el servidor ja reflecteix la marca, l'optimista sobra.
  useEffect(() => {
    if (pendent.size === 0) return;
    setPendent((prev) => {
      const next = new Map(prev);
      for (const [id, absent] of prev) if (presencia[id] === (absent ? 'absent' : 'present')) next.delete(id);
      return next.size === prev.size ? prev : next;
    });
  }, [presencia, pendent.size]);
  const confirmats = players.filter((p) => presencia[p.id] === 'present').length;
  const noHiSeran = players.filter((p) => presencia[p.id] === 'absent').length;
  const pendents = players.length - confirmats - noHiSeran;

  if (!canManage) return null;

  async function toggleAbsent(id: string) {
    const absent = !absentIds.has(id);
    setPendent(prev => new Map(prev).set(id, absent));
    const res = await fetch(`/api/tournaments/${tournamentId}/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundNumber, entryId: id, status: absent ? 'absent' : 'present' }),
    });
    if (!res.ok) {
      // No s'ha desat: es desfà el canvi visible en lloc de deixar-lo enganyar.
      setPendent(prev => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }
    router.refresh();
  }

  const playing = players.filter(p => !absentIds.has(p.id));

  const participantsPicker = (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink-2">Participants ronda {roundNumber}</h3>
        <span className="text-xs text-ink-3">{playing.length} jugadors</span>
      </div>

      {players.length > 0 && (
        <p className="text-xs text-ink-3 mb-2">
          {confirmats} confirmats · {pendents} pendents (compten com a {pendentsCompten === 'present' ? 'presents' : 'absents'}) ·{' '}
          {noHiSeran} no hi seran
        </p>
      )}

      {players.length === 0 ? (
        <p className="text-sm text-ink-3">No hi ha jugadors actius al campionat.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {players.map(p => {
            const absent = absentIds.has(p.id);
            return (
              <label
                key={p.id}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors text-sm select-none ${
                  absent
                    ? 'bg-loss-tint border-loss text-loss line-through'
                    : 'bg-win-tint border-win text-win'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!absent}
                  onChange={() => toggleAbsent(p.id)}
                  className="rounded accent-current text-win flex-shrink-0"
                />
                <span className="truncate">{p.name}</span>
                {presencia[p.id] === 'present' && <span className="ml-auto text-[10px] font-semibold uppercase">confirmat</span>}
                {presencia[p.id] === 'absent' && <span className="ml-auto text-[10px] font-semibold uppercase">avisa</span>}
                {!presencia[p.id] && <span className="ml-auto text-[10px] uppercase opacity-60">pendent</span>}
              </label>
            );
          })}
        </div>
      )}

      {previousAbsentIds.length > 0 && absentIds.size === 0 && (
        <p className="text-xs text-ink-3 mt-2">
          Tots els jugadors participen (la ronda anterior tenia absents pre-marcats, però has desmarcat tots).
        </p>
      )}
      {previousAbsentIds.length > 0 && absentIds.size > 0 && [...absentIds].every(id => previousAbsentIds.includes(id)) && (
        <p className="text-xs text-accent-ink mt-2">
          Absents pre-marcats de la ronda anterior.
        </p>
      )}
    </div>
  );

  if (method === 'manual') {
    return (
      <ManualAparellaments
        tournamentId={tournamentId}
        roundId={roundId}
        participantsPerMatch={participantsPerMatch}
        playing={playing}
        absentIds={absentIds}
        participantsPicker={participantsPicker}
      />
    );
  }

  return (
    <AutoAparellaments
      tournamentId={tournamentId}
      roundId={roundId}
      playing={playing}
      absentIds={absentIds}
      participantsPicker={participantsPicker}
    />
  );
}

// ─── Mètodes automàtics (suís, round robin, rei del turó...) ──────────────────

function AutoAparellaments({
  tournamentId,
  roundId,
  playing,
  absentIds,
  participantsPicker,
}: {
  tournamentId: string;
  roundId: string;
  playing: Jugador[];
  absentIds: Set<string>;
  participantsPicker: React.ReactNode;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<{
    isFirstRound: boolean;
    seedingOrder: SeedEntry[];
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingGenerar, setLoadingGenerar] = useState(false);
  const [warnings, setWarnings] = useState<PairingWarning[]>([]);
  const [error, setError] = useState('');

  async function previsualitzar() {
    setLoadingPreview(true);
    setError('');
    const absentParam = [...absentIds].join(',');
    const res = await fetch(
      `/api/tournaments/${tournamentId}/rounds/${roundId}/seeding${absentParam ? `?absentIds=${absentParam}` : ''}`
    );
    if (res.ok) {
      const data = await res.json();
      setModal(data);
    } else {
      setError(await readError(res, 'Error en carregar el seeding'));
    }
    setLoadingPreview(false);
  }

  async function generar() {
    setLoadingGenerar(true);
    setError('');
    setWarnings([]);

    const res = await fetch(
      `/api/tournaments/${tournamentId}/rounds/${roundId}/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ absentEntryIds: [...absentIds] }),
      }
    );

    if (res.ok) {
      const data = await res.json();
      if (data.warnings?.length > 0) setWarnings(data.warnings);
      setModal(null);
      router.refresh();
    } else {
      setError(await readError(res, 'Error en generar els aparellaments'));
    }
    setLoadingGenerar(false);
  }

  const byes = playing.length % 2 === 1 ? 1 : 0;

  return (
    <>
      <Card>
        <div className="space-y-5">
          {participantsPicker}
          <p className="text-xs text-ink-3 -mt-3">
            {Math.floor(playing.length / 2)} partides{byes ? ' + 1 bye' : ''}
          </p>

          {error && (
            <div className="rounded-lg bg-loss-tint border border-loss px-4 py-3 text-sm text-loss">
              {error}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="rounded-lg bg-accent-tint border border-accent px-4 py-3 text-sm text-accent-ink space-y-1">
              {warnings.map((w, i) => <p key={i}>⚠ {w.message}</p>)}
            </div>
          )}

          <div className="flex items-center justify-end">
            <Button
              onClick={previsualitzar}
              loading={loadingPreview}
              disabled={playing.length < 2}
              title={playing.length < 2 ? 'Cal almenys 2 jugadors per generar aparellaments' : undefined}
            >
              Generar aparellaments
            </Button>
          </div>
        </div>
      </Card>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModal(null)} />
          <div className="relative bg-surface rounded-xl shadow-xl w-full max-w-sm flex flex-col max-h-[80vh]">
            <div className="px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
              <h2 className="text-base font-semibold text-ink">Ordre de seeding</h2>
              <p className="text-xs text-ink-3 mt-0.5">
                {modal.isFirstRound
                  ? 'Primera ronda — ordenat per BARRUF descendent'
                  : 'Ordenat per classificació actual'}
              </p>
            </div>

            <ol className="overflow-y-auto flex-1 divide-y divide-border px-1 py-1">
              {modal.seedingOrder.map(s => (
                <li key={s.entryId} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-6 text-right text-xs text-ink-3 font-mono flex-shrink-0">
                    {s.seed}
                  </span>
                  <span className="flex-1 font-medium text-ink truncate">{s.displayName}</span>
                  <div className="flex gap-2 text-xs text-ink-3 flex-shrink-0">
                    {s.rating != null && <span>BARRUF {s.rating}</span>}
                    {!modal.isFirstRound && <span>{s.points} pts</span>}
                  </div>
                </li>
              ))}
            </ol>

            <div className="px-5 py-4 border-t border-border flex justify-end gap-2 flex-shrink-0">
              <Button variant="ghost" onClick={() => setModal(null)} disabled={loadingGenerar}>
                Cancel·lar
              </Button>
              <Button onClick={generar} loading={loadingGenerar}>
                Generar aparellaments
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Mètode manual: taules fetes a mà o importades d'un CSV ───────────────────

function ManualAparellaments({
  tournamentId,
  roundId,
  participantsPerMatch,
  playing,
  absentIds,
  participantsPicker,
}: {
  tournamentId: string;
  roundId: string;
  participantsPerMatch: number;
  playing: Jugador[];
  absentIds: Set<string>;
  participantsPicker: React.ReactNode;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [taules, setTaules] = useState<Taula[]>([]);
  const [cua, setCua] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<PairingWarning[]>([]);
  const [loading, setLoading] = useState(false);

  const nomPerId = new Map(playing.map(p => [p.id, p.name]));
  const colocats = new Set([...taules.flatMap(t => t.entryIds), ...cua]);
  const sense_taula = playing.filter(p => !colocats.has(p.id));
  const seguentTaula = (taules.reduce((max, t) => Math.max(max, t.tableNumber), 0) || 0) + 1;

  function clicaJugador(id: string) {
    if (cua.includes(id)) {
      setCua(cua.filter(x => x !== id));
      return;
    }
    const next = [...cua, id];
    if (next.length >= participantsPerMatch) {
      setTaules([...taules, { tableNumber: seguentTaula, entryIds: next }]);
      setCua([]);
    } else {
      setCua(next);
    }
  }

  function tancaComABye() {
    if (cua.length === 0) return;
    setTaules([...taules, { tableNumber: seguentTaula, entryIds: cua }]);
    setCua([]);
  }

  function treuTaula(tableNumber: number) {
    setTaules(taules.filter(t => t.tableNumber !== tableNumber));
  }

  function handleImportCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    file.text().then(text => {
      const { rows, errors } = parseCsvPerNom(text, playing);
      if (errors.length > 0) {
        setError(errors.join(' · '));
        return;
      }
      const usatsJa = new Set(taules.flatMap(t => t.entryIds));
      const taulesJa = new Set(taules.map(t => t.tableNumber));
      const conflicte = rows.find(r => r.entryIds.some(id => usatsJa.has(id)) || taulesJa.has(r.tableNumber));
      if (conflicte) {
        setError(`La taula ${conflicte.tableNumber} del CSV repeteix un jugador o un número de taula ja fet servir.`);
        return;
      }
      setTaules([...taules, ...rows]);
    });
    if (fileRef.current) fileRef.current.value = '';
  }

  function descarregaPlantilla() {
    const capçalera = 'taula,jugador1,jugador2\n';
    const exemple = playing.slice(0, 2).map(p => p.name).join(',');
    const blob = new Blob([capçalera + (exemple ? `1,${exemple}\n` : '')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aparellaments-ronda-plantilla.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function crearAparellaments() {
    setLoading(true);
    setError('');
    setWarnings([]);

    const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${roundId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ absentEntryIds: [...absentIds], rows: taules }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.warnings?.length > 0) setWarnings(data.warnings);
      router.refresh();
    } else {
      setError(await readError(res, 'Error en crear els aparellaments'));
    }
    setLoading(false);
  }

  return (
    <Card>
      <div className="space-y-5">
        {participantsPicker}

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-ink-2">
              Fes les taules ({participantsPerMatch} per taula)
            </h3>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={descarregaPlantilla}>↓ Plantilla CSV</Button>
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>↑ Importar CSV</Button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportCsv} />
            </div>
          </div>
          <p className="text-xs text-ink-3 mb-3">
            Clica els jugadors en l&apos;ordre que vulguis asseure&apos;ls a la mateixa taula.
            {cua.length > 0 && cua.length < participantsPerMatch && ' Pots tancar-la abans d\'hora com a bye.'}
          </p>

          {sense_taula.length === 0 && taules.length === 0 ? (
            <p className="text-sm text-ink-3">No hi ha jugadors seleccionats.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {sense_taula.map(p => {
                const enCua = cua.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => clicaJugador(p.id)}
                    className={`px-2.5 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                      enCua
                        ? 'bg-accent-tint border-accent text-accent-ink font-semibold'
                        : 'bg-surface border-border text-ink-2 hover:border-ink-3'
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}

          {cua.length > 0 && cua.length < participantsPerMatch && (
            <div className="mt-2">
              <Button variant="ghost" size="sm" onClick={tancaComABye}>
                Tanca la taula {seguentTaula} amb {cua.length} jugador{cua.length !== 1 ? 's' : ''} (bye)
              </Button>
            </div>
          )}
        </div>

        {taules.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-ink-2 mb-2">Taules fetes ({taules.length})</h3>
            <ul className="space-y-1.5">
              {taules
                .slice()
                .sort((a, b) => a.tableNumber - b.tableNumber)
                .map(t => (
                  <li
                    key={t.tableNumber}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 text-sm"
                  >
                    <span className="font-mono text-xs text-ink-3 w-6 flex-shrink-0">#{t.tableNumber}</span>
                    <span className="flex-1 text-ink-2 truncate">
                      {t.entryIds.map(id => nomPerId.get(id) ?? '?').join(' vs ')}
                    </span>
                    <button
                      type="button"
                      onClick={() => treuTaula(t.tableNumber)}
                      className="text-ink-3 hover:text-loss cursor-pointer flex-shrink-0"
                      aria-label="Treu la taula"
                    >
                      ✕
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-loss-tint border border-loss px-4 py-3 text-sm text-loss">
            {error}
          </div>
        )}
        {warnings.length > 0 && (
          <div className="rounded-lg bg-accent-tint border border-accent px-4 py-3 text-sm text-accent-ink space-y-1">
            {warnings.map((w, i) => <p key={i}>⚠ {w.message}</p>)}
          </div>
        )}
        {sense_taula.length > 0 && taules.length > 0 && (
          <p className="text-xs text-ink-3">
            Encara falten {sense_taula.length} jugador{sense_taula.length !== 1 ? 's' : ''} per col·locar.
          </p>
        )}

        <div className="flex items-center justify-end">
          <Button
            onClick={crearAparellaments}
            loading={loading}
            disabled={taules.length === 0 || sense_taula.length > 0}
            title={sense_taula.length > 0 ? 'Col·loca o marca absents tots els jugadors abans de crear les taules' : undefined}
          >
            Crea els aparellaments
          </Button>
        </div>
      </div>
    </Card>
  );
}

function parseCsvPerNom(csvText: string, players: Jugador[]): { rows: Taula[]; errors: string[] } {
  const byName = new Map(players.map(p => [p.name.trim().toLowerCase(), p.id]));
  const lines = csvText.trim().split('\n').map(l => l.trim()).filter(Boolean);
  const errors: string[] = [];
  const rows: Taula[] = [];
  const usedTables = new Set<number>();
  const usedEntries = new Set<string>();

  const startLine = lines.length > 0 && isNaN(Number(lines[0].split(',')[0].trim())) ? 1 : 0;

  for (let i = startLine; i < lines.length; i++) {
    const lineNum = i + 1;
    const parts = lines[i].split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) {
      errors.push(`Línia ${lineNum}: cal almenys taula + un jugador`);
      continue;
    }
    const tableNumber = Number(parts[0]);
    if (!Number.isInteger(tableNumber) || tableNumber < 1) {
      errors.push(`Línia ${lineNum}: número de taula invàlid`);
      continue;
    }
    if (usedTables.has(tableNumber)) {
      errors.push(`Línia ${lineNum}: taula ${tableNumber} repetida al CSV`);
      continue;
    }

    const entryIds: string[] = [];
    let lineOk = true;
    for (const name of parts.slice(1)) {
      const id = byName.get(name.toLowerCase());
      if (!id) {
        errors.push(`Línia ${lineNum}: jugador desconegut "${name}"`);
        lineOk = false;
        break;
      }
      if (usedEntries.has(id)) {
        errors.push(`Línia ${lineNum}: "${name}" ja és a una altra taula`);
        lineOk = false;
        break;
      }
      entryIds.push(id);
    }
    if (!lineOk) continue;

    usedTables.add(tableNumber);
    for (const id of entryIds) usedEntries.add(id);
    rows.push({ tableNumber, entryIds });
  }

  return { rows, errors };
}
