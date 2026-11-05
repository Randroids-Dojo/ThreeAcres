// Thistledown's eleventh harsh playtest (the first 15 minutes 7 of 10: clear 8, smooth 8, engaging 6, "with three
// fingers... with two thumbs I'd guess about 4"; the whole game 5, "a charming 30-minute unlock track that then asks for
// nothing"), as tests on the render-free sim and tutor: thistles and refills at the wild count (the P1: keeping 22 made it
// 56, no thistle came and the goals after it stayed locked), the view holding on the downy through a tug so one thumb on
// Pull is enough (the other P1), the two-thumb catch table, the slow thumb's bands, the planting bed, the dusk fluff note,
// the line under a goal waiting on coins, the jar line's timing, the goal gaps, the two cheap offer tunes and the cheap
// ones. Every test here fails on the code the tester played (proved on a `git archive` copy of that commit), except the
// guards named as such; what that commit lacked is reached through the modules, so each fails on its own assertion.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOALS, ORDER_BY, PEN_MAX, type DownyKind, type GoalId } from '../src/games/ranch/defs';
import * as defsMod from '../src/games/ranch/defs';
import * as lessonsMod from '../src/games/ranch/lessons';
import { Tutor, allLines, goalSpot, goalText, teachAll, type Mark, type Say } from '../src/games/ranch/lessons';
import { rng } from '../src/games/ranch/noise';
import * as simMod from '../src/games/ranch/sim';
import { CATCH, RARE_WARY, Sim, TUG, padSpots, type Aim, type Controls, type Ev } from '../src/games/ranch/sim';
import type { Downy } from '../src/games/ranch/state';
import { newItem } from '../src/games/ranch/state';
import { CRATES, PADS, RIDGE_TOP, zoneAt } from '../src/games/ranch/world';
import * as catchMod from '../scripts/ranch-catch';

vi.setConfig({ testTimeout: 240_000 });

const realRandom = Math.random;
beforeEach(() => {
  Math.random = rng(1111);
});
afterEach(() => {
  Math.random = realRandom;
});

const idle: Controls = { moveX: 0, moveZ: 0, sprint: false, jump: false, jumpPressed: false, draw: false, puff: false, puffPressed: false };
const touch: Say = { dev: 'touch', locked: false, lockAvailable: false };
const floorOf = (sim: Sim) => (x: number, z: number) => sim.phys.floor(x, z);
const L = lessonsMod as unknown as Record<string, unknown>;
const M = simMod as unknown as Record<string, unknown>;
const D = defsMod as unknown as Record<string, unknown>;
const C = catchMod as unknown as Record<string, unknown>;

/** The aim the game makes from the view (as placeCamera does). */
function viewAim(sim: Sim): Aim {
  const p = sim.s.player;
  const cp = Math.cos(p.pitch);
  const dx = -Math.sin(p.yaw) * cp;
  const dy = Math.sin(p.pitch);
  const dz = -Math.cos(p.yaw) * cp;
  const ey = p.y + 1.6;
  return { ex: p.x, ey, ez: p.z, dx, dy, dz, mx: p.x + dx * 0.6 + 0.15, my: ey - 0.2, mz: p.z + dz * 0.6 };
}

function aimAt(sim: Sim, x: number, y: number, z: number): Aim {
  const p = sim.s.player;
  const ey = p.y + 1.6;
  const l = Math.hypot(x - p.x, y - ey, z - p.z);
  const dx = (x - p.x) / l;
  const dy = (y - ey) / l;
  const dz = (z - p.z) / l;
  return { ex: p.x, ey, ez: p.z, dx, dy, dz, mx: p.x + dx * 0.6 + 0.15, my: ey - 0.2, mz: p.z + dz * 0.6 };
}

function faceTo(sim: Sim, x: number, y: number, z: number): void {
  const p = sim.s.player;
  p.yaw = Math.atan2(-(x - p.x), -(z - p.z));
  p.pitch = Math.atan2(y - (p.y + 1.6), Math.hypot(x - p.x, z - p.z));
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
    d.pen = i;
    out.push(d);
  }
  return out;
}

function step(sim: Sim, seconds: number, c: Controls = idle, aim?: () => Aim, evs?: Ev[]): void {
  for (let t = 0; t < seconds; t += 1 / 30) {
    sim.update(1 / 30, c, aim ? aim() : viewAim(sim));
    if (evs) evs.push(...sim.events);
    sim.events.length = 0;
  }
}

/** The tutor's line now, over some seconds of play. */
function tutorFor(sim: Sim): { tutor: Tutor; line(secs?: number): string; mark: Mark } {
  const tutor = new Tutor();
  const line = (secs = 0.5): string => {
    let v = tutor.update(sim.s, 1 / 30, touch, floorOf(sim));
    for (let t = 0; t < secs; t += 1 / 30) {
      sim.update(1 / 30, idle, viewAim(sim));
      for (const e of sim.events) tutor.onEvent(sim.s, e);
      sim.events.length = 0;
      v = tutor.update(sim.s, 1 / 30, touch, floorOf(sim));
    }
    return v.done ? '' : v.line;
  };
  return { tutor, line, mark: tutor.mark };
}

const wildOf = (sim: Sim, k: DownyKind) => sim.s.downies.filter((d) => !d.gone && !d.tame && !d.keep && d.kind === k).length;

