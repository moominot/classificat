'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';

/**
 * Filtres de nom/club i BARRUF, centralitzats en un modal darrere una icona
 * — abans el formulari sempre hi era, ocupant espai encara que ningú els fes
 * servir la majoria de cops que es consulta la classificació.
 */
export default function FiltresClassificacio({
  tournamentId,
  pestanya,
  faseSeleccionada,
  q,
  br,
  bv,
}: {
  tournamentId: string;
  pestanya: string;
  faseSeleccionada: string | null;
  q: string;
  br: string;
  bv: string;
}) {
  const router = useRouter();
  const [obert, setObert] = useState(false);
  const hiHaFiltre = q.length > 0 || (br.length > 0 && bv.length > 0);

  function baseParams() {
    const params = new URLSearchParams();
    if (pestanya !== 'general') params.set('t', pestanya);
    if (faseSeleccionada) params.set('f', faseSeleccionada);
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
    if (qVal) params.set('q', qVal);
    if (brVal && bvVal) {
      params.set('br', brVal);
      params.set('bv', bvVal);
    }
    navega(params);
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
      </Modal>
    </>
  );
}
