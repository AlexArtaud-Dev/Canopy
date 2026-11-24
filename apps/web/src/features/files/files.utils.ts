import { z } from 'zod';

export const pathActions = [
  'read',
  'download',
  'upload',
  'create',
  'update',
  'move',
  'copy',
  'delete',
  'purge',
  'share',
  'execute',
] as const;
export type PathAction = (typeof pathActions)[number];

/** Quick choices in the grant editor; any combination stays possible. */
export const actionPresets = {
  readOnly: ['read', 'download'],
  readWrite: ['read', 'download', 'upload', 'create', 'update', 'move', 'copy'],
  full: [...pathActions],
} as const satisfies Record<string, readonly PathAction[]>;

/** Mirrors the engine's fsx.Clean so invalid paths are refused before reaching it. */
export function cleanVirtualPath(input: string): string | null {
  if (!input.startsWith('/') || input.includes('\0') || input.length > 4096) return null;
  const parts: string[] = [];
  for (const part of input.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `/${parts.join('/')}`;
}

/** A wider screen shows the whole path up to this many segments (root included). */
const wideCrumbLimit = 4;

/**
 * Which breadcrumb segments stay in view (the others fold into a "…" menu): the root and the
 * open folder always; on a phone nothing between; on a wider screen the parent too, and every
 * segment while the path is no deeper than three folders.
 */
export function crumbVisible(index: number, count: number, wide: boolean): boolean {
  if (index === 0 || index === count - 1) return true;
  if (!wide) return false;
  return count <= wideCrumbLimit || index === count - 2;
}

/** Whether some folders fold into the "…" menu (phone, wider screen). */
export function crumbsFold(count: number): { phone: boolean; wide: boolean } {
  return { phone: count > 2, wide: count > wideCrumbLimit };
}

/** Breadcrumb segments of a clean path: "/a/b" → [{"/", "/"}, {"a", "/a"}, {"b", "/a/b"}]. */
export function breadcrumbs(clean: string): { name: string; path: string }[] {
  const crumbs = [{ name: '/', path: '/' }];
  let current = '';
  for (const part of clean.split('/').filter(Boolean)) {
    current += `/${part}`;
    crumbs.push({ name: part, path: current });
  }
  return crumbs;
}

const virtualPath = z
  .string()
  .max(4096)
  .transform((value, context) => {
    const clean = cleanVirtualPath(value);
    if (clean === null) {
      context.addIssue({ code: 'custom', message: 'invalid path' });
      return z.NEVER;
    }
    return clean;
  });

export const grantSubjectSchema = z.object({
  subjectType: z.enum(['user', 'group']),
  subjectId: z.string().min(1).max(64),
});

export const grantInputSchema = grantSubjectSchema.extend({
  path: virtualPath,
  actions: z.array(z.enum(pathActions)).min(1).max(pathActions.length),
  effect: z.enum(['allow', 'deny']),
});

export const browseInputSchema = z.object({ path: virtualPath });
