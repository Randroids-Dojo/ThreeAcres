// Round 6: "The loop is tap-every-plot watering with dead rain days and
// free-money requests. Losses come from pests you never see, and the card
// never explains them." A tap on a bugged crop asked to build a scarecrow
// (the lesson's pointer fell back to the bug and kept the build); an open
// seed picker hid the pointer for good after a tap took the can; requests
// counted crops already growing or in the crate, so most pairs were no
// choice; crows that ate by day went uncounted and a request they cost said
// only "found lettuces elsewhere"; lines about bare soil came with every
// plot sown.
//
// These read the farm through the simulation, the lessons and the HUD's
// pure helpers, so on the committed round 5 code they fail on their
// assertions (or, for the picker, on the helper it lacked).
import { describe, expect, it } from 'vitest';
import { Tutor } from '../src/games/homestead/lessons';
import { pointerTap } from '../src/games/homestead/pointer';
import { CROPS } from '../src/sim/crops';
import { nightfall } from '../src/sim/day';
import * as goals from '../src/sim/goals';
import { offerRequests, requestHave } from '../src/sim/goals';
import { step } from '../src/sim/step';
import { plant, plots } from '../src/sim/world';
import type { Order, SimEvent, WorldState } from '../src/sim/types';
import * as hud from '../src/ui/hud';
import { EARLY, EARLY_FEATURES, stand, teach, world } from './helpers';

const ALL = [...EARLY, 'requests', 'deliver', 'choose', 'pests', 'scarecrow', 'forecast', 'sprinkler', 'bugs', 'field', 'turn', 'smith', 'wide', 'hoe', 'stamina'];
const FEATURES = [...EARLY_FEATURES, 'stamina', 'board', 'requests', 'pests', 'build', 'sprinkler', 'forecast', 'hoe'];

/** A farm past its first request: `fields` fields owned and hoed, `coins` in hand, an empty crate, nothing growing. */
function farm(seed: number, opts: { fields?: number; coins?: number; day?: number; lessons?: string[] } = {}): WorldState {
  const s = teach(world('sunup', seed), opts.lessons ?? ALL, FEATURES);
  s.day = opts.day ?? 6;
  s.rep = 3;
  s.requested = 1;
  s.orders = [];
  s.coins = opts.coins ?? 400;
  s.forecast = ['sun', 'sun', 'sun'];
  s.weather = 'sun';
  for (let i = 1; i < (opts.fields ?? 1); i++) {
    const p = s.parcels[i];
    p.owned = true;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) plots(s, x, y).tilled = true;
  }
  for (const p of s.plots) p.crop = null;
  return s;
}

const fieldTiles = (s: WorldState) => s.plots.map((_, i) => i).filter((i) => s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned && s.tiles[i] === 'field');

/** Mornings like the tester's: one to three fields, 150 to 3,000 coins, sowing days across the year, a third of the soil sown a day earlier with each crop in season, some of it in the crate. */
function* mornings(): Generator<WorldState> {
  let seed = 1;
  for (const fields of [1, 2, 3]) for (const coins of [150, 400, 1200, 3000]) for (const day of [4, 6, 13, 16, 24, 26, 34]) {
    const s = farm(seed++ * 7919, { fields, coins, day });
    const kinds = (Object.keys(CROPS) as (keyof typeof CROPS)[]).filter((c) => CROPS[c].regrow === 0 && CROPS[c].seasons.includes(Math.floor(((day - 1) % 40) / 10)));
    const tiles = fieldTiles(s);
    tiles.slice(0, Math.floor(tiles.length / 3)).forEach((i, k) => plant(s, i % s.W, Math.floor(i / s.W), kinds[k % kinds.length], 1));
    for (const c of kinds) s.stock[c][0] = 4;
    yield s;
  }
}

