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
// Round 5 adds morning coins for every day (the median farm, and the poorest
// and richest), crops lost to crows on flock days, and, with --pairs, how
// often the better of a pair depends on the farm: every pair the bot is
// offered is played out both ways from the same morning (the other let go,
// as the board's Accept does) by a diligent player and a busy one (to bed at
// 10:00), to the morning after the later due day, and the farm's worth then
// compared (coins, the crate at market, growing crops by how far grown). It
// takes a pick only through what the round 4 rules had too (the other of the
// pair leaves the board), so it runs on the committed code as well.
// Round 6 adds, for each request as it is pinned, how much of it the rules
// already count as met from crops planted before it (or in the crate), and,
// for each request filled, whether at least its count was sown after it was
// pinned; for each pair, whether the farm could sow both (free soil and coins
// by their sow-by days, and today); the active seconds of wet days early on;
// and crops crows took by day against what the morning card reported. It
// reads the rules only through what round 5 had too (requestHave, farmPlots,
// sowBudget, stillToSow), so it runs on the committed code for a before.
// Round 7 adds, for every day, whether it ended with bare soil and coins
// below the cheapest seed that could go in (a broke day: the seventh playtest
// had 0 coins and 10 to 22 bare plots from Summer 1 to 5), and the bare
// plots then; the days with under 10 s of work; and for each offer as it is
// pinned, whether a pair names two different crops, whether it names the
// same crops as the offer before, and whether the farm could take both (on
// the farm's own soil and coins, counted here, not by the rules). It reads
// the rules only through what round 6 had too, so it runs on the committed
// code for a before.
// Round 8 adds, for every day, the seconds spent watering (water and refill
// jobs, and the walks to them with the can in hand) beside the day's active
// seconds, by fields owned, and the stamina the day used; the days with under
// 10 s of work by fields owned; for each pair as it is pinned, whether each
// side's seed could be paid for with the coins in hand that morning and
// whether the two are within a fifth of each other on what they clear for
// each plot-day; requests filled short, and the reputation on days 10, 20
// and 30. It reads the rules only through what round 7 had too, so it runs on
// the committed code for a before.
// Round 9 adds the season's fair (fairs won of those held, by season), the
// mornings with 1,500 coins or more and nothing the farm may buy (no field or
// tool its reputation and coins allow) and the longest run of them, and for
// each pair as pinned whether one side wins on what it clears, its plots and
// its days at once (headlined on the board now), and whether either side
// could not be met at that moment. It reads the rules only through what round
// 8 had too, so it runs on the committed code for a before.
// Round 10 adds what requests bring in against the crate (their gains over
// market, and with the crops sown for them at market, as a share of all
// earned), and, with --follow, the fairs met by a player who follows the
// lessons in the simulation (the tutor runs beside the farm; `follow` in
// tests/helpers.ts) and takes one side of every pair: the bigger number (as
// the tester did), the smaller, or the one in time for the fair, sowing every
// bare plot or only what a line or a request asks. It reads the rules only
// through what round 9 had too, so it runs on the committed code for a before.
// Round 11 adds, with --fairs, the fairs over a whole year (41 days, a dozen farms) for the careful bot at a person's pace and
// for each lesson-following player, what the first two fairs come to, and the pairs on mornings with room for one, in
// summer and in all; and the coins a farm holds by season over two years, with what the crate paid and what requests
// gained. It reads the rules only through what round 10 had too, so it runs on the committed code for a before.
// npx tsx scripts/balance.ts [days] [farms] [--sunup] [--person] [--pairs] [--mornings] [--follow] [--fairs]
import * as C from '../src/sim/constants';
import { sowing } from '../src/sim/actions';
import { PARCELS } from '../src/sim/map';
import { CROP_IDS, CROPS } from '../src/sim/crops';
import { PRESET_IDS } from '../src/sim/presets';
import * as G from '../src/sim/goals';
import { follow, play, world } from '../tests/helpers';
import type { CropId, Order, WorldState } from '../src/sim/types';

const DAYS = Number(process.argv[2] ?? 30);
const FARMS = Number(process.argv[3] ?? 6);
const ONLY_SUNUP = process.argv.includes('--sunup');
const ONLY_PERSON = process.argv.includes('--person');
const PAIRS = process.argv.includes('--pairs');
/** Round 6: only the tester-like mornings (quick). */
const ONLY_MORNINGS = process.argv.includes('--mornings');
/** Round 10: only the lesson-following players and their fairs. */
const ONLY_FOLLOW = process.argv.includes('--follow');

/** Round 11: only the year's fairs, the pairs on mornings with room for one, and two years of coins. */
const ONLY_FAIRS = process.argv.includes('--fairs');

if (!ONLY_SUNUP && !ONLY_MORNINGS && !ONLY_FOLLOW && !ONLY_FAIRS) {
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
  /** Round 6: its id, and what the rules counted as already met when it was pinned (crops planted before it, the crate). */
  id: number;
  have: number;
  /** Plants by the farmer before it was pinned (to count what was sown for it by the time it was filled). */
  plantSeq: number;
}

/** Round 6: a pair as pinned, and whether the farm could sow both. */
interface PairPin {
  /** Plots and coins both need, against the soil and coins free by their sow-by days (the larger), and today. */
  competeBy: boolean;
  competeToday: boolean;
  soilBy: boolean;
  coinsBy: boolean;
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
  /** Real seconds each day the farmer was walking or working, with the fields owned that day, and whether it rained. */
  active: { secs: number; fields: number; day: number; wet?: boolean }[];
  /** Mornings that brought new requests (after the first was filled). */
  newMornings: number[];
  /** Flock days (crows about), and crops crows took on them. */
  flocks: number;
  flockEaten: number;
  /** Plot-nights in spring (days 3 to 12) left bare with not the coins for one seed of anything that could go in. */
  idleSoil: number;
  /** Pairs as pinned, with the farm that morning (for --pairs). */
  pairs: { state: WorldState; ids: [number, number] }[];
  /** Round 6: pairs and whether they compete; requests filled, and how many with fewer sown after it was pinned than it asked. */
  pairPins: PairPin[];
  filledReq: number;
  filledFromOld: number;
  /** Crops crows took by day (events while awake) and the crops the morning cards said crows ate. */
  eatenByDay: number;
  eatenReported: number;
  /** Withdrawn or lapsed requests that said why (round 6), of all that went. */
  goneWhy: number;
  goneAll: number;
  /** Round 7: days that ended with bare soil and coins below the cheapest seed that could go in, with the bare plots then. */
  brokeDays: { day: number; bare: number }[];
  /** Round 7: offers as pinned: a pair of two different crops, the same crops as the offer before, and whether the farm could take both. */
  offers: { pair: boolean; differ: boolean; repeat: boolean; both: boolean }[];
  /** Round 8: each day's watering seconds against its active seconds, by fields, and the stamina it used. */
  watering: { secs: number; water: number; fields: number; day: number; wet: boolean; used: number }[];
  /** Round 8: pairs as pinned: each side's seed within the coins in hand, and the two within a fifth on what they clear a plot-day. */
  pairs8: { affordable: number; today: number; within: boolean; gap: number }[];
  /** Round 8: requests filled short, and the reputation on the mornings of days 10, 20 and 30. */
  shortFills: number;
  repOn: Record<number, number>;
  /** Round 8: the day the can reached copper and gold (0: never). */
  canOn: [number, number];
  /** Round 9: each fair as judged (its day, got, want, won); mornings with 1,500+ coins and nothing to buy, by day. */
  fairs: { day: number; got: number; want: number; won: boolean }[];
  idleRich: number[];
  /** Round 9: pairs as pinned: one side wins on clear, plots and days at once; a side that could not be met then. */
  pairs9: { dominated: boolean; unmet: number }[];
  /** Round 10: what requests paid over market (their gains), and the crops sown for them, at market. */
  reqGain: number;
  reqCrops: number;
}

