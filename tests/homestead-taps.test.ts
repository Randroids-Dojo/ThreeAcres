// Round 2: quick taps were dropped (three taps on ripe radishes 300 ms apart
// gave one harvest), a tap with the wrong tool in hand walked the farmer onto
// the plot and did nothing, a tap by the well only walked there, and holding
// Harvest while walking stopped at every plot. Now taps wait their turn and
// are done in order, a tap takes the tool for its job, a tap beside the well
// fills the can, and quick jobs are done on the move.
import { describe, expect, it } from 'vitest';
import type { Command } from '../src/sim/commands';
import { step } from '../src/sim/step';
import { plant, plots } from '../src/sim/world';
import type { WorldState } from '../src/sim/types';
import { EARLY, EARLY_FEATURES, stand, teach, world } from './helpers';

/** Run the farm for `seconds`, sending `at[k]` commands at their times. */
function run(s: WorldState, seconds: number, at: [number, Command][] = []): void {
  const dt = 1 / 60;
  let t = 0;
  const todo = [...at].sort((a, b) => a[0] - b[0]);
  while (t < seconds) {
    const cmds: Command[] = [];
    while (todo.length && todo[0][0] <= t) cmds.push(todo.shift()![1]);
    step(s, dt, cmds);
    t += dt;
  }
}

describe('quick taps are each done, in order', () => {
  it('three taps on ripe radishes 300 ms apart harvest all three', () => {
    const s = world('sunup');
    stand(s, 2, 3, 's');
    s.tool = 'hands';
    const before = s.stats.harvested.radish;
    run(s, 4, [
      [0, { type: 'actAt', x: 5, y: 5 }],
      [0.3, { type: 'actAt', x: 4, y: 5 }],
      [0.6, { type: 'actAt', x: 3, y: 5 }],
    ]);
    expect(s.stats.harvested.radish - before).toBe(3);
    expect(plots(s, 2, 5).crop).not.toBeNull();
  });

  it('taps made while a job plays out wait for it, then go in the order tapped', () => {
    const s = world('sunup');
    stand(s, 3, 4, 's');
    s.tool = 'hands';
    const order: number[] = [];
    const dt = 1 / 60;
    const cmds: Command[] = [{ type: 'actAt', x: 3, y: 5 }, { type: 'actAt', x: 2, y: 5 }, { type: 'actAt', x: 5, y: 5 }];
    for (let i = 0; i < 300; i++) {
      for (const e of step(s, dt, i === 0 ? cmds : [])) if (e.type === 'harvest') order.push(e.x);
    }
    expect(order).toEqual([3, 2, 5]);
  });

  it('pushing the stick drops the taps still waiting', () => {
    const s = world('sunup');
    stand(s, 2, 3, 's');
    s.tool = 'hands';
    run(s, 0.1, [
      [0, { type: 'actAt', x: 5, y: 5 }],
      [0.02, { type: 'actAt', x: 4, y: 5 }],
      [0.04, { type: 'actAt', x: 3, y: 5 }],
    ]);
    step(s, 1 / 60, [{ type: 'move', x: -1, y: 0 }]);
    expect(s.taps ?? []).toEqual([]);
  });
});

describe('a tap takes the tool for its job', () => {
  it('a ripe crop tapped with the can in hand is harvested, with the hands', () => {
    const s = teach(world('sunup'), EARLY, EARLY_FEATURES);
    stand(s, 2, 3, 's');
    s.tool = 'can';
    run(s, 2, [[0, { type: 'actAt', x: 4, y: 5 }]]);
    expect(plots(s, 4, 5).crop).toBeNull();
    expect(s.tool).toBe('hands');
  });

  it('a bugged crop tapped with seeds in hand has its bugs picked', () => {
    const s = teach(world('sunup'), EARLY, EARLY_FEATURES);
    plots(s, 3, 6).crop!.bugs = 1;
    stand(s, 2, 3, 's');
    s.tool = 'seeds';
    run(s, 2, [[0, { type: 'actAt', x: 3, y: 6 }]]);
    expect(plots(s, 3, 6).crop!.bugs).toBe(0);
  });

  it('a thirsty crop tapped with the hands is watered with the can; bare soil tapped with the hands spends nothing', () => {
    const s = teach(world('sunup'), EARLY, EARLY_FEATURES);
    stand(s, 2, 4, 's');
    s.tool = 'hands';
    plots(s, 2, 5).crop = null;
    run(s, 2, [[0, { type: 'actAt', x: 3, y: 6 }]]);
    expect(plots(s, 3, 6).wet).toBe(true);
    const coins = s.coins;
    s.tool = 'hands';
    run(s, 2, [[0, { type: 'actAt', x: 2, y: 7 }]]);
    expect(s.coins).toBe(coins);
    expect(plots(s, 2, 7).crop).toBeNull();
  });
});

describe('the well', () => {
  it('a tap on the ground in front of the well walks there and fills the can', () => {
    const s = teach(world('sunup'), EARLY, EARLY_FEATURES);
    s.water = 0;
    stand(s, 2, 3, 's');
    s.tool = 'can';
    run(s, 4, [[0, { type: 'actAt', x: 11, y: 3 }]]);
    expect(s.water).toBe(12);
  });
});

describe('holding Harvest on the move', () => {
  it('the farmer keeps walking through quick jobs instead of stopping at every plot', () => {
    const s = world('sunup');
    for (let x = 2; x < 6; x++) plant(s, x, 6, 'carrot', 5);
    stand(s, 1, 6, 'e');
    s.tool = 'hands';
    const dt = 1 / 60;
    let t = 0;
    let stalled = 0;
    let lastX = s.actors[0].x;
    for (let i = 0; i < 600 && s.actors[0].x < 5.5; i++) {
      t += dt;
      const cmds: Command[] = [{ type: 'move', x: 1, y: 0 }];
      if (t >= 0.12) {
        t = 0;
        cmds.push({ type: 'act' });
      }
      step(s, dt, cmds);
      if (s.actors[0].task && s.actors[0].x - lastX < 1e-6) stalled++;
      lastX = s.actors[0].x;
    }
    expect(stalled).toBe(0);
    expect(s.actors[0].x).toBeGreaterThan(5.5);
  });
});
