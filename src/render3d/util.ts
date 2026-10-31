// Small helpers shared by the 3D renderer: seeded randomness for stable
// decoration, colour helpers, and a reusable matrix for placing parts.

import { Color, Euler, Matrix4, Quaternion, SRGBColorSpace, Vector3 } from 'three';

/** Mulberry32. Decoration uses it so a rebuild scatters tufts in the same places. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable hash of integer coordinates to 0..1. */
export function hash2(x: number, y: number, s = 0): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in 2D, 0..1. */
export function noise2(x: number, y: number, s = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s);
  const b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s);
  const d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** A colour from sRGB hex, in the linear working space three uses. */
export function col(hex: string | number): Color {
  return new Color(hex);
}

const _hsl = { h: 0, s: 0, l: 0 };

/**
 * Shifts saturation and lightness in sRGB space, where steps look even.
 * (Color.offsetHSL works on linear lightness, where a dark green is about 0.09,
 * so shading its underside clamped it to pure black.) Never reaches black or white.
 */
export function tone(c: Color, ds: number, dl: number): Color {
  c.getHSL(_hsl, SRGBColorSpace);
  return c.setHSL(_hsl.h, clamp(_hsl.s + ds, 0, 1), clamp(_hsl.l + dl, 0.05, 0.96), SRGBColorSpace);
}

/** Mix two colours into out (no allocation). */
export function mixInto(out: Color, a: Color, b: Color, t: number): Color {
  out.r = a.r + (b.r - a.r) * t;
  out.g = a.g + (b.g - a.g) * t;
  out.b = a.b + (b.b - a.b) * t;
  return out;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smooth(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();

/**
 * A shared transform for placing a part: translate, rotate (Y then X then Z,
 * in radians) and scale. The result is reused, so consume it straight away.
 */
export function at(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx): Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return _m.compose(_p, _q, _s);
}

/** Ease out with a little overshoot, 0..1 to 0..1. */
export function backOut(t: number): number {
  const c = 1.9;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}
