// Thirty bot days per game, money and harvest numbers. Then Sunup in more
// detail over several farms: waterings per harvest, days with no income,
// coins by day 30, crops lost, requests filled, and how the day fits the
// work (the hour the bot ran out of chores or stamina, and how often
// stamina ran out first).
// npx tsx scripts/balance.ts [days] [farms]
import { CROP_IDS } from '../src/sim/crops';
import { PRESET_IDS } from '../src/sim/presets';
import { play, world } from '../tests/helpers';
import type { WorldState } from '../src/sim/types';

const DAYS = Number(process.argv[2] ?? 30);
const FARMS = Number(process.argv[3] ?? 6);

for (const id of PRESET_IDS) {
  const s = world(id);
  const t0 = performance.now();
  const r = play(s, DAYS);
  const h = CROP_IDS.map((c) => `${c[0]}${c[1]}:${s.stats.harvested[c]}`).join(' ');
  const counts: Record<string, number> = {};
  for (const e of r.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
  console.log(id, 'day', s.day, 'simMin', (s.time / 60).toFixed(1), 'steps', r.steps, 'ms', (performance.now() - t0).toFixed(0), 'coins', s.coins, 'earned', s.stats.earned, 'fields', s.parcels.filter((p) => p.owned).length, 'hands', s.actors.length - 1, 'rep', s.rep, 'stars', s.almanac.history.join(','), '\n  ', h, '\n  ', JSON.stringify(counts), r.problems.slice(0, 3));
}

interface Farm {
  waterings: number;
  harvests: number;
  noIncome: number;
  coins: number;
  earned: number;
  withered: number;
  eaten: number;
  gifts: number;
  requests: number;
  lapsed: number;
  rep: number;
  fields: number;
  sleepHour: number[];
  tiredDays: number;
  staminaLeft: number[];
}

function sunupFarm(seed: number, pace?: number): Farm {
  const s = world('sunup', seed);
  const sleepHour: number[] = [];
  const staminaLeft: number[] = [];
  let tiredDays = 0;
  let turned = 0;
  let gifts = 0;
  let seenReport: unknown = null;
  let lastDay = s.day;
  let wasTired = false;
  const r = play(s, DAYS, {
    pace,
    each: (st: WorldState) => {
      if (st.report && st.report !== seenReport) {
        seenReport = st.report;
        turned += st.report.turned ?? 0;
        if (st.report.gift) gifts++;
      }
      // Note the moment the day ends: what hour, and was it stamina that ended it.
      if (st.turnover >= 0 && st.day === lastDay) {
        lastDay = -1;
        sleepHour.push(6 + st.minute / 60);
        staminaLeft.push(st.stamina);
        if (st.stamina < 4) wasTired = true;
      }
      if (st.turnover < 0 && lastDay === -1) {
        lastDay = st.day;
        if (wasTired) tiredDays++;
        wasTired = false;
      }
      return [];
    },
  });
  let noIncome = 0;
  let requests = 0;
  let lapsed = 0;
  let withered = 0;
  let eaten = 0;
  let waterings = 0;
  let harvests = 0;
  const income = new Map<number, number>();
  for (const e of r.events) {
    if (e.type === 'water') waterings++;
    else if (e.type === 'harvest') harvests++;
    else if (e.type === 'request') e.done ? requests++ : lapsed++;
    // Delivered by hand from the board.
    else if (e.type === 'order' && e.done) requests++;
    else if (e.type === 'wither') withered++;
    else if (e.type === 'crowEat') eaten++;
    else if (e.type === 'dawn') income.set(e.day, 0);
  }
  // Income per night from the morning reports is not kept, so count the
  // nights that sold nothing and filled nothing from the events in order.
  let sold = false;
  let nights = 0;
  for (const e of r.events) {
    if (e.type === 'sell' || (e.type === 'request' && e.done) || (e.type === 'order' && e.done)) sold = true;
    if (e.type === 'dawn') {
      nights++;
      if (!sold) noIncome++;
      sold = false;
    }
  }
  if (r.problems.length) console.log('  problems', seed, r.problems.slice(0, 2));
  return {
    waterings,
    harvests,
    noIncome,
    coins: s.coins,
    earned: s.stats.earned,
    withered: withered + turned,
    eaten,
    gifts,
    requests,
    lapsed,
    rep: s.rep,
    fields: s.parcels.filter((p) => p.owned).length,
    sleepHour,
    tiredDays,
    staminaLeft,
  };
}

const med = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
};
const fmtH = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
// The quick bot, then the bot at a person's pace (about one action every 1.3 seconds, like the playtest).
for (const [label, pace] of [['the quick bot', undefined], ['the bot at a person\u2019s pace', 0.9]] as const) {
const farms: Farm[] = [];
for (let i = 0; i < FARMS; i++) farms.push(sunupFarm(42 + i * 1013, pace));
const avg = (f: (x: Farm) => number) => farms.reduce((a, x) => a + f(x), 0) / farms.length;
const hours = farms.flatMap((f) => f.sleepHour);
console.log(`\nSunup over ${FARMS} farms, ${DAYS} days each (${label})`);
console.log(`  waterings per harvest  ${(avg((f) => f.waterings) / Math.max(1, avg((f) => f.harvests))).toFixed(2)}  (${avg((f) => f.waterings).toFixed(0)} waterings, ${avg((f) => f.harvests).toFixed(0)} harvests)`);
console.log(`  days with no income    ${avg((f) => f.noIncome).toFixed(1)}  (per farm: ${farms.map((f) => f.noIncome).join(' ')})`);
console.log(`  coins by day ${DAYS + 1}        ${avg((f) => f.coins).toFixed(0)}  (per farm: ${farms.map((f) => f.coins).join(' ')}), earned ${avg((f) => f.earned).toFixed(0)}`);
console.log(`  crops lost             ${avg((f) => f.withered).toFixed(1)} withered or taken by the turn, ${avg((f) => f.eaten).toFixed(1)} eaten by crows; rescued from a dead end ${avg((f) => f.gifts).toFixed(1)} times`);
console.log(`  requests               ${avg((f) => f.requests).toFixed(1)} filled, ${avg((f) => f.lapsed).toFixed(1)} lapsed, reputation ${avg((f) => f.rep).toFixed(1)}, fields ${avg((f) => f.fields).toFixed(1)}`);
console.log(`  day ends (bot)         median ${fmtH(med(hours))}, earliest ${fmtH(Math.min(...hours))}, latest ${fmtH(Math.max(...hours))}; stamina ran out first on ${avg((f) => f.tiredDays).toFixed(1)} days; median stamina left ${med(farms.flatMap((f) => f.staminaLeft)).toFixed(0)}`);
}
