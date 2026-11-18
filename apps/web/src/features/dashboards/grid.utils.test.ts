import { withDefaults, type Panel } from './dashboards.utils';
import { applyGrid, gridItems, maxPanelRows, nudgePanel, nudges } from './grid.utils';

const panel = (id: string, layout: Panel['layout']): Panel =>
  withDefaults({ id, title: id, type: 'stat', variables: [], layout });

const panels = [panel('a', { x: 0, y: 0, w: 4, h: 2 }), panel('b', { x: 4, y: 0, w: 8, h: 4 })];

describe('grid', () => {
  it('hands the grid its items and takes their new places back', () => {
    expect(gridItems(panels)).toEqual([
      { i: 'a', x: 0, y: 0, w: 4, h: 2 },
      { i: 'b', x: 4, y: 0, w: 8, h: 4 },
    ]);
    const moved = applyGrid(panels, [{ i: 'a', x: 2.4, y: 3, w: 6, h: 3 }]);
    expect(moved[0]?.layout).toEqual({ x: 2, y: 3, w: 6, h: 3 });
    expect(moved[1]).toBe(panels[1]);
  });

  it('keeps every place inside the grid', () => {
    const [clamped] = applyGrid(panels, [{ i: 'a', x: 11, y: -2, w: 20, h: 40 }]);
    expect(clamped?.layout).toEqual({ x: 0, y: 0, w: 12, h: maxPanelRows });
    const [small] = applyGrid(panels, [{ i: 'a', x: 11, y: 0, w: 0, h: 0 }]);
    expect(small?.layout).toEqual({ x: 11, y: 0, w: 1, h: 1 });
  });

  it('moves and resizes one step at a time from the keyboard', () => {
    const at = (move: (typeof nudges)[number]) => nudgePanel(panels, 'a', move)[0]?.layout;
    expect(at('right')).toEqual({ x: 1, y: 0, w: 4, h: 2 });
    expect(at('left')).toEqual({ x: 0, y: 0, w: 4, h: 2 });
    expect(at('down')).toEqual({ x: 0, y: 1, w: 4, h: 2 });
    expect(at('up')).toEqual({ x: 0, y: 0, w: 4, h: 2 });
    expect(at('wider')).toEqual({ x: 0, y: 0, w: 5, h: 2 });
    expect(at('narrower')).toEqual({ x: 0, y: 0, w: 3, h: 2 });
    expect(at('taller')).toEqual({ x: 0, y: 0, w: 4, h: 3 });
    expect(at('shorter')).toEqual({ x: 0, y: 0, w: 4, h: 1 });
    expect(nudgePanel(panels, 'a', 'right')[1]).toBe(panels[1]);
    expect(nudges).toHaveLength(8);
  });
});
