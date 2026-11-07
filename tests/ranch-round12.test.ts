// Thistledown's round 12 leftovers (docs/BACKLOG.md: the twelfth playtest passed with no major problem; these are its
// bugs, misleading lines and polish), as tests on the render-free sim, tutor and pages: feed runs that starved a mixed
// pen, the hunt's arrow sending a rare one among another kind, getaways before any tell with nothing to say why, "Catch
// more" counting a guest's kind and a full jar, a tug through a bush, the ridge gate dropping the page to the sell goal,
// the dusk line taking the page from a pen line, "Earned" pages gone in a blink, and the pull mark on a hopper a blow
// falls short of. Each fails on the code the tester played (proved on a `git archive` copy of that commit); what that
// commit lacked is reached through the modules, so each fails on its own assertion.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOALS, ORDER_BY, PEN_MAX, journalGoals, type DownyKind, type GoalId, type Order } from '../src/games/ranch/defs';
import * as lessonsMod from '../src/games/ranch/lessons';
import { Pages, Tutor, catchMore, orderSpot, teachAll, type Mark, type Say } from '../src/games/ranch/lessons';
import { rng } from '../src/games/ranch/noise';
import * as simMod from '../src/games/ranch/sim';
import { CATCH, RARE_FIGHT, SHAKE_LOOSE, Sim, padSpots, rarePenOf, type Aim, type Controls, type Ev } from '../src/games/ranch/sim';
import type { Downy } from '../src/games/ranch/state';
import { BERRY_BUSHES, PADS, waterAt, zoneAt } from '../src/games/ranch/world';

vi.setConfig({ testTimeout: 120_000 });

const realRandom = Math.random;
beforeEach(() => {
  Math.random = rng(1212);
});
afterEach(() => {
  Math.random = realRandom;
});

const idle: Controls = { moveX: 0, moveZ: 0, sprint: false, jump: false, jumpPressed: false, draw: false, puff: false, puffPressed: false };
const pull: Controls = { ...idle, draw: true };
const touch: Say = { dev: 'touch', locked: false, lockAvailable: false };
const floorOf = (sim: Sim) => (x: number, z: number) => sim.phys.floor(x, z);
const L = lessonsMod as unknown as Record<string, unknown>;
const M = simMod as unknown as Record<string, unknown>;
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

function aimAt(sim: Sim, x: number, y: number, z: number): Aim {
  const p = sim.s.player;
  const ey = p.y + 1.6;
  const l = Math.hypot(x - p.x, y - ey, z - p.z);
  const dx = (x - p.x) / l;
  const dy = (y - ey) / l;
  const dz = (z - p.z) / l;
  return { ex: p.x, ey, ez: p.z, dx, dy, dz, mx: p.x + dx * 0.6 + 0.15, my: ey - 0.2, mz: p.z + dz * 0.6 };
}

function viewAim(sim: Sim): Aim {
  const p = sim.s.player;
  const cp = Math.cos(p.pitch);
  const dx = -Math.sin(p.yaw) * cp;
  const dy = Math.sin(p.pitch);
  const dz = -Math.cos(p.yaw) * cp;
  const ey = p.y + 1.6;
  return { ex: p.x, ey, ez: p.z, dx, dy, dz, mx: p.x + dx * 0.6 + 0.15, my: ey - 0.2, mz: p.z + dz * 0.6 };
}

function stand(sim: Sim, x: number, z: number): void {
  const p = sim.s.player;
  p.x = x;
  p.z = z;
  p.y = sim.phys.floor(x, z);
  p.vx = p.vz = p.vy = 0;
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

function pen(sim: Sim, i: number, ups: string[] = []): void {
  sim.s.pads[i].kind = 'pen';
  sim.s.pads[i].ups = ups;
  sim.phys.setPads(sim.s.pads);
}

function fill(sim: Sim, i: number, kind: DownyKind, n: number, hunger = 0.2): Downy[] {
  const out: Downy[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / Math.max(1, n)) * Math.PI * 2;
    const d = sim.spawn(kind, PADS[i].x + Math.cos(a) * 2, PADS[i].z + Math.sin(a) * 2, true);
    d.hunger = hunger;
    d.pen = i;
    out.push(d);
  }
  return out;
}

