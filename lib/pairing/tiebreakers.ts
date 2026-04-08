import type { Standing, Tiebreaker, TiebreakerValues } from './types';

/**
 * Obté el valor d'un desempat per a una classificació donada.
 */
type StandingLike = Pick<Standing, 'points' | 'tiebreakers'>;

export function getTiebreakerValue(standing: StandingLike, tb: Tiebreaker): number {
  switch (tb) {
    case 'buchholz':
      return standing.tiebreakers.buchholz;
    case 'median_buchholz':
      return standing.tiebreakers.medianBuchholz;
    case 'berger':
      return standing.tiebreakers.berger;
    case 'cumulative':
      return standing.tiebreakers.cumulative;
    case 'spread':
      return standing.tiebreakers.spread;
    case 'wins':
      return standing.tiebreakers.wins;
    case 'direct_encounter':
      return standing.tiebreakers.directEncounterResult;
  }
}

/**
 * Construeix un comparador compost a partir de la llista de desempats configurada.
 * Primer criteri sempre és `points`, després els desempats en ordre.
 */
export function buildComparator(tiebreakers: Tiebreaker[]) {
  return (a: Pick<Standing, 'points' | 'tiebreakers'>, b: Pick<Standing, 'points' | 'tiebreakers'>): number => {
    if (b.points !== a.points) return b.points - a.points;
    for (const tb of tiebreakers) {
      const diff = getTiebreakerValue(b, tb) - getTiebreakerValue(a, tb);
      if (Math.abs(diff) > 1e-9) return diff;
    }
    return 0;
  };
}

// ─── Càlcul de desempats a partir de resultats bruts ─────────────────────────

interface PlayerResultMap {
  playerId: string;
  points: number;
  wins: number;
  opponentResults: Array<{ opponentId: string; opponentPoints: number; outcome: 'win' | 'loss' | 'draw' | 'bye' | 'forfeit' }>;
  cumulativePoints: number[]; // punts acumulats al final de cada ronda [ronda1, ronda2, ...]
}

/**
 * Calcula tots els valors de desempat a partir del mapa de resultats per jugador.
 * Retorna un Map<playerId, TiebreakerValues>.
 */
export function computeAllTiebreakers(
  results: Map<string, PlayerResultMap>
): Map<string, TiebreakerValues> {
  const out = new Map<string, TiebreakerValues>();

  for (const [playerId, r] of results) {
    // Buchholz: suma de punts dels oponents
    const opponentScores = r.opponentResults
      .filter((o) => o.opponentId !== '__bye__')
      .map((o) => o.opponentPoints);

    const buchholz = opponentScores.reduce((acc, s) => acc + s, 0);

    // Median Buchholz: Buchholz sense el millor ni el pitjor oponent
    let medianBuchholz = buchholz;
    if (opponentScores.length >= 3) {
      const sorted = [...opponentScores].sort((a, b) => a - b);
      medianBuchholz = sorted.slice(1, -1).reduce((acc, s) => acc + s, 0);
    }

    // Berger (Sonneborn-Berger): suma de punts dels oponents batuts + 0.5 * oponents amb empat
    const berger = r.opponentResults.reduce((acc, o) => {
      if (o.outcome === 'win') return acc + o.opponentPoints;
      if (o.outcome === 'draw') return acc + o.opponentPoints * 0.5;
      return acc;
    }, 0);

    // Cumulative: suma acumulada de punts per ronda
    const cumulative = r.cumulativePoints.reduce((acc, pts) => acc + pts, 0);

    out.set(playerId, {
      buchholz,
      medianBuchholz,
      berger,
      cumulative,
      spread: 0, // s'omple a standings.ts on es té la info de puntuació Scrabble
      wins: r.wins,
      directEncounterResult: -1, // s'omple per parella a standings.ts
    });
  }

  return out;
}

/**
 * Calcula el resultat de l'encontre directe entre dos jugadors donats.
 * Busca en els resultats d'A si B és entre els seus oponents.
 */
export function computeDirectEncounter(
  playerAId: string,
  playerBId: string,
  results: Map<string, PlayerResultMap>
): number {
  const a = results.get(playerAId);
  if (!a) return -1;

  const enc = a.opponentResults.find((o) => o.opponentId === playerBId);
  if (!enc) return -1;

  if (enc.outcome === 'win') return 1;
  if (enc.outcome === 'draw') return 0.5;
  if (enc.outcome === 'loss') return 0;
  return -1;
}
