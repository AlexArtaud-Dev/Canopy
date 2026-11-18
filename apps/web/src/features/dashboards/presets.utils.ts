import {
  defaultPanelOptions,
  gridColumns,
  withDefaults,
  type ColorRule,
  type DashboardInput,
  type PanelDraft,
  type PanelOptions,
  type RefreshSeconds,
  type TimeRange,
} from './dashboards.utils';
import type { VariableDefinition } from './variables.utils';

/**
 * Ready-made dashboards, each about one subject. Everyone gets the overview; the others come
 * when the person may read at least one of their variables.
 */
export const presetKeys = ['overview', 'server', 'storage', 'activity', 'security'] as const;
export type PresetKey = (typeof presetKeys)[number];

/** Panels presets draw; each id is also its title's translation key. */
export const presetPanelIds = [
  'folders',
  'cpu',
  'cpu-gauge',
  'cpu-peak',
  'cpu-history',
  'memory',
  'memory-history',
  'network',
  'received',
  'sent',
  'space',
  'volumes',
  'by-volume',
  'trash',
  'trash-peak',
  'thumbnails',
  'thumbnails-peak',
  'extras',
  'operations',
  'running',
  'queued',
  'failed',
  'failures',
  'shares',
  'shares-history',
  'drop-offs',
  'drop-offs-history',
  'accounts',
  'sessions',
  'sessions-history',
  'denied',
  'denied-history',
  'audit',
] as const;
export type PresetPanelId = (typeof presetPanelIds)[number];

/** A panel of a preset; its place comes from the row it sits in. */
interface PresetPanel {
  id: PresetPanelId;
  type: PanelDraft['type'];
  variables: string[];
  /** Wanted width; panels left on a row share the whole width in these proportions. */
  w: number;
  options?: Partial<PanelOptions>;
  rules?: ColorRule[];
}

interface PresetRow {
  h: number;
  panels: PresetPanel[];
}

interface Preset {
  range: TimeRange;
  refreshSeconds: RefreshSeconds;
  rows: PresetRow[];
}

/** Amber, then red: what most thresholds paint with. */
const warnAt = (warn: number, alert: number): ColorRule[] => [
  { from: warn, color: 'chart-3' },
  { from: alert, color: 'destructive' },
];

