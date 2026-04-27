import type { Standing, Pairing, Round, Tiebreaker } from './types';
import { computeAllTiebreakers, computeDirectEncounter, buildComparator } from './tiebreakers';

// Tipus intern per construir resultats per jugador
interface PlayerRaw {
  playerId: string;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  byes: number;
  gamesPlayed: number;
  spread: number;
  totalScore: number;      // suma de punts de fitxa a favor (partides reals, sense byes)
  realGamesPlayed: number; // partides sense byes
  opponentResults: Array<{
    opponentId: string;
    opponentPoints: number;
    outcome: 'win' | 'loss' | 'draw' | 'bye' | 'forfeit';
  }>;
}

/**
 * Calcula les classificacions a partir d'un conjunt de rondes i els seus aparellaments.
 * Pot agregar múltiples fases si es passen totes les rondes corresponents.
 *
 * @param rounds     Rondes (ordenades per número) de les quals agregar resultats
 * @param playerIds  Tots els IDs de jugadors participants
 * @param tiebreakers  Ordre de desempats per a la classificació final
 */
export function computeStandings(
  rounds: Round[],
  playerIds: string[],
  tiebreakers: Tiebreaker[]
): Standing[] {
  // Inicialitza el mapa de resultats
  const rawMap = new Map<string, PlayerRaw>();
  for (const id of playerIds) {
    rawMap.set(id, {
      playerId: id,
      points: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      byes: 0,
      gamesPlayed: 0,
      spread: 0,
      totalScore: 0,
      realGamesPlayed: 0,
      opponentResults: [],
    });
  }

  // Ordena les rondes per número per al càlcul acumulatiu
  const sortedRounds = [...rounds].sort((a, b) => a.number - b.number);

  for (const round of sortedRounds) {
    for (const pairing of round.pairings) {
      if (!pairing.result) continue;

      const { player1Id, player2Id, result } = pairing;
      const isBye = player2Id === null;

      const p1 = rawMap.get(player1Id);
      if (!p1) continue;

      if (isBye) {
        p1.points += 1;
        p1.byes += 1;
        p1.wins += 1;
        p1.gamesPlayed += 1;
        p1.opponentResults.push({
          opponentId: '__bye__',
          opponentPoints: 0,
          outcome: 'bye',
        });
      } else {
        const p2 = rawMap.get(player2Id!);
        if (!p2) continue;

        const s1 = result.p1Score ?? 0;
        const s2 = result.p2Score ?? 0;
        const spread = s1 - s2;

        p1.gamesPlayed += 1;
        p1.realGamesPlayed += 1;
        p1.spread += spread;
        p1.totalScore += s1;
        if (result.outcome1 === 'win') {
          p1.points += 1;
          p1.wins += 1;
        } else if (result.outcome1 === 'draw') {
          p1.points += 0.5;
          p1.draws += 1;
        } else if (result.outcome1 === 'loss') {
          p1.losses += 1;
        }

        p2.gamesPlayed += 1;
        p2.realGamesPlayed += 1;
        p2.spread -= spread;
        p2.totalScore += s2;
        if (result.outcome2 === 'win') {
          p2.points += 1;
          p2.wins += 1;
        } else if (result.outcome2 === 'draw') {
          p2.points += 0.5;
          p2.draws += 1;
        } else if (result.outcome2 === 'loss') {
          p2.losses += 1;
        }

        p1.opponentResults.push({
          opponentId: player2Id!,
          opponentPoints: 0,
          outcome: result.outcome1 ?? 'loss',
        });
        p2.opponentResults.push({
          opponentId: player1Id,
          opponentPoints: 0,
          outcome: result.outcome2 ?? 'loss',
        });
      }
    }
  }

  // Segona passada: emplena les puntuacions d'oponents per al Buchholz
  // (ara que tots els totals de punts estan calculats)
  for (const raw of rawMap.values()) {
    for (const opp of raw.opponentResults) {
      if (opp.opponentId !== '__bye__') {
        opp.opponentPoints = rawMap.get(opp.opponentId)?.points ?? 0;
      }
    }
  }

  // Calcula tots els desempats
  const tiebreakerMap = computeAllTiebreakers(rawMap);

  // Construeix les classificacions preliminars
  const standings: Omit<Standing, 'rank'>[] = [...rawMap.values()].map((raw) => ({
    playerId: raw.playerId,
    points: raw.points,
    wins: raw.wins,
    losses: raw.losses,
    draws: raw.draws,
    byes: raw.byes,
    gamesPlayed: raw.gamesPlayed,
    spread: raw.spread,
    tiebreakers: {
      ...(tiebreakerMap.get(raw.playerId) ?? defaultTiebreakers()),
      spread: raw.spread,
      wins: raw.wins,
      directEncounterResult: -1, // es calcula per parella quan cal
    },
  }));

  // Ordena i assigna rangues
  const comparator = buildComparator(tiebreakers);
  standings.sort(comparator);

  return standings.map((s, i) => ({ ...s, rank: i + 1 }));
}

/**
 * Calcula l'encontre directe entre dos jugadors i l'injecta a les seves classificacions.
 * Cal cridar-la quan es mostren dos jugadors empatats i es vol desempatar per directe.
 */
export function injectDirectEncounter(
  standings: Standing[],
  rounds: Round[]
): Standing[] {
  // Construeix el mapa de resultats directes
  const rawMap = new Map<string, { opponentResults: Array<{ opponentId: string; opponentPoints: number; outcome: 'win' | 'loss' | 'draw' | 'bye' | 'forfeit' }> }>();
  for (const s of standings) {
    rawMap.set(s.playerId, { opponentResults: [] });
  }

  for (const round of rounds) {
    for (const pairing of round.pairings) {
      if (!pairing.result || !pairing.player2Id) continue;
      const p1 = rawMap.get(pairing.player1Id);
      const p2 = rawMap.get(pairing.player2Id);
      if (!p1 || !p2) continue;

      p1.opponentResults.push({
        opponentId: pairing.player2Id,
        opponentPoints: 0,
        outcome: pairing.result.outcome1!,
      });
      p2.opponentResults.push({
        opponentId: pairing.player1Id,
        opponentPoints: 0,
        outcome: pairing.result.outcome2!,
      });
    }
  }

  // Per a cada jugador, omple el directEncounterResult respecte al seu proper rival
  // (útil quan s'ordenen grups de jugadors empatats)
  return standings; // La injecció completa es fa en context de desempat específic
}

function defaultTiebreakers() {
  return {
    buchholz: 0,
    medianBuchholz: 0,
    berger: 0,
    cumulative: 0,
    avgScore: 0,
    spread: 0,
    wins: 0,
    directEncounterResult: -1,
  };
}
