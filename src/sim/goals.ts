// What the farm is for, per goal rule: market milestones, almanac seasons and
// town orders. Selling lives here too, because the goal decides how it works.

import { DAYS_PER_SEASON, ORDER_PREMIUM, ORDER_SLOTS, REQUEST_BOLD, REQUEST_GAIN_PER_PLOT, REQUEST_GRACE, REQUEST_LOOK, REQUEST_MAX, REQUEST_MAX_BIG, REQUEST_MIN, REQUEST_MOST, REQUEST_RATE, REQUEST_RISK, REQUEST_SHARE, REQUEST_SOIL, REQUEST_SOW, REQUEST_SPAN, requestSlots, TOWN } from './constants';
import { CROP_IDS, CROPS, count, inSeason } from './crops';
import { season } from './world';
import { nightsToTurn, priceOf, sowing } from './actions';
import { pick, rand, randInt, shuffle } from './rng';
import type { CropId, DayReport, Goal, GoalKind, Order, RequestKind, SimEvent, WorldState } from './types';

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
  if (s.rules.goal === 'market' && s.rules.tools === 'kit') return isTaken(o) && o.items.every((it) => stockCount(s, it.crop) - claimedAhead(s, it.crop, o.due, o.id) >= it.n);
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

/**
 * How many of a crop the taken requests for it that come first (due sooner,
 * or pinned first) want: the crate fills those before this one. Two requests
 * for one crop can be open at once once the first is fully sown. Offers
 * claim nothing.
 */
function claimedAhead(s: WorldState, crop: CropId, due: number, id: number): number {
  let n = 0;
  for (const q of s.orders) if (q.id !== id && isTaken(q) && q.items[0].crop === crop && byDue(q, { due, id } as Order) < 0) n += q.items[0].n;
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

/** Crops of a request's kind on the farm, living and sown since it was pinned. */
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

/** What a taken request has growing for it now (its crop on the farm, ripe by its day) and in the crate, for the board. */
export function requestProgress(s: WorldState, o: Order): { growing: number; crate: number } {
  const it = o.items[0];
  const crate = Math.min(it.n, Math.max(0, stockCount(s, it.crop) - claimedAhead(s, it.crop, o.due, o.id)));
  return { growing: Math.max(0, Math.min(it.n, requestHave(s, o)) - crate), crate };
}

/** Does a request still want seed sown for it (on offer, or taken and short of what it needs before its sow-by day)? */
function stillSowing(s: WorldState, o: Order): boolean {
  return offered(o) || (s.day <= sowByOf(o) && requestHave(s, o) < o.items[0].n);
}

/**
 * Coins the farm can put into seed by a sow-by day: the coins in hand, and,
 * when that day is still to come, what the crate and the crops ripe by the
 * day before it will sell for overnight. Crops a taken request wants are not
 * for sale, so they do not count.
 */
export function sowBudget(s: WorldState, sowBy: number): number {
  if (sowBy <= s.day) return s.coins;
  const kept = new Set(s.orders.filter(isTaken).map((o) => o.items[0].crop));
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

/** Why a request can no longer be met ('late', 'soil' or 'coins'), or '' when it can. For the board's stamp. */
export function whyNot(s: WorldState, o: Order): '' | 'late' | 'soil' | 'coins' {
  const it = o.items[0];
  const need = it.n - requestHave(s, o);
  if (need <= 0) return '';
  const sowBy = sowByOf(o);
  if (s.day > sowBy || !sowing(s.day, it.crop).ok) return 'late';
  if (need > roomBy(s, sowBy)) return 'soil';
  if (need * CROPS[it.crop].seed > sowBudget(s, sowBy)) return 'coins';
  return '';
}

/** How many of a request are to be sown fresh; the rest are crops already growing (older saves: all of it). */
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

/** The share of its gain a request counts for in `neutralValue`: one with no day to spare comes through four times in five. */
function reliability(slack: number): number {
  return slack <= 0 ? REQUEST_RISK : 1;
}

/** What a plot-day of soil is worth for a sort of request (`REQUEST_SOIL`). */
export function soilValue(kind: RequestKind | undefined): number {
  if (kind === 'rush' || kind === 'easy') return REQUEST_SOIL.risk;
  if (kind === 'long' || kind === 'quick') return REQUEST_SOIL.time;
  if (kind === 'big' || kind === 'small') return REQUEST_SOIL.size;
  return REQUEST_SOIL.single;
}

/**
 * What a request is worth to a typical farm: its gain (one with no day to
 * spare counted at the share that comes through), less what the soil it holds
 * could have earned meanwhile. The two of a pair are priced to match on this,
 * up to rounding; which is really better then turns on the farm (its free
 * soil, coins and stamina, and the forecast), which is the decision.
 */
export function neutralValue(o: Order): number {
  return gainOf(o) * reliability(slackOf(o)) - soilValue(o.kind) * plotDays(o);
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
  /** Already in the crate or growing in time (only for a crop the farm grows already). */
  base: number;
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
        const coins = sowBudget(s, sowBy) - held.coins;
        const cap = Math.min(room, Math.floor(coins / d.seed), d.price > 150 ? REQUEST_MAX_BIG : REQUEST_MAX);
        if (cap >= REQUEST_MIN) return { crop, sowBy, due: Math.min(sowBy + d.days + grace, lastDayFor(s, crop)), base: 0, room, coins, cap };
      }
      if (sowBy >= last) break;
    }
  }
  return null;
}

