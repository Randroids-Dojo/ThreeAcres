// The painted 2D view. Placeholder until the real renderer lands.
import type { Renderer } from '../contract';
import { createPlaceholder } from '../dev/placeholder';

export function createRenderer2D(): Renderer {
  return createPlaceholder('2d');
}
