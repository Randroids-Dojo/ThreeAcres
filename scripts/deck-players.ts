// Seedbound, round 11: two players who read the previews, not the balance bot's look-ahead. The bot rolls the board
// forward to the season's end and past it; people read what the board shows while a card is held. The eleventh playtest
// followed every lesson and every preview and died in the guided summer, while the bot cleared it; a greedy script
// following the previews won with Hot Beds and died in year 1 with Trellis and Tall Rows.
//
//   greedy: the playtest's own script (playtest11/deck/sb-drive.mjs, pickGreedy): the play the preview says adds the most,
//     until nothing adds 2. A neighbour's multiplier counts what it adds to that neighbour's new total, a bonus to bloom
//     or yield a third of the new total. A seed that ripens next season counts 0.6 of its pay. It differs from the script
//     in one way: a card too dear today is passed over, and the script ended its day there.
//   novice: a careful first-timer. The same reading, so no look-ahead over days, but some weaker placements (`slip`:
//     about one play in three takes one of the next few by the preview). At the stall the cheapest useful thing first.
//
// It uses only the rules' public calls, so it runs against an older build too (copy it into a `git archive`).
import { Dice } from '../src/games/deck/bot';
import * as R from '../src/games/deck/rules';
import { allCards, buyCard, buyLevel, buyPage, buyScoop, buySlot, canBuyLevel, canBuyScoop, canBuySlot, canUpgrade, CARDS, chooseEngine, chooseTwist, cloneRun, costOf, endDay, ENGINES, leaveShop, maxPages, playCard, previewPlay, scoopPrice, slotPrice, targetsFor, toss, upgradeCard, type CardId, type EngineId, type Ev, type PageId, type RunState, type Twist } from '../src/games/deck/rules';

export interface Reader {
  name: string;
  /** How often a play takes one of the next best by the preview, not the best. */
  slip: number;
  /** How many of the next best it may take. */
  near: number;
  /** A stuck hand: it tosses a card with no place, or one too dear with nothing else to play. */
  tosses: boolean;
  /** The stall: `sensible` shops like the playtest did by hand; `cheap` takes the cheapest useful thing. */
  shop: 'sensible' | 'cheap';
  /**
   * The twist: `read` compares what the two clippings say; `play` plays the season ahead with this reader's own days,
   * two samples each (what a player who knows the plot would see), and takes the better.
   */
  twist: 'read' | 'play';
  /** The engine to take at the first stall ('any' at random from the dice). */
  engine: EngineId | 'any';
}

export const GREEDY: Reader = { name: 'greedy', slip: 0, near: 0, tosses: false, shop: 'sensible', twist: 'play', engine: 'any' };
export const NOVICE: Reader = { name: 'novice', slip: 0.34, near: 3, tosses: true, shop: 'cheap', twist: 'read', engine: 'any' };

type Preview = NonNullable<ReturnType<typeof previewPlay>>;

/** The playtest's reading of a preview: what this play adds, in coins as the board shows them. */
export function previewWorth(s: RunState, id: CardId, aim: number | null, pv: Preview): number {
  let v = 0;
  if (pv.harvest) v += pv.harvest.late ? pv.harvest.score * 0.6 : pv.harvest.score;
  for (const m of pv.marks) {
    if (m.plot === aim || m.total === undefined) continue;
    v += m.times > 1 ? m.total * (1 - 1 / m.times) : m.bloom > 0 || m.yield > 0 ? m.total * 0.35 : m.nights > 0 ? m.total * 0.5 : 0;
  }
  // What the player took home goes out: nothing around it yet, but it stands for the rest of the run.
  if ((id === 'scarecrow' || id === 'beehive') && !s.plots.some((p) => p.obj === id)) v += 40;
  if (id === 'ladybirds' && s.plots.some((p) => p.crop?.pest)) v += 25;
  return v;
}

