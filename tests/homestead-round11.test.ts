// Round 11: "It is calm and works, but nothing is at stake." One full year on a phone: "Harvest 4 carrots" stayed up from
// Spring 7 to 9 with none ripe, and six lessons landed on Spring 9; five ribbons of five came from just accepting offers;
// coins flooded and ribbons were only decoration once the fields were bought; Summer 1 to 7 had no pair; tapping the
// farmer to stop missed 8 times of 8; the scarecrow lesson took soil a request needed; the note said "+180 in all" and the
// toast "+90 coins".
//
// These read the farm through the simulation's commands, the lessons, the UI's pure helpers, a careful bot and a player
// who follows the lessons. New helpers are reached through their modules (`?.`), so on the committed round 10 code the
// tests fail on their assertions, not on imports.
import { describe, expect, it } from 'vitest';
import { Tutor } from '../src/games/homestead/lessons';
import * as actions from '../src/sim/actions';
import * as actors from '../src/sim/actors';
import { CROPS } from '../src/sim/crops';
import { nightfall } from '../src/sim/day';
import * as goals from '../src/sim/goals';
import { acceptRequest, clearOf, fillRequests, offerRequests, settleRequests } from '../src/sim/goals';
import { step } from '../src/sim/step';
import { plant, plots } from '../src/sim/world';
import type { Command } from '../src/sim/commands';
import type { Order, SimEvent, Tap, WorldState } from '../src/sim/types';
import * as dialogs from '../src/ui/dialogs';
import * as hud from '../src/ui/hud';
import { EARLY, EARLY_FEATURES, follow, play, stand, teach, world } from './helpers';

const ALL = [...EARLY, 'requests', 'sowfor', 'deliver', 'choose', 'fair', 'pests', 'scarecrow', 'forecast', 'sprinkler', 'bugs', 'field', 'turn', 'smith', 'wide', 'hoe', 'stamina', 'sweep'];
const FEATURES = [...EARLY_FEATURES, 'stamina', 'board', 'requests', 'fair', 'pests', 'build', 'sprinkler', 'forecast', 'hoe', 'smith', 'fields', 'seedtab', 'wide'];

type FairLike = { start: number; day: number; want: number; got: number };
const fairOf = (s: WorldState) => (s as WorldState & { fair?: FairLike | null }).fair ?? null;
const h = hud as typeof hud & { stopShown?: (s: WorldState, was?: boolean) => boolean; STOP_TAPS?: number };
const a = actors as typeof actors & { dragJob?: (s: WorldState, x: number, y: number) => boolean; dragStarts?: (s: WorldState, x: number, y: number) => boolean };
const g = goals as typeof goals & { requestCrops?: (s: WorldState, day?: number) => string[]; takenFor?: (f: FairLike, o: Order) => boolean };
const act = actions as typeof actions & { marketPrice?: (s: WorldState, crop: string, q?: number) => number };

/** A farm past its lessons: `fields` fields owned and hoed, `coins` in hand, nothing growing. */
function farm(seed: number, opts: { fields?: number; coins?: number; day?: number; lessons?: string[]; rep?: number } = {}): WorldState {
  const s = teach(world('sunup', seed), opts.lessons ?? ALL, opts.lessons ? EARLY_FEATURES : FEATURES);
  s.day = opts.day ?? 6;
  s.rep = opts.rep ?? 3;
  s.requested = 1;
  s.orders = [];
  s.coins = opts.coins ?? 400;
  s.forecast = ['sun', 'sun', 'sun'];
  s.weather = 'sun';
  s.crowPlan = [];
  s.held = false;
  for (let i = 1; i < (opts.fields ?? 1); i++) {
    const p = s.parcels[i];
    p.owned = true;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) plots(s, x, y).tilled = true;
  }
  for (const p of s.plots) p.crop = null;
  return s;
}

const taken = (s: WorldState, crop: Order['items'][0]['crop'], n: number, opts: Partial<Order> = {}): Order => ({ id: s.nextId++, who: 'Old Tamsin', items: [{ crop, n }], reward: n * CROPS[crop].price + 90, rep: 1, due: s.day + 6, sowBy: s.day, made: s.day, takenOn: s.day, seen: true, kind: 'easy', taken: true, got: 0, from: s.nextId, ...opts } as Order);

/** Crops sown for a request at the first free plots of the first field. */
function sown(s: WorldState, o: Order, n: number, age: number, x0 = 2, y = 5): void {
  for (let k = 0; k < n; k++) {
    plant(s, x0 + (k % 4), y + Math.floor(k / 4), o.items[0].crop, age);
    plots(s, x0 + (k % 4), y + Math.floor(k / 4)).crop!.for = o.id;
  }
}

