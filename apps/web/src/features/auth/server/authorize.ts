import 'server-only';

import { AppBaseError } from '@/shared/lib/errors';
import type { GlobalPermission } from '@/shared/modules/module.types';
import { audit } from '@/features/audit/server/audit-writer';

import { requireSession, type CurrentSession, type SessionUser } from './current-session';

/** Global permissions held by a user (resolved from roles when the session was read). */
export function permissionsOf(user: SessionUser): readonly GlobalPermission[] {
  return user.permissions;
}

/** Server-side gate for pages and actions; a refusal is audited and shown as `auth.forbidden`. */
export async function authorize(permission: GlobalPermission): Promise<CurrentSession> {
  const session = await requireSession();
  if (permissionsOf(session.user).includes(permission)) return session;
  await audit({
    action: 'auth.access_denied',
    result: 'denied',
    actorId: session.user.id,
    meta: { permission },
  });
  throw new AppBaseError('auth.forbidden', `missing permission ${permission}`);
}
