import { getConnection } from '@/shared/db/client';

import { maintenanceFromEnv } from './maintenance.utils';

const cacheMs = 5_000;
let cached: { value: boolean; at: number } | undefined;

/**
 * Whether maintenance is on: the env variable wins, else the `system.maintenance` setting. Read by
 * the proxy on every request, so the stored value is cached for a few seconds.
 */
export async function isMaintenanceOn(): Promise<boolean> {
  if (maintenanceFromEnv(process.env.CANOPY_MAINTENANCE)) return true;
  if (!process.env.CANOPY_DATABASE_URL) return false;
  if (cached && Date.now() - cached.at < cacheMs) return cached.value;
  try {
    const [row] = await getConnection().sql<{ value: unknown }[]>`
      SELECT value FROM app.settings WHERE module = 'system' AND key = 'maintenance'`;
    cached = { value: row?.value === true, at: Date.now() };
  } catch {
    // An unreachable database must not lock everyone out: keep the last known state.
    cached = { value: cached?.value ?? false, at: Date.now() };
  }
  return cached.value;
}
