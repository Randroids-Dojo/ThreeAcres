import { describe, expect, it } from 'vitest';
import type { Command } from '../src/sim/commands';
import { AXES, AXIS_INFO, PRESETS } from '../src/sim/presets';
import { rand } from '../src/sim/rng';
import { step } from '../src/sim/step';
import type { Rules } from '../src/sim/types';
import { play, world } from './helpers';

describe('switching any axis at any moment', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`seed ${seed}: forty days of random switches keep the farm whole`, () => {
      const s = world('sunup', seed);
      // A separate stream for the fuzzer so the farm's own randomness is untouched.
      const fuzz = world('sunup', seed * 7919);
      let next = 0;
      const r = play(s, 40, {
        each: (_st, i): Command[] => {
          if (i < next) return [];
          next = i + 20 + Math.floor(rand(fuzz) * 400);
          const axis = AXES[Math.floor(rand(fuzz) * AXES.length)];
          const opts = AXIS_INFO[axis].options;
          const value = opts[Math.floor(rand(fuzz) * opts.length)].value;
          return [{ type: 'rules', patch: { [axis]: value } as Partial<Rules> }];
        },
      });
      expect(r.problems).toEqual([]);
      expect(s.day).toBeGreaterThanOrEqual(41);
      expect(r.events.filter((e) => e.type === 'rules').length).toBeGreaterThan(20);
    });
  }

  it('day to turns gives moves for the time and stamina left', () => {
    const s = world('sunup');
    s.minute = 540;
    s.stamina = 80;
    step(s, 0.016, [{ type: 'rules', patch: { clock: 'turns' } }]);
    expect(s.ap).toBe(6);
    step(s, 0.016, [{ type: 'rules', patch: { clock: 'day' } }]);
    expect(s.stamina).toBe(50);
  });

  it('turning the crew on brings one free hand, off sends them in', () => {
    const s = world('sunup');
    const coins = s.coins;
    step(s, 0.016, [{ type: 'rules', patch: { crew: 'crew' } }]);
    const hands = s.actors.filter((a) => a.role === 'hand');
    expect(hands.length).toBe(1);
    expect(hands[0].away).toBe(false);
    expect(s.coins).toBe(coins);
    step(s, 0.016, [{ type: 'rules', patch: { crew: 'solo' } }]);
    expect(hands[0].away).toBe(true);
    step(s, 0.016, [{ type: 'rules', patch: { crew: 'crew' } }]);
    expect(s.actors.filter((a) => a.role === 'hand').length).toBe(1);
  });

  it('calm weather sends crows off and clears bugs', () => {
    const s = world('sunup');
    s.plots[6 * s.W + 2].crop!.bugs = 2;
    s.crows.push({ id: 5, x: 3, y: 6, fromX: -3, fromY: 4, phase: 'peck', t: 10 });
    step(s, 0.016, [{ type: 'rules', patch: { weather: 'calm' } }]);
    expect(s.crows.every((c) => c.phase === 'flee' || c.phase === 'gone')).toBe(true);
    expect(s.plots[6 * s.W + 2].crop!.bugs).toBe(0);
  });

  it('switching to the almanac unlocks what is planted and sets goals', () => {
    const s = world('bushel');
    s.plots[7 * s.W + 2].crop = { ...s.plots[6 * s.W + 2].crop!, kind: 'pumpkin', id: 999 };
    step(s, 0.016, [{ type: 'rules', patch: { goal: 'almanac' } }]);
    expect(s.almanac.goals.length).toBe(3);
    expect(s.almanac.unlocked).toContain('pumpkin');
  });

  it('smart tools remember the kit tool', () => {
    const s = world(PRESETS.sunup.rules);
    step(s, 0.016, [{ type: 'tool', tool: 'can' }]);
    step(s, 0.016, [{ type: 'rules', patch: { tools: 'smart' } }]);
    expect(s.tool).toBe('smart');
    step(s, 0.016, [{ type: 'rules', patch: { tools: 'kit' } }]);
    expect(s.tool).toBe('can');
  });
});
