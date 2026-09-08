import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { questionDefinitions, tournaments, type NewQuestionDefinition } from '@/db/schema';
import type { QuestionAggregate, QuestionScope, QuestionType } from '@/db/types';
import { requireTournamentAccess } from '@/lib/authz';

type Params = { params: Promise<{ tournamentId: string }> };

const TYPES: QuestionType[] = ['value', 'wordvalue', 'image'];
const SCOPES: QuestionScope[] = ['match', 'participant'];
const AGGREGATES: QuestionAggregate[] = ['sum', 'avg', 'max', 'count', 'none'];

export async function GET(_req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const all = await db
    .select()
    .from(questionDefinitions)
    .where(eq(questionDefinitions.tournamentId, tournamentId))
    .orderBy(asc(questionDefinitions.order));
  return NextResponse.json(all);
}

/**
 * POST — Afegeix una pregunta al formulari de resultat.
 *
 * `aggregate` és el que la converteix en **mètrica de classificació**: una
 * pregunta amb `sum` o `max` pot sortir com a columna del rànquing i com a
 * desempat, sense tocar codi (docs/pla-rols.md §12.1).
 */
export async function POST(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const { label, label1, label2, answerType, showInRanking, aggregate } = body;

  if (!TYPES.includes(body.type)) {
    return NextResponse.json({ error: 'Tipus de pregunta no vàlid' }, { status: 400 });
  }
  if (!SCOPES.includes(body.scope)) {
    return NextResponse.json({ error: 'Àmbit de pregunta no vàlid' }, { status: 400 });
  }
  if (!label || typeof label !== 'string' || label.trim().length === 0) {
    return NextResponse.json({ error: 'Cal el text de la pregunta' }, { status: 400 });
  }
  if (aggregate !== undefined && !AGGREGATES.includes(aggregate)) {
    return NextResponse.json({ error: "Tipus d'agregació no vàlid" }, { status: 400 });
  }

  const type = body.type as QuestionType;
  const scope = body.scope as QuestionScope;

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!tournament) return NextResponse.json({ error: 'Competició no trobada' }, { status: 404 });

  const existing = await db
    .select()
    .from(questionDefinitions)
    .where(eq(questionDefinitions.tournamentId, tournamentId));

  // Només una dada numèrica per participant pot alimentar el rànquing: una
  // foto o una resposta d'àmbit de partida no es poden agregar per jugador.
  const canAggregate = scope === 'participant' && type !== 'image';
  const finalAggregate: QuestionAggregate = canAggregate ? (aggregate ?? 'none') : 'none';

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
    aggregate: finalAggregate,
    usableAsTiebreaker: finalAggregate !== 'none',
    showInRanking: canAggregate && !!showInRanking,
    order: existing.length + 1,
  };

  await db.insert(questionDefinitions).values(newQuestion);
  return NextResponse.json(newQuestion, { status: 201 });
}
