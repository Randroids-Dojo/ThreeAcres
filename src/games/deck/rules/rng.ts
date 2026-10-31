// Seeded randomness. The state lives in RunState.rng, so a saved run replays
// exactly; nothing in the rules may call Math.random or read the clock.

import type { RunState } from './types';

export function rand(s: { rng: number }): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(s: RunState, n: number): number {
  return Math.floor(rand(s) * n);
}

export function pick<T>(s: RunState, list: readonly T[]): T {
  return list[Math.floor(rand(s) * list.length)];
}

export function shuffle<T>(s: RunState, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

/** Mix a seed so nearby seeds start far apart. */
export function mixSeed(seed: number): number {
  let h = Math.imul(seed | 0, 0x9e3779b1) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) | 0;
}
