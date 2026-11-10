'use server';

import { statEntry } from '@canopy/contracts';

import { runAction, type ActionResult } from '@/shared/lib/action';
import { AppBaseError } from '@/shared/lib/errors';
import { audit } from '@/features/audit/server/audit-writer';
import { requireSession } from '@/features/auth';

import { favoriteInputSchema, maxFavorites, toFavorites, type Favorite } from '../favorites.utils';
import { engineClientFor } from './engine-client';
import {
  countFavorites,
  deleteFavorite,
  insertFavorite,
  listFavoritePaths,
} from './favorites-store';

type EngineClient = Awaited<ReturnType<typeof engineClientFor>>;

/** True when the person may see the path and it is a folder. */
async function isOpenableFolder(client: EngineClient, path: string): Promise<boolean> {
  const { data } = await statEntry({ client, query: { path } });
  return data?.kind === 'directory';
}

/** The signed-in person's favorites, each checked against the engine (grants, existence). */
export async function listFavorites(): Promise<ActionResult<Favorite[]>> {
  return runAction(async () => {
    const session = await requireSession();
    const paths = await listFavoritePaths(session.user.id);
    if (paths.length === 0) return [];
    const client = await engineClientFor(session);
    const checks = await Promise.all(
      paths.map(async (path) => ((await isOpenableFolder(client, path)) ? path : null)),
    );
    return toFavorites(paths, new Set(checks.filter((path) => path !== null)));
  });
}

/** Pins a folder the person can open. */
export async function addFavorite(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = favoriteInputSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('files.invalid_path', 'invalid favorite path');
    const { path } = parsed.data;
    const session = await requireSession();
    if ((await countFavorites(session.user.id)) >= maxFavorites) {
      throw new AppBaseError('files.favorites_full', 'too many favorites', {
        params: { max: maxFavorites },
      });
    }
    if (!(await isOpenableFolder(await engineClientFor(session), path))) {
      throw new AppBaseError('files.not_found', 'favorite folder not visible');
    }
    await insertFavorite(session.user.id, path);
    await audit({
      action: 'files.favorite_add',
      result: 'success',
      actorId: session.user.id,
      target: path,
    });
    return null;
  });
}

/** Unpins a folder, even one the person can no longer open. */
export async function removeFavorite(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const parsed = favoriteInputSchema.safeParse(input);
    if (!parsed.success) throw new AppBaseError('files.invalid_path', 'invalid favorite path');
    const session = await requireSession();
    if (await deleteFavorite(session.user.id, parsed.data.path)) {
      await audit({
        action: 'files.favorite_remove',
        result: 'success',
        actorId: session.user.id,
        target: parsed.data.path,
      });
    }
    return null;
  });
}
