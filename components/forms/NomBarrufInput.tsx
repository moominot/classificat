'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import Input from '@/components/ui/Input';

export interface BarrufResultat {
  numero: number;
  nom: string;
  club: string | null;
  barruf: number | null;
  categoria: string | null;
  estat: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onPick: (result: BarrufResultat) => void;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  onKeyDownEnter?: () => void;
}

/**
 * Camp de nom amb autocompletar del BARRUF integrat: en escriure, cerca al
 * registre i mostra suggeriments just a sota. Un únic camp fa de cercador i
 * d'entrada manual alhora — si no hi ha coincidència, el text que hi hagi
 * s'agafa tal qual com a nom nou.
 */
const NomBarrufInput = forwardRef<HTMLInputElement, Props>(function NomBarrufInput(
  { value, onChange, onPick, label, placeholder, autoFocus, disabled, onKeyDownEnter },
  ref
) {
  const [resultats, setResultats] = useState<BarrufResultat[]>([]);
  const [obert, setObert] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPicked = useRef<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    const q = value.trim();
    if (q.length < 2 || q === lastPicked.current) {
      setResultats([]);
      setLoading(false);
      return;
    }

    timer.current = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(`/api/barruf/jugadors?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResultats(data);
        setObert(true);
      } else {
        setResultats([]);
      }
      setLoading(false);
    }, 300);

    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setObert(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handlePick(r: BarrufResultat) {
    lastPicked.current = r.nom;
    setObert(false);
    setResultats([]);
    onPick(r);
  }

  return (
    <div ref={wrapRef} className="relative">
      <Input
        ref={ref}
        label={label}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => { if (resultats.length > 0) setObert(true); }}
        onKeyDown={e => {
          if (e.key === 'Escape') setObert(false);
          if (e.key === 'Enter' && !obert) onKeyDownEnter?.();
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        autoComplete="off"
      />
      {obert && (loading || resultats.length > 0) && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-surface border border-border rounded-xl shadow-lg overflow-hidden">
          {loading && resultats.length === 0 ? (
            <p className="text-xs text-ink-3 px-3 py-2">Cercant al BARRUF…</p>
          ) : (
            <ul className="divide-y divide-border max-h-56 overflow-y-auto">
              {resultats.map(r => (
                <li key={r.numero}>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handlePick(r)}
                    className="w-full text-left px-3 py-2 hover:bg-surface-2 cursor-pointer"
                  >
                    <div className="text-sm font-medium text-ink">{r.nom}</div>
                    <div className="text-xs text-ink-3">
                      #{r.numero}{r.club ? ` · ${r.club}` : ''}{r.barruf != null ? ` · BARRUF ${r.barruf}` : ''}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
});

export default NomBarrufInput;
