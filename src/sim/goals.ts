// What the farm is for, per goal rule: market milestones, almanac seasons and
// town orders. Selling lives here too, because the goal decides how it works.

import { DAYS_PER_SEASON, ORDER_PREMIUM, ORDER_SLOTS, REQUEST_EVEN, REQUEST_LOOK, REQUEST_MAX, REQUEST_MAX_BIG, REQUEST_MIN, REQUEST_PAY, REQUEST_PAY_MID, REQUEST_PAY_PER_PLOT, REQUEST_SHARE, REQUEST_SOW, requestSlots, TOWN } from './constants';
import { CROP_IDS, CROPS, count, inSeason } from './crops';
import { season } from './world';
import { nightsToTurn, priceOf, sowing } from './actions';
import { pick, rand, randInt, shuffle } from './rng';
import type { CropId, DayReport, Goal, GoalKind, Order, SimEvent, WorldState } from './types';

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
  if (s.rules.goal === 'market' && s.rules.tools === 'kit') return o.items.every((it) => stockCount(s, it.crop) - claimedAhead(s, it.crop, o.due, o.id) >= it.n);
  return o.items.every((it) => stockCount(s, it.crop) >= it.n);
}

export function deliver(s: WorldState, id: number, ev: SimEvent[]): boolean {
  const o = s.orders.find((x) => x.id === id);
  if (!o || !canDeliver(s, o)) return false;
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
  // Sunup calls them requests, and says who took the crops.
  if (s.rules.goal === 'market' && s.rules.tools === 'kit') ev.push({ type: 'request', id: o.id, who: o.who, done: true, reward: o.reward });
  else ev.push({ type: 'order', id: o.id, done: true });
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

/** The order requests for one crop are filled in: due sooner first, then pinned first. */
function byDue(a: Order, b: Order): number {
  return a.due - b.due || a.id - b.id;
}

/**
 * How many of a crop the open requests for it that come first (due sooner,
 * or pinned first) want: the crate fills those before this one. Two requests
 * for one crop can be open at once once the first is fully sown.
 */
function claimedAhead(s: WorldState, crop: CropId, due: number, id: number): number {
  let n = 0;
  for (const q of s.orders) if (q.id !== id && q.items[0].crop === crop && byDue(q, { due, id } as Order) < 0) n += q.items[0].n;
  return n;
}

/**
 * What a request has already: its crop in the crate, and growing on the farm
 * that will be ripe and picked by its day, less what requests for the same
 * crop that come first will take.
 */
export function requestHave(s: WorldState, o: Order): number {
  const it = o.items[0];
  let have = stockCount(s, it.crop);
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (!c || c.dead || c.kind !== it.crop || !ownedPlot(s, i)) continue;
    // Ripe on the morning `days - age` days from now, if it is watered every night.
    if (CROPS[c.kind].days - c.age <= o.due - s.day) have++;
  }
  return Math.max(0, have - claimedAhead(s, it.crop, o.due, o.id));
}

/** Crops of a request's kind sown since it was pinned: planting for it has begun. */
export function plantedFor(s: WorldState, o: Order): number {
  const it = o.items[0];
  const since = o.made ?? Infinity;
  let n = 0;
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (c && !c.dead && c.kind === it.crop && c.planted >= since && ownedPlot(s, i)) n++;
  }
  return n;
}

/** Has the farmer begun on it (or is it met already)? A request nobody has begun on is still an offer. */
export function begun(s: WorldState, o: Order): boolean {
  const it = o.items[0];
  return plantedFor(s, o) > 0 || stockCount(s, it.crop) - claimedAhead(s, it.crop, o.due, o.id) >= it.n;
}

/** Does a request still want seed sown for it (on offer, or under way and short of what it needs before its sow-by day)? */
function stillSowing(s: WorldState, o: Order): boolean {
  return !begun(s, o) || (s.day <= sowByOf(o) && requestHave(s, o) < o.items[0].n);
}

/**
 * Coins the farm can put into seed by a sow-by day: the coins in hand, and,
 * when that day is still to come, what the crate and the crops ripe by the
 * day before it will sell for overnight. Crops a request wants are not for
 * sale, so they do not count.
 */
