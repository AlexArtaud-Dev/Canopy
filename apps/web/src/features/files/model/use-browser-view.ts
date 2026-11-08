'use client';

import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from 'react';

import type { BrowserView } from '../browser.utils';

const viewStorageKey = 'canopy.files.view';
const viewChanged = 'canopy:files-view';
/** The choice made in this tab, which wins even when storage refuses to keep it. */
let chosenView: BrowserView | null = null;

function readView(): BrowserView {
  if (chosenView) return chosenView;
  try {
    return window.localStorage.getItem(viewStorageKey) === 'grid' ? 'grid' : 'list';
  } catch {
    // Private mode or blocked storage: the default view.
    return 'list';
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(viewChanged, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(viewChanged, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** List or grid, remembered per browser (a convenience: storage may be unavailable). */
export function useBrowserView(): [BrowserView, (view: BrowserView) => void] {
  const view = useSyncExternalStore(subscribe, readView, () => 'list' as const);
  const change = useCallback((next: BrowserView) => {
    chosenView = next;
    try {
      window.localStorage.setItem(viewStorageKey, next);
    } catch {
      // Not remembered across visits, still applied in this tab.
    }
    window.dispatchEvent(new Event(viewChanged));
  }, []);
  return [view, change];
}

/** Width of an element, updated as it resizes (grid columns follow it). */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return width;
}
