// Thistledown's eighth harsh playtest ("There is little reason to keep playing
// past day 3 apart from the price of the next gate"; its single biggest fun
// change: make the tug a duel), as tests on the render-free sim, the tutor and
// the bellows' maths: the first wild catch always pulls back, early and clearly,
// its line cutting in over any other and gentle only while that line is up; the
// jar's windows take taps where they sit at rest and choose only on a lift
// without a drag; the tug is a duel (a tell before each pull back, a bolt if you
// leave it slack, rates by kind for a slow and a good thumb); thistles arrive
// out of sight however near you wait; every offer has a condition and none
// repeats yesterday's; a new kind's food is easy to get; a second sell crate in
// the lane; and the cheap ones (the ticked pen line, the full note, a page of
// something done keeping the page a few seconds).
// Every test here fails on the code the tester played (proved on a `git archive`
// copy of that commit); what that commit lacked is reached through the modules,
// so each test fails on its own assertion.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Group, Vector3 } from 'three';
import { HOUR, type DownyKind } from '../src/games/ranch/defs';
import * as lessonsMod from '../src/games/ranch/lessons';
import { Tutor, type Say } from '../src/games/ranch/lessons';
import * as simMod from '../src/games/ranch/sim';
import { Sim, type Aim, type Controls, type Ev } from '../src/games/ranch/sim';
import * as hudMod from '../src/games/ranch/hud';
import * as vmMod from '../src/games/ranch/scene/viewmodel';
import * as worldMod from '../src/games/ranch/world';
import { PADS, RIDGE_TOP } from '../src/games/ranch/world';
import { rng } from '../src/games/ranch/noise';
import type { Downy } from '../src/games/ranch/state';
import * as catchMod from '../scripts/ranch-catch';

// The catch harness and long sims run well over the default 5 s on a loaded machine.
vi.setConfig({ testTimeout: 180_000 });

const realRandom = Math.random;
beforeEach(() => {
  Math.random = rng(83);
});
afterEach(() => {
  Math.random = realRandom;
});

const idle: Controls = { moveX: 0, moveZ: 0, sprint: false, jump: false, jumpPressed: false, draw: false, puff: false, puffPressed: false };
const touch: Say = { dev: 'touch', locked: false, lockAvailable: false };
// New in round 8: reached through the modules so a test fails alone on the played code.
const M = simMod as unknown as Record<string, unknown>;
const L = lessonsMod as unknown as Record<string, unknown>;
const H = hudMod as unknown as Record<string, unknown>;
const W = worldMod as unknown as Record<string, unknown>;
const C = catchMod as unknown as Record<string, unknown>;
type Duel = Downy & { tell?: number; slackT?: number };

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
const ahead = (sim: Sim) => aimAt(sim, sim.s.player.x, sim.s.player.y + 1.6, sim.s.player.z - 5);

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

/** A quiet ranch: no wild comings and goings, nothing lying about, no orders posting meanwhile. */
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

/** A wild downy of a kind 4.5 m off on open ground, and you facing it. */
function wildOne(sim: Sim, kind: DownyKind, rare = false): Duel {
  const at: Record<DownyKind, [number, number]> = { clover: [-16, -9], ember: [-46, -15], brook: [43, 4], thistle: [-60, -26] };
  const [x, z] = at[kind];
  sim.s.gates.ridge = sim.s.gates.hollow = true;
  sim.phys.gates = { ...sim.s.gates };
  stand(sim, x, z + 4.5);
  const d = sim.spawn(kind, x, z, false) as Duel;
  d.y = sim.phys.floor(d.x, d.z);
  d.hunger = 0.2;
  d.hopT = 99;
  if (rare) {
    d.rare = true;
    d.calm = 9;
  }
  return d;
}

