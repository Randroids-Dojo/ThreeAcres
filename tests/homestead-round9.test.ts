// Round 9: "It is calm and works, but it is a sum, not a choice. By
// mid-summer I was taking the bigger number and sleeping by noon." The board's
// pairs headlined their gain over market, so the bold side nearly always had
// the bigger number; "16 planted" counted market radishes sown before Accept,
// beside a partner stamped "No room"; nothing on screen gave a reason to keep
// going after day 16; Spring 4 to 7 had nothing to decide; a paid lesson ate
// the coins an offer needed; the clash line's coins were not the coin box's;
// the deliver line came with nothing ripe; a count line lagged; the whole-farm
// line came back in the whole-farm view; the scarecrow lesson taught a corner.
//
// These read the farm through the simulation's commands, the lessons and the
// UI's pure helpers. New helpers are reached through their modules (`?.`), so
// on the committed round 8 code the tests fail on their assertions, not on
// imports.
import { describe, expect, it } from 'vitest';
import * as lessons from '../src/games/homestead/lessons';
import { Tutor } from '../src/games/homestead/lessons';
import * as actions from '../src/sim/actions';
import * as actors from '../src/sim/actors';
import { CROP_IDS, CROPS, inSeason } from '../src/sim/crops';
import { nightfall } from '../src/sim/day';
import * as goals from '../src/sim/goals';
import { offerRequests, requestHave, whyNot } from '../src/sim/goals';
import { PARCELS } from '../src/sim/map';
import { step } from '../src/sim/step';
import { plant, plots, season } from '../src/sim/world';
import type { Command } from '../src/sim/commands';
import type { CropId, Order, SimEvent, ToolId, WorldState } from '../src/sim/types';
import * as describeUi from '../src/ui/describe';
import * as dialogs from '../src/ui/dialogs';
import * as hud from '../src/ui/hud';
import { EARLY, EARLY_FEATURES, stand, teach, world } from './helpers';

const ALL = [...EARLY, 'requests', 'sowfor', 'deliver', 'choose', 'pests', 'scarecrow', 'forecast', 'sprinkler', 'bugs', 'field', 'turn', 'smith', 'wide', 'hoe', 'stamina'];
const FEATURES = [...EARLY_FEATURES, 'stamina', 'board', 'requests', 'pests', 'build', 'sprinkler', 'forecast', 'hoe', 'smith', 'fields', 'seedtab', 'wide'];

type Trade = { clear: number; plots: number; days: number };
const g = goals as typeof goals & {
  tradeOf?: (o: Order) => Trade;
  dominates?: (a: Trade, b: Trade) => boolean;
  fairWant?: (s: WorldState, day: number) => number;
  fairNow?: (s: WorldState) => { start: number; day: number; want: number; got: number } | null;
};
type Fair = { start: number; day: number; want: number; got: number };
const fairOf = (s: WorldState) => (s as WorldState & { fair?: Fair | null }).fair ?? null;

/** A farm past its lessons: `fields` fields owned and hoed, `coins` in hand, nothing growing. */
function farm(seed: number, opts: { fields?: number; coins?: number; day?: number; lessons?: string[] } = {}): WorldState {
  const s = teach(world('sunup', seed), opts.lessons ?? ALL, FEATURES);
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

/** Owned field plots, as indices. */
function fieldTiles(s: WorldState): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.plots.length; i++) if (s.tiles[i] === 'field' && s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned) out.push(i);
  return out;
}
const bare = (s: WorldState) => fieldTiles(s).filter((i) => !s.plots[i].crop && !s.builds.some((b) => b.y * s.W + b.x === i));

/** Farm states across the year: one to three fields, purses from 60 to 3,000, some soil sown, sometimes seed owed. */
function* states(): Generator<WorldState> {
  let seed = 1;
  for (const fields of [1, 2, 3]) for (const coins of [60, 150, 400, 1200, 3000]) for (const day of [4, 6, 8, 13, 15, 24, 26, 34, 36]) for (const variant of [0, 1, 2]) {
    const s = farm(seed++ * 7919, { fields, coins, day });
    const kinds = CROP_IDS.filter((c) => CROPS[c].regrow === 0 && inSeason(c, season(day)));
    const tiles = fieldTiles(s);
    if (variant >= 1) tiles.slice(0, Math.floor(tiles.length / 3)).forEach((i, k) => plant(s, i % s.W, Math.floor(i / s.W), kinds[k % kinds.length], 1));
    if (variant === 2) tiles.slice(Math.floor(tiles.length / 3), Math.floor(tiles.length / 2)).forEach((i, k) => plant(s, i % s.W, Math.floor(i / s.W), kinds[(k + 1) % kinds.length], CROPS[kinds[(k + 1) % kinds.length]].days));
    yield s;
  }
}

