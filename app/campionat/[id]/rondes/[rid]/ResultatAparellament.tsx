import Link from 'next/link';
import Badge from '@/components/ui/Badge';

export interface ParticipantVista {
  entryId: string;
  displayName: string;
  score: number | null;
  rank: number | null;
}

export interface PartidaVista {
  id: string;
  tableNumber: number;
  participants: ParticipantVista[];
}

/**
 * Una taula de la ronda.
 *
 * Serveix tant per a l'1v1 com per a taules de més jugadors: la partida és
 * una llista de participants i el resultat és la posició de cadascun
 * (docs/pla-rols.md §12.10).
 */
export default function ResultatAparellament({
  partida,
  tournamentId,
}: {
  partida: PartidaVista;
  tournamentId: string;
  roundId: string;
  rondaTancada: boolean;
}) {
  const esBye = partida.participants.length === 1;
  const jugada = !esBye && partida.participants.every((p) => p.rank !== null);

  const badge = esBye ? (
    <Badge color="gray">Bye</Badge>
  ) : !jugada ? (
    <Badge color="gray">Pendent</Badge>
  ) : partida.participants.filter((p) => p.rank === 1).length > 1 ? (
    <Badge color="blue">E</Badge>
  ) : (
    <Badge color="green">V</Badge>
  );

  const inner = (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <span className="w-7 h-7 rounded-lg bg-surface-2 text-ink-2 flex items-center justify-center text-xs font-display font-bold flex-shrink-0 tabular-nums">
        {esBye ? '—' : partida.tableNumber}
      </span>

      {esBye ? (
        <span className="flex-1 text-sm font-medium text-ink-2 italic">
          {partida.participants[0]?.displayName}
        </span>
      ) : (
        <div className="flex-1 min-w-0 space-y-0.5">
          {partida.participants.map((participant) => (
            <div key={participant.entryId} className="flex items-center justify-between gap-2">
              <span
                className={`text-sm truncate ${
                  participant.rank === 1 ? 'font-semibold text-ink' : 'text-ink-2'
                }`}
              >
                {participant.displayName}
              </span>
              {jugada && (
                <span className="tabular-nums text-sm font-semibold text-ink flex-shrink-0">
                  {participant.score}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex-shrink-0">{badge}</div>
    </div>
  );

  if (esBye) {
    return <div className="bg-surface border border-border rounded-xl opacity-70">{inner}</div>;
  }

  return (
    <Link
      href={`/campionat/${tournamentId}/partida/${partida.id}`}
      className="block bg-surface border border-border rounded-xl hover:border-accent transition-colors"
    >
      {inner}
    </Link>
  );
}
