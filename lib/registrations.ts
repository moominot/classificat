import { and, asc, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db } from '@/db';
import { entries, entryClaims, people, registrationRequests } from '@/db/schema';
import type { RegistrationRequest } from '@/db/schema';
import type { Viewer } from '@/lib/authz';

/**
 * Inscripcions obertes: el jugador ho demana des de l'inici i qui gestiona
 * la competició ho valida. Fins llavors no hi ha `entry`, de manera que una
 * sol·licitud pendent no compta enlloc més que en aquesta llista.
 */

/** Les sol·licituds pendents, les més antigues primer (és l'ordre en què s'han de validar). */
export async function loadPendingRequests(tournamentId: string): Promise<RegistrationRequest[]> {
  return db
    .select()
    .from(registrationRequests)
    .where(and(eq(registrationRequests.tournamentId, tournamentId), eq(registrationRequests.status, 'pending')))
    .orderBy(asc(registrationRequests.createdAt));
}

/** El que necessita la llista de validació, sense dades de dispositiu ni de compte. */
export function toSollicitud(r: RegistrationRequest) {
  return {
    id: r.id,
    displayName: r.displayName,
    club: r.club,
    barrufNumero: r.barrufNumero,
    ambCompte: r.accountId !== null,
  };
}

/**
 * L'última sol·licitud que ha fet qui mira (pel compte o pel dispositiu) i
 * que encara no s'ha convertit en inscripció.
 */
export async function findViewerRequest(tournamentId: string, viewer: Viewer): Promise<RegistrationRequest | null> {
  const qui = [];
  if (viewer.account) qui.push(eq(registrationRequests.accountId, viewer.account.id));
  if (viewer.deviceId) qui.push(eq(registrationRequests.deviceId, viewer.deviceId));
  if (qui.length === 0) return null;

  const [row] = await db
    .select()
    .from(registrationRequests)
    .where(
      and(
        eq(registrationRequests.tournamentId, tournamentId),
        ne(registrationRequests.status, 'accepted'),
        or(...qui)
      )
    )
    .orderBy(desc(registrationRequests.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Ja hi ha algú inscrit (o pendent) amb aquesta persona o aquest número del
 * BARRUF? Evita que el mateix jugador s'apunti dues vegades.
 */
export async function findDuplicate(
  tournamentId: string,
  {
    personId,
    barrufNumero,
    exceptRequestId,
  }: { personId: string | null; barrufNumero: number | null; exceptRequestId?: string }
): Promise<'entry' | 'request' | null> {
  const personIds = new Set<string>();
  if (personId) personIds.add(personId);
  if (barrufNumero != null) {
    const mateixNumero = await db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.barrufNumero, barrufNumero));
    for (const p of mateixNumero) personIds.add(p.id);
  }

  if (personIds.size > 0) {
    const [entry] = await db
      .select({ id: entries.id })
      .from(entries)
      .where(and(eq(entries.tournamentId, tournamentId), inArray(entries.personId, [...personIds])));
    if (entry) return 'entry';
  }

  const perRequest = [];
  if (personId) perRequest.push(eq(registrationRequests.personId, personId));
  if (barrufNumero != null) perRequest.push(eq(registrationRequests.barrufNumero, barrufNumero));
  if (perRequest.length === 0) return null;

  const [request] = await db
    .select({ id: registrationRequests.id })
    .from(registrationRequests)
    .where(
      and(
        eq(registrationRequests.tournamentId, tournamentId),
        eq(registrationRequests.status, 'pending'),
        exceptRequestId ? ne(registrationRequests.id, exceptRequestId) : undefined,
        or(...perRequest)
      )
    );
  return request ? 'request' : null;
}

/**
 * Accepta una sol·licitud: retroba o crea la persona, la inscriu i, si
 * s'havia fet des d'un mòbil sense compte, el deixa identificat com a ella
 * (el mateix que fa el «qui ets»).
 */
export async function acceptRequest(request: RegistrationRequest, reviewerId: string): Promise<string> {
  let personId = request.personId;

  // El registre és silenciós (§14.2): si el número del BARRUF ja hi consta,
  // és la mateixa persona i no se'n crea una de nova.
  if (!personId && request.barrufNumero != null) {
    const [existent] = await db
      .select({ id: people.id })
      .from(people)
      .where(eq(people.barrufNumero, request.barrufNumero));
    personId = existent?.id ?? null;
  }

  if (!personId) {
    personId = uuid();
    await db.insert(people).values({
      id: personId,
      displayName: request.displayName,
      club: request.club,
      rating: request.rating,
      barrufNumero: request.barrufNumero,
      createdBy: reviewerId,
    });
  }

  const [rating] = await db.select({ rating: people.rating }).from(people).where(eq(people.id, personId));

  let [entry] = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.tournamentId, request.tournamentId), eq(entries.personId, personId)));
  if (!entry) {
    entry = { id: uuid() };
    await db.insert(entries).values({
      id: entry.id,
      tournamentId: request.tournamentId,
      personId,
      rating: request.rating ?? rating?.rating ?? null,
      isActive: true,
    });
  }

  // Un dispositiu és un sol jugador per competició: si ja n'havia triat un
  // altre, aquest el substitueix.
  if (request.deviceId && !request.accountId) {
    const daquesta = await db
      .select({ id: entries.id })
      .from(entries)
      .where(eq(entries.tournamentId, request.tournamentId));
    await db
      .delete(entryClaims)
      .where(
        and(
          eq(entryClaims.deviceId, request.deviceId),
          inArray(entryClaims.entryId, daquesta.map((e) => e.id))
        )
      );
    await db.insert(entryClaims).values({ entryId: entry.id, deviceId: request.deviceId });
  }

  await db
    .update(registrationRequests)
    .set({ status: 'accepted', personId, entryId: entry.id, reviewedBy: reviewerId, reviewedAt: new Date() })
    .where(eq(registrationRequests.id, request.id));

  // Si n'hi havia cap altra de pendent per a la mateixa persona, ja no cal.
  await db
    .delete(registrationRequests)
    .where(
      and(
        eq(registrationRequests.tournamentId, request.tournamentId),
        eq(registrationRequests.status, 'pending'),
        eq(registrationRequests.personId, personId),
        isNull(registrationRequests.entryId)
      )
    );

  return entry.id;
}
