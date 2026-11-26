import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { importSwissPerfect } from '@/lib/swissperfect/import';
import { parseSwissPerfect } from '@/lib/swissperfect/parse';

/**
 * POST — Crea un campionat a partir dels fitxers de SwissPerfect 98.
 *
 * `multipart/form-data` amb `trn` (jugadors) i `sco` (resultats), obligatoris,
 * `ini` (configuració, opcional) i `name` (opcional; per defecte el de l'`ini`).
 */
export async function POST(req: Request) {
  const guard = await requireRole('admin');
  if (guard.error) return guard.error;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Cal un formulari amb els fitxers' }, { status: 400 });

  const trn = form.get('trn');
  const sco = form.get('sco');
  const ini = form.get('ini');
  if (!(trn instanceof File) || !(sco instanceof File)) {
    return NextResponse.json({ error: 'Calen els fitxers .trn i .sco' }, { status: 400 });
  }

  try {
    const parsed = parseSwissPerfect({
      trn: new Uint8Array(await trn.arrayBuffer()),
      sco: new Uint8Array(await sco.arrayBuffer()),
      ini: ini instanceof File ? new Uint8Array(await ini.arrayBuffer()) : undefined,
    });
    if (parsed.players.length === 0) {
      return NextResponse.json({ error: 'El fitxer .trn no té cap jugador' }, { status: 400 });
    }
    const name = form.get('name');
    const result = importSwissPerfect(parsed, {
      ownerId: guard.account.id,
      name: typeof name === 'string' && name.trim() ? name : undefined,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No s\'ha pogut importar' }, { status: 400 });
  }
}
