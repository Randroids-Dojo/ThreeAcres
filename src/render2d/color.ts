// Small colour helpers. Colours are kept as [r, g, b] 0..255 and turned into
// CSS strings once, when a palette or a cache is built, never per frame.

export type RGB = [number, number, number];

export function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function css(c: RGB, a = 1): string {
  const r = Math.round(c[0]);
  const g = Math.round(c[1]);
  const b = Math.round(c[2]);
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${Math.round(a * 1000) / 1000})`;
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function shade(c: RGB, k: number): RGB {
  // k < 0 darkens towards a warm umber, k > 0 lightens towards paper white.
  return k < 0 ? mix(c, [40, 28, 22], -k) : mix(c, [255, 250, 236], k);
}

/** Mix two hex colours and return CSS. Convenience for cache painters. */
export function mixc(a: string, b: string, t: number, alpha = 1): string {
  return css(mix(hex(a), hex(b), t), alpha);
}

/** Hex to CSS with an alpha. */
export function rgba(h: string, a: number): string {
  return css(hex(h), a);
}

/** Darken or lighten a hex colour, as CSS. */
export function tone(h: string, k: number, a = 1): string {
  return css(shade(hex(h), k), a);
}
