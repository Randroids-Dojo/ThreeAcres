// Round 10: "It is calm and works, but the fair, the headline goal, was out
// of reach in both seasons and the game never said so." The plant lesson
// sowed all sixteen plots, so the first pair had no soil; two request slots
// left the spring fair's third request too late; every summer offer said
// "After the fair"; an untaken single blocked the board for four days; the
// rack moved Hoe into Seeds' place when Build arrived; Build stayed in hand
// after a build; taps past an empty can were dropped; Escape just after a
// card closed opened the game switcher; held Space popped the board up
// mid-walk; the scarecrow lesson waited for a bare plot in the middle of a
// field while crows ate; pairs were a sum, the bigger number won.
//
// These read the farm through the simulation's commands, the lessons, a
// lesson-following player (`follow` in ./helpers) and the UI's pure helpers.
// New helpers are reached through their modules (`?.`), so on the committed
// round 9 code the tests fail on their assertions, not on imports.
import { describe, expect, it } from 'vitest';
import * as director from '../src/games/homestead/director';
import { Tutor } from '../src/games/homestead/lessons';
import { CROPS } from '../src/sim/crops';
import { nightfall } from '../src/sim/day';
import * as goals from '../src/sim/goals';
import { fillRequests, offerRequests } from '../src/sim/goals';
import { step } from '../src/sim/step';
import { plant, plots } from '../src/sim/world';
import type { Command } from '../src/sim/commands';
import type { Order, SimEvent, ToolId, WorldState } from '../src/sim/types';
import * as dialogs from '../src/ui/dialogs';
import * as hud from '../src/ui/hud';
import { EARLY, EARLY_FEATURES, follow, stand, teach, world } from './helpers';

const ALL = [...EARLY, 'requests', 'sowfor', 'deliver', 'choose', 'fair', 'pests', 'scarecrow', 'forecast', 'sprinkler', 'bugs', 'field', 'turn', 'smith', 'wide', 'hoe', 'stamina'];
const FEATURES = [...EARLY_FEATURES, 'stamina', 'board', 'requests', 'fair', 'pests', 'build', 'sprinkler', 'forecast', 'hoe', 'smith', 'fields', 'seedtab', 'wide'];

type Fair = { start: number; day: number; want: number; got: number };
const fairOf = (s: WorldState) => (s as WorldState & { fair?: Fair | null }).fair ?? null;
const d = director as typeof director & {
  escapeQuiet?: (closedAt: number, now: number) => boolean;
  boardAct?: (c: { type: 'act'; held?: boolean }, atBoard: boolean) => boolean;
  farmerHit?: (feet: { x: number; y: number } | null, head: { x: number; y: number } | null, side: { x: number; y: number } | null, px: number, py: number) => boolean;
};
const h = hud as typeof hud & { toolSlots?: (s: WorldState) => ToolId[] };
const ui = dialogs as typeof dialogs & {
  fairCard?: (s: WorldState, r: { got: number; want: number; won: boolean; lost?: number; why?: string; late?: number; taken?: number }, day?: number) => { title: string; lines: string[]; button: string };
  offerWhyWords?: (s: WorldState) => string;
  fairLabel?: (s: WorldState, o: Order) => { text: string; now: boolean } | null;
};

/** A farm past its lessons: `fields` fields owned and hoed, `coins` in hand, nothing growing. */
function farm(seed: number, opts: { fields?: number; coins?: number; day?: number } = {}): WorldState {
  const s = teach(world('sunup', seed), ALL, FEATURES);
  s.day = opts.day ?? 6;
  s.rep = 3;
  s.requested = 1;
  s.orders = [];
  s.coins = opts.coins ?? 400;
  s.forecast = ['sun', 'sun', 'sun'];
  s.weather = 'sun';
  s.crowPlan = [];
  for (let i = 1; i < (opts.fields ?? 1); i++) {
    const p = s.parcels[i];
    p.owned = true;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) plots(s, x, y).tilled = true;
  }
  for (const p of s.plots) p.crop = null;
  return s;
}

