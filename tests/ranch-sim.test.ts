// Thistledown's rules, run without rendering: the canister, hunger and
// shedding, gardens, the Exchange, builds, gates, nettlebacks, silos,
// feeders, the chute, sleep, the journal and the save.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CAPS, HOUR, KIND, NEGLECT_HOURS, PEN_HUNGER } from '../src/games/ranch/defs';
import { Sim, GARDEN_SRC, SATURATION, SAT_FLOOR, padSpots, type Aim, type Controls, type Ev } from '../src/games/ranch/sim';
import { deserialize, serialize, newItem } from '../src/games/ranch/state';
import { GATES, PADS } from '../src/games/ranch/world';
import { rng } from '../src/games/ranch/noise';

// Seeded randomness, so every run is the same.
const realRandom = Math.random;
let seed = 1;
beforeEach(() => {
  Math.random = rng(seed);
});
afterEach(() => {
  Math.random = realRandom;
});
/** Runs a body under several seeds: behaviour must hold for each. */
function seeds(n: number, body: () => void): void {
  for (let k = 1; k <= n; k++) {
    seed = k * 7919;
    Math.random = rng(seed);
    body();
  }
  seed = 1;
}

const idle: Controls = { moveX: 0, moveZ: 0, sprint: false, jump: false, jumpPressed: false, draw: false, puff: false, puffPressed: false };

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

function run(sim: Sim, seconds: number, c: Controls = idle, aim?: Aim): void {
  const a = aim ?? aimAt(sim, sim.s.player.x, sim.s.player.y + 1.6, sim.s.player.z - 5);
  for (let t = 0; t < seconds; t += 1 / 30) sim.update(1 / 30, c, a);
}

/** A sim with the wild emptied out, so tests only see what they place. */
function quiet(): Sim {
  const sim = new Sim(null);
  sim.s.downies = [];
  sim.s.items = [];
  sim.s.hour = 10;
  sim.wild = false;
  return sim;
}

function pen(sim: Sim, i: number, ups: string[] = []): void {
  sim.s.pads[i].kind = 'pen';
  sim.s.pads[i].ups = ups;
  sim.phys.setPads(sim.s.pads);
}

describe('a fresh ranch', () => {
  it('starts with coins, a planted garden, a porch downy and wild ones', () => {
    const sim = new Sim(null);
    const s = sim.s;
    expect(s.coins).toBe(300);
    expect(s.pads[0].kind).toBe('garden');
    expect(s.pads[0].crop).toBe('cloverhead');
    expect(s.downies.some((d) => d.keep && d.kind === 'clover')).toBe(true);
    expect(s.downies.filter((d) => d.kind === 'clover').length).toBeGreaterThan(10);
    expect(s.downies.filter((d) => d.kind === 'ember').length).toBeGreaterThan(5);
    expect(s.items.filter((i) => i.type === 'cloverhead' && i.rest).length).toBeGreaterThan(10);
    expect(s.downies.length).toBeLessThanOrEqual(60);
  });
});

describe('the canister', () => {
  it('holds four kinds, twelve of each, and refuses a fifth kind', () => {
    const sim = quiet();
    for (let i = 0; i < 12; i++) expect(sim.stow('cloverhead')).toBe(true);
    // One slot per kind: a full slot refuses more of its kind.
    expect(sim.stow('cloverhead')).toBe(false);
    expect(sim.stow('sweetroot')).toBe(true);
    expect(sim.stow('dewberry')).toBe(true);
    expect(sim.stow('clover')).toBe(true);
    expect(sim.stow('tuft-clover')).toBe(false);
    expect(sim.accept('dewberry')).toBe(2);
  });

  it('draws a downy in through the cone and puffs it back out', () => {
    const sim = quiet();
    const p = sim.s.player;
    const d = sim.spawn('clover', p.x + 3, p.z - 1);
    run(sim, 0.3);
    run(sim, 2, { ...idle, draw: true }, aimAt(sim, d.x, d.y + 0.25, d.z));
    expect(d.gone).toBe(true);
    expect(sim.s.slots[0]).toEqual({ t: 'clover', n: 1 });
    run(sim, 0.1, { ...idle, puffPressed: true, puff: true }, aimAt(sim, p.x, p.y + 1.6, p.z - 8));
    expect(sim.s.slots[0].n).toBe(0);
    const out = sim.s.downies.find((q) => !q.gone);
    expect(out?.tame).toBe(true);
  });

  it('upgrades: capacity 12, 20, 30 and a fifth slot', () => {
    const sim = quiet();
    sim.s.coins = 5000;
    const bench = { kind: 'bench' as const, id: 0, label: '', x: 0, y: 0, z: 0 };
    expect(sim.choose(bench, 'bench:cap')).toBe(true);
    expect(sim.choose(bench, 'bench:cap')).toBe(true);
    expect(sim.choose(bench, 'bench:cap')).toBe(false);
    expect(CAPS[sim.s.up.cap]).toBe(30);
    expect(sim.choose(bench, 'bench:slots')).toBe(true);
    expect(sim.s.slots.length).toBe(5);
    expect(sim.s.coins).toBe(5000 - 400 - 1200 - 800);
  });
});

