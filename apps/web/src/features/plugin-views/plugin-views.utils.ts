import { z } from 'zod';

import type { CommandEntry, PluginView, PluginViewAction } from '@canopy/contracts';

/** A view as the person may open it, with the plugin it comes from. */
export interface ViewRef {
  pluginId: string;
  pluginName: CommandEntry['name'];
  view: PluginView;
}

/** The views of the catalog the person may open (permission held, or administrator), once each. */
export function viewsOf(
  entries: readonly CommandEntry[],
  may: (permission: string) => boolean,
): ViewRef[] {
  const found = new Map<string, ViewRef>();
  for (const { plugin } of entries) {
    if (!plugin) continue;
    for (const view of plugin.views ?? []) {
      const key = `${plugin.id}/${view.id}`;
      if (found.has(key) || !may(view.permission)) continue;
      found.set(key, { pluginId: plugin.id, pluginName: plugin.name, view });
    }
  }
  return [...found.values()];
}

export function viewHref(pluginId: string, viewId: string): string {
  return `/views/${pluginId}/${viewId}`;
}

export const viewRefSchema = z.object({
  plugin: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/),
  view: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
});

/** Ids the person picks: digits, letters, dots, dashes (whatever the plugin uses), comma joined. */
const rowId = z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/);

export const viewActionInputSchema = viewRefSchema.extend({
  action: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  groups: z.array(rowId).max(500).default([]),
  items: z.array(rowId).max(500).default([]),
  input: z.string().max(10_000).optional(),
});
export type ViewActionInput = z.infer<typeof viewActionInputSchema>;

/** A row of a section; plugins may add more fields, which are ignored. */
export interface ViewRow {
  id: string;
  name: string;
  state: string | null;
  status: string | null;
  progress: number | null;
  bytesLoaded: number | null;
  bytesTotal: number | null;
  speed: number | null;
  eta: number | null;
  /** Where it comes from or goes (host, folder). */
  detail: string | null;
  enabled: boolean;
  items: ViewRow[];
}

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(fields: Fields, key: string): number | null {
  const value = fields[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(fields: Fields, key: string): string | null {
  const value = fields[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function share(value: number | null): number | null {
  return value === null ? null : Math.min(1, Math.max(0, value));
}

/** One row, or null when it has no usable id (it is then left out, not the whole view). */
function toRow(candidate: unknown, depth: number): ViewRow | null {
  if (!isFields(candidate)) return null;
  const rawId = candidate.id;
  const id =
    typeof rawId === 'number' && Number.isFinite(rawId)
      ? String(rawId)
      : typeof rawId === 'string' && rawId !== ''
        ? rawId
        : null;
  if (id === null) return null;
  const children = candidate.items;
  return {
    id,
    name: str(candidate, 'name') ?? id,
    state: str(candidate, 'state'),
    status: str(candidate, 'status'),
    progress: share(num(candidate, 'progress')),
    bytesLoaded: num(candidate, 'bytes_loaded'),
    bytesTotal: num(candidate, 'bytes_total'),
    speed: num(candidate, 'speed'),
    eta: num(candidate, 'eta'),
    detail: str(candidate, 'host') ?? str(candidate, 'folder'),
    enabled: candidate.enabled !== false,
    // Rows hold items one level deep (packages and their links).
    items: depth === 0 && Array.isArray(children) ? toRows(children, 1) : [],
  };
}

function toRows(raw: readonly unknown[], depth: number): ViewRow[] {
  return raw.flatMap((candidate) => {
    const row = toRow(candidate, depth);
    return row ? [row] : [];
  });
}

export interface ViewSummary {
  active: boolean;
  /** The plugin's own state word (`running`, `paused`…), labelled by the view's states. */
  state: string | null;
  progress: number | null;
  speed: number | null;
  eta: number | null;
  bytesLoaded: number | null;
  bytesTotal: number | null;
}

export interface ViewData {
  summary: ViewSummary;
  sections: Record<string, ViewRow[]>;
}

/** What the plugin printed, read leniently: unknown fields ignored, rows without an id dropped. */
export function parseViewData(
  raw: Readonly<Record<string, unknown>>,
  view: Pick<PluginView, 'sections'>,
): ViewData {
  const summary = isFields(raw.summary) ? raw.summary : {};
  const sections: Record<string, ViewRow[]> = {};
  for (const section of view.sections) {
    const rows = raw[section.key];
    sections[section.key] = Array.isArray(rows) ? toRows(rows, 0) : [];
  }
  return {
    summary: {
      active: summary.active === true,
      state: str(summary, 'state') ?? str(summary, 'controller'),
      progress: share(num(summary, 'progress')),
      speed: num(summary, 'speed'),
      eta: num(summary, 'eta'),
      bytesLoaded: num(summary, 'bytes_loaded'),
      bytesTotal: num(summary, 'bytes_total'),
    },
    sections,
  };
}

/** The values an action's command gets: the chosen ids, comma joined, and the typed input. */
export function actionValues(
  action: Pick<PluginViewAction, 'groups' | 'items' | 'input'>,
  chosen: { groups: readonly string[]; items: readonly string[]; input?: string | undefined },
): Record<string, string> {
  const values: Record<string, string> = {};
  if (action.groups && chosen.groups.length > 0) values[action.groups] = chosen.groups.join(',');
  if (action.items && chosen.items.length > 0) values[action.items] = chosen.items.join(',');
  if (action.input && chosen.input !== undefined) values[action.input] = chosen.input;
  return values;
}

/** Whether a row action can apply to what is chosen (its params take groups, items or both). */
export function actionApplies(
  action: Pick<PluginViewAction, 'groups' | 'items'>,
  chosen: { groups: readonly string[]; items: readonly string[] },
): boolean {
  const total = chosen.groups.length + chosen.items.length;
  if (total === 0) return false;
  if (chosen.groups.length > 0 && !action.groups) return false;
  return !(chosen.items.length > 0 && !action.items);
}

/** Seconds as people read them: "45 s", "3 min", "1 h 05". */
export function formatEta(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return `${String(whole)} s`;
  const minutes = Math.round(whole / 60);
  if (minutes < 60) return `${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  return `${String(hours)} h ${String(minutes % 60).padStart(2, '0')}`;
}
