// A run: seasons of six days against a quota. A day draws a hand, the player
// plays cards for energy, and End day resolves the night. Every function here
// mutates the run and returns what happened as events.

import { CARDS, costOf, isSeed, PAGES, PRICE, SEEDS, START_DECK, START_POOL, UNLOCK_AT, UNLOCK_ORDER } from './cards';
import { bySeason, emptyPlot, energyMax, frosted, handSize, isEmpty, isFinal, isRipe, neighbours, nextSeason, runQuota, seasonIndex, TUNING } from './board';
import { applyHarvest, night, scoreHarvest, snapshot } from './night';
import { mixSeed, pick, rand, shuffle } from './rng';
import type { Card, CardId, Ev, Meta, PageId, Rarity, RunState, Season, SeedId, Shop, Twist, TwistId } from './types';

export function newMeta(): Meta {
  return { v: 1, unlocked: [], runs: 0, seasons: 0, best: { seasons: 0, harvest: 0, coins: 0, year: 1, season: 0 }, wins: 0, bestWin: 0 };
}

/**
 * The guided first season deals these hands, from the same tin (the spent pile
 * too, if the tin runs short), so each day brings one idea: day 1 two radishes;
 * day 2 a carrot to plant them beside; day 3 more than three scoops' worth, with
 * radishes to ring the ripening carrot; days 4 to 6 one new card each. Cards
 * not played stay in hand. From summer the hand draws up to five as usual.
 */
export const GUIDED_DEALS: CardId[][] = [
  ['radish', 'radish'],
  ['carrot', 'radish', 'radish'],
  ['radish', 'radish', 'carrot', 'lettuce'],
  // Then one new card a day, so each comes on its own: the beans (with the tin),
  // the watering can (with the spent heap), then the sunflower, the lettuce's tall crop.
  ['beans', 'carrot', 'radish'],
  ['can', 'radish', 'carrot'],
  ['sunflower', 'lettuce', 'radish'],
];

export function newRun(seed: number, meta: Meta | null, guided = false): { s: RunState; ev: Ev[] } {
  const s: RunState = {
    v: 1,
    seed,
    rng: mixSeed(seed),
    year: 1,
    season: 0,
    day: 1,
    phase: 'day',
    coins: 0,
    earned: 0,
    quota: 0,
    energy: 0,
    bench: 0,
    saved: 0,
    scoops: 0,
    slots: 0,
    crow: false,
    tossed: false,
    cols: 4,
    rows: 4,
    plots: [],
    draw: [],
    hand: [],
    discard: [],
    placed: [],
    pages: [],
    tonight: [],
    shop: null,
    nextUid: 1,
    dayHarvests: 0,
    guided,
    script: guided ? GUIDED_DEALS.map((d) => [...d]) : [],
    pool: [...START_POOL, ...(meta?.unlocked ?? []).filter((c) => !START_POOL.includes(c))],
    stats: { bestHarvest: 0, bestKind: null, totalEarned: 0, harvests: 0, seasonsCleared: 0, bestDay: 0, pests: 0, crows: 0, log: [], byKind: {} },
    end: null,
    twist: null,
    carry: 0,
    carried: 0,
    // The first run after the guided one has a softer first spring: the guided spring asked 70, the next one 170.
    soft: !guided && !!meta && meta.runs === 1,
    stock: [],
    select: [],
  };
  for (const id of START_DECK) s.draw.push(newCard(s, id));
  const ev: Ev[] = [];
  startSeason(s, ev);
  return { s, ev };
}

export function newCard(s: RunState, id: CardId, up = false): Card {
  return { uid: s.nextUid++, id, up };
}

/** A fast deep copy of a run for looking ahead (the bot, the board's previews). Cards are shared. */
export function cloneRun(s: RunState): RunState {
  return {
    ...s,
    plots: s.plots.map((p) => ({ ...p, crop: p.crop ? { ...p.crop } : null })),
    draw: [...s.draw],
    hand: [...s.hand],
    discard: [...s.discard],
    placed: [...s.placed],
    pages: [...s.pages],
    tonight: [...s.tonight],
    pool: [...s.pool],
    script: s.script.map((d) => [...d]),
    stats: { ...s.stats, log: s.stats.log, byKind: { ...s.stats.byKind } },
    shop: s.shop ? { ...s.shop, cards: s.shop.cards.map((c) => ({ ...c })), pages: s.shop.pages.map((p) => ({ ...p })), twists: s.shop.twists?.map((t) => ({ ...t })) } : null,
    end: s.end ? { ...s.end } : null,
  };
}

/** Every card the player owns, wherever it is. */
export function allCards(s: RunState): Card[] {
  return [...s.draw, ...s.hand, ...s.discard, ...s.placed];
}

