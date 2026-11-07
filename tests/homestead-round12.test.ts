// Round 12: no major problem, and a few lines that misled or got in the way. A row tap on a nearly empty can dropped the
// rest of its row unsaid (a heat wave: wet, dry, dry, dry); "In time for the fair" sat beside "Plant by tomorrow" on a
// farm with no bare soil, and the corn ripened the day after the fair; the fair's line ran to ten words and said
// "taken" of requests filled; the sleep question on a flock day gave no size (7 crops once, 2 another time); "Tap Hands."
// on a desktop; the crow line stayed up after the crow had gone; "picks again" never said the plot stays all season;
// and on a 412x900 phone the close view cut field 2's right column in half.
//
// New helpers are reached through their modules (`?.`), so on the committed round 11 code these fail on their
// assertions, not on imports.
import { describe, expect, it } from 'vitest';
import { Tutor } from '../src/games/homestead/lessons';
import { makeRig } from '../src/render3d/camera';
import * as day from '../src/sim/day';
import { forFair } from '../src/sim/goals';
import { PARCELS } from '../src/sim/map';
import { step } from '../src/sim/step';
import { plant, plots } from '../src/sim/world';
import type { Command } from '../src/sim/commands';
import type { Order, SimEvent, WorldState } from '../src/sim/types';
import * as dialogs from '../src/ui/dialogs';
import { EARLY, EARLY_FEATURES, stand, teach, world } from './helpers';

const ALL = [...EARLY, 'requests', 'sowfor', 'deliver', 'choose', 'fair', 'pests', 'scarecrow', 'forecast', 'sprinkler', 'bugs', 'field', 'turn', 'smith', 'wide', 'hoe', 'stamina', 'sweep'];
const FEATURES = [...EARLY_FEATURES, 'stamina', 'board', 'requests', 'fair', 'pests', 'build', 'sprinkler', 'forecast', 'hoe', 'smith', 'fields', 'seedtab', 'wide'];

const d = day as typeof day & { crowsTonight?: (s: WorldState) => number };

/** A farm past its lessons: `fields` fields owned and hoed, nothing growing. */
function farm(seed: number, opts: { fields?: number; coins?: number; day?: number; lessons?: string[] } = {}): WorldState {
  const s = teach(world('sunup', seed), opts.lessons ?? ALL, FEATURES);
  s.day = opts.day ?? 6;
  s.rep = 3;
  s.requested = 1;
  s.orders = [];
  s.coins = opts.coins ?? 400;
  s.forecast = ['sun', 'sun', 'sun'];
  s.weather = 'sun';
  s.crowPlan = [];
  s.held = false;
  for (let i = 1; i < (opts.fields ?? 1); i++) {
    const p = s.parcels[i];
    p.owned = true;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) plots(s, x, y).tilled = true;
  }
  for (const p of s.plots) p.crop = null;
  return s;
}

/** Run the farm for `seconds`, sending each command at its time, stamina kept full; returns the events. */
function run(s: WorldState, seconds: number, at: [number, Command][] = []): SimEvent[] {
  const dt = 1 / 60;
  const todo = [...at].sort((a, b) => a[0] - b[0]);
  const ev: SimEvent[] = [];
  for (let t = 0; t < seconds; t += dt) {
    const cmds: Command[] = [];
    while (todo.length && todo[0][0] <= t) cmds.push(todo.shift()![1]);
    s.stamina = s.staminaMax;
    ev.push(...step(s, dt, cmds));
  }
  return ev;
}

const tap = (x: number, y: number) => ({ type: 'actAt' as const, x, y });
const words = (line: string) => line.split(/\s+/).filter(Boolean).length;

describe('a row tap on a nearly empty can', () => {
  it('the copper can running dry partway through a row goes to the well and finishes the row (it ended wet, dry, dry, dry)', () => {
    const s = farm(3);
    s.weather = 'heat';
    s.tools.can = 1;
    s.water = 1;
    s.tool = 'can';
    stand(s, 3, 4, 's');
    for (let x = 2; x < 6; x++) plant(s, x, 6, 'carrot', 1);
    for (const p of s.plots) p.wet = false;
    const ev = run(s, 30, [[0, tap(2, 6)]]);
    expect([2, 3, 4, 5].map((x) => plots(s, x, 6).wet)).toEqual([true, true, true, true]);
    expect(ev.filter((e) => e.type === 'refill').length).toBe(1);
    // It says so as it goes.
    expect(ev.some((e) => e.type === 'deny' && /To the well first/.test(e.reason))).toBe(true);
    expect(s.taps ?? []).toEqual([]);
  });

  it('a row tapped after it waits its turn: the first row is finished before the next is watered', () => {
    const s = farm(5);
    s.tools.can = 1;
    s.water = 2;
    s.tool = 'can';
    stand(s, 3, 4, 's');
    for (const y of [6, 7]) for (let x = 2; x < 6; x++) plant(s, x, y, 'carrot', 1);
    for (const p of s.plots) p.wet = false;
    const order: string[] = [];
    const ev = run(s, 40, [
      [0, tap(2, 6)],
      [0.05, tap(2, 7)],
    ]);
    for (const e of ev) if (e.type === 'water') order.push(`${e.x},${e.y}`);
    expect(order.length).toBe(8);
    // The four of row 6 all come before any of row 7.
    expect(order.slice(0, 4).every((t) => t.endsWith(',6'))).toBe(true);
  });

  it('the old can (one plot a tap) is not sent back for anything', () => {
    const s = farm(7);
    s.tools.can = 0;
    s.water = 1;
    s.tool = 'can';
    stand(s, 3, 4, 's');
    for (let x = 2; x < 6; x++) plant(s, x, 6, 'carrot', 1);
    for (const p of s.plots) p.wet = false;
    const ev = run(s, 10, [[0, tap(2, 6)]]);
    expect(ev.filter((e) => e.type === 'refill').length).toBe(0);
    expect([2, 3, 4, 5].filter((x) => plots(s, x, 6).wet).length).toBe(1);
  });
});

