// Round 8: "The daily loop is 30 identical watering taps and two walks to the
// well." Four bugs in the tap queue: a seed picked while taps waited changed
// what they planted (8 of 12 corn went in as sunflowers, and the turn killed
// 9 crops); a second well trip in one queue was merged away and the can ran
// dry on a heat day; the scarecrow lesson's question took over a planting tap
// and the taps after it went on the question; a crow tapped during a 24-tap
// watering pass waited at the back, and a short fill earned no reputation, so
// the copper can stayed locked. Watering 16 plots took 14.5 s, 30 plots cost
// 60 of 100 stamina, and two fields overflowed the day. Pairs were sums
// (neither affordable; pumpkins 19 a plot-day against 12.5 for lettuces);
// money starved, then flooded; seed taps on a plot not yet harvested became
// harvest taps; the can picked bugs instead of watering.
//
// These read the farm through the simulation's commands, the lesson pointer
// and the UI's pure helpers. New helpers are reached through their modules
// (`?.`), so on the committed round 7 code the tests fail on their
// assertions, not on imports.
import { describe, expect, it } from 'vitest';
import * as pointer from '../src/games/homestead/pointer';
import * as actions from '../src/sim/actions';
import * as actors from '../src/sim/actors';
import { CAN_WATER, STAMINA_COST } from '../src/sim/constants';
import { CROP_IDS, CROPS, inSeason } from '../src/sim/crops';
import { nightfall, rescue } from '../src/sim/day';
import * as goals from '../src/sim/goals';
import { offerRequests } from '../src/sim/goals';
import { PROPS } from '../src/sim/map';
import { step } from '../src/sim/step';
import { plant, plots, season } from '../src/sim/world';
import type { Command } from '../src/sim/commands';
import type { CropId, Order, SimEvent, ToolId, WorldState } from '../src/sim/types';
import * as describeUi from '../src/ui/describe';
import * as dialogs from '../src/ui/dialogs';
import * as hud from '../src/ui/hud';
import { EARLY, EARLY_FEATURES, stand, teach, world } from './helpers';

const ALL = [...EARLY, 'requests', 'deliver', 'choose', 'pests', 'scarecrow', 'forecast', 'sprinkler', 'bugs', 'field', 'turn', 'smith', 'wide', 'hoe', 'stamina'];
const FEATURES = [...EARLY_FEATURES, 'stamina', 'board', 'requests', 'pests', 'build', 'sprinkler', 'forecast', 'hoe', 'smith'];

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

/** Run the farm for `seconds`, sending each command at its time; returns the events. Stamina stays topped up when asked. */
function run(s: WorldState, seconds: number, at: [number, Command][] = [], fresh = false): SimEvent[] {
  const dt = 1 / 60;
  const todo = [...at].sort((a, b) => a[0] - b[0]);
  const ev: SimEvent[] = [];
  for (let t = 0; t < seconds; t += dt) {
    const cmds: Command[] = [];
    while (todo.length && todo[0][0] <= t) cmds.push(todo.shift()![1]);
    if (fresh) s.stamina = s.staminaMax;
    ev.push(...step(s, dt, cmds));
  }
  return ev;
}

const tap = (x: number, y: number) => ({ type: 'actAt' as const, x, y });

