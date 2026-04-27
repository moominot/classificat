'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import type {
  PhaseConfig, Tiebreaker, SeedingCriterion,
  SwissConfig, RoundRobinConfig, KingOfTheHillConfig,
} from '@/lib/pairing/types';
import { DEFAULT_SEEDING_CRITERIA } from '@/lib/pairing/types';

interface Grup { id: string; name: string }
interface Fase {
  id: string;
  order: number;
  name: string;
  method: string;
  startRound: number;
  endRound: number;
  tiebreakers: Tiebreaker[];
  config: PhaseConfig;
  isComplete: boolean;
}

const METODES = [
  { value: 'swiss',            label: 'Sistema suís' },
  { value: 'round_robin',      label: 'Round Robin' },
  { value: 'king_of_the_hill', label: 'Rei del turó' },
  { value: 'manual',           label: 'Manual / CSV' },
];

const DESEMPATS: { value: Tiebreaker; label: string }[] = [
  { value: 'median_buchholz', label: 'Median Buchholz' },
  { value: 'buchholz',        label: 'Buchholz' },
  { value: 'berger',          label: 'Berger (Sonneborn-Berger)' },
  { value: 'spread',          label: 'Diferència de puntuació (spread)' },
  { value: 'wins',            label: 'Nombre de victòries' },
  { value: 'cumulative',      label: 'Total punts a favor' },
  { value: 'avg_score',       label: 'Mitjana de puntuació a favor' },
  { value: 'direct_encounter', label: 'Encontre directe' },
];

const METHOD_BADGES: Record<string, { label: string; color: 'blue' | 'green' | 'purple' | 'gray' }> = {
  swiss:            { label: 'Suís',        color: 'blue' },
  round_robin:      { label: 'Round Robin', color: 'green' },
  king_of_the_hill: { label: 'Rei del turó', color: 'purple' },
  manual:           { label: 'Manual',      color: 'gray' },
};

