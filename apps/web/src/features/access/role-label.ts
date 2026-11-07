const builtInRoleKeys = ['admin', 'editor', 'viewer'] as const;
export type BuiltInRoleKey = (typeof builtInRoleKeys)[number];

/** Built-in roles are shown with a translated label; custom roles with their own name. */
export function isBuiltInRoleKey(key: string | null): key is BuiltInRoleKey {
  return builtInRoleKeys.some((candidate) => candidate === key);
}
