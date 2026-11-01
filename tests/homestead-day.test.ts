// P1: a day was about a minute of chores in a four-minute day, and mostly
// watering: the playtest slept at 7:30 most days, and on busy days stamina
// ran out by 8. The bot farm made 932 waterings for 79 harvests and had 12
// days with no income. Now a full watering keeps the soil wet for two days
// (one in a heat wave), actions cost less stamina, and the day is shorter.
import { describe, expect, it } from 'vitest';
import { DAY_SECONDS, STAMINA_COST, STAMINA_MAX } from '../src/sim/constants';
import { nightfall } from '../src/sim/day';
import { plant, plots } from '../src/sim/world';
import { play, world } from './helpers';

describe('watering is less of a grind', () => {
  it('a full watering keeps the soil wet for two days', () => {
    const s = world('sunup');
    s.forecast = ['sun', 'sun', 'sun', 'sun'];
    s.weather = 'sun';
    plant(s, 2, 7, 'corn', 1);
    plots(s, 2, 7).wet = true;
    plots(s, 2, 7).moisture = 3;
    nightfall(s, []);
    s.weather = 'sun';
    expect(plots(s, 2, 7).crop!.age).toBe(2);
    expect(plots(s, 2, 7).wet).toBe(true);
    nightfall(s, []);
    s.weather = 'sun';
    expect(plots(s, 2, 7).crop!.age).toBe(3);
    expect(plots(s, 2, 7).wet).toBe(false);
  });

  it('a heat wave dries it in one', () => {
    const s = world('sunup');
    plant(s, 2, 7, 'corn', 1);
    plots(s, 2, 7).wet = true;
    plots(s, 2, 7).moisture = 3;
    s.weather = 'heat';
    nightfall(s, []);
    expect(plots(s, 2, 7).wet).toBe(false);
  });
});

/** Nights that sold nothing and filled no request, over a bot run. */
function quietNights(events: { type: string; done?: boolean }[]): number {
  let earned = false;
  let quiet = 0;
  for (const e of events) {
    if (e.type === 'sell' || ((e.type === 'request' || e.type === 'order') && e.done)) earned = true;
    if (e.type === 'dawn') {
      if (!earned) quiet++;
      earned = false;
    }
  }
  return quiet;
}

describe('a bot farm over twenty days', () => {
  for (const seed of [42, 1055]) {
    it(`farm ${seed}: few waterings per harvest, few nights with no income, and the turn takes little`, () => {
      const s = world('sunup', seed);
      let turned = 0;
      let seen: unknown = null;
      const r = play(s, 20, {
        each: (st) => {
          if (st.report && st.report !== seen) {
            seen = st.report;
            turned += st.report.turned ?? 0;
          }
          return [];
        },
      });
      expect(r.problems).toEqual([]);
      const water = r.events.filter((e) => e.type === 'water').length;
      const harvest = r.events.filter((e) => e.type === 'harvest').length;
      // Before round 1: 6.7 waterings per harvest and 15 quiet nights in 30 (11.8 and 12 in the playtest's bot farm).
      // Round 1 brought it to about 2 with two-day soil, and the second playtest found too little to do: the can now
      // wets a plot for one night, so dry days mean watering, but not the old grind. Requests are scarce now, so a
      // few more nights pass without a sale. Round 4 made sprinklers dearer and wear out after a season, so a farm
      // waters more by can (the committed round 3 rules already watered 4.4 times a harvest on farm 42).
      expect(water / harvest).toBeLessThan(6);
      // (Round 5: across six farms the quick bot's quiet nights average 7.8 in 20, against 8.0 on the round 4 rules; farm
      // 1055 has 10.)
      expect(quietNights(r.events as never)).toBeLessThanOrEqual(10);
      expect(turned).toBeLessThan(10);
    });
  }
});

describe('the day and stamina fit the work', () => {
  it('a person-paced day on a grown farm runs past mid-morning, and stamina rarely ends it early', () => {
    const s = world('sunup', 42);
    const ends: { hour: number; stamina: number }[] = [];
    let open = s.day;
    play(s, 24, {
      pace: 0.9,
      each: (st) => {
        if (st.turnover >= 0 && open === st.day) {
          open = -1;
          ends.push({ hour: 6 + st.minute / 60, stamina: st.stamina });
        }
        if (st.turnover < 0 && open === -1) open = st.day;
        return [];
      },
    });
    const late = ends.slice(10);
    const tiredBefore10 = late.filter((e) => e.stamina < 4 && e.hour < 10).length;
    const busy = late.filter((e) => e.hour >= 11).length;
    // Before: stamina ran out by 8 am on busy days and most days ended by 7:30.
    expect(tiredBefore10).toBe(0);
    expect(busy).toBeGreaterThanOrEqual(4);
    expect(DAY_SECONDS).toBeLessThan(240);
    // Round 3 made watering two (a dry day on one or two fields is real work); planting and harvesting stay one.
    expect(STAMINA_COST.water + STAMINA_COST.plant + STAMINA_COST.harvest).toBeLessThanOrEqual(4);
    expect(STAMINA_MAX).toBe(100);
  });
});
