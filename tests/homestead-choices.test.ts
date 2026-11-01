// Round 3, P1: requests never competed, and most were met before they were
// read. Of the tester's ten, eight asked for crops already growing; one on
// day 8 wanted 900 coins of corn seed from a farm with 35, showed "9 days
// left" when it had to be sown by day 10, and stayed on the board for a week
// after it could no longer be met. Pay was market and at most 60 over.
// Now, after the first three radishes, each morning with room offers two
// requests and only one of them can be met. Each needs fresh sowing, fits
// what the farm can raise by its sow-by day, shows that day, pays 1.4 to 1.6
// times market, and is withdrawn (with a word on the morning card) once it
// can no longer be met.
// Round 4: the two of a pair no longer have to overflow the soil or the
// purse together (that made each ask for most of the farm, and full farms got
// none): only one of a pair can be taken, by rule, and seed sown for one
// withdraws the other at once, with a word. Each pays 1.3 to 1.8 times market
// for what it has you sow, so the two earn the same for each plot and day.
//
// Round 5: planting no longer takes a request (the fifth playtest's market
// planting took one nobody had read): the player accepts one of a pair on
// the board, and the other goes. The two differ in kind, so an easy request
// keeps up to two days to spare and a rush none, and the gain over market is
// set by the soil and days it asks for, not by a share of market.
//
// These tests read the farm only through what the committed rules had too
// (fillRequests, the orders on the board, nightfall), so on the old code they
// fail on their assertions, not on a missing name.
import { describe, expect, it } from 'vitest';
import { CROP_IDS, CROPS, inSeason } from '../src/sim/crops';
import { nightfall } from '../src/sim/day';
import { sowing } from '../src/sim/actions';
import { fillRequests } from '../src/sim/goals';
import { step } from '../src/sim/step';
import { plant, plots, season } from '../src/sim/world';
import type { CropId, Order, WorldState } from '../src/sim/types';
import { EARLY, EARLY_FEATURES, teach, world } from './helpers';

/**
 * A farm past its first request: `fields` fields owned and hoed, `coins` in
 * hand, an empty crate, and only crops sown today growing (so none of them
 * ripens or frees its plot within a request's sowing days).
 */
function farm(seed: number, opts: { fields?: number; coins?: number; day?: number; growing?: [CropId, number][] } = {}): WorldState {
  const s = teach(world('sunup', seed), [...EARLY, 'requests', 'deliver'], [...EARLY_FEATURES, 'board', 'requests']);
  s.day = opts.day ?? 6;
  s.rep = 1;
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
  let k = 0;
  const bare = bareTiles(s);
  // Sown the day before (a request pinned this morning did not ask for them).
  for (const [crop, n] of opts.growing ?? []) for (let j = 0; j < n && k < bare.length; j++, k++) {
    plant(s, bare[k].x, bare[k].y, crop, 0);
    plots(s, bare[k].x, bare[k].y).crop!.planted = s.day - 1;
  }
  return s;
}

function bareTiles(s: WorldState): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < s.plots.length; i++) {
    if (s.parcelOf[i] < 0 || !s.parcels[s.parcelOf[i]].owned || s.tiles[i] !== 'field') continue;
    if (s.plots[i].crop || s.builds.some((b) => b.y * s.W + b.x === i)) continue;
    out.push({ x: i % s.W, y: Math.floor(i / s.W) });
  }
  return out;
}

const growingOf = (s: WorldState, crop: CropId) => s.plots.filter((p, i) => p.crop && !p.crop.dead && p.crop.kind === crop && s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned).length;
const stockOf = (s: WorldState, crop: CropId) => s.stock[crop].reduce((a, b) => a + b, 0);
/** What a request still needs sown: its count less what the crate and the ground already hold. */
const fresh = (s: WorldState, o: Order) => o.items[0].n - stockOf(s, o.items[0].crop) - growingOf(s, o.items[0].crop);
const seedOf = (o: Order) => CROPS[o.items[0].crop].seed;
const sowByOf = (o: Order) => (o as Order & { sowBy?: number }).sowBy;

/** Sow `n` of a request's crop on bare plots, paying for the seed, and water them so they grow on time. */
function sowFor(s: WorldState, o: Order, n: number): void {
  const bare = bareTiles(s);
  for (let k = 0; k < n; k++) {
    plant(s, bare[k].x, bare[k].y, o.items[0].crop, 0);
    plots(s, bare[k].x, bare[k].y).wet = true;
    plots(s, bare[k].x, bare[k].y).moisture = 2;
    s.coins -= seedOf(o);
  }
}

