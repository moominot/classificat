'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCanManage } from '@/components/ViewerContext';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import { readError } from '@/lib/http';
import type {
  PhaseConfig, SeedingCriterion,
  SwissConfig, SwissFideConfig, RoundRobinConfig, KingOfTheHillConfig,
} from '@/lib/pairing/types';
import { DEFAULT_SEEDING_CRITERIA } from '@/lib/pairing/types';
import { availableTiebreakers } from '@/lib/pairing/tiebreakers';

interface Grup { id: string; name: string }
interface Fase {
  id: string;
  order: number;
  name: string;
  method: string;
  startRound: number;
  endRound: number;
  tiebreakers: string[];
  participantsPerMatch: number;
  config: PhaseConfig;
  isComplete: boolean;
}

const METODES = [
  { value: 'swiss_fide',       label: 'Sistema suís FIDE (recomanat)' },
  { value: 'swiss',            label: 'Sistema suís (clàssic)' },
  { value: 'round_robin',      label: 'Round Robin' },
  { value: 'king_of_the_hill', label: 'Rei del turó' },
  { value: 'manual',           label: 'Manual / CSV' },
];

/**
 * Els desempats surten del registre, no d'una llista escrita a mà
 * (docs/pla-rols.md §11.3), i es filtren per mida de taula: amb més de dos
 * per partida, els que es basen en els oponents deixen de tenir sentit
 * (§12.10).
 */
function desempatsDisponibles(participantsPerMatch: number) {
  return availableTiebreakers({ participantsPerMatch }).map((def) => ({
    value: def.key,
    label: def.label,
  }));
}

const TOTS_ELS_DESEMPATS = desempatsDisponibles(2);

/**
 * Tria i ordre de desempats, amb arrossegament.
 *
 * El drag-and-drop natiu d'HTML5 no funciona al mòbil (sense events táctils),
 * així que es fa a mà amb Pointer Events — el mateix API serveix per a ratolí
 * i dit. Els botons ▲▼ es mantenen al costat per precisió i accessibilitat.
 */
