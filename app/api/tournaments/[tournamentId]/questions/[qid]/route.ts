import { NextResponse } from 'next/server';
import { db } from '@/db';
import { questionDefinitions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

type Params = { params: Promise<{ tournamentId: string; qid: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { tournamentId, qid } = await params;
  const body = await req.json();

  const [question] = await db
    .select()
    .from(questionDefinitions)
    .where(and(eq(questionDefinitions.id, qid), eq(questionDefinitions.tournamentId, tournamentId)));
  if (!question) return NextResponse.json({ error: 'Pregunta no trobada' }, { status: 404 });

  if (question.isBuiltin) {
    const { type, scope } = body;
    if ((type !== undefined && type !== question.type) || (scope !== undefined && scope !== question.scope)) {
      return NextResponse.json(
        { error: 'Aquesta pregunta és bàsica del sistema: no se\'n pot canviar el tipus ni l\'àmbit' },
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
  if (body.showInRanking !== undefined) {
    const scope = updates.scope ?? question.scope;
    const type = updates.type ?? question.type;
    const canRank = scope === 'player' && type !== 'image';
    updates.showInRanking = canRank && !!body.showInRanking;
  }
  if (!question.isBuiltin) {
    if (body.type !== undefined) updates.type = body.type;
    if (body.scope !== undefined) updates.scope = body.scope;
    if (body.answerType !== undefined) updates.answerType = body.answerType;
  }

  await db.update(questionDefinitions).set(updates).where(eq(questionDefinitions.id, qid));
  return NextResponse.json({ ...question, ...updates });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { tournamentId, qid } = await params;

  const [question] = await db
    .select()
    .from(questionDefinitions)
    .where(and(eq(questionDefinitions.id, qid), eq(questionDefinitions.tournamentId, tournamentId)));
  if (!question) return NextResponse.json({ error: 'Pregunta no trobada' }, { status: 404 });

  if (question.isBuiltin) {
    return NextResponse.json({ error: 'Aquesta pregunta és bàsica del sistema i no es pot esborrar' }, { status: 409 });
  }

  await db.delete(questionDefinitions).where(eq(questionDefinitions.id, qid));
  return new NextResponse(null, { status: 204 });
}
