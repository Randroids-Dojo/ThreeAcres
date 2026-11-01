// Thirty bot days per game, money and harvest numbers. Then Sunup in more
// detail over several farms: morning coins on days 10, 20 and 30, the day
// each field is bought, waterings per harvest, days with no income, what
// requests pay against the market, and how the day fits the work (the hour
// of the last job each day, by how many fields the farm has, and how often
// stamina ran out first).
// Round 3 adds, for each request as it is pinned: whether it asks for a crop
// already growing (or already met), whether its seed was out of reach by its
// sow-by day (coins, the crate and what ripens in time), and its pay against
// market; and for the day: the lowest stamina by fields owned, crows, bugs,
// heat waves and what each of them cost.
// npx tsx scripts/balance.ts [days] [farms]
import { CROP_IDS, CROPS } from '../src/sim/crops';
import { PRESET_IDS } from '../src/sim/presets';
import { play, world } from '../tests/helpers';
import type { CropId, Order, WorldState } from '../src/sim/types';

const DAYS = Number(process.argv[2] ?? 30);
const FARMS = Number(process.argv[3] ?? 6);
const ONLY_SUNUP = process.argv.includes('--sunup');

if (!ONLY_SUNUP) {
  for (const id of PRESET_IDS) {
    const s = world(id);
    const t0 = performance.now();
    const r = play(s, DAYS);
    const h = CROP_IDS.map((c) => `${c[0]}${c[1]}:${s.stats.harvested[c]}`).join(' ');
    const counts: Record<string, number> = {};
    for (const e of r.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
    console.log(id, 'day', s.day, 'simMin', (s.time / 60).toFixed(1), 'steps', r.steps, 'ms', (performance.now() - t0).toFixed(0), 'coins', s.coins, 'earned', s.stats.earned, 'fields', s.parcels.filter((p) => p.owned).length, 'hands', s.actors.length - 1, 'rep', s.rep, 'stars', s.almanac.history.join(','), '\n  ', h, '\n  ', JSON.stringify(counts), r.problems.slice(0, 3));
  }
}

/** One request as it was pinned, and what the farm had at that moment. */
interface Pinned {
  day: number;
  crop: CropId;
  n: number;
  /** Already in the ground on owned plots, and in the crate. */
  growing: number;
  stock: number;
  /** The seed still to buy, and what the farm could raise by the sow-by day. */
  cost: number;
  budget: number;
  /** The last day seed could go in and still be ripe in time. */
  sowBy: number;
  ratio: number;
  reward: number;
}

interface Farm {
  waterings: number;
  harvests: number;
  noIncome: number;
  coins: number;
  /** Coins on the morning of each day, by day, and all earned by then. */
  morning: Record<number, number>;
  earnedBy: Record<number, number>;
  /** The day each field (1 to 5) was bought, or 0. */
  bought: number[];
  earned: number;
  withered: number;
  eaten: number;
  gifts: number;
  requests: number;
  lapsed: number;
  withdrawn: number;
  pinned: Pinned[];
  rep: number;
  fields: number;
  sleepHour: number[];
  /** The hour of the last job each day, the lowest stamina, the fields owned that day and whether it rained. */
  workEnd: { hour: number; low: number; fields: number; day: number; wet: boolean }[];
  tiredDays: number;
  staminaLeft: number[];
  crows: number;
  bugs: number;
  bugDeaths: number;
  heatDays: number;
  heatDeaths: number;
  scarecrows: number;
  sprinklers: number;
}

const JOBS = new Set(['till', 'water', 'plant', 'harvest', 'tend', 'refill', 'clear', 'build']);

function ownedAt(s: WorldState, i: number): boolean {
  return s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned;
}

function pinOf(s: WorldState, o: Order): Pinned {
  const it = o.items[0];
  const d = CROPS[it.crop];
  // Works on the committed code too: there a request had only a due day, and its sow-by day is that less the crop's days.
  const sowBy = (o as Order & { sowBy?: number }).sowBy ?? o.due - d.days;
  let growing = 0;
  let ripening = 0;
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (!c || c.dead || !ownedAt(s, i)) continue;
    if (c.kind === it.crop) growing++;
    // Picked by the day before the sow-by day, it is sold that night and its coins can buy the seed.
    if (CROPS[c.kind].days - c.age <= sowBy - s.day - 1) ripening += CROPS[c.kind].price;
  }
  const stock = s.stock[it.crop].reduce((a, b) => a + b, 0);
  let crate = 0;
  for (const c of CROP_IDS) crate += s.stock[c].reduce((a, b) => a + b, 0) * CROPS[c].price;
  const need = Math.max(0, it.n - growing - stock);
  return {
    day: s.day,
    crop: it.crop,
    n: it.n,
    growing,
    stock,
    cost: need * d.seed,
    // Only coins in hand can pay for seed sown today.
    budget: s.coins + (sowBy > s.day ? crate + ripening : 0),
    sowBy,
    ratio: o.reward / (d.price * it.n),
    reward: o.reward,
  };
}

