// Thistledown's fifth harsh playtest ("Catching is the only verb with skill in
// it. Orders pay for different chores, and by day 4 the loop is the same
// commute."), as tests on the render-free sim and tutor: a pull at a pen's
// fluff never takes a penned downy, and the far side's fluff comes within
// reach; clover is the gentle first catch, running is taught and a brook's
// time shows; the morning board's rare downy; live orders that want a downy
// caught today; the edge chevron the short way round; the clock held through
// the loop lesson; a downy's hunger kept through the jar; and the cheap fixes.
// Every test here fails on the code the tester played (proved on a `git
// archive` copy of that commit); modules that commit lacked are imported
// inside the tests that need them, so each fails on its own.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { HOUR, LIVE_EACH, type DownyKind } from '../src/games/ranch/defs';
import { LESSON_IDS, Tutor, allLines, goalText, orderLines, type Say } from '../src/games/ranch/lessons';
import { CATCH, Sim, padSpots, type Aim, type Controls, type Ev } from '../src/games/ranch/sim';
import { deserialize, newItem, serialize } from '../src/games/ranch/state';
import { EXCHANGE, PADS, PEN_R, POND, waterAt, zoneAt } from '../src/games/ranch/world';
import * as world from '../src/games/ranch/world';
import { rng } from '../src/games/ranch/noise';

// Long sims (game days, ten real minutes) run well over the default 5 s on a loaded machine.
vi.setConfig({ testTimeout: 60_000 });

const realRandom = Math.random;
beforeEach(() => {
  Math.random = rng(53);
});
afterEach(() => {
  Math.random = realRandom;
});

const idle: Controls = { moveX: 0, moveZ: 0, sprint: false, jump: false, jumpPressed: false, draw: false, puff: false, puffPressed: false };
const touch: Say = { dev: 'touch', locked: false, lockAvailable: false };

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

function fill(sim: Sim, i: number, kind: DownyKind, n: number, hunger = 0.2): void {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    sim.spawn(kind, PADS[i].x + Math.cos(a) * 2, PADS[i].z + Math.sin(a) * 2, true).hunger = hunger;
  }
}

function run(sim: Sim, seconds: number, c: Controls = idle, aim?: Aim, evs?: Ev[]): void {
  for (let t = 0; t < seconds; t += 1 / 30) {
    sim.update(1 / 30, c, aim ?? ahead(sim));
    if (evs) evs.push(...sim.events);
    sim.events.length = 0;
  }
}

/** A teaching ranch and its tutor; go() advances both, the sim's events fed to the tutor. */
function ranch(learned: string[] = [], features: string[] = []) {
  const sim = new Sim(null);
  sim.teaching = true;
  sim.wild = false;
  const s = sim.s;
  for (const id of learned) s.learn.push(`lesson:${id}`);
  for (const f of features) s.learn.push(f);
  const tutor = new Tutor();
  const floor = (x: number, z: number) => sim.phys.floor(x, z);
  let view = tutor.update(s, 0, touch, floor);
  const go = (seconds: number, c: Controls = idle, aim?: () => Aim) => {
    for (let t = 0; t < seconds; t += 1 / 30) {
      sim.update(1 / 30, c, aim ? aim() : ahead(sim));
      for (const e of sim.events) tutor.onEvent(s, e);
      sim.events.length = 0;
      view = tutor.update(s, 1 / 30, touch, floor);
    }
    return view;
  };
  return { sim, s, tutor, go, view: () => view };
}

