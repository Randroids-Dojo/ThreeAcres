// P1: requests were traps. The first wanted 135 coins of strawberry seed the
// day after the lesson said to spend, part of an order was sold overnight,
// and a summer-only request was still "wanted today" in autumn. Now the
// first is a few radishes, what a request needs stays in the crate, nothing
// is due after its crop's season, and a fresh request comes after each one.
import { describe, expect, it } from 'vitest';
import { CROP_IDS, CROPS, inSeason } from '../src/sim/crops';
import { nightfall } from '../src/sim/day';
import { fillRequests, offerRequests, requestHave } from '../src/sim/goals';
import { step } from '../src/sim/step';
import { season } from '../src/sim/world';
import { smithLine } from '../src/ui/dialogs';
import { EARLY, EARLY_FEATURES, teach, world } from './helpers';

/** Day 3, as the lessons leave it: the starting radishes pulled and sold, nothing planted yet. */
function onDay3(seed: number) {
  const s = teach(world('sunup', seed), EARLY, EARLY_FEATURES);
  s.day = 3;
  for (const p of s.plots) p.crop = null;
  return s;
}

describe('the first request', () => {
  // Round 9: a small pair of cheap crops to choose between (it was always three radishes, taken at once).
  it('is a small pair of cheap crops, each due after it can ripen', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = onDay3(seed * 7919);
      s.learn.push('requests');
      step(s, 0.016);
      expect(s.orders.length, `seed ${seed}`).toBe(2);
      for (const o of s.orders) {
        expect(o.items[0].n).toBeLessThanOrEqual(5);
        expect(CROPS[o.items[0].crop].seed).toBeLessThanOrEqual(15);
        expect(o.due - s.day).toBeGreaterThanOrEqual(CROPS[o.items[0].crop].days);
        expect(o.reward).toBeGreaterThan(o.items[0].n * CROPS[o.items[0].crop].price);
      }
    }
  });
});

describe('a request keeps its crops', () => {
  // Round 7: every crop is paid for at market the moment it goes into the crate; the crate counts what was sown for a
  // request, and the request pays its gain over market when it is filled.
  it('the crate counts what was sown for a request (paid at market as it went in), and the request pays its gain when filled', async () => {
    const { plant } = await import('../src/sim/world');
    const s = onDay3(5);
    // (Round 6: only crops sown for it count; two were, and were picked.)
    s.orders = [{ id: 1, who: 'Mabel', items: [{ crop: 'strawberry', n: 3 }], reward: 190, rep: 1, due: 9, got: 2 }];
    // The third is growing and will be ripe in time.
    plant(s, 2, 7, 'strawberry', 4);
    const coins = s.coins;
    nightfall(s, []);
    expect(s.orders.some((o) => o.id === 1)).toBe(true);
    expect(s.coins).toBe(coins);
    // The third arrives: the request is filled that night, for its gain (190 less the market value of three strawberries).
    s.orders[0].got = 3;
    nightfall(s, []);
    expect(s.orders.some((o) => o.id === 1)).toBe(false);
    expect(s.report!.filled).toEqual([{ who: 'Mabel', reward: 190 - 3 * CROPS.strawberry.price }]);
    expect(s.rep).toBe(1);
  });

  it('but not for a request that can no longer be met: holding those would only miss a sale', () => {
    const s = onDay3(5);
    s.orders = [{ id: 1, who: 'Mabel', items: [{ crop: 'strawberry', n: 3 }], reward: 190, rep: 1, due: 5 }];
    s.stock.strawberry[0] = 2;
    nightfall(s, []);
    expect(s.stock.strawberry[0]).toBe(0);
    expect(s.report!.kept).toBeUndefined();
  });
});

