// What the farm is for, per goal rule: market milestones, almanac seasons and
// town orders. Selling lives here too, because the goal decides how it works.

import { DAYS_PER_SEASON, ORDER_PREMIUM, ORDER_SLOTS, REQUEST_CLOSE, REQUEST_EDGE, REQUEST_FLOOR, REQUEST_GAIN_PER_PLOT, REQUEST_GRACE, REQUEST_LOOK, REQUEST_MAX, REQUEST_MAX_BIG, REQUEST_MIN, REQUEST_MOST, REQUEST_RATE, REQUEST_SHARE, REQUEST_SOW, REQUEST_SPAN, requestSlots, TOWN } from './constants';
import { CROP_IDS, CROPS, count, inSeason } from './crops';
import { season } from './world';
import { nightsToTurn, priceOf, sowing } from './actions';
import { pick, rand, randInt, shuffle } from './rng';
import type { Crop, CropId, DayReport, Goal, GoalKind, LossCause, Order, RequestFail, RequestKind, SimEvent, WorldState } from './types';

// ---------------------------------------------------------------- selling

/** Sell every unit of one crop in stock, but `keep` of them (the plainest). Returns coins made. */
export function sellCrop(s: WorldState, crop: CropId, ev: SimEvent[], report?: DayReport, keep = 0): number {
  const grades = s.stock[crop];
  let n = 0;
  let value = 0;
  let held = keep;
  for (let q = 0; q < 4; q++) {
    const hold = Math.min(held, grades[q]);
    held -= hold;
    const sell = grades[q] - hold;
    if (!sell) continue;
    value += priceOf(s, crop, q) * sell;
    n += sell;
    grades[q] = hold;
  }
  if (!n) return 0;
  s.coins += value;
  s.stats.earned += value;
  s.almanac.earned += value;
  if (s.rules.goal === 'orders') s.market.demand[crop] = Math.max(0.5, s.market.demand[crop] - 0.03 * n);
  ev.push({ type: 'sell', crop, n, value });
  report?.sold.push({ crop, n, value });
  return value;
}

export function stockCount(s: WorldState, crop: CropId): number {
  return s.stock[crop].reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------- orders

function orderKinds(s: WorldState): CropId[] {
  if (s.rep < 3) return ['radish', 'lettuce', 'carrot', 'beans'];
  if (s.rep < 6) return ['radish', 'lettuce', 'carrot', 'beans', 'strawberry', 'sunflower'];
  return CROP_IDS;
}

export function makeOrder(s: WorldState): Order {
  const kinds = shuffle(s, orderKinds(s).slice());
  const lines = rand(s) < 0.35 + Math.min(0.3, s.rep * 0.04) ? 2 : 1;
  const scale = 1 + Math.min(2, s.rep / 4);
  const items = kinds.slice(0, lines).map((crop) => ({ crop, n: Math.max(1, Math.round(randInt(s, 2, 4) * scale * (CROPS[crop].price > 150 ? 0.4 : 1))) }));
  const base = items.reduce((a, it) => a + CROPS[it.crop].price * it.n, 0);
  const longest = Math.max(...items.map((it) => CROPS[it.crop].days));
  return {
    id: s.nextId++,
    who: pick(s, TOWN),
    items,
    reward: Math.round((base * ORDER_PREMIUM) / 5) * 5 + 10,
    rep: lines === 2 || base > 400 ? 2 : 1,
    due: s.day + Math.max(3, Math.ceil(longest * 0.8)) + randInt(s, 0, 2),
  };
}

export function fillOrders(s: WorldState): void {
  while (s.orders.length < ORDER_SLOTS) s.orders.push(makeOrder(s));
}

export function canDeliver(s: WorldState, o: Order): boolean {
  // Sunup: a request for a crop another request will be filled from first leaves that one its share.
  // Sunup: only a request the player took is handed over (an offer is never filled by accident).
  // Round 6: only what was sown for it and harvested counts (crops already growing, or in the crate, never do).
  // Round 7: one that can no longer be met in full takes what it can get, once nothing more is growing for it.
  if (s.rules.goal === 'market' && s.rules.tools === 'kit') {
    if (!isTaken(o)) return false;
    const got = inCrate(s, o);
    return got >= o.items[0].n || (got > 0 && plantedFor(s, o) === 0 && !!whyNot(s, o));
  }
  return o.items.every((it) => stockCount(s, it.crop) >= it.n);
}

/**
 * Sunup: what a taken request has in the crate: crops sown for it and picked.
 * Round 7: each was paid for at market as it went in (`payAtCrate`), so the
 * crate only counts them for the request.
 */
export function inCrate(_s: WorldState, o: Order): number {
  return Math.min(o.items[0].n, o.got ?? 0);
}

/**
 * Sunup: what a taken request pays when it is filled: its gain over market
 * (the crops were paid for at market as they went into the crate) and a point
 * of reputation. Round 7: short of its count (a crow took one of fifteen
 * sunflowers and the whole +305 went), the same share of its gain for each
 * crop it gets, and no reputation.
 */
export function partPay(o: Order, got: number): number {
  const n = o.items[0].n;
  return got >= n ? gainOf(o) : fives((got * gainOf(o)) / n);
}

/** Sunup: hand a taken request what the crate holds for it, and pay its gain (in full, or in part when it is short). */
function payRequest(s: WorldState, o: Order, ev: SimEvent[], report?: DayReport): number {
  const it = o.items[0];
  const got = inCrate(s, o);
  const pay = partPay(o, got);
  const full = got >= it.n;
  s.orders = s.orders.filter((x) => x !== o);
  s.coins += pay;
  s.stats.earned += pay;
  s.almanac.earned += pay;
  // Round 8: a short fill earns the same share of its reputation point, towards the next (a short fill earned none,
  // and crows that took one crop of each of five requests kept the copper can locked at reputation 2).
  const rep = full ? o.rep : (o.rep * got) / it.n;
  addRep(s, rep);
  if (report) (report.filled ??= []).push({ who: o.who, reward: pay, ...(full ? {} : { got, of: it.n }) });
  ev.push({ type: 'request', id: o.id, who: o.who, done: true, reward: pay, crop: it.crop, ...(full ? {} : { got, of: it.n }), rep });
  return pay;
}

/**
 * Sunup: add reputation, whole points or a share of one. Shares gather
 * towards the next point (`repPart`, 0 to 1); a whole one moves `rep`.
 */
export function addRep(s: WorldState, n: number): void {
  const total = s.rep + (s.repPart ?? 0) + n;
  // Counted in hundredths, so shares that make a point make it exactly.
  const hundredths = Math.round(total * 100);
  s.rep = Math.floor(hundredths / 100);
  s.repPart = (hundredths % 100) / 100;
}

export function deliver(s: WorldState, id: number, ev: SimEvent[]): boolean {
  const o = s.orders.find((x) => x.id === id);
  if (!o || !canDeliver(s, o)) return false;
  if (s.rules.goal === 'market' && s.rules.tools === 'kit') {
    ev.push({ type: 'coins', amount: payRequest(s, o, ev) });
    return true;
  }
  for (const it of o.items) {
    let left = it.n;
    for (let q = 0; q < 4 && left > 0; q++) {
      const take = Math.min(left, s.stock[it.crop][q]);
      s.stock[it.crop][q] -= take;
      left -= take;
    }
  }
  s.orders = s.orders.filter((x) => x !== o);
  s.coins += o.reward;
  s.stats.earned += o.reward;
  s.almanac.earned += o.reward;
  s.rep += o.rep;
  ev.push({ type: 'order', id: o.id, done: true });
  ev.push({ type: 'coins', amount: o.reward });
  return true;
}

export function orderText(o: Order): string {
  return o.items.map((it) => count(it.crop, it.n)).join(' and ');
}

/** Overnight: late orders lapse, prices drift back. */
export function ordersOvernight(s: WorldState, ev: SimEvent[]): void {
  for (const o of s.orders.slice()) {
    if (o.due < s.day) {
      s.orders = s.orders.filter((x) => x !== o);
      s.rep = Math.max(0, s.rep - 1);
      ev.push({ type: 'order', id: o.id, done: false });
    }
  }
  for (const c of CROP_IDS) {
    const d = s.market.demand[c];
    s.market.demand[c] = Math.max(0.5, Math.min(1.5, d + (1 - d) * 0.2 + (rand(s) - 0.5) * 0.08));
  }
}

// ---------------------------------------------------------------- town requests (Sunup)

function ownedPlot(s: WorldState, i: number): boolean {
  return s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned;
}

/** Living crops of a kind on the farm, and the fewest days until one of them is ripe. */
function growing(s: WorldState, crop: CropId): { n: number; soonest: number } {
  let n = 0;
  let soonest = Infinity;
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (!c || c.dead || c.kind !== crop || !ownedPlot(s, i)) continue;
    n++;
    soonest = Math.min(soonest, Math.max(0, CROPS[crop].days - c.age));
  }
  return { n, soonest };
}