describe('P1: queued taps keep the tool and seed they were tapped with', () => {
  it('carrot picked, four plots tapped, then radish picked: four carrots go in (it planted 2:radish 3:radish 4:radish 5:carrot)', () => {
    const s = farm(3);
    stand(s, 2, 4, 's');
    s.tool = 'seeds';
    s.seed = 'carrot';
    const ev = run(s, 6, [
      [0, tap(2, 5)],
      [0.05, tap(3, 5)],
      [0.1, tap(4, 5)],
      [0.15, tap(5, 5)],
      // The 1 key in the open picker: Radish, while three taps still wait.
      [0.2, { type: 'seed', crop: 'radish' }],
    ]);
    expect([2, 3, 4, 5].map((x) => plots(s, x, 5).crop?.kind)).toEqual(['carrot', 'carrot', 'carrot', 'carrot']);
    expect(ev.filter((e) => e.type === 'plant').length).toBe(4);
    // The seed in hand is the one picked last.
    expect(s.seed).toBe('radish');
  });

  it('a tool picked while taps wait does not change what they do, and the hand keeps the tool picked', () => {
    const s = farm(5);
    for (let x = 2; x < 6; x++) plant(s, x, 6, 'carrot', 1);
    stand(s, 2, 4, 's');
    s.tool = 'seeds';
    s.seed = 'radish';
    const cmds: [number, Command][] = [
      [0, tap(2, 5)],
      [0.05, tap(3, 5)],
      [0.1, tap(4, 5)],
      // The can, and three thirsty carrots tapped after it.
      [0.15, { type: 'tool', tool: 'can' }],
      [0.2, tap(2, 6)],
      [0.25, tap(3, 6)],
      [0.3, tap(4, 6)],
    ];
    // The hand keeps the can from the moment it is picked, while the radishes still go in (it went back to the seeds
    // as each waiting seed tap came up, under a player who had picked the can).
    const hands = new Set<string>();
    const dt = 1 / 60;
    for (let t = 0; t < 8; t += dt) {
      const now = cmds.filter((c) => c[0] <= t && c[0] > t - dt - 1e-9).map((c) => c[1]);
      step(s, dt, now);
      if (t > 0.16) hands.add(s.tool);
    }
    expect([2, 3, 4].map((x) => plots(s, x, 5).crop?.kind)).toEqual(['radish', 'radish', 'radish']);
    expect([2, 3, 4].every((x) => plots(s, x, 6).wet)).toBe(true);
    expect([...hands]).toEqual(['can']);
  });
});

describe('P1: a trip to the well is never merged away', () => {
  it('two well trips in one queue: both are kept and the can never runs dry (only the first was in state.taps)', () => {
    const s = farm(7, { fields: 2 });
    // Twenty thirsty carrots: more than one can of twelve.
    const crops: [number, number][] = [];
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) crops.push([x, y]);
    for (const [x, y] of [[7, 5], [8, 5], [9, 5], [10, 5]] as [number, number][]) crops.push([x, y]);
    for (const [x, y] of crops) plant(s, x, y, 'carrot', 1);
    s.tools.can = 0;
    s.water = 6;
    s.tool = 'can';
    stand(s, 6, 4, 's');
    const well = PROPS.find((p) => p.kind === 'well')!;
    const cmds: [number, ReturnType<typeof tap>][] = [];
    let t = 0;
    const plan: ([number, number] | 'well')[] = [...crops.slice(0, 6), 'well', ...crops.slice(6, 16), 'well', ...crops.slice(16)];
    for (const q of plan) {
      cmds.push([t, q === 'well' ? tap(well.x, well.y) : tap(q[0], q[1])]);
      t += 0.04;
    }
    run(s, t + 0.02, cmds);
    const refills = (s.taps ?? []).filter((q) => q.x === well.x && q.y === well.y).length;
    expect(refills).toBe(2);
    const ev = run(s, 60, [], true);
    expect(ev.filter((e) => e.type === 'refill').length).toBe(2);
    expect(crops.filter(([x, y]) => !plots(s, x, y).wet)).toEqual([]);
  });

  it('only a true duplicate merges: the same plot, tool and seed with nothing between', () => {
    const s = farm(9);
    for (let x = 2; x < 6; x++) plant(s, x, 5, 'radish', 3);
    s.tool = 'hands';
    stand(s, 2, 9, 'n');
    run(s, 0.2, [[0, tap(5, 5)], [0.02, tap(4, 5)], [0.04, tap(4, 5)], [0.06, tap(3, 5)], [0.08, tap(4, 5)]]);
    // 5,5 is under way; 4,5 twice in a row is one; 3,5 then 4,5 again are kept (something came between).
    expect((s.taps ?? []).map((q) => `${q.x},${q.y}`)).toEqual(['4,5', '3,5', '4,5']);
  });
});

