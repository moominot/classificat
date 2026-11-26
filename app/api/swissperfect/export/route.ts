import { requireRole } from '@/lib/authz';
import { exportResultsTsv } from '@/lib/swissperfect/export';
import { parseSwissPerfect } from '@/lib/swissperfect/parse';

/**
 * POST — Converteix els fitxers de SwissPerfect 98 (`trn`, `sco` i, opcional,
 * `ini`, com a `multipart/form-data`) al full de resultats de partides (TSV).
 */
export async function POST(req: Request) {
  const guard = await requireRole('admin');
  if (guard.error) return guard.error;

  const form = await req.formData().catch(() => null);
  const trn = form?.get('trn');
  const sco = form?.get('sco');
  const ini = form?.get('ini');
  if (!(trn instanceof File) || !(sco instanceof File)) {
    return Response.json({ error: 'Calen els fitxers .trn i .sco' }, { status: 400 });
  }

  const parsed = parseSwissPerfect({
    trn: new Uint8Array(await trn.arrayBuffer()),
    sco: new Uint8Array(await sco.arrayBuffer()),
    ini: ini instanceof File ? new Uint8Array(await ini.arrayBuffer()) : undefined,
  });

  return new Response(exportResultsTsv(parsed), {
    headers: {
      'Content-Type': 'text/tab-separated-values; charset=utf-8',
      'Content-Disposition': 'attachment; filename="resultats.tsv"',
    },
  });
}