/** Run the tutor over some frames, folding its unlocks into the farm, and collect the lines. */
function run(t: Tutor, s: WorldState, frames: number, dt = 0.1): string[] {
  const lines: string[] = [];
  for (let k = 0; k < frames; k++) {
    const out = t.update(s, dt, true);
    for (const c of out.cmds) if (c.type === 'unlock' && !s.learn.includes(c.what)) s.learn.push(c.what);
    if (out.line && lines[lines.length - 1] !== out.line) lines.push(out.line);
  }
  return lines;
}

describe('P1: the Harvest line', () => {
  const lessons = [...EARLY, 'requests', 'sowfor', 'choose', 'stamina', 'fair', 'field', 'wide', 'hoe', 'turn'];

  it('shows only while a crop for the request is ripe: 0 ripe and 16 growing says nothing (it stayed up from Spring 7 to 9)', () => {
    const s = farm(11, { day: 8, lessons, rep: 0 });
    const o = taken(s, 'carrot', 4);
    s.orders = [o];
    sown(s, o, 4, 2);
    const t = new Tutor();
    expect(run(t, s, 20).filter((l) => /^Harvest/.test(l))).toEqual([]);
    // Ripe: the line, naming how many, pointing at one.
    for (let x = 2; x < 6; x++) Object.assign(plots(s, x, 5).crop!, { age: 5, stage: 4 });
    const out = t.update(s, 0.1, true);
    expect(out.line).toBe('Harvest 4 carrots planted for the request.');
    expect(out.point).toEqual({ x: expect.any(Number), y: 5.5 });
    expect(out.line.split(/\s+/).length).toBeLessThanOrEqual(8);
  });

  it('never for ripe market carrots: a crop planted before Accept does not count, and the line does not say it does', () => {
    const s = farm(13, { day: 8, lessons, rep: 0 });
    for (let x = 2; x < 6; x++) plant(s, x, 5, 'carrot', 5);
    const o = taken(s, 'carrot', 4);
    s.orders = [o];
    sown(s, o, 4, 2, 2, 6);
    goals.claimCrops(s);
    expect(goals.ripeFor(s, o)).toEqual([]);
    expect(run(new Tutor(), s, 20).filter((l) => /^Harvest/.test(l))).toEqual([]);
  });

  it('ends at the first request filled, with another still open (a pair each morning meant one always was)', () => {
    const s = farm(17, { day: 8, lessons, rep: 0 });
    const o = taken(s, 'carrot', 4);
    const other = taken(s, 'radish', 3, { due: s.day + 5 });
    s.orders = [o, other];
    sown(s, o, 4, 5);
    const t = new Tutor();
    expect(t.update(s, 0.1, true).line).toMatch(/^Harvest 4 carrots/);
    stand(s, 3, 4, 's');
    // Picks all four: the crate ships the request, and the line goes at once, with the other request still open.
    const ev: SimEvent[] = [];
    for (let x = 2; x < 6; x++) {
      Object.assign(s.actors[0], { task: null });
      ev.push(...step(s, 0.01, [{ type: 'tool', tool: 'hands' }, { type: 'actAt', x, y: 5 } as Command]));
      for (let k = 0; k < 40; k++) ev.push(...step(s, 0.05, []));
    }
    expect(s.orders.includes(o)).toBe(false);
    expect(s.orders.includes(other)).toBe(true);
    t.update(s, 0.1, true);
    expect(s.learn).toContain('lesson:deliver');
    expect(t.update(s, 0.1, true).line).not.toMatch(/^Harvest/);
  });

  it('the board says which crops count until the first request is filled', () => {
    const src = (dialogs as unknown as { Dialogs: { prototype: { renderBoard?: unknown } } }).Dialogs.prototype.renderBoard;
    expect(String(src)).toMatch(/Only what you plant after Accept counts/);
  });
});

