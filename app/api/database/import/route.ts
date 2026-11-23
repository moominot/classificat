import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { DATA_DIR, PENDING_IMPORT_PATH, validateImportCandidate } from '@/lib/db-files';

export const dynamic = 'force-dynamic';

/**
 * Importa una base de dades (cos = el fitxer .db en brut). No la substitueix
 * en calent: la valida, la deixa com a pendent i reinicia el procés; la
 * substitució es fa en arrencar (`lib/db-files.ts`), amb còpia de la BD actual.
 *
 * El reinici és `process.exit`: només torna a pujar si l'app corre amb una
 * política de reinici (Docker amb `restart: unless-stopped`). Fora de Docker
 * cal tornar-la a arrencar a mà.
 */
export async function POST(req: Request) {
  const guard = await requireRole('admin');
  if (guard.error) return guard.error;

  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length === 0) {
    return NextResponse.json({ error: 'No s\'ha rebut cap fitxer' }, { status: 400 });
  }
  // Un cos truncat (p. ex. pel límit del proxy de Next) no és una BD sencera.
  const declared = Number(req.headers.get('content-length'));
  if (declared && declared !== bytes.length) {
    return NextResponse.json({ error: 'El fitxer ha arribat incomplet' }, { status: 400 });
  }

  const tmp = path.join(DATA_DIR, `import-${uuid()}.tmp`);
  try {
    fs.writeFileSync(tmp, bytes);
    const problem = validateImportCandidate(tmp);
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }
    fs.renameSync(tmp, PENDING_IMPORT_PATH);
  } catch {
    return NextResponse.json({ error: "No s'ha pogut desar el fitxer" }, { status: 500 });
  } finally {
    fs.rmSync(tmp, { force: true });
  }

  // Deixa temps perquè la resposta arribi al navegador abans de reiniciar.
  setTimeout(() => process.exit(0), 800);
  return NextResponse.json({ ok: true });
}
