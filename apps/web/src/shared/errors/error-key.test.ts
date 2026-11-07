import { resolveErrorKey } from './error-key';

const catalog = { system: { unexpected: 'x', not_found: 'y' }, files: 'not a group' };

describe('resolveErrorKey', () => {
  it('keeps translated codes', () => {
    expect(resolveErrorKey('system.not_found', catalog)).toBe('system.not_found');
  });

  it.each([
    ['unknown code', 'system.nope'],
    ['unknown module', 'users.not_found'],
    ['module that is not a group', 'files.whatever'],
    ['missing name', 'system'],
    ['too many segments', 'system.not_found.extra'],
    ['empty string', ''],
  ])('falls back to system.unexpected for %s', (_label, code) => {
    expect(resolveErrorKey(code, catalog)).toBe('system.unexpected');
  });

  it('falls back when no catalog is loaded', () => {
    expect(resolveErrorKey('system.not_found', undefined)).toBe('system.unexpected');
  });
});
