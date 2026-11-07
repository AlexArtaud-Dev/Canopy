'use server';

import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { listDirectory } from '@canopy/contracts';

import { getDb } from '@/shared/db/client';
import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import type { GlobalPermission } from '@/shared/modules/module.types';
import { audit } from '@/features/audit/server/audit-writer';
import { authorize, requireSession, type CurrentSession } from '@/features/auth';

import { browseInputSchema, grantInputSchema, grantSubjectSchema } from '../files.utils';
import { engineClientFor } from './engine-client';
import { pathGrantsTable } from './files.schema';

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid input');
  return parsed.data;
}

/** Editing a group's grants is a group change; a user's, a user change. */
function permissionFor(subjectType: 'user' | 'group'): GlobalPermission {
  return subjectType === 'group' ? 'groups:update' : 'users:update';
}

export interface GrantRow {
  id: string;
  path: string;
  actions: string[];
  effect: 'allow' | 'deny';
}

export async function listGrants(input: unknown): Promise<ActionResult<GrantRow[]>> {
  return runAction(async () => {
    const { subjectType, subjectId } = parse(grantSubjectSchema, input);
    await authorize(subjectType === 'group' ? 'groups:read' : 'users:read');
    return getDb()
      .select({
        id: pathGrantsTable.id,
        path: pathGrantsTable.path,
        actions: pathGrantsTable.actions,
        effect: pathGrantsTable.effect,
      })
      .from(pathGrantsTable)
      .where(
        and(eq(pathGrantsTable.subjectType, subjectType), eq(pathGrantsTable.subjectId, subjectId)),
      )
      .orderBy(asc(pathGrantsTable.path));
  });
}

export async function addGrant(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const grant = parse(grantInputSchema, input);
    const { user } = await authorize(permissionFor(grant.subjectType));
    await getDb()
      .insert(pathGrantsTable)
      .values({ ...grant, createdBy: user.id });
    await audit({
      action: 'files.grant_add',
      result: 'success',
      actorId: user.id,
      target: grant.path,
      meta: { ...grant },
    });
    return null;
  });
}

const grantIdInput = grantSubjectSchema.extend({ id: z.uuid() });

export async function removeGrant(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { id, subjectType, subjectId } = parse(grantIdInput, input);
    const { user } = await authorize(permissionFor(subjectType));
    const removed = await getDb()
      .delete(pathGrantsTable)
      .where(
        and(
          eq(pathGrantsTable.id, id),
          eq(pathGrantsTable.subjectType, subjectType),
          eq(pathGrantsTable.subjectId, subjectId),
        ),
      )
      .returning({ path: pathGrantsTable.path });
    const [row] = removed;
    if (!row) throw new AppBaseError('system.not_found', 'grant not found');
    await audit({
      action: 'files.grant_remove',
      result: 'success',
      actorId: user.id,
      target: row.path,
      meta: { subjectType, subjectId },
    });
    return null;
  });
}

async function requireGrantEditor(): Promise<CurrentSession> {
  const session = await requireSession();
  const allowed = session.user.permissions.some(
    (permission) => permission === 'groups:update' || permission === 'users:update',
  );
  if (!allowed) throw new AppBaseError('auth.forbidden', 'cannot browse folders for grants');
  return session;
}

export interface FolderEntry {
  name: string;
  path: string;
}

/** Folder picker for the grant editor: sub-folders the editor can see, through the engine. */
export async function browseFolders(
  input: unknown,
): Promise<ActionResult<{ path: string; folders: FolderEntry[] }>> {
  return runAction(async () => {
    const { path } = parse(browseInputSchema, input);
    const session = await requireGrantEditor();
    const { data, error, response } = await listDirectory({
      client: await engineClientFor(session),
      query: { path, dirsOnly: true, limit: 500 },
    });
    if (!response) throw new AppBaseError('system.engine_unavailable', 'engine unreachable');
    if (error) throw new AppBaseError(error.code, 'engine refused the listing');
    return {
      path: data.path,
      folders: data.entries.map((entry) => ({ name: entry.name, path: entry.path })),
    };
  });
}

const grantUpdateInput = grantInputSchema.extend({ id: z.uuid() });

/** Changes the folder, effect or actions of an existing rule of this subject. */
export async function updateGrant(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { id, ...grant } = parse(grantUpdateInput, input);
    const { user } = await authorize(permissionFor(grant.subjectType));
    const updated = await getDb()
      .update(pathGrantsTable)
      .set({ path: grant.path, actions: grant.actions, effect: grant.effect })
      .where(
        and(
          eq(pathGrantsTable.id, id),
          eq(pathGrantsTable.subjectType, grant.subjectType),
          eq(pathGrantsTable.subjectId, grant.subjectId),
        ),
      )
      .returning({ id: pathGrantsTable.id });
    if (updated.length === 0) throw new AppBaseError('system.not_found', 'grant not found');
    await audit({
      action: 'files.grant_update',
      result: 'success',
      actorId: user.id,
      target: grant.path,
      meta: { ...grant, id },
    });
    return null;
  });
}
