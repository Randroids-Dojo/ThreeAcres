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
