import { gridColumns, withDefaults, type Panel, type PanelType } from '../dashboards.utils';
import type { VariableKind } from '../variables.utils';

/** A panel draws at most this many variables (series of several volumes count as one variable). */
export const maxPanelVariables = 6;

/** What the editor offers for a panel type. */
export interface EditorFeatures {
  /** Variable kinds the type draws; none for the folders list. */
  kinds: readonly VariableKind[];
  maxVariables: number;
  /** Values become one number (single value, gauge, ring, table). */
  aggregation: boolean;
  /** Values are written out (decimals apply). */
  values: boolean;
  gauge: boolean;
  legend: boolean;
  stacked: boolean;
  rules: boolean;
  /** Content grows with the panel and can be placed in it. */
  align: boolean;
}

export function editorFeatures(type: PanelType): EditorFeatures {
  const none: EditorFeatures = {
    kinds: [],
    maxVariables: 0,
    aggregation: false,
    values: false,
    gauge: false,
    legend: false,
    stacked: false,
    rules: false,
    align: false,
  };
  const values = {
    ...none,
    kinds: ['series'] as const,
    maxVariables: maxPanelVariables,
    values: true,
    rules: true,
  };
  switch (type) {
    case 'folders':
      return none;
    case 'log':
      return { ...none, kinds: ['log'], maxVariables: 1 };
    case 'stat':
      return { ...values, maxVariables: 1, aggregation: true, align: true };
    case 'gauge':
      return { ...values, maxVariables: 2, aggregation: true, gauge: true, align: true };
    case 'pie':
    case 'table':
      return { ...values, aggregation: true, legend: type === 'pie' };
    case 'line':
      return { ...values, legend: true, rules: false };
    case 'area':
      return { ...values, legend: true, stacked: true, rules: false };
    case 'bar':
      return { ...values, legend: true, stacked: true };
  }
}

/** Sizes offered until panels can be resized on the grid. */
export interface PanelSize {
  id: string;
  name: 'small' | 'medium' | 'wide' | 'large' | 'full';
  w: number;
  h: number;
}

export const panelSizes: readonly PanelSize[] = [
  { id: '3x2', name: 'small', w: 3, h: 2 },
  { id: '4x4', name: 'medium', w: 4, h: 4 },
  { id: '6x4', name: 'wide', w: 6, h: 4 },
  { id: '8x5', name: 'large', w: 8, h: 5 },
  { id: '12x4', name: 'full', w: gridColumns, h: 4 },
];

/** A new panel, placed under the others, with an id no other panel of the dashboard has. */
export function newPanel(existing: readonly Panel[], title: string, random: () => string): Panel {
  const ids = new Set(existing.map((panel) => panel.id));
  let id = `p-${random()}`;
  while (ids.has(id)) id = `p-${random()}`;
  const bottom = existing.reduce(
    (lowest, panel) => Math.max(lowest, panel.layout.y + panel.layout.h),
    0,
  );
  return withDefaults({
    id,
    title,
    type: 'line',
    variables: [],
    layout: { x: 0, y: bottom, w: 6, h: 4 },
  });
}

/** A copy of a panel, placed under the others. */
export function copyPanel(source: Panel, existing: readonly Panel[], random: () => string): Panel {
  const placed = newPanel(existing, source.title, random);
  return { ...source, id: placed.id, layout: { ...source.layout, x: 0, y: placed.layout.y } };
}
