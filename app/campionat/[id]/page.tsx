import { asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { groups, phases, rounds, tournaments } from '@/db/schema';
import Badge from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { canManageTournament, getCurrentAccount } from '@/lib/authz';
import { loadEntrants } from '@/lib/db-helpers';
import { loadStandings } from '@/lib/standings-service';
import { resolveTiebreaker } from '@/lib/pairing/tiebreakers';
import type { PhaseConfig } from '@/lib/pairing/types';

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, { label: string; color: 'gray' | 'green' | 'blue' }> = {
  draft: { label: 'Esborrany', color: 'gray' },
  active: { label: 'En curs', color: 'green' },
  finished: { label: 'Finalitzat', color: 'blue' },
};

const METHOD_LABELS: Record<string, string> = {
  swiss_fide: 'Suís FIDE',
  swiss: 'Suís',
  round_robin: 'Round Robin',
  king_of_the_hill: 'Rei del turó',
  manual: 'Manual / CSV',
};

/**
 * Inici públic del campionat (docs/pla-rols.md §15.1): qui no gestiona la
 * competició ha de poder entendre-la d'un cop d'ull sense haver d'anar a
 * Fases ni Classificació — el resum dels criteris i el top de la
 * classificació viuen aquí, en lectura.
 */
export default async function CampionatInici({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  if (!tournament) notFound();

  const account = await getCurrentAccount();
  const canManage = account ? await canManageTournament(account, id) : false;

  const [totesFases, totesRondes, totsGrups, jugadors, vista] = await Promise.all([
    db.select().from(phases).where(eq(phases.tournamentId, id)).orderBy(asc(phases.order)),
    db.select().from(rounds).where(eq(rounds.tournamentId, id)).orderBy(asc(rounds.number)),
    db.select().from(groups).where(eq(groups.tournamentId, id)),
    loadEntrants(id),
    loadStandings(id, { canManage }),
  ]);

  const statusBadge = STATUS_BADGE[tournament.status] ?? STATUS_BADGE.draft;
  const rondesTancades = totesRondes.filter((r) => r.status === 'closed').length;
  const top = vista.standings.slice(0, 8);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge color={statusBadge.color}>{statusBadge.label}</Badge>
        <span className="text-sm text-ink-3">
          {jugadors.length} jugador{jugadors.length !== 1 ? 's' : ''}
          {totsGrups.length > 0 && ` · ${totsGrups.length} grups`}
          {totesRondes.length > 0 && ` · ${rondesTancades}/${totesRondes.length} rondes tancades`}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <AccesCard href={`/campionat/${id}/jugadors`} label="Jugadors" value={jugadors.length.toString()} />
        <AccesCard href={`/campionat/${id}/rondes`} label="Rondes" value={totesRondes.length.toString()} />
        <AccesCard
          href={`/campionat/${id}/classificacio`}
          label="Classificació"
          value={vista.visible ? `${vista.standings.length} classificats` : 'No publicada'}
        />
      </div>

      <Card>
        <CardHeader><CardTitle>Criteris d&apos;aparellament</CardTitle></CardHeader>
        {totesFases.length === 0 ? (
          <p className="text-sm text-ink-3">
            Encara no hi ha fases configurades.
            {canManage && (
              <>
                {' '}
                <Link href={`/campionat/${id}/fases`} className="text-accent-ink underline font-medium">
                  Configura-les
                </Link>
                .
              </>
            )}
          </p>
        ) : (
          <div className="space-y-3">
            {totesFases.map((fase) => (
              <div key={fase.id} className="border border-border rounded-lg p-3">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-sm text-ink">{fase.name}</span>
                  <Badge color="gray">{METHOD_LABELS[fase.method] ?? fase.method}</Badge>
                  <span className="text-xs text-ink-3">
                    Rondes {fase.startRound}–{fase.endRound}
                  </span>
                </div>
                <p className="text-xs text-ink-3">{describeScope(fase.config, totsGrups.length)}</p>
                {fase.tiebreakers.length > 0 && (
                  <p className="text-xs text-ink-3 mt-1 leading-relaxed">
                    Desempats: {fase.tiebreakers.map((t) => resolveTiebreaker(t)?.label ?? t).join(' → ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card padding={false}>
        <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
          <CardTitle>Classificació</CardTitle>
          <Link href={`/campionat/${id}/classificacio`} className="text-xs text-accent-ink font-medium hover:underline">
            Veure-la completa →
          </Link>
        </div>
        {!vista.visible ? (
          <p className="text-sm text-ink-3 text-center py-8">La classificació encara no està publicada.</p>
        ) : top.length === 0 ? (
          <p className="text-sm text-ink-3 text-center py-8">Encara no hi ha resultats.</p>
        ) : (
          <ul className="divide-y divide-border">
            {top.map((s) => (
              <li key={s.entryId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-6 text-center font-display font-bold text-ink-2 tabular-nums text-sm">
                  {s.rank}
                </span>
                <Link
                  href={`/campionat/${id}/jugadors/${s.entryId}`}
                  className="flex-1 text-sm font-medium text-ink hover:text-accent-ink transition-colors truncate"
                >
                  {s.displayName}
                </Link>
                <span className="font-display font-bold text-ink tabular-nums text-sm">
                  {formatNumber(s.points)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function describeScope(config: PhaseConfig, numGrups: number): string {
  if (config.method === 'round_robin') {
    const scope = config.scope === 'intra_group' ? 'intra-grupal' : config.scope === 'inter_group' ? 'inter-grupal' : 'tots contra tots';
    return `Round Robin${config.doubleRound ? ' a doble volta' : ''}, ${scope}.`;
  }
  if (config.method === 'swiss_fide') {
    if (config.scope === 'intra_group' && numGrups > 0) return 'Sistema suís FIDE, independent dins de cada grup.';
    return 'Sistema suís FIDE, global.';
  }
  if (config.method === 'swiss') {
    return 'Sistema suís.';
  }
  if (config.method === 'king_of_the_hill') {
    return config.topN ? `Rei del turó, limitat als ${config.topN} millors.` : 'Rei del turó, amb tots els jugadors.';
  }
  return 'Aparellaments manuals o importats per CSV.';
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function AccesCard({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <Link
      href={href}
      className="block bg-surface border border-border rounded-xl p-3.5 hover:border-accent hover:shadow-sm transition-all"
    >
      <p className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide mb-1">{label}</p>
      <p className="font-display text-lg font-bold text-ink truncate">{value}</p>
    </Link>
  );
}