describe('P2: one new thing a day', () => {
  it('with the field, the turn, the smith and View all ready, one comes a day; a crow still cuts in', () => {
    const s = farm(19, { day: 8, fields: 1, coins: 1500, lessons: [...EARLY, 'requests', 'sowfor', 'choose', 'deliver', 'stamina', 'fair'], rep: 3 });
    s.learn.push('pests', 'board', 'requests');
    // Bare soil for the turn line.
    const t = new Tutor();
    const arrivals: Record<number, string[]> = {};
    const seen = new Set<string>();
    for (const day of [8, 9, 10, 11]) {
      s.day = day;
      s.minute = 60;
      s.coins = 1500;
      for (let k = 0; k < 120; k++) {
        const out = t.update(s, 0.1, true);
        for (const c of out.cmds) if (c.type === 'unlock' && !s.learn.includes(c.what)) s.learn.push(c.what);
        for (const [id, re] of [['field', /Buy a second/], ['turn', /ends soon/], ['smith', /smith/], ['wide', /whole farm/]] as const) {
          if (re.test(out.line) && !seen.has(id)) {
            seen.add(id);
            (arrivals[day] ??= []).push(id);
          }
        }
        // Does what the line says: buys the field, hoes it, reads the board.
        if (/Buy a second/.test(out.line) && !s.parcels[1].owned) {
          s.parcels[1].owned = true;
          s.learn.push('hoe');
          for (let y = s.parcels[1].y; y < s.parcels[1].y + 4; y++) for (let x = s.parcels[1].x; x < s.parcels[1].x + 4; x++) plots(s, x, y).tilled = true;
        }
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
    for (const [day, ids] of Object.entries(arrivals)) expect(ids.length, `day ${day}: ${ids.join(', ')}`).toBe(1);
    // A crow is no new thing to wait for: it cuts in over whatever is up.
    s.day = 12;
    s.learn = s.learn.filter((w) => w !== 'lesson:pests');
    s.crows.push({ id: 900, x: 3, y: 5, fromX: -3, fromY: 4, phase: 'peck', t: 0 });
    plant(s, 3, 5, 'carrot', 2);
    expect(t.update(s, 0.1, true).line).toMatch(/^A crow is on your/);
  });

  it('a lesson-following player: at most one new calm line a day over the first fifteen days', () => {
    // (Measured line by line in scripts/qa/sunup-first15.mjs; here the Tutor's own record of when each new thing arrived.)
    for (const seed of [42, 1055, 2068, 3081]) {
      const s = world('sunup', seed);
      s.held = false;
      follow(s, 15, { pick: 'clear', greedy: false });
      const byDay = new Map<number, string[]>();
      for (const [k, day] of Object.entries(s.learnCount)) if (k.startsWith('arrived:')) byDay.set(day, [...(byDay.get(day) ?? []), k.slice(8)]);
      for (const [day, ids] of byDay) expect(ids.length, `seed ${seed}, day ${day}: ${ids.join(', ')}`).toBe(1);
      // The first day's loop and the day it all reads as one (the board, the pair, its seed) stand apart from that.
      expect(byDay.size).toBeGreaterThanOrEqual(5);
    }
  }, 30000);
});

describe('P2: the fair can be lost', () => {
  const season = () => {
    const s = farm(23, { day: 13, fields: 2, coins: 900 });
    s.fair = { start: 11, day: 20, want: 2, got: 0 };
    return s;
  };

  it('a request taken before the season began does not count (summer’s 3 were all taken in spring)', () => {
    const s = season();
    const o = taken(s, 'sunflower', 4, { takenOn: 9, made: 9, got: 4, due: 16 });
    s.orders = [o];
    settleRequests(s, []);
    expect(s.orders.length).toBe(0);
    expect(fairOf(s)!.got).toBe(0);
  });

  it('a request taken this season and filled in full counts', () => {
    const s = season();
    const o = taken(s, 'sunflower', 4, { takenOn: 12, made: 12, got: 4, due: 19 });
    s.orders = [o];
    settleRequests(s, []);
    expect(fairOf(s)!.got).toBe(1);
  });

  it('a short fill does not count ("took 4 of 6" counted), and the fair’s card says so', () => {
    const s = season();
    const o = taken(s, 'sunflower', 6, { takenOn: 12, made: 12, got: 4, due: 13 });
    s.orders = [o];
    settleRequests(s, []);
    expect(s.orders.length).toBe(0);
    expect(fairOf(s)!.got).toBe(0);
    s.day = 20;
    nightfall(s, []);
    expect(s.report?.fair).toMatchObject({ got: 0, won: false, short: 1 });
    const card = dialogs.fairCard(s, s.report!.fair!, 21);
    expect(card.lines).toContain('1 request came up short.');
    for (const l of card.lines) expect(l.split(/\s+/).length).toBeLessThanOrEqual(10);
  });

  it('the board says in one line what it wants; a win past it no longer reads "4 of 3"', () => {
    const s = season();
    // (Round 12: in eight words or fewer, "taken this season, in full" counted requests filled.)
    expect(dialogs.fairLines(s)).toEqual(['Fair Summer 10: 0 of 2 filled.']);
    const card = dialogs.fairCard(s, { got: 4, want: 3, won: true, taken: 4 }, 21);
    expect(card.lines.join(' ')).not.toMatch(/4 of 3/);
    expect(card.lines).toContain('4 requests filled in full. It wanted 3.');
  });

  it('an offer that cannot ripen by the fair says so; nothing says it counts for a later fair', () => {
    const s = farm(29, { day: 15, fields: 2, coins: 900 });
    s.fair = { start: 11, day: 20, want: 2, got: 0 };
    const corn: Order = { id: s.nextId++, who: 'Pell’s pickles', items: [{ crop: 'corn', n: 3 }], reward: 400, rep: 1, due: 24, sowBy: 16, made: 15, seen: false, kind: 'single', taken: false };
    s.orders = [corn];
    const lines = dialogs.noteText(s, corn).lines.join(' ');
    expect(lines).toMatch(/Too late for the fair/);
    expect(lines).not.toMatch(/For the (autumn|winter|spring|summer) fair/);
  });

  it('over 12 farms, a player following the lessons wins the first two fairs most of the time, and not every autumn', () => {
    const fairs: { day: number; won: boolean }[] = [];
    for (let i = 0; i < 12; i++) {
      const s = world('sunup', 42 + i * 1013);
      s.held = false;
      fairs.push(...follow(s, 41, { pick: 'clear', greedy: false }).fairs);
    }
    const first = fairs.filter((f) => f.day <= 20);
    expect(first.length).toBe(24);
    expect(first.filter((f) => f.won).length / first.length).toBeGreaterThanOrEqual(0.75);
    // Reachable, and not a formality: it can be lost (the eleventh playtest won five of five by accepting offers).
    const all = fairs.filter((f) => f.won).length / fairs.length;
    expect(all).toBeGreaterThanOrEqual(0.65);
    expect(all).toBeLessThan(1);
  }, 60000);

  it('over 12 farms, a careful bot wins most of its fairs, not all', () => {
    let won = 0;
    let held = 0;
    for (let i = 0; i < 12; i++) {
      const s = world('sunup', 42 + i * 1013);
      s.held = false;
      const seen = new Set<unknown>();
      play(s, 41, { pace: 1.3, dt: 0.1, after: (st) => {
        const r = st.report;
        if (r && !seen.has(r)) {
          seen.add(r);
          if (r.fair) {
            held++;
            if (r.fair.won) won++;
          }
        }
      } });
    }
    expect(held).toBe(48);
    expect(won / held).toBeGreaterThanOrEqual(0.6);
    // (Round 12: "In time for the fair" is now judged from the first day an offer's seed can go in, so the careful bot,
    // which takes the side in time, is no longer misled by it: 40 of 48 became 45. Still not a formality.)
    expect(won / held).toBeLessThanOrEqual(0.95);
  }, 240000);
});

describe('P2: a ribbon with no field to discount', () => {
  const allFields = () => {
    const s = farm(31, { day: 20, fields: 6, coins: 900, rep: 12 });
    s.fair = { start: 11, day: 20, want: 2, got: 2 };
    return s;
  };

  it('with every field bought, requests pay a tenth more from then on, and its card says so', () => {
    const s = allFields();
    const price = (st: WorldState) => {
      st.requested = 2;
      st.lastOffer = '';
      return offerRequests(st).map((o) => o.reward - o.items[0].n * CROPS[o.items[0].crop].price);
    };
    const without = allFields();
    without.fair = null;
    nightfall(s, []);
    expect(s.report?.fair).toMatchObject({ won: true, prize: 'pay' });
    const after = allFields();
    (after as WorldState & { prizes?: number }).prizes = 1;
    after.fair = null;
    const base = price(without);
    const more = price(after);
    expect(base.length).toBe(more.length);
    for (let k = 0; k < base.length; k++) expect(more[k]).toBeGreaterThanOrEqual(base[k] * 1.05);
    expect(dialogs.fairCard(s, s.report!.fair!, 21).lines).toContain('Its prize: requests pay a tenth more.');
  });

  it('with a discount already waiting, the second ribbon brings the lasting prize too', () => {
    const s = farm(37, { day: 20, fields: 3, rep: 5 });
    s.fair = { start: 11, day: 20, want: 2, got: 2 };
    s.fieldOff = 0.2;
    nightfall(s, []);
    expect((s as WorldState & { prizes?: number }).prizes).toBe(1);
  });

  it('with a field to buy, it is still a fifth off that field', () => {
    const s = farm(41, { day: 20, fields: 3, rep: 5 });
    s.fair = { start: 11, day: 20, want: 2, got: 2 };
    nightfall(s, []);
    expect(s.report?.fair).toMatchObject({ won: true, prize: 'field' });
    expect(s.fieldOff).toBe(0.2);
  });

  it('a farm of five or six fields fills the market: the crate pays less for what is not for a request, in full for what is', () => {
    const big = farm(43, { fields: 6, coins: 0 });
    const small = farm(43, { fields: 4, coins: 0 });
    expect(act.marketPrice?.(small, 'corn')).toBe(CROPS.corn.price);
    expect(act.marketPrice?.(big, 'corn')).toBe(Math.round(CROPS.corn.price * 0.8));
    const o = taken(big, 'corn', 2);
    big.orders = [o];
    sown(big, o, 2, 7);
    plant(big, 2, 6, 'corn', 7);
    const ev: SimEvent[] = [];
    actions.perform(big, big.actors[0], actions.resolve(big, 'hands', 2, 5), 2, 5, ev);
    expect(big.coins).toBe(CROPS.corn.price);
    actions.perform(big, big.actors[0], actions.resolve(big, 'hands', 2, 6), 2, 6, ev);
    expect(big.coins).toBe(CROPS.corn.price + Math.round(CROPS.corn.price * 0.8));
  });
});

describe('P2: summer has pairs', () => {
  const summerFarm = (seed: number, day: number) => {
    const s = farm(seed, { day, fields: 2, coins: 1200, rep: 4 });
    s.fair = { start: 11, day: 20, want: 2, got: 2 };
    return s;
  };

  it('from Summer 1 to 7, with room for one, a pair every morning (none had one: "only corn can go in now")', () => {
    let mornings = 0;
    let pairs = 0;
    const named = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      for (let day = 11; day <= 17; day++) {
        const s = summerFarm(seed * 37 + day, day);
        s.lastOffer = '';
        const got = offerRequests(s);
        mornings++;
        if (got.length === 2) pairs++;
        for (const o of got) named.add(o.items[0].crop);
      }
    }
    expect(pairs / mornings).toBeGreaterThanOrEqual(0.9);
    // More than the two a request could name.
    expect(named.size).toBeGreaterThanOrEqual(3);
  });

  it('with one crop to name, two offers of it that differ by risk: a rush, bigger, against an easy one', () => {
    let same = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = summerFarm(seed * 41, 17);
      s.lastOffer = '';
      const got = offerRequests(s);
      if (got.length !== 2 || got[0].items[0].crop !== got[1].items[0].crop) continue;
      same++;
      const rush = got.find((o) => o.kind === 'rush')!;
      const easy = got.find((o) => o.kind === 'easy')!;
      expect(rush.items[0].n).toBeGreaterThan(easy.items[0].n);
      expect(goals.slackOf(rush)).toBe(0);
      expect(goals.slackOf(easy)).toBeGreaterThanOrEqual(1);
      expect(clearOf(rush)).toBeGreaterThan(clearOf(easy));
    }
    expect(same).toBeGreaterThanOrEqual(8);
  });

  it('a request names a regrowing crop only when fewer than three others can go in, and its note says it picks again', () => {
    const spring = farm(47, { day: 3 });
    expect(g.requestCrops?.(spring)).not.toContain('beans');
    const summer = farm(47, { day: 12 });
    expect(g.requestCrops?.(summer)).toContain('beans');
    const beans: Order = { id: summer.nextId++, who: 'Old Tamsin', items: [{ crop: 'beans', n: 4 }], reward: 330, rep: 1, due: 18, sowBy: 12, made: 12, seen: false, kind: 'quick', taken: false };
    summer.orders = [beans];
    // (Round 12: and that it holds its plots all season.)
    expect(dialogs.noteText(summer, beans).lines[0]).toBe('for 4 plots all season, picks again');
  });

  it('over 12 farms a lesson-following player sees a pair on 70% or more of mornings with room for one', () => {
    let room = 0;
    let pairs = 0;
    let summer = 0;
    for (let i = 0; i < 12; i++) {
      const s = world('sunup', 42 + i * 1013);
      s.held = false;
      const r = follow(s, 31, { pick: 'clear', greedy: false });
      for (const m of r.mornings) {
        // (No room for one: no soil, no seed money, or as many taken as the farm carries.)
        if (m.why === 'soil' || m.why === 'coins' || m.why === 'full') continue;
        room++;
        if (m.offers === 2) {
          pairs++;
          if (m.day >= 11 && m.day <= 20) summer++;
        }
      }
    }
    expect(pairs / room).toBeGreaterThanOrEqual(0.7);
    expect(summer).toBeGreaterThan(12 * 3);
  }, 60000);
});