describe('"In time for the fair" and the plant-by day agree', () => {
  /** Summer 3, the fair on Summer 10 wanting 3, every plot of two fields growing carrots that ripen tomorrow. */
  function full(seed: number): { s: WorldState; corn: Order } {
    const s = farm(seed, { day: 13, fields: 2, coins: 1500 });
    s.fair = { start: 11, day: 20, want: 3, got: 0 };
    for (const p of s.parcels.slice(0, 2)) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) plant(s, x, y, 'carrot', 4);
    const corn: Order = { id: s.nextId++, who: 'Pell’s pickles', items: [{ crop: 'corn', n: 3 }], reward: 600, rep: 1, due: 22, sowBy: 14, made: 13, seen: false, kind: 'easy', taken: false };
    s.orders = [corn];
    return { s, corn };
  }

  it('with no bare soil today, corn that can go in tomorrow and ripens the day after the fair is too late for it', () => {
    const { s, corn } = full(11);
    expect(forFair(s, corn)).toBe(false);
    const lines = dialogs.noteText(s, corn).lines;
    expect(lines).toContain('Plant by tomorrow, seed 135');
    expect(lines).toContain('Too late for the fair');
    expect(lines.join(' ')).not.toMatch(/In time for the fair/);
  });

  it('with the soil free today, but only in time if planted today, it says "Plant today for the fair"', () => {
    const { s, corn } = full(13);
    for (let x = 2; x < 6; x++) plots(s, x, 5).crop = null;
    expect(forFair(s, corn)).toBe(true);
    const lines = dialogs.noteText(s, corn).lines;
    expect(lines).toContain('Plant by tomorrow, seed 135');
    expect(lines).toContain('Plant today for the fair');
    expect(lines).not.toContain('In time for the fair');
  });

  it('in time from its plant-by day, it still says "In time for the fair"', () => {
    const { s, corn } = full(17);
    s.day = 12;
    corn.sowBy = 13;
    expect(dialogs.noteText(s, corn).lines).toContain('In time for the fair');
  });

  it('a taken request with its seed still to sow and no soil before it is too late counts for the fair no more', () => {
    const { s, corn } = full(19);
    Object.assign(corn, { taken: true, takenOn: 13, from: s.nextId, sowBy: 14, due: 21 });
    expect(forFair(s, corn)).toBe(false);
    for (let x = 2; x < 6; x++) plots(s, x, 5).crop = null;
    expect(forFair(s, corn)).toBe(true);
  });
});

describe('the fair in one short line', () => {
  it('"Fair Autumn 10: 1 of 5 filled." counts what it says (filled requests), in eight words or fewer', () => {
    const s = farm(23, { day: 25, fields: 4 });
    s.fair = { start: 21, day: 30, want: 5, got: 1 };
    expect(dialogs.fairLines(s)).toEqual(['Fair Autumn 10: 1 of 5 filled.']);
    // Before its season: what it wants, and that only requests taken in that season count.
    s.day = 19;
    expect(dialogs.fairLines(s)).toEqual(['Fair Autumn 10: 5 filled, taken in autumn.']);
    for (const day of [19, 25]) {
      s.day = day;
      for (const l of dialogs.fairLines(s)) expect(words(l)).toBeLessThanOrEqual(8);
    }
  });
});

