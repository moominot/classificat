import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { entries, entryTags, tags } from '@/db/schema';
import { requireTournamentAccess } from '@/lib/authz';

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * POST — Afegeix o treu una etiqueta a diversos jugadors d'un cop (la
 * pantalla d'Etiquetes la fa servir sobre una selecció múltiple, en lloc
 * d'una crida PATCH per jugador).
 */
export async function POST(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const { entryIds, tagId, action } = body as { entryIds?: string[]; tagId?: string; action?: string };

  if (!Array.isArray(entryIds) || entryIds.length === 0) {
    return NextResponse.json({ error: 'Cal triar almenys un jugador' }, { status: 400 });
  }
  if (!tagId) return NextResponse.json({ error: "Cal l'etiqueta" }, { status: 400 });
  if (action !== 'add' && action !== 'remove') {
    return NextResponse.json({ error: 'action ha de ser "add" o "remove"' }, { status: 400 });
  }

  const [tag] = await db.select().from(tags).where(and(eq(tags.id, tagId), eq(tags.tournamentId, tournamentId)));
  if (!tag) return NextResponse.json({ error: 'Etiqueta no trobada' }, { status: 404 });

  const sevesEntries = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.tournamentId, tournamentId), inArray(entries.id, entryIds)));
  const idsValids = sevesEntries.map((e) => e.id);
  if (idsValids.length === 0) {
    return NextResponse.json({ error: 'Cap dels jugadors pertany a aquesta competició' }, { status: 404 });
  }

  if (action === 'remove') {
    await db
      .delete(entryTags)
      .where(and(eq(entryTags.tagId, tagId), inArray(entryTags.entryId, idsValids)));
  } else {
    const ja = await db
      .select({ entryId: entryTags.entryId })
      .from(entryTags)
      .where(and(eq(entryTags.tagId, tagId), inArray(entryTags.entryId, idsValids)));
    const jaTenen = new Set(ja.map((r) => r.entryId));
    const nous = idsValids.filter((id) => !jaTenen.has(id));
    if (nous.length > 0) {
      await db.insert(entryTags).values(nous.map((entryId) => ({ entryId, tagId })));
    }
  }

  return NextResponse.json({ ok: true, affected: idsValids.length });
}
