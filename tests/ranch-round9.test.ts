// Thistledown's ninth harsh playtest (the first 15 minutes 6 of 10: "lots of
// walking back and forth, and feeder aiming"; its single biggest fun change:
// make each wild tug 2 to 4 beats long), as tests on the render-free sim and
// tutor: a journal goal on the page can always be done (the P1: "Open the gate
// to Ember Ridge." at 21:00 sent the tester to a gate with no Gate button); a
// tug of beats, with fake puffs and a shift in the slack; pages of something
// done kept on screen; offers capped and not back within two mornings, the rare
// one's worth over the week; the rare one hearing only movement, by straight
// distance, and hurrying home; a new pen's starter food in a feeder; clearer
// order copy; the reach of the door, bench, board and gates; the feeder's ring
// on its hopper; no food blown at a crate; the pen limit only when crowded;
// the walk lesson ticking a short walk; the hunt's line after the catch; and
// the first fifteen minutes' cuts (a loose downy waiting by its pen's gate,
// clovers just past the ranch gate, the first night's pest by the gate, a goal
// to fill the time).
// Every test here fails on the code the tester played (proved on a `git archive`
// copy of that commit); what that commit lacked is reached through the modules,
// so each test fails on its own assertion.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOALS, type DownyKind, type GoalId } from '../src/games/ranch/defs';
import * as lessonsMod from '../src/games/ranch/lessons';
import { Tutor, goalSpot, goalText, rareStep, teachAll, type Mark, type Say } from '../src/games/ranch/lessons';
import * as simMod from '../src/games/ranch/sim';
import { Sim, TUG, padSpots, type Aim, type Controls, type Ev, type Interactable } from '../src/games/ranch/sim';
import { CRATES, DOOR, GATES, PADS, WORKBENCH } from '../src/games/ranch/world';
import { rng } from '../src/games/ranch/noise';
import type { Downy } from '../src/games/ranch/state';
import { newItem } from '../src/games/ranch/state';

vi.setConfig({ testTimeout: 180_000 });

const realRandom = Math.random;
beforeEach(() => {
  Math.random = rng(97);
});
afterEach(() => {
  Math.random = realRandom;
});

const idle: Controls = { moveX: 0, moveZ: 0, sprint: false, jump: false, jumpPressed: false, draw: false, puff: false, puffPressed: false };
const touch: Say = { dev: 'touch', locked: false, lockAvailable: false };
const M = simMod as unknown as Record<string, unknown>;
const L = lessonsMod as unknown as Record<string, unknown>;
type Duel = Downy & { tell: number; feint?: number; beats?: number };

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
    const p = sim.s.player;
    sim.update(1 / 30, c, aim ? aim() : aimAt(sim, p.x, p.y + 1.6, p.z - 5));
    if (evs) evs.push(...sim.events);
    sim.events.length = 0;
  }
}

/** A wild downy of a kind 4.5 m off on open ground, you facing it, the tug learned (a taught ranch). */
function wildOne(sim: Sim, kind: DownyKind, rare = false): Duel {
  const at: Record<DownyKind, [number, number]> = { clover: [-16, -9], ember: [-46, -15], brook: [43, 4], thistle: [-60, -26] };
  const [x, z] = at[kind];
  sim.s.gates.ridge = sim.s.gates.hollow = true;
  sim.phys.gates = { ...sim.s.gates };
  stand(sim, x, z + 4.5);
  const d = sim.spawn(kind, x, z, false) as Duel;
  d.y = sim.phys.floor(d.x, d.z);
  d.hunger = 0.2;
  d.hopT = 99;
  if (rare) {
    d.rare = true;
    d.calm = 9;
  }
  return d;
}

/**
 * A good thumb at a wild downy: aims at it, lets go a reaction (0.25 s) after it puffs up or pulls back, and pulls
 * again a reaction after the pull back stops (a fake puff it reads and holds through). Returns the events and time.
 */
function duel(sim: Sim, d: Duel, max = 20): { evs: Ev[]; t: number; caught: boolean } {
  const evs: Ev[] = [];
  let letGo = false;
  let releaseAt = -1;
  let pressAt = -1;
  let wasTell = false;
  let wasBack = false;
  let t = 0;
  for (; t < max && !d.gone; t += 1 / 60) {
    const tell = d.tell > 0;
    const back = d.back > 0;
    if (tell && !wasTell) releaseAt = t + 0.25;
    if (!back && wasBack) {
      releaseAt = -1;
      if (letGo) pressAt = t + 0.25;
    }
    if (releaseAt >= 0 && t >= releaseAt) {
      letGo = true;
      releaseAt = -1;
    }
    if (pressAt >= 0 && t >= pressAt) {
      letGo = false;
      pressAt = -1;
    }
    wasTell = tell;
    wasBack = back;
    // Facing it, and walking in again once it is past 5.5 m (a brook glides off towards the pond).
    const p = sim.s.player;
    p.yaw = Math.atan2(-(d.x - p.x), -(d.z - p.z));
    const far = Math.hypot(d.x - p.x, d.z - p.z) > 5.5;
    sim.update(1 / 60, { ...idle, moveZ: far ? 0.7 : 0, draw: !letGo }, aimAt(sim, d.x, d.y + 0.25, d.z));
    evs.push(...sim.events);
    sim.events.length = 0;
  }
  return { evs, t, caught: sim.s.slots.some((q) => q.t === d.kind) };
}