/** Run the farm for `seconds`, sending each command at its time; returns the events. */
function run(s: WorldState, seconds: number, at: [number, Command][] = []): SimEvent[] {
  const dt = 1 / 60;
  const todo = [...at].sort((a, b) => a[0] - b[0]);
  const ev: SimEvent[] = [];
  for (let t = 0; t < seconds; t += dt) {
    const cmds: Command[] = [];
    while (todo.length && todo[0][0] <= t) cmds.push(todo.shift()![1]);
    s.stamina = s.staminaMax;
    ev.push(...step(s, dt, cmds));
  }
  return ev;
}

const tap = (x: number, y: number) => ({ type: 'actAt' as const, x, y });
const offers = (s: WorldState) => s.orders.filter((o) => o.taken === false);
/** Does a request count for the season's fair: due within the fair's season? */
const counts = (f: Fair, o: Order) => o.due >= f.start && o.due <= f.day;

describe('P1: the plant lesson leaves soil for the first pair', () => {
  it('it asks for eight seeds, counts down, and ends at eight with half the field still bare (it sowed all sixteen)', () => {
    const s = teach(world('sunup', 7), ['pull', 'water', 'well', 'sleep'], ['can', 'sleep']);
    s.day = 2;
    s.coins = 270;
    for (const p of s.plots) if (p.crop) p.crop = null;
    for (const p of s.plots) if (s.tiles[s.plots.indexOf(p)] === 'field') p.tilled = true;
    const t = new Tutor();
    let out = t.update(s, 0.1, true);
    for (const c of out.cmds) if (c.type === 'unlock' && !s.learn.includes(c.what)) s.learn.push(c.what);
    out = t.update(s, 0.1, true);
    expect(out.line).toBe('Plant 8 seeds in the bare soil.');
    expect(out.line.split(/\s+/).length).toBeLessThanOrEqual(8);
    // Planted one by one, it counts down, and is still up after the third (it ended at three).
    const field: [number, number][] = [];
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) field.push([x, y]);
    for (let k = 0; k < 8; k++) {
      const [x, y] = field[k];
      plant(s, x, y, 'radish', 0);
      t.onEvent(s, { type: 'plant', x, y, crop: 'radish', by: s.actors[0].id } as SimEvent);
      out = t.update(s, 0.1, true);
      if (k === 2) {
        expect(out.line).toBe('Plant 5 more seeds in the bare soil.');
        expect(s.learn).not.toContain('lesson:plant');
      }
    }
    expect(s.learn).toContain('lesson:plant');
    expect(field.filter(([x, y]) => !plots(s, x, y).crop).length).toBe(8);
  });
});

