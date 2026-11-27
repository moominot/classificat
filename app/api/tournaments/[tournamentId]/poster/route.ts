import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { tournaments } from '@/db/schema';
import { requireTournamentAccess } from '@/lib/authz';

type Params = { params: Promise<{ tournamentId: string }> };

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
const MAX_BYTES = 8 * 1024 * 1024;

/** Extensió segons el contingut real del fitxer, no segons el que diu el navegador. */
function imageExtension(buf: Buffer): string | null {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

/** Esborra el fitxer d'un cartell anterior, si és a la carpeta de cartells. */
function removeFile(url: string | null) {
  if (!url?.startsWith('/uploads/posters/')) return;
  const file = path.resolve(UPLOADS_DIR, url.slice('/uploads/'.length));
  if (file.startsWith(path.join(UPLOADS_DIR, 'posters') + path.sep)) fs.rmSync(file, { force: true });
}

/** POST — Puja (o substitueix) el cartell del campionat. `multipart/form-data` amb `file`. */
export async function POST(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const [existing] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!existing) return NextResponse.json({ error: 'Competició no trobada' }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Cal una imatge' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'La imatge pesa més de 8 MB' }, { status: 413 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = imageExtension(buffer);
  if (!ext) return NextResponse.json({ error: 'La imatge ha de ser JPG, PNG o WebP' }, { status: 400 });

  const dir = path.join(UPLOADS_DIR, 'posters');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${tournamentId}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);

  const posterUrl = `/uploads/posters/${filename}`;
  await db.update(tournaments).set({ posterUrl, updatedAt: new Date() }).where(eq(tournaments.id, tournamentId));
  removeFile(existing.posterUrl);

  return NextResponse.json({ posterUrl }, { status: 201 });
}

/** DELETE — Treu el cartell. */
export async function DELETE(_req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const [existing] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!existing) return NextResponse.json({ error: 'Competició no trobada' }, { status: 404 });

  await db.update(tournaments).set({ posterUrl: null, updatedAt: new Date() }).where(eq(tournaments.id, tournamentId));
  removeFile(existing.posterUrl);
  return NextResponse.json({ posterUrl: null });
}
