// Thistledown's seventh harsh playtest ("By day 4 my routine was: take the
// biggest offer, catch everything in under 3 s, hold Pull, hold Blow."), as
// tests on the render-free sim and tutor: the tug is a skill you read (it pulls
// back, holding on slips it free, letting go brings it in, taught in one line);
// the first evening puts its lessons up 30 s apart and none after 7 pm but the
// night's, the garden waiting for the morning; no second rare one for a pen
// that has one, and its tag says what it is worth; the hunt shows its fed window
// and says when it ends, and the landmarks are each the only one of their kind;
// sleeping in the morning skips no day; a garden tips only part of its crop into
// a feeder; a thistle blown at a high pen's floor lands in it; an empty feeder is
// called out at dusk. (The pest sweep is in tests/ranch-pest-sweep.test.ts.)
// Every test here fails on the code the tester played (proved on a `git archive`
// copy of that commit); what that commit lacked is reached through the modules,
// so each test fails on its own assertion.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOUR, type DownyKind } from '../src/games/ranch/defs';
import { Tutor, type Say } from '../src/games/ranch/lessons';
import * as simMod from '../src/games/ranch/sim';
import { Sim, type Aim, type Controls, type Ev } from '../src/games/ranch/sim';
import { newItem, type Downy } from '../src/games/ranch/state';
import { DOOR, PADS, PEN_R, SIGHTINGS, crossings, RIDGE_X, HOLLOW_X, RANCH_Z } from '../src/games/ranch/world';
import { rng } from '../src/games/ranch/noise';
import * as catchMod from '../scripts/ranch-catch';

// Long sims (game days) and the catch harness run well over the default 5 s on a loaded machine.
vi.setConfig({ testTimeout: 120_000 });

const realRandom = Math.random;
beforeEach(() => {
  Math.random = rng(71);
});
afterEach(() => {
  Math.random = realRandom;
});

const idle: Controls = { moveX: 0, moveZ: 0, sprint: false, jump: false, jumpPressed: false, draw: false, puff: false, puffPressed: false };
const touch: Say = { dev: 'touch', locked: false, lockAvailable: false };
// New in round 7: reached through the modules so a test fails alone on the played code.
const M = simMod as unknown as Record<string, unknown>;
const C = catchMod as unknown as Record<string, unknown>;

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

// ---------------------------------------------------------------- P1 2: the tug, a skill you read