describe('downies', () => {
  it('get hungry over about three game hours in the open, a third as fast in a pen, slower with company', () => {
    const sim = quiet();
    const out = sim.spawn('clover', -8, 30);
    out.hunger = 0;
    pen(sim, 1);
    const a = sim.spawn('clover', PADS[1].x, PADS[1].z);
    a.hunger = 0;
    run(sim, 1.5 * HOUR);
    expect(out.hunger).toBeGreaterThan(0.45);
    expect(out.hunger).toBeLessThan(0.56);
    // In a pen: hungry (0.5) after about 4.5 game hours, not 1.5.
    expect(a.hunger).toBeGreaterThan(0.15);
    expect(a.hunger).toBeLessThan(0.19);
    expect(PEN_HUNGER).toBeCloseTo(1 / 3, 5);
    const b = sim.spawn('clover', PADS[1].x + 1, PADS[1].z);
    a.hunger = 0;
    b.hunger = 0;
    run(sim, 1.5 * HOUR);
    expect(a.hunger).toBeLessThan(0.15);
  });

  it('eat what they eat, and shed two down for a favourite', () => {
    const sim = quiet();
    pen(sim, 1);
    const at = PADS[1];
    const d = sim.spawn('clover', at.x, at.z);
    d.hunger = 0.8;
    const root = sim.drop('sweetroot', at.x + 0.5, at.z);
    run(sim, 6);
    expect(root.gone).toBe(false);
    sim.drop('cloverhead', at.x + 0.5, at.z + 0.3);
    run(sim, 8);
    expect(sim.s.stats.fed).toBe(1);
    expect(sim.s.goals).toContain('feed');
    expect(sim.s.items.filter((i) => !i.gone && i.type === 'tuft-clover').length).toBe(2);
  });

  it('brook downies with a trough shed one extra; thistles eat anything', () => {
    const sim = quiet();
    pen(sim, 1, ['trough']);
    const at = PADS[1];
    const b = sim.spawn('brook', at.x, at.z);
    b.hunger = 0.8;
    sim.drop('dewberry', at.x + 0.4, at.z);
    run(sim, 8);
    expect(sim.s.items.filter((i) => !i.gone && i.type === 'tuft-brook').length).toBe(3);
    pen(sim, 2, ['high']);
    const t = sim.spawn('thistle', PADS[2].x, PADS[2].z);
    t.hunger = 0.8;
    sim.drop('sweetroot', PADS[2].x + 0.4, PADS[2].z);
    run(sim, 8);
    expect(sim.s.items.filter((i) => !i.gone && i.type === 'tuft-thistle').length).toBe(2);
  });

  it('shed even when starving; fright and crowding still frazzle', () => {
    const sim = quiet();
    pen(sim, 1, ['high']);
    const at = PADS[1];
    const d = sim.spawn('clover', at.x, at.z);
    d.hunger = 1;
    sim.drop('cloverhead', at.x + 0.4, at.z);
    run(sim, 8);
    expect(sim.s.stats.fed).toBe(1);
    expect(d.mood).not.toBe('frazzled');
    expect(sim.s.items.filter((i) => !i.gone && i.type.startsWith('tuft')).length).toBe(2);
    // Frightened (a pest close by): frazzled.
    for (const it of sim.s.items) it.gone = true;
    const f = sim.spawn('clover', at.x - 1, at.z);
    f.hunger = 0.8;
    f.fright = 99;
    run(sim, 0.1);
    expect(f.mood).toBe('frazzled');
    for (let i = 0; i < 11; i++) sim.spawn('clover', at.x + ((i % 4) - 1.5), at.z + (Math.floor(i / 4) - 1));
    run(sim, 2);
    expect(sim.s.downies.filter((q) => q.pen === 1 && q.mood === 'frazzled').length).toBeGreaterThan(10);
  });

  it('stay in a low pen when calm, and thistles hop out of it', () => seeds(5, () => {
    const sim = quiet();
    pen(sim, 1);
    pen(sim, 2);
    const c = sim.spawn('clover', PADS[1].x, PADS[1].z);
    const t = sim.spawn('thistle', PADS[2].x, PADS[2].z);
    c.hunger = 0;
    t.hunger = 0;
    let out = false;
    for (let k = 0; k < 60 && !out; k++) {
      run(sim, 1);
      out = sim.phys.penAt(t.x, t.z) !== 2;
    }
    expect(sim.phys.penAt(c.x, c.z)).toBe(1);
    expect(out).toBe(true);
  }));
});