/** A taught ranch's tutor, learned up to the meadow (the tug and the meadow not yet), in the meadow at the held afternoon. */
function meadowTutor(withJump: boolean): { sim: Sim; tutor: Tutor; floor: (x: number, z: number) => number } {
  const sim = quiet(16.5);
  sim.teaching = true;
  const s = sim.s;
  for (const id of ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'slots', ...(withJump ? [] : ['jump', 'run'])]) s.learn.push(`lesson:${id}`);
  for (const f of ['bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'slots', ...(withJump ? [] : ['jump'])]) s.learn.push(f);
  return { sim, tutor: new Tutor(), floor: (x: number, z: number) => sim.phys.floor(x, z) };
}

// ---------------------------------------------------------------- P1 1: the first pull back, taught when it matters

describe('P1: the first wild catch pulls back early and clearly; its line cuts in over any other, gentle only while it is up', () => {
  it('every first wild catch puffs up and pulls back before it can come in (twelve seeds; the playtest\'s first wild clover came in with no pull back at all)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      Math.random = rng(seed);
      const { sim, tutor, floor } = meadowTutor(false);
      const d = wildOne(sim, 'clover');
      const order: string[] = [];
      for (let t = 0; t < 10 && !d.gone; t += 1 / 30) {
        // A new player: holds Pull, lets go once it pulls back, pulls again once it stops.
        sim.update(1 / 30, { ...idle, draw: !(d.back > 0) }, aimAt(sim, d.x, d.y + 0.25, d.z));
        for (const e of sim.events) {
          tutor.onEvent(sim.s, e);
          if (['tell', 'pullback', 'suck'].includes(e.t as string)) order.push(e.t as string);
        }
        sim.events.length = 0;
        tutor.update(sim.s, 1 / 30, touch, floor);
      }
      expect(d.gone, `seed ${seed}: caught`).toBe(true);
      // A tell, then the pull back, both before it came in.
      const suck = order.indexOf('suck');
      expect(order.indexOf('tell'), `seed ${seed}: ${order.join(' ')}`).toBeGreaterThanOrEqual(0);
      expect(order.indexOf('pullback'), `seed ${seed}: ${order.join(' ')}`).toBeGreaterThan(order.indexOf('tell'));
      expect(order.indexOf('pullback'), `seed ${seed}: ${order.join(' ')}`).toBeLessThan(suck);
      expect(Tutor.finished(sim.s, 'ease'), `seed ${seed}: the tug line learned`).toBe(true);
    }
  });

  it('the tug line cuts in over an urgent lesson ("Tap Jump to hop over bumps.") the moment it puffs up, is up through every gentle pull back, then hands back', () => {
    const { sim, tutor, floor } = meadowTutor(true);
    const s = sim.s;
    const d = wildOne(sim, 'clover');
    let view = tutor.update(s, 1 / 30, touch, floor);
    expect(tutor.current, 'in the meadow, the jump lesson').toBe('jump');
    let tellAt = -1;
    let gentleFrames = 0;
    let gentleWithLine = 0;
    let after = '';
    for (let t = 0; t < 10; t += 1 / 30) {
      sim.update(1 / 30, { ...idle, draw: !(d.back > 0) && !d.gone }, aimAt(sim, d.x, d.y + 0.25, d.z));
      for (const e of sim.events) tutor.onEvent(s, e);
      sim.events.length = 0;
      view = tutor.update(s, 1 / 30, touch, floor);
      if (tellAt < 0 && (d.tell ?? 0) > 0) tellAt = t;
      if (tellAt >= 0 && t - tellAt < 0.05) expect(tutor.current, 'the moment it puffs up').toBe('ease');
      // Gentle (the line teaching it): a pull back while the tug is not yet learned. The line must be on the page.
      if (d.back > 0 && !s.learn.includes('ease')) {
        gentleFrames++;
        if (view.id === 'ease' && view.line === 'Let go of Pull when it pulls back.') gentleWithLine++;
      }
      if (Tutor.finished(s, 'ease') && !view.done && tutor.current !== 'ease' && !after) after = tutor.current;
    }
    expect(tellAt).toBeGreaterThan(0);
    expect(gentleFrames).toBeGreaterThan(3);
    expect(gentleWithLine, 'every gentle frame has the line up').toBe(gentleFrames);
    expect(Tutor.finished(s, 'ease')).toBe(true);
    // Handed back to the jump lesson it cut in over.
    expect(after).toBe('jump');
  });

  // (A guard, true before round 8 as well: once learned, a pull back is its kind's, with no switch left.)
  it('learned, the rules are its kind\'s: held through, a clover slips in under a second, as it does after the lesson for good', () => {
    const sim = quiet(10);
    sim.teaching = true;
    for (const id of ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'slots', 'jump', 'run', 'ease', 'meadow']) sim.s.learn.push(`lesson:${id}`);
    sim.s.learn.push('ease');
    const d = wildOne(sim, 'clover');
    const evs: Ev[] = [];
    let backAt = -1;
    let slipAt = -1;
    for (let t = 0; t < 8 && slipAt < 0; t += 1 / 30) {
      sim.update(1 / 30, { ...idle, draw: true }, aimAt(sim, d.x, d.y + 0.25, d.z));
      for (const e of sim.events) {
        if (e.t === 'pullback' && backAt < 0) backAt = t;
        if ((e.t as string) === 'slip') slipAt = t;
      }
      evs.push(...sim.events);
      sim.events.length = 0;
    }
    expect(backAt).toBeGreaterThan(0);
    expect(slipAt - backAt).toBeLessThan(1);
    expect(slipAt - backAt).toBeGreaterThan(0.3);
  });
});