describe('P1: the lesson pointer never eats a planting or watering tap', () => {
  /** The scarecrow lesson's morning: its target is bare soil in the middle of the first field. */
  function morning(tool: ToolId) {
    // Summer 3, when sunflowers go in.
    const s = farm(11, { coins: 220, day: 13 });
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) plant(s, x, y, 'carrot', 2);
    plots(s, 4, 7).crop = null;
    s.tool = tool;
    s.seed = 'sunflower';
    return s;
  }
  const pointerTap = (s: WorldState, tile: { x: number; y: number } | null) => pointer.pointerTap(s, { x: 4.5, y: 7.5 }, 'scarecrow', tile);

  it('a tap on the target with the seeds or the can in hand is the plot’s own job, not "Build a scarecrow?"', () => {
    expect(pointerTap(morning('seeds'), { x: 4, y: 7 })).toBeNull();
    expect(pointerTap(morning('can'), { x: 4, y: 7 })).toBeNull();
    // With the hands, idle, it still asks.
    expect(pointerTap(morning('hands'), { x: 4, y: 7 })?.do).toBe('ask');
  });

  it('nor while taps wait their turn (a tap now would wait too), whatever is in hand', () => {
    const s = morning('hands');
    s.taps = [{ x: 2, y: 5, tool: 'hands' }];
    expect(pointerTap(s, { x: 4, y: 7 })).toBeNull();
    s.taps = [];
    s.actors[0].aim = { verb: 'harvest', x: 2, y: 5, tool: 'hands' };
    s.actors[0].path = [{ x: 2, y: 4 }];
    expect(pointerTap(s, { x: 4, y: 7 })).toBeNull();
  });

  it('seven sunflower taps across the target all plant: none is lost to the question (six were, twice)', () => {
    const s = morning('seeds');
    for (const x of [2, 3, 5]) plots(s, x, 7).crop = null;
    for (const x of [2, 3, 4, 5]) plots(s, x, 8).crop = null;
    stand(s, 1, 7, 'e');
    const tiles: [number, number][] = [[2, 7], [3, 7], [5, 7], [4, 7], [2, 8], [3, 8], [4, 8]];
    // The director's filter: a tap the pointer takes never reaches the farm.
    const cmds: [number, ReturnType<typeof tap>][] = [];
    tiles.forEach(([x, y], k) => cmds.push([k * 0.1, tap(x, y)]));
    const dt = 1 / 60;
    let asked = 0;
    for (let t = 0, i = 0; t < 8; t += dt, i++) {
      const due = cmds.filter((c) => c[0] <= t && c[0] > t - dt).map((c) => c[1]);
      const go = due.filter((c) => {
        const q = pointer.pointerTap(s, { x: 4.5, y: 7.5 }, 'scarecrow', { x: c.x, y: c.y });
        if (q) asked++;
        return !q;
      });
      step(s, dt, go);
    }
    expect(asked).toBe(0);
    expect(tiles.map(([x, y]) => plots(s, x, y).crop?.kind)).toEqual(tiles.map(() => 'sunflower'));
  });
});

