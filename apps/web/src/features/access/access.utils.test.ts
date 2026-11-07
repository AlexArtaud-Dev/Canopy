import type { GlobalPermission } from '@/shared/modules/module.types';

import {
  adminPermission,
  allPermissions,
  effectivePermissions,
  entityIdSchema,
  groupInputSchema,
  permissionMatrix,
  roleInputSchema,
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

describe('permissionMatrix', () => {
  it('groups permissions by module, keeping declaration order', () => {
    expect(permissionMatrix(declared)).toEqual([
      {
        module: 'users',
        actions: [
          { action: 'read', permission: 'users:read' },
          { action: 'create', permission: 'users:create' },
        ],
      },
      {
        module: 'system',
        actions: [
          { action: 'read', permission: 'system:read' },
          { action: 'admin', permission: 'system:admin' },
        ],
      },
    ]);
  });
});

describe('input schemas', () => {
  it('validates roles, groups and entity ids', () => {
    expect(
      roleInputSchema.safeParse({ name: ' Ops ', description: '', permissions: ['users:read'] })
        .success,
    ).toBe(true);
    expect(roleInputSchema.safeParse({ name: '', description: '', permissions: [] }).success).toBe(
      false,
    );
    expect(
      groupInputSchema.safeParse({
        name: 'Family',
        description: '',
        requireTwoFactor: true,
        roleIds: [],
        memberIds: ['u1'],
      }).success,
    ).toBe(true);
    expect(entityIdSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
  });
});
