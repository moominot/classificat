import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { entries, people } from '@/db/schema';
import { requireTournamentAccess } from '@/lib/authz';
import { loadRegistreConfigurat, normalitzaNom } from '@/lib/barruf-registre';

type Params = { params: Promise<{ tournamentId: string }> };

/**
 * POST — Actualitza el BARRUF (nivell i club) de tots els jugadors de la
 * competició. Qui ja té número de BARRUF s'actualitza per número; la resta
 * es cerca pel nom (o àlies) i només es vincula si hi ha una única
 * coincidència — si n'hi ha diverses, no es toca ningú.
 */
export async function POST(_req: Request, { params }: Params) {
  const { tournamentId } = await params;
  const guard = await requireTournamentAccess(tournamentId);
  if (guard.error) return guard.error;

  let registre;
  try {
    registre = await loadRegistreConfigurat();
  } catch {
    return NextResponse.json({ error: "No s'ha pogut contactar amb el BARRUF" }, { status: 502 });
  }
  if (!registre) {
    return NextResponse.json({ error: 'La connexió amb el BARRUF no està configurada (Configuració)' }, { status: 503 });
  }

  const perNumero = new Map(registre.map((j) => [j.numero, j]));
  const perNom = new Map<string, typeof registre>();
  for (const j of registre) {
    for (const nom of [j.nom, ...(j.alies ?? [])]) {
      const k = normalitzaNom(nom);
      const llista = perNom.get(k) ?? [];
      if (!llista.includes(j)) llista.push(j);
      perNom.set(k, llista);
    }
  }

  const inscrits = await db
    .select({
      entryId: entries.id,
      personId: entries.personId,
      rating: entries.rating,
      displayName: people.displayName,
      fullName: people.fullName,
      club: people.club,
      barrufNumero: people.barrufNumero,
    })
    .from(entries)
    .innerJoin(people, eq(people.id, entries.personId))
    .where(eq(entries.tournamentId, tournamentId));

  let actualitzats = 0;
  let vinculats = 0;
  const senseCoincidencia: string[] = [];
  const ambigus: string[] = [];

  for (const e of inscrits) {
    let trobat = e.barrufNumero != null ? perNumero.get(e.barrufNumero) : undefined;
    const jaVinculat = !!trobat;
    if (!trobat) {
      const candidats = new Map<number, (typeof registre)[number]>();
      for (const nom of [e.displayName, e.fullName]) {
        if (!nom) continue;
        for (const j of perNom.get(normalitzaNom(nom)) ?? []) candidats.set(j.numero, j);
      }
      if (candidats.size === 0) { senseCoincidencia.push(e.displayName); continue; }
      if (candidats.size > 1) { ambigus.push(e.displayName); continue; }
      trobat = [...candidats.values()][0];
    }

    const personaCanvis: Partial<typeof people.$inferInsert> = {};
    if (e.barrufNumero !== trobat.numero) personaCanvis.barrufNumero = trobat.numero;
    if (trobat.club && trobat.club !== e.club) personaCanvis.club = trobat.club;
    const nouRating = trobat.barruf != null && trobat.barruf !== e.rating ? trobat.barruf : null;

    if (Object.keys(personaCanvis).length > 0) {
      await db.update(people).set(personaCanvis).where(eq(people.id, e.personId));
    }
    if (nouRating !== null) {
      await db.update(entries).set({ rating: nouRating }).where(eq(entries.id, e.entryId));
    }
    if (!jaVinculat) vinculats++;
    if (nouRating !== null || Object.keys(personaCanvis).length > 0) actualitzats++;
  }

  return NextResponse.json({
    total: inscrits.length,
    actualitzats,
    vinculats,
    senseCoincidencia,
    ambigus,
  });
}
