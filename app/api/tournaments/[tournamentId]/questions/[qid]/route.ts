import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { questionDefinitions } from '@/db/schema';
import type { QuestionAggregate } from '@/db/types';
import { requireTournamentAccess } from '@/lib/authz';

type Params = { params: Promise<{ tournamentId: string; qid: string }> };

const AGGREGATES: QuestionAggregate[] = ['sum', 'avg', 'max', 'count', 'none'];

export async function PATCH(req: Request, { params }: Params) {
  const { tournamentId, qid } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const [question] = await db
    .select()
    .from(questionDefinitions)
    .where(and(eq(questionDefinitions.id, qid), eq(questionDefinitions.tournamentId, tournamentId)));
  if (!question) return NextResponse.json({ error: 'Pregunta no trobada' }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  // Les preguntes que venen del perfil de joc es poden reetiquetar i reordenar,
  // però no canviar de tipus ni d'àmbit: el formulari de resultat i les
  // mètriques hi compten.
  if (question.isBuiltin) {
    const changesShape =
      (body.type !== undefined && body.type !== question.type) ||
      (body.scope !== undefined && body.scope !== question.scope);
    if (changesShape) {
      return NextResponse.json(
        { error: "Aquesta pregunta és del perfil de joc: no se'n pot canviar el tipus ni l'àmbit" },
        { status: 400 }
      );
    }
  }

  const updates: Partial<typeof question> = {};

  if (body.label !== undefined) {
    if (typeof body.label !== 'string' || body.label.trim().length === 0) {
      return NextResponse.json({ error: 'Cal el text de la pregunta' }, { status: 400 });
    }
    updates.label = body.label.trim();
  }
  if (body.label1 !== undefined) updates.label1 = body.label1;
  if (body.label2 !== undefined) updates.label2 = body.label2;
  if (body.order !== undefined) updates.order = body.order;

  if (!question.isBuiltin) {
    if (body.type !== undefined) updates.type = body.type;
    if (body.scope !== undefined) updates.scope = body.scope;
    if (body.answerType !== undefined) updates.answerType = body.answerType;
  }

  const scope = updates.scope ?? question.scope;
  const type = updates.type ?? question.type;
  const canAggregate = scope === 'participant' && type !== 'image';

  if (body.aggregate !== undefined) {
    if (!AGGREGATES.includes(body.aggregate)) {
      return NextResponse.json({ error: "Tipus d'agregació no vàlid" }, { status: 400 });
    }
    updates.aggregate = canAggregate ? body.aggregate : 'none';
    updates.usableAsTiebreaker = updates.aggregate !== 'none';
  }
  if (body.showInRanking !== undefined) {
    updates.showInRanking = canAggregate && !!body.showInRanking;
  }

  await db.update(questionDefinitions).set(updates).where(eq(questionDefinitions.id, qid));
  return NextResponse.json({ ...question, ...updates });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { tournamentId, qid } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const [question] = await db
    .select()
    .from(questionDefinitions)
    .where(and(eq(questionDefinitions.id, qid), eq(questionDefinitions.tournamentId, tournamentId)));
  if (!question) return NextResponse.json({ error: 'Pregunta no trobada' }, { status: 404 });

  if (question.isBuiltin) {
    return NextResponse.json(
      { error: 'Aquesta pregunta ve del perfil de joc i no es pot esborrar' },
      { status: 409 }
    );
  }

  await db.delete(questionDefinitions).where(eq(questionDefinitions.id, qid));
  return new NextResponse(null, { status: 204 });
}
