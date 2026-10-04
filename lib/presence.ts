import { and, desc, eq, max } from 'drizzle-orm';
import { db } from '@/db';
import { entries, matches, phases, roundPresence, rounds, tournaments } from '@/db/schema';
import type { PresencePendingAs, PresenceSource, PresenceStatus } from '@/db/types';

/**
 * Confirmació de presència a la ronda següent (el «botó d'home mort»).
 *
 * Tres estats per jugador i ronda: present, absent i **pendent** (cap fila).
 * El pendent no és un error: qui no té mòbil o no s'hi ha fixat queda aquí fins
 * que el director el resol, i en aparellar compta segons
 * `tournaments.presencePendingAs` (per defecte, com a present).
 */

export interface PresenceRow {
  entryId: string;
  status: PresenceStatus;
  source: PresenceSource;
}

/** L'última ronda prevista: el final de la darrera fase. */
export async function lastPlannedRound(tournamentId: string): Promise<number> {
  const [row] = await db
    .select({ last: max(phases.endRound) })
    .from(phases)
    .where(eq(phases.tournamentId, tournamentId));
  return row?.last ?? 0;
}

/**
 * La ronda que el director acaba de crear i encara no té aparellaments: és el
 * moment de preguntar als jugadors si hi seran. `null` si no n'hi ha cap.
 */
export async function roundAwaitingPresence(tournamentId: string): Promise<number | null> {
  const [round] = await db
    .select({ id: rounds.id, number: rounds.number })
    .from(rounds)
    .where(and(eq(rounds.tournamentId, tournamentId), eq(rounds.status, 'draft')))
    .orderBy(desc(rounds.number))
    .limit(1);
  if (!round) return null;
  const [match] = await db.select({ id: matches.id }).from(matches).where(eq(matches.roundId, round.id)).limit(1);
  return match ? null : round.number;
}

export async function loadPresence(tournamentId: string, roundNumber: number): Promise<Map<string, PresenceRow>> {
  const rows = await db
    .select({ entryId: roundPresence.entryId, status: roundPresence.status, source: roundPresence.source })
    .from(roundPresence)
    .where(and(eq(roundPresence.tournamentId, tournamentId), eq(roundPresence.roundNumber, roundNumber)));
  return new Map(rows.map((r) => [r.entryId, r]));
}

/** La ronda ja té aparellaments: confirmar-hi la presència ja no canvia res. */
export async function roundIsPaired(tournamentId: string, roundNumber: number): Promise<boolean> {
  const [round] = await db
    .select({ id: rounds.id })
    .from(rounds)
    .where(and(eq(rounds.tournamentId, tournamentId), eq(rounds.number, roundNumber)));
  if (!round) return false;
  const [match] = await db.select({ id: matches.id }).from(matches).where(eq(matches.roundId, round.id)).limit(1);
  return Boolean(match);
}

/**
 * Desa la presència d'un jugador per a una ronda.
 *
 * El que marca el director **mana**: un jugador o un company de taula no el
 * poden desfer. Torna `false` si s'ha ignorat per això.
 */
export async function setPresence(opts: {
  tournamentId: string;
  roundNumber: number;
  entryId: string;
  status: PresenceStatus;
  source: PresenceSource;
  deviceId?: string | null;
  accountId?: string | null;
}): Promise<boolean> {
  const [existing] = await db
    .select({ source: roundPresence.source })
    .from(roundPresence)
    .where(
      and(
        eq(roundPresence.tournamentId, opts.tournamentId),
        eq(roundPresence.roundNumber, opts.roundNumber),
        eq(roundPresence.entryId, opts.entryId)
      )
    );
  if (existing?.source === 'admin' && opts.source !== 'admin') return false;

  const values = {
    tournamentId: opts.tournamentId,
    roundNumber: opts.roundNumber,
    entryId: opts.entryId,
    status: opts.status,
    source: opts.source,
    deviceId: opts.deviceId ?? null,
    accountId: opts.accountId ?? null,
    updatedAt: new Date(),
  };
  await db
    .insert(roundPresence)
    .values(values)
    .onConflictDoUpdate({
      target: [roundPresence.tournamentId, roundPresence.roundNumber, roundPresence.entryId],
      set: values,
    });
  return true;
}

/** Treu la marca del director i el jugador torna a pendent. */
export async function clearPresence(tournamentId: string, roundNumber: number, entryId: string) {
  await db
    .delete(roundPresence)
    .where(
      and(
        eq(roundPresence.tournamentId, tournamentId),
        eq(roundPresence.roundNumber, roundNumber),
        eq(roundPresence.entryId, entryId)
      )
    );
}

export async function loadPendingPolicy(tournamentId: string): Promise<PresencePendingAs> {
  const [row] = await db
    .select({ policy: tournaments.presencePendingAs })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId));
  return row?.policy ?? 'present';
}

/** Només una inscripció d'aquesta competició. */
export async function entryBelongsTo(tournamentId: string, entryId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.id, entryId), eq(entries.tournamentId, tournamentId)));
  return Boolean(row);
}
