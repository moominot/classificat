import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { phases, tournaments, tournamentTemplates } from '@/db/schema';
import { requireTournamentAccess } from '@/lib/authz';
import { loadEntrants } from '@/lib/db-helpers';
import { positionEliminationPhases } from '@/lib/templates';
import { insertPhases } from '@/lib/templates-service';

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * POST — Crea totes les fases d'una eliminatòria per posicions a partir dels
 * jugadors actius: log₂ N fases de sorteig amb anada i tornada
 * (docs/eliminatoria-per-posicions.md). Només amb el campionat sense fases:
 * no s'ha de barrejar amb fases fetes a mà.
 */
export async function POST(_req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const existing = await db.select({ id: phases.id }).from(phases).where(eq(phases.tournamentId, tournamentId));
  if (existing.length > 0) {
    return NextResponse.json({ error: 'El campionat ja té fases: esborra-les primer.' }, { status: 409 });
  }

  // Si el campionat ve d'una plantilla d'eliminatòria, en fa servir la
  // puntuació i els desempats.
  const [template] = await db
    .select({ config: tournamentTemplates.config })
    .from(tournaments)
    .innerJoin(tournamentTemplates, eq(tournamentTemplates.id, tournaments.templateId))
    .where(eq(tournaments.id, tournamentId));

  const active = (await loadEntrants(tournamentId)).filter((e) => e.isActive);
  const generated = positionEliminationPhases(active.length, template?.config.generatorDefaults ?? {});
  if ('error' in generated) return NextResponse.json({ error: generated.error }, { status: 400 });

  const rows = generated.map((p, i) => ({ ...p, id: uuid(), order: i + 1 }));
  db.transaction((tx) => insertPhases(tx, tournamentId, rows));
  return NextResponse.json({ phases: rows.map((p) => ({ id: p.id, name: p.name })) }, { status: 201 });
}
