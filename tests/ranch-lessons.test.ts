// Thistledown's lessons, run on the render-free sim: one thing at a time, in
// order, nothing in the world before its lesson, urgent lessons taking over,
// lines short enough to read at a glance, and returning saves not taught twice.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOALS } from '../src/games/ranch/defs';
import { FARM_CYCLES, FEATURES, LESSON_IDS, Tutor, allLines, creditLessons, teachAll, type Say } from '../src/games/ranch/lessons';
import { Sim, type Aim, type Controls } from '../src/games/ranch/sim';
import { deserialize, newItem, serialize } from '../src/games/ranch/state';
import { PADS } from '../src/games/ranch/world';
import { rng } from '../src/games/ranch/noise';

// Long sims run well over the default 5 s on a loaded machine.
vi.setConfig({ testTimeout: 60_000 });

const realRandom = Math.random;
beforeEach(() => {
  Math.random = rng(7);
});
afterEach(() => {
  Math.random = realRandom;
});

const idle: Controls = { moveX: 0, moveZ: 0, sprint: false, jump: false, jumpPressed: false, draw: false, puff: false, puffPressed: false };
const touch: Say = { dev: 'touch', locked: false, lockAvailable: false };
const mouse: Say = { dev: 'mouse', locked: true, lockAvailable: true };
const pad: Say = { dev: 'pad', locked: false, lockAvailable: false };

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

/** A teaching ranch with its tutor; run() advances both, feeding the sim's events to the tutor. */
function ranch() {
  const sim = new Sim(null);
  sim.teaching = true;
  const tutor = new Tutor();
  const floor = (x: number, z: number) => sim.phys.floor(x, z);
  let view = tutor.update(sim.s, 0, touch, floor);
  const lines: string[] = [];
  const run = (seconds: number, c: Controls = idle, aim?: Aim) => {
    for (let t = 0; t < seconds; t += 1 / 30) {
      const a = aim ?? aimAt(sim, sim.s.player.x, sim.s.player.y + 1.6, sim.s.player.z - 5);
      sim.update(1 / 30, c, a);
      for (const e of sim.events) tutor.onEvent(sim.s, e);
      sim.events.length = 0;
      view = tutor.update(sim.s, 1 / 30, touch, floor);
      if (view.line && !view.done && lines[lines.length - 1] !== view.id) lines.push(view.id);
    }
    return view;
  };
  const place = (x: number, z: number) => {
    const p = sim.s.player;
    p.x = x;
    p.z = z;
    p.y = sim.phys.floor(x, z);
    p.vx = p.vz = p.vy = 0;
  };
  return { sim, tutor, run, place, lines, view: () => view };
}

describe('the first moments', () => {
  it('start with one line and nothing else brought in', () => {
    const { sim, run } = ranch();
    const v = run(0.1);
    expect(v.id).toBe('look');
    expect(v.line).toBe('Drag on the right to look around.');
    expect(sim.s.learn).toEqual([]);
    for (const f of ['bellows', 'draw', 'puff', 'coins', 'pads', 'slots', 'jump', 'clock', 'sleep', 'nettles', 'gates', 'bench', 'pause']) expect(sim.knows(f)).toBe(false);
  });

  it('hold back posts, the door, the bench, gates, the evening and nettlebacks', () => {
    const { sim, run, place } = ranch();
    place(PADS[1].px + 1, PADS[1].pz + 1);
    const aim = aimAt(sim, PADS[1].px, sim.phys.floor(PADS[1].px, PADS[1].pz) + 1.2, PADS[1].pz);
    expect(sim.interactable(aim)).toBeNull();
    // The clock stops in the late afternoon until the lessons let the day run on.
    sim.s.hour = 16;
    run(40);
    expect(sim.s.hour).toBeCloseTo(Sim.HOLD_HOUR, 1);
    // No nettlebacks at night until their lesson.
    sim.s.hour = 22;
    run(15);
    expect(sim.s.nettles.length).toBe(0);
  });
});

