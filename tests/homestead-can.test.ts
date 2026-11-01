// P1: the can's water level was never shown (its meter had no style and
// measured 0x0), and the upgraded can refused when aimed at a wet plot even
// with dry plots in its reach. The gauge itself is measured in the browser
// by scripts/qa/touch.mjs; here, the readout it draws from and the can's reach.
import { describe, expect, it } from 'vitest';
import { resolve } from '../src/sim/actions';
import { step } from '../src/sim/step';
import { plant, plots } from '../src/sim/world';
import { canLevel } from '../src/ui/describe';
import { EARLY, EARLY_FEATURES, stand, teach, world } from './helpers';

describe('the can says how much water is left', () => {
  it('full, low and empty', () => {
    const s = teach(world('sunup'), EARLY, EARLY_FEATURES);
    expect(canLevel(s)).toMatchObject({ frac: 1, left: 12, max: 12, empty: false, low: false });
    s.water = 2;
    expect(canLevel(s)).toMatchObject({ low: true, empty: false });
    s.water = 0;
    expect(canLevel(s)).toMatchObject({ frac: 0, empty: true });
    s.tools.can = 2;
    s.water = 20;
    expect(canLevel(s)).toMatchObject({ frac: 0.5, max: 40 });
  });

  it('before the can is yours there is nothing to show', () => {
    const s = world('sunup');
    expect(canLevel(s)).toBeNull();
  });
});

describe('the upgraded can works its whole reach', () => {
  it('aimed at a wet plot, the gold can still waters the dry plots around it, and wastes no water on wet ones', () => {
    const s = teach(world('sunup'), EARLY, EARLY_FEATURES);
    s.tools.can = 2;
    s.water = 40;
    for (let x = 2; x < 6; x++) for (let y = 5; y < 9; y++) plots(s, x, y).crop = null;
    for (let x = 2; x < 5; x++) for (let y = 6; y < 9; y++) plant(s, x, y, 'carrot', 1);
    plots(s, 3, 7).wet = true;
    plots(s, 3, 7).moisture = 3;
    s.tool = 'can';
    expect(resolve(s, 'can', 3, 7)).toMatchObject({ verb: 'water', ok: true });
    // Beside the wet middle plot, aiming at it.
    stand(s, 3, 6, 's');
    const ev = step(s, 0.016, [{ type: 'act' }]);
    const watered = ev.filter((e) => e.type === 'water').length;
    expect(watered).toBe(8);
    expect(s.water).toBe(32);
  });

  it('aimed where every plot in reach is wet, it says so', () => {
    const s = teach(world('sunup'), EARLY, EARLY_FEATURES);
    s.tools.can = 2;
    for (let x = 1; x < 7; x++) for (let y = 4; y < 10; y++) {
      plots(s, x, y).wet = true;
      plots(s, x, y).moisture = 3;
    }
    expect(resolve(s, 'can', 3, 7)).toMatchObject({ ok: false, reason: 'Already watered' });
  });
});
