'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import type { ErrorDto } from '@/shared/lib/errors';
import { filesystemQueryRoot } from '@/shared/query/query-keys';

import type { BrowserQuery } from '../browser.utils';
import { listFolder, type BrowserEntry, type FolderPage } from '../server/browse';

/** Carries the server's error DTO through TanStack Query. */
export class FolderLoadError extends Error {
  constructor(readonly dto: ErrorDto) {
    super(dto.code);
  }
}

export function folderQueryKey(query: BrowserQuery) {
  return [filesystemQueryRoot, 'folder', query.path, query.sort, query.order] as const;
}

/** A folder's entries, the first page rendered by the server and the rest streamed on demand. */
export function useFolder(query: BrowserQuery, firstPage: FolderPage) {
  const result = useInfiniteQuery({
    queryKey: folderQueryKey(query),
    queryFn: async ({ pageParam }) => {
      const response = await listFolder({ ...query, offset: pageParam });
      if (!response.ok) throw new FolderLoadError(response.error);
      return response.data;
    },
    initialPageParam: 0,
    getNextPageParam: (last: FolderPage) => {
      const next = last.offset + last.entries.length;
      return last.entries.length > 0 && next < last.total ? next : undefined;
    },
    initialData: { pages: [firstPage], pageParams: [0] },
  });
  const entries: BrowserEntry[] = result.data.pages.flatMap((page) => page.entries);
  const last = result.data.pages.at(-1) ?? firstPage;
  return {
    entries,
    total: last.total,
    actions: last.actions,
    hasMore: result.hasNextPage,
    loadingMore: result.isFetchingNextPage,
    loadMore: result.fetchNextPage,
    refresh: result.refetch,
    refreshing: result.isRefetching && !result.isFetchingNextPage,
    error: result.error instanceof FolderLoadError ? result.error.dto : null,
  };
}
