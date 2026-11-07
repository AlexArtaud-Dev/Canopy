import { createHash } from 'node:crypto';

import { z } from 'zod';

export type ActionTokenPurpose = 'invitation' | 'password_reset';

/** Invitations wait a week; a reset link is only useful right away. */
export const actionTokenLifetimeMs: Record<ActionTokenPurpose, number> = {
  invitation: 7 * 24 * 60 * 60 * 1000,
  password_reset: 60 * 60 * 1000,
};

export function hashActionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Absolute link to the set-password page for a token. */
export function actionLink(publicUrl: string, token: string): string {
  const url = new URL('/set-password', publicUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

/** Tokens are 32 random bytes in base64url (43 characters). */
export const actionTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
});

/** Sign-in counts as a new device when no other session shares its browser, OS and address. */
export function isNewDevice(
  current: { device: string; ipAddress: string | null },
  others: readonly { device: string; ipAddress: string | null }[],
): boolean {
  return !others.some(
    (other) => other.device === current.device && other.ipAddress === current.ipAddress,
  );
}
