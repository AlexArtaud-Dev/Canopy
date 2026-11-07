import type { GlobalPermission } from '@/shared/modules/module.types';

import {
  adminPermission,
  allPermissions,
  effectivePermissions,
  sanitizeRolePermissions,
  twoFactorRequired,
} from './access.utils';

const declared: GlobalPermission[] = ['users:read', 'users:create', 'system:read', 'system:admin'];

describe('effectivePermissions', () => {
  it('unions every role and keeps the registry order', () => {
    expect(
      effectivePermissions(
        [{ permissions: ['system:read'] }, { permissions: ['users:read', 'system:read'] }],
        declared,
      ),
    ).toEqual(['users:read', 'system:read']);
  });

  it('expands the wildcard to everything declared', () => {
    expect(effectivePermissions([{ permissions: [allPermissions] }], declared)).toEqual(declared);
  });

  it('drops permissions no module declares any more', () => {
    expect(effectivePermissions([{ permissions: ['legacy:thing'] }], declared)).toEqual([]);
    expect(effectivePermissions([], declared)).toEqual([]);
  });
});

describe('sanitizeRolePermissions', () => {
  it('keeps known, unique, sorted permissions', () => {
    expect(
      sanitizeRolePermissions(['users:read', 'nope:x', 'system:read', 'users:read'], declared),
    ).toEqual(['system:read', 'users:read']);
  });

  it('collapses to the wildcard when present', () => {
    expect(sanitizeRolePermissions(['users:read', '*'], declared)).toEqual(['*']);
  });
});

describe('twoFactorRequired', () => {
  it('is required when any group enforces it', () => {
    expect(twoFactorRequired([{ requireTwoFactor: false }, { requireTwoFactor: true }])).toBe(true);
    expect(twoFactorRequired([{ requireTwoFactor: false }])).toBe(false);
  });

  it('names system:admin as the administrator permission', () => {
    expect(adminPermission).toBe('system:admin');
  });
});