/** Fives, as coins are counted on the board. */
function fives(n: number): number {
  return Math.round(n / 5) * 5;
}

function order(s: WorldState, o: Offer, fresh: number, gain: number, kind: RequestKind, who: string, pair?: number): Order {
  const n = o.base + fresh;
  return { id: s.nextId++, who, items: [{ crop: o.crop, n }], reward: n * CROPS[o.crop].price + gain, rep: 1, due: o.due, sowBy: o.sowBy, made: s.day, pair, fresh, kind, taken: false, seen: false };
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
 * Price the two of a pair. The safe one earns `REQUEST_RATE` for each plot
 * and day its sowing takes; the bold one is priced to match it on
 * `neutralValue`. Both are capped (`gainCap`). Null when, after the caps, the
 * bold one does not offer clearly more gain (`REQUEST_BOLD`).
 */
function pricePair(s: WorldState, safe: { o: Offer; n: number }, bold: { o: Offer; n: number }, soil: number): { safe: number; bold: number; nb: number; ns: number } | null {
  const cap = gainCap(s);
  const slack = (o: Offer) => Math.max(0, o.due - o.sowBy - CROPS[o.crop].days);
  let ns = safe.n;
  let nb = bold.n;
  for (let tries = 0; tries < 30; tries++) {
    const pdS = ns * CROPS[safe.o.crop].days;
    const pdB = nb * CROPS[bold.o.crop].days;
    const gs = REQUEST_RATE * pdS;
    const gb = (gs * reliability(slack(safe.o)) - soil * pdS + soil * pdB) / reliability(slack(bold.o));
    if (fives(gs) > cap && ns > REQUEST_MIN) {
      ns--;
      continue;
    }
    if (fives(gb) > cap && nb > REQUEST_MIN) {
      nb--;
      continue;
    }
    if (fives(gs) > cap || fives(gb) > cap) return null;
    if (fives(gb) < REQUEST_BOLD * fives(gs)) return null;
    return { safe: fives(gs), bold: fives(gb), nb, ns };
  }
  return null;
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
 *   - fits what the farm can afford by its sow-by day (coins, the crate,
 *     what ripens in time) and the soil free by then;
 *   - is priced so the two come out alike for a typical farm
 *     (`neutralValue`), with the bold one offering clearly more gain;
 *   - gains at most so much for each plot owned (`gainCap`);
 *   - is never for a crop that regrows (its seed pays back over many picks).
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
    const r = order(s, o ?? { crop: 'radish', sowBy, due: Math.min(sowBy + d.days + 1, lastDayFor(s, 'radish')), base: 0, room: 3, coins: 30, cap: 3 }, 3, fives(REQUEST_RATE * 3 * d.days), 'first', pick(s, TOWN));
    // The lesson's own request: taken at once.
    delete r.taken;
    return [r];
  }
  // Crops that regrow are left out: their seed pays back over many picks, which a request for one pick would hide,
  // so a request for them reads as a bad deal beside any other.
  const known = CROP_IDS.filter((c) => CROPS[c].regrow === 0 && (s.rep >= 2 || c !== 'pumpkin'));
  const days = randInt(s, REQUEST_SOW[0], REQUEST_SOW[1]);
  // What the taken requests still need sowing takes its soil and seed first.
  const held = { plots: 0, coins: 0 };
  for (const o of s.orders) {
    if (!isTaken(o) || s.day > sowByOf(o)) continue;
    const still = stillToSow(s, o);
    held.plots += still;
    held.coins += still * CROPS[o.items[0].crop].seed;
  }
  // A crop already asked for is asked again only once the request for it is fully sown (summer and winter have only
  // two crops a request can ask for, and both are often under way).
  const asked = new Set(s.orders.filter((o) => stillSowing(s, o)).map((o) => o.items[0].crop));
  const crops = shuffle(s, known.slice()).filter((c) => !asked.has(c) && sowing(s.day, c).ok);
  // Fresh crops (not growing, not in the crate) first; one the farm grows only when fewer than two fresh ones can go in.
  const isFresh = (c: CropId) => !growing(s, c).n && !stockCount(s, c);
  const fresh = crops.filter((c) => isFresh(c) && offer(s, c, days, held, REQUEST_GRACE.other));
  const pool = fresh.length >= 2 ? fresh : [...fresh, ...crops.filter((c) => !isFresh(c))];
  if (!pool.length) return [];
  const plots = farmPlots(s).all;
  const names = shuffle(s, TOWN.slice());
  /** An offer of one crop for one sort of request, with what the crate and the ground already hold counted in. */
  const make = (crop: CropId, kind: RequestKind): Offer | null => {
    const t = timing(kind, days);
    const o = offer(s, crop, t.days, held, t.grace, t.look);
    if (!o) return null;
    if (!isFresh(crop)) o.base = requestHave(s, { id: Number.MAX_SAFE_INTEGER, who: '', items: [{ crop, n: 0 }], reward: 0, rep: 0, due: o.due });
    return o;
  };
  const size = (o: Offer, n: number) => Math.max(REQUEST_MIN, Math.min(o.cap, Math.ceil(plots * REQUEST_MOST), Math.round(n)));
  // Each morning tries the sorts of pair in a fresh order, the one offered last time last.
  const order3 = shuffle(s, CONTRASTS.slice()).sort((a, b) => Number(a.id === s.pairKind) - Number(b.id === s.pairKind));
  for (const c of order3) {
    // The crops each sort wants: any two for risk; the fastest against a slower one for time; the cheapest seed
    // against a dearer one for size.
    const options: [CropId, CropId][] = [];
    for (const a of pool) for (const b of pool) {
      if (a === b) continue;
      const da = CROPS[a];
      const db = CROPS[b];
      if (c.id === 'risk') options.push([a, b]);
      else if (c.id === 'time' && db.days >= da.days + 2) options.push([a, b]);
      else if (c.id === 'size' && db.seed >= da.seed * 1.5) options.push([b, a]);
    }
    // Risk against reward needs only one crop: some of it sown today with no day to spare, or a little later with two.
    // (Summer has two crops a request can name, and one is often under way.)
    if (c.id === 'risk') for (const a of pool) options.push([a, a]);
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
      const pdS = ns * CROPS[safeCrop].days;
      const span = c.bold === 'long' ? REQUEST_SPAN.long : c.bold === 'big' ? REQUEST_SPAN.big : 1;
      const nb = size(bo, (span * pdS) / CROPS[boldCrop].days);
      const priced = pricePair(s, { o: so, n: ns }, { o: bo, n: nb }, soilValue(c.safe));
      if (!priced) continue;
      const pair = s.nextId;
      const out = [order(s, so, priced.ns, priced.safe, c.safe, names[0], pair), order(s, bo, priced.nb, priced.bold, c.bold, names[1], pair)];
      s.requested = (s.requested ?? 0) + 2;
      s.pairKind = c.id;
      return rand(s) < 0.5 ? out : [out[1], out[0]];
    }
  }
  // No pair fits (one crop can go in, say): one request, a share of the farm, at the safe rate.
  for (const crop of pool) {
    const o = make(crop, 'single');
    if (!o) continue;
    let n = size(o, plots * REQUEST_SHARE.single);
    while (n > REQUEST_MIN && fives(REQUEST_RATE * n * CROPS[crop].days) > gainCap(s)) n--;
    const gain = fives(REQUEST_RATE * n * CROPS[crop].days);
    if (gain > gainCap(s)) continue;
    s.requested = (s.requested ?? 0) + 1;
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
  for (const q of s.orders.slice()) {
    if (q === o || q.pair === undefined || q.pair !== o.pair || !offered(q)) continue;
    s.orders = s.orders.filter((x) => x !== q);
    ev.push({ type: 'request', id: q.id, who: q.who, done: false, reward: 0, crop: q.items[0].crop });
  }
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
    if (canMeet(s, o)) continue;
    s.orders = s.orders.filter((x) => x !== o);
    if (report && isTaken(o)) (report.withdrawn ??= []).push({ who: o.who, crop: o.items[0].crop, n: o.items[0].n });
    ev.push({ type: 'request', id: o.id, who: o.who, done: false, reward: 0, crop: o.items[0].crop });
  }
}

/**
 * How many of each crop the taken requests still want from the crate: the
 * crate keeps them overnight instead of selling them. Only for a request that
 * can still be met (the crate and what will be ripe by its day make enough);
 * crops held for one that cannot would only miss a night's sale.
 */
export function wanted(s: WorldState): Partial<Record<CropId, number>> {
  const out: Partial<Record<CropId, number>> = {};
  for (const o of [...s.orders].sort(byDue)) {
    if (!isTaken(o)) continue;
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

/** At nightfall: fill what the crate can of the taken requests, let the late ones go. Offers are never filled by accident. */
export function settleRequests(s: WorldState, ev: SimEvent[], report?: DayReport): void {
  for (const o of [...s.orders].sort(byDue)) {
    if (!isTaken(o)) continue;
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