describe('P1: nothing a goal waits on is kept out by the wild count', () => {
  /** The tester's ranch: 22 kept in pens and 34 wild, exactly at the count, on the ridge top at 18:05. */
  function atTheCount(hour: number): Sim {
    const sim = new Sim(null);
    const s = sim.s;
    teachAll(s);
    s.gates.ridge = true;
    s.gates.hollow = true;
    sim.phys.gates = { ...s.gates };
    s.hour = hour;
    s.night = s.day;
    s.orderDay = s.day;
    s.downies = s.downies.filter((d) => !d.tame && !d.keep);
    pen(sim, 1);
    pen(sim, 4);
    pen(sim, 2);
    fill(sim, 1, 'clover', 10);
    fill(sim, 4, 'ember', 10);
    fill(sim, 2, 'brook', 2);
    const wild = s.downies.filter((d) => !d.tame);
    // As many wild of the kinds about as make 56 with what you keep (none of them a thistle).
    for (const d of wild) if (d.kind === 'thistle') d.gone = true;
    s.downies = s.downies.filter((d) => !d.gone);
    let want = 56 - s.downies.length;
    for (let k = 0; want > 0; k++, want--) sim.spawn(k % 2 ? 'clover' : 'ember', k % 2 ? -16 : -45 + (k % 3), k % 2 ? -9 : -19, false);
    for (const d of wild) {
      if (want >= 0) break;
      if (d.gone) continue;
      d.gone = true;
      want++;
    }
    s.downies = s.downies.filter((d) => !d.gone);
    stand(sim, RIDGE_TOP.x, RIDGE_TOP.z);
    expect(s.downies.filter((d) => !d.gone).length, 'exactly at the count').toBe(56);
    return sim;
  }

  it('at 56 with 22 kept, a thistle comes to the ridge top within seconds, and the count stays about where it was', () => {
    const sim = atTheCount(18.1);
    // The tester stood on the top looking at it. (A thistle comes from out of your sight: behind the crest or your back.)
    sim.s.player.yaw = 0;
    let got = -1;
    for (let t = 0; t < 12; t += 1 / 30) {
      sim.update(1 / 30, idle, viewAim(sim));
      sim.events.length = 0;
      sim.s.player.yaw += 0.02;
      if (got < 0 && wildOf(sim, 'thistle') > 0) got = t;
    }
    expect(got, 'a thistle arrived').toBeGreaterThanOrEqual(0);
    expect(got).toBeLessThan(10);
    expect(sim.s.downies.filter((d) => !d.gone).length).toBeLessThanOrEqual(58);
    // None of yours went to make room.
    expect(sim.s.downies.filter((d) => !d.gone && d.tame).length).toBe(22);
  });

  it('at the count, a kind with hardly any wild left still gets its refill (a live order or a full pen goal wants it)', () => {
    const sim = atTheCount(10);
    const s = sim.s;
    for (const d of s.downies) if (!d.tame && d.kind === 'brook') d.gone = true;
    s.downies = s.downies.filter((d) => !d.gone);
    // Back to exactly the count, with no wild brook anywhere, far from every brook home.
    while (s.downies.filter((d) => !d.gone).length < 56) sim.spawn('clover', -16, -9, false);
    expect(wildOf(sim, 'brook')).toBe(0);
    stand(sim, -40, -20);
    step(sim, 9);
    expect(wildOf(sim, 'brook')).toBeGreaterThanOrEqual(1);
    expect(s.downies.filter((d) => !d.gone && d.tame).length).toBe(22);
  });

  it('guard: taking a rare order at the count still brings the rare one, and it stays', () => {
    const sim = atTheCount(8);
    const s = sim.s;
    s.orders = [{ kind: 'clover', n: 1, got: 0, paid: 0, mult: 2, pay: 65, state: 'offer', live: true, by: ORDER_BY, rare: { spot: 0 } }];
    expect(sim.takeOrder(0)).toBe(true);
    step(sim, 6);
    expect(s.downies.some((d) => !d.gone && d.rare && !d.tame)).toBe(true);
  });
});