describe('requests fit the season', () => {
  it('are never due after their crop’s season ends, and can always be grown in time', () => {
    let made = 0;
    for (let seed = 1; seed <= 12; seed++) {
      for (let day = 1; day <= 40; day++) {
        const s = teach(world('sunup', seed * 31 + day), EARLY, EARLY_FEATURES);
        for (const p of s.plots) p.crop = null;
        s.day = day;
        s.rep = 3;
        s.requested = 5;
        for (let k = 0; k < 3; k++) {
          const o = offerRequests(s)[0];
          if (!o) continue;
          s.orders.push(o);
          made++;
          const crop = o.items[0].crop;
          // The season's last day (ten days a season).
          const turn = day + (10 - ((day - 1) % 10)) - 1;
          if (!inSeason(crop, (season(day) + 1) % 4)) expect(o.due, `${crop} on day ${day}`).toBeLessThanOrEqual(turn);
          // From seed today or already growing: here nothing grows, so it must grow now (or be next season's,
          // sown early in the last three days) and ripen by the due day.
          const sowable = inSeason(crop, season(day)) || (turn - day < 3 && inSeason(crop, (season(day) + 1) % 4));
          expect(sowable, `${crop} on day ${day}`).toBe(true);
          expect(day + CROPS[crop].days).toBeLessThanOrEqual(o.due);
        }
      }
    }
    expect(made).toBeGreaterThan(600);
  });

  // Round 2: requests were constant (a filled one replaced at once, three open from reputation 4). Round 3: one
  // until the first is filled; after that they come with the mornings, a pair at a time, and no new pair while one
  // still waits to be chosen.
  // Round 9: the first is a pair too, and one more pair can come before it is filled.
  it('come a pair at a time, two open until the first is filled, and none while a pair waits', () => {
    const s = onDay3(9);
    s.learn.push('requests');
    step(s, 0.016);
    expect(s.orders.length).toBe(2);
    // Mornings bring nothing more while the pair waits to be chosen.
    for (let k = 0; k < 5; k++) fillRequests(s, true);
    expect(s.orders.length).toBe(2);
    s.orders = [];
    s.rep = 1;
    s.coins = 400;
    step(s, 0.016);
    expect(s.orders.length).toBe(0);
    fillRequests(s, true);
    expect(s.orders.length).toBe(2);
    for (let k = 0; k < 5; k++) fillRequests(s, true);
    expect(s.orders.length).toBe(2);
  });

  // Round 4: in eight words or fewer, and the smith only once his lesson has come.
  it('the board says how far reputation is from the smith’s next tool', () => {
    const s = onDay3(1);
    s.learn.push('hoe');
    expect(smithLine(s)).toBe('Reputation 0. Each request filled adds one.');
    s.learn.push('smith');
    expect(smithLine(s)).toBe('Reputation 0. Two more for a copper hoe.');
    s.rep = 2;
    expect(smithLine(s)).toBe('Reputation 2. One more for a copper can.');
  });

  // Round 3: requests asked for what was already growing (eight of the tester's ten). A farm that grows every crop
  // that can go in now still gets requests, but for that many more, sown fresh.
  it('a request for a crop already growing asks for at least three more than the farm has', async () => {
    const { plant } = await import('../src/sim/world');
    let n = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = onDay3(seed * 3);
      s.rep = 3;
      s.requested = 4;
      s.day = 5;
      s.coins = 500;
      let x = 2;
      for (const crop of ['radish', 'lettuce', 'carrot', 'strawberry'] as const) plant(s, x++, 5, crop, 0);
      for (const o of offerRequests(s)) {
        expect(o.items[0].n - requestHave(s, o), `${o.items[0].n} ${o.items[0].crop}`).toBeGreaterThanOrEqual(3);
        n++;
      }
    }
    expect(n).toBeGreaterThan(20);
  });

  it('every crop a request can ask for is one Sunup grows', () => {
    const s = onDay3(3);
    s.rep = 1;
    s.requested = 1;
    s.coins = 300;
    for (let i = 0; i < 50; i++) for (const o of offerRequests(s)) expect(CROP_IDS).toContain(o.items[0].crop);
  });
});