/**
 * A new season. The plot carries over: whatever stands at the last dusk (crops
 * still growing, perennials with picks left, scarecrows and beehives) is there
 * at the first dawn. Only the cards come home: the hand and the spent heap go
 * back in the tin and it is shuffled. An object's card stays out on its plot.
 */
export function startSeason(s: RunState, ev: Ev[]): void {
  if (!s.plots.length) s.plots = Array.from({ length: s.cols * s.rows }, emptyPlot);
  widen(s, s.pages.includes('furrow') ? 5 : 4);
  s.draw = [...s.draw, ...s.hand, ...s.discard];
  s.hand = [];
  s.discard = [];
  shuffle(s, s.draw);
  s.tonight = [];
  s.shop = null;
  // A hitch picked at the stall takes its share off this season's quota: the twist is a trade.
  s.quota = runQuota(s, s.year, s.season, s.twist ?? null);
  // Part of the last season's surplus starts this season's take, up to a share of its quota.
  s.carried = Math.min(s.carry ?? 0, Math.round(TUNING.carryCap * s.quota));
  s.carry = 0;
  s.earned = s.carried;
  s.day = 1;
  s.phase = 'day';
  ev.push({ t: 'season', year: s.year, season: s.season, quota: s.quota, carried: s.carried, twist: s.twist ?? null });
  startDay(s, ev);
}

/** Give the plot this many columns, keeping every plot where it stands (the Long Furrow adds column E on the right). */
function widen(s: RunState, cols: number): void {
  if (cols === s.cols && s.plots.length === s.cols * s.rows) return;
  const old = s.plots;
  const was = s.cols;
  s.plots = Array.from({ length: cols * s.rows }, (_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    return c < was && old[r * was + c] ? old[r * was + c] : emptyPlot();
  });
  s.cols = cols;
}

/** A new day. The bench refills, with a scoop more for each crop pulled up in the night. */
export function startDay(s: RunState, ev: Ev[]): void {
  s.bench = energyMax(s) + (s.saved ?? 0);
  s.saved = 0;
  s.energy = s.bench;
  s.tossed = false;
  s.dayHarvests = 0;
  if (s.pages.includes('barrel')) for (let r = 0; r < s.rows; r++) s.plots[r * s.cols].boost += 1;
  ev.push({ t: 'dawn', day: s.day });
  // A crow comes to the plate's edge at dawn, so the day has time to answer it (twice as often in a season of crows).
  const crow = Math.min(0.9, bySeason(TUNING.crowChance, s) * (s.twist?.id === 'crows' ? TUNING.crowTimes : 1));
  s.crow = crow > 0 && rand(s) < crow;
  if (s.crow) {
    s.stats.crows++;
    ev.push({ t: 'crowAbout' });
  }
  const deal = s.script.shift();
  if (deal) dealScripted(s, deal, ev);
  else drawUp(s, ev);
}

/** The guided season's hand for today: these cards from the tin, or the spent pile if the tin has none left, up to a full hand. */
function dealScripted(s: RunState, ids: readonly CardId[], ev: Ev[]): void {
  for (const id of ids) {
    if (s.hand.length >= handSize(s)) break;
    let i = s.draw.findIndex((c) => c.id === id);
    let from = s.draw;
    if (i < 0) {
      i = s.discard.findIndex((c) => c.id === id);
      from = s.discard;
    }
    if (i < 0) continue;
    const [c] = from.splice(i, 1);
    s.hand.push(c);
    ev.push({ t: 'draw', card: c });
  }
}

export function drawOne(s: RunState, ev: Ev[]): boolean {
  if (!s.draw.length) {
    if (!s.discard.length) return false;
    s.draw = shuffle(s, s.discard);
    s.discard = [];
    ev.push({ t: 'shuffle', n: s.draw.length });
  }
  const c = s.draw.pop()!;
  s.hand.push(c);
  ev.push({ t: 'draw', card: c });
  return true;
}

function drawUp(s: RunState, ev: Ev[]): void {
  while (s.hand.length < handSize(s)) if (!drawOne(s, ev)) break;
}

/** Plots a card in hand may be played on (for 'move', the crops that can be moved). Empty for 'board' cards. */
export function targetsFor(s: RunState, handIdx: number): number[] {
  const card = s.hand[handIdx];
  if (!card) return [];
  const t = CARDS[card.id].target;
  const out: number[] = [];
  const seed = isSeed(card.id);
  s.plots.forEach((p, i) => {
    const c = p.crop;
    const ok =
      t === 'empty' ? isEmpty(p) && !(seed && frosted(s, i)) :
      t === 'plot' ? true :
      t === 'crop' ? !!c :
      t === 'growing' ? !!c && !isRipe(c) :
      t === 'ripe' ? !!c && isRipe(c) :
      t === 'move' ? !!c && moveTargets(s, handIdx, i).length > 0 :
      false;
    if (ok) out.push(i);
  });
  return out;
}