describe('P1: every fair can be met from what the board offers', () => {
  // A player who follows the lessons in the simulation (the real tutor runs beside the farm) and takes one side of every
  // pair: the bigger number, as the tester did; the smaller; or the one in time for the fair. Before: 13 to 14 fairs of
  // 18 met over six farms, and the spring fair 3 of 6 (2 of 3 each time it was missed). Round 11: the fair counts only what
  // is taken in its season and filled in full, so it can be lost: this player wins the first two most of the time.
  for (const pick of ['clear', 'small', 'fair'] as const) {
    it(`taking the ${pick === 'clear' ? 'bigger number' : pick === 'small' ? 'smaller number' : 'side in time for the fair'}, it meets the first two fairs most of the time`, () => {
      const firstTwo: boolean[] = [];
      for (const seed of [42, 1055, 2068, 3081, 4094, 5107, 6120, 7133]) {
        const s = world('sunup', seed);
        s.held = false;
        const r = follow(s, 21, { pick, greedy: false });
        expect(r.problems).toEqual([]);
        expect(r.fairs.map((f) => f.day), `seed ${seed}`).toEqual([10, 20]);
        firstTwo.push(...r.fairs.map((f) => f.won));
      }
      expect(firstTwo.filter(Boolean).length / firstTwo.length).toBeGreaterThanOrEqual(0.7);
    }, 30000);
  }

  it('a player who also sows every bare plot, as the tester did, meets spring every time, and is told why when summer is missed', () => {
    for (const seed of [42, 1055, 2068, 3081]) {
      const s = world('sunup', seed);
      s.held = false;
      const r = follow(s, 21, { pick: 'clear', greedy: true });
      expect(r.problems).toEqual([]);
      expect(r.fairs[0].won, `seed ${seed}`).toBe(true);
    }
  }, 30000);

  it('the night after a fair, its card says the ribbon or the miss and why, in a few plain lines', () => {
    const s = farm(5, { day: 11 });
    s.fair = { start: 11, day: 20, want: 3, got: 0 };
    const won = ui.fairCard?.(s, { got: 3, want: 3, won: true, taken: 3 }, 11);
    expect(won?.title).toBe('The spring fair');
    expect(won?.lines[0]).toBe('A ribbon for the house.');
    expect(won?.lines[1]).toBe('All 3 requests filled in full.');
    expect(won?.button).toBe('On to summer');
    const miss = ui.fairCard?.(s, { got: 1, want: 3, won: false, lost: 1, why: 'crows', late: 1, taken: 2 }, 11);
    expect(miss?.lines).toEqual(['No ribbon this time.', '1 of 3 requests filled in full.', '1 request was lost to crows.', 'Only 2 requests were taken this season.', '1 more was not ready by its day.', 'The summer fair wants 3, taken from today.']);
    for (const l of miss?.lines ?? []) {
      expect(l.split(/\s+/).length).toBeLessThanOrEqual(10);
      expect(l).not.toMatch(/[\u2013\u2014!]/);
    }
  });

  it('the fair’s night records what fell short: requests lost before it and what took them', () => {
    const s = farm(9, { day: 13, fields: 2, coins: 900 });
    s.fair = { start: 11, day: 20, want: 3, got: 1 };
    const o: Order = { id: s.nextId++, who: 'Old Tamsin', items: [{ crop: 'sunflower', n: 4 }], reward: 4 * CROPS.sunflower.price + 120, rep: 1, due: 19, sowBy: 13, made: 12, takenOn: 12, seen: true, kind: 'quick', taken: true, got: 0, lost: { crows: 4 } } as Order;
    s.orders = [o];
    s.day = 19;
    goals.settleRequests(s, []);
    s.day = 20;
    nightfall(s, []);
    expect(s.report?.fair).toMatchObject({ got: 1, want: 3, won: false, lost: 1, why: 'crows' });
  });
});