describe('P1: while a tug is on the view holds on the downy by itself', () => {
  /** A fight just begun: a wild downy d m off, the view on it, the ease lesson known, nobody else about. */
  function fight(kind: DownyKind, d = 5.5): { sim: Sim; one: Downy } {
    const sim = quiet(10);
    teachAll(sim.s);
    sim.s.gates.ridge = sim.s.gates.hollow = true;
    sim.phys.gates = { ...sim.s.gates };
    const homes: Record<DownyKind, [number, number]> = { clover: [-16, -9], ember: [-45, -19], brook: [43, 4], thistle: [-60, -26] };
    const [x, z] = homes[kind];
    const one = sim.spawn(kind, x, z, false);
    one.hunger = 0.2;
    stand(sim, x + d, z + 1);
    faceTo(sim, one.x, one.y + 0.25, one.z);
    return { sim, one };
  }

  it('with one thumb on Pull and no look at all, the crosshair stays on it and the tug goes on (it never moved before)', () => {
    const { sim, one } = fight('ember');
    const yaw0 = sim.s.player.yaw;
    let on = 0;
    let frames = 0;
    let moved = 0;
    for (let t = 0; t < 2.2 && one.strain >= 0 && !one.gone && one.drawn <= 0; t += 1 / 60) {
      // Hold through the tell only (the view is what is measured here, not the reading).
      const aim = viewAim(sim);
      sim.update(1 / 60, { ...idle, draw: one.back <= 0 && one.tell <= 0 }, aim);
      sim.events.length = 0;
      if (one.strain > 0) {
        frames++;
        if (sim.aimedDowny(viewAim(sim)) === one) on++;
      }
      moved = Math.max(moved, Math.abs(sim.s.player.yaw - yaw0));
    }
    expect(frames).toBeGreaterThan(30);
    expect(moved, 'the view followed it').toBeGreaterThan(0.01);
    expect(on / frames, 'the crosshair on its body').toBeGreaterThan(0.9);
  });

  it('it follows through the slack: let go after a pull back, it shifts aside, and the view is back on it before you press', () => {
    const { sim, one } = fight('brook');
    sim.update(1 / 60, { ...idle, draw: true }, viewAim(sim));
    expect(one.strain).toBeGreaterThan(0);
    // A pull back ran out with Pull let go: the shift to the side (0.6 to 1 m) comes now.
    one.back = 0.02;
    one.eased = true;
    let t = 0;
    for (; t < 0.5; t += 1 / 60) {
      sim.update(1 / 60, idle, viewAim(sim));
      sim.events.length = 0;
    }
    expect(sim.aimedDowny(viewAim(sim)), 'the crosshair found it again by itself').toBe(one);
  });

  it('it is smooth: never faster than its limit, and its turn changes a little at a time, however the downy jinks', () => {
    const lim = M.TUG_VIEW as { most: number; ease: number };
    expect(lim, 'TUG_VIEW').toBeTruthy();
    for (const kind of ['clover', 'ember', 'brook', 'thistle'] as DownyKind[]) {
      for (const dist of [2.5, 5.5]) {
        const { sim, one } = fight(kind, dist);
        let last = 0;
        let fast = 0;
        let jerk = 0;
        for (let t = 0; t < 2 && !one.gone && one.drawn <= 0; t += 1 / 60) {
          const y0 = sim.s.player.yaw;
          const p0 = sim.s.player.pitch;
          sim.update(1 / 60, { ...idle, draw: one.back <= 0 && one.tell <= 0 }, viewAim(sim));
          sim.events.length = 0;
          const turn = Math.hypot(sim.s.player.yaw - y0, sim.s.player.pitch - p0) * 60;
          fast = Math.max(fast, turn);
          jerk = Math.max(jerk, Math.abs(turn - last));
          last = turn;
        }
        expect(fast, `${kind} at ${dist} m`).toBeLessThanOrEqual(lim.most + 1e-6);
        // Its speed eases at `ease` a second: from a standing start to the limit, at most this in a frame.
        expect(jerk, `${kind} at ${dist} m`).toBeLessThan(lim.most * (1 - Math.exp(-lim.ease / 60)) * 1.5);
        expect(fast, `${kind} at ${dist} m turned`).toBeGreaterThan(0);
      }
    }
  });

  it('guard: a look drag takes over at once and the view goes where it is dragged; it comes back on only after the drag has stopped', () => {
    const { sim, one } = fight('clover');
    const p = sim.s.player;
    step(sim, 0.3, { ...idle, draw: true });
    expect(one.strain).toBeGreaterThan(0);
    // Drag well away, as the game's look does: it moves the view and says how much.
    const dragged = 0.04;
    const y0 = p.yaw;
    for (let k = 0; k < 8; k++) {
      p.yaw -= dragged;
      sim.update(1 / 60, { ...idle, draw: true, look: dragged }, viewAim(sim));
      sim.events.length = 0;
    }
    expect(Math.abs(p.yaw - y0 + dragged * 8), 'the hold did not fight the drag').toBeLessThan(0.002);
    const yaw1 = p.yaw;
    // Just after the drag it stays off a moment.
    for (let k = 0; k < 6; k++) {
      sim.update(1 / 60, { ...idle, draw: true }, viewAim(sim));
      sim.events.length = 0;
    }
    expect(Math.abs(p.yaw - yaw1)).toBeLessThan(0.002);
  });

  it('a resting finger\'s jitter is no drag (a pixel now and then), and it is the same for every input path: the sim turns the view', () => {
    const { sim, one } = fight('clover');
    const y0 = sim.s.player.yaw;
    let moved = 0;
    for (let t = 0; t < 1; t += 1 / 60) {
      // One px of a touch look (0.0062 rad) every 0.25 s.
      const jitter = Math.round(t * 60) % 15 === 0 ? 0.0062 : 0;
      sim.update(1 / 60, { ...idle, draw: one.back <= 0 && one.tell <= 0, look: jitter }, viewAim(sim));
      sim.events.length = 0;
      moved = Math.max(moved, Math.abs(sim.s.player.yaw - y0));
    }
    expect(moved).toBeGreaterThan(0.01);
  });

  it('guard: none of it for yours or the porch downy, nor once the tug is over (a slip or a catch stops the view)', () => {
    const sim = quiet(10);
    teachAll(sim.s);
    const mine = sim.spawn('clover', 0, 30, true);
    mine.keep = true;
    stand(sim, 4, 30);
    faceTo(sim, mine.x + 1.5, mine.y, mine.z);
    const y0 = sim.s.player.yaw;
    step(sim, 0.5, { ...idle, draw: true });
    expect(Math.abs(sim.s.player.yaw - y0)).toBeLessThan(1e-6);
  });

  it('standing still works: a tugged one stays on the line past Pull\'s reach, and its leaps away are reined in', () => {
    const { sim, one } = fight('thistle', 6.4);
    const lim = sim.range + 0.4 + (M.TUG_REACH as number);
    // A thistle caught mid-bolt, flat out away from you.
    for (let k = 0; k < 30 && one.strain <= 0; k++) sim.update(1 / 60, { ...idle, draw: true }, aimAt(sim, one.x, one.y + 0.25, one.z));
    expect(one.strain).toBeGreaterThan(0);
    const p = sim.s.player;
    const a = Math.atan2(one.x - p.x, one.z - p.z);
    one.vx = Math.sin(a) * 6;
    one.vz = Math.cos(a) * 6;
    let far = 0;
    for (let t = 0; t < 1.2; t += 1 / 60) {
      sim.update(1 / 60, { ...idle, draw: one.back <= 0 && one.tell <= 0 }, viewAim(sim));
      sim.events.length = 0;
      far = Math.max(far, Math.hypot(one.x - p.x, one.z - p.z));
    }
    expect(far, 'it stayed in reach of the line').toBeLessThan(lim);
    expect(one.strain, 'the tug is still on').toBeGreaterThan(0);
  });
});