describe('gardens', () => {
  it('grow two every hour and a half; a sprinkler is half again as fast; rich soil gives three', () => {
    const sim = quiet();
    const g = sim.s.pads[0];
    g.grow = 0;
    const count = () => sim.s.items.filter((i) => !i.gone && i.src === GARDEN_SRC).length;
    run(sim, 1.5 * HOUR - 2);
    expect(count()).toBe(0);
    run(sim, 3);
    expect(count()).toBe(2);
    sim.s.items = [];
    g.grow = 0;
    g.ups = ['sprinkler', 'soil'];
    run(sim, (1.5 * HOUR) / 1.5 + 1);
    expect(count()).toBe(3);
  });

  it('take a puffed food as their crop when empty', () => {
    const sim = quiet();
    sim.s.pads[0].crop = null;
    const p = sim.s.player;
    const at = PADS[0];
    p.x = at.x;
    p.z = at.z + 7;
    p.y = sim.phys.floor(p.x, p.z);
    sim.stow('sweetroot');
    run(sim, 0.1, { ...idle, puff: true, puffPressed: true }, aimAt(sim, at.x, sim.phys.floor(at.x, at.z), at.z));
    run(sim, 2);
    expect(sim.s.pads[0].crop).toBe('sweetroot');
    expect(sim.s.goals).toContain('plant');
  });
});

describe('the Exchange', () => {
  it('drifts prices within a quarter; each sale today takes a little off, never below the floor', () => {
    const sim = quiet();
    for (let d = 0; d < 20; d++) {
      sim.sleep();
      for (const k of ['clover', 'ember', 'brook', 'thistle'] as const) {
        expect(sim.s.market.mult[k]).toBeGreaterThanOrEqual(0.75);
        expect(sim.s.market.mult[k]).toBeLessThanOrEqual(1.25);
      }
    }
    sim.s.market.mult.clover = 1;
    expect(sim.price('clover')).toBe(KIND.clover.value);
    sim.s.market.sold.clover = 40;
    expect(sim.price('clover')).toBe(Math.round(KIND.clover.value * Math.pow(1 - SATURATION, 40)));
    sim.s.market.sold.clover = 5000;
    expect(sim.price('clover')).toBe(Math.round(KIND.clover.value * SAT_FLOOR));
  });

  it('has no hard cap on a day of selling: more downies, more coins (it used to stop near 533 for clover)', () => {
    const sim = quiet();
    sim.s.market.mult.clover = 1;
    let total = 0;
    for (let i = 0; i < 300; i++) {
      total += sim.price('clover');
      sim.s.market.sold.clover++;
    }
    // Three hundred clover fluff in a day, about what a full ranch of clover downies makes.
    expect(total).toBeGreaterThan(2400);
    const first100 = Array.from({ length: 100 }, (_, i) => Math.max(SAT_FLOOR, Math.pow(1 - SATURATION, i))).reduce((a, b) => a + b, 0);
    expect(first100 / 100).toBeGreaterThan(0.8);
  });

  it('buys down puffed into the crate and sends anything else back', () => {
    const sim = quiet();
    const p = sim.s.player;
    p.x = -6.5;
    p.z = 32.6;
    p.y = sim.phys.floor(p.x, p.z);
    sim.stow('tuft-clover');
    sim.stow('tuft-clover');
    sim.stow('cloverhead');
    const c0 = sim.s.coins;
    const aim = aimAt(sim, -6.5, sim.phys.floor(-6.5, 36.5) + 0.7, 36.5);
    run(sim, 0.05, { ...idle, puff: true, puffPressed: true }, aim);
    run(sim, 0.3, { ...idle, puff: true }, aim);
    run(sim, 2);
    expect(sim.s.stats.sold).toBe(2);
    expect(sim.s.coins).toBeGreaterThan(c0);
    sim.s.sel = 1;
    run(sim, 0.05, { ...idle, puff: true, puffPressed: true }, aim);
    run(sim, 2);
    expect(sim.s.items.some((i) => !i.gone && i.type === 'cloverhead')).toBe(true);
  });

  it('blows away down left lying overnight and resets the day’s sales', () => {
    const sim = quiet();
    sim.drop('tuft-clover', 0, 30);
    sim.s.market.sold.clover = 10;
    sim.sleep();
    expect(sim.s.items.filter((i) => !i.gone && i.type.startsWith('tuft')).length).toBe(0);
    expect(sim.s.market.sold.clover).toBe(0);
    expect(sim.s.hour).toBe(6);
    expect(sim.s.day).toBe(2);
  });
});

