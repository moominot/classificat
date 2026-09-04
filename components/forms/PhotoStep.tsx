'use client';

import { useRef, useState } from 'react';
import { readError } from '@/lib/http';

export interface OcrFields {
  p1Score: number | null;
  p2Score: number | null;
  p1Scrabbles: number | null;
  p2Scrabbles: number | null;
  p1BestWord: string | null;
  p2BestWord: string | null;
  p1BestWordScore: number | null;
  p2BestWordScore: number | null;
}

interface Props {
  pairingId: string;
  kind: 'sheet' | 'board';
  p1Name: string;
  p2Name: string;
  currentUrl: string;
  disabled?: boolean;
  onUploaded: (url: string, fields: OcrFields | null) => void;
  onRemove: () => void;
}

export default function PhotoStep({ pairingId, kind, p1Name, p2Name, currentUrl, disabled, onUploaded, onRemove }: Props) {
  const [status, setStatus] = useState<'idle' | 'processing' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setStatus('processing');
    setErrorMsg('');

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('pairingId', pairingId);
      fd.append('kind', kind);
      fd.append('p1Name', p1Name);
      fd.append('p2Name', p2Name);

      const res = await fetch('/api/uploads/score-sheets', { method: 'POST', body: fd });
      if (!res.ok) {
        throw new Error(await readError(res, 'Error en processar la imatge'));
      }
      const { url, fields } = await res.json();
      setStatus('idle');
      onUploaded(url, kind === 'sheet' ? fields : null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error desconegut');
      setStatus('error');
    }
  }

  if (status === 'processing') {
    return (
      <div className="min-h-[200px] rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-3 text-ink-3">
        <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm font-medium">{kind === 'sheet' ? 'Analitzant el full amb IA...' : 'Pujant la foto...'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      {currentUrl ? (
        <div className="rounded-2xl border border-border overflow-hidden">
          <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="block h-[200px] bg-surface-2">
            <img src={currentUrl} alt="" className="w-full h-full object-cover" />
          </a>
          <div className="flex items-center justify-between px-4 py-2.5">
            <button
              type="button"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              className="text-sm font-medium text-accent-ink cursor-pointer"
            >
              Torna a fer la foto
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={onRemove}
              className="text-sm font-semibold text-loss cursor-pointer"
            >
              Elimina
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          className="w-full min-h-[200px] rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-3 text-ink-3 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-sm font-semibold">Fes o puja una foto</span>
        </button>
      )}
      {status === 'error' && <p className="text-xs text-loss">{errorMsg}</p>}
    </div>
  );
}
