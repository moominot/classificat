'use client';

import { useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import type { OcrFields } from '@/app/api/uploads/score-sheets/route';
import { readError } from '@/lib/http';

export type { OcrFields };

interface Props {
  pairingId: string;
  p1Name: string;
  p2Name: string;
  disabled?: boolean;
  onResult: (fields: OcrFields, imageUrl: string) => void;
}

type Status = 'idle' | 'processing' | 'done' | 'error';

export default function OcrScoreCapture({ pairingId, p1Name, p2Name, disabled, onResult }: Props) {
  const [status, setStatus] = useState<Status>('idle');
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
      fd.append('p1Name', p1Name);
      fd.append('p2Name', p2Name);

      const res = await fetch('/api/uploads/score-sheets', { method: 'POST', body: fd });
      if (!res.ok) {
        throw new Error(await readError(res, 'Error en processar la imatge'));
      }
      const { url, fields } = await res.json();

      setStatus('done');
      onResult(fields, url);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error desconegut');
      setStatus('error');
    }
  }

  return (
    <div className="space-y-1.5">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      {status !== 'processing' && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {status === 'done' ? 'Tornar a escanejar' : 'Escanejar full de puntuació'}
        </Button>
      )}
      {status === 'processing' && (
        <p className="text-xs text-gray-500 flex items-center gap-1.5">
          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Analitzant el full amb IA...
        </p>
      )}
      {status === 'error' && (
        <p className="text-xs text-red-600">{errorMsg}</p>
      )}
    </div>
  );
}
