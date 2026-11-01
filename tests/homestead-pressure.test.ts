// Round 3, P1: no pressure until three fields. Crows came three times in 33
// days and two scarecrows (seven by seven each) ended them; bugs came about
// six times, one tap each; heat waves did nothing a can did not fix. And on
// Spring 10 the forecast, the Build tool and the crow line all arrived at
// once. Now a scarecrow watches a five by five square (one in the middle of a
// field covers it, one at its edge does not), crows come for the fields no
// scarecrow watches, bugs left on a crop spread to its neighbours, a crop
// left dry on a heat wave's night withers, and the crow, the Build tool and
// the forecast come one a day, each with its own line.
import { describe, expect, it } from 'vitest';
import { Tutor } from '../src/games/homestead/lessons';
import { STAMINA_COST } from '../src/sim/constants';
import { crowTarget, guarded, nightfall } from '../src/sim/day';
import { plant, plots } from '../src/sim/world';
import type { WorldState } from '../src/sim/types';
import { EARLY, EARLY_FEATURES, teach, world } from './helpers';

/** Past the crow lesson: pests let in, `fields` fields owned and hoed, every plot growing carrots. */
function grown(seed = 42, fields = 2): WorldState {
  const s = teach(world('sunup', seed), [...EARLY, 'requests', 'deliver', 'pests', 'scarecrow', 'forecast', 'bugs', 'field', 'turn', 'smith', 'wide', 'choose'], [...EARLY_FEATURES, 'board', 'requests', 'pests', 'build', 'forecast']);
  s.day = 6;
  s.orders = [];
  for (let i = 1; i < fields; i++) s.parcels[i].owned = true;
  for (const p of s.parcels.filter((q) => q.owned)) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) plant(s, x, y, 'carrot', 2);
  return s;
}

const build = (s: WorldState, x: number, y: number) => {
  plots(s, x, y).crop = null;
  s.builds.push({ id: s.nextId++, kind: 'scarecrow', x, y });
};

describe('a scarecrow watches a five by five square, so where it stands matters', () => {
  it('one in the middle of a field covers all of it; one in its corner leaves the far side open', () => {
    const s = grown();
    build(s, 3, 6);
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) expect(guarded(s, x, y), `${x},${y}`).toBe(true);
    // Its reach stops two plots out: the next field is open.
    expect(guarded(s, 7, 6)).toBe(false);
    const c = grown();
    build(c, 2, 5);
    expect(guarded(c, 4, 7)).toBe(true);
    for (const [x, y] of [[5, 5], [5, 8], [2, 8], [5, 6]]) expect(guarded(c, x, y), `${x},${y}`).toBe(false);
  });

  it('crows come for the fields no scarecrow watches, and keep away from a farm watched over whole', () => {
    const s = grown(7, 2);
    build(s, 3, 6);
    // Field 2 is open: every crow goes for it.
    for (let k = 0; k < 40; k++) {
      const t = crowTarget(s)!;
      expect(t.x).toBeGreaterThanOrEqual(7);
    }
    let open = 0;
    for (let k = 0; k < 30; k++) {
      s.day = 6;
      s.weather = 'sun';
      s.forecast = ['sun', 'sun', 'sun'];
      nightfall(s, []);
      for (const p of s.plots) if (p.crop) Object.assign(p.crop, { age: 2, stage: 2, dry: 0, bugs: 0 });
      // (Rain and storms keep crows away, so count the dry mornings that brought one.)
      if (!['rain', 'storm'].includes(s.weather) && s.crowPlan.length) open++;
    }
    expect(open).toBeGreaterThan(10);
    // A scarecrow in the middle of field 2 as well: no crow comes at all.
    build(s, 8, 6);
    for (let k = 0; k < 30; k++) {
      s.day = 6;
      s.weather = 'sun';
      s.forecast = ['sun', 'sun', 'sun'];
      nightfall(s, []);
      for (const p of s.plots) if (p.crop) Object.assign(p.crop, { age: 2, stage: 2, dry: 0, bugs: 0 });
      expect(s.crowPlan, `morning ${k}`).toEqual([]);
    }
  });
});

describe('bugs left on a crop spread', () => {
  it('overnight to every growing neighbour of the same kind, and to about half of the others', () => {
    let other = 0;
    let others = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = grown(seed, 1);
      s.weather = 'sun';
      s.forecast = ['sun', 'sun', 'sun'];
      for (const p of s.plots) if (p.crop) p.wet = true;
      // A bugged carrot at 3,6 with carrots east and south, lettuce west and north.
      plots(s, 2, 6).crop!.kind = 'lettuce';
      plots(s, 3, 5).crop!.kind = 'lettuce';
      plots(s, 3, 6).crop!.bugs = 1;
      nightfall(s, []);
      expect(plots(s, 4, 6).crop!.bugs, `seed ${seed}`).toBeGreaterThan(0);
      expect(plots(s, 3, 7).crop!.bugs, `seed ${seed}`).toBeGreaterThan(0);
      for (const [x, y] of [[2, 6], [3, 5]]) {
        others++;
        if (plots(s, x, y).crop!.bugs > 0) other++;
      }
    }
    expect(other / others).toBeGreaterThan(0.3);
    expect(other / others).toBeLessThan(0.7);
  });

  it('left alone for days, one bugged crop becomes a patch, and the first of them withers', () => {
    const s = grown(3, 1);
    plots(s, 3, 6).crop!.bugs = 1;
    let withered = 0;
    for (let k = 0; k < 3; k++) {
      s.weather = 'sun';
      s.forecast = ['sun', 'sun', 'sun'];
      for (const p of s.plots) p.wet = true;
      const ev: { type: string }[] = [];
      nightfall(s, ev as never);
      withered += ev.filter((e) => e.type === 'wither').length;
    }
    const bugged = s.plots.filter((p) => p.crop && !p.crop.dead && p.crop.bugs > 0).length;
    expect(bugged).toBeGreaterThanOrEqual(6);
    expect(withered).toBeGreaterThanOrEqual(1);
  });
});

