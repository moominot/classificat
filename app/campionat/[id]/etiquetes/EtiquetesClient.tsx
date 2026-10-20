'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import TagInput from '@/components/forms/TagInput';
import { useCanManage } from '@/components/ViewerContext';
import type { Tag } from '@/lib/pairing/types';
import { groupTags } from '@/lib/tag-groups';

type TipusNova = 'label' | 'group' | 'team';

interface Jugador { id: string; name: string; tagIds: string[]; teamId: string | null; isActive: boolean }
interface Equip { id: string; name: string }

export default function EtiquetesClient({
  tournamentId,
  tags,
  equips,
  jugadors,
}: {
  tournamentId: string;
  tags: Tag[];
  equips: Equip[];
  jugadors: Jugador[];
}) {
  const router = useRouter();
  const canManage = useCanManage();
  const [modalObert, setModalObert] = useState(false);
  const [nomNovaEtiqueta, setNomNovaEtiqueta] = useState('');
  const [tipus, setTipus] = useState<TipusNova>('label');
  const esEquip = tipus === 'team';
  const [loadingNova, setLoadingNova] = useState(false);
  const [seleccionats, setSeleccionats] = useState<Set<string>>(new Set());
  const [etiquetaBulk, setEtiquetaBulk] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  async function creaEtiqueta() {
    if (!nomNovaEtiqueta.trim()) return;
    setLoadingNova(true);
    await fetch(`/api/tournaments/${tournamentId}/${esEquip ? 'teams' : 'tags'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nomNovaEtiqueta.trim(), ...(tipus === 'group' ? { kind: 'group' } : {}) }),
    });
    setNomNovaEtiqueta('');
    setTipus('label');
    setLoadingNova(false);
    setModalObert(false);
    router.refresh();
  }

  async function assignaEquip(jugadorId: string, teamId: string) {
    await fetch(`/api/tournaments/${tournamentId}/entries/${jugadorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: teamId || null }),
    });
    router.refresh();
  }

  async function assignaEtiquetes(jugadorId: string, nouesTags: Tag[]) {
    await fetch(`/api/tournaments/${tournamentId}/entries/${jugadorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagIds: nouesTags.map((t) => t.id) }),
    });
    router.refresh();
  }

  /** Mou un grup una posició amunt (-1) o avall (+1) a la classificació apilada. */
  async function mouGrup(tagId: string, direccio: -1 | 1) {
    const ordre = grups.map((g) => g.id);
    const i = ordre.indexOf(tagId);
    const j = i + direccio;
    if (i < 0 || j < 0 || j >= ordre.length) return;
    [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
    await fetch(`/api/tournaments/${tournamentId}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagIds: ordre }),
    });
    router.refresh();
  }

  function toggleSeleccio(id: string) {
    setSeleccionats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function aplicaBulk(action: 'add' | 'remove') {
    if (!etiquetaBulk || seleccionats.size === 0) return;
    setBulkLoading(true);
    await fetch(`/api/tournaments/${tournamentId}/entries/bulk-tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryIds: [...seleccionats],
        ...(etiquetaBulk.startsWith('team:') ? { teamId: etiquetaBulk.slice(5) } : { tagId: etiquetaBulk }),
        action,
      }),
    });
    setBulkLoading(false);
    setSeleccionats(new Set());
    setEtiquetaBulk('');
    router.refresh();
  }

  const grups = groupTags(tags);
  const etiquetesLliures = tags.filter((t) => t.kind !== 'group');
  const tagMap = new Map(tags.map((t) => [t.id, t]));
  const tagsPerJugador = (j: Jugador) => j.tagIds.map((id) => tagMap.get(id)).filter((t): t is Tag => !!t);
  const equipPerId = new Map(equips.map((e) => [e.id, e]));
  const comptePerEquip = new Map(equips.map((e) => [e.id, jugadors.filter((j) => j.teamId === e.id).length]));
  const comptePerTag = new Map(tags.map((t) => [t.id, jugadors.filter((j) => j.tagIds.includes(t.id)).length]));

  return (
    <div className="space-y-5">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setModalObert(true)}>+ Nova etiqueta</Button>
        </div>
      )}

      <Modal open={modalObert} onClose={() => setModalObert(false)} title={esEquip ? 'Nou equip' : tipus === 'group' ? 'Nou grup' : 'Nova etiqueta'}>
        <div className="space-y-4">
          <Input
            label={esEquip ? "Nom de l'equip" : "Nom de l'etiqueta"}
            value={nomNovaEtiqueta}
            onChange={(e) => setNomNovaEtiqueta(e.target.value)}
            placeholder="ex. Club Nord, Sub-16, Preferent..."
            onKeyDown={(e) => e.key === 'Enter' && creaEtiqueta()}
            autoFocus
          />
          <fieldset className="space-y-2.5">
            {TIPUS_NOVA.map((t) => (
              <label key={t.id} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="tipus-etiqueta"
                  checked={tipus === t.id}
                  onChange={() => setTipus(t.id)}
                  className="mt-1 accent-accent"
                />
                <span>
                  <span className="block text-sm font-medium text-ink">{t.label}</span>
                  <span className="block text-xs text-ink-3">{t.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex gap-2 pt-1">
            <Button onClick={creaEtiqueta} loading={loadingNova} disabled={!nomNovaEtiqueta.trim()} className="flex-1 sm:flex-none">
              Crear
            </Button>
            <Button type="button" variant="ghost" onClick={() => setModalObert(false)}>
              Cancel·lar
            </Button>
          </div>
        </div>
      </Modal>

      {tags.length === 0 && equips.length === 0 ? (
        <EmptyState
          title="Sense etiquetes"
          description="Crea etiquetes per categoritzar els jugadors (club, categoria, nivell...). Un jugador en pot tenir diverses alhora."
          action={canManage ? <Button onClick={() => setModalObert(true)}>+ Nova etiqueta</Button> : undefined}
        />
      ) : (
        <>
          <Card padding={false}>
            <div className="px-4 py-3 border-b border-border">
              <span className="font-semibold text-sm">Etiquetes i equips del campionat</span>
            </div>
            <ul className="divide-y divide-border">
              {grups.map((g, i) => (
                <EtiquetaRow
                  key={g.id}
                  tag={g}
                  compte={comptePerTag.get(g.id) ?? 0}
                  tournamentId={tournamentId}
                  canManage={canManage}
                  onChanged={() => router.refresh()}
                  posicioGrup={{
                    numero: i + 1,
                    onAmunt: i > 0 ? () => mouGrup(g.id, -1) : undefined,
                    onAvall: i < grups.length - 1 ? () => mouGrup(g.id, 1) : undefined,
                  }}
                />
              ))}
              {equips.map((e) => (
                <EtiquetaRow
                  key={`team-${e.id}`}
                  tag={e}
                  esEquip
                  compte={comptePerEquip.get(e.id) ?? 0}
                  tournamentId={tournamentId}
                  canManage={canManage}
                  onChanged={() => router.refresh()}
                />
              ))}
              {etiquetesLliures.map((t) => (
                <EtiquetaRow
                  key={t.id}
                  tag={t}
                  compte={comptePerTag.get(t.id) ?? 0}
                  tournamentId={tournamentId}
                  canManage={canManage}
                  onChanged={() => router.refresh()}
                />
              ))}
            </ul>
          </Card>

          {canManage && seleccionats.size > 0 && (
            <div className="sticky top-24 z-10 flex flex-wrap items-center gap-2 bg-accent-tint border border-accent rounded-xl p-3">
              <span className="text-sm font-medium text-accent-ink">
                {seleccionats.size} jugador{seleccionats.size !== 1 ? 's' : ''} seleccionat{seleccionats.size !== 1 ? 's' : ''}
              </span>
              <select
                value={etiquetaBulk}
                onChange={(e) => setEtiquetaBulk(e.target.value)}
                className="text-sm border border-border rounded-lg px-2 py-1.5 bg-surface text-ink"
              >
                <option value="">Tria una etiqueta o equip...</option>
                {equips.length > 0 && (
                  <optgroup label="Equips (en tria un de sol)">
                    {equips.map((e) => (
                      <option key={e.id} value={`team:${e.id}`}>{e.name}</option>
                    ))}
                  </optgroup>
                )}
                {tags.length > 0 && (
                  <optgroup label="Etiquetes">
                    {tags.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <Button size="sm" onClick={() => aplicaBulk('add')} loading={bulkLoading} disabled={!etiquetaBulk}>
                Afegeix
              </Button>
              <Button size="sm" variant="secondary" onClick={() => aplicaBulk('remove')} loading={bulkLoading} disabled={!etiquetaBulk}>
                Treu
              </Button>
              <button
                type="button"
                onClick={() => setSeleccionats(new Set())}
                className="text-xs text-accent-ink hover:underline ml-auto"
              >
                Buida la selecció
              </button>
            </div>
          )}

          <Card padding={false}>
            <div className="px-4 py-3 border-b border-border">
              <span className="font-semibold text-sm">Jugadors</span>
            </div>
            <ul className="divide-y divide-border">
              {jugadors.map((j) => (
                <li key={j.id} className="flex items-start gap-3 px-4 py-2.5">
                  {canManage && (
                    <input
                      type="checkbox"
                      checked={seleccionats.has(j.id)}
                      onChange={() => toggleSeleccio(j.id)}
                      className="mt-2.5 accent-accent flex-shrink-0"
                    />
                  )}
                  <div className="w-7 h-7 rounded-full bg-accent-tint flex items-center justify-center text-accent-ink text-xs font-semibold flex-shrink-0 mt-1">
                    {j.name[0]}
                  </div>
                  <span className="text-sm text-ink-2 mt-1.5 flex-shrink-0 w-32 truncate">{j.name}</span>
                  {canManage ? (
                    <div className="flex-1 min-w-0 flex flex-wrap items-start gap-2">
                      {equips.length > 0 && (
                        <select
                          value={j.teamId ?? ''}
                          onChange={(e) => assignaEquip(j.id, e.target.value)}
                          aria-label={`Equip de ${j.name}`}
                          className="text-sm border border-border rounded-lg px-2 py-1.5 bg-surface text-ink max-w-40"
                        >
                          <option value="">Sense equip</option>
                          {equips.map((e) => (
                            <option key={e.id} value={e.id}>{e.name}</option>
                          ))}
                        </select>
                      )}
                      <div className="flex-1 min-w-48">
                      <TagInput
                        tournamentId={tournamentId}
                        value={tagsPerJugador(j)}
                        onChange={(nous) => assignaEtiquetes(j.id, nous)}
                      />
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-wrap gap-1 mt-1.5">
                      {j.teamId && equipPerId.get(j.teamId) && (
                        <Badge color="blue">{equipPerId.get(j.teamId)!.name}</Badge>
                      )}
                      {tagsPerJugador(j).map((t) => (
                        <Badge key={t.id} color="gray">{t.name}</Badge>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

function EtiquetaRow({
  tag,
  esEquip = false,
  compte,
  tournamentId,
  canManage,
  onChanged,
  posicioGrup,
}: {
  tag: Tag;
  esEquip?: boolean;
  compte: number;
  tournamentId: string;
  canManage: boolean;
  onChanged: () => void;
  /** Només els grups de classificació: posició a la classificació apilada. */
  posicioGrup?: { numero: number; onAmunt?: () => void; onAvall?: () => void };
}) {
  const [editant, setEditant] = useState(false);
  const [nom, setNom] = useState(tag.name);
  const [confirmEsborrar, setConfirmEsborrar] = useState(false);
  const [loading, setLoading] = useState(false);

  async function desa() {
    if (!nom.trim() || nom.trim() === tag.name) { setEditant(false); setNom(tag.name); return; }
    setLoading(true);
    await fetch(`/api/tournaments/${tournamentId}/${esEquip ? 'teams' : 'tags'}/${tag.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nom.trim() }),
    });
    setLoading(false);
    setEditant(false);
    onChanged();
  }

  /** Etiqueta lliure ↔ grup de classificació. Els equips no en tenen. */
  async function canviaTipus() {
    setLoading(true);
    await fetch(`/api/tournaments/${tournamentId}/tags/${tag.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: posicioGrup ? 'label' : 'group' }),
    });
    setLoading(false);
    onChanged();
  }

  async function esborra() {
    setLoading(true);
    await fetch(`/api/tournaments/${tournamentId}/${esEquip ? 'teams' : 'tags'}/${tag.id}`, { method: 'DELETE' });
    setLoading(false);
    onChanged();
  }

  return (
    <li className="flex items-center gap-2 px-4 py-2.5">
      {editant ? (
        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          onBlur={desa}
          onKeyDown={(e) => { if (e.key === 'Enter') desa(); if (e.key === 'Escape') { setEditant(false); setNom(tag.name); } }}
          autoFocus
          className="flex-1 text-sm border border-border rounded px-2 py-1 bg-surface text-ink"
        />
      ) : (
        <span className="flex-1 text-sm text-ink-2">
          {posicioGrup && <span className="mr-2 text-xs font-semibold text-ink-3 tabular-nums">{posicioGrup.numero}.</span>}
          {tag.name}
          {esEquip && <span className="ml-2 align-middle"><Badge color="purple">Equip</Badge></span>}
          {posicioGrup && <span className="ml-2 align-middle"><Badge color="green">Grup</Badge></span>}
        </span>
      )}
      <Badge color="blue">{compte} jugador{compte !== 1 ? 's' : ''}</Badge>
      {canManage && !editant && (
        confirmEsborrar ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-loss">Esborrar?</span>
            <button onClick={esborra} disabled={loading} className="px-2 py-1 rounded text-xs bg-loss text-white hover:opacity-90 disabled:opacity-50">Sí</button>
            <button onClick={() => setConfirmEsborrar(false)} className="px-2 py-1 rounded text-xs text-ink-3 hover:bg-surface-2">No</button>
          </div>
        ) : (
          <div className="flex gap-1">
            {posicioGrup && (
              <>
                <button
                  onClick={posicioGrup.onAmunt}
                  disabled={!posicioGrup.onAmunt}
                  className="p-1.5 rounded text-ink-3 hover:text-ink-2 hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  title="Puja el grup a la classificació"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  onClick={posicioGrup.onAvall}
                  disabled={!posicioGrup.onAvall}
                  className="p-1.5 rounded text-ink-3 hover:text-ink-2 hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  title="Baixa el grup a la classificació"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </>
            )}
            {!esEquip && (
              <button
                onClick={canviaTipus}
                disabled={loading}
                className="p-1.5 rounded text-ink-3 hover:text-ink-2 hover:bg-surface-2 transition-colors disabled:opacity-50"
                title={posicioGrup ? 'Converteix en etiqueta lliure' : 'Converteix en grup de classificació'}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h10" />
                </svg>
              </button>
            )}
            <button onClick={() => setEditant(true)} className="p-1.5 rounded text-ink-3 hover:text-ink-2 hover:bg-surface-2 transition-colors" title="Edita el nom">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button onClick={() => setConfirmEsborrar(true)} className="p-1.5 rounded text-ink-3 hover:text-loss hover:bg-loss-tint transition-colors" title={esEquip ? "Esborra l'equip" : "Esborra l'etiqueta"}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )
      )}
    </li>
  );
}

const TIPUS_NOVA: { id: TipusNova; label: string; description: string }[] = [
  {
    id: 'label',
    label: 'Etiqueta',
    description:
      "Un jugador pot tenir qualsevol nombre d'etiquetes alhora: serveixen per filtrar la classificació i per aparellar per categoria.",
  },
  {
    id: 'group',
    label: 'Grup de classificació',
    description:
      "La classificació es mostra per grups, l'un sota l'altre i en l'ordre que triïs, i les posicions continuen d'un grup al següent (p. ex. «1-16» i «17-32»).",
  },
  {
    id: 'team',
    label: 'Equip',
    description:
      'Els equips competeixen en grup: el seu valor surt dels resultats dels membres, segons el criteri de cada fase. Un jugador només pot ser en un equip.',
  },
];
