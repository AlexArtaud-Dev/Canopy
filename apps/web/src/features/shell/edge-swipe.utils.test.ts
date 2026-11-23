import { edgeSwipe, edgeWidthPx, swipeDistancePx } from './edge-swipe.utils';

const at = (x: number, y = 300) => ({ x, y });

describe('edge swipe', () => {
  it('opens the menu from the left edge towards the right', () => {
    expect(edgeSwipe(at(4), at(4 + swipeDistancePx), false)).toBe('open');
    expect(edgeSwipe(at(edgeWidthPx), at(edgeWidthPx + 120, 330), false)).toBe('open');
  });

  it('ignores swipes away from the edge, too short or mostly vertical', () => {
    expect(edgeSwipe(at(edgeWidthPx + 1), at(200), false)).toBeNull();
    expect(edgeSwipe(at(4), at(4 + swipeDistancePx - 1), false)).toBeNull();
    expect(edgeSwipe(at(4, 100), at(120, 300), false)).toBeNull();
  });

  it('closes the open menu towards the left, from anywhere', () => {
    expect(edgeSwipe(at(260), at(260 - swipeDistancePx), true)).toBe('close');
    expect(edgeSwipe(at(4), at(200), true)).toBeNull();
    expect(edgeSwipe(at(260), at(100), false)).toBeNull();
  });
});