describe('P2: a drag across plots', () => {
  const row = (s: WorldState, crop: Order['items'][0]['crop'], age: number) => {
    for (let x = 2; x < 6; x++) plant(s, x, 5, crop, age);
  };
  const drag = (x: number, y: number): Command => ({ type: 'actAt', x, y, drag: true }) as Command;

  it('queues each plot it crosses that has a job for the tool in hand, and only those', () => {
    const s = farm(53, { day: 4, coins: 500 });
    row(s, 'radish', 3);
    plots(s, 3, 5).crop!.age = 1;
    plots(s, 3, 5).crop!.stage = 1;
    stand(s, 2, 4, 's');
    s.tool = 'hands';
    step(s, 0.01, [drag(2, 5), drag(3, 5), drag(4, 5), drag(5, 5), drag(6, 5)]);
    const planned = [s.actors[0].task ? `${s.actors[0].task.x},${s.actors[0].task.y}` : '', ...(s.taps ?? []).map((t) => `${t.x},${t.y}`)].filter(Boolean);
    // (3,5) is not ripe, (6,5) is a path.
    expect(planned).toEqual(['2,5', '4,5', '5,5']);
    for (let k = 0; k < 200; k++) step(s, 0.05, []);
    expect(plots(s, 2, 5).crop).toBeNull();
    expect(plots(s, 4, 5).crop).toBeNull();
    expect(plots(s, 5, 5).crop).toBeNull();
    expect(plots(s, 3, 5).crop).not.toBeNull();
  });

  it('with seeds in hand it plants the bare plots it crosses, and picks and replants a ripe one', () => {
    const s = farm(59, { day: 4, coins: 100 });
    plant(s, 2, 6, 'radish', 3);
    stand(s, 2, 4, 's');
    s.tool = 'seeds';
    s.seed = 'radish';
    step(s, 0.01, [drag(2, 5), drag(3, 5), drag(2, 6)]);
    for (let k = 0; k < 300; k++) step(s, 0.05, []);
    expect(plots(s, 2, 5).crop?.kind).toBe('radish');
    expect(plots(s, 3, 5).crop?.kind).toBe('radish');
    expect(plots(s, 2, 6).crop?.age).toBe(0);
    expect(s.stats.harvested.radish).toBe(1);
  });

  it('out of coins, the seeds a drag queued say so, and plant no more', () => {
    const s = farm(59, { day: 4, coins: 15 });
    stand(s, 2, 4, 's');
    s.tool = 'seeds';
    s.seed = 'radish';
    const ev: SimEvent[] = [];
    ev.push(...step(s, 0.01, [drag(2, 5), drag(3, 5), drag(4, 5)]));
    for (let k = 0; k < 100; k++) ev.push(...step(s, 0.05, []));
    expect(plots(s, 2, 5).crop?.kind).toBe('radish');
    expect(plots(s, 3, 5).crop).toBeNull();
    expect(ev.filter((e) => e.type === 'deny' && /cost/.test(e.reason)).length).toBeGreaterThanOrEqual(1);
  });

  it('a plot whose job has gone (the copper can watered its row) is passed over, with no walk and no word', () => {
    const s = farm(61, { day: 4, coins: 100, fields: 2 });
    s.tools.can = 1;
    s.water = 24;
    row(s, 'carrot', 1);
    for (let x = 2; x < 6; x++) Object.assign(plots(s, x, 5), { wet: false, moisture: 0 });
    stand(s, 2, 4, 's');
    s.tool = 'can';
    const ev: SimEvent[] = [];
    ev.push(...step(s, 0.01, [drag(2, 5), drag(3, 5), drag(4, 5), drag(5, 5)]));
    for (let k = 0; k < 100; k++) ev.push(...step(s, 0.05, []));
    for (let x = 2; x < 6; x++) expect(plots(s, x, 5).wet).toBe(true);
    expect(ev.filter((e) => e.type === 'deny')).toEqual([]);
    expect(s.taps ?? []).toEqual([]);
    expect(ev.filter((e) => e.type === 'water').length).toBe(4);
  });

  it('a drag starts only on a plot a tap would work: a press anywhere else stays the stick or a pan', () => {
    const s = farm(67, { day: 4, coins: 100 });
    row(s, 'radish', 3);
    s.tool = 'hands';
    expect(a.dragStarts?.(s, 2, 5)).toBe(true);
    // The path, bare soil with the hands, a field for sale: no job.
    expect(a.dragStarts?.(s, 6, 5)).toBe(false);
    expect(a.dragStarts?.(s, 2, 7)).toBe(false);
    expect(a.dragStarts?.(s, 7, 5)).toBe(false);
  });

  it('the lesson says it in the words of each device, in eight words or fewer', () => {
    const s = teach(world('sunup', 71), [...EARLY, 'requests', 'choose', 'sowfor', 'deliver', 'fair'], EARLY_FEATURES);
    s.learn = s.learn.filter((w) => w !== 'lesson:sweep');
    s.day = 4;
    s.requested = 1;
    s.orders = [];
    s.held = false;
    s.weather = 'sun';
    s.crowPlan = [];
    for (const p of s.plots) p.crop = null;
    for (let x = 2; x < 6; x++) {
      plant(s, x, 5, 'carrot', 1);
      plots(s, x, 5).wet = false;
    }
    expect(new Tutor().update(s, 0.1, true).line).toBe('Drag across plots to work them all.');
    expect(new Tutor().update(s, 0.1, false).line).toBe('Hold Space and walk.');
    // Done already: it passes quietly.
    s.learnCount.sweep = 3;
    expect(new Tutor().update(s, 0.1, false).line).not.toBe('Hold Space and walk.');
  });
});