/** Where the trowel in hand could move the crop at `from`. */
export function moveTargets(s: RunState, handIdx: number, from: number): number[] {
  const card = s.hand[handIdx];
  if (!card || !s.plots[from]?.crop) return [];
  const cand = card.up ? s.plots.map((_, i) => i) : neighbours(s, from);
  return cand.filter((j) => j !== from && isEmpty(s.plots[j]));
}

/** Why a play is not allowed, or null if it is. */
export function whyNot(s: RunState, handIdx: number, plot: number | null, to?: number): string | null {
  if (s.phase !== 'day') return 'Not now.';
  const card = s.hand[handIdx];
  if (!card) return 'No such card.';
  const def = CARDS[card.id];
  if (costOf(card.id, card.up) > s.energy) return 'Not enough scoops.';
  if (def.target === 'board') return null;
  if (plot === null || plot < 0 || plot >= s.plots.length) return 'Pick a plot.';
  if (!targetsFor(s, handIdx).includes(plot)) {
    if (def.type === 'seed' && isEmpty(s.plots[plot]) && frosted(s, plot)) return 'Frost: nothing grows there now.';
    switch (def.target) {
      case 'empty':
        return 'That plot is taken.';
      case 'crop':
        return 'Needs a crop.';
      case 'growing':
        return 'Needs a crop still growing.';
      case 'ripe':
        return 'Needs a ripe crop.';
      case 'move':
        return 'Needs a crop with room to move.';
      default:
        return 'Not there.';
    }
  }
  if (def.target === 'move' && (to === undefined || !moveTargets(s, handIdx, plot).includes(to))) return 'Pick an empty plot to move it to.';
  return null;
}

/** Play the card at handIdx. Returns the events, or null if the play is not allowed. */
export function playCard(s: RunState, handIdx: number, plot: number | null, to?: number): Ev[] | null {
  if (whyNot(s, handIdx, plot, to)) return null;
  const ev: Ev[] = [];
  const [card] = s.hand.splice(handIdx, 1);
  s.energy -= costOf(card.id, card.up);
  const def = CARDS[card.id];
  ev.push({ t: 'play', card, plot: def.target === 'board' ? null : plot, to });
  let toDiscard = true;
  const i = plot ?? -1;
  if (isSeed(card.id)) {
    const p = s.plots[i];
    const kind = card.id;
    const uid = s.nextUid++;
    p.crop = { uid, kind, age: 0, days: SEEDS[kind].days, up: card.up, compost: 0, rot: s.pages.includes('rotation') && !!p.last && p.last !== kind, picks: 0, pest: 0, sprout: false };
    ev.push({ t: 'plant', plot: i, kind, uid });
  } else {
    switch (card.id) {
      case 'can': {
        // An improved can is free; it still waters one row.
        const plots = canArea(s, i, false);
        for (const j of plots) s.plots[j].boost += 1;
        ev.push({ t: 'water', plots });
        break;
      }
      case 'compost':
        s.plots[i].crop!.compost++;
        ev.push({ t: 'compost', plot: i });
        break;
      case 'fertiliser': {
        const c = s.plots[i].crop!;
        const from = c.age;
        c.age = Math.min(c.days, c.age + 1);
        ev.push({ t: 'grow', growth: [{ plot: i, uid: c.uid, from, to: c.age }] });
        break;
      }
      case 'trowel': {
        const j = to!;
        s.plots[j].crop = s.plots[i].crop;
        s.plots[i].crop = null;
        ev.push({ t: 'move', from: i, to: j });
        break;
      }
      case 'shears': {
        const h = scoreHarvest(s, i, snapshot(s), { suns: 0, shears: true, roll: true });
        applyHarvest(s, h, ev, true);
        break;
      }
      case 'ladybirds': {
        const plots: number[] = [];
        s.plots.forEach((p, j) => {
          if (p.crop?.pest) {
            p.crop.pest = 0;
            plots.push(j);
          }
        });
        ev.push({ t: 'clear', plots });
        if (card.up) drawOne(s, ev);
        break;
      }
      case 'scarecrow':
      case 'beehive':
        s.plots[i].obj = card.id;
        s.placed.push(card);
        toDiscard = false;
        ev.push({ t: 'object', plot: i, obj: card.id });
        break;
      case 'rain':
      case 'sun':
      case 'storm':
        s.tonight.push(card.id);
        ev.push({ t: 'weather', kind: card.id });
        break;
    }
  }
  if (toDiscard) s.discard.push(card);
  return ev;
}

/** The plots a watering can on plot i reaches: its row, and its column too when upgraded. */
export function canArea(s: Pick<RunState, 'cols' | 'plots'>, i: number, up: boolean): number[] {
  const r = Math.floor(i / s.cols);
  const c = i % s.cols;
  return s.plots.map((_, j) => j).filter((j) => Math.floor(j / s.cols) === r || (up && j % s.cols === c));
}