export function sowBudget(s: WorldState, sowBy: number): number {
  if (sowBy <= s.day) return s.coins;
  const kept = new Set(s.orders.map((o) => o.items[0].crop));
  let value = 0;
  for (const c of CROP_IDS) if (!kept.has(c)) value += stockCount(s, c) * CROPS[c].price;
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (!c || c.dead || kept.has(c.kind) || !ownedPlot(s, i)) continue;
    if (CROPS[c.kind].days - c.age <= sowBy - s.day - 1) value += CROPS[c.kind].price;
  }
  return s.coins + value;
}

/** Plots free to plant by a sow-by day. */
function roomBy(s: WorldState, sowBy: number): number {
  return farmPlots(s, Math.max(0, sowBy - s.day)).free;
}

/**
 * Could a request still be met? What it has already, and, until its sow-by
 * day has passed, what can still be sown for it: free soil and the coins for
 * the seed.
 */
export function canMeet(s: WorldState, o: Order): boolean {
  const it = o.items[0];
  const need = it.n - requestHave(s, o);
  if (need <= 0) return true;
  const sowBy = sowByOf(o);
  if (s.day > sowBy || !sowing(s.day, it.crop).ok) return false;
  return need <= roomBy(s, sowBy) && need * CROPS[it.crop].seed <= sowBudget(s, sowBy);
}

/** How many of a request are to be sown fresh; the rest are crops already growing (older saves: all of it). */
export function freshOf(o: Order): number {
  return Math.max(1, Math.min(o.items[0].n, o.fresh ?? o.items[0].n));
}

/** What a crop earns over its seed for each plot and day it takes, paid `ratio` times market. */
function rate(crop: CropId, ratio: number): number {
  const d = CROPS[crop];
  return (d.price * ratio - d.seed) / d.days;
}

/** The pay over market at which a crop earns `perDay` over its seed for each plot and day. */
function ratioFor(crop: CropId, perDay: number): number {
  const d = CROPS[crop];
  return (d.seed + perDay * d.days) / d.price;
}

/**
 * What a request earns over the seed it has you buy, for each plot and day
 * its fresh sowing takes. The two of a pair are priced to match on this, so
 * neither is simply the better deal. Crops already growing that it counts are
 * paid at market and left out.
 */
export function perPlotDay(o: Order): number {
  const it = o.items[0];
  const d = CROPS[it.crop];
  const fresh = freshOf(o);
  return (o.reward - (it.n - fresh) * d.price - fresh * d.seed) / (fresh * d.days);
}

/** The most a request pays for what it has you sow: so much for each plot of owned field, so requests grow with the farm. */
export function payCap(s: WorldState): number {
  return REQUEST_PAY_PER_PLOT * farmPlots(s).all;
}

/**
 * What a request pays: the crops already growing that it counts at market
 * (no premium for what would have sold anyway), and those it has you sow at
 * their seed and `perDay` for each plot and day they take, in fives.
 */
export function requestReward(crop: CropId, base: number, fresh: number, perDay: number): number {
  const d = CROPS[crop];
  return base * d.price + Math.round((fresh * (d.seed + perDay * d.days)) / 5) * 5;
}

/** One crop a request could ask for this morning: its days, and what the farm could grow of it alone. */
interface Offer {
  crop: CropId;
  sowBy: number;
  due: number;
  /** Already in the crate or growing in time (only for a crop the farm grows already). */
  base: number;
  room: number;
  coins: number;
  /** The most of it that could be sown for this request alone. */
  cap: number;
}

/**
 * A crop a request could ask for: sown by a day or two from now, or, when the
 * soil is full, by the day enough of it comes free (up to `REQUEST_LOOK`
 * days), and ripe before its season ends.
 */