describe('P2: Stop', () => {
  const tap = (x: number, y: number): Tap => ({ x, y, tool: 'can' });

  it('comes at three taps waiting, stays until they have gone, and never on a farm with fewer', () => {
    const s = farm(73);
    s.taps = [tap(2, 5), tap(3, 5)];
    expect(h.stopShown?.(s)).toBe(false);
    s.taps.push(tap(4, 5));
    expect(h.stopShown?.(s)).toBe(true);
    s.taps = [tap(2, 5)];
    expect(h.stopShown?.(s, true)).toBe(true);
    s.taps = [];
    expect(h.stopShown?.(s, true)).toBe(false);
  });
});

describe('P2: the scarecrow lesson leaves soil a request needs', () => {
  const morning = (bare: number) => {
    const lessons = [...EARLY, 'requests', 'sowfor', 'deliver', 'choose', 'stamina', 'pests', 'fair', 'field', 'wide', 'hoe', 'turn'];
    const s = farm(79, { day: 11, coins: 900, lessons, rep: 1 });
    s.learn.push('pests');
    s.learnCount['done:pests'] = 10;
    let left = bare;
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) {
      if (left > 0) {
        left--;
        continue;
      }
      plant(s, x, y, 'radish', 1);
    }
    return s;
  };

  it('holds while the requests taken want all the bare soil there is (Plant 1 more today, and the Build line took the plot)', () => {
    const s = morning(1);
    const o = taken(s, 'carrot', 1, { sowBy: s.day, due: s.day + 5 });
    s.orders = [o];
    expect(run(new Tutor(), s, 10).filter((l) => /scarecrow/.test(l))).toEqual([]);
  });

  it('comes once soil is free beyond what they want', () => {
    const s = morning(3);
    const o = taken(s, 'carrot', 1, { sowBy: s.day, due: s.day + 5 });
    s.orders = [o];
    expect(run(new Tutor(), s, 10)).toContain('Build a scarecrow on bare soil.');
  });
});