describe('the lessons in order', () => {
  it('bring in one thing each, each when the last is done', () => {
    const { sim, tutor, run, lines } = ranch();
    const s = sim.s;
    const n = (k: string, v = 1) => tutor.add(s, k, v);
    run(0.2);
    n('look', 1);
    run(1.5);
    expect(lines).toEqual(['look', 'walk']);
    expect(sim.knows('bellows')).toBe(false);
    n('walk', 1);
    const d = s.downies.find((q) => q.keep)!;
    s.player.x = d.x + 1;
    s.player.z = d.z + 1;
    run(1.5);
    expect(lines[2]).toBe('draw');
    expect(sim.knows('bellows') && sim.knows('draw')).toBe(true);
    expect(sim.knows('puff')).toBe(false);
    n('catch');
    run(1.5);
    expect(lines[3]).toBe('puff');
    expect(sim.knows('puff')).toBe(true);
    n('puff');
    run(1.5);
    expect(lines[4]).toBe('feed');
    expect(sim.knows('pause')).toBe(true);
    expect(sim.knows('coins')).toBe(false);
    n('feed');
    run(1.5);
    expect(lines[5]).toBe('sell');
    // Coins arrive with the first sale, not before.
    expect(sim.knows('coins')).toBe(false);
    n('sell');
    n('sell:blown');
    run(1.5);
    expect(sim.knows('coins')).toBe(true);
    expect(lines[6]).toBe('pen');
    expect(sim.knows('pads')).toBe(true);
    // Only the pen is on offer at an empty pad.
    const post = { kind: 'pad' as const, id: 1, label: '', x: 0, y: 0, z: 0 };
    expect(sim.menu(post).map((o) => o.id)).toEqual(['build:pen']);
    expect(sim.choose(post, 'build:pen')).toBe(true);
    for (const e of sim.events) tutor.onEvent(s, e);
    sim.events.length = 0;
    run(1.5);
    expect(lines[7]).toBe('penin');
    sim.spawn('clover', PADS[1].x, PADS[1].z);
    run(2.5);
    expect(lines[8]).toBe('meadow');
    expect(sim.knows('appetite')).toBe(false);
    n('catch:wild');
    run(1.5);
    // Round 5: hunger runs again after the meadow; the clock waits for the loop lesson to end.
    expect(sim.knows('appetite')).toBe(true);
    expect(sim.knows('time')).toBe(false);
    // The loop comes straight after: no blank journal while coins build up for the next lesson.
    expect(lines.length).toBe(10);
    expect(lines[9]).toBe('farm');
  });

  it('end only when the action is done, and tick the line before the next', () => {
    const { tutor, sim, run } = ranch();
    run(0.2);
    expect(run(5).id).toBe('look');
    tutor.add(sim.s, 'look', 1);
    const v = run(1 / 30);
    expect(v.id).toBe('look');
    expect(v.done).toBe(true);
    expect(run(0.6).done).toBe(true);
    expect(run(1).id).toBe('walk');
  });

  it('let the slots lesson take over when two kinds are aboard, then return', () => {
    const { tutor, sim, run } = ranch();
    for (const id of ['look', 'walk', 'draw', 'puff']) {
      run(0.1);
      tutor.add(sim.s, id === 'look' ? 'look' : id === 'walk' ? 'walk' : id === 'draw' ? 'catch' : 'puff', 1);
      if (id === 'walk') {
        const d = sim.s.downies.find((q) => q.keep)!;
        sim.s.player.x = d.x + 1;
        sim.s.player.z = d.z + 1;
      }
      run(1.5);
    }
    expect(run(0.1).id).toBe('feed');
    sim.stow('clover');
    sim.stow('cloverhead');
    expect(run(0.2).id).toBe('slots');
    expect(sim.knows('slots')).toBe(true);
    tutor.add(sim.s, 'slot');
    run(1.5);
    expect(run(0.1).id).toBe('feed');
  });

  it('bring the evening in after the meadow, and nettlebacks with the night', () => {
    const { tutor, sim, run } = ranch();
    teachAll(sim.s);
    sim.s.learn = sim.s.learn.filter((w) => !['lesson:dusk', 'lesson:night', 'clock', 'sleep', 'nettles', 'hedge'].includes(w));
    sim.s.hour = 18.4;
    expect(run(0.2).id).toBe('dusk');
    expect(sim.knows('clock') && sim.knows('sleep')).toBe(true);
    expect(sim.knows('nettles')).toBe(false);
    // Staying up: the dusk line lapses at nightfall and the night lesson takes over.
    sim.s.hour = 20.6;
    run(0.5);
    expect(run(0.2).id).toBe('night');
    expect(sim.knows('nettles')).toBe(true);
    run(10);
    expect(sim.s.nettles.length).toBeGreaterThan(0);
    // However far off the pest is, the lesson points at it (the playtest's was 80 m away, with no arrow).
    const n = sim.s.nettles.find((q) => !q.gone)!;
    n.x = sim.s.player.x;
    n.z = sim.s.player.z - 80;
    run(0.1);
    expect(tutor.mark.on).toBe(true);
    expect(Math.hypot(tutor.mark.x - n.x, tutor.mark.z - n.z)).toBeLessThan(1);
    tutor.add(sim.s, 'nettlehit');
    run(2);
    expect(Tutor.finished(sim.s, 'night')).toBe(true);
  });

  it('say what to tap or press at a plot, in the words on the buttons and tags', () => {
    const lines = allLines().filter((l) => l.id === 'pen' || l.id === 'garden').map((l) => l.line);
    expect(lines).toContain('Tap Post at an empty plot, then Pen.');
    expect(lines).toContain('Press E at an empty plot, then Pen.');
    expect(lines).toContain('Press X at an empty plot, then Pen.');
    expect(lines).toContain('Tap Post at an empty plot, then Garden.');
    void mouse;
    void pad;
  });

  it('point at the porch downy, then the garden with the favourite food over its head', () => {
    const { tutor, sim, run } = ranch();
    run(0.1);
    tutor.add(sim.s, 'look', 1);
    run(1.5);
    expect(tutor.mark.on).toBe(true);
    expect(tutor.mark.icon).toBe('arrow');
    const d = sim.s.downies.find((q) => q.keep)!;
    expect(Math.hypot(tutor.mark.x - d.x, tutor.mark.z - d.z)).toBeLessThan(0.01);
    for (const k of ['walk', 'catch', 'puff']) {
      tutor.add(sim.s, k, 1);
      if (k === 'walk') {
        sim.s.player.x = d.x + 1;
        sim.s.player.z = d.z + 1;
      }
      run(1.5);
    }
    const v = run(0.1);
    expect(v.id).toBe('feed');
    // No clover heads aboard: it says where they are, and points there (an arrow and a ring on the garden).
    expect(v.line).toBe('Pull clover heads from the garden.');
    expect(tutor.mark.on && tutor.mark.icon).toBe('arrow');
    expect(tutor.mark.r).toBeGreaterThan(0);
    expect(Math.hypot(tutor.mark.rx - PADS[0].x, tutor.mark.rz - PADS[0].z)).toBeLessThan(0.01);
    expect(Math.hypot(tutor.mark.x - PADS[0].x, tutor.mark.z - PADS[0].z)).toBeLessThan(0.01);
    // Clover heads aboard: feed the downy, a clover head bobbing over it.
    sim.stow('cloverhead');
    sim.s.sel = sim.s.slots.findIndex((q) => q.t === 'cloverhead');
    const v2 = run(0.5);
    expect(v2.line).toBe('Feed the downy a clover head.');
    expect(tutor.mark.icon).toBe('cloverhead');
    expect(tutor.mark.r).toBe(0);
    // It has an appetite now, so food puffed near it is eaten.
    expect(d.hunger).toBeGreaterThan(0.5);
  });

  it("keep the porch downy's hunger waiting until the feeding lesson, then hungry but never starving", () => {
    const { tutor, sim, run } = ranch();
    const d = sim.s.downies.find((q) => q.keep)!;
    run(0.1);
    tutor.add(sim.s, 'look', 1);
    run(1.5);
    expect(tutor.current).toBe('walk');
    // A slow player: a minute and a half on each of the walk, pull and blow lessons.
    run(90);
    expect(d.hunger).toBeLessThanOrEqual(0.3);
    tutor.add(sim.s, 'walk', 1);
    sim.s.player.x = d.x + 1;
    sim.s.player.z = d.z + 1;
    run(1.5);
    expect(tutor.current).toBe('draw');
    run(90);
    expect(d.hunger).toBeLessThanOrEqual(0.3);
    // Caught and blown out: it is yours now, a new downy, still not hungry.
    tutor.add(sim.s, 'catch', 1);
    run(1.5);
    expect(tutor.current).toBe('puff');
    d.gone = true;
    const out = sim.spawn('clover', d.x, d.z, true);
    out.hunger = 0.35;
    run(90);
    expect(out.hunger).toBeLessThanOrEqual(0.3);
    tutor.add(sim.s, 'puff', 1);
    run(1.5);
    expect(tutor.current).toBe('feed');
    expect(out.hunger).toBeGreaterThan(0.5);
    // Two minutes of fetching clover heads: never starving.
    let peak = 0;
    for (let t = 0; t < 120; t++) {
      run(1);
      peak = Math.max(peak, out.hunger);
    }
    expect(peak).toBeLessThanOrEqual(0.8);
  });
});

