import { z } from 'zod';

import { newAccountSchema, passwordSchema } from '@/features/auth/auth.utils';

export const usersPageSize = 20;

/** `?q=&page=` of the users list, tolerant of junk in the URL. */
export const usersQuerySchema = z.object({
  q: z.string().trim().max(64).catch(''),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type UsersQuery = z.infer<typeof usersQuerySchema>;

export function pageCount(total: number, pageSize = usersPageSize): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Escapes LIKE wildcards so a search for `a_b` matches literally. */
export function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

const roleIds = z.array(z.uuid()).max(50);

export function createUserSchema(passwordMinLength: number) {
  return newAccountSchema(passwordMinLength).and(z.object({ roleIds }));
}

export const editUserSchema = z.object({
  userId: z.string().min(1).max(64),
  displayName: z.string().trim().min(1).max(64),
  contactEmail: z
    .union([z.literal(''), z.email()])
    .transform((value) => (value === '' ? null : value)),
  roleIds,
});

export function resetPasswordSchema(passwordMinLength: number) {
  return z
    .object({
      userId: z.string().min(1).max(64),
      password: passwordSchema(passwordMinLength),
      confirmPassword: z.string(),
    })
    .refine((value) => value.password === value.confirmPassword, {
      path: ['confirmPassword'],
      message: 'mismatch',
    });
}

export const userTargetSchema = z.object({ userId: z.string().min(1).max(64) });

/**
 * True when the change would leave no active administrator: the target is one of them and the
 * only one left. Applies to disabling, deleting and removing admin roles.
 */
export function removesLastAdmin(activeAdminIds: readonly string[], targetId: string): boolean {
  return activeAdminIds.length <= 1 && activeAdminIds.includes(targetId);
}
