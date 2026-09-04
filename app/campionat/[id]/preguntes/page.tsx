import { db } from '@/db';
import { questionDefinitions } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import PreguntesClient from '@/components/forms/PreguntesClient';

export const dynamic = 'force-dynamic';

export default async function PreguntesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const questions = await db
    .select()
    .from(questionDefinitions)
    .where(eq(questionDefinitions.tournamentId, id))
    .orderBy(asc(questionDefinitions.order));

  return (
    <PreguntesClient
      tournamentId={id}
      initialQuestions={questions.map(q => ({
        id: q.id,
        key: q.key,
        isBuiltin: q.isBuiltin,
        type: q.type,
        scope: q.scope,
        label: q.label,
        label1: q.label1,
        label2: q.label2,
        answerType: q.answerType,
        showInRanking: q.showInRanking,
        order: q.order,
      }))}
    />
  );
}
