'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';

interface Aparellament {
  id: string;
  tableNumber: number;
  player1Id: string;
  player1Name: string;
  player2Id: string | null;
  player2Name: string | null;
  p1Score: number | null;
  p2Score: number | null;
  outcome1: string | null;
  p1Scrabbles: number | null;
  p2Scrabbles: number | null;
  p1BestWord: string | null;
  p2BestWord: string | null;
  p1BestWordScore: number | null;
  p2BestWordScore: number | null;
  location: string | null;
  comments: string | null;
}

export default function ResultatAparellament({
  aparellament: ap,
  tournamentId,
  roundId,
  rondaTancada,
}: {
  aparellament: Aparellament;
  tournamentId: string;
  roundId: string;
  rondaTancada: boolean;
}) {
  const router = useRouter();
  const [expandit, setExpandit] = useState(false);

  const esBye = ap.player2Id === null;
  const teResultat = ap.outcome1 !== null;
  const jugat = teResultat && !esBye;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Fila principal */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
        onClick={() => !esBye && setExpandit(v => !v)}
      >
        {/* Número de taula */}
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          esBye ? 'bg-gray-100 text-gray-400' : 'bg-blue-100 text-blue-700'
        }`}>
          {esBye ? '—' : ap.tableNumber}
        </div>

        {/* Jugadors i resultat */}
        <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {/* Jugador 1 */}
          <div className={`text-sm font-medium truncate ${
            jugat && ap.outcome1 === 'win' ? 'text-blue-700' : 'text-gray-900'
          }`}>
            {ap.player1Name}
          </div>

          {/* Resultat central */}
          <div className="text-center flex-shrink-0 min-w-[80px]">
            {esBye ? (
              <span className="text-xs text-gray-400 italic">BYE</span>
            ) : jugat ? (
              <span className="font-bold text-gray-900 tabular-nums">
                {ap.p1Score} – {ap.p2Score}
              </span>
            ) : (
              <span className="text-xs text-gray-400">vs</span>
            )}
          </div>

          {/* Jugador 2 */}
          <div className={`text-sm font-medium truncate text-right ${
            jugat && ap.outcome1 === 'loss' ? 'text-blue-700' : 'text-gray-900'
          }`}>
            {ap.player2Name ?? '—'}
          </div>
        </div>

        {/* Estat */}
        <div className="flex-shrink-0">
          {esBye ? (
            <Badge color="gray">Bye</Badge>
          ) : jugat ? (
            <Badge color="green">Jugada</Badge>
          ) : (
            <Badge color="yellow">Pendent</Badge>
          )}
        </div>

        {!esBye && (
          <svg className={`w-4 h-4 text-gray-300 transition-transform flex-shrink-0 ${expandit ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </button>

      {/* Formulari expandit */}
      {expandit && !esBye && (
        <div className="border-t border-gray-100 px-4 py-4">
          <FormulariResultat
            aparellament={ap}
            tournamentId={tournamentId}
            roundId={roundId}
            rondaTancada={rondaTancada}
            onDone={() => { setExpandit(false); router.refresh(); }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Formulari de resultat ────────────────────────────────────────────────────

function FormulariResultat({
  aparellament: ap,
  tournamentId,
  roundId,
  rondaTancada,
  onDone,
}: {
  aparellament: Aparellament;
  tournamentId: string;
  roundId: string;
  rondaTancada: boolean;
  onDone: () => void;
}) {
  const [p1Score, setP1Score] = useState(ap.p1Score?.toString() ?? '');
  const [p2Score, setP2Score] = useState(ap.p2Score?.toString() ?? '');
  const [p1Scrabbles, setP1Scrabbles] = useState(ap.p1Scrabbles?.toString() ?? '');
  const [p2Scrabbles, setP2Scrabbles] = useState(ap.p2Scrabbles?.toString() ?? '');
  const [p1BestWord, setP1BestWord] = useState(ap.p1BestWord ?? '');
  const [p2BestWord, setP2BestWord] = useState(ap.p2BestWord ?? '');
  const [p1BestWordScore, setP1BestWordScore] = useState(ap.p1BestWordScore?.toString() ?? '');
  const [p2BestWordScore, setP2BestWordScore] = useState(ap.p2BestWordScore?.toString() ?? '');
  const [location, setLocation] = useState(ap.location ?? '');
  const [comments, setComments] = useState(ap.comments ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!p1Score || !p2Score) { setError('Cal introduir les dues puntuacions'); return; }
    setLoading(true);
    setError('');

    const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${roundId}/result`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairingId: ap.id,
        p1Score: parseInt(p1Score),
        p2Score: parseInt(p2Score),
        p1Scrabbles: p1Scrabbles ? parseInt(p1Scrabbles) : null,
        p2Scrabbles: p2Scrabbles ? parseInt(p2Scrabbles) : null,
        p1BestWord: p1BestWord || null,
        p2BestWord: p2BestWord || null,
        p1BestWordScore: p1BestWordScore ? parseInt(p1BestWordScore) : null,
        p2BestWordScore: p2BestWordScore ? parseInt(p2BestWordScore) : null,
        location: location || null,
        comments: comments || null,
      }),
    });

    if (res.ok) {
      onDone();
    } else {
      const d = await res.json();
      setError(d.error ?? 'Error en desar el resultat');
      setLoading(false);
    }
  }

  const readOnly = rondaTancada;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Puntuacions principals */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">
            {ap.player1Name}
          </p>
          <Input
            type="number"
            min={0}
            max={999}
            value={p1Score}
            onChange={e => setP1Score(e.target.value)}
            placeholder="Punts"
            disabled={readOnly}
          />
        </div>
        <div className="text-gray-400 text-lg font-bold pb-2">–</div>
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate text-right">
            {ap.player2Name}
          </p>
          <Input
            type="number"
            min={0}
            max={999}
            value={p2Score}
            onChange={e => setP2Score(e.target.value)}
            placeholder="Punts"
            disabled={readOnly}
          />
        </div>
      </div>

      {/* Estadístiques Scrabble */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase">Bingos</p>
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" min={0} value={p1Scrabbles} onChange={e => setP1Scrabbles(e.target.value)} placeholder="J1" disabled={readOnly} />
            <Input type="number" min={0} value={p2Scrabbles} onChange={e => setP2Scrabbles(e.target.value)} placeholder="J2" disabled={readOnly} />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase">Millor jugada</p>
          <div className="grid grid-cols-2 gap-2">
            <Input value={p1BestWord} onChange={e => setP1BestWord(e.target.value.toUpperCase())} placeholder="PARAULA" disabled={readOnly} className="uppercase" />
            <Input value={p2BestWord} onChange={e => setP2BestWord(e.target.value.toUpperCase())} placeholder="PARAULA" disabled={readOnly} className="uppercase" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" min={0} value={p1BestWordScore} onChange={e => setP1BestWordScore(e.target.value)} placeholder="Pts J1" disabled={readOnly} />
            <Input type="number" min={0} value={p2BestWordScore} onChange={e => setP2BestWordScore(e.target.value)} placeholder="Pts J2" disabled={readOnly} />
          </div>
        </div>
      </div>

      {/* Localitat i comentaris */}
      <div className="grid grid-cols-2 gap-3">
        <Input label="Localitat" value={location} onChange={e => setLocation(e.target.value)} placeholder="ex. Palma" disabled={readOnly} />
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">Comentaris</label>
        <textarea
          value={comments}
          onChange={e => setComments(e.target.value)}
          disabled={readOnly}
          placeholder="Comentaris opcionals..."
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!readOnly && (
        <div className="flex gap-2">
          <Button type="submit" loading={loading}>Desar resultat</Button>
          <Button type="button" variant="ghost" onClick={onDone}>Cancel·lar</Button>
        </div>
      )}
      {readOnly && (
        <p className="text-sm text-gray-400 italic">La ronda està tancada i no es poden editar els resultats.</p>
      )}
    </form>
  );
}