describe('P1: a crow or bugs go to the front of the queue', () => {
  it('a crow tapped during a long watering pass is shooed next, not after the pass (it took three taps 30 game minutes apart)', () => {
    const s = farm(13, { fields: 2 });
    const crops: [number, number][] = [];
    for (let y = 5; y < 9; y++) for (let x = 7; x < 11; x++) crops.push([x, y]);
    for (const [x, y] of crops) plant(s, x, y, 'carrot', 1);
    plant(s, 2, 8, 'carrot', 2);
    s.tool = 'can';
    s.water = 40;
    s.tools.can = 0;
    stand(s, 6, 4, 's');
    const cmds: [number, Command][] = crops.map(([x, y], k) => [k * 0.03, tap(x, y)]);
    // The crow lands on the first field while sixteen waterings wait.
    const crowId = s.nextId++;
    s.crows.push({ id: crowId, x: 2, y: 8, fromX: -3, fromY: 4, phase: 'peck', t: 0 });
    cmds.push([0.8, tap(2, 8)]);
    let scaredAt = -1;
    let waterAfterTap = 0;
    const dt = 1 / 60;
    const todo = [...cmds];
    for (let t = 0; t < 30 && scaredAt < 0; t += dt) {
      const now = todo.filter((c) => c[0] <= t);
      for (const c of now) todo.splice(todo.indexOf(c), 1);
      for (const e of step(s, dt, now.map((c) => c[1]))) {
        if (e.type === 'crowScared' && e.id === crowId) scaredAt = t;
        if (e.type === 'water' && t > 0.8) waterAfterTap++;
      }
      s.stamina = s.staminaMax;
    }
    expect(scaredAt).toBeGreaterThan(0);
    // Straight there: at most the job in hand finished first, then the walk (well under the pass's 15 s).
    expect(scaredAt - 0.8).toBeLessThan(4);
    expect(waterAfterTap).toBeLessThanOrEqual(1);
    // The waterings still all come after.
    run(s, 40, [], true);
    expect(crops.filter(([x, y]) => !plots(s, x, y).wet)).toEqual([]);
  });

  it('bugs tapped after a queue go first too, after a crow already waiting', () => {
    const s = farm(17);
    for (let x = 2; x < 6; x++) plant(s, x, 6, 'radish', 3);
    plant(s, 2, 8, 'carrot', 2);
    plant(s, 5, 8, 'carrot', 2);
    plots(s, 5, 8).crop!.bugs = 1;
    s.crows.push({ id: s.nextId++, x: 2, y: 8, fromX: -3, fromY: 4, phase: 'peck', t: 0 });
    s.tool = 'hands';
    stand(s, 2, 4, 's');
    run(s, 0.3, [[0, tap(2, 6)], [0.02, tap(3, 6)], [0.04, tap(4, 6)], [0.06, tap(5, 6)], [0.08, tap(2, 8)], [0.1, tap(5, 8)]]);
    const order = [...(s.actors[0].aim ? [`${s.actors[0].aim.x},${s.actors[0].aim.y}`] : []), ...(s.taps ?? []).map((q) => `${q.x},${q.y}`)];
    // The crow first, the bugs next, then the radishes in the order tapped (the one under way waits after them).
    expect(order.slice(0, 2)).toEqual(['2,8', '5,8']);
  });
});

describe('P1: a short fill earns its share of a reputation point', () => {
  it('9 of 10 earns nine tenths of a point; the next short fill tips it over (a short fill earned nothing)', () => {
    const s = farm(19, { coins: 0 });
    s.rep = 2;
    const short = (n: number, got: number): Order => ({ id: s.nextId++, who: 'Old Tamsin', items: [{ crop: 'radish', n }], reward: n * CROPS.radish.price + 100, rep: 1, due: s.day, sowBy: s.day - 3, made: s.day - 3, seen: true, kind: 'easy', taken: true, got });
    s.orders = [short(10, 9)];
    nightfall(s, []);
    expect(s.rep).toBe(2);
    expect((s as WorldState & { repPart?: number }).repPart).toBeCloseTo(0.9, 5);
    s.orders = [short(10, 9)];
    nightfall(s, []);
    expect(s.rep).toBe(3);
    expect((s as WorldState & { repPart?: number }).repPart).toBeCloseTo(0.8, 5);
    // The board says it in quarters: "Reputation 3¾".
    const repText = (dialogs as { repText?: (s: WorldState) => string }).repText;
    expect(repText?.(s)).toBe('3\u00be');
    // And a full fill is a whole point, as before.
    s.orders = [short(4, 4)];
    nightfall(s, []);
    expect(s.rep).toBe(4);
  });
});

