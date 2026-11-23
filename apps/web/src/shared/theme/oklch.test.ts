import { mixHex, oklchCss, oklchToHex } from './oklch';

describe('oklch', () => {
  it('converts to sRGB hex', () => {
    expect(oklchToHex([1, 0, 0])).toBe('#ffffff');
    expect(oklchToHex([0, 0, 0])).toBe('#000000');
    expect(oklchToHex([0.627955, 0.257683, 29.2339])).toBe('#ff0000');
    expect(oklchToHex([0.86644, 0.294827, 142.4953])).toBe('#00ff00');
  });

  it('clamps colours outside the sRGB gamut', () => {
    expect(oklchToHex([0.9, 0.4, 145])).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('blends hex colours and writes CSS', () => {
    expect(mixHex('#ff0000', '#ffffff', 0.5)).toBe('#ff8080');
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#ffffff');
    expect(oklchCss([0.5, 0.1, 162])).toBe('oklch(0.5 0.1 162)');
  });
});
