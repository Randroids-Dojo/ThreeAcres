// Thistledown's fourth harsh playtest ("Catching embers and thistles is fun
// for about a day, then it's upkeep"), as tests on the render-free sim and
// tutor: live-downy orders, a morning's orders as a choice, the first order at
// the loop's end, a tug that beats food in the cone, one window for every
// fluff, the first pen beside the starter garden, the high fence taught at the
// first thistle, and the cheaper fixes. 19 of its 20 fail on the code the
// tester played (proved on a `git archive` copy of that commit); the 20th is
// a control (the crate takes no downy without a live order, then and now).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CAPS, FLUFF_ROOM, KIND_TUFT, LIVE_EACH, journalGoals, type DownyKind } from '../src/games/ranch/defs';
import { Tutor, goalText, orderLines, type Say } from '../src/games/ranch/lessons';
import { TagChoice } from '../src/games/ranch/menu';
import { Sim, padSpots, type Aim, type Controls, type Ev } from '../src/games/ranch/sim';
import { deserialize, newItem, serialize } from '../src/games/ranch/state';
import { BOARD, EXCHANGE, PADS, POND } from '../src/games/ranch/world';
import { rng } from '../src/games/ranch/noise';

const realRandom = Math.random;
beforeEach(() => {
  Math.random = rng(41);
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
  const go = (seconds: number, c: Controls = idle, aim?: Aim) => {
    for (let t = 0; t < seconds; t += 1 / 30) {
      sim.update(1 / 30, c, aim ?? ahead(sim));
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
const TO_FARM = [...TO_MEADOW, 'meadow', 'jump'];
const TO_FARM_F = [...TO_MEADOW_F, 'time', 'jump'];
const PAST_ORDER = [...TO_FARM, 'farm', 'order'];
const PAST_ORDER_F = [...TO_FARM_F, 'orders'];

/** A taught ranch at the morning: pens of these kinds (six of each), both gates open. */
function morning(kinds: DownyKind[], day: number, hollow = true): Sim {
  const sim = quiet(6);
  const s = sim.s;
  s.day = day;
  s.gates.ridge = true;
  s.gates.hollow = hollow;
  sim.phys.gates = { ...s.gates };
  kinds.forEach((k, i) => {
    pen(sim, [1, 2, 4, 5][i], k === 'thistle' ? ['high'] : []);
    fill(sim, [1, 2, 4, 5][i], k, k === 'thistle' ? 3 : 6);
  });
  return sim;
}

// ---------------------------------------------------------------- P1: live-downy orders

describe('P1: orders for live downies, blown into the sell crate', () => {
  it('the board offers live downies to catch; blown into the crate, each pays and the last fills the order', () => {
    let tried = 0;
    for (let seed = 1; seed < 40 && !tried; seed++) {
      Math.random = rng(seed);
      const sim = morning(['clover'], 3, false);
      const s = sim.s;
      sim.postOrders(true);
      const i = sim.offers().findIndex((o) => o.live && o.kind === 'ember');
      if (i < 0) continue;
      tried++;
      const offer = sim.offers()[i];
      expect(offer.n).toBeGreaterThanOrEqual(2);
      expect(offer.pay).toBe(LIVE_EACH.ember);
      expect(sim.takeOrder(i)).toBe(true);
      const o = sim.order!;
      expect(o.live).toBe(true);
      // Embers caught (in the jar), blown from the lane into the crate: the crosshair says it would sell.
      for (let k = 0; k < o.n; k++) sim.stow('ember');
      s.sel = s.slots.findIndex((q) => q.t === 'ember');
      stand(sim, EXCHANGE.x, EXCHANGE.z - 4.2);
      const aim = aimAt(sim, EXCHANGE.x, sim.phys.floor(EXCHANGE.x, EXCHANGE.z) + 0.9, EXCHANGE.z);
      expect(sim.aimTarget(aim)).toBe('sell');
      const c0 = s.coins;
      const evs: Ev[] = [];
      for (let k = 0; k < o.n; k++) {
        sim.update(1 / 30, { ...idle, puff: true, puffPressed: true }, aim);
        run(sim, 1.2, idle, aim, evs);
      }
      run(sim, 2, idle, aim, evs);
      expect(evs.filter((e) => e.t === 'deliver').length).toBe(o.n);
      expect(o.got).toBe(o.n);
      expect(o.state).toBe('filled');
      expect(evs.filter((e): e is Extract<Ev, { t: 'deliver' }> => e.t === 'deliver').reduce((a, e) => a + e.coins, 0)).toBe(o.n * LIVE_EACH.ember);
      expect(s.coins - c0).toBeGreaterThanOrEqual(o.n * LIVE_EACH.ember);
      expect(s.goals).toContain('order');
      expect(s.downies.filter((d) => !d.gone && d.kind === 'ember').length).toBe(0);
      expect(orderLines(s)).toEqual(['Order filled. New ones come at dawn.']);
    }
    expect(tried).toBe(1);
  });

  // A control: true of the code that was played too.
  it('without a live order the crate takes no downy, and the crosshair does not say it would', () => {
    const sim = morning(['clover'], 3, false);
    const s = sim.s;
    sim.stow('clover');
    s.sel = s.slots.findIndex((q) => q.t === 'clover');
    stand(sim, EXCHANGE.x, EXCHANGE.z - 4.2);
    const aim = aimAt(sim, EXCHANGE.x, sim.phys.floor(EXCHANGE.x, EXCHANGE.z) + 0.9, EXCHANGE.z);
    expect(sim.aimTarget(aim)).not.toBe('sell');
    const c0 = s.coins;
    sim.update(1 / 30, { ...idle, puff: true, puffPressed: true }, aim);
    run(sim, 2, idle, aim);
    expect(s.coins).toBe(c0);
    expect(s.downies.some((d) => !d.gone && d.kind === 'clover' && d.pen < 0)).toBe(true);
  });

  it('a live order taken for the first time is taught: catch one for the order, then blow it into the sell crate', () => {
    const { sim, s, tutor, go, view } = ranch(PAST_ORDER, PAST_ORDER_F);
    s.day = 3;
    s.hour = 7;
    s.night = 3;
    s.gates.ridge = true;
    pen(sim, 1);
    fill(sim, 1, 'clover', 6, 0.1);
    s.orders = [{ kind: 'ember', live: true, n: 2, got: 0, paid: 0, mult: 2, pay: LIVE_EACH.ember, state: 'open' }];
    s.orderDay = 3;
    go(0.5);
    expect(tutor.current).toBe('live');
    expect(view().line).toBe('Catch an ember downy for the order.');
    sim.stow('ember');
    go(0.5);
    expect(view().line).toBe('Blow the downy into the sell crate.');
    expect(Math.hypot(tutor.mark.x - EXCHANGE.x, tutor.mark.z - EXCHANGE.z)).toBeLessThan(0.3);
    expect(sim.sellDowny('ember')).toBe(LIVE_EACH.ember);
    go(0.2);
    expect(view().done).toBe(true);
    go(2);
    expect(Tutor.finished(s, 'live')).toBe(true);
    expect(orderLines(s)).toEqual(['Ember downies, 1 of 2.']);
  });
});

// ---------------------------------------------------------------- P1: a morning's orders are a choice

describe('P1: each morning the board offers a choice, with trade-offs', () => {
  it('two or three offers of different kinds of work; taking one at the board wipes the others', () => {
    let both = 0;
    for (let day = 2; day < 22; day++) {
      const sim = morning(['clover', 'ember'], day);
      sim.postOrders(true);
      const offers = sim.offers();
      expect(offers.length).toBeGreaterThanOrEqual(2);
      expect(new Set(offers.map((o) => `${o.kind}${o.live}`)).size).toBe(offers.length);
      if (offers.some((o) => o.live) && offers.some((o) => !o.live)) both++;
      // Taken at the board's tags: one order for the day, the rest wiped off, and the board has nothing more to offer.
      stand(sim, BOARD.x, BOARD.z - 2.4);
      const it = sim.interactable(aimAt(sim, BOARD.x, sim.phys.floor(BOARD.x, BOARD.z) + 1.6, BOARD.z));
      expect(it?.kind).toBe('board');
      const tags = sim.menu(it!);
      expect(tags.length).toBe(offers.length);
      for (const t of tags) expect(t.note).toMatch(/^Earns [\d,]+ (more )?by dusk$/);
      expect(sim.choose(it!, tags[tags.length - 1].id)).toBe(true);
      expect(sim.s.orders.length).toBe(1);
      expect(sim.s.orders[0].state).toBe('open');
      expect(sim.offers().length).toBe(0);
      expect(sim.interactable(aimAt(sim, BOARD.x, sim.phys.floor(BOARD.x, BOARD.z) + 1.6, BOARD.z))?.kind).not.toBe('board');
    }
    // A stay-at-home fluff order against a trip out for downies, nearly every morning.
    expect(both).toBeGreaterThanOrEqual(18);
  });

  it('a trip for live downies is worth about what the fluff order adds, so neither always wins', () => {
    const ratios: number[] = [];
    for (let day = 2; day < 32; day++) {
      const sim = morning(['clover', 'ember', 'brook'], day);
      sim.postOrders(true);
      const fluff = sim.offers().find((o) => !o.live);
      const live = sim.offers().find((o) => o.live);
      if (!fluff || !live) continue;
      // Against a plain order's worth (a prized one pays twice that, for a stretch of a day).
      ratios.push((live.n * live.pay) / (fluff.pay / (fluff.mult - 1)));
    }
    expect(ratios.length).toBeGreaterThan(20);
    for (const r of ratios) {
      expect(r).toBeGreaterThan(0.45);
      expect(r).toBeLessThan(2.2);
    }
    // Sometimes the trip pays more, sometimes the fluff.
    expect(ratios.some((r) => r > 1.05)).toBe(true);
    expect(ratios.some((r) => r < 0.95)).toBe(true);
  });

  it("two fluff orders pay for the share of their kind's day they ask, not their fluff's price (brook 620 beside clover 180 once)", () => {
    let pairs = 0;
    for (let day = 2; day < 32; day++) {
      const sim = morning(['clover', 'ember', 'brook'], day);
      sim.postOrders(true);
      const fl = sim.offers().filter((o) => !o.live && o.mult === 2);
      if (fl.length < 2) continue;
      pairs++;
      const per = fl.map((o) => o.pay / (o.n / sim.makes(o.kind, 6)));
      expect(per[1] / per[0]).toBeGreaterThan(0.8);
      expect(per[1] / per[0]).toBeLessThan(1.25);
    }
    expect(pairs).toBeGreaterThan(10);
  });

  it('the board varies what it asks for, and asks for a kind you keep but sell little of', () => {
    // The playtest's ranch: lots of clover and ember sold, six brooks kept, brook never asked for.
    const asked: Record<string, number> = { clover: 0, ember: 0, brook: 0 };
    let sameAsYesterday = 0;
    let prev = '';
    const sim = morning(['clover', 'ember', 'brook'], 2);
    sim.s.stats.kinds = { clover: 400, ember: 300, brook: 6 };
    for (let day = 2; day < 22; day++) {
      sim.s.day = day;
      sim.postOrders(true);
      const kinds = new Set(sim.offers().map((o) => o.kind));
      for (const k of kinds) asked[k]++;
      const first = `${sim.offers()[0].kind}`;
      if (first === prev) sameAsYesterday++;
      prev = first;
    }
    expect(asked.brook).toBeGreaterThanOrEqual(10);
    expect(asked.clover).toBeGreaterThanOrEqual(5);
    expect(asked.ember).toBeGreaterThanOrEqual(5);
    expect(sameAsYesterday).toBeLessThanOrEqual(8);
  });
});

// ---------------------------------------------------------------- P2: the first order at the loop's end

describe("P2: the first order comes as soon as the loop lesson ends", () => {
  it('the loop done at 3:20 pm: an order is on the board at once, and its lesson says to take it there', () => {
    const { sim, s, tutor, go, view } = ranch(TO_FARM, TO_FARM_F);
    s.day = 2;
    s.hour = 15.33;
    s.night = 2;
    pen(sim, 1);
    fill(sim, 1, 'clover', 3, 0.1);
    s.coins = 120;
    // The loop's three turns done.
    s.learnCount['cycle'] = 3;
    s.learnCount['farm:from'] = 0;
    go(1);
    expect(Tutor.finished(s, 'farm')).toBe(true);
    go(2);
    expect(s.hour).toBeLessThan(16);
    expect(sim.offers().length).toBe(1);
    expect(tutor.current).toBe('order');
    expect(view().line).toBe('Take an order at the price board.');
    expect(Math.hypot(tutor.mark.x - BOARD.x, tutor.mark.z - BOARD.z)).toBeLessThan(0.3);
    // Fill four by dusk: the first order fits the afternoon left.
    expect(sim.offers()[0].n).toBe(4);
  });

  it('with no order on the board the journal says when they come, not to fill one', () => {
    const sim = quiet(20);
    sim.s.learn.push('orders');
    sim.s.goals = ['catch', 'pen', 'feed', 'sell', 'plant'];
    expect(sim.openGoals(1)[0].id).toBe('order');
    expect(orderLines(sim.s)).toEqual([]);
    expect(goalLine(sim)).toBe('New orders come to the price board at dawn.');
  });
});

const goalLine = (sim: Sim) => goalText(sim.openGoals(1)[0].id, sim.s);

// ---------------------------------------------------------------- P2: brooks reward skill

describe('P2: a downy being tugged beats food in the cone, and glides go sideways', () => {
  it('pulling at a wild brook beside dewberries: the brook keeps the pull and the berries stay put', () => {
    const sim = quiet(10);
    const s = sim.s;
    s.gates.hollow = true;
    sim.phys.gates = { ...s.gates };
    const bx = POND.x - 14;
    const bz = POND.z + 10;
    stand(sim, bx - 5.5, bz);
    const d = sim.spawn('brook', bx, bz, false);
    d.hopT = 99;
    // Dewberries lying just past the brook, nearer the crosshair once the brook shifts.
    for (let k = 0; k < 4; k++) {
      const it = newItem(s, 'dewberry', bx + 0.6 + k * 0.2, sim.phys.floor(bx + 0.6, bz) + 0.12, bz + 0.15 * (k - 1.5));
      it.rest = true;
      s.items.push(it);
    }
    // The fight starts on the brook.
    run(sim, 0.3, { ...idle, draw: true }, aimAt(sim, d.x, d.y + 0.25, d.z));
    expect(d.tug).toBeGreaterThan(0);
    // The aim slips onto the berries beside it, still on the brook's body with its give.
    for (let t = 0; t < 1.5 && !d.gone; t += 1 / 30) {
      const aim = aimAt(sim, d.x + 0.12, d.y + 0.2, d.z);
      sim.update(1 / 30, { ...idle, draw: true }, aim);
      sim.events.length = 0;
    }
    expect(s.slots.some((q) => q.t === 'dewberry')).toBe(false);
    expect(s.slots.some((q) => q.t === 'brook') || d.drawn > 0 || d.tug > 0).toBe(true);
  });

  it("a wild one's jinks never head at you: a brook between you and the pond glides sideways", () => {
    let worst = -1;
    let closest = 1e9;
    for (let seed = 1; seed <= 6; seed++) {
      Math.random = rng(seed * 31);
      const sim = quiet(10);
      const s = sim.s;
      // You stand between the pond and the brook, facing it: the pond is behind you.
      const bx = POND.x - 20;
      const bz = POND.z + 16;
      const ax = (bx - POND.x) / Math.hypot(bx - POND.x, bz - POND.z);
      const az = (bz - POND.z) / Math.hypot(bx - POND.x, bz - POND.z);
      stand(sim, bx - ax * 4.5, bz - az * 4.5);
      const d = sim.spawn('brook', bx, bz, false);
      for (let t = 0; t < 2.4 && !d.gone; t += 1 / 30) {
        const p = s.player;
        const aim = aimAt(sim, d.x, d.y + 0.25, d.z);
        sim.update(1 / 30, { ...idle, draw: true }, aim);
        sim.events.length = 0;
        if (d.drawn > 0 || d.gone) break;
        const tx = p.x - d.x;
        const tz = p.z - d.z;
        const l = Math.hypot(tx, tz) || 1;
        if (!d.grounded) worst = Math.max(worst, (d.vx * tx + d.vz * tz) / l);
        closest = Math.min(closest, l);
      }
    }
    // Its own creep towards you (under 1 m/s) and no more: never a glide under the view.
    expect(worst).toBeLessThan(1.2);
    expect(closest).toBeGreaterThan(1.5);
  });
});

// ---------------------------------------------------------------- P2: one window for every fluff

describe('P2: one window takes every kind of fluff', () => {
  it('four kinds of fluff share a window that holds twice as much, and a held Blow sends them all', () => {
    const sim = quiet(10);
    const s = sim.s;
    sim.stow('cloverhead');
    sim.stow('sweetroot');
    sim.stow('dewberry');
    const kinds: DownyKind[] = ['clover', 'ember', 'brook', 'thistle'];
    for (let k = 0; k < CAPS[0] * FLUFF_ROOM; k++) expect(sim.stow(KIND_TUFT[kinds[k % 4]])).toBe(true);
    expect(sim.stow('tuft-clover')).toBe(false);
    const w = s.slots.filter((q) => q.t && q.t.startsWith('tuft'));
    expect(w.length).toBe(1);
    expect(w[0].n).toBe(CAPS[0] * FLUFF_ROOM);
    // Saved and loaded, the mix stays.
    const back = deserialize(JSON.parse(JSON.stringify(serialize(s))), s.sources)!;
    const bw = back.slots.find((q) => q.t && q.t.startsWith('tuft'))!;
    expect(bw.n).toBe(w[0].n);
    expect(new Set(bw.mix)).toEqual(new Set(['tuft-clover', 'tuft-ember', 'tuft-brook', 'tuft-thistle']));
    // From the lane, Blow held: every kind goes into the crate on one press.
    s.sel = s.slots.indexOf(w[0]);
    stand(sim, EXCHANGE.x, EXCHANGE.z - 4);
    const aim = aimAt(sim, EXCHANGE.x, sim.phys.floor(EXCHANGE.x, EXCHANGE.z) + 0.7, EXCHANGE.z);
    const evs: Ev[] = [];
    sim.update(1 / 30, { ...idle, puff: true, puffPressed: true }, aim);
    run(sim, 8, { ...idle, puff: true }, aim, evs);
    run(sim, 3, idle, aim, evs);
    const sold = new Set(evs.filter((e): e is Extract<Ev, { t: 'sell' }> => e.t === 'sell').map((e) => e.kind));
    expect(sold).toEqual(new Set(kinds));
    expect(s.slots.some((q) => q.t && q.t.startsWith('tuft'))).toBe(false);
  });

  it('tipping the fluff window out drops every kind in it', () => {
    const sim = quiet(10);
    const s = sim.s;
    sim.stow('tuft-ember');
    sim.stow('tuft-thistle');
    sim.stow('tuft-ember');
    stand(sim, 0, 30);
    expect(sim.empty(0, ahead(sim))).toBe(3);
    const types = s.items.filter((it) => !it.gone).map((it) => it.type).sort();
    expect(types).toEqual(['tuft-ember', 'tuft-ember', 'tuft-thistle']);
  });
});

// ---------------------------------------------------------------- P2: the first pen beside the starter garden

describe('P2: the feed run is no trap', () => {
  it('the pen lesson points at the plot beside the starter garden, where a feed run reaches', () => {
    const { s, tutor, go } = ranch(['look', 'walk', 'draw', 'puff', 'feed', 'sell'], ['bellows', 'draw', 'puff', 'pause', 'coins']);
    // Standing by the sell crate, as you are after the sale.
    s.player.x = EXCHANGE.x;
    s.player.z = EXCHANGE.z - 3;
    go(0.5);
    expect(tutor.current).toBe('pen');
    const post = padSpots(1).post;
    expect(Math.hypot(tutor.mark.rx - PADS[1].x, tutor.mark.rz - PADS[1].z)).toBeLessThan(0.1);
    expect(Math.hypot(tutor.mark.x - post.x, tutor.mark.z - post.z)).toBeLessThan(1.2);
  });

  it("the garden post hangs no Feed run tag with no pen and feeder next door, and does once there is one", () => {
    const sim = quiet(10);
    const g = { kind: 'pad' as const, id: 0, label: '', x: 0, y: 0, z: 0 };
    // A pen with a feeder across the lane (plot 3): out of the run's reach.
    pen(sim, 3, ['feeder']);
    expect(sim.menu(g).map((o) => o.id)).not.toContain('garden:run');
    pen(sim, 1, []);
    expect(sim.menu(g).map((o) => o.id)).not.toContain('garden:run');
    pen(sim, 1, ['feeder']);
    expect(sim.menu(g).map((o) => o.id)).toContain('garden:run');
  });
});

// ---------------------------------------------------------------- P2: the high fence comes with the first thistle

describe('P2: thistles are taught the high fence when caught, before they are penned', () => {
  it('a thistle in the jar and only low pens: "Thistles need a high fence. Buy one." at the pen post, its tag chosen', () => {
    const { sim, s, tutor, go, view } = ranch(PAST_ORDER, PAST_ORDER_F);
    s.hour = 17.8;
    s.night = s.day;
    s.gates.ridge = true;
    pen(sim, 1);
    fill(sim, 1, 'clover', 3, 0.1);
    go(0.5);
    expect(tutor.current).not.toBe('high');
    sim.stow('thistle');
    go(0.5);
    expect(tutor.current).toBe('high');
    expect(view().line).toBe('Thistles need a high fence. Buy one.');
    expect(s.downies.some((d) => d.kind === 'thistle')).toBe(false);
    const post = padSpots(1).post;
    expect(Math.hypot(tutor.mark.x - post.x, tutor.mark.z - post.z)).toBeLessThan(1.2);
    expect(tutor.tag).toBe('pen:high');
    s.coins = 400;
    expect(sim.choose({ kind: 'pad', id: 1, label: '', x: 0, y: 0, z: 0 }, 'pen:high')).toBe(true);
    go(0.3);
    expect(view().done).toBe(true);
  });
});

// ---------------------------------------------------------------- P2: the pen-in steps and the pen limit

describe('P2: the lines follow the steps', () => {
  it('the pen-in line says to pull the downy in first when it is loose', () => {
    const { sim, s, view, go, tutor } = ranch(['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'slots'], ['bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'slots']);
    pen(sim, 1);
    sim.stow('cloverhead');
    go(0.5);
    expect(tutor.current).toBe('penin');
    expect(view().line).toBe('Pull in the downy.');
    const d = s.downies.find((q) => q.keep)!;
    expect(Math.hypot(tutor.mark.x - d.x, tutor.mark.z - d.z)).toBeLessThan(0.3);
    d.gone = true;
    sim.stow('clover');
    go(0.5);
    expect(view().line).toBe('Blow the downy into the pen.');
  });

  it('the pen limit line stays up until you have seen the count on the post', () => {
    const { sim, s, tutor, go } = ranch(PAST_ORDER, PAST_ORDER_F);
    s.hour = 10;
    s.night = s.day;
    pen(sim, 1);
    fill(sim, 1, 'clover', 8, 0.1);
    go(12);
    expect(tutor.current).toBe('crowd');
    expect(Tutor.finished(s, 'crowd')).toBe(false);
    const post = padSpots(1).post;
    stand(sim, post.x + 1.5, post.z + 1.5);
    go(2);
    expect(Tutor.finished(s, 'crowd')).toBe(true);
  });
});

// ---------------------------------------------------------------- P3

describe('P3: the cheap fixes', () => {
  it('a lone tag is chosen already, so one tap takes it (never a crop pulled up)', () => {
    const c = new TagChoice();
    c.open([{ id: 'sleep', title: 'Sleep till morning', price: null, ok: true, note: 'Saves the ranch' }], 'touch', null);
    expect(c.hot).toBe(0);
    expect(c.tap(0)).toBe(true);
    c.open([{ id: 'gate:hollow', title: 'Brook Hollow', price: 1200, ok: true, note: 'Opens the gate' }], 'touch', null);
    expect(c.press([{ id: 'gate:hollow', title: 'Brook Hollow', price: 1200, ok: true, note: 'Opens the gate' }])).toBe('take');
    c.open([{ id: 'garden:clear', title: 'Pull the crop', price: null, ok: true, note: '' }], 'touch', null);
    expect(c.hot).toBe(-1);
    c.open(
      [
        { id: 'pen:high', title: 'High fence', price: 200, ok: true, note: '' },
        { id: 'pen:hedge', title: 'Hedge', price: 250, ok: true, note: '' },
      ],
      'touch',
      null,
    );
    expect(c.hot).toBe(-1);
  });

  it('the pause journal shows the goals done in the order you did them, then the one you are on, last', () => {
    // The ridge gate opened before the board's first order was filled.
    const rows = journalGoals(['catch', 'pen', 'feed', 'sell', 'plant', 'ridge', 'ember']);
    expect(rows.map((r) => r.done)).toEqual([true, true, true, true, true, true, true, false]);
    expect(rows[rows.length - 1].text).toBe('Fill an order from the price board.');
  });
});