describe('P1: the pointer builds only at its own target', () => {
  /** The scarecrow lesson's morning with every plot sown and bugs on one carrot (the tester's farm). */
  function fullFarm(): WorldState {
    const s = teach(world('sunup', 9), [...EARLY, 'requests', 'deliver', 'choose', 'pests', 'bugs', 'field', 'turn', 'smith', 'wide', 'stamina'], [...EARLY_FEATURES, 'stamina', 'board', 'requests', 'pests']);
    s.learnCount['done:pests'] = 5;
    s.day = 9;
    s.coins = 180;
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) plant(s, x, y, 'carrot', 2);
    plots(s, 3, 6).crop!.bugs = 1;
    return s;
  }

  it('with no bare soil the pointer finds the bug, but carries no build: a tap on the bugged crop picks the bugs off', () => {
    const s = fullFarm();
    const out = new Tutor().update(s, 0.1, true);
    expect(out.point).toEqual({ x: 3.5, y: 6.5 });
    expect(out.build).toBeUndefined();
    // The tap on the bugged crop is that plot's own job, not "Build a scarecrow?".
    expect(pointerTap(s, out.point, out.build, { x: 3, y: 6 })).toBeNull();
  });

  it('a build lesson on screen whose bare soil is sown loses the build with its target', () => {
    const s = fullFarm();
    plots(s, 4, 7).crop = null;
    plots(s, 3, 6).crop!.bugs = 0;
    const t = new Tutor();
    const a = t.update(s, 0.1, true);
    expect(a.line).toBe('Build a scarecrow on bare soil.');
    expect(a.build).toBe('scarecrow');
    // The last bare plot is sown, and bugs land: the pointer may find them, but it builds nothing there.
    plant(s, 4, 7, 'carrot', 0);
    plots(s, 2, 5).crop!.bugs = 1;
    const b = t.update(s, 0.1, true);
    expect(b.build).toBeUndefined();
  });
});

describe('P1: a picker whose tool leaves the hand is closed, so the pointer comes back', () => {
  it('the seed picker open, a tap takes the can: the picker is closed, not only hidden', () => {
    const after = (hud as unknown as { pickersAfter?: typeof hud.pickersAfter }).pickersAfter;
    expect(typeof after).toBe('function');
    expect(after!({ seed: true, build: false }, 'can', false)).toEqual({ seed: false, build: false });
    expect(after!({ seed: false, build: true }, 'hands', false)).toEqual({ seed: false, build: false });
    // The tool it picks for still in hand: it stays open.
    expect(after!({ seed: true, build: false }, 'seeds', false)).toEqual({ seed: true, build: false });
    expect(after!({ seed: false, build: true }, 'build', false)).toEqual({ seed: false, build: true });
  });
});

describe('P1: every request is fresh sowing; nothing already growing or in the crate counts', () => {
  it('on mornings with crops growing and in the crate, no offer counts any of them', () => {
    let n = 0;
    const bad: string[] = [];
    for (const s of mornings()) {
      for (const o of offerRequests(s)) {
        n++;
        const have = requestHave(s, { ...o, taken: true });
        if (have > 0) bad.push(`${o.items[0].n} ${o.items[0].crop}: ${have} counted on day ${s.day}`);
      }
    }
    expect(n).toBeGreaterThan(100);
    expect(bad, bad.slice(0, 3).join('; ')).toEqual([]);
  });

  it('taken, it counts only what is sown after it was pinned: not the lettuces already growing, not the crate', () => {
    const s = farm(61, { fields: 2, coins: 900, day: 4 });
    // Ten lettuces growing for market, and six in the crate (the tester's "+240 for 10 lettuces already growing").
    const tiles = fieldTiles(s);
    tiles.slice(0, 10).forEach((i) => plant(s, i % s.W, Math.floor(i / s.W), 'lettuce', 3));
    s.stock.lettuce[0] = 6;
    const o: Order = { id: s.nextId++, who: 'Old Tamsin', items: [{ crop: 'lettuce', n: 6 }], reward: 400, rep: 1, due: 9, sowBy: 5, made: 4, taken: false, seen: true, kind: 'easy', pair: 1 };
    s.orders = [o];
    expect(requestHave(s, o)).toBe(0);
    step(s, 0.016, [{ type: 'accept', id: o.id } as never]);
    expect(requestHave(s, o)).toBe(0);
    expect(goals.stillToSow(s, o)).toBe(6);
    // The crate's lettuces sell at market tonight, not into the request.
    const coins = s.coins;
    nightfall(s, []);
    expect(s.report?.filled ?? []).toEqual([]);
    expect(s.coins - coins).toBe(6 * CROPS.lettuce.price);
    // Sown now, they count.
    for (const i of tiles.slice(10, 16)) plant(s, i % s.W, Math.floor(i / s.W), 'lettuce', 0);
    step(s, 0.016, [{ type: 'unlock', what: 'x' } as never]);
    (goals as { claimCrops?: (s: WorldState) => void }).claimCrops?.(s);
    expect(requestHave(s, o)).toBe(6);
    expect(goals.stillToSow(s, o)).toBe(0);
  });

  it('crops sown for one request never count for another of the same crop', () => {
    const s = farm(67, { fields: 2, coins: 900, day: 4 });
    const a: Order = { id: s.nextId++, who: 'Old Tamsin', items: [{ crop: 'radish', n: 4 }], reward: 200, rep: 1, due: 9, sowBy: 5, made: 4, seen: true, kind: 'easy' };
    s.orders = [a];
    const tiles = fieldTiles(s);
    for (const i of tiles.slice(0, 4)) plant(s, i % s.W, Math.floor(i / s.W), 'radish', 0);
    (goals as { claimCrops?: (s: WorldState) => void }).claimCrops?.(s);
    const b: Order = { id: s.nextId++, who: 'Mabel’s bakery', items: [{ crop: 'radish', n: 4 }], reward: 200, rep: 1, due: 10, sowBy: 6, made: 4, seen: true, kind: 'easy' };
    s.orders.push(b);
    (goals as { claimCrops?: (s: WorldState) => void }).claimCrops?.(s);
    expect(requestHave(s, a)).toBe(4);
    expect(requestHave(s, b)).toBe(0);
  });
});

