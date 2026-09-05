'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIsDirector } from '@/components/DirectorContext';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import { readError } from '@/lib/http';

type QType = 'value' | 'wordvalue' | 'image';
type QScope = 'match' | 'player';
type AnswerType = 'text' | 'number';

interface Question {
  id: string;
  key: string;
  isBuiltin: boolean;
  type: QType;
  scope: QScope;
  label: string;
  label1: string | null;
  label2: string | null;
  answerType: AnswerType | null;
  showInRanking: boolean;
  order: number;
}

const TYPE_BADGE: Record<QType, { label: string; className: string }> = {
  value:     { label: 'Valor',           className: 'bg-surface-2 text-ink-2' },
  wordvalue: { label: 'Paraula + valor',  className: 'bg-accent-tint text-accent-ink' },
  image:     { label: 'Imatge',           className: 'bg-win-tint text-win' },
};

function subLabel(q: Question) {
  if (q.type === 'wordvalue') return `${q.label1 ?? 'Paraula'} + ${q.label2 ?? 'Punts'}`;
  if (q.type === 'image') return 'Resposta: fotografia';
  return `Resposta: ${q.answerType === 'number' ? 'número' : 'text'}`;
}

function canRank(scope: QScope, type: QType) {
  return scope === 'player' && type !== 'image';
}

function tabClass(active: boolean) {
  return active
    ? 'bg-accent-tint border-accent text-accent-ink'
    : 'bg-surface border-border text-ink-3 hover:border-ink-3';
}

