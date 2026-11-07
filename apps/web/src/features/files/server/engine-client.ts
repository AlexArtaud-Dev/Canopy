import 'server-only';

import { createClient } from '@canopy/contracts/client';

import { parseServerEnv } from '@/shared/config/env';
import { signEngineToken } from '@/shared/engine/engine-token';
import { loadGroupIds } from '@/features/access/server/permissions';
import type { CurrentSession } from '@/features/auth';

/** An engine API client acting as the signed-in user (token signed per call, never cached). */
export async function engineClientFor(session: CurrentSession) {
  const groups = await loadGroupIds(session.user.id);
  const token = await signEngineToken({
    userId: session.user.id,
    sessionId: session.sessionId,
    permissions: session.user.permissions,
    groups,
  });
  return createClient({
    baseUrl: parseServerEnv(process.env).CANOPY_ENGINE_URL,
    auth: () => token,
  });
}
