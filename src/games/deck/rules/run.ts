// A run: seasons of six days against a quota. A day draws a hand, the player
// plays cards for energy, and End day resolves the night. Every function here
// mutates the run and returns what happened as events.

import { CARDS, costOf, ENGINE_IDS, ENGINES, isSeed, PAGES, PRICE, SEEDS, START_DECK, START_POOL, UNLOCK_AT, UNLOCK_ORDER } from './cards';
import { bySeason, emptyPlot, energyMax, frosted, handSize, isEmpty, isFinal, isRipe, LEVELLED, MAX_LEVEL, neighbours, newTally, nextSeason, pageLevel, pageOn, perennial, runQuota, seasonIndex, TUNING } from './board';
import { applyHarvest, night, scoreHarvest, snapshot } from './night';
import { mixSeed, pick, rand, shuffle } from './rng';
import type { Card, CardId, EngineId, Ev, Meta, PageId, Rarity, RunState, Season, SeedId, Shop, Tally, Twist, TwistId } from './types';

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
  // Round 9: day 3 deals a radish or a carrot, one of the two (GUIDED_EITHER): the spring's first real choice.
  ['radish', 'lettuce', 'radish', 'carrot'],
  // Then one new card a day, so each comes on its own: the beans (with the tin),
  // the watering can (with the spent heap), then the sunflower, the lettuce's tall crop, with two radishes to ring
  // the carrot that ripens on the last night (the quota needs it).
  ['beans', 'carrot', 'radish'],
  ['can', 'radish', 'carrot'],
  ['sunflower', 'lettuce', 'radish', 'radish'],
];

/**
 * Round 9: the guided day that deals a pair, and the pair: the last two cards of that day's deal are one or the other.
 * Plant one and the other goes back in the tin. The ninth playtest scored the guided spring's engagement 6 of 10:
 * "spring is set hands, so there are no real decisions until summer". On day 3 the carrot sown on day 2 ripens: a
 * second radish beside it pays tonight, a second carrot pays in two nights, and the previews show both.
 */
export const GUIDED_EITHER: { day: number; pair: [CardId, CardId] } | null = { day: 3, pair: ['radish', 'carrot'] };

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
    engine: null,
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
    shop: s.shop ? { ...s.shop, cards: s.shop.cards.map((c) => ({ ...c })), pages: s.shop.pages.map((p) => ({ ...p })), twists: s.shop.twists?.map((t) => ({ ...t })), engines: s.shop.engines && [...s.shop.engines], level: s.shop.level && { ...s.shop.level } } : null,
    end: s.end ? { ...s.end } : null,
    tally: s.tally && cloneTally(s.tally),
    levels: s.levels && { ...s.levels },
    lastTwists: s.lastTwists?.map((t) => ({ ...t })),
    pastTwists: s.pastTwists?.map((t) => ({ ...t })),
    either: s.either && [s.either[0], s.either[1]],
  };
}

