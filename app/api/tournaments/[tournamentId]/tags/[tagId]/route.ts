import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { tags } from '@/db/schema';
import type { TagKind } from '@/db/types';
import { requireTournamentAccess } from '@/lib/authz';
import { nextGroupOrder } from '@/lib/tag-groups';

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
  const changes: Partial<Pick<typeof tag, 'name' | 'kind' | 'order'>> = {};

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return NextResponse.json({ error: "Cal un nom per a l'etiqueta" }, { status: 400 });
    changes.name = name;
  }

  // Convertir-la en grup la posa al final de la classificació apilada.
  if ((body.kind === 'group' || body.kind === 'label') && body.kind !== tag.kind) {
    changes.kind = body.kind as TagKind;
    changes.order =
      body.kind === 'group'
        ? nextGroupOrder(await db.select().from(tags).where(eq(tags.tournamentId, tournamentId)))
        : 0;
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: 'No hi ha res per canviar' }, { status: 400 });
  }

  await db.update(tags).set(changes).where(eq(tags.id, tagId));
  return NextResponse.json({ ...tag, ...changes });
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
