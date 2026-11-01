// Thirty bot days per game, money and harvest numbers. Then Sunup in more
// detail over several farms: morning coins on days 10, 20 and 30, the day
// each field is bought, waterings per harvest, days with no income, what
// requests pay against the market, and how the day fits the work (the hour
// of the last job each day, by how many fields the farm has, and how often
// stamina ran out first).
// npx tsx scripts/balance.ts [days] [farms]
import { CROP_IDS, CROPS } from '../src/sim/crops';
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
  /** Coins on the morning of each day, by day. */
  morning: Record<number, number>;
  /** The day each field (1 to 5) was bought, or 0. */
  bought: number[];
  earned: number;
  withered: number;
  eaten: number;
  gifts: number;
  requests: number;
  lapsed: number;
  /** Each request pinned: its reward over what its crops sell for at market. */
  payRatio: number[];
  rewards: number[];
  rep: number;
  fields: number;
  sleepHour: number[];
  /** The hour of the last job each day, with the fields owned that day and whether it rained. */
  workEnd: { hour: number; fields: number; day: number; wet: boolean }[];
  tiredDays: number;
  staminaLeft: number[];
}

const JOBS = new Set(['till', 'water', 'plant', 'harvest', 'tend', 'refill', 'clear', 'build']);

function sunupFarm(seed: number, pace?: number): Farm {
  const s = world('sunup', seed);
  const sleepHour: number[] = [];
  const staminaLeft: number[] = [];
  const morning: Record<number, number> = { 1: s.coins };
  const bought = [0, 0, 0, 0, 0, 0];
  const workEnd: Farm['workEnd'] = [];
  const seenOrders = new Set<number>();
  const payRatio: number[] = [];
  const rewards: number[] = [];
  let lastJob = -1;
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
        workEnd.push({ hour: lastJob < 0 ? 6 : 6 + lastJob / 60, fields: st.parcels.filter((p) => p.owned).length, day: st.day, wet: st.weather === 'rain' || st.weather === 'storm' });
        lastJob = -1;
      }
      if (st.turnover < 0 && lastDay === -1) {
        lastDay = st.day;
        morning[st.day] = st.coins;
        if (wasTired) tiredDays++;
        wasTired = false;
      }
      return [];
    },
    after: (st, ev) => {
      for (const e of ev) if (JOBS.has(e.type) && (e as { by?: number }).by === st.actors[0].id) lastJob = st.minute;
      for (const p of st.parcels) if (p.owned && p.id > 0 && !bought[p.id]) bought[p.id] = st.day;
      for (const o of st.orders) {
        if (seenOrders.has(o.id)) continue;
        seenOrders.add(o.id);
        const market = o.items.reduce((a, it) => a + CROPS[it.crop].price * it.n, 0);
        payRatio.push(o.reward / market);
        rewards.push(o.reward);
      }
    },
  });
  let requests = 0;
  let lapsed = 0;
  let withered = 0;
  let eaten = 0;
  let waterings = 0;
  let harvests = 0;
  for (const e of r.events) {
    if (e.type === 'water') waterings++;
    else if (e.type === 'harvest') harvests++;
    else if (e.type === 'request') e.done ? requests++ : lapsed++;
    // Delivered by hand from the board.
    else if (e.type === 'order' && e.done) requests++;
    else if (e.type === 'wither') withered++;
    else if (e.type === 'crowEat') eaten++;
  }
  // Count the nights that sold nothing and filled nothing from the events in order.
  let sold = false;
  let noIncome = 0;
  for (const e of r.events) {
    if (e.type === 'sell' || (e.type === 'request' && e.done) || (e.type === 'order' && e.done)) sold = true;
    if (e.type === 'dawn') {
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
    morning,
    bought: bought.slice(1),
    earned: s.stats.earned,
    withered: withered + turned,
    eaten,
    gifts,
    requests,
    lapsed,
    payRatio,
    rewards,
    rep: s.rep,
    fields: s.parcels.filter((p) => p.owned).length,
    sleepHour,
    workEnd,
    tiredDays,
    staminaLeft,
  };
}