/** The last day a crop can be handed over: the end of its season, unless it also grows in the next. */
function lastDayFor(s: WorldState, crop: CropId): number {
  const turn = s.day + nightsToTurn(s.day) - 1;
  const next = (season(s.day) + 1) % 4;
  return inSeason(crop, next) ? Infinity : turn;
}

/**
 * Plots of owned field that can grow something (not built on), and how many
 * of them are free to plant within `days` days: bare now, or with a one-shot
 * crop ripe by then (picked, its plot is free again).
 */
export function farmPlots(s: WorldState, days = 0): { all: number; free: number } {
  let all = 0;
  let free = 0;
  for (let i = 0; i < s.plots.length; i++) {
    if (!ownedPlot(s, i) || s.tiles[i] !== 'field') continue;
    if (s.builds.some((b) => b.y * s.W + b.x === i)) continue;
    all++;
    const c = s.plots[i].crop;
    if (!c || c.dead || (CROPS[c.kind].regrow === 0 && CROPS[c.kind].days - c.age <= days)) free++;
  }
  return { all, free };
}

/** A request's sow-by day: the last day its seed can go in (older saves had only a due day). */
export function sowByOf(o: Order): number {
  return o.sowBy ?? o.due - CROPS[o.items[0].crop].days;
}

/**
 * The last day seed can still go in for a request. An offer keeps to its
 * sow-by day; a taken one can be planted (and replanted, after a loss) until
 * the day that is still ripe by its due day, watered every night: its days to
 * spare are days to replant (round 7: one crow voided a whole request).
 */
export function lastSowOf(o: Order): number {
  return offered(o) ? sowByOf(o) : Math.max(sowByOf(o), o.due - CROPS[o.items[0].crop].days);
}

/**
 * Soil and seed coins the taken requests still owe: what each still needs
 * planted, while it can still be planted. `before` counts only those that
 * come before it (due sooner, then pinned first).
 */
export function owed(s: WorldState, before?: Order): { plots: number; coins: number } {
  const out = { plots: 0, coins: 0 };
  for (const o of s.orders) {
    if (!isTaken(o) || o === before || s.day > lastSowOf(o)) continue;
    if (before && byDue(o, before) > 0) continue;
    const still = stillToSow(s, o);
    out.plots += still;
    out.coins += still * CROPS[o.items[0].crop].seed;
  }
  return out;
}

/**
 * Is a request only an offer on the board, waiting for the player to accept
 * it? Planting never takes one (the fifth playtest's market planting took a
 * request nobody had read, and let its partner go). Older saves and the
 * first request have no mark: they are taken.
 */
export function offered(o: Order): boolean {
  return o.taken === false;
}

/** Has a request been taken: accepted on the board (or from an older save)? */
export function isTaken(o: Order): boolean {
  return o.taken !== false;
}

/** The order requests for one crop are filled in: due sooner first, then pinned first. */
function byDue(a: Order, b: Order): number {
  return a.due - b.due || a.id - b.id;
}

/** Is a crop sown for a request still on the board (a crop sown for one that has gone is free again)? */
function sownForOpen(s: WorldState, c: Crop): boolean {
  return c.for !== undefined && s.orders.some((q) => q.id === c.for);
}

/** Will a crop be ripe by a request's due day, watered every night? */
function ripeBy(s: WorldState, c: Crop, due: number): boolean {
  return CROPS[c.kind].days - c.age <= due - s.day;
}

/**
 * Does a crop count for a request? Round 6: only crops sown for it. A taken
 * request counts the crops sown for it (`claimCrops` marks them); an offer
 * counts crops of its kind sown since it was pinned and not for another
 * request (a crop's id is larger than the request's: both come from one
 * counter), which accepting it would take up. Nothing already growing when it
 * was pinned counts, nor anything in the crate it did not grow.
 */
function countsFor(s: WorldState, o: Order, c: Crop): boolean {
  if (c.dead || c.kind !== o.items[0].crop) return false;
  return isTaken(o) ? c.for === o.id : c.id > o.id && !sownForOpen(s, c);
}