// ---------------------------------------------------------------- P1 2: the jar's windows and the walking thumb

describe('P1: the windows\' tap targets hold still where the bellows rests, and a window is chosen only on a lift without a drag', () => {
  it('swaying and bobbing the bellows moves the drawn windows but not their tap targets', () => {
    const V = (vmMod as unknown as { Viewmodel: { prototype: Record<string, unknown> } }).Viewmodel.prototype;
    expect(typeof V.windowsAtRest, 'the tap targets come from the bellows at rest').toBe('function');
    // A stand-in bellows: the rig, its body and the board the windows sit on, under the viewmodel's camera.
    const camera = new PerspectiveCamera(60, 412 / 838, 0.01, 10);
    const rig = new Group();
    const bodyG = new Group();
    const board = new Group();
    rig.add(bodyG);
    bodyG.add(board);
    board.position.set(0, -0.03, 0);
    const fake: Record<string, unknown> = {
      rig,
      camera,
      windows: { parent: board },
      windowSpots: [new Vector3(-0.03, 0.01, 0.17), new Vector3(0.03, 0.01, 0.17), new Vector3(-0.03, -0.02, 0.18), new Vector3(0.03, -0.02, 0.18)],
      baseX: -0.02,
      baseY: -0.255,
      baseZ: -0.6,
      scale: 0.6,
      atRest: V.atRest,
    };
    const at = () => {
      const outs = [0, 1, 2, 3].map(() => new Vector3());
      (V.windowsAtRest as (o: Vector3[]) => void).call(fake, outs);
      return outs.map((o) => [o.x * 412, o.y * 838]);
    };
    const drawn = () => {
      rig.updateMatrixWorld(true);
      return (fake.windowSpots as Vector3[]).map((p) => {
        const v = p.clone().applyMatrix4(board.matrixWorld).project(camera);
        return [((v.x + 1) / 2) * 412, ((1 - v.y) / 2) * 838];
      });
    };
    rig.scale.setScalar(0.6);
    rig.position.set(-0.02, -0.255, -0.6);
    const rest = at();
    const drawnRest = drawn();
    // Turned hard left: the sway's full lean and roll, and a step's bob.
    rig.position.set(-0.02 + 0.05, -0.255 + 0.03 - 0.009, -0.6);
    rig.rotation.set(0.03, 0, -0.075);
    const swayed = at();
    const drawnSwayed = drawn();
    for (let i = 0; i < 4; i++) {
      expect(Math.hypot(swayed[i][0] - rest[i][0], swayed[i][1] - rest[i][1]), `window ${i} target`).toBeLessThan(0.5);
      expect(Math.abs(rest[i][0] - drawnRest[i][0]), `window ${i} at rest is where it is drawn`).toBeLessThan(0.5);
    }
    // (The drawn windows did move, by tens of pixels: the control.)
    expect(Math.max(...drawnSwayed.map((q, i) => Math.hypot(q[0] - drawnRest[i][0], q[1] - drawnRest[i][1])))).toBeGreaterThan(20);
  });

  it('a press that drags 10 px or more is a drag (handed on) and chooses nothing on lift; one that lifts in place is a tap', () => {
    const P = H.Press as (new () => { down(id: number, x: number, y: number): void; move(id: number, x: number, y: number): boolean; up(id: number): boolean }) | undefined;
    expect(P, 'a window chooses only on a lift without a drag').toBeTruthy();
    const p = new P!();
    p.down(7, 150, 720);
    expect(p.move(7, 154, 723)).toBe(false);
    expect(p.move(7, 140, 712)).toBe(true);
    expect(p.move(7, 120, 700)).toBe(false);
    expect(p.up(7), 'lifted after a drag: no window chosen').toBe(false);
    p.down(8, 150, 720);
    expect(p.move(8, 152, 721)).toBe(false);
    expect(p.up(8), 'lifted in place: chosen').toBe(true);
    // Another finger's lift is not this press's.
    p.down(9, 150, 720);
    expect(p.up(3)).toBe(false);
  });
});