describe('P1: the tug is a skill you read: it pulls back, holding on slips it free, letting go brings it in', () => {
  /** A wild clover 4.5 m off on open meadow, and you facing it. */
  function clover() {
    const sim = quiet(10);
    stand(sim, -16, -4.5);
    const d = sim.spawn('clover', -16, -9, false);
    d.y = sim.phys.floor(d.x, d.z);
    d.hunger = 0.2;
    d.hopT = 99;
    return { sim, s: sim.s, d };
  }

  it('it pulls back now and then (an event, for the ring and a sound); held through, it slips free a few metres off, still there to try again', () => {
    const { sim, s, d } = clover();
    const evs: Ev[] = [];
    const from = { x: d.x, z: d.z };
    let backAt = -1;
    let t = 0;
    for (; t < 6 && backAt < 0; t += 1 / 30) {
      run(sim, 1 / 30, { ...idle, draw: true }, () => aimAt(sim, d.x, d.y + 0.25, d.z), evs);
      if ((d as Downy & { back: number }).back > 0) backAt = t;
    }
    expect(backAt, 'it pulled back').toBeGreaterThan(0);
    expect(evs.some((e) => (e.t as string) === 'pullback')).toBe(true);
    // Hold on through it: it slips free.
    for (let k = 0; k < 2.5 * 30 && !evs.some((e) => (e.t as string) === 'slip'); k++) run(sim, 1 / 30, { ...idle, draw: true }, () => aimAt(sim, d.x, d.y + 0.25, d.z), evs);
    expect(evs.some((e) => (e.t as string) === 'slip'), 'held through its pull, it slipped free').toBe(true);
    run(sim, 1.2);
    // Not lost: still in the world, a few metres from where the fight was, and not in the jar.
    expect(d.gone).toBe(false);
    expect(s.slots.some((q) => q.t === 'clover')).toBe(false);
    expect(Math.hypot(d.x - from.x, d.z - from.z)).toBeGreaterThan(1.5);
    expect(evs.some((e) => e.t === 'escape')).toBe(false);
  });

  it('letting go of Pull while it pulls back, and pressing again once it stops, brings it in', () => {
    const { sim, s, d } = clover();
    const evs: Ev[] = [];
    let t = 0;
    for (; t < 10 && !d.gone; t += 1 / 30) {
      const back = (d as Downy & { back: number }).back > 0;
      run(sim, 1 / 30, { ...idle, draw: !back }, () => aimAt(sim, d.x, d.y + 0.25, d.z), evs);
    }
    expect(d.gone).toBe(true);
    expect(s.slots.some((q) => q.t === 'clover')).toBe(true);
    expect(evs.some((e) => (e.t as string) === 'slip')).toBe(false);
    // It did pull back, and you eased off through it.
    expect(evs.some((e) => (e.t as string) === 'eased' && (e as unknown as { eased: boolean }).eased)).toBe(true);
  });

  it('taught in play in one line with the button word; until learned its pull back waits for you to let go', () => {
    const sim = quiet(16.5);
    sim.teaching = true;
    const s = sim.s;
    for (const id of ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'slots', 'jump', 'run']) s.learn.push(`lesson:${id}`);
    for (const f of ['bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'slots', 'jump']) s.learn.push(f);
    const tutor = new Tutor();
    const floor = (x: number, z: number) => sim.phys.floor(x, z);
    let view = tutor.update(s, 0, touch, floor);
    stand(sim, -16, -4.5);
    const d = sim.spawn('clover', -16, -9, false);
    d.y = sim.phys.floor(d.x, d.z);
    d.hopT = 99;
    const go = (secs: number, draw: () => boolean) => {
      for (let t = 0; t < secs; t += 1 / 30) {
        sim.update(1 / 30, { ...idle, draw: draw() }, aimAt(sim, d.x, d.y + 0.25, d.z));
        for (const e of sim.events) tutor.onEvent(s, e);
        sim.events.length = 0;
        view = tutor.update(s, 1 / 30, touch, floor);
      }
    };
    let k = 0;
    while (!((d as Downy & { back: number }).back > 0) && k++ < 300) go(1 / 30, () => true);
    go(0.1, () => true);
    expect(tutor.current).toBe('ease');
    expect(view.line).toBe('Let go of Pull when it pulls back.');
    expect(view.line.split(' ').length).toBeLessThanOrEqual(8);
    // Held 2 s (a new player reading the line): still pulling back, not slipped.
    go(1.9, () => true);
    expect((d as Downy & { back: number }).back > 0).toBe(true);
    expect(d.gone).toBe(false);
    // Let go: it stops, the line ticks, and pressing again brings it in.
    go(1, () => false);
    expect(view.done || Tutor.finished(s, 'ease')).toBe(true);
    go(8, () => !((d as Downy & { back: number }).back > 0));
    expect(Tutor.finished(s, 'ease')).toBe(true);
    expect(d.gone).toBe(true);
  });

  it('per kind, careless and careful thumbs catch at the duel rates, and holding on through every pull back fails', () => {
    // (Round 8 made the tug a duel, with its own bands: tests/ranch-round8.test.ts. Here the round 7 promise
    // that holding on through every pull back fails, and that a careful thumb lands every plain kind.)
    const rate = C.catchRate as (k: DownyKind, t: unknown, n: number, seed?: number, rare?: string) => { first: number; rate: number; fight: number };
    const CAREFUL = C.CAREFUL;
    const HOLDER = C.HOLDER;
    expect(HOLDER, 'a thumb that never reads the tug, for the control').toBeTruthy();
    for (const k of ['clover', 'ember', 'brook', 'thistle'] as DownyKind[]) {
      expect(rate(k, CAREFUL, 60).first, `${k} careful first try`).toBeGreaterThanOrEqual(0.85);
      expect(rate(k, HOLDER, 30).first, `${k} holding on`).toBeLessThanOrEqual(0.1);
    }
  });
});

// ---------------------------------------------------------------- P1 3: the first evening, one thing at a time

describe('P1: the first evening puts its lessons up 30 s apart, none after 7 pm but the night\'s, and the garden waits for morning', () => {
  it('an eager player through the first evening: order, feeder, filling it, dusk and night, each 30 s or more after the last (round 10: but none waits with the clock held at 6 pm)', () => {
    const sim = quiet(16.5);
    sim.teaching = true;
    const s = sim.s;
    s.orderDay = 0;
    // The loop lesson just ended: everything before it learned, the clock and the orders let in.
    for (const id of ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'slots', 'meadow', 'jump', 'run', 'ease', 'farm']) s.learn.push(`lesson:${id}`);
    for (const f of ['bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'slots', 'jump', 'appetite', 'ease', 'orders', 'time']) s.learn.push(f);
    pen(sim, 1);
    fill(sim, 1, 'clover', 3, 0.3);
    // Coins for the feeder and the garden both (the playtest's garden lesson came at 23:30).
    s.coins = 420;
    stand(sim, -6.5, 33);
    const tutor = new Tutor();
    const floor = (x: number, z: number) => sim.phys.floor(x, z);
    const begins: { id: string; t: number; hour: number; day: number }[] = [];
    let last = '';
    let t = 0;
    let feederDone = -1;
    let heldBare = 0;
    for (; t < 400; t += 1 / 30) {
      sim.update(1 / 30, idle, ahead(sim));
      for (const e of sim.events) tutor.onEvent(s, e);
      sim.events.length = 0;
      const v = tutor.update(s, 1 / 30, touch, floor);
      if (sim.clockHeld && s.hour >= 18 && !v.line) heldBare += 1 / 30;
      if (v.line && !v.done && v.id !== last) {
        begins.push({ id: v.id, t, hour: s.hour, day: s.day });
        last = v.id;
      }
      if (!v.line) last = '';
      // The eager player does each thing the moment its line is up.
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
      if (feederDone < 0 && Tutor.finished(s, 'feeder')) feederDone = s.hour;
      if (begins.some((b) => b.id === 'night')) break;
    }
    const ids = begins.map((b) => b.id);
    expect(ids).toEqual(['order', 'ups', 'feeder', 'dusk', 'night']);
    // No two new lesson lines within 30 real seconds of each other, but while the clock waits at 6 pm (round 10: the
    // spacing stops lines piling up; with the clock held it only made you wait, about 30 s twice with no line).
    const held = (b: { hour: number; day: number }) => b.day === 1 && b.hour >= 18 && b.hour < 18.31;
    for (let i = 1; i < begins.length; i++) if (!held(begins[i]) && !held(begins[i - 1])) expect(begins[i].t - begins[i - 1].t, `${begins[i - 1].id} to ${begins[i].id}`).toBeGreaterThanOrEqual(29.99);
    expect(heldBare, 'seconds held at 6 pm with no line').toBeLessThan(2.5);
    // None after 7 pm but the night's; the feeder filled before dusk came (dusk waited at 6 pm).
    for (const b of begins) if (b.id !== 'night') expect(b.hour < 19 && b.day === 1, `${b.id} at ${b.hour.toFixed(2)}`).toBe(true);
    expect(feederDone).toBeGreaterThan(0);
    expect(feederDone).toBeLessThan(18.3);
    // The garden waits for the morning: coins enough all evening, but no garden line on day 1.
    expect(ids).not.toContain('garden');
    s.day = 2;
    s.night = 2;
    s.hour = 6.2;
    for (let k = 0; k < 60; k++) {
      sim.update(1 / 30, idle, ahead(sim));
      for (const e of sim.events) tutor.onEvent(s, e);
      sim.events.length = 0;
      tutor.update(s, 1 / 30, touch, floor);
    }
    expect(tutor.current).toBe('garden');
  });
});

// ---------------------------------------------------------------- P2: the rare one

describe('P2: no second rare one for a pen that has one, and the tag says what one is worth', () => {
  /** A taught ranch at the morning, gates open, a clover pen of six. */
  function morning(day: number): Sim {
    const sim = quiet(6);
    const s = sim.s;
    s.day = day;
    s.night = day;
    s.orderDay = 0;
    s.gates.ridge = s.gates.hollow = true;
    sim.phys.gates = { ...s.gates };
    pen(sim, 1);
    fill(sim, 1, 'clover', 6);
    return sim;
  }

  it('with a rare one already in its only pen, the board offers no rare one, morning after morning', () => {
    let offered = 0;
    for (let day = 2; day < 14; day++) {
      const sim = morning(day);
      sim.s.downies.find((d) => d.pen === 1)!.rare = true;
      sim.postOrders(true);
      if (sim.offers().some((o) => o.rare)) offered++;
    }
    expect(offered).toBe(0);
    // A second pen without one: offered again.
    let again = 0;
    for (let day = 2; day < 14; day++) {
      const sim = morning(day);
      sim.s.downies.find((d) => d.pen === 1)!.rare = true;
      pen(sim, 2);
      fill(sim, 2, 'ember', 5);
      sim.postOrders(true);
      if (sim.offers().some((o) => o.rare)) again++;
    }
    expect(again).toBeGreaterThan(6);
  });

  it("the rare one's tag puts a number on what it adds: so many coins by the week's end, from the pen it would join", () => {
    const sim = morning(3);
    sim.postOrders(true);
    const r = sim.offers().find((o) => o.rare);
    expect(r).toBeTruthy();
    const note = sim.offerTag(r!).note;
    // (Round 9: over the days left in the week, not "a day". Round 10: over five days, the pen's extra fluff capped at
    // RARE_EXTRA a day: "then 140 more today" on a week's last day read as paying later today.)
    const m = /then ([\d,]+) over 5 days$/.exec(note);
    expect(m, note).toBeTruthy();
    // Six clovers, one more fluff a meal each, about 3.7 meals a day, up to five more fluff a day, at today's clover price.
    const want = Math.round((Math.min(6 * 3.7, 5) * sim.price('clover')) / 10) * 10;
    expect(Number(m![1].replace(/,/g, ''))).toBe(Math.round((want * 5) / 10) * 10);
  });
});

describe('P2: the hunt shows its fed window, says when it ends, and its landmarks are each the only one of their kind', () => {
  /** The board's rare clover taken (by the old oak), you standing 10 m off it with clover heads lying near it. */
  function hunt() {
    const sim = quiet(7);
    const s = sim.s;
    s.orderDay = s.day;
    s.orders = [{ kind: 'clover', live: true, n: 1, got: 0, paid: 0, mult: 2, pay: 150, state: 'offer', rare: { spot: 0 } }];
    pen(sim, 1);
    fill(sim, 1, 'clover', 3);
    sim.takeOrder(0);
    const d = sim.rareWild()!;
    run(sim, 0.5, idle);
    stand(sim, d.x, d.z + 14);
    return { sim, s, d };
  }

  it('lured, a ring over it shows its fed window: full while it goes to its food and eats, then emptying; gone, it says "It finished eating."', () => {
    const rareFed = M.rareFed as ((d: Downy) => number) | undefined;
    expect(typeof rareFed).toBe('function');
    const { sim, s, d } = hunt();
    expect(rareFed!(d)).toBe(-1);
    const it = newItem(s, 'cloverhead', d.x + 3, 0, d.z + 2.5);
    it.y = sim.phys.floor(it.x, it.z) + it.r;
    it.grounded = true;
    it.blown = true;
    s.items.push(it);
    run(sim, 0.4, idle, () => aimAt(sim, d.x, d.y, d.z));
    expect(rareFed!(d)).toBe(1);
    // It eats; then the window empties as its calm runs out.
    const evs: Ev[] = [];
    let ate = -1;
    const shares: number[] = [];
    for (let t = 0; t < 20; t += 1 / 30) {
      run(sim, 1 / 30, idle, () => aimAt(sim, d.x, d.y, d.z), evs);
      if (ate < 0 && evs.some((e) => e.t === 'eat' && !e.tame)) ate = t;
      if (ate >= 0) shares.push(rareFed!(d));
      if (evs.some((e) => (e.t as string) === 'unlured')) break;
    }
    expect(ate).toBeGreaterThanOrEqual(0);
    const falling = shares.filter((v) => v >= 0 && v < 1);
    expect(falling.length).toBeGreaterThan(30);
    expect(falling.every((v, i) => i === 0 || v <= falling[i - 1] + 1e-9)).toBe(true);
    const un = evs.find((e) => (e.t as string) === 'unlured') as unknown as { near: boolean } | undefined;
    expect(un, 'its window running out is told').toBeTruthy();
    expect(un!.near).toBe(true);
    expect(rareFed!(d)).toBe(-1);
  });

  it('lured, it hurries to its food: from about 5 m it is eating within 3 s (the playtest stood 10 to 13 s waiting)', () => {
    const { sim, s, d } = hunt();
    const it = newItem(s, 'cloverhead', d.x + 4, 0, d.z + 3);
    it.y = sim.phys.floor(it.x, it.z) + it.r;
    it.grounded = true;
    it.blown = true;
    s.items.push(it);
    const evs: Ev[] = [];
    let t = 0;
    for (; t < 12 && !evs.some((e) => e.t === 'eat' && !e.tame); t += 1 / 30) run(sim, 1 / 30, idle, () => aimAt(sim, d.x, d.y, d.z), evs);
    // (Round 9: 3.5 s, as its hops' draws moved with the world's; it was 10 to 13 s.)
    expect(t).toBeLessThan(3.5);
  });

  it('each landmark in a clue is the only one of its kind you can see: no "footbridge", the meadow having two', () => {
    const names = SIGHTINGS.map((q) => q.name);
    expect(new Set(names).size).toBe(names.length);
    const meadowBridges = crossings().filter((c) => c.x > RIDGE_X && c.x < HOLLOW_X && c.z < RANCH_Z);
    expect(meadowBridges.length).toBeGreaterThan(1);
    expect(names.some((n) => /bridge/.test(n))).toBe(false);
  });
});

// ---------------------------------------------------------------- P2: sleep, and gardens

describe('P2: sleeping in the morning skips no day, and the door offers sleep only from 6 pm to 5:30 am', () => {
  it('at 08:12 sleep changes nothing and the door offers no sleep; at 10 pm, to the next 6 am; after midnight, to this 6 am', () => {
    const sim = quiet(8.2);
    const s = sim.s;
    s.day = 3;
    s.night = 3;
    sim.sleep();
    expect(s.day).toBe(3);
    expect(s.hour).toBeCloseTo(8.2, 5);
    stand(sim, DOOR.x, DOOR.z - 1.4);
    const aim = aimAt(sim, DOOR.x, sim.phys.floor(DOOR.x, DOOR.z) + 1.4, DOOR.z);
    expect(sim.interactable(aim)?.kind).not.toBe('door');
    s.hour = 22;
    expect(sim.interactable(aim)?.kind).toBe('door');
    sim.sleep();
    expect(s.day).toBe(4);
    expect(s.hour).toBe(6);
    s.hour = 2;
    sim.sleep();
    expect(s.day).toBe(4);
    expect(s.hour).toBe(6);
  });
});

describe('P2: a garden tips only part of its crop into the feeder next door, so a feeder still wants topping up', () => {
  it('a pen of six beside the bare starter garden, its bed full, nobody tending: the full feeder runs down over two days', () => {
    const sim = quiet(6);
    const s = sim.s;
    s.pads[0].kind = 'garden';
    s.pads[0].crop = 'cloverhead';
    s.pads[0].grow = 0;
    pen(sim, 1, ['feeder']);
    fill(sim, 1, 'clover', 6, 0.3);
    s.pads[1].feeder = { t: 'cloverhead', n: 60 };
    for (let k = 0; k < 12; k++) {
      const it = newItem(s, 'cloverhead', PADS[0].x + (k % 4) - 1.5, 0, PADS[0].z + Math.floor(k / 4) - 1, 1000);
      it.y = sim.phys.floor(it.x, it.z) + it.r;
      it.rest = true;
      s.items.push(it);
    }
    let tipped = 0;
    for (let t = 0; t < 2 * 24 * HOUR; t += 1 / 20) {
      sim.update(1 / 20, idle, ahead(sim));
      for (const e of sim.events) if (e.t === 'store' && e.auto) tipped++;
      sim.events.length = 0;
    }
    // It still helps (some tips in), but the feeder falls: the playtest's read 58 to 60 every day for a week.
    expect(tipped).toBeGreaterThan(3);
    expect(s.pads[1].feeder.n).toBeLessThan(45);
    expect(s.downies.filter((d) => !d.gone && d.pen === 1).length).toBe(6);
  });
});

// ---------------------------------------------------------------- P3: the cheap ones

describe('P3: a thistle aimed at a high pen\'s floor lands in it; an empty feeder is called out at dusk', () => {
  it('a thistle blown at a high-fence pen\'s floor from 2 to 6 m back lands in it, and the pen mark said so from the floor aim', () => {
    for (const back of [2, 4, 6]) {
      const sim = quiet(19);
      const s = sim.s;
      pen(sim, 1, ['high']);
      const at = PADS[1];
      stand(sim, at.x, at.z + PEN_R + back);
      s.slots[0] = { t: 'thistle', n: 1 };
      s.sel = 0;
      const aim = aimAt(sim, at.x, sim.phys.floor(at.x, at.z), at.z);
      expect(sim.aimTarget(aim), `the mark from ${back} m`).toBe('pen');
      sim.puff(aim);
      const d = s.downies[s.downies.length - 1];
      for (let t = 0; t < 3 && !(d.grounded && d.flyT < 0); t += 1 / 60) sim.update(1 / 60, idle, aim);
      expect(sim.phys.penAt(d.x, d.z), `landed from ${back} m`).toBe(1);
    }
  });

  it('at dusk a pen with downies and an empty feeder is called out, once; a stocked one is not', () => {
    const sim = quiet(18.2);
    const s = sim.s;
    pen(sim, 1, ['feeder']);
    fill(sim, 1, 'clover', 4, 0.3);
    pen(sim, 2, ['feeder']);
    fill(sim, 2, 'clover', 4, 0.3);
    s.pads[2].feeder = { t: 'cloverhead', n: 20 };
    const evs: Ev[] = [];
    run(sim, 30, idle, undefined, evs);
    const said = evs.filter((e) => (e.t as string) === 'hungrynight') as unknown as { pen: number; feeder: boolean }[];
    expect(said.length).toBe(1);
    expect(said[0].pen).toBe(1);
    expect(said[0].feeder).toBe(true);
  });
});