/** Once a day, put a card from hand on the discard pile and draw another. */
export function toss(s: RunState, handIdx: number): Ev[] | null {
  if (s.phase !== 'day' || s.tossed || !s.hand[handIdx]) return null;
  const ev: Ev[] = [];
  const [card] = s.hand.splice(handIdx, 1);
  s.discard.push(card);
  s.tossed = true;
  ev.push({ t: 'toss', card });
  drawOne(s, ev);
  return ev;
}

/** End the day: the night resolves, then the next morning or the season's end. */
export function endDay(s: RunState): Ev[] {
  if (s.phase !== 'day') return [];
  const ev: Ev[] = [];
  // Scoops left on the bench at dusk, for the stall to say how many sat unused (a scoop for good is worth it or not).
  s.idle = { scoops: (s.idle?.scoops ?? 0) + s.energy, days: (s.idle?.days ?? 0) + 1 };
  const max = handSize(s);
  if (s.hand.length > max) {
    const extra = s.hand.splice(0, s.hand.length - max);
    s.discard.push(...extra);
    ev.push({ t: 'discardExcess', cards: extra });
  }
  night(s, ev);
  // The last winter met ends the run that night: the days after it were busywork (959 of 960 after day 4, then two more).
  if (s.day >= TUNING.days || (isFinal(s) && s.earned >= s.quota)) seasonEnd(s, ev);
  else {
    s.day++;
    startDay(s, ev);
  }
  return ev;
}

function seasonEnd(s: RunState, ev: Ev[]): void {
  const cleared = s.earned >= s.quota;
  const idle = s.idle?.days ? Math.round((s.idle.scoops / s.idle.days) * 10) / 10 : 0;
  s.stats.log.push({ year: s.year, season: s.season, earned: s.earned, quota: s.quota, cleared, carried: s.carried ?? 0, twist: s.twist ?? null, idle });
  s.idle = { scoops: 0, days: 0 };
  ev.push({ t: 'seasonEnd', cleared, earned: s.earned, quota: s.quota, year: s.year, season: s.season });
  // The cards come home; the plot stands as it is into the next season.
  s.draw = [...s.draw, ...s.hand, ...s.discard];
  s.hand = [];
  s.discard = [];
  s.tonight = [];
  if (cleared || (TUNING.noEnd && !isFinal(s))) {
    if (cleared) s.stats.seasonsCleared++;
    if (isFinal(s)) {
      // The last winter is met: the run is won, and ends here.
      s.phase = 'over';
      s.end = { year: s.year, season: s.season, earned: s.earned, quota: s.quota, unlocked: [], recorded: false, won: true, metDay: s.day };
      s.twist = null;
      ev.push({ t: 'over', end: s.end });
      return;
    }
    // A share of the surplus carries into the next season's take, so a strong season buffers a bad draw.
    s.carry = cleared ? Math.round(TUNING.carryShare * Math.max(0, s.earned - s.quota)) : 0;
    s.phase = 'shop';
    s.shop = makeShop(s);
    s.twist = null;
    ev.push({ t: 'shop' });
  } else {
    s.phase = 'over';
    s.twist = null;
    s.end = { year: s.year, season: s.season, earned: s.earned, quota: s.quota, unlocked: [], recorded: false };
    ev.push({ t: 'over', end: s.end });
  }
}

/**
 * Give the run up: it ends the way a missed quota does, so its seasons count for
 * the catalogue, its best harvest and coins for the record, and the almanac's
 * entry follows. Mid-season, the season so far goes in the log as not met. (It
 * used to start a new run with nothing recorded: two runs of 13 and 8 seasons
 * left the count at 4 and the best harvest at 108, not 180.)
 */
export function giveUp(s: RunState): Ev[] | null {
  if (s.phase === 'over') return null;
  const ev: Ev[] = [];
  const day = s.phase === 'day' ? s.day : 0;
  if (s.phase === 'day') {
    s.stats.log.push({ year: s.year, season: s.season, earned: s.earned, quota: s.quota, cleared: false, carried: s.carried ?? 0, twist: s.twist ?? null });
    s.draw = [...s.draw, ...s.hand, ...s.discard];
    s.hand = [];
    s.discard = [];
    s.tonight = [];
  }
  const last = s.stats.log[s.stats.log.length - 1];
  s.phase = 'over';
  s.shop = null;
  s.end = { year: s.year, season: s.season, earned: last?.earned ?? s.earned, quota: last?.quota ?? s.quota, unlocked: [], recorded: false, gaveUp: true, day };
  ev.push({ t: 'over', end: s.end });
  return ev;
}

// ---------------------------------------------------------------- the shop

const RARITY_WEIGHT: [Rarity, number][] = [
  ['common', 0.55],
  ['uncommon', 0.33],
  ['rare', 0.12],
];