describe('P1: a pair every morning, a Pass, and the board says why when there is one', () => {
  it('a pair not taken goes at the next dawn and a fresh pair takes its place (the Summer 1 offer blocked the board four days)', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const s = farm(seed * 31, { fields: 2, coins: 900, day: 13 });
      fillRequests(s, true);
      const first = offers(s).map((o) => o.id);
      expect(first.length, `seed ${seed}`).toBeGreaterThan(0);
      fillRequests(s, true);
      expect(offers(s).some((o) => first.includes(o.id)), `seed ${seed}`).toBe(false);
      expect(offers(s).length, `seed ${seed}`).toBe(2);
    }
  });

  it('Pass lets today’s offer go, the board says new ones come tomorrow, and they do', () => {
    const s = farm(77, { fields: 2, coins: 900, day: 4 });
    s.fair = { start: 1, day: 10, want: 4, got: 0 };
    fillRequests(s, true);
    expect(offers(s).length).toBe(2);
    step(s, 0.016, [{ type: 'pass' } as unknown as Command]);
    expect(offers(s).length).toBe(0);
    expect(ui.offerWhyWords?.(s)).toBe('New requests come tomorrow.');
    fillRequests(s, true);
    expect(offers(s).length).toBe(2);
  });

  it('a farm sown edge to edge: the board says there is no free soil, and the fair’s card counts those mornings', () => {
    const s = farm(61, { fields: 1, coins: 400, day: 12 });
    s.fair = { start: 11, day: 20, want: 3, got: 1 };
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) plant(s, x, y, 'corn', 0);
    fillRequests(s, true);
    expect(offers(s).length).toBe(0);
    expect(ui.offerWhyWords?.(s)).toBe('No free soil for a request today.');
    fillRequests(s, true);
    expect((fairOf(s) as Fair & { noRoom?: number }).noRoom).toBe(2);
    // Reading the board again the same morning counts nothing more.
    goals.freshenOffers(s);
    expect((fairOf(s) as Fair & { noRoom?: number }).noRoom).toBe(2);
    s.day = 20;
    nightfall(s, []);
    expect(s.report?.fair).toMatchObject({ won: false, noRoom: 2 });
    const card = ui.fairCard?.(s, s.report!.fair!, 21);
    expect(card?.lines).toContain('2 mornings had no free soil for a request.');
    expect(card!.lines.length).toBeLessThanOrEqual(6);
  });

  it('over a lesson-following player’s mornings, a morning with fewer than two offers always says why on the board', () => {
    let dawns = 0;
    let pairs = 0;
    for (const seed of [42, 1055, 2068]) {
      const s = world('sunup', seed);
      s.held = false;
      const r = follow(s, 31, { pick: 'clear', greedy: false });
      for (const m of r.mornings ?? []) {
        dawns++;
        if (m.offers === 2) pairs++;
        else expect(m.why, `seed ${seed} day ${m.day}: ${m.offers} offers`).not.toBe('');
      }
    }
    expect(dawns).toBeGreaterThan(60);
    expect(pairs / dawns).toBeGreaterThan(0.5);
  }, 30000);
});

describe('P2: the days in a pair matter', () => {
  it('with the fair wanting requests, an offer whose seed can ripen by it says so, and one that cannot says too late', () => {
    let pairs = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = farm(seed * 97, { fields: 2, coins: 900, day: 11 });
      s.fair = { start: 11, day: 20, want: 3, got: 2 };
      const two = offerRequests(s);
      if (two.length !== 2) continue;
      s.orders.push(...two);
      pairs++;
      for (const o of two) expect(dialogs.noteText(s, o).lines.join(' ')).toMatch(/In time for the fair/);
    }
    expect(pairs).toBeGreaterThan(8);
    // Corn sown on Summer 5 ripens after the fair on Summer 10, sunflowers no longer can.
    const late = farm(5, { fields: 2, coins: 900, day: 15 });
    late.fair = { start: 11, day: 20, want: 3, got: 2 };
    const corn: Order = { id: late.nextId++, who: 'Old Tamsin', items: [{ crop: 'corn', n: 3 }], reward: 3 * CROPS.corn.price + 90, rep: 1, due: 24, sowBy: 16, made: 15, seen: false, kind: 'single', taken: false };
    late.orders = [corn];
    expect(dialogs.noteText(late, corn).lines.join(' ')).toMatch(/Too late for the fair/);
    expect(dialogs.noteText(late, corn).lines.join(' ')).not.toMatch(/For the autumn fair|After the fair/);
  });

  it('with this season’s fair met, no side says anything of a fair, and each leaves soil for the next one', () => {
    let pairs = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = farm(seed * 101, { fields: 2, coins: 900, day: 13 });
      s.fair = { start: 11, day: 20, want: 3, got: 3 };
      const two = offerRequests(s);
      if (two.length !== 2) continue;
      s.orders.push(...two);
      pairs++;
      for (const o of two) {
        expect(dialogs.noteText(s, o).lines.join(' ')).not.toMatch(/fair/);
        // (32 plots, and the next fair wants four: 16 sunflowers filled the farm past the last day seed could ripen for it.)
        expect(o.items[0].n, `seed ${seed}`).toBeLessThanOrEqual(5);
      }
    }
    expect(pairs).toBeGreaterThan(8);
  });

  it('with no mornings to spare, both sides count for the fair', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = farm(seed * 89, { fields: 2, coins: 900, day: 13 });
      s.fair = { start: 11, day: 20, want: 6, got: 1 };
      const two = offerRequests(s);
      if (two.length !== 2) continue;
      for (const o of two) expect(counts(fairOf(s)!, o), `seed ${seed}: ${o.items[0].crop} due ${o.due}`).toBe(true);
    }
  });

});