describe('P2: the watering chore, cut', () => {
  /** Two fields of thirsty carrots, every plot. */
  function twoFields(can: number): WorldState {
    const s = farm(23, { fields: 2 });
    for (const pc of [s.parcels[0], s.parcels[1]]) for (let y = pc.y; y < pc.y + pc.h; y++) for (let x = pc.x; x < pc.x + pc.w; x++) {
      plant(s, x, y, 'carrot', 1);
      plots(s, x, y).wet = false;
      plots(s, x, y).moisture = 0;
    }
    s.tools.can = can;
    s.water = CAN_WATER[can];
    s.tool = 'can';
    return s;
  }

  it('the second field comes with the copper can, which waters a whole row of the field a tap', () => {
    const s = farm(29, { coins: 400 });
    expect(s.tools.can).toBe(0);
    const ev = step(s, 0.016, [{ type: 'buyParcel', id: 1 }]);
    expect(s.tools.can).toBe(1);
    expect(s.water).toBe(CAN_WATER[1]);
    expect(ev.some((e) => e.type === 'upgrade' && e.tool === 'can' && e.level === 1)).toBe(true);
    for (let x = 2; x < 6; x++) plant(s, x, 6, 'carrot', 1);
    expect(actions.area(s, 3, 6, 1).map((t) => t.x).sort()).toEqual([2, 3, 4, 5]);
    stand(s, 3, 5, 's');
    s.tool = 'can';
    const w = run(s, 0.2, [[0, { type: 'act' }]]).filter((e) => e.type === 'water').length;
    expect(w).toBe(4);
  });

  it('two fields of thirsty crops: eight taps and two fifths of the stamina, not thirty-two taps and 64', () => {
    const s = twoFields(1);
    stand(s, 6, 4, 's');
    const rows: [number, number][] = [];
    for (let y = 5; y < 9; y++) rows.push([2, y], [7, y]);
    const before = s.stamina;
    const cmds: [number, ReturnType<typeof tap>][] = rows.map(([x, y], k) => [k * 0.05, tap(x, y)]);
    const well = actors.wellsFrom?.(6.5, 8.5)[0];
    // One trip to the well halfway (the copper can holds 24).
    if (well) cmds.splice(6, 0, [0.29, tap(well.x, well.y)]);
    const ev = run(s, 20, cmds);
    const left = s.plots.filter((p, i) => p.crop && s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned && !p.wet).length;
    expect(left).toBe(0);
    expect(ev.filter((e) => e.type === 'water').length).toBe(32);
    expect(before - s.stamina).toBeLessThanOrEqual(8 * (STAMINA_COST.water + 2));
    expect(before - s.stamina).toBeLessThanOrEqual(40);
  });

  it('a second well stands where the paths of the first four fields cross, and a tap beside it fills the can', () => {
    const wells = PROPS.filter((p) => p.kind === 'well');
    expect(wells.length).toBe(2);
    const field = wells.find((w) => w.x === 6 && w.y === 9);
    expect(field).toBeTruthy();
    const s = twoFields(1);
    s.water = 0;
    stand(s, 5, 8, 'e');
    // From the first field's corner the can fills without a walk across the farm.
    run(s, 2, [[0, tap(5, 9)]]);
    expect(s.water).toBe(CAN_WATER[1]);
    const f = s.actors[0];
    expect(Math.hypot(f.x - 6.5, f.y - 9.5)).toBeLessThan(2);
  });
});

describe('P2: pairs the farm can afford, close in worth for each plot-day', () => {
  /** Farm states across the year, with purses as low as the tester's 255. */
  function* states(): Generator<WorldState> {
    let seed = 1;
    for (const fields of [1, 2, 3]) for (const coins of [150, 255, 400, 1200]) for (const day of [4, 6, 13, 16, 24, 26, 34]) for (const sown of [false, true]) {
      const s = farm(seed++ * 7919, { fields, coins, day });
      if (sown) {
        const kinds = CROP_IDS.filter((c) => CROPS[c].regrow === 0 && inSeason(c, season(day)));
        const tiles = s.plots.map((_, i) => i).filter((i) => s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned && s.tiles[i] === 'field');
        tiles.slice(0, Math.floor(tiles.length / 3)).forEach((i, k) => plant(s, i % s.W, Math.floor(i / s.W), kinds[k % kinds.length], 1));
      }
      yield s;
    }
  }
  const worth = (o: Order) => (o.reward - o.items[0].n * CROPS[o.items[0].crop].seed) / (o.items[0].n * CROPS[o.items[0].crop].days);

  it('every offer’s seed can be paid for now (255 coins were offered seed of 480 or 270)', () => {
    let offers = 0;
    const bad: string[] = [];
    for (const s of states()) {
      for (const o of offerRequests(s)) {
        offers++;
        const seed = o.items[0].n * CROPS[o.items[0].crop].seed;
        if (seed > s.coins) bad.push(`${s.coins} coins, ${o.items[0].n} ${o.items[0].crop} seed ${seed}`);
      }
    }
    expect(offers).toBeGreaterThan(150);
    expect(bad, bad.slice(0, 3).join('; ')).toEqual([]);
  });

  it('the two of a pair are within a fifth of each other on what they clear for each plot-day (19 against 12.5 was a sum)', () => {
    let pairs = 0;
    const bad: string[] = [];
    for (const s of states()) {
      const o = offerRequests(s);
      if (o.length !== 2) continue;
      pairs++;
      const [a, b] = o.map(worth);
      if (Math.max(a, b) > 1.2 * Math.min(a, b) + 1e-9) bad.push(o.map((q) => `${q.kind} ${q.items[0].n} ${q.items[0].crop} ${worth(q).toFixed(1)}`).join(' or '));
    }
    expect(pairs).toBeGreaterThan(60);
    expect(bad, bad.slice(0, 3).join('; ')).toEqual([]);
  });

  it('the board’s clash counts the same coins the pair was priced on', () => {
    for (const s of states()) {
      const o = offerRequests(s);
      if (o.length !== 2) continue;
      s.orders.push(...o);
      const c = goals.clashOf(s, o[0], o[1]);
      expect(c, `${s.day} ${s.coins}`).toBeTruthy();
      if (c?.kind === 'coins') expect(c.have).toBeLessThanOrEqual(s.coins);
    }
  });
});

