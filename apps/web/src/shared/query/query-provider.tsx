'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { isStaleVersionError, reloadForNewVersion } from '@/shared/errors/stale-version';

/** Canopy was updated under this tab: the old page cannot talk to the new server. */
function onError(error: unknown) {
  if (isStaleVersionError(error)) reloadForNewVersion();
}

/** One client per browser tab; server actions do the fetching, so retries stay off. */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError }),
        mutationCache: new MutationCache({ onError }),
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
