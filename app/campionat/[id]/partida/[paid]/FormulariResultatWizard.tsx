'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { readError } from '@/lib/http';
import PhotoStep, { type OcrParticipantFields } from '@/components/forms/PhotoStep';

export interface QuestionDef {
  id: string;
  key: string;
  isBuiltin: boolean;
  type: 'value' | 'wordvalue' | 'image';
  scope: 'match' | 'participant';
  label: string;
  label1: string | null;
  label2: string | null;
  answerType: 'text' | 'number' | null;
}

export interface ExistingAnswer {
  questionId: string;
  entryId: string | null;
  textValue: string | null;
  numberValue: number | null;
  imageUrl: string | null;
}

export interface ParticipantVista {
  entryId: string;
  displayName: string;
  score: number | null;
}

interface Props {
  partida: { id: string; participants: ParticipantVista[]; teResultat: boolean };
  tournamentId: string;
  roundId: string;
  potEditar: boolean;
  questions: QuestionDef[];
  existingAnswers: ExistingAnswer[];
  /** Número de la ronda següent si encara se'n juguen més; null si no cal preguntar. */
  properaRonda?: number | null;
  continuaInicial?: Record<string, boolean>;
}

type Slot = { text: string; number: string; imageUrl: string };
type Values = Record<string, Slot>;

const EMPTY_SLOT: Slot = { text: '', number: '', imageUrl: '' };

function slotKey(questionId: string, entryId: string | null) {
  return `${questionId}:${entryId ?? 'm'}`;
}

/** Una pregunta d'àmbit `participant` es contesta un cop per cadira. */
function targetsFor(q: QuestionDef, participants: ParticipantVista[]): (string | null)[] {
  return q.scope === 'participant' ? participants.map((p) => p.entryId) : [null];
}

function initialValues(
  participants: ParticipantVista[],
  questions: QuestionDef[],
  existingAnswers: ExistingAnswer[]
): Values {
  const values: Values = {};
  for (const question of questions) {
    for (const target of targetsFor(question, participants)) {
      const key = slotKey(question.id, target);

      // La puntuació no és una resposta: viu a la participació, perquè és el
      // que determina la posició i els punts (docs/pla-rols.md §12.10).
      if (question.key === 'score' && target) {
        const participant = participants.find((p) => p.entryId === target);
        values[key] = { ...EMPTY_SLOT, number: participant?.score?.toString() ?? '' };
        continue;
      }

      const existing = existingAnswers.find(
        (a) => a.questionId === question.id && (a.entryId ?? null) === target
      );
      values[key] = {
        text: existing?.textValue ?? '',
        number: existing?.numberValue?.toString() ?? '',
        imageUrl: existing?.imageUrl ?? '',
      };
    }
  }
  return values;
}

