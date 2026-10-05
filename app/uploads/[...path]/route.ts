import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

type Params = { params: Promise<{ path: string[] }> };

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/**
 * Serveix les imatges pujades des del disc. En mode `standalone`, Next només
 * serveix com a estàtics els fitxers de `public/` que hi eren en arrencar, de
 * manera que les fotos pujades després (i el volum de Docker) donarien 404.
 */
export async function GET(_req: Request, { params }: Params) {
  const { path: segments } = await params;
  const file = path.resolve(UPLOADS_DIR, ...segments);
  const type = MIME[path.extname(file).toLowerCase()];

  // Només imatges, i sense sortir de la carpeta d'uploads.
  if (!type || !file.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return NextResponse.json({ error: 'No trobat' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(fs.readFileSync(file)), {
    headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
