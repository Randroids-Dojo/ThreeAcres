// Thistledown's sixth harsh playtest ("The coins go meaningless on the first
// big rare (2,680 coins), upkeep punishes going out, and nothing pulls me to
// day 5."), as tests on the render-free sim and tutor: the first order lasts
// to the next dusk and keeps its tally on the page; the rare downy is a hunt
// (a clue, warier than any, lured with food, a reward that lasts, coins capped
// at the trip's, landmarks that rotate); the feeder before the first night; a
// day away leaves the pen in; strays wait by their gate; an empty Blow pushes a
// pest; a roaming pest leaves a corner. Every test here fails on the code the
// tester played (proved on a `git archive` copy of that commit); functions that
// commit lacked are reached through the module, so each test fails on its own.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOUR, PEN_UPS, type DownyKind } from '../src/games/ranch/defs';
import * as lessons from '../src/games/ranch/lessons';
import { LESSON_IDS, Tutor, type Say } from '../src/games/ranch/lessons';
import * as simMod from '../src/games/ranch/sim';
import { Sim, type Aim, type Controls, type Ev } from '../src/games/ranch/sim';
import { newItem, type Downy } from '../src/games/ranch/state';
import { PADS, PEN_R, SIGHTINGS, zoneAt } from '../src/games/ranch/world';
import { rng } from '../src/games/ranch/noise';

// Long sims (game days, ten real minutes) run well over the default 5 s on a loaded machine.
vi.setConfig({ testTimeout: 60_000 });

const realRandom = Math.random;
beforeEach(() => {
  Math.random = rng(61);
});
afterEach(() => {
  Math.random = realRandom;
});

const idle: Controls = { moveX: 0, moveZ: 0, sprint: false, jump: false, jumpPressed: false, draw: false, puff: false, puffPressed: false };
const touch: Say = { dev: 'touch', locked: false, lockAvailable: false };
// New in round 6: reached through the modules so a test fails alone on the played code.
const L = lessons as unknown as Record<string, (...a: unknown[]) => unknown>;
const M = simMod as unknown as Record<string, unknown>;

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

function run(sim: Sim, seconds: number, c: Controls = idle, aim?: () => Aim, evs?: Ev[]): void {
  for (let t = 0; t < seconds; t += 1 / 30) {
    sim.update(1 / 30, c, aim ? aim() : ahead(sim));
    if (evs) evs.push(...sim.events);
    sim.events.length = 0;
  }
}