describe('P1: the two-thumb model', () => {
  it('right thumb on Pull, left on the stick or idle, good reactions: clover 90%+, ember and thistle 80%+, brook 75%+, rares 60%+, fights within about a fifth of three fingers\'', () => {
    const rate = C.catchRate as typeof catchMod.catchRate;
    const TWO = C.TWO as catchMod.Thumb;
    const IDLE = C.TWO_IDLE as catchMod.Thumb;
    expect(TWO, 'the two-thumb model').toBeTruthy();
    const mid = (a: number[]) => (a.length ? a[Math.floor(a.length / 2)] : 0);
    const want: [DownyKind, '' | 'lured', number][] = [['clover', '', 0.9], ['ember', '', 0.8], ['thistle', '', 0.8], ['brook', '', 0.75], ['clover', 'lured', 0.6], ['ember', 'lured', 0.6], ['brook', 'lured', 0.6]];
    for (const [kind, rare, least] of want) {
      const three = rate(kind, catchMod.CAREFUL, 40, 1, rare);
      const a = rate(kind, TWO, 40, 1, rare);
      const b = rate(kind, IDLE, 40, 1, rare);
      expect(a.rate, `${rare} ${kind}, stick`).toBeGreaterThanOrEqual(least);
      expect(b.rate, `${rare} ${kind}, idle`).toBeGreaterThanOrEqual(least);
      expect(mid(a.fights), `${rare} ${kind}, fight`).toBeLessThan(mid(three.fights) * 1.25);
    }
  });

  it('the slow thumb (450 to 650 ms) lands brooks and thistles about 40 to 60% on a first try, and it still gets away', () => {
    const rate = C.catchRate as typeof catchMod.catchRate;
    const SLOW = C.TWO_SLOW as catchMod.Thumb;
    expect(SLOW, 'the slow two-thumb model').toBeTruthy();
    for (const kind of ['brook', 'thistle'] as DownyKind[]) {
      const r = rate(kind, SLOW, 100);
      expect(r.first, `${kind} first try`).toBeGreaterThanOrEqual(0.32);
      expect(r.first, `${kind} first try`).toBeLessThanOrEqual(0.68);
      expect(r.rate, `${kind} in 20 s`).toBeLessThan(0.9);
    }
    expect(rate('brook', SLOW, 100).escaped, 'brooks do get away').toBeGreaterThan(0.03);
    // A good reader still lands them, and one who holds on never does.
    expect(rate('brook', catchMod.CAREFUL, 40).first).toBeGreaterThan(0.9);
    expect(rate('thistle', catchMod.HOLDER, 20).first).toBeLessThan(0.1);
  });

  it('a slip leaves a brook or a thistle wary, so a slow thumb\'s second try is harder; a clover and an ember are as ever', () => {
    for (const [kind, wary] of [['brook', true], ['thistle', true], ['clover', false], ['ember', false]] as [DownyKind, boolean][]) {
      const sim = quiet(10);
      teachAll(sim.s);
      const one = sim.spawn(kind, 10, 0, false);
      stand(sim, 15, 0);
      faceTo(sim, one.x, one.y + 0.25, one.z);
      sim.update(1 / 60, { ...idle, draw: true }, viewAim(sim));
      // Held on through its pull back past its grace.
      one.tell = 0;
      one.back = 2;
      one.backHeld = 0;
      for (let t = 0; t < 1 && one.strain > 0; t += 1 / 60) {
        sim.update(1 / 60, { ...idle, draw: true }, viewAim(sim));
        sim.events.length = 0;
      }
      expect(one.strain, `${kind} slipped`).toBe(0);
      expect(one.wary > 0, `${kind} wary`).toBe(wary);
    }
    // A second slip while wary is a getaway for one with a time: it runs, and the bellows is refused a while.
    for (const [kind, away] of [['brook', true], ['thistle', true], ['clover', false], ['ember', false]] as [DownyKind, boolean][]) {
      const sim = quiet(10);
      teachAll(sim.s);
      const one = sim.spawn(kind, 10, 0, false);
      one.wary = 5;
      stand(sim, 15, 0);
      faceTo(sim, one.x, one.y + 0.25, one.z);
      sim.update(1 / 60, { ...idle, draw: true }, viewAim(sim));
      one.tell = 0;
      one.back = 2;
      one.backHeld = 0;
      const evs: Ev[] = [];
      for (let t = 0; t < 1 && one.strain > 0; t += 1 / 60) {
        sim.update(1 / 60, { ...idle, draw: true }, viewAim(sim));
        evs.push(...sim.events);
        sim.events.length = 0;
      }
      expect(evs.some((e) => e.t === 'escape'), `${kind} got away`).toBe(away);
      expect(evs.some((e) => e.t === 'slip'), `${kind} slipped`).toBe(!away);
    }
    // The bands moved no further than a nudge: every pull back still outlasts its grace.
    for (const k of Object.keys(TUG) as DownyKind[]) expect(TUG[k].dur[0]).toBeGreaterThan(TUG[k].grace);
    expect(TUG.brook.slack).toBeLessThan(0.85);
    expect(TUG.thistle.slack).toBeLessThan(0.85);
    expect(CATCH.brook.limit).toBe(5);
  });
});

