import { NextResponse } from 'next/server';
import { db } from '@/db';
import { questionDefinitions, tournaments, type NewQuestionDefinition } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

type Params = { params: Promise<{ tournamentId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const all = await db
    .select()
    .from(questionDefinitions)
    .where(eq(questionDefinitions.tournamentId, tournamentId))
    .orderBy(asc(questionDefinitions.order));
  return NextResponse.json(all);
}

export async function POST(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const body = await req.json();
  const rawType = body.type;
  const rawScope = body.scope;
  const { label, label1, label2, answerType, showInRanking } = body;

  if (!['value', 'wordvalue', 'image'].includes(rawType)) {
    return NextResponse.json({ error: 'Tipus de pregunta no vàlid' }, { status: 400 });
  }
  if (!['match', 'player'].includes(rawScope)) {
    return NextResponse.json({ error: 'Àmbit de pregunta no vàlid' }, { status: 400 });
  }
  if (!label || typeof label !== 'string' || label.trim().length === 0) {
    return NextResponse.json({ error: 'Cal el text de la pregunta' }, { status: 400 });
  }
  const type = rawType as 'value' | 'wordvalue' | 'image';
  const scope = rawScope as 'match' | 'player';

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!tournament) return NextResponse.json({ error: 'Campionat no trobat' }, { status: 404 });

  const existing = await db.select().from(questionDefinitions).where(eq(questionDefinitions.tournamentId, tournamentId));
  const canRank = scope === 'player' && type !== 'image';

  const newQuestion: NewQuestionDefinition = {
    id: uuid(),
    tournamentId,
    key: uuid(),
    isBuiltin: false,
    type,
    scope,
    label: label.trim(),
    label1: type === 'wordvalue' ? (label1 ?? 'Paraula') : null,
    label2: type === 'wordvalue' ? (label2 ?? 'Punts') : null,
    answerType: type === 'value' ? (answerType === 'number' ? 'number' : 'text') : null,
    showInRanking: canRank && !!showInRanking,
    order: existing.length + 1,
  };

  await db.insert(questionDefinitions).values(newQuestion);
  return NextResponse.json(newQuestion, { status: 201 });
}