describe('selling, step by step', () => {
  it('says where the fluff is: feed for it, pull it up, choose it, then blow it in', () => {
    const { sim, tutor, run, view } = ranch();
    const s = sim.s;
    const home = s.downies.find((q) => q.keep)!;
    s.player.x = home.x + 1;
    s.player.z = home.z + 1;
    for (const k of ['look', 'walk', 'catch', 'puff', 'feed']) {
      tutor.add(s, k);
      run(1.6);
    }
    expect(tutor.current).toBe('sell');
    // No fluff anywhere: feed again, the downy hungry enough to eat at once, a clover head over it.
    for (const it of s.items) if (it.type.startsWith('tuft-')) it.gone = true;
    for (const q of s.slots) {
      q.t = null;
      q.n = 0;
    }
    run(0.5);
    // No clover heads aboard either: it sends you to the garden first.
    expect(view().line).toBe('Pull clover heads from the garden.');
    expect(tutor.mark.on && tutor.mark.icon).toBe('arrow');
    sim.stow('cloverhead');
    s.sel = s.slots.findIndex((q) => q.t === 'cloverhead');
    run(0.5);
    expect(view().line).toBe('Feed the downy again for more fluff.');
    expect(tutor.mark.on && tutor.mark.icon).toBe('cloverhead');
    s.slots[s.sel] = { t: null, n: 0 };
    const d = s.downies.find((q) => !q.gone && q.keep)!;
    expect(d.hunger).toBeGreaterThanOrEqual(0.62);
    // Fed and about to drop it (a downy only drops fluff once it lands): pull, the arrow on that downy, never feed.
    d.shedQ = 2;
    d.shedT = 5;
    run(0.5);
    expect(view().line).toBe('Pull up the fluff the downy dropped.');
    expect(Math.abs(tutor.mark.x - d.x)).toBeLessThan(0.01);
    d.shedQ = 0;
    // A wild downy's fluff out in the meadow is never what it points at: with only that, feed again.
    const wildFluff = newItem(s, 'tuft-clover', 4, 0, -2, -1);
    wildFluff.y = sim.phys.floor(wildFluff.x, wildFluff.z) + 0.1;
    s.items.push(wildFluff);
    run(0.5);
    expect(view().line).not.toBe('Pull up the fluff the downy dropped.');
    expect(tutor.mark.on && Math.abs(tutor.mark.x - wildFluff.x) < 1 && Math.abs(tutor.mark.z - wildFluff.z) < 1).toBe(false);
    // Fluff on the ranch: pull it up, the arrow over it, the fluff your downy dropped first.
    const stray = newItem(s, 'tuft-clover', s.player.x + 3, 0, s.player.z, -1);
    stray.y = sim.phys.floor(stray.x, stray.z) + 0.1;
    s.items.push(stray);
    const fluff = newItem(s, 'tuft-clover', s.player.x + 30, 0, s.player.z - 4, -1);
    fluff.y = sim.phys.floor(fluff.x, fluff.z) + 0.1;
    fluff.by = d.id;
    s.items.push(fluff);
    run(0.5);
    expect(view().line).toBe('Pull up the fluff the downy dropped.');
    expect(tutor.mark.on && tutor.mark.icon).toBe('arrow');
    expect(Math.abs(tutor.mark.x - fluff.x)).toBeLessThan(0.01);
    stray.gone = true;
    wildFluff.gone = true;
    // Aboard, but clover heads are chosen (Blow would send those): choose the fluff, a chevron over its window.
    fluff.gone = true;
    s.slots[0].t = 'cloverhead';
    s.slots[0].n = 3;
    s.slots[1].t = 'tuft-clover';
    s.slots[1].n = 2;
    s.sel = 0;
    tutor.add(s, 'slot');
    run(0.5);
    expect(view().line).toBe("Tap the fluff's window to choose it.");
    expect(tutor.mark.slot).toBe(1);
    // Chosen: blow it into the crate, the arrow on the crate, no window pointer.
    s.sel = 1;
    run(0.5);
    expect(view().line).toBe('Blow the fluff into the sell crate.');
    expect(tutor.mark.on).toBe(true);
    expect(tutor.mark.slot).toBe(-1);
    // A sale the crate drew in by itself (fluff that fell beside it) does not finish the lesson.
    tutor.add(s, 'sell');
    run(0.2);
    expect(tutor.current).toBe('sell');
    expect(view().done).toBe(false);
    // Blown in and sold: the ticked line is the one that was showing, though the fluff is gone
    // (and for a frame the step had already moved on).
    s.slots[1].t = null;
    s.slots[1].n = 0;
    run(1 / 30);
    tutor.add(s, 'sell');
    tutor.add(s, 'sell:blown');
    run(0.1);
    expect(view().done).toBe(true);
    expect(view().line).toBe('Blow the fluff into the sell crate.');
  });

  it('does not finish from fluff the crate draws in by itself, only from a blow of yours (played on the sim)', () => {
    const { sim, tutor, run } = ranch();
    const s = sim.s;
    for (const k of ['look', 'walk', 'catch', 'puff', 'feed']) {
      tutor.add(s, k);
      if (k === 'walk') {
        const home = s.downies.find((q) => q.keep)!;
        s.player.x = home.x + 1;
        s.player.z = home.z + 1;
      }
      run(1.6);
    }
    expect(tutor.current).toBe('sell');
    // The playtest: the downy ate a stray clover head by the crate, and the crate drew its fluff in.
    const d = s.downies.find((q) => !q.gone && q.keep)!;
    d.x = -5;
    d.z = 35.4;
    d.y = sim.phys.floor(d.x, d.z);
    d.hunger = 0.7;
    sim.drop('cloverhead', -4.7, 35.4);
    run(10);
    expect(s.stats.sold).toBeGreaterThanOrEqual(1);
    expect(tutor.current).toBe('sell');
    expect(Tutor.finished(s, 'sell')).toBe(false);
    // Now a real blow from in front of the crate.
    s.player.x = -6.5;
    s.player.z = 32.6;
    s.player.y = sim.phys.floor(-6.5, 32.6);
    sim.stow('tuft-clover');
    s.sel = s.slots.findIndex((q) => q.t === 'tuft-clover');
    const aim = aimAt(sim, -6.5, sim.phys.floor(-6.5, 36.5) + 0.7, 36.5);
    run(0.05, { ...idle, puff: true, puffPressed: true }, aim);
    run(3, idle, aim);
    expect(Tutor.finished(s, 'sell')).toBe(true);
  });
});

