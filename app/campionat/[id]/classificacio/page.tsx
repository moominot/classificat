import { asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db';
import { groups, phases, questionDefinitions } from '@/db/schema';
import { Card } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { canManageTournament, getCurrentAccount } from '@/lib/authz';
import { loadTournamentWordAnswers } from '@/lib/db-helpers';
import { loadStandings } from '@/lib/standings-service';
import type { StandingRow } from '@/lib/standings-service';

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
  avg_score: 'Mitjana',
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

  const [totes_fases, totesPreguntes, tots_grups, vista, paraules] = await Promise.all([
    db.select().from(phases).where(eq(phases.tournamentId, id)).orderBy(asc(phases.order)),
    db
      .select()
      .from(questionDefinitions)
      .where(eq(questionDefinitions.tournamentId, id))
      .orderBy(asc(questionDefinitions.order)),
    db.select().from(groups).where(eq(groups.tournamentId, id)).orderBy(asc(groups.order)),
    loadStandings(id, { canManage }),
    loadTournamentWordAnswers(id),
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

  // Mètriques que tenen columna pròpia: les preguntes marcades per al rànquing
  // més spread i mitjana, que fa servir tothom encara que no siguin preguntes.
  const metriquesRanquing = [
    'spread',
    'avg_score',
    ...totesPreguntes.filter((q) => q.showInRanking && q.aggregate !== 'none').map((q) => q.key),
  ].filter((key, i, all) => all.indexOf(key) === i);

  const etiqueta = (key: string) =>
    METRIC_LABELS[key] ?? totesPreguntes.find((q) => q.key === key)?.label ?? key;

  const PESTANYES: { id: string; label: string }[] = [
    { id: 'general', label: 'General' },
    ...metriquesRanquing.filter((key) => key !== 'spread').map((key) => ({ id: key, label: etiqueta(key) })),
    ...(vista.teamStandings ? [{ id: 'equips', label: 'Equips' }] : []),
    ...(tots_grups.length > 0 ? [{ id: 'grups', label: 'Per grups' }] : []),
  ];
  const pestanya = PESTANYES.some((p) => p.id === sp.t) ? sp.t : 'general';

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
                <TaulaClassificacio
                  tournamentId={id}
                  standings={delGrup.map((s, i) => ({ ...s, rank: i + 1 }))}
                  metriques={metriquesRanquing}
                  etiqueta={etiqueta}
                />
              </div>
            );
          })}
        </div>
      ) : pestanya === 'general' ? (
        <TaulaClassificacio
          tournamentId={id}
          standings={vista.standings}
          metriques={metriquesRanquing}
          etiqueta={etiqueta}
        />
      ) : (
        <RanquingMetrica
          tournamentId={id}
          standings={vista.standings}
          metrica={pestanya}
          etiqueta={etiqueta(pestanya)}
          paraules={paraules}
        />
      )}
    </div>
  );
}

function TaulaClassificacio({
  tournamentId,
  standings,
  metriques,
  etiqueta,
}: {
  tournamentId: string;
  standings: StandingRow[];
  metriques: string[];
  etiqueta: (key: string) => string;
}) {
  return (
    <Card padding={false}>
      {/* Al mòbil la taula llisca dins del seu contenidor i no arrossega la pàgina */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3 border-b border-border">
              <th className="px-3 py-2 font-semibold">#</th>
              <th className="px-2 py-2 font-semibold">Jugador</th>
              <th className="px-2 py-2 font-semibold text-right whitespace-nowrap">Partides</th>
              <th className="px-2 py-2 font-semibold text-right">V-E-D</th>
              <th className="px-2 py-2 font-semibold text-right">Punts</th>
              {metriques.map((key) => (
                <th key={key} className="px-2 py-2 font-semibold text-right whitespace-nowrap">
                  {etiqueta(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {standings.map((s) => (
              <tr key={s.entryId} className="hover:bg-surface-2 transition-colors">
                <td className="px-3 py-2.5 font-display font-bold text-ink-2 tabular-nums">{s.rank}</td>
                <td className="px-2 py-2.5 min-w-[9rem]">
                  <Link
                    href={`/campionat/${tournamentId}/jugadors/${s.entryId}`}
                    className="font-medium text-ink hover:text-accent-ink transition-colors"
                  >
                    {s.displayName}
                  </Link>
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-ink-3">{s.gamesPlayed}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-ink-3 whitespace-nowrap">
                  {s.wins}-{s.draws}-{s.losses}
                </td>
                <td className="px-2 py-2.5 text-right font-display font-bold text-ink tabular-nums">
                  {formatNumber(s.points)}
                </td>
                {metriques.map((key) => (
                  <td key={key} className="px-2 py-2.5 text-right tabular-nums text-ink-2">
                    {formatMetric(key, s.metrics[key] ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Rànquing d'una sola mètrica, ordenat per ella. */
function RanquingMetrica({
  tournamentId,
  standings,
  metrica,
  etiqueta,
  paraules,
}: {
  tournamentId: string;
  standings: StandingRow[];
  metrica: string;
  etiqueta: string;
  /** Paraula de cada jugador per a aquesta mètrica, si és "paraula + valor" (§12.1). */
  paraules: Map<string, string>;
}) {
  const ordenat = [...standings]
    .filter((s) => (s.metrics[metrica] ?? 0) !== 0 || s.gamesPlayed > 0)
    .sort((a, b) => (b.metrics[metrica] ?? 0) - (a.metrics[metrica] ?? 0));

  return (
    <Card padding={false}>
      <ul className="divide-y divide-border">
        {ordenat.map((s, i) => {
          const paraula = paraules.get(`${s.entryId}|${metrica}`);
          return (
            <li key={s.entryId} className="flex items-center gap-3 px-4 py-3">
              <span className="w-7 text-center font-display font-bold text-ink-2 tabular-nums">{i + 1}</span>
              <Link
                href={`/campionat/${tournamentId}/jugadors/${s.entryId}`}
                className="flex-1 font-medium text-ink hover:text-accent-ink transition-colors truncate"
              >
                {s.displayName}
              </Link>
              {s.gamesPlayed > 0 && <Badge color="gray">{s.gamesPlayed} partides</Badge>}
              {paraula ? (
                <div className="text-right flex-shrink-0">
                  <div className="font-display font-black text-ink uppercase tracking-wide text-lg leading-tight">
                    {paraula}
                  </div>
                  <div className="text-xs text-ink-3 tabular-nums mt-0.5">
                    {formatMetric(metrica, s.metrics[metrica] ?? 0)} punts
                  </div>
                </div>
              ) : (
                <span className="font-display font-bold text-ink tabular-nums">
                  {formatMetric(metrica, s.metrics[metrica] ?? 0)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {ordenat.length === 0 && (
        <p className="text-sm text-ink-3 text-center py-10">Encara no hi ha dades de {etiqueta.toLowerCase()}.</p>
      )}
    </Card>
  );
}

function formatMetric(key: string, value: number): string {
  if (key === 'spread' && value > 0) return `+${formatNumber(value)}`;
  return formatNumber(value);
}

/** Punts i spread poden tenir decimals (§12.10 i §12.11); es mostren sense soroll. */
function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}
