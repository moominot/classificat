import { db } from '@/db';
import { rounds, pairings, players, phases, roundAbsences, groups } from '@/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Badge from '@/components/ui/Badge';
import GenerarAparellaments from './GenerarAparellaments';
import ResultatAparellament from './ResultatAparellament';
import CsvImportExport from './CsvImportExport';
import AccionsRonda from './AccionsRonda';
import type { RoundRobinConfig } from '@/lib/pairing/types';

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

  const tots_grups = await db.select().from(groups).where(eq(groups.tournamentId, id)).orderBy(asc(groups.order));

  // Absències de la ronda actual i de l'anterior (per pre-omplir)
  const absencies_actuals = await db
    .select()
    .from(roundAbsences)
    .where(eq(roundAbsences.roundId, rid));

  const [ronda_anterior] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.tournamentId, id), eq(rounds.number, ronda.number - 1)));

  const absencies_anteriors = ronda_anterior
    ? await db.select().from(roundAbsences).where(eq(roundAbsences.roundId, ronda_anterior.id))
    : [];
  const playerMap = new Map(tots_jugadors.map(p => [p.id, p.name]));
  const playerGrupMap = new Map(tots_jugadors.map(p => [p.id, p.groupId ?? null]));
  const grupNomMap = new Map(tots_grups.map(g => [g.id, g.name]));

  const aparellaments_enriquits = tots_aparellaments
    .sort((a, b) => a.tableNumber - b.tableNumber)
    .map(p => ({
      ...p,
      player1Name: playerMap.get(p.player1Id) ?? '?',
      player2Name: p.player2Id ? (playerMap.get(p.player2Id) ?? '?') : null,
    }));

  const jugades = aparellaments_enriquits.filter(p => p.outcome1 !== null && p.outcome1 !== 'bye').length;
  const totals = aparellaments_enriquits.filter(p => p.player2Id !== null).length;

  // Agrupa aparellaments per grup si la fase és Round Robin intra-grupal
  const faseConfig = fase?.config as RoundRobinConfig | undefined;
  const agrupat = fase?.method === 'round_robin'
    && faseConfig?.scope === 'intra_group'
    && tots_grups.length > 0;

  const aparellamentsByGrup = agrupat ? (() => {
    const byGrup = new Map<string | null, typeof aparellaments_enriquits>();
    for (const ap of aparellaments_enriquits) {
      const gid = playerGrupMap.get(ap.player1Id) ?? null;
      if (!byGrup.has(gid)) byGrup.set(gid, []);
      byGrup.get(gid)!.push(ap);
    }
    const result = tots_grups
      .map(g => ({ grupId: g.id, grupName: g.name, aparellaments: byGrup.get(g.id) ?? [] }))
      .filter(x => x.aparellaments.length > 0);
    const sense_grup = byGrup.get(null) ?? [];
    if (sense_grup.length > 0) result.push({ grupId: null as unknown as string, grupName: 'Sense grup', aparellaments: sense_grup });
    return result;
  })() : null;

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

      {/* Accions de gestió */}
      <div className="flex flex-wrap items-center gap-2">
        {totals > 0 && (
          <CsvImportExport
            tournamentId={id}
            roundId={rid}
            roundNumber={ronda.number}
            rondaTancada={ronda.isComplete}
          />
        )}
        <AccionsRonda
          tournamentId={id}
          roundId={rid}
          rondaTancada={ronda.isComplete}
          teAparellaments={totals > 0}
          teResultats={jugades > 0}
        />
      </div>

      {/* Genera aparellaments si no n'hi ha */}
      {totals === 0 && !ronda.isComplete && (
        <GenerarAparellaments
          tournamentId={id}
          roundId={rid}
          roundNumber={ronda.number}
          players={tots_jugadors.filter(p => p.isActive).map(p => ({ id: p.id, name: p.name, rating: p.rating ?? null }))}
          previousAbsentIds={absencies_anteriors.map(a => a.playerId)}
        />
      )}

      {/* Llista d'aparellaments */}
      {aparellaments_enriquits.length > 0 && (
        agrupat && aparellamentsByGrup ? (
          <div className="space-y-5">
            {aparellamentsByGrup.map(({ grupId, grupName, aparellaments: aps }) => {
              const reals = aps.filter(ap => ap.player2Id !== null);
              const byes  = aps.filter(ap => ap.player2Id === null);
              return (
                <div key={grupId ?? '__sense_grup'}>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">
                    Grup {grupName}
                  </h3>
                  <div className="space-y-2">
                    {reals.map(ap => (
                      <ResultatAparellament
                        key={ap.id}
                        aparellament={ap}
                        tournamentId={id}
                        roundId={rid}
                        rondaTancada={ronda.isComplete}
                      />
                    ))}
                  </div>
                  {byes.length > 0 && (
                    <p className="text-xs text-gray-400 px-1 mt-2">
                      Bye: {byes.map(ap => ap.player1Name).join(', ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
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
        )
      )}

      {/* Byes (vista plana, sense agrupació) */}
      {!agrupat && aparellaments_enriquits.filter(p => p.player2Id === null).length > 0 && (
        <div className="text-xs text-gray-400 px-1">
          Byes: {aparellaments_enriquits
            .filter(p => p.player2Id === null)
            .map(p => p.player1Name)
            .join(', ')}
        </div>
      )}

      {/* Absències */}
      {absencies_actuals.length > 0 && (
        <div className="text-xs text-gray-400 px-1">
          Absents: {absencies_actuals
            .map(a => playerMap.get(a.playerId) ?? '?')
            .join(', ')}
        </div>
      )}
    </div>
  );
}