describe('builds and gates', () => {
  it('cost coins and refuse when you cannot pay', () => {
    const sim = quiet();
    const post = { kind: 'pad' as const, id: 1, label: '', x: 0, y: 0, z: 0 };
    sim.s.coins = 260;
    expect(sim.choose(post, 'build:pen')).toBe(true);
    expect(sim.s.coins).toBe(60);
    expect(sim.choose({ ...post, id: 2 }, 'build:garden')).toBe(false);
    expect(sim.events.some((e) => e.t === 'deny')).toBe(true);
    expect(sim.menu(post).map((o) => o.id)).toContain('pen:feeder');
  });

  it('keep you out of Ember Ridge until the gate is bought', () => {
    const sim = quiet();
    const p = sim.s.player;
    const g = GATES.ridge;
    p.x = g.x + 3;
    p.z = g.z;
    p.y = sim.phys.floor(p.x, p.z);
    p.yaw = Math.PI / 2;
    run(sim, 3, { ...idle, moveZ: 1 });
    expect(p.x).toBeGreaterThan(g.x);
    sim.s.coins = 700;
    expect(sim.choose({ kind: 'gate', id: 'ridge', label: '', x: 0, y: 0, z: 0 }, 'gate:ridge')).toBe(true);
    run(sim, 3, { ...idle, moveZ: 1 });
    expect(p.x).toBeLessThan(g.x - 2);
    expect(sim.s.goals).toContain('ridge');
  });
});

describe('pen and silo upgrades', () => {
  it('a feeder drops one food at a time for hungry downies', () => {
    const sim = quiet();
    pen(sim, 1, ['feeder']);
    sim.s.pads[1].feeder = { t: 'cloverhead', n: 5 };
    const d = sim.spawn('clover', PADS[1].x, PADS[1].z);
    d.hunger = 0.8;
    run(sim, 12);
    expect(sim.s.stats.fed).toBe(1);
    expect(sim.s.pads[1].feeder.n).toBe(4);
  });

  it('a down chute boxes the shed down, and empties into the canister', () => {
    const sim = quiet();
    pen(sim, 1, ['chute', 'high']);
    const d = sim.spawn('clover', PADS[1].x, PADS[1].z);
    d.hunger = 0.8;
    sim.drop('cloverhead', PADS[1].x + 0.3, PADS[1].z);
    run(sim, 14);
    expect(sim.s.pads[1].chute[0]).toBe(2);
    expect(sim.emptyChute(1)).toBe(2);
    expect({ t: sim.s.slots[0].t, n: sim.s.slots[0].n }).toEqual({ t: 'tuft-clover', n: 2 });
  });

  it('a silo stores what is puffed at it and gives the chosen kind back to a draw', () => {
    const sim = quiet();
    sim.s.pads[2].kind = 'silo';
    sim.phys.setPads(sim.s.pads);
    const at = PADS[2];
    const p = sim.s.player;
    p.x = at.x;
    p.z = at.z + 6;
    p.y = sim.phys.floor(p.x, p.z);
    for (let i = 0; i < 3; i++) sim.stow('sweetroot');
    const aim = aimAt(sim, at.x, sim.phys.floor(at.x, at.z) + 1.5, at.z);
    run(sim, 0.05, { ...idle, puff: true, puffPressed: true }, aim);
    run(sim, 1, { ...idle, puff: true }, aim);
    run(sim, 1);
    expect(sim.s.pads[2].silo[0]).toEqual({ t: 'sweetroot', n: 3 });
    const o = padSpots(2).outlet;
    run(sim, 3, { ...idle, draw: true }, aimAt(sim, o.x, sim.phys.floor(o.x, o.z) + o.y, o.z));
    expect(sim.s.slots.find((q) => q.t === 'sweetroot')?.n).toBe(3);
  });
});

describe('nettlebacks', () => {
  it('come at night, frighten downies, and roll away when hit', () => seeds(4, () => {
    const sim = quiet();
    sim.s.hour = 22;
    run(sim, 12);
    expect(sim.s.nettles.length).toBeGreaterThan(0);
    const n = sim.s.nettles[0];
    const d = sim.spawn('clover', n.x + 1, n.z);
    run(sim, 0.2);
    expect(d.mood).toBe('frazzled');
    const it = newItem(sim.s, 'cloverhead', n.x, Math.max(n.y + 0.5, sim.phys.floor(n.x, n.z - 1) + 0.2), n.z - 1);
    it.vz = 9;
    it.flyT = 0;
    sim.s.items.push(it);
    sim.events.length = 0;
    run(sim, 0.4);
    expect(n.mode).toBe('roll');
    expect(sim.events.some((e) => e.t === 'nettlehit')).toBe(true);
    run(sim, 6);
    expect(n.mode).toBe('flee');
  }));
});