describe('P2: no starve days', () => {
  it('bare soil, no coins for any seed and nothing ripe: a neighbour leaves seed money, even with crops growing', () => {
    const s = farm(31, { coins: 10, day: 13 });
    // Summer 3: corn growing on nine plots, seven bare, 10 coins (the cheapest summer seed is 30).
    let k = 0;
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) if (k++ < 9) plant(s, x, y, 'corn', 2);
    expect(rescue(s)).toBe(110);
    expect(s.coins).toBe(120);
  });
});

describe('P2: a seed tap on a plot not yet harvested picks it, then plants there', () => {
  it('harvest a row, pick seeds, tap the same row: the row is picked and sown (7 of 10 stayed bare)', () => {
    const s = farm(37, { coins: 0 });
    for (let x = 2; x < 6; x++) plant(s, x, 5, 'radish', 3);
    s.tool = 'hands';
    stand(s, 2, 4, 's');
    const cmds: [number, Command][] = [];
    [2, 3, 4, 5].forEach((x, k) => cmds.push([k * 0.05, tap(x, 5)]));
    cmds.push([0.3, { type: 'seed', crop: 'carrot' }], [0.31, { type: 'tool', tool: 'seeds' }]);
    [2, 3, 4, 5].forEach((x, k) => cmds.push([0.35 + k * 0.05, tap(x, 5)]));
    run(s, 10, cmds);
    expect([2, 3, 4, 5].map((x) => plots(s, x, 5).crop?.kind)).toEqual(['carrot', 'carrot', 'carrot', 'carrot']);
    expect(s.stats.harvested.radish).toBeGreaterThanOrEqual(4);
  });

  it('with seeds in hand, one tap on a ripe radish picks it and plants the seed', () => {
    const s = farm(41, { coins: 0 });
    plant(s, 3, 5, 'radish', 3);
    s.tool = 'seeds';
    s.seed = 'lettuce';
    stand(s, 3, 4, 's');
    expect(actors.tapTool(s, 'seeds', 3, 5)).toBe('seeds');
    run(s, 3, [[0, tap(3, 5)]]);
    expect(plots(s, 3, 5).crop?.kind).toBe('lettuce');
    expect(s.coins).toBe(CROPS.radish.price - CROPS.lettuce.seed);
  });
});

describe('P2: the can picks the bugs and waters, in one tap', () => {
  it('a watering pass over a row with two bugged, dry crops waters all four and picks both (four were left dry)', () => {
    const s = farm(43, { fields: 2 });
    s.tools.can = 1;
    s.water = 24;
    for (let x = 2; x < 6; x++) plant(s, x, 6, 'carrot', 1);
    plots(s, 3, 6).crop!.bugs = 1;
    plots(s, 5, 6).crop!.bugs = 2;
    s.tool = 'can';
    stand(s, 2, 5, 's');
    const before = s.stamina;
    const ev = run(s, 2, [[0, tap(3, 6)]]);
    expect([2, 3, 4, 5].every((x) => plots(s, x, 6).wet)).toBe(true);
    expect([2, 3, 4, 5].every((x) => plots(s, x, 6).crop!.bugs === 0)).toBe(true);
    expect(ev.filter((e) => e.type === 'tend').length).toBe(2);
    // A watering of the row, and a picking for each.
    expect(before - s.stamina).toBe(STAMINA_COST.water + 2 + 2 * STAMINA_COST.tend);
  });
});

