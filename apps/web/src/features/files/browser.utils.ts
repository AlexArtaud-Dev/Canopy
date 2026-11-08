import { z } from 'zod';

import { cleanVirtualPath } from './files.utils';

export const sortKeys = ['name', 'size', 'modified'] as const;
export type SortKey = (typeof sortKeys)[number];
export type SortOrder = 'asc' | 'desc';
export type BrowserView = 'list' | 'grid';

/** Entries fetched per request; the list is virtualized so pages stream in as you scroll. */
export const browserPageSize = 500;

/** `/?path=&sort=&order=` of the Files page, tolerant of junk in the URL. */
export const browserQuerySchema = z.object({
  path: z
    .string()
    .transform((value) => cleanVirtualPath(value) ?? '/')
    .catch('/'),
  sort: z.enum(sortKeys).catch('name'),
  order: z.enum(['asc', 'desc']).catch('asc'),
});
export type BrowserQuery = z.infer<typeof browserQuerySchema>;

/** Search string for a folder; defaults are omitted so URLs stay short. */
export function browserHref(query: BrowserQuery): string {
  const params = new URLSearchParams();
  if (query.path !== '/') params.set('path', query.path);
  if (query.sort !== 'name') params.set('sort', query.sort);
  if (query.order !== 'asc') params.set('order', query.order);
  const search = params.toString();
  return search ? `/?${search}` : '/';
}

/** Clicking the active column flips its order; another column starts ascending. */
export function nextSort(
  current: BrowserQuery,
  key: SortKey,
): Pick<BrowserQuery, 'sort' | 'order'> {
  if (current.sort !== key) return { sort: key, order: 'asc' };
  return { sort: key, order: current.order === 'asc' ? 'desc' : 'asc' };
}

export function parentPath(path: string): string | null {
  if (path === '/') return null;
  const parent = path.slice(0, path.lastIndexOf('/'));
  return parent === '' ? '/' : parent;
}

// ---------------------------------------------------------------------------------------------
// Selection: keys are entry paths; the anchor is where a Shift range starts.

export interface Selection {
  selected: ReadonlySet<string>;
  anchor: string | null;
}

export const emptySelection: Selection = { selected: new Set(), anchor: null };

export type SelectionAction =
  | { type: 'only'; key: string }
  | { type: 'toggle'; key: string }
  | { type: 'range'; key: string }
  | { type: 'all' }
  | { type: 'clear' }
  | { type: 'retain' };

/** Pure selection reducer over the ordered keys currently listed. */
export function reduceSelection(
  state: Selection,
  action: SelectionAction,
  keys: readonly string[],
): Selection {
  switch (action.type) {
    case 'only':
      return { selected: new Set([action.key]), anchor: action.key };
    case 'toggle': {
      const selected = new Set(state.selected);
      if (selected.has(action.key)) selected.delete(action.key);
      else selected.add(action.key);
      return { selected, anchor: action.key };
    }
    case 'range': {
      const from = state.anchor === null ? -1 : keys.indexOf(state.anchor);
      const to = keys.indexOf(action.key);
      if (to === -1) return state;
      if (from === -1) return { selected: new Set([action.key]), anchor: action.key };
      const [low, high] = from < to ? [from, to] : [to, from];
      return { selected: new Set(keys.slice(low, high + 1)), anchor: state.anchor };
    }
    case 'all':
      return { selected: new Set(keys), anchor: state.anchor };
    case 'clear':
      return emptySelection;
    case 'retain': {
      // After a reload, drop keys that are no longer listed.
      const listed = new Set(keys);
      const selected = new Set([...state.selected].filter((key) => listed.has(key)));
      const anchor = state.anchor !== null && listed.has(state.anchor) ? state.anchor : null;
      return { selected, anchor };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Keyboard focus: an index into the listed entries; the grid moves by whole rows vertically.

export const pageJump = 10;

/** Next focused index for a navigation key, or null when the key does not move focus. */
export function moveFocus(
  index: number,
  key: string,
  count: number,
  columns: number,
): number | null {
  if (count === 0) return null;
  const clamp = (value: number) => Math.min(Math.max(value, 0), count - 1);
  const step = Math.max(columns, 1);
  switch (key) {
    case 'ArrowDown':
      return clamp(index + step);
    case 'ArrowUp':
      return clamp(index - step);
    case 'ArrowRight':
      return step > 1 ? clamp(index + 1) : null;
    case 'ArrowLeft':
      return step > 1 ? clamp(index - 1) : null;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    case 'PageDown':
      return clamp(index + step * pageJump);
    case 'PageUp':
      return clamp(index - step * pageJump);
    default:
      return null;
  }
}

/** Tiles per grid row for a container width (each tile at least minTile wide, gaps included). */
export function gridColumns(width: number, minTile: number, gap: number): number {
  if (width <= 0) return 1;
  return Math.max(1, Math.floor((width + gap) / (minTile + gap)));
}

// ---------------------------------------------------------------------------------------------
// Display helpers.

const byteUnits = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte', 'petabyte'] as const;

/** "1.5 MB" in the viewer's locale (powers of 1024, as file managers do). */
export function formatBytes(bytes: number, locale: string): string {
  let value = Math.max(bytes, 0);
  let unit = 0;
  while (value >= 1024 && unit < byteUnits.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: byteUnits[unit],
    unitDisplay: 'short',
    maximumFractionDigits: unit === 0 || value >= 100 ? 0 : 1,
  }).format(value);
}

export type FileKind =
  'folder' | 'image' | 'video' | 'audio' | 'archive' | 'code' | 'text' | 'document' | 'file';

const kindsByExtension = new Map<string, FileKind>(
  Object.entries({
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'bmp', 'svg', 'tiff', 'raw'],
    video: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v', 'wmv'],
    audio: ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'opus'],
    archive: ['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'zst'],
    code: [
      'js',
      'ts',
      'tsx',
      'jsx',
      'go',
      'py',
      'rs',
      'java',
      'c',
      'h',
      'cpp',
      'sh',
      'json',
      'yaml',
      'yml',
      'toml',
      'html',
      'css',
      'sql',
    ],
    text: ['txt', 'md', 'log', 'csv', 'ini', 'conf', 'nfo', 'srt'],
    document: ['pdf', 'doc', 'docx', 'odt', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp', 'epub'],
  } satisfies Partial<Record<FileKind, string[]>>).flatMap(([kind, extensions]) =>
    extensions.map((extension) => [extension, kind as FileKind]),
  ),
);

/** Coarse kind of an entry, for its icon. */
export function fileKind(name: string, isDirectory: boolean): FileKind {
  if (isDirectory) return 'folder';
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return 'file';
  return kindsByExtension.get(name.slice(dot + 1).toLowerCase()) ?? 'file';
}