describe('P1: the two of a pair compete for the same soil or coins', () => {
  it('on mornings like the tester’s, the farm could not sow both of most pairs (one pair in seven was a choice)', () => {
    let pairs = 0;
    let compete = 0;
    for (const s of mornings()) {
      const offer = offerRequests(s);
      if (offer.length !== 2) continue;
      pairs++;
      // Free soil and coins by each one's sow-by day (the larger of the two), against what both need sown.
      const room = (o: Order) => goals.farmPlots(s, Math.max(0, goals.sowByOf(o) - s.day)).free;
      const coins = (o: Order) => goals.sowBudget(s, goals.sowByOf(o));
      // What each still needs sown: its count less what the rules count as met already (round 5 counted crops growing).
      const need = (o: Order) => Math.max(0, o.items[0].n - requestHave(s, { ...o, taken: true }));
      const plotsBoth = need(offer[0]) + need(offer[1]);
      const costBoth = offer.reduce((a, o) => a + need(o) * CROPS[o.items[0].crop].seed, 0);
      if (plotsBoth > Math.max(...offer.map(room)) || costBoth > Math.max(...offer.map(coins))) compete++;
    }
    expect(pairs).toBeGreaterThan(40);
    expect(compete / pairs).toBeGreaterThan(0.8);
  });
});

describe('P2: losses are counted, and a request that fails says why', () => {
  it('a crop a crow takes by day is on the morning card with the night’s', () => {
    const s = farm(71, { coins: 200 });
    s.learn.push('lesson:pests');
    for (let x = 2; x < 6; x++) plant(s, x, 7, 'carrot', 2);
    for (const p of s.plots) if (p.crop) p.wet = true;
    stand(s, 18, 3, 's');
    s.minute = 400;
    s.crows.push({ id: s.nextId++, x: 3, y: 7, fromX: -3, fromY: 4, phase: 'peck', t: 0 });
    const ev: SimEvent[] = [];
    for (let i = 0; i < 30 * 20 && !ev.some((e) => e.type === 'crowEat'); i++) ev.push(...step(s, 1 / 30));
    expect(ev.some((e) => e.type === 'crowEat')).toBe(true);
    expect(plots(s, 3, 7).crop).toBeNull();
    nightfall(s, []);
    expect(s.report?.eaten).toBe(1);
    expect(hud.morningNews(s)).toMatch(/[Cc]rows ate 1/);
  });

  // Round 7: a request with crops still growing for it stays and pays for what it gets, so this one has only one
  // lettuce sown for it, on its last day for planting; the crow leaves it nothing, and it goes there and then.
  it('a taken request whose crops crows ate, past its sow-by day, is withdrawn with that cause, and the card says so', () => {
    const s = farm(73, { coins: 0, day: 6 });
    s.learn.push('lesson:pests');
    const o: Order = { id: s.nextId++, who: 'Old Tamsin', items: [{ crop: 'lettuce', n: 4 }], reward: 260, rep: 1, due: 10, sowBy: 6, made: 6, seen: true, kind: 'easy', got: 0 };
    s.orders = [o];
    plant(s, 3, 7, 'lettuce', 0);
    (goals as { claimCrops?: (s: WorldState) => void }).claimCrops?.(s);
    expect(requestHave(s, o)).toBe(1);
    for (const p of s.plots) if (p.crop) p.wet = true;
    // A crow takes it by day.
    stand(s, 18, 3, 's');
    s.minute = 400;
    s.crows.push({ id: s.nextId++, x: 3, y: 7, fromX: -3, fromY: 4, phase: 'peck', t: 0 });
    for (let i = 0; i < 30 * 20 && plots(s, 3, 7).crop; i++) step(s, 1 / 30);
    expect(plots(s, 3, 7).crop).toBeNull();
    // Past its last day for planting with nothing growing for it: it goes, and the morning card says why.
    s.coins = 0;
    s.day = 7;
    nightfall(s, []);
    const w = s.report?.withdrawn?.[0] as { why?: string; lost?: number } | undefined;
    expect(w?.why).toBe('crows');
    expect(w?.lost).toBe(1);
    // (Round 7: once, not twice: "Crows ate 1, Old Tamsin found lettuces elsewhere (crows ate 1)" said it twice.)
    expect(hud.morningNews(s)).toMatch(/Old Tamsin found lettuces elsewhere/);
  });

  it('bugs left overnight: the card says how far they spread', () => {
    const s = farm(79, { coins: 200 });
    for (let x = 2; x < 6; x++) plant(s, x, 7, 'carrot', 2);
    for (const p of s.plots) if (p.crop) p.wet = true;
    plots(s, 3, 7).crop!.bugs = 1;
    nightfall(s, []);
    expect(s.report?.spread ?? 0).toBeGreaterThanOrEqual(2);
    expect(hud.morningNews(s)).toMatch(/[Bb]ugs spread to \d+ crops/);
  });
});

