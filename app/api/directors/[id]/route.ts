import { NextResponse } from 'next/server';
import { db } from '@/db';
import { directors } from '@/db/schema';
import { eq, and, ne } from 'drizzle-orm';
import { hashPassword } from '@/lib/auth';

type Params = { params: Promise<{ id: string }> };

async function countOtherActiveDirectors(id: string): Promise<number> {
  const rows = await db
    .select({ id: directors.id })
    .from(directors)
    .where(and(ne(directors.id, id), eq(directors.isActive, true)));
  return rows.length;
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const { name, password, isActive } = body;

  const [director] = await db.select().from(directors).where(eq(directors.id, id));
  if (!director) return NextResponse.json({ error: 'Director no trobat' }, { status: 404 });

  if (isActive === false && !(await countOtherActiveDirectors(id))) {
    return NextResponse.json(
      { error: 'No es pot desactivar l\'últim director actiu' },
      { status: 409 }
    );
  }
  if (password !== undefined && (typeof password !== 'string' || password.length < 6)) {
    return NextResponse.json({ error: 'La contrasenya ha de tenir com a mínim 6 caràcters' }, { status: 400 });
  }

  const updates: Partial<typeof director> = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (isActive !== undefined) updates.isActive = !!isActive;
  if (password) updates.passwordHash = hashPassword(password);

  await db.update(directors).set(updates).where(eq(directors.id, id));

  return NextResponse.json({
    id: director.id,
    username: director.username,
    name: updates.name ?? director.name,
    isActive: updates.isActive ?? director.isActive,
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;

  const [director] = await db.select().from(directors).where(eq(directors.id, id));
  if (!director) return NextResponse.json({ error: 'Director no trobat' }, { status: 404 });

  if (director.isActive && !(await countOtherActiveDirectors(id))) {
    return NextResponse.json(
      { error: 'No es pot esborrar l\'últim director actiu' },
      { status: 409 }
    );
  }

  await db.delete(directors).where(eq(directors.id, id));
  return new NextResponse(null, { status: 204 });
}