describe('P3: the small things', () => {
  it('the board’s pinned card counts what is ripe now (it still said "4 ripe to pick" after they were picked)', () => {
    const s = farm(47);
    for (let x = 2; x < 6; x++) plant(s, x, 5, 'radish', 3);
    s.report = { day: s.day - 1, sold: [{ crop: 'radish', n: 2, value: 60 }], wages: 0, grew: 0, withered: 0, eaten: 0, crewWork: 0, income: 60, ripe: 4 };
    const pinned = (hud as { pinnedNews?: (s: WorldState) => string }).pinnedNews;
    expect(pinned?.(s)).toMatch(/4 ripe to pick/);
    for (let x = 2; x < 6; x++) plots(s, x, 5).crop = null;
    expect(pinned?.(s)).toBe('Sold 2 for 60.');
  });

  it('the meadow caption says what it is, then what to do ("Meadow hoe this plot to plant it" had no colon)', () => {
    const s = farm(53, { fields: 2 });
    plots(s, 8, 6).tilled = false;
    expect(describeUi.brief(s, 8, 6).replace(/<[^>]+>/g, '')).toBe('Meadow: hoe this plot to plant it');
  });

  it('a reputation share reads in quarters', () => {
    const share = (describeUi as { repShare?: (n: number) => string }).repShare;
    expect([0, 0.2, 0.25, 0.5, 0.93, 2.75].map((n) => share?.(n))).toEqual(['', '', '¼', '½', '¾', '2¾']);
  });
});

/** A small deterministic generator for the property test (the farm's own stays untouched). */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