/**
 * What a request has already: the crops sown for it and harvested, in the
 * crate, and those growing for it that will be ripe and picked by its day.
 * (Round 5 counted every crop of its kind on the farm and in the crate: the
 * sixth playtest was paid 240 over market for ten lettuces already growing,
 * and 380 for corn sitting in the crate.)
 */
export function requestHave(s: WorldState, o: Order): number {
  const it = o.items[0];
  let have = isTaken(o) ? Math.min(o.got ?? 0, it.n) : 0;
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (!c || !ownedPlot(s, i) || !countsFor(s, o, c)) continue;
    // Ripe on the morning `days - age` days from now, if it is watered every night.
    if (ripeBy(s, c, o.due)) have++;
  }
  return have;
}

/** Crops sown for a request and still living (ripe in time or not). */
export function plantedFor(s: WorldState, o: Order): number {
  let n = 0;
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (c && ownedPlot(s, i) && countsFor(s, o, c)) n++;
  }
  return n;
}

/** What a taken request has growing for it now (sown for it, ripe by its day) and in the crate, for the board. */
export function requestProgress(s: WorldState, o: Order): { growing: number; crate: number } {
  const it = o.items[0];
  const crate = Math.min(it.n, o.got ?? 0);
  return { growing: Math.max(0, Math.min(it.n, requestHave(s, o)) - crate), crate };
}

/** The nearest ripe crop sown for a taken request (for the lesson's pointer), as a plot index, or -1. */
export function ripeFor(s: WorldState, o: Order): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (c && c.stage === 4 && ownedPlot(s, i) && countsFor(s, o, c)) out.push(i);
  }
  return out;
}

/**
 * Take up crops for the requests the player took: crops of a request's kind
 * sown since it was pinned, not sown for another request still open, and
 * ripe in time, until it has what it asks; the request due first chooses
 * first. Run whenever seed goes in, a request is accepted, and each night.
 */
export function claimCrops(s: WorldState): void {
  const taken = s.orders.filter(isTaken).sort(byDue);
  for (const o of taken) {
    const it = o.items[0];
    let have = requestHave(s, o);
    if (have >= it.n) continue;
    for (let i = 0; i < s.plots.length && have < it.n; i++) {
      const c = s.plots[i].crop;
      if (!c || c.dead || c.kind !== it.crop || c.id <= o.id || !ownedPlot(s, i) || sownForOpen(s, c) || !ripeBy(s, c, o.due)) continue;
      c.for = o.id;
      have++;
    }
  }
}

/** A crop sown for a request was lost: the request keeps the cause, so if it fails it can say why. */
export function lostFor(s: WorldState, c: Crop, cause: LossCause): void {
  if (c.for === undefined) return;
  const o = s.orders.find((q) => q.id === c.for);
  if (!o) return;
  (o.lost ??= {})[cause] = (o.lost[cause] ?? 0) + 1;
}

/** Why a request the player took failed: what took most of the crops sown for it, else why it could not be met. */
export function failOf(o: Order, fallback: RequestFail): { why: RequestFail; lost: number } {
  const lost = Object.entries(o.lost ?? {}) as [LossCause, number][];
  const total = lost.reduce((a, [, n]) => a + n, 0);
  if (total > 0) return { why: lost.sort((a, b) => b[1] - a[1])[0][0], lost: total };
  return { why: fallback, lost: 0 };
}

/** Does a request still want seed sown for it (on offer, or taken and short of what it needs while it can still be planted)? */
function stillSowing(s: WorldState, o: Order): boolean {
  return offered(o) || (s.day <= lastSowOf(o) && requestHave(s, o) < o.items[0].n);
}

/**
 * Coins the farm can put into seed by a sow-by day: the coins in hand, and
 * what the crops ripe by then will fetch. Round 7: a crop is paid for the
 * moment it goes into the crate, so a crop ripe that day (or already ripe)
 * pays for seed the same day; what the crate still holds sells overnight.
 * (Crops sown for a request are paid for at market as they go in too; the
 * request adds its gain when it is filled.)
 */
export function sowBudget(s: WorldState, sowBy: number): number {
  let value = 0;
  if (sowBy > s.day) for (const c of CROP_IDS) value += stockCount(s, c) * CROPS[c].price;
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (!c || c.dead || !ownedPlot(s, i)) continue;
    if (CROPS[c.kind].days - c.age <= sowBy - s.day) value += CROPS[c.kind].price;
  }
  return s.coins + value;
}

/** Plots free to plant by a sow-by day. */
function roomBy(s: WorldState, sowBy: number): number {
  return farmPlots(s, Math.max(0, sowBy - s.day)).free;
}

/** What a request still needs sown before it can be met: its count, less what it has already. */
export function stillToSow(s: WorldState, o: Order): number {
  return Math.max(0, o.items[0].n - requestHave(s, o));
}

/**
 * Could a request still be met? What it has already, and, until its sow-by
 * day has passed, what can still be sown for it: free soil and the coins for
 * the seed.
 */
export function canMeet(s: WorldState, o: Order): boolean {
  return !whyNot(s, o);
}

/**
 * Why a request can no longer be met in full ('late', 'soil' or 'coins'), or
 * '' when it can. For the board's stamp. Round 7: what the taken requests
 * still owe in soil and seed is spoken for (the seventh playtest was offered
 * a pair wanting 450 of seed with 270 in hand and 180 owed, and lost it at
 * dawn); a taken request counts only those that come before it.
 */
export function whyNot(s: WorldState, o: Order): '' | 'late' | 'soil' | 'coins' {
  const it = o.items[0];
  const need = it.n - requestHave(s, o);
  if (need <= 0) return '';
  const last = lastSowOf(o);
  if (s.day > last || !sowing(s.day, it.crop).ok) return 'late';
  const held = owed(s, offered(o) ? undefined : o);
  if (need > roomBy(s, last) - held.plots) return 'soil';
  if (need * CROPS[it.crop].seed > sowBudget(s, last) - held.coins) return 'coins';
  return '';
}

/**
 * Sunup: a taken request that can no longer be met in full, but has crops
 * growing for it or in the crate: it takes what comes and pays for each.
 */
export function isShort(s: WorldState, o: Order): boolean {
  return isTaken(o) && !!whyNot(s, o) && requestHave(s, o) > 0;
}

/**
 * Sunup: taken requests that still want seed planted today, on their last day
 * for it, and could have it (soil and coins enough): the sleep question asks
 * about them (round 7: one plant short of "Plant 9 today", the tester slept
 * without a word and lost it).
 */
