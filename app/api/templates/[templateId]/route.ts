import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { tournamentTemplates } from '@/db/schema';
import { requireRole } from '@/lib/authz';
import { canUseTemplate } from '@/lib/templates-service';

type Params = { params: Promise<{ templateId: string }> };

/**
 * DELETE — Esborra una plantilla pròpia (el superadmin, qualsevol). Les de
 * sèrie no. Els campionats que se'n van crear no canvien: ja se'n van copiar.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const { templateId } = await params;
  const guard = await requireRole('admin');
  if (guard.error) return guard.error;

  const template = await canUseTemplate(guard.account, templateId);
  if (!template) return NextResponse.json({ error: 'Plantilla no trobada' }, { status: 404 });
  if (template.isBuiltin) return NextResponse.json({ error: 'Les plantilles de sèrie no es poden esborrar' }, { status: 409 });

  await db.delete(tournamentTemplates).where(eq(tournamentTemplates.id, templateId));
  return new NextResponse(null, { status: 204 });
}
