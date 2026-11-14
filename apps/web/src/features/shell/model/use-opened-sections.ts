'use client';

import { useCallback, useSyncExternalStore } from 'react';

import type { NavSectionId } from '@/shared/modules/module.types';

/**
 * Sidebar sections the person unfolded during this visit. Sections start folded (only the one
 * holding the current page shows), so that the sidebar stays short; nothing is kept across visits.
 */
let opened: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const empty: ReadonlySet<string> = new Set();

export function useOpenedSections() {
  const current = useSyncExternalStore(
    subscribe,
    () => opened,
    () => empty,
  );
  const setOpen = useCallback((id: NavSectionId, open: boolean) => {
    const next = new Set(opened);
    if (open) next.add(id);
    else next.delete(id);
    opened = next;
    for (const listener of listeners) listener();
  }, []);
  return { opened: current, setOpen };
}
