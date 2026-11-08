'use server';

import { cookies } from 'next/headers';

import { parseServerEnv } from '@/shared/config/env';
import {
  engineTokenLifetimeSeconds,
  streamTicketCookie,
  streamTicketPath,
} from '@/shared/engine/engine-token.utils';
import { signStreamTicket } from '@/shared/engine/engine-token';
import { runAction, type ActionResult } from '@/shared/lib/action';
import { loadGroupIds } from '@/features/access/server/permissions';
import { requireSession } from '@/features/auth';

/**
 * Puts a fresh stream ticket in an HttpOnly cookie scoped to the streaming route, just before a
 * download or upload. JavaScript never sees it; SameSite=Strict keeps other sites from using it.
 * Returns when it expires, so the caller knows when to ask again.
 */
export async function refreshStreamTicket(): Promise<ActionResult<{ expiresAt: number }>> {
  return runAction(async () => {
    const session = await requireSession();
    const ticket = await signStreamTicket({
      userId: session.user.id,
      sessionId: session.sessionId,
      permissions: session.user.permissions,
      groups: await loadGroupIds(session.user.id),
    });
    (await cookies()).set(streamTicketCookie, ticket, {
      httpOnly: true,
      sameSite: 'strict',
      // Secure whenever Canopy is served over HTTPS; a plain-HTTP LAN install still works.
      secure: parseServerEnv(process.env).CANOPY_PUBLIC_URL.startsWith('https:'),
      path: streamTicketPath,
      maxAge: engineTokenLifetimeSeconds,
    });
    return { expiresAt: Date.now() + engineTokenLifetimeSeconds * 1000 };
  });
}
