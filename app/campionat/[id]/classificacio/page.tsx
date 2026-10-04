import { asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db';
import { phases, questionDefinitions, rounds } from '@/db/schema';
import { Card } from '@/components/ui/Card';
import { canManageTournament, getCurrentAccount } from '@/lib/authz';
import { loadEntrantsWithContact, loadMetricHistory, loadTags, loadVisibleRoundIds } from '@/lib/db-helpers';
import { loadStandings } from '@/lib/standings-service';
import { resolveTiebreaker } from '@/lib/pairing/tiebreakers';
import RanquingMetrica from './RanquingMetrica';
import ClassificacioGeneral from './ClassificacioGeneral';
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
  const canManage = account ? await canManageTournament(account, id) : false;

  const [totes_fases, totesPreguntes, totesEtiquetes, vistaCompleta, totes_rondes, entrants] = await Promise.all([
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
  ]);

  // Club i BARRUF per jugador, per al cercador — són públics (ja es veuen a
  // la fitxa de cada jugador), no cal gestionar-los perquè apareguin aquí.
  const infoPerEntry = new Map(entrants.map((e) => [e.id, { club: e.club, rating: e.rating }]));

  // Filtre per fase: només té sentit oferir-lo quan n'hi ha més d'una i ja
  // s'ha jugat alguna cosa visible — amb una de sola, "per fases" i "general"
  // dirien el mateix, i sense partides és una pestanya buida.
  const mostrarFasesFiltre = totes_fases.length > 1 && vistaCompleta.standings.some((s) => s.gamesPlayed > 0);
  const faseSeleccionada =
    mostrarFasesFiltre && totes_fases.some((f) => f.id === sp.f) ? (sp.f as string) : null;
  const vista = faseSeleccionada ? await loadStandings(id, { canManage, phaseId: faseSeleccionada }) : vistaCompleta;

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
  const hiHaFiltre = cerca.length > 0 || barrufValor !== null || tagsSeleccionades.length > 0;

  function passaFiltre(entryId: string, displayName: string, tagIds: string[]): boolean {
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
    ? vista.standings.filter((s) => passaFiltre(s.entryId, s.displayName, s.tagIds))
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

  const PESTANYES: { id: string; label: string }[] = [
    { id: 'general', label: 'General' },
    ...metriquesRanquing.map((key) => ({ id: key, label: etiqueta(key) })),
    ...(vista.teamStandings ? [{ id: 'equips', label: 'Equips' }] : []),
  ];
  const pestanya = PESTANYES.some((p) => p.id === sp.t) ? sp.t : 'general';

  // L'historial (una fila per ronda jugada) només cal per a la pestanya
  // d'una mètrica concreta: és l'única que en treu profit (§15.3).
  const preguntaActiva = totesPreguntes.find((q) => q.key === pestanya) ?? null;
  const historial = preguntaActiva
    ? await loadMetricHistory(id, pestanya, {
        onlyClosedRounds: vista.mode === 'closed_rounds',
        phaseIds: faseSeleccionada ? [faseSeleccionada] : undefined,
      })
    : new Map();

  // Quines rondes alimenten la classificació que s'està veient — útil quan el
  // director manté la incògnita de resultats fins al final i la xifra de
  // "només compten les tancades" per si sola no diu quines. Mateix criteri
  // que les dades (tancada i amb resultats publicats), no només l'estat
  // (docs/pla-rols.md §8.2) — si no, el missatge podia dir que una ronda
  // compta quan el director l'havia amagat explícitament.
  const rondesVisiblesIds = vista.mode === 'closed_rounds' ? await loadVisibleRoundIds(id) : null;
  const rondesVisibles = rondesVisiblesIds
    ? totes_rondes.filter((r) => rondesVisiblesIds.has(r.id)).map((r) => r.number)
    : [];
  const avisRondes =
    vista.mode === 'closed_rounds'
      ? rondesVisibles.length === 0
        ? 'Encara no hi ha cap ronda tancada.'
        : `Compten les rondes: ${rondesVisibles.join(', ')}.`
      : null;
  const avis = MODE_NOTICE[vista.mode];

  // Un únic constructor d'enllaç perquè pestanya/fase/cerca es puguin
  // combinar sense que triar-ne un esborri els altres.
  function hrefFor(overrides: { t?: string; f?: string | null; clearFilters?: boolean }) {
    const params = new URLSearchParams();
    const t = overrides.t ?? pestanya;
    const f = overrides.f !== undefined ? overrides.f : faseSeleccionada;
    if (t && t !== 'general') params.set('t', t);
    if (f) params.set('f', f);
    if (!overrides.clearFilters) {
      if (sp.q) params.set('q', sp.q);
      if (sp.br) params.set('br', sp.br);
      if (sp.bv) params.set('bv', sp.bv);
      if (sp.tags) params.set('tags', sp.tags);
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
      {(avis || avisRondes) && (
        <p className="text-xs text-ink-3 bg-surface-2 border border-border rounded-lg px-3 py-2">
          {avisRondes ?? avis}
          {vista.mode === 'frozen_at' && vista.frozenRound !== null && ` Última ronda inclosa: ${vista.frozenRound}.`}
        </p>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 overflow-hidden space-y-2">
          {mostrarFasesFiltre && (
            <nav className="flex gap-1.5 overflow-x-auto pb-1">
              <Link href={hrefFor({ f: null })} className={pillClass(faseSeleccionada === null)}>
                Totes les fases
              </Link>
              {totes_fases.map((f) => (
                <Link key={f.id} href={hrefFor({ f: f.id })} className={pillClass(faseSeleccionada === f.id)}>
                  {f.name}
                </Link>
              ))}
            </nav>
          )}

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
          faseSeleccionada={faseSeleccionada}
          q={sp.q ?? ''}
          br={barrufComparador ?? ''}
          bv={sp.bv ?? ''}
          tags={totesEtiquetes}
          tagsSeleccionades={tagsSeleccionades}
        />
      </div>

      {pestanya === 'equips' && vista.teamStandings ? (
        <Card padding={false}>
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
      ) : pestanya === 'general' ? (
        <ClassificacioGeneral tournamentId={id} standings={standingsFiltrats} desempats={desempatsGeneral} />
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