describe('the loop, after the meadow', () => {
  it('says what to do with food and fluff, a step at a time, until three whole turns of the loop', () => {
    const { sim, tutor, run, view } = ranch();
    const s = sim.s;
    for (const id of ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'meadow', 'slots', 'jump']) s.learn.push(`lesson:${id}`);
    for (const f of ['bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'time', 'slots', 'jump']) s.learn.push(f);
    s.hour = 9;
    for (const it of s.items) if (it.type.startsWith('tuft-')) it.gone = true;
    for (const q of s.slots) {
      q.t = null;
      q.n = 0;
    }
    const d = s.downies.find((q) => !q.gone && q.keep)!;
    for (const q of s.downies) q.hunger = 0;
    d.hunger = 0.8;
    run(0.2);
    expect(tutor.current).toBe('farm');
    // Hungry, and nothing to feed it: fetch food, the garden marked.
    expect(view().line).toBe('Pull up food for the hungry downy.');
    expect(tutor.mark.on && tutor.mark.r > 0).toBe(true);
    // Clover heads aboard: feed it, its favourite bobbing over it.
    s.slots[0].t = 'cloverhead';
    s.slots[0].n = 10;
    s.sel = 0;
    d.hunger = 0.8;
    run(0.5);
    expect(view().line).toBe('Feed the hungry downy its favourite food.');
    expect(tutor.mark.icon).toBe('cloverhead');
    expect(Math.abs(tutor.mark.x - d.x)).toBeLessThan(0.05);
    // It ate and dropped fluff: pull it up, then blow it in.
    d.hunger = 0;
    const fluff = newItem(s, 'tuft-clover', d.x + 1, sim.phys.floor(d.x + 1, d.z) + 0.1, d.z);
    s.items.push(fluff);
    run(0.5);
    expect(view().line).toBe('Pull up the fluff your downies dropped.');
    fluff.gone = true;
    s.slots[1].t = 'tuft-clover';
    s.slots[1].n = 12;
    s.sel = 1;
    run(0.5);
    expect(view().line).toBe('Blow the fluff into the sell crate.');
    // The playtest: a full jar of fluff sold four times in a second and a half. Plain sales are not turns of the loop.
    for (let i = 0; i < 6; i++) tutor.add(s, 'sell');
    for (let i = 0; i < 6; i++) tutor.add(s, 'sell:blown');
    run(0.5);
    expect(tutor.current).toBe('farm');
    expect(view().done).toBe(false);
    // Everyone fed, nothing aboard: catch another downy.
    s.slots[1].t = null;
    s.slots[1].n = 0;
    s.slots[0].t = null;
    s.slots[0].n = 0;
    run(0.5);
    expect(view().line).toBe('Catch another downy out in Clover Meadow.');
    // Two turns of the loop, then dusk takes over; morning hands back, and the count carries on.
    tutor.add(s, 'cycle');
    tutor.add(s, 'cycle');
    run(0.1);
    s.hour = 18.4;
    run(0.2);
    expect(tutor.current).toBe('dusk');
    // (The next morning: round 7 spaces the first day's lessons 30 s apart once the clock runs.)
    s.day = 2;
    s.night = 2;
    s.hour = 6;
    run(2);
    expect(tutor.current).toBe('farm');
    expect(s.learn).not.toContain('lesson:farm');
    // The third makes it: it ticks and ends.
    expect(FARM_CYCLES).toBe(3);
    tutor.add(s, 'cycle');
    run(0.1);
    expect(view().done).toBe(true);
    run(2);
    expect(s.learn).toContain('lesson:farm');
  });
});

describe('the ticked line', () => {
  it('is the line that was on screen, even when the step flickered for a frame as the lesson ended', () => {
    const { sim, tutor, run, view } = ranch();
    const s = sim.s;
    for (const id of ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'meadow', 'slots', 'jump']) s.learn.push(`lesson:${id}`);
    for (const f of ['bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'time', 'slots', 'jump']) s.learn.push(f);
    s.hour = 9;
    for (const it of s.items) if (it.type.startsWith('tuft-')) it.gone = true;
    for (const q of s.downies) q.hunger = 0;
    s.slots[0] = { t: 'tuft-clover', n: 1 };
    s.sel = 0;
    run(0.5);
    expect(view().line).toBe('Blow the fluff into the sell crate.');
    tutor.add(s, 'cycle');
    tutor.add(s, 'cycle');
    run(0.2);
    // The last fluff leaves the jar, and some other fluff lies about: for a frame the step reads "pull".
    s.slots[0] = { t: null, n: 0 };
    const lying = newItem(s, 'tuft-clover', s.player.x + 2, 0, s.player.z);
    lying.y = sim.phys.floor(lying.x, lying.z) + 0.1;
    s.items.push(lying);
    run(1 / 30);
    // The sale lands: the third turn of the loop.
    tutor.add(s, 'cycle');
    run(1 / 30);
    expect(view().done).toBe(true);
    expect(view().line).toBe('Blow the fluff into the sell crate.');
  });
});

describe('tags that hang once they matter', () => {
  it('a pen post offers the feeder first, then a trough once a brook downy is caught', () => {
    const { sim, run } = ranch();
    teachAll(sim.s);
    sim.s.learn = sim.s.learn.filter((w) => !w.startsWith('up:') && w !== 'silo' && !['lesson:ups', 'lesson:bench', 'lesson:night', 'bench'].includes(w));
    sim.s.pads[1].kind = 'pen';
    sim.phys.setPads(sim.s.pads);
    sim.s.coins = 350;
    sim.s.hour = 10;
    const post = { kind: 'pad' as const, id: 1, label: '', x: 0, y: 0, z: 0 };
    expect(sim.menu(post)).toEqual([]);
    expect(sim.padUsable(1)).toBe(false);
    expect(run(0.2).id).toBe('ups');
    expect(sim.menu(post).map((o) => o.id)).toEqual(['pen:feeder']);
    expect(sim.choose(post, 'pen:feeder')).toBe(true);
    sim.events.length = 0;
    sim.s.learnCount.upgrade = 1;
    run(2);
    expect(sim.menu(post).map((o) => o.id)).toEqual(['info']);
    sim.s.caught.push('brook');
    run(0.1);
    expect(sim.menu(post).map((o) => o.id)).toEqual(['pen:trough', 'info']);
  });
});

describe('a real feeding', () => {
  it('counts a favourite eaten by a downy of yours, not a wild one foraging', () => {
    const { sim, tutor, run } = ranch();
    sim.wild = false;
    sim.s.downies = [];
    const wild = sim.spawn('clover', 0, -10, false);
    wild.hunger = 0.65;
    sim.drop('cloverhead', 0.4, -10);
    run(8);
    expect(sim.s.stats.fed).toBe(1);
    expect(sim.s.learnCount.feed ?? 0).toBe(0);
    expect(sim.s.goals).not.toContain('feed');
    const tame = sim.spawn('clover', 4, -10, true);
    tame.hunger = 0.8;
    sim.drop('cloverhead', 4.4, -10);
    run(8);
    expect(tutor && sim.s.learnCount.feed).toBe(1);
    expect(sim.s.goals).toContain('feed');
  });
});

describe('food puffed on a slope', () => {
  it('stops near where it lands instead of skidding downhill', () => {
    const { sim, run } = ranch();
    sim.wild = false;
    sim.s.downies = [];
    // West of the Exchange the plateau runs downhill towards the windmill.
    const it = sim.drop('cloverhead', -12.5, 28.7);
    run(0.5);
    it.vx = -8;
    run(3);
    expect(Math.abs(it.x - -12.5)).toBeLessThan(4);
  });
});

describe('the words', () => {
  it('every lesson line and journal goal is eight words or fewer, plain, with no dashes or exclamations', () => {
    const lines = [...allLines().map((l) => l.line), ...GOALS.map((g) => g.text)];
    for (const l of lines) {
      expect(l.split(/\s+/).filter(Boolean).length, l).toBeLessThanOrEqual(8);
      expect(l, l).not.toMatch(/[!\u2013\u2014]/);
      expect(l[0], l).toBe(l[0].toUpperCase());
    }
  });

  it('uses plain words: no invented terms in lines, goals or pause notes', () => {
    // The code says tuft, pad, draw, puff, canister, Exchange and nettleback;
    // the player reads fluff, plot, pull, blow, jar, sell crate and pest.
    const sim = new Sim(null);
    teachAll(sim.s);
    const notes = new Tutor().notes(sim.s, 99);
    expect(notes.length).toBeGreaterThan(8);
    const words = [...allLines().map((l) => l.line), ...GOALS.map((g) => g.text), ...notes];
    for (const l of words) expect(l, l).not.toMatch(/\b(down|puffs?|draws?|Exchange|pads?|canister|nettlebacks?|tufts?)\b/i);
  });

  it('never names keys on touch, or touch on keys', () => {
    for (const { line } of allLines()) {
      if (/\b(WASD|Space|click|mouse|LT|RT|LB|RB|Q)\b/.test(line)) expect(/thumb|Tap |Drag /.test(line), line).toBe(false);
    }
    const touchOnly = allLines().filter((l) => /thumb|Tap |Drag on/.test(l.line));
    expect(touchOnly.length).toBeGreaterThan(3);
  });
});

describe('returning players', () => {
  it('a save from before the lessons is credited with what it has done', () => {
    const old = new Sim(null);
    old.s.stats.drawn = 3;
    old.s.stats.sold = 6;
    old.s.stats.fed = 2;
    old.s.goals = ['catch', 'pen', 'feed'];
    old.s.pads[1].kind = 'pen';
    old.s.hints = ['look', 'move', 'draw', 'puff'];
    const raw = JSON.parse(JSON.stringify(serialize(old.s)));
    delete raw.learn;
    delete raw.learnCount;
    const back = deserialize(raw, old.s.sources)!;
    expect(back.learn).toEqual([]);
    creditLessons(back);
    for (const id of ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'slots', 'jump']) expect(Tutor.finished(back, id), id).toBe(true);
    for (const f of ['bellows', 'draw', 'puff', 'coins', 'pads', 'slots', 'jump', 'pause']) expect(back.learn, f).toContain(f);
    // What it has not done yet is still to come.
    expect(Tutor.finished(back, 'gates')).toBe(false);
    expect(Tutor.finished(back, 'night')).toBe(false);
    const sim = new Sim(back);
    sim.teaching = true;
    const tutor = new Tutor();
    const v = tutor.update(back, 1 / 30, touch, (x, z) => sim.phys.floor(x, z));
    expect(v.id).toBe('meadow');
  });

  it('a save with nothing done starts at the beginning', () => {
    const old = new Sim(null);
    const raw = JSON.parse(JSON.stringify(serialize(old.s)));
    delete raw.learn;
    const back = deserialize(raw, old.s.sources)!;
    creditLessons(back);
    expect(back.learn).toEqual([]);
  });

  it('a save made with the lessons keeps them exactly', () => {
    const { sim, tutor, run } = ranch();
    run(0.1);
    tutor.add(sim.s, 'look', 1);
    run(2);
    const a = serialize(sim.s);
    expect(a.learn).toContain('lesson:look');
    const back = deserialize(JSON.parse(JSON.stringify(a)), sim.s.sources)!;
    expect(serialize(back)).toEqual(a);
  });

  it('teaching everything brings in every feature', () => {
    const sim = new Sim(null);
    sim.teaching = true;
    teachAll(sim.s);
    for (const f of FEATURES) expect(sim.knows(f)).toBe(true);
    for (const id of LESSON_IDS) expect(Tutor.finished(sim.s, id)).toBe(true);
    const v = new Tutor().update(sim.s, 1 / 30, touch, (x, z) => sim.phys.floor(x, z));
    expect(v.line).toBe('');
  });
});
