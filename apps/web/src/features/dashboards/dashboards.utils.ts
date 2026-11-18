import { z } from 'zod';

import {
  timeRanges,
  type TimeRange,
  type VariableDefinition,
  type VariableUnit,
} from './variables.utils';

/**
 * What a panel draws. `folders` lists the places the person can open (the default dashboard's
 * entry point); the others draw variables.
 */
export const panelTypes = ['stat', 'line', 'log', 'folders'] as const;
export type PanelType = (typeof panelTypes)[number];

/** How often a dashboard reloads its values, in seconds (0: only on demand). */
export const refreshOptions = [0, 30, 60, 300] as const;
export type RefreshSeconds = (typeof refreshOptions)[number];

/** Grid columns on a wide screen; panels say where they sit in them. */
export const gridColumns = 12;

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
});
export type Panel = z.infer<typeof panelSchema>;

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

/** Texts the default dashboard is named with, in the person's language. */
export interface DefaultTexts {
  name: string;
  folders: string;
  space: string;
  operations: string;
  dropOffs: string;
  audit: string;
}

/**
 * The dashboard everyone starts with, from what they may read: their folders first, then the
 * space of the volumes, the operations, the drop-offs and the audit log when their roles allow.
 */
export function defaultDashboard(
  readable: readonly Pick<VariableDefinition, 'id'>[],
  texts: DefaultTexts,
): DashboardInput {
  const has = new Set(readable.map((variable) => variable.id));
  const wide = !has.has('storage.volume.used');
  const panels: Panel[] = [
    {
      id: 'folders',
      title: texts.folders,
      type: 'folders',
      variables: [],
      // Alone on its row when there is no space chart beside it.
      layout: { x: 0, y: 0, w: wide ? gridColumns : 4, h: wide ? 3 : 4 },
    },
  ];
  if (has.has('storage.volume.used')) {
    panels.push({
      id: 'space',
      title: texts.space,
      type: 'line',
      variables: ['storage.volume.used'],
      layout: { x: 4, y: 0, w: 8, h: 4 },
    });
  }
  const below = [
    { id: 'operations', title: texts.operations, variable: 'operations.running' },
    { id: 'drop-offs', title: texts.dropOffs, variable: 'shares.dropOffs' },
  ].filter((panel) => has.has(panel.variable));
  below.forEach((panel, index) => {
    panels.push({
      id: panel.id,
      title: panel.title,
      type: 'stat',
      variables: [panel.variable],
      layout: { x: index * 3, y: wide ? 3 : 4, w: 3, h: 2 },
    });
  });
  if (has.has('logs.audit')) {
    panels.push({
      id: 'audit',
      title: texts.audit,
      type: 'log',
      variables: ['logs.audit'],
      layout: {
        x: below.length * 3,
        y: wide ? 3 : 4,
        w: gridColumns - below.length * 3,
        h: 4,
      },
    });
  }
  return { name: texts.name, range: '24h', refreshSeconds: 60, panels };
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
