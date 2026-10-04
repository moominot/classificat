import { randomUUID } from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { entries, entryClaims } from '@/db/schema';
import { DEVICE_COOKIE, DEVICE_COOKIE_OPTIONS } from '@/lib/session';

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * POST { entryId } — Aquest dispositiu declara qui és en aquesta competició.
 * DELETE — «No sóc jo»: l'oblida.
 *
 * No hi ha cap prova d'identitat (§15.2): serveix per recordar la tria i per
 * deixar traça. Un dispositiu és un sol jugador per competició.
 */
export async function POST(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const body = await req.json().catch(() => ({}));
  const entryId = typeof body.entryId === 'string' ? body.entryId : '';

  const [entry] = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.id, entryId), eq(entries.tournamentId, tournamentId), eq(entries.isActive, true)));
  if (!entry) return NextResponse.json({ error: 'Jugador no trobat' }, { status: 404 });

  const store = await cookies();
  const deviceId = store.get(DEVICE_COOKIE)?.value ?? randomUUID();
  store.set(DEVICE_COOKIE, deviceId, DEVICE_COOKIE_OPTIONS);

  await forgetDevice(tournamentId, deviceId);
  await db.insert(entryClaims).values({ entryId, deviceId });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const deviceId = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (deviceId) await forgetDevice(tournamentId, deviceId);
  return NextResponse.json({ ok: true });
}

async function forgetDevice(tournamentId: string, deviceId: string) {
  const mine = await db
    .select({ id: entries.id })
    .from(entries)
    .where(eq(entries.tournamentId, tournamentId));
  if (mine.length === 0) return;
  await db
    .delete(entryClaims)
    .where(and(eq(entryClaims.deviceId, deviceId), inArray(entryClaims.entryId, mine.map((e) => e.id))));
}
