import { db } from '@/db';
import { pairings, players, rounds, phases } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Badge from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import FormulariResultatPartida from './FormulariResultatPartida';

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

  const teStats = pairing.p1Scrabbles !== null || pairing.p2Scrabbles !== null
    || !!pairing.p1BestWord || !!pairing.p2BestWord;

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
        <Link href={`/campionat/${id}/rondes`} className="hover:text-blue-600">Rondes</Link>
        <span>/</span>
        <Link href={`/campionat/${id}/rondes/${round.id}`} className="hover:text-blue-600">
          Ronda {round.number}
        </Link>
        <span>/</span>
        <span className="text-gray-900 truncate">{p1?.name} vs {p2?.name ?? 'Bye'}</span>
      </div>

      {/* Capçalera */}
      <div className="text-center space-y-1">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
          {phase?.name} · Ronda {round.number}
          {pairing.tableNumber > 0 && ` · Taula ${pairing.tableNumber}`}
        </p>
        {isBye && <Badge color="gray">Bye</Badge>}
        {teResultat && !empat && <Badge color="green">Resultat registrat</Badge>}
        {empat && <Badge color="blue">Empat</Badge>}
      </div>

      {/* Marcador */}
      <Card>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-1">
          <div className="text-center space-y-1 min-w-0">
            <Link
              href={`/campionat/${id}/jugadors/${p1?.id}`}
              className="font-semibold text-gray-900 hover:text-blue-600 transition-colors block truncate"
            >
              {p1?.name ?? '?'}
            </Link>
            {teResultat && (
              <p className={`text-4xl font-black tabular-nums ${p1Guanya ? 'text-blue-600' : 'text-gray-400'}`}>
                {pairing.p1Score}
              </p>
            )}
            {teResultat && p1Guanya && <Badge color="green">Victòria</Badge>}
          </div>

          <div className="text-gray-300 font-light text-2xl flex-shrink-0">
            {isBye ? '—' : teResultat ? '–' : 'vs'}
          </div>

          <div className="text-center space-y-1 min-w-0">
            {isBye ? (
              <span className="text-gray-400 italic text-sm">Bye</span>
            ) : (
              <>
                <Link
                  href={`/campionat/${id}/jugadors/${p2?.id}`}
                  className="font-semibold text-gray-900 hover:text-blue-600 transition-colors block truncate"
                >
                  {p2?.name ?? '?'}
                </Link>
                {teResultat && (
                  <p className={`text-4xl font-black tabular-nums ${p2Guanya ? 'text-blue-600' : 'text-gray-400'}`}>
                    {pairing.p2Score}
                  </p>
                )}
                {teResultat && p2Guanya && <Badge color="green">Victòria</Badge>}
              </>
            )}
          </div>
        </div>
        {teResultat && (
          <p className="text-center text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100">
            Suma total: {(pairing.p1Score ?? 0) + (pairing.p2Score ?? 0)} punts
          </p>
        )}
      </Card>

      {/* Estadístiques: taula de comparació mobile-friendly */}
      {teResultat && teStats && (
        <Card>
          <div className="grid grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-3 text-sm items-start">
            {/* Capçaleres */}
            <div />
            <p className="font-semibold text-gray-700 truncate">{p1?.name}</p>
            <p className="font-semibold text-gray-700 truncate text-right">{p2?.name}</p>

            {/* Bingos */}
            {(pairing.p1Scrabbles !== null || pairing.p2Scrabbles !== null) && (
              <>
                <p className="text-gray-400 leading-none pt-1">Bingos</p>
                <p className="text-2xl font-bold text-blue-600 leading-none">
                  {pairing.p1Scrabbles ?? 0}
                </p>
                <p className="text-2xl font-bold text-blue-600 leading-none text-right">
                  {pairing.p2Scrabbles ?? 0}
                </p>
              </>
            )}

            {/* Millor jugada */}
            {(pairing.p1BestWord || pairing.p2BestWord) && (
              <>
                <p className="text-gray-400 pt-1">Millor jugada</p>
                <div className="min-w-0">
                  {pairing.p1BestWord ? (
                    <>
                      <p className="font-bold text-gray-800 uppercase break-all leading-snug">
                        {pairing.p1BestWord}
                      </p>
                      {pairing.p1BestWordScore != null && (
                        <p className="text-xs text-green-600 font-semibold mt-0.5">
                          {pairing.p1BestWordScore} pts
                        </p>
                      )}
                    </>
                  ) : <p className="text-gray-300">—</p>}
                </div>
                <div className="min-w-0 text-right">
                  {pairing.p2BestWord ? (
                    <>
                      <p className="font-bold text-gray-800 uppercase break-all leading-snug">
                        {pairing.p2BestWord}
                      </p>
                      {pairing.p2BestWordScore != null && (
                        <p className="text-xs text-green-600 font-semibold mt-0.5">
                          {pairing.p2BestWordScore} pts
                        </p>
                      )}
                    </>
                  ) : <p className="text-gray-300">—</p>}
                </div>
              </>
            )}
          </div>

          {/* Foto del full */}
          {pairing.sheetImageUrl && (
            <a
              href={pairing.sheetImageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-400 hover:text-blue-600 transition-colors"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Veure full de puntuació
            </a>
          )}
        </Card>
      )}

      {/* Localitat i comentaris */}
      {(pairing.location || pairing.comments) && (
        <Card>
          {pairing.location && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
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

      {/* Formulari (gestiona el seu propi Card i show/hide) */}
      {!isBye && (
        <FormulariResultatPartida
          aparellament={{
            ...pairing,
            player1Name: p1?.name ?? '?',
            player2Name: p2?.name ?? '?',
            sheetImageUrl: pairing.sheetImageUrl ?? null,
          }}
          tournamentId={id}
          roundId={round.id}
          rondaTancada={round.isComplete}
        />
      )}
    </div>
  );
}
