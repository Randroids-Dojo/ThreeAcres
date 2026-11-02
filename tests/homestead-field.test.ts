// P0: a field bought early must still bring the hoe. The old game only
// brought the hoe with the "Buy a second field" lesson, which waited for
// exactly one owned field, so a field bought first from the board left the
// rack without a hoe and the new field saying "hoe it first" for good.
import { describe, expect, it } from 'vitest';
import { Tutor } from '../src/games/homestead/lessons';
import { resolve } from '../src/sim/actions';
import { step } from '../src/sim/step';
import { EARLY, EARLY_FEATURES, stand, teach, world } from './helpers';

function early() {
  const s = teach(world('sunup'), EARLY, EARLY_FEATURES);
  s.day = 3;
  s.coins = 320;
  return s;
}

describe('owning a second field always brings the hoe', () => {
  it('a field bought from the board before its lesson puts the hoe on the rack', () => {
    const s = early();
    expect(s.learn).not.toContain('hoe');
    const ev = step(s, 0.016, [{ type: 'buyParcel', id: 1 }]);
    expect(s.parcels[1].owned).toBe(true);
    expect(s.learn).toContain('hoe');
    expect(ev.some((e) => e.type === 'unlock' && e.what === 'hoe')).toBe(true);
  });

  it('then says "Hoe the new field." and points at the new field, until two plots are hoed', () => {
    const s = early();
    const t = new Tutor();
    // Whatever calm lesson is up, the new field cuts in.
    t.update(s, 0.1, true);
    step(s, 0.016, [{ type: 'buyParcel', id: 1 }]);
    const out = t.update(s, 0.1, true);
    expect(out.line).toBe('Hoe the new field.');
    // On screen long enough to be read (round 7: four seconds).
    for (let i = 0; i < 41; i++) t.update(s, 0.1, true);
    const p = out.point!;
    const field = s.parcels[1];
    expect(p.x).toBeGreaterThan(field.x);
    expect(p.x).toBeLessThan(field.x + field.w);
    expect(p.y).toBeGreaterThan(field.y);
    expect(p.y).toBeLessThan(field.y + field.h);
    // The hoe works on it.
    stand(s, 7, 4, 's');
    s.tool = 'hoe';
    expect(resolve(s, 'hoe', 7, 5).verb).toBe('till');
    for (const x of [7, 8]) {
      stand(s, x, 4, 's');
      for (const e of step(s, 0.016, [{ type: 'act' }])) t.onEvent(s, e);
      for (let i = 0; i < 30; i++) step(s, 1 / 30);
    }
    t.update(s, 0.1, true);
    expect(s.learn).toContain('lesson:hoe');
    expect(t.update(s, 0.1, true).line).not.toBe('Hoe the new field.');
  });

  it('a field bought by tapping it (the for-sale card) brings the hoe the same way', () => {
    const s = early();
    // A tap on the field for sale, from across the farm, offers it at once (the card buys with the same command).
    stand(s, 2, 3, 's');
    const ev = step(s, 0.016, [{ type: 'actAt', x: 8, y: 6 }]);
    expect(ev.some((e) => e.type === 'deny' && e.reason === 'unowned')).toBe(true);
    expect(s.actors[0].path).toEqual([]);
    step(s, 0.016, [{ type: 'buyParcel', id: 1 }]);
    expect(s.learn).toContain('hoe');
  });

  it('an old save with two fields and no hoe gets the hoe when it loads', async () => {
    const { inferLessons } = await import('../src/games/homestead/lessons');
    const s = early();
    s.parcels[1].owned = true;
    inferLessons(s);
    expect(s.learn).toContain('hoe');
  });
});