/** A rare one of yours in pen i (the hunt's reward, kept). */
function rareIn(sim: Sim, i: number, kind: DownyKind): Downy {
  const d = fill(sim, i, kind, 1)[0];
  d.rare = true;
  return d;
}

function run(sim: Sim, seconds: number, c: Controls = idle, aim?: () => Aim, evs?: Ev[]): void {
  for (let t = 0; t < seconds; t += 1 / 60) {
    sim.update(1 / 60, c, aim ? aim() : viewAim(sim));
    if (evs) evs.push(...sim.events);
    sim.events.length = 0;
  }
}

const mark = (): Mark => ({ on: false, icon: 'arrow', x: 0, y: 0, z: 0, rx: 0, rz: 0, r: 0, slot: -1 });

// ---------------------------------------------------------------- bugs

describe('A feed run feeds the pen where most eat its crop', () => {
  /** The tester's day 5: a sweetroot garden with a run between the ember pen (seven embers and the gold clover, feeder empty) and the brook pen (five brooks and a thistle). */
  function day5(): Sim {
    const sim = quiet(10);
    const s = sim.s;
    teachAll(s);
    pen(sim, 0, ['feeder']);
    fill(sim, 0, 'ember', 7, 0.8);
    rareIn(sim, 0, 'clover');
    s.pads[1].kind = 'garden';
    s.pads[1].crop = 'sweetroot';
    s.pads[1].ups = ['run'];
    pen(sim, 2, ['feeder']);
    s.pads[2].feeder = { t: 'dewberry', n: 10 };
    fill(sim, 2, 'brook', 5);
    fill(sim, 2, 'thistle', 1);
    sim.phys.setPads(s.pads);
    stand(sim, 0, 36);
    return sim;
  }

  it('an empty feeder whose embers eat sweetroot gets it, a gold clover among them or not', () => {
    const sim = day5();
    expect(sim.runTarget(1), 'the ember pen, not the brook pen').toBe(0);
    // A crop comes: into the ember feeder; none into the brook feeder.
    sim.s.pads[1].grow = 0.9999;
    run(sim, 0.5);
    const fd0 = sim.s.pads[0].feeder;
    const roots0 = (fd0.t === 'sweetroot' ? fd0.n : 0) + (fd0.t2 === 'sweetroot' ? fd0.n2 ?? 0 : 0);
    const fd2 = sim.s.pads[2].feeder;
    const roots2 = (fd2.t === 'sweetroot' ? fd2.n : 0) + (fd2.t2 === 'sweetroot' ? fd2.n2 ?? 0 : 0);
    expect(roots0, 'the ember feeder took the crop').toBeGreaterThan(0);
    expect(roots2, 'the brook feeder took none').toBe(0);
  });

  it('a pen where only a guest eats the crop never gets it: one thistle among five brooks', () => {
    const sim = day5();
    // The ember pen gone: the brook pen is the only neighbour with a feeder.
    sim.s.pads[0].kind = 'empty';
    sim.s.pads[0].ups = [];
    for (const d of sim.s.downies) if (d.pen === 0) d.gone = true;
    sim.phys.setPads(sim.s.pads);
    expect(sim.runTarget(1)).toBe(-1);
    // And its bed full, its tip goes nowhere either.
    sim.s.pads[1].ups = [];
    expect(sim.runTarget(1)).toBe(-1);
  });

  it("a mixed pen where a good share eat it still gets it, with no pen of most beside it, its feeder empty", () => {
    const sim = quiet(10);
    const s = sim.s;
    teachAll(s);
    pen(sim, 0, ['feeder']);
    fill(sim, 0, 'clover', 4);
    fill(sim, 0, 'ember', 3);
    s.pads[1].kind = 'garden';
    s.pads[1].crop = 'sweetroot';
    s.pads[1].ups = ['run'];
    sim.phys.setPads(s.pads);
    expect(sim.runTarget(1)).toBe(0);
  });
});

