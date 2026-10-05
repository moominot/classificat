import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { gameProfiles, questionDefinitions, tournaments } from '@/db/schema';
import { DEFAULT_VISIBILITY } from '@/db/types';
import type { GameProfileConfig } from '@/db/types';
import { getCurrentAccount, listManagedTournaments, requireRole } from '@/lib/authz';

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

export async function POST(req: Request) {
  const guard = await requireRole('admin');
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const { name, gameProfileId } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Cal un nom per a la competició' }, { status: 400 });
  }

  const slug = slugify(name.trim());
  const existing = await db.select().from(tournaments).where(eq(tournaments.slug, slug));
  if (existing.length > 0) {
    return NextResponse.json({ error: `Ja existeix una competició amb el nom "${name}"` }, { status: 409 });
  }

  const now = new Date();
  const tournament = {
    id: uuid(),
    name: name.trim(),
    slug,
    gameProfileId: gameProfileId ?? null,
    ownerId: guard.account.id,
    status: 'draft' as const,
    visibility: DEFAULT_VISIBILITY,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(tournaments).values(tournament);
  await seedQuestionsFromProfile(tournament.id, gameProfileId ?? null);

  return NextResponse.json(tournament, { status: 201 });
}

/**
 * Les preguntes del perfil de joc es **copien** a la competició, no s'hi
 * enllacen: així es poden ajustar sense tocar el perfil ni afectar les altres
 * competicions (§13.1 #4).
 */
async function seedQuestionsFromProfile(tournamentId: string, gameProfileId: string | null) {
  const profile = gameProfileId
    ? (await db.select().from(gameProfiles).where(eq(gameProfiles.id, gameProfileId)))[0]
    : (await db.select().from(gameProfiles).where(eq(gameProfiles.name, 'Scrabble')))[0];

  const config = profile?.config as GameProfileConfig | undefined;
  if (!config?.questions?.length) return;

  await db.insert(questionDefinitions).values(
    config.questions.map((q) => ({
      id: uuid(),
      tournamentId,
      key: q.key,
      isBuiltin: true,
      type: q.type,
      scope: q.scope,
      label: q.label,
      label1: q.label1 ?? null,
      label2: q.label2 ?? null,
      answerType: q.answerType ?? null,
      aggregate: q.aggregate,
      usableAsTiebreaker: q.usableAsTiebreaker,
      showInRanking: q.showInRanking,
      order: q.order,
    }))
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // elimina diacrítics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
