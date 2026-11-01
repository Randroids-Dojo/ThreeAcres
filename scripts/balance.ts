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
// Round 4 adds, for each pair as it is pinned: how far apart its two notes are
// on what they earn over their seed for each plot and day; what requests paid
// over market on crops already growing; the active seconds of each day (the
// farmer walking or working) beside the hour of the last job; crops lost by
// cause; and how steady the stream of requests is (mornings between new ones).
// It reads requests only through what the round 3 rules had too, so it runs
// on the committed code as well, for a before and after.
// npx tsx scripts/balance.ts [days] [farms] [--sunup] [--person]
import { CROP_IDS, CROPS } from '../src/sim/crops';
import { PRESET_IDS } from '../src/sim/presets';
import { play, world } from '../tests/helpers';
import type { CropId, Order, WorldState } from '../src/sim/types';

const DAYS = Number(process.argv[2] ?? 30);
const FARMS = Number(process.argv[3] ?? 6);
const ONLY_SUNUP = process.argv.includes('--sunup');
const ONLY_PERSON = process.argv.includes('--person');

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
  /** Crops already in the crate or growing that will be ripe by its due day, and how many it has you sow fresh. */
  base: number;
  fresh: number;
  /** What it earns over its seed for each plot and day its fresh sowing takes. */
  perDay: number;
  /** What it pays over market on the crops already growing it counts. */
  basePremium: number;
  pair: number | undefined;
  /** Fields owned when it was pinned. */
  fields: number;
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
  /** Withdrawn by day because seed went in for the other of its pair. */
  closed: number;
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
  /** Crops that withered dry (not bugs, not heat), and that the season's turn took. */
  dryDeaths: number;
  turned: number;
  /** Real seconds each day the farmer was walking or working, with the fields owned that day. */
  active: { secs: number; fields: number; day: number }[];
  /** Mornings that brought new requests (after the first was filled). */
  newMornings: number[];
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
  // What the crate and the ground will have by its due day (as the rules count it), so the rest is sown fresh.
  let base = stock;
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (c && !c.dead && c.kind === it.crop && ownedAt(s, i) && CROPS[c.kind].days - c.age <= o.due - s.day) base++;
  }
  // Requests for the same crop that come first (due sooner, or pinned first) take theirs from the crate first.
  for (const q of s.orders) if (q.id !== o.id && q.items[0].crop === it.crop && (q.due < o.due || (q.due === o.due && q.id < o.id))) base -= q.items[0].n;
  base = Math.max(0, Math.min(base, it.n));
  const fresh = Math.max(1, it.n - base);
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
    base,
    fresh,
    perDay: (o.reward - base * d.price - fresh * d.seed) / (fresh * d.days),
    // Pay is spread evenly over the count under the old rules: the share of it on crops already growing, over market.
    basePremium: (o as Order & { fresh?: number }).fresh !== undefined ? Math.max(0, o.reward - (it.n - (o as Order & { fresh?: number }).fresh!) * d.price - (o as Order & { fresh?: number }).fresh! * d.price * 1.8) : Math.max(0, base * (o.reward / it.n - d.price)),
    pair: (o as Order & { pair?: number }).pair,
    fields: s.parcels.filter((p) => p.owned).length,
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
  let activeSecs = 0;
  let lapsedReported = 0;
  const active: Farm['active'] = [];
  const newMornings: number[] = [];
  let firstFilled = false;
  const r = play(s, DAYS, {
    pace,
    each: (st: WorldState) => {
      const f = st.actors[0];
      if (st.turnover < 0 && (f.task || f.path.length || f.aim || f.moving)) activeSecs += 1 / 30;
      if (st.report && st.report !== seenReport) {
        seenReport = st.report;
        turned += st.report.turned ?? 0;
        if (st.report.gift) gifts++;
        withdrawn += ((st.report as unknown as { withdrawn?: unknown[] }).withdrawn ?? []).length;
        lapsedReported += ((st.report as unknown as { lapsed?: unknown[] }).lapsed ?? []).length;
      }
      if (st.turnover < 0) low = Math.min(low, st.stamina);
      // Note the moment the day ends: what hour, and was it stamina that ended it.
      if (st.turnover >= 0 && st.day === lastDay) {
        lastDay = -1;
        sleepHour.push(6 + st.minute / 60);
        staminaLeft.push(st.stamina);
        if (st.stamina < 4) wasTired = true;
        workEnd.push({ hour: lastJob < 0 ? 6 : 6 + lastJob / 60, low, fields: st.parcels.filter((p) => p.owned).length, day: st.day, wet: st.weather === 'rain' || st.weather === 'storm' });
        active.push({ secs: activeSecs, fields: st.parcels.filter((p) => p.owned).length, day: st.day });
        activeSecs = 0;
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
      let fresh = false;
      for (const o of st.orders) {
        if (seenOrders.has(o.id)) continue;
        seenOrders.add(o.id);
        pinned.push(pinOf(st, o));
        if (firstFilled) fresh = true;
      }
      if (fresh && newMornings[newMornings.length - 1] !== st.day) newMornings.push(st.day);
      if (ev.some((e) => e.type === 'request' && e.done)) firstFilled = true;
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
  let dryDeaths = 0;
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
      else dryDeaths++;
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
    lapsed: lapsedReported,
    withdrawn,
    closed: Math.max(0, lapsed - withdrawn - lapsedReported),
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
    dryDeaths: Math.max(0, dryDeaths - heatDeaths),
    turned,
    active,
    newMornings,
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
for (const [label, pace] of ([['the quick bot', undefined], ['the bot at a person’s pace', 0.9]] as const).filter(([, p]) => !ONLY_PERSON || p)) {
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
  const met = later.filter((p) => p.base >= p.n).length;
  const short = later.filter((p) => p.cost > 0 && (p.cost > p.budget || p.sowBy < p.day)).length;
  console.log(`  requests               ${avg((f) => f.requests).toFixed(1)} filled, ${avg((f) => f.withdrawn).toFixed(1)} withdrawn in the morning, ${avg((f) => f.closed).toFixed(1)} closed by day when the other of the pair was sown, ${avg((f) => f.lapsed).toFixed(1)} lapsed unfilled; reputation ${avg((f) => f.rep).toFixed(1)}`);
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
  // Round 4.
  const groups = farms.flatMap((f) => {
    const byPair = new Map<string, Pinned[]>();
    for (const p of f.pinned.slice(1)) if (p.pair !== undefined) byPair.set(`${p.day}:${p.pair}`, [...(byPair.get(`${p.day}:${p.pair}`) ?? []), p]);
    return [...byPair.values()].filter((g) => g.length === 2);
  });
  const gaps = groups.map(([a, b]) => Math.abs(a.perDay - b.perDay) / Math.max(Math.abs(a.perDay), Math.abs(b.perDay), 1e-9));
  const totals = groups.map(([a, b]) => {
    const na = a.reward - a.base * CROPS[a.crop].price - a.fresh * CROPS[a.crop].seed;
    const nb = b.reward - b.base * CROPS[b.crop].price - b.fresh * CROPS[b.crop].seed;
    return Math.abs(na - nb) / Math.max(na, nb, 1);
  });
  console.log(`  pairs                  ${groups.length}; gap on earnings per plot and day: median ${(100 * med(gaps)).toFixed(0)}%, within 10% ${pct(gaps.filter((g) => g <= 0.1).length, gaps.length)}, largest ${(100 * Math.max(0, ...gaps)).toFixed(0)}%; gap on what each clears in all: median ${(100 * med(totals)).toFixed(0)}%`);
  const freshRatio = later.map((p) => (p.reward - p.base * CROPS[p.crop].price) / (p.fresh * CROPS[p.crop].price));
  console.log(`  pay on what is sown    median ${med(freshRatio).toFixed(2)}x market, lowest ${Math.min(...freshRatio).toFixed(2)}x, highest ${Math.max(...freshRatio).toFixed(2)}x; premium paid on crops already growing ${num(avg((f) => f.pinned.reduce((a, p) => a + p.basePremium, 0)))} a farm; median reward ${num(med(later.map((p) => p.reward)))}`);
  const bySize = (lo: number, hi: number) => {
    const xs = later.filter((p) => p.fields >= lo && p.fields <= hi).map((p) => p.reward - p.base * CROPS[p.crop].price);
    return xs.length ? `median ${num(med(xs))}, largest ${num(Math.max(...xs))} (${xs.length})` : 'none';
  };
  console.log(`  pay for what is sown   1 field ${bySize(1, 1)}; 2 fields ${bySize(2, 2)}; 3 to 6 ${bySize(3, 6)}`);
  const streams = farms.map((f) => {
    const m = f.newMornings;
    let gap = 0;
    for (let i = 1; i < m.length; i++) gap = Math.max(gap, m[i] - m[i - 1]);
    return { n: m.length, gap };
  });
  console.log(`  request stream         mornings with new requests after the first is filled: ${(streams.reduce((a, x) => a + x.n, 0) / farms.length).toFixed(1)} a farm; longest wait between them median ${med(streams.map((x) => x.gap))} days, worst ${Math.max(...streams.map((x) => x.gap))}`);
  const act = farms.flatMap((f) => f.active).filter((a) => a.day > 3);
  const actBy = (lo: number, hi: number) => {
    const xs = act.filter((a) => a.fields >= lo && a.fields <= hi).map((a) => a.secs);
    return xs.length ? `median ${med(xs).toFixed(0)} s, three in four under ${quart(xs, 0.75).toFixed(0)} s (${xs.length} days)` : 'no days';
  };
  console.log(`  active seconds a day   1 field ${actBy(1, 1)}; 2 fields ${actBy(2, 2)}; 3 to 6 ${actBy(3, 6)}`);
  console.log(`  crops lost             ${avg((f) => f.dryDeaths).toFixed(1)} dry, ${avg((f) => f.heatDeaths).toFixed(1)} on heat nights, ${avg((f) => f.bugDeaths).toFixed(1)} to bugs, ${avg((f) => f.eaten).toFixed(1)} to crows, ${avg((f) => f.turned).toFixed(1)} to the turn (a farm)`);
  console.log(`  pressure               crows ${avg((f) => f.crows).toFixed(1)} (ate ${avg((f) => f.eaten).toFixed(1)}), bug outbreaks ${avg((f) => f.bugs).toFixed(1)} (crops lost to bugs ${avg((f) => f.bugDeaths).toFixed(1)}), heat waves ${avg((f) => f.heatDays).toFixed(1)} (crops lost on heat nights ${avg((f) => f.heatDeaths).toFixed(1)}); built ${avg((f) => f.scarecrows).toFixed(1)} scarecrows, ${avg((f) => f.sprinklers).toFixed(1)} sprinklers`);
}
