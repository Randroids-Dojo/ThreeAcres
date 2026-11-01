// P1: bugs arrived untaught and nearly invisible, and the act button showed
// the noun "Bugs". Now they get an urgent lesson like the crow's: they come
// quietly, the line shows only while a bug is really there, names the crop
// and points at it, and the button says the verb, Pick.
import { describe, expect, it } from 'vitest';
import { Tutor } from '../src/games/homestead/lessons';
import { step } from '../src/sim/step';
import { plant, plots } from '../src/sim/world';
import { actWord } from '../src/ui/touch';
import { EARLY, EARLY_FEATURES, stand, teach, world } from './helpers';

function farm() {
  const s = teach(world('sunup'), [...EARLY, 'requests', 'deliver', 'field', 'turn', 'smith', 'pests', 'scarecrow'], [...EARLY_FEATURES, 'board', 'requests', 'pests']);
  s.day = 6;
  return s;
}

describe('the bug lesson', () => {
  it('says nothing while no bug is on the farm', () => {
    const s = farm();
    const t = new Tutor();
    expect(t.update(s, 0.1, true).line).toBe('');
  });

  it('when bugs land: names the crop, points at it, and ends when they are picked', () => {
    const s = farm();
    const t = new Tutor();
    t.update(s, 0.1, true);
    plots(s, 4, 6).crop!.bugs = 1;
    const out = t.update(s, 0.1, true);
    expect(out.line).toBe('Bugs on your carrots. Pick them off.');
    expect(out.point).toEqual({ x: 4.5, y: 6.5 });
    stand(s, 4, 5, 's');
    s.tool = 'hands';
    s.actors[0].x = 4.5;
    // The radish in front is ripe: move it so the bugged carrot is what the hands reach.
    plots(s, 4, 5).crop = null;
    for (const e of step(s, 0.016, [{ type: 'act' }])) t.onEvent(s, e);
    expect(plots(s, 4, 6).crop!.bugs).toBe(0);
    t.update(s, 0.1, true);
    expect(s.learn).toContain('lesson:bugs');
    expect(t.update(s, 0.1, true).line).toBe('');
  });

  it('cuts in over a calm lesson, like the crow', () => {
    const s = farm();
    s.learn = s.learn.filter((x) => x !== 'lesson:field');
    s.coins = 500;
    const t = new Tutor();
    expect(t.update(s, 0.1, true).line).toBe('Buy a second field.');
    plant(s, 2, 8, 'carrot', 2);
    plots(s, 2, 8).crop!.bugs = 1;
    expect(t.update(s, 0.1, true).line).toMatch(/^Bugs on your carrots\. Pick them off\.$/);
  });

  it('waits for the pests to be let in (quietly, with the crows)', () => {
    const s = farm();
    s.learn = s.learn.filter((x) => x !== 'pests');
    plots(s, 4, 6).crop!.bugs = 1;
    s.day = 4;
    expect(new Tutor().update(s, 0.1, true).line).not.toMatch(/Bugs/);
  });
});

describe('the act button says a verb', () => {
  it('Pick for bugs, Shoo for a crow, the tool verbs otherwise', () => {
    expect(actWord('tend')).toBe('Pick');
    expect(actWord('scare')).toBe('Shoo');
    expect(actWord('harvest')).toBe('Harvest');
    expect(actWord('refill')).toBe('Fill the can');
  });
});
