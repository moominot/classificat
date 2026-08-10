'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import OcrScoreCapture, { type OcrFields } from '@/components/OcrScoreCapture';

interface Aparellament {
  id: string;
  player1Id: string;
  player1Name: string;
  player2Id: string | null;
  player2Name: string;
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
  sheetImageUrl: string | null;
}

interface Props {
  aparellament: Aparellament;
  tournamentId: string;
  roundId: string;
  rondaTancada: boolean;
}

export default function FormulariResultatPartida({ aparellament: ap, tournamentId, roundId, rondaTancada }: Props) {
  const router = useRouter();
  const readOnly = rondaTancada;
  const teResultat = ap.outcome1 !== null;

  const [showForm, setShowForm] = useState(!teResultat);
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
  const [sheetImageUrl, setSheetImageUrl] = useState(ap.sheetImageUrl ?? '');

  function handleOcrResult(fields: OcrFields, imageUrl: string) {
    if (fields.p1Score !== null) setP1Score(String(fields.p1Score));
    if (fields.p2Score !== null) setP2Score(String(fields.p2Score));
    if (fields.p1Scrabbles !== null) setP1Scrabbles(String(fields.p1Scrabbles));
    if (fields.p2Scrabbles !== null) setP2Scrabbles(String(fields.p2Scrabbles));
    if (fields.p1BestWord) setP1BestWord(fields.p1BestWord);
    if (fields.p2BestWord) setP2BestWord(fields.p2BestWord);
    if (fields.p1BestWordScore !== null) setP1BestWordScore(String(fields.p1BestWordScore));
    if (fields.p2BestWordScore !== null) setP2BestWordScore(String(fields.p2BestWordScore));
    setSheetImageUrl(imageUrl);
  }

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
        sheetImageUrl: sheetImageUrl || null,
      }),
    });

    if (res.ok) {
      setShowForm(false);
      router.refresh();
    } else {
      const d = await res.json();
      setError(d.error ?? 'Error en desar el resultat');
      setLoading(false);
    }
  }

  // Ronda tancada i ja hi ha resultat: no mostrem res
  if (readOnly && !showForm) return null;

  // Resultat ja introduït i no estem editant: botó Modifica
  if (!showForm) {
    return (
      <Button variant="secondary" onClick={() => setShowForm(true)}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Modifica el resultat
      </Button>
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* OCR */}
        {!readOnly && (
          <div className="space-y-2">
            <OcrScoreCapture
              pairingId={ap.id}
              p1Name={ap.player1Name}
              p2Name={ap.player2Name}
              onResult={handleOcrResult}
            />
            {sheetImageUrl && (
              <a href={sheetImageUrl} target="_blank" rel="noopener noreferrer">
                <img
                  src={sheetImageUrl}
                  alt="Full de puntuació"
                  className="h-20 rounded-lg border border-gray-200 object-cover"
                />
              </a>
            )}
          </div>
        )}

        {/* Puntuacions */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
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
          <div className="text-gray-400 text-lg font-bold pt-7">–</div>
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

        {/* Bingos */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase">Bingos</p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="number"
              min={0}
              value={p1Scrabbles}
              onChange={e => setP1Scrabbles(e.target.value)}
              placeholder={ap.player1Name}
              disabled={readOnly}
            />
            <Input
              type="number"
              min={0}
              value={p2Scrabbles}
              onChange={e => setP2Scrabbles(e.target.value)}
              placeholder={ap.player2Name}
              disabled={readOnly}
            />
          </div>
        </div>

        {/* Millor jugada */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase">Millor jugada</p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={p1BestWord}
              onChange={e => setP1BestWord(e.target.value.toUpperCase())}
              placeholder="PARAULA"
              disabled={readOnly}
              className="uppercase"
            />
            <Input
              value={p2BestWord}
              onChange={e => setP2BestWord(e.target.value.toUpperCase())}
              placeholder="PARAULA"
              disabled={readOnly}
              className="uppercase"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="number"
              min={0}
              value={p1BestWordScore}
              onChange={e => setP1BestWordScore(e.target.value)}
              placeholder={`Pts ${ap.player1Name}`}
              disabled={readOnly}
            />
            <Input
              type="number"
              min={0}
              value={p2BestWordScore}
              onChange={e => setP2BestWordScore(e.target.value)}
              placeholder={`Pts ${ap.player2Name}`}
              disabled={readOnly}
            />
          </div>
        </div>

        {/* Localitat */}
        <Input
          label="Localitat"
          value={location}
          onChange={e => setLocation(e.target.value)}
          placeholder="ex. Palma"
          disabled={readOnly}
        />

        {/* Comentaris */}
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

        <div className="flex gap-2">
          {!readOnly && (
            <Button type="submit" loading={loading}>Desar resultat</Button>
          )}
          {teResultat && (
            <Button type="button" variant="ghost" onClick={() => { setShowForm(false); setError(''); }}>
              Cancel·lar
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
