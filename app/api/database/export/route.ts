import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { NextResponse } from 'next/server';
import { sqlite } from '@/db';
import { requireRole } from '@/lib/authz';
import { DATA_DIR } from '@/lib/db-files';

export const dynamic = 'force-dynamic';

/**
 * Descarrega una còpia consistent de la base de dades. `VACUUM INTO` la fa des
 * de la connexió oberta (WAL inclòs), així que no cal aturar res. La còpia
 * conté comptes (amb les contrasenyes xifrades) i la clau del BARRUF.
 */
export async function GET() {
  const guard = await requireRole('admin');
  if (guard.error) return guard.error;

  const tmp = path.join(DATA_DIR, `export-${uuid()}.tmp`);
  try {
    sqlite.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const bytes = fs.readFileSync(tmp);
    const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'application/vnd.sqlite3',
        'Content-Disposition': `attachment; filename="classificat-${stamp}.db"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: "No s'ha pogut exportar la base de dades" }, { status: 500 });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
