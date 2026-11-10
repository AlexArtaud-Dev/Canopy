import { z } from 'zod';

import { cleanVirtualPath } from './files.utils';

/** Enough for a sidebar list; more would be a bookmark manager. */
export const maxFavorites = 50;

/** A clean virtual folder path, or a validation error. */
export const favoriteInputSchema = z.object({
  path: z
    .string()
    .max(4096)
    // Invalid paths clean to '' and the root to '/': neither can be pinned.
    .transform((value) => cleanVirtualPath(value) ?? '')
    .pipe(z.string().regex(/^\/./)),
});

/** The label of a favorite: its folder name. */
export function favoriteName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1) || '/';
}

export interface Favorite {
  path: string;
  name: string;
  /** The person can still open it (grants and the folder itself unchanged). */
  available: boolean;
}

/** Favorites as the sidebar shows them, unavailable ones kept in place. */
export function toFavorites(paths: readonly string[], openable: ReadonlySet<string>): Favorite[] {
  return paths.map((path) => ({ path, name: favoriteName(path), available: openable.has(path) }));
}