const med = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
};
const quart = (xs: number[], q: number) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * q))] : 0;
};
const fmtH = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const num = (n: number) => Math.round(n).toLocaleString('en-US');
// The quick bot, then the bot at a person's pace (about one action every 1.3 seconds, like the playtest).
for (const [label, pace] of [['the quick bot', undefined], ['the bot at a person\u2019s pace', 0.9]] as const) {
  const farms: Farm[] = [];
  for (let i = 0; i < FARMS; i++) farms.push(sunupFarm(42 + i * 1013, pace));
  const avg = (f: (x: Farm) => number) => farms.reduce((a, x) => a + f(x), 0) / farms.length;
  const hours = farms.flatMap((f) => f.sleepHour);
  console.log(`\nSunup over ${FARMS} farms, ${DAYS} days each (${label})`);
  const coinsOn = (d: number) => `day ${d} ${num(avg((f) => f.morning[d] ?? f.coins))}`;
  console.log(`  morning coins          ${[10, 20, 30].map(coinsOn).join(', ')}  (day 31 per farm: ${farms.map((f) => num(f.coins)).join(' ')})`);
  const fieldDays = [0, 1, 2, 3, 4].map((k) => {
    const got = farms.map((f) => f.bought[k]).filter((d) => d > 0);
    return `field ${k + 2} ${got.length ? `day ${(got.reduce((a, b) => a + b, 0) / got.length).toFixed(0)}` : 'never'} (${got.length}/${farms.length})`;
  });
  console.log(`  fields bought          ${fieldDays.join(', ')}`);
  console.log(`  waterings per harvest  ${(avg((f) => f.waterings) / Math.max(1, avg((f) => f.harvests))).toFixed(2)}  (${avg((f) => f.waterings).toFixed(0)} waterings, ${avg((f) => f.harvests).toFixed(0)} harvests)`);
  console.log(`  days with no income    ${avg((f) => f.noIncome).toFixed(1)}  (per farm: ${farms.map((f) => f.noIncome).join(' ')})`);
  console.log(`  earned                 ${num(avg((f) => f.earned))}; crops lost ${avg((f) => f.withered).toFixed(1)} withered or taken by the turn, ${avg((f) => f.eaten).toFixed(1)} eaten by crows; rescued ${avg((f) => f.gifts).toFixed(1)} times`);
  const ratios = farms.flatMap((f) => f.payRatio);
  const rewards = farms.flatMap((f) => f.rewards);
  console.log(`  requests               ${avg((f) => f.requests).toFixed(1)} filled, ${avg((f) => f.lapsed).toFixed(1)} lapsed; pay over market median ${med(ratios).toFixed(2)}x, max ${Math.max(...ratios).toFixed(2)}x; largest reward ${num(Math.max(...rewards))}; reputation ${avg((f) => f.rep).toFixed(1)}`);
  const ends = farms.flatMap((f) => f.workEnd).filter((w) => w.day > 3);
  const band = (lo: number, hi: number, dry = false) => ends.filter((w) => w.fields >= lo && w.fields <= hi && (!dry || !w.wet)).map((w) => w.hour);
  const show = (xs: number[]) => (xs.length ? `median ${fmtH(med(xs))}, three in four by ${fmtH(quart(xs, 0.75))}, latest ${fmtH(Math.max(...xs))} (${xs.length} days)` : 'no days');
  console.log(`  last job of the day    1 field: ${show(band(1, 1))}`);
  console.log(`                         2 to 3 fields: ${show(band(2, 3))}`);
  console.log(`                         2 to 3 fields, dry days: ${show(band(2, 3, true))}`);
  console.log(`                         4 to 6 fields: ${show(band(4, 6))}`);
  console.log(`  day ends (bot sleeps)  median ${fmtH(med(hours))}, earliest ${fmtH(Math.min(...hours))}, latest ${fmtH(Math.max(...hours))}; stamina ran out first on ${avg((f) => f.tiredDays).toFixed(1)} days; median stamina left ${med(farms.flatMap((f) => f.staminaLeft)).toFixed(0)}`);
}
