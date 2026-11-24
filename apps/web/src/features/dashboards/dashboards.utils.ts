import { z } from 'zod';

import { timeRanges, type TimeRange, type VariableUnit } from './variables.utils';

/**
 * What a panel draws. `folders` lists the places the person can open (the default dashboard's
 * entry point); `disks` sums up disk health; `log` lists log lines; the others draw variables'
 * values.
 */
export const panelTypes = [
  'stat',
  'gauge',
  'line',
  'area',
  'bar',
  'pie',
  'table',
  'log',
  'folders',
  'disks',
] as const;
export type PanelType = (typeof panelTypes)[number];

/** How often a dashboard reloads its values, in seconds (0: only on demand). */
export const refreshOptions = [0, 30, 60, 300] as const;
export type RefreshSeconds = (typeof refreshOptions)[number];

/** Grid columns on a wide screen; panels say where they sit in them. */
export const gridColumns = 12;

/** How a series becomes one number (single value, gauge, pie, table). */
export const aggregations = ['last', 'avg', 'min', 'max', 'sum'] as const;
export type Aggregation = (typeof aggregations)[number];

/** Theme colours a rule can paint with (design tokens, readable in light and dark). */
export const ruleColors = [
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'primary',
  'destructive',
] as const;
export type RuleColor = (typeof ruleColors)[number];

/** From `from` upwards the value takes `color` (the highest threshold reached wins). */
export const colorRuleSchema = z.object({
  from: z.number(),
  color: z.enum(ruleColors),
});
export type ColorRule = z.infer<typeof colorRuleSchema>;

/** Where content sits in its panel, on each axis. */
export const alignments = ['start', 'center', 'end'] as const;
export type Alignment = (typeof alignments)[number];

export const panelOptionsSchema = z.object({
  aggregation: z.enum(aggregations).default('last'),
  /** Digits after the decimal point; null lets the unit decide. */
  decimals: z.number().int().min(0).max(4).nullable().default(null),
  legend: z.boolean().default(true),
  /** Areas and bars on top of each other rather than side by side. */
  stacked: z.boolean().default(false),
  /** Gauge bounds; with no maximum, a second variable gives it (used out of total), else 100. */
  min: z.number().default(0),
  max: z.number().nullable().default(null),
  /** Single values and gauges: where they sit in the panel (they grow with it). */
  alignX: z.enum(alignments).default('center'),
  alignY: z.enum(alignments).default('center'),
});
export type PanelOptions = z.infer<typeof panelOptionsSchema>;

export const defaultPanelOptions: PanelOptions = panelOptionsSchema.parse({});

export const panelSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  title: z.string().trim().max(80),
  type: z.enum(panelTypes),
  variables: z
    .array(
      z
        .string()
        .regex(/^[a-z]+(\.[a-zA-Z]+)+$/)
        .max(64),
    )
    .max(6),
  layout: z.object({
    x: z
      .number()
      .int()
      .min(0)
      .max(gridColumns - 1),
    y: z.number().int().min(0).max(500),
    w: z.number().int().min(1).max(gridColumns),
    h: z.number().int().min(1).max(12),
  }),
  options: panelOptionsSchema.default(defaultPanelOptions),
  rules: z.array(colorRuleSchema).max(8).default([]),
});
export type Panel = z.infer<typeof panelSchema>;

/** A panel before its options are chosen: they start at their defaults, with no colour rule. */
export type PanelDraft = Omit<Panel, 'options' | 'rules'> &
  Partial<Pick<Panel, 'options' | 'rules'>>;

export function withDefaults(draft: PanelDraft): Panel {
  return { ...draft, options: draft.options ?? defaultPanelOptions, rules: draft.rules ?? [] };
}

export const dashboardInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  range: z.enum(timeRanges),
  refreshSeconds: z.union(refreshOptions.map((value) => z.literal(value))),
  panels: z.array(panelSchema).max(40),
});
export type DashboardInput = z.infer<typeof dashboardInputSchema>;

export const dashboardIdSchema = z.object({ id: z.uuid() });

/** A dashboard as its owner sees it. */
export interface Dashboard extends DashboardInput {
  id: string;
  isHome: boolean;
  /** ISO 8601. */
  updatedAt: string;
}

/** Panels in reading order: top to bottom, then left to right (the phone's single column). */
export function readingOrder(panels: readonly Panel[]): Panel[] {
  return [...panels].sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x);
}

/** A value as people read it, in its unit. */
export function formatValue(value: number, unit: VariableUnit, locale: string): string {
  const number = (digits: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
  switch (unit) {
    case 'percent':
      return `${number(1)} %`;
    case 'bytes':
      return formatSize(value, locale);
    case 'bytesPerSecond':
      return `${formatSize(value, locale)}/s`;
    case 'count':
      return number(0);
    case 'celsius':
      return `${number(0)} °C`;
  }
}

const sizeUnits = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

function formatSize(bytes: number, locale: string): string {
  let value = Math.max(0, bytes);
  let unit: string = sizeUnits[0];
  for (const next of sizeUnits.slice(1)) {
    if (value < 1024) break;
    value /= 1024;
    unit = next;
  }
  const digits = unit === sizeUnits[0] || value >= 100 ? 0 : 1;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${unit}`;
}

export type { TimeRange };
