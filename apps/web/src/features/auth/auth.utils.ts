import { z } from 'zod';

/** How often an active session records activity; idle timeouts are accurate to this. */
export const activityGranularitySeconds = 5 * 60;

export interface SessionTimes {
  createdAt: Date;
  /** Last recorded activity (refreshed at most every `activityGranularitySeconds`). */
  updatedAt: Date;
  /** Password accepted, second factor still expected. */
  twoFactorPending: boolean;
}

/** Time allowed to type the second factor after the password. */
export const pendingSecondFactorMinutes = 10;

export interface SessionPolicy {
  sessionLifetimeDays: number;
  idleTimeoutMinutes: number;
}

export type SessionVerdict = 'active' | 'pending' | 'expired' | 'idle';

/** Applies the absolute lifetime and the idle timeout to a session. */
export function evaluateSession(
  session: SessionTimes,
  policy: SessionPolicy,
  now: Date,
): SessionVerdict {
  const ageMs = now.getTime() - session.createdAt.getTime();
  if (session.twoFactorPending) {
    return ageMs >= pendingSecondFactorMinutes * 60 * 1000 ? 'expired' : 'pending';
  }
  const lifetimeMs = policy.sessionLifetimeDays * 24 * 60 * 60 * 1000;
  if (ageMs >= lifetimeMs) return 'expired';
  const idleMs = policy.idleTimeoutMinutes * 60 * 1000;
  if (now.getTime() - session.updatedAt.getTime() >= idleMs) return 'idle';
  return 'active';
}

/**
 * Only same-origin relative paths are accepted as a post-login destination, so a crafted
 * `?next=` link cannot bounce users to another site.
 */
export function safeRedirectPath(candidate: string | null | undefined): string {
  if (!candidate?.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return '/';
  }
  if (candidate.startsWith('/login') || candidate.startsWith('/setup')) return '/';
  return candidate;
}

/** Undeliverable (RFC 2606 `.invalid`) login key filling Better Auth's mandatory email. */
export function syntheticEmail(id: string): string {
  return `${id}@users.canopy.invalid`;
}

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);

export const defaultPasswordMinLength = 12;

/** Password rule from the `auth.passwordMinLength` setting. */
export function passwordSchema(minLength: number) {
  return z.string().min(minLength).max(256);
}

/** New local account; the password rule depends on the admin setting. */
export function newAccountSchema(passwordMinLength: number) {
  return z
    .object({
      username: usernameSchema,
      displayName: z.string().trim().max(64).optional(),
      contactEmail: z
        .union([z.literal(''), z.email()])
        .optional()
        .transform((value) => (value === '' ? undefined : value)),
      password: passwordSchema(passwordMinLength),
      confirmPassword: z.string(),
    })
    .refine((value) => value.password === value.confirmPassword, {
      path: ['confirmPassword'],
      message: 'mismatch',
    });
}

export type NewAccountInput = z.input<ReturnType<typeof newAccountSchema>>;

export const signInInputSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(1024),
  next: z.string().max(2048).optional(),
});

export type SignInInput = z.infer<typeof signInInputSchema>;

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (!first) return '?';
  const heads = words.map((word) => word.charAt(0)).join('');
  // First and last word ("Ada Byron Lovelace" → AL); a single word gives its first two letters.
  const letters =
    words.length > 1 ? heads.charAt(0) + heads.charAt(heads.length - 1) : first.slice(0, 2);
  return letters.toUpperCase();
}

/** Top-level fields of a form draft that fail `schema` (for inline errors). */
export function invalidFields(schema: z.ZodType, input: unknown): Set<string> {
  const result = schema.safeParse(input);
  if (result.success) return new Set();
  return new Set(result.error.issues.map((issue) => String(issue.path[0] ?? '')));
}
