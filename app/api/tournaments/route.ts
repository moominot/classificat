import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { tournaments } from '@/db/schema';
import { DEFAULT_TEMPLATE_ID } from '@/db/builtin-templates';
import { DEFAULT_VISIBILITY } from '@/db/types';
import { getCurrentAccount, listManagedTournaments, requireRole } from '@/lib/authz';
import { slugify } from '@/lib/short-path';
import { applyTemplate, canUseTemplate } from '@/lib/templates-service';

/**
 * GET — Les competicions que el compte pot gestionar.
 *
 * Un `user` no en veu cap llista: hi accedeix per invitació directa a una de
 * concreta (docs/pla-rols.md §7.3).
 */
export async function GET() {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json([]);
  return NextResponse.json(await listManagedTournaments(account));
}

/**
 * POST — Crea una competició a partir d'una plantilla (`templateId`; per
 * defecte, Scrabble). La plantilla es **copia**: preguntes, ajustos,
 * etiquetes i fases. Així es poden ajustar sense tocar la plantilla ni les
 * altres competicions (§13.1 #4).
 */
export async function POST(req: Request) {
  const guard = await requireRole('admin');
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const { name } = body;
  const templateId: string = typeof body.templateId === 'string' && body.templateId ? body.templateId : DEFAULT_TEMPLATE_ID;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Cal un nom per a la competició' }, { status: 400 });
  }

  const template = await canUseTemplate(guard.account, templateId);
  if (!template) return NextResponse.json({ error: 'Plantilla no trobada' }, { status: 404 });

  const slug = slugify(name.trim());
  const existing = await db.select().from(tournaments).where(eq(tournaments.slug, slug));
  if (existing.length > 0) {
    return NextResponse.json({ error: `Ja existeix una competició amb el nom "${name}"` }, { status: 409 });
  }

  const now = new Date();
  const settings = template.config.settings;
  const tournament = {
    id: uuid(),
    name: name.trim(),
    slug,
    templateId: template.id,
    ownerId: guard.account.id,
    status: 'draft' as const,
    visibility: settings?.visibility ?? DEFAULT_VISIBILITY,
    presencePendingAs: settings?.presencePendingAs ?? 'present',
    askPresence: settings?.askPresence ?? true,
    createdAt: now,
    updatedAt: now,
  };

  db.transaction((tx) => {
    tx.insert(tournaments).values(tournament).run();
    applyTemplate(tx, tournament.id, template.config);
  });

  return NextResponse.json(tournament, { status: 201 });
}
