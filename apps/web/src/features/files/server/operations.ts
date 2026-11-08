'use server';

import { z } from 'zod';

import {
  createFolder as createEngineFolder,
  listDirectory,
  planTransfer as planEngineTransfer,
  renameEntry as renameEngineEntry,
  startTransfer as startEngineTransfer,
  type Job,
} from '@canopy/contracts';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { requireSession } from '@/features/auth';

import { cleanVirtualPath, type PathAction } from '../files.utils';
import {
  entryNameSchema,
  transferInputSchema,
  transferJobInputSchema,
  type TransferConflict,
} from '../operations.utils';
import { engineClientFor } from './engine-client';

/** The engine authorizes and audits every operation; these actions carry the person to it. */
async function client() {
  return engineClientFor(await requireSession());
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid input');
  return parsed.data;
}

function refused(response: Response | undefined, error: { code: string } | undefined): never {
  if (!response) throw new AppBaseError('system.engine_unavailable', 'engine unreachable');
  throw new AppBaseError(error?.code ?? 'system.unexpected', 'engine refused the operation');
}

const pathSchema = z
  .string()
  .max(4096)
  .transform((value, context) => {
    const clean = cleanVirtualPath(value);
    if (clean === null) {
      context.addIssue({ code: 'custom', message: 'invalid path' });
      return z.NEVER;
    }
    return clean;
  });

export async function createFolder(input: unknown): Promise<ActionResult<string>> {
  return runAction(async () => {
    const { parent, name } = parse(z.object({ parent: pathSchema, name: entryNameSchema }), input);
    const path = parent === '/' ? `/${name}` : `${parent}/${name}`;
    const { data, error, response } = await createEngineFolder({
      client: await client(),
      body: { path },
    });
    if (!data) refused(response, error);
    return data.path;
  });
}

export async function renameEntry(input: unknown): Promise<ActionResult<string>> {
  return runAction(async () => {
    const body = parse(z.object({ path: pathSchema, name: entryNameSchema }), input);
    const { data, error, response } = await renameEngineEntry({ client: await client(), body });
    if (!data) refused(response, error);
    return data.path;
  });
}

export interface FolderChoice {
  name: string;
  path: string;
  /** What the person may do inside (the picker only offers folders accepting new items). */
  actions: PathAction[];
}

/** Sub-folders of a folder, for the Copy/Move to… picker. */
export async function listSubfolders(
  input: unknown,
): Promise<ActionResult<{ path: string; actions: PathAction[]; folders: FolderChoice[] }>> {
  return runAction(async () => {
    const { path } = parse(z.object({ path: pathSchema }), input);
    const { data, error, response } = await listDirectory({
      client: await client(),
      query: { path, dirsOnly: true, limit: 500 },
    });
    if (!data) refused(response, error);
    return {
      path: data.path,
      actions: data.actions,
      folders: data.entries.map((entry) => ({
        name: entry.name,
        path: entry.path,
        actions: entry.actions,
      })),
    };
  });
}

/** Validates a copy or move and lists existing targets, before anything is written. */
export async function planTransfer(
  input: unknown,
): Promise<ActionResult<{ conflicts: TransferConflict[]; truncated: boolean }>> {
  return runAction(async () => {
    const body = parse(transferInputSchema, input);
    const { data, error, response } = await planEngineTransfer({ client: await client(), body });
    if (!data) refused(response, error);
    return data;
  });
}

export async function startTransfer(input: unknown): Promise<ActionResult<Job>> {
  return runAction(async () => {
    const { decisions, ...request } = parse(transferJobInputSchema, input);
    const { data, error, response } = await startEngineTransfer({
      client: await client(),
      body: { ...request, decisions: decisions ?? {} },
    });
    if (!data) refused(response, error);
    return data;
  });
}
