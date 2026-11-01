// What the farm is for, per goal rule: market milestones, almanac seasons and
// town orders. Selling lives here too, because the goal decides how it works.

import { DAYS_PER_SEASON, ORDER_PREMIUM, ORDER_SLOTS, REQUEST_CHANCE, REQUEST_EXTRA, REQUEST_MAX, REQUEST_MAX_BIG, REQUEST_PREMIUM, REQUEST_SLACK, requestSlots, TOWN } from './constants';
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

/** Living crops of a kind on the farm, and the fewest days until one of them is ripe. */
function growing(s: WorldState, crop: CropId): { n: number; soonest: number } {
  let n = 0;
  let soonest = Infinity;
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (!c || c.dead || c.kind !== crop || s.parcelOf[i] < 0 || !s.parcels[s.parcelOf[i]].owned) continue;
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
    if (s.parcelOf[i] < 0 || !s.parcels[s.parcelOf[i]].owned || s.tiles[i] !== 'field') continue;
    if (s.builds.some((b) => b.y * s.W + b.x === i)) continue;
    all++;
    const c = s.plots[i].crop;
    if (!c || c.dead || (CROPS[c.kind].regrow === 0 && CROPS[c.kind].days - c.age <= days)) free++;
  }
  return { all, free };
}

/**
 * What a request pays for `n` of a crop: what they would fetch at market, and
 * a little over, at most a fifth more and never more than REQUEST_EXTRA over
 * (the good word in town is the real prize).
 */
export function requestReward(crop: CropId, n: number): number {
  const market = CROPS[crop].price * n;
  return Math.round((market + Math.min(market * (REQUEST_PREMIUM - 1), REQUEST_EXTRA)) / 5) * 5;
}

/**
 * Townsfolk ask for some of one crop. A request is filled from the crate
 * when the day ends, before the rest ships, and pays a little over market
 * plus a point of reputation, which the smith and the land agent want before
 * they will deal. Requests are few and they compete: at most two are open,
 * new ones come with the mornings, and each asks for a good share of the
 * farm, so two together want more than its plots can grow in time. Choosing
 * which to grow for is the morning's decision. A request is always for a crop
 * that can be grown and handed over in time (from seed today, or already in
 * the ground), never due after its season ends. The very first is three
 * radishes, cheap to grow, so it can be filled with what the first days teach.
 */
export function makeRequest(s: WorldState): Order | null {
  const known = s.rep < 2 ? ['radish', 'lettuce', 'carrot', 'strawberry', 'beans', 'sunflower', 'corn'] : CROP_IDS;
  const first = s.rep === 0 && !(s.requested ?? 0);
  type Option = { crop: CropId; last: number; have: number; soonest: number; seedOk: boolean; growOk: boolean };
  const options: Option[] = [];
  // A crop no other request wants, if any will do; else a second request for one that is wanted already.
  const fresh = CROP_IDS.filter((c) => !s.orders.some((o) => o.items[0].crop === c));
  const pool = fresh.some((c) => known.includes(c) && feasible(s, c)) ? fresh : CROP_IDS;
  for (const crop of pool) {
    if (!known.includes(crop)) continue;
    const g = growing(s, crop);
    const last = lastDayFor(s, crop);
    // Some could be in the crate in time: from seed sown today (ripe after its days), or already in the ground.
    const seedOk = sowing(s.day, crop).ok && s.day + CROPS[crop].days <= last;
    const growOk = g.n > 0 && s.day + g.soonest <= last;
    if (!seedOk && !growOk) continue;
    options.push({ crop, last, have: g.n, soonest: g.soonest, seedOk, growOk });
  }
  let pickFrom = options;
  if (first) {
    const radish = options.filter((o) => o.crop === 'radish');
    if (radish.length) pickFrom = radish;
  }
  // Nothing can be grown and handed over in time (the very end of a season): no request today.
  if (!pickFrom.length) return null;
  const o = pickFrom[Math.floor(rand(s) * pickFrom.length)];
  const big = CROPS[o.crop].price > 150;
  // Days to get the seed in: the request is due its growing time after that, too soon to grow two requests one
  // after the other on the same plots.
  const slack = first ? 2 : randInt(s, REQUEST_SLACK[0], REQUEST_SLACK[1]);
  // The soil free to plant in that time, and a good share of it: half to most (a third as many of the big crops).
  const room = farmPlots(s, slack);
  const most = big ? REQUEST_MAX_BIG : REQUEST_MAX;
  const share = 0.5 + rand(s) * 0.3;
  let n = first ? 3 : Math.max(3, Math.round((room.free * share) / (big ? 3 : 1)));
  // A second request competes with the first: the two together want more than that soil can grow, so only one
  // can be met. (What the first already has growing or in the crate does not need soil.)
  const other = s.orders[0];
  if (!first && other && !big) {
    const it = other.items[0];
    const still = Math.max(0, it.n - stockCount(s, it.crop) - growing(s, it.crop).n);
    n = Math.max(n, room.free - still + 1);
  }
  n = Math.min(n, most, Math.max(3, room.free));
  // Out of seed time, it asks only for what is already growing.
  if (!o.seedOk) n = Math.max(1, Math.min(n, o.have));
  // Ready when enough is in the ground, or when seed sown today would be.
  const ready = o.growOk && o.have >= n ? Math.min(o.soonest, o.seedOk ? CROPS[o.crop].days : Infinity) : CROPS[o.crop].days;
  const due = Math.min(o.last, s.day + ready + slack);
  s.requested = (s.requested ?? 0) + 1;
  return {
    id: s.nextId++,
    who: pick(s, TOWN),
    items: [{ crop: o.crop, n }],
    reward: requestReward(o.crop, n),
    rep: 1,
    due,
  };
}

/** Could some of this crop be in the crate before its season ends? */
function feasible(s: WorldState, crop: CropId): boolean {
  const last = lastDayFor(s, crop);
  const g = growing(s, crop);
  return (sowing(s.day, crop).ok && s.day + CROPS[crop].days <= last) || (g.n > 0 && s.day + g.soonest <= last);
}

/**
 * Pin new requests. The first comes as soon as the board is read; after that
 * they come only with the mornings, one at a time, and not every morning:
 * one until the first is filled, then at most two.
 */
export function fillRequests(s: WorldState, morning = false): void {
  const slots = requestSlots(s.rep);
  if (!s.requested && !s.orders.length) {
    const o = makeRequest(s);
    if (o) s.orders.push(o);
    return;
  }
  if (!morning || s.orders.length >= slots) return;
  // An empty board always gets one; a second waits on the town's mood.
  if (s.orders.length && rand(s) >= REQUEST_CHANCE) return;
  const o = makeRequest(s);
  if (o) s.orders.push(o);
}

/**
 * How many of each crop the open requests still want from the crate: the
 * crate keeps them overnight instead of selling them. Only for a request that
 * can still be met (the crate and what will be ripe by its day make enough);
 * crops held for one that cannot would only miss a night's sale.
 */
export function wanted(s: WorldState): Partial<Record<CropId, number>> {
  const out: Partial<Record<CropId, number>> = {};
  for (const o of s.orders) {
    for (const it of o.items) {
      let soon = stockCount(s, it.crop);
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
  for (const o of s.orders.slice()) {
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
      ev.push({ type: 'request', id: o.id, who: o.who, done: false, reward: 0 });
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
