// Thistledown's rules, run without rendering: the canister, hunger and
// shedding, gardens, the Exchange, builds, gates, nettlebacks, silos,
// feeders, the chute, sleep, the journal and the save.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CAPS, HOUR, KIND } from '../src/games/ranch/defs';
import { Sim, GARDEN_SRC, padSpots, type Aim, type Controls } from '../src/games/ranch/sim';
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
  it('get hungry over about three game hours, slower with company', () => {
    const sim = quiet();
    pen(sim, 1);
    const a = sim.spawn('clover', PADS[1].x, PADS[1].z);
    a.hunger = 0;
    run(sim, 1.5 * HOUR);
    expect(a.hunger).toBeGreaterThan(0.45);
    expect(a.hunger).toBeLessThan(0.56);
    const b = sim.spawn('clover', PADS[1].x + 1, PADS[1].z);
    a.hunger = 0;
    b.hunger = 0;
    run(sim, 1.5 * HOUR);
    expect(a.hunger).toBeLessThan(0.45);
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

  it('do not shed when frazzled (starving), and frazzle when crowded', () => {
    const sim = quiet();
    pen(sim, 1, ['high']);
    const at = PADS[1];
    const d = sim.spawn('clover', at.x, at.z);
    d.hunger = 1;
    sim.drop('cloverhead', at.x + 0.4, at.z);
    run(sim, 8);
    expect(sim.s.stats.fed).toBe(1);
    expect(sim.s.items.filter((i) => !i.gone && i.type.startsWith('tuft')).length).toBe(0);
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
  it('grow five every two game hours; a sprinkler is half again as fast; rich soil gives eight', () => {
    const sim = quiet();
    const g = sim.s.pads[0];
    g.grow = 0;
    const count = () => sim.s.items.filter((i) => !i.gone && i.src === GARDEN_SRC).length;
    run(sim, 2 * HOUR + 1);
    expect(count()).toBe(5);
    sim.s.items = [];
    g.grow = 0;
    g.ups = ['sprinkler', 'soil'];
    run(sim, (2 * HOUR) / 1.5 + 1);
    expect(count()).toBe(8);
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
  it('drifts prices within a quarter and drops 1.5% per tuft sold today', () => {
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
    expect(sim.price('clover')).toBe(Math.round(8 * Math.pow(0.985, 40)));
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
    expect(sim.s.coins).toBe(10);
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
    expect(sim.s.slots[0]).toEqual({ t: 'tuft-clover', n: 2 });
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
    expect(sim.s.coins).toBe(c + 100 + 20);
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
