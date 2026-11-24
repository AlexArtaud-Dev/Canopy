import 'server-only';

import type { GlobalPermission } from '@/shared/modules/module.types';
import { requireSession } from '@/features/auth';
import { catalogFor } from '@/features/devices/server/plugin-runs';
import { engineClientFor } from '@/features/files/server/engine-client';

import { viewsOf, type ViewRef } from '../plugin-views.utils';

function isGlobalPermission(value: string): value is GlobalPermission {
  return /^[a-z][a-z0-9-]*:.+$/.test(value);
}

/**
 * The plugin views of the installed plugins, as the signed-in person sees the catalog (all of
 * them for an administrator). Empty when the engine cannot be reached: roles then keep only the
 * permissions Canopy itself declares.
 */
export async function installedViews(): Promise<ViewRef[]> {
  try {
    const session = await requireSession();
    const catalog = await catalogFor(await engineClientFor(session));
    return viewsOf(catalog.entries, () => true);
  } catch {
    return [];
  }
}

/** Each installed view with the permission it declares, for the role editor. */
export async function installedViewGrants(): Promise<
  { ref: ViewRef; permission: GlobalPermission }[]
> {
  return (await installedViews()).flatMap((ref) =>
    isGlobalPermission(ref.view.permission) ? [{ ref, permission: ref.view.permission }] : [],
  );
}

/** The permissions those views declare, for saving roles. */
export async function installedViewPermissions(): Promise<GlobalPermission[]> {
  return (await installedViewGrants()).map((grant) => grant.permission);
}