// ---------------------------------------------------------------- P2: the tug, a duel

describe('P2: the tug is a duel: a tell before each pull back, a bolt left slack, harder by kind', () => {
  /** A good thumb fighting one downy: lets go at the tell, pulls again once its pull back stops. Records tells and pull backs. */
  function fight(kind: DownyKind, rare: boolean, seed: number) {
    Math.random = rng(seed);
    const sim = quiet(kind === 'thistle' ? 18.6 : 10);
    const d = wildOne(sim, kind, rare);
    const tells: number[] = [];
    const backs: number[] = [];
    let tellAt = -1;
    let release = -1;
    let press = -1;
    let down = true;
    let t = 0;
    for (; t < 14 && !d.gone; t += 1 / 60) {
      sim.update(1 / 60, { ...idle, draw: down }, aimAt(sim, d.x, d.y + 0.25, d.z));
      for (const e of sim.events) {
        if ((e.t as string) === 'tell') {
          tellAt = t;
          release = t + 0.25;
        }
        if (e.t === 'pullback') {
          if (tellAt >= 0) tells.push(t - tellAt);
          backs.push(t);
        }
        if ((e.t as string) === 'eased') press = t + 0.25;
      }
      sim.events.length = 0;
      if (release >= 0 && t >= release) {
        down = false;
        release = -1;
      }
      if (press >= 0 && t >= press) {
        down = true;
        press = -1;
      }
    }
    return { tells, backs, caught: d.gone };
  }

  it('each pull back comes after a tell (it puffs up) as long as its kind\'s, varying from pull to pull; the rare one\'s at uneven times', () => {
    const TUG = M.TUG as Record<DownyKind, { tell: [number, number] }> | undefined;
    expect(TUG?.clover?.tell, 'each kind has a tell').toBeTruthy();
    for (const kind of ['clover', 'ember', 'brook', 'thistle'] as DownyKind[]) {
      const tells: number[] = [];
      for (let k = 0; k < 6; k++) tells.push(...fight(kind, false, 11 + k).tells);
      expect(tells.length, `${kind} pulled back`).toBeGreaterThan(3);
      for (const v of tells) {
        expect(v, `${kind} tell`).toBeGreaterThanOrEqual(TUG![kind].tell[0] - 0.02);
        expect(v, `${kind} tell`).toBeLessThanOrEqual(TUG![kind].tell[1] + 0.02);
      }
      expect(Math.max(...tells) - Math.min(...tells), `${kind}: tells vary`).toBeGreaterThan(0.06);
    }
    // Clovers give the most time to let go (tell and grace), and the rare one pulls back at uneven times, not like a metronome.
    const T = TUG as unknown as Record<DownyKind, { tell: [number, number]; grace: number }>;
    expect(T.clover.tell[0] + T.clover.grace).toBeGreaterThan(T.ember.tell[1] + T.ember.grace);
    const gaps: number[] = [];
    for (let k = 0; k < 6; k++) {
      const b = fight('ember', true, 31 + k).backs;
      for (let i = 1; i < b.length; i++) gaps.push(b[i] - b[i - 1]);
    }
    expect(gaps.length).toBeGreaterThan(5);
    expect(Math.max(...gaps) - Math.min(...gaps), 'the rare one pulls back at uneven times').toBeGreaterThan(0.6);
  });

  it('left slack after a pull back longer than its kind allows, it bolts and says so; pulled again in time, it holds', () => {
    const TUG = M.TUG as Record<DownyKind, { slack: number }> | undefined;
    expect(typeof TUG?.ember?.slack, 'each kind has its slack').toBe('number');
    for (const late of [false, true]) {
      const sim = quiet(10);
      const d = wildOne(sim, 'ember');
      const evs: Ev[] = [];
      let down = true;
      let endAt = -1;
      for (let t = 0; t < 8 && !d.gone; t += 1 / 60) {
        sim.update(1 / 60, { ...idle, draw: down }, aimAt(sim, d.x, d.y + 0.25, d.z));
        for (const e of sim.events) {
          if ((e.t as string) === 'tell') down = false;
          if ((e.t as string) === 'eased' && endAt < 0) endAt = t;
        }
        evs.push(...sim.events);
        sim.events.length = 0;
        if (endAt >= 0 && !down && t - endAt >= (late ? TUG!.ember.slack + 0.15 : TUG!.ember.slack - 0.3)) down = true;
        if (evs.some((e) => e.t === 'escape')) break;
      }
      const esc = evs.find((e) => e.t === 'escape') as (Ev & { slack?: boolean }) | undefined;
      if (late) {
        expect(esc, 'left slack too long: it bolts').toBeTruthy();
        expect(esc!.slack).toBe(true);
      } else expect(esc, 'pulled again in time: no getaway').toBeUndefined();
    }
  });

  it('a slow thumb (450 to 650 ms) lands clovers 85%+, embers 55 to 75%, brooks and thistles 40 to 60%, rares 25 to 45%; a good one (200 to 350 ms) 85%+, rares 70%+; holding on, none', () => {
    const rate = C.catchRate as (k: DownyKind, t: unknown, n: number, seed?: number, rare?: string) => { first: number };
    const CARELESS = C.CARELESS as { react?: [number, number] };
    const CAREFUL = C.CAREFUL as { react?: [number, number] };
    expect(CARELESS.react, 'the slow thumb reads the tell in 450 to 650 ms').toEqual([0.45, 0.65]);
    expect(CAREFUL.react, 'the good thumb in 200 to 350 ms').toEqual([0.2, 0.35]);
    const N = 120;
    const bands: Record<string, [number, number]> = { clover: [0.85, 1], ember: [0.55, 0.75], brook: [0.4, 0.6], thistle: [0.4, 0.6] };
    for (const k of ['clover', 'ember', 'brook', 'thistle'] as DownyKind[]) {
      const a = rate(k, CARELESS, N).first;
      expect(a, `${k} slow`).toBeGreaterThanOrEqual(bands[k][0]);
      expect(a, `${k} slow`).toBeLessThanOrEqual(bands[k][1]);
      expect(rate(k, CAREFUL, N).first, `${k} good`).toBeGreaterThanOrEqual(0.85);
      expect(rate(k, C.HOLDER, 30).first, `${k} holding on`).toBeLessThanOrEqual(0.1);
    }
    for (const k of ['clover', 'ember', 'brook'] as DownyKind[]) {
      const a = rate(k, CARELESS, N, 1, 'lured').first;
      expect(a, `rare ${k} slow`).toBeGreaterThanOrEqual(0.25);
      expect(a, `rare ${k} slow`).toBeLessThanOrEqual(0.45);
      expect(rate(k, CAREFUL, N, 1, 'lured').first, `rare ${k} good`).toBeGreaterThanOrEqual(0.7);
    }
  });
});

