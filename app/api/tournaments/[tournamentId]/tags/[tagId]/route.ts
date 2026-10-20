import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { tags } from '@/db/schema';
import { requireTournamentAccess } from '@/lib/authz';

type Params = { params: Promise<{ tournamentId: string; tagId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { tournamentId, tagId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const [tag] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.tournamentId, tournamentId)));
  if (!tag) return NextResponse.json({ error: 'Etiqueta no trobada' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: "Cal un nom per a l'etiqueta" }, { status: 400 });

  await db.update(tags).set({ name }).where(eq(tags.id, tagId));
  return NextResponse.json({ ...tag, name });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { tournamentId, tagId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const [tag] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.tournamentId, tournamentId)));
  if (!tag) return NextResponse.json({ error: 'Etiqueta no trobada' }, { status: 404 });

  // Les files d'entry_tags que l'usaven s'esborren en cascada (FK).
  await db.delete(tags).where(eq(tags.id, tagId));
  return new NextResponse(null, { status: 204 });
}
