'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useMemo } from 'react';

import { runLabels, type RunLabels } from '../commands.utils';
import { loadCommands } from '../server/commands-actions';

const none: RunLabels = { names: new Map(), quiet: new Set() };

/** The names of the commands the person may run, and those run on their behalf. */
export function useRunLabels(): RunLabels {
  const locale = useLocale();
  const { data } = useQuery({
    queryKey: ['commands', 'catalog', 'all'],
    queryFn: async () => {
      const result = await loadCommands();
      return result.ok ? result.data.entries : [];
    },
    staleTime: 60_000,
  });
  return useMemo(() => (data ? runLabels(data, locale) : none), [data, locale]);
}