/** Farms of every size and purse, with a few crops growing, across the year's sowing days. */
function* farms(): Generator<WorldState> {
  let seed = 1;
  for (const fields of [1, 2, 3]) {
    for (const coins of [60, 150, 400, 1200]) {
      for (const day of [4, 6, 13, 16, 24, 26, 34]) {
        const kinds = CROP_IDS.filter((c) => inSeason(c, season(day)));
        const growing: [CropId, number][] = seed % 3 === 0 ? [] : [[kinds[seed % kinds.length], 2 + (seed % 4)]];
        yield farm(seed++ * 7919, { fields, coins, day, growing });
      }
    }
  }
}

describe('a morning offers two requests, and only one can be taken', () => {
  it('two at once, each of which the farm can meet alone', () => {
    let mornings = 0;
    let pairs = 0;
    for (const s of farms()) {
      mornings++;
      fillRequests(s, true);
      if (s.orders.length !== 2) continue;
      pairs++;
      const free = bareTiles(s).length;
      for (const o of s.orders) {
        expect(fresh(s, o), `${o.items[0].n} ${o.items[0].crop}`).toBeLessThanOrEqual(free);
        expect(fresh(s, o) * seedOf(o)).toBeLessThanOrEqual(s.coins);
      }
    }
    // A pair on most mornings; a single request only when only one crop can go in.
    expect(pairs / mornings).toBeGreaterThan(0.75);
  });

  it('accepting one takes it: the other goes at once, with a word (sowing alone takes neither)', () => {
    let checked = 0;
    for (const s of farms()) {
      fillRequests(s, true);
      if (s.orders.length !== 2) continue;
      const [a, b] = s.orders;
      // Seed sown for one of them, for market or not, chooses nothing.
      sowFor(s, a, 1);
      step(s, 0.016);
      expect(s.orders.map((o) => o.id)).toEqual([a.id, b.id]);
      const ev = step(s, 0.016, [{ type: 'accept', id: a.id }]);
      expect(s.orders.map((o) => o.id), `kept ${a.items[0].n} ${a.items[0].crop}`).toContain(a.id);
      expect(s.orders.map((o) => o.id), `withdrew ${b.items[0].n} ${b.items[0].crop}`).not.toContain(b.id);
      expect(ev.some((e) => e.type === 'request' && e.id === b.id && !e.done)).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(40);
  });

  it('one left unsown past its sow-by day is withdrawn the next morning, not left showing days to go', () => {
    for (const day of [5, 13, 22]) {
      const s = farm(77 + day, { fields: 2, coins: 600, day });
      fillRequests(s, true);
      expect(s.orders.length).toBe(2);
      const pinned = s.orders.slice();
      const last = Math.max(...pinned.map((o) => sowByOf(o) ?? Infinity));
      expect(last).toBeLessThan(s.day + 3);
      let withdrawn = 0;
      while (s.day <= last) {
        nightfall(s, []);
        withdrawn += s.report?.withdrawn?.length ?? 0;
        // Each stays up to its own sow-by day and goes the morning after.
        for (const o of pinned) expect(s.orders.some((q) => q.id === o.id), `day ${s.day}, sow by ${sowByOf(o)}`).toBe(sowByOf(o)! >= s.day);
      }
      // Offers nobody took go quietly: the morning card names only requests the player took.
      expect(withdrawn).toBe(0);
      // A taken one left unsown goes the morning after its sow-by day, and the card says so.
      const t = farm(91 + day, { fields: 2, coins: 600, day });
      fillRequests(t, true);
      const taken = t.orders[0];
      step(t, 0.016, [{ type: 'accept', id: taken.id }]);
      let told = 0;
      while (t.day <= sowByOf(taken)!) {
        nightfall(t, []);
        told += t.report?.withdrawn?.length ?? 0;
      }
      expect(t.orders.some((q) => q.id === taken.id)).toBe(false);
      expect(told).toBe(1);
    }
  });
});

describe('each request needs fresh sowing, fits the purse, says when to sow and pays well', () => {
  it('neither of a pair is simply the better deal: what each clears over its seed is within a factor of two of the other', () => {
    let pairs = 0;
    let even = 0;
    for (const s of farms()) {
      fillRequests(s, true);
      if (s.orders.length !== 2) continue;
      pairs++;
      const [a, b] = s.orders.map((o) => o.reward - fresh(s, o) * seedOf(o));
      if (Math.max(a, b) <= 2 * Math.min(a, b)) even++;
    }
    expect(even / pairs).toBeGreaterThan(0.85);
  });

  it('is never for a crop that regrows: its seed pays back over many picks, so one pick would read as a poor deal', () => {
    for (const s of farms()) {
      fillRequests(s, true);
      for (const o of s.orders) expect(CROPS[o.items[0].crop].regrow, o.items[0].crop).toBe(0);
    }
  });

  it('none is met when pinned: each wants at least three more than the crate and the ground hold', () => {
    for (const s of farms()) {
      fillRequests(s, true);
      for (const o of s.orders) expect(fresh(s, o), `${o.items[0].n} ${o.items[0].crop}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('when two crops that are not growing can go in, neither request is for a crop already growing', () => {
    let n = 0;
    for (const s of farms()) {
      fillRequests(s, true);
      for (const o of s.orders) {
        const crop = o.items[0].crop;
        if (growingOf(s, crop) > 0) {
          // Allowed only when fewer than two crops the farm is not growing could go in (in season, ripe in time,
          // three packets affordable, and not wanted by the other request).
          const others = s.orders.filter((q) => q !== o).map((q) => q.items[0].crop);
          const sowable = CROP_IDS.filter((c) => sowing(s.day, c).ok && growingOf(s, c) === 0 && c !== 'pumpkin' && CROPS[c].regrow === 0 && CROPS[c].seed * 3 <= s.coins && !others.includes(c));
          expect(sowable.length, `${crop} asked while ${sowable.join(', ')} could go in`).toBeLessThan(2);
        }
        n++;
      }
    }
    expect(n).toBeGreaterThan(100);
  });

  it('a poor farm is asked for what it can pay for (the day 8 corn wanted 900 coins of seed from 35)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const coins of [35, 50, 80]) {
        const s = farm(seed * 31, { fields: 2, coins, day: 8 + (seed % 3) });
        fillRequests(s, true);
        for (const o of s.orders) expect(fresh(s, o) * seedOf(o), `${o.items[0].n} ${o.items[0].crop} for ${coins}`).toBeLessThanOrEqual(coins);
      }
    }
  });

  it('shows a sow-by day, a day or two off, and is due its crop’s growing time later (and its days to spare), never past its season', () => {
    let n = 0;
    for (const s of farms()) {
      fillRequests(s, true);
      for (const o of s.orders) {
        const sowBy = sowByOf(o);
        expect(sowBy, 'a sow-by day').toBeTypeOf('number');
        expect(sowBy!).toBeGreaterThanOrEqual(s.day);
        expect(sowBy!).toBeLessThanOrEqual(s.day + 2);
        // Due when seed sown on the sow-by day ripens, and its days to spare: none for a rush, up to two for an easy
        // one, one for the rest (less at a season's end).
        const kind = (o as Order & { kind?: string }).kind;
        const grace = kind === 'rush' ? 0 : kind === 'easy' ? 2 : 1;
        expect(o.due).toBeGreaterThanOrEqual(sowBy! + CROPS[o.items[0].crop].days);
        expect(o.due, `${kind}`).toBeLessThanOrEqual(sowBy! + CROPS[o.items[0].crop].days + grace);
        const turn = s.day + (10 - ((s.day - 1) % 10)) - 1;
        if (!inSeason(o.items[0].crop, (season(s.day) + 1) % 4)) expect(o.due).toBeLessThanOrEqual(turn);
        n++;
      }
    }
    expect(n).toBeGreaterThan(100);
  });

  it('pays clearly more than market for what it has you sow (crops already growing at market), so turning one down costs something', () => {
    const ratios: number[] = [];
    for (const s of farms()) {
      fillRequests(s, true);
      for (const o of s.orders) {
        const d = CROPS[o.items[0].crop];
        const base = o.items[0].n - fresh(s, o);
        ratios.push((o.reward - base * d.price) / (d.price * fresh(s, o)));
      }
    }
    // Round 5: the gain is set by the soil and days a request asks for and its kind, so a slow dear crop gains less
    // against its market value than a quick cheap one (it was 1.3 to 1.8 times market).
    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(1.15);
    expect(Math.max(...ratios)).toBeLessThanOrEqual(2);
  });

  it('the first is still three radishes, and nothing more comes until it is filled', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = teach(world('sunup', seed * 13), EARLY, EARLY_FEATURES);
      s.day = 3;
      for (const p of s.plots) p.crop = null;
      s.learn.push('requests');
      step(s, 0.016);
      expect(s.orders.length).toBe(1);
      expect(s.orders[0].items[0]).toEqual({ crop: 'radish', n: 3 });
      expect(s.orders[0].reward / 90).toBeGreaterThanOrEqual(1.4);
      for (let k = 0; k < 3; k++) fillRequests(s, true);
      expect(s.orders.length).toBe(1);
    }
  });

  it('no new pair while one still waits to be chosen; a new pair the morning after one is chosen', () => {
    const s = farm(5, { fields: 2, coins: 900, day: 4 });
    fillRequests(s, true);
    expect(s.orders.length).toBe(2);
    fillRequests(s, true);
    expect(s.orders.length).toBe(2);
    const [a] = s.orders;
    // Sown for, but not chosen: nothing new comes.
    sowFor(s, a, fresh(s, a));
    fillRequests(s, true);
    expect(s.orders.length).toBe(2);
    step(s, 0.016, [{ type: 'accept', id: a.id }]);
    nightfall(s, []);
    // The other went, and a new pair came: the morning's choice again.
    expect(s.orders.some((o) => o.id === a.id)).toBe(true);
    expect(s.orders.length).toBe(3);
  });
});
