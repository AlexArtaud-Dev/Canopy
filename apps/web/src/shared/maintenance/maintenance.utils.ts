export type MaintenanceDecision = 'pass' | 'page' | 'unavailable';

/** Paths that keep working for everyone, so the maintenance page can render. */
const alwaysOpen = ['/maintenance', '/_next/', '/favicon.ico'];

/**
 * During maintenance, only the local network reaches the app; everyone else gets the static
 * page, and API calls a 503.
 */
export function maintenanceDecision(input: {
  enabled: boolean;
  local: boolean;
  pathname: string;
}): MaintenanceDecision {
  if (!input.enabled || input.local) return 'pass';
  if (alwaysOpen.some((prefix) => input.pathname === prefix || input.pathname.startsWith(prefix))) {
    return 'pass';
  }
  return input.pathname.startsWith('/api/') || input.pathname.startsWith('/engine/')
    ? 'unavailable'
    : 'page';
}

/** `CANOPY_MAINTENANCE=true` forces maintenance on, whatever the stored setting says. */
export function maintenanceFromEnv(raw: string | undefined): boolean {
  return ['true', '1', 'yes', 'on'].includes((raw ?? '').trim().toLowerCase());
}
