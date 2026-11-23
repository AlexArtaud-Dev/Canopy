/** A colour in OKLCH: lightness 0–1, chroma, hue in degrees. */
export type Oklch = readonly [l: number, c: number, h: number];

function toGamma(linear: number): number {
  const value = linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, value));
}

/**
 * An OKLCH colour as sRGB hex (clamped to the gamut), for places that only take hex: e-mails,
 * whose clients ignore CSS variables and modern colour functions.
 */
export function oklchToHex([l, c, h]: Oklch): string {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ];
  return `#${rgb
    .map((channel) =>
      Math.round(toGamma(channel) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** `color` blended into `base` by `amount` (0–1), in sRGB: tints for e-mail backgrounds. */
export function mixHex(color: string, base: string, amount: number): string {
  const channel = (hex: string, index: number) => parseInt(hex.slice(index, index + 2), 16);
  const mixed = [1, 3, 5].map((index) =>
    Math.round(channel(color, index) * amount + channel(base, index) * (1 - amount)),
  );
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

/** `oklch(l c h)` as CSS reads it. */
export function oklchCss([l, c, h]: Oklch): string {
  return `oklch(${String(l)} ${String(c)} ${String(h)})`;
}
