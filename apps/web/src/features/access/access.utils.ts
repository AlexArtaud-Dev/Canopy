import { z } from 'zod';

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

export interface PermissionRow {
  module: string;
  actions: { action: string; permission: GlobalPermission }[];
}

/** Rows of the role editor's matrix: one per module, its actions in declaration order. */
export function permissionMatrix(declared: readonly GlobalPermission[]): PermissionRow[] {
  const rows = new Map<string, PermissionRow>();
  for (const permission of declared) {
    const separator = permission.indexOf(':');
    const moduleId = permission.slice(0, separator);
    const action = permission.slice(separator + 1);
    const row = rows.get(moduleId) ?? { module: moduleId, actions: [] };
    row.actions.push({ action, permission });
    rows.set(moduleId, row);
  }
  return [...rows.values()];
}

export const roleInputSchema = z.object({
  roleId: z.uuid().optional(),
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(200),
  permissions: z.array(z.string().max(80)).max(200),
});

export const groupInputSchema = z.object({
  groupId: z.uuid().optional(),
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(200),
  requireTwoFactor: z.boolean(),
  roleIds: z.array(z.uuid()).max(50),
});

export const groupMembersInputSchema = z.object({
  groupId: z.uuid(),
  userIds: z.array(z.string().min(1).max(64)).min(1).max(500),
});

export const entityIdSchema = z.object({ id: z.uuid() });

export interface RoleSource {
  roleName: string;
  /** Set when the role reaches the user through a group. */
  groupName: string | null;
  permissions: readonly string[];
}

export interface PermissionTrace {
  permission: GlobalPermission;
  /** Every role (direct or through a group) granting it. */
  sources: { roleName: string; groupName: string | null }[];
}

/** For each declared permission the user holds, the roles and groups it comes from. */
export function tracePermissions(
  sources: readonly RoleSource[],
  declared: readonly GlobalPermission[],
): PermissionTrace[] {
  return declared
    .map((permission) => ({
      permission,
      sources: sources
        .filter(
          (source) =>
            source.permissions.includes(allPermissions) || source.permissions.includes(permission),
        )
        .map(({ roleName, groupName }) => ({ roleName, groupName })),
    }))
    .filter((trace) => trace.sources.length > 0);
}