describe('tap queue and tools', () => {
  it('each tool keeps its own place on the rack from the first morning (Hoe moved into Seeds’ place when Build came)', () => {
    const fresh = world('sunup', 3);
    const taught = farm(3, { fields: 2 });
    const a = h.toolSlots?.(fresh);
    const b = h.toolSlots?.(taught);
    expect(a).toEqual(['hands', 'can', 'seeds', 'hoe', 'build']);
    expect(b).toEqual(a);
  });

  it('after a build with the Build tool, the tool in hand before it comes back (a tap on a stripped plot built a second scarecrow)', () => {
    const s = farm(11, { coins: 500 });
    stand(s, 2, 4, 's');
    s.tool = 'can';
    s.kitTool = 'can';
    s.buildKind = 'scarecrow';
    run(s, 4, [
      [0, { type: 'tool', tool: 'build' }],
      [0.05, tap(3, 6)],
    ]);
    expect(s.builds.some((b) => b.kind === 'scarecrow' && b.x === 3 && b.y === 6)).toBe(true);
    expect(s.tool).toBe('can');
    // The next tap on bare soil is no second scarecrow.
    run(s, 4, [[0, tap(4, 6)]]);
    expect(s.builds.length).toBe(1);
  });

  it('the can running dry mid-queue goes to the well and carries on: 13 plots tapped with 8 water are all watered', () => {
    const s = farm(13, { fields: 1 });
    s.water = 8;
    stand(s, 2, 4, 's');
    s.tool = 'can';
    const field: [number, number][] = [];
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) field.push([x, y]);
    for (const [x, y] of field.slice(0, 13)) plant(s, x, y, 'carrot', 1);
    for (const p of s.plots) p.wet = false;
    const ev = run(s, 40, field.slice(0, 13).map(([x, y], k) => [k * 0.15, tap(x, y)] as [number, Command]));
    expect(ev.filter((e) => e.type === 'refill').length).toBeGreaterThanOrEqual(1);
    expect(field.slice(0, 13).filter(([x, y]) => plots(s, x, y).wet).length).toBe(13);
  });

  it('a tap on the farmer, or X, lets the waiting taps go; the hit is the farmer’s body, not the plots beside', () => {
    const s = farm(17);
    stand(s, 2, 4, 's');
    s.tool = 'hands';
    for (let x = 2; x < 6; x++) plant(s, x, 8, 'radish', 3);
    run(s, 0.1, [0, 1, 2, 3].map((k) => [k * 0.02, tap(2 + k, 8)] as [number, Command]));
    expect((s.taps ?? []).length).toBeGreaterThan(0);
    run(s, 0.1, [[0, { type: 'cancelTaps' } as unknown as Command]]);
    expect(s.taps ?? []).toEqual([]);
    expect(s.actors[0].aim).toBeNull();
    // On screen: feet at (200, 400), the hat at (200, 350), half a tile 30 px. The upper body stops them; a tap at the
    // feet (on the plot the farmer stands on) or beside the farmer does not.
    const feet = { x: 200, y: 400 };
    expect(d.farmerHit?.(feet, { x: 200, y: 350 }, { x: 230, y: 400 }, 202, 365)).toBe(true);
    expect(d.farmerHit?.(feet, { x: 200, y: 350 }, { x: 230, y: 400 }, 202, 396)).toBe(false);
    expect(d.farmerHit?.(feet, { x: 200, y: 350 }, { x: 230, y: 400 }, 226, 365)).toBe(false);
  });

  it('Escape is quiet for half a second after a card or picker closes (it opened the game switcher)', () => {
    expect(d.escapeQuiet?.(1000, 1200)).toBe(true);
    expect(d.escapeQuiet?.(1000, 1700)).toBe(false);
  });

  it('held Space never opens the board or a field for sale; a fresh press does', () => {
    expect(d.boardAct?.({ type: 'act', held: true }, true)).toBe(false);
    expect(d.boardAct?.({ type: 'act' }, true)).toBe(true);
    // Beside the second field, for sale: a held act says nothing, a press offers it.
    const s = farm(19);
    stand(s, 7, 4, 's');
    s.tool = 'hands';
    const held = step(s, 0.016, [{ type: 'act', held: true }]);
    expect(held.some((e) => e.type === 'deny' && e.reason === 'unowned')).toBe(false);
    const press = step(s, 0.016, [{ type: 'act' }]);
    expect(press.some((e) => e.type === 'deny' && e.reason === 'unowned')).toBe(true);
  });
});

