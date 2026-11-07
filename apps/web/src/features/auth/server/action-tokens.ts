import 'server-only';

import { randomBytes } from 'node:crypto';

import { and, eq, gt, isNull, sql } from 'drizzle-orm';

import { parseServerEnv } from '@/shared/config/env';
import { getDb } from '@/shared/db/client';

import {
  actionLink,
  actionTokenLifetimeMs,
  hashActionToken,
  type ActionTokenPurpose,
} from '../action-token.utils';
import { actionTokensTable } from './auth.schema';

/**
 * Issues a one-time link (earlier unused links of the same purpose stop working). The token is
 * returned once, to be emailed or shown to an administrator; only its hash is stored.
 */
export async function issueActionToken(
  userId: string,
  purpose: ActionTokenPurpose,
  lifetimeMs = actionTokenLifetimeMs[purpose],
): Promise<{ link: string }> {
  const token = randomBytes(32).toString('base64url');
  await getDb().transaction(async (tx) => {
    await tx
      .update(actionTokensTable)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(actionTokensTable.userId, userId),
          eq(actionTokensTable.purpose, purpose),
          isNull(actionTokensTable.usedAt),
        ),
      );
    await tx.insert(actionTokensTable).values({
      userId,
      purpose,
      tokenHash: hashActionToken(token),
      expiresAt: new Date(Date.now() + lifetimeMs),
    });
  });
  return { link: actionLink(parseServerEnv(process.env).CANOPY_PUBLIC_URL, token) };
}

const usable = (token: string) =>
  and(
    eq(actionTokensTable.tokenHash, hashActionToken(token)),
    isNull(actionTokensTable.usedAt),
    gt(actionTokensTable.expiresAt, sql`now()`),
  );

/** Whether a link can still be used (for rendering the page; consuming happens on submit). */
export async function isActionTokenUsable(token: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: actionTokensTable.id })
    .from(actionTokensTable)
    .where(usable(token))
    .limit(1);
  return rows.length > 0;
}

/** Marks the link used, atomically; null when invalid, used or expired. */
export async function consumeActionToken(
  token: string,
): Promise<{ userId: string; purpose: ActionTokenPurpose } | null> {
  const [row] = await getDb()
    .update(actionTokensTable)
    .set({ usedAt: new Date() })
    .where(usable(token))
    .returning({ userId: actionTokensTable.userId, purpose: actionTokensTable.purpose });
  return row ?? null;
}