function offer(s: WorldState, crop: CropId, days: number, held: { plots: number; coins: number }): Offer | null {
  if (!sowing(s.day, crop).ok) return null;
  const d = CROPS[crop];
  const last = lastDayFor(s, crop) - d.days;
  for (let k = days; k <= Math.max(days, REQUEST_LOOK); k++) {
    const sowBy = Math.min(s.day + k, last);
    if (sowBy < s.day) return null;
    if (sowing(sowBy, crop).ok) {
      const room = roomBy(s, sowBy) - held.plots;
      const coins = sowBudget(s, sowBy) - held.coins;
      const cap = Math.min(room, Math.floor(coins / d.seed), d.price > 150 ? REQUEST_MAX_BIG : REQUEST_MAX);
      // Due a day after seed sown on the sow-by day would ripen: one missed watering does not cost the request (except
      // at a season's end, when the turn comes first).
      if (cap >= REQUEST_MIN) return { crop, sowBy, due: Math.min(sowBy + d.days + 1, lastDayFor(s, crop)), base: 0, room, coins, cap };
    }
    if (sowBy >= last) return null;
  }
  return null;
}

/** The most of an offer to sow at `perDay`: what fits by its sow-by day, and what the farm's pay cap allows. */
function most(s: WorldState, o: Offer, perDay: number): number {
  const d = CROPS[o.crop];
  return Math.min(o.cap, Math.floor(payCap(s) / (d.seed + perDay * d.days)));
}

function order(s: WorldState, o: Offer, fresh: number, perDay: number, who: string, pair?: number): Order {
  const n = o.base + fresh;
  return { id: s.nextId++, who, items: [{ crop: o.crop, n }], reward: requestReward(o.crop, o.base, fresh, perDay), rep: 1, due: o.due, sowBy: o.sowBy, made: s.day, pair, fresh };
}

/**
 * Townsfolk ask for some of one crop. A request is filled from the crate
 * when the day ends, before the rest ships, and pays clearly more than
 * market for what it has you sow, plus a point of reputation, which the
 * smith and the land agent want before they will deal.
 *
 * The very first is three radishes, cheap to grow, so it can be filled with
 * what the first days teach. After that requests come as a pair, and only
 * one of the two can be taken: seed sown for one withdraws the other
 * (`closePairs`). Choosing between them is the morning's decision. Each of a
 * pair
 *   - needs fresh sowing: it is for a crop the farm is not growing (when
 *     fewer than two such crops can go in, one may be for a crop it grows,
 *     asking for that many more, and paying market for those it has);
 *   - fits what the farm can afford by its sow-by day (coins, the crate,
 *     what ripens in time) and the soil free by then;
 *   - asks for a share of the farm's plots, and pays at most so much for
 *     each plot owned (`payCap`), so requests grow with the farm and none is
 *     a windfall;
 *   - earns the same over its seed, for each plot and day, as the other, and
 *     about as much in all: one is many plots for a short time, say, the
 *     other few plots for long, so neither is simply the better deal;
 *   - is never for a crop that regrows (its seed pays back over many picks);
 *   - is sown by a day or two from now (later when the soil is full, by the
 *     day it comes free) and is due its crop's growing time after that,
 *     never after its season ends.
 * Returns the requests to pin: one, two, or none when nothing fits.
 */
