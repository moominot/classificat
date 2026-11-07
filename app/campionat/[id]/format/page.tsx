import { asc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { phases, rounds, tournaments, tournamentTemplates } from '@/db/schema';
import Badge from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { getViewer } from '@/lib/authz';
import { loadEntrants, loadTags } from '@/lib/db-helpers';
import { ancestorsOf, buildScheme, currentRange } from '@/lib/competition-scheme';
import type { SchemePhase, SchemeStep } from '@/lib/competition-scheme';
import { describeScope } from '@/lib/phase-description';
import QuadreEliminatoria from './QuadreEliminatoria';

export const dynamic = 'force-dynamic';

/**
 * Format de la competició, d'un cop d'ull: de la inscripció a la
 * classificació final, fase a fase, i el quadre de l'eliminatòria per
 * posicions amb els camins possibles (si guanyes vas aquí, si perds allà).
 * És públic: és el que un jugador necessita per entendre què es juga.
 */
export default async function FormatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  if (!tournament) notFound();

  const [totesFases, totesRondes, totesEtiquetes, jugadors, [plantilla], viewer] = await Promise.all([
    db.select().from(phases).where(eq(phases.tournamentId, id)).orderBy(asc(phases.order)),
    db.select({ number: rounds.number, phaseId: rounds.phaseId, status: rounds.status }).from(rounds).where(eq(rounds.tournamentId, id)),
    loadTags(id),
    loadEntrants(id),
    db
      .select({ config: tournamentTemplates.config })
      .from(tournamentTemplates)
      .where(eq(tournamentTemplates.id, tournament.templateId ?? '')),
    getViewer(id),
  ]);
  const tagNameById = new Map(totesEtiquetes.map((t) => [t.id, t.name]));
  const actius = jugadors.filter((j) => j.isActive);

  // Una fase normal no es tanca mai explícitament: és acabada si ja s'ha
  // començat una fase posterior o si totes les seves rondes estan tancades.
  const ordrePerFase = new Map(totesFases.map((f) => [f.id, f.order]));
  const acabada = (f: (typeof totesFases)[number]) =>
    f.isComplete ||
    totesRondes.some((r) => (ordrePerFase.get(r.phaseId) ?? 0) > f.order) ||
    Array.from({ length: f.endRound - f.startRound + 1 }, (_, i) => f.startRound + i).every((n) =>
      totesRondes.some((r) => r.number === n && r.status === 'closed')
    );
  const fases: SchemePhase[] = totesFases.map((f) => ({
    id: f.id,
    name: f.name,
    startRound: f.startRound,
    endRound: f.endRound,
    config: f.config,
    isComplete: acabada(f),
  }));
  const passos = buildScheme({
    phases: fases,
    activePlayers: actius.length,
    registrationOpen: tournament.status === 'registration',
    positionEliminationPlanned: plantilla?.config.phaseGenerator === 'position_elimination',
  });

  // El camí del jugador que mira, si és al quadre: de les seves etiquetes
  // de grup es dedueix què ha guanyat i què ha perdut fins ara.
  const jo = viewer.entryId ? jugadors.find((j) => j.id === viewer.entryId) ?? null : null;
  function camiDe(playerCount: number): boolean[] | null {
    if (!jo) return null;
    const rang = currentRange(playerCount, (jo.tagIds ?? []).map((t) => tagNameById.get(t) ?? ''));
    if (!rang) return null;
    const cadena = ancestorsOf(playerCount, rang);
    return cadena.slice(1).map((r, i) => r.from === cadena[i].from);
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="font-display text-lg font-bold text-ink">Format de la competició</h2>
        <p className="text-sm text-ink-3">Tot el recorregut, de la inscripció a la classificació final.</p>
      </div>

      <ol className="relative space-y-3 before:absolute before:left-[15px] before:top-4 before:bottom-4 before:w-0.5 before:bg-border">
        {passos.map((pas, i) => (
          <li key={i} className="relative pl-10">
            <span
              className={`absolute left-1.5 top-4 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${
                esActual(pas) ? 'bg-accent border-accent text-surface' : 'bg-surface border-border text-ink-3'
              }`}
            >
              {i + 1}
            </span>
            <Pas
              pas={pas}
              seguent={passos[i + 1]}
              tagNameById={tagNameById}
              camiDe={camiDe}
              nomJugador={jo?.displayName ?? null}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function esActual(pas: SchemeStep): boolean {
  if (pas.kind === 'phase' || pas.kind === 'final') return pas.current;
  if (pas.kind === 'bracket') return pas.currentLevel !== null && pas.currentLevel < pas.phases.length;
  return pas.open;
}

function Pas({
  pas,
  seguent,
  tagNameById,
  camiDe,
  nomJugador,
}: {
  pas: SchemeStep;
  seguent: SchemeStep | undefined;
  tagNameById: Map<string, string>;
  camiDe: (playerCount: number) => boolean[] | null;
  nomJugador: string | null;
}) {
  if (pas.kind === 'registration') {
    return (
      <Card className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-display font-bold text-ink">Inscripció</h3>
          {pas.open && <Badge color="blue">Oberta</Badge>}
        </div>
        <p className="text-sm text-ink-2">
          {pas.players} jugador{pas.players !== 1 ? 's' : ''} inscrit{pas.players !== 1 ? 's' : ''}.
        </p>
        {pas.requirement && <p className="text-sm text-loss">{pas.requirement}</p>}
        <Pont pas={pas} seguent={seguent} />
      </Card>
    );
  }

  if (pas.kind === 'phase') {
    const { phase } = pas;
    return (
      <Card className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-display font-bold text-ink">{phase.name}</h3>
          <span className="text-xs text-ink-3">Rondes {phase.startRound}–{phase.endRound}</span>
          {pas.current && <Badge color="green">En joc</Badge>}
          {phase.isComplete && <Badge color="gray">Acabada</Badge>}
        </div>
        <p className="text-sm text-ink-2">{describeScope(phase.config, tagNameById)}</p>
        <p className="text-sm text-ink-3">Classificació per punts i desempats.</p>
        <Pont pas={pas} seguent={seguent} />
      </Card>
    );
  }

  if (pas.kind === 'bracket') {
    const fases = pas.phases.length;
    const n = pas.playerCount;
    const nivells = Math.log2(n);
    const salts = Array.from({ length: nivells }, (_, i) => n / 2 ** (i + 1));
    const actual = pas.currentLevel !== null && pas.currentLevel < fases;
    return (
      <Card className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-display font-bold text-ink">Eliminatòria per posicions</h3>
          <span className="text-xs text-ink-3">
            {pas.provisional
              ? `Orientatiu, amb ${n} jugadors`
              : `${n} jugadors · ${fases} fases · rondes ${pas.phases[0].startRound}–${pas.phases[fases - 1].endRound}`}
          </span>
          {actual && <Badge color="green">En joc</Badge>}
        </div>
        <ul className="text-sm text-ink-2 space-y-1 list-disc pl-5">
          <li>A cada fase, rival per sorteig dins del teu grup, a anada i tornada (canvia qui comença).</li>
          <li>
            Guanya l&apos;eliminatòria qui suma més punts a les dues partides. Si empaten: mitjana de punts a favor de
            tot el campionat, després bingos, i si encara empaten, decideix l&apos;organització.
          </li>
          <li>
            Si guanyes, passes a la meitat de dalt del grup; si perds, a la de baix. Ningú no queda eliminat: tothom
            juga les {nivells} fases ({nivells * 2} partides).
          </li>
          <li>
            Perdre a la fase 1 et baixa {salts[0]} posicions
            {salts.length > 1 && <>; a la fase 2, {salts[1]}</>}
            {salts.length > 2 && <>; a la 3, {salts[2]}</>}
            {salts.length > 3 && <>… i a l&apos;última, {salts[salts.length - 1]}</>}. Guanyar-les totes és acabar 1r.
          </li>
          <li>Qui abandona perd les eliminatòries que li queden; el seu rival fa bye i passa.</li>
        </ul>
        <QuadreEliminatoria
          playerCount={n}
          fases={pas.phases.map((p) => ({ name: p.name, startRound: p.startRound, endRound: p.endRound }))}
          currentLevel={pas.currentLevel}
          camiJugador={pas.provisional ? null : camiDe(n)}
          nomJugador={nomJugador}
        />
        <Pont pas={pas} seguent={seguent} />
      </Card>
    );
  }

  return (
    <Card className="space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="font-display font-bold text-ink">Classificació final</h3>
        {pas.current && <Badge color="gray">Competició acabada</Badge>}
      </div>
      <p className="text-sm text-ink-2">
        La posició de cadascú a la classificació quan s&apos;acaba l&apos;última fase.
      </p>
    </Card>
  );
}

/** Què passa en acabar un pas i començar el següent. */
function Pont({ pas, seguent }: { pas: SchemeStep; seguent: SchemeStep | undefined }) {
  if (!seguent || seguent.kind === 'final') return null;
  let text: string;
  if (pas.kind === 'registration') {
    text = 'En tancar la inscripció, tots els inscrits comencen la primera fase.';
  } else if (seguent.kind === 'bracket') {
    text =
      pas.kind === 'phase'
        ? 'En acabar, tothom passa a l’eliminatòria. El primer sorteig és entre tots: la posició d’aquesta fase no decideix el grup.'
        : 'En acabar, tothom passa a l’eliminatòria.';
  } else if (seguent.kind === 'phase') {
    const arrossega =
      'carryStandingsFromPhaseIds' in seguent.phase.config &&
      pas.kind === 'phase' &&
      seguent.phase.config.carryStandingsFromPhaseIds.includes(pas.phase.id);
    text = arrossega
      ? `En acabar, tothom passa a «${seguent.phase.name}» amb els punts d’aquesta fase.`
      : `En acabar, tothom passa a «${seguent.phase.name}», que comença de zero.`;
  } else {
    return null;
  }
  return <p className="text-xs text-ink-3 pt-1">↓ {text}</p>;
}