describe('the journal and the save', () => {
  it('pays for goals once, in any order', () => {
    const sim = quiet();
    const c = sim.s.coins;
    sim.complete('ridge');
    sim.complete('ridge');
    sim.complete('catch');
    expect(sim.s.coins).toBe(c + 200 + 20);
    expect(sim.openGoals(2).map((g) => g.id)).toEqual(['pen', 'feed']);
  });

  it('round-trips through the save exactly', () => {
    const sim = new Sim(null);
    run(sim, 3);
    sim.s.coins = 1234;
    sim.s.pads[3].kind = 'silo';
    sim.s.pads[3].silo = [{ t: 'dewberry', n: 7 }];
    const a = serialize(sim.s);
    const back = new Sim(deserialize(JSON.parse(JSON.stringify(a)), sim.s.sources));
    expect(serialize(back.s)).toEqual(a);
  });

  it('ignores a broken save', () => {
    expect(deserialize({ v: 9 }, [])).toBeNull();
    expect(deserialize(null, [])).toBeNull();
  });
});

describe('the sell crate', () => {
  const CX = -6.5;
  const CZ = 36.5;
  /** A ranch with fluff chosen, the player stood at (x, z). */
  function at(x: number, z: number, n = 1) {
    const sim = new Sim(null);
    const s = sim.s;
    s.player.x = x;
    s.player.z = z;
    s.player.y = sim.phys.floor(x, z);
    s.slots[0].t = 'tuft-clover';
    s.slots[0].n = n;
    s.sel = 0;
    return sim;
  }
  function aimAt(sim: Sim, x: number, y: number, z: number): Aim {
    const p = sim.s.player;
    const ex = p.x;
    const ey = p.y + 1.6;
    const ez = p.z;
    const l = Math.hypot(x - ex, y - ey, z - ez);
    const dx = (x - ex) / l;
    const dy = (y - ey) / l;
    const dz = (z - ez) / l;
    return { ex, ey, ez, dx, dy, dz, mx: ex + dx * 0.77, my: ey + dy * 0.77 - 0.25, mz: ez + dz * 0.77 };
  }
  const run = (sim: Sim, seconds: number, aim: Aim) => {
    for (let t = 0; t < seconds; t += 1 / 60) sim.update(1 / 60, idle, aim);
  };

  it('draws in fluff lying within reach, and leaves fluff further off alone', () => {
    const sim = at(CX + 9, CZ - 9, 0);
    const s = sim.s;
    const fl = (x: number, z: number) => sim.phys.floor(x, z) + 0.1;
    const near = newItem(s, 'tuft-clover', CX + 1.3, fl(CX + 1.3, CZ - 1.3), CZ - 1.3);
    const far = newItem(s, 'tuft-clover', CX + 3.5, fl(CX + 3.5, CZ - 1), CZ - 1);
    for (const it of [near, far]) {
      it.grounded = true;
      it.flyT = -1;
      s.items.push(it);
    }
    const x0 = far.x;
    run(sim, 4, aimAt(sim, CX + 20, 8, CZ));
    expect(near.gone).toBe(true);
    expect(s.stats.sold).toBe(1);
    expect(far.gone).toBe(false);
    expect(Math.abs(far.x - x0)).toBeLessThan(0.6);
  });

  it('takes a blow that would have landed short or a little wide', () => {
    for (const [tx, ty] of [
      [CX, -0.75],
      [CX + 0.9, 0],
    ]) {
      const sim = at(CX + 1, CZ - 5);
      const aim = aimAt(sim, tx, sim.phys.floor(CX, CZ) + 0.75 + ty, CZ);
      sim.puff(aim);
      run(sim, 4, aim);
      expect(sim.s.stats.sold).toBe(1);
    }
  });

  it('shows the sell mark only when a blow would sell, and only with fluff chosen', () => {
    const sim = at(CX + 1, CZ - 5);
    const fl = sim.phys.floor(CX, CZ);
    expect(sim.aimTarget(aimAt(sim, CX, fl + 0.75, CZ))).toBe('sell');
    // Turned well away from the crate.
    expect(sim.aimTarget(aimAt(sim, CX + 8, fl + 1.5, CZ - 6))).not.toBe('sell');
    // Clover heads chosen: no promise of a sale.
    sim.s.slots[0].t = 'cloverhead';
    expect(sim.aimTarget(aimAt(sim, CX, fl + 0.75, CZ))).not.toBe('sell');
  });
});

