// A run: seasons of six days against a quota. A day draws a hand, the player
// plays cards for energy, and End day resolves the night. Every function here
// mutates the run and returns what happened as events.

import { CARDS, costOf, isSeed, PAGES, PRICE, SEEDS, START_DECK, START_POOL, MAX_PAGES } from './cards';
import { emptyPlot, energyMax, handSize, isEmpty, isRipe, neighbours, quotaFor, TUNING } from './board';
import { applyHarvest, night, scoreHarvest, snapshot } from './night';
import { mixSeed, pick, rand, shuffle } from './rng';
import type { Card, CardId, Ev, Meta, PageId, Rarity, RunState, Season, Shop } from './types';

export function newMeta(): Meta {
  return { v: 1, unlocked: [], runs: 0, best: { seasons: 0, harvest: 0, coins: 0, year: 1, season: 0 } };
}

/**
 * The guided first season deals these hands on its first days, from the same
 * tin (the spent pile too, if the tin runs short), so each day brings one idea:
 * day 1 two radishes; day 2 a carrot to plant them beside; day 3 more than three
 * scoops' worth, with radishes to ring the ripening carrot. From day 4 the
 * hand draws up to five as usual.
 */
export const GUIDED_DEALS: CardId[][] = [
  ['radish', 'radish'],
  ['carrot', 'radish', 'radish'],
  ['radish', 'radish', 'carrot', 'lettuce'],
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
    script: guided ? GUIDED_DEALS.map((d) => [...d]) : [],
    pool: [...START_POOL, ...(meta?.unlocked ?? []).filter((c) => !START_POOL.includes(c))],
    stats: { bestHarvest: 0, bestKind: null, totalEarned: 0, harvests: 0, seasonsCleared: 0, bestDay: 0, log: [] },
    end: null,
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
    stats: { ...s.stats, log: s.stats.log },
    shop: s.shop ? { ...s.shop, cards: s.shop.cards.map((c) => ({ ...c })), pages: s.shop.pages.map((p) => ({ ...p })) } : null,
    end: s.end ? { ...s.end } : null,
  };
}

/** Every card the player owns, wherever it is. */
export function allCards(s: RunState): Card[] {
  return [...s.draw, ...s.hand, ...s.discard, ...s.placed];
}

export function startSeason(s: RunState, ev: Ev[]): void {
  s.cols = s.pages.includes('furrow') ? 5 : 4;
  s.rows = 4;
  s.plots = Array.from({ length: s.cols * s.rows }, emptyPlot);
  s.draw = allCards(s);
  s.hand = [];
  s.discard = [];
  s.placed = [];
  shuffle(s, s.draw);
  s.tonight = [];
  s.shop = null;
  s.earned = 0;
  s.quota = quotaFor(s.year, s.season, s.pages);
  s.day = 1;
  s.phase = 'day';
  ev.push({ t: 'season', year: s.year, season: s.season, quota: s.quota });
  startDay(s, ev);
}

export function startDay(s: RunState, ev: Ev[]): void {
  s.energy = energyMax(s);
  s.tossed = false;
  s.dayHarvests = 0;
  if (s.pages.includes('barrel')) for (let r = 0; r < s.rows; r++) s.plots[r * s.cols].boost += 1;
  ev.push({ t: 'dawn', day: s.day });
  const deal = s.script.shift();
  if (deal) dealScripted(s, deal, ev);
  else drawUp(s, ev);
}

