import type { Disk, DiskAlert } from '@canopy/contracts';
import { z } from 'zod';

/** The permission that reads disk health (page, dashboards, alerts); a dashboard variable family. */
export const diskReadPermission = 'metrics:disks';

/** Where the disks page lives, also where alerts lead. */
export const disksHref = '/disks';

/** A self-test an administrator asks for. Disk ids are the engine's (`sda`, `nvme0`). */
export const selfTestInputSchema = z.object({
  disk: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
  test: z.enum(['short', 'long']),
});
export type SelfTestInput = z.infer<typeof selfTestInputSchema>;

/** How a disk is called on the page: its model, or its device when it reports none. */
export function diskName(disk: Pick<Disk, 'id' | 'model'>): string {
  return disk.model || disk.id;
}

const decimalUnits = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte', 'petabyte'] as const;

/** A disk's size as its maker states it: decimal units (a "4 TB" disk), not binary ones. */
export function formatCapacity(bytes: number, locale: string): string {
  let value = Math.max(bytes, 0);
  let unit = 0;
  while (value >= 1000 && unit < decimalUnits.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: decimalUnits[unit],
    unitDisplay: 'short',
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}

const hoursPerDay = 24;
const daysPerYear = 365;

/** A disk's age (power-on hours) in whole years and days, for a readable sentence. */
export function ageParts(hours: number): { years: number; days: number } {
  const days = Math.floor(Math.max(hours, 0) / hoursPerDay);
  return { years: Math.floor(days / daysPerYear), days: days % daysPerYear };
}

/** Disks that need a look first: failing, then warnings and hot ones, then the others. */
export function needsAttention(disk: Pick<Disk, 'health' | 'hot'>): boolean {
  return disk.health === 'failing' || disk.health === 'warning' || disk.hot;
}

/** A summary for dashboards and the page header. */
export function diskSummary(disks: readonly Pick<Disk, 'health' | 'hot'>[]): {
  total: number;
  failing: number;
  warning: number;
  hot: number;
} {
  return {
    total: disks.length,
    failing: disks.filter((disk) => disk.health === 'failing').length,
    warning: disks.filter((disk) => disk.health === 'warning').length,
    hot: disks.filter((disk) => disk.hot).length,
  };
}

/** Notification kinds disk alerts become (texts under `notifications.kinds`). */
export const diskNotificationKinds = ['diskFailing', 'diskWarning', 'diskHot'] as const;
export type DiskNotificationKind = (typeof diskNotificationKinds)[number];

const alertKinds: Record<DiskAlert['kind'], DiskNotificationKind> = {
  failing: 'diskFailing',
  warning: 'diskWarning',
  hot: 'diskHot',
};

/**
 * What an engine alert tells people. One notification per disk and kind: a later alert of the
 * same kind updates it (unread again) rather than piling up.
 */
export function alertNotification(alert: DiskAlert): {
  kind: DiskNotificationKind;
  sourceKey: string;
  params: Record<string, string | number>;
  href: string;
} {
  const params: Record<string, string | number> = { disk: alert.name };
  if (alert.temperature !== undefined) params.temperature = alert.temperature;
  if (alert.limit !== undefined) params.limit = alert.limit;
  return {
    kind: alertKinds[alert.kind],
    sourceKey: `disk:${alert.kind}:${alert.name}`,
    params,
    href: disksHref,
  };
}
