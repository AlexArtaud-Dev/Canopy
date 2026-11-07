import 'server-only';

import { AppBaseError } from '@/shared/lib/errors';
import type { GlobalPermission } from '@/shared/modules/module.types';
import { audit } from '@/features/audit/server/audit-writer';

import { requireSession, type CurrentSession, type SessionUser } from './current-session';

/** Global permissions held by a user (resolved from roles when the session was read). */
export function permissionsOf(user: SessionUser): readonly GlobalPermission[] {
  return user.permissions;
}

async function denied(session: CurrentSession, permission: GlobalPermission): Promise<void> {
  await audit({
    action: 'auth.access_denied',
    result: 'denied',
    actorId: session.user.id,
    meta: { permission },
  });
}

/** Server action gate: a refusal is audited and returned to the UI as `auth.forbidden`. */
export async function authorize(permission: GlobalPermission): Promise<CurrentSession> {
  const session = await requireSession();
  if (permissionsOf(session.user).includes(permission)) return session;
  await denied(session, permission);
  throw new AppBaseError('auth.forbidden', `missing permission ${permission}`);
}

/**
 * Page gate: returns null (after auditing) when the permission is missing, so the page renders
 * the translated access-denied state. Thrown errors would reach users as "unexpected": Next.js
 * strips server error details in production.
 */
export async function authorizePage(permission: GlobalPermission): Promise<CurrentSession | null> {
  const session = await requireSession();
  if (permissionsOf(session.user).includes(permission)) return session;
  await denied(session, permission);
  return null;
}
