'use client';

import { useCallback, useSyncExternalStore } from 'react';

const storageKey = 'canopy.whatsNew.lastSeen';
const seenChanged = 'canopy:whats-new-seen';
/** Marked in this tab, which wins even when storage refuses to keep it. */
let chosen: string | null = null;

function read(): string | null {
  if (chosen !== null) return chosen;
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(seenChanged, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(seenChanged, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * The last release the person saw in "What's new", per browser (a convenience: without storage
 * the badge shows until the page is opened in this tab). Undefined until read on the client.
 */
export function useLastSeenRelease(): [string | null | undefined, (version: string) => void] {
  const lastSeen = useSyncExternalStore(subscribe, read, () => undefined);
  const markSeen = useCallback((version: string) => {
    chosen = version;
    try {
      window.localStorage.setItem(storageKey, version);
    } catch {
      // Not remembered across visits, still applied in this tab.
    }
    window.dispatchEvent(new Event(seenChanged));
  }, []);
  return [lastSeen, markSeen];
}
