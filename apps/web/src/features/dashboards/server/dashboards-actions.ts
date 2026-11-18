'use server';

import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { audit } from '@/features/audit/server/audit-writer';
import { requireSession, type CurrentSession } from '@/features/auth';

import {
  dashboardIdSchema,
  dashboardInputSchema,
  defaultDashboard,
  type Dashboard,
  type DashboardInput,
} from '../dashboards.utils';
import {
  deleteDashboard,
  findDashboard,
  insertDashboard,
  listDashboards,
  setHome,
  updateDashboard,
} from './dashboards-store';
import { loadVariables } from './variables-actions';

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppBaseError('system.bad_request', 'invalid input');
  return parsed.data;
}

/** The default dashboard for this person: from what they may read, in their language. */
async function defaultFor(): Promise<DashboardInput> {
  const [t, variables] = await Promise.all([
    getTranslations('dashboards.default'),
    loadVariables(),
  ]);
  return defaultDashboard(variables.ok ? variables.data : [], {
    name: t('name'),
    folders: t('folders'),
    space: t('space'),
    operations: t('operations'),
    dropOffs: t('dropOffs'),
    audit: t('audit'),
  });
}

async function record(session: CurrentSession, action: string, dashboard: string) {
  await audit({ action, result: 'success', actorId: session.user.id, target: dashboard });
}

/**
 * The person's dashboards; a first visit gets the default one, made their home, so that nobody
 * starts from an empty page.
 */
export async function loadDashboards(): Promise<ActionResult<Dashboard[]>> {
  return runAction(async () => {
    const session = await requireSession();
    const existing = await listDashboards(session.user.id);
    if (existing.length > 0) return existing;
    const created = await insertDashboard(session.user.id, await defaultFor(), true);
    await record(session, 'dashboards.create', created.id);
    return [created];
  });
}

const createSchema = z.object({ name: z.string().trim().min(1).max(80) });

/** A new, empty dashboard. */
export async function createDashboard(input: unknown): Promise<ActionResult<Dashboard>> {
  return runAction(async () => {
    const { name } = parse(createSchema, input);
    const session = await requireSession();
    const created = await insertDashboard(
      session.user.id,
      { name, range: '24h', refreshSeconds: 60, panels: [] },
      false,
    );
    await record(session, 'dashboards.create', created.id);
    return created;
  });
}

/** Saves a dashboard the person owns: name, range, refresh and panels. */
export async function saveDashboard(input: unknown): Promise<ActionResult<Dashboard>> {
  return runAction(async () => {
    const { id, ...values } = parse(dashboardIdSchema.extend(dashboardInputSchema.shape), input);
    const session = await requireSession();
    const saved = await updateDashboard(session.user.id, id, values);
    if (!saved) throw new AppBaseError('dashboards.not_found', 'no such dashboard');
    await record(session, 'dashboards.update', id);
    return saved;
  });
}

/** A copy of a dashboard, to try changes without losing the original. */
export async function duplicateDashboard(input: unknown): Promise<ActionResult<Dashboard>> {
  return runAction(async () => {
    const { id } = parse(dashboardIdSchema, input);
    const session = await requireSession();
    const source = await findDashboard(session.user.id, id);
    if (!source) throw new AppBaseError('dashboards.not_found', 'no such dashboard');
    const t = await getTranslations('dashboards');
    const created = await insertDashboard(
      session.user.id,
      {
        name: t('copyName', { name: source.name }).slice(0, 80),
        range: source.range,
        refreshSeconds: source.refreshSeconds,
        panels: source.panels,
      },
      false,
    );
    await record(session, 'dashboards.create', created.id);
    return created;
  });
}

/** Deletes a dashboard; if it was the home, another one becomes it. */
export async function removeDashboard(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { id } = parse(dashboardIdSchema, input);
    const session = await requireSession();
    const removed = await findDashboard(session.user.id, id);
    if (!removed || !(await deleteDashboard(session.user.id, id))) return null;
    const [next] = await listDashboards(session.user.id);
    if (removed.isHome && next) await setHome(session.user.id, next.id);
    await record(session, 'dashboards.delete', id);
    return null;
  });
}

/** The dashboard `/dashboards` opens. */
export async function makeHomeDashboard(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { id } = parse(dashboardIdSchema, input);
    const session = await requireSession();
    if (!(await findDashboard(session.user.id, id))) {
      throw new AppBaseError('dashboards.not_found', 'no such dashboard');
    }
    await setHome(session.user.id, id);
    await record(session, 'dashboards.home', id);
    return null;
  });
}

/** Puts the default panels back on a dashboard (keeping its name). */
export async function resetDashboard(input: unknown): Promise<ActionResult<Dashboard>> {
  return runAction(async () => {
    const { id } = parse(dashboardIdSchema, input);
    const session = await requireSession();
    const current = await findDashboard(session.user.id, id);
    if (!current) throw new AppBaseError('dashboards.not_found', 'no such dashboard');
    const defaults = await defaultFor();
    const saved = await updateDashboard(session.user.id, id, { ...defaults, name: current.name });
    if (!saved) throw new AppBaseError('dashboards.not_found', 'no such dashboard');
    await record(session, 'dashboards.update', id);
    return saved;
  });
}
