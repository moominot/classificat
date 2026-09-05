'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { readError } from '@/lib/http';
import PhotoStep, { type OcrFields } from '@/components/forms/PhotoStep';

interface QuestionDef {
  id: string;
  key: string;
  isBuiltin: boolean;
  type: 'value' | 'wordvalue' | 'image';
  scope: 'match' | 'player';
  label: string;
  label1: string | null;
  label2: string | null;
  answerType: 'text' | 'number' | null;
}

interface ExistingAnswer {
  questionId: string;
  player: number | null;
  textValue: string | null;
  numberValue: number | null;
  imageUrl: string | null;
}

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
  sheetImageUrl: string | null;
  boardImageUrl: string | null;
}

interface Props {
  aparellament: Aparellament;
  tournamentId: string;
  roundId: string;
  rondaTancada: boolean;
  questions: QuestionDef[];
  existingAnswers: ExistingAnswer[];
}

type Slot = { text: string; number: string; imageUrl: string };
type Values = Record<string, Slot>;

const EMPTY_SLOT: Slot = { text: '', number: '', imageUrl: '' };

function slotKey(questionId: string, player: 1 | 2 | null) {
  return `${questionId}:${player ?? 'm'}`;
}

function playersFor(q: QuestionDef): (1 | 2 | null)[] {
  return q.scope === 'player' ? [1, 2] : [null];
}

function initialValues(ap: Aparellament, questions: QuestionDef[], existingAnswers: ExistingAnswer[]): Values {
  const v: Values = {};
  for (const q of questions) {
    for (const player of playersFor(q)) {
      const key = slotKey(q.id, player);
      if (q.isBuiltin) {
        if (q.key === 'score') {
          v[key] = { ...EMPTY_SLOT, number: (player === 1 ? ap.p1Score : ap.p2Score)?.toString() ?? '' };
        } else if (q.key === 'bingos') {
          v[key] = { ...EMPTY_SLOT, number: (player === 1 ? ap.p1Scrabbles : ap.p2Scrabbles)?.toString() ?? '' };
        } else if (q.key === 'best_word') {
          v[key] = {
            ...EMPTY_SLOT,
            text: (player === 1 ? ap.p1BestWord : ap.p2BestWord) ?? '',
            number: (player === 1 ? ap.p1BestWordScore : ap.p2BestWordScore)?.toString() ?? '',
          };
        } else if (q.key === 'sheet_image') {
          v[key] = { ...EMPTY_SLOT, imageUrl: ap.sheetImageUrl ?? '' };
        } else if (q.key === 'board_image') {
          v[key] = { ...EMPTY_SLOT, imageUrl: ap.boardImageUrl ?? '' };
        } else {
          v[key] = { ...EMPTY_SLOT };
        }
      } else {
        const existing = existingAnswers.find(a => a.questionId === q.id && a.player === player);
        v[key] = {
          text: existing?.textValue ?? '',
          number: existing?.numberValue?.toString() ?? '',
          imageUrl: existing?.imageUrl ?? '',
        };
      }
    }
  }
  return v;
}

