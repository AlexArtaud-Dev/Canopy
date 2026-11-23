'use client';

import { useEffect } from 'react';

import { edgeSwipe, type TouchPoint } from '../edge-swipe.utils';

/**
 * On phones, a swipe from the left edge opens the menu and a swipe to the left closes it, as in
 * native apps. Listens passively on the window: scrolling is never held up.
 */
export function useEdgeSwipe(
  enabled: boolean,
  menuOpen: boolean,
  setMenuOpen: (open: boolean) => void,
) {
  useEffect(() => {
    if (!enabled) return undefined;
    let start: TouchPoint | null = null;
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      start = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : null;
    };
    const onEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (!start || !touch) return;
      const decision = edgeSwipe(start, { x: touch.clientX, y: touch.clientY }, menuOpen);
      start = null;
      if (decision) setMenuOpen(decision === 'open');
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [enabled, menuOpen, setMenuOpen]);
}
