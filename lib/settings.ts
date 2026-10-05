import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { appSettings } from '@/db/schema';

/** Configuració global d'abast d'aplicació (clau-valor), p. ex. la connexió amb el BARRUF. */

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

export interface BarrufConfig {
  apiUrl: string;
  apiKey: string;
}

/** `null` si l'adreça o la clau encara no s'han configurat a `/configuracio`. */
export async function getBarrufConfig(): Promise<BarrufConfig | null> {
  const [apiUrl, apiKey] = await Promise.all([
    getSetting('barruf_api_url'),
    getSetting('barruf_api_key'),
  ]);
  if (!apiUrl || !apiKey) return null;
  return { apiUrl: apiUrl.replace(/\/+$/, ''), apiKey };
}