export default function FormulariResultatWizard({
  aparellament: ap, tournamentId, roundId, rondaTancada, questions, existingAnswers,
}: Props) {
  const router = useRouter();
  const teResultat = ap.outcome1 !== null;
  const [showForm, setShowForm] = useState(!teResultat);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>(() => initialValues(ap, questions, existingAnswers));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const totalSteps = questions.length + 1; // +1 = pas de confirmació
  const confirmStepIndex = questions.length;

  function setSlot(questionId: string, player: 1 | 2 | null, patch: Partial<Slot>) {
    const key = slotKey(questionId, player);
    setValues(v => ({ ...v, [key]: { ...v[key], ...patch } }));
  }

  function applyOcr(fields: OcrFields) {
    setValues(v => {
      const next = { ...v };
      const scoreQ = questions.find(q => q.key === 'score');
      const bingosQ = questions.find(q => q.key === 'bingos');
      const wordQ = questions.find(q => q.key === 'best_word');
      if (scoreQ) {
        if (fields.p1Score != null) next[slotKey(scoreQ.id, 1)] = { ...next[slotKey(scoreQ.id, 1)], number: String(fields.p1Score) };
        if (fields.p2Score != null) next[slotKey(scoreQ.id, 2)] = { ...next[slotKey(scoreQ.id, 2)], number: String(fields.p2Score) };
      }
      if (bingosQ) {
        if (fields.p1Scrabbles != null) next[slotKey(bingosQ.id, 1)] = { ...next[slotKey(bingosQ.id, 1)], number: String(fields.p1Scrabbles) };
        if (fields.p2Scrabbles != null) next[slotKey(bingosQ.id, 2)] = { ...next[slotKey(bingosQ.id, 2)], number: String(fields.p2Scrabbles) };
      }
      if (wordQ) {
        if (fields.p1BestWord) next[slotKey(wordQ.id, 1)] = { ...next[slotKey(wordQ.id, 1)], text: fields.p1BestWord, number: fields.p1BestWordScore != null ? String(fields.p1BestWordScore) : next[slotKey(wordQ.id, 1)].number };
        if (fields.p2BestWord) next[slotKey(wordQ.id, 2)] = { ...next[slotKey(wordQ.id, 2)], text: fields.p2BestWord, number: fields.p2BestWordScore != null ? String(fields.p2BestWordScore) : next[slotKey(wordQ.id, 2)].number };
      }
      return next;
    });
  }

  async function handleSubmit() {
    setLoading(true);
    setError('');

    const answers = questions.flatMap(q => playersFor(q).map(player => {
      const slot = values[slotKey(q.id, player)] ?? EMPTY_SLOT;
      if (q.type === 'image') {
        return { questionId: q.id, player, imageUrl: slot.imageUrl || null };
      }
      if (q.type === 'wordvalue') {
        return { questionId: q.id, player, textValue: slot.text || null, numberValue: slot.number ? parseInt(slot.number) : null };
      }
      // value
      if (q.answerType === 'number') {
        return { questionId: q.id, player, numberValue: slot.number ? parseInt(slot.number) : null };
      }
      return { questionId: q.id, player, textValue: slot.text || null };
    }));

    const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${roundId}/result`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingId: ap.id, answers }),
    });

    if (res.ok) {
      setShowForm(false);
      router.refresh();
    } else {
      setError(await readError(res, 'Error en desar el resultat'));
      setLoading(false);
    }
  }

  if (rondaTancada && !showForm) return null;

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

  const currentQuestion = step < questions.length ? questions[step] : null;
  const stepTitle = currentQuestion ? currentQuestion.label : 'Confirma';
  const progressPct = Math.round(((step + 1) / totalSteps) * 100);

  return (
    <Card padding={false}>
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between text-xs text-ink-3 mb-2">
          <span>Pas {step + 1} de {totalSteps}</span>
          <span className="font-medium">{stepTitle}</span>
        </div>
        <div className="h-1 rounded-full bg-surface-2 overflow-hidden mb-5">
          <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="px-5 pb-5">
        {currentQuestion && (
          <QuestionStep
            question={currentQuestion}
            ap={ap}
            values={values}
            setSlot={setSlot}
            applyOcr={applyOcr}
            disabled={loading}
          />
        )}

        {step === confirmStepIndex && (
          <ConfirmStep questions={questions} ap={ap} values={values} />
        )}

        {error && <p className="text-sm text-loss mt-4">{error}</p>}

        <div className="flex gap-2 mt-6">
          <Button variant="secondary" className="flex-1" disabled={step === 0 || loading} onClick={() => setStep(s => Math.max(0, s - 1))}>
            Enrere
          </Button>
          {step < confirmStepIndex ? (
            <Button className="flex-[2]" disabled={loading} onClick={() => setStep(s => Math.min(confirmStepIndex, s + 1))}>
              Següent
            </Button>
          ) : (
            <Button className="flex-[2]" loading={loading} onClick={handleSubmit}>
              Confirma el resultat
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function PlayerCard({ player, name, children }: { player: 1 | 2 | null; name?: string; children: React.ReactNode }) {
  if (player === null) {
    return <div className="rounded-2xl border-2 border-dashed border-border p-4">{children}</div>;
  }
  const isP1 = player === 1;
  return (
    <div className={`rounded-2xl border-2 p-4 ${isP1 ? 'border-accent bg-accent-tint' : 'border-p2 bg-p2-tint'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-display font-bold text-surface flex-shrink-0 ${isP1 ? 'bg-accent' : 'bg-p2'}`}>
          {player}
        </span>
        <span className="font-semibold text-sm text-ink truncate">{name}</span>
      </div>
      {children}
    </div>
  );
}

function questionSubtitle(q: QuestionDef): string {
  if (q.isBuiltin) {
    switch (q.key) {
      case 'score': return 'Introdueix la puntuació de cada jugador';
      case 'bingos': return "Quantes vegades ha col·locat les 7 fitxes?";
      case 'best_word': return 'La paraula amb més punts de cada jugador';
      case 'sheet_image': return 'Es desarà al servidor i es podrà veure en repassar la partida';
      case 'board_image': return "Opcional — l'estat final del tauler";
    }
  }
  if (q.type === 'image') return 'Es desarà al servidor i es podrà veure en repassar la partida';
  if (q.type === 'wordvalue') return q.scope === 'player' ? 'Paraula i puntuació de cada jugador' : 'Paraula i puntuació de la partida';
  return q.scope === 'player' ? 'Introdueix el valor de cada jugador' : 'Introdueix el valor de la partida';
}

function QuestionStep({
  question, ap, values, setSlot, applyOcr, disabled,
}: {
  question: QuestionDef;
  ap: Aparellament;
  values: Values;
  setSlot: (questionId: string, player: 1 | 2 | null, patch: Partial<Slot>) => void;
  applyOcr: (fields: OcrFields) => void;
  disabled: boolean;
}) {
  const players = playersFor(question);
  const names: Record<string, string | undefined> = { '1': ap.player1Name, '2': ap.player2Name };

  return (
    <div className="space-y-3">
      <div className="text-center mb-1">
        <div className="font-display font-bold text-xl text-ink">{question.label}</div>
        <div className="text-sm text-ink-3 mt-0.5">{questionSubtitle(question)}</div>
      </div>
      {players.map(player => {
        const slot = values[slotKey(question.id, player)] ?? EMPTY_SLOT;
        return (
          <PlayerCard key={player ?? 'm'} player={player} name={player ? names[String(player)] : undefined}>
            {question.type === 'value' && (
              <input
                type={question.answerType === 'number' ? 'number' : 'text'}
                inputMode={question.answerType === 'number' ? 'numeric' : undefined}
                disabled={disabled}
                className="w-full text-center bg-transparent border-none outline-none font-display font-bold text-[40px] text-ink placeholder:text-ink-3"
                placeholder="0"
                value={question.answerType === 'number' ? slot.number : slot.text}
                onChange={e => setSlot(question.id, player, question.answerType === 'number' ? { number: e.target.value } : { text: e.target.value })}
              />
            )}
            {question.type === 'wordvalue' && (
              <div className="grid grid-cols-[1fr_90px] gap-2">
                <Input
                  disabled={disabled}
                  placeholder={question.label1 ?? 'Paraula'}
                  value={slot.text}
                  onChange={e => setSlot(question.id, player, { text: e.target.value })}
                />
                <Input
                  type="number"
                  disabled={disabled}
                  placeholder={question.label2 ?? 'Punts'}
                  value={slot.number}
                  onChange={e => setSlot(question.id, player, { number: e.target.value })}
                />
              </div>
            )}
            {question.type === 'image' && (
              <PhotoStep
                pairingId={ap.id}
                kind={question.key === 'sheet_image' ? 'sheet' : 'board'}
                p1Name={ap.player1Name}
                p2Name={ap.player2Name}
                currentUrl={slot.imageUrl}
                disabled={disabled}
                onUploaded={(url, fields) => {
                  setSlot(question.id, player, { imageUrl: url });
                  if (fields) applyOcr(fields);
                }}
                onRemove={() => setSlot(question.id, player, { imageUrl: '' })}
              />
            )}
          </PlayerCard>
        );
      })}
    </div>
  );
}

function answerSummary(q: QuestionDef, slot: Slot | undefined): string {
  const s = slot ?? EMPTY_SLOT;
  if (q.type === 'image') return s.imageUrl ? 'Adjuntada' : 'Sense adjuntar';
  if (q.type === 'wordvalue') return s.text ? `${s.text} (${s.number || 0})` : '—';
  return (q.answerType === 'number' ? s.number : s.text) || '—';
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-ink-3 min-w-0 truncate">{label}</span>
      <span className="text-ink font-medium text-right flex-shrink-0 max-w-[55%] truncate">{value}</span>
    </div>
  );
}

function ConfirmStep({ questions, ap, values }: { questions: QuestionDef[]; ap: Aparellament; values: Values }) {
  const scoreQ = questions.find(q => q.key === 'score');
  const playerQuestions = questions.filter(q => q.scope === 'player' && q.id !== scoreQ?.id);
  const matchQuestions = questions.filter(q => q.scope === 'match');

  return (
    <div className="space-y-3">
      {([1, 2] as const).map(player => {
        const name = player === 1 ? ap.player1Name : ap.player2Name;
        const scoreSlot = scoreQ ? values[slotKey(scoreQ.id, player)] : undefined;
        return (
          <div key={player} className="rounded-2xl border border-border p-3.5">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className="text-sm font-semibold text-ink truncate">{name}</span>
              {scoreQ && (
                <span className="font-display font-bold text-xl tabular-nums text-ink flex-shrink-0">
                  {scoreSlot?.number || '—'}
                </span>
              )}
            </div>
            {playerQuestions.length > 0 && (
              <div className="space-y-1">
                {playerQuestions.map(q => (
                  <ConfirmRow key={q.id} label={q.label} value={answerSummary(q, values[slotKey(q.id, player)])} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {matchQuestions.length > 0 && (
        <div className="rounded-2xl border border-border p-3.5 space-y-1">
          {matchQuestions.map(q => (
            <ConfirmRow key={q.id} label={q.label} value={answerSummary(q, values[slotKey(q.id, null)])} />
          ))}
        </div>
      )}
    </div>
  );
}