export function offerRequests(s: WorldState): Order[] {
  const first = s.rep === 0 && !(s.requested ?? 0);
  if (first) {
    const o = offer(s, 'radish', 2, { plots: 0, coins: 0 });
    const d = CROPS.radish;
    const sowBy = Math.min(s.day + 2, lastDayFor(s, 'radish') - d.days);
    if (!o && (sowBy < s.day || !sowing(s.day, 'radish').ok)) return [];
    s.requested = (s.requested ?? 0) + 1;
    return [order(s, o ?? { crop: 'radish', sowBy, due: Math.min(sowBy + d.days + 1, lastDayFor(s, 'radish')), base: 0, room: 3, coins: 30, cap: 3 }, 3, rate('radish', REQUEST_PAY_MID), pick(s, TOWN))];
  }
  // Crops that regrow are left out: their seed pays back over many picks, which a request for one pick would hide,
  // so a request for them reads as a bad deal beside any other.
  const known = CROP_IDS.filter((c) => CROPS[c].regrow === 0 && (s.rep >= 2 || c !== 'pumpkin'));
  const days = randInt(s, REQUEST_SOW[0], REQUEST_SOW[1]);
  // What the requests already under way still need sowing takes its soil and seed first.
  const held = { plots: 0, coins: 0 };
  for (const o of s.orders) {
    const still = Math.max(0, o.items[0].n - requestHave(s, o));
    if (s.day > sowByOf(o)) continue;
    held.plots += still;
    held.coins += still * CROPS[o.items[0].crop].seed;
  }
  // A crop already asked for is asked again only once the request for it is fully sown (summer and winter have only
  // two crops a request can ask for, and both are often under way).
  const asked = new Set(s.orders.filter((o) => stillSowing(s, o)).map((o) => o.items[0].crop));
  const fresh: Offer[] = [];
  const grown: Offer[] = [];
  for (const crop of shuffle(s, known.slice())) {
    if (asked.has(crop)) continue;
    const o = offer(s, crop, days, held);
    if (!o) continue;
    if (!growing(s, crop).n && !stockCount(s, crop)) fresh.push(o);
    else {
      o.base = requestHave(s, { id: Number.MAX_SAFE_INTEGER, who: '', items: [{ crop, n: 0 }], reward: 0, rep: 0, due: o.due });
      grown.push(o);
    }
  }
  const pool = [...fresh, ...grown];
  if (!pool.length) return [];
  const plots = farmPlots(s).all;
  const share = () => REQUEST_SHARE[0] + rand(s) * (REQUEST_SHARE[1] - REQUEST_SHARE[0]);
  const names = shuffle(s, TOWN.slice());
  // Try pairs in order until one can be made that earns the same for each plot and day, within the pay band.
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const A = pool[i];
      const B = pool[j];
      const perDay = (rate(A.crop, REQUEST_PAY_MID) + rate(B.crop, REQUEST_PAY_MID)) / 2;
      const ra = ratioFor(A.crop, perDay);
      const rb = ratioFor(B.crop, perDay);
      if (ra < REQUEST_PAY[0] || ra > REQUEST_PAY[1] || rb < REQUEST_PAY[0] || rb > REQUEST_PAY[1]) continue;
      // A asks for a share of the farm; B for about as many plot-days, so the two pay about the same in all too.
      const a = Math.min(most(s, A, perDay), Math.max(REQUEST_MIN, Math.round(plots * share())));
      if (a < REQUEST_MIN) continue;
      const b = Math.min(most(s, B, perDay), Math.max(REQUEST_MIN, Math.round((a * CROPS[A.crop].days) / CROPS[B.crop].days)));
      if (b < REQUEST_MIN) continue;
      const pair = s.nextId;
      const out = [order(s, A, a, perDay, names[0], pair), order(s, B, b, perDay, names[1], pair)];
      // Rounding to fives must not undo the evening out.
      const [pa, pb] = out.map(perPlotDay);
      if (Math.abs(pa - pb) > REQUEST_EVEN * Math.max(pa, pb)) continue;
      s.requested = (s.requested ?? 0) + 2;
      return rand(s) < 0.5 ? out : [out[1], out[0]];
    }
  }
  // Only one crop can go in: one request, a share of the farm.
  const A = pool[0];
  const perDay = rate(A.crop, REQUEST_PAY_MID);
  const a = Math.min(most(s, A, perDay), Math.max(REQUEST_MIN, Math.round(plots * share())));
  if (a < REQUEST_MIN) return [];
  s.requested = (s.requested ?? 0) + 1;
  return [order(s, A, a, perDay, names[0])];
}

/** How far sowing for a request has got, as a share of what it has you sow. */
function progress(s: WorldState, o: Order): number {
  return plantedFor(s, o) / freshOf(o);
}

/**
 * Only one of a pair can be taken. Once seed for one of them goes in, the
 * other is withdrawn at once, with a word (when seed went in for both, the
 * one further along stays).
 */