describe('P2: one figure for one payment', () => {
  it('filled in full: the note’s "+N in all" is the toast’s', () => {
    const s = farm(83, { day: 8, coins: 0 });
    const o = taken(s, 'carrot', 3, { reward: 3 * CROPS.carrot.price + 90 });
    s.orders = [o];
    const said = dialogs.noteText(s, o).lines[0];
    const m = /\+([\d,]+) in all/.exec(said)!;
    o.got = 3;
    const ev: SimEvent[] = [];
    goals.deliverReady(s, ev);
    const paid = ev.find((e) => e.type === 'request') as Extract<SimEvent, { type: 'request' }> & { clear?: number };
    expect(paid.clear).toBe(Number(m[1].replace(/,/g, '')));
    expect(paid.clear).not.toBe(paid.reward);
  });

  it('short: the note’s figure is the toast’s too', () => {
    const s = farm(89, { day: 8, coins: 0 });
    const o = taken(s, 'carrot', 4, { reward: 4 * CROPS.carrot.price + 120, due: s.day, sowBy: s.day - 6, got: 3 });
    o.lost = { crows: 1 };
    s.orders = [o];
    const said = dialogs.noteText(s, o).lines[0];
    const m = /\+([\d,]+) in all/.exec(said)!;
    const ev: SimEvent[] = [];
    settleRequests(s, ev);
    const paid = ev.find((e) => e.type === 'request') as Extract<SimEvent, { type: 'request' }> & { clear?: number };
    expect(paid.clear).toBe(Number(m[1].replace(/,/g, '')));
  });
});

