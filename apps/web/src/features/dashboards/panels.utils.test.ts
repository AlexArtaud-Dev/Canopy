import {
  aggregate,
  chartRows,
  colorFor,
  cssColor,
  formatPanelValue,
  gaugeShare,
  pivotTable,
  seriesLabel,
  type NamedSeries,
} from './panels.utils';
import { copyPanel, editorFeatures, maxPanelVariables, newPanel } from './ui/panel-editor.utils';
import { panelTypes, withDefaults } from './dashboards.utils';

const points = (values: number[]) =>
  values.map((value, index) => ({
    at: `2026-11-18T10:0${String(index)}:00.000Z`,
    avg: value,
    min: value,
    max: value,
  }));

describe('aggregations', () => {
  const series = { points: points([4, 1, 7]) };

  it('turn a series into one number', () => {
    expect(aggregate(series, 'last')).toBe(7);
    expect(aggregate(series, 'avg')).toBe(4);
    expect(aggregate(series, 'min')).toBe(1);
    expect(aggregate(series, 'max')).toBe(7);
    expect(aggregate(series, 'sum')).toBe(12);
  });

  it('prefer the counted total of events, and say when there is nothing', () => {
    expect(aggregate({ points: points([1, 2]), total: 9 }, 'last')).toBe(9);
    expect(aggregate({ points: points([1, 2]), total: 9 }, 'sum')).toBe(9);
    expect(aggregate({ points: [], total: 0 }, 'avg')).toBe(0);
    expect(aggregate({ points: [] }, 'max')).toBeNull();
    expect(aggregate({ points: [] }, 'sum')).toBe(0);
  });
});

describe('colour rules', () => {
  const rules = [
    { from: 80, color: 'destructive' as const },
    { from: 0, color: 'chart-1' as const },
    { from: 50, color: 'chart-4' as const },
  ];

  it('paint a value with the highest threshold it reaches', () => {
    expect(colorFor(10, rules)).toBe('chart-1');
    expect(colorFor(60, rules)).toBe('chart-4');
    expect(colorFor(95, rules)).toBe('destructive');
    expect(colorFor(-1, rules)).toBeNull();
    expect(colorFor(null, rules)).toBeNull();
    expect(colorFor(5, [])).toBeNull();
    expect(cssColor('chart-2')).toBe('var(--chart-2)');
  });
});

describe('charts', () => {
  it('put the series side by side, one row per instant in time order', () => {
    const series: NamedSeries[] = [
      { key: 's0', label: 'a', variable: 'a', unit: 'count', points: points([1, 2]) },
      { key: 's1', label: 'b', variable: 'b', unit: 'count', points: points([5]) },
    ];
    expect(chartRows([...series].reverse())).toEqual([
      { at: '2026-11-18T10:00:00.000Z', s0: 1, s1: 5 },
      { at: '2026-11-18T10:01:00.000Z', s0: 2 },
    ]);
  });

  it('fill gauges between their bounds', () => {
    expect(gaugeShare(50, 0, 100)).toBe(0.5);
    expect(gaugeShare(150, 0, 100)).toBe(1);
    expect(gaugeShare(-5, 0, 100)).toBe(0);
    expect(gaugeShare(5, 10, 10)).toBe(0);
  });

  it('write values with the decimals asked, sizes in their own unit', () => {
    expect(formatPanelValue(12.345, 'percent', 1, 'en')).toBe('12.3 %');
    expect(formatPanelValue(3, 'count', 2, 'en')).toBe('3.00');
    expect(formatPanelValue(3.7, 'count', null, 'en')).toBe('4');
    expect(formatPanelValue(2048, 'bytes', 3, 'en')).toBe('2 KB');
    expect(formatPanelValue(2048, 'bytesPerSecond', 0, 'en')).toBe('2 KB/s');
  });
});

describe('editor', () => {
  it('offers what each type can use', () => {
    for (const type of panelTypes) {
      const features = editorFeatures(type);
      expect(features.maxVariables).toBeLessThanOrEqual(maxPanelVariables);
    }
    expect(editorFeatures('folders').kinds).toEqual([]);
    expect(editorFeatures('log')).toMatchObject({ kinds: ['log'], maxVariables: 1 });
    expect(editorFeatures('stat')).toMatchObject({
      maxVariables: 1,
      aggregation: true,
      rules: true,
      align: true,
    });
    expect(editorFeatures('gauge')).toMatchObject({ maxVariables: 2, gauge: true });
    expect(editorFeatures('pie')).toMatchObject({ aggregation: true, legend: true });
    expect(editorFeatures('table')).toMatchObject({ aggregation: true, legend: false });
    expect(editorFeatures('line')).toMatchObject({ legend: true, rules: false, stacked: false });
    expect(editorFeatures('area')).toMatchObject({ stacked: true, rules: false });
    expect(editorFeatures('bar')).toMatchObject({ stacked: true, rules: true });
  });

  it('places new panels under the others, with fresh ids', () => {
    const ids = ['taken', 'fresh'];
    const random = () => ids.shift() ?? 'last';
    const existing = [
      withDefaults({
        id: 'p-taken',
        title: 't',
        type: 'stat',
        variables: [],
        layout: { x: 0, y: 0, w: 3, h: 2 },
      }),
      withDefaults({
        id: 'p-b',
        title: 'b',
        type: 'stat',
        variables: [],
        layout: { x: 3, y: 2, w: 3, h: 4 },
      }),
    ];
    const created = newPanel(existing, 'New', random);
    expect(created).toMatchObject({
      id: 'p-fresh',
      title: 'New',
      type: 'line',
      layout: { x: 0, y: 6 },
    });
    expect(newPanel([], 'Empty', () => 'x').layout.y).toBe(0);

    const copy = copyPanel(existing[1] ?? created, existing, () => 'copy');
    expect(copy).toMatchObject({ id: 'p-copy', title: 'b', layout: { x: 0, y: 6, w: 3, h: 4 } });
  });
});

describe('series names and tables', () => {
  const point = (avg: number) => ({ at: '2026-11-19T00:00:00Z', avg, min: avg, max: avg });
  const one = (variable: string, name: string | undefined, avg: number): NamedSeries => ({
    key: `${variable}-${name ?? ''}`,
    label: variable,
    variable,
    ...(name ? { name } : {}),
    unit: 'bytes',
    points: [point(avg)],
  });

  it('name a series by what it measures, alone or beside other variables', () => {
    expect(seriesLabel('Used', undefined, true)).toBe('Used');
    expect(seriesLabel('Used', 'disk1', true)).toBe('disk1');
    expect(seriesLabel('Used', 'disk1', false)).toBe('Used · disk1');
  });

  it('put several variables of the same things side by side', () => {
    const table = pivotTable(
      [one('Used', 'a', 1), one('Used', 'b', 2), one('Total', 'a', 10)],
      'last',
    );
    expect(table).toEqual({
      columns: [
        { variable: 'Used', unit: 'bytes' },
        { variable: 'Total', unit: 'bytes' },
      ],
      rows: [
        { name: 'a', values: [1, 10] },
        { name: 'b', values: [2, null] },
      ],
    });
    expect(pivotTable([one('Used', 'a', 1)], 'last')).toBeNull();
    expect(pivotTable([one('Used', 'a', 1), one('Total', undefined, 2)], 'last')).toBeNull();
  });
});
