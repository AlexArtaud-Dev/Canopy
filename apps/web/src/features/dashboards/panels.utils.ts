import { formatValue, type Aggregation, type ColorRule, type RuleColor } from './dashboards.utils';
import type { VariablePoint, VariableUnit } from './variables.utils';

/** One line of a panel: a variable's series, named for people. */
export interface NamedSeries {
  /** Stable key for the chart (`s0`, `s1`…). */
  key: string;
  label: string;
  /** The variable it comes from, named for people. */
  variable: string;
  /** What it measures when the variable has several series (a volume…). */
  name?: string;
  unit: VariableUnit;
  points: readonly VariablePoint[];
  /** Counted events over the whole range, when the variable gives it. */
  total?: number;
}

/** A series as one number; null when it has no point. */
export function aggregate(
  series: Pick<NamedSeries, 'points' | 'total'>,
  how: Aggregation,
): number | null {
  const values = series.points.map((point) => point.avg);
  const last = series.points.at(-1)?.avg ?? null;
  if (how === 'sum') return series.total ?? values.reduce((sum, value) => sum + value, 0);
  if (values.length === 0) return series.total ?? null;
  switch (how) {
    case 'last':
      return series.total ?? last;
    case 'avg':
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
  }
}

/** The colour of a value: the rule with the highest threshold it reaches, if any. */
export function colorFor(value: number | null, rules: readonly ColorRule[]): RuleColor | null {
  if (value === null) return null;
  let chosen: ColorRule | undefined;
  for (const rule of rules) {
    if (value >= rule.from && (!chosen || rule.from >= chosen.from)) chosen = rule;
  }
  return chosen?.color ?? null;
}

/** The CSS colour of a rule colour (theme tokens). */
export function cssColor(color: RuleColor): string {
  return `var(--${color})`;
}

/** Rows for time charts: one per instant, one column per series key. */
export function chartRows(series: readonly NamedSeries[]): Record<string, number | string>[] {
  const rows = new Map<string, Record<string, number | string>>();
  for (const one of series) {
    for (const point of one.points) {
      const row = rows.get(point.at) ?? { at: point.at };
      row[one.key] = point.avg;
      rows.set(point.at, row);
    }
  }
  return [...rows.values()].sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/** How full a gauge is, from 0 to 1. */
export function gaugeShare(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/** A value in its unit, with a fixed number of decimals when the panel asks for one. */
export function formatPanelValue(
  value: number,
  unit: VariableUnit,
  decimals: number | null,
  locale: string,
): string {
  if (decimals === null || unit === 'bytes' || unit === 'bytesPerSecond') {
    return formatValue(value, unit, locale);
  }
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return unit === 'percent' ? `${number} %` : number;
}

/**
 * A series as people read it: the variable, and what it measures when there are several. A panel
 * of one variable names only the thing (the panel's title already says what is measured).
 */
export function seriesLabel(variable: string, name: string | undefined, alone: boolean): string {
  if (!name) return variable;
  return alone ? name : `${variable} · ${name}`;
}

/** A table with one row per measured thing and one column per variable (used, total…). */
export interface PivotTable {
  columns: { variable: string; unit: VariableUnit }[];
  rows: { name: string; values: (number | null)[] }[];
}

/**
 * Several variables measuring the same things (each volume's used and total space) read best side
 * by side; null when the series are not like that.
 */
export function pivotTable(series: readonly NamedSeries[], how: Aggregation): PivotTable | null {
  const named = series.flatMap((one) => (one.name ? [{ ...one, name: one.name }] : []));
  // The first series of each variable gives its column (and unit), in order of appearance.
  const columns: PivotTable['columns'] = [];
  for (const one of named) {
    if (!columns.some((column) => column.variable === one.variable)) {
      columns.push({ variable: one.variable, unit: one.unit });
    }
  }
  if (named.length < series.length || columns.length < 2) return null;
  const byKey = new Map(named.map((one) => [JSON.stringify([one.variable, one.name]), one]));
  const rows = [...new Set(named.map((one) => one.name))].map((name) => ({
    name,
    values: columns.map(({ variable }) => {
      const one = byKey.get(JSON.stringify([variable, name]));
      return one ? aggregate(one, how) : null;
    }),
  }));
  return { columns, rows };
}