/** The board's lines for one side, read from the note itself: what it clears, its plots and its days. */
const tradeRead = (o: Order): Trade => ({ clear: o.reward - o.items[0].n * CROPS[o.items[0].crop].seed, plots: o.items[0].n, days: CROPS[o.items[0].crop].days });
const wins = (a: Trade, b: Trade) => a.clear >= b.clear && a.plots <= b.plots && a.days <= b.days;

describe('P1: a pair is a trade read at a glance', () => {
  it('each offer headlines what it clears, then its plots and days, in the same lines on both notes', () => {
    let pairs = 0;
    for (const s of states()) {
      const offer = offerRequests(s);
      if (offer.length !== 2) continue;
      s.orders.push(...offer);
      pairs++;
      const notes = offer.map((o) => dialogs.noteText(s, o));
      for (const [k, o] of offer.entries()) {
        const t = tradeRead(o);
        expect(notes[k].head).toBe(`+${t.clear.toLocaleString('en-US')}`);
        expect(notes[k].lines[0]).toBe(`for ${t.plots} plots, ${t.days} days`);
        expect(notes[k].lines.join(' ')).not.toMatch(/over market|planted/);
      }
      expect(notes[0].lines.length).toBe(notes[1].lines.length);
      expect((notes[0] as { cls?: string[] }).cls).toEqual((notes[1] as { cls?: string[] }).cls);
    }
    expect(pairs).toBeGreaterThan(100);
  });

  it('no pair has a side that clears as much on as few plots in as few days (one is quicker or smaller, the other bigger)', () => {
    let pairs = 0;
    let dominated = 0;
    for (const s of states()) {
      for (let k = 0; k < 3; k++) {
        const offer = offerRequests(s);
        if (offer.length !== 2) break;
        pairs++;
        // As the board shows them: the headline's number, the plots and the crop's days (round 8's headline was the gain
        // over market, so the side with the bigger number often also took fewer plots and fewer days).
        s.orders.push(...offer);
        const shown = offer.map((o) => ({ ...tradeRead(o), clear: Number(/[\d,]+/.exec(dialogs.noteText(s, o).head)![0].replace(/,/g, '')) }));
        s.orders = s.orders.filter((o) => !offer.includes(o));
        if (wins(shown[0], shown[1]) || wins(shown[1], shown[0])) dominated++;
        const [a, b] = offer.map(tradeRead);
        // The rules say the same.
        expect(g.dominates?.(a, b) ?? false).toBe(wins(a, b));
        // The next morning's offer, the pair let go.
        s.lastOffer = goals.offerKey(offer.map((o) => o.items[0].crop));
      }
    }
    expect(pairs).toBeGreaterThan(200);
    expect(dominated).toBe(0);
    // The first pair of a new farm too: small, cheap, and a trade.
    for (let seed = 1; seed <= 30; seed++) {
      const s = teach(world('sunup', seed * 31), EARLY, EARLY_FEATURES);
      s.day = 3;
      for (const p of s.plots) p.crop = null;
      s.learn.push('requests');
      step(s, 0.016);
      expect(s.orders.length, `seed ${seed}`).toBe(2);
      const [a, b] = s.orders.map(tradeRead);
      expect(wins(a, b) || wins(b, a), JSON.stringify([a, b])).toBe(false);
    }
  });

  it('only crops planted after Accept count ("18 radishes, 16 planted" counted market radishes)', () => {
    let checked = 0;
    for (const s of states()) {
      const offer = offerRequests(s);
      if (offer.length !== 2) continue;
      s.orders.push(...offer);
      const [a] = offer;
      const crop = a.items[0].crop;
      // Market crops of its kind, planted after it was pinned and before Accept.
      const spots = bare(s).slice(0, 2);
      if (spots.length < 2 || s.coins < 2 * CROPS[crop].seed) continue;
      for (const i of spots) plant(s, i % s.W, Math.floor(i / s.W), crop, 0);
      expect(requestHave(s, a)).toBe(0);
      expect(dialogs.noteText(s, a).lines.join(' ')).not.toMatch(/planted/);
      for (const i of spots) s.plots[i].crop = null;
      if (whyNot(s, a)) continue;
      for (const i of spots) plant(s, i % s.W, Math.floor(i / s.W), crop, 0);
      step(s, 0.016, [{ type: 'accept', id: a.id }]);
      const taken = s.orders.find((o) => o.id === a.id);
      if (!taken || taken.taken === false) {
        for (const i of spots) s.plots[i].crop = null;
        continue;
      }
      expect(requestHave(s, taken), `${taken.items[0].n} ${crop} on day ${s.day}`).toBe(0);
      // Planted after Accept: those count.
      const after = bare(s)[0];
      if (after === undefined || crop === undefined || !actions.sowing(s.day, crop).ok) continue;
      plant(s, after % s.W, Math.floor(after / s.W), crop, 0);
      goals.claimCrops(s);
      expect(requestHave(s, taken)).toBe(1);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('never a side the board would stamp "No room" or "Need": offers no longer fitting are made again as the board is read', () => {
    let stale = 0;
    let shown = 0;
    let unmet = 0;
    for (const s of states()) {
      const offer = offerRequests(s);
      if (!offer.length) continue;
      s.orders.push(...offer);
      // As pinned, every side can be met.
      for (const o of offer) expect(whyNot(s, o), `${o.items[0].n} ${o.items[0].crop} day ${s.day}`).toBe('');
      // Then market seed fills the soil before the board is read (the ninth playtest's Summer 9 and Autumn 3).
      const kind = CROP_IDS.find((c) => actions.sowing(s.day, c).ok && CROPS[c].regrow === 0) as CropId;
      for (const i of bare(s).slice(0, Math.ceil(bare(s).length * 0.7))) plant(s, i % s.W, Math.floor(i / s.W), kind, 0);
      if (s.orders.some((o) => o.taken === false && whyNot(s, o))) stale++;
      // The board is read.
      step(s, 0, [{ type: 'freshen' } as unknown as Command]);
      for (const o of s.orders.filter((q) => q.taken === false)) {
        shown++;
        if (whyNot(s, o)) unmet++;
      }
    }
    expect(stale).toBeGreaterThan(50);
    expect(shown).toBeGreaterThan(50);
    expect(unmet).toBe(0);
  });
});

describe('P1: the season’s fair', () => {
  it('the first Accept sets the fair; requests filled count; on its day, a ribbon and a fifth off the next field', () => {
    const s = farm(11, { day: 3, coins: 400, lessons: [...EARLY, 'requests'] });
    s.rep = 0;
    s.requested = 0;
    fillOrders(s);
    expect(s.orders.length).toBe(2);
    step(s, 0.016, [{ type: 'accept', id: s.orders[0].id }]);
    const f = fairOf(s);
    expect(f).toBeTruthy();
    expect(f!.start).toBe(3);
    expect(f!.day).toBe(10);
    expect(f!.want).toBe(g.fairWant?.(s, s.day));
    // A request filled by the crate counts.
    const o = s.orders.find((q) => q.taken !== false)!;
    o.got = o.items[0].n;
    for (const p of s.plots) if (p.crop?.for === o.id) p.crop = null;
    goals.settleRequests(s, []);
    expect(fairOf(s)!.got).toBe(1);
    // On the fair's night, met: a ribbon, and the next field a fifth cheaper.
    s.day = 10;
    fairOf(s)!.got = fairOf(s)!.want;
    nightfall(s, []);
    expect(s.report?.fair).toEqual({ got: f!.want, want: f!.want, won: true });
    expect((s as WorldState & { ribbons?: number }).ribbons).toBe(1);
    const price = (actions as { fieldPrice?: (s: WorldState, id: number) => number }).fieldPrice?.(s, 1);
    expect(price).toBe(Math.round((PARCELS[1].price * 0.8) / 50) * 50);
    expect(hud.morningNews(s)).toMatch(/^The fair gave you a ribbon/);
    // A new season, a new fair, which wants what this farm can do now.
    expect(fairOf(s)).toMatchObject({ start: 11, day: 20, got: 0 });
    // Bought with the prize, the field costs a fifth less, once.
    s.coins = 1000;
    step(s, 0.016, [{ type: 'buyParcel', id: 1 }]);
    expect(s.coins).toBe(1000 - price!);
    expect((actions as { fieldPrice?: (s: WorldState, id: number) => number }).fieldPrice?.(s, 2)).toBe(PARCELS[2].price);
  });

  it('missed, it says how close it came; the fair wants more as the farm grows', () => {
    const s = farm(13, { day: 3 });
    s.rep = 0;
    s.requested = 0;
    fillOrders(s);
    step(s, 0.016, [{ type: 'accept', id: s.orders[0].id }]);
    s.day = 10;
    fairOf(s)!.got = 1;
    nightfall(s, []);
    expect(s.report?.fair?.won).toBe(false);
    expect(hud.morningNews(s)).toMatch(new RegExp(`^No ribbon at the fair, 1 of ${s.report?.fair?.want} requests`));
    const want = [1, 2, 3, 4, 5, 6].map((n) => {
      const t = farm(17, { fields: n, day: 21 });
      return g.fairWant?.(t, 21) ?? 0;
    });
    for (let k = 1; k < want.length; k++) expect(want[k]).toBeGreaterThan(want[k - 1]);
    expect(want[0]).toBeGreaterThanOrEqual(2);
  });

  it('taught in one line once the first request is planted, with one quiet line on the day card', () => {
    const s = farm(19, { day: 3, lessons: [...EARLY, 'requests'] });
    s.rep = 0;
    s.requested = 0;
    const t = new Tutor();
    fillOrders(s);
    step(s, 0.016, [{ type: 'accept', id: s.orders[0].id }]);
    // Planted for: the line to plant for it goes, and the fair's comes (on a day nothing else new came).
    const o = s.orders.find((q) => q.taken !== false)!;
    for (const i of bare(s).slice(0, o.items[0].n)) plant(s, i % s.W, Math.floor(i / s.W), o.items[0].crop, 0);
    goals.claimCrops(s);
    let line = '';
    for (let k = 0; k < 40 && !/fair/.test(line); k++) line = t.update(s, 0.1, true).line;
    expect(line).toMatch(/^The fair wants \d+ requests by Spring 10\.$/);
    expect(line.split(/\s+/).length).toBeLessThanOrEqual(8);
    for (let k = 0; k < 60; k++) for (const c of t.update(s, 0.1, true).cmds) if (c.type === 'unlock' && !s.learn.includes(c.what)) s.learn.push(c.what);
    expect(s.learn).toContain('fair');
    expect((hud as { fairShort?: (s: WorldState) => string }).fairShort?.(s)).toMatch(/^Fair Spring 10: 0 of \d+$/);
    // The board's notes say whether each offer comes in time for it.
    fillOrders(s, true);
    const offers = s.orders.filter((o) => o.taken === false);
    for (const o of offers) expect(dialogs.noteText(s, o).lines.join(' ')).toMatch(/(In time for|After) the fair/);
  });
});

/** Pin requests as a morning does. */
function fillOrders(s: WorldState, morning = false): void {
  if (!s.learn.includes('requests')) s.learn.push('requests');
  goals.fillRequests(s, morning);
}

describe('the first fifteen minutes: a real choice by Spring 3', () => {
  it('the board’s first offer is a small pair, and a second pair can come the morning after one is taken', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = teach(world('sunup', seed * 101), EARLY, EARLY_FEATURES);
      s.day = 3;
      s.learn.push('requests');
      step(s, 0.016);
      expect(s.orders.length, `seed ${seed}`).toBe(2);
      for (const o of s.orders) expect(o.items[0].n).toBeLessThanOrEqual(5);
      // Taken, the morning after brings another pair to choose between (Spring 4 to 7 had nothing to decide).
      step(s, 0.016, [{ type: 'accept', id: s.orders[0].id }]);
      for (const p of s.plots) if (p.crop && p.crop.stage < 4) p.crop.age = Math.max(p.crop.age, 0);
      nightfall(s, []);
      expect(s.orders.filter((o) => o.taken === false).length, `seed ${seed}`).toBe(2);
    }
  });
});

describe('P2: lessons around paid lessons and offers', () => {
  it('a paid lesson waits while an offer wants the coins (the scarecrow took 40 of 120 on the morning an offer needed 60)', () => {
    const s = farm(23, { day: 12, coins: 120 });
    s.learn = s.learn.filter((l) => l !== 'lesson:scarecrow' && l !== 'lesson:forecast' && l !== 'lesson:sprinkler' && l !== 'build');
    s.learnCount['done:pests'] = 11;
    const o: Order = { id: s.nextId++, who: 'Old Tamsin', items: [{ crop: 'sunflower', n: 3 }], reward: 3 * CROPS.sunflower.price + 90, rep: 1, due: 20, sowBy: 13, made: 12, seen: false, kind: 'easy', taken: false };
    s.orders = [o];
    plant(s, 2, 5, 'sunflower', 1);
    const t = new Tutor();
    expect(t.update(s, 0.1, true).line).not.toMatch(/scarecrow/);
    s.coins = 200;
    expect(new Tutor().update(s, 0.1, true).line).toBe('Build a scarecrow on bare soil.');
  });

  it('new requests on the board say so on the morning card (the Summer 1 offer came with only a badge)', () => {
    const s = farm(29, { fields: 2, coins: 900, day: 4 });
    nightfall(s, []);
    expect(s.orders.filter((o) => o.taken === false).length).toBeGreaterThan(0);
    expect(hud.morningNews(s)).toMatch(/(two new requests|a new request) on the board/i);
  });

  it('the deliver line waits until a crop sown for the request is ripe (from Spring 7 it came with none ripe)', () => {
    const s = farm(31, { day: 7, lessons: [...EARLY, 'requests', 'sowfor', 'choose'] });
    const o: Order = { id: s.nextId++, who: 'Old Tamsin', items: [{ crop: 'radish', n: 3 }], reward: 140, rep: 1, due: 10, sowBy: 7, made: 6, seen: true, kind: 'easy', taken: true, got: 0, from: s.nextId } as Order;
    s.orders = [o];
    for (const x of [2, 3, 4]) plant(s, x, 5, 'radish', 1);
    goals.claimCrops(s);
    const t = new Tutor();
    let line = '';
    for (let k = 0; k < 20; k++) line = t.update(s, 0.1, true).line || line;
    expect(line).not.toMatch(/crate ships/);
    for (const x of [2, 3, 4]) plots(s, x, 5).crop!.age = 3;
    for (const x of [2, 3, 4]) plots(s, x, 5).crop!.stage = 4;
    const t2 = new Tutor();
    let line2 = '';
    for (let k = 0; k < 5; k++) line2 = t2.update(s, 0.1, true).line || line2;
    expect(line2).toBe('Harvest 3 radishes. The crate ships them.');
  });

  it('a count line goes the instant its count is met ("Plant 1 more radish" stayed about 3 s after the third went in)', () => {
    const s = farm(37, { day: 4, lessons: [...EARLY, 'requests', 'choose'] });
    const o: Order = { id: s.nextId++, who: 'Old Tamsin', items: [{ crop: 'radish', n: 3 }], reward: 140, rep: 1, due: 9, sowBy: 5, made: 4, seen: true, kind: 'easy', taken: true, got: 0, from: s.nextId } as Order;
    s.orders = [o];
    const t = new Tutor();
    expect(t.update(s, 0.1, true).line).toBe('Plant 3 radishes for the request.');
    for (const x of [2, 3]) plant(s, x, 5, 'radish', 0);
    goals.claimCrops(s);
    expect(t.update(s, 0.1, true).line).toBe('Plant 1 more radish for the request.');
    plant(s, 4, 5, 'radish', 0);
    goals.claimCrops(s);
    expect(t.update(s, 0.1, true).line).not.toMatch(/for the request/);
  });

  it('the whole-farm line never comes in the whole-farm view (it came back after the crow line)', () => {
    const s = farm(41, { fields: 2, day: 9, lessons: ALL.filter((l) => l !== 'wide') });
    s.learn = s.learn.filter((l) => l !== 'wide');
    s.rules.camera = 'wide';
    const t = new Tutor();
    for (let k = 0; k < 20; k++) expect(t.update(s, 0.1, true).line).not.toMatch(/whole farm/);
    expect(s.learn).toContain('lesson:wide');
  });

  it('the scarecrow lesson waits for a bare plot in the middle of a field (it built at a corner)', () => {
    const s = farm(43, { day: 12, coins: 300 });
    s.learn = s.learn.filter((l) => l !== 'lesson:scarecrow' && l !== 'lesson:forecast' && l !== 'lesson:sprinkler' && l !== 'build');
    s.learnCount['done:pests'] = 11;
    // Field 1 full but for its corner.
    for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) if (!(x === 5 && y === 8)) plant(s, x, y, 'radish', 1);
    expect(new Tutor().update(s, 0.1, true).line).not.toMatch(/scarecrow/);
    plots(s, 3, 6).crop = null;
    const out = new Tutor().update(s, 0.1, true);
    expect(out.line).toBe('Build a scarecrow on bare soil.');
    expect(out.point).toEqual({ x: 3.5, y: 6.5 });
  });
});