describe('P2: the scarecrow lesson comes the morning after a crow takes a crop', () => {
  it('with no bare plot in the middle of a field, it points at a bare plot elsewhere (it waited from Summer 1 to 8)', () => {
    const s = farm(43, { day: 12, coins: 300 });
    s.learn = s.learn.filter((l) => l !== 'lesson:scarecrow' && l !== 'lesson:forecast' && l !== 'lesson:sprinkler' && l !== 'build');
    s.learnCount['done:pests'] = 3;
    s.learnCount.crowAte = 11;
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) if (!(x === 5 && y === 8)) plant(s, x, y, 'radish', 1);
    const out = new Tutor().update(s, 0.1, true);
    expect(out.line).toBe('Build a scarecrow on bare soil.');
    expect(out.point).toEqual({ x: 5.5, y: 8.5 });
  });

  it('an offer’s dearer side does not hold it back: only the cheaper side need be sown', () => {
    const s = farm(47, { day: 12, coins: 200 });
    s.learn = s.learn.filter((l) => l !== 'lesson:scarecrow' && l !== 'lesson:forecast' && l !== 'lesson:sprinkler' && l !== 'build');
    s.learnCount['done:pests'] = 11;
    const note = (crop: 'sunflower' | 'corn', n: number, id: number): Order => ({ id, who: 'x', items: [{ crop, n }], reward: n * CROPS[crop].price + 50, rep: 1, due: 20, sowBy: 14, made: 12, seen: true, kind: 'quick', taken: false, pair: 900 });
    s.orders = [note('sunflower', 3, 901), note('corn', 4, 902)];
    // 160 coins less 40 for a scarecrow leaves 160: the sunflowers' 90, not the corn's 180.
    const out = new Tutor().update(s, 0.1, true);
    expect(out.line).toBe('Build a scarecrow on bare soil.');
  });
});

