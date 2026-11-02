// Sunup, the homestead: one farm under the homestead rules, drawn as the 3D
// diorama. An older single-farm save from before the three games is picked up.

import type { WorldState } from '../../sim/types';
import { PRESETS } from '../../sim/presets';
import { createWorld } from '../../sim/world';
import { PARCELS } from '../../sim/map';
import type { GameModule } from '../../shell/types';
import { Director } from './director';
import { inferLessons } from './lessons';
import { adoptRequests } from '../../sim/goals';

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
  const s = createWorld((Date.now() ^ (Math.random() * 0x7fffffff)) | 0, HOMESTEAD_RULES);
  // A new farm's clock waits at 6:00 until the farmer first does something: reading the first line costs no daylight.
  s.held = true;
  return s;
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
    // Sunup is worked alone: farm hands from a save of the old crew mode have gone home.
    if (s.actors.some((a) => a.role === 'hand')) {
      s.actors = s.actors.filter((a) => a.role === 'farmer');
      s.jobs = [];
    }
    // Fields still for sale cost what they cost now (the second playtest found them far too cheap).
    for (const p of s.parcels) if (!p.owned && PARCELS[p.id]) p.price = PARCELS[p.id].price;
    // Saves from before the can and the smith.
    s.water ??= 12;
    s.tools ??= { can: 0, hoe: 0 };
    // Round 8: the copper can comes with the second field, however long ago it was bought.
    if (s.parcels.filter((p) => p.owned).length >= 2 && s.tools.can < 1) s.tools.can = 1;
    if (s.tool === 'smart') s.tool = 'hands';
    inferLessons(s);
    // Requests are taken on the board now: an old save's pair nobody sowed for is still on offer.
    adoptRequests(s);
    // Phones play close up; the wide view is a desktop choice (C).
    if (matchMedia('(pointer: coarse)').matches) s.rules.camera = 'close';
    const d = new Director(s, ctx);
    window.sunup = d;
    await d.start();
    return {
      pause: () => d.pause(),
      resume: () => d.resume(),
      save: () => d.save(),
      reset: () => {
        const f = fresh();
        inferLessons(f);
        d.replace(f);
        d.save();
      },
    };
  },
};
