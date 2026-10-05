'use client';

import { useEffect, useRef, useState } from 'react';
import type { Tag } from '@/lib/pairing/types';

interface Props {
  tournamentId: string;
  value: Tag[];
  onChange: (tags: Tag[]) => void;
  label?: string;
  placeholder?: string;
}

/**
 * Entrada d'etiquetes amb autocompletar: cada tria afegeix un xip i buida
 * el camp (a diferència de NomBarrufInput, que és d'un sol valor i el
 * substitueix en triar). Si no hi ha cap coincidència exacta, ofereix
 * crear-la — l'etiqueta queda disponible per a tot el campionat.
 */
export default function TagInput({ tournamentId, value, onChange, label, placeholder }: Props) {
  const [text, setText] = useState('');
  const [resultats, setResultats] = useState<Tag[]>([]);
  const [obert, setObert] = useState(false);
  const [creant, setCreant] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = text.trim();
    if (q.length === 0) {
      setResultats([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}/tags?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data: Tag[] = await res.json();
        setResultats(data.filter((t) => !value.some((v) => v.id === t.id)));
        setObert(true);
      }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, tournamentId]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setObert(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function afegeix(tag: Tag) {
    onChange([...value, tag]);
    setText('');
    setResultats([]);
    setObert(false);
  }

  function treu(id: string) {
    onChange(value.filter((t) => t.id !== id));
  }

  async function creaIAfegeix() {
    const nom = text.trim();
    if (!nom) return;
    setCreant(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nom }),
    });
    setCreant(false);
    if (res.ok) afegeix(await res.json());
  }

  const coincidenciaExacta = resultats.some((t) => t.name.toLowerCase() === text.trim().toLowerCase());

  return (
    <div ref={wrapRef} className="relative">
      {label && <label className="block text-sm font-medium text-ink-2 mb-1">{label}</label>}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {value.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent-tint text-accent-ink text-xs font-semibold"
            >
              {t.name}
              <button
                type="button"
                onClick={() => treu(t.id)}
                className="text-accent-ink hover:text-loss cursor-pointer"
                aria-label={`Treu ${t.name}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => { if (resultats.length > 0) setObert(true); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setObert(false);
          if (e.key === 'Enter') {
            e.preventDefault();
            if (coincidenciaExacta) {
              afegeix(resultats.find((t) => t.name.toLowerCase() === text.trim().toLowerCase())!);
            } else if (text.trim()) {
              creaIAfegeix();
            }
          }
        }}
        placeholder={placeholder ?? 'Escriu per cercar o crear...'}
        autoComplete="off"
        className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-surface text-ink"
      />

      {obert && text.trim().length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-surface border border-border rounded-xl shadow-lg overflow-hidden">
          <ul className="divide-y divide-border max-h-56 overflow-y-auto">
            {resultats.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => afegeix(t)}
                  className="w-full text-left px-3 py-2 text-sm text-ink hover:bg-surface-2 cursor-pointer"
                >
                  {t.name}
                </button>
              </li>
            ))}
            {!coincidenciaExacta && (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={creaIAfegeix}
                  disabled={creant}
                  className="w-full text-left px-3 py-2 text-sm text-accent-ink hover:bg-surface-2 cursor-pointer disabled:opacity-50"
                >
                  + Crea «{text.trim()}»
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