// ---------------------------------------------------------------- P2: thistles while you wait

describe('P2: thistles come over the crest out of sight, however near you wait', () => {
  it('waiting 16.6 m from the ridge top from 17:24 to 18:20, facing it, brings thistles, each arriving where you cannot see it', () => {
    const outOfSight = M.outOfSight as unknown;
    expect(typeof (Sim.prototype as unknown as Record<string, unknown>).outOfSight, 'arrivals are out of sight').toBe('function');
    void outOfSight;
    for (const ang of [0, 1.5, 4.5]) {
      const sim = new Sim(null);
      const s = sim.s;
      s.gates.ridge = true;
      sim.phys.gates = { ...s.gates };
      s.downies = s.downies.filter((d) => d.kind !== 'thistle');
      s.hour = 17.4;
      s.night = s.day;
      s.orderDay = s.day;
      stand(sim, RIDGE_TOP.x + Math.cos(ang) * 16.6, RIDGE_TOP.z + Math.sin(ang) * 16.6);
      const p = s.player;
      p.yaw = Math.atan2(-(RIDGE_TOP.x - p.x), -(RIDGE_TOP.z - p.z));
      const seen = new Set<number>();
      let arrived = 0;
      let unseen = 0;
      for (let t = 0; s.hour < 18 + 20 / 60; t += 1 / 30) {
        sim.update(1 / 30, idle, aimAt(sim, RIDGE_TOP.x, sim.phys.floor(RIDGE_TOP.x, RIDGE_TOP.z) + 0.5, RIDGE_TOP.z));
        sim.events.length = 0;
        for (const d of s.downies) {
          if (d.gone || d.kind !== 'thistle' || seen.has(d.id)) continue;
          seen.add(d.id);
          arrived++;
          if ((sim as unknown as { outOfSight(x: number, z: number): boolean }).outOfSight(d.x, d.z)) unseen++;
        }
      }
      expect(arrived, `from ${ang} rad: thistles came`).toBeGreaterThanOrEqual(1);
      expect(unseen, 'each came out of sight').toBe(arrived);
    }
  });
});

