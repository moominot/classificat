import { NextResponse } from 'next/server';
import { db } from '@/db';
import { pairings, rounds, questionDefinitions, pairingAnswers } from '@/db/schema';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import type { GameOutcome } from '@/lib/pairing/types';

type Params = { params: Promise<{ tournamentId: string; roundId: string }> };

interface AnswerInput {
  questionId: string;
  player: 1 | 2 | null;
  textValue?: string | null;
  numberValue?: number | null;
  imageUrl?: string | null;
}

/**
 * PUT /api/tournaments/:tid/rounds/:rid/result
 * Body: { pairingId, answers: AnswerInput[], location?, comments? }
 *
 * `answers` cobreix TANT les 5 preguntes bàsiques (identificades pel seu
 * `key` a question_definitions: score/bingos/best_word/sheet_image/
 * board_image, que es desen a les columnes fixes de `pairings` d'on beu el
 * motor d'aparellaments) COM les preguntes personalitzades del director
 * (es desen a `pairing_answers`).
 */
export async function PUT(req: Request, { params }: Params) {
  const { tournamentId, roundId } = await params;
  const body = await req.json();
  const { pairingId, answers, location, comments } = body as {
    pairingId?: string; answers?: AnswerInput[]; location?: string; comments?: string;
  };

  if (!pairingId) return NextResponse.json({ error: 'Cal pairingId' }, { status: 400 });

  const [pairing] = await db.select().from(pairings).where(eq(pairings.id, pairingId));
  if (!pairing) return NextResponse.json({ error: 'Aparellament no trobat' }, { status: 404 });
  if (pairing.roundId !== roundId) return NextResponse.json({ error: 'L\'aparellament no pertany a aquesta ronda' }, { status: 400 });

  const [round] = await db.select().from(rounds).where(eq(rounds.id, roundId));
  if (round?.isComplete) {
    return NextResponse.json({ error: 'La ronda ja està tancada' }, { status: 409 });
  }

  // Si és un bye, el resultat és automàtic
  if (pairing.player2Id === null) {
    await db.update(pairings)
      .set({ outcome1: 'bye', p1Score: null, p2Score: null, reportedAt: new Date() })
      .where(eq(pairings.id, pairingId));
    return NextResponse.json({ ok: true });
  }

  const allAnswers = Array.isArray(answers) ? answers : [];
  const questionIds = [...new Set(allAnswers.map(a => a.questionId))];
  const questions = questionIds.length > 0
    ? await db.select().from(questionDefinitions).where(
        and(eq(questionDefinitions.tournamentId, tournamentId), inArray(questionDefinitions.id, questionIds))
      )
    : [];
  const questionMap = new Map(questions.map(q => [q.id, q]));

  const byKey = (key: string, player: 1 | 2 | null) =>
    allAnswers.find(a => questionMap.get(a.questionId)?.key === key && a.player === player);

  const scoreP1 = byKey('score', 1)?.numberValue;
  const scoreP2 = byKey('score', 2)?.numberValue;
  if (scoreP1 == null || scoreP2 == null) {
    return NextResponse.json({ error: 'Cal el resultat dels dos jugadors' }, { status: 400 });
  }

  let outcome1: GameOutcome;
  let outcome2: GameOutcome;
  if (scoreP1 > scoreP2) { outcome1 = 'win'; outcome2 = 'loss'; }
  else if (scoreP2 > scoreP1) { outcome1 = 'loss'; outcome2 = 'win'; }
  else { outcome1 = 'draw'; outcome2 = 'draw'; }

  const bingosP1 = byKey('bingos', 1)?.numberValue;
  const bingosP2 = byKey('bingos', 2)?.numberValue;
  const bestWordP1 = byKey('best_word', 1);
  const bestWordP2 = byKey('best_word', 2);
  const sheetImage = byKey('sheet_image', null);
  const boardImage = byKey('board_image', null);

  await db.update(pairings).set({
    p1Score: scoreP1,
    p2Score: scoreP2,
    outcome1,
    outcome2,
    p1Scrabbles: bingosP1 ?? null,
    p2Scrabbles: bingosP2 ?? null,
    p1BestWord: bestWordP1?.textValue ?? null,
    p2BestWord: bestWordP2?.textValue ?? null,
    p1BestWordScore: bestWordP1?.numberValue ?? null,
    p2BestWordScore: bestWordP2?.numberValue ?? null,
    location: location ?? null,
    comments: comments ?? null,
    sheetImageUrl: sheetImage?.imageUrl ?? null,
    boardImageUrl: boardImage?.imageUrl ?? null,
    reportedAt: new Date(),
  }).where(eq(pairings.id, pairingId));

  // Respostes de preguntes personalitzades (no bàsiques) -> taula genèrica
  const customAnswers = allAnswers.filter(a => !questionMap.get(a.questionId)?.isBuiltin);
  for (const a of customAnswers) {
    const playerFilter = a.player === null ? isNull(pairingAnswers.player) : eq(pairingAnswers.player, a.player);
    await db.delete(pairingAnswers).where(
      and(eq(pairingAnswers.pairingId, pairingId), eq(pairingAnswers.questionId, a.questionId), playerFilter)
    );
    const hasValue = a.textValue != null || a.numberValue != null || a.imageUrl != null;
    if (hasValue) {
      await db.insert(pairingAnswers).values({
        id: uuid(),
        pairingId,
        questionId: a.questionId,
        player: a.player,
        textValue: a.textValue ?? null,
        numberValue: a.numberValue ?? null,
        imageUrl: a.imageUrl ?? null,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