describe('P3: copy', () => {
  it('the clash line says coins ("Both need 255 of seed" said no such thing)', () => {
    const line = dialogs.clashWords({ kind: 'coins', need: 255, have: 200, coins: 200 });
    expect(line).toBe('Both need 255 coins. You have 200.');
    expect(line.split(/\s+/).length).toBeLessThanOrEqual(8);
  });

  it('the bug line uses the rack’s word ("Take the hands." was awkward)', () => {
    const lessons = [...EARLY, 'requests', 'sowfor', 'deliver', 'choose', 'stamina', 'pests', 'fair', 'field', 'wide', 'hoe', 'turn', 'scarecrow', 'forecast', 'sprinkler', 'smith'];
    const s = farm(97, { day: 8, lessons });
    s.learn.push('pests');
    plant(s, 3, 5, 'lettuce', 1);
    plots(s, 3, 5).crop!.bugs = 1;
    s.tool = 'can';
    expect(new Tutor().update(s, 0.1, true).line).toBe('Tap Hands. Pick bugs off the lettuces.');
  });

  it('sleep asks nothing with no job left at 6:06 am, and still asks with a job left or a note unread', () => {
    const s = farm(101, { day: 8 });
    s.minute = 6;
    expect(actions.sleepAsk(s, { teaching: false, flock: false, owedToday: 0 }).ask).toBe(false);
    plant(s, 3, 5, 'lettuce', 4);
    expect(actions.sleepAsk(s, { teaching: false, flock: false, owedToday: 0 }).ask).toBe(true);
    plots(s, 3, 5).crop = null;
    expect(actions.sleepAsk(s, { teaching: false, flock: false, owedToday: 0, unread: 2 } as Parameters<typeof actions.sleepAsk>[1]).ask).toBe(true);
  });

  it('a request sown in full but not ripe by its day names that, not "too few planted in time"', () => {
    const s = farm(103, { day: 10, coins: 0 });
    const o = taken(s, 'carrot', 3, { due: 10, sowBy: 5, takenOn: 5, made: 5 });
    s.orders = [o];
    // All three planted, a dry night behind: three days old on their last day.
    sown(s, o, 3, 3);
    const report: Parameters<typeof settleRequests>[2] = { day: 10, sold: [], wages: 0, grew: 0, withered: 0, eaten: 0, crewWork: 0, income: 0 };
    settleRequests(s, [], report);
    expect(report!.lapsed?.[0].why).toBe('behind');
    expect(hud.failWords('behind' as never, 0)).toBe('not ripe in time');
    // Too few planted still says that.
    const t = farm(107, { day: 10, coins: 0 });
    const q = taken(t, 'carrot', 3, { due: 12, sowBy: 5, takenOn: 5, made: 5 });
    t.orders = [q];
    sown(t, q, 1, 2);
    expect(goals.whyNot(t, q)).toBe('late');
    expect(hud.failWords('late', 0)).toBe('too few planted in time');
  });

  it('every lesson line stays eight words or fewer, and never says sow', async () => {
    const { allLines } = await import('../src/games/homestead/lessons');
    const s = farm(109);
    for (const l of allLines(s)) {
      expect(l.split(/\s+/).length, l).toBeLessThanOrEqual(8);
      expect(l).not.toMatch(/\bsow\b/i);
    }
  });
});

describe('keeps round 10 whole', () => {
  it('a pair every morning still reaches the fair: both sides can ripen by it with mornings to spare', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = farm(seed * 113, { day: 12, fields: 2, coins: 900 });
      s.fair = { start: 11, day: 20, want: 3, got: 0 };
      fillRequests(s, true);
      const offers = s.orders.filter((o) => o.taken === false);
      expect(offers.length).toBe(2);
      for (const o of offers) expect(o.due, `${o.items[0].crop}`).toBeLessThanOrEqual(20);
    }
  });

  it('accepting keeps the day it was taken', () => {
    const s = farm(127, { day: 12, fields: 2, coins: 900 });
    s.fair = { start: 11, day: 20, want: 3, got: 0 };
    fillRequests(s, true);
    const o = s.orders.find((q) => q.taken === false)!;
    acceptRequest(s, o.id, []);
    expect(o.takenOn).toBe(12);
    expect(g.takenFor?.(s.fair as FairLike, o)).toBe(true);
  });
});
