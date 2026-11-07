import { isAuditAction, sanitizeMeta } from './audit.utils';

describe('isAuditAction', () => {
  it.each([
    ['settings.update', true],
    ['auth.login_failed', true],
    ['path-grants.create', true],
    ['Settings.update', false],
    ['settings', false],
    ['settings.update.extra', false],
  ])('%s → %s', (action, expected) => {
    expect(isAuditAction(action)).toBe(expected);
  });
});

describe('sanitizeMeta', () => {
  it('keeps ordinary metadata', () => {
    expect(
      sanitizeMeta({ key: 'sessionDays', code: 'x.y', count: 3, path: '/media', ok: true }),
    ).toEqual({
      key: 'sessionDays',
      code: 'x.y',
      count: 3,
      path: '/media',
      ok: true,
    });
  });

  it('redacts secret-looking keys at any depth', () => {
    expect(
      sanitizeMeta({
        user: 'alice',
        password: 'hunter2',
        smtp: { host: 'mail', apiToken: 'x', apiKey: 'k', nested: { otpSecret: 'y' } },
        list: [{ cookie: 'c' }],
      }),
    ).toEqual({
      user: 'alice',
      password: '[redacted]',
      smtp: {
        host: 'mail',
        apiToken: '[redacted]',
        apiKey: '[redacted]',
        nested: { otpSecret: '[redacted]' },
      },
      list: [{ cookie: '[redacted]' }],
    });
  });

  it('truncates long strings, long arrays and deep nesting', () => {
    const result = sanitizeMeta({
      note: 'x'.repeat(600),
      items: Array.from({ length: 80 }, (_, index) => index),
      a: { b: { c: { d: { e: { f: 'too deep' } } } } },
    });
    expect(String(result.note)).toHaveLength(513);
    expect(result.items).toHaveLength(50);
    expect(result.a).toEqual({ b: { c: { d: { e: '[depth]' } } } });
  });

  it('replaces oversized metadata with a marker', () => {
    const many = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [`k${String(i)}`, 'v'.repeat(500)]),
    );
    expect(sanitizeMeta(many)).toEqual({
      truncated: true,
      originalBytes: expect.any(Number) as number,
    });
  });
});