// ---------------------------------------------------------------- the playtest's findings

const tufts = (sim: Sim) => sim.s.items.filter((i) => !i.gone && i.type.startsWith('tuft')).length;
/** Aim from the player at a point, with the muzzle a little ahead of the eye. */
function aimFrom(sim: Sim, x: number, y: number, z: number): Aim {
  return aimAt(sim, x, y, z);
}
function stand(sim: Sim, x: number, z: number): void {
  const p = sim.s.player;
  p.x = x;
  p.z = z;
  p.y = sim.phys.floor(x, z);
  p.vx = p.vz = p.vy = 0;
}

describe('starving downies keep working', () => {
  it('two starving penned downies with a stocked feeder both eat within 20 s, and shed', () => seeds(4, () => {
    const sim = quiet();
    pen(sim, 1, ['feeder']);
    sim.s.pads[1].feeder = { t: 'cloverhead', n: 10 };
    const at = PADS[1];
    const a = sim.spawn('clover', at.x - 2.6, at.z - 0.5);
    const b = sim.spawn('clover', at.x + 2.4, at.z + 1.5);
    a.hunger = b.hunger = 1;
    a.starveT = b.starveT = 1;
    run(sim, 20);
    expect(sim.s.stats.fed).toBeGreaterThanOrEqual(2);
    expect(a.hunger).toBeLessThan(0.2);
    expect(b.hunger).toBeLessThan(0.2);
    expect(tufts(sim)).toBeGreaterThanOrEqual(4);
    expect(a.pen).toBe(1);
    expect(b.pen).toBe(1);
  }));

  it('six starving penned downies with a feeder kept stocked all stay in the pen for ten minutes', () => seeds(3, () => {
    const sim = quiet();
    pen(sim, 1, ['feeder']);
    const at = PADS[1];
    const six = Array.from({ length: 6 }, (_, k) => sim.spawn('clover', at.x + Math.cos(k) * 2.5, at.z + Math.sin(k) * 2.5));
    for (const d of six) d.hunger = 1;
    let out = 0;
    for (let t = 0; t < 600; t += 10) {
      // The player keeps the feeder topped up; daytime throughout (no pests).
      sim.s.pads[1].feeder = { t: 'cloverhead', n: 40 };
      sim.s.hour = 10;
      run(sim, 10);
      out = Math.max(out, six.filter((d) => d.gone || sim.phys.penAt(d.x, d.z) !== 1).length);
    }
    expect(out).toBe(0);
    expect(sim.s.stats.fed).toBeGreaterThanOrEqual(12);
  }));

  it('a calm, fed downy never crosses a low fence', () => seeds(5, () => {
    const sim = quiet();
    pen(sim, 1, ['feeder']);
    sim.s.pads[1].feeder = { t: 'cloverhead', n: 40 };
    const d = sim.spawn('clover', PADS[1].x, PADS[1].z);
    d.hunger = 0;
    let left = false;
    for (let t = 0; t < 900 && !left; t += 1) {
      // Daytime throughout: at night pests frighten downies over a low fence (the hedge's job).
      sim.s.hour = 10;
      run(sim, 1);
      left = sim.phys.penAt(d.x, d.z) !== 1;
    }
    expect(left).toBe(false);
  }));

  it('only long neglect lets a penned downy out: not before six minutes without food, but within a quarter hour', () => seeds(4, () => {
    const sim = quiet();
    pen(sim, 1);
    const d = sim.spawn('clover', PADS[1].x, PADS[1].z);
    d.hunger = 0;
    let outAt = -1;
    for (let t = 0; t < 900 && outAt < 0; t += 1) {
      sim.s.hour = 10;
      run(sim, 1);
      if (sim.phys.penAt(d.x, d.z) !== 1) outAt = t;
    }
    // Starving after 4.5 game hours in a pen, restless after NEGLECT_HOURS more.
    expect(outAt).toBeGreaterThan(360);
    expect(outAt).toBeLessThan(900);
    expect(NEGLECT_HOURS).toBeGreaterThanOrEqual(3);
  }));

  it('a starving downy heads straight for a clover head it can see (3.6 m off) and eats it, faster than a merely hungry one', () => {
    const times: Record<string, number[]> = { starving: [], hungry: [] };
    seeds(5, () => {
      for (const kind of ['starving', 'hungry'] as const) {
        const sim = quiet();
        const d = sim.spawn('clover', -2, 30);
        d.hunger = kind === 'starving' ? 1 : 0.6;
        run(sim, 0.5);
        const food = sim.drop('cloverhead', d.x + 3.6, d.z);
        const d0 = Math.hypot(food.x - d.x, food.z - d.z);
        let worst = 0;
        let ate = -1;
        // A hop already in the air when the food lands cannot turn; from its next landing on, never away.
        let landed = d.grounded;
        let from = d0;
        for (let t = 0; t < 30 && ate < 0; t += 1 / 30) {
          sim.update(1 / 30, idle, aimAt(sim, sim.s.player.x, sim.s.player.y + 1.6, sim.s.player.z - 5));
          const dd = Math.hypot(food.x - d.x, food.z - d.z);
          if (!landed && d.grounded) {
            landed = true;
            from = dd;
          }
          if (food.gone) ate = t;
          else if (landed) worst = Math.max(worst, dd - from);
        }
        expect(ate, kind).toBeGreaterThan(0);
        expect(ate, kind).toBeLessThan(kind === 'starving' ? 6 : 10);
        // Never away from it.
        expect(worst, kind).toBeLessThan(0.3);
        times[kind].push(ate);
        if (kind === 'starving') expect(tufts(sim)).toBe(0);
        run(sim, 2);
        if (kind === 'starving') expect(tufts(sim)).toBe(2);
      }
    });
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(mean(times.starving)).toBeLessThan(mean(times.hungry));
  });
});

