'use client';

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function QrCompartir({ tournamentId }: { tournamentId: string }) {
  const [obert, setObert] = useState(false);
  const [copiat, setCopiat] = useState(false);
  const [url, setUrl] = useState('');

  useEffect(() => {
    setUrl(`${window.location.origin}/campionat/${tournamentId}`);
  }, [tournamentId]);

  async function copiarEnllac() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopiat(true);
    setTimeout(() => setCopiat(false), 2000);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setObert(o => !o)}
        title="Compartir campionat"
        className="flex items-center gap-1.5 text-xs text-ink-3 hover:text-accent-ink transition-colors px-2 py-1 rounded-lg hover:bg-accent-tint"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        Compartir
      </button>

      {obert && url && (
        <div className="absolute right-0 top-full mt-2 z-20 bg-surface border border-border rounded-xl shadow-lg p-4 w-64 space-y-3">
          <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide">Enllaç per als jugadors</p>

          <div className="flex justify-center">
            <QRCodeSVG value={url} size={180} />
          </div>

          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              className="flex-1 min-w-0 text-xs text-ink-2 bg-surface-2 border border-border rounded-lg px-2 py-1.5 truncate"
            />
            <button
              onClick={copiarEnllac}
              className="shrink-0 text-xs font-semibold px-2 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-ink transition-colors"
            >
              {copiat ? '✓' : 'Copia'}
            </button>
          </div>
        </div>
      )}

      {/* Overlay per tancar en clicar fora */}
      {obert && (
        <div className="fixed inset-0 z-10" onClick={() => setObert(false)} />
      )}
    </div>
  );
}