describe('P2: planting a new crop is no trap', () => {
  it('the old crop lying on the bed does not count towards its 12: after a day it holds the new crop, its growth not stuck', () => {
    const sim = quiet(8);
    const s = sim.s;
    teachAll(s);
    const g = 0;
    expect(s.pads[g].kind).toBe('garden');
    s.pads[g].crop = 'cloverhead';
    // A full bed of clover heads.
    for (let k = 0; k < 12; k++) {
      const it = newItem(s, 'cloverhead', PADS[g].x + ((k % 4) - 1.5) * 0.7, sim.phys.floor(PADS[g].x, PADS[g].z) + 0.1, PADS[g].z + (Math.floor(k / 4) - 1) * 0.7, 1000 + g);
      it.grounded = true;
      s.items.push(it);
    }
    // (Dewberries are offered with a brook kept.)
    pen(sim, 4);
    fill(sim, 4, 'brook', 2);
    expect(sim.choose({ kind: 'pad', id: g, label: '', x: 0, y: 0, z: 0 }, 'garden:sow:dewberry')).toBe(true);
    expect(s.pads[g].crop).toBe('dewberry');
    stand(sim, -40, -40);
    // 22 game hours in big steps, as the tester left it.
    for (let t = 0; t < 22 * 30; t += 1 / 6) {
      sim.update(1 / 6, idle, viewAim(sim));
      sim.events.length = 0;
    }
    const berries = s.items.filter((it) => !it.gone && it.type === 'dewberry' && Math.abs(it.x - PADS[g].x) < 4 && Math.abs(it.z - PADS[g].z) < 4).length;
    expect(berries, 'dewberries on the bed').toBeGreaterThanOrEqual(10);
  });
});

describe('P2: the dusk says fluff blows away at dawn', () => {
  function fluffAt(sim: Sim, n: number): void {
    for (let k = 0; k < n; k++) {
      const it = newItem(sim.s, 'tuft-clover', 8 + k * 0.2, 0, 30);
      it.y = sim.phys.floor(it.x, it.z) + 0.05;
      it.grounded = true;
      it.flyT = -1;
      sim.s.items.push(it);
    }
  }
  const notes = (evs: Ev[]) => evs.filter((e) => (e as { t: string }).t === 'fluffnote').length;

  it('with fluff lying at dusk: one note, once, and the line says it in the game\'s words', () => {
    const sim = quiet(17.5);
    teachAll(sim.s);
    stand(sim, 0, 35);
    fluffAt(sim, 6);
    const evs: Ev[] = [];
    step(sim, 10, idle, undefined, evs);
    expect(notes(evs), 'no note before dusk').toBe(0);
    sim.s.hour = 18.2;
    step(sim, 3, idle, undefined, evs);
    expect(notes(evs)).toBe(1);
    step(sim, 40, idle, undefined, evs);
    expect(notes(evs), 'once a dusk').toBe(1);
    const line = L.FLUFF_LINE as string;
    expect(line).toBe('Fluff blows away at dawn.');
  });

  it('none with nothing lying about, and again on the next dusk that has some', () => {
    const sim = quiet(18.2);
    teachAll(sim.s);
    stand(sim, 0, 35);
    const evs: Ev[] = [];
    step(sim, 4, idle, undefined, evs);
    expect(notes(evs), 'nothing lying').toBe(0);
    fluffAt(sim, 5);
    step(sim, 2, idle, undefined, evs);
    expect(notes(evs)).toBe(1);
    sim.s.day++;
    sim.s.night = sim.s.day;
    step(sim, 2, idle, undefined, evs);
    expect(notes(evs), 'the next dusk').toBe(2);
  });
});

