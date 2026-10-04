import { and, eq, inArray, isNull } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { matchAnswers, questionDefinitions } from '@/db/schema';

export interface AnswerInput {
  questionId: string;
  /** null quan la pregunta és d'àmbit `match`. */
  entryId?: string | null;
  textValue?: string | null;
  numberValue?: number | null;
  imageUrl?: string | null;
}

/**
 * Desa les respostes de les preguntes (puntuació exclosa: viu a la
 * participació, no aquí — docs/pla-rols.md §12.10).
 *
 * Compartit entre el formulari normal i la importació CSV de resultats,
 * perquè totes dues vies escriguin respostes exactament igual.
 */
export async function saveAnswers(
  tournamentId: string,
  matchId: string,
  participants: Array<{ id: string; entryId: string }>,
  answers: AnswerInput[]
) {
  if (answers.length === 0) return;

  const questionIds = [...new Set(answers.map((a) => a.questionId))];
  const questions = await db
    .select()
    .from(questionDefinitions)
    .where(
      and(
        eq(questionDefinitions.tournamentId, tournamentId),
        inArray(questionDefinitions.id, questionIds)
      )
    );
  const known = new Set(questions.map((q) => q.id));
  const participantIdByEntry = new Map(participants.map((p) => [p.entryId, p.id]));

  for (const answer of answers) {
    if (!known.has(answer.questionId)) continue;

    const participantId = answer.entryId ? participantIdByEntry.get(answer.entryId) ?? null : null;
    if (answer.entryId && !participantId) continue;

    await db
      .delete(matchAnswers)
      .where(
        and(
          eq(matchAnswers.matchId, matchId),
          eq(matchAnswers.questionId, answer.questionId),
          participantId === null
            ? isNull(matchAnswers.participantId)
            : eq(matchAnswers.participantId, participantId)
        )
      );

    const hasValue =
      answer.textValue != null || answer.numberValue != null || answer.imageUrl != null;
    if (!hasValue) continue;

    await db.insert(matchAnswers).values({
      id: uuid(),
      matchId,
      participantId,
      questionId: answer.questionId,
      textValue: answer.textValue ?? null,
      numberValue: answer.numberValue ?? null,
      imageUrl: answer.imageUrl ?? null,
    });
  }
}
