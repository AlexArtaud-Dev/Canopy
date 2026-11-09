'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

import type { NavSectionId } from '@/shared/modules/module.types';

const storageKey = 'canopy.sidebar.closedSections';
const sectionsChanged = 'canopy:sidebar-sections';
/** The folding done in this tab, which wins even when storage refuses to keep it. */
let chosen: string | null = null;

/** Raw stored list: a string snapshot stays equal between reads, as React requires. */
function readRaw(): string {
  if (chosen !== null) return chosen;
  try {
    return window.localStorage.getItem(storageKey) ?? '[]';
  } catch {
    return '[]';
  }
}

function parse(raw: string): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(sectionsChanged, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(sectionsChanged, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Sidebar sections the person folded, per browser (sections start open without storage). */
export function useClosedSections() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => '[]');
  const closed = useMemo(() => parse(raw), [raw]);

  const setOpen = useCallback((id: NavSectionId, open: boolean) => {
    const next = new Set(parse(readRaw()));
    if (open) next.delete(id);
    else next.add(id);
    chosen = JSON.stringify([...next]);
    try {
      window.localStorage.setItem(storageKey, chosen);
    } catch {
      // Not remembered across visits, still applied in this tab.
    }
    window.dispatchEvent(new Event(sectionsChanged));
  }, []);

  return { closed, setOpen };
}