describe('a heat wave bites', () => {
  it('a crop left dry on a heat wave’s night withers; a watered one grows', () => {
    const s = grown(5, 1);
    s.weather = 'heat';
    plots(s, 2, 5).wet = true;
    plots(s, 2, 5).moisture = 2;
    plots(s, 3, 5).wet = false;
    nightfall(s, []);
    expect(plots(s, 2, 5).crop!.age).toBe(3);
    expect(plots(s, 3, 5).crop!.dead).toBe(true);
  });

  it('watering is real work on a dry day: two stamina a plot, so sixteen thirsty plots take a third of the day’s', () => {
    expect(STAMINA_COST.water).toBe(2);
  });
});

describe('the crow, the Build tool and the forecast come one a day', () => {
  it('the crow line brings nothing else; the Build tool comes the next morning with its line, the forecast the morning after', () => {
    const s = teach(world('sunup', 42), [...EARLY, 'requests', 'deliver', 'field', 'turn', 'smith', 'wide', 'bugs'], [...EARLY_FEATURES, 'board', 'requests', 'pests']);
    s.day = 6;
    s.orders = [];
    const t = new Tutor();
    const unlocked: Record<number, string[]> = {};
    const run = (n: number) => {
      let line = '';
      for (let i = 0; i < n; i++) {
        const out = t.update(s, 0.1, true);
        line = out.line;
        for (const c of out.cmds) {
          if (c.type !== 'unlock' || c.what.startsWith('lesson:')) continue;
          (unlocked[s.day] ??= []).push(c.what);
          if (!s.learn.includes(c.what)) s.learn.push(c.what);
        }
      }
      return line;
    };
    s.crows.push({ id: 900, x: 3, y: 6, fromX: -3, fromY: 4, phase: 'peck', t: 0 });
    expect(run(20)).toMatch(/^A crow is on your [a-z]+\. Shoo it\.$/);
    s.crows = [];
    run(2);
    expect(s.learn).toContain('lesson:pests');
    // The rest of the crow's day: no Build tool, no forecast, no scarecrow line.
    expect(run(150)).not.toMatch(/Scarecrow|forecast/);
    expect(unlocked[6] ?? []).toEqual([]);
    // The next morning: the Build tool and its line.
    s.day = 7;
    expect(run(5)).toMatch(/^Scarecrows keep crows away\./);
    expect(unlocked[7]).toEqual(['build']);
    run(150);
    expect(s.learn).not.toContain('forecast');
    // The morning after: the forecast and its line.
    s.day = 8;
    expect(run(5)).toBe('Check the forecast for rain and heat.');
    expect(unlocked[8]).toEqual(['forecast']);
  });

  it('the smith waits for a day when nothing else came', () => {
    const s = teach(world('sunup', 42), [...EARLY, 'requests', 'deliver', 'field', 'turn', 'wide', 'bugs', 'pests'], [...EARLY_FEATURES, 'board', 'requests', 'pests']);
    s.day = 9;
    s.orders = [];
    s.rep = 3;
    s.learnCount['done:pests'] = 8;
    const t = new Tutor();
    const seen: string[] = [];
    for (let i = 0; i < 300; i++) {
      const out = t.update(s, 0.1, true);
      for (const c of out.cmds) if (c.type === 'unlock' && !c.what.startsWith('lesson:')) seen.push(c.what);
      for (const c of out.cmds) if (c.type === 'unlock' && !s.learn.includes(c.what)) s.learn.push(c.what);
    }
    expect(seen).toEqual(['build']);
    s.day = 10;
    for (let i = 0; i < 300; i++) {
      const out = t.update(s, 0.1, true);
      for (const c of out.cmds) if (c.type === 'unlock' && !c.what.startsWith('lesson:')) seen.push(c.what);
      for (const c of out.cmds) if (c.type === 'unlock' && !s.learn.includes(c.what)) s.learn.push(c.what);
    }
    expect(seen).toEqual(['build', 'forecast']);
    s.day = 11;
    for (let i = 0; i < 300; i++) {
      const out = t.update(s, 0.1, true);
      for (const c of out.cmds) if (c.type === 'unlock' && !c.what.startsWith('lesson:')) seen.push(c.what);
      for (const c of out.cmds) if (c.type === 'unlock' && !s.learn.includes(c.what)) s.learn.push(c.what);
    }
    expect(seen).toEqual(['build', 'forecast', 'smith']);
  });
});
