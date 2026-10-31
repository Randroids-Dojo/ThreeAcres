import { describe, expect, it } from 'vitest';
import { CROP_IDS } from '../src/sim/crops';
import { PRESET_IDS } from '../src/sim/presets';
import { play, world } from './helpers';

describe('each preset plays on its own', () => {
  for (const id of PRESET_IDS) {
    it(`${id}: a bot farms twenty days and makes money`, () => {
      const s = world(id);
      const r = play(s, 20);
      expect(r.problems).toEqual([]);
      expect(s.day).toBeGreaterThanOrEqual(21);
      const harvested = CROP_IDS.reduce((a, c) => a + s.stats.harvested[c], 0);
      expect(harvested).toBeGreaterThan(20);
      expect(s.stats.earned).toBeGreaterThan(500);
    });
  }
});