export function closePairs(s: WorldState, ev: SimEvent[]): void {
  for (const o of s.orders.slice()) {
    if (o.pair === undefined || !s.orders.includes(o)) continue;
    const mate = s.orders.find((q) => q !== o && q.pair === o.pair);
    if (!mate) continue;
    const bo = begun(s, o);
    const bm = begun(s, mate);
    if (!bo && !bm) continue;
    const drop = bo && bm ? (progress(s, o) >= progress(s, mate) ? mate : o) : bo ? mate : o;
    s.orders = s.orders.filter((x) => x !== drop);
    ev.push({ type: 'request', id: drop.id, who: drop.who, done: false, reward: 0, crop: drop.items[0].crop });
  }
}

/**
 * Pin new requests. The first comes as soon as the board is read. After
 * that they come only with the mornings: a pair, on a morning when no
 * request is still waiting to be chosen (nothing sown for it), and while
 * the first is unfilled, nothing more.
 */
export function fillRequests(s: WorldState, morning = false): void {
  if (!s.requested && !s.orders.length) {
    s.orders.push(...offerRequests(s));
    return;
  }
  if (!morning || s.orders.length >= requestSlots(s.rep)) return;
  if (s.orders.some((o) => !begun(s, o))) return;
  s.orders.push(...offerRequests(s));
}

/**
 * In the morning: a request that can no longer be met is withdrawn (its
 * sow-by day went by without enough sown, or what was sown since took the
 * soil or the coins it needed), with a word on the morning card.
 */
export function withdrawRequests(s: WorldState, ev: SimEvent[], report?: DayReport | null): void {
  closePairs(s, ev);
  for (const o of s.orders.slice()) {
    if (canMeet(s, o)) continue;
    s.orders = s.orders.filter((x) => x !== o);
    if (report) (report.withdrawn ??= []).push({ who: o.who, crop: o.items[0].crop, n: o.items[0].n });
    ev.push({ type: 'request', id: o.id, who: o.who, done: false, reward: 0, crop: o.items[0].crop });
  }
}

/**
 * How many of each crop the open requests still want from the crate: the
 * crate keeps them overnight instead of selling them. Only for a request that
 * can still be met (the crate and what will be ripe by its day make enough);
 * crops held for one that cannot would only miss a night's sale.
 */
export function wanted(s: WorldState): Partial<Record<CropId, number>> {
  const out: Partial<Record<CropId, number>> = {};
  for (const o of [...s.orders].sort(byDue)) {
    for (const it of o.items) {
      let soon = stockCount(s, it.crop) - claimedAhead(s, it.crop, o.due, o.id);
      for (let i = 0; i < s.plots.length && soon < it.n; i++) {
        const c = s.plots[i].crop;
        if (!c || c.dead || c.kind !== it.crop || s.parcelOf[i] < 0 || !s.parcels[s.parcelOf[i]].owned) continue;
        // Ripe tomorrow when grown tonight; else it needs a night for each day of growth left.
        if (CROPS[c.kind].days - c.age <= o.due - s.day - 1) soon++;
      }
      if (soon >= it.n) out[it.crop] = (out[it.crop] ?? 0) + it.n;
    }
  }
  return out;
}

/** At nightfall: fill what the crate can, let the late ones go. */
export function settleRequests(s: WorldState, ev: SimEvent[], report?: DayReport): void {
  for (const o of [...s.orders].sort(byDue)) {
    if (canDeliver(s, o)) {
      const it = o.items[0];
      let left = it.n;
      for (let q = 0; q < 4 && left > 0; q++) {
        const take = Math.min(left, s.stock[it.crop][q]);
        s.stock[it.crop][q] -= take;
        left -= take;
      }
      s.orders = s.orders.filter((x) => x !== o);
      s.coins += o.reward;
      s.stats.earned += o.reward;
      s.rep += o.rep;
      if (report) (report.filled ??= []).push({ who: o.who, reward: o.reward });
      ev.push({ type: 'request', id: o.id, who: o.who, done: true, reward: o.reward });
    } else if (o.due <= s.day) {
      s.orders = s.orders.filter((x) => x !== o);
      if (report) (report.lapsed ??= []).push({ who: o.who, crop: o.items[0].crop, n: o.items[0].n });
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