const TO_MEADOW = ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'slots'];
const TO_MEADOW_F = ['bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'slots'];

/** A taught ranch at the morning: a clover pen of six (and others), both gates open if asked. */
function morning(day: number, gates = true): Sim {
  const sim = quiet(6);
  const s = sim.s;
  s.day = day;
  s.night = day;
  s.orderDay = 0;
  s.gates.ridge = gates;
  s.gates.hollow = gates;
  sim.phys.gates = { ...s.gates };
  pen(sim, 1);
  fill(sim, 1, 'clover', 6);
  if (gates) {
    pen(sim, 2);
    fill(sim, 2, 'ember', 6);
  }
  return sim;
}

/** Pull a wild downy in for real: stand off it and keep the crosshair on it each frame until it is in the jar. */
function catchIt(sim: Sim, id: number, from = 3): boolean {
  const s = sim.s;
  for (let t = 0; t < 12; t += 1 / 30) {
    const d = s.downies.find((q) => q.id === id);
    if (!d || d.gone) return s.slots.some((q) => q.t !== null && q.n > 0 && (q.downs ?? []).some((r) => r.c === s.day));
    // Keep about `from` metres off it, walking (never running).
    const p = s.player;
    const dist = Math.hypot(d.x - p.x, d.z - p.z);
    if (dist > from + 0.5) stand(sim, d.x + ((p.x - d.x) / dist) * from, d.z + ((p.z - d.z) / dist) * from);
    // (Round 7: letting go of Pull while it pulls back.)
    sim.update(1 / 30, { ...idle, draw: d.back <= 0 }, aimAt(sim, d.x, d.y + 0.25, d.z));
    sim.events.length = 0;
  }
  return false;
}

/** Blow the chosen window's next thing at the sell crate from the lane, and let it fly. */
function blowAtCrate(sim: Sim, evs: Ev[]): void {
  stand(sim, EXCHANGE.x, EXCHANGE.z - 4.2);
  const aim = aimAt(sim, EXCHANGE.x, sim.phys.floor(EXCHANGE.x, EXCHANGE.z) + 0.9, EXCHANGE.z);
  sim.update(1 / 30, { ...idle, puff: true, puffPressed: true }, aim);
  run(sim, 2.5, idle, aim, evs);
}

// ---------------------------------------------------------------- P1 1: pulls in your own pen

describe('P1: pulling fluff in your own pen never takes your downies', () => {
  /** The playtest's repro: standing at the fence, aimed at fluff on the pen's far side, past Pull's reach, a penned downy in front. */
  function farSide() {
    const sim = quiet(10);
    pen(sim, 1);
    const at = PADS[1];
    stand(sim, at.x, at.z + PEN_R + 1.2);
    const d = sim.spawn('clover', at.x, at.z + 1, true);
    d.hunger = 0.2;
    const tuft = sim.drop('tuft-clover', at.x, at.z - 3.5);
    tuft.y = sim.phys.floor(tuft.x, tuft.z) + 0.12;
    tuft.grounded = true;
    tuft.by = d.id;
    return { sim, d, tuft };
  }

  it('aimed at out-of-reach fluff behind a penned downy, held still, the downy is never taken (2 of 6 in the playtest)', () => {
    const { sim, d, tuft } = farSide();
    const aim = aimAt(sim, tuft.x, tuft.y, tuft.z);
    const p = sim.s.player;
    // The fluff is past Pull's reach.
    expect(Math.hypot(tuft.x - p.x, tuft.y - (p.y + 1.6), tuft.z - p.z)).toBeGreaterThan(sim.range + 0.4);
    // The press starts with the downy on the ground under the line; then it hops up into the crosshair's line
    // and stays there (held mid-hop, as at the top of each of its hops).
    const ex = aim.ex;
    const ey = aim.ey;
    const ez = aim.ez;
    const k = (d.z - ez) / aim.dz;
    d.hopT = 99;
    for (let t = 0; t < 3; t += 1 / 30) {
      if (t > 0.3) {
        d.x = ex + aim.dx * k;
        d.y = ey + aim.dy * k - 0.25;
        d.vy = 0;
        d.hopT = 99;
      }
      sim.update(1 / 30, { ...idle, draw: true }, aim);
      sim.events.length = 0;
    }
    expect(d.gone).toBe(false);
    expect(sim.s.slots.some((q) => q.t === 'clover')).toBe(false);
  });

  it('a press that has drawn fluff leaves a penned downy be, even with the aim then held still on it', () => {
    const sim = quiet(10);
    pen(sim, 1);
    const at = PADS[1];
    stand(sim, at.x, at.z + 3);
    const d = sim.spawn('clover', at.x + 0.7, at.z - 1, true);
    run(sim, 1);
    d.hopT = 99;
    const fluff = newItem(sim.s, 'tuft-clover', at.x - 0.6, sim.phys.floor(at.x, at.z - 1) + 0.12, at.z - 1);
    fluff.grounded = true;
    sim.s.items.push(fluff);
    for (let t = 0; t < 1.2; t += 1 / 30) sim.update(1 / 30, { ...idle, draw: true }, aimAt(sim, fluff.x, fluff.y, fluff.z));
    expect(fluff.gone).toBe(true);
    // The same press, the aim now still on the downy for two seconds.
    for (let t = 0; t < 2; t += 1 / 30) sim.update(1 / 30, { ...idle, draw: true }, aimAt(sim, d.x, d.y + 0.25, d.z));
    expect(d.gone).toBe(false);
  });

  it('fluff your penned downies drop on the far side gathers by the fence beside the post, within reach from outside', () => {
    const { sim, tuft } = farSide();
    const post = padSpots(1).post;
    // Standing in the lane by the post, outside the fence.
    stand(sim, post.x + 0.8, post.z + 0.6);
    const reach = () => {
      const p = sim.s.player;
      return Math.hypot(tuft.x - p.x, tuft.y - (p.y + 1.6), tuft.z - p.z);
    };
    expect(reach()).toBeGreaterThan(sim.range);
    run(sim, 15);
    expect(tuft.gone).toBe(false);
    expect(sim.phys.penAt(tuft.x, tuft.z)).toBe(1);
    expect(reach()).toBeLessThan(sim.range - 1.5);
  });
});

// ---------------------------------------------------------------- P1 2: catching for casual thumbs

describe('P1: clover is the gentle first catch, running is taught, a brook shows its time', () => {
  it("clover has the most give of the meadow's and valley's catches, about 0.2 m (it had the least, 0.1)", () => {
    expect(CATCH.clover.give).toBeGreaterThanOrEqual(0.18);
    for (const k of ['ember', 'brook'] as DownyKind[]) expect(CATCH.clover.give).toBeGreaterThan(CATCH[k].give);
    // In play: a crosshair 0.16 m off a wild clover's edge at 5 m still holds it.
    const sim = quiet(10);
    stand(sim, -16, -4);
    const d = sim.spawn('clover', -16, -9, false);
    d.y = sim.phys.floor(d.x, d.z);
    d.grounded = true;
    expect(sim.aimedDowny(aimAt(sim, d.x + d.r + 0.16, d.y + 0.25, d.z))).toBe(d);
  });

  it('in the meadow, a wild downy that has seen you brings a line to run, in touch words, and it goes once you run', () => {
    const { sim, s, tutor, go, view } = ranch([...TO_MEADOW, 'jump'], [...TO_MEADOW_F, 'jump']);
    s.hour = 16.5;
    s.downies = s.downies.filter((d) => d.keep);
    stand(sim, -16, -1);
    go(0.5);
    expect(tutor.current).toBe('meadow');
    // A wild clover close by notices you and hops off.
    const d = sim.spawn('clover', -16, -8, false);
    d.y = sim.phys.floor(d.x, d.z);
    go(0.6);
    expect(d.alert).toBe(true);
    expect(tutor.current).toBe('run');
    expect(view().line).toBe('Push the stick to its rim to run.');
    expect(tutor.mark.on).toBe(true);
    // Running: the stick at its rim.
    go(1.2, { ...idle, moveZ: 1, sprint: true });
    tutor.add(s, 'run', 0.6);
    go(0.2);
    expect(view().done).toBe(true);
    go(2);
    expect(Tutor.finished(s, 'run')).toBe(true);
    expect(tutor.current).toBe('meadow');
  });

  it("a brook digging in shows the time it has left before it slips into the pond, on the tug ring", () => {
    const sim = quiet(10);
    sim.s.gates.hollow = true;
    sim.phys.gates = { ...sim.s.gates };
    const bx = POND.x - 14;
    const bz = POND.z + 10;
    stand(sim, bx - 4.5, bz);
    const d = sim.spawn('brook', bx, bz, false);
    d.hopT = 99;
    const left: number[] = [];
    // (Round 7: letting go while it pulls back; its time waits meanwhile, and it has 4.2 s of it. Round 8: it
    // waits while it puffs up to pull back too, so three seconds of the fight.)
    for (let t = 0; t < 3; t += 1 / 30) {
      sim.update(1 / 30, { ...idle, draw: d.back <= 0 }, aimAt(sim, d.x, d.y + 0.25, d.z));
      sim.events.length = 0;
      if (d.held) left.push(sim.tugLeft(d));
    }
    expect(left.length).toBeGreaterThan(10);
    expect(left[0]).toBeGreaterThan(0.9);
    expect(left[left.length - 1]).toBeLessThan(left[0] - 0.2);
    expect(left.every((v, i) => i === 0 || v <= left[i - 1] + 1e-9)).toBe(true);
    // A clover has no time limit: no outer ring.
    const c = sim.spawn('clover', bx - 4.5, bz + 3, false);
    c.strain = 0.5;
    expect(sim.tugLeft(c)).toBe(-1);
  });
});

// ---------------------------------------------------------------- P1 3: the morning's rare downy

describe("P1: each morning the board posts one rare wild downy", () => {
  // (Round 6 made the rare one a hunt: no spook, lured with food, penned for good, its coins capped at the trip's.
  // Its spook test went; these two are brought to round 6's rules, and tests/ranch-round6.test.ts holds the rest.)
  it('the board names it and a place, and the offers differ in kind', () => {
    let seen = 0;
    const places = new Set<string>();
    for (let day = 2; day < 22; day++) {
      const sim = morning(day);
      sim.postOrders(true);
      const offers = sim.offers();
      const rare = offers.filter((o) => o.rare);
      expect(rare.length).toBe(1);
      const r = rare[0];
      seen++;
      expect(r.live).toBe(true);
      expect(r.n).toBe(1);
      // Three kinds of day, not one in three sizes: a day of tending, a trip for downies caught today, a hunt.
      expect(offers.filter((o) => !o.live).length).toBeLessThanOrEqual(1);
      expect(offers.filter((o) => o.live && !o.rare).length).toBeLessThanOrEqual(1);
      const tag = sim.offerTag(r);
      // (Round 8: its deadline in the title, its set place in the note.)
      expect(tag.title).toMatch(/^(Gold clover|Rose ember|Silver brook), by (noon|dusk)$/);
      // (Round 7: what it is worth a day once penned, as a number, when it has a pen to join.)
      expect(tag.note).toMatch(/^By the [a-z ]+\. Pays [\d,]+, (and stays|then [\d,]+ more (by day \d+|today))$/);
      places.add(tag.note.split('.')[0]);
    }
    expect(seen).toBe(20);
    expect(places.size).toBeGreaterThanOrEqual(4);
  });

  it('taken, it waits by the landmark, and the journal names it and the place', () => {
    for (let seed = 1; seed < 4; seed++) {
      Math.random = rng(seed);
      const sim = morning(3, false);
      const s = sim.s;
      sim.postOrders(true);
      const i = sim.offers().findIndex((o) => o.rare);
      const offer = sim.offers()[i];
      expect(sim.takeOrder(i)).toBe(true);
      const d = sim.rareWild()!;
      expect(d).toBeTruthy();
      expect(d.rare).toBe(true);
      const spot = world.SIGHTINGS[offer.rare!.spot];
      expect(Math.hypot(d.x - spot.x, d.z - spot.z)).toBeLessThan(3);
      expect(orderLines(s)[0]).toBe(`Find the gold clover by ${spot.name}.`);
    }
  });

  it('it is gone at dusk if not caught, and the order with it', () => {
    const sim = morning(3, false);
    sim.postOrders(true);
    sim.takeOrder(sim.offers().findIndex((o) => o.rare));
    expect(sim.rareWild()).toBeTruthy();
    sim.s.hour = 19.01;
    run(sim, 1);
    expect(sim.rareWild()).toBe(null);
    expect(sim.s.orders[0].state).toBe('missed');
  });

  it("every place it is seen is dry ground in its kind's own part of the valley", () => {
    const zone = { clover: 'meadow', ember: 'ridge', brook: 'hollow' } as const;
    expect(world.SIGHTINGS.length).toBeGreaterThanOrEqual(6);
    const sim = quiet(10);
    for (const sp of world.SIGHTINGS) {
      expect(zoneAt(sp.x, sp.z), sp.name).toBe(zone[sp.kind]);
      expect(waterAt(sp.x, sp.z), sp.name).toBeLessThan(sim.phys.floor(sp.x, sp.z));
    }
  });
});

// ---------------------------------------------------------------- P1 3: live orders want a fresh catch

describe('P1: live orders need a downy caught today', () => {
  it('a downy pulled from your own pen is refused at the crate, with a note; one caught today is taken', () => {
    const sim = morning(3, false);
    const s = sim.s;
    s.orders = [{ kind: 'clover', live: true, n: 2, got: 0, paid: 0, mult: 2, pay: LIVE_EACH.clover, state: 'open' }];
    s.orderDay = s.day;
    // One of your penned clovers (caught days ago), into the jar for real.
    const penned = s.downies.find((d) => d.pen === 1)!;
    penned.caught = 1;
    stand(sim, penned.x, penned.z + 2.5);
    for (let t = 0; t < 3 && !penned.gone; t += 1 / 30) {
      sim.update(1 / 30, { ...idle, draw: true }, aimAt(sim, penned.x, penned.y + 0.25, penned.z));
      sim.events.length = 0;
    }
    expect(penned.gone).toBe(true);
    s.sel = s.slots.findIndex((q) => q.t === 'clover');
    stand(sim, EXCHANGE.x, EXCHANGE.z - 4.2);
    const aim = aimAt(sim, EXCHANGE.x, sim.phys.floor(EXCHANGE.x, EXCHANGE.z) + 0.9, EXCHANGE.z);
    expect(sim.aimTarget(aim)).not.toBe('sell');
    const c0 = s.coins;
    const evs: Ev[] = [];
    blowAtCrate(sim, evs);
    expect(s.coins).toBe(c0);
    expect(s.orders[0].got).toBe(0);
    expect(evs.some((e) => e.t === 'deliver')).toBe(false);
    expect(evs.some((e) => e.t === 'deny' && e.why === 'The order wants one caught today.')).toBe(true);
    // A wild one caught today: taken.
    const w = sim.spawn('clover', -16, -9, false);
    w.y = sim.phys.floor(w.x, w.z);
    stand(sim, -16, -6);
    expect(catchIt(sim, w.id)).toBe(true);
    s.sel = s.slots.findIndex((q) => q.t === 'clover');
    stand(sim, EXCHANGE.x, EXCHANGE.z - 4.2);
    expect(sim.aimTarget(aimAt(sim, EXCHANGE.x, sim.phys.floor(EXCHANGE.x, EXCHANGE.z) + 0.9, EXCHANGE.z))).toBe('sell');
    blowAtCrate(sim, evs);
    expect(s.orders[0].got).toBe(1);
    expect(s.coins - c0).toBe(LIVE_EACH.clover);
  });
});

// ---------------------------------------------------------------- P2: the edge chevron

describe('P2: the edge chevron points the short way round', () => {
  it('for every bearing behind you, it points to the side you would turn towards', async () => {
    const { edgeSpot } = await import('../src/games/ranch/edge');
    const cam = new PerspectiveCamera(72, 412 / 838, 0.05, 700);
    const tmp = new Vector3();
    const out = { x: 0, y: 0, angle: 0 };
    let checked = 0;
    for (const yaw of [0, 0.7, 2.1, -1.3]) {
      cam.position.set(3, 1.6, -2);
      cam.rotation.set(-0.05, yaw, 0, 'YXZ');
      cam.updateMatrixWorld(true);
      cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      for (let deg = -179; deg <= 179; deg += 2) {
        // A spot 10 m off at this bearing from where you face (positive: to your left, as yaw turns).
        const a = yaw + (deg * Math.PI) / 180;
        const x = cam.position.x - Math.sin(a) * 10;
        const z = cam.position.z - Math.cos(a) * 10;
        const e = edgeSpot(cam, x, 1.6, z, 412, 838, tmp, out);
        // (A tall phone sees about 20 degrees either side.)
        if (Math.abs(deg) < 14) {
          expect(e, `${deg} deg`).toBe(null);
          continue;
        }
        if (Math.abs(deg) < 26) continue;
        expect(e, `${deg} deg`).not.toBe(null);
        // Left of you (deg > 0) the chevron sits on the left edge and points left; right of you, the right.
        const left = deg > 0;
        expect(e!.x < 206, `${deg} deg at x ${e!.x.toFixed(0)}`).toBe(left);
        expect(Math.cos(e!.angle) < 0, `${deg} deg angle ${e!.angle.toFixed(2)}`).toBe(left);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
});

// ---------------------------------------------------------------- P2: day 1 holds still through the loop lesson

describe('P2: the clock holds through the loop lesson', () => {
  it('after the meadow the afternoon stays at half past four through the loop, hunger running, and the clock runs once the loop ends', () => {
    const { sim, s, tutor, go } = ranch([...TO_MEADOW, 'jump', 'run'], [...TO_MEADOW_F, 'jump']);
    s.hour = 16.5;
    pen(sim, 1);
    fill(sim, 1, 'clover', 2, 0.3);
    stand(sim, -16, -6);
    const w = sim.spawn('clover', -16, -9, false);
    w.y = sim.phys.floor(w.x, w.z);
    go(0.5);
    expect(tutor.current).toBe('meadow');
    tutor.add(s, 'catch:wild');
    go(2);
    expect(Tutor.finished(s, 'meadow')).toBe(true);
    expect(tutor.current).toBe('farm');
    const d = s.downies.find((q) => q.pen === 1)!;
    const h0 = d.hunger;
    go(90);
    // A minute and a half of the loop: still half past four, no dusk, but the penned downies are getting hungry.
    expect(s.hour).toBeCloseTo(16.5, 3);
    expect(tutor.current).not.toBe('dusk');
    expect(d.hunger).toBeGreaterThan(h0 + 0.2);
    // The loop's three turns done: the clock runs on.
    s.learnCount['cycle'] = (s.learnCount['farm:from'] ?? 0) + 3;
    go(3);
    expect(Tutor.finished(s, 'farm')).toBe(true);
    go(HOUR / 2);
    expect(s.hour).toBeGreaterThan(16.9);
  });
});

// ---------------------------------------------------------------- P3: hunger through the jar, and the cheap fixes

describe('P3: the cheap fixes', () => {
  it('a downy keeps its hunger through the jar (0.06 came out 0.37; 0.80 came out 0.35), blown or tipped out, and saved', () => {
    for (const h of [0.06, 0.8]) {
      const sim = quiet(10);
      stand(sim, 0, 30);
      const d = sim.spawn('clover', 0, 27, true);
      d.hunger = h;
      d.hopT = 99;
      for (let t = 0; t < 2 && !d.gone; t += 1 / 30) {
        sim.update(1 / 30, { ...idle, draw: true }, aimAt(sim, d.x, d.y + 0.25, d.z));
        sim.events.length = 0;
      }
      expect(d.gone).toBe(true);
      // Saved and loaded with it in the jar.
      const back = new Sim(deserialize(JSON.parse(JSON.stringify(serialize(sim.s))), sim.s.sources));
      back.wild = false;
      back.s.sel = back.s.slots.findIndex((q) => q.t === 'clover');
      back.update(1 / 30, { ...idle, puff: true, puffPressed: true }, ahead(back));
      const out = back.s.downies.find((q) => !q.gone && q.kind === 'clover' && q.flyT >= 0)!;
      expect(out.hunger).toBeCloseTo(h, 2);
      // Tipped out.
      sim.empty(sim.s.slots.findIndex((q) => q.t === 'clover'), ahead(sim));
      const tipped = sim.s.downies.find((q) => !q.gone && q.kind === 'clover' && q.noPull > 0)!;
      expect(tipped.hunger).toBeCloseTo(h, 2);
    }
  });

  it('the workbench lesson waits for the ridge gate, so the jar does not spend the gate\'s savings', () => {
    const ids = LESSON_IDS.filter((id) => !['bench', 'gates'].includes(id));
    const { s, tutor, go } = ranch(ids, ['bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'slots', 'jump', 'appetite', 'time', 'orders', 'garden', 'up:feeder']);
    // (Day 2: round 7 spaces the first day's lessons 30 s apart once the clock runs.)
    s.day = 2;
    s.night = 2;
    s.hour = 10;
    s.coins = 450;
    go(1);
    expect(tutor.current).not.toBe('bench');
    s.coins = 520;
    go(1);
    expect(tutor.current).toBe('gates');
    s.gates.ridge = true;
    go(3);
    s.coins = 450;
    go(1);
    expect(tutor.current).toBe('bench');
  });

  it("the offers' tags say what each order itself pays, so a fluff order's \"168 more\" is not read beside a trip's \"165\"", () => {
    const sim = morning(3, false);
    sim.postOrders(true);
    const notes = sim.offers().map((o) => sim.offerTag(o).note);
    // (Round 8: each with its deadline first.)
    expect(notes.find((n) => n.endsWith('on top of sales'))).toMatch(/^By (noon|dusk)\. Pays [\d,]+ on top of sales$/);
    expect(notes.find((n) => n.startsWith('Caught by'))).toMatch(/^Caught by (noon|dusk)\. Pays [\d,]+$/);
    expect(notes.some((n) => /more by dusk/.test(n))).toBe(false);
  });

  it('every journal line about orders is eight words or fewer ("New orders come to the price board at dawn." was nine)', () => {
    const sim = quiet(20);
    sim.s.learn.push('orders');
    sim.s.goals = ['catch', 'pen', 'feed', 'sell', 'plant'];
    sim.s.orders = [];
    const line = goalText('order', sim.s);
    expect(line.split(' ').length).toBeLessThanOrEqual(8);
    expect(line).toBe('New orders come to the board at dawn.');
    // And every lesson line still: eight words or fewer.
    for (const l of allLines()) expect(l.line.split(' ').length, l.line).toBeLessThanOrEqual(8);
  });
});
