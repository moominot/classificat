'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import type { Tag } from '@/lib/pairing/types';

/**
 * Filtres de nom/club, BARRUF i etiquetes, centralitzats en un modal darrere
 * una icona — abans el formulari sempre hi era, ocupant espai encara que
 * ningú els fes servir la majoria de cops que es consulta la classificació.
 */
export default function FiltresClassificacio({
  tournamentId,
  pestanya,
  rondaSeleccionada,
  fases,
  faseSeleccionada,
  q,
  br,
  bv,
  tags,
  tagsSeleccionades,
  vistaJugador = false,
  equips = [],
  equipSeleccionat = null,
  canManage = false,
  entryIdsFiltrats = [],
  criterisFiltre = [],
}: {
  tournamentId: string;
  pestanya: string;
  /** Navegació, no filtre: es conserva igual que la pestanya. */
  rondaSeleccionada: number | null;
  fases: { id: string; name: string }[];
  faseSeleccionada: string | null;
  q: string;
  br: string;
  bv: string;
  tags: Tag[];
  tagsSeleccionades: string[];
  /** Vista de jugador per a l'admin: es conserva com la pestanya. */
  vistaJugador?: boolean;
  equips?: { id: string; name: string }[];
  equipSeleccionat?: string | null;
  canManage?: boolean;
  /** Jugadors que passen el filtre actual, per crear-ne una etiqueta. */
  entryIdsFiltrats?: string[];
  criterisFiltre?: string[];
}) {
  const router = useRouter();
  const [obert, setObert] = useState(false);
  const hiHaFiltre =
    q.length > 0 || (br.length > 0 && bv.length > 0) || tagsSeleccionades.length > 0 || faseSeleccionada !== null || equipSeleccionat !== null;

  function baseParams() {
    const params = new URLSearchParams();
    if (pestanya !== 'general') params.set('t', pestanya);
    if (rondaSeleccionada !== null) params.set('r', String(rondaSeleccionada));
    if (vistaJugador) params.set('v', 'jugador');
    return params;
  }

  function navega(params: URLSearchParams) {
    setObert(false);
    router.push(`/campionat/${tournamentId}/classificacio${params.toString() ? `?${params}` : ''}`);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const params = baseParams();
    const qVal = (form.get('q') as string | null)?.trim();
    const brVal = form.get('br') as string | null;
    const bvVal = (form.get('bv') as string | null)?.trim();
    const faseVal = form.get('f') as string | null;
    const tagsVal = form.getAll('tags') as string[];
    const equipVal = form.get('eq') as string | null;
    if (equipVal) params.set('eq', equipVal);
    if (qVal) params.set('q', qVal);
    if (brVal && bvVal) {
      params.set('br', brVal);
      params.set('bv', bvVal);
    }
    if (faseVal) params.set('f', faseVal);
    if (tagsVal.length > 0) params.set('tags', tagsVal.join(','));
    navega(params);
  }

  const [nomEtiqueta, setNomEtiqueta] = useState('');
  const [creant, setCreant] = useState(false);
  const [errorEtiqueta, setErrorEtiqueta] = useState('');

  async function creaEtiquetaDelFiltre() {
    const nom = nomEtiqueta.trim();
    if (!nom || entryIdsFiltrats.length === 0) return;
    setCreant(true);
    setErrorEtiqueta('');
    try {
      const r1 = await fetch(`/api/tournaments/${tournamentId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nom }),
      });
      if (!r1.ok) throw new Error();
      const tag = await r1.json();
      const r2 = await fetch(`/api/tournaments/${tournamentId}/entries/bulk-tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryIds: entryIdsFiltrats, tagId: tag.id, action: 'add' }),
      });
      if (!r2.ok) throw new Error();
      setNomEtiqueta('');
      setObert(false);
      router.refresh();
    } catch {
      setErrorEtiqueta("No s'ha pogut crear o assignar l'etiqueta.");
    } finally {
      setCreant(false);
    }
  }

  function treuFiltres() {
    navega(baseParams());
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setObert(true)}
        className="relative flex-shrink-0 p-2 rounded-lg border border-border bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors"
        aria-label="Filtres"
        title="Filtres"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        {hiHaFiltre && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent border-2 border-surface" />
        )}
      </button>

      <Modal open={obert} onClose={() => setObert(false)} title="Filtres">
        <form onSubmit={handleSubmit} className="space-y-4">
          {fases.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-1">Fase</label>
              <select
                name="f"
                defaultValue={faseSeleccionada ?? ''}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-surface text-ink"
              >
                <option value="">Totes les fases</option>
                {fases.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-ink-2 mb-1">Nom o club</label>
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="ex. Anna, Club Nord..."
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-surface text-ink"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-2 mb-1">BARRUF</label>
            <div className="flex gap-2">
              <select
                name="br"
                defaultValue={br}
                className="text-sm border border-border rounded-lg px-2.5 py-2 bg-surface text-ink"
              >
                <option value="">— cap —</option>
                <option value="lt">Menys de</option>
                <option value="gt">Més de</option>
              </select>
              <input
                type="number"
                name="bv"
                defaultValue={bv}
                placeholder="valor"
                className="flex-1 min-w-0 text-sm border border-border rounded-lg px-3 py-2 bg-surface text-ink"
              />
            </div>
          </div>
          {equips.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-1">Equip</label>
              <select
                name="eq"
                defaultValue={equipSeleccionat ?? ''}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-surface text-ink"
              >
                <option value="">Tots els equips</option>
                {equips.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
          )}
          {tags.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-ink-2 mb-1">
                Etiquetes <span className="font-normal text-ink-3">(ha de tenir-les totes)</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <label
                    key={t.id}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-sm text-ink-2 cursor-pointer has-[:checked]:bg-accent-tint has-[:checked]:border-accent has-[:checked]:text-accent-ink"
                  >
                    <input
                      type="checkbox"
                      name="tags"
                      value={t.id}
                      defaultChecked={tagsSeleccionades.includes(t.id)}
                      className="accent-accent"
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1 sm:flex-none">
              Filtra
            </Button>
            {hiHaFiltre && (
              <Button type="button" variant="ghost" onClick={treuFiltres}>
                Treu filtres
              </Button>
            )}
          </div>
        </form>

        {canManage && entryIdsFiltrats.length > 0 && (
          <div className="mt-5 pt-4 border-t border-border space-y-2">
            <label className="block text-sm font-medium text-ink-2">
              Crea una etiqueta amb els {entryIdsFiltrats.length} jugadors filtrats
            </label>
            {criterisFiltre.length > 0 && (
              <p className="text-xs text-ink-3">Filtre aplicat: {criterisFiltre.join(' · ')}</p>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={nomEtiqueta}
                onChange={(e) => setNomEtiqueta(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); creaEtiquetaDelFiltre(); } }}
                placeholder="Nom de l'etiqueta"
                className="flex-1 min-w-0 text-sm border border-border rounded-lg px-3 py-2 bg-surface text-ink"
              />
              <Button type="button" variant="secondary" onClick={creaEtiquetaDelFiltre} loading={creant} disabled={!nomEtiqueta.trim()}>
                Crea i assigna
              </Button>
            </div>
            {errorEtiqueta && <p className="text-xs text-loss">{errorEtiqueta}</p>}
          </div>
        )}
      </Modal>
    </>
  );
}