export function owedToday(s: WorldState): { o: Order; n: number }[] {
  return s.orders.filter((o) => isTaken(o) && lastSowOf(o) === s.day && stillToSow(s, o) > 0 && !whyNot(s, o)).map((o) => ({ o, n: stillToSow(s, o) }));
}

/**
 * What makes two offers a choice, in numbers: together they want more soil
 * (or seed coins) than the farm has free by their planting days, after what
 * the taken requests still owe. Null when the farm could take both.
 */
export function clashOf(s: WorldState, a: Order, b: Order): { kind: 'soil' | 'coins'; need: number; have: number } | null {
  const held = owed(s);
  const last = Math.max(sowByOf(a), sowByOf(b));
  const plots = stillToSow(s, a) + stillToSow(s, b);
  const room = Math.max(0, roomBy(s, last) - held.plots);
  if (plots > room) return { kind: 'soil', need: plots, have: room };
  const coins = stillToSow(s, a) * CROPS[a.items[0].crop].seed + stillToSow(s, b) * CROPS[b.items[0].crop].seed;
  // Round 8: counted as the pair was priced, on what the farm can spend now (its coins and what is ripe today).
  const budget = Math.max(0, Math.min(sowBudget(s, last), sowBudget(s, s.day)) - held.coins);
  if (coins > budget) return { kind: 'coins', need: coins, have: budget };
  return null;
}

/** How many of a request are to be sown fresh: all of it (round 6; older saves counted some already growing). */
export function freshOf(o: Order): number {
  return Math.max(1, Math.min(o.items[0].n, o.fresh ?? o.items[0].n));
}

/**
 * A request's gain over market: what it pays beyond what its crops would
 * fetch at market. The board headlines this ("+195"), not the whole pay
 * ("Pays 1,370" was mostly market value for carrots already growing).
 */
export function gainOf(o: Order): number {
  const it = o.items[0];
  return o.reward - it.n * CROPS[it.crop].price;
}

/** Plot-days a request's fresh sowing takes: the soil it holds, and for how long. */
export function plotDays(o: Order): number {
  return freshOf(o) * CROPS[o.items[0].crop].days;
}

/** Days to spare: how long after seed sown on its sow-by day would ripen it is due (0: no day to spare). */
export function slackOf(o: Order): number {
  return Math.max(0, o.due - sowByOf(o) - CROPS[o.items[0].crop].days);
}

/**
 * What a crop is worth at market for each plot-day it holds its soil: what
 * it fetches over its seed, by its days to ripen.
 */
export function marketRate(crop: CropId): number {
  const d = CROPS[crop];
  return (d.price - d.seed) / d.days;
}

/**
 * Round 8: what a request is worth for each plot-day its sowing takes: its
 * pay less its seed, over its plots and its crop's days (the eighth
 * playtest's measure: pumpkins about 19, lettuces 12.5).
 */
export function worthRate(o: Order): number {
  const it = o.items[0];
  return (o.reward - it.n * CROPS[it.crop].seed) / plotDays(o);
}

/** The most a request's gain can be: so much for each plot of owned field, so requests grow with the farm. */
export function gainCap(s: WorldState): number {
  return REQUEST_GAIN_PER_PLOT * farmPlots(s).all;
}

/** One crop a request could ask for this morning: its days, and what the farm could grow of it alone. */
interface Offer {
  crop: CropId;
  sowBy: number;
  due: number;
  /** Plots free to sow it by its sow-by day, and coins for its seed by then (what the taken requests still need taken out). */
  room: number;
  coins: number;
  /** The most of it that could be sown for this request alone. */
  cap: number;
}

/**
 * A crop a request could ask for: sown by `days` from now, or, when the soil
 * is full and `look` allows, by the day enough of it comes free (up to
 * `REQUEST_LOOK` days), and due `grace` days after seed sown that day would
 * ripen, never after its season ends.
 */
function offer(s: WorldState, crop: CropId, days: number, held: { plots: number; coins: number }, grace: number, look = true): Offer | null {
  if (!sowing(s.day, crop).ok) return null;
  const d = CROPS[crop];
  const lastSow = lastDayFor(s, crop) - d.days;
  if (lastSow < s.day) return null;
  // Near a season's end the sow-by day comes sooner, so the days to spare are kept (sow today, if need be); only
  // when no day that soon has the room or the coins does it wait longer, with fewer days to spare.
  for (const last of [...new Set([Math.max(s.day, lastSow - grace), lastSow])]) {
    for (let k = days; k <= (look ? Math.max(days, REQUEST_LOOK) : days); k++) {
      const sowBy = Math.min(s.day + k, last);
      if (sowing(sowBy, crop).ok) {
        const room = roomBy(s, sowBy) - held.plots;
        // Round 8: only what the farm can afford to start now (its coins and what is ripe to pick today): the eighth
        // playtest was offered seed of 480 or 270 with 255 in hand.
        const coins = Math.min(sowBudget(s, sowBy), sowBudget(s, s.day)) - held.coins;
        const cap = Math.min(room, Math.floor(coins / d.seed), d.price > 150 ? REQUEST_MAX_BIG : REQUEST_MAX);
        if (cap >= REQUEST_MIN) return { crop, sowBy, due: Math.min(sowBy + d.days + grace, lastDayFor(s, crop)), room, coins, cap };
      }
      if (sowBy >= last) break;
    }
  }
  return null;
}

/**
 * Do the two of a pair compete: could the farm not sow both, for want of free
 * soil or coins by their sow-by days (each counted at the larger of the two)?
 */
export function competes(a: { crop: CropId; room: number; coins: number }, na: number, b: { crop: CropId; room: number; coins: number }, nb: number): boolean {
  return na + nb > Math.max(a.room, b.room) || na * CROPS[a.crop].seed + nb * CROPS[b.crop].seed > Math.max(a.coins, b.coins);
}

/** Pin a pair: the two share a pair id, in a random order on the board. */
function pinPair(s: WorldState, two: Order[], kind: string): Order[] {
  const pair = Math.min(two[0].id, two[1].id);
  for (const o of two) o.pair = pair;
  s.requested = (s.requested ?? 0) + 2;
  s.pairKind = kind;
  return rand(s) < 0.5 ? two : [two[1], two[0]];
}

/** Fives, as coins are counted on the board. */
function fives(n: number): number {
  return Math.round(n / 5) * 5;
}

/** A request on offer. `id` 0 is a draft, not pinned yet (it takes its id when it is). */
function order(s: WorldState, o: Offer, fresh: number, gain: number, kind: RequestKind, who: string, pair?: number, id = s.nextId++): Order {
  // Round 6: all of it sown fresh, for it.
  const n = fresh;
  return { id, who, items: [{ crop: o.crop, n }], reward: n * CROPS[o.crop].price + gain, rep: 1, due: o.due, sowBy: o.sowBy, made: s.day, pair, fresh, kind, taken: false, seen: false };
}

