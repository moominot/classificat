import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { DEFAULT_TEMPLATE_ID } from '@/db/builtin-templates';
import {
  entries,
  matchParticipants,
  matches,
  people,
  phases,
  roundAbsences,
  rounds,
  tournaments,
  tournamentTemplates,
} from '@/db/schema';
import { DEFAULT_VISIBILITY } from '@/db/types';
import type { Outcome, ScoringConfig } from '@/db/types';
import { slugify } from '@/lib/short-path';
import { applyTemplate } from '@/lib/templates-service';
import type { SpGame, SpTournament } from './parse';

/** SwissPerfect: victòria 2, empat 1, derrota 0 (i bye = victòria). */
const SP_SCORING: ScoringConfig = { positionPoints: [2, 0], trailingPoints: 0, byePoints: 2, forfeitPoints: 0 };

export interface ImportResult {
  tournamentId: string;
  name: string;
  players: number;
  rounds: number;
  matches: number;
  warnings: string[];
}

function outcomeOf(mine: number, theirs: number): Outcome {
  return mine > theirs ? 'win' : mine < theirs ? 'loss' : 'draw';
}

/**
 * Crea un campionat a partir d'un campionat de SwissPerfect ja llegit.
 *
 * Es crea amb la plantilla de Scrabble i una sola fase suïssa amb les rondes
 * del campionat. Les rondes amb tots els resultats queden tancades; la que
 * encara no s'ha jugat queda oberta amb els aparellaments fets. Els jugadors
 * que SwissPerfect no aparella en una ronda (entrada tardana o retirada)
 * queden com a absents d'aquella ronda.
 */