export default function FormulariResultatWizard({
  partida,
  tournamentId,
  roundId,
  potEditar,
  questions,
  existingAnswers,
  properaRonda = null,
  continuaInicial = {},
}: Props) {
  const router = useRouter();
  const participants = partida.participants;
  const [showForm, setShowForm] = useState(!partida.teResultat);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>(() =>
    initialValues(participants, questions, existingAnswers)
  );
  const [continuen, setContinuen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(participants.map((p) => [p.entryId, continuaInicial[p.entryId] ?? true]))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Pas de «continueu?» (si en queden de rondes) i pas de confirmació, al final.
  const continuacioStepIndex = properaRonda !== null ? questions.length : -1;
  const totalSteps = questions.length + (properaRonda !== null ? 1 : 0) + 1;
  const confirmStepIndex = totalSteps - 1;

  function setSlot(questionId: string, entryId: string | null, patch: Partial<Slot>) {
    const key = slotKey(questionId, entryId);
    setValues((v) => ({ ...v, [key]: { ...(v[key] ?? EMPTY_SLOT), ...patch } }));
  }

  /** L'OCR arriba per participant, en ordre de cadira. */
  function applyOcr(fields: OcrParticipantFields[]) {
    setValues((v) => {
      const next = { ...v };
      const scoreQ = questions.find((q) => q.key === 'score');
      const bingosQ = questions.find((q) => q.key === 'bingos');
      const wordQ = questions.find((q) => q.key === 'best_word');

      participants.forEach((participant, i) => {
        const read = fields[i];
        if (!read) return;

        if (scoreQ && read.score != null) {
          const key = slotKey(scoreQ.id, participant.entryId);
          next[key] = { ...(next[key] ?? EMPTY_SLOT), number: String(read.score) };
        }
        if (bingosQ && read.bingos != null) {
          const key = slotKey(bingosQ.id, participant.entryId);
          next[key] = { ...(next[key] ?? EMPTY_SLOT), number: String(read.bingos) };
        }
        if (wordQ && read.bestWord) {
          const key = slotKey(wordQ.id, participant.entryId);
          next[key] = {
            ...(next[key] ?? EMPTY_SLOT),
            text: read.bestWord,
            number: read.bestWordScore != null ? String(read.bestWordScore) : next[key]?.number ?? '',
          };
        }
      });
      return next;
    });
  }

  async function handleSubmit() {
    setLoading(true);
    setError('');

    const scoreQ = questions.find((q) => q.key === 'score');

    const participantsPayload = participants.map((participant) => {
      const slot = scoreQ ? values[slotKey(scoreQ.id, participant.entryId)] : undefined;
      return {
        entryId: participant.entryId,
        score: slot?.number ? parseInt(slot.number) : null,
      };
    });

    const answers = questions
      .filter((q) => q.key !== 'score')
      .flatMap((q) =>
        targetsFor(q, participants).map((entryId) => {
          const slot = values[slotKey(q.id, entryId)] ?? EMPTY_SLOT;
          if (q.type === 'image') {
            return { questionId: q.id, entryId, imageUrl: slot.imageUrl || null };
          }
          if (q.type === 'wordvalue') {
            return {
              questionId: q.id,
              entryId,
              textValue: slot.text || null,
              numberValue: slot.number ? parseInt(slot.number) : null,
            };
          }
          if (q.answerType === 'number') {
            return {
              questionId: q.id,
              entryId,
              numberValue: slot.number ? parseInt(slot.number) : null,
            };
          }
          return { questionId: q.id, entryId, textValue: slot.text || null };
        })
      );

    const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${roundId}/result`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matchId: partida.id,
        participants: participantsPayload,
        answers,
        ...(properaRonda !== null ? { continues: continuen } : {}),
      }),
    });

    if (res.ok) {
      setShowForm(false);
      router.refresh();
    } else {
      setError(await readError(res, 'Error en desar el resultat'));
      setLoading(false);
    }
  }

  if (!potEditar) return null;

  if (!showForm) {
    return (
      <Button variant="secondary" onClick={() => setShowForm(true)}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
        Modifica el resultat
      </Button>
    );
  }

  const currentQuestion = step < questions.length ? questions[step] : null;
  const stepTitle = currentQuestion
    ? currentQuestion.label
    : step === continuacioStepIndex
      ? `Ronda ${properaRonda}`
      : 'Confirma';
  const progressPct = Math.round(((step + 1) / totalSteps) * 100);

  return (
    <Card padding={false}>
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between text-xs text-ink-3 mb-2">
          <span>
            Pas {step + 1} de {totalSteps}
          </span>
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
            matchId={partida.id}
            participants={participants}
            values={values}
            setSlot={setSlot}
            applyOcr={applyOcr}
            disabled={loading}
          />
        )}

        {step === confirmStepIndex && (
          <ConfirmStep
            questions={questions}
            participants={participants}
            values={values}
            continuacio={properaRonda !== null ? { properaRonda, value: continuen } : null}
          />
        )}

        {step === continuacioStepIndex && properaRonda !== null && (
          <ContinuacioStep
            properaRonda={properaRonda}
            participants={participants}
            value={continuen}
            onChange={setContinuen}
          />
        )}

        {error && <p className="text-sm text-loss mt-4">{error}</p>}

        <div className="flex gap-2 mt-6">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={step === 0 || loading}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Enrere
          </Button>
          {step < confirmStepIndex ? (
            <Button
              className="flex-[2]"
              disabled={loading}
              onClick={() => setStep((s) => Math.min(confirmStepIndex, s + 1))}
            >
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

/** Els dos primers seients tenen color propi; a partir del tercer, neutre. */
const SEAT_STYLES = [
  { card: 'border-accent bg-accent-tint', dot: 'bg-accent' },
  { card: 'border-p2 bg-p2-tint', dot: 'bg-p2' },
  { card: 'border-border bg-surface-2', dot: 'bg-ink-3' },
];

function ParticipantCard({
  seat,
  name,
  children,
}: {
  seat: number | null;
  name?: string;
  children: React.ReactNode;
}) {
  if (seat === null) {
    return <div className="rounded-2xl border-2 border-dashed border-border p-4">{children}</div>;
  }
  const style = SEAT_STYLES[Math.min(seat, SEAT_STYLES.length - 1)];
  return (
    <div className={`rounded-2xl border-2 p-4 ${style.card}`}>
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-display font-bold text-surface flex-shrink-0 ${style.dot}`}
        >
          {seat + 1}
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
      case 'score':
        return 'Introdueix la puntuació de cada jugador';
      case 'bingos':
        return 'Quantes vegades ha col·locat les 7 fitxes?';
      case 'best_word':
        return 'La paraula amb més punts de cada jugador';
      case 'sheet_image':
        return 'Es desarà al servidor i es podrà veure en repassar la partida';
      case 'board_image':
        return "Opcional — l'estat final del tauler";
    }
  }
  if (q.type === 'image') return 'Es desarà al servidor i es podrà veure en repassar la partida';
  if (q.type === 'wordvalue') {
    return q.scope === 'participant' ? 'Paraula i puntuació de cada jugador' : 'Paraula i puntuació de la partida';
  }
  return q.scope === 'participant' ? 'Introdueix el valor de cada jugador' : 'Introdueix el valor de la partida';
}

