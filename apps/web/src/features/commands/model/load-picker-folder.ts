import { listFolder } from '@/features/files/server/browse';

import type { PickerEntry } from '../commands.utils';

/** A folder as the path picker reads it, or the error code the engine refused it with. */
export type PickerFolder =
  | { ok: true; path: string; entries: PickerEntry[]; truncated: boolean }
  | { ok: false; code: string; params?: Record<string, string | number> };

/** The first page of a folder, as the signed-in person sees it (grants applied by the engine). */
export async function loadPickerFolder(path: string): Promise<PickerFolder> {
  const result = await listFolder({ path, offset: 0 });
  if (!result.ok) return { ok: false, code: result.error.code, params: result.error.params };
  return {
    ok: true,
    path: result.data.path,
    entries: result.data.entries.map(({ name, path: entryPath, isDirectory }) => ({
      name,
      path: entryPath,
      isDirectory,
    })),
    truncated: result.data.total > result.data.entries.length,
  };
}