/** The sorts of pair a morning can offer: a bold request (more gain, more at stake) against a safe one. */
export const CONTRASTS: { id: string; bold: RequestKind; safe: RequestKind }[] = [
  // Risk against reward: sow today and no day to spare, against a day more to sow and up to two to spare.
  { id: 'risk', bold: 'rush', safe: 'easy' },
  // Slow against fast: a long crop holds its soil and seed money for a week, a quick one gives them back in days.
  { id: 'time', bold: 'long', safe: 'quick' },
  // Big against safe: many plots of a cheap crop (soil, seed and watering), against a few of a dear one.
  { id: 'size', bold: 'big', safe: 'small' },
];

/** Sow-by days and days to spare for each sort of request. */
function timing(kind: RequestKind, days: number): { days: number; grace: number; look: boolean } {
  // A rush is sown today, or, when the soil is full, the day enough of it comes free: either way no day to spare.
  if (kind === 'rush') return { days: 0, grace: REQUEST_GRACE.rush, look: true };
  if (kind === 'easy') return { days: 1, grace: REQUEST_GRACE.easy, look: true };
  return { days, grace: REQUEST_GRACE.other, look: true };
}

/**
 * Price the two of a pair (round 8). Each is priced on what it is worth for
 * each plot-day of soil it holds (its pay less its seed, `worthRate`): the
 * safe one at the two crops' average market rate plus `REQUEST_RATE`, the
 * bold one `REQUEST_EDGE` more, so the two stay close (within
 * `REQUEST_CLOSE`) whatever their crops fetch at market, and the choice
 * turns on risk, timing and plots (round 7 gave both `REQUEST_RATE` over
 * market, and pumpkins came to 19 a plot-day against 12.5 for lettuces).
 * Each still gains at least `REQUEST_FLOOR` over market. Over the cap
 * (`gainCap`) both come down together, so the counts that make the two
 * compete stay as they are. Null when no such price exists.
 */
function pricePair(s: WorldState, safe: { o: Offer; n: number }, bold: { o: Offer; n: number }, kind: RequestKind): { safe: number; bold: number; nb: number; ns: number } | null {
  // In fives, as the board counts coins, and never over the cap once rounded.
  const cap = Math.floor(gainCap(s) / 5) * 5;
  const { n: ns } = safe;
  const { n: nb } = bold;
  const cs = safe.o.crop;
  const cb = bold.o.crop;
  const pdS = ns * CROPS[cs].days;
  const pdB = nb * CROPS[cb].days;
  const edge = 1 + (REQUEST_EDGE[kind as keyof typeof REQUEST_EDGE] ?? 0);
  const mS = marketRate(cs);
  const mB = marketRate(cb);
  // The least each may be worth a plot-day: its market rate and its floor over market.
  const floorS = mS + (REQUEST_FLOOR * CROPS[cs].price) / CROPS[cs].days;
  const floorB = mB + (REQUEST_FLOOR * CROPS[cb].price) / CROPS[cb].days;
  let w = Math.max((mS + mB) / 2 + REQUEST_RATE, floorS, floorB / edge);
  // The most: the cap on either gain.
  const most = Math.min(mS + cap / pdS, (mB + cap / pdB) / edge);
  if (w > most) w = most;
  if (w < floorS - 1e-9 || w * edge < floorB - 1e-9) return null;
  const fs = Math.min(cap, fives((w - mS) * pdS));
  const fb = Math.min(cap, fives((w * edge - mB) * pdB));
  if (fs < 10 || fb < 10) return null;
  // Rounded to fives, the two must still be close, and the bold one the more worth (or the pair does not say what it is).
  const rs = mS + fs / pdS;
  const rb = mB + fb / pdB;
  if (rb < rs || rb > rs * (1 + REQUEST_CLOSE)) return null;
  return { safe: fs, bold: fb, nb, ns };
}

/** The crops of an offer, as the morning after compares them (a pair is never the same two crops twice in a row). */
export function offerKey(crops: CropId[]): string {
  return [...new Set(crops)].sort().join('+');
}

/**
 * Townsfolk ask for some of one crop. A request is filled from the crate
 * when the day ends, before the rest ships, and pays more than market for
 * what it has you sow (its gain), plus a point of reputation, which the smith
 * and the land agent want before they will deal.
 *
 * The very first is three radishes, cheap to grow, taken at once, so it can
 * be filled with what the first days teach. After that requests come as a
 * pair of offers, and the player takes one on the board (`acceptRequest`):
 * choosing between them is the morning's decision, so the two differ in kind
 * (`CONTRASTS`): rush or easy, long or quick, big or small. Each of a pair
 *   - needs fresh sowing: it is for a crop the farm is not growing (when
 *     fewer than two such crops can go in, one may be for a crop it grows,
 *     asking for that many more, and paying market for those it has);
 *   - fits what the farm can afford by its sow-by day (coins, the crops ripe
 *     by then) and the soil free by then, after what taken requests still owe;
 *   - is priced so the two come out alike for a typical farm
 *     (`neutralValue`), with the bold one offering clearly more gain;
 *   - gains at most so much for each plot owned (`gainCap`);
 *   - is never for a crop that regrows (its seed pays back over many picks).
 * Round 7: the two are always different crops, never the same two as the
 * offer before, and always compete: together they want more soil or seed
 * coins than the farm has (`competes`, said on the board by `clashOf`); with
 * no such pair the morning brings one request, or none.
 * Returns the requests to pin: one, two, or none when nothing fits.
 */
