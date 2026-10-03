import { asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db';
import { groups, phases, questionDefinitions } from '@/db/schema';
import { Card } from '@/components/ui/Card';
import { canManageTournament, getCurrentAccount } from '@/lib/authz';
import { loadMetricHistory } from '@/lib/db-helpers';
import { loadStandings } from '@/lib/standings-service';
import { resolveTiebreaker } from '@/lib/pairing/tiebreakers';
import RanquingMetrica from './RanquingMetrica';
import ClassificacioGeneral from './ClassificacioGeneral';

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
  closed_rounds: 'Només compten les rondes tancades.',
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

  const [totes_fases, totesPreguntes, tots_grups, vista] = await Promise.all([
    db.select().from(phases).where(eq(phases.tournamentId, id)).orderBy(asc(phases.order)),
    db
      .select()
      .from(questionDefinitions)
      .where(eq(questionDefinitions.tournamentId, id))
      .orderBy(asc(questionDefinitions.order)),
    db.select().from(groups).where(eq(groups.tournamentId, id)).orderBy(asc(groups.order)),
    loadStandings(id, { canManage }),
  ]);

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

  // Mètriques que tenen pestanya pròpia: les preguntes marcades per al
  // rànquing (Bingos, Millor jugada...), no els desempats configurats.
  const metriquesRanquing = totesPreguntes
    .filter((q) => q.showInRanking && q.aggregate !== 'none')
    .map((q) => q.key);

  const etiqueta = (key: string) =>
    METRIC_LABELS[key] ?? totesPreguntes.find((q) => q.key === key)?.label ?? key;

  // Les columnes de la classificació general són els desempats configurats a
  // la fase (l'última, com fa el motor per decidir l'ordre — vegeu
  // lib/standings-service.ts), en el seu ordre: expliquen per què algú va
  // davant d'un altre. L'encontre directe queda fora perquè no té un valor
  // absolut per jugador, només dins d'un bloc d'empatats (§11.3).
  const faseReferencia = totes_fases[totes_fases.length - 1] ?? null;
  const desempatsGeneral = (faseReferencia?.tiebreakers ?? [])
    .map((key) => ({ key, def: resolveTiebreaker(key) }))
    .filter((d) => d.def?.compute)
    .map((d) => ({ key: d.key, label: d.def!.label }));

  const PESTANYES: { id: string; label: string }[] = [
    { id: 'general', label: 'General' },
    ...metriquesRanquing.map((key) => ({ id: key, label: etiqueta(key) })),
    ...(vista.teamStandings ? [{ id: 'equips', label: 'Equips' }] : []),
    ...(tots_grups.length > 0 ? [{ id: 'grups', label: 'Per grups' }] : []),
  ];
  const pestanya = PESTANYES.some((p) => p.id === sp.t) ? sp.t : 'general';

  // L'historial (una fila per ronda jugada) només cal per a la pestanya
  // d'una mètrica concreta: és l'única que en treu profit (§15.3).
  const preguntaActiva = totesPreguntes.find((q) => q.key === pestanya) ?? null;
  const historial = preguntaActiva ? await loadMetricHistory(id, pestanya) : new Map();

  const avis = MODE_NOTICE[vista.mode];

  return (
    <div className="space-y-4">
      {avis && (
        <p className="text-xs text-ink-3 bg-surface-2 border border-border rounded-lg px-3 py-2">
          {avis}
          {vista.mode === 'frozen_at' && vista.frozenRound !== null && ` Última ronda inclosa: ${vista.frozenRound}.`}
        </p>
      )}

      {PESTANYES.length > 1 && (
        <nav className="flex gap-1.5 overflow-x-auto pb-1">
          {PESTANYES.map((p) => (
            <Link
              key={p.id}
              href={`/campionat/${id}/classificacio${p.id === 'general' ? '' : `?t=${p.id}`}`}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                pestanya === p.id
                  ? 'bg-accent text-surface'
                  : 'bg-surface-2 text-ink-2 hover:text-ink'
              }`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      )}

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
      ) : pestanya === 'grups' ? (
        <div className="space-y-4">
          {tots_grups.map((grup) => {
            const delGrup = vista.standings.filter((s) => s.groupId === grup.id);
            if (delGrup.length === 0) return null;
            return (
              <div key={grup.id}>
                <h3 className="text-xs font-semibold text-ink-3 uppercase tracking-wide px-1 mb-2">
                  Grup {grup.name}
                </h3>
                <ClassificacioGeneral
                  tournamentId={id}
                  standings={delGrup.map((s, i) => ({ ...s, rank: i + 1 }))}
                  desempats={desempatsGeneral}
                />
              </div>
            );
          })}
        </div>
      ) : pestanya === 'general' ? (
        <ClassificacioGeneral tournamentId={id} standings={vista.standings} desempats={desempatsGeneral} />
      ) : (
        <RanquingMetrica
          tournamentId={id}
          standings={vista.standings}
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