export function priceScale(s: RunState): number {
  return 1 + TUNING.priceYear * (s.year - 1);
}

/** A card's price at the stall: improved stock costs a share more. */
export function cardPrice(s: RunState, id: CardId, up = false): number {
  return Math.round((PRICE[CARDS[id].rarity] + (up ? TUNING.selectPrice : 0)) * priceScale(s));
}

function rollRarity(s: RunState): Rarity {
  let r = rand(s);
  for (const [name, w] of RARITY_WEIGHT) {
    if (r < w) return name;
    r -= w;
  }
  return 'common';
}

/**
 * Answers to a hazard the merchant keeps in stock until the deck holds this many:
 * one scarecrow (it stands on the plot for the rest of the run), two cards for
 * pests (one ladybird card seldom came to hand on the night it was needed).
 */
export const ANSWERS_HELD = { crows: 1, pests: 2 };

/**
 * Cards that answer a hazard the player cannot yet meet: a scarecrow for crows;
 * ladybirds or garlic for pests. Wanted once the hazard has shown, and before
 * the first season that can bring it, so the first crow can be met; not once
 * the deck holds enough of them.
 */
export function hazardAnswers(s: RunState): CardId[][] {
  const held = (ids: CardId[]) => allCards(s).filter((c) => ids.includes(c.id)).length;
  // The stall opens between seasons: the season it leads to is the one to get ready for.
  const ahead = s.phase === 'shop' ? nextSeason(s) : s;
  const out: CardId[][] = [];
  if ((s.stats.crows > 0 || bySeason(TUNING.crowChance, ahead) > 0) && held(['scarecrow']) < ANSWERS_HELD.crows) out.push(['scarecrow']);
  if ((s.stats.pests > 0 || bySeason(TUNING.pestChance, ahead) > 0) && held(['ladybirds', 'garlic']) < ANSWERS_HELD.pests) out.push(['ladybirds', 'garlic']);
  return out.map((o) => o.filter((c) => s.pool.includes(c))).filter((o) => o.length > 0);
}

/**
 * The goods on the tray: always at least one seed and one uncommon or rarer; on
 * a stall's first tray, one slot at most for a hazard's answer; the rest at
 * random by rarity, cards the last tray showed only when nothing else is left.
 * The fourth playtest found a scarecrow at all four stalls of a run and on five
 * of five fresh stock rolls, since every hazard took a slot of its own and
 * fresh stock forced them again.
 */
function rollCards(s: RunState, fresh = false): CardId[] {
  const out: CardId[] = [];
  const last = s.lastTray ?? [];
  const add = (opts: CardId[]) => {
    const free = opts.filter((c) => !out.includes(c));
    const pool = free.filter((c) => !last.includes(c)).length ? free.filter((c) => !last.includes(c)) : free;
    if (pool.length) out.push(pick(s, pool));
  };
  if (!fresh) {
    // The year's first stall lays out the year's new stock.
    if (s.season === 0) for (const o of s.stock ?? []) if (!out.includes(o.card) && out.length < TUNING.goods) out.push(o.card);
    const answers = hazardAnswers(s);
    // A hazard coming for the first time wins the one slot (the stall before autumn stocks the scarecrow); else one
    // already met, at random. An earlier stall offered the other.
    const coming = answers.filter((a) => (a.includes('scarecrow') ? s.stats.crows === 0 : s.stats.pests === 0));
    const met = answers.filter((a) => !coming.includes(a));
    const first = coming[0] ?? (met.length ? pick(s, met) : undefined);
    if (first) add(first);
  }
  if (!out.some(isSeed)) {
    const rarity = rollRarity(s);
    const seeds = s.pool.filter(isSeed);
    add(seeds.some((c) => CARDS[c].rarity === rarity) ? seeds.filter((c) => CARDS[c].rarity === rarity) : seeds);
  }
  // Never a tray of starter commons only.
  if (!out.some((c) => CARDS[c].rarity !== 'common')) add(s.pool.filter((c) => CARDS[c].rarity === 'uncommon'));
  while (out.length < TUNING.goods) {
    const rarity = rollRarity(s);
    let opts = s.pool.filter((c) => CARDS[c].rarity === rarity && !out.includes(c));
    if (!opts.length) opts = s.pool.filter((c) => !out.includes(c));
    if (!opts.length) break;
    add(opts);
  }
  s.lastTray = [...out];
  return shuffle(s, out);
}

function rollPages(s: RunState): PageId[] {
  const opts = (Object.keys(PAGES) as PageId[]).filter((p) => !s.pages.includes(p));
  shuffle(s, opts);
  return opts.slice(0, 2);
}