/** Every affordable play and what the preview says it adds, best first. */
function readPlays(s: RunState): { h: number; plot: number | null; v: number }[] {
  const out: { h: number; plot: number | null; v: number }[] = [];
  const seen = new Set<string>();
  s.hand.forEach((c, h) => {
    const key = `${c.id}${c.up ? '+' : ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (costOf(c.id, c.up) > s.energy) return;
    const t = CARDS[c.id].target;
    // The script never played the trowel: its preview asks for a second plot.
    if (t === 'move') return;
    const plots: (number | null)[] = t === 'board' ? [null] : targetsFor(s, h);
    for (const plot of plots) {
      const pv = previewPlay(s, h, plot);
      if (pv) out.push({ h, plot, v: previewWorth(s, c.id, plot, pv) });
    }
  });
  return out.sort((a, b) => b.v - a.v);
}

/** One day as this reader plays it. */
export function readerDay(s: RunState, r: Reader, dice: Dice): Ev[] {
  const ev: Ev[] = [];
  for (let g = 0; g < 14 && s.phase === 'day'; g++) {
    const opts = readPlays(s);
    const best = opts[0];
    if (!best || best.v < 2) break;
    let at = best;
    if (r.slip > 0 && dice.next() < r.slip) {
      // A weaker placement: one of the next few that still adds something.
      const near = opts.slice(1, 1 + r.near).filter((o) => o.v >= 2);
      if (near.length) at = near[Math.floor(dice.next() * near.length)];
    }
    const e = playCard(s, at.h, at.plot);
    if (!e) break;
    ev.push(...e);
  }
  if (r.tosses && !s.tossed && s.hand.length >= 2) {
    const can = (i: number) => {
      const c = s.hand[i];
      return costOf(c.id, c.up) <= s.energy && (CARDS[c.id].target === 'board' || targetsFor(s, i).length > 0);
    };
    let i = s.hand.findIndex((c, k) => CARDS[c.id].target !== 'board' && CARDS[c.id].target !== 'move' && targetsFor(s, k).length === 0);
    if (i < 0 && !s.hand.some((_, k) => can(k))) i = s.hand.findIndex((c) => costOf(c.id, c.up) > s.energy);
    if (i >= 0) {
      const e = toss(s, i);
      if (e) ev.push(...e);
    }
  }
  ev.push(...endDay(s));
  return ev;
}

const worthOf = (id: CardId): number => (CARDS[id].type === 'seed' ? R.SEEDS[id as R.SeedId].base * R.SEEDS[id as R.SeedId].picks : 0);
const HAZARD: readonly CardId[] = ['scarecrow', 'ladybirds', 'garlic'];

/** What the stall's clippings say a hitch nets: its cut less what it costs, and what the merchant pays (round 11). */
export function hitchMargin(s: RunState, t: Twist): number {
  const cut = R.twistQuota(s, null) - R.twistQuota(s, t);
  const pay = (t as Twist & { pay?: number }).pay ?? 0;
  return cut - R.twistCoins(s, t) + pay;
}

/**
 * The two clippings read: the help's coins against the hitch's margin, a person's rough sums (15% either way). Round 12:
 * both clippings say what they leave toward the season and to spend, in the same words (`twistNet`), and those two are
 * added; an older build reads as round 11 did.
 */
export function readTwist(s: RunState, dice: Dice): number {
  const tw = s.shop?.twists ?? [];
  const net = (R as unknown as { twistNet?: (s: RunState, t: Twist) => { margin: number; purse: number } }).twistNet;
  const said = (t: Twist) => (net ? net(s, t).margin + net(s, t).purse : R.HITCHES.includes(t.id) ? hitchMargin(s, t) : R.twistCoins(s, t));
  const val = (t: Twist) => said(t) * (0.85 + dice.next() * 0.3);
  return val(tw[0]) >= val(tw[1]) ? 0 : 1;
}

/**
 * The twist as this reader's own season played ahead would show it: the take over the quota (capped: a bigger surplus
 * carries no more) and a third of what it does to the purse in shares of the quota, so the merchant's coins count.
 * Round 12: the take less the quota, over the plain quota, so a hitch's cut counts coin for coin, as the bot weighs it.
 */
export function playTwist(s: RunState, r: Reader, dice: Dice): number {
  const seed = Math.floor(dice.next() * 0x7fffffff);
  const q0 = R.twistQuota(s, null);
  const worth = (i: number) => {
    let v = 0;
    for (let k = 0; k < 2; k++) {
      const c = cloneRun(s);
      c.stats = { ...c.stats, log: [...s.stats.log] };
      c.rng = (Math.imul(seed + k * 7919, 2654435761) ^ s.rng) | 0;
      chooseTwist(c, i);
      const before = c.coins;
      leaveShop(c);
      const d = new Dice(c.rng ^ 0x5bd1e995);
      for (let n = 0; n < R.TUNING.days && c.phase === 'day'; n++) readerDay(c, { ...r, slip: 0 }, d);
      const l = c.stats.log[c.stats.log.length - 1];
      if (l) v += Math.min(1.6, 1 + (l.earned - l.quota) / Math.max(1, q0)) + ((c.coins - before) / Math.max(1, q0)) / 3;
    }
    return v;
  };
  return worth(0) >= worth(1) ? 0 : 1;
}

/** Pick the engine and shop, without picking the twist or leaving (deck-twists plays each twist ahead after this). */
export function readerBuys(s: RunState, r: Reader, dice: Dice): void {
  const sh = s.shop;
  if (!sh) return;
  if (sh.engines?.length && sh.engine === undefined) {
    const i = r.engine === 'any' ? -1 : sh.engines.indexOf(r.engine);
    chooseEngine(s, i >= 0 ? i : Math.floor(dice.next() * sh.engines.length));
  }
  const engine = sh.engines?.length && sh.engine !== undefined ? sh.engines[sh.engine] : (s.engine ?? null);
  if (r.shop === 'cheap') cheapShop(s, engine);
  else sensibleShop(s, engine);
}

/** Pick the engine, shop, pick the twist and leave. */
export function readerShop(s: RunState, r: Reader, dice: Dice): void {
  const sh = s.shop;
  if (!sh) return;
  readerBuys(s, r, dice);
  if (sh.twists?.length) chooseTwist(s, r.twist === 'read' ? readTwist(s, dice) : playTwist(s, r, dice));
  leaveShop(s);
}

/**
 * The novice at the stall: the cheapest useful thing, again and again while its coins last. Useful: the engine's cards,
 * another seed but a radish, a hazard's answer it holds too few of, a page if the almanac has room, the engine's next
 * level. From the third stall one improve (the lesson there says so), on its most valuable seed.
 */
function cheapShop(s: RunState, engine: EngineId | null): void {
  const sh = s.shop!;
  const stalls = s.stats.log.length;
  const useful = (id: CardId): boolean => {
    if (engine && ENGINES[engine].cards.includes(id)) return true;
    if (HAZARD.includes(id)) return allCards(s).filter((c) => c.id === id).length < 1;
    return CARDS[id].type === 'seed' && id !== 'radish';
  };
  for (let g = 0; g < 8; g++) {
    const goods: { price: number; buy: () => unknown }[] = [];
    sh.cards.forEach((c, i) => {
      if (!c.sold && c.price <= s.coins && useful(c.card)) goods.push({ price: c.price, buy: () => buyCard(s, i) });
    });
    if (stalls >= 2 && s.pages.length < maxPages(s)) {
      sh.pages.forEach((p, i) => {
        if (!p.sold && p.price <= s.coins) goods.push({ price: p.price, buy: () => buyPage(s, i) });
      });
    }
    if (canBuyLevel(s)) goods.push({ price: sh.level!.price, buy: () => buyLevel(s) });
    goods.sort((a, b) => a.price - b.price);
    if (!goods[0]?.buy()) break;
  }
  if (stalls >= 3 && canUpgrade(s)) {
    const seeds = s.draw.filter((c) => !c.up && CARDS[c.id].type === 'seed' && c.id !== 'radish').sort((a, b) => worthOf(b.id) - worthOf(a.id));
    if (seeds[0]) upgradeCard(s, seeds[0].uid);
  }
}

const PAGE_TASTE: readonly PageId[] = ['thumb', 'basket', 'market', 'clover', 'furrow', 'rotation', 'barrel', 'cellar', 'coldframe'];

/**
 * The stall as the playtest shopped by hand: the engine's next level first, the engine's cards up to a few, a page while
 * the almanac has room, room for another once coins pile up, then improving its best seeds with what is left.
 */
function sensibleShop(s: RunState, engine: EngineId | null): void {
  const sh = s.shop!;
  const most: Record<EngineId, Partial<Record<CardId, number>>> = {
    bees: { beehive: 2, sunflower: 2, strawberry: 3, beans: 3 },
    hot: { chili: 6, strawberry: 2, beans: 3 },
    vines: { beans: 5, strawberry: 4 },
    tall: { corn: 6, sunflower: 2, beans: 3 },
  };
  const wants = engine ? most[engine] : { beans: 3, strawberry: 2, carrot: 4 };
  for (let g = 0; g < 16; g++) {
    if (canBuyLevel(s) && buyLevel(s)) continue;
    const pg = sh.pages.map((p, i) => ({ p, i })).filter(({ p }) => !p.sold && p.price <= s.coins && PAGE_TASTE.includes(p.page)).sort((a, b) => PAGE_TASTE.indexOf(a.p.page) - PAGE_TASTE.indexOf(b.p.page))[0];
    if (pg && s.pages.length < maxPages(s) && buyPage(s, pg.i)) continue;
    if (canBuySlot(s) && s.coins >= 1.5 * slotPrice(s) && buySlot(s)) continue;
    if (canBuyScoop(s) && s.coins >= 1.5 * scoopPrice(s) && buyScoop(s)) continue;
    const card = sh.cards.map((c, i) => ({ c, i })).filter(({ c }) => !c.sold && c.price <= s.coins && allCards(s).filter((x) => x.id === c.card).length < (wants[c.card] ?? (HAZARD.includes(c.card) ? 1 : 0)))[0];
    if (card && buyCard(s, card.i)) continue;
    if (canUpgrade(s) && s.coins >= 120) {
      const seeds = s.draw.filter((c) => !c.up && CARDS[c.id].type === 'seed' && (wants[c.id] ?? 0) > 0).sort((a, b) => worthOf(b.id) - worthOf(a.id));
      if (seeds[0] && upgradeCard(s, seeds[0].uid)) continue;
    }
    break;
  }
}
