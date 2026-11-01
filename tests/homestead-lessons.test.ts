// Sunup's lesson lines: short, and in the same words as the buttons. The act
// button says Harvest, Water, Plant and Hoe, so a line never says pull, sow
// or till for the same thing.
import { describe, expect, it } from 'vitest';
import { allLines } from '../src/games/homestead/lessons';
import { world } from './helpers';

describe('Sunup lesson lines', () => {
  const lines = allLines(world('sunup'));

  it('are eight words or fewer, with no dashes or exclamations', () => {
    expect(lines.length).toBeGreaterThan(10);
    for (const l of lines) {
      expect(l.split(/\s+/).filter(Boolean).length, l).toBeLessThanOrEqual(8);
      expect(l, l).not.toMatch(/[!–—]/);
    }
  });

  it('use the words on the buttons', () => {
    for (const l of lines) expect(l, l).not.toMatch(/\b(sow|sown|till|tilled|pulls?|the hand)\b/i);
  });
});

describe('Sunup acting where it would do something', () => {
  it('fills the can at the well whatever is in hand, once the can is yours', async () => {
    const { resolve } = await import('../src/sim/actions');
    const s = world('sunup');
    s.water = 1;
    s.learn = [];
    // Before the can lesson, hands at the well do nothing.
    expect(resolve(s, 'hands', 11, 2).verb).not.toBe('refill');
    s.learn.push('can');
    const r = resolve(s, 'hands', 11, 2);
    expect(r.verb).toBe('refill');
    expect(r.ok).toBe(true);
    // A full can says so.
    s.water = 99;
    expect(resolve(s, 'seeds', 11, 2).ok).toBe(false);
  });
});