const presets: Record<PresetKey, Preset> = {
  overview: {
    range: '24h',
    refreshSeconds: 60,
    rows: [
      {
        h: 2,
        panels: [
          { id: 'cpu', type: 'stat', variables: ['system.cpu'], w: 3, rules: warnAt(70, 90) },
          {
            id: 'memory',
            type: 'gauge',
            variables: ['system.memory.used', 'system.memory.total'],
            w: 3,
          },
          {
            id: 'operations',
            type: 'stat',
            variables: ['operations.running'],
            w: 3,
            rules: [{ from: 1, color: 'chart-1' }],
          },
          {
            id: 'drop-offs',
            type: 'stat',
            variables: ['shares.dropOffs'],
            w: 3,
            options: { aggregation: 'sum' },
            rules: [{ from: 1, color: 'chart-1' }],
          },
        ],
      },
      {
        h: 4,
        panels: [
          { id: 'folders', type: 'folders', variables: [], w: 4 },
          {
            id: 'space',
            type: 'area',
            variables: ['storage.volume.used'],
            w: 8,
            options: { stacked: true },
          },
        ],
      },
      {
        h: 4,
        panels: [
          {
            id: 'network',
            type: 'area',
            variables: ['system.network.received', 'system.network.sent'],
            w: 6,
          },
          { id: 'audit', type: 'log', variables: ['logs.audit'], w: 6 },
        ],
      },
    ],
  },
  server: {
    range: '6h',
    refreshSeconds: 30,
    rows: [
      {
        h: 3,
        panels: [
          {
            id: 'cpu-gauge',
            type: 'gauge',
            variables: ['system.cpu'],
            w: 3,
            options: { max: 100 },
            rules: warnAt(70, 90),
          },
          {
            id: 'memory',
            type: 'gauge',
            variables: ['system.memory.used', 'system.memory.total'],
            w: 3,
          },
          {
            id: 'cpu-peak',
            type: 'stat',
            variables: ['system.cpu'],
            w: 2,
            options: { aggregation: 'max' },
            rules: warnAt(70, 90),
          },
          {
            id: 'received',
            type: 'stat',
            variables: ['system.network.received'],
            w: 2,
            options: { aggregation: 'avg' },
          },
          {
            id: 'sent',
            type: 'stat',
            variables: ['system.network.sent'],
            w: 2,
            options: { aggregation: 'avg' },
          },
        ],
      },
      {
        h: 4,
        panels: [
          { id: 'cpu-history', type: 'line', variables: ['system.cpu'], w: 6 },
          {
            id: 'memory-history',
            type: 'area',
            variables: ['system.memory.used', 'system.memory.total'],
            w: 6,
          },
        ],
      },
      {
        h: 4,
        panels: [
          {
            id: 'network',
            type: 'area',
            variables: ['system.network.received', 'system.network.sent'],
            w: 12,
          },
        ],
      },
    ],
  },
  storage: {
    range: '7d',
    refreshSeconds: 300,
    rows: [
      {
        h: 4,
        panels: [
          {
            id: 'volumes',
            type: 'table',
            variables: ['storage.volume.used', 'storage.volume.total'],
            w: 5,
          },
          { id: 'by-volume', type: 'pie', variables: ['storage.volume.used'], w: 3 },
          {
            id: 'space',
            type: 'area',
            variables: ['storage.volume.used'],
            w: 4,
            options: { stacked: true },
          },
        ],
      },
      {
        h: 2,
        panels: [
          { id: 'trash', type: 'stat', variables: ['storage.trash'], w: 3 },
          { id: 'thumbnails', type: 'stat', variables: ['storage.thumbnails'], w: 3 },
          {
            id: 'trash-peak',
            type: 'stat',
            variables: ['storage.trash'],
            w: 3,
            options: { aggregation: 'max' },
          },
          {
            id: 'thumbnails-peak',
            type: 'stat',
            variables: ['storage.thumbnails'],
            w: 3,
            options: { aggregation: 'max' },
          },
        ],
      },
      {
        h: 4,
        panels: [
          {
            id: 'extras',
            type: 'area',
            variables: ['storage.trash', 'storage.thumbnails'],
            w: 12,
          },
        ],
      },
    ],
  },
  activity: {
    range: '24h',
    refreshSeconds: 60,
    rows: [
      {
        h: 2,
        panels: [
          { id: 'running', type: 'stat', variables: ['operations.running'], w: 3 },
          {
            id: 'queued',
            type: 'stat',
            variables: ['operations.queued'],
            w: 2,
            rules: warnAt(5, 20),
          },
          {
            id: 'failed',
            type: 'stat',
            variables: ['operations.failed'],
            w: 2,
            rules: warnAt(1, 5),
          },
          { id: 'shares', type: 'stat', variables: ['shares.active'], w: 2 },
          {
            id: 'drop-offs',
            type: 'stat',
            variables: ['shares.dropOffs'],
            w: 3,
            options: { aggregation: 'sum' },
            rules: [{ from: 1, color: 'chart-1' }],
          },
        ],
      },
      {
        h: 4,
        panels: [
          {
            id: 'operations',
            type: 'bar',
            variables: ['operations.running', 'operations.queued'],
            w: 8,
            options: { stacked: true },
          },
          {
            id: 'failures',
            type: 'bar',
            variables: ['operations.failed'],
            w: 4,
            rules: warnAt(1, 5),
          },
        ],
      },
      {
        h: 4,
        panels: [
          { id: 'drop-offs-history', type: 'bar', variables: ['shares.dropOffs'], w: 6 },
          { id: 'shares-history', type: 'area', variables: ['shares.active'], w: 6 },
        ],
      },
    ],
  },
  security: {
    range: '7d',
    refreshSeconds: 60,
    rows: [
      {
        h: 2,
        panels: [
          { id: 'accounts', type: 'stat', variables: ['users.accounts'], w: 4 },
          { id: 'sessions', type: 'stat', variables: ['users.sessions'], w: 4 },
          {
            id: 'denied',
            type: 'stat',
            variables: ['logs.denied'],
            w: 4,
            options: { aggregation: 'sum' },
            rules: warnAt(1, 10),
          },
        ],
      },
      {
        h: 4,
        panels: [
          { id: 'sessions-history', type: 'area', variables: ['users.sessions'], w: 6 },
          {
            id: 'denied-history',
            type: 'bar',
            variables: ['logs.denied'],
            w: 6,
            rules: warnAt(1, 10),
          },
        ],
      },
      {
        h: 5,
        panels: [{ id: 'audit', type: 'log', variables: ['logs.audit'], w: 12 }],
      },
    ],
  },
};

