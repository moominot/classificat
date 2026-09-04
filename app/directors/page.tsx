import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/session';
import type { SessionData } from '@/lib/session';
import { db } from '@/db';
import { directors } from '@/db/schema';
import DirectorsClient from '@/components/forms/DirectorsClient';

export const dynamic = 'force-dynamic';

export default async function DirectorsPage() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  const all = await db
    .select({
      id: directors.id,
      username: directors.username,
      name: directors.name,
      isActive: directors.isActive,
      createdAt: directors.createdAt,
    })
    .from(directors)
    .orderBy(directors.createdAt);

  return (
    <DirectorsClient
      directors={all.map(d => ({ ...d, createdAt: d.createdAt.toString() }))}
      currentDirectorId={session.directorId}
    />
  );
}