/** Tray goods: a card the merchant sells improved (new stock, once the catalogue holds every card) comes improved. */
function goods(s: RunState, cards: CardId[]): Shop['cards'] {
  return cards.map((card) => {
    const up = (s.select ?? []).includes(card);
    return up ? { card, price: cardPrice(s, card, true), sold: false, up } : { card, price: cardPrice(s, card), sold: false };
  });
}

function makeShop(s: RunState): Shop {
  const twists = twistsDue(s) ? offerTwists(s) : undefined;
  return {
    cards: goods(s, rollCards(s)),
    pages: rollPages(s).map((page) => ({ page, price: Math.round(PAGES[page].price * priceScale(s)), sold: false })),
    reroll: TUNING.rerollBase,
    rerolls: 0,
    removed: 0,
    upgraded: 0,
    ...(twists ? { twists } : {}),
  };
}

export function buyCard(s: RunState, i: number): Ev[] | null {
  const o = s.shop?.cards[i];
  if (s.phase !== 'shop' || !o || o.sold || s.coins < o.price) return null;
  s.coins -= o.price;
  o.sold = true;
  s.draw.push(newCard(s, o.card, !!o.up));
  return [{ t: 'buy', card: o.card }];
}

// ---------------------------------------------------------------- the season's twist

/** Twists that help, and twists that get in the way. A stall offers one of each, to pick one. */
export const BOONS: readonly TwistId[] = ['buyer', 'company', 'calm', 'picks', 'sunall'];
export const HITCHES: readonly TwistId[] = ['frost', 'glut', 'sunup', 'crows'];

/** Does the season the stall leads to have a twist? From year 2 spring, the last winter too. */
export function twistsDue(s: RunState): boolean {
  return TUNING.twists && seasonIndex(nextSeason(s)) >= TUNING.twistFrom;
}

/**
 * Two twists for the coming season, one that helps and one that gets in the way, in a random order. A buyer pays for
 * a crop the player owns but has not leaned on (not the crop that has taken the most this run, nor the free radish),
 * and a glut hits the crop that has taken the most: the fifth playtest's every day was one improved carrot ringed by
 * radishes, so the twists push away from the run's own solve. A sunflower twist only comes to a player with a
 * sunflower, long picks only with a perennial; neither twist repeats the season just played.
 */
export function offerTwists(s: RunState): Twist[] {
  const owned = [...new Set(allCards(s).map((c) => c.id).filter(isSeed))].filter((k) => k !== 'radish') as SeedId[];
  const lean = topCrops(s).find((k) => owned.includes(k));
  const others = owned.filter((k) => k !== lean);
  const last = s.twist?.id;
  const usable = (id: TwistId) => {
    if (id === last) return false;
    if (id === 'buyer' || id === 'glut') return owned.length > 0;
    if (id === 'sunall' || id === 'sunup') return owned.includes('sunflower');
    if (id === 'picks') return owned.some((k) => SEEDS[k].picks > 1);
    return true;
  };
  const boon = pick(s, BOONS.filter(usable));
  const hitch = pick(s, HITCHES.filter(usable));
  const a: Twist = boon === 'buyer' ? { id: boon, crop: pick(s, others.length ? others : owned) } : { id: boon };
  const glut = lean && lean !== a.crop ? lean : pick(s, owned.filter((k) => k !== a.crop).length ? owned.filter((k) => k !== a.crop) : owned);
  const b: Twist = hitch === 'glut' ? { id: hitch, crop: glut } : { id: hitch };
  return rand(s) < 0.5 ? [a, b] : [b, a];
}

/** Pick one of the two twists offered for the coming season. Free, and it can be changed until the stall is left. */
export function chooseTwist(s: RunState, i: number): Ev[] | null {
  const sh = s.shop;
  if (s.phase !== 'shop' || !sh?.twists || !sh.twists[i]) return null;
  sh.twist = i;
  return [{ t: 'twist', i }];
}

/** How many almanac pages the player may keep: five, and one more for each slot bought. */
export function maxPages(s: Pick<RunState, 'slots'>): number {
  return TUNING.maxPages + (s.slots ?? 0);
}

/** Buy a page. With the almanac full, name a kept page to tear out for it. */
export function buyPage(s: RunState, i: number, replace?: PageId): Ev[] | null {
  const o = s.shop?.pages[i];
  if (s.phase !== 'shop' || !o || o.sold || s.coins < o.price || s.pages.includes(o.page)) return null;
  const full = s.pages.length >= maxPages(s);
  if (full && (!replace || !s.pages.includes(replace))) return null;
  s.coins -= o.price;
  o.sold = true;
  if (full) s.pages.splice(s.pages.indexOf(replace!), 1, o.page);
  else s.pages.push(o.page);
  return [{ t: 'page', page: o.page }];
}

/** A seed scoop for good, from year 2, four at most, each dearer than the last. The bench lays out any number. */
export function scoopPrice(s: RunState): number {
  return Math.round(TUNING.scoopPrice * Math.pow(2, s.scoops) * priceScale(s));
}

