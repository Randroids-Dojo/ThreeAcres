// A headless player for tuning quotas and prices. For each play it tries every
// legal card and target on a copy of the run, resolves tonight on the copy with
// a sampled rng (so it cannot see the real dice), then rolls the board forward
// calm nights to the season's end, discounted, so a perennial that picks for
// days is worth what it pays; it keeps the best play while it beats ending the
// day.

import {
  allCards,
  buyCard,
  buyPage,
  buyScoop,
  buySlot,
  canBuyScoop,
  canBuySlot,
  maxPages,
  slotPrice,
  scoopPrice,
  canRemove,
  canUpgrade,
  CARDS,
  cloneRun,
  endDay,
  leaveShop,
  moveTargets,
  newRun,
  night,
  playCard,
  recordRun,
  removeCard,
  reroll,
  SEEDS,
  targetsFor,
  toss,
  TUNING,
  UNLOCK_ORDER,
  upgradeCard,
  type CardId,
  type Ev,
  type Meta,
  type PageId,
  type RunState,
  type SeedId,
} from './rules';

export interface BotOpts {
  /** 0 plays the best line it can see; higher adds noise to every judgement, like a looser player. */
  noise: number;
  /** Seed for the bot's own sampling. */
  seed: number;
  /** Plays it looks ahead within a day (1 or 2). */
  depth?: number;
  /** Noise in the shop only, if different from play. */
  shopNoise?: number;
  /** Play the guided first season's set hands. */
  guided?: boolean;
}

export { cloneRun };