export default function FasesClient({
  tournamentId,
  fases,
  grups,
}: {
  tournamentId: string;
  fases: Fase[];
  grups: Grup[];
}) {
  const router = useRouter();
  const [mostrarForm, setMostrarForm] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <p className="text-sm text-gray-500 flex-1">
          Defineix les fases del campionat. Cada fase cobreix un rang de rondes amb el seu sistema d&apos;aparellament.
        </p>
        {!mostrarForm && (
          <Button size="sm" onClick={() => setMostrarForm(true)}>+ Nova fase</Button>
        )}
      </div>

      {mostrarForm && (
        <Card>
          <CardHeader><CardTitle>Nova fase</CardTitle></CardHeader>
          <NovaFaseForm
            tournamentId={tournamentId}
            fases={fases}
            grups={grups}
            onDone={() => { setMostrarForm(false); router.refresh(); }}
            onCancel={() => setMostrarForm(false)}
          />
        </Card>
      )}

      {fases.length === 0 && !mostrarForm ? (
        <EmptyState
          title="Sense fases"
          description="Afegeix fases per definir com es generaran els aparellaments. Exemple: rondes 1–20 Round Robin per grups, rondes 21–28 Sistema Suís."
          action={<Button onClick={() => setMostrarForm(true)}>+ Nova fase</Button>}
        />
      ) : (
        <div className="space-y-3">
          {fases.map((fase) => (
            <FaseCard
              key={fase.id}
              fase={fase}
              grups={grups}
              tournamentId={tournamentId}
              fases={fases}
              onRefresh={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Targeta de fase ──────────────────────────────────────────────────────────

function FaseCard({
  fase, grups, tournamentId, fases, onRefresh,
}: {
  fase: Fase;
  grups: Grup[];
  tournamentId: string;
  fases: Fase[];
  onRefresh: () => void;
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const badge = METHOD_BADGES[fase.method] ?? { label: fase.method, color: 'gray' as const };
  const grupMap = new Map(grups.map(g => [g.id, g.name]));
  const configInfo = describeConfig(fase.config, grupMap);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError('');
    const res = await fetch(`/api/tournaments/${tournamentId}/phases/${fase.id}`, { method: 'DELETE' });
    if (res.ok) {
      onRefresh();
    } else {
      const d = await res.json();
      setDeleteError(d.error ?? 'Error en esborrar la fase');
      setDeleting(false);
    }
  }

  if (mode === 'edit') {
    return (
      <div className="bg-white border border-blue-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-gray-700 mb-4">Editar fase: {fase.name}</p>
        <EditarFaseForm
          tournamentId={tournamentId}
          fase={fase}
          fases={fases.filter(f => f.id !== fase.id)}
          grups={grups}
          onDone={() => { setMode('view'); onRefresh(); }}
          onCancel={() => setMode('view')}
        />
      </div>
    );
  }

  if (mode === 'delete') {
    return (
      <div className="bg-white border border-red-200 rounded-xl p-4 space-y-3">
        <p className="text-sm text-gray-800">
          Segur que vols esborrar la fase <strong>{fase.name}</strong>?
          S&apos;esborraran totes les rondes i aparellaments associats sense resultats.
        </p>
        {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
        <div className="flex gap-2">
          <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>Esborrar</Button>
          <Button variant="ghost" size="sm" onClick={() => { setMode('view'); setDeleteError(''); }}>Cancel·lar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-4">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-600">
        {fase.order}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-gray-900">{fase.name}</h3>
          <Badge color={badge.color}>{badge.label}</Badge>
          {fase.isComplete && <Badge color="gray">Completada</Badge>}
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Rondes {fase.startRound} – {fase.endRound}
          {' · '}
          {fase.endRound - fase.startRound + 1} ronda{fase.endRound - fase.startRound + 1 !== 1 ? 'es' : ''}
        </p>
        {configInfo && <p className="text-xs text-gray-400 mt-1">{configInfo}</p>}
        {fase.tiebreakers.length > 0 && (
          <p className="text-xs text-gray-400 mt-1">
            Desempats: {fase.tiebreakers.map(t =>
              DESEMPATS.find(d => d.value === t)?.label ?? t
            ).join(' → ')}
          </p>
        )}
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <Button size="sm" variant="ghost" onClick={() => setMode('edit')}>Editar</Button>
        <Button size="sm" variant="ghost" onClick={() => setMode('delete')}
          className="text-red-500 hover:bg-red-50">Esborrar</Button>
      </div>
    </div>
  );
}

function describeConfig(config: PhaseConfig, grupMap: Map<string, string>): string {
  if (config.method === 'round_robin') {
    const scope = config.scope === 'intra_group' ? 'intra-grupal'
      : config.scope === 'inter_group' ? 'inter-grupal' : 'global';
    const doble = config.doubleRound ? ' (doble volta)' : '';
    return `Round Robin ${scope}${doble}`;
  }
  if (config.method === 'swiss') {
    return config.carryStandingsFromPhaseIds.length > 0
      ? 'Hereta classificació de fases anteriors'
      : 'Classificació independent';
  }
  if (config.method === 'king_of_the_hill') {
    const top = config.topN ? `Top ${config.topN}` : 'Tots';
    return `${top} · ${config.carryStandingsFromPhaseIds.length > 0 ? 'Hereta classificació' : 'Classificació independent'}`;
  }
  return '';
}

// ─── Formulari editar fase ────────────────────────────────────────────────────

function EditarFaseForm({
  tournamentId,
  fase,
  fases,
  grups,
  onDone,
  onCancel,
}: {
  tournamentId: string;
  fase: Fase;
  fases: Fase[];
  grups: Grup[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [nom, setNom] = useState(fase.name);
  const [startRound, setStartRound] = useState(fase.startRound.toString());
  const [endRound, setEndRound] = useState(fase.endRound.toString());
  const [desempats, setDesempats] = useState<Tiebreaker[]>(fase.tiebreakers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const swissConfig = fase.method === 'swiss' ? (fase.config as SwissConfig) : null;
  const [swissAvoidRematches, setSwissAvoidRematches] = useState(swissConfig?.avoidRematches ?? true);
  const [swissCarry, setSwissCarry] = useState<string[]>(swissConfig?.carryStandingsFromPhaseIds ?? []);
  const [swissSeedingCriteria, setSwissSeedingCriteria] = useState<SeedingCriterion[]>(
    swissConfig?.seedingCriteria?.length ? swissConfig.seedingCriteria : DEFAULT_SEEDING_CRITERIA
  );

  const rrConfig = fase.method === 'round_robin' ? (fase.config as RoundRobinConfig) : null;
  const [rrScope, setRrScope] = useState<'intra_group' | 'inter_group' | 'all'>(rrConfig?.scope ?? 'all');
  const [rrDoble, setRrDoble] = useState(rrConfig?.doubleRound ?? false);

  const kothConfig = fase.method === 'king_of_the_hill' ? (fase.config as KingOfTheHillConfig) : null;
  const [kothTopN, setKothTopN] = useState(kothConfig?.topN?.toString() ?? '');
  const [kothCarry, setKothCarry] = useState<string[]>(kothConfig?.carryStandingsFromPhaseIds ?? []);

  function buildConfig(): PhaseConfig {
    if (fase.method === 'swiss') {
      return {
        method: 'swiss',
        avoidRematches: swissAvoidRematches,
        byeHandling: swissConfig?.byeHandling ?? 'lowest_ranked',
        scoreGroupWindowSize: swissConfig?.scoreGroupWindowSize ?? 2,
        carryStandingsFromPhaseIds: swissCarry,
        seedingCriteria: swissSeedingCriteria,
      };
    }
    if (fase.method === 'round_robin') {
      return { method: 'round_robin', scope: rrScope, doubleRound: rrDoble };
    }
    if (fase.method === 'king_of_the_hill') {
      return {
        method: 'king_of_the_hill',
        topN: kothTopN ? parseInt(kothTopN) : null,
        carryStandingsFromPhaseIds: kothCarry,
      };
    }
    return { method: 'manual', allowCsvImport: true };
  }

  function toggleDesempat(d: Tiebreaker) {
    setDesempats(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  function moveDesempat(d: Tiebreaker, dir: -1 | 1) {
    setDesempats(prev => {
      const i = prev.indexOf(d);
      if (i < 0) return prev;
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!nom.trim() || !startRound || !endRound) {
      setError('Cal nom, ronda inicial i ronda final');
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/phases/${fase.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nom.trim(),
        startRound: parseInt(startRound),
        endRound: parseInt(endRound),
        tiebreakers: desempats,
        config: buildConfig(),
      }),
    });
    if (res.ok) {
      onDone();
    } else {
      const d = await res.json();
      setError(d.error ?? 'Error en guardar la fase');
      setLoading(false);
    }
  }

  const methodLabel = METODES.find(m => m.value === fase.method)?.label ?? fase.method;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-1">
          <Input
            label="Nom de la fase"
            value={nom}
            onChange={e => setNom(e.target.value)}
            required
          />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700 mb-1">Mètode</p>
          <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">{methodLabel}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Ronda inicial"
            type="number"
            min={1}
            value={startRound}
            onChange={e => setStartRound(e.target.value)}
          />
          <Input
            label="Ronda final"
            type="number"
            min={startRound || 1}
            value={endRound}
            onChange={e => setEndRound(e.target.value)}
          />
        </div>
      </div>

      {fase.method === 'swiss' && (
        <ConfigSwiss
          avoidRematches={swissAvoidRematches}
          setAvoidRematches={setSwissAvoidRematches}
          carry={swissCarry}
          setCarry={setSwissCarry}
          seedingCriteria={swissSeedingCriteria}
          setSeedingCriteria={setSwissSeedingCriteria}
          fases={fases}
        />
      )}
      {fase.method === 'round_robin' && (
        <ConfigRoundRobin
          scope={rrScope}
          setScope={setRrScope}
          doble={rrDoble}
          setDoble={setRrDoble}
          grups={grups}
        />
      )}
      {fase.method === 'king_of_the_hill' && (
        <ConfigKotH
          topN={kothTopN}
          setTopN={setKothTopN}
          carry={kothCarry}
          setCarry={setKothCarry}
          fases={fases}
        />
      )}

      {fase.method !== 'manual' && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Ordre de desempats
            <span className="font-normal text-gray-400 ml-2">Selecciona i ordena</span>
          </p>
          <div className="space-y-1">
            {DESEMPATS.map(d => {
              const idx = desempats.indexOf(d.value);
              const actiu = idx >= 0;
              return (
                <div key={d.value} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${actiu ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-transparent'}`}>
                  <input
                    type="checkbox"
                    checked={actiu}
                    onChange={() => toggleDesempat(d.value)}
                    className="accent-blue-600"
                  />
                  <span className={`text-sm flex-1 ${actiu ? 'text-blue-800 font-medium' : 'text-gray-500'}`}>
                    {actiu ? `${idx + 1}. ` : ''}{d.label}
                  </span>
                  {actiu && (
                    <div className="flex gap-0.5">
                      <button type="button" onClick={() => moveDesempat(d.value, -1)}
                        className="p-0.5 text-blue-500 hover:text-blue-700 disabled:opacity-30" disabled={idx === 0}>▲</button>
                      <button type="button" onClick={() => moveDesempat(d.value, 1)}
                        className="p-0.5 text-blue-500 hover:text-blue-700 disabled:opacity-30" disabled={idx === desempats.length - 1}>▼</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" loading={loading}>Guardar canvis</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel·lar</Button>
      </div>
    </form>
  );
}

// ─── Formulari nova fase ──────────────────────────────────────────────────────

function NovaFaseForm({
  tournamentId,
  fases,
  grups,
  onDone,
  onCancel,
}: {
  tournamentId: string;
  fases: Fase[];
  grups: Grup[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [nom, setNom] = useState('');
  const [metode, setMetode] = useState<string>('swiss');
  const [startRound, setStartRound] = useState('');
  const [endRound, setEndRound] = useState('');
  const [desempats, setDesempats] = useState<Tiebreaker[]>(['median_buchholz', 'buchholz', 'spread']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [rrScope, setRrScope] = useState<'intra_group' | 'inter_group' | 'all'>('intra_group');
  const [rrDoble, setRrDoble] = useState(false);
  const [swissAvoidRematches, setSwissAvoidRematches] = useState(true);
  const [swissCarry, setSwissCarry] = useState<string[]>([]);
  const [swissSeedingCriteria, setSwissSeedingCriteria] = useState<SeedingCriterion[]>(DEFAULT_SEEDING_CRITERIA);
  const [kothTopN, setKothTopN] = useState('');
  const [kothCarry, setKothCarry] = useState<string[]>([]);

  const nextStart = fases.length > 0
    ? Math.max(...fases.map(f => f.endRound)) + 1
    : 1;

  function buildConfig(): PhaseConfig {
    if (metode === 'swiss') {
      return {
        method: 'swiss',
        avoidRematches: swissAvoidRematches,
        byeHandling: 'lowest_ranked',
        scoreGroupWindowSize: 2,
        carryStandingsFromPhaseIds: swissCarry,
        seedingCriteria: swissSeedingCriteria,
      };
    }
    if (metode === 'round_robin') {
      return { method: 'round_robin', scope: rrScope, doubleRound: rrDoble };
    }
    if (metode === 'king_of_the_hill') {
      return {
        method: 'king_of_the_hill',
        topN: kothTopN ? parseInt(kothTopN) : null,
        carryStandingsFromPhaseIds: kothCarry,
      };
    }
    return { method: 'manual', allowCsvImport: true };
  }

  function toggleDesempat(d: Tiebreaker) {
    setDesempats(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  function moveDesempat(d: Tiebreaker, dir: -1 | 1) {
    setDesempats(prev => {
      const i = prev.indexOf(d);
      if (i < 0) return prev;
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!nom.trim() || !startRound || !endRound) {
      setError('Cal nom, ronda inicial i ronda final');
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/phases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nom.trim(),
        method: metode,
        startRound: parseInt(startRound),
        endRound: parseInt(endRound),
        tiebreakers: desempats,
        config: buildConfig(),
      }),
    });
    if (res.ok) {
      onDone();
    } else {
      const d = await res.json();
      setError(d.error ?? 'Error en crear la fase');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-1">
          <Input
            label="Nom de la fase"
            value={nom}
            onChange={e => setNom(e.target.value)}
            placeholder="ex. Fase de grups"
            required
          />
        </div>
        <Select label="Mètode" value={metode} onChange={e => setMetode(e.target.value)}>
          {METODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Ronda inicial"
            type="number"
            min={1}
            value={startRound}
            onChange={e => setStartRound(e.target.value)}
            placeholder={nextStart.toString()}
          />
          <Input
            label="Ronda final"
            type="number"
            min={startRound || 1}
            value={endRound}
            onChange={e => setEndRound(e.target.value)}
          />
        </div>
      </div>

      {metode === 'swiss' && (
        <ConfigSwiss
          avoidRematches={swissAvoidRematches}
          setAvoidRematches={setSwissAvoidRematches}
          carry={swissCarry}
          setCarry={setSwissCarry}
          seedingCriteria={swissSeedingCriteria}
          setSeedingCriteria={setSwissSeedingCriteria}
          fases={fases}
        />
      )}
      {metode === 'round_robin' && (
        <ConfigRoundRobin
          scope={rrScope}
          setScope={setRrScope}
          doble={rrDoble}
          setDoble={setRrDoble}
          grups={grups}
        />
      )}
      {metode === 'king_of_the_hill' && (
        <ConfigKotH
          topN={kothTopN}
          setTopN={setKothTopN}
          carry={kothCarry}
          setCarry={setKothCarry}
          fases={fases}
        />
      )}

      {metode !== 'manual' && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Ordre de desempats
            <span className="font-normal text-gray-400 ml-2">Selecciona i ordena</span>
          </p>
          <div className="space-y-1">
            {DESEMPATS.map(d => {
              const idx = desempats.indexOf(d.value);
              const actiu = idx >= 0;
              return (
                <div key={d.value} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${actiu ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-transparent'}`}>
                  <input
                    type="checkbox"
                    checked={actiu}
                    onChange={() => toggleDesempat(d.value)}
                    className="accent-blue-600"
                  />
                  <span className={`text-sm flex-1 ${actiu ? 'text-blue-800 font-medium' : 'text-gray-500'}`}>
                    {actiu ? `${idx + 1}. ` : ''}{d.label}
                  </span>
                  {actiu && (
                    <div className="flex gap-0.5">
                      <button type="button" onClick={() => moveDesempat(d.value, -1)}
                        className="p-0.5 text-blue-500 hover:text-blue-700 disabled:opacity-30" disabled={idx === 0}>▲</button>
                      <button type="button" onClick={() => moveDesempat(d.value, 1)}
                        className="p-0.5 text-blue-500 hover:text-blue-700 disabled:opacity-30" disabled={idx === desempats.length - 1}>▼</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" loading={loading}>Crear fase</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel·lar</Button>
      </div>
    </form>
  );
}

// ─── Sub-configuracions per mètode ───────────────────────────────────────────

const SEEDING_CRITERION_LABELS: Record<SeedingCriterion, string> = {
  points: 'Punts',
  elo:    'BARRUF',
  rank:   'Classificació',
  name:   'Nom',
};
const ALL_SEEDING_CRITERIA: SeedingCriterion[] = ['points', 'elo', 'rank', 'name'];

function ConfigSwiss({
  avoidRematches, setAvoidRematches, carry, setCarry,
  seedingCriteria, setSeedingCriteria, fases,
}: {
  avoidRematches: boolean;
  setAvoidRematches: (v: boolean) => void;
  carry: string[];
  setCarry: (v: string[]) => void;
  seedingCriteria: SeedingCriterion[];
  setSeedingCriteria: (v: SeedingCriterion[]) => void;
  fases: Fase[];
}) {
  function toggleCriterion(c: SeedingCriterion) {
    setSeedingCriteria(
      seedingCriteria.includes(c)
        ? seedingCriteria.filter(x => x !== c)
        : [...seedingCriteria, c]
    );
  }

  function moveCriterion(c: SeedingCriterion, dir: -1 | 1) {
    const i = seedingCriteria.indexOf(c);
    if (i < 0) return;
    const next = [...seedingCriteria];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setSeedingCriteria(next);
  }

  return (
    <div className="bg-blue-50 rounded-lg p-4 space-y-3">
      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Configuració Suís</p>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={avoidRematches} onChange={e => setAvoidRematches(e.target.checked)} className="accent-blue-600" />
        Evitar revanxes
      </label>

      <div>
        <p className="text-sm font-medium text-gray-700 mb-1">Ordre de seeding</p>
        <div className="space-y-1">
          {ALL_SEEDING_CRITERIA.map(c => {
            const active = seedingCriteria.includes(c);
            const pos = seedingCriteria.indexOf(c);
            return (
              <div key={c} className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${active ? 'bg-blue-100 text-blue-800' : 'text-gray-500'}`}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleCriterion(c)}
                  className="accent-blue-600 flex-shrink-0"
                />
                {active && (
                  <span className="w-4 text-xs font-mono text-blue-500 flex-shrink-0">{pos + 1}.</span>
                )}
                <span className={active ? '' : 'ml-4'}>{SEEDING_CRITERION_LABELS[c]}</span>
                {active && (
                  <div className="ml-auto flex gap-0.5">
                    <button type="button" onClick={() => moveCriterion(c, -1)} disabled={pos === 0}
                      className="px-1 text-blue-400 hover:text-blue-700 disabled:opacity-30 text-xs">▲</button>
                    <button type="button" onClick={() => moveCriterion(c, 1)} disabled={pos === seedingCriteria.length - 1}
                      className="px-1 text-blue-400 hover:text-blue-700 disabled:opacity-30 text-xs">▼</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {fases.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-1">Heretar classificació de:</p>
          {fases.map(f => (
            <label key={f.id} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={carry.includes(f.id)}
                onChange={e => setCarry(e.target.checked ? [...carry, f.id] : carry.filter(x => x !== f.id))}
                className="accent-blue-600"
              />
              Fase {f.order}: {f.name} (rondes {f.startRound}–{f.endRound})
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfigRoundRobin({
  scope, setScope, doble, setDoble, grups,
}: {
  scope: 'intra_group' | 'inter_group' | 'all';
  setScope: (v: 'intra_group' | 'inter_group' | 'all') => void;
  doble: boolean;
  setDoble: (v: boolean) => void;
  grups: Grup[];
}) {
  return (
    <div className="bg-green-50 rounded-lg p-4 space-y-3">
      <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Configuració Round Robin</p>
      <Select
        label="Àmbit"
        value={scope}
        onChange={e => setScope(e.target.value as typeof scope)}
      >
        <option value="all">Tots els jugadors (sense grups)</option>
        <option value="intra_group" disabled={grups.length === 0}>
          Intra-grupal (round robin dins de cada grup)
        </option>
        <option value="inter_group" disabled={grups.length < 2}>
          Inter-grupal (jugadors d&apos;un grup contra els d&apos;un altre)
        </option>
      </Select>
      {grups.length === 0 && scope !== 'all' && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">
          Cal crear grups primer per usar els modes intra/inter-grupal.
        </p>
      )}
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={doble} onChange={e => setDoble(e.target.checked)} className="accent-green-600" />
        Doble volta (cada parella juga dos cops)
      </label>
    </div>
  );
}

function ConfigKotH({
  topN, setTopN, carry, setCarry, fases,
}: {
  topN: string;
  setTopN: (v: string) => void;
  carry: string[];
  setCarry: (v: string[]) => void;
  fases: Fase[];
}) {
  return (
    <div className="bg-purple-50 rounded-lg p-4 space-y-3">
      <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Configuració Rei del turó</p>
      <Input
        label="Limitar als N millors (deixar buit per a tots)"
        type="number"
        min={2}
        value={topN}
        onChange={e => setTopN(e.target.value)}
        placeholder="ex. 8"
      />
      {fases.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-1">Heretar classificació de:</p>
          {fases.map(f => (
            <label key={f.id} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={carry.includes(f.id)}
                onChange={e => setCarry(e.target.checked ? [...carry, f.id] : carry.filter(x => x !== f.id))}
                className="accent-purple-600"
              />
              Fase {f.order}: {f.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
