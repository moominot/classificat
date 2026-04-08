import { db } from '@/db';
import { rounds, pairings, players, phases } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Badge from '@/components/ui/Badge';
import GenerarAparellaments from './GenerarAparellaments';
import ResultatAparellament from './ResultatAparellament';

export const dynamic = 'force-dynamic';

export default async function RondaPage({
  params,
}: {
  params: Promise<{ id: string; rid: string }>;
}) {
  const { id, rid } = await params;

  const [ronda] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.id, rid), eq(rounds.tournamentId, id)));

  if (!ronda) notFound();

  const [fase] = await db.select().from(phases).where(eq(phases.id, ronda.phaseId));
  const tots_aparellaments = await db
    .select()
    .from(pairings)
    .where(eq(pairings.roundId, rid));

  // Enriqueix amb noms de jugadors
  const tots_jugadors = await db.select().from(players).where(eq(players.tournamentId, id));
  const playerMap = new Map(tots_jugadors.map(p => [p.id, p.name]));

  const aparellaments_enriquits = tots_aparellaments
    .sort((a, b) => a.tableNumber - b.tableNumber)
    .map(p => ({
      ...p,
      player1Name: playerMap.get(p.player1Id) ?? '?',
      player2Name: p.player2Id ? (playerMap.get(p.player2Id) ?? '?') : null,
    }));

  const jugades = aparellaments_enriquits.filter(p => p.outcome1 !== null && p.outcome1 !== 'bye').length;
  const totals = aparellaments_enriquits.filter(p => p.player2Id !== null).length;

  return (
    <div className="space-y-5">
      {/* Capçalera */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href={`/campionat/${id}/rondes`} className="text-sm text-gray-400 hover:text-gray-600">
              ← Rondes
            </Link>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Ronda {ronda.number}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {fase?.name} · {jugades}/{totals} partides jugades
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ronda.isComplete ? (
            <Badge color="green">Tancada</Badge>
          ) : totals === 0 ? (
            <Badge color="yellow">Sense aparellaments</Badge>
          ) : jugades === totals ? (
            <Badge color="blue">Totes jugades</Badge>
          ) : (
            <Badge color="yellow">En curs</Badge>
          )}
        </div>
      </div>

      {/* Genera aparellaments si no n'hi ha */}
      {totals === 0 && !ronda.isComplete && (
        <GenerarAparellaments
          tournamentId={id}
          roundId={rid}
          roundNumber={ronda.number}
        />
      )}

      {/* Llista d'aparellaments */}
      {aparellaments_enriquits.length > 0 && (
        <div className="space-y-2">
          {aparellaments_enriquits.map(ap => (
            <ResultatAparellament
              key={ap.id}
              aparellament={ap}
              tournamentId={id}
              roundId={rid}
              rondaTancada={ronda.isComplete}
            />
          ))}
        </div>
      )}

      {/* Byes */}
      {aparellaments_enriquits.filter(p => p.player2Id === null).length > 0 && (
        <div className="text-xs text-gray-400 px-1">
          Byes: {aparellaments_enriquits
            .filter(p => p.player2Id === null)
            .map(p => p.player1Name)
            .join(', ')}
        </div>
      )}
    </div>
  );
}
