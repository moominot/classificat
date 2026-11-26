import { NextResponse } from 'next/server';
import { requireTournamentAccess } from '@/lib/authz';
import { loadSwissPerfectTournament } from '@/lib/swissperfect/from-db';
import { writeSwissPerfect, zipStore } from '@/lib/swissperfect/write';

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * GET — Còpia de seguretat del campionat per a SwissPerfect 98: un ZIP amb els
 * fitxers `.trn`, `.sco` i `.ini`, que SwissPerfect obre directament.
 */
export async function GET(_req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  const sp = await loadSwissPerfectTournament(tournamentId);
  if (!sp) return NextResponse.json({ error: 'Competició no trobada' }, { status: 404 });

  const files = writeSwissPerfect(sp);
  const base = sp.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'campionat';
  const zip = zipStore([
    { name: `${base}.trn`, data: files.trn },
    { name: `${base}.sco`, data: files.sco },
    { name: `${base}.ini`, data: files.ini },
  ]);

  return new Response(Buffer.from(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${base}_swissperfect.zip"`,
      ...(sp.warnings.length ? { 'X-Avisos': encodeURIComponent(sp.warnings.join(' | ')) } : {}),
    },
  });
}