/** Items of a row, widened or narrowed to fill the grid in their wanted proportions (`w`). */
export function shareRow<T extends { w: number }>(items: readonly T[]): T[] {
  const total = items.reduce((sum, item) => sum + item.w, 0);
  let used = 0;
  return items.map((item, index) => {
    const remaining = items.length - index - 1;
    // Never narrower than a column, and always leaving one for each item after (the last one
    // takes what is left).
    const w =
      remaining === 0
        ? gridColumns - used
        : Math.min(
            gridColumns - used - remaining,
            Math.max(1, Math.round((item.w * gridColumns) / total)),
          );
    used += w;
    return { ...item, w };
  });
}

/** The panels of a preset the person may read, rows packed from the top. */
function presetPanels(
  preset: Preset,
  readable: ReadonlySet<string>,
  title: (panel: PresetPanelId) => string,
): PanelDraft[] {
  const drafts: PanelDraft[] = [];
  let y = 0;
  for (const row of preset.rows) {
    const shown = row.panels
      .map((panel) => ({ ...panel, variables: panel.variables.filter((id) => readable.has(id)) }))
      .filter((panel) => panel.type === 'folders' || panel.variables.length > 0);
    if (shown.length === 0) continue;
    let x = 0;
    for (const panel of shareRow(shown)) {
      drafts.push({
        id: panel.id,
        title: title(panel.id),
        type: panel.type,
        variables: panel.variables,
        layout: { x, y, w: panel.w, h: row.h },
        options: { ...defaultPanelOptions, ...panel.options },
        rules: panel.rules ?? [],
      });
      x += panel.w;
    }
    y += row.h;
  }
  return drafts;
}

/** The presets this person can use: the overview, plus those with a variable they may read. */
export function availablePresets(readable: readonly Pick<VariableDefinition, 'id'>[]): PresetKey[] {
  const has = new Set(readable.map((variable) => variable.id));
  return presetKeys.filter(
    (key) =>
      key === 'overview' ||
      presets[key].rows.some((row) =>
        row.panels.some((panel) => panel.variables.some((id) => has.has(id))),
      ),
  );
}

/** Texts a preset is written with, in the person's language. */
export interface PresetTexts {
  name: string;
  /** A panel's title from its id. */
  panel: (id: PresetPanelId) => string;
}

/** One preset as a dashboard, with only what the person may read. */
export function presetDashboard(
  key: PresetKey,
  readable: readonly Pick<VariableDefinition, 'id'>[],
  texts: PresetTexts,
): DashboardInput {
  const preset = presets[key];
  const has = new Set(readable.map((variable) => variable.id));
  return {
    name: texts.name,
    range: preset.range,
    refreshSeconds: preset.refreshSeconds,
    panels: presetPanels(preset, has, texts.panel).map(withDefaults),
  };
}
