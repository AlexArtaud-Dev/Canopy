'use server';

import QRCode from 'qrcode';
import { z } from 'zod';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { clearRateLimit, consume, readLockout } from '@/shared/rate-limit/rate-limit';
import { groupsRequireTwoFactor } from '@/features/access/server/permissions';
import { audit } from '@/features/audit/server/audit-writer';

import { safeRedirectPath } from '../auth.utils';
import { classifyCode, otpauthUri } from '../totp.utils';
import {
  completeSecondFactor,
  getConfiguredAuth,
  getSessionState,
  requireSession,
} from './current-session';
import { assertAddressAllowed, recordAddressFailure } from './ip-block';
import { assertCurrentPassword } from './reauthenticate';
import { notifySecurity } from './security-notices';
import {
  createPendingFactor,
  enableFactor,
  hasTotpEnabled,
  removeFactor,
  replaceRecoveryCodes,
  verifySecondFactor,
} from './totp-factor';

const codeInput = z.object({ code: z.string().trim().min(6).max(32), next: z.string().optional() });
const passwordInput = z.object({ password: z.string().min(1).max(1024) });
const lockoutScope = 'auth.second_factor';

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid input');
  return parsed.data;
}

/** Second step of sign-in: an app code or a recovery code for the pending session. */
export async function verifyTwoFactor(
  input: unknown,
): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const { code, next } = parse(codeInput, input);
    const state = await getSessionState();
    if (state.kind !== 'pending') {
      throw new AppBaseError('auth.second_factor_expired', 'no pending sign-in');
    }
    const { policy } = await getConfiguredAuth();
    await assertAddressAllowed(policy);
    const rule = { limit: policy.lockoutThreshold, windowSeconds: policy.lockoutMinutes * 60 };
    const lockout = await readLockout(lockoutScope, state.userId, rule);
    if (lockout.locked) {
      throw new AppBaseError('auth.locked', 'second factor locked', {
        params: { minutes: Math.ceil(lockout.retryAfterSeconds / 60) },
      });
    }

    const candidate = classifyCode(code);
    if (!(await verifySecondFactor(state.userId, candidate))) {
      await recordAddressFailure(policy);
      await consume(lockoutScope, state.userId, rule);
      await audit({
        action: 'auth.two_factor',
        result: 'denied',
        actorId: state.userId,
        meta: { method: candidate.kind },
      });
      throw new AppBaseError('auth.invalid_code', 'second factor rejected');
    }
    await completeSecondFactor(state.sessionId);
    await clearRateLimit(lockoutScope, state.userId);
    await audit({
      action: 'auth.two_factor',
      result: 'success',
      actorId: state.userId,
      meta: { method: candidate.kind },
    });
    return { redirectTo: safeRedirectPath(next) };
  });
}

/** Starts enrolment: a new secret as a QR code (and as text for manual entry). */
export async function startTotpEnrollment(): Promise<
  ActionResult<{ qrCode: string; secret: string }>
> {
  return runAction(async () => {
    // Allowed while a group forces 2FA setup: this is how the user satisfies it.
    const { user } = await requireSession({ allowTwoFactorSetup: true });
    if (await hasTotpEnabled(user.id)) {
      throw new AppBaseError('auth.totp_already_enabled', 'two-factor already on');
    }
    const secret = await createPendingFactor(user.id);
    const qrCode = await QRCode.toDataURL(otpauthUri('Canopy', user.username, secret), {
      margin: 1,
      width: 208,
      errorCorrectionLevel: 'M',
    });
    return { qrCode, secret };
  });
}

/** Confirms enrolment with a first code; returns the recovery codes, shown only this once. */
export async function confirmTotpEnrollment(
  input: unknown,
): Promise<ActionResult<{ recoveryCodes: string[] }>> {
  return runAction(async () => {
    const { code } = parse(codeInput, input);
    const { user } = await requireSession({ allowTwoFactorSetup: true });
    const recoveryCodes = await enableFactor(user.id, code.replace(/\s/g, ''));
    if (!recoveryCodes) {
      throw new AppBaseError('auth.invalid_code', 'enrolment code rejected');
    }
    await audit({ action: 'auth.totp_enable', result: 'success', actorId: user.id });
    await notifySecurity(user.id, 'two_factor_enabled');
    return { recoveryCodes };
  });
}

/** Turns two-factor off after re-entering the password. */
export async function disableTotp(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { password } = parse(passwordInput, input);
    const { user } = await requireSession();
    await assertCurrentPassword(user.id, password);
    if (await groupsRequireTwoFactor(user.id)) {
      throw new AppBaseError('auth.two_factor_required', 'a group requires two-factor');
    }
    await removeFactor(user.id);
    await audit({ action: 'auth.totp_disable', result: 'success', actorId: user.id });
    await notifySecurity(user.id, 'two_factor_disabled');
    return null;
  });
}

/** Replaces every recovery code after re-entering the password. */
export async function regenerateRecoveryCodes(
  input: unknown,
): Promise<ActionResult<{ recoveryCodes: string[] }>> {
  return runAction(async () => {
    const { password } = parse(passwordInput, input);
    const { user } = await requireSession();
    await assertCurrentPassword(user.id, password);
    if (!(await hasTotpEnabled(user.id))) {
      throw new AppBaseError('auth.totp_not_enabled', 'two-factor is off');
    }
    const recoveryCodes = await replaceRecoveryCodes(user.id);
    await audit({ action: 'auth.recovery_codes_regenerate', result: 'success', actorId: user.id });
    return { recoveryCodes };
  });
}
