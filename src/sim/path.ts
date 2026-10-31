// Grid paths for the farmer and the hands. The farm is small (300 tiles), so
// a breadth-first search per request is plenty.

import { MAP_H, MAP_W } from './map';
import { walkable } from './world';
import type { WorldState } from './types';

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

const prev = new Int16Array(MAP_W * MAP_H);
const queue = new Int16Array(MAP_W * MAP_H);

/**
 * Shortest walk from (sx, sy) to any tile within one step (8 ways) of the
 * target, including the target itself. Returns the tiles to walk, not
 * including the start, or null if there is no way.
 */
export function pathNextTo(s: WorldState, sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] | null {
  return search(s, sx, sy, (x, y) => Math.max(Math.abs(x - tx), Math.abs(y - ty)) <= 1 && !(x === tx && y === ty && hasNeighbourStand(s, tx, ty, sx, sy)));
}

/** Shortest walk to exactly (tx, ty). */
export function pathTo(s: WorldState, sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] | null {
  return search(s, sx, sy, (x, y) => x === tx && y === ty);
}

// Stand beside a tile rather than on it when a neighbour is free, so the
// farmer does not end up on top of the crop it is working.
function hasNeighbourStand(s: WorldState, tx: number, ty: number, sx: number, sy: number): boolean {
  if (sx === tx && sy === ty) return false;
  for (const [dx, dy] of DIRS) if (walkable(s, tx + dx, ty + dy)) return true;
  return false;
}

function search(s: WorldState, sx: number, sy: number, goal: (x: number, y: number) => boolean): { x: number; y: number }[] | null {
  if (goal(sx, sy)) return [];
  prev.fill(-1);
  const start = sy * MAP_W + sx;
  prev[start] = start;
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % MAP_W;
    const cy = (cur - cx) / MAP_W;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!walkable(s, nx, ny)) continue;
      // No cutting corners past a blocked tile.
      if (dx !== 0 && dy !== 0 && (!walkable(s, cx + dx, cy) || !walkable(s, cx, cy + dy))) continue;
      const n = ny * MAP_W + nx;
      if (prev[n] !== -1) continue;
      prev[n] = cur;
      if (goal(nx, ny)) {
        const out: { x: number; y: number }[] = [];
        let k = n;
        while (k !== start) {
          out.push({ x: k % MAP_W, y: Math.floor(k / MAP_W) });
          k = prev[k];
        }
        return out.reverse();
      }
      queue[tail++] = n;
    }
  }
  return null;
}
