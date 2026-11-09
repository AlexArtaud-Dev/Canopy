'use server';

import type { z } from 'zod';

import {
  listTrash,
  moveToTrash,
  planDelete,
  restoreFromTrash,
  startEmptyTrash,
  startPermanentDelete,
  type DeletePlan,
  type Job,
  type RestoredItem,
  type TrashItem,
  type TrashListing,
} from '@canopy/contracts';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { requireSession } from '@/features/auth';
import { engineClientFor } from '@/features/files/server/engine-client';

import { idsInputSchema, pathsInputSchema } from '../trash.utils';

/** The engine authorizes, applies the trash limits and audits; these carry the person to it. */
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
  throw new AppBaseError(error?.code ?? 'system.unexpected', 'engine refused the request');
}

/** Sizes a deletion so the person can be warned when it does not fit the trash. */
export async function planDeletion(input: unknown): Promise<ActionResult<DeletePlan>> {
  return runAction(async () => {
    const body = parse(pathsInputSchema, input);
    const { data, error, response } = await planDelete({ client: await client(), body });
    if (!data) refused(response, error);
    return data;
  });
}

export async function trashItems(input: unknown): Promise<ActionResult<TrashItem[]>> {
  return runAction(async () => {
    const body = parse(pathsInputSchema, input);
    const { data, error, response } = await moveToTrash({ client: await client(), body });
    if (!data) refused(response, error);
    return data.items;
  });
}

export async function deletePermanently(input: unknown): Promise<ActionResult<Job>> {
  return runAction(async () => {
    const body = parse(pathsInputSchema, input);
    const { data, error, response } = await startPermanentDelete({ client: await client(), body });
    if (!data) refused(response, error);
    return data;
  });
}

export async function loadTrash(): Promise<ActionResult<TrashListing>> {
  return runAction(async () => {
    const { data, error, response } = await listTrash({ client: await client() });
    if (!data) refused(response, error);
    return data;
  });
}

export async function restoreItems(input: unknown): Promise<ActionResult<RestoredItem[]>> {
  return runAction(async () => {
    const body = parse(idsInputSchema, input);
    const { data, error, response } = await restoreFromTrash({ client: await client(), body });
    if (!data) refused(response, error);
    return data.items;
  });
}

/** Removes the given items for good, or every item the person sees when `ids` is empty. */
export async function emptyTrash(input: unknown): Promise<ActionResult<Job>> {
  return runAction(async () => {
    const body = parse(idsInputSchema, input);
    const { data, error, response } = await startEmptyTrash({ client: await client(), body });
    if (!data) refused(response, error);
    return data;
  });
}