export class Dice {
  constructor(public rng: number) {}
  next(): number {
    let t = (this.rng = (this.rng + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

const NONE: Ev[] = [];

/** Tonight for real (sampled dice), then calm nights to the season's end and a few past it (the plot carries over), discounted. */
function evaluate(s: RunState, sample: number): number {
  const c = cloneRun(s);
  c.rng = sample;
  const start = c.earned;
  NONE.length = 0;
  night(c, NONE);
  let v = c.earned - start;
  const nights = TUNING.days - s.day + CARRY;
  // Roll forward as if nothing goes wrong.
  c.year = 1;
  c.season = 0;
  const barrel = c.pages.includes('barrel');
  let k = DISCOUNT;
  const inSeason = TUNING.days - s.day;
  for (let d = 0; d < nights; d++) {
    // Coins next season count for next season's quota, not this one's: worth less tonight.
    if (d === inSeason) k *= CARRY_WEIGHT;
    c.dayHarvests = 0;
    if (barrel) for (let r = 0; r < c.rows; r++) c.plots[r * c.cols].boost += 1;
    const before = c.earned;
    NONE.length = 0;
    night(c, NONE);
    v += (c.earned - before) * k;
    k *= DISCOUNT;
  }
  return v;
}

/** How much a coin tomorrow is worth against one tonight, to the bot. */
const DISCOUNT = 0.8;
/** Nights past the season's end the bot still counts: what stands at the last dusk is there at the next dawn. */
const CARRY = 3;
const CARRY_WEIGHT = 0.5;

export interface Play {
  h: number;
  plot: number | null;
  to?: number;
}

function plays(s: RunState): Play[] {
  const out: Play[] = [];
  const seen = new Set<string>();
  s.hand.forEach((card, h) => {
    // Two copies of the same card are the same play.
    const key = `${card.id}${card.up ? '+' : ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    const t = CARDS[card.id].target;
    if (t === 'board') {
      out.push({ h, plot: null });
      return;
    }
    for (const plot of targetsFor(s, h)) {
      if (t === 'move') for (const to of moveTargets(s, h, plot)) out.push({ h, plot, to });
      else out.push({ h, plot });
    }
  });
  return out;
}

function search(s: RunState, sample: number, depth: number, o: BotOpts, dice: Dice): { v: number; p: Play | null } {
  const stop = evaluate(s, sample);
  if (depth <= 0) return { v: stop, p: null };
  // Score every first play, then look one play further on the most promising few.
  const first: { p: Play; c: RunState; v: number }[] = [];
  for (const p of plays(s)) {
    const c = cloneRun(s);
    if (!playCard(c, p.h, p.plot, p.to)) continue;
    let v = c.earned - s.earned + evaluate(c, sample);
    if (o.noise > 0) v *= 1 + (dice.next() * 2 - 1) * o.noise;
    first.push({ p, c, v });
  }
  first.sort((a, b) => b.v - a.v);
  if (depth > 1) {
    // The top few, plus the best play of each card, so a sow that pays off with the next card still gets looked at.
    const look = first.slice(0, 6);
    const cards = new Set(look.map((f) => s.hand[f.p.h].id));
    for (const f of first) {
      if (cards.has(s.hand[f.p.h].id)) continue;
      cards.add(s.hand[f.p.h].id);
      look.push(f);
    }
    for (const f of look) {
      const deeper = search(f.c, sample, depth - 1, { ...o, noise: 0 }, dice).v + (f.c.earned - s.earned);
      f.v = Math.max(f.v, deeper);
    }
    first.sort((a, b) => b.v - a.v);
  }
  const best = first[0];
  // Ending the day wins near-ties: don't spend cards for nothing.
  if (!best || best.v < stop + 0.01) return { v: stop, p: null };
  return { v: best.v, p: best.p };
}

/** The play the bot would make now, or null to end the day. */
export function bestPlay(s: RunState, seed = 1): Play | null {
  return search(s, (seed * 2654435761) | 0, 2, { noise: 0, seed }, new Dice(seed)).p;
}

/** Play out one day, then end it. Returns every event. */
export function botDay(s: RunState, o: BotOpts, dice: Dice): Ev[] {
  const ev: Ev[] = [];
  for (let guard = 0; guard < 20 && s.phase === 'day'; guard++) {
    const sample = (dice.next() * 0x7fffffff) | 0;
    const best = search(s, sample, o.depth ?? 2, o, dice).p;
    if (!best) break;
    const e = playCard(s, best.h, best.plot, best.to);
    if (e) ev.push(...e);
  }
  // Toss a card that has nowhere to go, or a spare radish.
  if (!s.tossed && s.hand.length) {
    let dead = s.hand.findIndex((c, h) => CARDS[c.id].target !== 'board' && targetsFor(s, h).length === 0);
    if (dead < 0 && s.hand.length >= 4) dead = s.hand.findIndex((c) => c.id === 'radish');
    if (dead >= 0) {
      const e = toss(s, dead);
      if (e) ev.push(...e);
    }
  }
  ev.push(...endDay(s));
  return ev;
}

const CARD_VALUE: Record<CardId, number> = {
  corn: 7, beans: 8, strawberry: 8, sunflower: 7, chili: 6, rain: 5, compost: 5, fertiliser: 4, beehive: 9, pumpkin: 6, wheat: 4,
  garlic: 4, ladybirds: 3, scarecrow: 3, sun: 5, shears: 3, trowel: 2, storm: 5, mint: 3, radish: 0, carrot: 4, lettuce: 2, can: 4,
};

const PAGE_VALUE: Record<PageId, number> = { thumb: 10, basket: 8, market: 7, clover: 6, cellar: 6, furrow: 7, bees: 5, rotation: 5, barrel: 6, coldframe: 4 };

function cardValue(s: RunState, id: CardId): number {
  let v = CARD_VALUE[id];
  // Hazard answers matter once hazards are on.
  if ((id === 'garlic' || id === 'ladybirds' || id === 'scarecrow') && (s.season >= 1 || s.year > 1)) v += 2;
  // Enough of one thing.
  const have = allCards(s).filter((c) => c.id === id).length;
  return v - have * 1.2;
}

function pageValue(s: RunState, id: PageId): number {
  const cards = allCards(s);
  if (id === 'cellar') return 3 + cards.filter((c) => c.id === 'radish' || c.id === 'carrot').length * 0.5;
  if (id === 'bees') return 2 + cards.filter((c) => c.id === 'sunflower' || c.id === 'beehive').length * 2;
  if (id === 'coldframe') return s.season === 2 ? 8 : 4;
  return PAGE_VALUE[id];
}

/** Spend in the shop by a simple preference list, then leave. */
export function botShop(s: RunState, o: BotOpts, dice: Dice): void {
  const sh = s.shop;
  if (!sh) return;
  const fuzz = (v: number) => v * (1 + (dice.next() * 2 - 1) * (o.shopNoise ?? o.noise));
  for (let guard = 0; guard < 12; guard++) {
    let did = false;
    // Room for one more page, once the almanac is full and coins are piling up.
    if (canBuySlot(s) && s.coins >= 1.25 * slotPrice(s) && buySlot(s)) continue;
    // With the almanac full, a page is only worth it if it beats the weakest kept one by a margin.
    const full = s.pages.length >= maxPages(s);
    const weakest = full ? [...s.pages].sort((a, b) => pageValue(s, a) - pageValue(s, b))[0] : undefined;
    const bar = full ? pageValue(s, weakest!) + 3 : 6;
    const pg = sh.pages
      .map((p, i) => ({ p, i, v: fuzz(pageValue(s, p.page)) }))
      .filter((x) => !x.p.sold && x.v >= bar)
      .sort((a, b) => b.v - a.v)[0];
    if (pg && pg.p.price <= s.coins && buyPage(s, pg.i, weakest)) did = true;
    // A scoop for good, once there are coins to spare.
    if (!did && canBuyScoop(s) && s.coins >= 1.8 * scoopPrice(s) && buyScoop(s)) did = true;
    // Save up for a strong page within reach rather than fritter.
    const saving = !did && !!pg && pg.p.price > s.coins && pg.p.price < s.coins * 1.6;
    const cd = sh.cards
      .map((c, i) => ({ c, i, v: fuzz(cardValue(s, c.card)) }))
      .filter((x) => !x.c.sold && x.c.price <= s.coins && x.v >= (saving ? 7 : 4.5))
      .sort((a, b) => b.v - a.v)[0];
    if (!did && cd && buyCard(s, cd.i)) did = true;
    if (!did && canUpgrade(s) && !saving) {
      const worth = (id: CardId) => SEEDS[id as SeedId].base * SEEDS[id as SeedId].picks;
      const seeds = s.draw.filter((c) => !c.up && CARDS[c.id].type === 'seed' && c.id !== 'radish').sort((a, b) => worth(b.id) - worth(a.id));
      if (seeds[0] && upgradeCard(s, seeds[0].uid)) did = true;
    }
    if (!did && canRemove(s) && !saving && allCards(s).length > 10) {
      const weak = s.draw.find((c) => c.id === 'radish' && !c.up) ?? s.draw.find((c) => c.id === 'lettuce' && !c.up);
      if (weak && removeCard(s, weak.uid)) did = true;
    }
    if (!did && s.coins > 60 && sh.rerolls < 2 && !saving && sh.cards.every((c) => c.sold || cardValue(s, c.card) < 4.5) && reroll(s)) did = true;
    if (!did) break;
  }
  leaveShop(s);
}

export interface RunResult {
  seed: number;
  /** Seasons cleared in a row from the start. */
  cleared: number;
  year: number;
  season: number;
  coins: number;
  bestHarvest: number;
  /** Earned against quota, per season played. */
  seasons: { year: number; season: number; earned: number; quota: number; cleared: boolean }[];
}

export function playRun(seed: number, meta: Meta | null, o: BotOpts, maxSeasons = 16): RunResult {
  const { s } = newRun(seed, meta, o.guided);
  const dice = new Dice(o.seed ^ seed);
  const seasons: RunResult['seasons'] = [];
  while (s.phase !== 'over' && seasons.length < maxSeasons) {
    if (s.phase === 'day') {
      const ev = botDay(s, o, dice);
      for (const e of ev) if (e.t === 'seasonEnd') seasons.push({ year: e.year, season: e.season, earned: e.earned, quota: e.quota, cleared: e.cleared });
    } else if (s.phase === 'shop') botShop(s, o, dice);
  }
  if (meta && s.phase === 'over') recordRun(meta, s, UNLOCK_ORDER);
  return { seed, cleared: s.stats.seasonsCleared, year: s.year, season: s.season, coins: s.stats.totalEarned, bestHarvest: s.stats.bestHarvest, seasons };
}
