import { NextResponse } from 'next/server';
import { db } from '@/db';
import { tournaments } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

export async function GET() {
  const all = await db.select().from(tournaments).orderBy(tournaments.createdAt);
  return NextResponse.json(all);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Cal un nom pel campionat' }, { status: 400 });
  }

  const slug = slugify(name.trim());
  const existing = await db.select().from(tournaments).where(eq(tournaments.slug, slug));
  if (existing.length > 0) {
    return NextResponse.json({ error: `Ja existeix un campionat amb el nom "${name}"` }, { status: 409 });
  }

  const now = new Date();
  const tournament = {
    id: uuid(),
    name: name.trim(),
    slug,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(tournaments).values(tournament);
  return NextResponse.json(tournament, { status: 201 });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // elimina diacrítics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
