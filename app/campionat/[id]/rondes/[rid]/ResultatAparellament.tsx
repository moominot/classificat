import Link from 'next/link';

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

  const inner = (
    <div className="flex items-center gap-2 px-4 py-3">
      {/* Número de taula */}
      <span className={`text-xs font-bold flex-shrink-0 w-4 text-center tabular-nums ${
        esBye ? 'text-gray-300' : 'text-blue-500'
      }`}>
        {esBye ? '—' : ap.tableNumber}
      </span>

      {/* Noms + resultat */}
      <div className="flex-1 flex items-baseline gap-2 min-w-0">
        <span className={`text-sm font-medium truncate flex-1 min-w-0 ${
          p1Guanya ? 'text-blue-700 font-semibold' : 'text-gray-900'
        }`}>
          {ap.player1Name}
        </span>

        <span className="flex-shrink-0 text-center">
          {esBye ? (
            <span className="text-xs text-gray-400 italic">BYE</span>
          ) : jugat ? (
            <span className="text-sm font-bold tabular-nums text-gray-700">
              {ap.p1Score}–{ap.p2Score}
            </span>
          ) : (
            <span className="text-xs text-gray-300">vs</span>
          )}
        </span>

        {!esBye && (
          <span className={`text-sm font-medium truncate flex-1 min-w-0 text-right ${
            p2Guanya ? 'text-blue-700 font-semibold' : 'text-gray-900'
          }`}>
            {ap.player2Name}
          </span>
        )}
      </div>

      {/* Indicador d'estat + fletxa */}
      {!esBye && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
            jugat ? 'bg-green-400' : 'bg-amber-300'
          }`} />
          <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {esBye ? (
        <div className="opacity-50">{inner}</div>
      ) : (
        <Link
          href={`/campionat/${tournamentId}/partida/${ap.id}`}
          className="block hover:bg-gray-50 active:bg-gray-100 transition-colors"
        >
          {inner}
        </Link>
      )}
    </div>
  );
}
