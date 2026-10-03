import { redirect } from 'next/navigation';
import { getCurrentAccount } from '@/lib/authz';
import { getSetting } from '@/lib/settings';
import ConfiguracioClient from '@/components/forms/ConfiguracioClient';

export const dynamic = 'force-dynamic';

/** Configuració global: només el superadmin (docs/pla-rols.md §1). */
export default async function ConfiguracioPage() {
  const account = await getCurrentAccount();
  if (!account) redirect('/login');
  if (account.role !== 'superadmin') redirect('/');

  const [barrufApiUrl, barrufApiKey] = await Promise.all([
    getSetting('barruf_api_url'),
    getSetting('barruf_api_key'),
  ]);

  return (
    <ConfiguracioClient
      barrufApiUrl={barrufApiUrl ?? ''}
      barrufApiKeyConfigured={Boolean(barrufApiKey)}
    />
  );
}
