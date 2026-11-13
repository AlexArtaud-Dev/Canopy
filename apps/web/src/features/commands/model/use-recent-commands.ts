'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { withRecent } from '../commands.utils';

const storageKey = 'canopy.commands.recent';
const recentChanged = 'canopy:commands-recent';
/** What this tab ran, which wins even when storage refuses to keep it. */
let remembered: string | null = null;

/** Raw stored list: a string snapshot stays equal between reads, as React requires. */
function readRaw(): string {
  if (remembered !== null) return remembered;
  try {
    return window.localStorage.getItem(storageKey) ?? '[]';
  } catch {
    return '[]';
  }
}

function parse(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(recentChanged, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(recentChanged, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** The commands this browser ran lately, the latest first: a convenience, never a record. */
export function useRecentCommands() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => '[]');
  const recent = useMemo(() => parse(raw), [raw]);

  const remember = useCallback((id: string) => {
    remembered = JSON.stringify(withRecent(parse(readRaw()), id));
    try {
      window.localStorage.setItem(storageKey, remembered);
    } catch {
      // Not kept across visits, still shown in this tab.
    }
    window.dispatchEvent(new Event(recentChanged));
  }, []);

  return { recent, remember };
}