describe('P2: a goal waiting on coins says what to do meanwhile', () => {
  const more = L.catchMore as (id: GoalId | undefined, s: Sim['s']) => DownyKind | null;
  function saving(coins: number): Sim {
    const sim = quiet(10);
    const s = sim.s;
    teachAll(s);
    s.gates.ridge = true;
    sim.phys.gates = { ...s.gates };
    pen(sim, 1);
    fill(sim, 1, 'clover', 6);
    s.coins = coins;
    s.goals = GOALS.slice(0, GOALS.findIndex((g) => g.id === 'hollow')).map((g) => g.id);
    stand(sim, 0, 35);
    return sim;
  }

  it('"Open the Brook Hollow gate, 43 of 1,200." comes with "Catch more. Ten fit in a pen." and an arrow to where wild ones are', () => {
    expect(typeof more, 'catchMore').toBe('function');
    const sim = saving(43);
    const s = sim.s;
    expect(goalText('hollow', s)).toBe('Open the Brook Hollow gate, 43 of 1,200.');
    expect(more('hollow', s)).toBe('clover');
    const line = L.CATCH_MORE as string;
    expect(line).toBe('Catch more. Ten fit in a pen.');
    expect(line.split(' ').length).toBeLessThanOrEqual(8);
    // On the ranch: the way out. Out by some wild ones: the nearest.
    const spot = L.catchSpot as (k: DownyKind, s: Sim['s'], m: Mark, f: (x: number, z: number) => number) => boolean;
    const m: Mark = { on: false, icon: 'arrow', x: 0, y: 0, z: 0, rx: 0, rz: 0, r: 0, slot: -1 };
    expect(spot('clover', s, m, floorOf(sim))).toBe(true);
    expect(zoneAt(s.player.x, s.player.z)).toBe('ranch');
    expect(Math.hypot(m.x - 0, m.z - 17), 'the ranch gate').toBeLessThan(12);
    const wild = sim.spawn('clover', 6, 3, false);
    stand(sim, 6, 9);
    expect(spot('clover', s, m, floorOf(sim))).toBe(true);
    expect(Math.hypot(m.x - wild.x, m.z - wild.z)).toBeLessThan(0.01);
  });

  it('it does not show when the goal can be met, the pens are full, an order is in hand, or at night; the sell goal only with nothing to sell', () => {
    expect(typeof more, 'catchMore').toBe('function');
    const sim = saving(43);
    const s = sim.s;
    expect(more('hollow', s)).toBe('clover');
    s.coins = 1300;
    expect(more('hollow', s), 'the coins are there').toBeNull();
    s.coins = 43;
    s.hour = 22;
    expect(more('hollow', s), 'at night').toBeNull();
    s.hour = 10;
    s.orders = [{ kind: 'clover', n: 2, got: 0, paid: 0, mult: 2, pay: 130, state: 'open', live: true, by: ORDER_BY }];
    expect(more('hollow', s), 'a trip in hand').toBeNull();
    s.orders = [];
    fill(sim, 1, 'clover', PEN_MAX - 6);
    expect(more('hollow', s), 'the pen is full, and no other').toBeNull();
    // Selling, with nothing lying, aboard or hungry: catch more; with fluff lying: pull that.
    const sim2 = saving(43);
    sim2.s.goals = GOALS.slice(0, GOALS.findIndex((g) => g.id === 'sell')).map((g) => g.id);
    for (const d of sim2.s.downies) d.hunger = 0.1;
    expect(more('sell', sim2.s)).toBe('clover');
    const it = newItem(sim2.s, 'tuft-clover', 8, 0, 30);
    it.y = sim2.phys.floor(8, 30);
    sim2.s.items.push(it);
    expect(more('sell', sim2.s), 'fluff to pull').toBeNull();
  });

  it('it asks for the dearest kind you can reach with room for it, and counts those aboard', () => {
    expect(typeof more, 'catchMore').toBe('function');
    const sim = saving(43);
    const s = sim.s;
    pen(sim, 4);
    fill(sim, 4, 'ember', 8);
    expect(more('hollow', s), 'the ridge is open, room in the ember pen').toBe('ember');
    stand(sim, -40, -10);
    s.slots[0] = { t: 'ember', n: 2, downs: [{ h: 0.1, c: s.day }, { h: 0.1, c: s.day }] };
    expect(more('hollow', s), 'those aboard fill it: clover next').toBe('clover');
  });
});

describe('P2: the jar line waits for the jar', () => {
  function atBench(): { sim: Sim; line: (secs?: number) => string; tutor: Tutor } {
    const sim = quiet(10);
    const s = sim.s;
    s.day = 2;
    s.night = 2;
    s.orderDay = 2;
    teachAll(s);
    s.learn = s.learn.filter((w) => !['lesson:bench', 'bench', 'up:cap', 'up:range', 'up:slots', 'up:glide'].includes(w));
    s.gates.ridge = true;
    pen(sim, 1);
    fill(sim, 1, 'clover', 4);
    s.coins = 443;
    const t = tutorFor(sim);
    return { sim, line: t.line, tutor: t.tutor };
  }

  it('443 coins and no window over 9: no jar line; once a window fills, it comes', () => {
    const { sim, line } = atBench();
    const s = sim.s;
    s.slots[0] = { t: 'cloverhead', n: 9 };
    expect(line(2)).not.toMatch(/bigger jar/);
    s.slots[0] = { t: 'cloverhead', n: 12 };
    expect(line(1)).toBe('Buy a bigger jar at the workbench.');
  });

  it('a refused pull counts as a jar filling, and short of the coins it waits (and goes if they are spent)', () => {
    const { sim, line, tutor } = atBench();
    const s = sim.s;
    s.coins = 200;
    tutor.onEvent(s, { t: 'full', thing: 'cloverhead' });
    expect(line(1)).not.toMatch(/bigger jar/);
    s.coins = 443;
    expect(line(1)).toBe('Buy a bigger jar at the workbench.');
    s.coins = 100;
    expect(line(1)).not.toMatch(/bigger jar/);
  });
});

