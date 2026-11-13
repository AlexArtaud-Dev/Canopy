'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { loadDefaultDevice, setDefaultDevice } from '../server/default-actions';

/** The person's own default device for a plugin's kind, and a way to change it. */
export function useDefaultDevice(pluginId: string, kind: string) {
  const queryClient = useQueryClient();
  const key = ['devices', pluginId, kind, 'default'] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const result = await loadDefaultDevice({ pluginId, kind });
      return result.ok ? result.data : null;
    },
    staleTime: 60_000,
  });
  const change = useMutation({
    mutationFn: async (id: string | null) => setDefaultDevice({ pluginId, kind, id }),
    onSuccess: (result) => {
      if (result.ok) queryClient.setQueryData(key, result.data);
    },
  });
  return {
    /** Undefined while loading: forms wait before picking anything. */
    defaultId: query.data,
    changing: change.isPending,
    setDefault: (id: string | null) => {
      change.mutate(id);
    },
  };
}