/** Scoops a day left on the bench at dusk last season, on average (0 before any season is logged). */
export function scoopsIdle(s: Pick<RunState, 'stats'>): number {
  return s.stats.log[s.stats.log.length - 1]?.idle ?? 0;
}

/**
 * Whether the stall sells a scoop at all (afford it or not): from year 2, four at most, and only if the bench ran
 * close to empty last season (fewer than `scoopIdle` scoops a day left at dusk). One more scoop for a bench that
 * already had scoops to spare would sit unused: the sixth playtest's 3,200-coin scoop sat with 3 to 6 others most days.
 */
export function scoopOnSale(s: RunState): boolean {
  return s.phase === 'shop' && s.year >= 2 && s.scoops < TUNING.maxScoops && scoopsIdle(s) < TUNING.scoopIdle;
}

export function canBuyScoop(s: RunState): boolean {
  return scoopOnSale(s) && s.coins >= scoopPrice(s);
}

export function buyScoop(s: RunState): Ev[] | null {
  if (!canBuyScoop(s)) return null;
  s.coins -= scoopPrice(s);
  s.scoops++;
  return [{ t: 'scoop' }];
}

/** Room for one more almanac page: sold once the almanac is full and there are pages left to keep. Doubles each time. */
export function slotPrice(s: RunState): number {
  return Math.round(TUNING.slotPrice * Math.pow(2, s.slots ?? 0) * priceScale(s));
}

export function canBuySlot(s: RunState): boolean {
  return s.phase === 'shop' && s.pages.length >= maxPages(s) && maxPages(s) < Object.keys(PAGES).length && s.coins >= slotPrice(s);
}

/** Whether the stall offers a page slot at all (afford it or not). */
export function slotOnSale(s: RunState): boolean {
  return s.phase === 'shop' && s.pages.length >= maxPages(s) && maxPages(s) < Object.keys(PAGES).length;
}

export function buySlot(s: RunState): Ev[] | null {
  if (!canBuySlot(s)) return null;
  s.coins -= slotPrice(s);
  s.slots = (s.slots ?? 0) + 1;
  return [{ t: 'slot' }];
}

export function removePrice(s: RunState): number {
  return TUNING.removePrice + TUNING.serviceStep * (s.shop?.removed ?? 0);
}

export function upgradePrice(s: RunState): number {
  return TUNING.upgradePrice + TUNING.serviceStep * (s.shop?.upgraded ?? 0);
}

export function canRemove(s: RunState): boolean {
  return s.phase === 'shop' && !!s.shop && s.coins >= removePrice(s) && allCards(s).length > TUNING.minDeck;
}

export function removeCard(s: RunState, uid: number): Ev[] | null {
  if (!canRemove(s)) return null;
  const i = s.draw.findIndex((c) => c.uid === uid);
  if (i < 0) return null;
  const [card] = s.draw.splice(i, 1);
  s.coins -= removePrice(s);
  s.shop!.removed++;
  return [{ t: 'remove', card }];
}

export function canUpgrade(s: RunState): boolean {
  return s.phase === 'shop' && !!s.shop && s.coins >= upgradePrice(s) && s.draw.some((c) => !c.up);
}

export function upgradeCard(s: RunState, uid: number): Ev[] | null {
  if (!canUpgrade(s)) return null;
  const card = s.draw.find((c) => c.uid === uid);
  if (!card || card.up) return null;
  card.up = true;
  s.coins -= upgradePrice(s);
  s.shop!.upgraded++;
  return [{ t: 'upgrade', card }];
}

export function reroll(s: RunState): Ev[] | null {
  const sh = s.shop;
  if (s.phase !== 'shop' || !sh || s.coins < sh.reroll) return null;
  s.coins -= sh.reroll;
  sh.reroll += TUNING.rerollStep;
  sh.rerolls++;
  // Fresh stock is new cards: it does not force a hazard's answer again.
  sh.cards = goods(s, rollCards(s, true));
  return [{ t: 'reroll' }];
}

export function leaveShop(s: RunState): Ev[] | null {
  if (s.phase !== 'shop') return null;
  const ev: Ev[] = [];
  // The season's twist: the one picked, or the first offered if none was.
  const tw = s.shop?.twists;
  s.twist = tw?.length ? { ...tw[s.shop!.twist ?? 0] } : null;
  if (s.season === 3) {
    s.year++;
    s.season = 0;
    newStock(s, ev);
  } else s.season = (s.season + 1) as Season;
  startSeason(s, ev);
  return ev;
}

/**
 * A new year: the merchant brings cards the catalogue does not hold yet, drawn
 * at random, for this run only, so a first run's stalls are not the same
 * fourteen cards from summer of year 1 to the last winter, and no two runs
 * carry the same ones. Unlocked cards (by seasons met) are the catalogue for
 * good; these go back to the locked list when the run ends.
 */