/**
 * Round 9: is there anything the farm's coins can go towards: the next field or a tool whose reputation the farm
 * has (saving up for its price counts)? With 1,500 coins and nothing, the coins have no use.
 */
function canBuyAnything(s: WorldState): boolean {
  const next = s.parcels.find((p) => !p.owned);
  if (next && s.rep >= ((C as unknown as { FIELD_REP: number[] }).FIELD_REP[next.id] ?? 0)) return true;
  for (const t of ['can', 'hoe'] as const) {
    const u = C.TOOL_UPGRADES[t][s.tools[t]];
    if (u && s.rep >= u.rep) return true;
  }
  return false;
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
  // What the rules count as met already, as if it were taken now (round 5: the crate and every crop of its kind growing).
  const have = G.requestHave(s, { ...o, taken: true } as Order);
  return {
    id: o.id,
    have,
    plantSeq: 0,
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

/**
 * The coins at which a player who does what the field lesson says buys the second field: when the line comes up.
 * Read from the rules under test (round 5 waits for `FIELD_SEED` more than the price, for seed).
 */
const FIELD_LINE = 250 + ((C as Record<string, unknown>).FIELD_SEED as number | undefined ?? 0);

function sunupFarm(seed: number, pace?: number, followField = false): Farm {
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
  let flocks = 0;
  let flockEaten = 0;
  const flockDays = new Set<number>();
  let idleSoil = 0;
  const pairs: Farm['pairs'] = [];
  const pairPins: PairPin[] = [];
  const plantsBy: { crop: CropId; seq: number }[] = [];
  let plantSeq = 0;
  const pinById = new Map<number, Pinned>();
  let filledReq = 0;
  let filledFromOld = 0;
  let eatenByDay = 0;
  let eatenReported = 0;
  let goneWhy = 0;
  let goneAll = 0;
  const brokeDays: Farm['brokeDays'] = [];
  const offers: Farm['offers'] = [];
  let lastKey = '';
  const watering: Farm['watering'] = [];
  const pairs8: Farm['pairs8'] = [];
  let shortFills = 0;
  const repOn: Record<number, number> = {};
  let waterSecs = 0;
  const canOn: [number, number] = [0, 0];
  const fairs: Farm['fairs'] = [];
  const idleRich: number[] = [];
  const pairs9: Farm['pairs9'] = [];
  let reqGain = 0;
  let reqCrops = 0;
  const r = play(s, DAYS, {
    pace,
    each: (st: WorldState) => {
      const f = st.actors[0];
      // A player who buys the second field the moment the field lesson says to.
      if (followField && !st.parcels[1].owned && st.coins >= FIELD_LINE && st.turnover < 0) return [{ type: 'buyParcel', id: 1 }];
      if (st.turnover < 0 && (f.task || f.path.length || f.aim || f.moving)) {
        activeSecs += 1 / 30;
        // Watering: a water or refill job, or on the way to one with the can in hand.
        if (f.task ? f.task.verb === 'water' || f.task.verb === 'refill' : st.tool === 'can' || (f.aim && (f.aim.verb === 'water' || f.aim.verb === 'refill'))) waterSecs += 1 / 30;
      }
      if (st.report && st.report !== seenReport) {
        seenReport = st.report;
        turned += st.report.turned ?? 0;
        if (st.report.gift) gifts++;
        withdrawn += ((st.report as unknown as { withdrawn?: unknown[] }).withdrawn ?? []).length;
        lapsedReported += ((st.report as unknown as { lapsed?: unknown[] }).lapsed ?? []).length;
        eatenReported += st.report.eaten;
        const fr = (st.report as unknown as { fair?: { got: number; want: number; won: boolean } }).fair;
        if (fr) fairs.push({ day: st.day - 1, ...fr });
        for (const g of [...((st.report as unknown as { withdrawn?: { why?: string }[] }).withdrawn ?? []), ...((st.report as unknown as { lapsed?: { why?: string }[] }).lapsed ?? [])]) {
          goneAll++;
          if (g.why) goneWhy++;
        }
      }
      if (st.turnover < 0) low = Math.min(low, st.stamina);
      // Note the moment the day ends: what hour, and was it stamina that ended it.
      if (st.turnover >= 0 && st.day === lastDay) {
        lastDay = -1;
        // Spring soil left bare tonight for want of coins.
        if (st.day >= 3 && st.day <= 12) {
          const cheapest = Math.min(...CROP_IDS.filter((c) => sowing(st.day, c).ok).map((c) => CROPS[c].seed));
          if (st.coins < cheapest) for (let i = 0; i < st.plots.length; i++) if (ownedAt(st, i) && st.tiles[i] === 'field' && st.plots[i].tilled && !st.plots[i].crop && !st.builds.some((b) => b.y * st.W + b.x === i)) idleSoil++;
        }
        // Round 7: a broke day ends with bare soil and not the coins for one seed of anything that could go in.
        {
          const sowable = CROP_IDS.filter((c) => sowing(st.day, c).ok).map((c) => CROPS[c].seed);
          const cheapest = sowable.length ? Math.min(...sowable) : Infinity;
          let bare = 0;
          for (let i = 0; i < st.plots.length; i++) if (ownedAt(st, i) && st.tiles[i] === 'field' && st.plots[i].tilled && !st.plots[i].crop && !st.builds.some((b) => b.y * st.W + b.x === i)) bare++;
          if (bare > 0 && st.coins < cheapest && sowable.length) brokeDays.push({ day: st.day, bare });
        }
        sleepHour.push(6 + st.minute / 60);
        staminaLeft.push(st.stamina);
        if (st.stamina < 4) wasTired = true;
        workEnd.push({ hour: lastJob < 0 ? 6 : 6 + lastJob / 60, low, fields: st.parcels.filter((p) => p.owned).length, day: st.day, wet: st.weather === 'rain' || st.weather === 'storm' });
        active.push({ secs: activeSecs, fields: st.parcels.filter((p) => p.owned).length, day: st.day, wet: st.weather === 'rain' || st.weather === 'storm' });
        watering.push({ secs: activeSecs, water: waterSecs, fields: st.parcels.filter((p) => p.owned).length, day: st.day, wet: st.weather === 'rain' || st.weather === 'storm', used: st.staminaMax - low });
        activeSecs = 0;
        waterSecs = 0;
        heatNight = st.weather === 'heat';
        if (heatNight) heatDays++;
        lastJob = -1;
      }
      if (st.turnover < 0 && lastDay === -1) {
        lastDay = st.day;
        morning[st.day] = st.coins;
        repOn[st.day] = st.rep + ((st as WorldState & { repPart?: number }).repPart ?? 0);
        if (st.coins >= 1500 && !canBuyAnything(st)) idleRich.push(st.day);
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
        if (e.type === 'plant') plantsBy.push({ crop: e.crop, seq: plantSeq++ });
        // A crow that eats while the farmer is awake: by day (the night's are counted at nightfall).
        if (e.type === 'crowEat' && st.turnover < 0) eatenByDay++;
        // A request filled: was at least its count sown after it was pinned (else crops already planted filled it)?
        if (e.type === 'request' && e.done) {
          const pin = pinById.get(e.id);
          // (The first, the lesson's three radishes, is left out, as in the shares above.)
          if (pin && pin !== pinned[0]) {
            filledReq++;
            const since = plantsBy.filter((q) => q.crop === pin.crop && q.seq >= pin.plantSeq).length;
            if (since < pin.n) filledFromOld++;
          }
        }
      }
      for (const p of st.parcels) if (p.owned && p.id > 0 && !bought[p.id]) bought[p.id] = st.day;
      // Round 5: flock days, and what crows took on them (by day, or at bedtime from crows still to come).
      const flock = !!(st as WorldState & { flock?: boolean }).flock;
      if (flock && st.turnover < 0) flockDays.add(st.day);
      // Crows on a flock day: by day, or at bedtime (when the day's flock flag has just gone).
      for (const e of ev) if (e.type === 'crowEat' && (flockDays.has(st.day) || flockDays.has(st.day - 1))) flockEaten++;
      flocks = flockDays.size;
      // A pair just pinned: keep the farm as it was that moment, to play it out both ways (--pairs).
      const fresh2 = st.orders.filter((o) => !seenOrders.has(o.id) && (o as Order & { pair?: number }).pair !== undefined);
      if (PAIRS && fresh2.length === 2 && pairs.length < 10) pairs.push({ state: structuredClone(st), ids: [fresh2[0].id, fresh2[1].id] });
      if (fresh2.length === 2) pairPins.push(pairCompete(st, fresh2[0], fresh2[1]));
      if (fresh2.length === 2) {
        // Round 8: could each be started with the coins in hand, and how far apart are they on what they clear a plot-day?
        const worth = (o: Order) => (o.reward - o.items[0].n * CROPS[o.items[0].crop].seed) / (o.items[0].n * CROPS[o.items[0].crop].days);
        const [a, b2] = fresh2.map(worth);
        const gap = Math.max(a, b2) / Math.max(1e-9, Math.min(a, b2)) - 1;
        // Today's money: the coins in hand, and what the crops ripe this morning fetch at the crate when picked.
        let ripe = 0;
        for (let i = 0; i < st.plots.length; i++) {
          const c = st.plots[i].crop;
          if (c && !c.dead && c.stage === 4 && ownedAt(st, i)) ripe += CROPS[c.kind].price;
        }
        const seedOf = (o: Order) => o.items[0].n * CROPS[o.items[0].crop].seed;
        {
          // Round 9: the board's lines for each side: what it clears (pay less seed), its plots and its days.
          const tr = (o: Order) => ({ clear: o.reward - o.items[0].n * CROPS[o.items[0].crop].seed, plots: o.items[0].n, days: CROPS[o.items[0].crop].days });
          const [x, y] = fresh2.map(tr);
          const dom = (p: typeof x, q: typeof x) => p.clear >= q.clear && p.plots <= q.plots && p.days <= q.days;
          pairs9.push({ dominated: dom(x, y) || dom(y, x), unmet: fresh2.filter((o) => !!G.whyNot(st, o)).length });
        }
        pairs8.push({ affordable: fresh2.filter((o) => seedOf(o) <= st.coins).length, today: fresh2.filter((o) => seedOf(o) <= st.coins + ripe).length, within: gap <= 0.2 + 1e-9, gap });
      }
      for (const e of ev) if (e.type === 'request' && e.done && (e as { of?: number }).of) shortFills++;
      // Round 10: what requests bring in: their gain when filled, and their crops at the crate.
      for (const e of ev) {
        if (e.type === 'request' && e.done) reqGain += e.reward;
        if (e.type === 'harvest' && (e as { req?: number }).req !== undefined) reqCrops += CROPS[e.crop].price;
      }
      for (const l of [1, 2] as const) if (!canOn[l - 1] && (st.tools?.can ?? 0) >= l) canOn[l - 1] = st.day;
      // Round 7: each new offer (after the first request), a pair or one alone.
      const newOnes = st.orders.filter((o) => !seenOrders.has(o.id));
      if (newOnes.length && (seenOrders.size > 0 || newOnes.length > 1)) {
        const key = [...new Set(newOnes.map((o) => o.items[0].crop))].sort().join('+');
        if (newOnes.length === 2 || seenOrders.size > 0) offers.push({ pair: newOnes.length === 2, differ: newOnes.length === 2 && newOnes[0].items[0].crop !== newOnes[1].items[0].crop, repeat: key === lastKey, both: newOnes.length === 2 ? canTakeBoth(st, newOnes[0], newOnes[1]) : false });
        lastKey = key;
      }
      let fresh = false;
      for (const o of st.orders) {
        if (seenOrders.has(o.id)) continue;
        seenOrders.add(o.id);
        const pin = pinOf(st, o);
        pin.plantSeq = plantSeq;
        pinned.push(pin);
        pinById.set(o.id, pin);
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
    // (Round 7: a crop is paid for as it goes into the crate, by day.)
    if (e.type === 'sell' || (e.type === 'coins' && (e as { crate?: boolean }).crate) || (e.type === 'request' && e.done) || (e.type === 'order' && e.done)) sold = true;
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
    flocks,
    flockEaten,
    idleSoil,
    pairs,
    pairPins,
    filledReq,
    filledFromOld,
    eatenByDay,
    eatenReported,
    goneWhy,
    goneAll,
    brokeDays,
    offers,
    watering,
    pairs8,
    shortFills,
    repOn,
    canOn,
    fairs,
    idleRich,
    pairs9,
    reqGain,
    reqCrops,
  };
}

/**
 * Round 7: could the farm take both of a pair, counted here from the farm
 * itself and not by the rules' own measure: soil free now or freed by a crop
 * ripe by the later sow-by day, and coins in hand with what the crops ripe by
 * then fetch, after what taken requests still need planted.
 */
function canTakeBoth(s: WorldState, a: Order, b: Order): boolean {
  const by = Math.max(G.sowByOf(a), G.sowByOf(b));
  let room = 0;
  let coins = s.coins;
  for (let i = 0; i < s.plots.length; i++) {
    if (!ownedAt(s, i) || s.tiles[i] !== 'field' || s.builds.some((q) => q.y * s.W + q.x === i)) continue;
    const c = s.plots[i].crop;
    if (!c || c.dead) room++;
    else if (CROPS[c.kind].days - c.age <= by - s.day) {
      if (CROPS[c.kind].regrow === 0) room++;
      coins += CROPS[c.kind].price;
    }
  }
  for (const o of s.orders) {
    if (o === a || o === b || !G.isTaken(o)) continue;
    const still = G.stillToSow(s, o);
    room -= still;
    coins -= still * CROPS[o.items[0].crop].seed;
  }
  const need = (o: Order) => G.stillToSow(s, o);
  return need(a) + need(b) <= room && need(a) * CROPS[a.items[0].crop].seed + need(b) * CROPS[b.items[0].crop].seed <= coins;
}

/**
 * Could the farm sow both of a pair, the morning it was pinned? What each
 * still needs sown (its count less what the rules count as met already),
 * against the soil free and the coins by the sow-by days (the larger of the
 * two, after what the taken requests still need), and against today's.
 */
function pairCompete(s: WorldState, a: Order, b: Order): PairPin {
  const held = { plots: 0, coins: 0 };
  for (const o of s.orders) {
    if (!G.isTaken(o) || s.day > G.sowByOf(o)) continue;
    const still = G.stillToSow(s, o);
    held.plots += still;
    held.coins += still * CROPS[o.items[0].crop].seed;
  }
  const need = (o: Order) => Math.max(0, o.items[0].n - G.requestHave(s, { ...o, taken: true } as Order));
  const room = (o: Order) => G.farmPlots(s, Math.max(0, G.sowByOf(o) - s.day)).free - held.plots;
  const coins = (o: Order) => G.sowBudget(s, G.sowByOf(o)) - held.coins;
  const plots = need(a) + need(b);
  const cost = need(a) * CROPS[a.items[0].crop].seed + need(b) * CROPS[b.items[0].crop].seed;
  const soilBy = plots > Math.max(room(a), room(b));
  const coinsBy = cost > Math.max(coins(a), coins(b));
  const today = plots > G.farmPlots(s, 0).free - held.plots || cost > s.coins - held.coins;
  return { competeBy: soilBy || coinsBy, competeToday: today, soilBy, coinsBy };
}

/**
 * Round 6: mornings like the tester's, not the bot's (which sows every bare
 * plot with market crops at once, so its pairs nearly always overflow the
 * soil): farms of one to three fields, 150 to 3,000 coins, on sowing days
 * across the year, with nothing growing, or with a third of the soil sown
 * with each crop in season a day earlier. For each, the pair or single the
 * rules offer: how much the rules count as met already, and whether a pair
 * competes for the soil or the coins.
 */
function syntheticMornings(): void {
  let pairs = 0;
  let compete = 0;
  let soil = 0;
  let coins = 0;
  let offers = 0;
  let counted = 0;
  let grown = 0;
  let seed = 1;
  let differ = 0;
  let clash = 0;
  let repeats = 0;
  let seconds = 0;
  for (const fields of [1, 2, 3]) for (const purse of [150, 400, 1200, 3000]) for (const day of [4, 6, 13, 16, 24, 26, 34]) for (const sown of [false, true]) {
    const s = world('sunup', seed++ * 7919);
    for (const id of ['pull', 'water', 'well', 'sleep', 'broke', 'plant', 'requests', 'deliver']) s.learn.push(`lesson:${id}`);
    for (const f of ['can', 'sleep', 'coins', 'seeds', 'stamina', 'board', 'requests']) s.learn.push(f);
    s.day = day;
    s.rep = 3;
    s.requested = 1;
    s.orders = [];
    s.coins = purse;
    s.weather = 'sun';
    s.forecast = ['sun', 'sun', 'sun'];
    for (let i = 1; i < fields; i++) {
      const pc = s.parcels[i];
      pc.owned = true;
      for (let y = pc.y; y < pc.y + pc.h; y++) for (let x = pc.x; x < pc.x + pc.w; x++) s.plots[y * s.W + x].tilled = true;
    }
    for (const q of s.plots) q.crop = null;
    if (sown) {
      const kinds = CROP_IDS.filter((c) => sowing(day, c).ok && CROPS[c].regrow === 0);
      const tiles = s.plots.map((_, i) => i).filter((i) => ownedAt(s, i) && s.tiles[i] === 'field');
      tiles.slice(0, Math.floor(tiles.length / 3)).forEach((i, k) => {
        s.plots[i].crop = { id: s.nextId++, kind: kinds[k % kinds.length], age: 1, stage: 1, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: day - 1 };
        grown++;
      });
    }
    const offer = G.offerRequests(s);
    s.orders.push(...offer);
    for (const o of offer) {
      offers++;
      if (G.requestHave(s, { ...o, taken: true } as Order) > 0) counted++;
    }
    if (offer.length === 2) {
      pairs++;
      const c = pairCompete(s, offer[0], offer[1]);
      if (c.competeBy) compete++;
      if (c.soilBy) soil++;
      if (c.coinsBy) coins++;
      if (offer[0].items[0].crop !== offer[1].items[0].crop) differ++;
      if (!canTakeBoth(s, offer[0], offer[1])) clash++;
    }
    // The morning after, with nothing taken (both let go): does the board offer the same crops again?
    if (offer.length) {
      const key = [...new Set(offer.map((o) => o.items[0].crop))].sort().join('+');
      s.orders = [];
      const again = G.offerRequests(s);
      if (again.length) {
        seconds++;
        if ([...new Set(again.map((o) => o.items[0].crop))].sort().join('+') === key) repeats++;
      }
    }
  }
  console.log(`\nSunup, mornings like the tester's (1 to 3 fields, 150 to 3,000 coins, nothing growing or a third sown a day earlier): ${offers} offers, ${pairs} pairs`);
  console.log(`  offers the rules count as met in part already (crops growing, the crate): ${pct(counted, offers)}`);
  console.log(`  pairs that compete (the farm could not sow both by their sow-by days): ${pct(compete, pairs)} (for soil ${pct(soil, pairs)}, for coins ${pct(coins, pairs)})${grown ? '' : ''}`);
  console.log(`  round 7: pairs of two different crops ${pct(differ, pairs)}; pairs the farm could not take both of, counted from the farm ${pct(clash, pairs)}; the next offer names the same crops ${pct(repeats, seconds)} (${seconds} next offers)`);
}

/**
 * What a farm is worth on a morning: its coins, the crate at market, growing crops by how far grown, and what it
 * has bought at what it cost (fields, the smith's tools, scarecrows, sprinklers by the mornings they have left), so a
 * pick that lets the farm buy a field sooner is not counted as poorer for it.
 */
function worth(s: WorldState): number {
  let v = s.coins;
  for (const p of s.parcels) if (p.owned && p.id > 0) v += PARCELS[p.id].price;
  for (const t of ['can', 'hoe'] as const) for (let l = 0; l < (s.tools?.[t] ?? 0); l++) v += C.TOOL_UPGRADES[t][l].cost;
  for (const b of s.builds) v += b.kind === 'sprinkler' ? (C.BUILD_COST.sprinkler * ((b as { left?: number }).left ?? 10)) / 10 : C.BUILD_COST.scarecrow;
  for (const c of CROP_IDS) v += s.stock[c].reduce((a, b) => a + b, 0) * CROPS[c].price;
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (!c || c.dead || !ownedAt(s, i)) continue;
    const d = CROPS[c.kind];
    v += d.seed + (d.price - d.seed) * Math.min(1, c.age / d.days);
  }
  return v;
}

/** The sort of a request (round 5), or '' on rules without them. */
const kindOf = (o: Order) => (o as Order & { kind?: string }).kind ?? '';
const BOLD = new Set(['rush', 'long', 'big']);

/**
 * Play one pair out both ways from the morning it was pinned, with a player
 * that sleeps at `bedtime` (game minutes after 6:00; undefined: when the work
 * is done). The other of the pair leaves the board, as Accept lets it go.
 * Returns the farm's worth the morning after the later due day, each way.
 */
function playOut(start: WorldState, ids: [number, number], bedtime?: number): [number, number] {
  // Each way twice, the second with the weather and pests drawn differently, and the two averaged, so chance moves the
  // call less.
  const shaken = structuredClone(start);
  shaken.rng = (shaken.rng ^ 0x5bd1e995) | 0;
  const way = (a: number, b: number) => (playPick(start, a, b, bedtime) + playPick(shaken, a, b, bedtime)) / 2;
  return [way(ids[0], ids[1]), way(ids[1], ids[0])];
}

/** One way of a pair: `id` taken, `mate` let go, played to the morning after the later of the two due days. */
function playPick(start: WorldState, id: number, mate: number, bedtime?: number): number {
  const due = Math.max(...start.orders.filter((o) => o.id === id || o.id === mate).map((o) => o.due));
  const days = Math.max(1, due - start.day + 1);
  const s = structuredClone(start);
  s.orders = s.orders.filter((o) => o.id !== mate);
  const o = s.orders.find((q) => q.id === id) as Order & { taken?: boolean };
  if (o && o.taken === false) o.taken = true;
  // Only this pair's pick counts: requests pinned later in the play-out leave the board at once.
  const keep = new Set(s.orders.map((q) => q.id));
  play(s, days, {
    pace: 0.9,
    each: (st) => {
      if (st.orders.some((q) => !keep.has(q.id))) st.orders = st.orders.filter((q) => keep.has(q.id));
      return bedtime !== undefined && st.turnover < 0 && st.minute >= bedtime && st.rules.clock === 'day' ? [{ type: 'sleep' }] : [];
    },
  });
  return worth(s);
}

/** The same pick played out with two more draws of the weather and pests, averaged as `playOut` does: what chance alone moves the call by. */
function noiseFloor(start: WorldState, id: number, mate: number): number {
  const draw = (k: number) => {
    const s = structuredClone(start);
    s.rng = (s.rng ^ k) | 0;
    return playPick(s, id, mate);
  };
  return (draw(0x1234567) + draw(0x7654321)) / 2 - (draw(0x2468ace) + draw(0x13579bd)) / 2;
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
for (const [label, pace, follow] of ([['the quick bot', undefined, false], ['the bot at a person’s pace', 0.9, false], [`the bot at a person’s pace, buying the second field when the field lesson says (${FIELD_LINE} coins)`, 0.9, true]] as const).filter(([, p]) => !ONLY_MORNINGS && !ONLY_FOLLOW && !ONLY_FAIRS && (!ONLY_PERSON || p))) {
  if (follow && PAIRS) continue;
  const farms: Farm[] = [];
  for (let i = 0; i < FARMS; i++) farms.push(sunupFarm(42 + i * 1013, pace, follow));
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
  // Round 5.
  console.log(`  flock days             ${avg((f) => f.flocks).toFixed(1)} a farm; crops crows took on them ${avg((f) => f.flockEaten).toFixed(1)}`);
  const daysRow = Array.from({ length: DAYS }, (_, i) => i + 1);
  const at = (f: Farm, d: number) => f.morning[d] ?? f.coins;
  console.log(`  morning coins by day (median farm; poorest and richest)`);
  for (let i = 0; i < daysRow.length; i += 10) {
    const chunk = daysRow.slice(i, i + 10);
    console.log(`    ${chunk.map((d) => `${String(d).padStart(2)}: ${num(med(farms.map((f) => at(f, d)))).padStart(5)} (${num(Math.min(...farms.map((f) => at(f, d))))}-${num(Math.max(...farms.map((f) => at(f, d))))})`).join('  ')}`);
  }
  const broke = farms.map((f) => daysRow.filter((d) => d >= 3 && d <= 12 && at(f, d) < 100).length);
  const flush = farms.map((f) => daysRow.filter((d) => d >= 13 && at(f, d) >= 1000).length);
  console.log(`  spring mornings (days 3 to 12) under 100 coins: ${(broke.reduce((a, b) => a + b, 0) / farms.length).toFixed(1)} a farm; mornings from day 13 at 1,000 or more: ${(flush.reduce((a, b) => a + b, 0) / farms.length).toFixed(1)} a farm`);
  console.log(`  spring soil left bare for want of coins (days 3 to 12): ${avg((f) => f.idleSoil).toFixed(1)} plot-nights a farm (per farm: ${farms.map((f) => f.idleSoil).join(' ')})`);
  const later2 = farms.flatMap((f) => f.pinned.slice(1));
  const gains = later2.map((p) => p.reward - p.n * CROPS[p.crop].price);
  console.log(`  gain over market       median ${num(med(gains))}, lowest ${num(Math.min(...gains))}, highest ${num(Math.max(...gains))}`);
  // Round 6.
  const counted = later2.filter((p) => p.have > 0).length;
  const metNow = later2.filter((p) => p.have >= p.n).length;
  const pp = farms.flatMap((f) => f.pairPins);
  console.log(`  round 6: requests after the first that the rules count as met in part by crops planted before them or in the crate ${pct(counted, later2.length)} (in full ${pct(metNow, later2.length)}; ${later2.length} requests)`);
  console.log(`           requests filled with fewer of their crop sown after they were pinned than they asked: ${pct(farms.reduce((a, f) => a + f.filledFromOld, 0), farms.reduce((a, f) => a + f.filledReq, 0))} of ${farms.reduce((a, f) => a + f.filledReq, 0)}`);
  console.log(`           pairs where the farm could not sow both (they compete): by their sow-by days ${pct(pp.filter((x) => x.competeBy).length, pp.length)} (for soil ${pct(pp.filter((x) => x.soilBy).length, pp.length)}, for coins ${pct(pp.filter((x) => x.coinsBy).length, pp.length)}); today ${pct(pp.filter((x) => x.competeToday).length, pp.length)} (${pp.length} pairs)`);
  const wetAct = farms.flatMap((f) => f.active).filter((a) => a.day <= 10 && a.day > 1);
  const actOf = (xs: typeof wetAct) => (xs.length ? `median ${med(xs.map((a) => a.secs)).toFixed(0)} s, under 10 s on ${pct(xs.filter((a) => a.secs < 10).length, xs.length)} (${xs.length} days)` : 'no days');
  console.log(`           active seconds, days 2 to 10: wet days ${actOf(wetAct.filter((a) => a.wet))}; dry days ${actOf(wetAct.filter((a) => !a.wet))}`);
  console.log(`           crops crows took by day ${avg((f) => f.eatenByDay).toFixed(1)} a farm; the morning cards said crows ate ${avg((f) => f.eatenReported).toFixed(1)} (all crows ${avg((f) => f.eaten).toFixed(1)}); requests that went and said why ${pct(farms.reduce((a, f) => a + f.goneWhy, 0), farms.reduce((a, f) => a + f.goneAll, 0))} of ${farms.reduce((a, f) => a + f.goneAll, 0)}`);
  // Round 7.
  const brokeAll = farms.flatMap((f) => f.brokeDays);
  const brokeAfter = brokeAll.filter((b) => b.day > 3);
  console.log(`  round 7: broke days (ended with bare soil and coins below the cheapest seed): ${brokeAll.length} in all, ${brokeAfter.length} after Spring 3 (${(brokeAfter.length / farms.length).toFixed(1)} a farm; per farm ${farms.map((f) => f.brokeDays.filter((b) => b.day > 3).length).join(' ')}); bare plots on them median ${med(brokeAfter.map((b) => b.bare))}, most ${Math.max(0, ...brokeAfter.map((b) => b.bare))}; days ${[...new Set(brokeAfter.map((b) => b.day))].sort((x, y) => x - y).join(', ') || 'none'}`);
  const quiet = farms.flatMap((f) => f.active).filter((a) => a.day > 3);
  console.log(`           days after Spring 3 with under 10 s of work: ${pct(quiet.filter((a) => a.secs < 10).length, quiet.length)} (${quiet.filter((a) => a.secs < 10).length} of ${quiet.length}); earned by the morning of days 4, 7, 10: ${[4, 7, 10].map((d) => num(avg((f) => f.earnedBy[d] ?? f.earned))).join(', ')}`);
  const offs = farms.flatMap((f) => f.offers);
  const prs = offs.filter((o) => o.pair);
  console.log(`           offers after the first ${offs.length}, ${pct(prs.length, offs.length)} of them pairs; pairs of two different crops ${pct(prs.filter((o) => o.differ).length, prs.length)}; offers naming the same crops as the offer before ${pct(offs.filter((o) => o.repeat).length, offs.length)}; pairs the farm could take both of ${pct(prs.filter((o) => o.both).length, prs.length)} (so ${pct(prs.filter((o) => !o.both).length, prs.length)} compete)`);
  // Round 8.
  const wd = farms.flatMap((f) => f.watering).filter((w) => w.day > 3);
  const wBy = (lo: number, hi: number, dry = false) => {
    const xs = wd.filter((w) => w.fields >= lo && w.fields <= hi && (!dry || !w.wet));
    if (!xs.length) return 'no days';
    const share = xs.reduce((a, w) => a + w.water, 0) / Math.max(1e-9, xs.reduce((a, w) => a + w.secs, 0));
    return `work ${med(xs.map((w) => w.secs)).toFixed(0)} s (watering ${med(xs.map((w) => w.water)).toFixed(0)} s, ${Math.round(100 * share)}% of the work), stamina used ${med(xs.map((w) => w.used)).toFixed(0)}, most ${Math.max(...xs.map((w) => w.used)).toFixed(0)}; under 10 s of work ${pct(xs.filter((w) => w.secs < 10).length, xs.length)} (${xs.length} days)`;
  };
  console.log(`  round 8: the day, median, 1 field     ${wBy(1, 1)}`);
  console.log(`                      2 fields          ${wBy(2, 2)}`);
  console.log(`                      2 fields, dry     ${wBy(2, 2, true)}`);
  console.log(`                      3 to 6 fields     ${wBy(3, 6)}`);
  const p8 = farms.flatMap((f) => f.pairs8);
  console.log(`           pairs ${p8.length}: both sides payable that morning with the coins in hand and what is ripe to pick ${pct(p8.filter((x) => x.today === 2).length, p8.length)}, neither ${pct(p8.filter((x) => x.today === 0).length, p8.length)} (with the coins in hand alone ${pct(p8.filter((x) => x.affordable === 2).length, p8.length)}, neither ${pct(p8.filter((x) => x.affordable === 0).length, p8.length)}); within a fifth on what they clear a plot-day ${pct(p8.filter((x) => x.within).length, p8.length)} (gap median ${Math.round(100 * med(p8.map((x) => x.gap)))}%, largest ${Math.round(100 * Math.max(0, ...p8.map((x) => x.gap)))}%)`);
  console.log(`           requests filled short ${avg((f) => f.shortFills).toFixed(1)} a farm; reputation on the mornings of days 10, 20, 30: ${[10, 20, 30].map((d) => avg((f) => f.repOn[d] ?? f.rep).toFixed(1)).join(', ')}; copper can on day ${med(farms.map((f) => f.canOn[0]).filter(Boolean)) || 'never'} (${farms.filter((f) => f.canOn[0]).length}/${farms.length}), gold can on day ${med(farms.map((f) => f.canOn[1]).filter(Boolean)) || 'never'} (${farms.filter((f) => f.canOn[1]).length}/${farms.length})`);
  // Round 9.
  const fs = farms.flatMap((f) => f.fairs);
  const bySeason = [10, 20, 30, 40].map((d) => fs.filter((x) => x.day === d)).filter((x) => x.length);
  console.log(`  round 9: fairs held ${fs.length}, won ${fs.filter((x) => x.won).length} (${pct(fs.filter((x) => x.won).length, fs.length)}); by season ${bySeason.map((xs) => `day ${xs[0].day}: ${xs.filter((x) => x.won).length} of ${xs.length}, wanted ${med(xs.map((x) => x.want))}, got median ${med(xs.map((x) => x.got))}`).join('; ') || 'none'}`);
  const runs = farms.map((f) => {
    let best = 0;
    let run = 0;
    for (let d = 1; d <= DAYS; d++) {
      run = f.idleRich.includes(d) ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  });
  console.log(`           mornings with 1,500+ coins and nothing to buy: ${avg((f) => f.idleRich.length).toFixed(1)} a farm (per farm ${farms.map((f) => f.idleRich.length).join(' ')}); longest run median ${med(runs)}, most ${Math.max(0, ...runs)} days`);
  // Round 10: requests against the crate.
  {
    const earned = avg((f) => f.earned);
    console.log(`  round 10: requests' gains ${num(avg((f) => f.reqGain))} a farm, ${pct(avg((f) => f.reqGain), earned)} of all earned; with their crops at market ${num(avg((f) => f.reqGain + f.reqCrops))}, ${pct(avg((f) => f.reqGain + f.reqCrops), earned)}; morning coins on days 8, 18, 28 (median) ${[8, 18, 28].map((d) => num(med(farms.map((f) => f.morning[d] ?? f.coins)))).join(', ')}`);
  }
  const p9 = farms.flatMap((f) => f.pairs9);
  console.log(`           pairs ${p9.length}: one side wins on clear, plots and days at once ${pct(p9.filter((x) => x.dominated).length, p9.length)}; sides that could not be met as pinned ${p9.reduce((a, x) => a + x.unmet, 0)}`);
  if (PAIRS) {
    // Every pair the bot was offered, played out both ways by a diligent player and a busy one.
    type Out = { kinds: string; bold: number; safe: number; diligent: number; busy: number; scale: number; noise: number; free: number; coins: number };
    const outs: Out[] = [];
    for (const f of farms) {
      for (const { state, ids } of f.pairs) {
        const [a, b] = ids.map((id) => state.orders.find((o) => o.id === id)!);
        // Round 5 names the bold one; before, the two are taken in the order pinned.
        const [bold, safe] = BOLD.has(kindOf(b)) ? [b, a] : [a, b];
        const d = playOut(state, [bold.id, safe.id]);
        const busy = playOut(state, [bold.id, safe.id], 240);
        const gain = (o: Order) => o.reward - o.items[0].n * CROPS[o.items[0].crop].price;
        // The farm that morning: its soil free to plant, and its coins against what the bigger of the two costs to sow.
        let free = 0;
        let all = 0;
        for (let i = 0; i < state.plots.length; i++) {
          if (!ownedAt(state, i) || state.tiles[i] !== 'field' || state.builds.some((q) => q.y * state.W + q.x === i)) continue;
          all++;
          if (!state.plots[i].crop) free++;
        }
        const cost = Math.max(...[bold, safe].map((o) => o.items[0].n * CROPS[o.items[0].crop].seed));
        outs.push({ kinds: kindOf(bold) ? `${kindOf(bold)}/${kindOf(safe)}` : 'pair', bold: gain(bold), safe: gain(safe), diligent: d[0] - d[1], busy: busy[0] - busy[1], scale: Math.max(gain(bold), gain(safe), 1), noise: noiseFloor(state, bold.id, safe.id), free: all ? free / all : 0, coins: state.coins / Math.max(1, cost) });
      }
    }
    // A pick is better when it leaves the farm worth more by a tenth of the larger gain; closer than that is a wash.
    const call = (gap: number, scale: number) => (gap > 0.1 * scale ? 'first' : gap < -0.1 * scale ? 'second' : 'wash');
    const report2 = (label: string, xs: Out[]) => {
      if (!xs.length) return;
      const tally = (k: 'diligent' | 'busy') => {
        const c = { first: 0, second: 0, wash: 0 };
        for (const x of xs) c[call(x[k], x.scale)]++;
        return `${pct(c.first, xs.length)} / ${pct(c.second, xs.length)} / ${pct(c.wash, xs.length)}`;
      };
      const disagree = xs.filter((x) => call(x.diligent, x.scale) !== call(x.busy, x.scale)).length;
      const decided = xs.flatMap((x) => [call(x.diligent, x.scale), call(x.busy, x.scale)]).filter((c) => c !== 'wash');
      const firstShare = decided.filter((c) => c === 'first').length / Math.max(1, decided.length);
      const gap = med(xs.map((x) => Math.abs(x.diligent) / x.scale));
      const noise = med(xs.map((x) => Math.abs(x.noise) / x.scale));
      console.log(`    ${label.padEnd(12)} ${String(xs.length).padStart(3)} pairs; gain ${num(med(xs.map((x) => x.bold)))} against ${num(med(xs.map((x) => x.safe)))}; better pick (first / second / a wash), diligent ${tally('diligent')}, busy ${tally('busy')}; the two players disagree on ${pct(disagree, xs.length)}; of the decided calls the first wins ${Math.round(100 * firstShare)}%; outcome gap median ${Math.round(100 * gap)}% of the larger gain (chance alone: ${Math.round(100 * noise)}%)`);
    };
    console.log(`  pairs played out both ways (first: ${outs.some((x) => x.kinds !== 'pair') ? 'the bold one (rush, long, big)' : 'the first pinned'}; busy: to bed at 10:00)`);
    report2('all', outs);
    for (const k of [...new Set(outs.map((x) => x.kinds))].sort()) if (k !== 'pair') report2(k, outs.filter((x) => x.kinds === k));
    // Does the better pick follow the farm? The diligent player's calls, split by how much soil was free that morning
    // and by whether the coins in hand covered the dearer sowing.
    const split = (label: string, xs: Out[]) => {
      const share = (ys: Out[]) => {
        const c = ys.map((x) => call(x.diligent, x.scale)).filter((v) => v !== 'wash');
        return c.length ? `${Math.round((100 * c.filter((v) => v === 'first').length) / c.length)}% (${c.length})` : 'n/a';
      };
      const soilMid = med(xs.map((x) => x.free));
      console.log(`    ${label.padEnd(12)} the first wins, of decided calls: soil free above the median ${share(xs.filter((x) => x.free > soilMid))}, at or below ${share(xs.filter((x) => x.free <= soilMid))}; coins covering the dearer sowing ${share(xs.filter((x) => x.coins >= 1))}, not ${share(xs.filter((x) => x.coins < 1))}`);
    };
    split('all', outs);
    for (const k of [...new Set(outs.map((x) => x.kinds))].sort()) if (k !== 'pair') split(k, outs.filter((x) => x.kinds === k));
  }
}

if (!ONLY_FOLLOW && !ONLY_FAIRS) syntheticMornings();

// Round 10: the fairs a player who follows the lessons meets, by how it picks one side of each pair and whether it
// sows every bare plot (as the tester did) or only what a line or a request asks.
if (ONLY_FAIRS) {
  const farms = Math.max(FARMS, 12);
  const line = (name: string, fs: { day: number; got: number; want: number; won: boolean }[]) => {
    const by = [0, 1, 2, 3].map((k) => fs.filter((f) => Math.floor((f.day - 1) / 10) % 4 === k));
    const mid = (xs: number[]) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
    const two = fs.filter((f) => f.day <= 20);
    console.log(`  ${name}: fairs won ${fs.filter((f) => f.won).length} of ${fs.length} (${pct(fs.filter((f) => f.won).length, fs.length)}); the first two ${pct(two.filter((f) => f.won).length, two.length)}; ${by.map((xs, k) => (xs.length ? `${['spring', 'summer', 'autumn', 'winter'][k]} ${xs.filter((f) => f.won).length}/${xs.length} (wants ${mid(xs.map((x) => x.want))}, got ${mid(xs.map((x) => x.got))})` : '')).join(', ')}`);
  };
  console.log(`\nSunup, a whole year's fairs (${farms} farms, 41 days)`);
  const careful: { day: number; got: number; want: number; won: boolean }[] = [];
  for (let i = 0; i < farms; i++) {
    const s = world('sunup', 42 + i * 1013);
    s.held = false;
    const seen = new Set<unknown>();
    play(s, 41, { pace: 1.3, after: (st) => {
      const r = st.report as unknown as { day: number; fair?: { got: number; want: number; won: boolean } } | null;
      if (r && !seen.has(r)) {
        seen.add(r);
        if (r.fair) careful.push({ day: r.day, ...r.fair });
      }
    } });
  }
  line('careful bot, a person\u2019s pace', careful);
  for (const greedy of [false, true]) {
    for (const pick of ['clear', 'small', 'fair'] as const) {
      const fs: { day: number; got: number; want: number; won: boolean }[] = [];
      const dawns: { day: number; offers: number; why: string }[] = [];
      for (let i = 0; i < farms; i++) {
        const s = world('sunup', 42 + i * 1013);
        s.held = false;
        const r = follow(s, 41, { pick, greedy });
        fs.push(...r.fairs);
        dawns.push(...(r.mornings ?? []));
      }
      line(`follows the lessons, ${greedy ? 'sows every plot' : 'sows when told '}, takes the ${pick.padEnd(5)}`, fs);
      // A morning with room for one: not one with no soil, no seed money, or as many taken as the farm carries.
      const room = dawns.filter((d) => d.why !== 'soil' && d.why !== 'coins' && d.why !== 'full');
      const summer = room.filter((d) => d.day >= 11 && d.day <= 20);
      console.log(`     pairs on mornings with room for one ${pct(room.filter((d) => d.offers === 2).length, room.length)} (${room.length} mornings; of all ${dawns.length}, ${pct(dawns.filter((d) => d.offers === 2).length, dawns.length)}); summer ${pct(summer.filter((d) => d.offers === 2).length, summer.length)} (${summer.length} mornings)`);
    }
  }
  console.log(`\nSunup, two years at a person\u2019s pace (${Math.min(farms, 4)} farms): coins and income, median`);
  const rows: Record<number, { coins: number[]; crate: number[]; gain: number[]; fields: number[] }> = {};
  for (let i = 0; i < Math.min(farms, 4); i++) {
    const s = world('sunup', 42 + i * 1013);
    s.held = false;
    let crate = 0;
    let gain = 0;
    let last = 0;
    play(s, 81, { pace: 1.3, after: (st, ev) => {
      for (const e of ev) {
        if (e.type === 'coins' && (e as { crate?: boolean }).crate) crate += e.amount;
        if (e.type === 'request' && e.done) gain += e.reward;
      }
      if (st.day !== last) {
        last = st.day;
        const r = (rows[st.day] ??= { coins: [], crate: [], gain: [], fields: [] });
        r.coins.push(st.coins);
        r.crate.push(crate);
        r.gain.push(gain);
        r.fields.push(st.parcels.filter((q) => q.owned).length);
      }
    } });
  }
  const mid = (xs: number[]) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
  let was = { crate: 0, gain: 0 };
  for (const d of [11, 21, 31, 41, 51, 61, 71, 81]) {
    const r = rows[d];
    if (!r) continue;
    const c = mid(r.crate);
    const g = mid(r.gain);
    console.log(`  day ${d}: coins ${num(mid(r.coins))}, fields ${mid(r.fields)}; in the last ten days the crate paid ${num(c - was.crate)}, requests gained ${num(g - was.gain)}`);
    was = { crate: c, gain: g };
  }
}

if (ONLY_FOLLOW || (!ONLY_MORNINGS && !ONLY_PERSON && !ONLY_SUNUP && !ONLY_FAIRS)) {
  const days = Math.max(DAYS, 30) + 1;
  console.log(`\nSunup, a player who follows the lessons (${FARMS} farms, ${days} days, one action every 0.9 s)`);
  for (const greedy of [true, false]) {
    for (const pick of ['clear', 'small', 'fair'] as const) {
      const all: { day: number; got: number; want: number; won: boolean }[] = [];
      let singles = 0;
      let mornings = 0;
      const dawns: { offers: number; wants: boolean; inTime: number; why: string; apart?: boolean }[] = [];
      let earned = 0;
      let reqGain = 0;
      const coins18: number[] = [];
      for (let i = 0; i < FARMS; i++) {
        const s = world('sunup', 42 + i * 1013);
        s.held = false;
        const morning: Record<number, number> = {};
        const r = follow(s, days, { pick, greedy }, { after: (st) => {
          if (st.turnover < 0 && morning[st.day] === undefined) morning[st.day] = st.coins;
        } });
        all.push(...r.fairs);
        dawns.push(...(r.mornings ?? []));
        singles += r.singles.length;
        mornings += new Set(r.taken.map((t) => t.day)).size + r.singles.length;
        earned += s.stats.earned;
        for (const e of r.events) if (e.type === 'request' && e.done) reqGain += e.reward;
        coins18.push(morning[18] ?? s.coins);
        if (r.problems.length) console.log('  problems', r.problems.slice(0, 2));
      }
      const by = [10, 20, 30, 40].map((d) => all.filter((f) => f.day === d)).filter((x) => x.length);
      console.log(`  ${greedy ? 'sows every plot' : 'sows when told '}, takes the ${pick.padEnd(5)}: fairs met ${all.filter((f) => f.won).length} of ${all.length} (${by.map((xs) => `day ${xs[0].day} ${xs.filter((f) => f.won).length}/${xs.length}, got ${xs.map((f) => `${f.got}/${f.want}`).join(' ')}`).join('; ')}); boards with under two offers it could take ${singles}; requests' gains ${pct(reqGain, earned)} of earned; coins on day 18 median ${num(med(coins18))}`);
      if (dawns.length) {
        // Round 10: each morning's offers as pinned at dawn: pairs, singles (and why), none; and, while the fair still
        // wanted requests, pairs with one side due by it and the other after it (their days matter).
        const pairs = dawns.filter((d) => d.offers === 2);
        const wanting = pairs.filter((d) => d.wants);
        const whys = [...new Set(dawns.filter((d) => d.offers < 2).map((d) => d.why || '(no word)'))].map((w) => `${w} ${dawns.filter((d) => d.offers < 2 && (d.why || '(no word)') === w).length}`);
        console.log(`           dawns ${dawns.length}: a pair ${pct(pairs.length, dawns.length)}, one ${dawns.filter((d) => d.offers === 1).length}, none ${dawns.filter((d) => !d.offers).length} (why: ${whys.join(', ') || 'none'}); pairs while the fair wanted requests ${wanting.length}, both sides in time ${pct(wanting.filter((d) => d.inTime === 2).length, wanting.length)}, one side ${pct(wanting.filter((d) => d.inTime === 1).length, wanting.length)}, neither ${pct(wanting.filter((d) => d.inTime === 0).length, wanting.length)}; all pairs with sides due in different seasons (for different fairs) ${pct(pairs.filter((d) => d.apart).length, pairs.length)}`);
      }
    }
  }
}
