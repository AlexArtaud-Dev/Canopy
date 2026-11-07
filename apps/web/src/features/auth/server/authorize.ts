import 'server-only';

import { appRegistry } from '@/modules';
import { AppBaseError } from '@/shared/lib/errors';
import type { GlobalPermission } from '@/shared/modules/module.types';
import { audit } from '@/features/audit/server/audit-writer';

import { requireSession, type CurrentSession, type SessionUser } from './current-session';

/**
 * Global permissions held by a user. The instance administrator (created by the setup wizard)
 * holds every declared permission; roles and groups grant the rest from M4.
 */
export function permissionsOf(user: SessionUser): readonly GlobalPermission[] {
  return user.isAdmin ? appRegistry.globalPermissions : [];
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
