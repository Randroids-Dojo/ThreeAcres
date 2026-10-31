// Sunup, the homestead: one farm under the homestead rules, drawn as the 3D
// diorama. An older single-farm save from before the three games is picked up.

import type { WorldState } from '../../sim/types';
import { PRESETS } from '../../sim/presets';
import { createWorld } from '../../sim/world';
import type { GameModule } from '../../shell/types';
import { Director } from './director';

declare global {
  interface Window {
    sunup?: Director;
  }
}

export const HOMESTEAD_RULES = PRESETS.sunup.rules;

function usable(s: unknown): s is WorldState {
  const w = s as WorldState | null;
  return !!w && w.version === 1 && Array.isArray(w.plots) && !!w.rules;
}

function fresh(): WorldState {
  return createWorld((Date.now() ^ (Math.random() * 0x7fffffff)) | 0, HOMESTEAD_RULES);
}

export const game: GameModule = {
  id: 'homestead',
  async start(ctx) {
    let state = ctx.load<WorldState>();
    if (!usable(state)) {
      // The single-farm save from the first version of Three Acres.
      try {
        const old = JSON.parse(localStorage.getItem('threeacres:v1:farm') ?? 'null');
        state = usable(old) ? old : null;
      } catch {
        state = null;
      }
    }
    const s = usable(state) ? state : fresh();
    s.rules = { ...HOMESTEAD_RULES, camera: s.rules?.camera ?? 'close' };
    if (s.tool === 'smart') s.tool = 'hands';
    const d = new Director(s, ctx);
    window.sunup = d;
    await d.start();
    return {
      pause: () => d.pause(),
      resume: () => d.resume(),
      save: () => d.save(),
      reset: () => {
        d.replace(fresh());
        d.save();
      },
    };
  },
};
