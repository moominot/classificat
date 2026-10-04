import { and, asc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/db';
import { phases, roundAbsences, rounds, tournaments } from '@/db/schema';
import { DEFAULT_VISIBILITY } from '@/db/types';
import Badge from '@/components/ui/Badge';
import { canManageTournament, getCurrentAccount } from '@/lib/authz';
import { loadEntrants, loadRoundMatches, loadTags } from '@/lib/db-helpers';
import { loadPendingPolicy, loadPresence } from '@/lib/presence';
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

  const [partides, inscrits, totes_etiquetes, absencies_actuals] = await Promise.all([
    loadRoundMatches(rid),
    loadEntrants(id),
    loadTags(id),
    db.select().from(roundAbsences).where(eq(roundAbsences.roundId, rid)),
  ]);

  const [ronda_anterior] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.tournamentId, id), eq(rounds.number, ronda.number - 1)));

  const absencies_anteriors = ronda_anterior
    ? await db.select().from(roundAbsences).where(eq(roundAbsences.roundId, ronda_anterior.id))
    : [];

  // Qui ha dit que juga aquesta ronda (el botó d'home mort). Només compta
  // mentre no hi ha aparellaments: després ja no canvia res.
  const [presencia, presenciaPendents] =
    canManage && partides.length === 0 && ronda.status !== 'closed'
      ? await Promise.all([loadPresence(id, ronda.number), loadPendingPolicy(id)])
      : [new Map(), 'present' as const];

  const nomPerEntry = new Map(inscrits.map((e) => [e.id, e.displayName]));
  const tagsPerEntry = new Map(inscrits.map((e) => [e.id, e.tagIds]));
  const tagNameById = new Map(totes_etiquetes.map((t) => [t.id, t.name]));

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

  // Round robin intra-etiqueta: les taules s'agrupen per etiqueta (Fase 2 de
  // la migració grups→etiquetes, docs/pla-rols.md §13.1 #8).
  const faseConfig = fase?.config as RoundRobinConfig | undefined;
  const etiquetesFase = faseConfig?.tagIds ?? [];
  const agrupat = fase?.method === 'round_robin' && faseConfig?.scope === 'intra_tag' && etiquetesFase.length > 0;

  function etiquetaDe(entryId: string): string | null {
    const seves = tagsPerEntry.get(entryId) ?? [];
    return etiquetesFase.find((t) => seves.includes(t)) ?? null;
  }

  const partidesPerGrup = agrupat
    ? (() => {
        const byTag = new Map<string | null, PartidaVista[]>();
        for (const partida of vistes) {
          const tid = etiquetaDe(partida.participants[0]?.entryId ?? '');
          byTag.set(tid, [...(byTag.get(tid) ?? []), partida]);
        }
        const result = etiquetesFase
          .map((tid) => ({ grupId: tid, grupName: tagNameById.get(tid) ?? '?', partides: byTag.get(tid) ?? [] }))
          .filter((x) => x.partides.length > 0);
        const sense_etiqueta = byTag.get(null) ?? [];
        if (sense_etiqueta.length > 0) {
          result.push({ grupId: null as unknown as string, grupName: 'Sense etiqueta', partides: sense_etiqueta });
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

      <div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
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
          {totals > 0 && (
            <span className="text-xs text-ink-3 tabular-nums">
              {jugades} / {totals} jugades
            </span>
          )}
        </div>
        {hideResults && totals > 0 && (
          <p className="text-xs text-accent-ink bg-accent-tint rounded-lg px-2.5 py-1 mt-1.5 inline-block">
            Els resultats d&apos;aquesta ronda encara no són públics.
          </p>
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
          esUltima={!totes_rondes.some((r) => r.number > ronda.number)}
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
          presencia={Object.fromEntries([...presencia].map(([k, v]) => [k, v.status]))}
          pendentsCompten={presenciaPendents}
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
                    {grupName}
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