export default function PreguntesClient({
  tournamentId,
  initialQuestions,
}: {
  tournamentId: string;
  initialQuestions: Question[];
}) {
  const router = useRouter();
  const isDirector = useIsDirector();
  const [questions, setQuestions] = useState(initialQuestions);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [label1, setLabel1] = useState('Paraula');
  const [label2, setLabel2] = useState('Punts');
  const [type, setType] = useState<QType>('value');
  const [scope, setScope] = useState<QScope>('player');
  const [answerType, setAnswerType] = useState<AnswerType>('text');
  const [showInRanking, setShowInRanking] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const editingQuestion = editingId ? questions.find(q => q.id === editingId) ?? null : null;
  const isBuiltinEditing = !!editingQuestion?.isBuiltin;

  useEffect(() => {
    if (panelOpen) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [panelOpen, editingId]);

  function openAdd() {
    setEditingId(null);
    setLabel('');
    setLabel1('Paraula');
    setLabel2('Punts');
    setType('value');
    setScope('player');
    setAnswerType('text');
    setShowInRanking(false);
    setError('');
    setPanelOpen(true);
  }

  function openEdit(q: Question) {
    setEditingId(q.id);
    setLabel(q.label);
    setLabel1(q.label1 ?? 'Paraula');
    setLabel2(q.label2 ?? 'Punts');
    setType(q.type);
    setScope(q.scope);
    setAnswerType(q.answerType ?? 'text');
    setShowInRanking(q.showInRanking);
    setError('');
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
    setEditingId(null);
  }

  async function handleSave() {
    if (!label.trim()) {
      setError('Cal el text de la pregunta');
      return;
    }
    setLoading(true);
    setError('');

    const body = isBuiltinEditing
      ? {
          label: label.trim(),
          label1: type === 'wordvalue' ? label1 : null,
          label2: type === 'wordvalue' ? label2 : null,
          showInRanking: canRank(scope, type) && showInRanking,
        }
      : {
          type,
          scope,
          label: label.trim(),
          label1: type === 'wordvalue' ? label1 : null,
          label2: type === 'wordvalue' ? label2 : null,
          answerType: type === 'value' ? answerType : null,
          showInRanking: canRank(scope, type) && showInRanking,
        };

    const res = await fetch(
      editingId
        ? `/api/tournaments/${tournamentId}/questions/${editingId}`
        : `/api/tournaments/${tournamentId}/questions`,
      {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (res.ok) {
      const saved = await res.json();
      setQuestions(prev =>
        editingId ? prev.map(q => (q.id === editingId ? saved : q)) : [...prev, saved]
      );
      closePanel();
      router.refresh();
    } else {
      setError(await readError(res, 'Error en desar la pregunta'));
    }
    setLoading(false);
  }

  async function handleDelete(q: Question) {
    if (q.isBuiltin) return;
    if (!confirm(`Esborrar la pregunta "${q.label}"?`)) return;
    setDeletingId(q.id);
    const res = await fetch(`/api/tournaments/${tournamentId}/questions/${q.id}`, { method: 'DELETE' });
    if (res.ok) {
      setQuestions(prev => prev.filter(x => x.id !== q.id));
      router.refresh();
    } else {
      alert(await readError(res, 'Error en esborrar la pregunta'));
    }
    setDeletingId(null);
  }

  if (!isDirector) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Formulari de resultats</h1>
          <p className="text-sm text-ink-3 mt-1">Preguntes que es demanen en registrar el resultat d&apos;una partida.</p>
        </div>
        <div className="space-y-2">
          {questions.map(q => (
            <div key={q.id} className="bg-surface border border-border rounded-xl p-3.5">
              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                <span className={`text-[10.5px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${TYPE_BADGE[q.type].className}`}>
                  {TYPE_BADGE[q.type].label}
                </span>
                <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full bg-surface-2 text-ink-3 whitespace-nowrap">
                  {q.scope === 'match' ? 'Per partida' : 'Per jugador (×2)'}
                </span>
              </div>
              <div className="text-sm font-medium text-ink">{q.label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Formulari de resultats</h1>
        <p className="text-sm text-ink-3 mt-1 max-w-2xl">
          Tot el que es demana en registrar un resultat és una pregunta editable — incloses les predefinides.
          Cada pregunta és <strong className="text-ink-2">d&apos;una resposta per partida</strong> o{' '}
          <strong className="text-ink-2">d&apos;una resposta per jugador</strong> (es demana dues vegades).
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <div className="flex-1 min-w-0 w-full space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-3 uppercase tracking-wide">
              Preguntes del formulari ({questions.length})
            </span>
            <Button size="sm" onClick={openAdd}>+ Afegeix pregunta</Button>
          </div>

          {questions.length === 0 ? (
            <EmptyState title="Encara no hi ha preguntes" description="Afegeix la primera pregunta del formulari." />
          ) : (
            <div className="space-y-2">
              {questions.map(q => (
                <div key={q.id} className="bg-surface border border-border rounded-xl overflow-hidden">
                  <div className="p-3.5">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                      <span className={`text-[10.5px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${TYPE_BADGE[q.type].className}`}>
                        {TYPE_BADGE[q.type].label}
                      </span>
                      <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full bg-surface-2 text-ink-3 whitespace-nowrap">
                        {q.scope === 'match' ? 'Per partida' : 'Per jugador (×2)'}
                      </span>
                      {q.showInRanking && (
                        <span title="Té pestanya de rànquing a Classificació" className="text-[10.5px] font-semibold text-accent-ink whitespace-nowrap">
                          ↑ Rànquing
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-ink">{q.label}</div>
                    <div className="text-xs text-ink-3 mt-0.5">{subLabel(q)}</div>
                  </div>
                  <div className="border-t border-border px-2 py-1.5 flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(q)}>Edita</Button>
                    {q.isBuiltin ? (
                      <span title="Pregunta bàsica: no es pot esborrar" className="inline-flex items-center gap-1.5 text-xs text-ink-3 px-3 py-1.5">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 118 0v4" />
                        </svg>
                        Bàsica
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-loss hover:bg-loss-tint"
                        disabled={deletingId === q.id}
                        onClick={() => handleDelete(q)}
                      >
                        Esborra
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {panelOpen && (
          <div ref={panelRef} className="w-full lg:w-[360px] flex-shrink-0 scroll-mt-4">
          <Card className="space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="font-display font-bold text-sm">
                {editingId ? 'Edita la pregunta' : 'Nova pregunta'}
              </span>
              <button onClick={closePanel} className="text-ink-3 hover:text-ink text-lg leading-none cursor-pointer">×</button>
            </div>

            {isBuiltinEditing && (
              <p className="text-xs text-ink-3 bg-surface-2 rounded-lg px-3 py-2">
                Pregunta bàsica del sistema: el tipus i l&apos;àmbit no es poden canviar.
              </p>
            )}

            <div>
              <span className="text-xs font-medium text-ink-2 block mb-1">Àmbit de la resposta</span>
              <div className="flex gap-1.5">
                <button
                  disabled={isBuiltinEditing}
                  onClick={() => { setScope('match'); setShowInRanking(false); }}
                  className={`flex-1 text-center px-2 py-2 rounded-xl border text-xs font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${tabClass(scope === 'match')}`}
                >
                  Per partida<br /><span className="font-normal text-[10.5px]">1 resposta</span>
                </button>
                <button
                  disabled={isBuiltinEditing}
                  onClick={() => setScope('player')}
                  className={`flex-1 text-center px-2 py-2 rounded-xl border text-xs font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${tabClass(scope === 'player')}`}
                >
                  Per jugador<br /><span className="font-normal text-[10.5px]">2 respostes</span>
                </button>
              </div>
            </div>

            <div>
              <span className="text-xs font-medium text-ink-2 block mb-1">Tipus de pregunta</span>
              <div className="flex gap-1.5">
                <button
                  disabled={isBuiltinEditing}
                  onClick={() => setType('value')}
                  className={`flex-1 px-2 py-2 rounded-xl border text-xs font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${tabClass(type === 'value')}`}
                >
                  Valor
                </button>
                <button
                  disabled={isBuiltinEditing}
                  onClick={() => setType('wordvalue')}
                  className={`flex-1 px-2 py-2 rounded-xl border text-xs font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${tabClass(type === 'wordvalue')}`}
                >
                  Paraula + valor
                </button>
                <button
                  disabled={isBuiltinEditing}
                  onClick={() => { setType('image'); setShowInRanking(false); }}
                  className={`flex-1 px-2 py-2 rounded-xl border text-xs font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${tabClass(type === 'image')}`}
                >
                  Imatge
                </button>
              </div>
            </div>

            <Input
              label="Pregunta"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={type === 'wordvalue' ? 'p.ex. Paraula amb comodí' : type === 'image' ? 'p.ex. Foto del rack final' : "p.ex. Nombre d'impugnacions"}
            />

            {type === 'value' && (
              <div>
                <span className="text-xs font-medium text-ink-2 block mb-1">Tipus de resposta</span>
                <div className="flex gap-1.5">
                  <button
                    disabled={isBuiltinEditing}
                    onClick={() => setAnswerType('text')}
                    className={`flex-1 px-2 py-2 rounded-xl border text-xs font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${tabClass(answerType === 'text')}`}
                  >
                    Text
                  </button>
                  <button
                    disabled={isBuiltinEditing}
                    onClick={() => setAnswerType('number')}
                    className={`flex-1 px-2 py-2 rounded-xl border text-xs font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${tabClass(answerType === 'number')}`}
                  >
                    Número
                  </button>
                </div>
              </div>
            )}

            {type === 'wordvalue' && (
              <div className="grid grid-cols-2 gap-2.5">
                <Input label="Etiqueta 1" value={label1} onChange={e => setLabel1(e.target.value)} />
                <Input label="Etiqueta 2" value={label2} onChange={e => setLabel2(e.target.value)} />
              </div>
            )}

            {type === 'image' && (
              <p className="text-xs text-ink-3 bg-surface-2 rounded-lg px-3 py-2">
                Es mostrarà un botó de &quot;Fes o puja una foto&quot; en aquest pas del formulari.
              </p>
            )}

            {canRank(scope, type) && (
              <label className="flex items-start gap-2.5 bg-surface-2 rounded-xl px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInRanking}
                  onChange={e => setShowInRanking(e.target.checked)}
                  className="mt-0.5 accent-accent"
                />
                <span>
                  <span className="block text-xs font-semibold text-ink">Mostra rànquing a Classificació</span>
                  <span className="block text-xs text-ink-3 mt-0.5">Afegeix una pestanya que ordena els jugadors per aquesta resposta.</span>
                </span>
              </label>
            )}

            {error && <p className="text-xs text-loss">{error}</p>}

            <Button className="w-full" onClick={handleSave} loading={loading}>
              {editingId ? 'Desa els canvis' : 'Afegeix la pregunta'}
            </Button>
          </Card>
          </div>
        )}
      </div>
    </div>
  );
}
