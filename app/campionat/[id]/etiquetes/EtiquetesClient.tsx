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

interface Jugador { id: string; name: string; tagIds: string[]; isActive: boolean }

export default function EtiquetesClient({
  tournamentId,
  tags,
  jugadors,
}: {
  tournamentId: string;
  tags: Tag[];
  jugadors: Jugador[];
}) {
  const router = useRouter();
  const canManage = useCanManage();
  const [modalObert, setModalObert] = useState(false);
  const [nomNovaEtiqueta, setNomNovaEtiqueta] = useState('');
  const [loadingNova, setLoadingNova] = useState(false);
  const [seleccionats, setSeleccionats] = useState<Set<string>>(new Set());
  const [etiquetaBulk, setEtiquetaBulk] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  async function creaEtiqueta() {
    if (!nomNovaEtiqueta.trim()) return;
    setLoadingNova(true);
    await fetch(`/api/tournaments/${tournamentId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nomNovaEtiqueta.trim() }),
    });
    setNomNovaEtiqueta('');
    setLoadingNova(false);
    setModalObert(false);
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
      body: JSON.stringify({ entryIds: [...seleccionats], tagId: etiquetaBulk, action }),
    });
    setBulkLoading(false);
    setSeleccionats(new Set());
    setEtiquetaBulk('');
    router.refresh();
  }

  const tagMap = new Map(tags.map((t) => [t.id, t]));
  const tagsPerJugador = (j: Jugador) => j.tagIds.map((id) => tagMap.get(id)).filter((t): t is Tag => !!t);
  const comptePerTag = new Map(tags.map((t) => [t.id, jugadors.filter((j) => j.tagIds.includes(t.id)).length]));

  return (
    <div className="space-y-5">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setModalObert(true)}>+ Nova etiqueta</Button>
        </div>
      )}

      <Modal open={modalObert} onClose={() => setModalObert(false)} title="Nova etiqueta">
        <div className="space-y-4">
          <Input
            label="Nom de l'etiqueta"
            value={nomNovaEtiqueta}
            onChange={(e) => setNomNovaEtiqueta(e.target.value)}
            placeholder="ex. Club Nord, Sub-16, Preferent..."
            onKeyDown={(e) => e.key === 'Enter' && creaEtiqueta()}
            autoFocus
          />
          <p className="text-sm text-ink-3">
            Un jugador pot tenir qualsevol nombre d&apos;etiquetes alhora — serveixen per filtrar la
            classificació i, més endavant, per aparellar per categoria.
          </p>
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

      {tags.length === 0 ? (
        <EmptyState
          title="Sense etiquetes"
          description="Crea etiquetes per categoritzar els jugadors (club, categoria, nivell...). Un jugador en pot tenir diverses alhora."
          action={canManage ? <Button onClick={() => setModalObert(true)}>+ Nova etiqueta</Button> : undefined}
        />
      ) : (
        <>
          <Card padding={false}>
            <div className="px-4 py-3 border-b border-border">
              <span className="font-semibold text-sm">Etiquetes del campionat</span>
            </div>
            <ul className="divide-y divide-border">
              {tags.map((t) => (
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
                <option value="">Tria una etiqueta...</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
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
                    <div className="flex-1 min-w-0">
                      <TagInput
                        tournamentId={tournamentId}
                        value={tagsPerJugador(j)}
                        onChange={(nous) => assignaEtiquetes(j.id, nous)}
                      />
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-wrap gap-1 mt-1.5">
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
  compte,
  tournamentId,
  canManage,
  onChanged,
}: {
  tag: Tag;
  compte: number;
  tournamentId: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [editant, setEditant] = useState(false);
  const [nom, setNom] = useState(tag.name);
  const [confirmEsborrar, setConfirmEsborrar] = useState(false);
  const [loading, setLoading] = useState(false);

  async function desa() {
    if (!nom.trim() || nom.trim() === tag.name) { setEditant(false); setNom(tag.name); return; }
    setLoading(true);
    await fetch(`/api/tournaments/${tournamentId}/tags/${tag.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nom.trim() }),
    });
    setLoading(false);
    setEditant(false);
    onChanged();
  }

  async function esborra() {
    setLoading(true);
    await fetch(`/api/tournaments/${tournamentId}/tags/${tag.id}`, { method: 'DELETE' });
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
        <span className="flex-1 text-sm text-ink-2">{tag.name}</span>
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
            <button onClick={() => setEditant(true)} className="p-1.5 rounded text-ink-3 hover:text-ink-2 hover:bg-surface-2 transition-colors" title="Edita el nom">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button onClick={() => setConfirmEsborrar(true)} className="p-1.5 rounded text-ink-3 hover:text-loss hover:bg-loss-tint transition-colors" title="Esborra l'etiqueta">
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