describe('the bellows: aimed pulls, wild tugs, tipping a window out', () => {
  it('pulling fluff with fluff chosen leaves a downy beside it alone, unless the crosshair is on the downy', () => {
    const sim = quiet();
    stand(sim, 0, 30);
    sim.s.slots[0] = { t: 'tuft-clover', n: 3 };
    sim.s.sel = 0;
    const d = sim.spawn('clover', 0.9, 26.8);
    run(sim, 1);
    const fluff = newItem(sim.s, 'tuft-clover', -0.4, sim.phys.floor(-0.4, 27) + 0.12, 27);
    fluff.grounded = true;
    sim.s.items.push(fluff);
    // The downy sits well inside the old 25 degree cone round the fluff.
    run(sim, 2, { ...idle, draw: true }, aimFrom(sim, fluff.x, fluff.y, fluff.z));
    expect(fluff.gone).toBe(true);
    expect(sim.s.slots[0].n).toBe(4);
    expect(d.gone).toBe(false);
    // On the downy: it comes (yours come at once).
    run(sim, 2, { ...idle, draw: true }, aimFrom(sim, d.x, d.y + 0.25, d.z));
    expect(d.gone).toBe(true);
  });

  it('a wild downy digs in for about a second of steady Pull, and gets away when the pull lets go of it', () => seeds(4, () => {
    const sim = quiet();
    stand(sim, 0, -16);
    const d = sim.spawn('clover', 0, -21.6, false);
    d.hunger = 0.2;
    run(sim, 0.5);
    const pullFor = (secs: number) => {
      for (let t = 0; t < secs && !d.gone; t += 1 / 30) sim.update(1 / 30, { ...idle, draw: true }, aimFrom(sim, d.x, d.y + 0.25, d.z));
    };
    pullFor(0.6);
    expect(d.gone).toBe(false);
    expect(d.tug).toBeGreaterThan(0.4);
    // Let go once it was well on its way: it gets away (the bellows cannot take it for a moment). Close in on it
    // again once it can be pulled (it has seen you: it is out of reach by now, or nearly).
    sim.events.length = 0;
    run(sim, 1.2, idle);
    expect(d.tug).toBe(0);
    expect(d.noPull).toBeGreaterThan(0);
    run(sim, 0.6, idle);
    const away = Math.hypot(d.x - sim.s.player.x, d.z - sim.s.player.z);
    const l = Math.max(away, 1e-3);
    stand(sim, d.x - ((d.x - sim.s.player.x) / l) * 4.5, d.z - ((d.z - sim.s.player.z) / l) * 4.5);
    let t = 0;
    while (!d.gone && t < 4) {
      sim.update(1 / 30, { ...idle, draw: true }, aimFrom(sim, d.x, d.y + 0.25, d.z));
      t += 1 / 30;
    }
    expect(d.gone).toBe(true);
    expect(t).toBeGreaterThan(0.8);
    // (Round 4: one that got away is wary, and digs in half as long again.)
    expect(t).toBeLessThan(2.6);
    expect(sim.s.slots.some((q) => q.t === 'clover')).toBe(true);
  }));

  it('wild downies notice you close by and hop away; yours do not', () => seeds(4, () => {
    const sim = quiet();
    stand(sim, 0, -16);
    const wild = sim.spawn('clover', 0, -19, false);
    const mine = sim.spawn('clover', 3, -16, true);
    wild.hunger = mine.hunger = 0.2;
    const w0 = Math.hypot(wild.x, wild.z + 16);
    const m0 = Math.hypot(mine.x, mine.z + 16);
    run(sim, 5);
    expect(Math.hypot(wild.x, wild.z + 16) - w0).toBeGreaterThan(1.5);
    expect(Math.abs(Math.hypot(mine.x - 0, mine.z + 16) - m0)).toBeLessThan(3);
  }));

  it('tips a whole window out on the ground a few metres in front of you', () => {
    const sim = quiet();
    stand(sim, 0, 30);
    for (let i = 0; i < 9; i++) sim.stow('cloverhead');
    sim.stow('clover');
    const aim = aimFrom(sim, 0, sim.s.player.y + 1.2, 25);
    expect(sim.empty(0, aim)).toBe(9);
    expect(sim.s.slots[0]).toMatchObject({ t: null, n: 0 });
    run(sim, 1.5, idle, aim);
    const heads = sim.s.items.filter((i) => !i.gone && i.type === 'cloverhead');
    expect(heads.length).toBe(9);
    for (const h of heads) {
      expect(h.z).toBeLessThan(30);
      // Tossed clear of your feet (the playtest's landed within 1.7 m and the next pull took them straight back).
      expect(Math.hypot(h.x, h.z - 30)).toBeGreaterThan(2);
      expect(Math.hypot(h.x, h.z - 30)).toBeLessThan(6);
    }
    expect(sim.events.some((e) => e.t === 'empty')).toBe(true);
    // A downy window too: it hops out, still yours.
    expect(sim.empty(1, aim)).toBe(1);
    expect(sim.s.downies.find((q) => !q.gone)?.tame).toBe(true);
    expect(sim.empty(1, aim)).toBe(0);
  });
});

