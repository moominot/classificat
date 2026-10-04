'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCanManage } from '@/components/ViewerContext';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import { readError } from '@/lib/http';
import type {
  PhaseConfig, SeedingCriterion, Tag,
  SwissConfig, SwissFideConfig, RoundRobinConfig, KingOfTheHillConfig,
} from '@/lib/pairing/types';
import type { EntryPairExclusion, TagPairExclusion } from '@/db/types';
import { DEFAULT_SEEDING_CRITERIA } from '@/lib/pairing/types';
import { availableTiebreakers } from '@/lib/pairing/tiebreakers';

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
  standingsLive: boolean;
}

interface EntrantOption {
  id: string;
  displayName: string;
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

/** Si la classificació de la fase compta també les rondes obertes o només les tancades. */
function ModeClassificacio({ value, onChange }: { value: boolean; onChange: (live: boolean) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink mb-1.5">Classificació</label>
      <div className="flex gap-2">
        {[
          { live: false, label: 'Només rondes tancades' },
          { live: true, label: 'En temps real' },
        ].map((o) => (
          <button
            key={String(o.live)}
            type="button"
            onClick={() => onChange(o.live)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              value === o.live ? 'bg-accent text-surface' : 'bg-surface-2 text-ink-2 hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-3 mt-1.5">
        En temps real, els resultats de la ronda oberta ja compten a la classificació pública.
      </p>
    </div>
  );
}

/** Treu files incompletes o amb el mateix jugador/etiqueta a banda i banda abans d'enviar. */
function cleanEntryExclusions(rules: EntryPairExclusion[]): EntryPairExclusion[] {
  return rules.filter(r => r.entryIds[0] && r.entryIds[1] && r.entryIds[0] !== r.entryIds[1]);
}
function cleanTagExclusions(rules: TagPairExclusion[]): TagPairExclusion[] {
  return rules.filter(r => r.tagIds[0] && r.tagIds[1] && r.tagIds[0] !== r.tagIds[1]);
}

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
  tags,
  entrants,
}: {
  tournamentId: string;
  fases: Fase[];
  tags: Tag[];
  entrants: EntrantOption[];
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

      {canManage && (
        <Modal open={mostrarForm} onClose={() => setMostrarForm(false)} title="Nova fase" maxWidth="2xl">
          <NovaFaseForm
            tournamentId={tournamentId}
            fases={fases}
            tags={tags}
            entrants={entrants}
            onDone={() => { setMostrarForm(false); router.refresh(); }}
            onCancel={() => setMostrarForm(false)}
          />
        </Modal>
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
              tags={tags}
              entrants={entrants}
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
  fase, tags, entrants, tournamentId, fases, onRefresh,
}: {
  fase: Fase;
  tags: Tag[];
  entrants: EntrantOption[];
  tournamentId: string;
  fases: Fase[];
  onRefresh: () => void;
}) {
  const canManage = useCanManage();
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const badge = METHOD_BADGES[fase.method] ?? { label: fase.method, color: 'gray' as const };
  const tagMap = new Map(tags.map(t => [t.id, t.name]));
  const configInfo = describeConfig(fase.config, tagMap);

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
          tags={tags}
          entrants={entrants}
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
          <p className="text-xs text-ink-3 mt-1">
            Classificació: {fase.standingsLive ? 'en temps real' : 'només rondes tancades'}
          </p>
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

function describeConfig(config: PhaseConfig, tagMap: Map<string, string>): string {
  const noms = (ids: string[]) => ids.map(id => tagMap.get(id) ?? '?').join(', ');

  if (config.method === 'round_robin') {
    const doble = config.doubleRound ? ' (doble volta)' : '';
    if (config.scope === 'intra_tag') return `Round Robin intra-etiqueta${doble} (${noms(config.tagIds)})`;
    if (config.scope === 'inter_tag') return `Round Robin interetiquetes${doble} (${noms(config.tagIds)})`;
    return `Round Robin global${doble}`;
  }
  if (config.method === 'swiss_fide') {
    const base = config.scope === 'intra_tag' ? `FIDE Dutch per etiqueta (${noms(config.tagIds)})` : 'FIDE Dutch global';
    return config.carryStandingsFromPhaseIds.length > 0
      ? `${base} · Hereta classificació de fases anteriors`
      : `${base} · Classificació independent`;
  }
  if (config.method === 'swiss') {
    const base = config.scope === 'intra_tag' ? `Suís per etiqueta (${noms(config.tagIds)})` : 'Suís global';
    return config.carryStandingsFromPhaseIds.length > 0
      ? `${base} · Hereta classificació de fases anteriors`
      : `${base} · Classificació independent`;
  }
  if (config.method === 'king_of_the_hill') {
    const top = config.topN ? `Top ${config.topN}` : 'Tots';
    const base = config.scope === 'intra_tag' ? `${top} per etiqueta (${noms(config.tagIds)})` : top;
    return `${base} · ${config.carryStandingsFromPhaseIds.length > 0 ? 'Hereta classificació' : 'Classificació independent'}`;
  }
  return '';
}

// ─── Formulari editar fase ────────────────────────────────────────────────────

function EditarFaseForm({
  tournamentId,
  fase,
  fases,
  tags,
  entrants,
  onDone,
  onCancel,
}: {
  tournamentId: string;
  fase: Fase;
  fases: Fase[];
  tags: Tag[];
  entrants: EntrantOption[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [nom, setNom] = useState(fase.name);
  const [startRound, setStartRound] = useState(fase.startRound.toString());
  const [endRound, setEndRound] = useState(fase.endRound.toString());
  const [desempats, setDesempats] = useState<string[]>(fase.tiebreakers);
  const [standingsLive, setStandingsLive] = useState(fase.standingsLive ?? false);
  const [participantsPerMatch, setParticipantsPerMatch] = useState(fase.participantsPerMatch ?? 2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const swissConfig = fase.method === 'swiss' ? (fase.config as SwissConfig) : null;
  const [swissAvoidRematches, setSwissAvoidRematches] = useState(swissConfig?.avoidRematches ?? true);
  const [swissCarry, setSwissCarry] = useState<string[]>(swissConfig?.carryStandingsFromPhaseIds ?? []);
  const [swissSeedingCriteria, setSwissSeedingCriteria] = useState<SeedingCriterion[]>(
    swissConfig?.seedingCriteria?.length ? swissConfig.seedingCriteria : [...DEFAULT_SEEDING_CRITERIA]
  );
  const [swissScope, setSwissScope] = useState<'all' | 'intra_tag'>(swissConfig?.scope ?? 'all');
  const [swissTagIds, setSwissTagIds] = useState<string[]>(swissConfig?.tagIds ?? []);
  const [swissExclusions, setSwissExclusions] = useState<EntryPairExclusion[]>(swissConfig?.entryExclusions ?? []);

  const swissFideConfig = fase.method === 'swiss_fide' ? (fase.config as SwissFideConfig) : null;
  const [swissFideScope, setSwissFideScope] = useState<'all' | 'intra_tag'>(swissFideConfig?.scope ?? 'all');
  const [swissFideTagIds, setSwissFideTagIds] = useState<string[]>(swissFideConfig?.tagIds ?? []);
  const [swissFideCarry, setSwissFideCarry] = useState<string[]>(swissFideConfig?.carryStandingsFromPhaseIds ?? []);
  const [swissFideExpectedRounds, setSwissFideExpectedRounds] = useState(
    swissFideConfig?.expectedRounds?.toString() ?? ''
  );
  const [swissFideExclusions, setSwissFideExclusions] = useState<EntryPairExclusion[]>(
    swissFideConfig?.entryExclusions ?? []
  );

  const rrConfig = fase.method === 'round_robin' ? (fase.config as RoundRobinConfig) : null;
  const [rrScope, setRrScope] = useState<'all' | 'intra_tag' | 'inter_tag'>(rrConfig?.scope ?? 'all');
  const [rrTagIds, setRrTagIds] = useState<string[]>(rrConfig?.tagIds ?? []);
  const [rrDoble, setRrDoble] = useState(rrConfig?.doubleRound ?? false);
  const [rrTagExclusions, setRrTagExclusions] = useState<TagPairExclusion[]>(rrConfig?.tagExclusions ?? []);

  const kothConfig = fase.method === 'king_of_the_hill' ? (fase.config as KingOfTheHillConfig) : null;
  const [kothTopN, setKothTopN] = useState(kothConfig?.topN?.toString() ?? '');
  const [kothScope, setKothScope] = useState<'all' | 'intra_tag'>(kothConfig?.scope ?? 'all');
  const [kothTagIds, setKothTagIds] = useState<string[]>(kothConfig?.tagIds ?? []);
  const [kothCarry, setKothCarry] = useState<string[]>(kothConfig?.carryStandingsFromPhaseIds ?? []);
  const [kothExclusions, setKothExclusions] = useState<EntryPairExclusion[]>(kothConfig?.entryExclusions ?? []);

  function buildConfig(): PhaseConfig {
    if (fase.method === 'swiss_fide') {
      return {
        method: 'swiss_fide',
        scope: swissFideScope,
        tagIds: swissFideScope === 'all' ? [] : swissFideTagIds,
        carryStandingsFromPhaseIds: swissFideCarry,
        expectedRounds: swissFideExpectedRounds ? parseInt(swissFideExpectedRounds) : undefined,
        entryExclusions: cleanEntryExclusions(swissFideExclusions),
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
        scope: swissScope,
        tagIds: swissScope === 'all' ? [] : swissTagIds,
        entryExclusions: cleanEntryExclusions(swissExclusions),
      };
    }
    if (fase.method === 'round_robin') {
      return {
        method: 'round_robin',
        scope: rrScope,
        tagIds: rrScope === 'all' ? [] : rrTagIds,
        doubleRound: rrDoble,
        tagExclusions: rrScope === 'inter_tag' ? cleanTagExclusions(rrTagExclusions) : [],
      };
    }
    if (fase.method === 'king_of_the_hill') {
      return {
        method: 'king_of_the_hill',
        topN: kothTopN ? parseInt(kothTopN) : null,
        carryStandingsFromPhaseIds: kothCarry,
        scope: kothScope,
        tagIds: kothScope === 'all' ? [] : kothTagIds,
        entryExclusions: cleanEntryExclusions(kothExclusions),
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
        standingsLive,
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
          tagIds={swissFideTagIds}
          setTagIds={setSwissFideTagIds}
          carry={swissFideCarry}
          setCarry={setSwissFideCarry}
          expectedRounds={swissFideExpectedRounds}
          setExpectedRounds={setSwissFideExpectedRounds}
          fases={fases}
          tags={tags}
          entrants={entrants}
          exclusions={swissFideExclusions}
          setExclusions={setSwissFideExclusions}
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
          scope={swissScope}
          setScope={setSwissScope}
          tagIds={swissTagIds}
          setTagIds={setSwissTagIds}
          fases={fases}
          tags={tags}
          entrants={entrants}
          exclusions={swissExclusions}
          setExclusions={setSwissExclusions}
        />
      )}
      {fase.method === 'round_robin' && (
        <ConfigRoundRobin
          scope={rrScope}
          setScope={setRrScope}
          tagIds={rrTagIds}
          setTagIds={setRrTagIds}
          doble={rrDoble}
          setDoble={setRrDoble}
          tags={tags}
          tagExclusions={rrTagExclusions}
          setTagExclusions={setRrTagExclusions}
        />
      )}
      {fase.method === 'king_of_the_hill' && (
        <ConfigKotH
          topN={kothTopN}
          setTopN={setKothTopN}
          scope={kothScope}
          setScope={setKothScope}
          tagIds={kothTagIds}
          setTagIds={setKothTagIds}
          carry={kothCarry}
          setCarry={setKothCarry}
          fases={fases}
          tags={tags}
          entrants={entrants}
          exclusions={kothExclusions}
          setExclusions={setKothExclusions}
        />
      )}

      {fase.method !== 'manual' && (
        <DesempatsPicker participantsPerMatch={participantsPerMatch} value={desempats} onChange={setDesempats} />
      )}

      <ModeClassificacio value={standingsLive} onChange={setStandingsLive} />

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
  tags,
  entrants,
  onDone,
  onCancel,
}: {
  tournamentId: string;
  fases: Fase[];
  tags: Tag[];
  entrants: EntrantOption[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [nom, setNom] = useState('');
  const [metode, setMetode] = useState<string>('swiss_fide');
  const [startRound, setStartRound] = useState('');
  const [endRound, setEndRound] = useState('');
  const [desempats, setDesempats] = useState<string[]>(['median_buchholz', 'buchholz', 'spread']);
  const [standingsLive, setStandingsLive] = useState(false);
  const [participantsPerMatch, setParticipantsPerMatch] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [rrScope, setRrScope] = useState<'all' | 'intra_tag' | 'inter_tag'>('all');
  const [rrTagIds, setRrTagIds] = useState<string[]>([]);
  const [rrDoble, setRrDoble] = useState(false);
  const [rrTagExclusions, setRrTagExclusions] = useState<TagPairExclusion[]>([]);
  const [swissAvoidRematches, setSwissAvoidRematches] = useState(true);
  const [swissCarry, setSwissCarry] = useState<string[]>([]);
  const [swissSeedingCriteria, setSwissSeedingCriteria] = useState<SeedingCriterion[]>([...DEFAULT_SEEDING_CRITERIA]);
  const [swissScope, setSwissScope] = useState<'all' | 'intra_tag'>('all');
  const [swissTagIds, setSwissTagIds] = useState<string[]>([]);
  const [swissExclusions, setSwissExclusions] = useState<EntryPairExclusion[]>([]);
  const [swissFideScope, setSwissFideScope] = useState<'all' | 'intra_tag'>('all');
  const [swissFideTagIds, setSwissFideTagIds] = useState<string[]>([]);
  const [swissFideCarry, setSwissFideCarry] = useState<string[]>([]);
  const [swissFideExpectedRounds, setSwissFideExpectedRounds] = useState('');
  const [swissFideExclusions, setSwissFideExclusions] = useState<EntryPairExclusion[]>([]);
  const [kothTopN, setKothTopN] = useState('');
  const [kothScope, setKothScope] = useState<'all' | 'intra_tag'>('all');
  const [kothTagIds, setKothTagIds] = useState<string[]>([]);
  const [kothCarry, setKothCarry] = useState<string[]>([]);
  const [kothExclusions, setKothExclusions] = useState<EntryPairExclusion[]>([]);

  const nextStart = fases.length > 0
    ? Math.max(...fases.map(f => f.endRound)) + 1
    : 1;

  function buildConfig(): PhaseConfig {
    if (metode === 'swiss_fide') {
      return {
        method: 'swiss_fide',
        scope: swissFideScope,
        tagIds: swissFideScope === 'all' ? [] : swissFideTagIds,
        carryStandingsFromPhaseIds: swissFideCarry,
        expectedRounds: swissFideExpectedRounds ? parseInt(swissFideExpectedRounds) : undefined,
        entryExclusions: cleanEntryExclusions(swissFideExclusions),
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
        scope: swissScope,
        tagIds: swissScope === 'all' ? [] : swissTagIds,
        entryExclusions: cleanEntryExclusions(swissExclusions),
      };
    }
    if (metode === 'round_robin') {
      return {
        method: 'round_robin',
        scope: rrScope,
        tagIds: rrScope === 'all' ? [] : rrTagIds,
        doubleRound: rrDoble,
        tagExclusions: rrScope === 'inter_tag' ? cleanTagExclusions(rrTagExclusions) : [],
      };
    }
    if (metode === 'king_of_the_hill') {
      return {
        method: 'king_of_the_hill',
        topN: kothTopN ? parseInt(kothTopN) : null,
        carryStandingsFromPhaseIds: kothCarry,
        scope: kothScope,
        tagIds: kothScope === 'all' ? [] : kothTagIds,
        entryExclusions: cleanEntryExclusions(kothExclusions),
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
        standingsLive,
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
          tagIds={swissFideTagIds}
          setTagIds={setSwissFideTagIds}
          carry={swissFideCarry}
          setCarry={setSwissFideCarry}
          expectedRounds={swissFideExpectedRounds}
          setExpectedRounds={setSwissFideExpectedRounds}
          fases={fases}
          tags={tags}
          entrants={entrants}
          exclusions={swissFideExclusions}
          setExclusions={setSwissFideExclusions}
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
          scope={swissScope}
          setScope={setSwissScope}
          tagIds={swissTagIds}
          setTagIds={setSwissTagIds}
          fases={fases}
          tags={tags}
          entrants={entrants}
          exclusions={swissExclusions}
          setExclusions={setSwissExclusions}
        />
      )}
      {metode === 'round_robin' && (
        <ConfigRoundRobin
          scope={rrScope}
          setScope={setRrScope}
          tagIds={rrTagIds}
          setTagIds={setRrTagIds}
          doble={rrDoble}
          setDoble={setRrDoble}
          tags={tags}
          tagExclusions={rrTagExclusions}
          setTagExclusions={setRrTagExclusions}
        />
      )}
      {metode === 'king_of_the_hill' && (
        <ConfigKotH
          topN={kothTopN}
          setTopN={setKothTopN}
          scope={kothScope}
          setScope={setKothScope}
          tagIds={kothTagIds}
          setTagIds={setKothTagIds}
          carry={kothCarry}
          setCarry={setKothCarry}
          fases={fases}
          tags={tags}
          entrants={entrants}
          exclusions={kothExclusions}
          setExclusions={setKothExclusions}
        />
      )}

      {metode !== 'manual' && (
        <DesempatsPicker participantsPerMatch={participantsPerMatch} value={desempats} onChange={setDesempats} />
      )}

      <ModeClassificacio value={standingsLive} onChange={setStandingsLive} />

      {error && <p className="text-sm text-loss">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" loading={loading}>Crear fase</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel·lar</Button>
      </div>
    </form>
  );
}

// ─── Sub-configuracions per mètode ───────────────────────────────────────────

/**
 * Tria de l'àmbit per etiqueta, compartida pels quatre mètodes automàtics
 * (docs/pla-rols.md §13.1 #8, Fase 2 de la migració grups→etiquetes): quines
 * etiquetes actuen de partició aquesta fase. Només Round Robin ofereix
 * "interetiquetes" (`allowInter`); als altres, partir és calcular-hi dins
 * una classificació independent per partició.
 */
const TAG_PICKER_COLORS = {
  accent: 'bg-accent-tint border-accent text-accent-ink',
  win: 'bg-win-tint border-win text-win',
} as const;

function TagScopePicker<S extends 'all' | 'intra_tag' | 'inter_tag'>({
  scope, setScope, tagIds, setTagIds, tags, allowInter, color = 'accent',
}: {
  scope: S;
  setScope: (v: S) => void;
  tagIds: string[];
  setTagIds: (v: string[]) => void;
  tags: Tag[];
  allowInter?: boolean;
  color?: keyof typeof TAG_PICKER_COLORS;
}) {
  function toggleTag(id: string) {
    setTagIds(tagIds.includes(id) ? tagIds.filter(t => t !== id) : [...tagIds, id]);
  }

  return (
    <div>
      <Select label="Àmbit" value={scope} onChange={e => setScope(e.target.value as S)}>
        <option value="all">Tots els jugadors (global)</option>
        <option value="intra_tag" disabled={tags.length === 0}>
          Per etiqueta (independent dins de cada una)
        </option>
        {allowInter && (
          <option value="inter_tag" disabled={tags.length < 2}>
            Interetiquetes (una etiqueta contra una altra)
          </option>
        )}
      </Select>
      {tags.length === 0 && scope !== 'all' && (
        <p className="text-xs text-accent-ink bg-accent-tint rounded p-2 mt-2">
          Cal crear etiquetes primer (pestanya Etiquetes).
        </p>
      )}
      {scope !== 'all' && tags.length > 0 && (
        <div className="mt-2">
          <p className="text-sm font-medium text-ink-2 mb-1">
            Etiquetes que actuen de partició
            {scope === 'inter_tag' && <span className="font-normal text-ink-3"> (cal triar-ne com a mínim 2)</span>}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map(t => {
              const actiu = tagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTag(t.id)}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                    actiu ? TAG_PICKER_COLORS[color] : 'border-border text-ink-2 hover:border-ink-3'
                  }`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
          {tagIds.length === 0 && (
            <p className="text-xs text-loss mt-1">Tria almenys una etiqueta.</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Exclusió de parella concreta (dos jugadors), amb evitar/prohibir: "evitar"
 * és una restricció tova que el motor relaxa si cal (mai deixa ningú sense
 * jugar); "prohibir" és dura i pot deixar algú en bye. Disponible a Suís,
 * Suís FIDE i Rei del turó (docs/pla-rols.md, avisos i exclusions
 * d'aparellament).
 */
function EntryExclusionsEditor({
  entrants, rules, setRules,
}: {
  entrants: EntrantOption[];
  rules: EntryPairExclusion[];
  setRules: (v: EntryPairExclusion[]) => void;
}) {
  function updateRow(i: number, patch: Partial<EntryPairExclusion>) {
    setRules(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function updateEntry(i: number, slot: 0 | 1, entryId: string) {
    const next: [string, string] = [...rules[i].entryIds] as [string, string];
    next[slot] = entryId;
    updateRow(i, { entryIds: next });
  }

  return (
    <div>
      <p className="text-sm font-medium text-ink-2 mb-1">Exclusions de parella concreta</p>
      <div className="space-y-1.5">
        {rules.map((r, i) => (
          <div key={i} className="flex items-center gap-1.5 flex-wrap">
            <select
              value={r.entryIds[0]}
              onChange={e => updateEntry(i, 0, e.target.value)}
              className="text-sm border border-border rounded-lg px-2 py-1.5 bg-surface flex-1 min-w-[8rem]"
            >
              <option value="">Jugador…</option>
              {entrants.filter(p => p.id !== r.entryIds[1]).map(p => (
                <option key={p.id} value={p.id}>{p.displayName}</option>
              ))}
            </select>
            <span className="text-xs text-ink-3">vs</span>
            <select
              value={r.entryIds[1]}
              onChange={e => updateEntry(i, 1, e.target.value)}
              className="text-sm border border-border rounded-lg px-2 py-1.5 bg-surface flex-1 min-w-[8rem]"
            >
              <option value="">Jugador…</option>
              {entrants.filter(p => p.id !== r.entryIds[0]).map(p => (
                <option key={p.id} value={p.id}>{p.displayName}</option>
              ))}
            </select>
            <div className="flex rounded-lg border border-border overflow-hidden text-xs font-semibold flex-shrink-0">
              <button
                type="button"
                onClick={() => updateRow(i, { mode: 'avoid' })}
                className={`px-2 py-1.5 cursor-pointer ${r.mode === 'avoid' ? 'bg-accent-tint text-accent-ink' : 'text-ink-3'}`}
              >
                Evitar
              </button>
              <button
                type="button"
                onClick={() => updateRow(i, { mode: 'forbid' })}
                className={`px-2 py-1.5 cursor-pointer ${r.mode === 'forbid' ? 'bg-loss-tint text-loss' : 'text-ink-3'}`}
              >
                Prohibir
              </button>
            </div>
            <button
              type="button"
              onClick={() => setRules(rules.filter((_, idx) => idx !== i))}
              className="text-loss text-sm px-1.5 cursor-pointer flex-shrink-0"
              aria-label="Treure exclusió"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setRules([...rules, { mode: 'avoid', entryIds: ['', ''] }])}
        className="text-sm text-accent-ink font-medium mt-1.5 cursor-pointer"
      >
        + Afegeix exclusió
      </button>
    </div>
  );
}

/**
 * Exclusió entre dues etiquetes, només a Round Robin interetiquetes: és
 * l'únic mètode on dues etiquetes s'enfronten directament. Sense
 * commutador evitar/prohibir — aquí no hi ha cap cerca alternativa a
 * relaxar, així que sempre és una prohibició.
 */
function TagExclusionsEditor({
  tags, chosenTagIds, rules, setRules,
}: {
  tags: Tag[];
  chosenTagIds: string[];
  rules: TagPairExclusion[];
  setRules: (v: TagPairExclusion[]) => void;
}) {
  const disponibles = tags.filter(t => chosenTagIds.includes(t.id));

  function updateTag(i: number, slot: 0 | 1, tagId: string) {
    const next: [string, string] = [...rules[i].tagIds] as [string, string];
    next[slot] = tagId;
    setRules(rules.map((r, idx) => (idx === i ? { ...r, tagIds: next } : r)));
  }

  if (disponibles.length < 2) return null;

  return (
    <div>
      <p className="text-sm font-medium text-ink-2 mb-1">Exclou aquesta parella d&apos;etiquetes</p>
      <div className="space-y-1.5">
        {rules.map((r, i) => (
          <div key={i} className="flex items-center gap-1.5 flex-wrap">
            <select
              value={r.tagIds[0]}
              onChange={e => updateTag(i, 0, e.target.value)}
              className="text-sm border border-border rounded-lg px-2 py-1.5 bg-surface flex-1 min-w-[8rem]"
            >
              <option value="">Etiqueta…</option>
              {disponibles.filter(t => t.id !== r.tagIds[1]).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <span className="text-xs text-ink-3">vs</span>
            <select
              value={r.tagIds[1]}
              onChange={e => updateTag(i, 1, e.target.value)}
              className="text-sm border border-border rounded-lg px-2 py-1.5 bg-surface flex-1 min-w-[8rem]"
            >
              <option value="">Etiqueta…</option>
              {disponibles.filter(t => t.id !== r.tagIds[0]).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setRules(rules.filter((_, idx) => idx !== i))}
              className="text-loss text-sm px-1.5 cursor-pointer flex-shrink-0"
              aria-label="Treure exclusió"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setRules([...rules, { tagIds: ['', ''] }])}
        className="text-sm text-win font-medium mt-1.5 cursor-pointer"
      >
        + Afegeix exclusió
      </button>
    </div>
  );
}

const SEEDING_CRITERION_LABELS: Record<SeedingCriterion, string> = {
  points: 'Punts',
  elo:    'BARRUF',
  rank:   'Classificació',
  name:   'Nom',
};
const ALL_SEEDING_CRITERIA: SeedingCriterion[] = ['points', 'elo', 'rank', 'name'];

/**
 * Tria i ordre dels criteris de seeding, amb arrossegament — mateix patró
 * que `DesempatsPicker` (Pointer Events perquè funcioni també al mòbil):
 * es mostren en l'ordre triat, no en un ordre fix amb número al costat.
 */
function SeedingCriteriaPicker({
  value, onChange,
}: {
  value: SeedingCriterion[];
  onChange: (next: SeedingCriterion[]) => void;
}) {
  const noSeleccionats = ALL_SEEDING_CRITERIA.filter(c => !value.includes(c));

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

  function move(c: SeedingCriterion, dir: -1 | 1) {
    const i = value.indexOf(c);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  function remove(c: SeedingCriterion) {
    onChange(value.filter(x => x !== c));
  }

  function add(c: SeedingCriterion) {
    onChange([...value, c]);
  }

  return (
    <div>
      <p className="text-sm font-medium text-ink-2 mb-2">
        Ordre de seeding
        <span className="font-normal text-ink-3 ml-2">Arrossega per reordenar</span>
      </p>

      {value.length === 0 ? (
        <p className="text-xs text-ink-3 mb-2">Cap criteri triat.</p>
      ) : (
        <div className="space-y-1 mb-2">
          {value.map((c, i) => (
            <div
              key={c}
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
              <span className="text-sm flex-1 text-accent-ink font-medium truncate">{SEEDING_CRITERION_LABELS[c]}</span>
              <div className="flex gap-0.5 flex-shrink-0">
                <button type="button" onClick={() => move(c, -1)}
                  className="p-1 text-accent-ink disabled:opacity-30" disabled={i === 0} aria-label="Puja">▲</button>
                <button type="button" onClick={() => move(c, 1)}
                  className="p-1 text-accent-ink disabled:opacity-30" disabled={i === value.length - 1} aria-label="Baixa">▼</button>
              </div>
              <button type="button" onClick={() => remove(c)}
                className="p-1 text-accent-ink hover:text-loss flex-shrink-0" aria-label="Treu">✕</button>
            </div>
          ))}
        </div>
      )}

      {noSeleccionats.length > 0 && (
        <div>
          {value.length > 0 && <p className="text-xs text-ink-3 mb-1">Afegeix-ne:</p>}
          <div className="flex flex-wrap gap-1.5">
            {noSeleccionats.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => add(c)}
                className="px-2.5 py-1.5 rounded-lg border border-border text-xs text-ink-2 hover:border-ink-3 hover:bg-surface-2 transition-colors cursor-pointer"
              >
                + {SEEDING_CRITERION_LABELS[c]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigSwiss({
  avoidRematches, setAvoidRematches, carry, setCarry,
  seedingCriteria, setSeedingCriteria, scope, setScope, tagIds, setTagIds, fases, tags,
  entrants, exclusions, setExclusions,
}: {
  avoidRematches: boolean;
  setAvoidRematches: (v: boolean) => void;
  carry: string[];
  setCarry: (v: string[]) => void;
  seedingCriteria: SeedingCriterion[];
  setSeedingCriteria: (v: SeedingCriterion[]) => void;
  scope: 'all' | 'intra_tag';
  setScope: (v: 'all' | 'intra_tag') => void;
  tagIds: string[];
  setTagIds: (v: string[]) => void;
  fases: Fase[];
  tags: Tag[];
  entrants: EntrantOption[];
  exclusions: EntryPairExclusion[];
  setExclusions: (v: EntryPairExclusion[]) => void;
}) {
  return (
    <div className="bg-accent-tint rounded-lg p-4 space-y-3">
      <p className="text-xs font-semibold text-accent-ink uppercase tracking-wide">Configuració Suís</p>
      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" checked={avoidRematches} onChange={e => setAvoidRematches(e.target.checked)} className="accent-current text-accent" />
        Evitar revanxes
      </label>

      <TagScopePicker scope={scope} setScope={setScope} tagIds={tagIds} setTagIds={setTagIds} tags={tags} />

      <EntryExclusionsEditor entrants={entrants} rules={exclusions} setRules={setExclusions} />

      <SeedingCriteriaPicker value={seedingCriteria} onChange={setSeedingCriteria} />

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
  scope, setScope, tagIds, setTagIds, carry, setCarry, expectedRounds, setExpectedRounds, fases, tags,
  entrants, exclusions, setExclusions,
}: {
  scope: 'all' | 'intra_tag';
  setScope: (v: 'all' | 'intra_tag') => void;
  tagIds: string[];
  setTagIds: (v: string[]) => void;
  carry: string[];
  setCarry: (v: string[]) => void;
  expectedRounds: string;
  setExpectedRounds: (v: string) => void;
  fases: Fase[];
  tags: Tag[];
  entrants: EntrantOption[];
  exclusions: EntryPairExclusion[];
  setExclusions: (v: EntryPairExclusion[]) => void;
}) {
  return (
    <div className="bg-accent-tint rounded-lg p-4 space-y-3">
      <p className="text-xs font-semibold text-accent-ink uppercase tracking-wide">Configuració Suís FIDE</p>
      <p className="text-xs text-accent-ink">
        Usa l&apos;algorisme holandès FIDE amb matching global òptim (blossom). Gestiona automàticament revanxes, floats i bye.
      </p>
      <TagScopePicker scope={scope} setScope={setScope} tagIds={tagIds} setTagIds={setTagIds} tags={tags} />
      <EntryExclusionsEditor entrants={entrants} rules={exclusions} setRules={setExclusions} />
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
  scope, setScope, tagIds, setTagIds, doble, setDoble, tags, tagExclusions, setTagExclusions,
}: {
  scope: 'all' | 'intra_tag' | 'inter_tag';
  setScope: (v: 'all' | 'intra_tag' | 'inter_tag') => void;
  tagIds: string[];
  setTagIds: (v: string[]) => void;
  doble: boolean;
  setDoble: (v: boolean) => void;
  tags: Tag[];
  tagExclusions: TagPairExclusion[];
  setTagExclusions: (v: TagPairExclusion[]) => void;
}) {
  return (
    <div className="bg-win-tint rounded-lg p-4 space-y-3">
      <p className="text-xs font-semibold text-win uppercase tracking-wide">Configuració Round Robin</p>
      <TagScopePicker
        scope={scope}
        setScope={setScope}
        tagIds={tagIds}
        setTagIds={setTagIds}
        tags={tags}
        allowInter
        color="win"
      />
      {scope === 'inter_tag' && (
        <TagExclusionsEditor
          tags={tags}
          chosenTagIds={tagIds}
          rules={tagExclusions}
          setRules={setTagExclusions}
        />
      )}
      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" checked={doble} onChange={e => setDoble(e.target.checked)} className="accent-current text-win" />
        Doble volta (cada parella juga dos cops)
      </label>
    </div>
  );
}

function ConfigKotH({
  topN, setTopN, scope, setScope, tagIds, setTagIds, carry, setCarry, fases, tags,
  entrants, exclusions, setExclusions,
}: {
  topN: string;
  setTopN: (v: string) => void;
  scope: 'all' | 'intra_tag';
  setScope: (v: 'all' | 'intra_tag') => void;
  tagIds: string[];
  setTagIds: (v: string[]) => void;
  carry: string[];
  setCarry: (v: string[]) => void;
  fases: Fase[];
  tags: Tag[];
  entrants: EntrantOption[];
  exclusions: EntryPairExclusion[];
  setExclusions: (v: EntryPairExclusion[]) => void;
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
      <TagScopePicker scope={scope} setScope={setScope} tagIds={tagIds} setTagIds={setTagIds} tags={tags} />
      <EntryExclusionsEditor entrants={entrants} rules={exclusions} setRules={setExclusions} />
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