export function importSwissPerfect(
  sp: SpTournament,
  opts: { ownerId: string; name?: string }
): ImportResult {
  const name = (opts.name ?? sp.name).trim() || 'Campionat importat de SwissPerfect';
  const warnings = [...sp.warnings];

  const [template] = db.select().from(tournamentTemplates).where(eq(tournamentTemplates.id, DEFAULT_TEMPLATE_ID)).all();
  if (!template) throw new Error('No hi ha la plantilla de Scrabble');

  const baseSlug = slugify(name);
  let slug = baseSlug;
  for (let n = 2; db.select({ id: tournaments.id }).from(tournaments).where(eq(tournaments.slug, slug)).all().length > 0; n++) {
    slug = `${baseSlug}-${n}`;
  }

  const totalRounds = Math.max(sp.rounds, 1);
  const roundNumbers = [...new Set(sp.games.map((g) => g.round))].sort((a, b) => a - b);
  const gamesByRound = new Map<number, SpGame[]>(roundNumbers.map((r) => [r, sp.games.filter((g) => g.round === r)]));
  const isClosed = (r: number) => (gamesByRound.get(r) ?? []).every((g) => g.played);
  const allClosed = roundNumbers.length === totalRounds && roundNumbers.every(isClosed);

  const tournamentId = uuid();
  const now = new Date();
  const info = [
    sp.organiser && `Organitzador: ${sp.organiser}`,
    sp.arbiter && `Àrbitre: ${sp.arbiter}`,
    'Importat de SwissPerfect 98.',
  ].filter(Boolean).join('\n');

  let matchCount = 0;

  db.transaction((tx) => {
    tx.insert(tournaments).values({
      id: tournamentId,
      name,
      slug,
      templateId: template.id,
      ownerId: opts.ownerId,
      status: roundNumbers.length === 0 ? 'draft' : allClosed ? 'finished' : 'active',
      visibility: template.config.settings?.visibility ?? DEFAULT_VISIBILITY,
      presencePendingAs: template.config.settings?.presencePendingAs ?? 'present',
      askPresence: template.config.settings?.askPresence ?? true,
      // SwissPerfect no suma cap diferència de punts al bye (el seu «minor score» és 0).
      byeSpread: 0,
      info,
      createdAt: now,
      updatedAt: now,
    }).run();
    applyTemplate(tx, tournamentId, template.config);

    const phaseId = uuid();
    tx.insert(phases).values({
      id: phaseId,
      tournamentId,
      order: 1,
      name: 'Suís',
      method: 'swiss',
      config: {
        method: 'swiss',
        avoidRematches: true,
        byeHandling: 'lowest_ranked',
        scoreGroupWindowSize: 0,
        carryStandingsFromPhaseIds: [],
        seedingCriteria: ['points', 'elo'],
        scope: 'all',
        tagIds: [],
        entryExclusions: [],
      },
      participantsPerMatch: 2,
      scoring: SP_SCORING,
      // Aproximació dels desempats de SwissPerfect (no es poden llegir del .ini).
      tiebreakers: ['buchholz', 'spread'],
      standingsScope: ['global'],
      startRound: 1,
      endRound: totalRounds,
      isComplete: allClosed,
    }).run();

    // Jugadors → persona + inscripció.
    const entryBySpId = new Map<number, string>();
    for (const p of sp.players) {
      const personId = uuid();
      const entryId = uuid();
      const displayName = `${p.firstName} ${p.surname}`.trim() || `Jugador ${p.id}`;
      tx.insert(people).values({
        id: personId,
        displayName,
        club: p.club || null,
        rating: p.rating,
        createdBy: opts.ownerId,
        createdAt: now,
      }).run();
      tx.insert(entries).values({
        id: entryId,
        tournamentId,
        personId,
        rating: p.rating,
        isActive: p.withdrawnFromRound === null,
        createdAt: now,
      }).run();
      entryBySpId.set(p.id, entryId);
    }

    // Rondes, partides i resultats.
    for (const number of roundNumbers) {
      const games = gamesByRound.get(number) ?? [];
      const roundId = uuid();
      tx.insert(rounds).values({
        id: roundId,
        tournamentId,
        phaseId,
        number,
        status: isClosed(number) ? 'closed' : 'open',
        createdAt: now,
      }).run();

      const paired = new Set<string>();
      games.forEach((g, i) => {
        const white = entryBySpId.get(g.white);
        const black = g.black === null ? null : entryBySpId.get(g.black);
        if (!white || (g.black !== null && !black)) {
          warnings.push(`Ronda ${number}: partida ${g.white}-${g.black ?? 'bye'} omesa (jugador desconegut)`);
          return;
        }
        const matchId = uuid();
        tx.insert(matches).values({ id: matchId, roundId, tableNumber: i + 1, createdAt: now }).run();
        matchCount++;
        paired.add(white);

        if (black === null || black === undefined) {
          tx.insert(matchParticipants).values({
            id: uuid(), matchId, entryId: white, seat: 1,
            rank: 1, outcome: 'bye', points: g.whiteMatchPoints || SP_SCORING.byePoints,
          }).run();
          return;
        }
        paired.add(black);
        const sides = [
          { entryId: white, seat: 1, mine: g.whiteMatchPoints, theirs: g.blackMatchPoints, score: g.whiteScore },
          { entryId: black, seat: 2, mine: g.blackMatchPoints, theirs: g.whiteMatchPoints, score: g.blackScore },
        ];
        for (const s of sides) {
          tx.insert(matchParticipants).values({
            id: uuid(), matchId, entryId: s.entryId, seat: s.seat,
            ...(g.played
              ? {
                  rank: s.mine > s.theirs ? 1 : s.mine < s.theirs ? 2 : 1,
                  score: s.score,
                  outcome: outcomeOf(s.mine, s.theirs),
                  points: s.mine,
                }
              : {}),
          }).run();
        }
      });

      for (const entryId of entryBySpId.values()) {
        if (!paired.has(entryId)) tx.insert(roundAbsences).values({ roundId, entryId }).run();
      }
    }
  });

  return {
    tournamentId,
    name,
    players: sp.players.length,
    rounds: roundNumbers.length,
    matches: matchCount,
    warnings,
  };
}