describe('selling: what you blew in, and whole turns of the loop', () => {
  const CX = -6.5;
  const CZ = 36.5;
  const sells = (evs: Ev[]) => evs.filter((e): e is Extract<Ev, { t: 'sell' }> => e.t === 'sell');

  it('fluff the crate draws in from beside it is sold but is not a blow of yours', () => {
    const sim = quiet();
    const d = sim.spawn('clover', CX + 1.6, CZ - 1.4);
    d.hunger = 0.8;
    sim.drop('cloverhead', CX + 1.9, CZ - 1.4);
    const evs: Ev[] = [];
    for (let t = 0; t < 10; t += 1 / 30) {
      sim.update(1 / 30, idle, aimAt(sim, sim.s.player.x, sim.s.player.y + 1.6, sim.s.player.z - 5));
      evs.push(...sim.events);
      sim.events.length = 0;
    }
    const sold = sells(evs);
    expect(sold.length).toBe(2);
    expect(sold.every((e) => !e.blown && !e.cycle)).toBe(true);
  });

  it('a meal you gave, its fluff pulled up and blown in, closes the loop once', () => {
    const sim = quiet();
    const d = sim.spawn('clover', 8, 32);
    d.hunger = 0.8;
    const food = sim.drop('cloverhead', 8.4, 32);
    food.blown = true;
    const evs: Ev[] = [];
    const go = (secs: number, c: Controls = idle, a?: Aim) => {
      for (let t = 0; t < secs; t += 1 / 30) {
        sim.update(1 / 30, c, a ?? aimAt(sim, sim.s.player.x, sim.s.player.y + 1.6, sim.s.player.z - 5));
        evs.push(...sim.events);
        sim.events.length = 0;
      }
    };
    go(6);
    const ate = evs.find((e): e is Extract<Ev, { t: 'eat' }> => e.t === 'eat');
    expect(ate?.you).toBe(true);
    const shed = sim.s.items.filter((i) => !i.gone && i.type === 'tuft-clover');
    expect(shed.length).toBe(2);
    expect(shed.every((i) => i.feed > 0 && i.by === d.id)).toBe(true);
    // Pulled up into the jar: the window remembers the meal.
    for (const it of shed) {
      expect(sim.stow(it.type, it.feed)).toBe(true);
      it.gone = true;
    }
    stand(sim, CX + 1, CZ - 5);
    sim.s.sel = sim.s.slots.findIndex((q) => q.t === 'tuft-clover');
    const aim = aimFrom(sim, CX, sim.phys.floor(CX, CZ) + 0.75, CZ);
    sim.puff(aim);
    go(3, idle, aim);
    sim.puff(aim);
    go(3, idle, aim);
    const sold = sells(evs);
    expect(sold.length).toBe(2);
    expect(sold.every((e) => e.blown)).toBe(true);
    expect(sold.filter((e) => e.cycle).length).toBe(1);
  });
});
