import { db } from '@/db';
import { pairings, players, rounds, phases } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Badge from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';

export const dynamic = 'force-dynamic';

export default async function PartidaDetallPage({
  params,
}: {
  params: Promise<{ id: string; paid: string }>;
}) {
  const { id, paid } = await params;

  const [pairing] = await db.select().from(pairings).where(eq(pairings.id, paid));
  if (!pairing) notFound();

  const [round] = await db.select().from(rounds).where(eq(rounds.id, pairing.roundId));
  if (!round || round.tournamentId !== id) notFound();

  const [phase] = await db.select().from(phases).where(eq(phases.id, round.phaseId));

  const [p1, p2] = await Promise.all([
    db.select().from(players).where(eq(players.id, pairing.player1Id)).then(r => r[0]),
    pairing.player2Id
      ? db.select().from(players).where(eq(players.id, pairing.player2Id)).then(r => r[0])
      : Promise.resolve(null),
  ]);

  const teResultat = pairing.outcome1 !== null && pairing.player2Id !== null;
  const isBye = pairing.player2Id === null;

  const p1Guanya = pairing.outcome1 === 'win';
  const p2Guanya = pairing.outcome2 === 'win';
  const empat = pairing.outcome1 === 'draw';

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
        <Link href={`/campionat/${id}/rondes`} className="hover:text-blue-600">Rondes</Link>
        <span>/</span>
        <Link href={`/campionat/${id}/rondes/${round.id}`} className="hover:text-blue-600">
          Ronda {round.number}
        </Link>
        <span>/</span>
        <span className="text-gray-900">{p1?.name} vs {p2?.name ?? 'Bye'}</span>
      </div>

      {/* Capçalera de la partida */}
      <div className="text-center space-y-1">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
          {phase?.name} · Ronda {round.number}
          {pairing.tableNumber > 0 && ` · Taula ${pairing.tableNumber}`}
        </p>
        {isBye && <Badge color="gray">Bye</Badge>}
        {teResultat && !empat && (
          <Badge color="green">Resultat registrat</Badge>
        )}
        {empat && <Badge color="blue">Empat</Badge>}
      </div>

      {/* Marcador principal */}
      <Card>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-2">
          {/* Jugador 1 */}
          <div className="text-center space-y-1">
            <Link
              href={`/campionat/${id}/jugadors/${p1?.id}`}
              className="font-bold text-lg text-gray-900 hover:text-blue-600 transition-colors block"
            >
              {p1?.name ?? '?'}
            </Link>
            {teResultat && (
              <p className={`text-4xl font-black tabular-nums ${p1Guanya ? 'text-blue-600' : 'text-gray-400'}`}>
                {pairing.p1Score}
              </p>
            )}
            {teResultat && p1Guanya && (
              <Badge color="green">Victòria</Badge>
            )}
          </div>

          {/* Separador */}
          <div className="text-center text-gray-300 font-light text-2xl">
            {isBye ? '—' : teResultat ? '–' : 'vs'}
          </div>

          {/* Jugador 2 */}
          <div className="text-center space-y-1">
            {isBye ? (
              <span className="text-gray-400 italic text-sm">Bye</span>
            ) : (
              <>
                <Link
                  href={`/campionat/${id}/jugadors/${p2?.id}`}
                  className="font-bold text-lg text-gray-900 hover:text-blue-600 transition-colors block"
                >
                  {p2?.name ?? '?'}
                </Link>
                {teResultat && (
                  <p className={`text-4xl font-black tabular-nums ${p2Guanya ? 'text-blue-600' : 'text-gray-400'}`}>
                    {pairing.p2Score}
                  </p>
                )}
                {teResultat && p2Guanya && (
                  <Badge color="green">Victòria</Badge>
                )}
              </>
            )}
          </div>
        </div>

        {teResultat && (
          <p className="text-center text-xs text-gray-400 mt-3">
            Suma total: {(pairing.p1Score ?? 0) + (pairing.p2Score ?? 0)} punts
          </p>
        )}
      </Card>

      {/* Estadístiques Scrabble */}
      {teResultat && (
        <div className="grid grid-cols-2 gap-4">
          {/* Bingos */}
          {(pairing.p1Scrabbles !== null || pairing.p2Scrabbles !== null) && (
            <Card>
              <CardHeader><CardTitle>Bingos</CardTitle></CardHeader>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-blue-600">{pairing.p1Scrabbles ?? 0}</p>
                  <p className="text-xs text-gray-400 mt-1 truncate">{p1?.name}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-600">{pairing.p2Scrabbles ?? 0}</p>
                  <p className="text-xs text-gray-400 mt-1 truncate">{p2?.name}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Millors jugades */}
          {(pairing.p1BestWord || pairing.p2BestWord) && (
            <Card>
              <CardHeader><CardTitle>Millors jugades</CardTitle></CardHeader>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  {pairing.p1BestWord ? (
                    <>
                      <p className="text-lg font-bold text-gray-800 uppercase">{pairing.p1BestWord}</p>
                      <p className="text-sm text-green-600 font-semibold">{pairing.p1BestWordScore} pts</p>
                    </>
                  ) : <p className="text-gray-300 text-sm">—</p>}
                  <p className="text-xs text-gray-400 mt-1 truncate">{p1?.name}</p>
                </div>
                <div>
                  {pairing.p2BestWord ? (
                    <>
                      <p className="text-lg font-bold text-gray-800 uppercase">{pairing.p2BestWord}</p>
                      <p className="text-sm text-green-600 font-semibold">{pairing.p2BestWordScore} pts</p>
                    </>
                  ) : <p className="text-gray-300 text-sm">—</p>}
                  <p className="text-xs text-gray-400 mt-1 truncate">{p2?.name}</p>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Localitat i comentaris */}
      {(pairing.location || pairing.comments) && (
        <Card>
          {pairing.location && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{pairing.location}</span>
            </div>
          )}
          {pairing.comments && (
            <blockquote className="mt-2 pl-3 border-l-2 border-gray-200 text-sm text-gray-600 italic">
              {pairing.comments}
            </blockquote>
          )}
        </Card>
      )}

      {/* Sense resultat */}
      {!teResultat && !isBye && (
        <div className="text-center py-8">
          <p className="text-sm text-gray-400">Partida pendent de registrar</p>
          <Link
            href={`/campionat/${id}/rondes/${round.id}`}
            className="text-sm text-blue-600 hover:underline mt-1 inline-block"
          >
            Anar a la ronda per introduir el resultat →
          </Link>
        </div>
      )}
    </div>
  );
}
