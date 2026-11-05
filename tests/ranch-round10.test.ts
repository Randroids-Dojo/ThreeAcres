// Thistledown's tenth harsh playtest (the first 15 minutes 6 of 10: clear 8,
// smooth 5, engaging 5; the whole game 5), as tests on the render-free sim and
// tutor: starter food never in another kind's feeder (the P1: the tester's
// first embers went into the clover pen, its empty feeder took 12 sweetroots,
// and clover heads bounced off it for two and a half days), a feeder that a
// Pull empties and that holds a second food for a mixed pen; the jar lesson
// waiting while downies aboard have no pen, and the journal saying so first
// (the other P1: the jar left 35 coins and 3 embers with nowhere to go); the
// first dusk's hold with no 30 s waits; the planting and shooing lines with an
// empty jar; one trip out for two catches, and no "Catch another" with three
// kept; every garden option on a tag; the rare one's worth and a small thistle
// ranch's prized order cut down to size; Pull at a pen taking the kind aimed
// at; three later goals; and the cheap ones.
// Every test here but one fails on the code the tester played (proved on a
// `git archive` copy of that commit); what that commit lacked is reached through
// the modules, so each test fails on its own assertion. The one that passes there
// is a guard: a fast sweep of a pen's fluff is still a sweep with Pull sorting.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOALS, type DownyKind, type GoalId } from '../src/games/ranch/defs';
import * as lessonsMod from '../src/games/ranch/lessons';
import { Tutor, goalText, orderLines, teachAll, type Say } from '../src/games/ranch/lessons';
import * as menuMod from '../src/games/ranch/menu';
import * as simMod from '../src/games/ranch/sim';
import { Sim, padSpots, type Aim, type Controls, type Ev, type Interactable } from '../src/games/ranch/sim';
import { PADS, PEN_R } from '../src/games/ranch/world';
import { rng } from '../src/games/ranch/noise';
import type { Downy, RanchState } from '../src/games/ranch/state';
import { newItem } from '../src/games/ranch/state';

vi.setConfig({ testTimeout: 180_000 });

const realRandom = Math.random;
beforeEach(() => {
  Math.random = rng(1010);
});
afterEach(() => {
  Math.random = realRandom;
});

const idle: Controls = { moveX: 0, moveZ: 0, sprint: false, jump: false, jumpPressed: false, draw: false, puff: false, puffPressed: false };
const touch: Say = { dev: 'touch', locked: false, lockAvailable: false };
const M = simMod as unknown as Record<string, unknown>;
const L = lessonsMod as unknown as Record<string, unknown>;
type Feeder = { t: string | null; n: number; t2?: string | null; n2?: number };

function aimAt(sim: Sim, x: number, y: number, z: number): Aim {
  const p = sim.s.player;
  const ex = p.x;
  const ey = p.y + 1.6;
  const ez = p.z;
  const l = Math.hypot(x - ex, y - ey, z - ez);
  const dx = (x - ex) / l;
  const dy = (y - ey) / l;
  const dz = (z - ez) / l;
  return { ex, ey, ez, dx, dy, dz, mx: ex + dx * 0.6 + 0.15, my: ey - 0.2, mz: ez + dz * 0.6 };
}

function stand(sim: Sim, x: number, z: number): void {
  const p = sim.s.player;
  p.x = x;
  p.z = z;
  p.y = sim.phys.floor(x, z);
  p.vx = p.vz = p.vy = 0;
}

function pen(sim: Sim, i: number, ups: string[] = []): void {
  sim.s.pads[i].kind = 'pen';
  sim.s.pads[i].ups = ups;
  sim.phys.setPads(sim.s.pads);
}

function quiet(hour = 10): Sim {
  const sim = new Sim(null);
  sim.wild = false;
  sim.s.downies = [];
  sim.s.items = [];
  sim.s.hour = hour;
  sim.s.night = sim.s.day;
  sim.s.orderDay = sim.s.day;
  return sim;
}

function fill(sim: Sim, i: number, kind: DownyKind, n: number, hunger = 0.2): Downy[] {
  const out: Downy[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const d = sim.spawn(kind, PADS[i].x + Math.cos(a) * 2, PADS[i].z + Math.sin(a) * 2, true);
    d.hunger = hunger;
    out.push(d);
  }
  return out;
}

function run(sim: Sim, seconds: number, c: Controls = idle, aim?: () => Aim, evs?: Ev[]): void {
  for (let t = 0; t < seconds; t += 1 / 30) {
    const p = sim.s.player;
    sim.update(1 / 30, c, aim ? aim() : aimAt(sim, p.x, p.y + 1.6, p.z - 5));
    if (evs) evs.push(...sim.events);
    sim.events.length = 0;
  }
}

/** A downy of yours dropped into a pen from above (as a blow lands it), until it is down. */
function dropIn(sim: Sim, i: number, kind: DownyKind, evs: Ev[], dx = 0): Downy {
  const d = sim.spawn(kind, PADS[i].x + dx, PADS[i].z, true);
  d.pen = -1;
  d.y = sim.phys.floor(d.x, d.z) + 0.4;
  d.grounded = false;
  run(sim, 1, idle, undefined, evs);
  return d;
}

const foodsIn = (fd: Feeder): Record<string, number> => {
  const out: Record<string, number> = {};
  if (fd.t && fd.n > 0) out[fd.t] = (out[fd.t] ?? 0) + fd.n;
  if (fd.t2 && (fd.n2 ?? 0) > 0) out[fd.t2] = (out[fd.t2] ?? 0) + (fd.n2 ?? 0);
  return out;
};