export function offerRequests(s: WorldState): Order[] {
  const first = s.rep === 0 && !(s.requested ?? 0);
  if (first) {
    const d = CROPS.radish;
    const o = offer(s, 'radish', 2, { plots: 0, coins: 0 }, REQUEST_GRACE.other);
    const sowBy = Math.min(s.day + 2, lastDayFor(s, 'radish') - d.days);
    if (!o && (sowBy < s.day || !sowing(s.day, 'radish').ok)) return [];
    s.requested = (s.requested ?? 0) + 1;
    s.lastOffer = offerKey(['radish']);
    const r = order(s, o ?? { crop: 'radish', sowBy, due: Math.min(sowBy + d.days + 1, lastDayFor(s, 'radish')), room: 3, coins: 30, cap: 3 }, 3, fives(REQUEST_RATE * 3 * d.days), 'first', pick(s, TOWN));
    // The lesson's own request: taken at once.
    delete r.taken;
    return [r];
  }
  // Crops that regrow are left out: their seed pays back over many picks, which a request for one pick would hide,
  // so a request for them reads as a bad deal beside any other.
  const known = CROP_IDS.filter((c) => CROPS[c].regrow === 0 && (s.rep >= 2 || c !== 'pumpkin'));
  const days = randInt(s, REQUEST_SOW[0], REQUEST_SOW[1]);
  // What the taken requests still need sowing takes its soil and seed first.
  const held = owed(s);
  // A crop already asked for is asked again only once the request for it is fully sown (summer and winter have only
  // two crops a request can ask for, and both are often under way).
  const asked = new Set(s.orders.filter((o) => stillSowing(s, o)).map((o) => o.items[0].crop));
  const crops = shuffle(s, known.slice()).filter((c) => !asked.has(c) && sowing(s.day, c).ok);
  // Crops the farm is not growing (nor has in the crate) first, for variety; one it grows only when fewer than two such
  // can go in. Either way the request is all fresh sowing: what grows already, or is in the crate, never counts.
  const isFresh = (c: CropId) => !growing(s, c).n && !stockCount(s, c);
  const fresh = crops.filter((c) => isFresh(c) && offer(s, c, days, held, REQUEST_GRACE.other));
  const pool = fresh.length >= 2 ? fresh : [...fresh, ...crops.filter((c) => !isFresh(c))];
  if (!pool.length) return [];
  const plots = farmPlots(s).all;
  const names = shuffle(s, TOWN.slice());
  /** An offer of one crop for one sort of request: all of it to be sown fresh (nothing growing or in the crate counts). */
  const make = (crop: CropId, kind: RequestKind): Offer | null => {
    const t = timing(kind, days);
    return offer(s, crop, t.days, held, t.grace, t.look);
  };
  const size = (o: Offer, n: number) => Math.max(REQUEST_MIN, Math.min(o.cap, Math.ceil(plots * REQUEST_MOST), Math.round(n)));
  // Each morning tries the sorts of pair in a fresh order, the one offered last time last. A wet morning tries the rush
  // first (sow today): rain waters what goes in today, so the day has a sowing to plan.
  const wet = s.weather === 'rain' || s.weather === 'storm';
  const order3 = shuffle(s, CONTRASTS.slice()).sort((a, b) => Number(a.id === s.pairKind) - Number(b.id === s.pairKind) || (wet ? Number(b.id === 'risk') - Number(a.id === 'risk') : 0));
  for (const c of order3) {
    // The crops each sort wants, always two different ones (round 7: four pairs in seven were one crop on both sides,
    // "10 corn +440 or +350"): any two for risk; the fastest against a slower one for time; the cheapest seed against
    // a dearer one for size. Never the same two as the offer before.
    const options: [CropId, CropId][] = [];
    for (const a of pool) for (const b of pool) {
      if (a === b || offerKey([a, b]) === s.lastOffer) continue;
      const da = CROPS[a];
      const db = CROPS[b];
      if (c.id === 'risk') options.push([a, b]);
      else if (c.id === 'time' && db.days >= da.days + 2) options.push([a, b]);
      else if (c.id === 'size' && db.seed >= da.seed * 1.5) options.push([b, a]);
    }
    for (const [safeCrop, boldCrop] of options) {
      const so = make(safeCrop, c.safe);
      const bo = make(boldCrop, c.bold);
      if (!so || !bo) continue;
      // Near a season's end the turn can squeeze a request's days to spare: both must keep some, and only a rush has
      // none, or the two would not differ in the way the pair says.
      const spare = (o: Offer) => o.due - o.sowBy - CROPS[o.crop].days;
      if (spare(so) < 1 || (c.id === 'risk' ? spare(bo) > 0 : spare(bo) < 1)) continue;
      const share = REQUEST_SHARE[c.safe as keyof typeof REQUEST_SHARE] ?? 0.3;
      const ns = size(so, plots * share);
      const span = c.bold === 'long' ? REQUEST_SPAN.long : c.bold === 'big' ? REQUEST_SPAN.big : 1;
      // The two compete for the same free soil or the same coins, so taking one really costs the other: both grow
      // together until they cannot both be sown. A pair that cannot be made to compete is not offered (round 7: one
      // wanted 450 coins and 10 plots, the other the same, from a farm with 1,180 coins and 22 bare plots). The bold
      // one is sized from the safe one each time, its plot-days rounded up, so it never falls short of its span.
      for (const k of [1, 1.25, 1.5, 2, 2.5, 3, 4]) {
        const nsk = size(so, ns * k);
        const nbk = size(bo, Math.ceil((span * nsk * CROPS[safeCrop].days) / CROPS[boldCrop].days - 1e-9));
        // A big request is half as many again as the small one, or the pair does not say what it is.
        if (c.id === 'size' && nbk < 1.5 * nsk) continue;
        const p = pricePair(s, { o: so, n: nsk }, { o: bo, n: nbk }, c.bold);
        if (!p || !competes(so, p.ns, bo, p.nb)) continue;
        // Each still pays clearly over market once the cap has scaled it (a big crop on a small farm may not).
        if (p.safe < REQUEST_FLOOR * p.ns * CROPS[safeCrop].price || p.bold < REQUEST_FLOOR * p.nb * CROPS[boldCrop].price) continue;
        s.lastOffer = offerKey([safeCrop, boldCrop]);
        return pinPair(s, [order(s, so, p.ns, p.safe, c.safe, names[0]), order(s, bo, p.nb, p.bold, c.bold, names[1])], c.id);
      }
    }
  }
  // No pair competes (one crop can go in, say): one request, a share of the farm, at the safe rate; never the same
  // crop as the offer before.
  for (const crop of pool) {
    if (offerKey([crop]) === s.lastOffer) continue;
    const o = make(crop, 'single');
    if (!o) continue;
    let n = size(o, plots * REQUEST_SHARE.single);
    while (n > REQUEST_MIN && fives(REQUEST_RATE * n * CROPS[crop].days) > gainCap(s)) n--;
    const gain = fives(REQUEST_RATE * n * CROPS[crop].days);
    if (gain > gainCap(s) || gain < 10) continue;
    s.requested = (s.requested ?? 0) + 1;
    s.lastOffer = offerKey([crop]);
    return [order(s, o, n, gain, 'single', names[0])];
  }
  return [];
}

/**
 * Take a request offered on the board. The other of its pair is let go at
 * once, with a word ("Old Tamsin will find carrots elsewhere."). Planting
 * never takes a request; only this does. False when it is not an offer, or
 * it could not be met now.
 */
