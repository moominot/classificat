import { asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db';
import { phases, questionDefinitions, rounds, teams } from '@/db/schema';
import { Card } from '@/components/ui/Card';
import { canManageTournament, getCurrentAccount } from '@/lib/authz';
import {
  loadCombinedMatchRanking,
  loadEntrantsWithContact,
  loadMetricHistory,
  loadTags,
  loadVisibleRoundIds,
} from '@/lib/db-helpers';
import { loadStandings } from '@/lib/standings-service';
import { resolveTiebreaker } from '@/lib/pairing/tiebreakers';
import RanquingMetrica from './RanquingMetrica';
import ClassificacioGeneral from './ClassificacioGeneral';
import RanquingPartidaConjunta from './RanquingPartidaConjunta';
import FiltresClassificacio from './FiltresClassificacio';

export const dynamic = 'force-dynamic';

/**
 * Classificació.
 *
 * Les columnes ja no són una llista fixa d'Scrabble: surten de les preguntes
 * amb agregació i de les mètriques estructurals (docs/pla-rols.md §12.1 i
 * §13.1 #7). Afegir "bingos" al rànquing és configurar una pregunta, no tocar
 * aquesta pàgina.
 */

const METRIC_LABELS: Record<string, string> = {
  wins: 'Victòries',
  spread: 'Spread',
  total_score: 'Punts a favor',
};

const MODE_PUBLIC: Record<string, string> = {
  live: 'la classificació en temps real',
  closed_rounds: 'només les rondes tancades (i les fases en temps real)',
  frozen_at: 'la classificació congelada',
  hidden: 'cap classificació',
};

const MODE_NOTICE: Record<string, string> = {
  frozen_at: 'La classificació està congelada: no inclou les últimes rondes.',
};

export default async function ClassificacioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);

  const account = await getCurrentAccount();
  const esAdmin = account ? await canManageTournament(account, id) : false;
  // L'admin ho veu tot en temps real, i així no podria comprovar què veuen
  // els jugadors: amb `?v=jugador` la classificació es calcula com per a ells.
  const veureComJugador = esAdmin && sp.v === 'jugador';
  const canManage = esAdmin && !veureComJugador;

  const [totes_fases, totesPreguntes, totesEtiquetes, vistaCompleta, totes_rondes, entrants, totsEquips] = await Promise.all([
    db.select().from(phases).where(eq(phases.tournamentId, id)).orderBy(asc(phases.order)),
    db
      .select()
      .from(questionDefinitions)
      .where(eq(questionDefinitions.tournamentId, id))
      .orderBy(asc(questionDefinitions.order)),
    loadTags(id),
    loadStandings(id, { canManage }),
    db
      .select({ id: rounds.id, number: rounds.number, phaseId: rounds.phaseId })
      .from(rounds)
      .where(eq(rounds.tournamentId, id))
      .orderBy(asc(rounds.number)),
    loadEntrantsWithContact(id),
    db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.tournamentId, id)).orderBy(asc(teams.name)),
  ]);

  // Club i BARRUF per jugador, per al cercador — són públics (ja es veuen a
  // la fitxa de cada jugador), no cal gestionar-los perquè apareguin aquí.
  const nomPerEntry = new Map(entrants.map((e) => [e.id, e.displayName]));
  const infoPerEntry = new Map(entrants.map((e) => [e.id, { club: e.club, rating: e.rating }]));

  // Filtre per fase: només té sentit oferir-lo quan n'hi ha més d'una i ja
  // s'ha jugat alguna cosa visible — amb una de sola, "per fases" i "general"
  // dirien el mateix, i sense partides és una pestanya buida. Viu al modal de
  // filtres, no en un selector propi.
  const mostrarFasesFiltre = totes_fases.length > 1 && vistaCompleta.standings.some((s) => s.gamesPlayed > 0);
  const faseSeleccionada =
    mostrarFasesFiltre && totes_fases.some((f) => f.id === sp.f) ? (sp.f as string) : null;

  // Classificació ronda a ronda: les rondes navegables són les que ja
  // alimenten la classificació vista (mateix criteri de visibilitat que
  // `vistaCompleta`, que no depèn de la fase/ronda triades). "Sense triar"
  // equival a la darrera ronda disponible — no hi ha un estat "general"
  // separat, perquè seria exactament el mateix que la darrera ronda.
  const rondesVisiblesIds = vistaCompleta.mode === 'closed_rounds' ? await loadVisibleRoundIds(id, vistaCompleta.livePhaseIds) : null;
  const rondesDisponibles = (
    rondesVisiblesIds
      ? totes_rondes.filter((r) => rondesVisiblesIds.has(r.id))
      : vistaCompleta.mode === 'frozen_at' && vistaCompleta.frozenRound !== null
        ? totes_rondes.filter((r) => r.number <= vistaCompleta.frozenRound!)
        : totes_rondes
  )
    .map((r) => r.number)
    .sort((a, b) => a - b);
  const maxRonda = rondesDisponibles.length > 0 ? rondesDisponibles[rondesDisponibles.length - 1] : 0;
  const rondaSeleccionadaRaw = sp.r ? parseInt(sp.r, 10) : null;
  const rondaSeleccionada =
    rondaSeleccionadaRaw !== null && rondesDisponibles.includes(rondaSeleccionadaRaw) ? rondaSeleccionadaRaw : null;
  const rondaEfectiva = rondaSeleccionada ?? maxRonda;
  const mostrarRondaNav = rondesDisponibles.length > 1;

  const vista =
    faseSeleccionada !== null || rondaSeleccionada !== null
      ? await loadStandings(id, {
          canManage,
          phaseId: faseSeleccionada ?? undefined,
          upToRound: rondaSeleccionada ?? undefined,
        })
      : vistaCompleta;

  if (!vista.visible) {
    return (
      <div className="text-center py-20 text-ink-3">
        <p className="text-sm">La classificació encara no està publicada.</p>
      </div>
    );
  }

  if (totes_fases.length === 0 || vista.standings.length === 0) {
    return (
      <div className="text-center py-20 text-ink-3">
        <p className="text-sm">Calen jugadors i fases configurades per veure la classificació.</p>
      </div>
    );
  }

  // Cercador per nom/club, per BARRUF (menys de X o més de X — una franja de
  // nivell, no un número exacte) i per etiquetes (ha de tenir-les totes, no
  // n'hi ha prou amb una). Tot per querystring: cap component client
  // necessari i els enllaços de pestanya/fase el poden arrossegar igual.
  const cerca = (sp.q ?? '').trim().toLowerCase();
  const barrufComparador = sp.br === 'lt' || sp.br === 'gt' ? sp.br : null;
  const barrufValor = barrufComparador && sp.bv && !Number.isNaN(Number(sp.bv)) ? Number(sp.bv) : null;
  const tagsSeleccionades = (sp.tags ?? '').split(',').filter(Boolean);
  const equipSeleccionat = totsEquips.some((e) => e.id === sp.eq) ? (sp.eq as string) : null;
  const hiHaFiltre = equipSeleccionat !== null || cerca.length > 0 || barrufValor !== null || tagsSeleccionades.length > 0;

  function passaFiltre(entryId: string, displayName: string, tagIds: string[], teamId: string | null): boolean {
    if (equipSeleccionat && teamId !== equipSeleccionat) return false;
    const info = infoPerEntry.get(entryId);
    if (cerca && !`${displayName} ${info?.club ?? ''}`.toLowerCase().includes(cerca)) return false;
    if (barrufValor !== null) {
      if (info?.rating == null) return false;
      if (barrufComparador === 'lt' && !(info.rating < barrufValor)) return false;
      if (barrufComparador === 'gt' && !(info.rating > barrufValor)) return false;
    }
    if (tagsSeleccionades.length > 0 && !tagsSeleccionades.every((t) => tagIds.includes(t))) return false;
    return true;
  }

  const standingsFiltrats = hiHaFiltre
    ? vista.standings.filter((s) => passaFiltre(s.entryId, s.displayName, s.tagIds, s.teamId))
    : vista.standings;

  // Mètriques que tenen pestanya pròpia: les preguntes marcades per al
  // rànquing (Bingos, Millor jugada...), no els desempats configurats.
  const metriquesRanquing = totesPreguntes
    .filter((q) => q.showInRanking && q.aggregate !== 'none')
    .map((q) => q.key);

  const etiqueta = (key: string) =>
    METRIC_LABELS[key] ?? totesPreguntes.find((q) => q.key === key)?.label ?? key;

  // Les columnes de la classificació general són els desempats configurats a
  // la fase (l'última si no se n'ha triat cap, com fa el motor per decidir
  // l'ordre — vegeu lib/standings-service.ts), en el seu ordre: expliquen
  // per què algú va davant d'un altre. L'encontre directe queda fora perquè
  // no té un valor absolut per jugador, només dins d'un bloc d'empatats (§11.3).
  const faseReferencia = faseSeleccionada
    ? (totes_fases.find((f) => f.id === faseSeleccionada) ?? null)
    : (totes_fases[totes_fases.length - 1] ?? null);
  const desempatsGeneral = (faseReferencia?.tiebreakers ?? [])
    .map((key) => ({ key, def: resolveTiebreaker(key) }))
    .filter((d) => d.def?.compute)
    .map((d) => ({ key: d.key, label: d.def!.label }));

  // "Millor partida conjunta" va just després de "Millor jugada" (best_word)
  // si existeix com a pestanya; si no, al final de les mètriques — mai abans
  // de General ni enmig d'elles arbitràriament.
  const metriquesPestanyes = metriquesRanquing.map((key) => ({ id: key, label: etiqueta(key) }));
  const indexMillorJugada = metriquesPestanyes.findIndex((p) => p.id === 'best_word');
  const posicioPartidaConjunta = indexMillorJugada >= 0 ? indexMillorJugada + 1 : metriquesPestanyes.length;
  metriquesPestanyes.splice(posicioPartidaConjunta, 0, { id: 'partida-conjunta', label: 'Millor partida conjunta' });

  const PESTANYES: { id: string; label: string }[] = [
    { id: 'general', label: 'General' },
    ...metriquesPestanyes,
    ...(vista.teamStandings ? [{ id: 'equips', label: 'Equips' }] : []),
  ];
  const pestanya = PESTANYES.some((p) => p.id === sp.t) ? sp.t : 'general';

  // L'historial (una fila per ronda jugada) només cal per a la pestanya
  // d'una mètrica concreta: és l'única que en treu profit (§15.3).
  const preguntaActiva = totesPreguntes.find((q) => q.key === pestanya) ?? null;
  const historial = preguntaActiva
    ? await loadMetricHistory(id, pestanya, {
        onlyClosedRounds: vista.mode === 'closed_rounds',
        livePhaseIds: vista.livePhaseIds,
        upToRound: rondaSeleccionada ?? undefined,
        phaseIds: faseSeleccionada ? [faseSeleccionada] : undefined,
      })
    : new Map();

  // Mateix filtre de rondes/fase que la resta de pestanyes, només calculat
  // quan es consulta — és una pestanya més, no part de la classificació
  // general.
  const partidesConjuntes =
    pestanya === 'partida-conjunta'
      ? await loadCombinedMatchRanking(id, {
          onlyClosedRounds: vista.mode === 'closed_rounds',
          livePhaseIds: vista.livePhaseIds,
          upToRound:
            rondaSeleccionada ??
            (vista.mode === 'frozen_at' && vista.frozenRound !== null ? vista.frozenRound : undefined),
          phaseIds: faseSeleccionada ? [faseSeleccionada] : undefined,
        })
      : [];

  // Quines rondes alimenten la classificació que s'està veient — útil quan el
  // director manté la incògnita de resultats fins al final i la xifra de
  // "només compten les tancades" per si sola no diu quines. Mateix criteri
  // que les dades (tancada i amb resultats publicats), no només l'estat
  // (docs/pla-rols.md §8.2) — si no, el missatge podia dir que una ronda
  // compta quan el director l'havia amagat explícitament.
  const rondesVisibles = rondesVisiblesIds
    ? totes_rondes.filter((r) => rondesVisiblesIds.has(r.id) && (rondaSeleccionada === null || r.number <= rondaSeleccionada)).map((r) => r.number)
    : [];
  const avisRondes =
    vista.mode === 'closed_rounds'
      ? rondesVisibles.length === 0
        ? 'Encara no hi ha cap ronda tancada.'
        : `Compten les rondes: ${rondesVisibles.join(', ')}.`
      : null;
  const avis = MODE_NOTICE[vista.mode];

  // Per fases: amb el mode "rondes tancades", cada fase decideix si hi compta
  // també la ronda oberta. Sense dir-ho, dues classificacions idèntiques
  // semblarien una sola cosa (i l'admin, que ho veu tot en temps real, no
  // veuria cap diferència).
  const fasesEnTempsReal = totes_fases.filter((f) => vista.livePhaseIds.includes(f.id)).map((f) => f.name);
  const avisFases =
    vista.mode === 'closed_rounds' && fasesEnTempsReal.length > 0
      ? `En temps real: ${fasesEnTempsReal.join(', ')}. La resta de fases, només rondes tancades.`
      : null;
  const avisAdmin =
    esAdmin && !veureComJugador && vista.publicMode !== 'live'
      ? `Vista d'administrador: es mostra tot en temps real. Els jugadors veuen ${MODE_PUBLIC[vista.publicMode]}.`
      : null;

  // Un únic constructor d'enllaç perquè pestanya/ronda/fase/cerca es puguin
  // combinar sense que triar-ne un esborri els altres.
  function hrefFor(overrides: { t?: string; f?: string | null; r?: number | null; v?: 'jugador' | null; clearFilters?: boolean }) {
    const vistaJugador = overrides.v !== undefined ? overrides.v === 'jugador' : veureComJugador;
    const params = new URLSearchParams();
    const t = overrides.t ?? pestanya;
    const f = overrides.f !== undefined ? overrides.f : overrides.clearFilters ? null : faseSeleccionada;
    const r = overrides.r !== undefined ? overrides.r : rondaSeleccionada;
    if (t && t !== 'general') params.set('t', t);
    if (f) params.set('f', f);
    if (r !== null && r !== maxRonda) params.set('r', String(r));
    if (vistaJugador) params.set('v', 'jugador');
    if (!overrides.clearFilters) {
      if (sp.q) params.set('q', sp.q);
      if (sp.br) params.set('br', sp.br);
      if (sp.bv) params.set('bv', sp.bv);
      if (sp.tags) params.set('tags', sp.tags);
      if (sp.eq) params.set('eq', sp.eq);
    }
    const qs = params.toString();
    return `/campionat/${id}/classificacio${qs ? `?${qs}` : ''}`;
  }

  function pillClass(actiu: boolean) {
    return `px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
      actiu ? 'bg-accent text-surface' : 'bg-surface-2 text-ink-2 hover:text-ink'
    }`;
  }

  return (
    <div className="space-y-4">
      {esAdmin && (
        <div className="flex items-center gap-1.5 text-xs">
          <Link href={hrefFor({ v: null })} className={pillClass(!veureComJugador)}>Vista d&apos;administrador</Link>
          <Link href={hrefFor({ v: 'jugador' })} className={pillClass(veureComJugador)}>Vista de jugador</Link>
        </div>
      )}

      {(avis || avisRondes || avisFases || avisAdmin) && (
        <div className="text-xs text-ink-3 bg-surface-2 border border-border rounded-lg px-3 py-2 space-y-1">
          {avisAdmin && <p>{avisAdmin}</p>}
          {(avisRondes ?? avis) && (
            <p>
              {avisRondes ?? avis}
              {vista.mode === 'frozen_at' && vista.frozenRound !== null && ` Última ronda inclosa: ${vista.frozenRound}.`}
            </p>
          )}
          {avisFases && <p>{avisFases}</p>}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 overflow-hidden space-y-2">
          {mostrarRondaNav && (() => {
            const anterior = rondesAnterior(rondesDisponibles, rondaEfectiva);
            const seguent = rondesSeguent(rondesDisponibles, rondaEfectiva);
            return (
              <div className="flex items-center gap-2">
                <Link
                  href={hrefFor({ r: anterior })}
                  aria-disabled={anterior === null}
                  className={`flex-shrink-0 p-1.5 rounded-lg border border-border transition-colors ${
                    anterior === null ? 'opacity-30 pointer-events-none' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                  }`}
                  aria-label="Ronda anterior"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </Link>
                <span className="flex-1 text-center text-sm font-semibold text-ink tabular-nums">
                  Ronda {rondaEfectiva}
                </span>
                <Link
                  href={hrefFor({ r: seguent })}
                  aria-disabled={seguent === null}
                  className={`flex-shrink-0 p-1.5 rounded-lg border border-border transition-colors ${
                    seguent === null ? 'opacity-30 pointer-events-none' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                  }`}
                  aria-label="Ronda següent"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            );
          })()}

          {PESTANYES.length > 1 && (
            <nav className="flex gap-1.5 overflow-x-auto pb-1">
              {PESTANYES.map((p) => (
                <Link key={p.id} href={hrefFor({ t: p.id })} className={pillClass(pestanya === p.id)}>
                  {p.label}
                </Link>
              ))}
            </nav>
          )}
        </div>

        <FiltresClassificacio
          tournamentId={id}
          pestanya={pestanya}
          rondaSeleccionada={rondaSeleccionada}
          fases={mostrarFasesFiltre ? totes_fases.map((f) => ({ id: f.id, name: f.name })) : []}
          faseSeleccionada={faseSeleccionada}
          q={sp.q ?? ''}
          br={barrufComparador ?? ''}
          bv={sp.bv ?? ''}
          tags={totesEtiquetes}
          tagsSeleccionades={tagsSeleccionades}
          vistaJugador={veureComJugador}
          equips={totsEquips}
          equipSeleccionat={equipSeleccionat}
        />
      </div>

      {pestanya === 'equips' && vista.teamStandings ? (
        <>
          {vista.teamStandings.length === 0 ? (
            <p className="text-sm text-ink-3 text-center py-10">
              Encara no hi ha cap equip amb partides jugades.
            </p>
          ) : (
            <>
              <Card padding={false} className="hidden sm:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3 border-b border-border">
                      <th className="px-3 py-2 font-semibold">#</th>
                      <th className="px-2 py-2 font-semibold">Equip</th>
                      <th className="px-2 py-2 font-semibold">Membres</th>
                      <th className="px-3 py-2 font-semibold text-right">Punts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {vista.teamStandings.map((equip) => (
                      <tr key={equip.teamId} className="hover:bg-surface-2 transition-colors">
                        <td className="px-3 py-2.5 font-display font-bold text-ink-2 tabular-nums">{equip.rank}</td>
                        <td className="px-2 py-2.5 font-medium text-ink">{equip.name}</td>
                        <td className="px-2 py-2.5 text-ink-3">
                          {equip.memberEntryIds.map((m) => (nomPerEntry.get(m) ?? '?') + (equip.countedEntryIds.includes(m) ? '' : ' (no compta)')).join(', ')}
                        </td>
                        <td className="px-3 py-2.5 text-right font-display font-bold text-ink tabular-nums">{formatNumber(equip.points)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <Card padding={false} className="sm:hidden">
                <ul className="divide-y divide-border">
                  {vista.teamStandings.map((equip) => (
                    <li key={equip.teamId} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-7 text-center font-display font-bold text-ink-2 tabular-nums">{equip.rank}</span>
                      <span className="flex-1 font-medium text-ink truncate">{equip.name}</span>
                      <span className="text-xs text-ink-3">{equip.countedEntryIds.length} membres</span>
                      <span className="font-display font-bold text-ink tabular-nums">{formatNumber(equip.points)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}
        </>
      ) : pestanya === 'general' ? (
        <ClassificacioGeneral tournamentId={id} standings={standingsFiltrats} desempats={desempatsGeneral} />
      ) : pestanya === 'partida-conjunta' ? (
        <RanquingPartidaConjunta
          tournamentId={id}
          rows={partidesConjuntes}
          nomPerEntry={Object.fromEntries(entrants.map((e) => [e.id, e.displayName]))}
        />
      ) : (
        <RanquingMetrica
          tournamentId={id}
          standings={standingsFiltrats}
          metrica={pestanya}
          etiqueta={etiqueta(pestanya)}
          isWordMetric={preguntaActiva?.type === 'wordvalue'}
          historyByEntry={Object.fromEntries(historial)}
        />
      )}
    </div>
  );
}

/** Punts poden tenir decimals (§12.10); es mostren sense soroll. */
function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

/**
 * Ronda anterior/següent dins les disponibles (ordenades ascendent) — no es
 * pot assumir que siguin consecutives (una ronda amagada pel director hi
 * deixaria un forat).
 */
function rondesAnterior(disponibles: number[], actual: number): number | null {
  const menors = disponibles.filter((n) => n < actual);
  return menors.length > 0 ? menors[menors.length - 1] : null;
}
function rondesSeguent(disponibles: number[], actual: number): number | null {
  return disponibles.find((n) => n > actual) ?? null;
}
