/** A touch position, in CSS pixels from the viewport's top left. */
export interface TouchPoint {
  x: number;
  y: number;
}

/** Only a swipe starting this close to the left edge opens the menu (the rest of the page scrolls). */
export const edgeWidthPx = 24;
/** How far a finger travels sideways before the swipe counts. */
export const swipeDistancePx = 64;

/**
 * What a finger moving from `start` to `end` asks of the phone menu: open it (from the left edge,
 * towards the right), close it (towards the left, anywhere), or nothing. Mostly vertical moves are
 * scrolling and never count.
 */
export function edgeSwipe(
  start: TouchPoint,
  end: TouchPoint,
  menuOpen: boolean,
): 'open' | 'close' | null {
  const dx = end.x - start.x;
  const dy = Math.abs(end.y - start.y);
  if (dy > Math.abs(dx) * 0.6) return null;
  if (!menuOpen && start.x <= edgeWidthPx && dx >= swipeDistancePx) return 'open';
  if (menuOpen && dx <= -swipeDistancePx) return 'close';
  return null;
}