function QuestionStep({
  question,
  matchId,
  participants,
  values,
  setSlot,
  applyOcr,
  disabled,
}: {
  question: QuestionDef;
  matchId: string;
  participants: ParticipantVista[];
  values: Values;
  setSlot: (questionId: string, entryId: string | null, patch: Partial<Slot>) => void;
  applyOcr: (fields: OcrParticipantFields[]) => void;
  disabled: boolean;
}) {
  const targets = targetsFor(question, participants);

  return (
    <div className="space-y-3">
      <div className="text-center mb-1">
        <div className="font-display font-bold text-xl text-ink">{question.label}</div>
        <div className="text-sm text-ink-3 mt-0.5">{questionSubtitle(question)}</div>
      </div>
      {targets.map((entryId, i) => {
        const slot = values[slotKey(question.id, entryId)] ?? EMPTY_SLOT;
        const participant = entryId ? participants.find((p) => p.entryId === entryId) : undefined;

        return (
          <ParticipantCard
            key={entryId ?? 'm'}
            seat={entryId ? i : null}
            name={participant?.displayName}
          >
            {question.type === 'value' && (
              <input
                type={question.answerType === 'number' ? 'number' : 'text'}
                inputMode={question.answerType === 'number' ? 'numeric' : undefined}
                disabled={disabled}
                className="w-full text-center bg-transparent border-none outline-none font-display font-bold text-[40px] text-ink placeholder:text-ink-3"
                placeholder="0"
                value={question.answerType === 'number' ? slot.number : slot.text}
                onChange={(e) =>
                  setSlot(
                    question.id,
                    entryId,
                    question.answerType === 'number' ? { number: e.target.value } : { text: e.target.value }
                  )
                }
              />
            )}
            {question.type === 'wordvalue' && (
              <div className="grid grid-cols-[1fr_90px] gap-2">
                <Input
                  disabled={disabled}
                  placeholder={question.label1 ?? 'Paraula'}
                  value={slot.text}
                  onChange={(e) => setSlot(question.id, entryId, { text: e.target.value })}
                />
                <Input
                  type="number"
                  disabled={disabled}
                  placeholder={question.label2 ?? 'Punts'}
                  value={slot.number}
                  onChange={(e) => setSlot(question.id, entryId, { number: e.target.value })}
                />
              </div>
            )}
            {question.type === 'image' && (
              <PhotoStep
                matchId={matchId}
                kind={question.key === 'board_image' ? 'board' : 'sheet'}
                names={participants.map((p) => p.displayName)}
                currentUrl={slot.imageUrl}
                disabled={disabled}
                onUploaded={(url, fields) => {
                  setSlot(question.id, entryId, { imageUrl: url });
                  if (fields) applyOcr(fields);
                }}
                onRemove={() => setSlot(question.id, entryId, { imageUrl: '' })}
              />
            )}
          </ParticipantCard>
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

function ConfirmStep({
  questions,
  participants,
  values,
  continuacio,
}: {
  questions: QuestionDef[];
  participants: ParticipantVista[];
  values: Values;
  continuacio: { properaRonda: number; value: Record<string, boolean> } | null;
}) {
  const scoreQ = questions.find((q) => q.key === 'score');
  const participantQuestions = questions.filter((q) => q.scope === 'participant' && q.id !== scoreQ?.id);
  const matchQuestions = questions.filter((q) => q.scope === 'match');

  return (
    <div className="space-y-3">
      {participants.map((participant) => {
        const scoreSlot = scoreQ ? values[slotKey(scoreQ.id, participant.entryId)] : undefined;
        return (
          <div key={participant.entryId} className="rounded-2xl border border-border p-3.5">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className="text-sm font-semibold text-ink truncate">{participant.displayName}</span>
              {scoreQ && (
                <span className="font-display font-bold text-xl tabular-nums text-ink flex-shrink-0">
                  {scoreSlot?.number || '—'}
                </span>
              )}
            </div>
            {continuacio && (
              <div className="mb-1">
                <ConfirmRow
                  label={`Ronda ${continuacio.properaRonda}`}
                  value={(continuacio.value[participant.entryId] ?? true) ? 'continua' : 'marxa'}
                />
              </div>
            )}
            {participantQuestions.length > 0 && (
              <div className="space-y-1">
                {participantQuestions.map((q) => (
                  <ConfirmRow
                    key={q.id}
                    label={q.label}
                    value={answerSummary(q, values[slotKey(q.id, participant.entryId)])}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {matchQuestions.length > 0 && (
        <div className="rounded-2xl border border-border p-3.5 space-y-1">
          {matchQuestions.map((q) => (
            <ConfirmRow key={q.id} label={q.label} value={answerSummary(q, values[slotKey(q.id, null)])} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Pas propi, com les preguntes del formulari: continueu a la ronda següent?
 * Sí per defecte, perquè és el cas habitual. Si algú marxa, dir-ho aquí
 * evita haver de refer els aparellaments quan ja estan fets.
 */
function ContinuacioStep({
  properaRonda,
  participants,
  value,
  onChange,
}: {
  properaRonda: number;
  participants: ParticipantVista[];
  value: Record<string, boolean>;
  onChange: (v: Record<string, boolean>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-center mb-1">
        <div className="font-display font-bold text-xl text-ink">Continueu a la ronda {properaRonda}?</div>
        <div className="text-sm text-ink-3 mt-0.5">Si algú marxa, no el posarem en cap taula</div>
      </div>
      {participants.map((p, i) => {
        const continua = value[p.entryId] ?? true;
        return (
          <ParticipantCard key={p.entryId} seat={i} name={p.displayName}>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...value, [p.entryId]: true })}
                className={`rounded-xl py-4 font-display font-bold text-xl transition-colors ${
                  continua ? 'bg-win text-surface' : 'bg-surface text-ink-3 border border-border'
                }`}
              >
                Sí
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...value, [p.entryId]: false })}
                className={`rounded-xl py-4 font-display font-bold text-xl transition-colors ${
                  !continua ? 'bg-loss text-surface' : 'bg-surface text-ink-3 border border-border'
                }`}
              >
                No
              </button>
            </div>
          </ParticipantCard>
        );
      })}
    </div>
  );
}
