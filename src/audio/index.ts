// Procedural music and sound for Three Acres. Everything is synthesized with
// Web Audio at startup: no sample files, no network. The AudioContext is made
// on the first tap release (Android Chrome grants audio only there), and the
// instrument bank starts building in small slices before that.

import type { AudioEngine, AudioMood } from '../contract';
import { Bank } from './bank';
import { Core } from './core';

let shared: Bank | null = null;

/** The one instrument and effect bank, shared by the engine and the workbench. */
export function getBank(): Bank {
  if (!shared) shared = new Bank();
  return shared;
}

export interface AudioDebug {
  /** Add an analyser on the output. */
  meter?: boolean;
  /** Called once the realtime engine exists, after the first unlock. */
  onCore?: (core: Core) => void;
}

export function createAudio(debug: AudioDebug = {}): AudioEngine {
  const bank = getBank();
  bank.background();
  let ctx: AudioContext | null = null;
  let core: Core | null = null;
  let mood: AudioMood | null = null;
  let volumes = { master: 1, music: 1, sfx: 1 };
  let suspended = false;
  let broken = false;

  return {
    unlock() {
      if (broken) return;
      try {
        if (!ctx) {
          const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AC) {
            broken = true;
            return;
          }
          ctx = new AC({ latencyHint: 'interactive' });
          core = new Core(ctx, bank, { realtime: true, meter: debug.meter });
          core.setVolumes(volumes);
          if (mood) core.mood(mood);
          if (suspended) core.suspend(true);
          // Older WebKit only unlocks once something plays inside the gesture.
          const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
          const src = ctx.createBufferSource();
          src.buffer = silent;
          src.connect(ctx.destination);
          src.start();
          debug.onCore?.(core);
        }
        if (!suspended && ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => {});
      } catch (err) {
        broken = true;
        console.warn('[audio] unavailable', err);
      }
    },
    mood(m) {
      if (core) core.mood(m);
      else mood = m;
    },
    event(e, state) {
      core?.event(e, state);
    },
    ui(cue) {
      core?.ui(cue);
    },
    setVolumes(v) {
      volumes = { ...v };
      core?.setVolumes(volumes);
    },
    suspend(on) {
      suspended = on;
      core?.suspend(on);
    },
  };
}