describe("The hunt's arrow takes the rare one to a pen of its own kind", () => {
  function ranch(): Sim {
    const sim = quiet(10);
    teachAll(sim.s);
    sim.s.gates.ridge = true;
    pen(sim, 0);
    fill(sim, 0, 'ember', 7);
    pen(sim, 3);
    fill(sim, 3, 'clover', 4);
    return sim;
  }
  const rp = rarePenOf as (s: Sim['s'], aboard?: boolean, kind?: DownyKind) => number;

  it('a gold clover goes to the clover pen, not the fuller ember pen', () => {
    const sim = ranch();
    expect(rp(sim.s, false, 'clover')).toBe(3);
    expect(rp(sim.s, false, 'ember')).toBe(0);
    // The arrow, with it aboard: on the clover pen.
    const s = sim.s;
    const o: Order = { kind: 'clover', live: true, n: 1, got: 0, paid: 0, mult: 2, pay: 65, state: 'open', rare: { spot: 0 }, by: ORDER_BY };
    s.orders = [o];
    s.slots[0] = { t: 'clover', n: 1, downs: [{ h: 0.3, c: s.day, rare: true }] };
    s.sel = 0;
    const m = mark();
    expect(orderSpot(s, m, floorOf(sim))).toBe(true);
    expect(Math.hypot(m.x - PADS[3].x, m.z - PADS[3].z), 'over the clover pen').toBeLessThan(0.5);
  });

  it('never a pen where it would be the only one of its kind while another has room; only one with room, that one', () => {
    const sim = ranch();
    // An empty pen as well: it goes there before the ember pen once the clover pen is full.
    pen(sim, 4);
    fill(sim, 3, 'clover', PEN_MAX - 4);
    expect(rp(sim.s, false, 'clover'), 'the empty pen').toBe(4);
    // No empty pen: the ember pen, the only one with room.
    sim.s.pads[4].kind = 'empty';
    sim.phys.setPads(sim.s.pads);
    expect(rp(sim.s, false, 'clover')).toBe(0);
  });
});