function cloneTally(t: Tally): Tally {
  return { ...t, kinds: { ...t.kinds }, rows: [...t.rows], rowKinds: t.rowKinds.map((r) => ({ ...r })), from: { ...t.from } };
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
  s.tally = newTally(s.rows);
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
  // A crow comes to the plate's edge at dawn, so the day has time to answer it (every morning in a season of crows).
  const crow = s.twist?.id === 'crows' ? TUNING.crowEvery : bySeason(TUNING.crowChance, s);
  s.crow = crow > 0 && rand(s) < crow;
  if (s.crow) {
    s.stats.crows++;
    ev.push({ t: 'crowAbout' });
  }
  const deal = s.script.shift();
  if (deal) {
    dealScripted(s, deal, ev);
    if (GUIDED_EITHER && s.guided && s.year === 1 && s.season === 0 && s.day === GUIDED_EITHER.day) pairUp(s, GUIDED_EITHER.pair, ev);
  } else {
    // Round 9: a run's first hand is dealt a carrot and a radish (the ninth playtest's run 4 drew no carrot in its first
    // two hands and missed its first spring by 24), then draws up as usual.
    if (!s.guided && s.year === 1 && s.season === 0 && s.day === 1 && !s.stats.log.length) dealScripted(s, TUNING.firstHand, ev);
    drawUp(s, ev);
  }
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

/** Make the last cards in hand of these two kinds a pair: one or the other (round 9). */
function pairUp(s: RunState, pair: readonly [CardId, CardId], ev: Ev[]): void {
  const b = [...s.hand].reverse().find((c) => c.id === pair[1]);
  const a = [...s.hand].reverse().find((c) => c.id === pair[0] && c !== b);
  if (!a || !b) return;
  s.either = [a.uid, b.uid];
  ev.push({ t: 'either', uids: [a.uid, b.uid] });
}

/** The other card of the pair this one belongs to, if it is still in hand. */
export function pairOf(s: Pick<RunState, 'either' | 'hand'>, uid: number): Card | undefined {
  const e = s.either;
  if (!e || !e.includes(uid)) return undefined;
  const other = e[0] === uid ? e[1] : e[0];
  return s.hand.find((c) => c.uid === other);
}

/** The pair holds only while both its cards are in hand. */
function checkPair(s: RunState): void {
  if (s.either && !s.either.every((u) => s.hand.some((c) => c.uid === u))) s.either = undefined;
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
  const other = pairOf(s, s.hand[handIdx].uid);
  const [card] = s.hand.splice(handIdx, 1);
  s.energy -= costOf(card.id, card.up);
  const def = CARDS[card.id];
  ev.push({ t: 'play', card, plot: def.target === 'board' ? null : plot, to });
  // One of a pair is played: the other goes back in the tin, at the bottom (round 9).
  if (other) {
    s.hand.splice(s.hand.indexOf(other), 1);
    s.draw.unshift(other);
    s.either = undefined;
    ev.push({ t: 'putBack', card: other });
  }
  let toDiscard = true;
  const i = plot ?? -1;
  if (isSeed(card.id)) {
    const p = s.plots[i];
    const kind = card.id;
    const uid = s.nextUid++;
    // Tall Rows (checks: tallFast) may bring corn in a night sooner.
    const days = SEEDS[kind].days - (kind === 'corn' && pageOn(s, 'tall') ? Number(TUNING.tallFast) : 0);
    p.crop = { uid, kind, age: 0, days, up: card.up, compost: 0, rot: pageOn(s, 'rotation') && !!p.last && p.last !== kind, picks: 0, pest: 0, sprout: false };
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
  checkPair(s);
  return ev;
}

/** End the day: the night resolves, then the next morning or the season's end. */
export function endDay(s: RunState): Ev[] {
  if (s.phase !== 'day') return [];
  const ev: Ev[] = [];
  // Scoops left on the bench at dusk, for the stall to say how many sat unused (a scoop for good is worth it or not).
  // Round 9: not on a day the quota was already met (the ninth playtest's scoop was refused for "1 scoop a day sat
  // unused", the scoops of days played after the quota was met).
  if (s.earned < s.quota) s.idle = { scoops: (s.idle?.scoops ?? 0) + s.energy, days: (s.idle?.days ?? 0) + 1 };
  const max = handSize(s);
  if (s.hand.length > max) {
    const extra = s.hand.splice(0, s.hand.length - max);
    s.discard.push(...extra);
    ev.push({ t: 'discardExcess', cards: extra });
  }
  checkPair(s);
  night(s, ev);
  // The last winter met ends the run that night: the days after it were busywork (959 of 960 after day 4, then two more).
  if (s.day >= TUNING.days || (isFinal(s) && s.earned >= s.quota && !TUNING.noEnd)) seasonEnd(s, ev);
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
  s.either = undefined;
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
function rollCards(s: RunState, fresh = false, engines: readonly EngineId[] = s.shop?.engines ?? []): CardId[] {
  const out: CardId[] = [];
  const last = s.lastTray ?? [];
  // Round 8: the stall that gives an engine away sells none of the engines' cards beside it (the eighth playtest's
  // desktop stall sold a beehive for 45 coins beside the clipping that gives one free).
  const gifts = new Set(engines.flatMap((id) => ENGINES[id].gift));
  const pool = s.pool.filter((c) => !gifts.has(c));
  const add = (opts: CardId[]) => {
    const free = opts.filter((c) => !out.includes(c) && !gifts.has(c));
    const pool = free.filter((c) => !last.includes(c)).length ? free.filter((c) => !last.includes(c)) : free;
    if (pool.length) out.push(pick(s, pool));
  };
  if (!fresh) {
    // The year's first stall (the one after winter, round 9) lays out the year's new stock.
    if (s.season === 3) for (const o of s.stock ?? []) if (!out.includes(o.card) && out.length < TUNING.goods) out.push(o.card);
    const answers = hazardAnswers(s);
    // A hazard coming for the first time wins the one slot (the stall before autumn stocks the scarecrow); else one
    // already met, at random. An earlier stall offered the other.
    const coming = answers.filter((a) => (a.includes('scarecrow') ? s.stats.crows === 0 : s.stats.pests === 0));
    const met = answers.filter((a) => !coming.includes(a));
    const first = coming[0] ?? (met.length ? pick(s, met) : undefined);
    if (first) add(first);
    // The run's engine keeps one slot: its cards are always in stock (the seventh playtest's beehive was a rare roll).
    if (s.engine) add(ENGINES[s.engine].cards.filter((c) => s.pool.includes(c) && !(s.engine === 'vines' && c === 'strawberry' && !TUNING.vinesStockBerry)));
  }
  if (!out.some(isSeed)) {
    const rarity = rollRarity(s);
    const seeds = pool.filter(isSeed);
    add(seeds.some((c) => CARDS[c].rarity === rarity) ? seeds.filter((c) => CARDS[c].rarity === rarity) : seeds);
  }
  // Never a tray of starter commons only.
  if (!out.some((c) => CARDS[c].rarity !== 'common')) add(pool.filter((c) => CARDS[c].rarity === 'uncommon'));
  while (out.length < TUNING.goods) {
    const rarity = rollRarity(s);
    let opts = pool.filter((c) => CARDS[c].rarity === rarity && !out.includes(c));
    if (!opts.length) opts = pool.filter((c) => !out.includes(c));
    if (!opts.length) break;
    add(opts);
  }
  s.lastTray = [...out];
  return shuffle(s, out);
}

/**
 * Whether the cork board pins this page now: Green Thumb (a scoop a day) only for a bench that ran short last season,
 * like the scoop for good. The seventh playtest's guided summer stall sold it for 170 coins; afterwards 2.5 scoops a day
 * sat idle and autumn was missed by 39.
 */
export function pageOnSale(s: RunState, id: PageId): boolean {
  if (s.pages.includes(id)) return false;
  if (id === 'thumb' && scoopsIdle(s) >= TUNING.scoopIdle) return false;
  return true;
}

function rollPages(s: RunState, engines: readonly EngineId[] = []): PageId[] {
  // Round 9: the stall that gives an engine away pins none of the engines' pages beside it (the ninth playtest's first
  // stall sold Trellis on the cork board beside the free "Beans and Trellis").
  const free = new Set(engines.map((id) => ENGINES[id].page));
  const opts = (Object.keys(PAGES) as PageId[]).filter((p) => pageOnSale(s, p) && !free.has(p));
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
  // Round 9: the stall that opens a new year (after winter) brings the year's new stock and lays it on its tray, and
  // says so. It used to come on leaving that stall, so "New stock this year" first showed at the year's second stall.
  if (s.season === 3 && s.stockYear !== s.year + 1) newStock(s, null, s.year + 1);
  const twists = twistsDue(s) ? offerTwists(s) : undefined;
  // The next stall aims its twists at something else (round 8: "Trellis rests" came up 6 times in 15 stalls), and a
  // hitch at something neither of the last two aimed at (round 9).
  s.pastTwists = s.lastTwists ?? [];
  s.lastTwists = twists?.map((t) => ({ ...t })) ?? [];
  const engines = engineDue(s) ? offerEngines(s) : undefined;
  const level = levelDue(s);
  return {
    ...(engines ? { engines } : {}),
    cards: goods(s, rollCards(s, false, engines ?? [])),
    pages: rollPages(s, engines ?? []).map((page) => ({ page, price: Math.round(PAGES[page].price * priceScale(s)), sold: false })),
    reroll: TUNING.rerollBase,
    rerolls: 0,
    removed: 0,
    upgraded: 0,
    ...(twists ? { twists } : {}),
    ...(level ? { level } : {}),
  };
}

// ---------------------------------------------------------------- the engine's page, levelled

/**
 * The run's engine page at its next level, if the stall pins it: from the stall before `levelFrom` on, while the page
 * is kept and short of its last level (round 8). One level a stall.
 */
function levelDue(s: RunState): Shop['level'] | undefined {
  const page = s.engine ? ENGINES[s.engine].page : null;
  if (!page || !s.pages.includes(page) || seasonIndex(nextSeason(s)) < TUNING.levelFrom) return undefined;
  const to = pageLevel(s, page) + 1;
  if (to > Math.min(MAX_LEVEL, TUNING.maxLevel)) return undefined;
  return { page, to, price: levelPrice(to), sold: false };
}

/** What a level costs at the stall: II, then III. */
export function levelPrice(to: number): number {
  return TUNING.levelPrice[Math.max(0, Math.min(TUNING.levelPrice.length - 1, to - 2))];
}

export function canBuyLevel(s: RunState): boolean {
  const o = s.shop?.level;
  return s.phase === 'shop' && !!o && !o.sold && s.coins >= o.price && s.pages.includes(o.page);
}

/** Take the engine's page up a level: its number grows for the rest of the run. */
export function buyLevel(s: RunState): Ev[] | null {
  if (!canBuyLevel(s)) return null;
  const o = s.shop!.level!;
  s.coins -= o.price;
  o.sold = true;
  s.levels = { ...(s.levels ?? {}), [o.page]: o.to };
  return [{ t: 'level', page: o.page, to: o.to }];
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
export const HITCHES: readonly TwistId[] = ['frost', 'glut', 'sunup', 'crows', 'rest'];

/** Does the season the stall leads to have a twist? From year 2 spring, the last winter too. */
export function twistsDue(s: RunState): boolean {
  return TUNING.twists && seasonIndex(nextSeason(s)) >= TUNING.twistFrom;
}

/** A twist aimed at this run, with what it would cost (a hitch) or bring (a help) as a share of a season's take. */
export interface Aim {
  t: Twist;
  v: number;
}

const byCoins = (m: Partial<Record<SeedId, number>>): SeedId[] => (Object.keys(m) as SeedId[]).filter((k) => (m[k] ?? 0) > 0).sort((a, b) => (m[b] ?? 0) - (m[a] ?? 0));
const owns = (s: RunState, f: (id: CardId) => boolean) => allCards(s).some((c) => f(c.id)) || s.plots.some((p) => p.crop && f(p.crop.kind));
/** Pages whose bonuses show on a harvest, so a rest of one can be priced. */
const RESTABLE: readonly PageId[] = ['bees', 'cellar', 'vines', 'tall', 'market', 'clover', 'rotation'];

/**
 * The hitches that could come to this run, each aimed at what it relies on and priced by what it would cost this run
 * if it played the season as it played the last (round 7): a glut of the crop that took the most (half its coins);
 * frost on the row its sown crops paid most from (their coins), naming the crop sown there most; a crow every morning
 * while the run owns no scarecrow (the extra crows, each taking a crop of the mean pay); the page whose bonuses added
 * the most resting for the season (what it added). The seventh playtest took "sunflowers face up" with no sunflower
 * planted and crows with a scarecrow standing: each knocked 60 to 70 off a quota for free. Sunflowers facing up are no
 * longer offered: played ahead they cost nothing (a sunflower is sown above instead).
 *
 * Round 8: a scarecrow in the tin counts (the eighth playtest was offered a crow every morning with one in the tin, and
 * took 1,223 against 460), and no page rests that is another engine's (Trellis rested in bee and corn runs).
 */
export function hitchAims(s: RunState): Aim[] {
  const t = s.tally;
  if (!t || t.take <= 0) return [];
  const out: Aim[] = [];
  // Round 9: the second and third crop and row too, a lighter hitch for a run whose top one would cost more than a
  // quota can be cut (the ninth playtest's corn: "About 320 fewer coins" against a help of 220, the cut at its cap).
  for (const k of byCoins(t.kinds).slice(0, 3)) out.push({ t: { id: 'glut', crop: k }, v: (1 - TUNING.glutTimes) * ((t.kinds[k] ?? 0) / t.take) });
  const rows = t.rows.map((v, i) => ({ v, i })).filter((r) => r.v > 0).sort((a, b) => b.v - a.v).slice(0, 3);
  for (const r of rows) out.push({ t: { id: 'frost', row: r.i, crop: byCoins(t.rowKinds[r.i] ?? {})[0] }, v: r.v / t.take });
  const p = bySeason(TUNING.crowChance, nextSeason(s));
  const scarecrow = s.plots.some((pl) => pl.obj === 'scarecrow') || allCards(s).some((c) => c.id === 'scarecrow');
  if (p > 0 && !scarecrow) out.push({ t: { id: 'crows' }, v: (TUNING.days * Math.max(0, TUNING.crowEvery - p)) / Math.max(1, t.harvests) });
  const mine = s.engine ? ENGINES[s.engine].page : null;
  const restable = RESTABLE.filter((id) => !LEVELLED.includes(id) || id === mine);
  const pg = restable.filter((id) => s.pages.includes(id) && (t.from[id] ?? 0) > 0).sort((a, b) => (t.from[b] ?? 0) - (t.from[a] ?? 0))[0];
  if (pg) out.push({ t: { id: 'rest', page: pg }, v: (t.from[pg] ?? 0) / t.take });
  return out;
}

/**
 * The helps that could come to this run, each priced by what the plot and the tin already hold, from the season just
 * played and scaled to what it brought when played ahead (`TUNING.worthTimes`, from deck-twists): a buyer for any crop
 * but the one that took the most (double its coins); good company (a yield for each crop beside a harvest); calm (what
 * pests took); long picks (one more of each perennial's last pick); sunflowers all round (what their bloom added). A
 * buyer for a crop the run barely grows (the playtest's sunflowers, yield 3) is not offered.
 */
export function boonAims(s: RunState): Aim[] {
  const t = s.tally;
  if (!t || t.take <= 0) return [];
  const out: Aim[] = [];
  for (const k of byCoins(t.kinds).slice(1)) out.push({ t: { id: 'buyer', crop: k }, v: (TUNING.buyerTimes - 1) * ((t.kinds[k] ?? 0) / t.take) });
  out.push({ t: { id: 'company' }, v: t.company / t.take });
  if (bySeason(TUNING.pestChance, nextSeason(s)) > 0) out.push({ t: { id: 'calm' }, v: t.pests / t.take });
  if (owns(s, (id) => isSeed(id) && perennial(id))) out.push({ t: { id: 'picks' }, v: t.last / t.take });
  if (owns(s, (id) => id === 'sunflower')) out.push({ t: { id: 'sunall' }, v: (t.from.sunflower ?? 0) / t.take });
  return out.map((a) => ({ t: a.t, v: a.v * (TUNING.worthTimes[a.t.id] ?? 1) }));
}

/** The share a hitch takes off the quota: rounded to a whole percent, within bounds. */
export function easeOf(v: number): number {
  return Math.min(TUNING.easeMax, Math.max(TUNING.easeMin, Math.round(v * 100) / 100));
}

/** What a hitch would still cost a careful player who plays round it, as a share of a season's take (round 8). */
export function hitchCost(a: Aim): number {
  return a.v * (TUNING.adapt[a.t.id] ?? 0.5);
}

/**
 * The share a hitch would take off the quota before bounds (round 8): what it still costs a careful player, and the
 * worth of the help offered beside it, so the two are worth the same by the rules' own estimate.
 */
export function hitchCut(a: Aim, worth = TUNING.hitchMargin): number {
  return (hitchCost(a) + worth) * (TUNING.easeTimes[a.t.id] ?? 1);
}

/**
 * Two twists aimed the same way: the same twist on the same crop, row or page, or a glut and a buyer on the same crop
 * (the eighth playtest's carrots went glut, buyer, glut, buyer).
 */
export function sameAim(a: Twist, b: Twist): boolean {
  const crop = (t: Twist) => (t.id === 'glut' || t.id === 'buyer' ? t.crop : undefined);
  if (crop(a) && crop(a) === crop(b)) return true;
  // Round 9: frost on the same crop's row is the same hitch, whichever row that is (the ninth playtest's corn row
  // was frosted three times).
  if (a.id === 'frost' && b.id === 'frost' && a.crop && a.crop === b.crop) return true;
  return a.id === b.id && a.crop === b.crop && (a.row ?? -1) === (b.row ?? -1) && a.page === b.page;
}

/**
 * Two twists for the coming season, one that helps and one that gets in the way, in a random order. Round 7: both are
 * aimed at this run and priced for it. A hitch comes only if it would cost at least `minHit` of a season's take (one
 * that misses the build never comes). Round 8: the help is drawn first among those worth at least `minWorth` (a kind
 * at random, then one of that kind), and the hitch takes off the quota what it would still cost a careful player
 * (`adapt`, from deck-twists) and the help's worth, so by the rules' estimate the two are worth the same and which is
 * better depends on how the plot is played. Both carry what they would do in coins (`worth`), which the stall says.
 * Round 7 took a hitch's whole expected cost off: frost cut 25% and cost 10.5% played. Neither repeats the season just
 * played, and nothing the last stall offered is aimed the same way again (the eighth playtest's carrots went glut,
 * buyer, glut, buyer; "Trellis rests" came up 6 times in 15 stalls).
 */
export function offerTwists(s: RunState): Twist[] {
  const last = s.twist?.id;
  const before = s.lastTwists ?? [];
  // Round 9: a hitch aimed as either of the last two stalls aimed one is not offered again where it can be helped (the
  // ninth playtest's corn run had frost on the corn row three times and a corn glut twice).
  const older = [...before, ...(s.pastTwists ?? [])];
  const freshHelp = (t: Twist) => t.id !== last && !before.some((b) => sameAim(b, t));
  const helps = boonAims(s).filter((a) => freshHelp(a.t));
  const goods = helps.filter((a) => a.v >= TUNING.minWorth);
  // A help of the kind just played, aimed elsewhere (a buyer of another crop), only when no other pair is in bounds.
  const wider = boonAims(s).filter((a) => a.v >= TUNING.minWorth && !before.some((b) => sameAim(b, a.t)) && !(a.t.id === last && s.twist && sameAim(s.twist, a.t)));
  const all = hitchAims(s).filter((a) => a.t.id !== last);
  const fresh2 = all.filter((a) => !older.some((b) => sameAim(b, a.t)));
  const fresh1 = all.filter((a) => !before.some((b) => sameAim(b, a.t)));
  // Round 9: only a pair whose cut stays within bounds, so the hitch takes off its careful cost and the help's worth in
  // full and the two still weigh the same (when the cut hit its cap the ninth playtest read "About 220 more coins"
  // beside "About 320 fewer coins. Summer asks 600, not 920.", the hitch the worse by the help's worth).
  const fits = (h: Aim, g: Aim) => hitchCut(h, g.v) <= TUNING.easeMax + 1e-9 && !sameAim(h.t, g.t);
  let h: Aim | undefined;
  let g: Aim | undefined;
  let ceiling = TUNING.easeMax;
  // Fresh for two stalls with the usual helps, then with a wider choice of help; only if none of those can be weighed
  // fairly, a hitch the stall before last offered (never the last stall's: round 8).
  for (const [hs, gs] of [[fresh2, goods], [fresh2, wider], [fresh1, goods], [fresh1, wider]] as const) {
    const paired = hs.filter((x) => x.v >= TUNING.minHit && gs.some((y) => fits(x, y)));
    if (!paired.length) continue;
    h = pick(s, paired);
    // The help: a kind at random (buyers come one to a crop), then one of it, among those that keep the cut in bounds.
    const from = gs.filter((x) => fits(h!, x));
    const kind = pick(s, [...new Set(from.map((x) => x.t.id))]);
    g = pick(s, from.filter((x) => x.t.id === kind));
    break;
  }
  if (!h || !g) {
    // No pair in bounds (or a save with no tally): the lightest hitch there is and the lightest help worth having, and
    // the cut takes off both in full, past the usual most (the promise holds: the two still weigh the same). A run with
    // no tally to read (a save from before round 7): a glut of its top crop.
    const lean = topCrops(s)[0] ?? 'carrot';
    const spare = ([{ id: 'glut', crop: lean }, { id: 'frost', row: s.rows - 1 }, { id: 'glut', crop: lean === 'carrot' ? 'radish' : 'carrot' }] as Twist[]).find((t) => t.id !== last && !before.some((b) => sameAim(b, t))) ?? { id: 'frost', row: 0 };
    // Fresh for two stalls if there is one, else for one (round 8).
    const fresh = fresh2.some((x) => x.v >= TUNING.minHit) ? fresh2 : fresh1;
    const hits = fresh.filter((x) => x.v >= TUNING.minHit);
    const hh: Aim = [...(hits.length ? hits : fresh)].sort((a, b) => a.v - b.v)[0] ?? { t: spare, v: 0.15 };
    const ok = (goods.length ? goods : wider).filter((x) => !sameAim(hh.t, x.t));
    g = [...ok].sort((x, y) => x.v - y.v)[0] ?? [...helps].sort((x, y) => y.v - x.v)[0] ?? { t: { id: last === 'company' ? 'calm' : 'company' }, v: 0 };
    h = hh;
    ceiling = TUNING.easeHard;
  }
  const known = !!s.tally && s.tally.take > 0;
  const gv = round2(g.v);
  const ease = Math.min(ceiling, Math.max(TUNING.easeMin, Math.round(hitchCut(h, gv) * 100) / 100));
  const cost = Math.min(hitchCost(h), ease);
  const b: Twist = known ? { ...h.t, ease, worth: round2(cost) } : { ...h.t, ease };
  const a: Twist = known ? { ...g.t, worth: gv } : { ...g.t };
  return rand(s) < 0.5 ? [a, b] : [b, a];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * What a twist on offer would do to the coming season's take, in coins (round 8): a help's gain, what a hitch would
 * still cost a careful player. Both from the shares the rules priced and paired the twists by, against the season's
 * quota, so the stall's two numbers can be set side by side.
 */
export function twistCoins(s: RunState, t: Twist): number {
  const n = Math.max(0, (t.worth ?? 0) * twistQuota(s, null));
  return n >= 100 ? Math.round(n / 10) * 10 : Math.max(5, Math.round(n / 5) * 5);
}

/**
 * A twist's number, the same short line on both clippings under the twist's own line, so they can be weighed at a
 * glance: "About 320 more coins." for a help, "About 300 fewer coins." for a hitch (null for a save from before round 8).
 */
export function twistNote(s: RunState, t: Twist): string | null {
  if (t.worth === undefined) return null;
  return `About ${twistCoins(s, t)} ${HITCHES.includes(t.id) ? 'fewer' : 'more'} coins.`;
}

// ---------------------------------------------------------------- the run's engine

/** Does this stall offer an engine: a run's first stall, before one is taken. */
export function engineDue(s: RunState): boolean {
  return TUNING.engines && s.stats.log.length === 1 && !s.engine;
}

/** The engines on offer: three of the four, at random. */
function offerEngines(s: RunState): EngineId[] {
  return shuffle(s, [...ENGINE_IDS]).slice(0, TUNING.engineChoices);
}

/** Pick one of the engines on offer at a run's first stall. Free, and it can be changed until the stall is left. */
export function chooseEngine(s: RunState, i: number): Ev[] | null {
  const sh = s.shop;
  if (s.phase !== 'shop' || !sh?.engines || !sh.engines[i]) return null;
  sh.engine = i;
  return [{ t: 'engine', i }];
}

/**
 * Take an engine home: its cards go in the tin, its page in the almanac (with room made for it if it is full), and
 * its cards join the run's stock, so the stall can lay them out even before the catalogue holds them.
 */
export function takeEngine(s: RunState, id: EngineId): void {
  const e = ENGINES[id];
  s.engine = id;
  s.levels = { ...(s.levels ?? {}), [e.page]: 1 };
  for (const c of e.gift) if (id !== 'vines' || TUNING.vinesGift) s.draw.push(newCard(s, c));
  for (const c of e.cards) if (!s.pool.includes(c)) s.pool.push(c);
  if (!s.pages.includes(e.page)) {
    if (s.pages.length >= maxPages(s)) s.slots = (s.slots ?? 0) + 1;
    s.pages.push(e.page);
  }
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
  // Fresh stock is new cards: it does not force a hazard's answer again (nor sell an engine on offer free).
  sh.cards = goods(s, rollCards(s, true, sh.engines ?? []));
  return [{ t: 'reroll' }];
}

export function leaveShop(s: RunState): Ev[] | null {
  if (s.phase !== 'shop') return null;
  const ev: Ev[] = [];
  // The season's twist: the one picked, or the first offered if none was.
  const tw = s.shop?.twists;
  s.twist = tw?.length ? { ...tw[s.shop!.twist ?? 0] } : null;
  // The engine picked at a run's first stall goes home with it (none if none was picked).
  const en = s.shop?.engines;
  if (en?.length && s.shop!.engine !== undefined && en[s.shop!.engine]) takeEngine(s, en[s.shop!.engine]);
  if (s.season === 3) {
    s.year++;
    s.season = 0;
    // The stall brought it already; a save from before round 9 left at that stall brings it now.
    if (s.stockYear !== s.year) newStock(s, ev, s.year);
    else if (s.stock?.length) ev.push({ t: 'stock', cards: s.stock.filter((o) => !o.up).map((o) => o.card), select: s.stock.filter((o) => o.up).map((o) => o.card) });
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
function newStock(s: RunState, ev: Ev[] | null, year: number): void {
  s.stockYear = year;
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
  if (s.stock.length) ev?.push({ t: 'stock', cards, select });
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
