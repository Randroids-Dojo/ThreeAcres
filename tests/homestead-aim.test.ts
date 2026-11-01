// P1: aiming was strict. Holding Harvest while walking along the radish row
// pulled 1 of 4, because the farmer faces where he walks, and lining up with
// the well took five nudges. Now acting snaps to the nearest useful plot in
// reach when the one in front has nothing to do.
import { describe, expect, it } from 'vitest';
import { snapAim } from '../src/sim/actors';
import { resolve } from '../src/sim/actions';
import { step } from '../src/sim/step';
import type { Command } from '../src/sim/commands';
import { EARLY, EARLY_FEATURES, stand, teach, world } from './helpers';

/** Walk east along row y, holding act (repeats every 0.12 s like the held button), until past column x1. */
function walkHoldingAct(s: ReturnType<typeof world>, y: number, x0: number, x1: number): number {
  stand(s, x0, y, 'e');
  const before = s.stats.harvested.radish;
  let t = 0;
  for (let i = 0; i < 2000 && s.actors[0].x < x1 + 0.5; i++) {
    const cmds: Command[] = [{ type: 'move', x: 1, y: 0 }];
    t += 1 / 30;
    if (t >= 0.12) {
      t = 0;
      cmds.push({ type: 'act' });
    }
    step(s, 1 / 30, cmds);
  }
  return s.stats.harvested.radish - before;
}

describe('acting snaps to the useful plot in reach', () => {
  it('walking along the radish row holding Harvest pulls all four', () => {
    const s = world('sunup');
    expect(walkHoldingAct(s, 4, 1, 6)).toBe(4);
  });

  it('works the plot in front first when it is useful', () => {
    const s = world('sunup');
    stand(s, 3, 4, 's');
    const ok = (x: number, y: number) => !!resolve(s, 'hands', x, y).ok;
    expect(snapAim(s.actors[0], ok)).toEqual({ x: 3, y: 5 });
    // Facing the path, it picks the radish most nearly ahead.
    stand(s, 3, 4, 'e');
    s.actors[0].x = 3.8;
    expect(snapAim(s.actors[0], ok)).toEqual({ x: 4, y: 5 });
  });

  it('fills the can at the well from the side and the corners, not only from its door', () => {
    for (const [x, y, facing] of [
      [10, 3, 'n'],
      [12, 3, 'n'],
      [10, 2, 's'],
      [12, 1, 'w'],
    ] as const) {
      const s = teach(world('sunup'), EARLY, EARLY_FEATURES);
      s.water = 1;
      s.tool = 'hands';
      stand(s, x, y, facing);
      const ev = step(s, 0.016, [{ type: 'act' }]);
      expect(ev.some((e) => e.type === 'refill'), `from ${x},${y} facing ${facing}`).toBe(true);
      expect(s.water).toBe(12);
    }
  });

  it('with nothing useful in reach, acting still answers for the plot in front', () => {
    const s = world('sunup');
    stand(s, 15, 3, 'e');
    const ev = step(s, 0.016, [{ type: 'act' }]);
    expect(ev.some((e) => e.type === 'harvest' || e.type === 'refill')).toBe(false);
  });
});