describe('Getaways: none before a tell for a good thumb, and the note says why', () => {
  function wild(sim: Sim, kind: DownyKind, x: number, z: number): Downy {
    const d = sim.spawn(kind, x, z, false);
    d.hunger = 0.2;
    d.y = sim.phys.floor(x, z);
    d.grounded = true;
    return d;
  }

  it('one already on the line keeps it when another of its group comes nearer the crosshair, within its give', () => {
    const sim = quiet(10);
    teachAll(sim.s);
    sim.s.gates.ridge = true;
    stand(sim, -50, -10);
    const a = wild(sim, 'ember', -50, -15);
    // A tug on it: pressed with the crosshair on its middle.
    sim.update(1 / 60, pull, aimAt(sim, a.x, a.y + 0.25, a.z));
    sim.events.length = 0;
    expect(a.strain).toBeGreaterThan(0);
    // Another of its group, half a metre to the side; the crosshair a little off the first, towards the second.
    const b = wild(sim, 'ember', a.x + 0.55, a.z);
    // (Level with it: the ridge slopes.)
    b.y = a.y;
    const aim = aimAt(sim, a.x + 0.42, a.y + 0.25, a.z);
    expect(sim.aimedDowny(aim), 'the one on the line').toBe(a);
    // Off the first one's give altogether: then not it.
    expect(sim.aimedDowny(aimAt(sim, a.x + 1.4, a.y + 0.25, a.z))).not.toBe(a);
    expect(b.strain).toBe(0);
  });

  it('two on the line: the crosshair and the view keep to the fight you are in, not one of its group just grabbed', () => {
    const sim = quiet(10);
    teachAll(sim.s);
    sim.s.gates.ridge = true;
    stand(sim, -50, -10);
    const a = wild(sim, 'ember', -50, -15);
    const b = wild(sim, 'ember', -49.45, -15);
    b.y = a.y;
    // The first well into its fight; the second grabbed a moment ago, as the crosshair slid onto it.
    Object.assign(a, { strain: 0.8, tug: 0.45, peak: 0.35 });
    Object.assign(b, { strain: 0.05, tug: 0.05, peak: 0.04, held: true });
    expect(sim.aimedDowny(aimAt(sim, a.x + 0.42, a.y + 0.25, a.z)), 'the crosshair keeps the first').toBe(a);
    expect(sim.tugged(), 'the view holds on the first').toBe(a);
  });

  it('the look that aimed the press does not keep the view hold off once the tug starts', () => {
    const sim = quiet(10);
    teachAll(sim.s);
    sim.s.gates.ridge = true;
    stand(sim, -50, -10);
    const d = wild(sim, 'clover', -50, -15.5);
    const p = sim.s.player;
    // A look drag brings the crosshair near it, a little to one side of its middle (inside its give), then stops.
    const want = Math.atan2(-(d.x - p.x), -(d.z - p.z));
    p.pitch = Math.atan2(d.y + 0.25 - (p.y + 1.6), Math.hypot(d.x - p.x, d.z - p.z));
    for (let k = 0; k < 6; k++) {
      p.yaw = want + 0.05;
      sim.update(1 / 60, { ...idle, look: 0.04 }, viewAim(sim));
      sim.events.length = 0;
    }
    // The press, no look: within the first 0.3 s the view turns onto it by itself.
    const yaw0 = p.yaw;
    for (let k = 0; k < 18; k++) {
      d.x = -50;
      d.z = -15.5;
      sim.update(1 / 60, { ...pull, look: 0 }, viewAim(sim));
      sim.events.length = 0;
    }
    expect(d.strain, 'a tug on it').toBeGreaterThan(0);
    expect(Math.abs(p.yaw - yaw0), 'the view turned towards it').toBeGreaterThan(0.004);
    expect(Math.abs(p.yaw - want)).toBeLessThan(Math.abs(yaw0 - want));
  });

  it('a fake puff let go on early in a fight never gets it away by itself: some of the pull goes, and the slack runs', () => {
    const sim = quiet(10);
    teachAll(sim.s);
    sim.s.gates.ridge = true;
    stand(sim, -50, -10);
    const d = wild(sim, 'ember', -50, -15);
    d.rare = true;
    d.calm = 6;
    // Early in its fight, a third of a plain ember's pull in (its peak), puffing up for a fake.
    d.strain = 0.6;
    d.tug = 0.45;
    d.peak = 0.45 / CATCH.ember.need;
    expect(d.peak).toBeGreaterThanOrEqual(SHAKE_LOOSE);
    d.feint = 0.2;
    d.beats = 2;
    const evs: Ev[] = [];
    run(sim, 0.1, idle, () => aimAt(sim, d.x, d.y + 0.25, d.z), evs);
    expect(evs.some((e) => e.t === 'escape'), 'no getaway on the let-go').toBe(false);
    expect(d.tug, 'it took back some of the pull, not all').toBeGreaterThan(0);
    expect(d.slackT).toBeGreaterThanOrEqual(0);
    expect(RARE_FIGHT.need).toBeGreaterThan(1);
  });

  it('every getaway says why, in eight words or fewer, in the button words', () => {
    const note = L.getawayNote as ((why: string, dove: boolean, dev: string) => string) | undefined;
    expect(typeof note, 'getawayNote').toBe('function');
    const whys = ['slack', 'time', 'off', 'let', 'far', 'twice', 'unlured'];
    const lines = new Set<string>();
    for (const why of whys) {
      for (const dev of ['touch', 'mouse', 'pad']) {
        const t = note!(why, false, dev);
        lines.add(t);
        expect(words(t), t).toBeLessThanOrEqual(8);
        expect(t, t).not.toMatch(/[\u2013\u2014!]/);
        expect(t).not.toBe('It got away.');
      }
    }
    expect(note!('let', false, 'touch')).toMatch(/Pull/);
    expect(note!('let', false, 'mouse')).toMatch(/right click/);
    expect(note!('let', false, 'pad')).toMatch(/LT/);
    expect(note!('time', true, 'touch')).toBe('It slipped into the water.');
    expect(lines.size).toBeGreaterThanOrEqual(whys.length);
  });

  it('the sim says why on the escape: its time, Pull let go, the crosshair off it, too far, a second slip, unlured', () => {
    const why = (setup: (sim: Sim, d: Downy) => void, c: Controls, aimOff = 0, kind: DownyKind = 'clover'): string | undefined => {
      const sim = quiet(10);
      teachAll(sim.s);
      sim.s.gates.ridge = sim.s.gates.hollow = true;
      sim.phys.gates = { ...sim.s.gates };
      stand(sim, -10, -2);
      const d = wild(sim, kind, -10, -7);
      setup(sim, d);
      const evs: Ev[] = [];
      run(sim, 0.6, c, () => aimAt(sim, d.x + aimOff, d.y + 0.25, d.z), evs);
      const e = evs.find((q) => q.t === 'escape') as (Ev & { why?: string }) | undefined;
      return e ? e.why ?? 'none given' : undefined;
    };
    // Pull let go once a third of the way in, no pull back to let go for.
    expect(why((_s, d) => Object.assign(d, { strain: 0.5, tug: 0.02, peak: 0.5 }), idle)).toBe('let');
    // Pull held, the crosshair well off it.
    expect(why((_s, d) => Object.assign(d, { strain: 0.5, tug: 0.02, peak: 0.5 }), pull, 2.5)).toBe('off');
    // On the line but out past its reach.
    expect(why((sim, d) => {
      d.x = sim.s.player.x;
      d.z = sim.s.player.z - 11.5;
      d.y = sim.phys.floor(d.x, d.z);
      Object.assign(d, { strain: 0.5, tug: 0.02, peak: 0.5 });
    }, pull)).toBe('far');
    // A brook's time runs out.
    expect(why((_s, d) => Object.assign(d, { strain: CATCH.brook.limit - 0.05, tug: 0.3, peak: 0.3 }), pull, 0, 'brook')).toBe('time');
    // The rare one, pulled unlured.
    expect(why((_s, d) => Object.assign(d, { rare: true, calm: 0, strain: 1.15, tug: 0.3, peak: 0.3 }), pull)).toBe('unlured');
    // A second slip while wary from the first (one with a time): held on through its pull back.
    expect(why((_s, d) => Object.assign(d, { wary: 5, strain: 0.5, tug: 0.4, peak: 0.4, back: 0.6, backHeld: 0.5 }), pull, 0, 'brook')).toBe('twice');
  });
});

