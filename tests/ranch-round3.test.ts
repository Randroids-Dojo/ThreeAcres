// Thistledown's third harsh playtest ("a well-taught, good-looking chore
// loop... no decisions or goals once you have the gates; the only exciting
// moment, catching, can't be failed"), as tests on the render-free sim and
// tutor. Each test here fails on the code the tester played (proved on a
// `git archive` copy of that commit).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILD_COST, FEEDER_CAP, GOALS, HOUR, PEN_MAX, type DownyKind } from '../src/games/ranch/defs';
import { Tutor, allLines, goalSpot, goalText, orderLines, type Say } from '../src/games/ranch/lessons';
import { ESCAPE, Sim, padSpots, type Aim, type Controls, type Ev } from '../src/games/ranch/sim';
import { newItem } from '../src/games/ranch/state';
import { BOARD, GATES, PADS, PEN_R, POND, RIDGE_TOP } from '../src/games/ranch/world';
import { rng } from '../src/games/ranch/noise';
import { CAREFUL, CARELESS, catchRate } from '../scripts/ranch-catch';

// Long sims (game days, ten real minutes) run well over the default 5 s on a loaded machine.
vi.setConfig({ testTimeout: 60_000 });

const realRandom = Math.random;
beforeEach(() => {
  Math.random = rng(23);
});
afterEach(() => {
  Math.random = realRandom;
});
function seeds(n: number, body: (k: number) => void): void {
  for (let k = 1; k <= n; k++) {
    Math.random = rng(k * 7919);
    body(k);
  }
}

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

/** A quiet ranch: no wild comings and goings, nothing lying about. */
function quiet(hour = 10): Sim {
  const sim = new Sim(null);
  sim.wild = false;
  sim.s.downies = [];
  sim.s.items = [];
  sim.s.hour = hour;
  sim.s.night = sim.s.day;
  return sim;
}

/** n tame downies of a kind in pen i, a little hungry. */
function fill(sim: Sim, i: number, kind: DownyKind, n: number, hunger = 0.2): void {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    sim.spawn(kind, PADS[i].x + Math.cos(a) * 2, PADS[i].z + Math.sin(a) * 2, true).hunger = hunger;
  }
}

/** A teaching ranch and its tutor; run() advances both, the sim's events fed to the tutor. */
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
  const evs: Ev[] = [];
  const run = (seconds: number, c: Controls = idle, aim?: Aim) => {
    for (let t = 0; t < seconds; t += 1 / 30) {
      sim.update(1 / 30, c, aim ?? ahead(sim));
      for (const e of sim.events) {
        tutor.onEvent(s, e);
        evs.push(e);
      }
      sim.events.length = 0;
      view = tutor.update(s, 1 / 30, touch, floor);
    }
    return view;
  };
  return { sim, s, tutor, run, evs, view: () => view };
}