// ---------------------------------------------------------------- P2: offers with a condition

describe('P2: every offer has a condition (noon, dusk, after dark, a set place), none repeats yesterday\'s, three to choose from', () => {
  function ranch(kinds: DownyKind[], gates: boolean): Sim {
    const sim = quiet(6);
    const s = sim.s;
    s.gates.ridge = s.gates.hollow = gates;
    sim.phys.gates = { ...s.gates };
    kinds.forEach((k, i) => {
      pen(sim, [1, 4, 2, 5][i]);
      fill(sim, [1, 4, 2, 5][i], k, 6);
    });
    s.learn.push('orders');
    return sim;
  }

  it('thirty mornings for a clover ranch and a three-kind one: three offers each morning, none the same sort, kind and deadline as one of yesterday\'s', () => {
    const key = M.orderKey as ((o: unknown) => string) | undefined;
    expect(key, 'offers are told apart by sort, kind and deadline').toBeTruthy();
    for (const [kinds, gates] of [
      [['clover'], false],
      [['clover', 'ember', 'brook'], true],
    ] as [DownyKind[], boolean][]) {
      const sim = ranch(kinds, gates);
      const s = sim.s;
      let prev = new Set<string>();
      const deadlines = new Set<string>();
      for (let d = 2; d < 32; d++) {
        s.day = d;
        s.hour = 6;
        // From the twelfth morning every pen holds a rare one already: no hunt to offer.
        if (d === 12) for (const q of s.downies) if (!q.gone && q.pen >= 0) q.rare = true;
        sim.postOrders(true);
        const os = sim.offers();
        expect(os.length, `${kinds.join('+')} day ${d}: three offers`).toBe(3);
        for (const o of os) {
          expect(prev.has(key!(o)), `${kinds.join('+')} day ${d}: ${key!(o)} was offered yesterday`).toBe(false);
          deadlines.add(o.from !== undefined ? 'after dark' : o.by === 12 ? 'noon' : 'dusk');
          // Its tag says its condition.
          const tag = sim.offerTag(o);
          expect(`${tag.title} ${tag.note}`).toMatch(/by noon|by dusk|By noon|By dusk|Sell after 9 pm/);
          if (o.rare) expect(tag.note).toMatch(/^By the /);
        }
        prev = new Set(os.map((o) => key!(o)));
      }
      expect([...deadlines].sort()).toEqual(['after dark', 'dusk', 'noon']);
    }
  });

  it('the rare one pays little today (a downy of its kind by dusk, one and a half by noon, half the trip at most): its worth is the lasting one', () => {
    for (let d = 2; d < 12; d++) {
      const sim = ranch(['clover', 'ember'], true);
      sim.s.day = d;
      sim.postOrders(true);
      const r = sim.offers().find((o) => o.rare);
      const trip = sim.offers().find((o) => o.live && !o.rare);
      if (!r) continue;
      const each = { clover: 66, ember: 110, brook: 140, thistle: 300 }[r.kind];
      const cap = trip ? Math.round(trip.n * trip.pay / 2 / 5) * 5 : 1e9;
      expect(r.pay).toBe(Math.min(Math.round((each * (r.by === 12 ? 1.5 : 1)) / 5) * 5, cap));
      if (trip) expect(r.pay).toBeLessThanOrEqual(trip.n * trip.pay / 2);
    }
  });

  it('an order for after dark counts its fluff from 9 pm only, and says why before then; a noon order goes at noon', () => {
    const sim = ranch(['clover'], false);
    const s = sim.s;
    s.orders = [{ kind: 'clover', n: 4, got: 0, paid: 0, mult: 2, pay: 96, state: 'offer', by: 24, from: 21 } as never];
    s.orderDay = s.day;
    expect(sim.takeOrder(0)).toBe(true);
    s.hour = 15;
    sim.sellFluff('clover', true);
    expect(s.orders[0].got, 'not before dark').toBe(0);
    // (Round 9: "after 9 pm": "after dark" read as when to catch them.)
    expect(sim.events.some((e) => e.t === 'deny' && /after 9 pm/.test((e as { why: string }).why))).toBe(true);
    s.hour = 21.2;
    for (let k = 0; k < 4; k++) sim.sellFluff('clover', true);
    expect(s.orders[0].state).toBe('filled');
    // A noon one: taken at 7, missed at noon.
    const sim2 = ranch(['clover'], false);
    sim2.s.orders = [{ kind: 'clover', n: 30, got: 0, paid: 0, mult: 2, pay: 720, state: 'offer', by: 12 } as never];
    sim2.s.orderDay = sim2.s.day;
    sim2.s.hour = 7;
    expect(sim2.takeOrder(0)).toBe(true);
    sim2.s.hour = 11.98;
    for (let t = 0; t < 2; t += 1 / 20) sim2.update(1 / 20, idle, ahead(sim2));
    expect(sim2.s.orders[0].state).toBe('missed');
  });
});