/** A taught ranch (the sandbox), so every pull back follows its kind's rules. */
function taught(hour = 10): Sim {
  const sim = quiet(hour);
  sim.teaching = true;
  teachAll(sim.s);
  return sim;
}

// ---------------------------------------------------------------- P1: a goal on the page can always be done

describe('P1: a journal goal on the page, and its arrow, can always be done right then, day and night', () => {
  /** The ranch the journal shows a goal on: every goal before it done, the lessons through the loop learned (the calm ones after not), pens and coins as asked. */
  function ranchFor(id: GoalId, hour: number, coins: number): { sim: Sim; tutor: Tutor } {
    const sim = quiet(hour);
    sim.teaching = true;
    const s = sim.s;
    s.day = 2;
    s.night = 2;
    s.orderDay = 2;
    for (const l of ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'slots', 'meadow', 'jump', 'run', 'ease', 'farm', 'order', 'dusk', 'night', 'ups', 'feeder', 'garden', 'plant']) s.learn.push(`lesson:${l}`);
    for (const f of ['bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'slots', 'jump', 'appetite', 'ease', 'orders', 'time', 'evening', 'clock', 'sleep', 'nettles', 'up:hedge', 'up:feeder', 'garden']) s.learn.push(f);
    const idx = GOALS.findIndex((g) => g.id === id);
    s.goals = GOALS.slice(0, idx).map((g) => g.id);
    if (s.goals.includes('ridge')) s.gates.ridge = true;
    if (s.goals.includes('hollow')) s.gates.hollow = true;
    sim.phys.gates = { ...s.gates };
    pen(sim, 1, id === 'feeder' ? [] : ['feeder']);
    fill(sim, 1, 'clover', 4);
    s.coins = coins;
    return { sim, tutor: new Tutor() };
  }

  /** Can the goal on the page be done right now, by what is in the world (a gate's Gate option, a post's Feeder tag)? */
  function doable(sim: Sim, id: GoalId): boolean {
    const s = sim.s;
    if (id === 'ridge' || id === 'hollow') {
      const g = GATES[id];
      const x = g.x + (id === 'ridge' ? 2.4 : -2.4);
      stand(sim, x, g.z);
      const it = sim.interactable(aimAt(sim, g.x, sim.phys.floor(g.x, g.z) + 1.5, g.z));
      return !!it && it.kind === 'gate' && sim.menu(it).some((o) => o.id === `gate:${id}` && o.ok);
    }
    if (id === 'feeder') {
      const post = padSpots(1).post;
      const it: Interactable = { kind: 'pad', id: 1, label: '', x: post.x, y: 0, z: post.z };
      return sim.menu(it).some((o) => o.id === 'pen:feeder' && o.ok);
    }
    if (id === 'ember' || id === 'thistle') return s.gates.ridge;
    return true;
  }

  it("the playtest's evening: day 2 at 21:00 with 574 coins, the gates lesson resting till morning: the gate goal and its arrow are up, and the gate opens from the arrow", () => {
    const { sim, tutor } = ranchFor('ridge', 21, 574);
    const s = sim.s;
    const floor = (x: number, z: number) => sim.phys.floor(x, z);
    expect(typeof (tutor as unknown as Record<string, unknown>).goalShown, 'the page brings in what a goal on it needs').toBe('function');
    for (let k = 0; k < 30; k++) {
      const v = tutor.update(s, 1 / 30, touch, floor);
      expect(v.line, 'no lesson at night: the journal has the page').toBe('');
      const g = sim.openGoals(1)[0];
      expect(g.id).toBe('ridge');
      (tutor as unknown as { goalShown(s: unknown, id: GoalId): void }).goalShown(s, g.id);
    }
    expect(goalText('ridge', s)).toBe('Open the gate to Ember Ridge.');
    const m: Mark = { on: false, icon: 'arrow', x: 0, y: 0, z: 0, rx: 0, rz: 0, r: 0, slot: -1 };
    expect(goalSpot('ridge', s, m, floor), 'the arrow over the gate').toBe(true);
    expect(doable(sim, 'ridge'), 'and at the gate, its Gate button and price').toBe(true);
  });

  it('every goal, at every few hours of the day and night, with and without the coins: an arrow or an action on the page can be done then; short of coins it counts them, with no arrow', () => {
    const floor0 = (sim: Sim) => (x: number, z: number) => sim.phys.floor(x, z);
    const ids = GOALS.map((g) => g.id).filter((id) => !['catch', 'pen', 'feed'].includes(id));
    let shown = 0;
    for (const id of ids) {
      for (const hour of [6.5, 11, 15, 18.6, 21, 23.5, 2]) {
        for (const coins of [90, 1500]) {
          const { sim, tutor } = ranchFor(id, hour, coins);
          const s = sim.s;
          let v = { line: '' };
          for (let k = 0; k < 20; k++) {
            v = tutor.update(s, 1 / 30, touch, floor0(sim));
            if (!v.line) (tutor as unknown as { goalShown?(s: unknown, id: GoalId): void }).goalShown?.(s, id);
          }
          // A lesson has the page: the goal is not on it.
          if (v.line) continue;
          shown++;
          const text = goalText(id, s);
          const m: Mark = { on: false, icon: 'arrow', x: 0, y: 0, z: 0, rx: 0, rz: 0, r: 0, slot: -1 };
          const arrow = goalSpot(id, s, m, floor0(sim));
          const costly = id === 'ridge' || id === 'hollow' || id === 'feeder';
          const cost = id === 'ridge' ? 500 : id === 'hollow' ? 1200 : 150;
          if (costly && coins < cost) {
            expect(text, `${id} at ${hour} with ${coins}: counts the coins`).toMatch(/, [\d,]+ of [\d,]+\.$/);
            expect(arrow, `${id} at ${hour} with ${coins}: no arrow to a thing you cannot pay for`).toBe(false);
          } else if (arrow || costly) {
            expect(doable(sim, id), `${id} at ${hour} with ${coins}: "${text}"${arrow ? ' with an arrow' : ''} can be done`).toBe(true);
          }
        }
      }
    }
    expect(shown).toBeGreaterThan(60);
  });
});

// ---------------------------------------------------------------- P2: a tug of beats

describe('P2: each wild tug is 2 to 4 beats (clovers 1 or 2), with fake puffs to read and a shift in the slack', () => {
  it('a good thumb at twenty of each kind: clovers pull back once or twice, embers, brooks and thistles two to four times, the rare one three to five', () => {
    const counts: Record<string, number[]> = {};
    for (const [kind, rare] of [['clover', false], ['ember', false], ['brook', false], ['thistle', false], ['clover', true]] as [DownyKind, boolean][]) {
      const key = `${rare ? 'rare ' : ''}${kind}`;
      counts[key] = [];
      for (let seed = 1; seed <= 20; seed++) {
        Math.random = rng(seed * 13);
        const sim = taught(kind === 'thistle' ? 18.6 : 10);
        const d = wildOne(sim, kind, rare);
        const r = duel(sim, d);
        if (!r.caught || r.evs.some((e) => e.t === 'slip' || e.t === 'escape')) continue;
        counts[key].push(r.evs.filter((e) => e.t === 'pullback').length);
      }
    }
    const within = (k: string, lo: number, hi: number) => {
      expect(counts[k].length, `${k}: caught often enough to count`).toBeGreaterThanOrEqual(14);
      for (const n of counts[k]) expect(n, `${k}: ${counts[k].join(',')}`).toBeGreaterThanOrEqual(lo);
      for (const n of counts[k]) expect(n, `${k}: ${counts[k].join(',')}`).toBeLessThanOrEqual(hi);
    };
    within('clover', 1, 2);
    within('ember', 2, 4);
    within('brook', 2, 4);
    within('thistle', 2, 4);
    within('rare clover', 3, 5);
    // A brook is not a clover: more beats on the whole.
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(mean(counts.brook)).toBeGreaterThan(mean(counts.clover) + 1);
  });

  it('a fake puff now and then: it does not pull; held through it costs nothing, let go on it costs a little of the pull and starts the slack', () => {
    expect(M.FEINT, 'fake puffs').toBeTruthy();
    let held = 0;
    let fooled = 0;
    for (let seed = 1; seed <= 60 && (held < 3 || fooled < 3); seed++) {
      Math.random = rng(seed * 7);
      const sim = taught(10);
      const d = wildOne(sim, 'ember');
      const letGoOnIt = seed % 2 === 0;
      let tugAt = -1;
      let sawFeint = false;
      let backDuring = false;
      for (let t = 0; t < 10 && !d.gone; t += 1 / 60) {
        const feint = (d.feint ?? 0) > 0;
        if (feint && !sawFeint) {
          sawFeint = true;
          tugAt = d.tug;
        }
        // Read every real tell; on the fake puff, hold on or let go as this try chooses.
        const draw = !(d.tell > 0 || d.back > 0) && !(feint && letGoOnIt);
        sim.update(1 / 60, { ...idle, draw }, aimAt(sim, d.x, d.y + 0.25, d.z));
        if (feint && d.back > 0) backDuring = true;
        const evs = sim.events.splice(0);
        if (sawFeint && feint && !(d.feint! > 0)) {
          // It ended.
          if (letGoOnIt) {
            expect(d.tug, 'let go on it: a little of the pull back').toBeLessThan(tugAt);
            expect(d.slackT, 'and its slack running').toBeGreaterThanOrEqual(0);
            expect(evs.some((e) => (e.t as string) === 'fooled') || d.tug < tugAt).toBe(true);
            fooled++;
          } else {
            expect(d.tug, 'held through: the pull went on').toBeGreaterThan(tugAt);
            held++;
          }
          break;
        }
      }
      if (sawFeint) expect(backDuring, 'a fake puff does not pull back').toBe(false);
    }
    expect(held).toBeGreaterThanOrEqual(3);
    expect(fooled).toBeGreaterThanOrEqual(3);
  });

  it('in the slack after a pull back it shifts to one side, so the crosshair has to find it again', () => {
    const shifts: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      Math.random = rng(seed * 5);
      const sim = taught(10);
      const d = wildOne(sim, 'brook');
      let letGo = false;
      let at: { x: number; z: number } | null = null;
      for (let t = 0; t < 8 && !d.gone; t += 1 / 60) {
        if (d.tell > 0 || d.back > 0) letGo = true;
        const p = sim.s.player;
        if (at === null && letGo && d.back <= 0 && d.tell <= 0) at = { x: d.x, z: d.z };
        if (at && t > 0) {
          // 0.5 s into the slack: how far it went across the line to you.
          const ux = at.x - p.x;
          const uz = at.z - p.z;
          const l = Math.hypot(ux, uz);
          if (Math.hypot(d.x - at.x, d.z - at.z) > 0 && sim.events.length >= 0) {
            const side = Math.abs(((d.x - at.x) * -uz + (d.z - at.z) * ux) / l);
            if ((d as Downy & { slackT: number }).slackT > 0.5) {
              shifts.push(side);
              break;
            }
          }
        }
        sim.update(1 / 60, { ...idle, draw: !letGo }, aimAt(sim, d.x, d.y + 0.25, d.z));
        sim.events.length = 0;
      }
    }
    expect(shifts.length).toBeGreaterThanOrEqual(8);
    const mean = shifts.reduce((a, b) => a + b, 0) / shifts.length;
    expect(mean, shifts.map((v) => v.toFixed(2)).join(',')).toBeGreaterThan(0.45);
  });

  it('every pull back lasts longer than its grace (holding straight through one always slips)', () => {
    for (const k of ['clover', 'ember', 'brook', 'thistle'] as DownyKind[]) expect(TUG[k].dur[0], k).toBeGreaterThan(TUG[k].grace);
    const R = M.RARE_TUG as { dur: number[]; grace: number };
    expect(R.dur[0]).toBeGreaterThan(R.grace);
    // And the rule now counts beats.
    expect((TUG.brook as unknown as { beats?: number[] }).beats, 'beats by kind').toBeTruthy();
  });
});

