import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/authz';
import { findViewerRequest } from '@/lib/registrations';

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * GET — L'estat de la inscripció de qui mira: `accepted` si ja està inscrit,
 * `pending` o `rejected` si té una sol·licitud, `none` si no.
 *
 * És el que consulta el mòbil cada pocs segons mentre espera la validació,
 * perquè vegi l'acceptació sense recarregar. No exposa res més que l'estat propi.
 */
export async function GET(_req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const viewer = await getViewer(tournamentId);
  if (viewer.entryId) return NextResponse.json({ status: 'accepted' });

  const request = await findViewerRequest(tournamentId, viewer);
  return NextResponse.json({ status: request?.status ?? 'none' });
}
