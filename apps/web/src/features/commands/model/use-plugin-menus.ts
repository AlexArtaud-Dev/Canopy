'use client';

import { useQuery } from '@tanstack/react-query';

import { pluginMenus, type PluginMenu } from '../commands.utils';
import { loadCommands } from '../server/commands-actions';

const empty: PluginMenu[] = [];

/** Plugin commands the person may run on a folder, for the file browser's right-click menus. */
export function usePluginMenus(): PluginMenu[] {
  const { data } = useQuery({
    queryKey: ['commands', 'catalog'],
    queryFn: async () => {
      const result = await loadCommands();
      return result.ok ? pluginMenus(result.data.entries) : empty;
    },
    staleTime: 60_000,
  });
  return data ?? empty;
}