describe('"Catch more" counts a pen by its majority, and never shows with no room in the jar', () => {
  function saving(): Sim {
    const sim = quiet(10);
    const s = sim.s;
    teachAll(s);
    s.gates.ridge = true;
    sim.phys.gates = { ...s.gates };
    s.coins = 43;
    s.goals = GOALS.slice(0, GOALS.findIndex((g) => g.id === 'hollow')).map((g) => g.id) as GoalId[];
    // The ember pen with the gold clover in it; the clover pen full.
    pen(sim, 0);
    fill(sim, 0, 'ember', 6);
    rareIn(sim, 0, 'clover');
    pen(sim, 3);
    fill(sim, 3, 'clover', PEN_MAX);
    return sim;
  }

  it('three embers aboard filling the ember pen, out on the ridge: no line for a wild clover', () => {
    const sim = saving();
    const s = sim.s;
    s.slots[0] = { t: 'ember', n: 3, downs: [0, 1, 2].map(() => ({ h: 0.3, c: s.day })) };
    stand(sim, -50, -10);
    expect(zoneAt(s.player.x, s.player.z)).toBe('ridge');
    expect(catchMore('hollow', s)).toBeNull();
  });

  it('room in a pen but none in the jar: no line', () => {
    const sim = saving();
    const s = sim.s;
    // The clover pen with room again, so a clover would be the line, but every window holds something else.
    for (const d of s.downies) if (d.pen === 3 && !d.gone) {
      d.gone = true;
      break;
    }
    stand(sim, 0, 10);
    expect(catchMore('hollow', s), 'room in the ember pen').toBe('ember');
    s.slots = [
      { t: 'cloverhead', n: 3 },
      { t: 'sweetroot', n: 2 },
      { t: 'dewberry', n: 1 },
      { t: 'tuft-clover', n: 4 },
    ];
    expect(catchMore('hollow', s)).toBeNull();
  });
});

