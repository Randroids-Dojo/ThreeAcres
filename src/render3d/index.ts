// The lit 3D diorama. Placeholder until the real renderer lands.
import type { Renderer } from '../contract';
import { createPlaceholder } from '../dev/placeholder';

export async function createRenderer3D(): Promise<Renderer> {
  return createPlaceholder('3d');
}
