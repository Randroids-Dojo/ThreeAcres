// Procedural music and sound. Silent placeholder until the real engine lands.
import type { AudioEngine } from '../contract';

export function createAudio(): AudioEngine {
  return {
    unlock() {},
    mood() {},
    event() {},
    ui() {},
    setVolumes() {},
    suspend() {},
  };
}