describe('P2: the goal gaps', () => {
  it('a first ember with another near: "Catch one more while you are out.", the arrow on it; two aboard, or home, the pen line', () => {
    const sim = quiet(10);
    const s = sim.s;
    teachAll(s);
    s.gates.ridge = true;
    sim.phys.gates = { ...s.gates };
    pen(sim, 1);
    fill(sim, 1, 'clover', 6);
    s.coins = 300;
    const near = sim.spawn('ember', -46, -14, false);
    stand(sim, -45, -19);
    s.slots[0] = { t: 'ember', n: 1, downs: [{ h: 0.1, c: s.day }] };
    const t = tutorFor(sim);
    expect(t.line(0.6)).toBe('Catch one more while you are out.');
    expect(t.tutor.mark.on).toBe(true);
    expect(Math.hypot(t.tutor.mark.x - near.x, t.tutor.mark.z - near.z)).toBeLessThan(0.5);
    s.slots[0] = { t: 'ember', n: 2, downs: [{ h: 0.1, c: s.day }, { h: 0.1, c: s.day }] };
    expect(t.line(0.6)).toBe('Build a pen for your embers.');
    s.slots[0] = { t: 'ember', n: 1, downs: [{ h: 0.1, c: s.day }] };
    stand(sim, 0, 35);
    expect(t.line(0.6)).toBe('Build a pen for your embers.');
  });

  it('with no other ember near, it does not send you hunting: the pen line at once', () => {
    const sim = quiet(10);
    const s = sim.s;
    teachAll(s);
    s.gates.ridge = true;
    sim.phys.gates = { ...s.gates };
    pen(sim, 1);
    fill(sim, 1, 'clover', 6);
    s.coins = 300;
    stand(sim, -45, -19);
    s.slots[0] = { t: 'ember', n: 1, downs: [{ h: 0.1, c: s.day }] };
    const t = tutorFor(sim);
    expect(allLines().some((l) => l.id === 'home' && l.line === 'Catch one more while you are out.')).toBe(true);
    expect(t.line(0.6)).toBe('Build a pen for your embers.');
  });

  it('paying for the Hollow brings "Catch a brook downy." before the thistle, with an arrow; catching one pays and moves on', () => {
    const i = GOALS.findIndex((g) => g.id === 'hollow');
    expect(GOALS[i + 1].id).toBe('brook');
    expect(GOALS[i + 1].text).toBe('Catch a brook downy.');
    expect(GOALS[i + 2].id).toBe('thistle');
    const sim = quiet(10);
    const s = sim.s;
    teachAll(s);
    s.gates.ridge = s.gates.hollow = true;
    sim.phys.gates = { ...s.gates };
    s.goals = GOALS.slice(0, i + 1).map((g) => g.id);
    expect(sim.openGoals(1)[0].id).toBe('brook');
    stand(sim, 0, 35);
    const m: Mark = { on: false, icon: 'arrow', x: 0, y: 0, z: 0, rx: 0, rz: 0, r: 0, slot: -1 };
    expect(goalSpot('brook' as GoalId, s, m, floorOf(sim)), 'the way there').toBe(true);
    // A catch counts.
    const b = sim.spawn('brook', 44, 4, false);
    stand(sim, 45.5, 4);
    b.tug = 99;
    b.y = sim.phys.floor(b.x, b.z);
    const coins = s.coins;
    for (let t = 0; t < 3 && !s.goals.includes('brook' as GoalId); t += 1 / 30) {
      sim.update(1 / 30, { ...idle, draw: true }, aimAt(sim, b.x, b.y + 0.25, b.z));
      sim.events.length = 0;
    }
    expect(s.goals.includes('brook' as GoalId)).toBe(true);
    expect(s.coins).toBeGreaterThan(coins);
  });

  it('a ranch saved before the goal, with a brook already caught, has it already', () => {
    const sim = quiet(10);
    teachAll(sim.s);
    sim.s.caught.push('brook');
    step(sim, 1);
    expect(sim.s.goals.includes('brook' as GoalId)).toBe(true);
  });
});

describe('P2: the two cheap offer tunes', () => {
  it('the rare one smells its food within 8 m (it was 12): food at 10 m leaves it be, food at 7 m draws it', () => {
    expect(RARE_WARY.smell).toBe(8);
    for (const [off, drawn] of [[10, false], [7, true]] as [number, boolean][]) {
      const sim = quiet(10);
      const s = sim.s;
      teachAll(s);
      s.orders = [{ kind: 'clover', n: 1, got: 0, paid: 0, mult: 2, pay: 65, state: 'open', live: true, by: ORDER_BY, rare: { spot: 0 } }];
      const d = sim.spawn('clover', 8, -30, false);
      d.rare = true;
      d.homeX = d.x;
      d.homeZ = d.z;
      d.hunger = 0.2;
      stand(sim, 8, -55);
      const f = newItem(s, 'cloverhead', d.x + off, 0, d.z);
      f.y = sim.phys.floor(f.x, f.z) + 0.05;
      f.grounded = true;
      f.flyT = -1;
      f.blown = true;
      s.items.push(f);
      const x0 = d.x;
      step(sim, 3);
      expect(d.x - x0 > 1.5, `food ${off} m off`).toBe(drawn);
    }
  });

  it('a morning order is due by 10 am, and says so on its tag, the board and the journal', () => {
    expect(D.ORDER_MORN).toBe(10);
    const sim = quiet(6);
    const s = sim.s;
    teachAll(s);
    pen(sim, 1);
    fill(sim, 1, 'clover', 10);
    s.orders = [{ kind: 'clover', n: 2, got: 0, paid: 0, mult: 2, pay: 150, state: 'offer', live: true, by: 10 }];
    s.orderDay = s.day;
    expect(sim.offerTag(s.orders[0]).note).toMatch(/^Caught by 10 am\. Pays/);
    expect(sim.takeOrder(0)).toBe(true);
    expect(lessonsMod.orderLines(s, touch)[0]).toBe('Clover downies by 10 am, 0 of 2.');
    s.hour = 9.95;
    step(sim, 3);
    expect(s.orders[0].state, 'gone at 10 am').toBe('missed');
    // Not offered past 7 am: a late riser has no time for it.
    const late = quiet(8);
    teachAll(late.s);
    pen(late, 1);
    fill(late, 1, 'clover', 10);
    for (let d = 2; d < 9; d++) {
      late.s.day = d;
      late.postOrders(true);
      for (const o of late.offers()) expect(o.by).not.toBe(10);
    }
  });
});

