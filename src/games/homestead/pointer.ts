// The lesson pointer, tapped. The chevron over a target in view takes no taps
// of its own: a tap on the farm counts as a tap on the pointer only inside
// its target tile (the fifth playtest's chevron, drawn half a tile up, took
// taps meant for the plot behind it, took the Build tool without a word, and
// built a scarecrow with every tap after). Its edge arrow, when the target is
// out of view, is the pointer itself. A pointer that builds asks first, builds
// once, and never changes the tool in hand; with too few coins it says so and
// does nothing else.

import { BUILD_COST } from '../../sim/constants';
import type { BuildKind, WorldState } from '../../sim/types';

export type PointerTap =
  /** Walk there and do the job, as a tap on that plot would. */
  | { do: 'act'; x: number; y: number }
  /** Ask before building one there (once, on yes, with the tool in hand left alone). */
  | { do: 'ask'; build: BuildKind; x: number; y: number; cost: number }
  /** Say why not, and do nothing else. */
  | { do: 'refuse'; text: string };

/** Is a tapped tile the pointer's own target tile? */
export function onTarget(point: { x: number; y: number }, tile: { x: number; y: number }): boolean {
  return Math.floor(point.x) === tile.x && Math.floor(point.y) === tile.y;
}

/**
 * What a tap on the lesson pointer does. `tile` is the plot a tap on the farm
 * landed on, or null for a tap on the edge arrow. Null means the tap is not
 * the pointer's: it lands on another plot (which does its own job), or the
 * lesson builds nothing (so the plot's own job is the pointer's job anyway),
 * or the Build tool with that build is already in hand (the player's own
 * build, done as any tap).
 */
export function pointerTap(s: WorldState, point: { x: number; y: number } | null, build: BuildKind | null | undefined, tile: { x: number; y: number } | null): PointerTap | null {
  if (!point) return null;
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);
  if (tile && !onTarget(point, tile)) return null;
  if (!build) return tile ? null : { do: 'act', x, y };
  if (tile && s.tool === 'build' && s.buildKind === build) return null;
  const cost = BUILD_COST[build];
  if (s.coins < cost) return { do: 'refuse', text: `A ${build} costs ${cost}. You have ${s.coins}.` };
  return { do: 'ask', build, x, y, cost };
}