export function acceptRequest(s: WorldState, id: number, ev: SimEvent[]): boolean {
  const o = s.orders.find((q) => q.id === id);
  if (!o || !offered(o) || !canMeet(s, o)) return false;
  o.taken = true;
  o.seen = true;
  o.got ??= 0;
  for (const q of s.orders.slice()) {
    if (q === o || q.pair === undefined || q.pair !== o.pair || !offered(q)) continue;
    s.orders = s.orders.filter((x) => x !== q);
    ev.push({ type: 'request', id: q.id, who: q.who, done: false, reward: 0, crop: q.items[0].crop });
  }
  // Seed sown for it since it was pinned (before Accept) counts for it now.
  claimCrops(s);
  return true;
}

/** The board's requests have been read: none of them is new any more (the badge counts new ones only). */
export function readRequests(s: WorldState): void {
  for (const o of s.orders) if (o.seen === false) o.seen = true;
}

/** New notes on the board: pinned since it was last read. */
export function newRequests(s: WorldState): number {
  return s.orders.filter((o) => o.seen === false).length;
}

/**
 * A save from before requests were accepted: a pair nobody has sown for is
 * still on offer. (Requests that seed went in for were taken by it then.)
 */
export function adoptRequests(s: WorldState): void {
  for (const o of s.orders) {
    if (o.taken !== undefined || o.pair === undefined) continue;
    const it = o.items[0];
    if (plantedFor(s, o) === 0 && stockCount(s, it.crop) < it.n) o.taken = false;
  }
  // Round 6: a request counts only crops sown for it. A taken request from an older save keeps what its crate holds of
  // its crop (shared out, due first first) and takes up crops sown since it was pinned.
  const pool: Partial<Record<CropId, number>> = {};
  for (const o of [...s.orders].sort(byDue)) {
    if (!isTaken(o) || o.got !== undefined) continue;
    const it = o.items[0];
    const left = pool[it.crop] ?? stockCount(s, it.crop);
    o.got = Math.min(it.n, left);
    pool[it.crop] = left - o.got;
  }
  claimCrops(s);
}

/**
 * Pin new requests. The first comes as soon as the board is read. After
 * that they come only with the mornings: a pair, on a morning when no offer
 * is still waiting on the board, and while the first is unfilled, nothing
 * more.
 */
export function fillRequests(s: WorldState, morning = false): void {
  if (!s.requested && !s.orders.length) {
    s.orders.push(...offerRequests(s));
    return;
  }
  if (!morning || s.orders.length >= requestSlots(s.rep)) return;
  if (s.orders.some(offered)) return;
  s.orders.push(...offerRequests(s));
}

/**
 * In the morning: a request that can no longer be met is withdrawn (its
 * sow-by day went by without enough sown, or what was sown since took the
 * soil or the coins it needed). One the player took says so on the morning
 * card; an offer nobody took goes quietly (the card must never name a
 * request the player did not choose, or never saw).
 */
export function withdrawRequests(s: WorldState, ev: SimEvent[], report?: DayReport | null): void {
  // An offer whose partner was taken (only older saves can have one) goes.
  for (const o of s.orders.slice()) if (offered(o) && o.pair !== undefined && s.orders.some((q) => q !== o && q.pair === o.pair && isTaken(q))) s.orders = s.orders.filter((x) => x !== o);
  for (const o of s.orders.slice()) {
    const why = whyNot(s, o);
    if (!why) continue;
    // Round 7: a taken one with crops still growing for it, or in the crate, stays and pays for what it gets.
    if (isTaken(o) && requestHave(s, o) > 0) continue;
    s.orders = s.orders.filter((x) => x !== o);
    // Each says why: what took the crops sown for it (crows, bugs, a dry night), or why it could not be met.
    if (report && isTaken(o)) (report.withdrawn ??= []).push({ who: o.who, crop: o.items[0].crop, n: o.items[0].n, ...failOf(o, why) });
    ev.push({ type: 'request', id: o.id, who: o.who, done: false, reward: 0, crop: o.items[0].crop, ...(isTaken(o) ? failOf(o, why) : {}) });
  }
}

/**
 * By day, the moment a crop sown for a taken request is lost: a request left
 * with nothing growing for it, nothing in the crate and no time to plant again
 * is lost there and then, with its cause (round 7: a pumpkin request that
 * could no longer be met still read as live). The next morning's card says so
 * too. One left with some crops stays, short, and pays for what it gets.
 */
export function dropLost(s: WorldState, ev: SimEvent[]): void {
  for (const o of s.orders.slice()) {
    if (!isTaken(o) || requestHave(s, o) > 0) continue;
    const why = whyNot(s, o);
    if (why !== 'late') continue;
    s.orders = s.orders.filter((x) => x !== o);
    const fail = failOf(o, why);
    (s.goneToday ??= []).push({ who: o.who, crop: o.items[0].crop, n: o.items[0].n, ...fail });
    ev.push({ type: 'request', id: o.id, who: o.who, done: false, reward: 0, crop: o.items[0].crop, ...fail });
  }
}

/**
 * How many of each crop the taken requests keep in the crate overnight
 * instead of selling: what was sown for each and harvested (round 6: only
 * that; other crops of the kind sell at market). A request that fails lets
 * its crops go to market the night after.
 */
export function wanted(s: WorldState): Partial<Record<CropId, number>> {
  const out: Partial<Record<CropId, number>> = {};
  // Round 7: Sunup's crops are paid for as they go into the crate, a request's too (it adds its gain when filled), so
  // the crate holds nothing back overnight.
  if (s.rules.goal === 'market' && s.rules.tools === 'kit') return out;
  for (const o of s.orders) {
    if (!isTaken(o)) continue;
    const it = o.items[0];
    const keep = Math.min(it.n, o.got ?? 0);
    if (keep > 0) out[it.crop] = (out[it.crop] ?? 0) + keep;
  }
  return out;
}

/**
 * At nightfall: fill what the crate can of the taken requests, let the late
 * ones go. Offers are never filled by accident. Round 7: one short of its
 * count (crops lost, no time to replant) is paid for what it gets once
 * nothing more is growing for it, or on its day.
 */
export function settleRequests(s: WorldState, ev: SimEvent[], report?: DayReport): void {
  for (const o of [...s.orders].sort(byDue)) {
    if (!isTaken(o)) continue;
    if (canDeliver(s, o) || (o.due <= s.day && inCrate(s, o) > 0)) payRequest(s, o, ev, report);
    else if (o.due <= s.day) {
      s.orders = s.orders.filter((x) => x !== o);
      if (report) (report.lapsed ??= []).push({ who: o.who, crop: o.items[0].crop, n: o.items[0].n, ...failOf(o, 'due') });
      ev.push({ type: 'request', id: o.id, who: o.who, done: false, reward: 0, crop: o.items[0].crop });
    }
  }
}