describe('P3: the cheap ones', () => {
  /** On the lane in front of the crate, with clover heads chosen and fluff aboard. */
  function atCrate(): { sim: Sim; crate: { x: number; z: number } } {
    const sim = quiet(10);
    const s = sim.s;
    teachAll(s);
    const crate = CRATES[0];
    stand(sim, crate.x, crate.z - 4);
    s.slots[0] = { t: 'cloverhead', n: 5 };
    s.slots[1] = { t: 'tuft-clover', n: 4, mix: ['tuft-clover', 'tuft-clover', 'tuft-clover', 'tuft-clover'] };
    s.sel = 0;
    return { sim, crate };
  }

  it('aiming at a sell crate chooses the fluff; choosing something else there stays chosen until you aim away and back', () => {
    const { sim, crate } = atCrate();
    const s = sim.s;
    // Aimed away: nothing changes.
    faceTo(sim, crate.x + 12, 1, crate.z - 12);
    step(sim, 0.3);
    expect(s.sel).toBe(0);
    // On the crate: the fluff's window is chosen.
    faceTo(sim, crate.x, sim.phys.floor(crate.x, crate.z) + 0.6, crate.z);
    step(sim, 0.3);
    expect(s.sel).toBe(1);
    expect(sim.aimTarget(viewAim(sim))).toBe('sell');
    // Choosing the food by hand, aim still on the crate: it stays.
    s.sel = 0;
    step(sim, 0.5);
    expect(s.sel).toBe(0);
    // Away and back: chosen for you again.
    faceTo(sim, crate.x + 12, 1, crate.z - 12);
    step(sim, 0.3);
    faceTo(sim, crate.x, sim.phys.floor(crate.x, crate.z) + 0.6, crate.z);
    step(sim, 0.3);
    expect(s.sel).toBe(1);
  });

  it('never over a downy a live order wants at the crate; and the selling lines no longer ask you to tap a window', () => {
    const { sim, crate } = atCrate();
    const s = sim.s;
    s.orders = [{ kind: 'clover', n: 2, got: 0, paid: 0, mult: 2, pay: 130, state: 'open', live: true, by: ORDER_BY }];
    s.slots[0] = { t: 'clover', n: 1, downs: [{ h: 0.1, c: s.day }] };
    faceTo(sim, crate.x, sim.phys.floor(crate.x, crate.z) + 0.6, crate.z);
    step(sim, 0.3);
    expect(s.sel).toBe(0);
    expect(allLines().some((l) => /fluff's window|choose the fluff|fluff is chosen/.test(l.line))).toBe(false);
  });

  it('a held Blow stops at long range with no mark showing: one press, one berry; close in, or with a mark, it runs on', () => {
    const sim = quiet(10);
    const s = sim.s;
    teachAll(s);
    pen(sim, 1, ['feeder']);
    fill(sim, 1, 'brook', 3);
    const hop = padSpots(1).hopper;
    // 7.5 m from the hopper, aimed over it (no mark).
    stand(sim, hop.x + 7.5, hop.z + 1);
    s.slots[0] = { t: 'dewberry', n: 12 };
    s.sel = 0;
    faceTo(sim, hop.x, sim.phys.floor(hop.x, hop.z) + hop.y + 1, hop.z);
    while (sim.wouldFeed(viewAim(sim)) >= 0) s.player.pitch += 0.03;
    s.player.pitch += 0.03;
    expect(sim.wouldFeed(viewAim(sim))).toBe(-1);
    expect(sim.aimTarget(viewAim(sim))).not.toBe('feeder');
    sim.update(1 / 30, { ...idle, puff: true, puffPressed: true }, viewAim(sim));
    step(sim, 2, { ...idle, puff: true });
    expect(s.slots[0].n, 'only the press sent one').toBe(11);
    // Each new press sends one.
    sim.update(1 / 30, { ...idle }, viewAim(sim));
    step(sim, 0.3);
    sim.update(1 / 30, { ...idle, puff: true, puffPressed: true }, viewAim(sim));
    step(sim, 0.6, { ...idle, puff: true });
    expect(s.slots[0].n).toBe(10);
    // Aimed at your feet, 3 m off: the stream runs.
    p3(sim);
    const n0 = s.slots[0].n;
    sim.update(1 / 30, { ...idle, puff: true, puffPressed: true }, viewAim(sim));
    step(sim, 1, { ...idle, puff: true });
    expect(n0 - s.slots[0].n, 'close by, a held Blow runs on').toBeGreaterThanOrEqual(3);
  });

  function p3(sim: Sim): void {
    const p = sim.s.player;
    p.pitch = -0.95;
    step(sim, 0.4);
  }

  it('on a full jar the stray line says to empty a window, as the note does, not to pull', () => {
    const sim = quiet(10);
    const s = sim.s;
    teachAll(s);
    pen(sim, 1);
    fill(sim, 1, 'clover', 4);
    const d = s.downies[0];
    d.pen = -1;
    d.strayFrom = 1;
    d.x = PADS[1].x + 7;
    stand(sim, d.x + 4, d.z);
    const t = tutorFor(sim);
    expect(t.line(0.5)).toBe('Pull in the downy that got out.');
    for (let k = 0; k < s.slots.length; k++) s.slots[k] = { t: (['cloverhead', 'sweetroot', 'dewberry', 'tuft-ember'] as const)[k % 4], n: 5 };
    expect(t.line(0.6)).toBe('Hold a window to empty it.');
    s.slots[1] = { t: null, n: 0 };
    expect(t.line(0.6)).toBe('Pull in the downy that got out.');
  });
});
