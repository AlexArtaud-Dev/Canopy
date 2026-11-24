'use server';

import { readPluginView } from '@canopy/contracts';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { permissionsOf, requireSession } from '@/features/auth';
import { catalogFor, entryOf, startPluginCommand } from '@/features/devices/server/plugin-runs';
import { engineClientFor } from '@/features/files/server/engine-client';

import {
  actionApplies,
  actionValues,
  viewActionInputSchema,
  viewRefSchema,
  viewsOf,
  type ViewRef,
} from '../plugin-views.utils';

function parse<T>(
  schema: { safeParse: (input: unknown) => { success: boolean; data?: T } },
  input: unknown,
): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success || parsed.data === undefined) {
    throw new AppBaseError('system.bad_request', 'invalid input');
  }
  return parsed.data;
}

/** The plugin views the signed-in person may open (the engine lists only what they may use). */
export async function listPluginViews(): Promise<ActionResult<ViewRef[]>> {
  return runAction(async () => {
    const session = await requireSession();
    const permissions = permissionsOf(session.user);
    const catalog = await catalogFor(await engineClientFor(session));
    return viewsOf(
      catalog.entries,
      (permission) => session.user.isAdmin || permissions.some((held) => held === permission),
    );
  });
}

/** A view's current data, as its plugin printed it (the engine checks the permission). */
export async function readPluginViewData(
  input: unknown,
): Promise<ActionResult<Record<string, unknown>>> {
  return runAction(async () => {
    const { plugin, view } = parse(viewRefSchema, input);
    const session = await requireSession();
    const client = await engineClientFor(session);
    const read = await readPluginView({ client, path: { plugin, view } });
    if (read.data) return read.data.data;
    if (!read.response) throw new AppBaseError('system.engine_unavailable', 'engine unreachable');
    throw new AppBaseError(read.error.code, 'view refused');
  });
}

/**
 * Runs one of a view's actions on the chosen rows, as the person: the engine authorizes and
 * audits the command like any run, and refuses it without the view's permission.
 */
export async function runPluginViewAction(
  input: unknown,
): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const request = parse(viewActionInputSchema, input);
    const session = await requireSession();
    const client = await engineClientFor(session);
    const catalog = await catalogFor(client);
    const ref = viewsOf(catalog.entries, () => true).find(
      (candidate) => candidate.pluginId === request.plugin && candidate.view.id === request.view,
    );
    const action = ref?.view.actions.find((candidate) => candidate.id === request.action);
    if (!ref || !action) throw new AppBaseError('plugins.view_not_found', 'no such view action');
    const chosen = { groups: request.groups, items: request.items };
    if (action.on === 'row' && !actionApplies(action, chosen)) {
      throw new AppBaseError('system.bad_request', 'action does not apply to the chosen rows');
    }
    if (action.input && !request.input?.trim()) {
      throw new AppBaseError('system.bad_request', 'action needs its input');
    }
    const job = await startPluginCommand(
      client,
      ref.pluginId,
      entryOf(catalog, action.command),
      actionValues(action, { ...chosen, input: request.input?.trim() }),
    );
    return { jobId: job.id };
  });
}
