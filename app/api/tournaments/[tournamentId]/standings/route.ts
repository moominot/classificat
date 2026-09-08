import { NextResponse } from 'next/server';
import { canManageTournament, getCurrentAccount } from '@/lib/authz';
import { loadStandings } from '@/lib/standings-service';

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * GET /api/tournaments/:tid/standings
 *
 * La visibilitat s'aplica al servei, no aquí: el mode de classificació
 * (directe, només rondes tancades, congelada o amagada) decideix què es
 * calcula (docs/pla-rols.md §8.2).
 */
export async function GET(req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const url = new URL(req.url);
  const phaseId = url.searchParams.get('phaseId');
  const upToRound = url.searchParams.get('upToRound');

  const account = await getCurrentAccount();
  const canManage = account ? await canManageTournament(account, tournamentId) : false;

  const view = await loadStandings(tournamentId, {
    canManage,
    phaseId,
    upToRound: upToRound ? Number(upToRound) : null,
  });

  if (!view.visible) {
    return NextResponse.json(
      { visible: false, standings: [], teamStandings: null, mode: 'hidden' },
      { status: 200 }
    );
  }

  return NextResponse.json(view);
}
