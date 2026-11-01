// Thistledown's second harsh playtest, as tests on the render-free sim and
// tutor. Each P0 and P1 finding has a test here that fails on the code the
// tester played (new modules are imported inside the tests, so the rest of
// the file still runs against that older code).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOUR } from '../src/games/ranch/defs';
import { Tutor, allLines, teachAll, type Say } from '../src/games/ranch/lessons';
import { Sim, padSpots, type Aim, type Controls, type Ev } from '../src/games/ranch/sim';
import { newItem } from '../src/games/ranch/state';
import { PADS, PEN_R } from '../src/games/ranch/world';
import { rng } from '../src/games/ranch/noise';

// Long sims (game days, ten real minutes) run well over the default 5 s on a loaded machine.
vi.setConfig({ testTimeout: 60_000 });

const realRandom = Math.random;
beforeEach(() => {
  Math.random = rng(11);
});
afterEach(() => {
  Math.random = realRandom;
});
function seeds(n: number, body: () => void): void {
  for (let k = 1; k <= n; k++) {
    Math.random = rng(k * 7919);
    body();
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

/** A teaching ranch and its tutor; run() advances both, the sim's events fed to the tutor. */
function ranch(learned: string[] = [], features: string[] = []) {
  const sim = new Sim(null);
  sim.teaching = true;
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

/** Everything up to the meadow lesson learned, with what those lessons bring in. */
const TO_MEADOW = ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'slots'];
const TO_MEADOW_F = ['bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'slots'];
/** The basics and the meadow learned: the day runs on. */
const PAST_MEADOW = [...TO_MEADOW, 'meadow', 'jump', 'farm'];
const PAST_MEADOW_F = [...TO_MEADOW_F, 'time', 'jump'];

const tufts = (sim: Sim) => sim.s.items.filter((i) => !i.gone && i.type.startsWith('tuft'));

// ---------------------------------------------------------------- P0

describe('P0: your first downy does not starve and run off during the meadow lesson', () => {
  it('with the clock held at half past four, a penned downy at hunger 0.36 is still fed, calm and penned seven minutes later', () => seeds(3, () => {
    const { sim, s, tutor, run } = ranch(TO_MEADOW, TO_MEADOW_F);
    s.hour = 16.5;
    pen(sim, 1);
    const d = sim.spawn('clover', PADS[1].x, PADS[1].z, true);
    d.hunger = 0.36;
    run(1);
    expect(tutor.current).toBe('meadow');
    let peak = 0;
    let out = false;
    for (let t = 0; t < 420; t += 5) {
      run(5);
      peak = Math.max(peak, d.hunger);
      out ||= sim.phys.penAt(d.x, d.z) !== 1;
    }
    // The playtest: starving at 180 s, frazzled at 300 s, over the fence at 330 s.
    expect(s.hour).toBeCloseTo(16.5, 2);
    expect(peak).toBeLessThan(0.4);
    expect(d.mood).not.toBe('frazzled');
    expect(out).toBe(false);
    expect(tutor.current).toBe('meadow');
  }), 30000);

  it('the porch downy and a loose one of yours wait too, and hunger runs again once the day does', () => {
    const { sim, s, run } = ranch(TO_MEADOW, TO_MEADOW_F);
    s.hour = 16.5;
    // (Nothing to eat about, so its hunger only climbs: no crop in the starter garden either.)
    s.items = [];
    s.pads[0].crop = null;
    const loose = sim.spawn('clover', 0, 32, true);
    loose.hunger = 0.4;
    const porch = s.downies.find((q) => q.keep)!;
    const p0 = porch.hunger;
    run(240);
    expect(loose.hunger).toBeLessThan(0.42);
    expect(porch.hunger).toBeLessThanOrEqual(p0 + 0.01);
    // The meadow done: the clock runs, and so does hunger.
    s.learn.push('time');
    s.hour = 10;
    run(2 * HOUR);
    expect(loose.hunger).toBeGreaterThan(0.6);
  });
});

// ---------------------------------------------------------------- P1

describe('P1: a Buy never spends coins on a tag you did not choose', () => {
  const opts = [
    { id: 'build:pen', title: 'Pen', price: 250, ok: true, note: '' },
    { id: 'build:garden', title: 'Garden', price: 200, ok: true, note: '' },
    { id: 'build:silo', title: 'Silo', price: 300, ok: true, note: '' },
  ];

  it('on touch nothing is chosen when the tags come down, even with the crosshair on one; the act button says to tap a tag', async () => {
    const { TagChoice } = await import('../src/games/ranch/menu');
    const c = new TagChoice();
    c.open(opts, 'touch', null);
    // The view turned to face the tags and the crosshair landed on the Silo (the playtest's 300 coins).
    c.aim(2, 0.4);
    expect(c.hot).toBe(-1);
    expect(c.label(opts)).toBe('Tap a tag');
    expect(c.press(opts)).not.toBe('take');
    // A tap chooses (the act button says Buy); a second tap on it, or the act button, buys.
    expect(c.tap(2)).toBe(false);
    expect(c.hot).toBe(2);
    expect(c.label(opts)).toBe('Buy');
    expect(c.press(opts)).toBe('take');
    expect(c.tap(1)).toBe(false);
    expect(c.hot).toBe(1);
    expect(c.tap(1)).toBe(true);
  });

  it('with a mouse or a pad, the view turning onto a tag chooses nothing; looking about yourself does', async () => {
    const { TagChoice } = await import('../src/games/ranch/menu');
    const c = new TagChoice();
    for (const dev of ['mouse', 'pad'] as const) {
      c.open(opts, dev, null);
      c.aim(2, 0);
      expect(c.hot).toBe(-1);
      expect(c.label(opts)).toBe('Look at a tag');
      expect(c.press(opts)).toBe('close');
      c.aim(2, 0.05);
      expect(c.hot).toBe(2);
    }
  });

  it('the garden lesson chooses Garden for you (the playtest had Pen chosen while the line said Garden)', async () => {
    const { TagChoice } = await import('../src/games/ranch/menu');
    const { sim, s, tutor, run } = ranch();
    teachAll(s);
    s.learn = s.learn.filter((w) => !['lesson:garden', 'lesson:plant', 'garden'].includes(w));
    s.coins = 260;
    s.hour = 10;
    run(0.5);
    expect(tutor.current).toBe('garden');
    expect(tutor.tag).toBe('build:garden');
    const c = new TagChoice();
    c.open(sim.menu({ kind: 'pad', id: 1, label: '', x: 0, y: 0, z: 0 }), 'touch', tutor.tag);
    expect(opts[c.hot]?.id ?? sim.menu({ kind: 'pad', id: 1, label: '', x: 0, y: 0, z: 0 })[c.hot]?.id).toBe('build:garden');
    expect(c.label(opts)).toBe('Buy');
  });
});

describe('P1: sweeping the meadow is no way to get rich', () => {
  it('a wild downy that eats makes no fluff; one of yours does', () => {
    const sim = new Sim(null);
    sim.wild = false;
    sim.s.downies = [];
    sim.s.items = [];
    sim.s.hour = 10;
    const wild = sim.spawn('clover', 0, -10, false);
    wild.hunger = 0.65;
    sim.drop('cloverhead', 0.4, -10);
    for (let t = 0; t < 8; t += 1 / 30) sim.update(1 / 30, idle, ahead(sim));
    expect(sim.s.stats.fed).toBe(1);
    expect(tufts(sim).length).toBe(0);
    const mine = sim.spawn('clover', 6, -10, true);
    mine.hunger = 0.8;
    sim.drop('cloverhead', 6.4, -10);
    for (let t = 0; t < 8; t += 1 / 30) sim.update(1 / 30, idle, ahead(sim));
    expect(sim.s.stats.fed).toBe(2);
    expect(tufts(sim).length).toBe(2);
  });

  it('after a morning of wild downies foraging, the meadow has no fluff to sweep up (the playtest found 70 to 84)', () => {
    const sim = new Sim(null);
    sim.s.hour = 8;
    sim.s.night = sim.s.day;
    for (let t = 0; t < 6 * HOUR; t += 1 / 20) sim.update(1 / 20, idle, ahead(sim));
    expect(sim.s.stats.fed).toBeGreaterThan(5);
    const meadow = tufts(sim).filter((i) => i.z < 18);
    expect(meadow.length).toBeLessThanOrEqual(2);
  });
});

describe('P1: the feeder is taught, strays are called out, and a fright keeps a downy inside', () => {
  it('buying a feeder brings a lesson to fill it, pointing at the hopper, done when food goes in', () => {
    const { sim, s, tutor, run, view } = ranch();
    teachAll(s);
    s.learn = s.learn.filter((w) => !w.startsWith('up:') && w !== 'silo' && !['lesson:ups', 'lesson:feeder', 'lesson:bench', 'lesson:gates', 'bench', 'gates'].includes(w));
    s.hour = 10;
    pen(sim, 1);
    sim.spawn('clover', PADS[1].x, PADS[1].z, true).hunger = 0.2;
    s.coins = 350;
    run(0.5);
    expect(tutor.current).toBe('ups');
    expect(sim.choose({ kind: 'pad', id: 1, label: '', x: 0, y: 0, z: 0 }, 'pen:feeder')).toBe(true);
    for (const e of sim.events) tutor.onEvent(s, e);
    sim.events.length = 0;
    run(2);
    // The playtest: the journal jumped straight to the gate goal and the feeder sat empty for a day and a half.
    expect(tutor.current).toBe('feeder');
    s.slots[0] = { t: 'cloverhead', n: 6 };
    s.sel = 0;
    run(0.5);
    expect(view().line).toBe('Blow food into the feeder.');
    const h = padSpots(1).hopper;
    expect(tutor.mark.on).toBe(true);
    expect(Math.hypot(tutor.mark.x - h.x, tutor.mark.z - h.z)).toBeLessThan(0.1);
    // A clover head lands in the hopper.
    const it = newItem(s, 'cloverhead', h.x, sim.phys.floor(h.x, h.z) + h.y, h.z);
    it.flyT = 0.1;
    it.blown = true;
    s.items.push(it);
    run(0.2);
    expect(s.pads[1].feeder.n).toBe(1);
    expect(view().done).toBe(true);
    run(2);
    expect(Tutor.finished(s, 'feeder')).toBe(true);
  });

  it('when a downy of yours hops out of its pen, the journal says so with an arrow on it, every time', () => {
    const { sim, s, tutor, run, view } = ranch(PAST_MEADOW, PAST_MEADOW_F);
    s.hour = 10;
    pen(sim, 1);
    const d = sim.spawn('clover', PADS[1].x, PADS[1].z, true);
    d.hunger = 0.1;
    run(1);
    expect(d.pen).toBe(1);
    for (let round = 0; round < 2; round++) {
      // Over the fence (as a neglected or frightened one did in the playtest).
      d.x = PADS[1].x + PEN_R + 1.4;
      d.z = PADS[1].z;
      d.y = sim.phys.floor(d.x, d.z);
      d.grounded = true;
      d.vx = d.vz = d.vy = 0;
      run(0.6);
      expect(tutor.current).toBe('stray');
      expect(view().line).toBe('Pull in the downy that got out.');
      expect(tutor.mark.on).toBe(true);
      expect(Math.hypot(tutor.mark.x - d.x, tutor.mark.z - d.z)).toBeLessThan(0.6);
      // Back over the fence: the line ticks and goes.
      d.x = PADS[1].x;
      d.z = PADS[1].z;
      d.y = sim.phys.floor(d.x, d.z) + 0.05;
      run(0.3);
      expect(view().done).toBe(true);
      run(2);
      expect(tutor.current).not.toBe('stray');
    }
    // Pulled in rather than walked back: the line moves on to blowing it into the pen.
    d.x = PADS[1].x + PEN_R + 1.4;
    d.z = PADS[1].z;
    d.y = sim.phys.floor(d.x, d.z);
    d.grounded = true;
    d.vx = d.vz = d.vy = 0;
    run(0.6);
    expect(tutor.current).toBe('stray');
    // A wild one caught in the meadow is in the jar too (in the playtest-style run that kept the line up for good).
    sim.stow('clover');
    d.gone = true;
    sim.stow('clover');
    run(0.6);
    expect(view().line).toBe('Blow the downy into the pen.');
    expect(Math.hypot(tutor.mark.x - PADS[1].x, tutor.mark.z - PADS[1].z)).toBeLessThan(0.1);
    // Blown back in: the line ticks, though the other downy is still aboard.
    stand(sim, PADS[1].x, PADS[1].z + PEN_R + 4);
    s.sel = s.slots.findIndex((q) => q.t === 'clover');
    sim.puff(aimAt(sim, PADS[1].x, sim.phys.floor(PADS[1].x, PADS[1].z), PADS[1].z));
    run(3);
    expect(s.slots.find((q) => q.t === 'clover')?.n).toBe(1);
    expect(tutor.current).not.toBe('stray');
  });

  it('a pest frightens a fed downy in a low pen with a stocked feeder: it runs round inside, never over the fence', () => seeds(4, () => {
    const sim = new Sim(null);
    sim.wild = false;
    sim.s.downies = [];
    sim.s.items = [];
    sim.s.hour = 10;
    pen(sim, 1, ['feeder']);
    sim.s.pads[1].feeder = { t: 'cloverhead', n: 10 };
    const d = sim.spawn('clover', PADS[1].x + 1, PADS[1].z, true);
    d.hunger = 0;
    let out = false;
    let moved = 0;
    let lx = d.x;
    let lz = d.z;
    for (let t = 0; t < 120; t += 1 / 30) {
      d.fright = 3;
      sim.update(1 / 30, idle, ahead(sim));
      moved += Math.hypot(d.x - lx, d.z - lz);
      lx = d.x;
      lz = d.z;
      out ||= sim.phys.penAt(d.x, d.z) !== 1;
    }
    expect(d.mood).toBe('frazzled');
    expect(moved).toBeGreaterThan(20);
    expect(out).toBe(false);
  }));

  it('long neglect still gets one over a low fence', () => {
    const sim = new Sim(null);
    sim.wild = false;
    sim.s.downies = [];
    sim.s.items = [];
    pen(sim, 1);
    const d = sim.spawn('clover', PADS[1].x, PADS[1].z, true);
    d.hunger = 1;
    d.starveT = 99;
    let out = false;
    for (let t = 0; t < 120 && !out; t += 1 / 30) {
      sim.s.hour = 10;
      sim.update(1 / 30, idle, ahead(sim));
      out = sim.phys.penAt(d.x, d.z) !== 1;
    }
    expect(out).toBe(true);
  });
});

describe('P1: Blow always blows something when something is aboard', () => {
  it('when the chosen window empties, the next window that holds something is chosen', () => {
    const sim = new Sim(null);
    sim.wild = false;
    sim.s.downies = [];
    sim.s.items = [];
    stand(sim, 0, 30);
    sim.s.slots[0] = { t: 'tuft-clover', n: 1 };
    sim.s.slots[2] = { t: 'clover', n: 1 };
    sim.s.sel = 0;
    const aim = aimAt(sim, 0, 3, 24);
    // The last fluff goes (sold, in the playtest), then "Blow the downy into the pen."
    sim.update(1 / 30, { ...idle, puff: true, puffPressed: true }, aim);
    expect(sim.s.slots[0].n).toBe(0);
    expect(sim.s.sel).toBe(2);
    for (let t = 0; t < 0.3; t += 1 / 30) sim.update(1 / 30, idle, aim);
    sim.update(1 / 30, { ...idle, puff: true, puffPressed: true }, aim);
    expect(sim.s.slots[2].n).toBe(0);
    expect(sim.s.downies.filter((d) => !d.gone && d.tame).length).toBe(1);
  });

  it('with nothing aboard, a press of Blow says so', () => {
    const sim = new Sim(null);
    stand(sim, 0, 30);
    sim.events.length = 0;
    sim.update(1 / 30, { ...idle, puff: true, puffPressed: true }, ahead(sim));
    const said = sim.events.filter((e): e is Extract<Ev, { t: 'deny' }> => e.t === 'deny');
    expect(said.length).toBe(1);
    expect(said[0].why).toBe('Nothing in the jar.');
    expect(said[0].why.split(' ').length).toBeLessThanOrEqual(8);
  });
});

describe('P1: a lesson counts only once its line was up and its action done', () => {
  it('sleeping off the night lesson leaves it unlearned, and it comes back the next night with its arrow', () => {
    const { sim, s, tutor, run, view } = ranch(PAST_MEADOW, PAST_MEADOW_F);
    s.hour = 18.4;
    run(0.5);
    expect(tutor.current).toBe('dusk');
    // Up past nightfall: dusk lapses and the night lesson comes, then you sleep before shooing a pest.
    s.hour = 20.6;
    run(0.5);
    expect(tutor.current).toBe('night');
    sim.sleep();
    run(1);
    expect(Tutor.finished(s, 'night')).toBe(false);
    // Dusk lapsed unlearned too: it comes back the next evening.
    s.hour = 18.4;
    run(0.5);
    expect(tutor.current).toBe('dusk');
    // Night 2: pests come, and the line and the arrow are there for them.
    s.hour = 20.6;
    run(15);
    expect(tutor.current).toBe('night');
    expect(view().line).toBe('Blow anything at the pest to shoo it.');
    const n = s.nettles.find((q) => !q.gone);
    expect(n).toBeTruthy();
    expect(tutor.mark.on).toBe(true);
    expect(Math.hypot(tutor.mark.x - n!.x, tutor.mark.z - n!.z)).toBeLessThan(1);
    tutor.add(s, 'nettlehit');
    run(2);
    expect(Tutor.finished(s, 'night')).toBe(true);
  });
});

// ---------------------------------------------------------------- P2 and P3

describe('P2: catching is a skill', () => {
  it('a wild downy notices you before you are in Pull’s reach', async () => {
    const { NOTICE, NOTICE_RUN } = await import('../src/games/ranch/sim');
    const sim = new Sim(null);
    expect(NOTICE).toBeGreaterThan(sim.range + 0.4 + 1);
    expect(NOTICE_RUN).toBeGreaterThan(NOTICE);
    sim.wild = false;
    sim.s.downies = [];
    stand(sim, 0, -16);
    const d = sim.spawn('clover', 0, -24.4, false);
    d.hunger = 0.2;
    for (let t = 0; t < 0.5; t += 1 / 30) sim.update(1 / 30, idle, ahead(sim));
    expect(d.alert).toBe(true);
  });

  it('a held wild downy jinks about while you keep the crosshair on it', () => seeds(4, () => {
    const sim = new Sim(null);
    sim.wild = false;
    sim.s.downies = [];
    stand(sim, 0, -16);
    const d = sim.spawn('clover', 0, -21.5, false);
    d.hunger = 0.2;
    for (let t = 0; t < 0.3; t += 1 / 30) sim.update(1 / 30, idle, ahead(sim));
    let minX = d.x;
    let maxX = d.x;
    for (let t = 0; t < 0.85 && !d.gone; t += 1 / 30) {
      sim.update(1 / 30, { ...idle, draw: true }, aimAt(sim, d.x, d.y + 0.25, d.z));
      minX = Math.min(minX, d.x);
      maxX = Math.max(maxX, d.x);
    }
    expect(maxX - minX).toBeGreaterThan(0.35);
  }));
});

describe('P2: the bellows', () => {
  it('a window tipped out is not pulled straight back in', () => {
    const sim = new Sim(null);
    sim.wild = false;
    sim.s.downies = [];
    sim.s.items = [];
    stand(sim, 0, 30);
    for (let i = 0; i < 8; i++) sim.stow('cloverhead');
    const aim = aimAt(sim, 0, sim.s.player.y + 0.2, 26);
    sim.empty(0, aim);
    for (let t = 0; t < 1.2; t += 1 / 30) sim.update(1 / 30, { ...idle, draw: true }, aim);
    expect(sim.s.slots.find((q) => q.t === 'cloverhead')?.n ?? 0).toBe(0);
  });

  it('pulling fluff in a pen leaves your penned downies be unless aimed right at one', () => {
    const sim = new Sim(null);
    sim.wild = false;
    sim.s.downies = [];
    sim.s.items = [];
    pen(sim, 1);
    const at = PADS[1];
    stand(sim, at.x, at.z + 3);
    const d = sim.spawn('clover', at.x + 0.7, at.z - 1, true);
    d.hunger = 0.1;
    for (let t = 0; t < 1; t += 1 / 30) sim.update(1 / 30, idle, ahead(sim));
    d.hopT = 99;
    const fluff = newItem(sim.s, 'tuft-clover', at.x + 0.1, sim.phys.floor(at.x, at.z - 1) + 0.12, d.z);
    fluff.grounded = true;
    sim.s.items.push(fluff);
    // Sweeping the pen floor near the downy, the crosshair beside it.
    for (let t = 0; t < 1.5; t += 1 / 30) sim.update(1 / 30, { ...idle, draw: true }, aimAt(sim, d.x - 0.45, d.y + 0.1, d.z));
    expect(fluff.gone).toBe(true);
    expect(d.gone).toBe(false);
    // (Round 5: a press that drew fluff never takes a penned downy, so let go and press again, aimed right at it.)
    sim.update(1 / 30, idle, aimAt(sim, d.x, d.y + 0.25, d.z));
    for (let t = 0; t < 2 && !d.gone; t += 1 / 30) sim.update(1 / 30, { ...idle, draw: true }, aimAt(sim, d.x, d.y + 0.25, d.z));
    expect(d.gone).toBe(true);
  });

  it('the crosshair marks only what is under it and within reach', () => {
    const sim = new Sim(null);
    sim.wild = false;
    sim.s.downies = [];
    sim.s.items = [];
    stand(sim, 0, -16);
    const far = sim.spawn('clover', 0, -23.9, true);
    for (let t = 0; t < 0.5; t += 1 / 30) sim.update(1 / 30, idle, ahead(sim));
    far.hopT = 99;
    // A clover head at the edge of the cone, well off the crosshair.
    const head = sim.drop('cloverhead', 1.6, -21.6);
    for (let t = 0; t < 0.5; t += 1 / 30) sim.update(1 / 30, idle, ahead(sim));
    expect(sim.aimTarget(aimAt(sim, far.x, far.y + 0.25, far.z))).toBe(null);
    expect(sim.aimTarget(aimAt(sim, head.x, head.y, head.z))).toBe('target');
  });

  it('a downy blown at a pen from the lane lands in it', () => {
    let inPen = 0;
    let tries = 0;
    seeds(3, () => {
      for (const back of [2, 4, 6]) {
        const sim = new Sim(null);
        sim.wild = false;
        sim.s.downies = [];
        sim.s.items = [];
        pen(sim, 1);
        const at = PADS[1];
        stand(sim, at.x, at.z + PEN_R + back);
        sim.s.slots[0] = { t: 'clover', n: 1 };
        sim.s.sel = 0;
        sim.puff(aimAt(sim, at.x, sim.phys.floor(at.x, at.z), at.z));
        for (let t = 0; t < 3; t += 1 / 30) sim.update(1 / 30, idle, ahead(sim));
        tries++;
        if (sim.s.downies.some((q) => !q.gone && q.pen === 1)) inPen++;
      }
    });
    expect(inPen).toBe(tries);
  });
});

describe('P3: small things', () => {
  it('fluff tipped out into the sell crate is a sale of yours, so the sell lesson ends', () => {
    const { sim, s, tutor, run } = ranch(['look', 'walk', 'draw', 'puff', 'feed'], ['bellows', 'draw', 'puff', 'pause', 'slots']);
    s.learn.push('lesson:slots');
    run(0.5);
    expect(tutor.current).toBe('sell');
    stand(sim, -6.5, 34.2);
    s.slots[0] = { t: 'tuft-clover', n: 3 };
    s.sel = 0;
    sim.empty(0, aimAt(sim, -6.5, sim.phys.floor(-6.5, 36.5) + 0.6, 36.5));
    run(4);
    expect(s.stats.sold).toBeGreaterThanOrEqual(1);
    expect(Tutor.finished(s, 'sell')).toBe(true);
  });

  it('the sleep tag does not say "Day 1", and the full-jar note is eight words or fewer', async () => {
    const sim = new Sim(null);
    teachAll(sim.s);
    const note = sim.menu({ kind: 'door', id: 0, label: '', x: 0, y: 0, z: 0 })[0].note;
    expect(note).not.toMatch(/Day \d/);
    const { fullNote } = await import('../src/games/ranch/lessons');
    for (const dev of ['touch', 'mouse', 'pad'] as const) for (const none of [true, false]) for (const known of [true, false]) expect(fullNote(dev, none, known).split(' ').length, fullNote(dev, none, known)).toBeLessThanOrEqual(8);
  });

  it('a gate goal counts the coins towards it, in eight words or fewer', async () => {
    const { goalText } = await import('../src/games/ranch/lessons');
    const sim = new Sim(null);
    sim.s.coins = 288;
    expect(goalText('ridge', sim.s)).toBe('Open the Ember Ridge gate, 288 of 500.');
    sim.s.coins = 640;
    expect(goalText('hollow', sim.s)).toBe('Open the Brook Hollow gate, 640 of 1,200.');
    for (const l of [goalText('ridge', sim.s), goalText('hollow', sim.s), goalText('rich', sim.s)]) expect(l.split(' ').length, l).toBeLessThanOrEqual(8);
  });

  it('every new line is eight words or fewer and uses the plain words', () => {
    const lines = allLines().filter((l) => l.id === 'feeder' || l.id === 'stray').map((l) => l.line);
    expect(lines).toContain('Blow food into the feeder.');
    expect(lines).toContain('Pull in the downy that got out.');
    for (const l of lines) {
      expect(l.split(/\s+/).length, l).toBeLessThanOrEqual(8);
      expect(l, l).not.toMatch(/\b(down|puffs?|draws?|Exchange|pads?|canister|nettlebacks?|tufts?)\b/i);
    }
  });
});
