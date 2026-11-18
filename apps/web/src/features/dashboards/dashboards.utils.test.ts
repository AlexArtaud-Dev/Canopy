import {
  dashboardIdSchema,
  dashboardInputSchema,
  defaultDashboard,
  formatValue,
  gridColumns,
  panelSchema,
  panelTypes,
  readingOrder,
  refreshOptions,
  type Panel,
} from './dashboards.utils';

const texts = {
  name: 'Mine',
  folders: 'Folders',
  space: 'Space',
  operations: 'Operations',
  dropOffs: 'Drop-offs',
  audit: 'Activity',
};

const ids = (panels: readonly Panel[]) => panels.map((panel) => panel.id);

describe('default dashboard', () => {
  it('always starts with the person’s folders, alone on its row without a space chart', () => {
    const dashboard = defaultDashboard([], texts);
    expect(dashboard).toMatchObject({ name: 'Mine', range: '24h', refreshSeconds: 60 });
    expect(ids(dashboard.panels)).toEqual(['folders']);
    expect(dashboard.panels[0]?.layout.w).toBe(gridColumns);
  });

  it('adds what the person may read, and nothing else', () => {
    const everything = defaultDashboard(
      ['storage.volume.used', 'operations.running', 'shares.dropOffs', 'logs.audit'].map((id) => ({
        id,
      })),
      texts,
    );
    expect(ids(everything.panels)).toEqual([
      'folders',
      'space',
      'operations',
      'drop-offs',
      'audit',
    ]);
    expect(everything.panels[0]?.layout.w).toBe(4);
    const audit = everything.panels.find((panel) => panel.id === 'audit');
    expect(audit?.layout).toEqual({ x: 6, y: 4, w: 6, h: 4 });

    const sharesOnly = defaultDashboard([{ id: 'shares.dropOffs' }], texts);
    expect(ids(sharesOnly.panels)).toEqual(['folders', 'drop-offs']);
    expect(sharesOnly.panels[1]?.layout.y).toBe(3);
  });

  it('gives the audit log the full width when nothing sits beside it', () => {
    const auditOnly = defaultDashboard([{ id: 'logs.audit' }], texts);
    expect(auditOnly.panels[1]?.layout).toEqual({ x: 0, y: 3, w: gridColumns, h: 4 });
  });

  it('builds panels its own schema accepts', () => {
    const dashboard = defaultDashboard(
      ['storage.volume.used', 'logs.audit'].map((id) => ({ id })),
      texts,
    );
    expect(dashboardInputSchema.safeParse(dashboard).success).toBe(true);
  });
});

describe('panels', () => {
  const panel = (id: string, x: number, y: number): Panel => ({
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
    expect(panelTypes).toEqual(['stat', 'line', 'log', 'folders']);
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
    expect(formatValue(512, 'bytes', 'en')).toBe('512 B');
    expect(formatValue(150 * 1024 * 1024, 'bytes', 'en')).toBe('150 MB');
    expect(formatValue(-5, 'bytes', 'en')).toBe('0 B');
    expect(formatValue(2048, 'bytesPerSecond', 'en')).toBe('2 KB/s');
    expect(formatValue(1234.6, 'count', 'en')).toBe('1,235');
  });
});
