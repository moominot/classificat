import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { accounts, people } from '@/db/schema';
import { getCurrentAccount } from '@/lib/authz';
import ComptesClient from '@/components/forms/ComptesClient';

export const dynamic = 'force-dynamic';

/** Gestió de comptes: només el superadmin (docs/pla-rols.md §1). */
export default async function UsuarisPage() {
  const account = await getCurrentAccount();
  if (!account) redirect('/login');
  if (account.role !== 'superadmin') redirect('/');

  const comptes = await db
    .select({
      id: accounts.id,
      username: accounts.username,
      displayName: people.displayName,
      role: accounts.role,
      isActive: accounts.isActive,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .innerJoin(people, eq(people.id, accounts.personId))
    .orderBy(accounts.createdAt);

  return (
    <ComptesClient
      comptes={comptes.map((c) => ({ ...c, createdAt: c.createdAt.toString() }))}
      currentAccountId={account.id}
    />
  );
}