describe('P2: the clash line, the crate and the cards', () => {
  it('the clash line’s coins are the coin box’s, with what is ripe beside them ("You have 255, plus 265 ripe.")', () => {
    let said = 0;
    for (const s of states()) {
      const offer = offerRequests(s);
      if (offer.length !== 2) continue;
      s.orders.push(...offer);
      const c = goals.clashOf(s, offer[0], offer[1]);
      if (!c || c.kind !== 'coins') continue;
      const words = dialogs.clashWords(c);
      const m = /You have ([\d,]+)(?:, plus ([\d,]+) ripe)?/.exec(words);
      expect(m, words).toBeTruthy();
      expect(Number(m![1].replace(/,/g, ''))).toBe(s.coins);
      said++;
    }
    expect(said).toBeGreaterThan(5);
    // The tester's own: 255 in the box, 265 ripe.
    expect(dialogs.clashWords({ kind: 'coins', need: 705, have: 520, coins: 255, ripe: 265, owed: 0 } as never)).toBe('Both need 705 of seed. You have 255, plus 265 ripe.');
  });

  it('a request whose crops are all in the crate is handed over at once, by day (no Deliver stamp to find)', () => {
    const s = farm(47, { coins: 0 });
    const o: Order = { id: s.nextId++, who: 'Mabel’s bakery', items: [{ crop: 'radish', n: 2 }], reward: 2 * CROPS.radish.price + 40, rep: 1, due: 9, sowBy: 6, made: 6, seen: true, kind: 'easy', taken: true, got: 0 };
    s.orders = [o];
    for (const x of [2, 3]) {
      plant(s, x, 6, 'radish', 3);
      plots(s, x, 6).crop!.for = o.id;
    }
    s.tool = 'hands';
    const ev: SimEvent[] = [];
    for (const x of [2, 3]) {
      stand(s, x, 5, 's');
      ev.push(...step(s, 0.016, [{ type: 'act' }]));
      for (let k = 0; k < 20; k++) ev.push(...step(s, 1 / 30));
    }
    expect(s.orders.some((q) => q.id === o.id)).toBe(false);
    expect(s.coins).toBe(2 * CROPS.radish.price + 40);
    expect(ev.some((e) => e.type === 'request' && e.done && e.id === o.id)).toBe(true);
  });

  it('next season’s seed cards show their days, and the morning card says the crate already paid', () => {
    const s = teach(world('sunup'), EARLY, EARLY_FEATURES);
    s.day = 8;
    expect(describeUi.seedNote(s, 'sunflower').when).toBe('Summer, 6 days');
    s.report = { day: 7, sold: [{ crop: 'radish', n: 4, value: 220 }], wages: 0, grew: 0, withered: 0, eaten: 0, crewWork: 0, income: 220 };
    expect(hud.morningNews(s)).toBe('Yesterday you sold 4 for 220.');
  });
});

