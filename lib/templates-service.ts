import { asc, eq, isNull, or } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { phases, questionDefinitions, tags, tournaments, tournamentTemplates } from '@/db/schema';
import type { TemplateConfig, TemplatePhase } from '@/db/types';
import type { CurrentAccount } from '@/lib/authz';
import { loadTags } from '@/lib/db-helpers';
import { instantiateTemplate, templateFromTournament } from '@/lib/templates';

/** Peces de base de dades de les plantilles. La lògica és a `lib/templates.ts`. */

/** De sèrie, més les pròpies; el superadmin les veu totes. */
export async function listTemplates(account: CurrentAccount) {
  const rows = await db
    .select({
      id: tournamentTemplates.id,
      name: tournamentTemplates.name,
      isBuiltin: tournamentTemplates.isBuiltin,
      ownerId: tournamentTemplates.ownerId,
      config: tournamentTemplates.config,
    })
    .from(tournamentTemplates)
    .where(
      account.role === 'superadmin'
        ? undefined
        : or(isNull(tournamentTemplates.ownerId), eq(tournamentTemplates.ownerId, account.id))
    )
    .orderBy(asc(tournamentTemplates.name));

  return rows
    .sort((a, b) => Number(b.isBuiltin) - Number(a.isBuiltin))
    .map(({ config, ...row }) => ({ ...row, summary: summarize(config) }));
}

/** Una línia per al selector: què porta la plantilla. */
function summarize(config: TemplateConfig): string {
  const parts: string[] = [];
  if (config.phaseGenerator === 'position_elimination') parts.push('eliminatòria per posicions, fases segons el nombre de jugadors');
  else if (config.phases.length > 0) parts.push(`${config.phases.length} fase${config.phases.length !== 1 ? 's' : ''}`);
  else parts.push('sense fases');
  parts.push(`${config.questions.length} pregunt${config.questions.length !== 1 ? 'es' : 'a'}`);
  return parts.join(' · ');
}

export async function canUseTemplate(account: CurrentAccount, templateId: string) {
  const [template] = await db.select().from(tournamentTemplates).where(eq(tournamentTemplates.id, templateId));
  if (!template) return null;
  if (template.ownerId && template.ownerId !== account.id && account.role !== 'superadmin') return null;
  return template;
}

/** Fotografia d'un campionat per desar-la com a plantilla. */
export async function snapshotTournament(tournamentId: string): Promise<TemplateConfig | null> {
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!tournament) return null;

  const [questionRows, phaseRows, tagRows] = await Promise.all([
    db.select().from(questionDefinitions).where(eq(questionDefinitions.tournamentId, tournamentId)).orderBy(asc(questionDefinitions.order)),
    db.select().from(phases).where(eq(phases.tournamentId, tournamentId)).orderBy(asc(phases.order)),
    loadTags(tournamentId),
  ]);

  return templateFromTournament({
    settings: {
      visibility: tournament.visibility,
      presencePendingAs: tournament.presencePendingAs,
      askPresence: tournament.askPresence,
      byeSpread: tournament.byeSpread,
    },
    questions: questionRows.map((q) => ({
      isBuiltin: q.isBuiltin,
      key: q.key,
      type: q.type,
      scope: q.scope,
      label: q.label,
      ...(q.label1 ? { label1: q.label1 } : {}),
      ...(q.label2 ? { label2: q.label2 } : {}),
      ...(q.answerType ? { answerType: q.answerType } : {}),
      aggregate: q.aggregate,
      usableAsTiebreaker: q.usableAsTiebreaker,
      showInRanking: q.showInRanking,
      order: q.order,
    })),
    phases: phaseRows.map((p) => ({
      id: p.id,
      name: p.name,
      method: p.method,
      config: p.config,
      participantsPerMatch: p.participantsPerMatch,
      scoring: p.scoring,
      tiebreakers: p.tiebreakers,
      standingsScope: p.standingsScope,
      teamAggregation: p.teamAggregation,
      standingsLive: p.standingsLive,
      startRound: p.startRound,
      endRound: p.endRound,
    })),
    tags: tagRows,
  });
}

/**
 * Escriu dins d'una transacció el que porta la plantilla a un campionat
 * acabat de crear: preguntes, etiquetes i fases.
 */
export function applyTemplate(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tournamentId: string,
  config: TemplateConfig
) {
  const created = instantiateTemplate(config, uuid);

  if (created.questions.length > 0) {
    tx.insert(questionDefinitions)
      .values(
        created.questions.map((q) => ({
          id: uuid(),
          tournamentId,
          key: q.key,
          isBuiltin: q.isBuiltin,
          type: q.type,
          scope: q.scope,
          label: q.label,
          label1: q.label1 ?? null,
          label2: q.label2 ?? null,
          answerType: q.answerType ?? null,
          aggregate: q.aggregate,
          usableAsTiebreaker: q.usableAsTiebreaker,
          showInRanking: q.showInRanking,
          order: q.order,
        }))
      )
      .run();
  }
  if (created.tags.length > 0) {
    tx.insert(tags).values(created.tags.map((t) => ({ ...t, tournamentId, createdAt: new Date() }))).run();
  }
  insertPhases(tx, tournamentId, created.phases);
}

export function insertPhases(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tournamentId: string,
  rows: (TemplatePhase & { id: string; order: number })[]
) {
  if (rows.length === 0) return;
  tx.insert(phases)
    .values(rows.map((p) => ({ ...p, tournamentId, isComplete: false })))
    .run();
}
