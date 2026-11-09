import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes: the whole secret of a link, so it is never stored in clear. */
export function newShareToken(): string {
  return randomBytes(32).toString('base64url');
}

/** How a link is found from its URL without storing the token. */
export function hashShareToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Purpose of the sealed token (owners copy their links again) and of unlock cookies. */
export const tokenPurpose = 'shares.token';
export const unlockPurpose = 'shares.unlock';
