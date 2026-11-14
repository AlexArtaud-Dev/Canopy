import {
  isNotificationKind,
  linkTarget,
  markReadInputSchema,
  notificationKinds,
  notificationListLimit,
  notificationRetentionMs,
  safeHref,
  unreadCount,
} from './notifications.utils';

describe('notifications', () => {
  it('knows its kinds only', () => {
    expect(notificationKinds).toContain('dropOffReceived');
    expect(isNotificationKind('dropOffReceived')).toBe(true);
    expect(isNotificationKind('somethingElse')).toBe(false);
  });

  it('leads only inside the app', () => {
    expect(safeHref('/shares?dropOffs=1')).toBe('/shares?dropOffs=1');
    expect(safeHref('//evil.example/x')).toBeNull();
    expect(safeHref('https://evil.example')).toBeNull();
    expect(safeHref(null)).toBeNull();
  });

  it('keeps the query of the path it leads to', () => {
    expect(linkTarget('/shares?dropOffs=abc')).toEqual({
      pathname: '/shares',
      query: { dropOffs: 'abc' },
    });
    expect(linkTarget('/trash')).toEqual({ pathname: '/trash', query: {} });
  });

  it('counts the unread ones', () => {
    expect(unreadCount([{ read: true }, { read: false }, { read: false }])).toBe(2);
    expect(unreadCount([])).toBe(0);
  });

  it('marks some or all, within the list size', () => {
    expect(markReadInputSchema.safeParse({}).success).toBe(true);
    expect(
      markReadInputSchema.safeParse({ ids: ['00000000-0000-4000-8000-000000000000'] }).success,
    ).toBe(true);
    expect(markReadInputSchema.safeParse({ ids: ['x'] }).success).toBe(false);
    expect(notificationListLimit).toBe(50);
    expect(notificationRetentionMs).toBe(90 * 24 * 60 * 60_000);
  });
});