/** The guided season's hand for today: these cards from the tin, or the spent pile if the tin has none left. */
function dealScripted(s: RunState, ids: readonly CardId[], ev: Ev[]): void {
  for (const id of ids) {
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
  s.plots.forEach((p, i) => {
    const c = p.crop;
    const ok =
      t === 'empty' ? isEmpty(p) :
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
        const plots = canArea(s, i, card.up);
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
        applyHarvest(s, h, ev);
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
  const max = handSize(s);
  if (s.hand.length > max) {
    const extra = s.hand.splice(0, s.hand.length - max);
    s.discard.push(...extra);
    ev.push({ t: 'discardExcess', cards: extra });
  }
  night(s, ev);
  if (s.day >= TUNING.days) seasonEnd(s, ev);
  else {
    s.day++;
    startDay(s, ev);
  }
  return ev;
}

function seasonEnd(s: RunState, ev: Ev[]): void {
  const cleared = s.earned >= s.quota;
  s.stats.log.push({ year: s.year, season: s.season, earned: s.earned, quota: s.quota, cleared });
  ev.push({ t: 'seasonEnd', cleared, earned: s.earned, quota: s.quota, year: s.year, season: s.season });
  // Clear the plot; every card goes back in the tin.
  s.draw = allCards(s);
  s.hand = [];
  s.discard = [];
  s.placed = [];
  s.tonight = [];
  for (const p of s.plots) {
    p.crop = null;
    p.obj = null;
  }
  if (cleared) {
    s.stats.seasonsCleared++;
    s.phase = 'shop';
    s.shop = makeShop(s);
    ev.push({ t: 'shop' });
  } else {
    s.phase = 'over';
    s.end = { year: s.year, season: s.season, earned: s.earned, quota: s.quota, unlocked: [], recorded: false };
    ev.push({ t: 'over', end: s.end });
  }
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

export function cardPrice(s: RunState, id: CardId): number {
  return Math.round(PRICE[CARDS[id].rarity] * priceScale(s));
}

function rollCards(s: RunState): CardId[] {
  const out: CardId[] = [];
  for (let k = 0; k < 3; k++) {
    let r = rand(s);
    let rarity: Rarity = 'common';
    for (const [name, w] of RARITY_WEIGHT) {
      if (r < w) {
        rarity = name;
        break;
      }
      r -= w;
    }
    let opts = s.pool.filter((c) => CARDS[c].rarity === rarity && !out.includes(c));
    if (!opts.length) opts = s.pool.filter((c) => !out.includes(c));
    if (!opts.length) break;
    out.push(pick(s, opts));
  }
  return out;
}

function rollPages(s: RunState): PageId[] {
  const opts = (Object.keys(PAGES) as PageId[]).filter((p) => !s.pages.includes(p));
  shuffle(s, opts);
  return opts.slice(0, 2);
}

function makeShop(s: RunState): Shop {
  return {
    cards: rollCards(s).map((card) => ({ card, price: cardPrice(s, card), sold: false })),
    pages: rollPages(s).map((page) => ({ page, price: Math.round(PAGES[page].price * priceScale(s)), sold: false })),
    reroll: TUNING.rerollBase,
    rerolls: 0,
    removed: 0,
    upgraded: 0,
  };
}

export function buyCard(s: RunState, i: number): Ev[] | null {
  const o = s.shop?.cards[i];
  if (s.phase !== 'shop' || !o || o.sold || s.coins < o.price) return null;
  s.coins -= o.price;
  o.sold = true;
  s.draw.push(newCard(s, o.card));
  return [{ t: 'buy', card: o.card }];
}

export function buyPage(s: RunState, i: number): Ev[] | null {
  const o = s.shop?.pages[i];
  if (s.phase !== 'shop' || !o || o.sold || s.coins < o.price || s.pages.length >= MAX_PAGES || s.pages.includes(o.page)) return null;
  s.coins -= o.price;
  o.sold = true;
  s.pages.push(o.page);
  return [{ t: 'page', page: o.page }];
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
  sh.cards = rollCards(s).map((card) => ({ card, price: cardPrice(s, card), sold: false }));
  return [{ t: 'reroll' }];
}

export function leaveShop(s: RunState): Ev[] | null {
  if (s.phase !== 'shop') return null;
  const ev: Ev[] = [];
  if (s.season === 3) {
    s.year++;
    s.season = 0;
  } else s.season = (s.season + 1) as Season;
  startSeason(s, ev);
  return ev;
}

// ---------------------------------------------------------------- meta

/** Record a finished run once: two cards unlock for future shops, and the best record updates. */
export function recordRun(meta: Meta, s: RunState, order: readonly CardId[]): CardId[] {
  if (s.phase !== 'over' || !s.end || s.end.recorded) return s.end?.unlocked ?? [];
  const fresh = order.filter((c) => !meta.unlocked.includes(c)).slice(0, 2);
  meta.unlocked.push(...fresh);
  meta.runs++;
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

export function canAffordAny(s: RunState): boolean {
  return s.hand.some((c) => costOf(c.id, c.up) <= s.energy);
}
