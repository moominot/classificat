import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { entries, matchParticipants, matches, people, phases, rounds, tournaments } from '@/db/schema';
import type { SpGame, SpPlayer, SpTournament } from './parse';

/** Punts de partida de SwissPerfect: victòria 2, empat 1, derrota 0 (bye = victòria). */
const MATCH_POINTS = { win: 2, draw: 1, loss: 0, bye: 2, forfeit: 0 } as const;

/**
 * Llegeix un campionat de Classificat com un campionat de SwissPerfect.
 *
 * Només hi caben les partides d'1 contra 1 i el bye; les taules de més
 * participants s'ometen i s'avisa a `warnings`. Els jugadors es numeren per
 * valoració (el número d'inici de SwissPerfect).
 */
export async function loadSwissPerfectTournament(tournamentId: string): Promise<SpTournament | null> {
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!t) return null;

  const [entryRows, phaseRows, roundRows] = await Promise.all([
    db.select({ e: entries, p: people }).from(entries).innerJoin(people, eq(entries.personId, people.id)).where(eq(entries.tournamentId, tournamentId)),
    db.select().from(phases).where(eq(phases.tournamentId, tournamentId)),
    db.select().from(rounds).where(eq(rounds.tournamentId, tournamentId)).orderBy(asc(rounds.number)),
  ]);

  const matchRows = roundRows.length
    ? await db.select().from(matches).where(inArray(matches.roundId, roundRows.map((r) => r.id))).orderBy(asc(matches.tableNumber))
    : [];
  const partRows = matchRows.length
    ? await db.select().from(matchParticipants).where(inArray(matchParticipants.matchId, matchRows.map((m) => m.id))).orderBy(asc(matchParticipants.seat))
    : [];

  const warnings: string[] = [];
  const sorted = [...entryRows].sort(
    (a, b) => (b.e.rating ?? b.p.rating ?? 0) - (a.e.rating ?? a.p.rating ?? 0) || a.p.displayName.localeCompare(b.p.displayName, 'ca'),
  );
  const numberOf = new Map(sorted.map((r, i) => [r.e.id, i + 1]));
  const roundNumberById = new Map(roundRows.map((r) => [r.id, r.number]));

  const games: SpGame[] = [];
  const firstSeen = new Map<number, number>();
  const lastSeen = new Map<number, number>();
  const see = (id: number, round: number) => {
    firstSeen.set(id, Math.min(firstSeen.get(id) ?? round, round));
    lastSeen.set(id, Math.max(lastSeen.get(id) ?? round, round));
  };

  for (const m of [...matchRows].sort((a, b) => (roundNumberById.get(a.roundId)! - roundNumberById.get(b.roundId)!) || a.tableNumber - b.tableNumber)) {
    const round = roundNumberById.get(m.roundId)!;
    const parts = partRows.filter((p) => p.matchId === m.id);
    if (parts.length === 1) {
      const id = numberOf.get(parts[0].entryId)!;
      see(id, round);
      games.push({ round, white: id, black: null, whiteMatchPoints: MATCH_POINTS.bye, blackMatchPoints: 0, whiteScore: null, blackScore: null, played: true });
    } else if (parts.length === 2) {
      const [w, b] = parts;
      const wid = numberOf.get(w.entryId)!;
      const bid = numberOf.get(b.entryId)!;
      see(wid, round);
      see(bid, round);
      const played = w.outcome !== null && b.outcome !== null;
      games.push({
        round, white: wid, black: bid,
        whiteMatchPoints: played ? MATCH_POINTS[w.outcome!] : 0,
        blackMatchPoints: played ? MATCH_POINTS[b.outcome!] : 0,
        whiteScore: played ? (w.score ?? 0) : null,
        blackScore: played ? (b.score ?? 0) : null,
        played,
      });
    } else {
      warnings.push(`Ronda ${round}, taula ${m.tableNumber}: ${parts.length} participants, no cap a SwissPerfect (omesa)`);
    }
  }

  const players: SpPlayer[] = sorted.map((r, i) => {
    const id = i + 1;
    const first = firstSeen.get(id) ?? 1;
    const last = lastSeen.get(id);
    const name = r.p.displayName.trim();
    // El nom es parteix per l'últim espai: «Mateu Xurí» → nom «Mateu», cognom «Xurí».
    const cut = name.lastIndexOf(' ');
    return {
      id,
      firstName: cut > 0 ? name.slice(0, cut) : '',
      surname: cut > 0 ? name.slice(cut + 1) : name,
      club: r.p.club ?? '',
      rating: r.e.rating ?? r.p.rating ?? null,
      firstRound: first,
      withdrawnFromRound: !r.e.isActive && last !== undefined ? last + 1 : null,
    };
  });

  const lastRound = Math.max(0, ...games.map((g) => g.round));
  return {
    name: t.name,
    organiser: '',
    arbiter: '',
    rounds: Math.max(lastRound, ...phaseRows.map((p) => p.endRound), 0),
    players,
    games,
    warnings,
  };
}
