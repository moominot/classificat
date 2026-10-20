import { NextResponse } from 'next/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { entryTags, phases, rounds, tags } from '@/db/schema';
import type { PhaseConfig } from '@/db/types';
import { requireTournamentAccess } from '@/lib/authz';
import { loadQuestionMetrics, loadScoredMatches } from '@/lib/db-helpers';
import { computeStandings } from '@/lib/pairing/standings';
import { loadBracketGroups, splitGroupsConfig } from '@/lib/position-groups-service';
import { splitPhase } from '@/lib/position-split';

type Params = { params: Promise<{ tournamentId: string; phaseId: string }> };

/**
 * POST — Tanca una eliminatòria per posicions i parteix els grups
 * (docs/eliminatoria-per-posicions.md §4.5).
 *
 * Exigeix totes les partides de la fase amb resultat. Si una eliminatòria
 * queda empatada després de la mitjana i els bingos, respon 409 amb
 * `unresolvedTies` i cal tornar a enviar-ho amb `decisions` (clau de parella
 * → guanyador). En acabar: cada jugador perd l'etiqueta del grup i rep la de
 * la seva meitat, la fase següent aparella dins dels grups nous i aquesta
 * queda tancada.
 */
export async function POST(req: Request, { params }: Params) {
  const { tournamentId, phaseId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const [phase] = await db
    .select()
    .from(phases)
    .where(and(eq(phases.id, phaseId), eq(phases.tournamentId, tournamentId)));
  if (!phase) return NextResponse.json({ error: 'Fase no trobada' }, { status: 404 });
  if (!splitGroupsConfig(phase)) {
    return NextResponse.json({ error: 'Aquesta fase no és una eliminatòria per posicions' }, { status: 400 });
  }
  if (phase.isComplete) return NextResponse.json({ error: 'La fase ja està tancada' }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const decisions: Record<string, string> =
    body.decisions && typeof body.decisions === 'object' ? body.decisions : {};

  // Es juguen totes les partides: cap ronda per generar ni cap resultat pendent.
  const phaseRounds = await db.select().from(rounds).where(eq(rounds.phaseId, phaseId)).orderBy(asc(rounds.number));
  const missingRounds: number[] = [];
  for (let n = phase.startRound; n <= phase.endRound; n++) {
    if (!phaseRounds.some((r) => r.number === n)) missingRounds.push(n);
  }
  if (missingRounds.length > 0) {
    return NextResponse.json(
      { error: `Falten rondes per jugar: ${missingRounds.join(', ')}.` },
      { status: 409 }
    );
  }

  const phaseMatches = await loadScoredMatches(tournamentId, { phaseIds: [phaseId] });
  const roundNumberById = new Map(phaseRounds.map((r) => [r.id, r.number]));
  const roundsWithoutMatches = phaseRounds.filter((r) => !phaseMatches.some((m) => m.roundId === r.id));
  if (roundsWithoutMatches.length > 0) {
    return NextResponse.json(
      { error: `Falten aparellaments a la ronda ${roundsWithoutMatches.map((r) => r.number).join(', ')}.` },
      { status: 409 }
    );
  }
  const pending = phaseMatches.filter((m) => m.participants.some((p) => p.rank === null));
  if (pending.length > 0) {
    return NextResponse.json(
      {
        error: `Falten resultats: ${pending
          .map((m) => `ronda ${roundNumberById.get(m.roundId)}, taula ${m.tableNumber}`)
          .join('; ')}.`,
      },
      { status: 409 }
    );
  }

  const bracket = await loadBracketGroups(tournamentId, phase);
  if (bracket.outside.length > 0) {
    return NextResponse.json(
      {
        error: `No tenen cap de les etiquetes de la fase: ${bracket.outside.map((e) => e.displayName).join(', ')}.`,
      },
      { status: 409 }
    );
  }

  // Desempats de tot el campionat: mitjana de punts a favor i bingos.
  const [allMatches, { metrics, answers }] = await Promise.all([
    loadScoredMatches(tournamentId),
    loadQuestionMetrics(tournamentId),
  ]);
  const standings = computeStandings({
    entryIds: bracket.entrants.map((e) => e.id),
    matches: allMatches,
    tiebreakers: [],
    questionMetrics: metrics,
    answers,
  });
  const avgScore = new Map(standings.map((s) => [s.entryId, s.metrics.avg_score ?? 0]));
  const bingos = new Map(standings.map((s) => [s.entryId, s.metrics.bingos ?? 0]));

  const result = splitPhase({
    groups: bracket.groups,
    matches: phaseMatches,
    activeIds: bracket.activeIds,
    avgScore,
    bingos,
    decisions,
  });

  const nameById = new Map(bracket.entrants.map((e) => [e.id, e.displayName]));
  if (!result.ok) {
    return NextResponse.json(
      {
        error: "Hi ha eliminatòries empatades en tot (punts, mitjana i bingos): cal decidir qui passa.",
        unresolvedTies: result.unresolved.map((tie) => ({
          key: tie.key,
          entries: tie.entryIds.map((id, i) => ({ id, name: nameById.get(id) ?? id, total: tie.totals[i] })),
        })),
      },
      { status: 409 }
    );
  }

  // L'ordre pot tenir forats si s'ha esborrat alguna fase.
  const nextPhase = (await db.select().from(phases).where(eq(phases.tournamentId, tournamentId)))
    .filter((p) => p.order > phase.order)
    .sort((a, b) => a.order - b.order)[0];

  const existingTags = await db.select().from(tags).where(eq(tags.tournamentId, tournamentId));
  const newTagIds: string[] = [];

  db.transaction((tx) => {
    // Etiqueta per nom, sense distingir majúscules (com el POST d'etiquetes).
    const tagFor = (name: string): string => {
      const found = existingTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (found) return found.id;
      const created = { id: uuid(), tournamentId, name, createdAt: new Date() };
      tx.insert(tags).values(created).run();
      existingTags.push(created);
      return created.id;
    };

    for (const group of result.groups) {
      const memberIds = [...group.top.entryIds, ...group.bottom.entryIds];
      if (group.tagId) {
        tx.delete(entryTags)
          .where(and(eq(entryTags.tagId, group.tagId), inArray(entryTags.entryId, memberIds)))
          .run();
      }
      for (const half of [group.top, group.bottom]) {
        const tagId = tagFor(half.name);
        newTagIds.push(tagId);
        if (half.entryIds.length > 0) {
          tx.insert(entryTags)
            .values(half.entryIds.map((entryId) => ({ entryId, tagId })))
            .onConflictDoNothing()
            .run();
        }
      }
    }

    if (nextPhase && nextPhase.method !== 'manual') {
      const config = { ...nextPhase.config, scope: 'intra_tag', tagIds: newTagIds } as PhaseConfig;
      tx.update(phases).set({ config }).where(eq(phases.id, nextPhase.id)).run();
    }

    tx.update(phases)
      .set({ isComplete: true, config: { ...phase.config, resultTagIds: newTagIds } as PhaseConfig })
      .where(eq(phases.id, phaseId))
      .run();
    tx.update(rounds).set({ status: 'closed' }).where(eq(rounds.phaseId, phaseId)).run();
  });

  return NextResponse.json({
    groups: result.groups.flatMap((g) => [g.top, g.bottom]).map((half) => ({
      name: half.name,
      players: half.entryIds.map((id) => nameById.get(id) ?? id),
    })),
    nextPhaseId: nextPhase?.id ?? null,
  });
}