function DesempatsPicker({
  participantsPerMatch,
  value,
  onChange,
}: {
  participantsPerMatch: number;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const disponibles = desempatsDisponibles(participantsPerMatch);
  const labelOf = (v: string) => disponibles.find(d => d.value === v)?.label ?? v;
  const noSeleccionats = disponibles.filter(d => !value.includes(d.value));

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  function handlePointerMove(e: React.PointerEvent) {
    if (dragIndex === null) return;
    for (const [idx, el] of itemRefs.current) {
      const rect = el.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
        setOverIndex(idx);
        return;
      }
    }
  }

  function handlePointerUp() {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      const next = [...value];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(overIndex, 0, moved);
      onChange(next);
    }
    setDragIndex(null);
    setOverIndex(null);
  }

  function move(v: string, dir: -1 | 1) {
    const i = value.indexOf(v);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  function remove(v: string) {
    onChange(value.filter(x => x !== v));
  }

  function add(v: string) {
    onChange([...value, v]);
  }

  return (
    <div>
      <p className="text-sm font-medium text-ink-2 mb-2">
        Ordre de desempats
        <span className="font-normal text-ink-3 ml-2">Arrossega per reordenar</span>
      </p>

      {value.length === 0 ? (
        <p className="text-xs text-ink-3 mb-2">Cap desempat triat — només es desempatarà per punts.</p>
      ) : (
        <div className="space-y-1 mb-2">
          {value.map((v, i) => (
            <div
              key={v}
              ref={el => { if (el) itemRefs.current.set(i, el); else itemRefs.current.delete(i); }}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-2 bg-accent-tint border transition-colors ${
                dragIndex === i ? 'opacity-50' : overIndex === i && dragIndex !== null ? 'border-accent-ink' : 'border-accent'
              }`}
            >
              <button
                type="button"
                onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setDragIndex(i); }}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="touch-none cursor-grab active:cursor-grabbing text-accent-ink p-1.5 -ml-1 flex-shrink-0"
                aria-label="Arrossega per reordenar"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="8" cy="6" r="1.6" /><circle cx="16" cy="6" r="1.6" />
                  <circle cx="8" cy="12" r="1.6" /><circle cx="16" cy="12" r="1.6" />
                  <circle cx="8" cy="18" r="1.6" /><circle cx="16" cy="18" r="1.6" />
                </svg>
              </button>
              <span className="w-4 text-xs font-mono text-accent-ink flex-shrink-0">{i + 1}.</span>
              <span className="text-sm flex-1 text-accent-ink font-medium truncate">{labelOf(v)}</span>
              <div className="flex gap-0.5 flex-shrink-0">
                <button type="button" onClick={() => move(v, -1)}
                  className="p-1 text-accent-ink disabled:opacity-30" disabled={i === 0} aria-label="Puja">▲</button>
                <button type="button" onClick={() => move(v, 1)}
                  className="p-1 text-accent-ink disabled:opacity-30" disabled={i === value.length - 1} aria-label="Baixa">▼</button>
              </div>
              <button type="button" onClick={() => remove(v)}
                className="p-1 text-accent-ink hover:text-loss flex-shrink-0" aria-label="Treu">✕</button>
            </div>
          ))}
        </div>
      )}

      {noSeleccionats.length > 0 && (
        <div>
          {value.length > 0 && <p className="text-xs text-ink-3 mb-1">Afegeix-ne:</p>}
          <div className="flex flex-wrap gap-1.5">
            {noSeleccionats.map(d => (
              <button
                key={d.value}
                type="button"
                onClick={() => add(d.value)}
                className="px-2.5 py-1.5 rounded-lg border border-border text-xs text-ink-2 hover:border-ink-3 hover:bg-surface-2 transition-colors cursor-pointer"
              >
                + {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const METHOD_BADGES: Record<string, { label: string; color: 'blue' | 'green' | 'purple' | 'gray' }> = {
  swiss_fide:       { label: 'Suís FIDE',   color: 'blue' },
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
  const canManage = useCanManage();
  const [mostrarForm, setMostrarForm] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <p className="text-sm text-ink-3 flex-1">
          Defineix les fases del campionat. Cada fase cobreix un rang de rondes amb el seu sistema d&apos;aparellament.
        </p>
        {canManage && !mostrarForm && (
          <Button size="sm" onClick={() => setMostrarForm(true)}>+ Nova fase</Button>
        )}
      </div>

      {canManage && mostrarForm && (
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
          action={canManage ? <Button onClick={() => setMostrarForm(true)}>+ Nova fase</Button> : undefined}
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
  const canManage = useCanManage();
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
      setDeleteError(await readError(res, 'Error en esborrar la fase'));
      setDeleting(false);
    }
  }

  if (mode === 'edit') {
    return (
      <div className="bg-surface border border-accent rounded-xl p-4">
        <p className="text-sm font-semibold text-ink-2 mb-4">Editar fase: {fase.name}</p>
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
      <div className="bg-surface border border-loss rounded-xl p-4 space-y-3">
        <p className="text-sm text-ink-2">
          Segur que vols esborrar la fase <strong>{fase.name}</strong>?
          S&apos;esborraran totes les rondes i aparellaments associats sense resultats.
        </p>
        {deleteError && <p className="text-sm text-loss">{deleteError}</p>}
        <div className="flex gap-2">
          <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>Esborrar</Button>
          <Button variant="ghost" size="sm" onClick={() => { setMode('view'); setDeleteError(''); }}>Cancel·lar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="p-4 flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center font-bold text-ink-2 text-sm">
          {fase.order}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-ink">{fase.name}</h3>
            <Badge color={badge.color}>{badge.label}</Badge>
            {fase.isComplete && <Badge color="gray">Completada</Badge>}
          </div>
          <p className="text-sm text-ink-3 mt-1">
            Rondes {fase.startRound}–{fase.endRound}
            {' · '}
            {fase.endRound - fase.startRound + 1} ronda{fase.endRound - fase.startRound + 1 !== 1 ? 'es' : ''}
          </p>
          {configInfo && <p className="text-xs text-ink-3 mt-1">{configInfo}</p>}
          {fase.tiebreakers.length > 0 && (
            <p className="text-xs text-ink-3 mt-1 leading-relaxed">
              Desempats: {fase.tiebreakers.map(t =>
                TOTS_ELS_DESEMPATS.find(d => d.value === t)?.label ?? t
              ).join(' → ')}
            </p>
          )}
        </div>
      </div>
      {canManage && (
        <div className="border-t border-border px-3 py-2 flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setMode('edit')}>Editar</Button>
          <Button size="sm" variant="ghost" onClick={() => setMode('delete')}
            className="text-loss hover:bg-loss-tint">Esborrar</Button>
        </div>
      )}
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
  if (config.method === 'swiss_fide') {
    return config.carryStandingsFromPhaseIds.length > 0
      ? 'FIDE Dutch · Hereta classificació de fases anteriors'
      : 'FIDE Dutch · Classificació independent';
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
  const [desempats, setDesempats] = useState<string[]>(fase.tiebreakers);
  const [participantsPerMatch, setParticipantsPerMatch] = useState(fase.participantsPerMatch ?? 2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const swissConfig = fase.method === 'swiss' ? (fase.config as SwissConfig) : null;
  const [swissAvoidRematches, setSwissAvoidRematches] = useState(swissConfig?.avoidRematches ?? true);
  const [swissCarry, setSwissCarry] = useState<string[]>(swissConfig?.carryStandingsFromPhaseIds ?? []);
  const [swissSeedingCriteria, setSwissSeedingCriteria] = useState<SeedingCriterion[]>(
    swissConfig?.seedingCriteria?.length ? swissConfig.seedingCriteria : [...DEFAULT_SEEDING_CRITERIA]
  );

  const swissFideConfig = fase.method === 'swiss_fide' ? (fase.config as SwissFideConfig) : null;
  const [swissFideScope, setSwissFideScope] = useState<'all' | 'intra_group'>(swissFideConfig?.scope ?? 'all');
  const [swissFideCarry, setSwissFideCarry] = useState<string[]>(swissFideConfig?.carryStandingsFromPhaseIds ?? []);
  const [swissFideExpectedRounds, setSwissFideExpectedRounds] = useState(
    swissFideConfig?.expectedRounds?.toString() ?? ''
  );

  const rrConfig = fase.method === 'round_robin' ? (fase.config as RoundRobinConfig) : null;
  const [rrScope, setRrScope] = useState<'intra_group' | 'inter_group' | 'all'>(rrConfig?.scope ?? 'all');
  const [rrDoble, setRrDoble] = useState(rrConfig?.doubleRound ?? false);

  const kothConfig = fase.method === 'king_of_the_hill' ? (fase.config as KingOfTheHillConfig) : null;
  const [kothTopN, setKothTopN] = useState(kothConfig?.topN?.toString() ?? '');
  const [kothCarry, setKothCarry] = useState<string[]>(kothConfig?.carryStandingsFromPhaseIds ?? []);

  function buildConfig(): PhaseConfig {
    if (fase.method === 'swiss_fide') {
      return {
        method: 'swiss_fide',
        scope: swissFideScope,
        carryStandingsFromPhaseIds: swissFideCarry,
        expectedRounds: swissFideExpectedRounds ? parseInt(swissFideExpectedRounds) : undefined,
      };
    }
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
        participantsPerMatch,
        config: buildConfig(),
      }),
    });
    if (res.ok) {
      onDone();
    } else {
      setError(await readError(res, 'Error en guardar la fase'));
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
          <p className="text-sm font-medium text-ink-2 mb-1">Mètode</p>
          <p className="text-sm text-ink-3 bg-surface-2 border border-border rounded-lg px-3 py-2">{methodLabel}</p>
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
        {/*
          Mida de taula: amb més de dos, el suís i el rei del turó deixen de
          ser aplicables i els desempats basats en oponents desapareixen de la
          llista (docs/pla-rols.md §13.1 #8 i §12.10).
        */}
        <Input
          label="Jugadors per partida"
          type="number"
          min={2}
          max={8}
          value={participantsPerMatch.toString()}
          onChange={e => setParticipantsPerMatch(Math.max(2, parseInt(e.target.value) || 2))}
          hint={participantsPerMatch > 2 ? 'Només round robin i manual' : undefined}
        />
      </div>

      {fase.method === 'swiss_fide' && (
        <ConfigSwissFide
          scope={swissFideScope}
          setScope={setSwissFideScope}
          carry={swissFideCarry}
          setCarry={setSwissFideCarry}
          expectedRounds={swissFideExpectedRounds}
          setExpectedRounds={setSwissFideExpectedRounds}
          fases={fases}
          grups={grups}
        />
      )}
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
        <DesempatsPicker participantsPerMatch={participantsPerMatch} value={desempats} onChange={setDesempats} />
      )}

      {error && <p className="text-sm text-loss">{error}</p>}

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
  const [metode, setMetode] = useState<string>('swiss_fide');
  const [startRound, setStartRound] = useState('');
  const [endRound, setEndRound] = useState('');
  const [desempats, setDesempats] = useState<string[]>(['median_buchholz', 'buchholz', 'spread']);
  const [participantsPerMatch, setParticipantsPerMatch] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [rrScope, setRrScope] = useState<'intra_group' | 'inter_group' | 'all'>('intra_group');
  const [rrDoble, setRrDoble] = useState(false);
  const [swissAvoidRematches, setSwissAvoidRematches] = useState(true);
  const [swissCarry, setSwissCarry] = useState<string[]>([]);
  const [swissSeedingCriteria, setSwissSeedingCriteria] = useState<SeedingCriterion[]>([...DEFAULT_SEEDING_CRITERIA]);
  const [swissFideScope, setSwissFideScope] = useState<'all' | 'intra_group'>('all');
  const [swissFideCarry, setSwissFideCarry] = useState<string[]>([]);
  const [swissFideExpectedRounds, setSwissFideExpectedRounds] = useState('');
  const [kothTopN, setKothTopN] = useState('');
  const [kothCarry, setKothCarry] = useState<string[]>([]);

  const nextStart = fases.length > 0
    ? Math.max(...fases.map(f => f.endRound)) + 1
    : 1;

  function buildConfig(): PhaseConfig {
    if (metode === 'swiss_fide') {
      return {
        method: 'swiss_fide',
        scope: swissFideScope,
        carryStandingsFromPhaseIds: swissFideCarry,
        expectedRounds: swissFideExpectedRounds ? parseInt(swissFideExpectedRounds) : undefined,
      };
    }
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
        participantsPerMatch,
        config: buildConfig(),
      }),
    });
    if (res.ok) {
      onDone();
    } else {
      setError(await readError(res, 'Error en crear la fase'));
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
        {/*
          Mida de taula: amb més de dos, el suís i el rei del turó deixen de
          ser aplicables i els desempats basats en oponents desapareixen de la
          llista (docs/pla-rols.md §13.1 #8 i §12.10).
        */}
        <Input
          label="Jugadors per partida"
          type="number"
          min={2}
          max={8}
          value={participantsPerMatch.toString()}
          onChange={e => setParticipantsPerMatch(Math.max(2, parseInt(e.target.value) || 2))}
          hint={participantsPerMatch > 2 ? 'Només round robin i manual' : undefined}
        />
      </div>

      {metode === 'swiss_fide' && (
        <ConfigSwissFide
          scope={swissFideScope}
          setScope={setSwissFideScope}
          carry={swissFideCarry}
          setCarry={setSwissFideCarry}
          expectedRounds={swissFideExpectedRounds}
          setExpectedRounds={setSwissFideExpectedRounds}
          fases={fases}
          grups={grups}
        />
      )}
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
        <DesempatsPicker participantsPerMatch={participantsPerMatch} value={desempats} onChange={setDesempats} />
      )}

      {error && <p className="text-sm text-loss">{error}</p>}

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
    <div className="bg-accent-tint rounded-lg p-4 space-y-3">
      <p className="text-xs font-semibold text-accent-ink uppercase tracking-wide">Configuració Suís</p>
      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" checked={avoidRematches} onChange={e => setAvoidRematches(e.target.checked)} className="accent-current text-accent" />
        Evitar revanxes
      </label>

      <div>
        <p className="text-sm font-medium text-ink-2 mb-1">Ordre de seeding</p>
        <div className="space-y-1">
          {ALL_SEEDING_CRITERIA.map(c => {
            const active = seedingCriteria.includes(c);
            const pos = seedingCriteria.indexOf(c);
            return (
              <div key={c} className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${active ? 'bg-accent-tint text-accent-ink' : 'text-ink-3'}`}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleCriterion(c)}
                  className="accent-current text-accent flex-shrink-0"
                />
                {active && (
                  <span className="w-4 text-xs font-mono text-accent-ink flex-shrink-0">{pos + 1}.</span>
                )}
                <span className={active ? '' : 'ml-4'}>{SEEDING_CRITERION_LABELS[c]}</span>
                {active && (
                  <div className="ml-auto flex gap-0.5">
                    <button type="button" onClick={() => moveCriterion(c, -1)} disabled={pos === 0}
                      className="px-1 text-accent-ink hover:text-accent-ink disabled:opacity-30 text-xs">▲</button>
                    <button type="button" onClick={() => moveCriterion(c, 1)} disabled={pos === seedingCriteria.length - 1}
                      className="px-1 text-accent-ink hover:text-accent-ink disabled:opacity-30 text-xs">▼</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {fases.length > 0 && (
        <div>
          <p className="text-sm font-medium text-ink-2 mb-1">Heretar classificació de:</p>
          {fases.map(f => (
            <label key={f.id} className="flex items-center gap-2 text-sm text-ink-2">
              <input
                type="checkbox"
                checked={carry.includes(f.id)}
                onChange={e => setCarry(e.target.checked ? [...carry, f.id] : carry.filter(x => x !== f.id))}
                className="accent-current text-accent"
              />
              Fase {f.order}: {f.name} (rondes {f.startRound}–{f.endRound})
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfigSwissFide({
  scope, setScope, carry, setCarry, expectedRounds, setExpectedRounds, fases, grups,
}: {
  scope: 'all' | 'intra_group';
  setScope: (v: 'all' | 'intra_group') => void;
  carry: string[];
  setCarry: (v: string[]) => void;
  expectedRounds: string;
  setExpectedRounds: (v: string) => void;
  fases: Fase[];
  grups: Grup[];
}) {
  return (
    <div className="bg-accent-tint rounded-lg p-4 space-y-3">
      <p className="text-xs font-semibold text-accent-ink uppercase tracking-wide">Configuració Suís FIDE</p>
      <p className="text-xs text-accent-ink">
        Usa l&apos;algorisme holandès FIDE amb matching global òptim (blossom). Gestiona automàticament revanxes, floats i bye.
      </p>
      <Select
        label="Àmbit"
        value={scope}
        onChange={e => setScope(e.target.value as 'all' | 'intra_group')}
      >
        <option value="all">Tots els jugadors (global)</option>
        <option value="intra_group" disabled={grups.length === 0}>
          Per grups (Swiss independent dins de cada grup)
        </option>
      </Select>
      {grups.length === 0 && scope === 'intra_group' && (
        <p className="text-xs text-accent-ink bg-accent-tint rounded p-2">
          Cal crear grups primer per usar el mode per grups.
        </p>
      )}
      <Input
        label="Total de rondes previstes (opcional)"
        type="number"
        min={1}
        value={expectedRounds}
        onChange={e => setExpectedRounds(e.target.value)}
        placeholder="ex. 7"
      />
      <p className="text-xs text-ink-3">
        Indica el total de rondes per optimitzar l&apos;assignació del bye a les darreres rondes.
      </p>
      {fases.length > 0 && (
        <div>
          <p className="text-sm font-medium text-ink-2 mb-1">Heretar classificació de:</p>
          {fases.map(f => (
            <label key={f.id} className="flex items-center gap-2 text-sm text-ink-2">
              <input
                type="checkbox"
                checked={carry.includes(f.id)}
                onChange={e => setCarry(e.target.checked ? [...carry, f.id] : carry.filter(x => x !== f.id))}
                className="accent-current text-accent"
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
    <div className="bg-win-tint rounded-lg p-4 space-y-3">
      <p className="text-xs font-semibold text-win uppercase tracking-wide">Configuració Round Robin</p>
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
        <p className="text-xs text-accent-ink bg-accent-tint rounded p-2">
          Cal crear grups primer per usar els modes intra/inter-grupal.
        </p>
      )}
      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" checked={doble} onChange={e => setDoble(e.target.checked)} className="accent-current text-win" />
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
    <div className="bg-accent-tint rounded-lg p-4 space-y-3">
      <p className="text-xs font-semibold text-accent-ink uppercase tracking-wide">Configuració Rei del turó</p>
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
          <p className="text-sm font-medium text-ink-2 mb-1">Heretar classificació de:</p>
          {fases.map(f => (
            <label key={f.id} className="flex items-center gap-2 text-sm text-ink-2">
              <input
                type="checkbox"
                checked={carry.includes(f.id)}
                onChange={e => setCarry(e.target.checked ? [...carry, f.id] : carry.filter(x => x !== f.id))}
                className="accent-current text-accent"
              />
              Fase {f.order}: {f.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
