import {
  dashboardIdSchema,
  dashboardInputSchema,
  formatValue,
  panelSchema,
  panelTypes,
  aggregations,
  alignments,
  colorRuleSchema,
  panelOptionsSchema,
  defaultPanelOptions,
  ruleColors,
  readingOrder,
  refreshOptions,
  withDefaults,
  type Panel,
} from './dashboards.utils';

const ids = (panels: readonly Panel[]) => panels.map((panel) => panel.id);

describe('panels', () => {
  const panel = (id: string, x: number, y: number): Panel =>
    withDefaults({
      id,
      title: id,
      type: 'stat',
      variables: ['system.cpu'],
      layout: { x, y, w: 3, h: 2 },
    });

  it('read top to bottom, then left to right', () => {
    expect(ids(readingOrder([panel('c', 0, 4), panel('b', 6, 0), panel('a', 0, 0)]))).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('stay inside the grid and name real variables', () => {
    expect(panelSchema.safeParse(panel('ok', 0, 0)).success).toBe(true);
    expect(
      panelSchema.safeParse({ ...panel('x', 0, 0), layout: { x: 12, y: 0, w: 1, h: 1 } }).success,
    ).toBe(false);
    expect(
      panelSchema.safeParse({ ...panel('x', 0, 0), variables: ['not a variable'] }).success,
    ).toBe(false);
    expect(panelSchema.safeParse({ ...panel('X', 0, 0) }).success).toBe(false);
  });

  it('come in known types, on dashboards named by id', () => {
    expect(panelTypes).toContain('gauge');
    expect(aggregations).toEqual(['last', 'avg', 'min', 'max', 'sum']);
    expect(ruleColors).toContain('destructive');
    expect(colorRuleSchema.safeParse({ from: 80, color: 'destructive' }).success).toBe(true);
    expect(colorRuleSchema.safeParse({ from: 80, color: 'pink' }).success).toBe(false);
    expect(panelOptionsSchema.safeParse({ decimals: 9 }).success).toBe(false);
    expect(defaultPanelOptions).toEqual({
      aggregation: 'last',
      decimals: null,
      legend: true,
      stacked: false,
      min: 0,
      max: null,
      alignX: 'center',
      alignY: 'center',
    });
    expect(alignments).toEqual(['start', 'center', 'end']);
    expect(
      dashboardIdSchema.safeParse({ id: '00000000-0000-4000-8000-000000000000' }).success,
    ).toBe(true);
    expect(dashboardIdSchema.safeParse({ id: 'x' }).success).toBe(false);
  });

  it('refresh at known intervals only', () => {
    expect(refreshOptions).toEqual([0, 30, 60, 300]);
    const base = { name: 'n', range: '1h', panels: [] };
    expect(dashboardInputSchema.safeParse({ ...base, refreshSeconds: 30 }).success).toBe(true);
    expect(dashboardInputSchema.safeParse({ ...base, refreshSeconds: 45 }).success).toBe(false);
  });
});

describe('values', () => {
  it('are written in their unit', () => {
    expect(formatValue(42.37, 'percent', 'en')).toBe('42.4 %');
    expect(formatValue(1536, 'bytes', 'en')).toBe('1.5 KB');
    expect(formatValue(41.6, 'celsius', 'en')).toBe('42 °C');
    expect(formatValue(512, 'bytes', 'en')).toBe('512 B');
    expect(formatValue(150 * 1024 * 1024, 'bytes', 'en')).toBe('150 MB');
    expect(formatValue(-5, 'bytes', 'en')).toBe('0 B');
    expect(formatValue(2048, 'bytesPerSecond', 'en')).toBe('2 KB/s');
    expect(formatValue(1234.6, 'count', 'en')).toBe('1,235');
  });
});
