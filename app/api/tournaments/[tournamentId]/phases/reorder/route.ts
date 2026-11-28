import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { phases } from '@/db/schema';
import { requireTournamentAccess } from '@/lib/authz';

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * POST — Reordena les fases. Rep `{ order: [phaseId, ...] }` amb totes les
 * fases de la competició en el nou ordre. L'ordre decideix quina fase mana
 * els desempats de la classificació general i quina és l'anterior/següent
 * en una eliminatòria per posicions.
 */
export async function POST(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const ids: unknown = body.order;
  if (!Array.isArray(ids) || ids.some((i) => typeof i !== 'string')) {
    return NextResponse.json({ error: 'Cal order: llista d\'ids de fase' }, { status: 400 });
  }

  const existents = await db.select({ id: phases.id }).from(phases).where(eq(phases.tournamentId, tournamentId));
  const idsExistents = new Set(existents.map((p) => p.id));
  if (ids.length !== idsExistents.size || new Set(ids).size !== ids.length || !ids.every((i) => idsExistents.has(i))) {
    return NextResponse.json({ error: 'La llista ha de contenir exactament totes les fases' }, { status: 400 });
  }

  // L'índex únic (competició, ordre) xoca si es renumera una fila a la vegada:
  // primer es passen a valors negatius lliures i després als definitius.
  db.transaction((tx) => {
    (ids as string[]).forEach((id, i) => {
      tx.update(phases).set({ order: -(i + 1) }).where(eq(phases.id, id)).run();
    });
    (ids as string[]).forEach((id, i) => {
      tx.update(phases).set({ order: i + 1 }).where(eq(phases.id, id)).run();
    });
  });

  return NextResponse.json({ ok: true });
}
