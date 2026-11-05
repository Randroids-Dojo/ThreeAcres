// Round 2, P1: the crow lesson was skipped two ways. Sleeping early let a
// crow eat during the skipped hours and the lesson was ticked off, so day 9
// opened with "Scarecrows keep crows away" and no crow ever seen; and a crow
// that landed while the bug line was up never got its line. Now a lesson is
// done only once its line has been on screen, crows keep off the hours sleep
// skips until their lesson is done, and a crow takes over from the bug line.
import { describe, expect, it } from 'vitest';
import { Tutor } from '../src/games/homestead/lessons';
import { nightfall } from '../src/sim/day';
import { step } from '../src/sim/step';
import { plant, plots } from '../src/sim/world';
import type { WorldState } from '../src/sim/types';
import { EARLY, EARLY_FEATURES, teach, world } from './helpers';

/** Day 6, everything up to the crows taught, pests let in, carrots growing. */
function farm(seed = 42): WorldState {
  const s = teach(world('sunup', seed), [...EARLY, 'requests', 'deliver', 'field', 'turn', 'smith', 'wide'], [...EARLY_FEATURES, 'board', 'requests', 'pests']);
  s.day = 6;
  return s;
}

/** Seconds a line must be on screen to count (lessons.ts MIN_SHOW since round 7; SEEN was 1.5), and the minutes the first crows come in (CROW_FIRST). */
const SEEN = 4;
const CROW_FIRST = [30, 120];

const crow = (s: WorldState, x = 3, y = 6) => s.crows.push({ id: s.nextId++, x, y, fromX: -3, fromY: 4, phase: 'peck', t: 0 });
const CROW_LINE = /^A crow is on your [a-z]+\. Shoo it\.$/;

describe('the crow lesson is never ticked off unseen', () => {
  it('sleeping while a crow is about does not finish it, and that crow takes nothing in the night', () => {
    const s = farm();
    const t = new Tutor();
    crow(s);
    // One frame of the line, then straight to bed.
    expect(t.update(s, 0.05, true).line).toMatch(CROW_LINE);
    step(s, 0.016, [{ type: 'sleep' }]);
    for (let i = 0; i < 200 && (s.turnover >= 0 || s.day === 6); i++) {
      t.update(s, 1 / 30, true);
      step(s, 1 / 30);
    }
    expect(s.day).toBe(7);
    t.update(s, 0.1, true);
    expect(s.learn).not.toContain('lesson:pests');
    // The carrot it was after is still there.
    expect(plots(s, 3, 6).crop).not.toBeNull();
    // And the next morning brings no scarecrow line out of nowhere.
    expect(t.update(s, 0.1, true).line).not.toMatch(/Scarecrow/);
  });

  it('a line hidden by the board or a picker does not count as seen', () => {
    const s = farm();
    const t = new Tutor();
    crow(s);
    for (let i = 0; i < 100; i++) t.update(s, 0.1, true, false);
    s.crows = [];
    t.update(s, 0.1, true);
    expect(s.learn).not.toContain('lesson:pests');
  });

  // Round 3: the scarecrow line (and the Build tool) come the next morning, one new thing a day.
  it('seen for long enough while the crow was there, it ends when the crow goes, and the scarecrow line follows the next morning', () => {
    const s = farm();
    const t = new Tutor();
    crow(s);
    for (let i = 0; i < Math.ceil(SEEN / 0.1) + 1; i++) expect(t.update(s, 0.1, true).line).toMatch(CROW_LINE);
    s.crows[0].phase = 'flee';
    t.update(s, 0.1, true);
    expect(s.learn).toContain('lesson:pests');
    expect(t.update(s, 0.1, true).line).not.toMatch(/Scarecrows/);
    s.day += 1;
    expect(t.update(s, 0.1, true).line).toBe('Build a scarecrow on bare soil.');
  });

  it('until the lesson is done, a crow still pecking at nightfall takes nothing', () => {
    const s = farm();
    crow(s, 4, 6);
    nightfall(s, []);
    expect(plots(s, 4, 6).crop).not.toBeNull();
    expect(s.report!.eaten).toBe(0);
    // Once taught, crows eat at nightfall as before.
    const s2 = farm();
    s2.learn.push('lesson:pests');
    crow(s2, 4, 6);
    nightfall(s2, []);
    expect(plots(s2, 4, 6).crop).toBeNull();
  });

  it('until the lesson is done, the day’s one crow comes early in the morning, never in hours an early night skips', () => {
    let plans = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = farm(seed * 977);
      s.forecast = ['sun', 'sun', 'sun'];
      nightfall(s, []);
      if (!s.crowPlan.length) continue;
      plans++;
      expect(s.crowPlan.length, `seed ${seed}`).toBe(1);
      expect(s.crowPlan[0], `seed ${seed}`).toBeGreaterThanOrEqual(CROW_FIRST[0]);
      expect(s.crowPlan[0], `seed ${seed}`).toBeLessThanOrEqual(CROW_FIRST[1]);
    }
    expect(plans).toBeGreaterThan(50);
  });
});

describe('a crow takes over from the bug line', () => {
  it('the crow line takes the slot from the bugs, and the bug line comes back after', () => {
    const s = farm();
    const t = new Tutor();
    s.tool = 'hands';
    plots(s, 4, 6).crop!.bugs = 1;
    expect(t.update(s, 0.1, true).line).toBe('Bugs on your carrots. Pick them off.');
    crow(s, 2, 6);
    expect(t.update(s, 0.1, true).line).toMatch(CROW_LINE);
    for (let i = 0; i < 20; i++) t.update(s, 0.1, true);
    s.crows[0].phase = 'flee';
    t.update(s, 0.1, true);
    // The bugs again: they were never picked (the scarecrow note waits for the next morning).
    for (let i = 0; i < 120; i++) t.update(s, 0.1, true);
    expect(s.learn).toContain('lesson:pests');
    expect(s.learn).not.toContain('lesson:bugs');
    expect(t.update(s, 0.1, true).line).toBe('Bugs on your carrots. Pick them off.');
  });

  it('bugs never take the line from a crow', () => {
    const s = farm();
    const t = new Tutor();
    crow(s, 2, 6);
    expect(t.update(s, 0.1, true).line).toMatch(CROW_LINE);
    plots(s, 4, 6).crop!.bugs = 1;
    expect(t.update(s, 0.1, true).line).toMatch(CROW_LINE);
  });

  it('the bug line says to take the hands when something else is in hand', () => {
    const s = farm();
    s.learn.push('lesson:pests', 'lesson:scarecrow', 'lesson:forecast');
    s.tool = 'can';
    plant(s, 2, 8, 'lettuce', 1);
    plots(s, 2, 8).crop!.bugs = 1;
    const out = new Tutor().update(s, 0.1, true);
    expect(out.line).toBe('Tap Hands. Pick bugs off the lettuces.');
    expect(out.point).toEqual({ x: 2.5, y: 8.5 });
  });

  it('after the bug lesson, the pointer keeps finding bugs without a word', () => {
    const s = farm();
    s.learn.push('lesson:pests', 'lesson:scarecrow', 'lesson:forecast', 'lesson:bugs');
    plots(s, 5, 6).crop!.bugs = 1;
    const out = new Tutor().update(s, 0.1, true);
    expect(out.line).toBe('');
    expect(out.point).toEqual({ x: 5.5, y: 6.5 });
  });
});