function newStock(s: RunState, ev: Ev[]): void {
  const locked = UNLOCK_ORDER.filter((c) => !s.pool.includes(c));
  const cards = shuffle(s, locked).slice(0, TUNING.newStock);
  // Once the catalogue holds every card the merchant brings improved stock instead, so new stock never runs dry (by
  // a fourth run the stall said "New stock this year: storm." and in year 3 nothing). Uncommon and rare cards first.
  const held = s.select ?? [];
  const opts = s.pool.filter((c) => c !== 'radish' && !held.includes(c) && !cards.includes(c));
  const strong = shuffle(s, opts.filter((c) => CARDS[c].rarity !== 'common'));
  const plain = shuffle(s, opts.filter((c) => CARDS[c].rarity === 'common'));
  const select = [...strong, ...plain].slice(0, TUNING.newStock - cards.length);
  s.pool.push(...cards);
  s.select = [...held, ...select];
  s.stock = [...cards.map((card) => ({ card, up: false })), ...select.map((card) => ({ card, up: true }))];
  if (s.stock.length) ev.push({ t: 'stock', cards, select });
}

// ---------------------------------------------------------------- meta

/** Cards the catalogue holds once this many seasons have been met across every run: two for each mark reached. */
export function unlocksFor(seasons: number, order: readonly CardId[]): CardId[] {
  return order.slice(0, 2 * UNLOCK_AT.filter((n) => seasons >= n).length);
}

/** Seasons met across every run, for the catalogue. A save from before this counted only its best run. */
export function seasonsMet(meta: Meta): number {
  return meta.seasons ?? meta.best.seasons;
}

/** Seasons still to meet (across runs) before the catalogue grows again, or 0 when it holds everything. */
export function seasonsToNext(meta: Meta): number {
  const next = UNLOCK_AT.find((n) => n > seasonsMet(meta));
  return next === undefined ? 0 : next - seasonsMet(meta);
}

/**
 * Record a finished run once, however it ended (a missed quota, given up, or won):
 * its seasons add to the count across runs, cards unlock by that count, the best
 * record updates, and a won run counts among the wins.
 */
export function recordRun(meta: Meta, s: RunState, order: readonly CardId[]): CardId[] {
  if (s.phase !== 'over' || !s.end || s.end.recorded) return s.end?.unlocked ?? [];
  meta.seasons = seasonsMet(meta) + s.stats.seasonsCleared;
  const fresh = unlocksFor(meta.seasons, order).filter((c) => !meta.unlocked.includes(c));
  meta.unlocked.push(...fresh);
  meta.runs++;
  if (s.end.won) {
    meta.wins = (meta.wins ?? 0) + 1;
    meta.bestWin = Math.max(meta.bestWin ?? 0, s.stats.totalEarned);
    meta.winLog = [...(meta.winLog ?? []), { run: meta.runs, coins: s.stats.totalEarned, best: s.stats.bestHarvest, bestKind: s.stats.bestKind, top: topCrops(s), pages: [...s.pages] }].slice(-TUNING.winsKept);
  }
  const b = meta.best;
  if (s.stats.seasonsCleared > b.seasons) {
    b.seasons = s.stats.seasonsCleared;
    b.year = s.year;
    b.season = s.season;
  }
  b.harvest = Math.max(b.harvest, s.stats.bestHarvest);
  b.coins = Math.max(b.coins, s.stats.totalEarned);
  s.end.unlocked = fresh;
  s.end.recorded = true;
  return fresh;
}

/** The crops that took the most this run, most first (three at most): the build that won. */
export function topCrops(s: Pick<RunState, 'stats'>, n = 3): SeedId[] {
  const by = s.stats.byKind ?? {};
  return (Object.keys(by) as SeedId[]).sort((a, b) => (by[b] ?? 0) - (by[a] ?? 0)).slice(0, n);
}

/** The quota the next season will ask, as things stand at the stall (Cold Frame, and the twist picked so far). */
export function nextQuota(s: RunState): number {
  const sh = s.shop;
  return twistQuota(s, sh?.twist !== undefined ? (sh.twists?.[sh.twist] ?? null) : null);
}

/** The quota the next season would ask with this twist: a hitch asks less. */
export function twistQuota(s: RunState, t: Twist | null): number {
  const n = nextSeason(s);
  return runQuota(s, n.year, n.season, t);
}

/** What the next season's take starts from: the surplus carried, up to its share of the next quota. */
export function nextCarry(s: RunState): number {
  return Math.min(s.carry ?? 0, Math.round(TUNING.carryCap * nextQuota(s)));
}

export function canAffordAny(s: RunState): boolean {
  return s.hand.some((c) => costOf(c.id, c.up) <= s.energy);
}