function sunupFarm(seed: number, pace?: number): Farm {
  const s = world('sunup', seed);
  const sleepHour: number[] = [];
  const staminaLeft: number[] = [];
  const morning: Record<number, number> = { 1: s.coins };
  const earnedBy: Record<number, number> = { 1: 0 };
  const bought = [0, 0, 0, 0, 0, 0];
  const workEnd: Farm['workEnd'] = [];
  const seenOrders = new Set<number>();
  const pinned: Pinned[] = [];
  let lastJob = -1;
  let low = s.stamina;
  let tiredDays = 0;
  let turned = 0;
  let gifts = 0;
  let withdrawn = 0;
  let heatDays = 0;
  let seenReport: unknown = null;
  let lastDay = s.day;
  let wasTired = false;
  let heatNight = false;
  let heatDeaths = 0;
  const r = play(s, DAYS, {
    pace,
    each: (st: WorldState) => {
      if (st.report && st.report !== seenReport) {
        seenReport = st.report;
        turned += st.report.turned ?? 0;
        if (st.report.gift) gifts++;
        withdrawn += ((st.report as unknown as { withdrawn?: unknown[] }).withdrawn ?? []).length;
      }
      if (st.turnover < 0) low = Math.min(low, st.stamina);
      // Note the moment the day ends: what hour, and was it stamina that ended it.
      if (st.turnover >= 0 && st.day === lastDay) {
        lastDay = -1;
        sleepHour.push(6 + st.minute / 60);
        staminaLeft.push(st.stamina);
        if (st.stamina < 4) wasTired = true;
        workEnd.push({ hour: lastJob < 0 ? 6 : 6 + lastJob / 60, low, fields: st.parcels.filter((p) => p.owned).length, day: st.day, wet: st.weather === 'rain' || st.weather === 'storm' });
        heatNight = st.weather === 'heat';
        if (heatNight) heatDays++;
        lastJob = -1;
      }
      if (st.turnover < 0 && lastDay === -1) {
        lastDay = st.day;
        morning[st.day] = st.coins;
        earnedBy[st.day] = st.stats.earned;
        if (wasTired) tiredDays++;
        wasTired = false;
        low = st.stamina;
        heatNight = false;
      }
      return [];
    },
    after: (st, ev) => {
      for (const e of ev) {
        if (JOBS.has(e.type) && (e as { by?: number }).by === st.actors[0].id) lastJob = st.minute;
        if (e.type === 'wither' && heatNight) heatDeaths++;
      }
      for (const p of st.parcels) if (p.owned && p.id > 0 && !bought[p.id]) bought[p.id] = st.day;
      for (const o of st.orders) {
        if (seenOrders.has(o.id)) continue;
        seenOrders.add(o.id);
        pinned.push(pinOf(st, o));
      }
    },
  });
  let requests = 0;
  let lapsed = 0;
  let withered = 0;
  let eaten = 0;
  let waterings = 0;
  let harvests = 0;
  let crows = 0;
  let bugs = 0;
  let bugDeaths = 0;
  let scarecrows = 0;
  let sprinklers = 0;
  const bugged = new Set<string>();
  for (const e of r.events) {
    if (e.type === 'water') waterings++;
    else if (e.type === 'harvest') {
      harvests++;
      bugged.delete(`${e.x},${e.y}`);
    }
    else if (e.type === 'request') e.done ? requests++ : lapsed++;
    // Delivered by hand from the board.
    else if (e.type === 'order' && e.done) requests++;
    else if (e.type === 'wither') {
      withered++;
      if (bugged.has(`${e.x},${e.y}`)) bugDeaths++;
    } else if (e.type === 'crowEat') eaten++;
    else if (e.type === 'crowIn') crows++;
    else if (e.type === 'bugs') {
      bugs++;
      bugged.add(`${e.x},${e.y}`);
    } else if (e.type === 'tend' || e.type === 'clear') bugged.delete(`${e.x},${e.y}`);
    else if (e.type === 'build') e.kind === 'scarecrow' ? scarecrows++ : sprinklers++;
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
    earnedBy,
    bought: bought.slice(1),
    earned: s.stats.earned,
    withered: withered + turned,
    eaten,
    gifts,
    requests,
    lapsed: Math.max(0, lapsed - withdrawn),
    withdrawn,
    pinned,
    rep: s.rep,
    fields: s.parcels.filter((p) => p.owned).length,
    sleepHour,
    workEnd,
    tiredDays,
    staminaLeft,
    crows,
    bugs,
    bugDeaths,
    heatDays,
    heatDeaths,
    scarecrows,
    sprinklers,
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
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : 'n/a');
// The quick bot, then the bot at a person's pace (about one action every 1.3 seconds, like the playtest).
for (const [label, pace] of [['the quick bot', undefined], ['the bot at a person’s pace', 0.9]] as const) {
  const farms: Farm[] = [];
  for (let i = 0; i < FARMS; i++) farms.push(sunupFarm(42 + i * 1013, pace));
  const avg = (f: (x: Farm) => number) => farms.reduce((a, x) => a + f(x), 0) / farms.length;
  const hours = farms.flatMap((f) => f.sleepHour);
  console.log(`\nSunup over ${FARMS} farms, ${DAYS} days each (${label})`);
  const coinsOn = (d: number) => `day ${d} ${num(avg((f) => f.morning[d] ?? f.coins))}`;
  console.log(`  morning coins          ${[10, 20, 30].map(coinsOn).join(', ')}  (day 31 per farm: ${farms.map((f) => num(f.coins)).join(' ')})`);
  console.log(`  earned by the morning  ${[10, 20, 30].map((d) => `day ${d} ${num(avg((f) => f.earnedBy[d] ?? f.earned))}`).join(', ')}`);
  const fieldDays = [0, 1, 2, 3, 4].map((k) => {
    const got = farms.map((f) => f.bought[k]).filter((d) => d > 0);
    return `field ${k + 2} ${got.length ? `day ${(got.reduce((a, b) => a + b, 0) / got.length).toFixed(0)}` : 'never'} (${got.length}/${farms.length})`;
  });
  console.log(`  fields bought          ${fieldDays.join(', ')}`);
  console.log(`  waterings per harvest  ${(avg((f) => f.waterings) / Math.max(1, avg((f) => f.harvests))).toFixed(2)}  (${avg((f) => f.waterings).toFixed(0)} waterings, ${avg((f) => f.harvests).toFixed(0)} harvests)`);
  console.log(`  days with no income    ${avg((f) => f.noIncome).toFixed(1)}  (per farm: ${farms.map((f) => f.noIncome).join(' ')})`);
  console.log(`  earned                 ${num(avg((f) => f.earned))}; crops lost ${avg((f) => f.withered).toFixed(1)} withered or taken by the turn, ${avg((f) => f.eaten).toFixed(1)} eaten by crows; rescued ${avg((f) => f.gifts).toFixed(1)} times`);
  // Requests, as pinned. The first (three radishes) is left out of the shares: it is the lesson's, and the same before and after.
  const all = farms.flatMap((f) => f.pinned);
  const later = farms.flatMap((f) => f.pinned.slice(1));
  const ratios = all.map((p) => p.ratio);
  const growing = later.filter((p) => p.growing > 0).length;
  const met = later.filter((p) => p.growing + p.stock >= p.n).length;
  const short = later.filter((p) => p.cost > 0 && (p.cost > p.budget || p.sowBy < p.day)).length;
  console.log(`  requests               ${avg((f) => f.requests).toFixed(1)} filled, ${avg((f) => f.withdrawn).toFixed(1)} withdrawn, ${avg((f) => f.lapsed).toFixed(1)} lapsed unfilled; reputation ${avg((f) => f.rep).toFixed(1)}`);
  console.log(`  requests after the first: ${later.length}; asked for a crop already growing ${pct(growing, later.length)} (already met when pinned ${pct(met, later.length)}); seed out of reach by its sow-by day ${pct(short, later.length)}`);
  console.log(`  pay against market     median ${med(ratios).toFixed(2)}x, lowest ${Math.min(...ratios).toFixed(2)}x, highest ${Math.max(...ratios).toFixed(2)}x; largest reward ${num(Math.max(...all.map((p) => p.reward)))}`);
  const pairs = farms.flatMap((f) => {
    const byDay = new Map<number, Pinned[]>();
    for (const p of f.pinned.slice(1)) byDay.set(p.day, [...(byDay.get(p.day) ?? []), p]);
    return [...byDay.values()];
  });
  console.log(`  mornings with new requests: ${pairs.length} (${pct(pairs.filter((x) => x.length >= 2).length, pairs.length)} of them a pair to choose between)`);
  const ends = farms.flatMap((f) => f.workEnd).filter((w) => w.day > 3);
  const band = (lo: number, hi: number, dry = false) => ends.filter((w) => w.fields >= lo && w.fields <= hi && (!dry || !w.wet));
  const show = (xs: { hour: number; low: number }[]) =>
    xs.length ? `last job median ${fmtH(med(xs.map((x) => x.hour)))}, three in four by ${fmtH(quart(xs.map((x) => x.hour), 0.75))}, latest ${fmtH(Math.max(...xs.map((x) => x.hour)))}; stamina low median ${med(xs.map((x) => x.low)).toFixed(0)}, lowest ${Math.min(...xs.map((x) => x.low)).toFixed(0)} (${xs.length} days)` : 'no days';
  console.log(`  the day, 1 field       ${show(band(1, 1))}`);
  console.log(`           1 field, dry  ${show(band(1, 1, true))}`);
  console.log(`           2 fields      ${show(band(2, 2))}`);
  console.log(`           2 fields, dry ${show(band(2, 2, true))}`);
  console.log(`           3 to 6 fields ${show(band(3, 6))}`);
  const spring = farms.flatMap((f) => f.workEnd).filter((w) => w.day > 3 && w.day <= 10);
  console.log(`           spring (days 4 to 10) ${show(spring)}`);
  console.log(`  day ends (bot sleeps)  median ${fmtH(med(hours))}, earliest ${fmtH(Math.min(...hours))}, latest ${fmtH(Math.max(...hours))}; stamina ran out first on ${avg((f) => f.tiredDays).toFixed(1)} days; median stamina left ${med(farms.flatMap((f) => f.staminaLeft)).toFixed(0)}`);
  console.log(`  pressure               crows ${avg((f) => f.crows).toFixed(1)} (ate ${avg((f) => f.eaten).toFixed(1)}), bug outbreaks ${avg((f) => f.bugs).toFixed(1)} (crops lost to bugs ${avg((f) => f.bugDeaths).toFixed(1)}), heat waves ${avg((f) => f.heatDays).toFixed(1)} (crops lost on heat nights ${avg((f) => f.heatDeaths).toFixed(1)}); built ${avg((f) => f.scarecrows).toFixed(1)} scarecrows, ${avg((f) => f.sprinklers).toFixed(1)} sprinklers`);
}