describe('P2: holding Space while walking works every plot it passes', () => {
  // A zigzag watering pass left 4 of 11 dry on a desktop. The input repeats a held key every twentieth of a second
  // after the first fifth (its own timing, copied here); the walk waits for the work beside it.
  it('east along a row, down, and west between two rows: all twelve thirsty plots are watered, with either can', () => {
    for (const lvl of [0, 1]) for (const speed of [1, 0.7]) {
      const s = farm(53, { day: 6 });
      s.minute = 60;
      for (let x = 2; x < 6; x++) for (const y of [5, 6, 8]) {
        plant(s, x, y, 'carrot', 1);
        plots(s, x, y).wet = false;
        plots(s, x, y).moisture = 0;
      }
      s.tools.can = lvl;
      s.water = 40;
      s.tool = 'can';
      stand(s, 1, 4, 'e');
      const dt = 1 / 60;
      let held = 0;
      const walk = (mx: number, my: number, until: () => boolean) => {
        for (let k = 0; k < 1200 && !until(); k++) {
          held += dt;
          const cmds: Command[] = [{ type: 'move', x: mx, y: my }];
          if (held > 0.22) {
            held = 0.17;
            cmds.push({ type: 'act', held: true });
          }
          s.stamina = s.staminaMax;
          step(s, dt, cmds);
        }
      };
      const f = s.actors[0];
      step(s, dt, [{ type: 'act' }]);
      walk(speed, 0, () => f.x >= 6.5);
      walk(0, speed, () => f.y >= 7.5);
      walk(-speed, 0, () => f.x <= 1.5);
      const dry: string[] = [];
      for (let x = 2; x < 6; x++) for (const y of [5, 6, 8]) if (!plots(s, x, y).wet) dry.push(`${x},${y}`);
      expect(dry, `can ${lvl}, stick ${speed}`).toEqual([]);
    }
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

describe('property: a seed tap on a ripe crop, queued behind harvests, picks it and plants', () => {
  // The ninth playtest saw one seed click on a ripe lettuce, queued behind a harvest, never run (a later can click
  // there harvested it and left the plot bare). Not reproduced: over these farms every such tap picks and plants.
  it('over 300 farms of ripe lettuces and radishes, quick taps and tool and seed changes', () => {
    const problems: string[] = [];
    let seedTaps = 0;
    for (let k = 0; k < 300; k++) {
      const r = lcg(77 + k * 13);
      const s = farm(900 + k, { day: [2, 6, 8, 9, 22][k % 5], coins: 3000 });
      s.minute = 0;
      const tiles: [number, number][] = [];
      const pc = s.parcels[0];
      for (let y = pc.y; y < pc.y + pc.h; y++) for (let x = pc.x; x < pc.x + pc.w; x++) tiles.push([x, y]);
      for (const [x, y] of tiles) {
        const v = r();
        if (v >= 0.25) plant(s, x, y, v < 0.6 ? 'lettuce' : 'radish', 4);
      }
      stand(s, 4, 4, 's');
      s.tool = 'hands';
      const tapped: { x: number; y: number; tool: ToolId; seed: CropId; t: number; ripe?: number }[] = [];
      const ev: { e: SimEvent; t: number }[] = [];
      let t = 0;
      const dt = 1 / 30;
      for (let i = 0; i < 25; i++) {
        const cmds: Command[] = [];
        const v = r();
        if (v < 0.15) cmds.push({ type: 'tool', tool: (['hands', 'seeds', 'can'] as ToolId[])[Math.floor(r() * 3)] });
        else if (v < 0.25) cmds.push({ type: 'seed', crop: (['radish', 'lettuce', 'carrot'] as CropId[])[Math.floor(r() * 3)] });
        else {
          const [x, y] = tiles[Math.floor(r() * tiles.length)];
          const c = plots(s, x, y).crop;
          tapped.push({ x, y, tool: actors.tapTool(s, s.tool, x, y), seed: s.seed, t, ripe: c && c.stage === 4 ? c.id : undefined });
          cmds.push({ type: 'actAt', x, y });
        }
        for (let gap = 0.1 + r() * 0.3, d = 0; d < gap; d += dt) {
          s.stamina = s.staminaMax;
          for (const e of step(s, dt, d === 0 ? cmds : [])) ev.push({ e, t });
          t += dt;
        }
      }
      for (let d = 0; d < 25; d += dt) {
        s.stamina = s.staminaMax;
        for (const e of step(s, dt)) ev.push({ e, t });
        t += dt;
      }
      for (const q of tapped) {
        if (q.tool !== 'seeds' || q.ripe === undefined || !actions.sowing(s.day, q.seed).ok) continue;
        seedTaps++;
        const at = ev.filter(({ e, t: et }) => et >= q.t && 'x' in e && (e as { x: number }).x === q.x && (e as { y: number }).y === q.y);
        const done = at.some(({ e }) => e.type === 'plant' || e.type === 'deny');
        if (!done && plots(s, q.x, q.y).crop?.id === q.ripe) problems.push(`farm ${k}: ${q.seed} tap on the ripe crop at ${q.x},${q.y} did nothing`);
      }
    }
    expect(seedTaps).toBeGreaterThan(200);
    expect(problems, problems.slice(0, 5).join('\n')).toEqual([]);
  });
});

void lessons;
