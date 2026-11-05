// Round 2, P1: no tension. All six fields were owned by day 25 with sloppy
// play, morning coins were 1,100 on day 17 and 5,925 on day 31, requests paid
// 610 for 5 sunflowers and 1,330 for 8 corn, and with rain and two-day soil
// the tester watered on 3 of the first 10 days. Now requests are few and
// compete (two at most, new ones only with the mornings, each wanting a good
// share of the soil free to plant, so two together cannot both be met), pay
// at most a fifth over market with a cap, later fields want reputation as
// well as steeper prices, and the can wets a plot for one night.
import { describe, expect, it } from 'vitest';
import { FIELD_REP } from '../src/sim/constants';
import { PARCELS } from '../src/sim/map';
import { CROPS } from '../src/sim/crops';
import { nightfall } from '../src/sim/day';
import { fillRequests, offerRequests } from '../src/sim/goals';
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

// Round 3: requests paid at most a fifth over market (60 coins at most), so turning one down cost nothing. Now they
// pay clearly more than market for what they have you sow, come as a pair, and only one of the pair can be taken.
// (Round 5: the gain is set by the soil and days and the kind, so the range is 1.15 to 2 times; it was 1.3 to 1.8.)
describe('requests pay clearly more than market', () => {
  it('from 1.15 to 2 times what the crops fetch (nothing is growing, so all of it is sown fresh)', () => {
    let n = 0;
    for (let seed = 1; seed <= 30; seed++) {
      for (const fields of [1, 2, 3]) {
        const s = town(seed * 7, fields, 11 + (seed % 15));
        s.coins = 300 + seed * 40;
        for (const o of offerRequests(s)) {
          n++;
          const market = o.items.reduce((a, it) => a + CROPS[it.crop].price * it.n, 0);
          expect(o.reward / market, `${o.items[0].n} ${o.items[0].crop}`).toBeGreaterThanOrEqual(1.15);
          // (Round 10: up to 2.2 times: requests are worth chasing beside the crate.)
          expect(o.reward / market).toBeLessThanOrEqual(2.2);
        }
      }
    }
    expect(n).toBeGreaterThan(120);
  });
});

describe('requests are few, and they compete', () => {
  it('a pair at most on offer, and a filled one is not replaced until a morning', () => {
    const s = town(9);
    s.coins = 500;
    fillRequests(s, true);
    fillRequests(s, true);
    fillRequests(s, true);
    expect(s.orders.length).toBe(2);
    // (Round 5: one is taken on the board, and the other goes.)
    step(s, 0.016, [{ type: 'accept', id: s.orders[0].id }]);
    expect(s.orders.length).toBe(1);
    const it0 = s.orders[0].items[0];
    s.stock[it0.crop][0] = it0.n;
    // (Round 6: sown for it and picked.)
    s.orders[0].got = it0.n;
    step(s, 0.016, [{ type: 'deliver', id: s.orders[0].id }]);
    for (let i = 0; i < 30; i++) step(s, 0.016);
    expect(s.orders.length).toBe(0);
  });

  it('each of a pair fits the farm alone, and asks for a share of it, not the whole', () => {
    let pairs = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const fields of [1, 2]) {
        const s = town(seed * 13, fields, 2 + (seed % 6));
        s.coins = 100 + (seed % 5) * 150;
        const offer = offerRequests(s);
        if (offer.length !== 2) continue;
        pairs++;
        // Nothing is growing, so every owned plot is free, and the purse is all the seed money there is.
        const free = s.plots.filter((_, i) => s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned).length;
        const cost = (o: (typeof offer)[number]) => o.items[0].n * CROPS[o.items[0].crop].seed;
        for (const o of offer) {
          expect(o.items[0].n).toBeLessThanOrEqual(Math.ceil(free * 0.6));
          expect(cost(o)).toBeLessThanOrEqual(s.coins);
        }
      }
    }
    expect(pairs).toBeGreaterThan(60);
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
    // (Round 10: three points of reputation now, and a dearer field: the tenth playtest bought field 3 for 800 without
    // a thought.)
    s.rep = FIELD_REP[2] - 1;
    step(s, 0.016, [{ type: 'buyParcel', id: 2 }]);
    expect(s.parcels[2].owned).toBe(false);
    s.rep = FIELD_REP[2];
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
      // (Round 7: every crop is paid for as it goes into the crate, so a harvest is planted again the same day and soil
      // no longer sits bare for want of coins: about a quarter more by day 30, a twentieth more by day 10.)
      // (Round 10: requests pay more and come every morning, so a little more is earned, and much more of it from
      // requests; the fields cost half as much again.)
      expect(s.stats.earned).toBeLessThan(21000);
      // (Round 9: the fifth and sixth fields cost 3,000 and 4,500, a fair's ribbon takes a fifth off: coins gather for them.)
      // (Round 10: the sixth field costs 5,000: coins gather for it, and never pass it.)
      expect(morning[30]).toBeLessThan(PARCELS[5].price);
      expect(s.parcels.filter((p) => p.owned).length).toBeLessThanOrEqual(5);
      expect(s.parcels.filter((p) => p.owned).length).toBeGreaterThanOrEqual(2);
      expect(filled).toBeGreaterThanOrEqual(3);
      // (Round 10: a pair every morning, while fewer than six are taken: requests are most of a season's work now.)
      expect(filled).toBeLessThanOrEqual(26);
      // (Thirty days of play at a person's pace take a few seconds; under a full parallel run, more than the default.)
    }, 20000);
  }
});
