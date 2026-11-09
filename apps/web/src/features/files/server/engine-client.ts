import 'server-only';

import { createClient } from '@canopy/contracts/client';

import { parseServerEnv } from '@/shared/config/env';
import { signEngineToken } from '@/shared/engine/engine-token';
import { loadGroupIds } from '@/features/access/server/permissions';
import type { CurrentSession } from '@/features/auth';

/** A short-lived engine token for the signed-in user (signed per call, never cached). */
export async function engineTokenFor(session: CurrentSession): Promise<string> {
  const groups = await loadGroupIds(session.user.id);
  return signEngineToken({
    userId: session.user.id,
    sessionId: session.sessionId,
    permissions: session.user.permissions,
    groups,
  });
}

/** An engine API client acting as the signed-in user. */
export async function engineClientFor(session: CurrentSession) {
  const token = await engineTokenFor(session);
  return createClient({
    baseUrl: parseServerEnv(process.env).CANOPY_ENGINE_URL,
    auth: () => token,
  });
}
