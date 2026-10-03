import { and, asc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/db';
import { groups, phases, roundAbsences, rounds, tournaments } from '@/db/schema';
import { DEFAULT_VISIBILITY } from '@/db/types';
import Badge from '@/components/ui/Badge';
import { canManageTournament, getCurrentAccount } from '@/lib/authz';
import { loadEntrants, loadRoundMatches } from '@/lib/db-helpers';
import type { RoundRobinConfig } from '@/lib/pairing/types';
import GenerarAparellaments from './GenerarAparellaments';
import ResultatAparellament from './ResultatAparellament';
import type { PartidaVista } from './ResultatAparellament';
import CsvImportExport from './CsvImportExport';
import AccionsRonda from './AccionsRonda';

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

  const account = await getCurrentAccount();
  const canManage = account ? await canManageTournament(account, id) : false;

  // Una ronda en esborrany no existeix per al jugador (docs/pla-rols.md §8.2).
  if (!canManage && ronda.status === 'draft') notFound();

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  const visibility = tournament?.visibility ?? DEFAULT_VISIBILITY;
  const pairingsVisible = ronda.pairingsVisible ?? visibility.pairingsVisible;
  const resultsVisible = ronda.resultsVisible ?? visibility.resultsVisible;

  // Amb els aparellaments no publicats, per al jugador és com si la ronda no
  // existís encara (mateix tractament que l'esborrany, §8.3).
  if (!canManage && !pairingsVisible) notFound();

  // Amb els resultats no publicats, el jugador veu qui juga contra qui però
  // no els marcadors ni qui ha guanyat: es buiden aquí, no a la pantalla.
  const hideResults = !canManage && !resultsVisible;

  const totes_rondes = await db
    .select()
    .from(rounds)
    .where(eq(rounds.tournamentId, id))
    .orderBy(asc(rounds.number));

  const visibles = canManage ? totes_rondes : totes_rondes.filter((r) => r.status !== 'draft');
  const idxActual = visibles.findIndex((r) => r.id === rid);
  const rondaAnterior = idxActual > 0 ? visibles[idxActual - 1] : null;
  const rondaSeguent =
    idxActual >= 0 && idxActual < visibles.length - 1 ? visibles[idxActual + 1] : null;

  const [fase] = await db.select().from(phases).where(eq(phases.id, ronda.phaseId));

  const [partides, inscrits, tots_grups, absencies_actuals] = await Promise.all([
    loadRoundMatches(rid),
    loadEntrants(id),
    db.select().from(groups).where(eq(groups.tournamentId, id)).orderBy(asc(groups.order)),
    db.select().from(roundAbsences).where(eq(roundAbsences.roundId, rid)),
  ]);

  const [ronda_anterior] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.tournamentId, id), eq(rounds.number, ronda.number - 1)));

  const absencies_anteriors = ronda_anterior
    ? await db.select().from(roundAbsences).where(eq(roundAbsences.roundId, ronda_anterior.id))
    : [];

  const nomPerEntry = new Map(inscrits.map((e) => [e.id, e.displayName]));
  const grupPerEntry = new Map(inscrits.map((e) => [e.id, e.groupId ?? null]));

  // El bye no amaga res (és un fet de calendari, no un resultat): només es
  // buiden les taules amb més d'un jugador.
  const vistes: PartidaVista[] = partides.map((partida) => ({
    id: partida.id,
    tableNumber: partida.tableNumber,
    participants: partida.participants.map((participant) => ({
      entryId: participant.entryId,
      displayName: nomPerEntry.get(participant.entryId) ?? '?',
      score: hideResults && partida.participants.length > 1 ? null : participant.score,
      rank: hideResults && partida.participants.length > 1 ? null : participant.rank,
    })),
  }));

  const jugables = vistes.filter((p) => p.participants.length > 1);
  const byes = vistes.filter((p) => p.participants.length === 1);
  const jugades = jugables.filter((p) => p.participants.every((x) => x.rank !== null)).length;
  const totals = jugables.length;

  // Round robin dins de cada grup: les taules s'agrupen per grup.
  const faseConfig = fase?.config as RoundRobinConfig | undefined;
  const agrupat =
    fase?.method === 'round_robin' && faseConfig?.scope === 'intra_group' && tots_grups.length > 0;

  const partidesPerGrup = agrupat
    ? (() => {
        const byGrup = new Map<string | null, PartidaVista[]>();
        for (const partida of vistes) {
          const gid = grupPerEntry.get(partida.participants[0]?.entryId ?? '') ?? null;
          byGrup.set(gid, [...(byGrup.get(gid) ?? []), partida]);
        }
        const result = tots_grups
          .map((g) => ({ grupId: g.id, grupName: g.name, partides: byGrup.get(g.id) ?? [] }))
          .filter((x) => x.partides.length > 0);
        const sense_grup = byGrup.get(null) ?? [];
        if (sense_grup.length > 0) {
          result.push({ grupId: null as unknown as string, grupName: 'Sense grup', partides: sense_grup });
        }
        return result;
      })()
    : null;

  const tancada = ronda.status === 'closed';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href={`/campionat/${id}/rondes`} className="text-sm text-ink-3 hover:text-accent-ink">
          ← Rondes
        </Link>
        <div className="flex items-center gap-1">
          {rondaAnterior ? (
            <Link
              href={`/campionat/${id}/rondes/${rondaAnterior.id}`}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm text-ink-2 hover:bg-surface-2 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Ronda {rondaAnterior.number}
            </Link>
          ) : (
            <span />
          )}
          {rondaSeguent ? (
            <Link
              href={`/campionat/${id}/rondes/${rondaSeguent.id}`}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm text-ink-2 hover:bg-surface-2 transition-colors"
            >
              Ronda {rondaSeguent.number}
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 sm:space-y-0 sm:flex sm:items-start sm:justify-between sm:gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-display text-xl font-bold text-ink">Ronda {ronda.number}</h2>
            {tancada ? (
              <Badge color="green">Tancada</Badge>
            ) : ronda.status === 'draft' ? (
              <Badge color="gray">Esborrany</Badge>
            ) : totals === 0 ? (
              <Badge color="yellow">Sense aparellaments</Badge>
            ) : jugades === totals ? (
              <Badge color="blue">Totes jugades</Badge>
            ) : (
              <Badge color="yellow">En curs</Badge>
            )}
          </div>
          <p className="text-sm text-ink-3 mt-0.5">{fase?.name}</p>
          {hideResults && totals > 0 && (
            <p className="text-xs text-accent-ink bg-accent-tint rounded-lg px-2.5 py-1 mt-1.5 inline-block">
              Els resultats d&apos;aquesta ronda encara no són públics.
            </p>
          )}
        </div>
        {totals > 0 && (
          <div className="sm:text-right sm:w-40 sm:flex-shrink-0">
            <p className="text-xs text-ink-3 mb-1.5 tabular-nums">
              {jugades} / {totals} jugades
            </p>
            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${totals > 0 ? Math.round((jugades / totals) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {totals > 0 && (
          <CsvImportExport
            tournamentId={id}
            roundId={rid}
            roundNumber={ronda.number}
            rondaTancada={tancada}
          />
        )}
        <AccionsRonda
          tournamentId={id}
          roundId={rid}
          estat={ronda.status}
          teAparellaments={totals > 0}
          teResultats={jugades > 0}
          resultatsPublics={ronda.resultsVisible ?? null}
        />
      </div>

      {totals === 0 && !tancada && (
        <GenerarAparellaments
          tournamentId={id}
          roundId={rid}
          roundNumber={ronda.number}
          method={fase?.method ?? 'manual'}
          participantsPerMatch={fase?.participantsPerMatch ?? 2}
          players={inscrits
            .filter((e) => e.isActive)
            .map((e) => ({ id: e.id, name: e.displayName, rating: e.rating ?? null }))}
          previousAbsentIds={absencies_anteriors.map((a) => a.entryId)}
        />
      )}

      {vistes.length > 0 &&
        (agrupat && partidesPerGrup ? (
          <div className="space-y-5">
            {partidesPerGrup.map(({ grupId, grupName, partides: delGrup }) => {
              const reals = delGrup.filter((p) => p.participants.length > 1);
              const byesGrup = delGrup.filter((p) => p.participants.length === 1);
              return (
                <div key={grupId ?? '__sense_grup'}>
                  <h3 className="text-xs font-semibold text-ink-3 uppercase tracking-wide px-1 mb-2">
                    Grup {grupName}
                  </h3>
                  <div className="space-y-2">
                    {reals.map((partida) => (
                      <ResultatAparellament
                        key={partida.id}
                        partida={partida}
                        tournamentId={id}
                        roundId={rid}
                        rondaTancada={tancada}
                      />
                    ))}
                  </div>
                  {byesGrup.length > 0 && (
                    <p className="text-xs text-ink-3 px-1 mt-2">
                      Bye: {byesGrup.map((p) => p.participants[0]?.displayName).join(', ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {vistes.map((partida) => (
              <ResultatAparellament
                key={partida.id}
                partida={partida}
                tournamentId={id}
                roundId={rid}
                rondaTancada={tancada}
              />
            ))}
          </div>
        ))}

      {!agrupat && byes.length > 0 && (
        <div className="text-xs text-ink-3 px-1">
          Byes: {byes.map((p) => p.participants[0]?.displayName).join(', ')}
        </div>
      )}

      {absencies_actuals.length > 0 && (
        <div className="text-xs text-ink-3 px-1">
          Absents: {absencies_actuals.map((a) => nomPerEntry.get(a.entryId) ?? '?').join(', ')}
        </div>
      )}
    </div>
  );
}
