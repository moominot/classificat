import { asc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/db';
import { matchAnswers, matches, phases, questionDefinitions, rounds, tournaments } from '@/db/schema';
import { DEFAULT_VISIBILITY } from '@/db/types';
import Badge from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { canManageTournament, canReportResult, getCurrentAccount, getViewer } from '@/lib/authz';
import { loadEntrants, loadRoundMatches } from '@/lib/db-helpers';
import { lastPlannedRound, loadPresence, roundIsPaired } from '@/lib/presence';
import FormulariResultatWizard from './FormulariResultatWizard';

export const dynamic = 'force-dynamic';

export default async function PartidaDetallPage({
  params,
}: {
  params: Promise<{ id: string; paid: string }>;
}) {
  const { id, paid } = await params;

  const [match] = await db.select().from(matches).where(eq(matches.id, paid));
  if (!match) notFound();

  const [round] = await db.select().from(rounds).where(eq(rounds.id, match.roundId));
  if (!round || round.tournamentId !== id) notFound();

  const account = await getCurrentAccount();
  const canManage = account ? await canManageTournament(account, id) : false;
  if (!canManage && round.status === 'draft') notFound();

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  const visibility = tournament?.visibility ?? DEFAULT_VISIBILITY;
  const pairingsVisible = round.pairingsVisible ?? visibility.pairingsVisible;
  if (!canManage && !pairingsVisible) notFound();
  const hideResults = !canManage && !(round.resultsVisible ?? visibility.resultsVisible);

  const [phase] = await db.select().from(phases).where(eq(phases.id, round.phaseId));

  const [questions, answers, partides, inscrits] = await Promise.all([
    db
      .select()
      .from(questionDefinitions)
      .where(eq(questionDefinitions.tournamentId, id))
      .orderBy(asc(questionDefinitions.order)),
    db.select().from(matchAnswers).where(eq(matchAnswers.matchId, paid)),
    loadRoundMatches(match.roundId),
    loadEntrants(id),
  ]);

  const partida = partides.find((p) => p.id === paid);
  if (!partida) notFound();

  const nomPerEntry = new Map(inscrits.map((e) => [e.id, e.displayName]));
  const esBye = partida.participants.length === 1;
  // El bye no amaga res; una taula de dos o més sí, mentre el director no
  // n'hagi fet públics els resultats (§8.3).
  const participants = partida.participants.map((participant) => ({
    ...participant,
    displayName: nomPerEntry.get(participant.entryId) ?? '?',
    score: hideResults && !esBye ? null : participant.score,
    rank: hideResults && !esBye ? null : participant.rank,
  }));
  const teResultat = !esBye && participants.every((p) => p.rank !== null);
  const empat = teResultat && participants.filter((p) => p.rank === 1).length > 1;

  // Les respostes es guarden per participació; aquí es tradueixen a
  // inscripcions per poder-les mostrar al costat de cada jugador.
  const entryPerParticipant = new Map(participants.map((p) => [p.id, p.entryId]));
  const respostes = answers.map((answer) => ({
    questionId: answer.questionId,
    entryId: answer.participantId ? entryPerParticipant.get(answer.participantId) ?? null : null,
    textValue: answer.textValue,
    numberValue: answer.numberValue,
    imageUrl: answer.imageUrl,
  }));

  const viewer = await getViewer(id);
  const potEditar = canReportResult(viewer, {
    participantEntryIds: participants.map((p) => p.entryId),
    roundIsOpen: round.status === 'open',
    managesTournament: canManage,
  });

  // «Continuen a la ronda següent?»: només si en queden de previstes i encara
  // no s'ha aparellat. El que ja s'ha dit s'hi precarrega; si no, sí.
  const properaRonda = round.number + 1;
  const preguntaContinuar =
    potEditar && !esBye && properaRonda <= (await lastPlannedRound(id)) && !(await roundIsPaired(id, properaRonda));
  const presenciaProxima = preguntaContinuar ? await loadPresence(id, properaRonda) : new Map();
  const continuaInicial = Object.fromEntries(
    participants.map((p) => [p.entryId, presenciaProxima.get(p.entryId)?.status !== 'absent'])
  );

  const answerFor = (questionId: string, entryId: string | null) =>
    respostes.find((r) => r.questionId === questionId && r.entryId === entryId);

  const answerText = (questionId: string, entryId: string | null, type: string) => {
    const answer = answerFor(questionId, entryId);
    if (!answer) return null;
    if (type === 'image') return answer.imageUrl;
    if (type === 'wordvalue') {
      return answer.textValue ? `${answer.textValue} (${answer.numberValue ?? 0})` : null;
    }
    return answer.textValue ?? answer.numberValue?.toString() ?? null;
  };

  const visibles = questions.filter((q) => q.key !== 'score');
  const teRespostes = !hideResults && visibles.some((q) =>
    (q.scope === 'participant' ? participants.map((p) => p.entryId) : [null]).some(
      (entryId) => answerText(q.id, entryId, q.type) !== null
    )
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-ink-3 flex-wrap">
        <Link href={`/campionat/${id}/rondes`} className="hover:text-accent-ink">
          Rondes
        </Link>
        <span>/</span>
        <Link href={`/campionat/${id}/rondes/${round.id}`} className="hover:text-accent-ink">
          Ronda {round.number}
        </Link>
      </div>

      <div className="text-center space-y-1">
        <p className="text-xs text-ink-3 uppercase tracking-wide font-semibold">
          {phase?.name} · Ronda {round.number}
          {partida.tableNumber > 0 && ` · Taula ${partida.tableNumber}`}
        </p>
        {esBye && <Badge color="gray">Bye</Badge>}
        {teResultat && !empat && <Badge color="green">Resultat registrat</Badge>}
        {empat && <Badge color="blue">Empat</Badge>}
      </div>

      {/* Marcador: una fila per participant, valgui per a dos o per a sis. */}
      <Card>
        <div className="divide-y divide-border">
          {participants.map((participant) => (
            <div key={participant.entryId} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex items-center gap-2">
                {teResultat && (
                  <span className="w-6 h-6 rounded-lg bg-surface-2 text-ink-2 flex items-center justify-center text-xs font-display font-bold flex-shrink-0 tabular-nums">
                    {participant.rank}
                  </span>
                )}
                <Link
                  href={`/campionat/${id}/jugadors/${participant.entryId}`}
                  className={`truncate hover:text-accent-ink transition-colors ${
                    participant.rank === 1 ? 'font-semibold text-ink' : 'text-ink-2'
                  }`}
                >
                  {participant.displayName}
                </Link>
              </div>
              {teResultat && (
                <span
                  className={`text-3xl font-black tabular-nums flex-shrink-0 ${
                    participant.rank === 1 ? 'text-accent-ink' : 'text-ink-3'
                  }`}
                >
                  {participant.score}
                </span>
              )}
            </div>
          ))}
        </div>
        {teResultat && (
          <p className="text-center text-xs text-ink-3 mt-2 pt-2 border-t border-border">
            Suma total: {participants.reduce((sum, p) => sum + (p.score ?? 0), 0)} punts
          </p>
        )}
      </Card>

      {/* Respostes de les preguntes, siguin del perfil de joc o afegides */}
      {teRespostes && (
        <Card>
          <div className="space-y-3 text-sm">
            {visibles.map((question) => {
              const targets = question.scope === 'participant' ? participants : [null];
              const files = targets
                .map((target) => {
                  const entryId = target ? target.entryId : null;
                  const value = answerText(question.id, entryId, question.type);
                  if (!value) return null;
                  return { label: target?.displayName, value };
                })
                .filter((x): x is { label: string | undefined; value: string } => x !== null);

              if (files.length === 0) return null;

              return (
                <div key={question.id} className="border-b border-border pb-2.5 last:border-b-0 last:pb-0">
                  <p className="text-ink-3 text-xs mb-1">{question.label}</p>
                  <div className="space-y-0.5">
                    {files.map((fila, i) => (
                      <div key={i} className="flex items-center justify-between gap-3">
                        {fila.label && <span className="text-ink-2 truncate">{fila.label}</span>}
                        {question.type === 'image' ? (
                          <a
                            href={fila.value}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-accent-ink hover:underline flex-shrink-0"
                          >
                            Veure la foto
                          </a>
                        ) : (
                          <span className="text-ink font-medium text-right">{fila.value}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {(partida.tableNumber > 0 || match.location || match.comments) && (match.location || match.comments) && (
        <Card>
          {match.location && (
            <div className="flex items-center gap-2 text-sm text-ink-2">
              <svg className="w-4 h-4 text-ink-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{match.location}</span>
            </div>
          )}
          {match.comments && (
            <blockquote className="mt-2 pl-3 border-l-2 border-border text-sm text-ink-2 italic">
              {match.comments}
            </blockquote>
          )}
        </Card>
      )}

      {!esBye && (
        <FormulariResultatWizard
          partida={{
            id: partida.id,
            teResultat,
            participants: participants.map((p) => ({
              entryId: p.entryId,
              displayName: p.displayName,
              score: p.score,
            })),
          }}
          tournamentId={id}
          roundId={round.id}
          potEditar={potEditar}
          questions={questions}
          existingAnswers={respostes}
          properaRonda={preguntaContinuar ? properaRonda : null}
          continuaInicial={continuaInicial}
        />
      )}
    </div>
  );
}
