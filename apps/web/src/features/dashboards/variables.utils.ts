import { z } from 'zod';

/**
 * Variable families: one global permission each (`metrics:<family>`), granted in the roles editor
 * under "Dashboard variables". The engine checks its own three families again.
 */
export const variableFamilies = [
  'system',
  'storage',
  'operations',
  'shares',
  'users',
  'logs',
] as const;
export type VariableFamily = (typeof variableFamilies)[number];

export type VariableUnit = 'percent' | 'bytes' | 'bytesPerSecond' | 'count';

/** How a variable's data comes: values over time, or a list of log lines. */
export type VariableKind = 'series' | 'log';

// Labels keyed by variable id and family:
// i18n-dynamic: dashboards.variables
// i18n-dynamic: dashboards.families

/** One value a dashboard can show. `id` is also its translation key under `dashboards.variables`. */
export interface VariableDefinition {
  id: string;
  family: VariableFamily;
  unit: VariableUnit;
  kind: VariableKind;
  /** Several series (one per volume…) rather than one. */
  multiSeries: boolean;
  /** Read from the engine (sampled every 30 s) or computed by the web app. */
  source: 'engine' | 'web';
}

/** Variables the web app computes from its own data; the engine's come from its catalog. */
export const webVariables: readonly VariableDefinition[] = [
  {
    id: 'shares.active',
    family: 'shares',
    unit: 'count',
    kind: 'series',
    multiSeries: false,
    source: 'web',
  },
  {
    id: 'shares.dropOffs',
    family: 'shares',
    unit: 'count',
    kind: 'series',
    multiSeries: false,
    source: 'web',
  },
  {
    id: 'users.accounts',
    family: 'users',
    unit: 'count',
    kind: 'series',
    multiSeries: false,
    source: 'web',
  },
  {
    id: 'users.sessions',
    family: 'users',
    unit: 'count',
    kind: 'series',
    multiSeries: false,
    source: 'web',
  },
  {
    id: 'logs.denied',
    family: 'logs',
    unit: 'count',
    kind: 'series',
    multiSeries: false,
    source: 'web',
  },
  {
    id: 'logs.audit',
    family: 'logs',
    unit: 'count',
    kind: 'log',
    multiSeries: false,
    source: 'web',
  },
];

export function variablePermission(family: VariableFamily): `metrics:${VariableFamily}` {
  return `metrics:${family}`;
}

/** Administrators read every family; others the families their roles grant. */
export function mayReadFamily(
  user: { isAdmin: boolean; permissions: readonly string[] },
  family: VariableFamily,
): boolean {
  return user.isAdmin || user.permissions.includes(variablePermission(family));
}

export function isVariableFamily(value: string): value is VariableFamily {
  return variableFamilies.some((family) => family === value);
}

/** The engine's metrics as variables (their families and units are the same words). */
export function engineVariable(metric: {
  name: string;
  family: string;
  unit: VariableUnit;
  series: boolean;
}): VariableDefinition | null {
  if (!isVariableFamily(metric.family)) return null;
  return {
    id: metric.name,
    family: metric.family,
    unit: metric.unit,
    kind: 'series',
    multiSeries: metric.series,
    source: 'engine',
  };
}

/** Ranges dashboards offer, newest data at the right end. */
export const timeRanges = ['1h', '6h', '24h', '7d', '30d'] as const;
export type TimeRange = (typeof timeRanges)[number];

const rangeMs: Record<TimeRange, number> = {
  '1h': 60 * 60_000,
  '6h': 6 * 60 * 60_000,
  '24h': 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
  '30d': 30 * 24 * 60 * 60_000,
};

/** The window a range covers, ending now. */
export function rangeWindow(range: TimeRange, now: Date): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - rangeMs[range]), to: now };
}

/** Points a chart asks for: enough for a smooth line, few enough to stay light. */
export const chartPoints = 120;

/** A bucket width for web-computed series: the range split into about `chartPoints`. */
export function bucketSeconds(range: TimeRange): number {
  return Math.max(60, Math.ceil(rangeMs[range] / 1000 / chartPoints / 60) * 60);
}

export interface VariablePoint {
  /** ISO 8601, start of the bucket. */
  at: string;
  avg: number;
  min: number;
  max: number;
}

export interface LogLine {
  /** ISO 8601. */
  at: string;
  action: string;
  result: 'success' | 'denied' | 'error';
  actor: string | null;
  target: string | null;
}

/** What a panel receives for a variable over a range. */
export type VariableData =
  | {
      kind: 'series';
      unit: VariableUnit;
      bucketSeconds: number;
      series: { name: string; points: VariablePoint[] }[];
    }
  | { kind: 'log'; lines: LogLine[] };

export const readVariableInputSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z]+(\.[a-zA-Z]+)+$/)
    .max(64),
  range: z.enum(timeRanges),
});
export type ReadVariableInput = z.infer<typeof readVariableInputSchema>;

/** The latest value of each series (what a single-value panel shows), null when empty. */
export function latestValue(data: VariableData): number | null {
  if (data.kind !== 'series') return null;
  let latest: VariablePoint | undefined;
  for (const series of data.series) {
    const last = series.points.at(-1);
    if (last && (!latest || last.at > latest.at)) latest = last;
  }
  return latest?.avg ?? null;
}