describe('property: random tap sequences do what each tap was tapped as', () => {
  it('over 60 farms of random taps, tool and seed changes mid-queue, well trips and crows', () => {
    const seeds: CropId[] = ['radish', 'lettuce', 'carrot'];
    const problems: string[] = [];
    let taps = 0;
    let plants = 0;
    let refillTaps = 0;
    let crowTaps = 0;
    for (let k = 0; k < 60; k++) {
      const r = lcg(1000 + k * 7);
      const s = farm(500 + k, { fields: 2, coins: 5000 });
      const tiles: [number, number][] = [];
      for (const pc of [s.parcels[0], s.parcels[1]]) for (let y = pc.y; y < pc.y + pc.h; y++) for (let x = pc.x; x < pc.x + pc.w; x++) tiles.push([x, y]);
      // A mixed farm: bare plots, thirsty carrots, ripe radishes, a few bugs.
      for (const [x, y] of tiles) {
        const v = r();
        if (v < 0.3) continue;
        if (v < 0.6) plant(s, x, y, 'carrot', 1);
        else if (v < 0.85) plant(s, x, y, 'radish', 3);
        else {
          plant(s, x, y, 'carrot', 2);
          plots(s, x, y).crop!.bugs = 1;
        }
      }
      s.tools.can = r() < 0.5 ? 0 : 1;
      s.water = 3;
      s.tool = 'hands';
      stand(s, 6, 4, 's');
      const wells = PROPS.filter((p) => p.kind === 'well');
      // What each tap was tapped as: its tile, the tool it took and the seed in hand.
      const tapped: { x: number; y: number; tool: ToolId; seed: CropId; t: number; kind: 'plot' | 'well' | 'crow' }[] = [];
      const crowsAt = new Map<number, number>();
      const dt = 1 / 30;
      let t = 0;
      const ev: { e: SimEvent; t: number }[] = [];
      const n = 20 + Math.floor(r() * 25);
      for (let i = 0; i < n; i++) {
        const cmds: Command[] = [];
        const v = r();
        if (v < 0.12) cmds.push({ type: 'tool', tool: (['hands', 'can', 'seeds'] as ToolId[])[Math.floor(r() * 3)] });
        else if (v < 0.2) cmds.push({ type: 'seed', crop: seeds[Math.floor(r() * 3)] });
        else if (v < 0.3) {
          const w = wells[Math.floor(r() * wells.length)];
          cmds.push(tap(w.x, w.y));
          tapped.push({ x: w.x, y: w.y, tool: s.tool, seed: s.seed, t, kind: 'well' });
          refillTaps++;
        } else if (v < 0.36) {
          // A crow lands on a growing crop, and is tapped.
          const at = tiles.find(([x, y]) => plots(s, x, y).crop && !plots(s, x, y).crop!.dead && plots(s, x, y).crop!.stage >= 1 && plots(s, x, y).crop!.stage < 4 && !s.crows.some((c) => c.x === x && c.y === y));
          if (at) {
            const id = s.nextId++;
            s.crows.push({ id, x: at[0], y: at[1], fromX: -3, fromY: 4, phase: 'peck', t: 0 });
            crowsAt.set(id, t);
            cmds.push(tap(at[0], at[1]));
            tapped.push({ x: at[0], y: at[1], tool: s.tool, seed: s.seed, t, kind: 'crow' });
            crowTaps++;
          }
        } else {
          const [x, y] = tiles[Math.floor(r() * tiles.length)];
          cmds.push(tap(x, y));
          const tool = actors.tapTool(s, s.tool, x, y);
          tapped.push({ x, y, tool, seed: s.seed, t, kind: 'plot' });
        }
        taps++;
        // Taps come quickly, as a thumb makes them: a tenth to a third of a second apart.
        const gap = 0.1 + r() * 0.25;
        for (let g = 0; g < gap; g += dt) {
          s.stamina = s.staminaMax;
          for (const e of step(s, dt, g === 0 ? cmds : [])) ev.push({ e, t });
          t += dt;
        }
      }
      for (let g = 0; g < 90; g += dt) {
        s.stamina = s.staminaMax;
        for (const e of step(s, dt)) ev.push({ e, t });
        t += dt;
      }
      // 1. Every seed that went in is the seed in hand when its plot was tapped with the seeds.
      for (const { e } of ev) {
        if (e.type !== 'plant') continue;
        plants++;
        const mine = tapped.filter((q) => q.x === e.x && q.y === e.y && q.tool === 'seeds');
        if (!mine.length) problems.push(`farm ${k}: ${e.crop} planted at ${e.x},${e.y} with no seed tap there`);
        else if (!mine.some((q) => q.seed === e.crop)) problems.push(`farm ${k}: ${e.crop} planted at ${e.x},${e.y}, tapped as ${mine.map((q) => q.seed).join('/')}`);
      }
      // 2. No well trip is lost: each fills the can, or says the can is full.
      const wellsDone = ev.filter(({ e }) => (e.type === 'refill' && wells.some((w) => w.x === e.x && w.y === e.y)) || (e.type === 'deny' && /full/i.test(e.reason) && wells.some((w) => w.x === e.x && w.y === e.y))).length;
      const wellTaps = tapped.filter((q) => q.kind === 'well').length;
      if (wellsDone < wellTaps) problems.push(`farm ${k}: ${wellTaps} well taps, ${wellsDone} done`);
      // 3. A tapped crow is shooed soon, however many taps wait (walking across two fields and one job: under 4 s).
      for (const [id, at] of crowsAt) {
        const gone = ev.find(({ e }) => e.type === 'crowScared' && e.id === id);
        if (!gone) problems.push(`farm ${k}: crow ${id} never shooed`);
        else if (gone.t - at > 4) problems.push(`farm ${k}: crow ${id} shooed ${(gone.t - at).toFixed(1)} s after its tap`);
      }
      // 4. Nothing is left waiting at the end.
      if ((s.taps ?? []).length) problems.push(`farm ${k}: ${(s.taps ?? []).length} taps still waiting`);
    }
    expect(taps).toBeGreaterThan(1500);
    expect(plants).toBeGreaterThan(50);
    expect(refillTaps).toBeGreaterThan(100);
    expect(crowTaps).toBeGreaterThan(40);
    expect(problems, problems.slice(0, 5).join('\n')).toEqual([]);
  });
});
