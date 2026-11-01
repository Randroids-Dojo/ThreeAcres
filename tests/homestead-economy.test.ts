// Round 2, P1: no tension. All six fields were owned by day 25 with sloppy
// play, morning coins were 1,100 on day 17 and 5,925 on day 31, requests paid
// 610 for 5 sunflowers and 1,330 for 8 corn, and with rain and two-day soil
// the tester watered on 3 of the first 10 days. Now requests are few and
// compete (two at most, new ones only with the mornings, each wanting a good
// share of the soil free to plant, so two together cannot both be met), pay
// at most a fifth over market with a cap, later fields want reputation as
// well as steeper prices, and the can wets a plot for one night.
import { describe, expect, it } from 'vitest';
import { CROPS } from '../src/sim/crops';
import { nightfall } from '../src/sim/day';
import { fillRequests, makeRequest } from '../src/sim/goals';
import { step } from '../src/sim/step';
import { plant, plots } from '../src/sim/world';
import type { WorldState } from '../src/sim/types';
import { EARLY, EARLY_FEATURES, play, stand, teach, world } from './helpers';

/** A farm with requests on, past the first one, `fields` fields owned and nothing growing. */
function town(seed: number, fields = 1, day = 4): WorldState {
  const s = teach(world('sunup', seed), [...EARLY, 'requests'], [...EARLY_FEATURES, 'board', 'requests']);
  s.day = day;
  s.rep = 2;
  s.requested = 3;
  for (let i = 1; i < fields; i++) {
    s.parcels[i].owned = true;
    const p = s.parcels[i];
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) plots(s, x, y).tilled = true;
  }
  for (const p of s.plots) p.crop = null;
  return s;
}

describe('requests pay a little over market, and no more', () => {
  it('at most a fifth over what the crops fetch, and never more than 60 coins over', () => {
    let n = 0;
    for (let seed = 1; seed <= 30; seed++) {
      for (const fields of [1, 2, 3]) {
        const s = town(seed * 7, fields, 11 + (seed % 15));
        for (let k = 0; k < 2; k++) {
          const o = makeRequest(s);
          if (!o) continue;
          s.orders.push(o);
          n++;
          const market = o.items.reduce((a, it) => a + CROPS[it.crop].price * it.n, 0);
          expect(o.reward / market, `${o.items[0].n} ${o.items[0].crop}`).toBeLessThanOrEqual(1.21);
          expect(o.reward - market).toBeLessThanOrEqual(62);
          expect(o.reward).toBeGreaterThanOrEqual(market);
        }
      }
    }
    expect(n).toBeGreaterThan(150);
  });
});

describe('requests are few, and they compete', () => {
  it('two open at most, and a filled one is not replaced until a morning', () => {
    const s = town(9);
    fillRequests(s, true);
    fillRequests(s, true);
    fillRequests(s, true);
    expect(s.orders.length).toBeLessThanOrEqual(2);
    while (s.orders.length < 2) fillRequests(s, true);
    expect(s.orders.length).toBe(2);
    const it0 = s.orders[0].items[0];
    s.stock[it0.crop][0] = it0.n;
    step(s, 0.016, [{ type: 'deliver', id: s.orders[0].id }]);
    for (let i = 0; i < 30; i++) step(s, 0.016);
    expect(s.orders.length).toBe(1);
  });

  it('two open requests want more than the soil free to plant before they are due', () => {
    let pairs = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const fields of [1, 2]) {
        const s = town(seed * 13, fields, 2 + (seed % 6));
        const a = makeRequest(s);
        if (!a) continue;
        s.orders.push(a);
        const b = makeRequest(s);
        if (!b || CROPS[b.items[0].crop].price > 150 || CROPS[a.items[0].crop].price > 150) continue;
        pairs++;
        // The soil they could use: free now, as nothing is growing, so every owned plot.
        const free = s.plots.filter((_, i) => s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned).length;
        expect(a.items[0].n + b.items[0].n, `seed ${seed}, ${fields} fields`).toBeGreaterThan(free);
        // Each alone can be met.
        expect(a.items[0].n).toBeLessThanOrEqual(free);
        expect(b.items[0].n).toBeLessThanOrEqual(free);
        // Too soon to grow one after the other on the same plots.
        const days = (o: typeof a) => CROPS[o.items[0].crop].days;
        expect(Math.min(a.due, b.due) - s.day).toBeLessThan(days(a) + days(b));
      }
    }
    expect(pairs).toBeGreaterThan(40);
  });
});

describe('fields cost more, and the later ones want a good name in town', () => {
  it('the third field is not sold to a farmer with no reputation, however many coins', () => {
    const s = town(3);
    s.rep = 0;
    s.coins = 9000;
    step(s, 0.016, [{ type: 'buyParcel', id: 1 }]);
    expect(s.parcels[1].owned).toBe(true);
    step(s, 0.016, [{ type: 'buyParcel', id: 2 }]);
    expect(s.parcels[2].owned).toBe(false);
    s.rep = 2;
    step(s, 0.016, [{ type: 'buyParcel', id: 2 }]);
    expect(s.parcels[2].owned).toBe(true);
    expect(s.parcels.map((p) => p.price).reduce((a, b) => a + b, 0)).toBeGreaterThan(6000);
  });
});

describe('the can wets a plot for one night; rain soaks it for two', () => {
  it('watered by can, dry again the next morning', () => {
    const s = teach(world('sunup'), EARLY, EARLY_FEATURES);
    s.forecast = ['sun', 'sun', 'sun'];
    s.weather = 'sun';
    plant(s, 2, 7, 'corn', 1);
    stand(s, 2, 6, 's');
    s.tool = 'can';
    plots(s, 2, 6).crop = null;
    step(s, 0.016, [{ type: 'act' }]);
    expect(plots(s, 2, 7).wet).toBe(true);
    nightfall(s, []);
    expect(plots(s, 2, 7).crop!.age).toBe(2);
    expect(plots(s, 2, 7).wet).toBe(false);
  });
});

describe('a bot farm at a person’s pace over thirty days', () => {
  for (const seed of [42, 2068]) {
    it(`farm ${seed}: coins stay wanted, the fields come slowly, and requests are still met`, () => {
      const s = world('sunup', seed);
      const morning: Record<number, number> = {};
      let open = s.day;
      const r = play(s, 30, {
        pace: 0.9,
        each: (st) => {
          if (st.turnover < 0 && st.day !== open) {
            open = st.day;
            morning[st.day] = st.coins;
          }
          return [];
        },
      });
      expect(r.problems).toEqual([]);
      const filled = r.events.filter((e) => (e.type === 'request' || e.type === 'order') && e.done).length;
      // Before (this bot): about 22,000 earned, 4,400 coins on day 30 after buying all six fields by day 22, and 27
      // requests at 1.5 times market.
      expect(s.stats.earned).toBeLessThan(15000);
      expect(morning[30]).toBeLessThan(3000);
      expect(s.parcels.filter((p) => p.owned).length).toBeLessThanOrEqual(5);
      expect(s.parcels.filter((p) => p.owned).length).toBeGreaterThanOrEqual(2);
      expect(filled).toBeGreaterThanOrEqual(3);
      expect(filled).toBeLessThanOrEqual(14);
    });
  }
});