/** Blow k of a food into pen i's hopper (each dropped into its mouth, as a good blow lands it); the feeder's notes. */
function intoHopper(sim: Sim, i: number, food: 'cloverhead' | 'sweetroot' | 'dewberry', k: number): string[] {
  const h = padSpots(i).hopper;
  const hy = sim.phys.floor(h.x, h.z) + h.y;
  const notes: string[] = [];
  for (let j = 0; j < k; j++) {
    const it = newItem(sim.s, food, h.x, hy + 0.2, h.z);
    it.flyT = 0.1;
    it.blown = true;
    it.vy = -1;
    sim.s.items.push(it);
    const evs: Ev[] = [];
    run(sim, 0.2, idle, undefined, evs);
    for (const e of evs) if (e.t === 'feeder' && e.why) notes.push(e.why);
  }
  return notes;
}

/** A ranch through the first day's lessons (the loop, the order, the feeder, dusk, the night, the garden and planting), the rest to come. */
function dayTwo(hour = 14): { sim: Sim; s: RanchState; tutor: Tutor; go: (secs: number) => void } {
  const sim = quiet(hour);
  sim.teaching = true;
  const s = sim.s;
  s.day = 2;
  s.night = 2;
  s.orderDay = 2;
  for (const l of ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'slots', 'meadow', 'jump', 'run', 'ease', 'farm', 'order', 'dusk', 'night', 'ups', 'feeder', 'garden', 'plant', 'gates']) s.learn.push(`lesson:${l}`);
  for (const f of ['bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'slots', 'jump', 'appetite', 'ease', 'orders', 'time', 'evening', 'clock', 'sleep', 'nettles', 'up:hedge', 'up:feeder', 'garden', 'gates']) s.learn.push(f);
  s.gates.ridge = true;
  sim.phys.gates = { ...s.gates };
  const tutor = new Tutor();
  const floor = (x: number, z: number) => sim.phys.floor(x, z);
  const go = (secs: number) => {
    for (let t = 0; t < secs; t += 1 / 30) {
      sim.update(1 / 30, idle, aimAt(sim, s.player.x, s.player.y + 1.6, s.player.z - 5));
      for (const e of sim.events) tutor.onEvent(s, e);
      sim.events.length = 0;
      tutor.update(s, 1 / 30, touch, floor);
    }
  };
  return { sim, s, tutor, go };
}

const line = (tutor: Tutor) => tutor.line;

// ---------------------------------------------------------------- P1: starter food never in another kind's feeder

describe("P1: a new kind's starter food never takes over another kind's feeder, and a feeder can be emptied and holds a second food", () => {
  it("the playtest: first embers blown into the clover pen with an empty feeder: the sack lies on the pen's floor, away from the gate, and clover heads still go into the feeder; brooks in a pen of their own get theirs in its feeder", () => {
    const sim = quiet(10);
    const s = sim.s;
    pen(sim, 1, ['feeder']);
    fill(sim, 1, 'clover', 6);
    const evs: Ev[] = [];
    dropIn(sim, 1, 'ember', evs, 0);
    dropIn(sim, 1, 'ember', evs, 0.8);
    const fd = s.pads[1].feeder as Feeder;
    expect(foodsIn(fd).sweetroot ?? 0, 'sweetroots in the clover pen\'s feeder').toBe(0);
    const roots = s.items.filter((it) => !it.gone && it.type === 'sweetroot' && sim.phys.penAt(it.x, it.z) === 1);
    expect(roots.length, 'the sack on the pen floor').toBe(12);
    // Away from the gate, where the fluff gathers and a pull at it reaches.
    const post = padSpots(1).post;
    for (const r of roots) expect(Math.hypot(r.x - post.x, r.z - post.z)).toBeGreaterThan(5.5);
    // Clover heads blown at the hopper go in.
    const notes = intoHopper(sim, 1, 'cloverhead', 4);
    expect(notes).toEqual([]);
    expect(foodsIn(s.pads[1].feeder as Feeder).cloverhead).toBe(4);
    // A pen of brooks alone: their sack goes into its feeder (given one), as before.
    pen(sim, 4, []);
    dropIn(sim, 4, 'brook', evs);
    expect(foodsIn(s.pads[4].feeder as Feeder).dewberry).toBe(12);
    expect(s.pads[4].ups).toContain('feeder');
  });

  it("a feeder of sweetroots in a clover pen (the playtest's, stuck for two and a half days) empties with a Pull at its hopper: its food comes into the jar, no downy with it", () => {
    const sim = quiet(10);
    const s = sim.s;
    pen(sim, 1, ['feeder']);
    fill(sim, 1, 'clover', 6, 0.1);
    for (const d of s.downies) d.hopT = 99;
    s.pads[1].feeder = { t: 'sweetroot', n: 12 };
    const h = padSpots(1).hopper;
    // Outside the fence, 1.6 m from the hopper, on the lane side.
    const ox = h.x - PADS[1].x;
    const oz = h.z - PADS[1].z;
    const ol = Math.hypot(ox, oz);
    stand(sim, h.x + (ox / ol) * 1.6, h.z + (oz / ol) * 1.6);
    run(sim, 0.5);
    const hy = sim.phys.floor(h.x, h.z) + h.y;
    const aim = aimAt(sim, h.x, hy, h.z);
    // The crosshair says a Pull would take something there.
    expect(sim.aimTarget(aim)).toBe('target');
    run(sim, 4, { ...idle, draw: true }, () => aim);
    run(sim, 0.5, idle, () => aim);
    const fd = s.pads[1].feeder as Feeder;
    expect(fd.n + (fd.n2 ?? 0), 'the feeder emptied').toBe(0);
    expect(s.slots.reduce((a, q) => a + (q.t === 'sweetroot' ? q.n : 0), 0), 'sweetroots in the jar').toBe(12);
    expect(s.slots.some((q) => q.t === 'clover'), 'no clover taken').toBe(false);
    expect(s.downies.filter((d) => !d.gone && d.pen === 1).length).toBe(6);
  });

  it('a mixed pen: its feeder takes each kind\'s food, and feeds each kind its own; a third food bounces off, naming the two', () => {
    const sim = quiet(10);
    const s = sim.s;
    pen(sim, 1, ['feeder']);
    const clovers = fill(sim, 1, 'clover', 3, 0.2);
    const embers = fill(sim, 1, 'ember', 3, 0.2);
    expect(intoHopper(sim, 1, 'sweetroot', 6)).toEqual([]);
    expect(intoHopper(sim, 1, 'cloverhead', 6), 'clover heads into a feeder of sweetroots').toEqual([]);
    expect(foodsIn(s.pads[1].feeder as Feeder)).toEqual({ sweetroot: 6, cloverhead: 6 });
    const third = intoHopper(sim, 1, 'dewberry', 1);
    expect(third[0]).toBe('This feeder holds sweetroots and clover heads.');
    // Hungry, each eats its own from the feeder.
    for (const d of [...clovers, ...embers]) d.hunger = 0.9;
    const evs: Ev[] = [];
    run(sim, 40, idle, undefined, evs);
    const ate = evs.filter((e): e is Extract<Ev, { t: 'eat' }> => e.t === 'eat');
    expect(ate.some((e) => e.kind === 'clover' && e.food === 'cloverhead'), 'a clover fed from it').toBe(true);
    expect(ate.some((e) => e.kind === 'ember' && e.food === 'sweetroot'), 'an ember fed from it').toBe(true);
  });
});

// ---------------------------------------------------------------- P1: the jar lesson waits; the journal says when downies have no pen

describe('P1: the jar lesson waits while downies aboard have no pen, and the journal says so first', () => {
  /** The playtest's day 2: 435 coins just after catching 3 embers, a clover pen of six with a feeder, the ridge open. */
  function playtest(coins: number) {
    const r = dayTwo(14);
    const { sim, s } = r;
    pen(sim, 1, ['feeder']);
    fill(sim, 1, 'clover', 6);
    s.pads[1].feeder = { t: 'cloverhead', n: 20 };
    s.goals = GOALS.slice(0, GOALS.findIndex((g) => g.id === 'hollow')).map((g) => g.id);
    s.coins = coins;
    s.slots[1] = { t: 'ember', n: 3, downs: [0, 1, 2].map(() => ({ h: 0.3, c: 2 })) };
    stand(sim, 4, 34);
    return r;
  }

  it('with 435 coins and 3 embers aboard: "Build a pen for your embers." with the arrow on an empty plot, not "Buy a bigger jar at the workbench."', () => {
    const { sim, s, tutor, go } = playtest(435);
    go(2);
    expect(line(tutor)).toBe('Build a pen for your embers.');
    expect(tutor.mark.on).toBe(true);
    const plot = PADS.findIndex((_p, i) => s.pads[i].kind === 'empty' && Math.hypot(padSpots(i).post.x + 0.9 - tutor.mark.x, padSpots(i).post.z - tutor.mark.z) < 0.3);
    expect(plot, 'the arrow on an empty plot\'s post').toBeGreaterThanOrEqual(0);
    expect(tutor.tag).toBe('build:pen');
    // Built, and the embers blown in: the line goes, and with 235 coins left, still no jar line.
    sim.choose({ kind: 'pad', id: plot, label: '', x: 0, y: 0, z: 0 }, 'build:pen');
    s.slots[1] = { t: null, n: 0 };
    const evs: Ev[] = [];
    for (let k = 0; k < 3; k++) dropIn(sim, plot, 'ember', evs, k * 0.6 - 0.6);
    go(3);
    expect(line(tutor)).not.toMatch(/pen for your|jar/);
    // With the jar's price as well (the pen bought), and the jar once full (round 11), the jar lesson comes.
    s.coins = 450;
    s.learnCount.full = 1;
    go(3);
    expect(line(tutor)).toBe('Buy a bigger jar at the workbench.');
  });

  it('short of a pen\'s price it counts the coins, with no arrow; with the pen and the jar\'s price both, the pen line comes first, then the jar', () => {
    const a = playtest(35);
    a.go(2);
    expect(line(a.tutor)).toBe('Save for an ember pen, 35 of 200.');
    expect(a.tutor.mark.on).toBe(false);
    const b = playtest(640);
    b.go(2);
    expect(line(b.tutor)).toBe('Build a pen for your embers.');
  });
});

// ---------------------------------------------------------------- the first fifteen minutes

describe('the first fifteen minutes: no 30 s waits at the held dusk, lines that fit an empty jar, one trip for two catches', () => {
  it('the first evening: with the clock held at 6 pm, the next line comes at once (it waited out 30 s with no line, twice)', () => {
    const sim = quiet(16.5);
    sim.teaching = true;
    const s = sim.s;
    s.orderDay = 0;
    for (const id of ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'slots', 'meadow', 'jump', 'run', 'ease', 'farm']) s.learn.push(`lesson:${id}`);
    for (const f of ['bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'slots', 'jump', 'appetite', 'ease', 'orders', 'time']) s.learn.push(f);
    pen(sim, 1);
    fill(sim, 1, 'clover', 3, 0.3);
    s.coins = 420;
    stand(sim, -6.5, 33);
    const tutor = new Tutor();
    const floor = (x: number, z: number) => sim.phys.floor(x, z);
    let heldBare = 0;
    let longest = 0;
    let bare = 0;
    for (let t = 0; t < 300 && !Tutor.finished(s, 'dusk') && !(tutor.current === 'dusk'); t += 1 / 30) {
      sim.update(1 / 30, idle, aimAt(sim, s.player.x, s.player.y + 1.6, s.player.z - 5));
      for (const e of sim.events) tutor.onEvent(s, e);
      sim.events.length = 0;
      const v = tutor.update(s, 1 / 30, touch, floor);
      if (sim.clockHeld && s.hour >= 18 && !v.line) {
        heldBare += 1 / 30;
        bare += 1 / 30;
        longest = Math.max(longest, bare);
      } else bare = 0;
      // The eager player: takes the order, buys the feeder, fills it, a little after each line comes up.
      if (v.id === 'order' && !v.done && s.orders.some((o) => o.state === 'offer')) sim.takeOrder(0);
      if (v.id === 'ups' && !v.done && !s.pads[1].ups.includes('feeder')) {
        sim.choose({ kind: 'pad', id: 1, label: '', x: 0, y: 0, z: 0 }, 'pen:feeder');
        for (const e of sim.events) tutor.onEvent(s, e);
        sim.events.length = 0;
      }
      if (v.id === 'feeder' && !v.done && s.pads[1].feeder.n === 0) {
        s.pads[1].feeder = { t: 'cloverhead', n: 6 };
        tutor.onEvent(s, { t: 'store', x: 0, y: 0, z: 0, where: 'feeder', pad: 1 });
      }
    }
    expect(tutor.current === 'dusk' || Tutor.finished(s, 'dusk'), 'dusk came').toBe(true);
    expect(longest, 'the longest wait at 6 pm with no line (s)').toBeLessThan(2.5);
    expect(heldBare).toBeLessThan(3);
  });

  it('planting with an empty jar: "Pull food from a garden first." with the arrow on a bed with food on it; with food aboard, the bare bed', () => {
    const { sim, s, tutor, go } = dayTwo(9);
    s.learn.splice(s.learn.indexOf('lesson:plant'), 1);
    pen(sim, 1, ['feeder']);
    fill(sim, 1, 'clover', 4);
    s.pads[1].feeder = { t: 'cloverhead', n: 30 };
    s.pads[2].kind = 'garden';
    s.pads[2].crop = null;
    sim.phys.setPads(s.pads);
    s.goals = GOALS.slice(0, GOALS.findIndex((g) => g.id === 'plant')).map((g) => g.id);
    stand(sim, 10, 35);
    go(2);
    expect(tutor.current).toBe('plant');
    expect(line(tutor)).toBe('Pull food from a garden first.');
    expect(Math.hypot(tutor.mark.x - PADS[0].x, tutor.mark.z - PADS[0].z), 'the arrow over the starter garden').toBeLessThan(0.5);
    s.slots[0] = { t: 'cloverhead', n: 3 };
    s.sel = 0;
    go(1);
    expect(line(tutor)).toBe('Blow some food onto the bare soil.');
    expect(Math.hypot(tutor.mark.x - PADS[2].x, tutor.mark.z - PADS[2].z), 'the arrow over the bare bed').toBeLessThan(0.5);
  });

  it('shooing with an empty jar: a pest 5.3 m ahead goes rolling with no note; one 9 m ahead says "Get closer."; with none ahead, "Nothing in the jar."', () => {
    const blow = (dist: number | null): { notes: string[]; hit: boolean } => {
      const sim = quiet(22);
      const s = sim.s;
      stand(sim, 6, 36);
      let aim = aimAt(sim, 6, sim.phys.floor(6, 30) + 0.3, 30);
      if (dist !== null) {
        const z = 36 - dist;
        s.nettles.push({ id: 999, x: 6, y: sim.phys.floor(6, z), z, vx: 0, vy: 0, vz: 0, r: 0.35, grounded: true, yaw: 0, mode: 'roam', modeT: 10, tx: 6, tz: z, bristle: 0, roll: 0, gone: false, snuffT: 9 } as RanchState['nettles'][number]);
        aim = aimAt(sim, 6, s.nettles[0].y + 0.3, z);
      }
      sim.update(1 / 30, { ...idle, puff: true, puffPressed: true }, aim);
      const evs = [...sim.events];
      return { notes: evs.filter((e): e is Extract<Ev, { t: 'deny' }> => e.t === 'deny').map((e) => e.why), hit: evs.some((e) => e.t === 'nettlehit') };
    };
    const near = blow(5.3);
    expect(near.hit, 'shooed at 5.3 m').toBe(true);
    expect(near.notes).toEqual([]);
    expect(blow(9).notes).toEqual(['Get closer.']);
    expect(blow(null).notes).toEqual(['Nothing in the jar.']);
  });

  it('one trip out for two catches: "Catch one more while you are out." after the first; and the loop with three downies kept never sends you out for another', () => {
    const sim = quiet(16.5);
    sim.teaching = true;
    const s = sim.s;
    for (const id of ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'slots', 'jump', 'run', 'ease']) s.learn.push(`lesson:${id}`);
    for (const f of ['bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'slots', 'jump', 'ease']) s.learn.push(f);
    pen(sim, 1);
    fill(sim, 1, 'clover', 1, 0.2);
    stand(sim, -16, -6);
    const tutor = new Tutor();
    const floor = (x: number, z: number) => sim.phys.floor(x, z);
    const tick = (secs: number) => {
      for (let t = 0; t < secs; t += 1 / 30) {
        sim.update(1 / 30, idle, aimAt(sim, s.player.x, s.player.y + 1.6, s.player.z - 5));
        for (const e of sim.events) tutor.onEvent(s, e);
        sim.events.length = 0;
        tutor.update(s, 1 / 30, touch, floor);
      }
    };
    tick(0.5);
    expect(tutor.current).toBe('meadow');
    expect(line(tutor)).toBe('Catch a downy out in Clover Meadow.');
    tutor.add(s, 'catch:wild');
    s.slots[0] = { t: 'clover', n: 1, downs: [{ h: 0.2, c: s.day }] };
    tick(1);
    expect(tutor.current, 'still out: one more').toBe('meadow');
    expect(line(tutor)).toBe('Catch one more while you are out.');
    tutor.add(s, 'catch:wild');
    s.slots[0] = { t: 'clover', n: 2, downs: [{ h: 0.2, c: s.day }, { h: 0.2, c: s.day }] };
    tick(2);
    expect(Tutor.finished(s, 'meadow')).toBe(true);
    // Home with three, all penned and fed, nothing aboard, no fluff: never "Catch another", and one gets hungry.
    s.slots[0] = { t: null, n: 0 };
    fill(sim, 1, 'clover', 2, 0);
    for (const d of s.downies) d.hunger = 0;
    stand(sim, 6, 36);
    const seen: string[] = [];
    for (let k = 0; k < 60; k++) {
      tick(0.5);
      if (line(tutor)) seen.push(line(tutor));
      for (const it of s.items) if (it.type.startsWith('tuft-')) it.gone = true;
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter((l) => /Catch/.test(l))).toEqual([]);
    expect(seen.some((l) => /hungry downy/.test(l)), seen.join(' / ')).toBe(true);
  });
});

// ---------------------------------------------------------------- P2: every garden option on a tag

describe('P2: every option at a post is on a tag (a garden showed six of seven)', () => {
  it('keeping clover, ember and brook, a bare garden with every upgrade known hangs "Plant dewberries", and no post offers more than a post hangs', () => {
    const sim = quiet(10);
    const s = sim.s;
    teachAll(s);
    s.gates.ridge = s.gates.hollow = true;
    sim.phys.gates = { ...s.gates };
    pen(sim, 1, ['feeder']);
    fill(sim, 1, 'clover', 3);
    pen(sim, 4, ['feeder']);
    fill(sim, 4, 'ember', 3);
    pen(sim, 2, []);
    fill(sim, 2, 'brook', 3);
    s.pads[0].kind = 'garden';
    s.pads[0].crop = null;
    s.pads[3].kind = 'garden';
    s.pads[3].crop = 'sweetroot';
    pen(sim, 5, ['feeder', 'high', 'hedge', 'trough', 'chute']);
    const max = ((menuMod as unknown as Record<string, unknown>).TAG_MAX as number | undefined) ?? 6;
    const bare = sim.menu({ kind: 'pad', id: 0, label: '', x: 0, y: 0, z: 0 } as Interactable);
    expect(bare.map((o) => o.id)).toContain('garden:sow:dewberry');
    expect(bare.length, bare.map((o) => o.title).join(', ')).toBeLessThanOrEqual(max);
    for (let i = 0; i < 6; i++) {
      const opts = sim.menu({ kind: 'pad', id: i, label: '', x: 0, y: 0, z: 0 } as Interactable);
      expect(opts.length, `pad ${i}: ${opts.map((o) => o.title).join(', ')}`).toBeLessThanOrEqual(max);
    }
  });
});

// ---------------------------------------------------------------- P2: the rare one and the prized order cut down to size

describe("P2: the rare one's worth is about a trip's, and a small thistle ranch's order is no windfall", () => {
  function starter(day: number): Sim {
    const sim = quiet(6);
    const s = sim.s;
    s.day = day;
    s.night = day;
    s.orderDay = 0;
    pen(sim, 1, ['feeder']);
    fill(sim, 1, 'clover', 8);
    s.learn.push('orders');
    return sim;
  }

  it('thirty mornings on the playtest\'s day 2 ranch (a clover pen of eight): the rare one\'s figure is never more than half again the trip beside it (it was 1,550 against 400)', () => {
    let seen = 0;
    for (let d = 2; d < 32; d++) {
      const sim = starter(d);
      sim.postOrders(true);
      const os = sim.offers();
      const r = os.find((o) => o.rare);
      const trip = os.find((o) => o.live && !o.rare);
      if (!r || !trip) continue;
      const note = sim.offerTag(r).note;
      const m = /then ([\d,]+) /.exec(note);
      if (!m) continue;
      seen++;
      const figure = Number(m[1].replace(/,/g, ''));
      expect(figure, `day ${d}: "${note}" beside a trip of ${trip.n * trip.pay}`).toBeLessThanOrEqual(trip.n * trip.pay * 1.5);
    }
    expect(seen).toBeGreaterThan(5);
  });

  it("a rare one's pen sheds at most five more fluff a day (eight clovers ate eight meals: 24 fluff, now 21)", () => {
    const sim = quiet(9);
    const s = sim.s;
    pen(sim, 1, []);
    const ds = fill(sim, 1, 'clover', 8, 0.95);
    ds[0].rare = true;
    const shed = () => {
      for (const d of ds) d.hunger = 0.95;
      for (const d of ds) {
        const it = newItem(s, 'cloverhead', d.x, sim.phys.floor(d.x, d.z) + 0.1, d.z);
        it.blown = true;
        s.items.push(it);
      }
      const evs: Ev[] = [];
      run(sim, 25, idle, undefined, evs);
      return evs.filter((e): e is Extract<Ev, { t: 'shed' }> => e.t === 'shed').reduce((a, e) => a + e.n, 0);
    };
    const first = shed();
    expect(first, 'eight meals, two fluff each, five more').toBe(16 + 5);
    s.day++;
    s.night = s.day;
    expect(shed(), 'the next day, five more again').toBe(16 + 5);
  });

  it('one or two thistles kept make plain thistle orders, never prized ones; three make prized ones', () => {
    const board = (thistles: number) => {
      const sim = quiet(6);
      const s = sim.s;
      s.gates.ridge = true;
      sim.phys.gates = { ...s.gates };
      pen(sim, 1, ['feeder']);
      fill(sim, 1, 'clover', 8);
      pen(sim, 2, ['feeder', 'high']);
      fill(sim, 2, 'thistle', thistles);
      s.learn.push('orders');
      let prized = 0;
      let thistleOrders = 0;
      let most = 0;
      for (let d = 2; d < 32; d++) {
        s.day = d;
        s.hour = 6;
        sim.postOrders(true);
        for (const o of sim.offers()) {
          if (o.kind !== 'thistle' || o.live) continue;
          thistleOrders++;
          if (o.mult > 2) prized++;
          most = Math.max(most, o.pay / (8 * 3.7 * 2 * sim.price('clover')));
        }
      }
      return { prized, thistleOrders, most };
    };
    for (const n of [1, 2]) {
      const b = board(n);
      expect(b.thistleOrders, `${n} thistles: thistle orders`).toBeGreaterThan(3);
      expect(b.prized, `${n} thistles: prized`).toBe(0);
      // And no windfall: at most about half what the clover pen of eight makes in a day (3.7 meals, two fluff each).
      expect(b.most, `${n} thistles: the most a thistle order paid, against the clover pen's day`).toBeLessThanOrEqual(0.6);
    }
    expect(board(3).prized).toBeGreaterThan(3);
  });
});

// ---------------------------------------------------------------- P2: Pull at a pen takes the kind aimed at

describe('P2: Pull at a mixed pen takes the kind you aim at, and nothing else (two embers took six tries, two clovers, nine fluff and a root)', () => {
  it('aiming at each ember in turn, holding Pull: two embers in two or three tries, no clover, no fluff, no root', () => {
    const sim = quiet(10);
    const s = sim.s;
    pen(sim, 1, []);
    const P = PADS[1];
    fill(sim, 1, 'clover', 4, 0.1);
    const embers = fill(sim, 1, 'ember', 3, 0.1);
    // Fluff and a root lying among them, as a fed pen leaves it.
    for (let k = 0; k < 9; k++) {
      const e = embers[k % 3];
      const a = k * 2.1;
      const it = newItem(s, 'tuft-clover', e.x + Math.cos(a) * 0.9, 0, e.z + Math.sin(a) * 0.9);
      it.y = sim.phys.floor(it.x, it.z) + 0.1;
      it.grounded = true;
      s.items.push(it);
    }
    const root = newItem(s, 'sweetroot', embers[1].x + 0.6, 0, embers[1].z - 0.5);
    root.y = sim.phys.floor(root.x, root.z) + root.r;
    root.rest = true;
    s.items.push(root);
    stand(sim, P.x, P.z + PEN_R + 1.2);
    run(sim, 0.5);
    let tries = 0;
    while (tries < 6 && s.slots.reduce((a, q) => a + (q.t === 'ember' ? q.n : 0), 0) < 2) {
      tries++;
      const target = s.downies.filter((d) => !d.gone && d.kind === 'ember' && d.pen === 1).sort((a, b) => Math.hypot(a.x - s.player.x, a.z - s.player.z) - Math.hypot(b.x - s.player.x, b.z - s.player.z))[0];
      if (!target) break;
      // Turn onto it and settle (a press while turning fast is a sweep), then track it with the crosshair on its body,
      // holding Pull for up to 2.5 s; then let go.
      for (let t = 0; t < 0.4; t += 1 / 30) {
        sim.update(1 / 30, idle, aimAt(sim, target.x, target.y + 0.25, target.z));
        sim.events.length = 0;
      }
      for (let t = 0; t < 2.5 && !target.gone; t += 1 / 30) {
        sim.update(1 / 30, { ...idle, draw: true }, aimAt(sim, target.x, target.y + 0.25, target.z));
        sim.events.length = 0;
      }
      run(sim, 0.4);
    }
    const jar = (k: string) => s.slots.reduce((a, q) => a + (q.t === k ? q.n : 0) + (q.mix ?? []).filter((m) => m === k && q.t !== k).length, 0);
    expect(jar('ember'), `embers after ${tries} tries`).toBe(2);
    expect(tries).toBeLessThanOrEqual(3);
    expect(jar('clover'), 'clovers').toBe(0);
    expect(s.slots.filter((q) => q.t && q.t.startsWith('tuft-')).reduce((a, q) => a + q.n, 0), 'fluff').toBe(0);
    expect(jar('sweetroot'), 'roots').toBe(0);
  });

  it("fluff on the crosshair's line at the ember's feet and behind it does not turn the press into a sweep (a real thumb's took 7 fluff and a root); fluff in front of it, on the crosshair, still does", () => {
    const setup = () => {
      const sim = quiet(10);
      const s = sim.s;
      pen(sim, 1, []);
      const P = PADS[1];
      const ember = fill(sim, 1, 'ember', 1, 0.1)[0];
      ember.x = P.x;
      ember.z = P.z;
      ember.hopT = 99;
      fill(sim, 1, 'clover', 3, 0.1);
      stand(sim, P.x, P.z + PEN_R + 1.2);
      run(sim, 0.5);
      ember.y = sim.phys.floor(ember.x, ember.z);
      const lay = (type: 'tuft-clover' | 'sweetroot', x: number, z: number) => {
        const it = newItem(s, type, x, 0, z);
        it.y = sim.phys.floor(x, z) + 0.1;
        it.grounded = true;
        it.rest = true;
        s.items.push(it);
      };
      return { sim, s, ember, lay, P };
    };
    const a = setup();
    // At its feet just to the side, and behind it on the line, all within the half metre of the line a sweep reaches.
    a.lay('tuft-clover', a.P.x + 0.3, a.P.z - 0.2);
    a.lay('tuft-clover', a.P.x - 0.25, a.P.z - 0.7);
    a.lay('tuft-clover', a.P.x, a.P.z - 1.1);
    a.lay('sweetroot', a.P.x + 0.2, a.P.z - 0.5);
    const aim = () => aimAt(a.sim, a.ember.x, a.ember.y + 0.25, a.ember.z);
    for (let t = 0; t < 0.3; t += 1 / 30) {
      a.sim.update(1 / 30, idle, aim());
      a.sim.events.length = 0;
    }
    for (let t = 0; t < 2.5 && !a.ember.gone; t += 1 / 30) {
      a.sim.update(1 / 30, { ...idle, draw: true }, aim());
      a.sim.events.length = 0;
    }
    const jar = (s: RanchState, k: string) => s.slots.reduce((n, q) => n + (q.t === k ? q.n : 0), 0);
    expect(jar(a.s, 'ember'), 'the ember').toBe(1);
    expect(jar(a.s, 'tuft-clover'), 'fluff').toBe(0);
    expect(jar(a.s, 'sweetroot'), 'root').toBe(0);
    // A piece of fluff nearer you, right on the crosshair's line while it is off the ember's middle: that is what you are on.
    const b = setup();
    const p = b.s.player;
    const off = { x: b.ember.x + 0.12, y: b.ember.y + 0.25, z: b.ember.z };
    const k = 0.7;
    const fx = p.x + (off.x - p.x) * k;
    const fz = p.z + (off.z - p.z) * k;
    const fl = newItem(b.s, 'tuft-clover', fx, p.y + 1.6 + (off.y - p.y - 1.6) * k, fz);
    fl.rest = true;
    b.s.items.push(fl);
    const aimB = () => aimAt(b.sim, off.x, off.y, off.z);
    for (let t = 0; t < 0.3; t += 1 / 30) {
      b.sim.update(1 / 30, idle, aimB());
      b.sim.events.length = 0;
    }
    for (let t = 0; t < 1.5; t += 1 / 30) {
      b.sim.update(1 / 30, { ...idle, draw: true }, aimB());
      b.sim.events.length = 0;
    }
    expect(jar(b.s, 'tuft-clover'), 'the fluff in front').toBe(1);
    expect(jar(b.s, 'ember'), 'not the ember behind it').toBe(0);
  });

  it('a fast sweep of the pen that starts across a downy is still a sweep: it takes the fluff, not the downy (round 3)', () => {
    const sim = quiet(10);
    const s = sim.s;
    pen(sim, 1, []);
    const P = PADS[1];
    const ds = fill(sim, 1, 'clover', 4, 0.1);
    for (const d of ds) d.hopT = 99;
    for (let k = 0; k < 8; k++) {
      const it = newItem(s, 'tuft-clover', P.x - 1.5 + k * 0.4, 0, P.z + 1.2);
      it.y = sim.phys.floor(it.x, it.z) + 0.1;
      it.grounded = true;
      s.items.push(it);
    }
    stand(sim, P.x, P.z + PEN_R + 1.2);
    run(sim, 0.5);
    const d = ds.sort((a, b) => Math.hypot(a.x - s.player.x, a.z - s.player.z) - Math.hypot(b.x - s.player.x, b.z - s.player.z))[0];
    // Swinging across the pen at about 2 rad/s, Pull pressed as the crosshair crosses the downy.
    const p = s.player;
    const base = Math.atan2(d.x - p.x, d.z - p.z);
    const R = Math.hypot(d.x - p.x, d.z - p.z);
    const at = (a: number) => aimAt(sim, p.x + Math.sin(a) * R, d.y + 0.25, p.z + Math.cos(a) * R);
    for (let t = 0; t < 0.3; t += 1 / 30) sim.update(1 / 30, idle, at(base - 0.6 + t * 2));
    for (let t = 0; t < 1.2; t += 1 / 30) sim.update(1 / 30, { ...idle, draw: true }, at(base + (t - 0.0) * 2 * (t < 0.3 ? 1 : 0.2)));
    run(sim, 0.4);
    expect(s.slots.some((q) => q.t === 'clover' && q.n > 0), 'no clover taken').toBe(false);
    expect(s.slots.reduce((a, q) => a + (q.t === 'tuft-clover' ? q.n : 0), 0), 'fluff swept up').toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- P2: later goals

describe('P2: later goals that use what you have built, each one line', () => {
  it('after the prized order: an order after 9 pm, orders three days running, a rare downy of every kind; each eight words or fewer, before the full pens', () => {
    const ids = GOALS.map((g) => g.id as string);
    for (const id of ['late', 'streak', 'rares']) expect(ids, id).toContain(id);
    expect(ids.indexOf('late')).toBeGreaterThan(ids.indexOf('prized'));
    expect(ids.indexOf('rares')).toBeLessThan(ids.indexOf('fullclover'));
    for (const g of GOALS) expect(g.text.split(' ').length, g.text).toBeLessThanOrEqual(8);
  });

  it('filling an order for after 9 pm, and orders on three days running, and keeping a gold clover, rose ember and silver brook each do their goal; the page counts them', () => {
    const sim = quiet(21.5);
    const s = sim.s;
    s.learn.push('orders');
    pen(sim, 1, ['feeder']);
    fill(sim, 1, 'clover', 6);
    stand(sim, -6.5, 33);
    const sell = (n: number, night: boolean) => {
      s.orderDay = s.day;
      s.orders = [{ kind: 'clover', n, got: 0, paid: 0, mult: 2, pay: 50, state: 'offer', by: night ? 24 : 19, ...(night ? { from: 21 } : {}) }];
      sim.takeOrder(0);
      for (let k = 0; k < n; k++) sim.sellFluff('clover');
    };
    for (const day of [3, 4]) {
      s.day = day;
      s.night = day;
      s.hour = day === 3 ? 21.5 : 15;
      sell(2, day === 3);
    }
    expect(s.goals).toContain('late' as GoalId);
    expect(s.goals).not.toContain('streak' as GoalId);
    expect(goalText('streak' as GoalId, s)).toBe('Fill orders three days running, 2 so far.');
    s.day = 5;
    s.night = 5;
    s.hour = 15;
    sell(2, false);
    expect(s.goals).toContain('streak' as GoalId);
    // A rare one of each kind kept, penned.
    pen(sim, 4, ['feeder']);
    pen(sim, 2, ['feeder']);
    const gold = fill(sim, 1, 'clover', 1)[0];
    gold.rare = true;
    expect(goalText('rares' as GoalId, s)).toBe('Keep all three rare downies, 1 so far.');
    fill(sim, 4, 'ember', 1)[0].rare = true;
    fill(sim, 2, 'brook', 1)[0].rare = true;
    run(sim, 1);
    expect(s.goals).toContain('rares' as GoalId);
  });
});

// ---------------------------------------------------------------- P3: the cheap ones

describe('P3: the cheap ones', () => {
  it('"Sell 20 fluff" counts what is sold so far', () => {
    const sim = quiet(10);
    sim.s.stats.sold = 12;
    expect(goalText('sell', sim.s)).toBe('Sell 20 fluff, 12 so far.');
  });

  it('every journal goal line, counts and all, is eight words or fewer, through a day and a ranch growing', () => {
    const sim = quiet(10);
    const s = sim.s;
    s.learn.push('orders');
    const long: string[] = [];
    const lines = () => {
      for (const g of GOALS) {
        const l = goalText(g.id, s);
        if (l.split(' ').length > 8) long.push(l);
      }
    };
    // No pen yet, short of one: "Build a pen, 35 of 200."
    s.coins = 35;
    lines();
    pen(sim, 1, ['feeder']);
    fill(sim, 1, 'clover', 3);
    for (const coins of [0, 35, 480, 1250, 12000]) {
      for (const hour of [6, 12, 18, 22]) {
        s.coins = coins;
        s.earned = coins;
        s.hour = hour;
        s.stats.sold = 7;
        lines();
      }
    }
    // A pen with no feeder, short of one: "Build a feeder, 90 of 150."
    s.pads[1].ups = [];
    s.coins = 90;
    lines();
    expect(goalText('feeder', s)).toBe('Build a feeder, 90 of 150.');
    expect([...new Set(long)]).toEqual([]);
  });

  it('at dusk a clover pen whose feeder holds only sweetroots is called out as having no food for the night', () => {
    const sim = quiet(18.2);
    const s = sim.s;
    pen(sim, 1, ['feeder']);
    fill(sim, 1, 'clover', 4, 0.3);
    s.pads[1].feeder = { t: 'sweetroot', n: 12 };
    const evs: Ev[] = [];
    run(sim, 30, idle, undefined, evs);
    const said = evs.filter((e) => (e.t as string) === 'hungrynight') as unknown as { pen: number; feeder: boolean }[];
    expect(said.length).toBe(1);
    // (Not "A feeder is empty.": it is not.)
    expect(said[0].feeder).toBe(false);
  });

  it('"Order filled. New ones come at dawn." stays an hour, not all day (it held two journal lines until dusk)', () => {
    const sim = quiet(10);
    const s = sim.s;
    s.learn.push('orders');
    pen(sim, 1, ['feeder']);
    fill(sim, 1, 'clover', 6);
    s.orders = [{ kind: 'clover', n: 1, got: 0, paid: 0, mult: 2, pay: 50, state: 'offer', by: 19 }];
    sim.takeOrder(0);
    sim.sellFluff('clover');
    expect(orderLines(s)).toEqual(['Order filled. New ones come at dawn.']);
    s.hour = 10.5;
    expect(orderLines(s)).toEqual(['Order filled. New ones come at dawn.']);
    s.hour = 12;
    expect(orderLines(s)).toEqual([]);
  });

  it("after a catch the downy's window is chosen, so the next Blow sends the downy (one sent a clover head into the pen)", () => {
    const sim = quiet(10);
    const s = sim.s;
    s.slots[0] = { t: 'cloverhead', n: 5 };
    s.sel = 0;
    stand(sim, -16, -4.5);
    const d = sim.spawn('clover', -16, -9, false);
    d.y = sim.phys.floor(d.x, d.z);
    d.hopT = 99;
    teachAll(s);
    // A good thumb: let go as it puffs up, pull again after.
    let letGo = false;
    let releaseAt = -1;
    let pressAt = -1;
    let wasTell = false;
    let wasBack = false;
    for (let t = 0; t < 20 && !d.gone; t += 1 / 60) {
      const tell = d.tell > 0;
      const back = d.back > 0;
      if (tell && !wasTell) releaseAt = t + 0.25;
      if (!back && wasBack) {
        releaseAt = -1;
        if (letGo) pressAt = t + 0.25;
      }
      if (releaseAt >= 0 && t >= releaseAt) {
        letGo = true;
        releaseAt = -1;
      }
      if (pressAt >= 0 && t >= pressAt) {
        letGo = false;
        pressAt = -1;
      }
      wasTell = tell;
      wasBack = back;
      sim.update(1 / 60, { ...idle, draw: !letGo }, aimAt(sim, d.x, d.y + 0.25, d.z));
      sim.events.length = 0;
    }
    expect(d.gone, 'caught').toBe(true);
    expect(s.slots[s.sel].t).toBe('clover');
  });

  it('the rare one\'s tag never says "today" (on day 6 "140 more today" read as paying later today)', () => {
    for (const day of [6, 7, 13]) {
      const sim = quiet(6);
      const s = sim.s;
      s.day = day;
      pen(sim, 1, ['feeder']);
      fill(sim, 1, 'clover', 6);
      s.orders = [{ kind: 'clover', live: true, n: 1, got: 0, paid: 0, mult: 2, pay: 65, state: 'offer', rare: { spot: 0 }, by: 19 }];
      const note = sim.offerTag(s.orders[0]).note;
      expect(note, `day ${day}`).not.toMatch(/today/);
      expect(note).toMatch(/then [\d,]+ /);
    }
  });

  it('every lesson line, the new ones included, is eight words or fewer', () => {
    const lines = (L.allLines as () => { id: string; line: string }[])();
    for (const want of ['Pull food from a garden first.', 'Catch one more while you are out.', 'Build a pen for your embers.']) expect(lines.map((l) => l.line), want).toContain(want);
    for (const l of lines) expect(l.line.split(' ').length, l.line).toBeLessThanOrEqual(8);
    void M;
  });
});
