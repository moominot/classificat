import { NextResponse } from 'next/server';
import { and, asc, eq, like } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { tags } from '@/db/schema';
import type { TagKind } from '@/db/types';
import { requireTournamentAccess } from '@/lib/authz';
import { nextGroupOrder } from '@/lib/tag-groups';

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * GET — llistat (o cerca amb `q`, per l'autocompletar del TagInput).
 * Públic, com els grups que substitueix: calen per poder filtrar la
 * classificació sense gestionar-la (docs/pla-rols.md §8.3).
 */
export async function GET(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const q = new URL(req.url).searchParams.get('q')?.trim();

  const all = await db
    .select()
    .from(tags)
    .where(
      q
        ? and(eq(tags.tournamentId, tournamentId), like(tags.name, `%${q}%`))
        : eq(tags.tournamentId, tournamentId)
    )
    .orderBy(asc(tags.order), asc(tags.name));
  return NextResponse.json(all);
}

export async function POST(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: "Cal un nom per a l'etiqueta" }, { status: 400 });

  // Sense duplicats (sense distingir majúscules/minúscules), igual que ja
  // es feia amb els noms de grup a la importació de CSV.
  const existing = await db.select().from(tags).where(eq(tags.tournamentId, tournamentId));
  const trobada = existing.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (trobada) return NextResponse.json(trobada, { status: 200 });

  const kind: TagKind = body.kind === 'group' ? 'group' : 'label';
  const newTag = {
    id: uuid(),
    tournamentId,
    name,
    kind,
    order: kind === 'group' ? nextGroupOrder(existing) : 0,
    createdAt: new Date(),
  };
  await db.insert(tags).values(newTag);
  return NextResponse.json(newTag, { status: 201 });
}

/**
 * PUT — Reordena els grups de classificació: `{ tagIds }` en l'ordre nou.
 * Cal enviar-los tots, perquè l'ordre és el de la classificació apilada.
 */
export async function PUT(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const tagIds: string[] = Array.isArray(body.tagIds)
    ? body.tagIds.filter((x: unknown) => typeof x === 'string')
    : [];

  const groups = (await db.select().from(tags).where(eq(tags.tournamentId, tournamentId))).filter(
    (t) => t.kind === 'group'
  );
  const groupIds = new Set(groups.map((t) => t.id));
  if (tagIds.length !== groupIds.size || new Set(tagIds).size !== tagIds.length || !tagIds.every((id) => groupIds.has(id))) {
    return NextResponse.json({ error: 'Cal enviar tots els grups del campionat, un sol cop cadascun' }, { status: 400 });
  }

  db.transaction((tx) => {
    tagIds.forEach((id, i) => tx.update(tags).set({ order: i + 1 }).where(eq(tags.id, id)).run());
  });
  return new NextResponse(null, { status: 204 });
}
