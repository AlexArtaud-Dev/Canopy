import 'server-only';

import { createClient } from '@canopy/contracts/client';

import { parseServerEnv } from '@/shared/config/env';
import {
  signEngineToken,
  signStreamTicket,
  type EnginePrincipal,
} from '@/shared/engine/engine-token';
import { loadGroupIds, loadPermissions } from '@/features/access/server/permissions';

import type { ShareRow } from './share-store';

/**
 * The owner, as the engine sees them, confined to `scope`: a link never reaches more than what was
 * shared, nor more than its owner may still read today.
 */
async function principalFor(share: ShareRow, scope: string): Promise<EnginePrincipal> {
  const [permissions, groups] = await Promise.all([
    loadPermissions(share.ownerId),
    loadGroupIds(share.ownerId),
  ]);
  return {
    userId: share.ownerId,
    sessionId: `share:${share.id}`,
    permissions,
    groups,
    share: { id: share.id, path: scope },
  };
}

/** An engine API client for a link's visitor (entry and listing only, enforced by the engine). */
export async function engineClientForShare(share: ShareRow) {
  const token = await signEngineToken(await principalFor(share, share.path));
  return createClient({
    baseUrl: parseServerEnv(process.env).CANOPY_ENGINE_URL,
    auth: () => token,
  });
}

/** A stream ticket for one download from a link, scoped to exactly what is downloaded. */
export async function shareStreamTicket(share: ShareRow, scope: string): Promise<string> {
  return signStreamTicket(await principalFor(share, scope));
}
