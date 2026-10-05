import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { entries, matchParticipants } from '@/db/schema';

/**
 * Posa (o treu, amb `null`) l'equip a uns quants jugadors.
 *
 * Les partides desen l'equip del jugador en el moment de jugar-les (§12.9) i
 * no es reescriuen si canvia d'equip. Però una partida **sense** equip no és
 * història, és que encara no n'hi havia: s'omple perquè la classificació
 * d'equips no ignori les rondes jugades abans d'assignar-lo.
 */
export async function assignTeam(entryIds: string[], teamId: string | null) {
  if (entryIds.length === 0) return;
  await db.update(entries).set({ teamId }).where(inArray(entries.id, entryIds));
  if (teamId) {
    await db
      .update(matchParticipants)
      .set({ teamId })
      .where(and(inArray(matchParticipants.entryId, entryIds), isNull(matchParticipants.teamId)));
  }
}
