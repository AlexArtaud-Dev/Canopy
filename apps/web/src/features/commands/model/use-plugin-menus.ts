'use client';

import type { CommandEntry } from '@canopy/contracts';
import { useQuery } from '@tanstack/react-query';

import { loadCommands } from '../server/commands-actions';

const empty: CommandEntry[] = [];

/** The plugin commands the person may run, for the file browser's right-click menus. */
export function usePluginCommands(): CommandEntry[] {
  const { data } = useQuery({
    queryKey: ['commands', 'catalog'],
    queryFn: async () => {
      const result = await loadCommands();
      return result.ok ? result.data.entries.filter((entry) => entry.plugin !== undefined) : empty;
    },
    staleTime: 60_000,
  });
  return data ?? empty;
}