/** A taught ranch at the morning: a clover pen of six, the gates open if asked. */
function morning(day: number, gates = false): Sim {
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

/** Drop a food on the ground at a spot, lying still. */
function lay(sim: Sim, type: 'cloverhead' | 'sweetroot' | 'dewberry', x: number, z: number): void {
  const it = newItem(sim.s, type, x, 0, z);
  it.y = sim.phys.floor(x, z) + it.r;
  it.grounded = true;
  // Yours: blown or tipped out.
  it.blown = true;
  sim.s.items.push(it);
}

/** The board's rare one taken: a gold clover by the old oak (sighting 0), on a morning, with the player at the ranch. */
function huntTaken(): { sim: Sim; d: Downy } {
  const sim = morning(3);
  sim.s.orders = [{ kind: 'clover', live: true, n: 1, got: 0, paid: 0, mult: 2, pay: 250, state: 'offer', rare: { spot: 0 } } as never];
  sim.takeOrder(0);
  sim.s.orderDay = sim.s.day;
  const d = sim.rareWild()!;
  d.hopT = 99;
  return { sim, d };
}

// ---------------------------------------------------------------- P1 1: the first order

describe('P1: the first order is no trap', () => {
  it('posted as the loop ends (16:54), taken at 17:38, it is still open past dusk and through the next day, and lapses only at the next dusk', () => {
    const sim = quiet(16.9);
    const s = sim.s;
    s.orderDay = 0;
    pen(sim, 1);
    fill(sim, 1, 'clover', 3);
    run(sim, 1);
    expect(s.orders.length).toBe(1);
    expect(s.orders[0].state).toBe('offer');
    s.hour = 17.63;
    expect(sim.takeOrder(0)).toBe(true);
    // Dusk on day 1 comes and goes (the playtest's lapsed at 19:00, 40 real seconds after it was taken).
    const evs: Ev[] = [];
    s.hour = 19.5;
    run(sim, 1, idle, undefined, evs);
    expect(s.orders[0].state).toBe('open');
    expect(evs.some((e) => e.t === 'order' && e.state === 'missed')).toBe(false);
    // The night, then the next morning's offers come beside it; taking one leaves it open.
    s.day = 2;
    s.hour = 6;
    s.night = 2;
    run(sim, 1);
    const first = s.orders.find((o) => o.state === 'open' && !o.live && o.n === 4);
    expect(first).toBeTruthy();
    expect(sim.offers().length).toBeGreaterThanOrEqual(2);
    expect(sim.takeOrder(0)).toBe(true);
    expect(s.orders.filter((o) => o.state === 'open').length).toBe(2);
    // It lapses at the second dusk.
    s.hour = 19.01;
    run(sim, 1);
    expect(first!.state).toBe('missed');
  });

  it('its tally stays on the journal page under any lesson line while it is open', () => {
    const sim = quiet(17.6);
    const s = sim.s;
    s.orderDay = 0;
    pen(sim, 1);
    fill(sim, 1, 'clover', 3);
    run(sim, 1);
    sim.takeOrder(0);
    const tally = L.orderTally as ((s: unknown, q: Say, line: string) => string[]) | undefined;
    expect(typeof tally).toBe('function');
    // Under the garden lesson, and under the dusk lesson.
    expect(tally!(s, touch, 'Tap Post at an empty plot, then Garden.')).toEqual(['Clover fluff, 0 of 4.']);
    expect(tally!(s, touch, 'Sleep at the front door till morning.')).toEqual(['Clover fluff, 0 of 4.']);
    // Never twice: not under a line that says the same.
    expect(tally!(s, touch, 'Clover fluff, 0 of 4.')).toEqual([]);
  });
});

// ---------------------------------------------------------------- P1 2: the rare downy is a hunt

describe('P1: the rare downy is a hunt', () => {
  it('a clue, not an arrow: the board says where it was seen; no arrow in its meadow until you are close, then one on it', () => {
    const { sim, d } = huntTaken();
    const s = sim.s;
    const sp = SIGHTINGS[0];
    expect(sim.offerTag(s.orders[0]).note).toMatch(/^By the old oak\. Pays [\d,]+, and stays$/);
    const floor = (x: number, z: number) => sim.phys.floor(x, z);
    const mark = { on: false, icon: 'arrow' as const, x: 0, y: 0, z: 0, rx: 0, rz: 0, r: 0, slot: -1 };
    // In the meadow, 40 m off: the clue only.
    stand(sim, sp.x, sp.z + 40);
    expect(zoneAt(s.player.x, s.player.z)).toBe('meadow');
    expect(lessons.orderLines(s)[0]).toBe('Find the gold clover by the old oak.');
    expect(lessons.orderSpot(s, mark as never, floor)).toBe(false);
    // Close (20 m): found. With nothing to lure it, the line says to bring its food; with clover heads aboard, to
    // blow some near it, and the arrow is on the downy itself.
    stand(sim, d.x, d.z + 20);
    run(sim, 0.1, idle, () => aimAt(sim, d.x, d.y, d.z));
    expect(lessons.orderLines(s)[0]).toBe('Bring clover heads to lure it.');
    s.slots[0] = { t: 'cloverhead', n: 6 };
    expect(lessons.orderLines(s)[0]).toBe('Blow clover heads near it.');
    expect(lessons.orderSpot(s, mark as never, floor)).toBe(true);
    expect(Math.hypot(mark.x - d.x, mark.z - d.z)).toBeLessThan(0.1);
  });

  it('warier than a plain downy: unlured, it hears a walker at 11 m and bolts, where a plain clover at 11 m does not notice', () => {
    const { sim, d } = huntTaken();
    const plain = sim.spawn('clover', d.x + 30, d.z, false);
    plain.hopT = 99;
    stand(sim, d.x, d.z + 11);
    run(sim, 0.3, idle, () => aimAt(sim, d.x, d.y, d.z));
    expect(d.alert).toBe(true);
    expect(d.bolt).toBeGreaterThan(0);
    stand(sim, plain.x, plain.z + 11);
    run(sim, 0.3, idle, () => aimAt(sim, plain.x, plain.y, plain.z));
    expect(plain.alert).toBe(false);
    // (The playtest's "shy of running" one let a walker within 5 m.)
    expect((M.RARE_WARY as { walk: number }).walk).toBeGreaterThan(simMod.NOTICE);
  });

  it('lured with its favourite food it comes to eat and lets you near; pulled in and blown into a pen it fills the order, pays no more than the trip, and stays', () => {
    const sim = morning(3);
    const s = sim.s;
    sim.postOrders(true);
    const trip = sim.offers().find((o) => o.live && !o.rare)!;
    const i = sim.offers().findIndex((o) => o.rare);
    const offer = sim.offers()[i];
    expect(offer.kind).toBe('clover');
    sim.takeOrder(i);
    const d = sim.rareWild()!;
    // Stand 15 m off and drop clover heads 6 m from it, between.
    const sp = { x: d.x, z: d.z };
    stand(sim, sp.x, sp.z + 15);
    lay(sim, 'cloverhead', sp.x, sp.z + 6);
    let ate = false;
    for (let t = 0; t < 12 && !ate; t += 1 / 30) {
      sim.update(1 / 30, idle, aimAt(sim, d.x, d.y, d.z));
      for (const e of sim.events) if (e.t === 'eat' && e.kind === 'clover' && !e.tame) ate = true;
      sim.events.length = 0;
    }
    expect(ate).toBe(true);
    // Lured, a walker 4 m off does not send it off.
    stand(sim, d.x, d.z + 4);
    run(sim, 0.3, idle, () => aimAt(sim, d.x, d.y, d.z));
    expect(d.bolt <= 0 || !d.alert).toBe(true);
    // A careful pull brings it in.
    for (let t = 0; t < 8 && !d.gone; t += 1 / 30) {
      const p = s.player;
      const dist = Math.hypot(d.x - p.x, d.z - p.z);
      if (dist > 4) stand(sim, d.x + ((p.x - d.x) / dist) * 3.5, d.z + ((p.z - d.z) / dist) * 3.5);
      sim.update(1 / 30, { ...idle, draw: true }, aimAt(sim, d.x, d.y + 0.25, d.z));
      sim.events.length = 0;
    }
    expect(s.slots.some((q) => (q.downs ?? []).some((r) => r.rare))).toBe(true);
    // Blown into the pen from the lane: the order fills and pays, and it stays in the pen.
    s.sel = s.slots.findIndex((q) => q.t === 'clover');
    stand(sim, PADS[1].x - 2.2, PADS[1].z + PEN_R + 3);
    const c0 = s.coins;
    const evs: Ev[] = [];
    const aim = aimAt(sim, PADS[1].x, sim.phys.floor(PADS[1].x, PADS[1].z) + 0.5, PADS[1].z);
    sim.update(1 / 30, { ...idle, puff: true, puffPressed: true }, aim);
    run(sim, 3, idle, () => aim, evs);
    const order = s.orders.find((o) => o.rare)!;
    expect(order.state).toBe('filled');
    expect(s.coins - c0).toBeGreaterThanOrEqual(order.pay);
    // Its coins are capped at about the trip's (the playtest's 2,680 was 3.8 times a 700 trip).
    expect(order.pay).toBeLessThanOrEqual(trip.n * trip.pay);
    const kept = s.downies.find((q) => !q.gone && q.rare && q.tame)!;
    expect(kept).toBeTruthy();
    expect(kept.pen).toBe(1);
  });

  it('it lasts: a pen with a rare one of yours in it sheds one more fluff a meal, for everyone in it', () => {
    const shedOf = (withRare: boolean) => {
      const sim = quiet(10);
      pen(sim, 1);
      const six = fill(sim, 1, 'clover', 4, 0.9);
      if (withRare) {
        const r = sim.spawn('clover', PADS[1].x, PADS[1].z + 1, true);
        r.rare = true;
        r.hunger = 0;
      }
      run(sim, 0.5);
      let n = 0;
      const evs: Ev[] = [];
      for (const d of six) lay(sim, 'cloverhead', d.x, d.z);
      run(sim, 4, idle, undefined, evs);
      for (const e of evs) if (e.t === 'shed') n += e.n;
      const meals = evs.filter((e) => e.t === 'eat' && e.tame).length;
      return n / Math.max(1, meals);
    };
    expect(shedOf(false)).toBe(2);
    expect(shedOf(true)).toBe(3);
  });

  it('its coins are never more than the day\'s trip, nor than a five-brook trip (700)', () => {
    for (let day = 2; day < 22; day++) {
      const sim = morning(day, day % 2 === 0);
      sim.postOrders(true);
      const r = sim.offers().find((o) => o.rare)!;
      const live = sim.offers().find((o) => o.live && !o.rare);
      expect(r).toBeTruthy();
      if (live) expect(r.pay).toBeLessThanOrEqual(live.n * live.pay);
      expect(r.pay).toBeLessThanOrEqual(700);
    }
  });

  it('the landmark rotates: never the same place two mornings running', () => {
    const sim = morning(2, true);
    const s = sim.s;
    let last = -1;
    let repeats = 0;
    const places = new Set<number>();
    for (let day = 2; day < 32; day++) {
      s.day = day;
      s.night = day;
      s.hour = 6;
      s.orderDay = 0;
      sim.postOrders(true);
      const r = sim.offers().find((o) => o.rare)!;
      if (r.rare!.spot === last) repeats++;
      last = r.rare!.spot;
      places.add(last);
    }
    expect(repeats).toBe(0);
    expect(places.size).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------- P1 3: going out no longer empties the ranch

describe('P1: going out no longer empties the ranch', () => {
  it('the feeder is taught before the garden and the first night, and is affordable then (288 coins after the loop)', () => {
    const sim = new Sim(null);
    sim.teaching = true;
    sim.wild = false;
    const s = sim.s;
    const done = LESSON_IDS.slice(0, LESSON_IDS.indexOf('farm') + 1);
    for (const id of ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'slots', 'meadow', 'farm', 'order', 'jump', 'run']) s.learn.push(`lesson:${id}`);
    expect(done).toContain('farm');
    s.learn.push('bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'slots', 'jump', 'appetite', 'orders', 'time');
    pen(sim, 1);
    fill(sim, 1, 'clover', 3);
    s.coins = 288;
    s.hour = 17.1;
    const tutor = new Tutor();
    const floor = (x: number, z: number) => sim.phys.floor(x, z);
    tutor.update(s, 1 / 30, touch, floor);
    const v = tutor.update(s, 1 / 30, touch, floor);
    expect(v.id).toBe('ups');
    expect(tutor.tag).toBe('pen:feeder');
    const feeder = PEN_UPS.find((u) => u.id === 'feeder')!;
    expect(feeder.cost).toBeLessThanOrEqual(s.coins);
    // And it comes before dusk does (18:18).
    expect(s.hour).toBeLessThan(18.3);
  });

  it('one day away (two trips and a hunt): a pen of six with a feeder and the garden beside it all stay in, day and night', () => {
    const sim = quiet(6);
    const s = sim.s;
    // The ranch as the lessons leave it: the starter garden (bare, no upgrades) beside the first pen, its feeder
    // filled with a jar's worth.
    s.pads[0].crop = 'cloverhead';
    s.pads[0].grow = 0;
    pen(sim, 1, ['feeder']);
    s.pads[1].feeder = { t: 'cloverhead', n: 12 };
    const six = fill(sim, 1, 'clover', 6, 0.3);
    // Away in the meadow all day and night (pests come at dark).
    stand(sim, -10, -30);
    let out = 0;
    for (let t = 0; t < 24 * HOUR; t += 1 / 20) {
      sim.update(1 / 20, idle, ahead(sim));
      sim.events.length = 0;
      if (Math.round(t * 20) % 200 === 0) out = Math.max(out, six.filter((d) => d.gone || sim.phys.penAt(d.x, d.z) !== 1).length);
    }
    out = Math.max(out, six.filter((d) => d.gone || sim.phys.penAt(d.x, d.z) !== 1).length);
    expect(out).toBe(0);
  });

  it('a stray waits by its pen gate rather than wandering into the meadow', () => {
    const sim = quiet(10);
    // (No crop on the starter garden next door: a hungry stray rightly goes to food it can see.)
    sim.s.pads[0].crop = null;
    pen(sim, 1);
    const post = PADS[1];
    // One just over the fence on the meadow side, hungry and restless (long neglected).
    const d = sim.spawn('clover', post.x + 1, post.z - PEN_R - 1.2, true);
    d.hunger = 1;
    d.starveT = 5;
    d.strayFrom = 1;
    d.pen = -1;
    let far = 0;
    let meadow = false;
    for (let t = 0; t < 180; t += 1) {
      run(sim, 1);
      if (d.gone || d.pen >= 0) break;
      // After working its way round the pen, it keeps within a few steps of the post (the pen's gate).
      if (t > 20) far = Math.max(far, Math.hypot(d.x - post.px, d.z - post.pz));
      meadow ||= zoneAt(d.x, d.z) !== 'ranch';
    }
    expect(meadow).toBe(false);
    expect(far).toBeLessThan(3.5);
  });
});

// ---------------------------------------------------------------- P2: Blow with an empty jar

describe('P2: an empty Blow still pushes a puff of air at a pest', () => {
  it('a pest 3.5 m ahead goes rolling off, with no "Nothing in the jar."', () => {
    const sim = quiet(22);
    const s = sim.s;
    stand(sim, 6, 33);
    s.nettles.push({ id: 999, x: 6, y: sim.phys.floor(6, 29.5), z: 29.5, vx: 0, vy: 0, vz: 0, r: 0.35, grounded: true, yaw: 0, mode: 'roam', modeT: 10, tx: 6, tz: 29.5, bristle: 0, roll: 0, gone: false, snuffT: 9 });
    const n = s.nettles[0];
    const evs: Ev[] = [];
    const aim = aimAt(sim, n.x, n.y + 0.3, n.z);
    sim.update(1 / 30, { ...idle, puff: true, puffPressed: true }, aim);
    evs.push(...sim.events);
    sim.events.length = 0;
    expect(n.mode).toBe('roll');
    expect(evs.some((e) => e.t === 'nettlehit')).toBe(true);
    expect(evs.some((e) => e.t === 'deny' && e.why === 'Nothing in the jar.')).toBe(false);
    run(sim, 0.6, idle, () => aim);
    expect(Math.hypot(n.x - 6, n.z - 29.5)).toBeGreaterThan(1.5);
  });
});

// ---------------------------------------------------------------- P3: a roaming pest leaves a corner

describe('P3: a roaming pest does not sit in a corner', () => {
  it('with fluff lying past the east wall, a pest by the north-east corner goes about the ranch rather than sitting in a corner for an hour', () => {
    const sim = quiet(22);
    const s = sim.s;
    pen(sim, 1);
    stand(sim, -12, 36);
    const it = newItem(s, 'tuft-clover', 40, 0, 21);
    it.y = sim.phys.floor(40, 21) + 0.1;
    it.grounded = true;
    s.items.push(it);
    s.nettles.push({ id: 999, x: 35.6, y: sim.phys.floor(35.6, 18.4), z: 18.4, vx: 0, vy: 0, vz: 0, r: 0.35, grounded: true, yaw: 0, mode: 'roam', modeT: 5, tx: 40, tz: 14, bristle: 0, roll: 0, gone: false, snuffT: 9 });
    const n = s.nettles[0];
    const corners = [
      [36, 18],
      [36, 58],
    ];
    let inCorner = 0;
    // A game hour and a half, the night held.
    for (let t = 0; t < 1.5 * HOUR; t += 1 / 30) {
      s.hour = 22;
      sim.update(1 / 30, idle, ahead(sim));
      sim.events.length = 0;
      if (corners.some(([x, z]) => Math.hypot(n.x - x, n.z - z) < 3)) inCorner += 1 / 30;
    }
    expect(inCorner).toBeLessThan(8);
    expect(n.x).toBeLessThan(33);
  });
});
