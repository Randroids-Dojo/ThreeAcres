// P1: requests were traps. The first wanted 135 coins of strawberry seed the
// day after the lesson said to spend, part of an order was sold overnight,
// and a summer-only request was still "wanted today" in autumn. Now the
// first is a few radishes, what a request needs stays in the crate, nothing
// is due after its crop's season, and a fresh request comes after each one.
import { describe, expect, it } from 'vitest';
import { CROP_IDS, CROPS, inSeason } from '../src/sim/crops';
import { nightfall } from '../src/sim/day';
import { fillRequests, makeRequest } from '../src/sim/goals';
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
  it('is always three radishes, cheap to grow and due after they can ripen', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = onDay3(seed * 7919);
      s.learn.push('requests');
      step(s, 0.016);
      expect(s.orders.length).toBe(1);
      const o = s.orders[0];
      expect(o.items[0], `seed ${seed}`).toEqual({ crop: 'radish', n: 3 });
      expect(o.due - s.day).toBeGreaterThanOrEqual(CROPS.radish.days);
      expect(o.reward).toBeGreaterThan(3 * CROPS.radish.price);
    }
  });
});

describe('a request keeps its crops', () => {
  it('a short order stays in the crate overnight instead of being sold', () => {
    const s = onDay3(5);
    s.orders = [{ id: 1, who: 'Mabel', items: [{ crop: 'strawberry', n: 3 }], reward: 190, rep: 1, due: 9 }];
    s.stock.strawberry[0] = 2;
    s.stock.radish[0] = 4;
    const coins = s.coins;
    nightfall(s, []);
    expect(s.stock.strawberry[0]).toBe(2);
    expect(s.stock.radish[0]).toBe(0);
    expect(s.coins).toBe(coins + 4 * CROPS.radish.price);
    expect(s.report!.kept).toEqual([{ crop: 'strawberry', n: 2 }]);
    // The third arrives: the request is filled from the crate that night.
    s.stock.strawberry[0] = 3;
    nightfall(s, []);
    expect(s.orders.some((o) => o.id === 1)).toBe(false);
    expect(s.report!.filled).toEqual([{ who: 'Mabel', reward: 190 }]);
    expect(s.rep).toBe(1);
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
          const o = makeRequest(s) as ReturnType<typeof makeRequest> | undefined;
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
    expect(made).toBeGreaterThan(1000);
  });

  it('come one at a time until the first is filled, then more, and a filled one is replaced at once', () => {
    const s = onDay3(9);
    s.learn.push('requests');
    fillRequests(s);
    expect(s.orders.length).toBe(1);
    s.rep = 1;
    step(s, 0.016);
    expect(s.orders.length).toBe(2);
    s.rep = 4;
    step(s, 0.016);
    expect(s.orders.length).toBe(3);
    const it0 = s.orders[0].items[0];
    s.stock[it0.crop][0] = it0.n;
    step(s, 0.016, [{ type: 'deliver', id: s.orders[0].id }]);
    expect(s.orders.length).toBe(3);
  });

  it('the board says how far the town’s good word is from the smith’s next tool', () => {
    const s = onDay3(1);
    expect(smithLine(s)).toBe('Each request filled is a good word in town. None yet. Two more and the smith makes you a copper hoe.');
    s.rep = 2;
    expect(smithLine(s)).toBe('Each request filled is a good word in town. Two so far. One more and the smith makes you a copper can.');
  });

  it('counts what is already growing: a big enough crop in the ground can be asked for sooner than seed would take', async () => {
    const { plant } = await import('../src/sim/world');
    const s = onDay3(11);
    s.rep = 3;
    s.requested = 4;
    s.day = 9; // two nights to the turn: carrots from seed are out of time, but these are nearly ripe
    for (let x = 2; x < 6; x++) plant(s, x, 7, 'carrot', 4);
    for (let i = 0; i < 40; i++) {
      s.orders = [];
      const o = makeRequest(s);
      if (!o || o.items[0].crop !== 'carrot') continue;
      expect(o.items[0].n).toBeLessThanOrEqual(4);
      expect(o.due).toBeLessThanOrEqual(10);
      expect(o.due).toBeGreaterThanOrEqual(10);
      return;
    }
    throw new Error('never asked for the carrots in the ground');
  });

  it('every crop a request can ask for is one Sunup grows', () => {
    const s = onDay3(3);
    for (let i = 0; i < 50; i++) expect(CROP_IDS).toContain(makeRequest(s)!.items[0].crop);
  });
});
