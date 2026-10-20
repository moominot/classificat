import type { StandingRow } from '@/lib/standings-service';
import type { GroupBlock } from '@/lib/tag-groups';
import ClassificacioGeneral, { type DesempatCol } from './ClassificacioGeneral';

/**
 * Classificació general quan el campionat té grups de classificació: un bloc
 * per grup, l'un sota l'altre, amb les posicions contínues
 * (docs/eliminatoria-per-posicions.md). El color fa de zona: el primer grup en
 * verd, l'últim en vermell i els del mig alternant, perquè d'un cop d'ull es
 * vegi on és cadascú dins del conjunt.
 */
export default function ClassificacioPerGrups({
  tournamentId,
  blocs,
  desempats,
}: {
  tournamentId: string;
  blocs: GroupBlock<StandingRow>[];
  desempats: DesempatCol[];
}) {
  // El bloc «Sense grup» no compta per decidir quin és l'últim grup.
  const totalGrups = blocs.filter((b) => b.tag !== null).length;

  return (
    <div className="space-y-5">
      {blocs.map((bloc, i) => {
        const color = colorDeBloc(i, totalGrups, bloc.tag === null);
        const primera = bloc.rows[0]?.rank;
        const darrera = bloc.rows[bloc.rows.length - 1]?.rank;
        return (
          <section key={bloc.tag?.id ?? 'sense-grup'} className={`border-l-4 ${color.border} pl-3 space-y-2`}>
            <header className="flex items-baseline gap-2">
              <h3 className={`font-display font-bold ${color.text}`}>{bloc.tag?.name ?? 'Sense grup'}</h3>
              <span className="text-xs text-ink-3 tabular-nums">
                {primera === darrera ? `Posició ${primera}` : `Posicions ${primera}–${darrera}`} · {bloc.rows.length}{' '}
                jugador{bloc.rows.length !== 1 ? 's' : ''}
              </span>
            </header>
            <ClassificacioGeneral tournamentId={tournamentId} standings={bloc.rows} desempats={desempats} />
          </section>
        );
      })}
    </div>
  );
}

function colorDeBloc(index: number, total: number, senseGrup: boolean): { border: string; text: string } {
  if (senseGrup) return { border: 'border-border', text: 'text-ink-3' };
  if (index === 0) return { border: 'border-win', text: 'text-win' };
  if (index === total - 1) return { border: 'border-loss', text: 'text-loss' };
  return index % 2 === 1
    ? { border: 'border-p2', text: 'text-p2' }
    : { border: 'border-accent', text: 'text-accent' };
}
