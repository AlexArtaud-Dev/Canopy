import { gridColumns, type Panel } from './dashboards.utils';

/** Where a panel sits, as the grid library reads and reports it. */
export interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The tallest a panel may be, in rows (as the panel schema allows). */
export const maxPanelRows = 12;

export function gridItems(panels: readonly Panel[]): GridItem[] {
  return panels.map((panel) => ({ i: panel.id, ...panel.layout }));
}

/** Clamps a place to the grid: inside the columns, at least one cell. */
function clamp(item: Pick<GridItem, 'x' | 'y' | 'w' | 'h'>): Panel['layout'] {
  const w = Math.min(gridColumns, Math.max(1, Math.round(item.w)));
  return {
    w,
    h: Math.min(maxPanelRows, Math.max(1, Math.round(item.h))),
    x: Math.min(gridColumns - w, Math.max(0, Math.round(item.x))),
    y: Math.max(0, Math.round(item.y)),
  };
}

/** The panels placed as the grid reports; panels it does not mention keep their place. */
export function applyGrid(panels: readonly Panel[], items: readonly GridItem[]): Panel[] {
  const byId = new Map(items.map((item) => [item.i, item]));
  return panels.map((panel) => {
    const item = byId.get(panel.id);
    return item ? { ...panel, layout: clamp(item) } : panel;
  });
}

/** Keyboard moves, for those who do not drag. */
export const nudges = [
  'left',
  'right',
  'up',
  'down',
  'narrower',
  'wider',
  'shorter',
  'taller',
] as const;
export type Nudge = (typeof nudges)[number];

/** One step of a keyboard move on a panel, kept inside the grid. */
export function nudgePanel(panels: readonly Panel[], id: string, nudge: Nudge): Panel[] {
  return panels.map((panel) => {
    if (panel.id !== id) return panel;
    const { x, y, w, h } = panel.layout;
    const moved = {
      left: { x: x - 1, y, w, h },
      right: { x: x + 1, y, w, h },
      up: { x, y: y - 1, w, h },
      down: { x, y: y + 1, w, h },
      narrower: { x, y, w: w - 1, h },
      wider: { x, y, w: w + 1, h },
      shorter: { x, y, w, h: h - 1 },
      taller: { x, y, w, h: h + 1 },
    }[nudge];
    return { ...panel, layout: clamp(moved) };
  });
}
