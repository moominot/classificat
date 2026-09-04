import Link from 'next/link';
import Badge from '@/components/ui/Badge';

interface Aparellament {
  id: string;
  tableNumber: number;
  player1Id: string;
  player1Name: string;
  player2Id: string | null;
  player2Name: string | null;
  p1Score: number | null;
  p2Score: number | null;
  outcome1: string | null;
}

export default function ResultatAparellament({
  aparellament: ap,
  tournamentId,
}: {
  aparellament: Aparellament;
  tournamentId: string;
  roundId: string;
  rondaTancada: boolean;
}) {
  const esBye = ap.player2Id === null;
  const jugat = ap.outcome1 !== null && !esBye;
  const p1Guanya = ap.outcome1 === 'win';
  const p2Guanya = ap.outcome1 === 'loss';
  const empat = ap.outcome1 === 'draw';

  const badge = esBye
    ? <Badge color="gray">Bye</Badge>
    : !jugat
    ? <Badge color="gray">Pendent</Badge>
    : empat
    ? <Badge color="blue">E</Badge>
    : <Badge color="green">V</Badge>;

  const inner = (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      {/* Número de taula */}
      <span className="w-7 h-7 rounded-lg bg-surface-2 text-ink-2 flex items-center justify-center text-xs font-display font-bold flex-shrink-0 tabular-nums">
        {esBye ? '—' : ap.tableNumber}
      </span>

      {/* Noms + resultat */}
      {esBye ? (
        <span className="flex-1 text-sm font-medium text-ink-2 italic">{ap.player1Name}</span>
      ) : (
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm truncate ${p1Guanya ? 'font-semibold text-ink' : 'text-ink-2'}`}>
              {ap.player1Name}
            </span>
            {jugat && <span className="tabular-nums text-sm font-semibold text-ink flex-shrink-0">{ap.p1Score}</span>}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm truncate ${p2Guanya ? 'font-semibold text-ink' : 'text-ink-2'}`}>
              {ap.player2Name}
            </span>
            {jugat && <span className="tabular-nums text-sm font-semibold text-ink flex-shrink-0">{ap.p2Score}</span>}
          </div>
        </div>
      )}

      {/* Estat */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {badge}
        {!esBye && (
          <svg className="w-3.5 h-3.5 text-ink-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>
    </div>
  );

  return (
    <div className={`bg-surface border border-border rounded-xl overflow-hidden ${esBye ? 'bg-surface-2' : ''}`}>
      {esBye ? (
        inner
      ) : (
        <Link
          href={`/campionat/${tournamentId}/partida/${ap.id}`}
          className="block hover:bg-surface-2 active:bg-surface-2 transition-colors"
        >
          {inner}
        </Link>
      )}
    </div>
  );
}
