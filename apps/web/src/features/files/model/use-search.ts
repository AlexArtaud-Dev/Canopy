'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { filesystemQueryRoot } from '@/shared/query/query-keys';

import { searchFolder, type SearchPage } from '../server/search';
import { FolderLoadError } from './use-folder';

const noResults: SearchPage = { entries: [], truncated: null };

/**
 * Search results under a folder. Under the filesystem root key, so any finished job (a move, a
 * delete) refreshes them like a folder. The previous results stay while the next ones load.
 */
export function useSearch(path: string, q: string, enabled: boolean) {
  const result = useQuery({
    queryKey: [filesystemQueryRoot, 'search', path, q] as const,
    queryFn: async () => {
      const response = await searchFolder({ path, q });
      if (!response.ok) throw new FolderLoadError(response.error);
      return response.data;
    },
    enabled,
    placeholderData: keepPreviousData,
  });
  const page = result.data ?? noResults;
  return {
    entries: page.entries,
    truncated: page.truncated,
    searching: result.isFetching,
    refresh: result.refetch,
    error: result.error instanceof FolderLoadError ? result.error.dto : null,
  };
}