describe('P2: lines about bare soil wait for bare soil, and point at it', () => {
  function sown(lessons: string[], day: number, coins: number, fields = 1): WorldState {
    const s = farm(83, { coins, day, fields, lessons });
    s.learnCount['done:pests'] = day - 2;
    s.learnCount['done:forecast'] = day - 1;
    s.learnCount['done:scarecrow'] = day - 2;
    for (const i of fieldTiles(s)) plant(s, i % s.W, Math.floor(i / s.W), 'carrot', 1);
    return s;
  }
  const lines = (s: WorldState, t: Tutor) => {
    const out: string[] = [];
    for (let i = 0; i < 10; i++) out.push(t.update(s, 0.1, true).line);
    return out;
  };

  it('the scarecrow line, every plot sown: none; a plot cleared: the line, pointing at it', () => {
    const s = sown([...EARLY, 'requests', 'deliver', 'choose', 'pests', 'bugs', 'field', 'turn', 'smith', 'wide', 'stamina'], 9, 200);
    const t = new Tutor();
    expect(lines(s, t)).not.toContain('Build a scarecrow on bare soil.');
    plots(s, 4, 7).crop = null;
    const out = t.update(s, 0.1, true);
    expect(out.line).toBe('Build a scarecrow on bare soil.');
    expect(out.point).toEqual({ x: 4.5, y: 7.5 });
  });

  it('the sprinkler line likewise', () => {
    const s = sown([...EARLY, 'requests', 'deliver', 'choose', 'pests', 'scarecrow', 'forecast', 'bugs', 'field', 'turn', 'smith', 'wide', 'stamina', 'hoe'], 12, 400, 2);
    const t = new Tutor();
    expect(lines(s, t)).not.toContain('Build a sprinkler to water around it.');
    plots(s, 3, 6).crop = null;
    expect(t.update(s, 0.1, true).line).toBe('Build a sprinkler to water around it.');
  });

  it('"Spring ends soon. Plant summer seeds." waits for bare soil and points at it (its chevron sat on a bug)', () => {
    const s = sown([...EARLY, 'requests', 'deliver', 'choose', 'pests', 'scarecrow', 'forecast', 'sprinkler', 'bugs', 'field', 'smith', 'wide', 'stamina', 'hoe'], 8, 200);
    plots(s, 2, 5).crop!.bugs = 0;
    const t = new Tutor();
    expect(lines(s, t)).not.toContain('Spring ends soon. Plant summer seeds.');
    plots(s, 5, 8).crop = null;
    const out = t.update(s, 0.1, true);
    expect(out.line).toBe('Spring ends soon. Plant summer seeds.');
    expect(out.point).toEqual({ x: 5.5, y: 8.5 });
  });
});

describe('P2: a wet morning says what it is for', () => {
  it('the card on a rainy morning says what is sown today needs no water', () => {
    const s = farm(89);
    s.weather = 'rain';
    s.report = { day: 5, sold: [{ crop: 'radish', n: 4, value: 120 }], wages: 0, grew: 0, withered: 0, eaten: 0, crewWork: 0, income: 120 };
    expect(hud.morningNews(s)).toBe('Yesterday you sold 4 for 120, what you plant today needs no water.');
    s.weather = 'sun';
    expect(hud.morningNews(s)).toBe('Yesterday you sold 4 for 120.');
  });
});
