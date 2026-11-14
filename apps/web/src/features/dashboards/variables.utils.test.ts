import {
  bucketSeconds,
  chartPoints,
  engineVariable,
  isVariableFamily,
  latestValue,
  mayReadFamily,
  rangeWindow,
  readVariableInputSchema,
  timeRanges,
  variableFamilies,
  variablePermission,
  webVariables,
  type VariableData,
} from './variables.utils';

describe('variables', () => {
  it('has one permission per family', () => {
    expect(variableFamilies).toEqual([
      'system',
      'storage',
      'operations',
      'shares',
      'users',
      'logs',
    ]);
    expect(variablePermission('logs')).toBe('metrics:logs');
  });

  it('lets administrators read every family, others what their roles grant', () => {
    const admin = { isAdmin: true, permissions: [] };
    const viewer = { isAdmin: false, permissions: ['metrics:storage'] };
    expect(mayReadFamily(admin, 'logs')).toBe(true);
    expect(mayReadFamily(viewer, 'storage')).toBe(true);
    expect(mayReadFamily(viewer, 'logs')).toBe(false);
  });

  it('turns engine metrics into variables, dropping unknown families', () => {
    expect(
      engineVariable({
        name: 'storage.volume.used',
        family: 'storage',
        unit: 'bytes',
        series: true,
      }),
    ).toEqual({
      id: 'storage.volume.used',
      family: 'storage',
      unit: 'bytes',
      kind: 'series',
      multiSeries: true,
      source: 'engine',
    });
    expect(
      engineVariable({ name: 'x.y', family: 'other', unit: 'count', series: false }),
    ).toBeNull();
    expect(isVariableFamily('logs')).toBe(true);
    expect(isVariableFamily('nope')).toBe(false);
  });

  it('computes the web variables in their own families, logs as a log', () => {
    expect(webVariables.every((variable) => variable.source === 'web')).toBe(true);
    expect(webVariables.find((variable) => variable.id === 'logs.audit')?.kind).toBe('log');
    expect(new Set(webVariables.map((variable) => variable.id)).size).toBe(webVariables.length);
  });

  it('covers a range ending now, in buckets of whole minutes', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    expect(rangeWindow('1h', now).from.toISOString()).toBe('2026-11-14T11:00:00.000Z');
    expect(rangeWindow('30d', now).to).toBe(now);
    expect(bucketSeconds('1h')).toBe(60);
    expect(bucketSeconds('7d')).toBe(5040);
    for (const range of timeRanges) {
      expect(bucketSeconds(range) % 60).toBe(0);
    }
    expect(chartPoints).toBe(120);
  });

  it('accepts variable ids and known ranges only', () => {
    expect(readVariableInputSchema.safeParse({ id: 'system.cpu', range: '24h' }).success).toBe(
      true,
    );
    expect(readVariableInputSchema.safeParse({ id: 'shares.dropOffs', range: '7d' }).success).toBe(
      true,
    );
    expect(readVariableInputSchema.safeParse({ id: 'cpu', range: '24h' }).success).toBe(false);
    expect(readVariableInputSchema.safeParse({ id: 'system.cpu', range: '2y' }).success).toBe(
      false,
    );
  });

  it('reads the latest value across series', () => {
    const data: VariableData = {
      kind: 'series',
      unit: 'bytes',
      bucketSeconds: 60,
      series: [
        { name: 'a', points: [{ at: '2026-11-14T11:00:00Z', avg: 1, min: 1, max: 1 }] },
        { name: 'b', points: [{ at: '2026-11-14T11:01:00Z', avg: 2, min: 2, max: 2 }] },
        { name: 'c', points: [] },
      ],
    };
    expect(latestValue(data)).toBe(2);
    expect(
      latestValue({ kind: 'series', unit: 'count', bucketSeconds: 60, series: [] }),
    ).toBeNull();
    expect(latestValue({ kind: 'log', lines: [] })).toBeNull();
  });
});