const TO_MEADOW = ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'slots'];
const TO_MEADOW_F = ['bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'slots'];
/** The basics, the meadow and the loop learned: the day runs on, and the board posts orders. */
const PAST_FARM = [...TO_MEADOW, 'meadow', 'jump', 'farm'];
const PAST_FARM_F = [...TO_MEADOW_F, 'time', 'jump', 'orders'];
/** And the orders' lesson. */
const PAST_ORDER = [...PAST_FARM, 'order'];

const sellEvents = (evs: Ev[]) => evs.filter((e): e is Extract<Ev, { t: 'sell' }> => e.t === 'sell');
const orderEvents = (evs: Ev[]) => evs.filter((e): e is Extract<Ev, { t: 'order' }> => e.t === 'order');

// ---------------------------------------------------------------- P1: orders

describe('P1: daily orders at the sell crate, a goal every day', () => {
  it('the board asks only for kinds you can get by dusk, in amounts your downies can make', () => {
    let emberSeen = 0;
    seeds(12, (k) => {
      const sim = quiet(6);
      const s = sim.s;
      s.day = 2 + k;
      pen(sim, 1);
      pen(sim, 2);
      fill(sim, 1, 'clover', 6);
      // The ridge shut: clover only, an amount six downies make by dusk with room to spare.
      sim.postOrders(true);
      expect(s.orders.length).toBeGreaterThanOrEqual(1);
      for (const o of s.orders) {
        expect(o.kind).toBe('clover');
        // (Round 4: a live order of two to four downies may be offered beside the fluff one.)
        if (o.live) expect(o.n).toBeLessThanOrEqual(5);
        else expect(o.n).toBeGreaterThanOrEqual(4);
        expect(o.n).toBeLessThanOrEqual(6 * 2 * (13 / 5));
        expect(o.state).toBe('offer');
      }
      // The ridge open, no embers yet and room in a pen: a small ember order may come to send you out.
      // Never a brook (the hollow is shut) and never a thistle (you keep none; they only come at dusk).
      s.gates.ridge = true;
      sim.postOrders(true);
      for (const o of s.orders) {
        expect(['clover', 'ember']).toContain(o.kind);
        if (o.kind === 'ember' && !o.rare) {
          // Round 4: you keep no embers, so it is live downies, to send you out (round 5: or the rare one, alone).
          expect(o.live).toBe(true);
          expect(o.n).toBeGreaterThanOrEqual(2);
          expect(o.n).toBeLessThanOrEqual(4);
          emberSeen++;
        }
      }
    });
    expect(emberSeen).toBeGreaterThan(0);
    // Nothing kept: no fluff asked for.
    const empty = quiet(6);
    empty.postOrders(true);
    expect(empty.s.orders.filter((o) => !o.live)).toEqual([]);
    // One downy late in the morning cannot make four by dusk: its fluff is not asked for.
    const late = quiet(11.5);
    pen(late, 1);
    fill(late, 1, 'clover', 1);
    late.postOrders(true);
    expect(late.s.orders.filter((o) => !o.live)).toEqual([]);
  });

  it('orders grow with the ranch, and a thistle you keep brings a prized order that pays triple', () => {
    const sim = quiet(6);
    const s = sim.s;
    pen(sim, 1);
    pen(sim, 2, ['high']);
    fill(sim, 1, 'clover', 3);
    sim.postOrders(true);
    const small = s.orders.find((o) => !o.live)!.n;
    fill(sim, 1, 'clover', 6);
    s.day++;
    sim.postOrders(true);
    expect(s.orders.find((o) => !o.live)!.n).toBeGreaterThan(small);
    // (Round 10: prized, triple, with three thistles kept; one or two make a plain order.)
    fill(sim, 2, 'thistle', 3);
    s.day++;
    sim.postOrders(true);
    const th = s.orders.find((o) => o.kind === 'thistle');
    expect(th).toBeTruthy();
    expect(th!.mult).toBe(3);
  });

  it('orders fill by blowing that fluff into the crate, and pay clearly more than market', () => {
    const sim = quiet(7);
    const s = sim.s;
    pen(sim, 1);
    fill(sim, 1, 'clover', 4);
    sim.postOrders(true);
    // (Round 4: the morning's orders are offers; take the fluff one at the board.)
    expect(sim.takeOrder(s.orders.findIndex((q) => !q.live))).toBe(true);
    const o = s.orders[0];
    expect(o.kind).toBe('clover');
    // (Round 8: due by noon, by dusk or after dark; one for after dark counts from 9 pm, and a noon or night one
    // pays twice its fluff's price on top.)
    if (o.from !== undefined) s.hour = o.from + 0.2;
    const k = o.from !== undefined || o.by === 12 ? 2 : 1;
    const evs: Ev[] = [];
    const c0 = s.coins;
    // From the lane, blow the order's fluff into the crate, one at a time.
    stand(sim, -6.5, 32.6);
    s.slots[0] = { t: 'tuft-clover', n: o.n + 2 };
    s.sel = 0;
    const aim = aimAt(sim, -6.5, sim.phys.floor(-6.5, 36.5) + 0.7, 36.5);
    for (let k = 0; k < o.n + 2; k++) {
      sim.update(1 / 30, { ...idle, puff: true, puffPressed: true }, aim);
      for (let t = 0; t < 0.6; t += 1 / 30) sim.update(1 / 30, idle, aim);
      evs.push(...sim.events);
      sim.events.length = 0;
    }
    for (let t = 0; t < 3; t += 1 / 30) sim.update(1 / 30, idle, aim);
    evs.push(...sim.events);
    expect(o.state).toBe('filled');
    expect(o.got).toBe(o.n);
    const filled = orderEvents(evs).find((e) => e.state === 'filled')!;
    expect(filled).toBeTruthy();
    // The order's fluff sold at the board's price, and filling it paid about that again (round 4: the sum
    // set when it was posted, so the tag can say it, before each sale took its little off the price).
    const market = sellEvents(evs).slice(0, o.n).reduce((a, e) => a + e.coins, 0);
    expect(filled.bonus).toBeGreaterThanOrEqual(market * k);
    expect(filled.bonus).toBeLessThanOrEqual(market * 1.15 * k);
    expect(s.coins - c0).toBeGreaterThanOrEqual(market * (1 + k) * 0.95);
    expect(s.goals).toContain('order');
    // Only the order's n counted: the two extra sold at the market price only.
    expect(orderEvents(evs).filter((e) => e.state === 'progress').length).toBe(o.n - 1);
  });

  it('an order left open lapses at dusk, and the next morning posts new ones', () => {
    const sim = quiet(6);
    const s = sim.s;
    pen(sim, 1);
    fill(sim, 1, 'clover', 6);
    sim.postOrders(true);
    expect(s.orders.length).toBeGreaterThan(0);
    // (Round 8: one due by noon or by dusk; one for after dark runs to midnight.)
    sim.takeOrder(s.orders.findIndex((o) => o.from === undefined));
    s.hour = 17.5;
    const evs: Ev[] = [];
    for (let t = 0; t < 2 * HOUR; t += 1 / 20) {
      sim.update(1 / 20, idle, ahead(sim));
      evs.push(...sim.events);
      sim.events.length = 0;
    }
    expect(s.orders.every((o) => o.state === 'missed')).toBe(true);
    expect(orderEvents(evs).some((e) => e.state === 'missed')).toBe(true);
    sim.sleep();
    for (let t = 0; t < 1; t += 1 / 20) sim.update(1 / 20, idle, ahead(sim));
    expect(s.orderDay).toBe(s.day);
    expect(s.orders.some((o) => o.state === 'offer')).toBe(true);
  });

  it('the first order brings one short lesson after the loop, pointing at the board; then the journal keeps the tally', () => {
    const { sim, s, tutor, run, view } = ranch(PAST_FARM, PAST_FARM_F);
    s.day = 2;
    s.hour = 7;
    s.night = 2;
    pen(sim, 1);
    fill(sim, 1, 'clover', 3, 0.1);
    // (300 coins: the garden lesson is ready too, and comes first; the order's lesson takes over when the board posts it.)
    run(1);
    expect(s.orders.length).toBeGreaterThan(0);
    expect(tutor.current).toBe('order');
    // (Round 4: the order is taken at the board.)
    expect(view().line).toBe('Take an order at the price board.');
    expect(tutor.mark.on).toBe(true);
    expect(Math.hypot(tutor.mark.x - BOARD.x, tutor.mark.z - BOARD.z)).toBeLessThan(0.2);
    // Taken: the line ticks.
    sim.takeOrder(0);
    sim.sellFluff(s.orders[0].kind);
    run(0.2);
    expect(view().done).toBe(true);
    run(2);
    expect(Tutor.finished(s, 'order')).toBe(true);
    // With no lesson up, the journal shows the order and its tally.
    const kind = s.orders[0].kind;
    expect(orderLines(s)[0]).toBe(`${kind[0].toUpperCase()}${kind.slice(1)} fluff, 1 of ${s.orders[0].n}.`);
    for (const l of orderLines(s)) expect(l.split(' ').length, l).toBeLessThanOrEqual(8);
  });

  it('the late game has goals worth chasing: orders, a prized order and a full pen of each kind', () => {
    const ids = GOALS.map((g) => g.id);
    const after = ids.slice(ids.indexOf('thistle') + 1);
    expect(after).toEqual(expect.arrayContaining(['orders5', 'prized', 'fullclover', 'fullember', 'fullbrook', 'fullthistle', 'rich']));
    expect(after.length).toBeGreaterThanOrEqual(6);
    const sim = quiet();
    pen(sim, 1);
    fill(sim, 1, 'clover', 10);
    for (let t = 0; t < 1; t += 1 / 30) sim.update(1 / 30, idle, ahead(sim));
    expect(sim.s.goals).toContain('fullclover');
  });
});

// ---------------------------------------------------------------- P1: the pen limit

describe('P1: the pen limit is taught before it bites, and the first ember pen is affordable', () => {
  // (Round 9: the line comes only once a pen is crowded, over ten; at eight the post's count tag comes in quietly. The
  // ninth playtest's "Keep ten or fewer downies in a pen." stayed up all day with six in the pen and five embers aboard.)
  it('at eight in a pen the post\'s count tag comes in quietly; over ten, "Keep ten or fewer downies in a pen." with an arrow at the post', () => {
    const { sim, s, tutor, run, view } = ranch(PAST_ORDER, PAST_FARM_F);
    s.hour = 10;
    s.night = s.day;
    pen(sim, 1);
    fill(sim, 1, 'clover', 7, 0.1);
    run(1);
    expect(tutor.current).not.toBe('crowd');
    expect(sim.knows('crowd')).toBe(false);
    fill(sim, 1, 'clover', 1, 0.1);
    run(0.5);
    // The count tag on the post comes with eight (the limit, in the world), with no line.
    expect(sim.knows('crowd')).toBe(true);
    expect(tutor.current).not.toBe('crowd');
    fill(sim, 1, 'clover', 3, 0.1);
    run(0.5);
    expect(tutor.current).toBe('crowd');
    expect(view().line).toBe('Keep ten or fewer downies in a pen.');
    const post = padSpots(1).post;
    expect(Math.hypot(tutor.mark.x - post.x, tutor.mark.z - post.z)).toBeLessThan(1.2);
    run(4.5);
    expect(Tutor.finished(s, 'crowd')).toBe(false);
  });

  it('with more than ten in a pen the line stays until one is taken out', () => {
    const { sim, s, tutor, run } = ranch(PAST_ORDER, PAST_FARM_F);
    s.hour = 10;
    s.night = s.day;
    pen(sim, 1);
    fill(sim, 1, 'clover', 11, 0.1);
    run(4);
    expect(tutor.current).toBe('crowd');
    expect(Tutor.finished(s, 'crowd')).toBe(false);
    s.downies.find((d) => d.pen === 1)!.gone = true;
    run(2);
    expect(Tutor.finished(s, 'crowd')).toBe(true);
    expect(PEN_MAX).toBe(10);
  });

  it('after opening the ridge gate with just enough coins, the reward pays for a pen', () => {
    const sim = quiet();
    sim.s.coins = GATES.ridge.cost;
    expect(sim.choose({ kind: 'gate', id: 'ridge', label: '', x: 0, y: 0, z: 0 }, 'gate:ridge')).toBe(true);
    expect(sim.s.coins).toBeGreaterThanOrEqual(BUILD_COST.pen);
  });

  it('a downy that hopped out of a full pen is sent to another pen with room, never back into the crowd', () => {
    const { sim, s, tutor, run, view } = ranch([...PAST_ORDER, 'crowd'], [...PAST_FARM_F, 'crowd']);
    s.hour = 10;
    s.night = s.day;
    pen(sim, 1);
    pen(sim, 2);
    fill(sim, 1, 'clover', 10, 0.1);
    run(1);
    const d = s.downies.find((q) => q.pen === 1)!;
    d.x = PADS[1].x + PEN_R + 1.4;
    d.y = sim.phys.floor(d.x, d.z);
    d.grounded = true;
    d.vx = d.vz = d.vy = 0;
    d.hopT = 5;
    run(0.5);
    expect(tutor.current).toBe('stray');
    // Pulled in: pen 1 is full again (another came in meanwhile), so the line sends it to another pen.
    d.gone = true;
    sim.stow('clover');
    fill(sim, 1, 'clover', 1, 0.1);
    run(0.6);
    expect(view().line).toBe('Blow the downy into another pen.');
    expect(Math.hypot(tutor.mark.x - PADS[2].x, tutor.mark.z - PADS[2].z)).toBeLessThan(0.2);
  });
});

// ---------------------------------------------------------------- P1: the thistle hunt

describe('P1: the thistle hunt has a clue, and a thistle needs a high fence', () => {
  it('by day the goal says when thistles come; at dusk, where, with an arrow at the ridge top', () => {
    const sim = quiet(13);
    const s = sim.s;
    s.gates.ridge = s.gates.hollow = true;
    s.goals = GOALS.slice(0, GOALS.findIndex((g) => g.id === 'thistle')).map((g) => g.id);
    expect(sim.openGoals(1)[0].id).toBe('thistle');
    const m = { on: false, icon: 'arrow' as const, x: 0, y: 0, z: 0, rx: 0, rz: 0, r: 0, slot: -1 };
    const floor = (x: number, z: number) => sim.phys.floor(x, z);
    expect(goalText('thistle', s)).toBe('Thistles visit the ridge top at dusk.');
    expect(goalSpot('thistle', s, m, floor)).toBe(false);
    s.hour = 18;
    expect(goalText('thistle', s)).toBe('Catch a thistle on the ridge top.');
    expect(goalSpot('thistle', s, m, floor)).toBe(true);
    expect(Math.hypot(m.x - RIDGE_TOP.x, m.z - RIDGE_TOP.z)).toBeLessThan(0.5);
    for (const l of [goalText('thistle', s), 'Thistles visit the ridge top at dusk.']) expect(l.split(' ').length).toBeLessThanOrEqual(8);
  });

  it('a thistle penned behind a low fence: "Thistles need a high fence. Buy one." pointing at the post, its tag chosen', () => {
    const { sim, s, tutor, run, view } = ranch(PAST_ORDER, PAST_FARM_F);
    s.hour = 10;
    s.night = s.day;
    s.coins = 500;
    pen(sim, 1);
    const th = sim.spawn('thistle', PADS[1].x, PADS[1].z, true);
    th.hunger = 0.1;
    run(0.5);
    expect(tutor.current).toBe('high');
    expect(view().line).toBe('Thistles need a high fence. Buy one.');
    expect(tutor.tag).toBe('pen:high');
    const post = padSpots(1).post;
    expect(Math.hypot(tutor.mark.x - post.x, tutor.mark.z - post.z)).toBeLessThan(1.2);
    expect(sim.menu({ kind: 'pad', id: 1, label: '', x: 0, y: 0, z: 0 }).map((o) => o.id)).toContain('pen:high');
    // It hops out meanwhile: still the fence line, not the stray line's nagging.
    run(8);
    expect(tutor.current).toBe('high');
    expect(sim.choose({ kind: 'pad', id: 1, label: '', x: 0, y: 0, z: 0 }, 'pen:high')).toBe(true);
    run(0.3);
    expect(view().done).toBe(true);
    run(2);
    expect(tutor.current).not.toBe('high');
  });

  it('the thistle goal is a catch, not a glimpse', () => {
    const sim = quiet(18.5);
    sim.wild = true;
    stand(sim, RIDGE_TOP.x + 6, RIDGE_TOP.z);
    sim.spawn('thistle', RIDGE_TOP.x, RIDGE_TOP.z, false);
    for (let t = 0; t < 3; t += 1 / 30) sim.update(1 / 30, idle, ahead(sim));
    expect(sim.s.goals).not.toContain('thistle');
  });
});

// ---------------------------------------------------------------- P2: catching is a skill

describe('P2: each kind has its own catch, and a careless thumb can fail it', () => {
  const kinds: DownyKind[] = ['clover', 'ember', 'brook', 'thistle'];
  it('per kind, a careful thumb catches far more often than a careless one, which fails often', () => {
    const out: Record<string, [number, number]> = {};
    for (const k of kinds) {
      const careless = catchRate(k, CARELESS, 30).first;
      const careful = catchRate(k, CAREFUL, 30).first;
      out[k] = [careless, careful];
      // (Round 5: the harness's thumbs carry the real loop's lag, so it reads about as real touch does. Round 7:
      // the tug is the skill, read on the ring; clover is the gentle first catch, so a careless thumb catches it
      // nine times in ten on the first try and every other kind far less often.)
      // (Thirty tries here; the round 7 test holds the careful thumb to 90% over 120.)
      expect(careful, `${k} careful`).toBeGreaterThanOrEqual(0.8);
      // (Round 8: the tug a duel, clover kept the gentle one, which even a slow thumb lands; the others it fails often.)
      if (k !== 'clover') expect(careless, `${k} careless`).toBeLessThanOrEqual(0.8);
      // (Round 8: thirty tries; the round 8 test holds each kind to its band over 120.)
      if (k !== 'clover') expect(careful - careless, `${k} gap`).toBeGreaterThanOrEqual(0.15);
    }
    // (The third playtest's careless thumb caught 8 of 8. Round 9: clover the gentle first catch, the others' mean.)
    const others = kinds.filter((k) => k !== 'clover');
    expect(others.reduce((a, k) => a + out[k][0], 0) / others.length).toBeLessThan(0.72);
  });

  it('a thistle bolts: walking at it on open ground you never get in reach; running, you do', () => {
    // (Round 4: until it is winded, after four seconds of bolting; then a walker who keeps after it closes in.
    // Round 5: three seconds of bolting, then winded for four, so a walking thumb gets its chance.)
    const chase = (run: boolean, secs = ESCAPE.boltFor - 0.1) => {
      const sim = quiet(18.6);
      // Open meadow, gently rising ahead of it, no water or crag in the way.
      const d = sim.spawn('thistle', -20, -3, false);
      d.hunger = 0.2;
      stand(sim, -20, 8);
      let closest = 1e9;
      for (let t = 0; t < secs; t += 1 / 30) {
        const p = sim.s.player;
        p.yaw = Math.atan2(-(d.x - p.x), -(d.z - p.z));
        sim.update(1 / 30, { ...idle, moveZ: 1, sprint: run }, ahead(sim));
        if (t > 0.5) closest = Math.min(closest, Math.hypot(d.x - p.x, d.z - p.z));
      }
      return closest;
    };
    let walkMin = 1e9;
    let runMin = 1e9;
    seeds(3, () => {
      walkMin = Math.min(walkMin, chase(false));
    });
    seeds(3, () => {
      runMin = Math.min(runMin, chase(true, 2.9));
    });
    // Pull reaches 7.4 m. (Round 7: it bolts for two seconds, then is winded for eight.)
    expect(walkMin).toBeGreaterThan(7.4);
    expect(runMin).toBeLessThan(7);
    let tired = 1e9;
    seeds(3, () => {
      tired = Math.min(tired, chase(false, 9));
    });
    expect(tired).toBeLessThan(7);
  });

  it('a slow catch of a brook by the pond: it slips into the water and is gone', () => {
    // (Round 5: a brook breaks free only when its time runs out, shown on the tug ring; a pull that lapses
    // altogether starts over. So: a pull that keeps it, but too slowly to bring it in, five frames on and three off.)
    let dove = 0;
    for (let k = 0; k < 6; k++) {
      Math.random = rng(100 + k);
      const sim = quiet(10);
      sim.s.gates.hollow = true;
      sim.phys.gates = { ...sim.s.gates };
      const bx = POND.x - 14;
      const bz = POND.z + 10;
      stand(sim, bx - 4.5, bz);
      const d = sim.spawn('brook', bx, bz, false);
      d.hopT = 99;
      let escaped = false;
      // (Round 7: the thumb lets go while it pulls back, as the tug asks; its time waits meanwhile.)
      for (let f = 0; f < 30 * 12 && !d.gone; f++) {
        const on = f % 8 < 4 && !escaped;
        const aim = on ? aimAt(sim, d.x, d.y + 0.25, d.z) : aimAt(sim, d.x, d.y + 3, d.z + 3);
        sim.update(1 / 30, { ...idle, draw: !escaped && d.back <= 0 }, aim);
        for (const e of sim.events) if (e.t === 'escape' && e.dove) escaped = true;
        sim.events.length = 0;
        // Keep it in reach while it is held (the test is about the time, not the chase).
        if (!escaped && Math.hypot(d.x - sim.s.player.x, d.z - sim.s.player.z) > 5.5) stand(sim, d.x - 4.5, d.z);
      }
      if (escaped && d.gone && !sim.s.slots.some((q) => q.t === 'brook')) dove++;
    }
    expect(dove).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------- P2: the ranch can be left a while

describe('P2: leaving the ranch is fine once you have invested, and the gardens keep up', () => {
  it('a feed run sends a garden\'s crop into the next pen\'s feeder: a pen of six left alone for ten minutes stays fed and in', () => seeds(2, () => {
    const away = (run: boolean, crop = true) => {
      const sim = quiet(6);
      // (No pests: this is about food. The clock runs.)
      sim.teaching = true;
      // (Round 7: the first day's dusk waits for the feeder lessons; this ranch is past them.)
      sim.s.learn = ['time', 'evening'];
      const s = sim.s;
      s.pads[0].crop = crop ? 'cloverhead' : null;
      s.pads[0].grow = 0;
      s.pads[0].ups = run ? ['run'] : [];
      pen(sim, 1, ['feeder']);
      fill(sim, 1, 'clover', 6, 0.3);
      let stored = 0;
      let out = false;
      let fraz = false;
      // Ten real minutes: twenty game hours, a whole thistle trip and more.
      for (let t = 0; t < 600; t += 1 / 20) {
        sim.update(1 / 20, idle, ahead(sim));
        for (const e of sim.events) if (e.t === 'store' && e.where === 'feeder') stored++;
        sim.events.length = 0;
        out ||= s.downies.some((d) => !d.gone && d.pen < 0);
        fraz ||= s.downies.some((d) => !d.gone && d.mood === 'frazzled');
      }
      return { stored, out, fraz };
    };
    const yes = away(true);
    expect(yes.stored).toBeGreaterThan(5);
    expect(yes.out).toBe(false);
    expect(yes.fraz).toBe(false);
    // The control: the same pen with no food growing beside it starves and goes over the fence. (Round 6: a bare
    // garden with its bed full now tips its crop into the feeder next door too, so the old control, a garden without
    // a feed run, keeps the pen in.)
    const no = away(false, false);
    expect(no.out).toBe(true);
    // (Round 7: a bare garden's full bed tips only a third of its crop into the feeder, so an empty feeder beside
    // it is no longer enough on its own; it still tips some in. See tests/ranch-round7.test.ts for the feeder
    // running down over days.)
    expect(away(false).stored).toBeGreaterThan(0);
    expect(FEEDER_CAP).toBeGreaterThanOrEqual(60);
  }));

  it('a bare garden gives food in every round of tending, an hour and a half apart', () => {
    const sim = quiet(6);
    const g = sim.s.pads[0];
    g.crop = 'cloverhead';
    g.grow = 0;
    let empty = 0;
    for (let round = 0; round < 9; round++) {
      let got = 0;
      for (let t = 0; t < 1.5 * HOUR; t += 1 / 20) {
        sim.update(1 / 20, idle, ahead(sim));
        for (const e of sim.events) if (e.t === 'crop') got++;
        sim.events.length = 0;
      }
      // The round's tending picks the bed clean.
      for (const it of sim.s.items) if (it.src >= 1000) it.gone = true;
      if (!got) empty++;
    }
    // (The third playtest: no food in four rounds of nine.)
    expect(empty).toBe(0);
  });
});

// ---------------------------------------------------------------- P2: the loop lesson, pulls in a pen, slots

describe('P2: the loop lesson, pulls in a pen and stepping windows', () => {
  it('with a fresh catch aboard, the loop lesson says to blow it into a pen (it said to catch another)', () => {
    const { sim, s, tutor, run, view } = ranch([...TO_MEADOW, 'meadow', 'jump'], [...TO_MEADOW_F, 'time', 'jump']);
    s.hour = 10;
    s.night = s.day;
    pen(sim, 1);
    fill(sim, 1, 'clover', 1, 0.1);
    s.items = [];
    run(0.5);
    expect(tutor.current).toBe('farm');
    sim.stow('clover');
    run(0.6);
    expect(view().line).toBe('Blow the downy into a pen.');
    expect(Math.hypot(tutor.mark.x - PADS[1].x, tutor.mark.z - PADS[1].z)).toBeLessThan(0.2);
  });

  it('pulling up a pen\'s fluff never takes a penned downy, even one standing in front of the fluff', () => {
    let taken = 0;
    let pulls = 0;
    seeds(3, () => {
      const sim = quiet();
      const s = sim.s;
      pen(sim, 1);
      const at = PADS[1];
      fill(sim, 1, 'clover', 6, 0.05);
      stand(sim, at.x, at.z + PEN_R + 0.6);
      for (let t = 0; t < 1; t += 1 / 30) sim.update(1 / 30, idle, ahead(sim));
      for (let k = 0; k < 3; k++) {
        // Fluff lying just behind a downy, as fed downies leave it: aim at the fluff (through the downy) and
        // hold Pull until it is in and a moment more, then let go and turn to the next.
        const d = s.downies.filter((q) => !q.gone && q.pen === 1)[k];
        d.hopT = 99;
        const p = s.player;
        const l = Math.hypot(d.x - p.x, d.z - p.z);
        const fx = d.x + ((d.x - p.x) / l) * 0.7;
        const fz = d.z + ((d.z - p.z) / l) * 0.7;
        for (let j = 0; j < 2; j++) {
          const it = newItem(s, 'tuft-clover', fx + j * 0.1, sim.phys.floor(fx, fz) + 0.12, fz);
          it.grounded = true;
          s.items.push(it);
        }
        const aim = aimAt(sim, fx, sim.phys.floor(fx, fz) + 0.15, fz);
        for (let t = 0; t < 1.2; t += 1 / 30) sim.update(1 / 30, { ...idle, draw: true }, aim);
        for (let t = 0; t < 0.4; t += 1 / 30) sim.update(1 / 30, idle, ahead(sim));
        pulls++;
      }
      taken += 6 - s.downies.filter((d) => !d.gone && d.pen === 1).length;
    });
    expect(pulls).toBe(9);
    // (The third playtest: 3 of about 9 sweeps took a penned downy.)
    expect(taken).toBe(0);
  });

  it('a penned downy still comes to an aim held still on it, with nothing else in the cone', () => {
    const sim = quiet();
    pen(sim, 1);
    const at = PADS[1];
    stand(sim, at.x, at.z + 3);
    const d = sim.spawn('clover', at.x + 0.4, at.z - 1, true);
    d.hunger = 0.05;
    for (let t = 0; t < 1; t += 1 / 30) sim.update(1 / 30, idle, ahead(sim));
    d.hopT = 99;
    for (let t = 0; t < 1.5 && !d.gone; t += 1 / 30) sim.update(1 / 30, { ...idle, draw: true }, aimAt(sim, d.x, d.y + 0.25, d.z));
    expect(d.gone).toBe(true);
  });

  it('stepping windows skips empty ones', () => {
    const sim = quiet();
    const s = sim.s;
    s.slots = [
      { t: 'tuft-clover', n: 3 },
      { t: null, n: 0 },
      { t: null, n: 0 },
      { t: 'cloverhead', n: 5 },
    ];
    s.sel = 0;
    expect(sim.stepWindow(1)).toBe(3);
    expect(sim.stepWindow(-1)).toBe(3);
    s.sel = 3;
    expect(sim.stepWindow(1)).toBe(0);
  });
});

// ---------------------------------------------------------------- P3

describe('P3: the feeder has a crosshair mark and says why it refuses', () => {
  it('with food chosen and a blow that would land in the hopper, the crosshair marks the feeder', () => {
    const sim = quiet();
    pen(sim, 1, ['feeder']);
    const h = padSpots(1).hopper;
    stand(sim, h.x + 1, h.z + 4.6);
    sim.s.slots[0] = { t: 'cloverhead', n: 4 };
    sim.s.sel = 0;
    const hy = sim.phys.floor(h.x, h.z) + h.y;
    // Search a little for an aim whose arc drops into the hopper.
    let found = false;
    for (let up = -0.4; up <= 1.6 && !found; up += 0.05) if (sim.aimTarget(aimAt(sim, h.x, hy + up, h.z)) === 'feeder') found = true;
    expect(found).toBe(true);
    // A feeder of two other foods: it bounces off and says so. (Round 10: a feeder holds up to two foods; it held one.)
    sim.s.pads[1].feeder = { t: 'sweetroot', n: 3, t2: 'dewberry', n2: 2 };
    const it = newItem(sim.s, 'cloverhead', h.x, hy, h.z);
    it.flyT = 0.1;
    it.blown = true;
    sim.s.items.push(it);
    for (let t = 0; t < 0.2; t += 1 / 30) sim.update(1 / 30, idle, ahead(sim));
    const said = sim.events.find((e): e is Extract<Ev, { t: 'feeder' }> => e.t === 'feeder');
    expect(said?.why).toBe('This feeder holds sweetroots and dewberries.');
  });

  it('every new line is eight words or fewer, uses the plain words, and no lesson line names a key on touch', () => {
    const lines = allLines().filter((l) => ['order', 'crowd', 'high', 'farm', 'stray'].includes(l.id)).map((l) => l.line);
    expect(lines).toContain('Take an order at the price board.');
    expect(lines).toContain('Keep ten or fewer downies in a pen.');
    expect(lines).toContain('Thistles need a high fence. Buy one.');
    expect(lines).toContain('Blow the downy into a pen.');
    for (const l of [...lines, ...GOALS.map((g) => g.text), 'Thistles visit the ridge top at dusk.', 'Order filled. New ones come at dawn.']) {
      expect(l.split(/\s+/).length, l).toBeLessThanOrEqual(8);
      expect(l, l).not.toMatch(/\b(down|puffs?|draws?|Exchange|pads?|canister|nettlebacks?|tufts?)\b/i);
      expect(l, l).not.toMatch(/[!\u2013\u2014]/);
    }
  });
});
