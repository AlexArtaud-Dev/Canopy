import type { GlobalPermission } from '@/shared/modules/module.types';

/** Stored in a role to mean "every permission, including ones declared later" (Admin). */
export const allPermissions = '*';

/** The permission that bypasses path grants; holding it makes a user an administrator. */
export const adminPermission: GlobalPermission = 'system:admin';

export interface RoleGrant {
  /** Permission keys as stored on the role (may contain `*`). */
  permissions: readonly string[];
}

/**
 * Union of the permissions of every role reaching the user (directly or through a group),
 * expanded against the declared registry. Unknown keys (from a removed module) are dropped.
 */
export function effectivePermissions(
  roles: readonly RoleGrant[],
  declared: readonly GlobalPermission[],
): GlobalPermission[] {
  const granted = new Set(roles.flatMap((role) => role.permissions));
  if (granted.has(allPermissions)) return [...declared];
  return declared.filter((permission) => granted.has(permission));
}

/** Keeps only declared permissions (or the wildcard) before a role is saved. */
export function sanitizeRolePermissions(
  requested: readonly string[],
  declared: readonly GlobalPermission[],
): string[] {
  if (requested.includes(allPermissions)) return [allPermissions];
  const known = new Set<string>(declared);
  return [...new Set(requested.filter((permission) => known.has(permission)))].sort();
}

/** True when any of the user's groups enforces two-factor authentication. */
export function twoFactorRequired(groups: readonly { requireTwoFactor: boolean }[]): boolean {
  return groups.some((group) => group.requireTwoFactor);
}