// ---------------------------------------------------------------- P2: pages of something done

describe('P2: a page of something done is on screen 3 s or more, over a lesson line that stays up', () => {
  /** The game's journal over a few seconds: a tutor and the page queue, the lesson line up as the sim has it. Returns each page's seconds up. */
  function pages(setup: (sim: Sim) => void, fire: (sim: Sim, P: { add(p: unknown): void }) => void, secs = 14): { up: number[]; lesson: string } {
    const Pages = L.Pages as (new () => { add(p: unknown): void; update(dt: number, v: unknown, age: number, cut: boolean): unknown; showing: unknown }) | undefined;
    expect(Pages, 'a page queue').toBeTruthy();
    const sim = quiet(18.6);
    sim.teaching = true;
    setup(sim);
    const s = sim.s;
    const tutor = new Tutor();
    const P = new Pages!();
    const floor = (x: number, z: number) => sim.phys.floor(x, z);
    const up: number[] = [];
    let lesson = '';
    let shown: unknown = null;
    for (let t = 0; t < secs; t += 1 / 30) {
      if (Math.abs(t - 4) < 1 / 60) fire(sim, P);
      run(sim, 1 / 30);
      const v = tutor.update(s, 1 / 30, touch, floor);
      if (v.line) lesson = v.line;
      const T = tutor as unknown as { lineAge: number; cutting: boolean };
      if (P.update(1 / 30, v, T.lineAge, T.cutting)) tutor.hold = 3.4;
      if (P.showing && P.showing !== shown) up.push(0);
      if (P.showing) up[up.length - 1] += 1 / 30;
      shown = P.showing;
    }
    return { up, lesson };
  }
  const evening = (sim: Sim) => {
    const s = sim.s;
    for (const l of ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'slots', 'meadow', 'jump', 'run', 'ease', 'farm', 'order', 'ups', 'feeder']) s.learn.push(`lesson:${l}`);
    for (const f of ['bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'slots', 'jump', 'appetite', 'ease', 'orders', 'time', 'evening', 'up:feeder']) s.learn.push(f);
    pen(sim, 1, ['feeder']);
    fill(sim, 1, 'clover', 3);
  };

  it('the first order filled under "Sleep at the front door till morning."', () => {
    const r = pages(evening, (_sim, P) => P.add({ title: 'Earned 48 coins', lines: [{ text: 'Clover fluff, 4 of 4.', done: true, fresh: true }] }));
    expect(r.lesson).toBe('Sleep at the front door till morning.');
    expect(r.up.length).toBe(1);
    expect(r.up[0]).toBeGreaterThanOrEqual(3);
  });

  it('the gold clover penned under the same line: its page ("It stays. Its pen sheds more.") is up 3 s', () => {
    const r = pages(evening, (_sim, P) => P.add({ title: 'Earned 65 coins', lines: [{ text: 'Gold clover downy, 1 of 1.', done: true, fresh: true }, { text: 'It stays. Its pen sheds more.', done: false, fresh: false, plain: true }] }));
    expect(r.up[0]).toBeGreaterThanOrEqual(3);
  });

  it('a trip filled under "Open the gate to Ember Ridge." by day, and a goal done at the same moment: both pages, 3 s each', () => {
    const r = pages(
      (sim) => {
        evening(sim);
        sim.s.hour = 10;
        sim.s.day = 2;
        sim.s.night = 2;
        sim.s.orderDay = 2;
        sim.s.coins = 600;
        for (const l of ['dusk', 'night', 'garden', 'plant']) sim.s.learn.push(`lesson:${l}`);
      },
      (_sim, P) => {
        P.add({ title: 'Earned 255 coins', lines: [{ text: 'Clover downies, 3 of 3.', done: true, fresh: true }] });
        P.add({ title: 'Earned 60 coins', lines: [{ text: 'Fill an order from the price board.', done: true, fresh: true }] });
      },
      16,
    );
    expect(r.lesson).toBe('Open the gate to Ember Ridge.');
    expect(r.up.length).toBe(2);
    for (const u of r.up) expect(u).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------- P2: offers

describe('P2: picking an offer is a real decision: a prized bonus capped, no sort and kind back within two mornings, the rare one worth over the week', () => {
  function ranch(kinds: DownyKind[], counts: number[]): Sim {
    const sim = quiet(6);
    const s = sim.s;
    s.gates.ridge = true;
    s.gates.hollow = kinds.includes('brook');
    sim.phys.gates = { ...s.gates };
    kinds.forEach((k, i) => {
      pen(sim, [1, 4, 2, 5][i], k === 'thistle' ? ['feeder', 'high'] : ['feeder']);
      fill(sim, [1, 4, 2, 5][i], k, counts[i]);
    });
    s.learn.push('orders');
    return sim;
  }

  it('thirty mornings with thistles kept: a prized order pays at most half again what a plain fluff order by dusk pays (it paid 1,116 for 9 thistle fluff)', () => {
    const sim = ranch(['clover', 'ember', 'thistle'], [10, 8, 2]);
    let prized = 0;
    for (let d = 2; d < 32; d++) {
      sim.s.day = d;
      sim.s.hour = 6;
      sim.postOrders(true);
      const choices = sim.orderChoices(6).filter((c) => c.kind !== 'thistle');
      const plain = Math.max(...choices.map((c) => c.n * sim.price(c.kind)));
      for (const o of sim.offers()) {
        if (o.mult <= 2) continue;
        prized++;
        expect(o.pay, `day ${d}: ${o.n} ${o.kind} fluff pays ${o.pay} against a plain ${plain}`).toBeLessThanOrEqual(Math.round(plain * 1.5) + 5);
      }
    }
    expect(prized).toBeGreaterThan(3);
  });

  it("the playtest's ranches over thirty mornings: the same sort and kind on either of the last two mornings only where there is no other kind to offer", () => {
    for (const [kinds, counts] of [
      [['clover', 'ember', 'thistle'], [10, 8, 2]],
      [['clover', 'ember', 'brook'], [10, 10, 6]],
    ] as [DownyKind[], number[]][]) {
      const sim = ranch(kinds, counts);
      const seen: { full: Set<string>; kind: Set<string> }[] = [];
      let full = 0;
      let kind = 0;
      let avoidable = 0;
      for (let d = 2; d < 32; d++) {
        sim.s.day = d;
        sim.s.hour = 6;
        if (d === 12) for (const q of sim.s.downies) if (!q.gone && q.pen >= 0) q.rare = true;
        sim.postOrders(true);
        const os = sim.offers();
        expect(os.length, `${kinds.join('+')} day ${d}: three offers`).toBe(3);
        const sortOf = (o: { rare?: unknown; live?: boolean }) => (o.rare ? 'rare' : o.live ? 'live' : 'fluff');
        const fk = new Set(os.map((o) => `${sortOf(o)}:${o.kind}:${o.by}`));
        const kk = new Set(os.map((o) => `${sortOf(o)}:${o.kind}`));
        // (Round 8's rule holds too: never the same sort, kind and deadline as yesterday.)
        for (const k of fk) if (seen.slice(-1).some((q) => q.full.has(k))) full++;
        for (const o of os) {
          const k = `${sortOf(o)}:${o.kind}`;
          if (!seen.slice(-2).some((q) => q.kind.has(k))) continue;
          kind++;
          // Could the board have offered this sort for a kind not on the last two mornings?
          const pool = sortOf(o) === 'fluff' ? sim.orderChoices(6).map((c) => c.kind) : sim.liveKinds();
          if (pool.some((q) => !seen.slice(-2).some((z) => z.kind.has(`${sortOf(o)}:${q}`)) && !os.some((z) => sortOf(z) === sortOf(o) && z.kind === q))) avoidable++;
        }
        seen.push({ full: fk, kind: kk });
      }
      expect(full, `${kinds.join('+')}: one of yesterday's again`).toBe(0);
      expect(avoidable, `${kinds.join('+')}: a sort and kind back within two mornings when another was there to offer (${kind} in all)`).toBe(0);
    }
  });

  it("the rare one's tag puts its worth over the rest of the week, not \"a day\"", () => {
    const sim = ranch(['clover'], [6]);
    sim.s.day = 3;
    sim.s.orders = [{ kind: 'clover', live: true, n: 1, got: 0, paid: 0, mult: 2, pay: 65, state: 'offer', rare: { spot: 0 }, by: 19 }];
    const note = sim.offerTag(sim.s.orders[0]).note;
    expect(note).not.toMatch(/a day/);
    expect(note).toMatch(/^By the old oak\. Pays 65, then [\d,]+ more by day 7$/);
    const perDay = (sim as unknown as { rareWorth(): number }).rareWorth();
    const total = Number(note.match(/then ([\d,]+) more/)![1].replace(/,/g, ''));
    expect(Math.abs(total - perDay * 4)).toBeLessThanOrEqual(10);
  });
});

// ---------------------------------------------------------------- P2: the hunt

describe('P2: the rare one hears you only while you move, by straight distance, and hurries home after a bolt', () => {
  function rare(dy = 0): { sim: Sim; d: Downy } {
    const sim = quiet(9);
    sim.teaching = false;
    const d = sim.spawn('clover', -10, -20, false);
    d.rare = true;
    d.hunger = 0.2;
    d.homeX = d.x;
    d.homeZ = d.z;
    d.y = sim.phys.floor(d.x, d.z) + dy;
    return { sim, d };
  }
  const away = (sim: Sim, d: Downy, m: number) => stand(sim, d.x, d.z + m);

  it('standing still 6 m off, it does not hear you; walking at 11 m it does, and running at 16 m; walking at 16 m it does not', () => {
    let { sim, d } = rare();
    away(sim, d, 6);
    run(sim, 1, idle, () => aimAt(sim, d.x, d.y, d.z));
    expect(d.alert, 'standing still, 6 m off').toBe(false);
    ({ sim, d } = rare());
    away(sim, d, 11.5);
    // Walking across, not at it.
    run(sim, 0.5, { ...idle, moveX: 1 }, () => aimAt(sim, d.x, d.y, d.z));
    expect(d.bolt > 0 || d.alert, 'walking at 11 m').toBe(true);
    ({ sim, d } = rare());
    away(sim, d, 16);
    run(sim, 0.5, { ...idle, moveX: 1, sprint: true }, () => aimAt(sim, d.x, d.y, d.z));
    expect(d.bolt > 0 || d.alert, 'running at 16 m').toBe(true);
    ({ sim, d } = rare());
    away(sim, d, 16);
    run(sim, 0.5, { ...idle, moveX: 1 }, () => aimAt(sim, d.x, d.y, d.z));
    expect(d.alert, 'walking at 16 m').toBe(false);
  });

  it('one rule up or down: walking 11 m off it with it 4 m above you, it hears you (the rose ember on the crag never did)', () => {
    const H = M.RARE_HEAR as { still: number } | undefined;
    expect(H, 'the rare one hears movement').toBeTruthy();
    const { sim, d } = rare();
    // Stand 4 m below it: the player's floor lower than its own.
    stand(sim, d.x, d.z + 11);
    sim.s.player.y = d.y - 4;
    run(sim, 0.4, { ...idle, moveX: 1 }, () => aimAt(sim, d.x, d.y, d.z));
    expect(d.bolt > 0 || d.alert).toBe(true);
  });

  it('after it bolts it is back where it was seen within 12 s (each bolt cost about 40 s of waiting)', () => {
    const { sim, d } = rare();
    away(sim, d, 9);
    run(sim, 0.4, { ...idle, moveX: 1 }, () => aimAt(sim, d.x, d.y, d.z));
    expect(d.bolt).toBeGreaterThan(0);
    // You stand still now.
    sim.s.player.vx = sim.s.player.vz = 0;
    let t = 0;
    let gone = false;
    for (; t < 60; t += 1 / 30) {
      run(sim, 1 / 30, idle, () => aimAt(sim, d.x, d.y, d.z));
      if (Math.hypot(d.x - d.homeX, d.z - d.homeZ) > 6) gone = true;
      if (gone && d.bolt <= 0 && Math.hypot(d.x - d.homeX, d.z - d.homeZ) < 4) break;
    }
    expect(gone, 'it bolted off').toBe(true);
    expect(t).toBeLessThan(12);
  });
});

// ---------------------------------------------------------------- P2: a new pen's food, and the order copy

describe('P2: a new pen\'s starter food is out of a pull at its fluff, and the order copy says when', () => {
  it("the first ember penned in a pen with no feeder: its sack goes in a feeder, and pulling the pen's fluff by the gate takes none of it", () => {
    const sim = taught(10);
    const s = sim.s;
    pen(sim, 4);
    // Blown in: coming down in the pen.
    const d = sim.spawn('ember', PADS[4].x + 1, PADS[4].z, true);
    d.pen = -1;
    d.y = sim.phys.floor(d.x, d.z) + 1.5;
    d.grounded = false;
    d.flyT = 0.4;
    run(sim, 2);
    expect(d.pen).toBe(4);
    expect(s.pads[4].ups).toContain('feeder');
    expect(s.pads[4].feeder.n).toBe(12);
    expect(s.items.filter((it) => !it.gone && it.type === 'sweetroot').length, 'none lying where the fluff gathers').toBe(0);
  });

  it('a trip for after dark says to sell after 9 pm, not to catch them after dark; the first order says it runs to tomorrow\'s dusk', () => {
    const sim = taught(7);
    const s = sim.s;
    const night = sim.offerTag({ kind: 'clover', live: true, n: 3, got: 0, paid: 0, mult: 2, pay: 85, state: 'offer', by: 24, from: 21 });
    expect(night.note).toBe('Caught today. Sell after 9 pm. Pays 255');
    const first = sim.offerTag({ kind: 'clover', n: 4, got: 0, paid: 0, mult: 2, pay: 48, state: 'offer', until: s.day + 1 });
    expect(first.note).toBe('By dusk tomorrow. Pays 48 on top of sales');
  });
});

// ---------------------------------------------------------------- P3

describe('P3: the cheap ones', () => {
  it('the door works from 3.1 m straight in front of it and the workbench from 3.9 m under its arrow', () => {
    const sim = taught(21);
    stand(sim, DOOR.x, DOOR.z - 3.1);
    const door = sim.interactable(aimAt(sim, DOOR.x, sim.phys.floor(DOOR.x, DOOR.z) + 1.4, DOOR.z));
    expect(door?.kind).toBe('door');
    stand(sim, WORKBENCH.x, WORKBENCH.z - 3.9);
    const bench = sim.interactable(aimAt(sim, WORKBENCH.x, sim.phys.floor(WORKBENCH.x, WORKBENCH.z) + 1.4, WORKBENCH.z));
    expect(bench?.kind).toBe('bench');
  });

  it("the feeder lesson rings the feeder's hopper, up where it is, not the post's foot", () => {
    const sim = quiet(15);
    sim.teaching = true;
    const s = sim.s;
    for (const l of ['look', 'walk', 'draw', 'puff', 'feed', 'sell', 'pen', 'penin', 'slots', 'meadow', 'jump', 'run', 'ease', 'farm', 'order', 'ups']) s.learn.push(`lesson:${l}`);
    for (const f of ['bellows', 'draw', 'puff', 'pause', 'coins', 'pads', 'slots', 'jump', 'appetite', 'ease', 'orders', 'time', 'up:feeder']) s.learn.push(f);
    pen(sim, 1, ['feeder']);
    fill(sim, 1, 'clover', 2);
    for (let k = 0; k < 6; k++) sim.stow('cloverhead');
    s.sel = s.slots.findIndex((q) => q.t === 'cloverhead');
    const tutor = new Tutor();
    let v = { id: '' };
    for (let k = 0; k < 30; k++) v = tutor.update(s, 1 / 30, touch, (x, z) => sim.phys.floor(x, z));
    expect(v.id).toBe('feeder');
    const m = tutor.mark;
    const h = padSpots(1).hopper;
    expect(m.r).toBeGreaterThan(0);
    expect(Math.hypot(m.rx - h.x, m.rz - h.z)).toBeLessThan(0.1);
    expect(m.ry ?? 0, 'the ring up at the hopper').toBeGreaterThan(1.2);
  });

  it('selling 2 fluff with 4 Blow taps at the crate sends no clover heads in: "No fluff left in the jar."', () => {
    const sim = taught(10);
    const s = sim.s;
    const C = CRATES[0];
    stand(sim, C.x, C.z - 4);
    sim.stow('tuft-clover');
    sim.stow('tuft-clover');
    sim.stow('cloverhead');
    sim.stow('cloverhead');
    s.sel = s.slots.findIndex((q) => q.t === 'tuft-clover');
    const evs: Ev[] = [];
    const at = () => aimAt(sim, C.x, sim.phys.floor(C.x, C.z) + 1.2, C.z);
    for (let k = 0; k < 4; k++) {
      run(sim, 1 / 30, { ...idle, puff: true, puffPressed: true }, at, evs);
      run(sim, 0.4, idle, at, evs);
    }
    run(sim, 2, idle, at, evs);
    expect(s.slots.reduce((a, q) => a + (q.t === 'cloverhead' ? q.n : 0), 0), 'the clover heads stay aboard').toBe(2);
    expect(evs.some((e) => e.t === 'deny' && e.why === 'No fluff left in the jar.')).toBe(true);
  });

  it('"Keep ten or fewer downies in a pen." only once a pen is crowded: not with a pen of six and five embers aboard for an order', () => {
    const sim = taught(10);
    const s = sim.s;
    s.learn.splice(s.learn.indexOf('lesson:crowd'), 1);
    pen(sim, 4);
    fill(sim, 4, 'ember', 6);
    for (let k = 0; k < 5; k++) sim.stow('ember', 0, { h: 0.2, c: s.day });
    const tutor = new Tutor();
    let ids = new Set<string>();
    for (let k = 0; k < 60; k++) ids.add(tutor.update(s, 1 / 30, touch, (x, z) => sim.phys.floor(x, z)).id);
    expect(ids.has('crowd')).toBe(false);
    fill(sim, 4, 'ember', 5);
    run(sim, 0.5);
    ids = new Set<string>();
    for (let k = 0; k < 60; k++) ids.add(tutor.update(s, 1 / 30, touch, (x, z) => sim.phys.floor(x, z)).id);
    expect(ids.has('crowd'), 'eleven in the pen').toBe(true);
  });

  it('the walk lesson ticks a walk from 3.5 m to 2.2 m (it wanted 0.6 s of walking)', () => {
    const sim = new Sim(null);
    sim.teaching = true;
    const s = sim.s;
    s.learn.push('lesson:look');
    const porch = s.downies.find((d) => d.keep)!;
    stand(sim, porch.x, porch.z + 3.5);
    const tutor = new Tutor();
    const floor = (x: number, z: number) => sim.phys.floor(x, z);
    tutor.update(s, 1 / 30, touch, floor);
    expect(tutor.current).toBe('walk');
    // 1.3 m at a walk: about 0.28 s of the stick.
    for (let t = 0; t < 0.28; t += 1 / 30) {
      tutor.add(s, 'walk', 1 / 30);
      s.player.z -= 4.7 / 30;
      tutor.update(s, 1 / 30, touch, floor);
    }
    for (let k = 0; k < 10; k++) tutor.update(s, 1 / 30, touch, floor);
    expect(Tutor.finished(s, 'walk')).toBe(true);
  });

  it('the hunt\'s line after the catch: blown towards a pen, the rare one is "Blow ... into a pen.", never "Find ... by ..."', () => {
    const sim = taught(9);
    const s = sim.s;
    pen(sim, 1);
    fill(sim, 1, 'clover', 3);
    s.orders = [{ kind: 'ember', live: true, n: 1, got: 0, paid: 0, mult: 2, pay: 110, state: 'open', rare: { spot: 3, seen: true }, until: s.day }];
    for (const d of s.downies) if (d.rare && !d.tame) d.gone = true;
    // Caught today, now flying from a blow towards the pen.
    const d = sim.spawn('ember', PADS[1].x, PADS[1].z - 7, true);
    d.pen = -1;
    d.rare = true;
    d.caught = s.day;
    d.flyT = 0.2;
    expect(rareStep(s)).toBe('pen');
  });
});

// ---------------------------------------------------------------- the first fifteen minutes

describe('the first fifteen minutes: less walking back and forth, less waiting', () => {
  it('a loose downy of yours, never penned, hurries over and waits by a new pen\'s gate (the pen lesson sent you 24 m back to pull it in)', () => {
    const sim = quiet(15);
    const d = sim.spawn('clover', -12, 35, true);
    d.pen = -1;
    pen(sim, 1);
    const post = padSpots(1).post;
    run(sim, 14);
    expect(Math.hypot(d.x - post.x, d.z - post.z), `at (${d.x.toFixed(1)}, ${d.z.toFixed(1)})`).toBeLessThan(5);
  });

  it('wild clovers just past the ranch gate, and the first taught night\'s first pest comes in there too', () => {
    const sim = new Sim(null);
    const near = sim.s.downies.filter((d) => !d.tame && !d.keep && d.kind === 'clover' && Math.hypot(d.x, d.z - 18) < 15);
    expect(near.length).toBeGreaterThanOrEqual(2);
    const t = new Sim(null);
    t.teaching = true;
    t.wild = false;
    t.s.learn.push('nettles', 'lesson:meadow');
    t.s.hour = 21;
    run(t, 9);
    const n = t.s.nettles.find((q) => !q.gone);
    expect(n, 'a pest comes').toBeTruthy();
    expect(Math.hypot(n!.x, n!.z - 18), 'by the ranch gate').toBeLessThan(18);
  });

  it('a goal to fill the time once the loop is taught: keep five downies in one pen', () => {
    expect(GOALS.some((g) => (g.id as string) === 'herd')).toBe(true);
    const sim = quiet(10);
    pen(sim, 1);
    fill(sim, 1, 'clover', 5);
    run(sim, 1);
    expect(sim.s.goals).toContain('herd');
  });

  it('a garden bed ripens for a lesson even when a crop rolled off it (the feeder lesson pointed at a bare bed for 45 s at a time)', () => {
    const sim = quiet(15);
    sim.teaching = true;
    const s = sim.s;
    for (const l of ['look', 'walk', 'draw', 'puff']) s.learn.push(`lesson:${l}`);
    s.learn.push('bellows', 'draw', 'puff');
    s.pads[0].grow = 0;
    // A clover head from the bed lying out in the lane.
    const it = newItem(s, 'cloverhead', PADS[0].x + 6, 0, PADS[0].z + 6, 1000);
    it.y = sim.phys.floor(it.x, it.z) + it.r;
    s.items.push(it);
    const d = sim.spawn('clover', -12, 35, true);
    d.hunger = 0.7;
    const tutor = new Tutor();
    for (let k = 0; k < 10; k++) tutor.update(s, 1 / 30, touch, (x, z) => sim.phys.floor(x, z));
    expect(tutor.current).toBe('feed');
    run(sim, 3);
    expect(s.items.some((q) => !q.gone && q.type === 'cloverhead' && Math.abs(q.x - PADS[0].x) < 2.6 && Math.abs(q.z - PADS[0].z) < 2.6), 'a crop on the bed').toBe(true);
  });
});