// ---------------------------------------------------------------- P2: a new kind's food, and the lane crate

describe('P2: a new kind\'s food is easy to get the day you bring it home', () => {
  it('the first ember penned comes with a sack of sweetroots in its feeder (once; a pen with none gets one)', () => {
    for (const feeder of [false, true]) {
      const sim = quiet(10);
      const s = sim.s;
      pen(sim, 4, feeder ? ['feeder'] : []);
      const evs: Ev[] = [];
      for (let k = 0; k < 2; k++) {
        const d = sim.spawn('ember', PADS[4].x, PADS[4].z - 7, true);
        d.pen = -1;
        d.x = PADS[4].x + k;
        d.z = PADS[4].z;
        d.y = sim.phys.floor(d.x, d.z) + 0.4;
        d.grounded = false;
        for (let t = 0; t < 1; t += 1 / 30) {
          sim.update(1 / 30, idle, ahead(sim));
          evs.push(...sim.events);
          sim.events.length = 0;
        }
      }
      const roots = s.items.filter((i) => !i.gone && i.type === 'sweetroot' && sim.phys.penAt(i.x, i.z) === 4).length;
      const stocked = evs.filter((e) => (e.t as string) === 'stock');
      expect(stocked.length, 'once').toBe(1);
      // (Round 9: a pen with no feeder gets one, the sack in it: lying by the gate, a pull at the fluff took 9 of 12.)
      expect(s.pads[4].feeder).toEqual({ t: 'sweetroot', n: 12 });
      expect(s.pads[4].ups).toContain('feeder');
      expect(roots).toBe(0);
    }
  });

  it('once you keep embers a garden post offers to sow sweetroot, and choosing it plants it', () => {
    const sim = quiet(10);
    const s = sim.s;
    s.learn.push('lesson:plant');
    s.pads[0].kind = 'garden';
    s.pads[0].crop = 'cloverhead';
    pen(sim, 1);
    fill(sim, 1, 'clover', 3);
    const it = { kind: 'pad' as const, id: 0, label: '', x: 0, y: 0, z: 0 };
    expect(sim.menu(it).some((o) => o.id === 'garden:sow:sweetroot')).toBe(false);
    pen(sim, 4);
    fill(sim, 4, 'ember', 2);
    const sow = sim.menu(it).find((o) => o.id === 'garden:sow:sweetroot');
    expect(sow, 'a tag to sow sweetroot').toBeTruthy();
    expect(sow!.title).toBe('Plant sweetroots');
    expect(sim.choose(it, 'garden:sow:sweetroot')).toBe(true);
    expect(s.pads[0].crop).toBe('sweetroot');
  });
});

