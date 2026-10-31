// Everything the player can ask of the farm. The director turns input into
// these; step() applies them in order before advancing time.

import type { BuildKind, CropId, Rules, ToolId } from './types';

export type Command =
  /** Walk control: the stick or keys this frame, each axis -1 to 1. */
  | { type: 'move'; x: number; y: number }
  /** Walk control: use the tool on the tile in front. */
  | { type: 'act' }
  /** Walk control: a tap on a tile. Next to the farmer it acts, further away the farmer walks there. */
  | { type: 'actAt'; x: number; y: number }
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
  | { type: 'deliver'; id: number }
  | { type: 'sell'; crop: CropId }
  | { type: 'draft'; crop: CropId }
  | { type: 'rules'; patch: Partial<Rules> }
  | { type: 'speed'; speed: number };
