// P0: the season's turn used to wipe the farm. Its warning could not be
// followed (summer seeds stayed hidden until the turn, and nothing said what
// would ripen in time), crops that had ripened that night withered, and
// clearing them all cost stamina. Now: next season's seeds can go in during
// the last three days, seeds that cannot ripen in time are blocked, ripe
// crops survive the turn, what the turn takes is simply gone, and clearing a
// withered crop is free. And a farm can never be left with no way to earn.
import { describe, expect, it } from 'vitest';
import { resolve, sowing } from '../src/sim/actions';
import { nightfall, rescue } from '../src/sim/day';
import { step } from '../src/sim/step';
import { plant, plots } from '../src/sim/world';
import type { SimEvent } from '../src/sim/types';
import { seedNote } from '../src/ui/describe';
import { EARLY, EARLY_FEATURES, stand, teach, world } from './helpers';

const clearField = (s: ReturnType<typeof world>) => {
  for (let x = 2; x < 6; x++) for (let y = 5; y < 9; y++) plots(s, x, y).crop = null;
};

describe('the season turn can be planned for', () => {
  it('offers next season’s seeds in the last three days, marked as next season', () => {
    for (const day of [8, 9, 10]) {
      expect(sowing(day, 'corn')).toMatchObject({ ok: true, next: true });
      expect(sowing(day, 'sunflower')).toMatchObject({ ok: true, next: true });
    }
    expect(sowing(7, 'corn').ok).toBe(false);
    const s = teach(world('sunup'), EARLY, EARLY_FEATURES);
    s.day = 8;
    s.seed = 'beans';
    expect(resolve(s, 'seeds', 2, 7)).toMatchObject({ verb: 'plant', ok: true });
    expect(seedNote(s, 'beans')).toMatchObject({ state: 'next', when: 'Summer crop' });
  });

  it('blocks and marks seeds that would still be green when the season turns', () => {
    const s = teach(world('sunup'), EARLY, EARLY_FEATURES);
    s.day = 7; // four nights left: a five-day carrot would not make it, and carrots do not grow in summer
    s.seed = 'carrot';
    const r = resolve(s, 'seeds', 2, 7);
    expect(r.ok).toBe(false);
    // (Round 7: the word names the crop as the picker shows it.)
    expect(r.reason).toMatch(/^Carrots won.t ripen before summer$/);
    expect(seedNote(s, 'carrot')).toMatchObject({ state: 'late', when: 'Too late' });
    // A radish still makes it, and strawberries grow on into summer.
    expect(sowing(7, 'radish').ok).toBe(true);
    expect(sowing(10, 'strawberry').ok).toBe(true);
    expect(sowing(10, 'radish').ok).toBe(false);
  });

  it('ripe crops survive the turn; green ones it takes are gone by morning, nothing withered to clear', () => {
    const s = teach(world('sunup'), EARLY, EARLY_FEATURES);
    clearField(s);
    s.day = 10;
    s.forecast = ['sun', 'sun', 'sun'];
    plant(s, 2, 7, 'lettuce', 4); // ripe
    plant(s, 3, 7, 'lettuce', 3); // ripens tonight (watered)
    plant(s, 4, 7, 'carrot', 1); // green, and carrots do not grow in summer
    plant(s, 5, 7, 'corn', 1); // next season's, sown early
    for (let x = 2; x < 6; x++) plots(s, x, 7).wet = true;
    const ev: SimEvent[] = [];
    nightfall(s, ev);
    expect(s.day).toBe(11);
    expect(plots(s, 2, 7).crop).toMatchObject({ kind: 'lettuce', stage: 4, dead: false });
    expect(plots(s, 3, 7).crop).toMatchObject({ kind: 'lettuce', stage: 4, dead: false });
    expect(plots(s, 4, 7).crop).toBeNull();
    expect(plots(s, 5, 7).crop).toMatchObject({ kind: 'corn', dead: false });
    expect(s.report!.turned).toBe(1);
    // No withered crop is left on the farm to clear.
    expect(s.plots.some((p) => p.crop?.dead)).toBe(false);
  });

  it('a regrowing crop kept ripe past its season gives its last pick and is done', () => {
    const s = teach(world('sunup'), EARLY, EARLY_FEATURES);
    clearField(s);
    s.day = 21; // autumn: strawberries are out of season
    plant(s, 2, 7, 'strawberry', 6);
    stand(s, 2, 6, 's');
    step(s, 0.016, [{ type: 'act' }]);
    expect(s.stats.harvested.strawberry).toBe(1);
    expect(plots(s, 2, 7).crop).toBeNull();
  });

  it('clearing a withered crop costs no stamina, and one left alone is gone the next morning', () => {
    const s = teach(world('sunup'), EARLY, EARLY_FEATURES, );
    clearField(s);
    plant(s, 2, 7, 'carrot', 2);
    plant(s, 3, 7, 'carrot', 2);
    plots(s, 2, 7).crop!.dead = true;
    plots(s, 3, 7).crop!.dead = true;
    stand(s, 2, 6, 's');
    s.tool = 'hands';
    const before = s.stamina;
    step(s, 0.016, [{ type: 'act' }]);
    expect(plots(s, 2, 7).crop).toBeNull();
    expect(s.stamina).toBe(before);
    nightfall(s, []);
    expect(plots(s, 3, 7).crop).toBeNull();
  });
});

describe('there is always a way to earn', () => {
  it('a farm with no coins, no stock and nothing growing gets enough for seed', () => {
    const s = teach(world('sunup'), EARLY, EARLY_FEATURES);
    for (const p of s.plots) p.crop = null;
    s.coins = 3;
    expect(rescue(s)).toBe(37);
    expect(s.coins).toBe(40);
    // Round 8: with crops growing too, while there is bare soil and nothing ripe to pick (the eighth playtest sat on
    // 10 coins and 7 bare plots for three summer days), enough for the bare plots, four at most.
    s.coins = 0;
    plant(s, 2, 5, 'radish', 1);
    expect(rescue(s)).toBe(40);
    // Not when every plot is sown, something is ripe, or the crate holds something.
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) if (!plots(s, x, y).crop) plant(s, x, y, 'radish', 1);
    s.coins = 0;
    expect(rescue(s)).toBe(0);
    plots(s, 2, 5).crop = null;
    plant(s, 3, 5, 'radish', 3);
    plots(s, 3, 5).crop = null;
    plant(s, 3, 5, 'radish', 3);
    expect(rescue(s)).toBe(0);
  });

  it('comes in the morning report, in summer at summer prices', () => {
    const s = teach(world('sunup'), EARLY, EARLY_FEATURES);
    for (const p of s.plots) p.crop = null;
    s.day = 12;
    s.coins = 0;
    nightfall(s, []);
    // The cheapest summer seed is the sunflower at 30.
    expect(s.report!.gift).toBe(120);
    expect(s.coins).toBe(120);
  });
});