// ---------------------------------------------------------------- almanac

export function roundOf(day: number): number {
  return Math.floor((day - 1) / DAYS_PER_SEASON);
}

function goalFor(s: WorldState, kind: GoalKind, r: number): Goal {
  const id = `${kind}-${r}`;
  switch (kind) {
    case 'harvest': {
      const n = 12 + 6 * r;
      return { id, kind, text: `Harvest ${n} crops`, target: n, progress: 0, done: false };
    }
    case 'variety': {
      const n = Math.min(s.almanac.unlocked.length, 3 + Math.min(r, 4));
      return { id, kind, text: `Harvest ${n} kinds of crop`, target: n, progress: 0, done: false };
    }
    case 'quality': {
      const n = 3 + 2 * r;
      return { id, kind, text: `Harvest ${n} gold or star crops`, target: n, progress: 0, done: false, needs: { growth: 'synergy' } };
    }
    case 'earn': {
      const n = 300 + 250 * r;
      return { id, kind, text: `Earn ${n} coins`, target: n, progress: 0, done: false };
    }
    case 'growing': {
      const n = 14 + 4 * r;
      return { id, kind, text: `Have ${n} crops growing at once`, target: n, progress: 0, done: false };
    }
    case 'nowither':
      return { id, kind, text: 'Lose no crops this season', target: 1, progress: 1, done: false };
  }
}

export function startRound(s: WorldState): void {
  const a = s.almanac;
  a.round = roundOf(s.day);
  a.harvested = 0;
  a.kinds = [];
  a.fine = 0;
  a.earned = 0;
  a.withered = 0;
  const pool: GoalKind[] = ['harvest', 'variety', 'earn', 'growing', 'nowither'];
  if (s.rules.growth === 'synergy') pool.push('quality', 'quality');
  const chosen: GoalKind[] = [];
  for (const k of shuffle(s, pool)) {
    if (!chosen.includes(k)) chosen.push(k);
    if (chosen.length === 3) break;
  }
  a.goals = chosen.map((k) => goalFor(s, k, a.round));
}

/** Live progress. Called every step while the almanac is the goal. */
export function updateGoals(s: WorldState, ev: SimEvent[]): void {
  const a = s.almanac;
  let growing = 0;
  for (const p of s.plots) if (p.crop && !p.crop.dead) growing++;
  for (const g of a.goals) {
    const was = g.done;
    switch (g.kind) {
      case 'harvest':
        g.progress = a.harvested;
        break;
      case 'variety':
        g.progress = a.kinds.length;
        break;
      case 'quality':
        g.progress = a.fine;
        break;
      case 'earn':
        g.progress = a.earned;
        break;
      case 'growing':
        g.progress = Math.max(g.progress, growing);
        break;
      case 'nowither':
        g.progress = a.withered === 0 ? 1 : 0;
        break;
    }
    // Losing nothing can only be judged at the end of the season.
    g.done = g.kind === 'nowither' ? false : g.progress >= g.target;
    if (g.done && !was) ev.push({ type: 'goal', id: g.id });
  }
}

/** Close the season: stars for goals met, a seed to draft, and a new set of goals. */
export function endRound(s: WorldState): void {
  const a = s.almanac;
  for (const g of a.goals) if (g.kind === 'nowither') g.done = a.withered === 0;
  const stars = a.goals.filter((g) => g.done).length;
  a.history.push(stars);
  a.stars += stars;
  const locked = CROP_IDS.filter((c) => !a.unlocked.includes(c));
  a.draft = locked.length ? shuffle(s, locked).slice(0, 3) : null;
}

export function draft(s: WorldState, crop: CropId): boolean {
  const a = s.almanac;
  if (!a.draft?.includes(crop)) return false;
  a.unlocked.push(crop);
  a.draft = null;
  return true;
}

/** The almanac switched on: pick up at this season, with what is already planted unlocked. */
export function joinAlmanac(s: WorldState): void {
  const a = s.almanac;
  for (const p of s.plots) if (p.crop && !a.unlocked.includes(p.crop.kind)) a.unlocked.push(p.crop.kind);
  if (!a.goals.length || a.round !== roundOf(s.day)) startRound(s);
  if (!a.unlocked.includes(s.seed)) s.seed = a.unlocked[0];
}

// ---------------------------------------------------------------- milestones

/** `text` is the goal as a list item; `done` is how it reads once it is yours. */
export const MILESTONES: { id: string; text: string; done: string }[] = [
  { id: 'first', text: 'Bring in a first harvest', done: 'Your first harvest is in' },
  { id: 'field2', text: 'Buy a second field', done: 'A second field, yours' },
  { id: 'coins1k', text: 'Hold 1,000 coins', done: 'A thousand coins in the tin' },
  { id: 'pumpkin', text: 'Grow a pumpkin', done: 'Your first pumpkin' },
  { id: 'gold', text: 'Harvest a gold crop', done: 'A gold crop' },
  { id: 'hand', text: 'Hire a farmhand', done: 'A farmhand joins you' },
  { id: 'every', text: 'Harvest every kind of crop', done: 'Every kind of crop, grown' },
  { id: 'coins5k', text: 'Hold 5,000 coins', done: 'Five thousand coins in the tin' },
  { id: 'allfields', text: 'Own every field', done: 'Every field, yours' },
  { id: 'year', text: 'Farm for a whole year', done: 'A whole year on the farm' },
];

export function checkMilestones(s: WorldState, ev: SimEvent[]): void {
  const m = s.milestones;
  const hit = (id: string, cond: boolean) => {
    if (cond && !m[id]) {
      m[id] = true;
      ev.push({ type: 'milestone', id });
    }
  };
  const h = s.stats.harvested;
  hit('first', CROP_IDS.some((c) => h[c] > 0));
  hit('field2', s.parcels.filter((p) => p.owned).length >= 2);
  hit('coins1k', s.coins >= 1000);
  hit('pumpkin', h.pumpkin > 0);
  hit('hand', s.actors.some((a) => a.role === 'hand'));
  hit('every', CROP_IDS.every((c) => h[c] > 0));
  hit('coins5k', s.coins >= 5000);
  hit('allfields', s.parcels.every((p) => p.owned));
  hit('year', s.day > 40);
}
