import { dashboardInputSchema, gridColumns, type Panel } from './dashboards.utils';
import {
  availablePresets,
  presetDashboard,
  presetKeys,
  presetPanelIds,
  shareRow,
  type PresetKey,
} from './presets.utils';

const engine = [
  'system.cpu',
  'system.memory.used',
  'system.memory.total',
  'system.network.received',
  'system.network.sent',
  'storage.volume.used',
  'storage.volume.total',
  'storage.trash',
  'storage.thumbnails',
  'operations.running',
  'operations.queued',
  'operations.failed',
];
const web = [
  'shares.active',
  'shares.dropOffs',
  'users.accounts',
  'users.sessions',
  'logs.denied',
  'logs.audit',
];
const all = [...engine, ...web].map((id) => ({ id }));

const texts = (key: PresetKey) => ({ name: key, panel: (id: string) => `title:${id}` });
const ids = (panels: readonly Panel[]) => panels.map((panel) => panel.id);

/** Every row is filled to the grid's width, without overlaps. */
function rowsAreFull(panels: readonly Panel[]) {
  const rows = new Map<number, Panel[]>();
  for (const panel of panels)
    rows.set(panel.layout.y, [...(rows.get(panel.layout.y) ?? []), panel]);
  for (const row of rows.values()) {
    const sorted = [...row].sort((a, b) => a.layout.x - b.layout.x);
    let x = 0;
    for (const panel of sorted) {
      expect(panel.layout.x).toBe(x);
      x += panel.layout.w;
    }
    expect(x).toBe(gridColumns);
  }
}

describe('presets', () => {
  it('offer the overview to everyone, and the others to those who may read them', () => {
    expect(availablePresets([])).toEqual(['overview']);
    expect(availablePresets([{ id: 'logs.audit' }])).toEqual(['overview', 'security']);
    expect(availablePresets([{ id: 'storage.trash' }])).toEqual(['overview', 'storage']);
    expect(availablePresets(all)).toEqual([...presetKeys]);
  });

  it('give someone who reads nothing their folders, across the whole width', () => {
    const overview = presetDashboard('overview', [], texts('overview'));
    expect(overview).toMatchObject({ name: 'overview', range: '24h', refreshSeconds: 60 });
    expect(overview.panels.map((panel) => panel.layout)).toEqual([
      { x: 0, y: 0, w: gridColumns, h: 4 },
    ]);
    expect(overview.panels[0]?.title).toBe('title:folders');
  });

  it('keep only the variables the person may read, closing the gaps', () => {
    const overview = presetDashboard(
      'overview',
      [{ id: 'shares.dropOffs' }, { id: 'logs.audit' }],
      texts('overview'),
    );
    expect(ids(overview.panels)).toEqual(['drop-offs', 'folders', 'audit']);
    expect(overview.panels.map((panel) => panel.layout)).toEqual([
      { x: 0, y: 0, w: 12, h: 2 },
      { x: 0, y: 2, w: 12, h: 4 },
      { x: 0, y: 6, w: 12, h: 4 },
    ]);
    const memory = presetDashboard('server', [{ id: 'system.memory.used' }], texts('server'));
    expect(memory.panels.find((panel) => panel.id === 'memory')?.variables).toEqual([
      'system.memory.used',
    ]);
  });

  it('carry their options and colour rules', () => {
    const activity = presetDashboard('activity', all, texts('activity'));
    const dropOffs = activity.panels.find((panel) => panel.id === 'drop-offs');
    expect(dropOffs?.options.aggregation).toBe('sum');
    expect(dropOffs?.options.alignX).toBe('center');
    expect(activity.panels.find((panel) => panel.id === 'failed')?.rules).toHaveLength(2);
    expect(activity.panels.find((panel) => panel.id === 'running')?.rules).toEqual([]);
  });

  it.each(presetKeys)('build a full, valid %s dashboard', (key) => {
    const dashboard = presetDashboard(key, all, texts(key));
    expect(dashboardInputSchema.safeParse(dashboard).success).toBe(true);
    expect(dashboard.panels.length).toBeGreaterThan(3);
    expect(new Set(ids(dashboard.panels)).size).toBe(dashboard.panels.length);
    for (const id of ids(dashboard.panels)) expect(presetPanelIds).toContain(id);
    rowsAreFull(dashboard.panels);
  });
});

describe('row widths', () => {
  const widths = (wanted: number[]) => shareRow(wanted.map((w) => ({ w }))).map((item) => item.w);

  it('fill the grid in the wanted proportions', () => {
    expect(widths([4, 8])).toEqual([4, 8]);
    expect(widths([3, 3])).toEqual([6, 6]);
    expect(widths([3, 2, 2, 2, 3])).toEqual([3, 2, 2, 2, 3]);
    expect(widths([5])).toEqual([12]);
    expect(widths([1, 40])).toEqual([1, 11]);
    expect(widths([1, 20, 1])).toEqual([1, 10, 1]);
  });
});
