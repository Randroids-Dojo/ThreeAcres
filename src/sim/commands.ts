// Everything the player can ask of the farm. The director turns input into
// these; step() applies them in order before advancing time.

import type { BuildKind, CropId, Rules, ToolId } from './types';

export type Command =
  /** Walk control: the stick or keys this frame, each axis -1 to 1. */
  | { type: 'move'; x: number; y: number }
  /** Walk control: use the tool on the tile in front. `held` is a repeat from a held act key or button: it never works a plot behind the farmer. */
  | { type: 'act'; held?: boolean }
  /** Walk control: a tap on a tile. Next to the farmer it acts, further away the farmer walks there. */
  | { type: 'actAt'; x: number; y: number; /** Round 11: a drag crossed this plot: it does the tool's own job there, or is passed over. */ drag?: boolean }
  /** Point control: queue a job on a tile with the current tool. */
  | { type: 'paint'; x: number; y: number }
  /** Point control: drop the job on a tile. */
  | { type: 'unpaint'; x: number; y: number }
  | { type: 'cancelJobs' }
  | { type: 'tool'; tool: ToolId }
  | { type: 'seed'; crop: CropId }
  | { type: 'buildKind'; kind: BuildKind }
  /** Sleep (day), end the day (turns) or skip to morning (flow). */
  | { type: 'sleep' }
  | { type: 'buyParcel'; id: number }
  | { type: 'hire' }
  /** Sunup: a lesson brings in a feature or finishes. */
  | { type: 'unlock'; what: string }
  /** Sunup: buy the next level of a tool from the smith. */
  | { type: 'upgrade'; tool: 'can' | 'hoe' }
  | { type: 'deliver'; id: number }
  /** Sunup: take a request offered on the board (the other of its pair is let go). */
  | { type: 'accept'; id: number }
  /** Sunup: the board's requests have been read: none of them is new now. */
  | { type: 'readBoard' }
  /** Sunup, round 9: the board is being read: an offer that no longer fits the farm is made again to fit it. */
  | { type: 'freshen' }
  /** Sunup, round 10: let today's offer on the board go (a new pair comes tomorrow). */
  | { type: 'pass' }
  /** Sunup, round 10: let the waiting taps go, and the walk to one (a tap on the farmer, or the stop key). */
  | { type: 'cancelTaps' }
  /** Sunup: build one of a kind on a plot, once: walk there and build it; the tool in hand stays in hand. */
  | { type: 'buildAt'; x: number; y: number; kind: BuildKind }
  | { type: 'sell'; crop: CropId }
  | { type: 'draft'; crop: CropId }
  | { type: 'rules'; patch: Partial<Rules> }
  | { type: 'speed'; speed: number };