describe('P2: no dead days in the first fifteen minutes', () => {
  it('Sunup’s rain waters for one night, as the can does: the day after rain needs the can (rainy stretches were empty)', () => {
    const s = farm(71, { day: 6 });
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) plant(s, x, y, 'carrot', 0);
    for (const q of s.plots) {
      q.wet = false;
      q.moisture = 0;
    }
    s.forecast = ['rain', 'sun', 'sun'];
    nightfall(s, []);
    expect(s.weather).toBe('rain');
    expect(plots(s, 3, 6).wet).toBe(true);
    nightfall(s, []);
    // It grew on the rain's night, and the sunny morning after wants the can.
    expect(plots(s, 3, 6).crop!.age).toBe(1);
    expect(plots(s, 3, 6).wet).toBe(false);
  });

  it('a lesson-following player has hardly a dead day (under five jobs, nothing taken) to Summer 6: at most one in two farms', () => {
    const JOBS = new Set(['harvest', 'water', 'plant', 'till', 'tend', 'build', 'clear', 'refill']);
    for (const greedy of [true, false]) {
      let dead = 0;
      for (let i = 0; i < 6; i++) {
        const s = world('sunup', 42 + i * 1013);
        s.held = false;
        const jobs: Record<number, number> = {};
        const r = follow(s, 16, { pick: 'clear', greedy }, {
          after: (st, ev) => {
            for (const e of ev) if (JOBS.has(e.type) && (e as { by?: number }).by === 1) jobs[st.day] = (jobs[st.day] ?? 0) + 1;
          },
        });
        const took = new Set(r.taken.map((t) => t.day));
        for (let d = 1; d <= 16; d++) if ((jobs[d] ?? 0) < 5 && !took.has(d)) dead++;
      }
      // (Before: 16 sowing every plot and 10 sowing when told, over the six farms.)
      expect(dead, `greedy ${greedy}`).toBeLessThanOrEqual(3);
    }
  }, 30000);

  it('the field lesson waits until the field leaves the seed the requests taken still want (it left 0 coins for three days)', () => {
    const s = farm(73, { day: 5, coins: 400 });
    s.learn = s.learn.filter((l) => l !== 'lesson:field');
    s.orders = [{ id: s.nextId++, who: 'x', items: [{ crop: 'radish', n: 4 }], reward: 200, rep: 1, due: 9, sowBy: 6, made: 4, seen: true, kind: 'easy', taken: true, got: 0 }];
    expect(new Tutor().update(s, 0.1, true).line).not.toBe('Buy a second field.');
    s.coins = 440;
    expect(new Tutor().update(s, 0.1, true).line).toBe('Buy a second field.');
  });
});

describe('copy on short requests and the fair', () => {
  it('a short request says what can come, and its figure in all is what that brings (it read as a loss of 1,220)', () => {
    const s = farm(23, { fields: 2, coins: 900, day: 14 });
    const o: Order = { id: s.nextId++, who: 'Old Tamsin', items: [{ crop: 'corn', n: 5 }], reward: 5 * CROPS.corn.price + 150, rep: 1, due: 17, sowBy: 12, made: 11, seen: true, kind: 'quick', taken: true, got: 0, lost: { heat: 5 } };
    s.orders = [o];
    plant(s, 2, 5, 'corn', 5);
    s.plots[5 * s.W + 2].crop!.for = o.id;
    const text = dialogs.noteText(s, o).lines.join(' ');
    // 1 growing and 4 lost, never "5 lost" beside it on a request for five.
    expect(text).toMatch(/1 growing, 4 lost to the heat/);
    expect(text).toMatch(/1 of 5 can come/);
    expect(text).not.toMatch(/pays/);
  });

  it('the plant-for-the-request line waits while the coin box cannot pay for one seed', () => {
    const s = farm(29, { day: 4, coins: 0 });
    s.learn = s.learn.filter((l) => !['lesson:sowfor', 'lesson:deliver', 'lesson:choose', 'lesson:fair'].includes(l));
    s.orders = [{ id: s.nextId++, who: 'x', items: [{ crop: 'radish', n: 4 }], reward: 200, rep: 1, due: 9, sowBy: 6, made: 3, seen: true, kind: 'single', taken: true, got: 0 }];
    expect(new Tutor().update(s, 0.1, true).line).not.toMatch(/for the request/);
    s.coins = 40;
    expect(new Tutor().update(s, 0.1, true).line).toBe('Plant 4 radishes for the request.');
  });

  it('the board says the fair in one line', () => {
    const s = farm(31, { fields: 2, coins: 900, day: 13 });
    s.fair = { start: 11, day: 20, want: 3, got: 1 };
    // (Round 12: "1 of 3 taken this season, in full." ran to ten words.)
    expect(dialogs.fairLines(s)).toEqual(['Fair Summer 10: 1 of 3 filled.']);
  });
});
