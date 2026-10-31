// Seeded randomness for the painter. Every cached drawing is seeded from what
// it depicts (a tile, a tree, a crop stage), so redrawing a patch of the page
// lays down exactly the same strokes as before.

/** Integer hash of up to three numbers, 0 to 2^32. */
export function hash3(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** 0 to 1 from up to three numbers. */
export function hashf(a: number, b = 0, c = 0): number {
  return hash3(a, b, c) / 4294967296;
}

export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  reseed(seed: number): this {
    this.s = seed >>> 0 || 1;
    return this;
  }
  /** 0 to 1. Mulberry32. */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** a to b. */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  /** -a to a. */
  jit(a: number): number {
    return (this.next() * 2 - 1) * a;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** Smooth value noise on a wrapping lattice, for paper and washes. */
export function valueNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const p = period;
  const w = (i: number, j: number) => hashf(((i % p) + p) % p, ((j % p) + p) % p, seed);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = w(xi, yi);
  const b = w(xi + 1, yi);
  const c = w(xi, yi + 1);
  const d = w(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
