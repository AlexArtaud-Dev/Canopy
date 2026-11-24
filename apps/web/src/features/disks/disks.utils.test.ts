import {
  ageParts,
  alertNotification,
  diskName,
  diskNotificationKinds,
  diskReadPermission,
  diskSummary,
  disksHref,
  formatCapacity,
  needsAttention,
  selfTestInputSchema,
} from './disks.utils';

describe('disks', () => {
  it('names a disk by its model, else its device', () => {
    expect(diskName({ id: 'sda', model: 'WDC WD40EFRX' })).toBe('WDC WD40EFRX');
    expect(diskName({ id: 'sda', model: '' })).toBe('sda');
    expect(diskReadPermission).toBe('metrics:disks');
  });

  it('checks what a self-test request names', () => {
    expect(selfTestInputSchema.safeParse({ disk: 'nvme0', test: 'long' }).success).toBe(true);
    expect(selfTestInputSchema.safeParse({ disk: '../sda', test: 'short' }).success).toBe(false);
    expect(selfTestInputSchema.safeParse({ disk: 'sda', test: 'erase' }).success).toBe(false);
  });

  it('writes sizes in decimal units, as disks are sold', () => {
    expect(formatCapacity(4_000_787_030_016, 'en')).toBe('4 TB');
    // French separates the unit with a narrow no-break space.
    expect(formatCapacity(1_000_204_886_016, 'fr').replace(/\s/gu, ' ')).toBe('1 To');
    expect(formatCapacity(758_038_528, 'en')).toBe('758 MB');
    expect(formatCapacity(512, 'en')).toBe('512 byte');
    expect(formatCapacity(-1, 'en')).toBe('0 byte');
    expect(formatCapacity(5e18, 'en')).toBe('5,000 PB');
  });

  it('writes an age in years and days', () => {
    expect(ageParts(39518)).toEqual({ years: 4, days: 186 });
    expect(ageParts(23)).toEqual({ years: 0, days: 0 });
    expect(ageParts(-5)).toEqual({ years: 0, days: 0 });
  });

  it('sums up what needs a look', () => {
    const disks = [
      { health: 'failing', hot: false },
      { health: 'warning', hot: true },
      { health: 'passed', hot: true },
      { health: 'unknown', hot: false },
    ] as const;
    expect(disks.map(needsAttention)).toEqual([true, true, true, false]);
    expect(diskSummary(disks)).toEqual({ total: 4, failing: 1, warning: 1, hot: 2 });
  });

  it('turns an alert into one notification per disk and kind', () => {
    expect(
      alertNotification({ disk: 'sdb', name: 'WD · 0001', kind: 'failing', reasons: [] }),
    ).toEqual({
      kind: 'diskFailing',
      sourceKey: 'disk:failing:WD · 0001',
      params: { disk: 'WD · 0001' },
      href: disksHref,
    });
    expect(
      alertNotification({
        disk: 'nvme0',
        name: 'Samsung',
        kind: 'hot',
        reasons: [],
        temperature: 72,
        limit: 70,
      }),
    ).toMatchObject({
      kind: 'diskHot',
      params: { disk: 'Samsung', temperature: 72, limit: 70 },
    });
    expect(
      alertNotification({ disk: 'sda', name: 'X', kind: 'warning', reasons: ['pending'] }).kind,
    ).toBe('diskWarning');
    const kinds = (['failing', 'warning', 'hot'] as const).map(
      (kind) => alertNotification({ disk: 'sda', name: 'X', kind, reasons: [] }).kind,
    );
    expect(kinds).toEqual([...diskNotificationKinds]);
  });
});
