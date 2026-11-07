import 'server-only';

import { randomBytes } from 'node:crypto';

import { and, eq, isNotNull, isNull } from 'drizzle-orm';

import { getDb } from '@/shared/db/client';
import { openSecret, sealSecret } from '@/shared/secrets/secrets';

import {
  base32Decode,
  base32Encode,
  formatRecoveryCode,
  hashRecoveryCode,
  verifyTotp,
  type TwoFactorCode,
} from '../totp.utils';
import { recoveryCodesTable, totpFactorsTable } from './auth.schema';

const recoveryCodeCount = 10;

function purposeOf(userId: string): string {
  return `auth.totp:${userId}`;
}

export async function hasTotpEnabled(userId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ userId: totpFactorsTable.userId })
    .from(totpFactorsTable)
    .where(and(eq(totpFactorsTable.userId, userId), isNotNull(totpFactorsTable.enabledAt)))
    .limit(1);
  return rows.length > 0;
}

/** Starts (or restarts) enrolment with a fresh secret; returns it in base32 for the QR code. */
export async function createPendingFactor(userId: string): Promise<string> {
  const secret = base32Encode(randomBytes(20));
  const sealed = sealSecret(secret, purposeOf(userId));
  await getDb()
    .insert(totpFactorsTable)
    .values({ userId, secret: sealed })
    .onConflictDoUpdate({
      target: totpFactorsTable.userId,
      set: { secret: sealed, lastUsedStep: null, enabledAt: null },
    });
  return secret;
}

async function readFactor(userId: string, enabled: boolean) {
  const [row] = await getDb()
    .select({ secret: totpFactorsTable.secret, lastUsedStep: totpFactorsTable.lastUsedStep })
    .from(totpFactorsTable)
    .where(
      and(
        eq(totpFactorsTable.userId, userId),
        enabled ? isNotNull(totpFactorsTable.enabledAt) : isNull(totpFactorsTable.enabledAt),
      ),
    );
  return row;
}

/** Checks an app code against the factor and records its step (no replay). */
async function acceptTotp(userId: string, code: string, enabled: boolean): Promise<boolean> {
  const factor = await readFactor(userId, enabled);
  if (!factor) return false;
  const secret = base32Decode(openSecret(factor.secret, purposeOf(userId)));
  const step = verifyTotp(secret, code, new Date(), factor.lastUsedStep);
  if (step === null) return false;
  await getDb()
    .update(totpFactorsTable)
    .set({ lastUsedStep: step })
    .where(eq(totpFactorsTable.userId, userId));
  return true;
}

/**
 * Confirms enrolment with a first valid code; returns fresh recovery codes (shown once), or null
 * when the code is wrong.
 */
export async function enableFactor(userId: string, code: string): Promise<string[] | null> {
  if (!(await acceptTotp(userId, code, false))) return null;
  await getDb()
    .update(totpFactorsTable)
    .set({ enabledAt: new Date() })
    .where(eq(totpFactorsTable.userId, userId));
  return replaceRecoveryCodes(userId);
}

export async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: recoveryCodeCount }, () => formatRecoveryCode(randomBytes(7)));
  await getDb().transaction(async (tx) => {
    await tx.delete(recoveryCodesTable).where(eq(recoveryCodesTable.userId, userId));
    await tx
      .insert(recoveryCodesTable)
      .values(codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })));
  });
  return codes;
}

/** Consumes one unused recovery code atomically. */
async function acceptRecoveryCode(userId: string, code: string): Promise<boolean> {
  const used = await getDb()
    .update(recoveryCodesTable)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(recoveryCodesTable.userId, userId),
        eq(recoveryCodesTable.codeHash, hashRecoveryCode(code)),
        isNull(recoveryCodesTable.usedAt),
      ),
    )
    .returning({ id: recoveryCodesTable.id });
  return used.length > 0;
}

export function verifySecondFactor(userId: string, code: TwoFactorCode): Promise<boolean> {
  return code.kind === 'totp'
    ? acceptTotp(userId, code.code, true)
    : acceptRecoveryCode(userId, code.code);
}

export async function remainingRecoveryCodes(userId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: recoveryCodesTable.id })
    .from(recoveryCodesTable)
    .where(and(eq(recoveryCodesTable.userId, userId), isNull(recoveryCodesTable.usedAt)));
  return rows.length;
}

export async function removeFactor(userId: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.delete(recoveryCodesTable).where(eq(recoveryCodesTable.userId, userId));
    await tx.delete(totpFactorsTable).where(eq(totpFactorsTable.userId, userId));
  });
}
