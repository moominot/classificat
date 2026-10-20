import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { tournamentTemplates } from '@/db/schema';
import { canManageTournament, requireRole } from '@/lib/authz';
import { listTemplates, snapshotTournament } from '@/lib/templates-service';

/** GET — Les plantilles que pot fer servir qui crea campionats. */
export async function GET() {
  const guard = await requireRole('admin');
  if (guard.error) return guard.error;
  return NextResponse.json(await listTemplates(guard.account));
}

/**
 * POST — Desa un campionat com a plantilla: `{ tournamentId, name }`.
 * Sense jugadors, resultats ni dates (docs/eliminatoria-per-posicions.md §4).
 */
export async function POST(req: Request) {
  const guard = await requireRole('admin');
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const tournamentId = typeof body.tournamentId === 'string' ? body.tournamentId : '';
  if (!name) return NextResponse.json({ error: 'Cal un nom per a la plantilla' }, { status: 400 });
  if (!tournamentId || !(await canManageTournament(guard.account, tournamentId))) {
    return NextResponse.json({ error: 'Competició no trobada' }, { status: 404 });
  }

  const config = await snapshotTournament(tournamentId);
  if (!config) return NextResponse.json({ error: 'Competició no trobada' }, { status: 404 });

  const template = { id: uuid(), name, ownerId: guard.account.id, isBuiltin: false, config, createdAt: new Date() };
  await db.insert(tournamentTemplates).values(template);
  return NextResponse.json({ id: template.id, name }, { status: 201 });
}
