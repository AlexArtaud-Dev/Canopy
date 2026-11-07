import type { EngineProbe, SystemStatus } from './system.types';

/**
 * The engine's /readyz pings the database, so one probe tells us about both services.
 * Any other failure means we cannot say anything about the database.
 */
export function toSystemStatus(probe: EngineProbe, checkedAt: Date): SystemStatus {
  const base = { web: 'up', checkedAt: checkedAt.toISOString() } as const;

  if (probe.kind === 'unreachable') {
    return { ...base, engine: 'down', database: 'unknown' };
  }
  if (probe.httpStatus === 200) {
    return { ...base, engine: 'up', database: 'up' };
  }
  if (probe.code === 'system.database_unavailable') {
    return { ...base, engine: 'up', database: 'down' };
  }
  return { ...base, engine: 'down', database: 'unknown' };
}
