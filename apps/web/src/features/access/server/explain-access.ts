'use server';

import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { explainAccess } from '@canopy/contracts';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { authorize } from '@/features/auth';
import { engineClientFor } from '@/features/files/server/engine-client';
import { cleanVirtualPath } from '@/features/files/files.utils';

import { getUserAccessOverview } from './user-access';

const explainInput = z.object({
  userId: z.string().min(1).max(64),
  path: z.string().max(4096),
});

export interface ExplainedAction {
  action: string;
  allowed: boolean;
  byAdmin: boolean;
  grant: {
    subjectType: 'user' | 'group';
    subjectId: string;
    path: string;
    effect: 'allow' | 'deny';
  } | null;
}

/**
 * "Can this person do X here, and why?": the engine resolves it with the very rules it enforces,
 * for the person's own groups and admin status (not the caller's).
 */
export async function explainUserAccess(
  input: unknown,
): Promise<ActionResult<{ path: string; decisions: ExplainedAction[] }>> {
  return runAction(async () => {
    const parsed = explainInput.safeParse(input);
    const path = parsed.success ? cleanVirtualPath(parsed.data.path) : null;
    if (!parsed.success || path === null) {
      throw new AppBaseError('files.invalid_path', 'invalid path');
    }
    const session = await authorize('users:read');
    const t = await getTranslations('access');
    const overview = await getUserAccessOverview(parsed.data.userId, (key) =>
      t(`builtInRoles.${key}`),
    );
    const { data, error, response } = await explainAccess({
      client: await engineClientFor(session),
      body: {
        userId: parsed.data.userId,
        groups: overview.groups.map((group) => group.id),
        admin: overview.isAdmin,
        path,
      },
    });
    if (!response) throw new AppBaseError('system.engine_unavailable', 'engine unreachable');
    if (error) throw new AppBaseError(error.code, 'engine refused the explanation');
    return {
      path: data.path,
      decisions: data.decisions.map((decision) => ({
        action: decision.action,
        allowed: decision.allowed,
        byAdmin: decision.byAdmin,
        grant: decision.grant
          ? {
              subjectType: decision.grant.subjectType,
              subjectId: decision.grant.subjectId,
              path: decision.grant.path,
              effect: decision.grant.effect,
            }
          : null,
      })),
    };
  });
}
