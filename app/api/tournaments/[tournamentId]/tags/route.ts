import { NextResponse } from 'next/server';
import { and, asc, eq, like } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { tags } from '@/db/schema';
import { requireTournamentAccess } from '@/lib/authz';

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
    .orderBy(asc(tags.name));
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

  const newTag = { id: uuid(), tournamentId, name, createdAt: new Date() };
  await db.insert(tags).values(newTag);
  return NextResponse.json(newTag, { status: 201 });
}