describe('No tug starts on a downy hidden from you', () => {
  /** A brook a metre behind a dewberry bush in the hollow, you 4.5 m in front of the bush. */
  function behindBush(): { sim: Sim; d: Downy; clear: () => void } {
    const sim = quiet(10);
    teachAll(sim.s);
    sim.s.gates.ridge = sim.s.gates.hollow = true;
    sim.phys.gates = { ...sim.s.gates };
    let pick: { b: (typeof BERRY_BUSHES)[number]; a: number } | null = null;
    for (const b of BERRY_BUSHES) {
      if (zoneAt(b.x, b.z) !== 'hollow') continue;
      for (let a = 0; a < Math.PI * 2 && !pick; a += 0.3) {
        const px = b.x + Math.cos(a) * 4.5;
        const pz = b.z + Math.sin(a) * 4.5;
        const qx = b.x - Math.cos(a) * 1.0;
        const qz = b.z - Math.sin(a) * 1.0;
        const ok = (x: number, z: number) => zoneAt(x, z) === 'hollow' && waterAt(x, z) < sim.phys.floor(x, z) - 0.05;
        // (Level ground, so the bush is what hides it, and no other bush near.)
        const flat = Math.abs(sim.phys.floor(px, pz) - sim.phys.floor(b.x, b.z)) < 0.4 && Math.abs(sim.phys.floor(qx, qz) - sim.phys.floor(b.x, b.z)) < 0.4;
        if (ok(px, pz) && ok(qx, qz) && flat && BERRY_BUSHES.every((o) => o === b || Math.hypot(o.x - b.x, o.z - b.z) > 3)) pick = { b, a };
      }
      if (pick) break;
    }
    expect(pick, 'a bush in the hollow with level dry ground round it').not.toBeNull();
    const { b, a } = pick!;
    stand(sim, b.x + Math.cos(a) * 4.5, b.z + Math.sin(a) * 4.5);
    const d = sim.spawn('brook', b.x - Math.cos(a) * 1.0, b.z - Math.sin(a) * 1.0, false);
    d.y = sim.phys.floor(d.x, d.z);
    d.grounded = true;
    d.hunger = 0.2;
    // Out from behind it: 2.5 m to the side.
    const clear = () => {
      d.x += -Math.sin(a) * 2.5;
      d.z += Math.cos(a) * 2.5;
      d.y = sim.phys.floor(d.x, d.z);
    };
    return { sim, d, clear };
  }

  it('the first press with the brook behind the bush starts nothing; out from behind it, it does', () => {
    const { sim, d, clear } = behindBush();
    const aim = () => aimAt(sim, d.x, d.y + 0.25, d.z);
    expect(sim.phys.inSight, 'a line of sight test').toBeTypeOf('function');
    expect(sim.aimedDowny(aim()), 'no mark on the leaves').toBeNull();
    expect(sim.aimTarget(aim())).not.toBe('target');
    sim.update(1 / 60, pull, aim());
    sim.update(1 / 60, pull, aim());
    expect(d.strain, 'no tug').toBe(0);
    expect(d.tug).toBe(0);
    sim.update(1 / 60, idle, aim());
    clear();
    expect(sim.aimedDowny(aim())).toBe(d);
    sim.update(1 / 60, pull, aim());
    expect(d.strain, 'a tug, in plain view').toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- polish

describe('Paying for a gate puts its catch goal first', () => {
  it('the ridge gate paid with 20 fluff not yet sold: "Catch an ember downy." comes before the sell goal', () => {
    const sim = quiet(10);
    const s = sim.s;
    teachAll(s);
    s.goals = ['catch', 'pen', 'feed', 'herd', 'plant', 'order'];
    expect(sim.openGoals(1)[0].id).toBe('sell');
    s.coins = 600;
    expect(sim.choose({ kind: 'gate', id: 'ridge', label: 'Gate', x: 0, y: 0, z: 0 }, 'gate:ridge')).toBe(true);
    expect(s.goals).toContain('ridge');
    expect(sim.openGoals(1)[0].id).toBe('ember');
    expect(sim.openGoals(2).map((g) => g.id)).toEqual(['ember', 'sell']);
    // The pause page's journal says the same.
    expect(journalGoals(s.goals).at(-1)!.text).toBe('Catch an ember downy.');
    // Caught, the page goes back to the sell goal.
    s.goals.push('ember');
    expect(sim.openGoals(1)[0].id).toBe('sell');
  });
});

describe('The pen line finishes before the dusk line takes the page', () => {
  it('with two embers aboard at 18:23, building their pen goes on to blowing them in, then the dusk line', () => {
    const sim = quiet(18.2);
    const s = sim.s;
    teachAll(s);
    // The dusk line not yet learned (the tester never slept the first night): it comes at 18:18 and later.
    s.learn = s.learn.filter((w) => w !== 'lesson:dusk');
    s.day = 2;
    s.night = 2;
    s.orderDay = 2;
    s.gates.ridge = true;
    pen(sim, 0);
    fill(sim, 0, 'clover', 6);
    s.coins = 450;
    s.slots[0] = { t: 'ember', n: 2, downs: [{ h: 0.3, c: s.day }, { h: 0.3, c: s.day }] };
    s.sel = 0;
    stand(sim, 10, 34);
    const tutor = new Tutor();
    const view = (secs: number) => {
      let v = tutor.update(s, 1 / 30, touch, floorOf(sim));
      for (let t = 0; t < secs; t += 1 / 30) {
        sim.update(1 / 30, idle, viewAim(sim));
        for (const e of sim.events) tutor.onEvent(s, e);
        sim.events.length = 0;
        v = tutor.update(s, 1 / 30, touch, floorOf(sim));
      }
      return v;
    };
    expect(view(1).line).toBe('Build a pen for your embers.');
    // 18:23: the dusk line is ready now, and waits. Built (the plot beside the clover pen).
    s.hour = 18.38;
    expect(view(0.5).line).toBe('Build a pen for your embers.');
    s.coins -= 200;
    pen(sim, 1);
    const after = view(1.5);
    expect(after.line, 'the pen line goes on').toBe('Blow the embers into the pen.');
    expect(words(after.line)).toBeLessThanOrEqual(8);
    expect(tutor.mark.on).toBe(true);
    expect(Math.hypot(tutor.mark.x - PADS[1].x, tutor.mark.z - PADS[1].z), 'the arrow on the new pen').toBeLessThan(0.5);
    // In they go: then the dusk line.
    s.slots[0] = { t: null, n: 0 };
    fill(sim, 1, 'ember', 2);
    const last = view(3);
    expect(last.line).toBe('Sleep at the front door till morning.');
  });
});

describe('Pages of something done stay up in real time', () => {
  it('a page stays at least 1.5 real seconds, however fast the game runs', () => {
    const P = Pages as unknown as { MIN_REAL?: number };
    expect(P.MIN_REAL ?? 0).toBeGreaterThanOrEqual(1.5);
    const pages = new Pages();
    pages.add({ title: 'Earned 52 coins', lines: [{ text: 'Clover fluff, 4 of 4.', done: true, fresh: true }] });
    const v = { line: '', done: false };
    const up = (pages.update as (...a: unknown[]) => unknown).bind(pages);
    expect(up(1 / 60, v, 0, false, false, 1 / 60)).not.toBeNull();
    // Ten game seconds in 0.5 real ones (a script running the game on): still up.
    up(10, v, 0, false, false, 0.5);
    expect(pages.showing?.title).toBe('Earned 52 coins');
    up(0.1, v, 0, false, false, 0.9);
    expect(pages.showing?.title).toBe('Earned 52 coins');
    up(0.1, v, 0, false, false, 0.3);
    expect(pages.showing).toBeNull();
  });
});

describe('Aimed at a hopper a blow would fall short of, the crosshair says aim higher', () => {
  it('roots chosen 7 m from an ember feeder: "aim higher", not the pull mark; raised until it changes, the feeder mark, and the blow lands in it', () => {
    const sim = quiet(10);
    const s = sim.s;
    teachAll(s);
    pen(sim, 1, ['feeder']);
    fill(sim, 1, 'ember', 4);
    s.pads[1].feeder = { t: 'sweetroot', n: 5 };
    s.slots[0] = { t: 'sweetroot', n: 6 };
    s.sel = 0;
    const h = padSpots(1).hopper;
    const hy = sim.phys.floor(h.x, h.z) + h.y;
    stand(sim, h.x + 0.5, h.z + 7);
    expect(Math.hypot(s.player.x - h.x, s.player.z - h.z)).toBeGreaterThan(6.9);
    const at = sim.aimTarget(aimAt(sim, h.x, hy, h.z)) as string | null;
    expect(at, 'aim higher at the hopper itself').toBe('higher');
    let up = 0;
    let mk: string | null = at;
    for (; up < 2.5 && mk === 'higher'; up += 0.05) mk = sim.aimTarget(aimAt(sim, h.x, hy + up, h.z));
    expect(mk, `the feeder mark, ${up.toFixed(2)} m up`).toBe('feeder');
    const aim = aimAt(sim, h.x, hy + up - 0.05 + 0.1, h.z);
    if (sim.aimTarget(aim) !== 'feeder') throw new Error('mark lost');
    const n0 = s.pads[1].feeder.n;
    sim.puff(aim);
    run(sim, 2, idle, () => aim);
    expect(s.pads[1].feeder.n, 'it landed in the feeder').toBe(n0 + 1);
    expect(typeof M.AIM_HIGHER).toBe('object');
  });
});

// (Guards that the fixes kept what the earlier rounds asked: a gold clover with no pen of its kind still has somewhere to go.)
describe('Guards', () => {
  it('rarePenOf with no kind given is as it was: the fullest pen with room', () => {
    const sim = quiet(10);
    pen(sim, 0);
    fill(sim, 0, 'ember', 7);
    pen(sim, 3);
    fill(sim, 3, 'clover', 4);
    expect(rarePenOf(sim.s, false)).toBe(0);
  });
  it('lessons are still eight words or fewer', () => {
    const all = (L.allLines as () => { id: string; line: string }[])();
    for (const l of all) expect(words(l.line), l.line).toBeLessThanOrEqual(8);
  });
});