describe('P2: a second sell crate in the lane between the pens', () => {
  it('it stands in the lane within 8 m of the middle and east pens\' posts, and fluff blown at it sells from the north row and the south', () => {
    const CR = W.CRATES as { x: number; z: number }[] | undefined;
    expect(CR?.length, 'two crates').toBe(2);
    const lane = CR![1];
    for (const i of [1, 2, 4, 5]) expect(Math.hypot(PADS[i].px - lane.x, PADS[i].pz - lane.z), `post ${i}`).toBeLessThan(8.5);
    // In the lane: clear of both rows' fences.
    for (const p of PADS) expect(Math.abs(p.z - lane.z), 'clear of the pens').toBeGreaterThan(4.4 + 1.5);
    for (const from of [-4, 4]) {
      const sim = quiet(10);
      const s = sim.s;
      stand(sim, lane.x, lane.z + from);
      s.slots[0] = { t: 'tuft-clover', n: 1 };
      s.sel = 0;
      const aim = aimAt(sim, lane.x, sim.phys.floor(lane.x, lane.z) + 0.75, lane.z);
      sim.puff(aim);
      for (let t = 0; t < 4 && s.stats.sold === 0; t += 1 / 60) sim.update(1 / 60, idle, aim);
      expect(s.stats.sold, `blown from ${from > 0 ? 'the south' : 'the north'}`).toBe(1);
    }
  });
});

// ---------------------------------------------------------------- P3: the cheap ones

describe('P3: the cheap fixes', () => {
  it('blown into the pen, the ticked line is the step done: "Blow the downy into the pen."', () => {
    const sim = quiet(16.5);
    sim.teaching = true;
    const s = sim.s;
    for (const id of ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'slots']) s.learn.push(`lesson:${id}`);
    for (const f of ['bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'slots']) s.learn.push(f);
    pen(sim, 1);
    const tutor = new Tutor();
    const floor = (x: number, z: number) => sim.phys.floor(x, z);
    stand(sim, PADS[1].x, PADS[1].z + 7);
    sim.stow('clover', 0, { h: 0.3, c: 0 });
    s.sel = s.slots.findIndex((q) => q.t === 'clover');
    let v = tutor.update(s, 1 / 30, touch, floor);
    for (let t = 0; t < 1; t += 1 / 30) v = tutor.update(s, 1 / 30, touch, floor);
    expect(v.id).toBe('penin');
    expect(v.line).toBe('Blow the downy into the pen.');
    const aim = aimAt(sim, PADS[1].x, sim.phys.floor(PADS[1].x, PADS[1].z), PADS[1].z);
    sim.update(1 / 30, { ...idle, puff: true, puffPressed: true }, aim);
    const lines = new Set<string>();
    for (let t = 0; t < 4 && !v.done; t += 1 / 30) {
      sim.update(1 / 30, idle, aim);
      for (const e of sim.events) tutor.onEvent(s, e);
      sim.events.length = 0;
      v = tutor.update(s, 1 / 30, touch, floor);
      lines.add(v.line);
    }
    expect(v.done, 'penned').toBe(true);
    expect(v.line).toBe('Blow the downy into the pen.');
    expect([...lines]).not.toContain('Pull in the downy.');
  });

  it('with its own window full and others empty, the note names the window and says to blow some out', () => {
    const note = (L.fullNote as (d: string, none: boolean, known: boolean, what?: string) => string)('touch', false, true, 'clover head');
    expect(note).toBe('Clover head window full. Blow some out.');
    expect(note.split(' ').length).toBeLessThanOrEqual(8);
  });

  it('a page of something just done keeps the page a few seconds: dusk waits for it', () => {
    const sim = quiet(18.4);
    sim.teaching = true;
    const s = sim.s;
    for (const id of ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'slots', 'meadow', 'jump', 'run', 'ease', 'farm', 'order', 'ups', 'feeder']) s.learn.push(`lesson:${id}`);
    for (const f of ['bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'slots', 'jump', 'appetite', 'ease', 'orders', 'time', 'evening']) s.learn.push(f);
    const tutor = new Tutor();
    const floor = (x: number, z: number) => sim.phys.floor(x, z);
    (tutor as unknown as { hold: number }).hold = 3.4;
    for (let t = 0; t < 3; t += 1 / 30) tutor.update(s, 1 / 30, touch, floor);
    expect(tutor.current, 'still the page of what was done').toBe('');
    for (let t = 0; t < 1; t += 1 / 30) tutor.update(s, 1 / 30, touch, floor);
    expect(tutor.current).toBe('dusk');
  });
});

void HOUR;