describe('the sleep question on a flock day says how many crops are at risk', () => {
  /** A flock day, crows still to come, a field of corn no scarecrow watches. */
  function flock(seed: number): WorldState {
    const s = farm(seed, { day: 12, fields: 2 });
    s.minute = 540;
    for (const p of s.parcels.slice(0, 2)) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) plant(s, x, y, 'corn', 2);
    s.flock = true;
    s.crowPlan = [600, 700, 800, 900, 1000, 1050];
    return s;
  }

  it('it counts the crows still to come, and one pecking, and the night takes that many', () => {
    const s = flock(29);
    s.crows.push({ id: s.nextId++, x: 3, y: 6, fromX: -3, fromY: 4, phase: 'peck', t: 0 });
    const n = d.crowsTonight?.(s);
    expect(n).toBe(7);
    step(s, 0.016, [{ type: 'sleep' }]);
    for (let i = 0; i < 4000 && (s.turnover >= 0 || s.day === 12); i++) step(s, 1 / 30);
    expect(s.day).toBe(13);
    expect(s.report!.eaten).toBe(7);
  });

  it('no more than the crops a crow could reach: scarecrows watching the rest leave fewer at risk', () => {
    const s = flock(31);
    for (const p of s.parcels.slice(0, 2)) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) plots(s, x, y).crop = null;
    plant(s, 3, 6, 'corn', 2);
    plant(s, 4, 6, 'corn', 2);
    expect(d.crowsTonight?.(s)).toBe(2);
  });

  it('its words: "Crows may take about 7 crops.", within eleven words with the hour', () => {
    const text = dialogs.sleepText(900, { flock: true, crowCrops: 7 } as Parameters<typeof dialogs.sleepText>[1]);
    expect(text).toBe('It is 9:00 pm. Crows may take about 7 crops.');
    expect(words(text)).toBeLessThanOrEqual(11);
    expect(dialogs.sleepText(900, { flock: true, crowCrops: 1 } as Parameters<typeof dialogs.sleepText>[1])).toBe('It is 9:00 pm. A crow may take a crop.');
  });
});

describe('lines that misled', () => {
  it('on a keyboard the bug line names the key (it said "Tap Hands." on a desktop); on touch it names the button', () => {
    const s = farm(37, { lessons: ALL.filter((l) => l !== 'bugs') });
    s.tool = 'can';
    plant(s, 4, 6, 'lettuce', 2);
    plots(s, 4, 6).crop!.bugs = 1;
    expect(new Tutor().update(s, 0.1, false).line).toBe('Press 1. Pick bugs off the lettuces.');
    expect(new Tutor().update(s, 0.1, true).line).toBe('Tap Hands. Pick bugs off the lettuces.');
  });

  it('the crow line goes the moment the crow does, shooed or not (it stayed about 10 s)', () => {
    for (const shoo of [true, false]) {
      const s = farm(41, { lessons: ALL.filter((l) => l !== 'pests' && l !== 'scarecrow' && l !== 'forecast' && l !== 'sprinkler') });
      plant(s, 3, 6, 'carrot', 2);
      s.crows.push({ id: s.nextId++, x: 3, y: 6, fromX: -3, fromY: 4, phase: 'peck', t: 0 });
      const t = new Tutor();
      // Up long enough to be read (2 s), then the crow goes.
      for (let i = 0; i < 20; i++) expect(t.update(s, 0.1, true).line).toMatch(/^A crow is on your carrots\. Shoo it\.$/);
      if (shoo) t.onEvent(s, { type: 'crowScared', id: s.crows[0].id, x: 3, y: 6 });
      s.crows[0].phase = 'flee';
      expect(t.update(s, 0.1, true).line, shoo ? 'shooed' : 'flew off').not.toMatch(/crow/i);
      expect(s.learn).toContain('lesson:pests');
    }
  });

  it('a regrowing crop’s note says it holds its plots all season and picks again', () => {
    const s = farm(43, { day: 14, fields: 2 });
    const beans: Order = { id: s.nextId++, who: 'Old Tamsin', items: [{ crop: 'beans', n: 4 }], reward: 400, rep: 1, due: 20, sowBy: 15, made: 14, seen: false, kind: 'single', taken: false };
    s.orders = [beans];
    const line = dialogs.noteText(s, beans).lines[0];
    expect(line).toBe('for 4 plots all season, picks again');
    expect(words(line)).toBeLessThanOrEqual(8);
    // Kept whole on a narrow note.
    expect(dialogs.keepWhole(line)).toContain('<span class="nw">4 plots all season,</span>');
  });
});

describe('the close view keeps the field the farmer stands in whole on a phone', () => {
  /** The screen x of each plot's outer corners, near row and far, for the field at `id`. */
  function edges(w: number, h: number, fx: number, fy: number, id: number): { lo: number; hi: number } {
    const rig = makeRig();
    rig.resize(w, h);
    rig.update({ mode: 'close', focusX: fx, focusY: fy, zoom: 1, panX: 0, panY: 0 }, 20, 15, 0, true);
    rig.commit();
    const f = PARCELS[id];
    let lo = Infinity;
    let hi = -Infinity;
    for (let y = f.y; y <= f.y + f.h; y++) {
      lo = Math.min(lo, rig.project(f.x, y, 0)!.x);
      hi = Math.max(hi, rig.project(f.x + f.w, y, 0)!.x);
    }
    return { lo, hi };
  }

  for (const [w, h] of [[412, 900], [412, 838], [390, 844], [360, 740]]) {
    it(`${w}x${h}: from every plot of fields 1 to 6, the field is on screen edge to edge (field 2's right column sat at x 410 of 412)`, () => {
      for (let id = 0; id < PARCELS.length; id++) {
        const f = PARCELS[id];
        for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
          const e = edges(w, h, x + 0.5, y + 0.5, id);
          expect(e.lo, `field ${id + 1} from ${x},${y}`).toBeGreaterThanOrEqual(0);
          expect(e.hi, `field ${id + 1} from ${x},${y}`).toBeLessThanOrEqual(w);
        }
      }
    });
  }
});
