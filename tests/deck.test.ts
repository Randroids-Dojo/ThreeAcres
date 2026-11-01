// Seedbound's rules: the day, the board, the scoring cascade, hazards, the
// shop, meta unlocks and determinism.
import { describe, expect, it, onTestFinished } from 'vitest';
import { cloneRun, Dice, playRun, botDay, botShop, botTwist } from '../src/games/deck/bot';
import { newLearn, Tutor, weatherHelps } from '../src/games/deck/lessons';
import {
  allCards,
  buyCard,
  buyPage,
  buyScoop,
  buySlot,
  bySeason,
  canBuySlot,
  CARDS,
  maxPages,
  slotPrice,
  endDay,
  energyMax,
  forecast,
  isTall,
  SEEDS,
  unlocksFor,
  seasonsToNext,
  leaveShop,
  newMeta,
  GUIDED_DEALS,
  newRun,
  playCard,
  previewPlay,
  PRICE,
  nextPick,
  quotaFor,
  recordRun,
  removeCard,
  reroll,
  START_DECK,
  targetsFor,
  toss,
  TUNING,
  UNLOCK_ORDER,
  upgradeCard,
  giveUp,
  hazardAnswers,
  marketTonight,
  BOONS,
  HITCHES,
  chooseTwist,
  twistText,
  PAGES,
  nextQuota,
  scoopOnSale,
  twistEase,
  twistQuota,
  upgradeNote,
  type CardId,
  type Crop,
  type Ev,
  type Harvest,
  type RunState,
  type Twist,
} from '../src/games/deck/rules';

/** A fresh run with a chosen hand and plenty of energy, in a given season. */
function table(hand: CardId[], opts: { season?: 0 | 1 | 2 | 3; year?: number; energy?: number; seed?: number } = {}): RunState {
  const { s } = newRun(opts.seed ?? 7, null);
  s.season = opts.season ?? 0;
  s.year = opts.year ?? 1;
  s.draw.push(...s.hand);
  s.hand = hand.map((id) => ({ uid: s.nextUid++, id, up: false }));
  s.energy = opts.energy ?? 20;
  return s;
}

function play(s: RunState, id: CardId, plot: number | null, to?: number): Ev[] {
  const i = s.hand.findIndex((c) => c.id === id);
  expect(i, `${id} in hand`).toBeGreaterThanOrEqual(0);
  const ev = playCard(s, i, plot, to);
  expect(ev, `play ${id} on ${plot}`).not.toBeNull();
  return ev!;
}

function harvests(ev: Ev[]): Harvest[] {
  return ev.filter((e): e is Extract<Ev, { t: 'harvest' }> => e.t === 'harvest').map((e) => e.h);
}

describe('a new run', () => {
  it('starts with the start deck, a hand of five and three energy', () => {
    const { s } = newRun(1, null);
    expect(allCards(s).map((c) => c.id).sort()).toEqual([...START_DECK].sort());
    expect(s.hand.length).toBe(5);
    expect(s.energy).toBe(3);
    expect(s.plots.length).toBe(16);
    expect(s.quota).toBe(quotaFor(1, 0, []));
    expect(s.phase).toBe('day');
  });

  it('is deterministic for a seed', () => {
    const a = newRun(42, null).s;
    const b = newRun(42, null).s;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(newRun(43, null).s.hand)).not.toBe(JSON.stringify(a.hand));
  });

  it('quotas grow by season and year, and Cold Frame trims winter', () => {
    expect(quotaFor(1, 1, [])).toBeGreaterThan(quotaFor(1, 0, []));
    expect(quotaFor(2, 0, [])).toBeGreaterThan(quotaFor(1, 0, []));
    expect(quotaFor(1, 3, ['coldframe'])).toBeLessThan(quotaFor(1, 3, []));
  });
});

describe('playing cards', () => {
  it('a seed costs energy, takes an empty plot and goes to the discard', () => {
    const s = table(['carrot', 'carrot'], { energy: 3 });
    play(s, 'carrot', 5);
    expect(s.energy).toBe(2);
    expect(s.plots[5].crop?.kind).toBe('carrot');
    expect(s.discard.at(-1)?.id).toBe('carrot');
    expect(playCard(s, 0, 5)).toBeNull();
    expect(targetsFor(s, 0)).not.toContain(5);
  });

  it('refuses a card without the energy', () => {
    const s = table(['corn'], { energy: 1 });
    expect(playCard(s, 0, 0)).toBeNull();
  });

  it('the watering can boosts a row for tonight for a scoop; improved, it is free', () => {
    const s = table(['can', 'can'], { energy: 3 });
    play(s, 'can', 5);
    expect(s.energy).toBe(2);
    expect(s.plots.map((p) => p.boost)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    s.hand[0].up = true;
    play(s, 'can', 2);
    expect(s.energy).toBe(2);
    expect(s.plots.slice(0, 4).every((p) => p.boost === 1)).toBe(true);
    expect(s.plots[6].boost).toBe(1);
    expect(s.plots[8].boost).toBe(0);
  });

  it('objects stay on the board and come back at the season end', () => {
    const s = table(['beehive']);
    play(s, 'beehive', 5);
    expect(s.plots[5].obj).toBe('beehive');
    expect(s.placed.length).toBe(1);
    expect(targetsFor(s, 0)).toEqual([]);
  });

  it('the trowel moves a crop to an empty neighbour', () => {
    const s = table(['carrot', 'trowel']);
    play(s, 'carrot', 0);
    expect(playCard(s, 0, 0, 10)).toBeNull();
    play(s, 'trowel', 0, 1);
    expect(s.plots[0].crop).toBeNull();
    expect(s.plots[1].crop?.kind).toBe('carrot');
  });

  it('a toss swaps one card a day', () => {
    const s = table(['radish', 'carrot']);
    s.draw.push({ uid: 999, id: 'sun', up: false });
    expect(toss(s, 0)).not.toBeNull();
    expect(s.hand.map((c) => c.id)).toEqual(['carrot', 'sun']);
    expect(toss(s, 0)).toBeNull();
  });
});

describe('the night', () => {
  it('every crop grows a night on its own; the can adds a night to its row, once', () => {
    const s = table(['carrot', 'pumpkin', 'pumpkin', 'can']);
    play(s, 'carrot', 0);
    play(s, 'pumpkin', 1);
    play(s, 'pumpkin', 15);
    play(s, 'can', 3);
    const h = harvests(endDay(s));
    expect(h.map((x) => x.kind)).toEqual(['carrot']);
    expect(s.plots[1].crop?.age).toBe(2);
    expect(s.plots[15].crop?.age).toBe(1);
    expect(s.plots.every((p) => p.boost === 0)).toBe(true);
    endDay(s);
    expect(s.plots[1].crop?.age).toBe(3);
  });

  it('a lone radish ripens in a night and scores its base', () => {
    const s = table(['radish']);
    play(s, 'radish', 0);
    const h = harvests(endDay(s));
    expect(h.length).toBe(1);
    expect(h[0].score).toBe(2);
    expect(s.plots[0].crop).toBeNull();
    expect(s.earned).toBe(2);
    expect(s.coins).toBe(2);
  });

  it('carrot blooms +1 for each radish next to it, wherever it stands', () => {
    const s = table(['carrot', 'radish', 'radish', 'radish', 'radish']);
    play(s, 'carrot', 5);
    s.plots[5].crop!.age = 1;
    play(s, 'radish', 1); // above
    play(s, 'radish', 4); // left
    play(s, 'radish', 6); // right: pulled after the carrot, still counts
    play(s, 'radish', 15); // not a neighbour
    const h = harvests(endDay(s));
    expect(h.map((x) => x.kind)).toEqual(['radish', 'radish', 'carrot', 'radish', 'radish']);
    expect(h[0].score).toBe(4);
    const carrot = h[2];
    expect(carrot.chipsTotal).toBe(5);
    expect(carrot.multTotal).toBe(4);
    expect(carrot.mult.map((m) => m.from).sort()).toEqual([1, 4, 6]);
    expect(carrot.mult.every((m) => m.icon === 'radish')).toBe(true);
    expect(carrot.score).toBe(20);
    expect(h[4].score).toBe(2);
    expect(s.earned).toBe(4 + 4 + 20 + 4 + 2);
  });

  it('wheat gets +2 for each wheat next to it', () => {
    const s = table(['wheat', 'wheat', 'wheat', 'wheat']);
    for (const i of [0, 1, 2, 15]) play(s, 'wheat', i);
    for (const i of [0, 1, 2, 15]) s.plots[i].crop!.age = 3;
    const h = harvests(endDay(s));
    expect(h.map((x) => x.score)).toEqual([6, 8, 6, 4]);
  });

  it('rain adds a night to every crop; storm adds two and flattens one', () => {
    const s = table(['corn', 'corn', 'rain']);
    play(s, 'corn', 0);
    play(s, 'corn', 3);
    play(s, 'rain', null);
    endDay(s);
    expect(s.plots[0].crop?.age).toBe(2);
    const t = table(['corn', 'corn', 'storm']);
    play(t, 'corn', 0);
    play(t, 'corn', 3);
    play(t, 'storm', null);
    const ev = endDay(t);
    expect(ev.some((e) => e.t === 'flatten')).toBe(true);
    const left = t.plots.filter((p) => p.crop);
    expect(left.length).toBe(1);
    expect(left[0].crop!.age).toBe(3);
  });

  it('strawberries pick four nights, then leave', () => {
    const s = table(['strawberry']);
    play(s, 'strawberry', 0);
    s.plots[0].crop!.age = 3;
    const scores: number[] = [];
    for (let n = 0; n < 4; n++) scores.push(...harvests(endDay(s)).map((h) => h.score));
    expect(scores).toEqual([4, 4, 4, 4]);
    expect(s.plots[0].crop).toBeNull();
  });

  it('beans feed neighbours; corn blooms by beans; pumpkin likes room', () => {
    const s = table(['beans', 'corn', 'pumpkin']);
    play(s, 'beans', 0);
    play(s, 'corn', 1);
    play(s, 'pumpkin', 15);
    s.plots[0].crop!.age = 3;
    s.plots[1].crop!.age = 4;
    s.plots[15].crop!.age = 5;
    const h = harvests(endDay(s));
    const corn = h.find((x) => x.kind === 'corn')!;
    expect(corn.chipsTotal).toBe(12 + 2);
    expect(corn.multTotal).toBe(1.5);
    expect(corn.score).toBe(21);
    expect(h.find((x) => x.kind === 'pumpkin')!.score).toBe(60);
    expect(s.plots[0].crop?.kind).toBe('beans');
  });

  it('a sunflower blooms only the crop below it; beehives add bloom; Busy Bees is one x1.5, however many bees', () => {
    // A sunflower on A1: the lettuce beside it (B1) gets its tall +4 but no bloom; the one below it (A2) gets +2 bloom.
    const s = table(['sunflower', 'lettuce', 'lettuce', 'beehive']);
    play(s, 'sunflower', 0);
    play(s, 'lettuce', 1);
    play(s, 'lettuce', 4);
    for (const i of [1, 4]) s.plots[i].crop!.age = 2;
    const h = harvests(endDay(s));
    const beside = h.find((x) => x.plot === 1)!;
    const below = h.find((x) => x.plot === 4)!;
    expect(beside.chipsTotal).toBe(8);
    expect(beside.multTotal).toBe(1);
    expect(below.multTotal).toBe(3);
    expect(below.score).toBe(24);
    // A beehive's 3 by 3 adds +1 each; with Busy Bees a crop with bees about gets one x1.5 (round 4: it was x2), not one per bee.
    const t = table(['sunflower', 'lettuce', 'beehive', 'beehive']);
    t.pages.push('bees');
    play(t, 'sunflower', 0);
    play(t, 'lettuce', 4);
    play(t, 'beehive', 5);
    play(t, 'beehive', 9);
    t.plots[4].crop!.age = 2;
    const l = harvests(endDay(t))[0];
    expect(l.mult.filter((st) => st.icon === 'bees')).toHaveLength(1);
    // 1 + 2 (sunflower) + 1 + 1 (two hives), then x1.5 once.
    expect(l.multTotal).toBe(7.5);
  });

  it('a chili gives its neighbours x1.5 bloom, not the crop pulled after it', () => {
    const s = table(['chili', 'lettuce', 'lettuce']);
    play(s, 'chili', 0);
    play(s, 'lettuce', 3);
    play(s, 'lettuce', 4);
    for (const i of [0, 3, 4]) s.plots[i].crop!.age = 2;
    const h = harvests(endDay(s));
    expect(h.map((x) => x.kind)).toEqual(['chili', 'lettuce', 'lettuce']);
    expect(h[1].multTotal).toBe(1);
    expect(h[2].multTotal).toBe(1.5);
    expect(h[2].score).toBe(6);
  });

  it('Market Day doubles every fifth harvest', () => {
    const s = table(['radish', 'radish', 'radish', 'radish', 'radish']);
    s.pages.push('market');
    for (const i of [0, 3, 8, 11, 15]) play(s, 'radish', i);
    expect(harvests(endDay(s)).map((h) => h.score)).toEqual([2, 2, 2, 2, 4]);
  });

  it('the Rain Barrel adds a night to column A from each morning', () => {
    const s = table(['pumpkin', 'pumpkin']);
    s.pages.push('barrel');
    play(s, 'pumpkin', 4);
    play(s, 'pumpkin', 5);
    endDay(s);
    expect([0, 4, 8, 12].every((i) => s.plots[i].boost === 1)).toBe(true);
    expect(s.plots[5].boost).toBe(0);
    endDay(s);
    expect(s.plots[4].crop?.age).toBe(3);
    expect(s.plots[5].crop?.age).toBe(2);
  });

  it('shears pull a ripe crop now at double yield', () => {
    const s = table(['strawberry', 'shears']);
    play(s, 'strawberry', 0);
    s.plots[0].crop!.age = 3;
    const h = harvests(play(s, 'shears', 0));
    expect(h[0].score).toBe(8);
    expect(s.plots[0].crop?.picks).toBe(1);
  });
});

describe('hazards', () => {
  it('no pests or crows in spring of year 1', () => {
    const s = table(['carrot']);
    play(s, 'carrot', 0);
    for (let n = 0; n < 5; n++) {
      const ev = endDay(s);
      expect(ev.some((e) => e.t === 'pest' || e.t === 'crow')).toBe(false);
    }
  });

  it('pests no longer stop growth, garlic keeps them off, ladybirds clear them', () => {
    const s = table(['carrot', 'garlic', 'carrot', 'ladybirds'], { season: 1 });
    play(s, 'carrot', 0);
    play(s, 'garlic', 5);
    play(s, 'carrot', 6);
    s.plots[0].crop!.pest = 2;
    TUNING.pestSpread = 1;
    endDay(s);
    TUNING.pestSpread = 0.4;
    expect(s.plots[0].crop!.age).toBe(1);
    expect(s.plots[6].crop!.pest).toBe(0);
    s.hand.push({ uid: 900, id: 'ladybirds', up: false });
    s.energy = 3;
    play(s, 'ladybirds', null);
    expect(s.plots.every((p) => !p.crop?.pest)).toBe(true);
  });

  it('a scarecrow keeps crows off the 3 by 3', () => {
    const s = table(['strawberry', 'scarecrow'], { season: 2 });
    play(s, 'strawberry', 0);
    play(s, 'scarecrow', 5);
    s.plots[0].crop!.age = 3;
    s.crow = true;
    const ev = endDay(s);
    expect(ev.some((e) => e.t === 'crow')).toBe(false);
    expect(harvests(ev).length).toBe(1);
  });

  it('a crow is announced at dawn and comes only then; it takes one ripe, unguarded crop', () => {
    const was = TUNING.crowChance;
    TUNING.crowChance = [0, 0, 1];
    onTestFinished(() => {
      TUNING.crowChance = was;
    });
    const s = table(['strawberry', 'radish'], { season: 2 });
    play(s, 'strawberry', 0);
    play(s, 'radish', 15);
    s.plots[0].crop!.age = 3;
    expect(s.crow).toBe(false);
    // No crow was about this morning, so none comes tonight.
    expect(endDay(s).some((e) => e.t === 'crow')).toBe(false);
    // The next dawn has one on the plate's edge, before the day's plays.
    const dawn = s;
    expect(dawn.crow).toBe(true);
    const ev = endDay(s);
    TUNING.crowChance = [0];
    const s2 = table(['radish'], { season: 2 });
    endDay(s2);
    TUNING.crowChance = was;
    expect(ev.filter((e) => e.t === 'crow').length).toBe(1);
    expect(s2.crow).toBe(false);
    expect(s.stats.crows).toBeGreaterThanOrEqual(1);
  });

  it('a pested crop is picked at half pay for exactly the nights its badge shows, and keeps growing', () => {
    const s = table(['strawberry', 'carrot', 'radish'], { season: 1 });
    play(s, 'strawberry', 0);
    play(s, 'carrot', 15);
    s.plots[0].crop!.age = 3;
    s.plots[0].crop!.pest = 1;
    s.plots[15].crop!.pest = 2;
    const was = TUNING.pestChance;
    TUNING.pestChance = [0];
    TUNING.pestSpread = 0;
    onTestFinished(() => {
      TUNING.pestChance = was;
      TUNING.pestSpread = 0.4;
    });
    // One night of pests on a ripe strawberry: picked tonight at half (the old rules did not pick it at all).
    const h1 = harvests(endDay(s));
    expect(h1.map((h) => h.kind)).toEqual(['strawberry']);
    expect(h1[0].score).toBe(2);
    expect(h1[0].mult.some((st) => st.icon === 'pest' && st.v === 0.5)).toBe(true);
    expect(s.plots[0].crop!.pest).toBe(0);
    // The pested carrot grew all the same.
    expect(s.plots[15].crop!.age).toBe(1);
    // Next night the strawberry is clean and pays in full; the carrot (two nights of pests) ripens at half.
    const h2 = harvests(endDay(s));
    expect(h2.find((h) => h.kind === 'strawberry')!.score).toBe(4);
    const carrot = h2.find((h) => h.kind === 'carrot')!;
    expect(carrot.score).toBe(3);
  });

  it('the preview and the plot reading pay half only on nights the pests are still on', () => {
    const s = table(['carrot'], { season: 1 });
    play(s, 'carrot', 0);
    // Ripe in two nights; one night of pests leaves after tonight: it will pay in full.
    s.plots[0].crop!.pest = 1;
    expect(nextPick(s, 0)).toEqual({ score: 5, ripeIn: 1, late: false, never: false });
    // Ripe tonight with two nights of pests on: half, rounded.
    s.plots[0].crop!.age = 1;
    s.plots[0].crop!.pest = 2;
    expect(nextPick(s, 0)!.score).toBe(3);
    expect(nextPick(s, 0)!.ripeIn).toBe(0);
  });
});

describe('seasons and the shop', () => {
  function toSeasonEnd(s: RunState): Ev[] {
    const ev: Ev[] = [];
    while (s.phase === 'day') ev.push(...endDay(s));
    return ev;
  }

  it('missing the quota ends the run', () => {
    const { s } = newRun(3, null);
    const ev = toSeasonEnd(s);
    expect(s.phase).toBe('over');
    expect(ev.some((e) => e.t === 'over')).toBe(true);
    expect(s.end?.quota).toBe(s.quota);
  });

  it('meeting it opens the shop, which sells, removes, upgrades, rerolls and moves on', () => {
    const { s } = newRun(3, null);
    s.earned = s.quota;
    toSeasonEnd(s);
    expect(s.phase).toBe('shop');
    expect(s.shop!.cards.length).toBe(4);
    expect(s.shop!.pages.length).toBe(2);
    s.coins = 1000;
    const before = allCards(s).length;
    expect(buyCard(s, 0)).not.toBeNull();
    expect(buyCard(s, 0)).toBeNull();
    expect(allCards(s).length).toBe(before + 1);
    expect(buyPage(s, 0)).not.toBeNull();
    expect(s.pages.length).toBe(1);
    const victim = s.draw[0];
    expect(removeCard(s, victim.uid)).not.toBeNull();
    expect(allCards(s).some((c) => c.uid === victim.uid)).toBe(false);
    const up = s.draw.find((c) => !c.up)!;
    const coins = s.coins;
    expect(upgradeCard(s, up.uid)).not.toBeNull();
    expect(up.up).toBe(true);
    const second = s.draw.find((c) => !c.up)!;
    upgradeCard(s, second.uid);
    expect(coins - s.coins).toBe(TUNING.upgradePrice * 2 + TUNING.serviceStep);
    const r = s.shop!.reroll;
    expect(reroll(s)).not.toBeNull();
    expect(s.shop!.reroll).toBe(r + TUNING.rerollStep);
    leaveShop(s);
    expect(s.phase).toBe('day');
    expect(s.season).toBe(1);
    expect(s.earned).toBe(0);
    expect(s.plots.every((p) => !p.crop && !p.obj)).toBe(true);
  });

  it('winter leads to a new year, and Long Furrow adds a column', () => {
    const { s } = newRun(5, null);
    s.season = 3;
    s.pages.push('furrow');
    s.earned = 10000;
    toSeasonEnd(s);
    leaveShop(s);
    expect(s.year).toBe(2);
    expect(s.season).toBe(0);
    expect(s.cols).toBe(5);
    expect(s.plots.length).toBe(20);
  });

  it('every stall stocks a seed, and an answer to a hazard the player has met but cannot meet', () => {
    for (let seed = 1; seed <= 40; seed++) {
      // Pests have landed and the player has no ladybirds or garlic: the stall's tray has one.
      const { s } = newRun(seed, null);
      s.earned = s.quota;
      s.stats.pests = 1;
      s.draw = s.draw.filter((c) => c.id !== 'ladybirds' && c.id !== 'garlic');
      toSeasonEnd(s);
      expect(s.shop!.cards.some((c) => CARDS[c.card].type === 'seed')).toBe(true);
      const ids = s.shop!.cards.map((c) => c.card);
      expect(ids.includes('ladybirds') || ids.includes('garlic')).toBe(true);
    }
  });

  it('a full almanac swaps a page for a kept one; coins buy up to four scoops for good from year 2', () => {
    const { s } = newRun(3, null);
    s.year = 2;
    s.earned = 99999;
    toSeasonEnd(s);
    const offered = s.shop!.pages.map((o) => o.page);
    s.pages = (['barrel', 'cellar', 'bees', 'thumb', 'basket', 'rotation', 'market', 'clover', 'furrow', 'coldframe'] as const).filter((p) => !offered.includes(p)).slice(0, 5);
    const first = s.pages[0];
    s.coins = 5000;
    expect(buyPage(s, 0)).toBeNull();
    expect(buyPage(s, 0, first)).not.toBeNull();
    expect(s.pages.length).toBe(5);
    expect(s.pages).not.toContain(first);
    expect(s.pages).toContain(offered[0]);
    // Four scoops for good, each twice the last: a sink for late coins that the bench lays out at any count (round 6:
    // only when last season's bench had few to spare; this season played no days, so none sat unused).
    s.stats.log.at(-1)!.idle = 0;
    const e0 = energyMax(s);
    const prices: number[] = [];
    for (let k = 0; k < 4; k++) {
      prices.push(s.coins);
      expect(buyScoop(s)).not.toBeNull();
      prices[k] -= s.coins;
    }
    expect(buyScoop(s)).toBeNull();
    expect(energyMax(s)).toBe(e0 + 4);
    expect(prices[3]).toBe(prices[0] * 8);
  });

  it('only shops from the unlocked pool, and the stock a new year brings', () => {
    const { s } = newRun(9, null);
    for (let k = 0; k < 30; k++) {
      s.earned = s.quota;
      toSeasonEnd(s);
      // The run ends at the last winter.
      if (s.phase === 'over') break;
      for (const c of s.shop!.cards) expect(s.pool).toContain(c.card);
      s.coins = 100;
      reroll(s);
      for (const c of s.shop!.cards) expect(s.pool).toContain(c.card);
      leaveShop(s);
    }
    expect(s.end?.won).toBe(true);
    // Years 2 and 3 brought two cards each, for this run; the rest of the catalogue stays locked.
    expect(s.pool.filter((c) => UNLOCK_ORDER.includes(c))).toHaveLength(4);
  });
});

describe('meta and saves', () => {
  it('cards unlock by how far a run gets, never by finishing runs', () => {
    const meta = newMeta();
    // Six empty days: a run that met nothing unlocks nothing, however many times.
    for (let k = 0; k < 3; k++) {
      const { s } = newRun(3 + k, meta);
      while (s.phase === 'day') endDay(s);
      expect(recordRun(meta, s, UNLOCK_ORDER)).toEqual([]);
    }
    expect(meta.unlocked).toEqual([]);
    expect(meta.runs).toBe(3);
    // Meeting the first quota earns the first pair; meeting three seasons, the second.
    const { s } = newRun(9, meta);
    s.stats.seasonsCleared = 3;
    while (s.phase === 'day') endDay(s);
    expect(recordRun(meta, s, UNLOCK_ORDER)).toEqual(UNLOCK_ORDER.slice(0, 4));
    expect(recordRun(meta, s, UNLOCK_ORDER)).toEqual(UNLOCK_ORDER.slice(0, 4));
    expect(unlocksFor(1, UNLOCK_ORDER)).toEqual(UNLOCK_ORDER.slice(0, 2));
    expect(newRun(4, meta).s.pool).toContain(UNLOCK_ORDER[0]);
  });

  it('a saved run carries on exactly as the original', () => {
    const { s } = newRun(11, null);
    const dice = new Dice(3);
    botDay(s, { noise: 0, seed: 1 }, dice);
    botDay(s, { noise: 0, seed: 1 }, dice);
    const saved = JSON.parse(JSON.stringify(s)) as RunState;
    const a = cloneRun(s);
    for (const r of [a, saved]) {
      playCard(r, 0, r.plots.findIndex((p) => !p.crop && !p.obj));
      endDay(r);
      endDay(r);
    }
    expect(JSON.stringify(saved)).toBe(JSON.stringify(a));
  });
});

describe('the balance bot', () => {
  it('plays whole runs without breaking the rules', () => {
    for (const seed of [1, 2, 3]) {
      const { s } = newRun(seed, null);
      const dice = new Dice(seed);
      const count = allCards(s).length;
      let bought = 0;
      for (let guard = 0; guard < 200 && s.phase !== 'over'; guard++) {
        if (s.phase === 'day') {
          const ev = botDay(s, { noise: 0.1, seed }, dice);
          expect(s.energy).toBeGreaterThanOrEqual(0);
          for (const e of ev) if (e.t === 'harvest') expect(Number.isFinite(e.h.score)).toBe(true);
        } else {
          const n = allCards(s).length;
          botShop(s, { noise: 0.1, seed }, dice);
          bought += allCards(s).length - n;
        }
        expect(allCards(s).length).toBe(count + bought);
        expect(s.coins).toBeGreaterThanOrEqual(0);
        for (const c of s.hand) expect(CARDS[c.id]).toBeTruthy();
      }
    }
  }, 20000);

  // Round 6: the bot plays each twist's season ahead before it picks, so a whole run takes a few seconds.
  it('is reproducible', () => {
    expect(JSON.stringify(playRun(77, null, { noise: 0.1, seed: 2 }))).toBe(JSON.stringify(playRun(77, null, { noise: 0.1, seed: 2 })));
  }, 30000);
});

describe('the guided first season', () => {
  it('deals its set hands from the start deck, one idea a day, then draws as usual', () => {
    const { s } = newRun(1, null, true);
    expect(s.hand.map((c) => c.id)).toEqual(GUIDED_DEALS[0]);
    expect(allCards(s).length).toBe(START_DECK.length);
    for (const i of [5, 6]) playCard(s, 0, i);
    endDay(s);
    expect(s.hand.map((c) => c.id)).toEqual(GUIDED_DEALS[1]);
    // Carrot first, a radish beside it, the other radish apart.
    playCard(s, 0, 5);
    playCard(s, 0, 6);
    playCard(s, 0, 15);
    endDay(s);
    expect(s.hand.map((c) => c.id)).toEqual(GUIDED_DEALS[2]);
    // Three scoops, and two more for the two radishes pulled last night.
    expect(s.energy).toBe(5);
    expect(s.bench).toBe(5);
    // Ring the carrot (ripe tonight) with two radishes: 5 yield x 3 bloom.
    playCard(s, 0, 4);
    playCard(s, 0, 1);
    const h = harvests(endDay(s));
    expect(h.find((x) => x.kind === 'carrot')!.score).toBe(15);
    // Days 4 to 6 bring one new card each, so each is met on its own: the beans, the can, the sunflower.
    const met = new Set<string>(['radish', 'carrot', 'lettuce']);
    for (const fresh of ['beans', 'can', 'sunflower']) {
      const ids = s.hand.map((c) => c.id);
      expect(ids.filter((id) => !met.has(id))).toEqual([fresh]);
      for (const id of ids) met.add(id);
      expect(s.hand.length).toBeLessThanOrEqual(5);
      // Play what fits, as a player would.
      for (let k = 0; k < 3; k++) {
        const i = s.hand.findIndex((c) => CARDS[c.id].type === 'seed');
        const plot = s.plots.findIndex((p) => !p.crop && !p.obj);
        if (i < 0 || plot < 0 || !playCard(s, i, plot)) break;
      }
      endDay(s);
    }
    expect(allCards(s).length).toBe(START_DECK.length);
    expect(s.script.length).toBe(0);
  });

  it('is deterministic, and a normal run is untouched by it', () => {
    expect(JSON.stringify(newRun(5, null, true).s)).toBe(JSON.stringify(newRun(5, null, true).s));
    expect(newRun(5, null).s.script).toEqual([]);
  });
});

describe('previews', () => {
  it('a bonus only counts if the crop giving it is still there when the other is pulled', () => {
    // Day 2 of the guided season: a fresh carrot (two nights) and a radish held beside it (one night).
    const s = table(['carrot', 'radish']);
    play(s, 'carrot', 5);
    const before = JSON.stringify(s);
    const p = previewPlay(s, 0, 6)!;
    // The carrot still stands tonight, so the radish's +2 pays.
    expect(p.harvest).toEqual({ yield: 4, bloom: 1, score: 4, late: false });
    expect(p.marks).toContainEqual({ plot: 6, yield: 2, bloom: 0, times: 1, nights: 0 });
    // The radish is pulled tonight and the carrot tomorrow: its +1 bloom never pays, so it is greyed with why.
    const carrot = p.marks.find((m) => m.plot === 5)!;
    expect(carrot.bloom).toBe(0);
    expect(carrot.lost).toEqual({ yield: 0, bloom: 1, times: 1, why: 'gone', from: 6 });
    // And the night agrees: the carrot pays 5 x 1.
    play(s, 'radish', 6);
    endDay(s);
    const h = harvests(endDay(s));
    expect(h.find((x) => x.kind === 'carrot')!.score).toBe(5);
    expect(previewPlay(table(['radish']), 0, 15)!.marks).toEqual([]);
    expect(JSON.stringify(table(['carrot', 'radish']))).not.toBe(before);
  });

  it('on the night the carrot ripens, the radish beside it does pay its bloom', () => {
    const s = table(['carrot', 'radish']);
    play(s, 'carrot', 5);
    s.plots[5].crop!.age = 1;
    const p = previewPlay(s, 0, 6)!;
    // Round 6: the carrot's mark carries what it will pay now, 5 x 2.
    expect(p.marks).toContainEqual({ plot: 5, yield: 0, bloom: 1, times: 1, nights: 0, total: 10 });
    play(s, 'radish', 6);
    expect(harvests(endDay(s)).find((x) => x.kind === 'carrot')!.score).toBe(10);
  });

  it('a seed that ripens after the season ends previews as paying next season, its bonuses counted', () => {
    // The plot carries over: a lettuce sown on day 6 below a sunflower is pulled on next season's first night, the sunflower still standing.
    const s = table(['sunflower', 'lettuce']);
    s.day = 6;
    play(s, 'sunflower', 5);
    const p = previewPlay(s, 0, 9)!;
    expect(p.harvest).toEqual({ yield: 8, bloom: 3, score: 24, late: true });
    expect(p.marks.every((m) => !m.lost)).toBe(true);
    expect(p.marks).toContainEqual({ plot: 9, yield: 4, bloom: 2, times: 1, nights: 0 });
  });

  it('the can and rain show extra nights, the sun shows yield on crops pulled tonight', () => {
    const s = table(['pumpkin', 'radish', 'can', 'rain', 'sun']);
    play(s, 'pumpkin', 0);
    play(s, 'radish', 15);
    expect(previewPlay(s, 0, 1)!.marks).toEqual([{ plot: 0, yield: 0, bloom: 0, times: 1, nights: 1 }]);
    expect(previewPlay(s, 1, null)!.marks.map((m) => m.plot)).toEqual([0]);
    const sun = previewPlay(s, 2, null)!.marks;
    expect(sun).toEqual([{ plot: 15, yield: 3, bloom: 0, times: 1, nights: 0, total: 5 }]);
  });

  it('the forecast knows when each crop is pulled and leaves; pests no longer hold a crop back', () => {
    const s = table(['carrot', 'strawberry', 'radish']);
    play(s, 'carrot', 0);
    play(s, 'strawberry', 1);
    play(s, 'radish', 2);
    s.plots[0].crop!.pest = 2;
    const f = forecast(s);
    expect(f[2]).toEqual({ ripeIn: 0, pull: 0, leave: 0, late: false });
    // Pests halve its pay but it grows as usual: two nights.
    expect(f[0]).toEqual({ ripeIn: 1, pull: 1, leave: 1, late: false });
    // Ripe on night 2, then four picks: nights 2 to 5, the season's last.
    expect(f[1]).toEqual({ ripeIn: 2, pull: 2, leave: 5, late: false });
    // On day 4 the same strawberry picks twice this season and twice next: the plot carries over.
    s.day = 4;
    expect(forecast(s)[1]).toEqual({ ripeIn: 2, pull: 2, leave: 5, late: false });
    s.day = 6;
    expect(forecast(s)[1]).toEqual({ ripeIn: 2, pull: 2, leave: 5, late: true });
  });
});

describe('the plot persists', () => {
  it('the start deck has a tall crop for the lettuce, and perennials at its core', () => {
    const seeds = START_DECK.filter((id) => CARDS[id].type === 'seed');
    expect(seeds.some((id) => isTall(id))).toBe(true);
    const standing = seeds.filter((id) => SEEDS[id as keyof typeof SEEDS].picks > 1 || SEEDS[id as keyof typeof SEEDS].days >= 3);
    expect(standing.length).toBeGreaterThanOrEqual(4);
  });

  it('through a bot-played first spring, the plot is rarely bare at dawn and crops stand for days', () => {
    // The old start deck (radishes, carrots, lettuce, cans and a rain) left 0.3 crops at dawn and 77% of dawns bare.
    let dawns = 0;
    let crops = 0;
    let bare = 0;
    const born = new Map<number, number>();
    const stood: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const { s } = newRun(seed * 97, null);
      const dice = new Dice(seed);
      while (s.phase === 'day' && s.season === 0) {
        const day = s.day;
        const ev = botDay(s, { noise: 0.15, seed }, dice);
        for (const e of ev) if (e.t === 'plant') born.set(e.uid, day);
        const now = new Set(s.plots.map((p) => p.crop?.uid));
        for (const [uid, d] of born) {
          if (now.has(uid) && s.phase === 'day') continue;
          stood.push(day - d + 1);
          born.delete(uid);
        }
        if (s.phase !== 'day') break;
        const n = s.plots.filter((p) => p.crop).length;
        dawns++;
        crops += n;
        if (n === 0) bare++;
      }
    }
    expect(crops / dawns).toBeGreaterThanOrEqual(2.5);
    expect(bare / dawns).toBeLessThanOrEqual(0.12);
    // The old deck's crops stood 1.3 nights on average.
    expect(stood.reduce((a, b) => a + b, 0) / stood.length).toBeGreaterThanOrEqual(1.8);
  });
});

describe('lessons that fit the moment', () => {
  /** A tutor past the first season's lessons, so the hazard lessons are next. */
  function tutor(): Tutor {
    const learn = newLearn();
    learn.done = ['sow', 'lantern', 'peg', 'stakes', 'companion', 'bloom', 'scoops', 'tin', 'can', 'weather', 'spent', 'newcard'];
    learn.cards = ['radish', 'carrot', 'lettuce', 'beans', 'strawberry', 'sunflower', 'can', 'rain', 'ladybirds', 'scarecrow', 'garlic'];
    return new Tutor(learn);
  }

  it('the weather lesson only comes when the rain would bring a crop in tonight', () => {
    // The only crop ripens tonight anyway: rain would change nothing (the old lesson spent a scoop on it).
    const s = table(['radish', 'rain']);
    play(s, 'radish', 0);
    expect(weatherHelps(s, 'rain')).toBe(false);
    // A carrot one night short: rain brings it in tonight.
    const t = table(['carrot', 'rain']);
    play(t, 'carrot', 0);
    expect(weatherHelps(t, 'rain')).toBe(true);
  });

  it('hazard lessons say what pests cost first, then name only a card the player has in hand; the crow comes up at dawn', () => {
    const s = table(['radish'], { season: 1 });
    s.plots[3].crop = { uid: 700, kind: 'carrot', age: 0, days: 2, up: false, compost: 0, rot: false, picks: 0, pest: 2, sprout: false };
    for (const own of [[], ['garlic'], ['ladybirds']] as CardId[][]) {
      const c = cloneRun(s);
      c.draw = c.draw.filter((x) => x.id !== 'ladybirds' && x.id !== 'garlic' && x.id !== 'scarecrow');
      // Round 5: only a card in the hand is named (the tester's first crow asked for a scarecrow still in the tin).
      for (const id of own) c.hand.push({ uid: 900 + c.draw.length, id, up: false });
      const t = tutor();
      // The first line is what pests cost, whatever is owned (round 4: it used to name garlic first).
      const first = t.update(c, 'touch', null, 0.1, false).line!;
      expect(first.id).toBe('pests');
      expect(first.text).toMatch(/halve/);
      expect(first.text).not.toMatch(/ladybird|garlic/i);
      // Then, once it has had its say, the answer, only if one can still be brought out.
      const next = t.update(c, 'touch', null, 6, false).line;
      if (!own.length) expect(next?.text ?? '').not.toMatch(/ladybird|garlic/i);
      else {
        expect(next!.id).toBe('pestfix');
        expect(next!.text.toLowerCase()).toContain(own[0]);
      }
    }
    const c = cloneRun(s);
    c.plots[3].crop = null;
    c.crow = true;
    c.draw = c.draw.filter((x) => x.id !== 'scarecrow');
    expect(tutor().update(c, 'touch', null, 0.1, false).line!.text).not.toMatch(/scarecrow/i);
    c.hand.push({ uid: 990, id: 'scarecrow', up: false });
    expect(tutor().update(c, 'touch', null, 0.1, false).line!.text).toMatch(/scarecrow/i);
  });
});

describe('the plot carries over from season to season', () => {
  function toStall(s: RunState): Ev[] {
    const ev: Ev[] = [];
    s.earned = Math.max(s.earned, s.quota);
    while (s.phase === 'day') {
      s.earned = Math.max(s.earned, s.quota);
      ev.push(...endDay(s));
    }
    return ev;
  }

  it('crops still growing, perennials with picks left and objects stand into the next season; only the cards come home', () => {
    const s = table(['strawberry', 'pumpkin', 'scarecrow', 'beehive', 'radish']);
    s.day = 3;
    play(s, 'strawberry', 0);
    endDay(s);
    endDay(s);
    expect(s.day).toBe(5);
    s.energy = 20;
    play(s, 'pumpkin', 10);
    play(s, 'scarecrow', 5);
    play(s, 'beehive', 15);
    const owned = allCards(s).length;
    toStall(s);
    expect(s.phase).toBe('shop');
    leaveShop(s);
    expect(s.season).toBe(1);
    // The strawberry ripened on night 5 and picked on nights 5 and 6: two picks left. The pumpkin (five nights) is still growing.
    expect(s.plots[0].crop?.kind).toBe('strawberry');
    expect(s.plots[0].crop?.picks).toBe(2);
    expect(s.plots[10].crop?.kind).toBe('pumpkin');
    expect(s.plots[10].crop!.age).toBe(2);
    expect(s.plots[5].obj).toBe('scarecrow');
    expect(s.plots[15].obj).toBe('beehive');
    // The objects' cards stay out on their plots; every other card is back in the tin or the new hand.
    expect(s.placed.map((c) => c.id).sort()).toEqual(['beehive', 'scarecrow']);
    expect(allCards(s).length).toBe(owned);
    expect(s.discard.length).toBe(0);
    // And the strawberry picks on the new season's first night, for the new season's quota (on top of what carried in).
    const h = harvests(endDay(s));
    expect(h.map((x) => x.kind)).toEqual(['strawberry']);
    expect(s.earned).toBe((s.carried ?? 0) + h[0].score);
  });

  it('a crop pulled next season pays what its preview said, and the plot stands through the year turn too', () => {
    const was = [TUNING.pestChance, TUNING.crowChance];
    TUNING.pestChance = [0];
    TUNING.crowChance = [0];
    // Next season's twist is not known yet: with none, the preview is exact.
    TUNING.twists = false;
    onTestFinished(() => {
      [TUNING.pestChance, TUNING.crowChance] = was;
      TUNING.twists = true;
    });
    const s = table(['sunflower', 'lettuce'], { season: 3 });
    s.day = 6;
    play(s, 'sunflower', 5);
    const p = previewPlay(s, 0, 6)!;
    play(s, 'lettuce', 6);
    toStall(s);
    leaveShop(s);
    expect(s.year).toBe(2);
    expect(s.season).toBe(0);
    const h = harvests(endDay(s));
    [TUNING.pestChance, TUNING.crowChance] = was;
    expect(p.harvest!.late).toBe(true);
    expect(h.find((x) => x.kind === 'lettuce')?.score).toBe(p.harvest!.score);
  });

  it('the Long Furrow adds column E without moving anything that stands', () => {
    const s = table(['carrot', 'beans']);
    s.day = 6;
    play(s, 'carrot', 7);
    play(s, 'beans', 12);
    s.pages.push('furrow');
    toStall(s);
    leaveShop(s);
    expect(s.cols).toBe(5);
    // Row 1 column D (7 of 16) is row 1 column D (8 of 20); row 3 column A (12) is 15.
    expect(s.plots[8].crop?.kind).toBe('carrot');
    expect(s.plots[15].crop?.kind).toBe('beans');
    expect(s.plots.filter((q) => q.crop).length).toBe(2);
  });

  it('with the bot, a season no longer starts on a bare plot', () => {
    let dawns = 0;
    let crops = 0;
    let firstNight = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const { s } = newRun(seed * 31, null);
      const dice = new Dice(seed);
      while (s.phase !== 'over' && (s.year - 1) * 4 + s.season < 4) {
        if (s.phase === 'shop') {
          botShop(s, { noise: 0.15, seed }, dice);
          continue;
        }
        if (s.day === 1 && (s.season > 0 || s.year > 1)) {
          dawns++;
          crops += s.plots.filter((q) => q.crop).length;
          const before = s.earned;
          botDay(s, { noise: 0.15, seed }, dice);
          firstNight += s.earned - before;
          continue;
        }
        botDay(s, { noise: 0.15, seed }, dice);
      }
    }
    expect(dawns).toBeGreaterThan(10);
    // The old rules cleared the plot at every season's end: 0 crops at every first dawn.
    expect(crops / dawns).toBeGreaterThanOrEqual(2);
    expect(firstNight / dawns).toBeGreaterThan(15);
  }, 20000);
});

describe('quotas after the playtest', () => {
  it('year 1 summer to winter ask more than they did (the tester ran at 1.4 to 1.55 times them), and no year turn is a cliff', () => {
    // The shipped quotas before: summer 165, autumn 185, winter 220. The plot carrying over lifts takes, so they rise at least 15%.
    expect(quotaFor(1, 1, [])).toBeGreaterThanOrEqual(Math.round(165 * 1.15));
    expect(quotaFor(1, 2, [])).toBeGreaterThanOrEqual(Math.round(185 * 1.15));
    expect(quotaFor(1, 3, [])).toBeGreaterThanOrEqual(Math.round(220 * 1.15));
    // Spring of year 1 stays close to where the first round left it: the real puzzle.
    expect(quotaFor(1, 0, [])).toBe(170);
    for (let year = 1; year <= 4; year++) {
      const winter = quotaFor(year, 3, []);
      const spring = quotaFor(year + 1, 0, []);
      expect(spring / winter).toBeLessThan(1.25);
      for (let season = 1; season < 4; season++) expect(quotaFor(year, season as 1 | 2 | 3, [])).toBeGreaterThan(quotaFor(year, (season - 1) as 0 | 1 | 2, []));
    }
  });
});

describe('hazards ramp by season, and the first crow can be met', () => {
  it('pest and crow odds rise a step a season, with no jump at the year turn', () => {
    const at = (list: number[], k: number) => bySeason(list, { year: Math.floor(k / 4) + 1, season: (k % 4) as 0 | 1 | 2 | 3 });
    for (const list of [TUNING.pestChance, TUNING.crowChance]) {
      const steps: number[] = [];
      for (let k = 1; k < 12; k++) steps.push(at(list, k) - at(list, k - 1));
      expect(steps.every((d) => d >= 0 && d <= 0.15)).toBe(true);
      // Year 1 winter to year 2 spring is a step like any other (the old odds doubled there).
      expect(at(list, 4) / Math.max(0.01, at(list, 3))).toBeLessThan(1.5);
    }
    expect(at(TUNING.pestChance, 0)).toBe(0);
    expect(at(TUNING.crowChance, 1)).toBe(0);
    expect(at(TUNING.crowChance, 2)).toBeGreaterThan(0);
  });

  it('crows come at dawn about as often in year 2 spring as in year 1 winter', () => {
    const rate = (year: number, season: 0 | 1 | 2 | 3) => {
      const s = table(['radish'], { year, season, seed: 11 });
      let crows = 0;
      for (let n = 0; n < 1500; n++) {
        s.day = 1;
        s.phase = 'day';
        s.earned = 1e9;
        endDay(s);
        if (s.crow) crows++;
      }
      return crows / 1500;
    };
    const winter = rate(1, 3);
    const spring = rate(2, 0);
    expect(spring / winter).toBeLessThan(1.5);
  });

  it('the stall before the first crow season stocks a scarecrow, and the one before the first pests an answer to them', () => {
    for (let seed = 1; seed <= 30; seed++) {
      // The end of year 1 summer: no crow has come yet, but autumn may bring one.
      const s = table(['radish'], { season: 1, seed });
      s.draw = s.draw.filter((c) => c.id !== 'scarecrow');
      while (s.phase === 'day') {
        s.earned = 1e6;
        endDay(s);
      }
      expect(s.stats.crows).toBe(0);
      expect(s.shop!.cards.map((c) => c.card)).toContain('scarecrow');
      // The end of year 1 spring: pests come from summer.
      const t = table(['radish'], { season: 0, seed });
      while (t.phase === 'day') {
        t.earned = 1e6;
        endDay(t);
      }
      const ids = t.shop!.cards.map((c) => c.card);
      expect(ids.includes('ladybirds') || ids.includes('garlic')).toBe(true);
    }
  });
});

describe('the stall, round 2', () => {
  it('lays out four goods, always with a seed and one uncommon or rarer', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { s } = newRun(seed, null);
      s.earned = s.quota;
      while (s.phase === 'day') endDay(s);
      const cards = s.shop!.cards.map((c) => c.card);
      expect(cards.length).toBe(4);
      expect(new Set(cards).size).toBe(4);
      expect(cards.some((c) => CARDS[c].type === 'seed')).toBe(true);
      expect(cards.some((c) => CARDS[c].rarity !== 'common')).toBe(true);
    }
  });

  it('with the almanac full, coins buy room for one more page, dearer each time', () => {
    const { s } = newRun(3, null);
    s.year = 2;
    s.earned = 99999;
    while (s.phase === 'day') endDay(s);
    const offered = s.shop!.pages.map((o) => o.page);
    s.pages = (['barrel', 'cellar', 'bees', 'thumb', 'basket', 'rotation', 'market', 'clover', 'furrow', 'coldframe'] as const).filter((p) => !offered.includes(p)).slice(0, 4);
    s.coins = 100000;
    expect(maxPages(s)).toBe(4);
    expect(canBuySlot(s)).toBe(true);
    const first = slotPrice(s);
    expect(buySlot(s)).not.toBeNull();
    expect(maxPages(s)).toBe(5);
    // Room now: the next page is pinned without tearing one out.
    expect(buyPage(s, 0)).not.toBeNull();
    expect(s.pages.length).toBe(5);
    expect(slotPrice(s)).toBe(first * 2);
    // Not while there is still room.
    s.slots = 1;
    s.pages = s.pages.slice(0, 4);
    expect(canBuySlot(s)).toBe(false);
  });
});

describe('round 3: cost by power, scoops back, rebalance, hazards that press', () => {
  it('seeds are priced by power, free fillers to dear stars, and the can costs a scoop', () => {
    const cost = (id: CardId) => CARDS[id].cost;
    expect(cost('radish')).toBe(0);
    expect([cost('carrot'), cost('lettuce'), cost('garlic'), cost('wheat')]).toEqual([1, 1, 1, 1]);
    expect([cost('beans'), cost('sunflower'), cost('strawberry'), cost('chili')]).toEqual([2, 2, 2, 2]);
    expect([cost('corn'), cost('pumpkin')]).toEqual([3, 3]);
    expect(cost('can')).toBe(1);
    // Cards cost less at the stall than they did, and the almanac keeps four pages before a slot is bought.
    expect(PRICE).toEqual({ common: 15, uncommon: 30, rare: 45 });
    expect(maxPages({ slots: 0 })).toBe(4);
    // A free radish goes in with an empty bench; corn needs all three scoops.
    const s = table(['radish', 'corn', 'corn'], { energy: 0 });
    play(s, 'radish', 0);
    expect(playCard(s, 0, 1)).toBeNull();
    s.energy = 3;
    play(s, 'corn', 1);
    expect(s.energy).toBe(0);
  });

  it('a crop pulled up puts a scoop on the next morning\'s bench, two at most a night', () => {
    const s = table(['radish', 'radish', 'radish', 'carrot'], { energy: 3 });
    for (const i of [0, 5, 10]) play(s, 'radish', i);
    play(s, 'carrot', 15);
    const ev = endDay(s);
    // Three radishes pulled up, the carrot still growing: the bench holds its three and two more.
    expect(harvests(ev).filter((h) => h.leaves)).toHaveLength(3);
    expect(harvests(ev).map((h) => h.scoops)).toEqual([1, 1, 0]);
    expect(s.bench).toBe(energyMax(s) + 2);
    expect(s.energy).toBe(s.bench);
    expect(s.saved).toBe(0);
  });

  it('a perennial puts its scoop back when it leaves; a strawberry with every pick; a crow or a storm puts none back', () => {
    const s = table(['beans', 'strawberry'], { energy: 9 });
    play(s, 'beans', 0);
    play(s, 'strawberry', 15);
    s.plots[0].crop!.age = 3;
    s.plots[15].crop!.age = 3;
    // First pick of each: the beans stay (no scoop), the strawberry puts one back.
    const h = harvests(endDay(s));
    expect(h.find((x) => x.kind === 'beans')!.scoops).toBe(0);
    expect(h.find((x) => x.kind === 'strawberry')!.scoops).toBe(1);
    expect(s.bench).toBe(energyMax(s) + 1);
    // A crow takes a ripe crop: nothing comes back for it.
    const t = table(['radish'], { season: 2 });
    play(t, 'radish', 0);
    t.plots[0].crop!.age = 1;
    t.crow = true;
    const ev = endDay(t);
    expect(ev.some((e) => e.t === 'crow')).toBe(true);
    expect(t.bench).toBe(energyMax(t));
  });

  it('the shears put the scoop back on today\'s bench, and the scoops saved on a season\'s last night come to the next season\'s first dawn', () => {
    const s = table(['radish', 'shears'], { energy: 1 });
    play(s, 'radish', 0);
    s.plots[0].crop!.age = 1;
    s.bench = 1;
    play(s, 'shears', 0);
    expect(s.energy).toBe(1);
    expect(s.bench).toBe(2);
    const { s: r } = newRun(3, null);
    r.day = 6;
    r.earned = 1e6;
    r.hand = [{ uid: 990, id: 'radish', up: false }];
    playCard(r, 0, 0);
    endDay(r);
    expect(r.phase).toBe('shop');
    leaveShop(r);
    expect(r.bench).toBe(energyMax(r) + 1);
  });

  it('the Root Cellar gives radishes and carrots +2 yield, and +1 bloom with a partner beside them (round 4: once)', () => {
    const ring = (cellar: boolean) => {
      const s = table(['carrot', 'radish', 'radish', 'radish', 'radish']);
      if (cellar) s.pages.push('cellar');
      play(s, 'carrot', 5);
      for (const i of [1, 4, 6, 9]) play(s, 'radish', i);
      s.plots[5].crop!.age = 1;
      return harvests(endDay(s));
    };
    const plain = ring(false);
    const cellar = ring(true);
    // Without it: 5 x (1 + 4). With it the carrot is worth 7 and gets +1 more bloom (four radishes, capped at one): 7 x 6; each radish (2 + 2 + 2) gets +1 for the carrot.
    expect(plain.find((h) => h.kind === 'carrot')!.score).toBe(25);
    expect(cellar.find((h) => h.kind === 'carrot')!.score).toBe(7 * 6);
    expect(cellar.find((h) => h.plot === 1)!.score).toBe(12);
    expect(cellar.find((h) => h.plot === 1)!.mult.some((st) => st.icon === 'cellar')).toBe(true);
  });

  it('the Long Furrow comes with a scoop', () => {
    const { s } = newRun(5, null);
    const before = energyMax(s);
    s.pages.push('furrow');
    expect(energyMax(s)).toBe(before + 1);
  });

  it('the catalogue grows with seasons met across runs, so a short run still adds to it', () => {
    const meta = newMeta();
    const end = (seasons: number) => {
      const { s } = newRun(seasons, meta);
      s.stats.seasonsCleared = seasons;
      s.phase = 'over';
      s.end = { year: 1, season: 0, earned: 0, quota: 1, unlocked: [], recorded: false };
      return recordRun(meta, s, UNLOCK_ORDER);
    };
    // Four seasons, then three, then three: the old rule (per run) unlocked two pairs and then nothing.
    expect(end(4)).toEqual(['beehive', 'chili', 'corn', 'wheat']);
    expect(end(3)).toEqual(['pumpkin', 'shears']);
    expect(end(3)).toEqual(['mint', 'trowel']);
    expect(meta.seasons).toBe(10);
    expect(seasonsToNext(meta)).toBe(2);
  });

  it('the crow lesson only asks for a scarecrow in the hand, not one already standing', () => {
    const learn = newLearn();
    learn.done = ['sow', 'lantern', 'peg', 'stakes', 'companion', 'bloom', 'newcard', 'scoops', 'saved', 'tin', 'can', 'weather', 'spent'];
    const s = table(['radish'], { season: 2 });
    s.crow = true;
    s.draw = s.draw.filter((c) => c.id !== 'scarecrow');
    // One standing on C2, none to set out.
    s.plots[6].obj = 'scarecrow';
    s.placed.push({ uid: 991, id: 'scarecrow', up: false });
    const line = new Tutor(learn).update(s, 'touch', null, 0.1, false).line!;
    expect(line.id).toBe('crows');
    expect(line.text).not.toMatch(/set out/i);
    // One in the hand: now it asks (round 5: one in the tin does not, since it cannot be set out today).
    s.hand.push({ uid: 992, id: 'scarecrow', up: false });
    expect(new Tutor({ ...learn, done: [...learn.done] }).update(s, 'touch', null, 0.1, false).line!.text).toMatch(/set out the scarecrow/i);
  });

  it('the guided season teaches cost a piece at a time: dear seeds with the beans, then the scoops pulled crops put back', () => {
    const { s } = newRun(1, null, true);
    // Days 1 to 3 as dealt: the hands never cost more than the bench holds, so nothing calls for the scoops yet.
    for (let day = 1; day <= 3; day++) {
      const cost = s.hand.reduce((a, c) => a + CARDS[c.id].cost, 0);
      expect(cost).toBeLessThanOrEqual(s.energy);
      expect(s.hand.every((c) => CARDS[c.id].cost < 2)).toBe(true);
      for (let k = 0; k < 5; k++) {
        const i = s.hand.findIndex((c) => CARDS[c.id].type === 'seed');
        const plot = s.plots.findIndex((p) => !p.crop && !p.obj);
        if (i < 0 || !playCard(s, i, plot)) break;
      }
      endDay(s);
    }
    // The tutor as day 3 left it: the first lessons done, the first three crops known.
    const learn = newLearn();
    learn.done = ['sow', 'lantern', 'peg', 'stakes', 'companion', 'bloom'];
    learn.seen = ['lantern', 'peg', 'bloom'];
    learn.cards = ['radish', 'carrot', 'lettuce'];
    const tutor = new Tutor(learn);
    const look = () => tutor.update(s, 'touch', null, 0.1, false).line;
    // Day 4: the beans are new: read them first, then spend two scoops on them, which brings the bench in.
    expect(look()!.id).toBe('newcard');
    expect(tutor.seen('scoops')).toBe(false);
    tutor.count('detail');
    const l = look()!;
    expect(l.id).toBe('scoops');
    expect(l.text).toBe('Spend two scoops on the beans.');
    expect(tutor.seen('scoops')).toBe(true);
    playCard(s, s.hand.findIndex((c) => c.id === 'beans'), s.plots.findIndex((p) => !p.crop && !p.obj));
    tutor.count('dear');
    look();
    expect(learn.done).toContain('scoops');
    tutor.count('night');
    endDay(s);
    // Day 5's dawn: more than the refill on the bench, and the lesson says why.
    expect(s.bench).toBeGreaterThan(energyMax(s));
    expect(look()!.text).toBe('Crops pulled last night put scoops back.');
  });
});

describe('round 4: a finish line, giving up that counts, the Cellar paired, Market Day shown, one answer slot', () => {
  /** Play the bot through whole seasons until the run reaches this season index, or ends. */
  function botTo(seed: number, k: number): RunState {
    const { s } = newRun(seed, null);
    const o = { noise: 0, seed };
    const dice = new Dice(seed);
    for (let g = 0; g < 400 && s.phase !== 'over' && (s.year - 1) * 4 + s.season < k; g++) {
      if (s.phase === 'shop') botShop(s, o, dice);
      else botDay(s, o, dice);
    }
    return s;
  }

  it('giving up ends the run the way a missed quota does: recorded, its seasons counted, its best harvest kept', () => {
    // Two seasons met, then given up on day 3 of the third.
    const s = botTo(31, 2);
    expect(s.phase).toBe('day');
    expect(s.stats.seasonsCleared).toBe(2);
    endDay(s);
    endDay(s);
    const meta = newMeta();
    meta.best.harvest = 5;
    const ev = giveUp(s);
    expect(ev).not.toBeNull();
    expect(s.phase).toBe('over');
    expect(s.end!.gaveUp).toBe(true);
    expect(s.end!.day).toBe(3);
    // The season so far goes in the log, not met.
    expect(s.stats.log.at(-1)).toMatchObject({ year: 1, season: 2, cleared: false });
    const fresh = recordRun(meta, s, UNLOCK_ORDER);
    expect(meta.runs).toBe(1);
    expect(meta.seasons).toBe(2);
    expect(fresh).toEqual(['beehive', 'chili']);
    expect(meta.best.seasons).toBe(2);
    expect(meta.best.harvest).toBe(s.stats.bestHarvest);
    expect(meta.best.harvest).toBeGreaterThan(5);
    // Recorded once, and nothing more to give up.
    recordRun(meta, s, UNLOCK_ORDER);
    expect(meta.runs).toBe(1);
    expect(giveUp(s)).toBeNull();
  });

  it('giving up at the stall ends the run too, without a season of nothing in the log', () => {
    const { s } = newRun(5, null);
    s.earned = s.quota;
    while (s.phase === 'day') endDay(s);
    expect(s.phase).toBe('shop');
    const logged = s.stats.log.length;
    giveUp(s);
    expect(s.phase).toBe('over');
    expect(s.shop).toBeNull();
    expect(s.stats.log.length).toBe(logged);
    expect(s.end).toMatchObject({ gaveUp: true, day: 0 });
    const meta = newMeta();
    recordRun(meta, s, UNLOCK_ORDER);
    expect(meta.seasons).toBe(1);
  });

  it('the run has a finish line: the last winter of year 3 met wins the run, and wins are kept', () => {
    expect(TUNING.years).toBe(3);
    const { s } = newRun(9, null);
    s.year = 3;
    s.season = 3;
    s.earned = 1e6;
    while (s.phase === 'day') endDay(s);
    expect(s.phase).toBe('over');
    expect(s.shop).toBeNull();
    expect(s.end!.won).toBe(true);
    const meta = newMeta();
    recordRun(meta, s, UNLOCK_ORDER);
    expect(meta.wins).toBe(1);
    expect(meta.bestWin).toBe(s.stats.totalEarned);
    // Year 3 autumn met still opens the stall, and its signpost leads to the last winter.
    const t = newRun(9, null).s;
    t.year = 3;
    t.season = 2;
    t.earned = 1e6;
    while (t.phase === 'day') endDay(t);
    expect(t.phase).toBe('shop');
    // The last winter missed is a loss, like any season.
    const u = newRun(9, null).s;
    u.year = 3;
    u.season = 3;
    while (u.phase === 'day') {
      u.earned = 0;
      endDay(u);
    }
    expect(u.phase).toBe('over');
    expect(u.end!.won).toBeFalsy();
  });

  it('in the last winter a seed that ripens after the last night previews as never pulled', () => {
    const s = table(['pumpkin', 'radish'], { year: 3, season: 3 });
    s.day = 4;
    const pv = previewPlay(s, s.hand.findIndex((c) => c.id === 'pumpkin'), 5)!;
    expect(pv.harvest!.never).toBe(true);
    expect(pv.harvest!.score).toBe(0);
    // A radish still comes in tonight.
    expect(previewPlay(s, s.hand.findIndex((c) => c.id === 'radish'), 5)!.harvest!.never).toBeFalsy();
    // A year earlier the same pumpkin ripens next season and counts then.
    const t = table(['pumpkin'], { year: 2, season: 3 });
    t.day = 4;
    expect(previewPlay(t, 0, 5)!.harvest).toMatchObject({ late: true });
    expect(previewPlay(t, 0, 5)!.harvest!.never).toBeFalsy();
  });

  it('the Root Cellar pairs the roots: a radish beside a radish gets no bloom from it, and a crop gets its +1 once', () => {
    const s = table([]);
    s.pages.push('cellar');
    const radish = (uid: number) => ({ uid, kind: 'radish' as const, age: 1, days: 1, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false });
    // Two radishes side by side, no carrot: the Cellar adds yield, no bloom.
    s.plots[0].crop = radish(1);
    s.plots[1].crop = radish(2);
    // A carrot ringed by four radishes: +4 bloom of its own, the Cellar's +1 once.
    s.plots[10].crop = { ...radish(3), kind: 'carrot', days: 2, age: 2 };
    for (const [i, uid] of [[6, 4], [9, 5], [11, 6], [14, 7]]) s.plots[i].crop = radish(uid);
    const hs = harvests(endDay(s));
    const at = (i: number) => hs.find((h) => h.plot === i)!;
    expect(at(0).mult.filter((st) => st.icon === 'cellar')).toHaveLength(0);
    expect(at(0).score).toBe(4);
    expect(at(10).mult.filter((st) => st.icon === 'cellar').reduce((a, st) => a + st.v, 0)).toBe(TUNING.cellarCap);
    expect(at(10).score).toBe(7 * (1 + 4 + TUNING.cellarCap));
    expect(at(6).mult.filter((st) => st.icon === 'cellar')).toHaveLength(1);
  });

  it('Market Day shows in the previews and readings: the fifth crop pulled tonight pays x2, and is stamped', () => {
    const s = table(['radish']);
    s.pages.push('market');
    const ripe = (uid: number) => ({ uid, kind: 'lettuce' as const, age: 2, days: 2, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false });
    // Five lettuces ripe tonight, in reading order: plots 0, 2, 8, 10, 15. The one on 15 is fifth.
    for (const [i, uid] of [[0, 1], [2, 2], [8, 3], [10, 4], [15, 5]]) s.plots[i].crop = ripe(uid);
    // The reading of the fifth says what the night will pay (it used to say 4 and pay 8).
    expect(nextPick(s, 15)!.score).toBe(8);
    expect(nextPick(s, 10)!.score).toBe(4);
    expect(marketTonight(s)).toEqual([15]);
    // A radish sown on plot 5 is pulled tonight before plot 15: it becomes the fourth, the lettuce on 10 the fifth.
    const pv = previewPlay(s, 0, 5)!;
    expect(pv.market).toEqual([10]);
    // A radish on plot 12 is the fifth itself: its own total shows the x2.
    expect(previewPlay(s, 0, 12)!.harvest!.score).toBe(4);
    // And the night pays what the reading said.
    const hs = harvests(endDay(s));
    expect(hs.find((h) => h.plot === 15)!.score).toBe(8);
  });

  it('the stall gives a hazard\'s answer one slot at most, none on fresh stock, and none once enough are owned', () => {
    let both = 0;
    let freshScarecrows = 0;
    let rolls = 0;
    for (let seed = 1; seed <= 60; seed++) {
      // Year 1 autumn met, crows and pests both seen, no answers owned: both hazards want an answer.
      const s = table(['radish'], { season: 2, seed });
      s.draw = s.draw.filter((c) => !['scarecrow', 'ladybirds', 'garlic'].includes(c.id));
      s.stats.crows = 1;
      s.stats.pests = 1;
      while (s.phase === 'day') {
        s.earned = 1e6;
        endDay(s);
      }
      expect(hazardAnswers(s)).toHaveLength(2);
      const ids = s.shop!.cards.map((c) => c.card);
      expect(ids.includes('scarecrow') || ids.includes('ladybirds') || ids.includes('garlic')).toBe(true);
      if (ids.includes('scarecrow') && (ids.includes('ladybirds') || ids.includes('garlic'))) both++;
      // Fresh stock is new cards: it does not force an answer again.
      s.coins = 1e6;
      for (let k = 0; k < 4; k++) {
        reroll(s);
        rolls++;
        if (s.shop!.cards.some((c) => c.card === 'scarecrow')) freshScarecrows++;
      }
    }
    // Two answer slots on every tray before; now both only when a random good happens to be the other.
    expect(both / 60).toBeLessThan(0.35);
    expect(freshScarecrows / rolls).toBeLessThan(0.4);
    // Enough owned: one scarecrow (it stands for the rest of the run) and two cards for pests.
    const s = table(['radish'], { season: 2 });
    s.stats.crows = 1;
    s.stats.pests = 1;
    s.draw = s.draw.filter((c) => !['scarecrow', 'ladybirds', 'garlic'].includes(c.id));
    s.placed.push({ uid: 990, id: 'scarecrow', up: false });
    s.draw.push({ uid: 991, id: 'ladybirds', up: false }, { uid: 992, id: 'garlic', up: false });
    expect(hazardAnswers(s)).toEqual([]);
  });

  it('a new year brings the merchant new stock for the run, and a tray shows different cards from the last where it can', () => {
    const { s } = newRun(4, null);
    const before = s.pool.length;
    s.season = 3;
    s.earned = 1e6;
    while (s.phase === 'day') endDay(s);
    const ev = leaveShop(s)!;
    expect(s.year).toBe(2);
    expect(s.pool.length).toBe(before + 2);
    const stock = ev.find((e): e is Extract<Ev, { t: 'stock' }> => e.t === 'stock')!;
    expect(stock.cards).toHaveLength(2);
    for (const c of stock.cards) expect(UNLOCK_ORDER).toContain(c);
    // Tray to tray, fewer repeats than chance alone would give from fourteen cards.
    let repeats = 0;
    let slots = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const t = newRun(seed, null).s;
      t.coins = 1e6;
      t.earned = 1e6;
      while (t.phase === 'day') endDay(t);
      let last = t.shop!.cards.map((c) => c.card);
      for (let k = 0; k < 3; k++) {
        reroll(t);
        const now = t.shop!.cards.map((c) => c.card);
        repeats += now.filter((c) => last.includes(c)).length;
        slots += now.length;
        last = now;
      }
    }
    expect(repeats / slots).toBeLessThan(0.1);
  });
});

describe('round 5: a run that ends on its last quota, year 3 against your own year 2, twists, carry, a softer second spring, stock that never runs out', () => {
  const crop = (uid: number, kind: Crop['kind'], age: number, days: number, extra: Partial<Crop> = {}): Crop => ({ uid, kind, age, days, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false, ...extra });
  /** Meet every day of this season (and any before the stall). */
  function toStall(s: RunState): void {
    for (let g = 0; g < 10 && s.phase === 'day'; g++) {
      s.earned = Math.max(s.earned, s.quota);
      endDay(s);
    }
  }
  const calm = () => {
    const was = [TUNING.pestChance, TUNING.crowChance] as const;
    TUNING.pestChance = [0];
    TUNING.crowChance = [0];
    onTestFinished(() => {
      [TUNING.pestChance, TUNING.crowChance] = was;
    });
  };

  it('the last winter ends the night its quota is met, not two busy days later', () => {
    calm();
    const s = table(['radish'], { year: 3, season: 3 });
    s.quota = 500;
    s.earned = 498;
    s.plots[0].crop = crop(800, 'lettuce', 2, 2);
    const ev = endDay(s);
    expect(s.phase).toBe('over');
    expect(s.end!.won).toBe(true);
    expect(s.end!.metDay).toBe(1);
    expect(s.stats.log.at(-1)).toMatchObject({ year: 3, season: 3, cleared: true });
    expect(ev.some((e) => e.t === 'dawn' && e.day === 2)).toBe(false);
    // Short of it, the season goes on to the next day as before; and any other season always plays all six days.
    const t = table(['radish'], { year: 3, season: 3 });
    t.quota = 500;
    t.earned = 100;
    endDay(t);
    expect(t.phase).toBe('day');
    expect(t.day).toBe(2);
    const u = table(['radish'], { year: 3, season: 2 });
    u.quota = 10;
    u.earned = 50;
    endDay(u);
    expect(u.phase).toBe('day');
  });

  it('a share of a season\'s surplus carries into the next one: the playtest\'s 817 of 440, then 463 of 510, now clears', () => {
    calm();
    const s = table(['radish'], { year: 2, season: 0 });
    s.quota = 440;
    s.day = 6;
    s.earned = 817;
    endDay(s);
    expect(s.phase).toBe('shop');
    leaveShop(s);
    expect(s.season).toBe(1);
    const want = Math.min(Math.round(TUNING.carryShare * (817 - 440)), Math.round(TUNING.carryCap * s.quota));
    expect(want).toBeGreaterThan(0);
    expect(s.carried).toBe(want);
    expect(s.earned).toBe(want);
    // The carry is credit against the quota, not coins.
    const coins = s.coins;
    // Summer takes 463 of its own against a quota of 510 (here the real one): the carry makes it up.
    s.quota = 510;
    s.day = 6;
    s.earned = want + 463;
    endDay(s);
    expect(s.stats.log.at(-1)).toMatchObject({ earned: want + 463, cleared: true, carried: want });
    expect(s.coins).toBe(coins);
    // Capped: a huge surplus carries at most its share of the next quota.
    const t = table(['radish'], { year: 2, season: 0 });
    t.quota = 400;
    t.day = 6;
    t.earned = 100000;
    endDay(t);
    leaveShop(t);
    expect(t.carried).toBe(Math.round(TUNING.carryCap * t.quota));
    // A missed season carries nothing, and the run ends anyway; the guided first spring carries too.
    const g = newRun(2, null, true).s;
    g.day = 6;
    g.earned = 200;
    endDay(g);
    leaveShop(g);
    expect(g.carried).toBeGreaterThan(0);
  });

  it('the first run after the guided one has a softer first spring', () => {
    const meta = newMeta();
    expect(newRun(1, meta, true).s.quota).toBe(TUNING.guidedQuota);
    meta.runs = 1;
    const second = newRun(1, meta, false).s;
    expect(second.quota).toBe(TUNING.softSpring);
    expect(TUNING.softSpring).toBeLessThan(TUNING.quotas[0]);
    // Only its first spring: summer asks the usual.
    toStall(second);
    leaveShop(second);
    expect(second.quota).toBe(quotaFor(1, 1, []));
    // Later runs, and the bots' runs with no record, ask the usual from the start.
    meta.runs = 2;
    expect(newRun(1, meta, false).s.quota).toBe(TUNING.quotas[0]);
    expect(newRun(1, null, false).s.quota).toBe(TUNING.quotas[0]);
  });

  it('from year 2 each stall offers two twists for the season ahead, one that helps and one that gets in the way; the one picked holds all season', () => {
    let offers = 0;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const { s } = newRun(seed, null);
      // Year 1's stalls have none.
      toStall(s);
      expect(s.shop!.twists).toBeUndefined();
      s.season = 3;
      s.stats.log.at(-1)!.season = 3;
      // The stall after year 1 winter leads to year 2 spring: it offers two.
      const t = newRun(seed, null).s;
      t.season = 3;
      toStall(t);
      const tw = t.shop!.twists!;
      expect(tw).toHaveLength(2);
      offers++;
      const kinds = tw.map((x) => (BOONS.includes(x.id) ? 'boon' : 'hitch')).sort();
      expect(kinds).toEqual(['boon', 'hitch']);
      for (const x of tw) {
        seen.add(x.id);
        expect(twistText(x).split(/\s+/).length).toBeLessThanOrEqual(10);
        if (x.id === 'buyer' || x.id === 'glut') expect(allCards(t).some((c) => c.id === x.crop)).toBe(true);
      }
      expect(chooseTwist(t, 1)).not.toBeNull();
      expect(t.shop!.twist).toBe(1);
      const picked = tw[1];
      const ev = leaveShop(t)!;
      expect(t.twist).toEqual(picked);
      expect(ev.find((e) => e.t === 'season')).toMatchObject({ twist: picked });
      // It holds all season and goes in the log; the next stall offers two more, never the same one again at once.
      toStall(t);
      expect(t.stats.log.at(-1)!.twist).toEqual(picked);
      expect(t.twist).toBeNull();
      expect(t.shop!.twists!.some((x) => x.id === picked.id)).toBe(false);
    }
    expect(offers).toBe(40);
    // A buyer is for a crop the run has not leaned on; a glut hits the one that has taken the most.
    for (let seed = 1; seed <= 30; seed++) {
      const t = newRun(seed, null).s;
      t.season = 3;
      t.stats.byKind = { carrot: 900, beans: 200, radish: 50 };
      toStall(t);
      for (const x of t.shop!.twists!) {
        if (x.id === 'buyer') expect(x.crop).not.toBe('carrot');
        if (x.id === 'glut') expect(x.crop).toBe('carrot');
      }
    }
    // Across 40 runs every twist shows up.
    expect(seen.size).toBe(BOONS.length + HITCHES.length);
  });

  it('each twist does what it says, and the previews count it', () => {
    calm();
    const night = (tw: Twist | null, set: (s: RunState) => void, hand: CardId[] = ['radish']) => {
      const s = table(hand, { year: 2 });
      s.twist = tw;
      set(s);
      return { s, hs: harvests(endDay(s)) };
    };
    const lettuce = (s: RunState, i: number, uid: number) => (s.plots[i].crop = crop(uid, 'lettuce', 2, 2));
    // A buyer pays double for its crop, and only its crop; a glut halves it.
    const buy = night({ id: 'buyer', crop: 'lettuce' }, (s) => {
      lettuce(s, 0, 1);
      s.plots[15].crop = crop(2, 'carrot', 2, 2);
    });
    expect(buy.hs.find((h) => h.kind === 'lettuce')!.score).toBe(8);
    expect(buy.hs.find((h) => h.kind === 'carrot')!.score).toBe(5);
    expect(night({ id: 'glut', crop: 'lettuce' }, (s) => lettuce(s, 0, 1)).hs[0].score).toBe(2);
    // Good company: +1 yield for each crop beside it.
    const co = night({ id: 'company' }, (s) => {
      lettuce(s, 5, 1);
      s.plots[1].crop = crop(2, 'beans', 0, 3);
      s.plots[4].crop = crop(3, 'beans', 0, 3);
    });
    expect(co.hs[0].chips.find((st) => st.icon === 'company')!.v).toBe(2);
    expect(co.hs[0].score).toBe(4 + 2 + 2 + 2);
    // Sunflowers face up, or all round, instead of the crop below them.
    const sun = (tw: Twist | null) =>
      night(tw, (s) => {
        s.plots[5].crop = crop(1, 'sunflower', 0, 3);
        s.plots[1].crop = crop(2, 'lettuce', 2, 2);
        s.plots[9].crop = crop(3, 'carrot', 2, 2);
        s.plots[4].crop = crop(4, 'radish', 1, 1);
      }).hs;
    const bloomOf = (hs: Harvest[], kind: string) => hs.find((h) => h.kind === kind)!.multTotal;
    expect([bloomOf(sun(null), 'lettuce'), bloomOf(sun(null), 'carrot'), bloomOf(sun(null), 'radish')]).toEqual([1, 3, 1]);
    expect([bloomOf(sun({ id: 'sunup' }), 'lettuce'), bloomOf(sun({ id: 'sunup' }), 'carrot')]).toEqual([3, 1]);
    // All round: the crop below still gets +2, the others beside it +1.
    expect([bloomOf(sun({ id: 'sunall' }), 'lettuce'), bloomOf(sun({ id: 'sunall' }), 'carrot'), bloomOf(sun({ id: 'sunall' }), 'radish')]).toEqual([1 + TUNING.sunAll, 3, 1 + TUNING.sunAll]);
    // Long picks: beans pick a fourth time before they leave.
    const picks = table(['radish'], { year: 2 });
    picks.twist = { id: 'picks' };
    picks.plots[0].crop = crop(1, 'beans', 3, 3, { picks: 2 });
    expect(harvests(endDay(picks))[0].leaves).toBe(false);
    expect(picks.plots[0].crop?.picks).toBe(3);
    expect(harvests(endDay(picks))[0].leaves).toBe(true);
    // Frost: nothing can be sown on the bottom row, and the preview never offers it.
    const fr = table(['radish', 'scarecrow'], { year: 2 });
    fr.twist = { id: 'frost' };
    expect(targetsFor(fr, 0).some((i) => i >= 12)).toBe(false);
    expect(targetsFor(fr, 0)).toContain(11);
    expect(playCard(fr, 0, 13)).toBeNull();
    expect(previewPlay(fr, 0, 13)).toBeNull();
    // The scarecrow is not a sowing: it still goes there.
    expect(targetsFor(fr, 1)).toContain(13);
    // The previews count the twist: a buyer's lettuce shows 8, its neighbours' company shows +1 each.
    const pv = table(['lettuce', 'radish'], { year: 2 });
    pv.twist = { id: 'buyer', crop: 'lettuce' };
    pv.day = 3;
    expect(previewPlay(pv, 0, 5)!.harvest!.score).toBe(8);
    // The buyer's x2 is the lettuce's own, not a bonus from the plot it is aimed at: no x2 chip on it.
    expect(previewPlay(pv, 0, 5)!.marks.find((m) => m.plot === 5)?.times ?? 1).toBe(1);
    const pc = table(['radish'], { year: 2 });
    pc.twist = { id: 'company' };
    pc.plots[1].crop = crop(9, 'lettuce', 1, 2);
    pc.plots[6].crop = crop(10, 'beans', 0, 3);
    const marks = previewPlay(pc, 0, 5)!;
    // The radish: 2, +1 for each crop beside it, +2 from the beans.
    expect(marks.harvest!.score).toBe(2 + 2 + 2);
    // The lettuce, pulled tonight with it, gains +1; the beans, pulled after the radish is gone, show it greyed.
    expect(marks.marks.find((m) => m.plot === 1)?.yield).toBe(1);
    expect(marks.marks.find((m) => m.plot === 6)?.lost?.yield).toBe(1);
    // A crop pulled next season does not count this season's twist.
    const late = table(['pumpkin'], { year: 2, season: 1 });
    late.twist = { id: 'buyer', crop: 'pumpkin' };
    late.day = 5;
    const lp = previewPlay(late, 0, 5)!.harvest!;
    expect(lp.late).toBe(true);
    expect(lp.score).toBe(60);
  });

  it('a calm season brings no new pests, and a season of crows brings them twice as often', () => {
    const pests = (tw: Twist | null) => {
      let n = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const s = table(['radish'], { year: 2, season: 2, seed });
        s.twist = tw;
        for (let i = 0; i < 16; i++) s.plots[i].crop = crop(100 + i, 'pumpkin', 0, 5);
        for (let d = 0; d < 5; d++) endDay(s);
        n += s.stats.pests;
      }
      return n;
    };
    expect(pests(null)).toBeGreaterThan(10);
    expect(pests({ id: 'calm' })).toBe(0);
    const crows = (tw: Twist | null) => {
      let n = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const s = table(['radish'], { year: 2, season: 1, seed });
        s.twist = tw;
        for (let d = 0; d < 5; d++) endDay(s);
        n += s.stats.crows;
      }
      return n;
    };
    expect(crows({ id: 'crows' })).toBeGreaterThan(crows(null) * 1.5);
  });

  it('new stock never runs dry: with every card in the catalogue the merchant brings improved stock, laid on the year\'s first tray', () => {
    const meta = newMeta();
    meta.unlocked = [...UNLOCK_ORDER];
    const { s } = newRun(6, meta);
    s.season = 3;
    toStall(s);
    const ev = leaveShop(s)!;
    const stock = ev.find((e): e is Extract<Ev, { t: 'stock' }> => e.t === 'stock')!;
    expect(stock).toBeTruthy();
    expect(stock.cards).toHaveLength(0);
    expect(stock.select).toHaveLength(TUNING.newStock);
    for (const c of stock.select) expect(c).not.toBe('radish');
    // The stall after year 2 spring lays them out, improved, at a little more.
    toStall(s);
    for (const c of stock.select) {
      const o = s.shop!.cards.find((x) => x.card === c)!;
      expect(o).toBeTruthy();
      expect(o.up).toBe(true);
      expect(o.price).toBeGreaterThan(Math.round(PRICE[CARDS[c].rarity] * 1.5));
    }
    // Bought, it comes improved.
    s.coins = 1e6;
    const i = s.shop!.cards.findIndex((x) => x.up);
    buyCard(s, i);
    expect(s.draw.at(-1)).toMatchObject({ id: s.shop!.cards[i].card, up: true });
    // The next year brings two more, again.
    s.season = 3;
    leaveShop(s);
    toStall(s);
    leaveShop(s);
    expect(s.year).toBe(3);
    expect(s.stock).toHaveLength(TUNING.newStock);
    // With locked cards left it is those first, laid on the year's first tray too.
    const t = newRun(6, null).s;
    t.season = 3;
    toStall(t);
    const ev2 = leaveShop(t)!;
    const st2 = ev2.find((e): e is Extract<Ev, { t: 'stock' }> => e.t === 'stock')!;
    expect(st2.cards).toHaveLength(TUNING.newStock);
    toStall(t);
    for (const c of st2.cards) expect(t.shop!.cards.some((x) => x.card === c)).toBe(true);
  });

  it('the spent lesson waits for a card with no use today and goes away once there is none; the crow names only a scarecrow in hand', () => {
    const learn = newLearn();
    learn.done = ['sow', 'lantern', 'peg', 'stakes', 'companion', 'bloom', 'newcard', 'scoops', 'saved', 'tin', 'can', 'weather'];
    learn.cards = ['radish', 'carrot', 'lettuce', 'beans', 'strawberry', 'sunflower', 'can'];
    // Guided day 6: the sunflower, the lettuce and a radish, each with a job and the scoops to pay.
    const s = table(['sunflower', 'lettuce', 'radish'], { energy: 5 });
    s.day = 6;
    const t = new Tutor(learn);
    expect(t.update(s, 'touch', null, 0.1, false).line?.id).not.toBe('spent');
    // A card the scoops cannot pay for is spare: now it comes.
    s.energy = 1;
    expect(t.update(s, 'touch', null, 0.1, false).line?.id).toBe('spent');
    // Played out (the hand empty): it goes away, unfinished, and is not marked done.
    s.hand = [];
    expect(t.update(s, 'touch', null, 0.1, false).line?.id).not.toBe('spent');
    expect(t.learn.done).not.toContain('spent');
    // The first crow with the scarecrow still in the tin does not ask to set it out (it cannot be, today).
    const c = table(['radish'], { season: 2 });
    c.crow = true;
    c.draw = c.draw.filter((x) => x.id !== 'scarecrow');
    c.draw.push({ uid: 993, id: 'scarecrow', up: false });
    const line = new Tutor({ ...learn, done: [...learn.done, 'spent'] }).update(c, 'touch', null, 0.1, false).line!;
    expect(line.id).toBe('crows');
    expect(line.text).not.toMatch(/set out/i);
  });

  it('a won run goes in the record of wins with the build that won it; the copy is plain', () => {
    const { s } = newRun(9, null);
    s.year = 3;
    s.season = 3;
    s.quota = 10;
    s.pages = ['cellar', 'bees'];
    s.plots[0].crop = crop(1, 'carrot', 2, 2);
    s.plots[1].crop = crop(2, 'radish', 1, 1);
    endDay(s);
    expect(s.end!.won).toBe(true);
    const meta = newMeta();
    recordRun(meta, s, UNLOCK_ORDER);
    expect(meta.winLog).toHaveLength(1);
    expect(meta.winLog![0]).toMatchObject({ run: 1, coins: s.stats.totalEarned, pages: ['cellar', 'bees'] });
    expect(meta.winLog![0].top[0]).toBe('carrot');
    // The fifth playtest's copy: no 27-word page with a parenthetical, no "blooms gets", a reason to want mint.
    for (const p of Object.values(PAGES)) {
      expect(p.text.split(/\s+/).length).toBeLessThanOrEqual(13);
      expect(p.text).not.toMatch(/[()]/);
    }
    expect(PAGES.bees.text).not.toMatch(/blooms gets/);
    expect(CARDS.mint.text).toMatch(/free/i);
  });
});

describe('round 6: twists that trade, a gentler guided summer, fixed year 3 rows, a scoop only for a bench that runs short', () => {
  const crop = (uid: number, kind: Crop['kind'], age: number, days: number, extra: Partial<Crop> = {}): Crop => ({ uid, kind, age, days, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false, ...extra });
  /** Meet every day of this season (and any before the stall). */
  function toStall(s: RunState): void {
    for (let g = 0; g < 10 && s.phase === 'day'; g++) {
      s.earned = Math.max(s.earned, s.quota);
      endDay(s);
    }
  }
  /** Leave the stall with the twist that helps picked, so a quota is the plain row. */
  function leaveHelped(s: RunState): void {
    const tw = s.shop?.twists;
    if (tw?.length) chooseTwist(s, tw.findIndex((t) => BOONS.includes(t.id)));
    leaveShop(s);
  }
  const calm = () => {
    const was = [TUNING.pestChance, TUNING.crowChance] as const;
    TUNING.pestChance = [0];
    TUNING.crowChance = [0];
    onTestFinished(() => {
      [TUNING.pestChance, TUNING.crowChance] = was;
    });
  };

  it('a hitch pays for itself: it takes its share off the season\'s quota, and the stall says what it would ask before the pick', () => {
    // Picked, a hitch asks less than the plain row; the help asks the plain row (round 5's hitches gave nothing back).
    for (let seed = 1; seed <= 8; seed++) {
      for (const kind of ['hitch', 'help']) {
        const { s } = newRun(seed, null);
        s.season = 3;
        toStall(s);
        chooseTwist(s, s.shop!.twists!.findIndex((t) => (kind === 'hitch' ? HITCHES : BOONS).includes(t.id)));
        leaveShop(s);
        if (kind === 'hitch') expect(s.quota).toBeLessThan(quotaFor(2, 0, s.pages));
        else expect(s.quota).toBe(quotaFor(2, 0, s.pages));
      }
    }
    for (const id of HITCHES) expect(twistEase({ id })).toBeGreaterThan(0.05);
    for (const id of BOONS) expect(twistEase({ id })).toBe(0);
    for (let seed = 1; seed <= 8; seed++) {
      const { s } = newRun(seed, null);
      s.season = 3;
      toStall(s);
      const tw = s.shop!.twists!;
      const hi = tw.findIndex((t) => HITCHES.includes(t.id));
      const plain = quotaFor(2, 0, s.pages);
      // Nothing picked yet: the stall's head says the plain quota; each clipping knows what it would ask.
      expect(nextQuota(s)).toBe(plain);
      const eased = twistQuota(s, tw[hi]);
      expect(eased).toBe(Math.round((plain * (1 - twistEase(tw[hi]))) / 10) * 10);
      expect(eased).toBeLessThan(plain);
      expect(twistQuota(s, tw[1 - hi])).toBe(plain);
      // Picked, the head follows it, and the season asks it.
      chooseTwist(s, hi);
      expect(nextQuota(s)).toBe(eased);
      leaveShop(s);
      expect(s.twist!.id).toBe(tw[hi].id);
      expect(s.quota).toBe(eased);
      expect(s.stats.log.length).toBeGreaterThan(0);
    }
    // The help asks the plain quota.
    const h = newRun(2, null).s;
    h.season = 3;
    toStall(h);
    leaveHelped(h);
    expect(h.quota).toBe(quotaFor(2, 0, h.pages));
  });

  it('the bot\'s pick follows its deck and plot, not the kind of twist: a hitch at some stalls, a help at others', () => {
    let hitch = 0;
    let help = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const { s } = newRun(seed, null);
      s.season = 3;
      toStall(s);
      botTwist(s, seed);
      const t = s.shop!.twists![s.shop!.twist ?? 0];
      if (HITCHES.includes(t.id)) hitch++;
      else help++;
    }
    // Round 5 scored every help above every hitch: the bot, like the sixth playtest, never took a hitch.
    expect(hitch).toBeGreaterThan(0);
    expect(help).toBeGreaterThan(0);
  });

  it('the guided run\'s summer, its first season on its own, asks 180, not 230', () => {
    const g = newRun(4, null, true).s;
    expect(g.quota).toBe(TUNING.guidedQuota);
    toStall(g);
    leaveShop(g);
    expect(g.season).toBe(1);
    expect(g.quota).toBe(180);
    // Autumn keeps the guided year's 88%, and asks more than summer: no cliff, no dip.
    toStall(g);
    leaveShop(g);
    expect(g.quota).toBe(Math.round((TUNING.quotas[2] * TUNING.firstYear) / 10) * 10);
    expect(g.quota).toBeGreaterThan(180);
    // Its year 2 asks a share less than the raised row, about round 5's.
    for (let k = 0; k < 3; k++) {
      toStall(g);
      leaveHelped(g);
    }
    expect([g.year, g.season]).toEqual([2, 1]);
    expect(g.quota).toBe(Math.round((TUNING.quotas2[1] * TUNING.guidedYear2) / 10) * 10);
    expect(g.quota).toBeLessThan(TUNING.quotas2[1]);
    // A run that is not guided asks the usual summer.
    const n = newRun(4, null).s;
    toStall(n);
    leaveShop(n);
    expect(n.quota).toBe(TUNING.quotas[1]);
  });

  it('year 3 is a fixed row that grows through the year: what the run earned in year 2 never raises it', () => {
    calm();
    const into3 = (take: number, coins: number) => {
      const s = table(['radish'], { year: 2, season: 3 });
      s.stats.log = [0, 1, 2, 3].map((season) => ({ year: 2, season: season as 0 | 1 | 2 | 3, earned: take, quota: 400, cleared: true, carried: 0 }));
      s.stats.totalEarned = take * 4;
      s.coins = coins;
      const q: number[] = [];
      for (let k = 0; k < 4; k++) {
        toStall(s);
        leaveHelped(s);
        q.push(s.quota);
      }
      expect(s.year).toBe(3);
      return q;
    };
    // The sixth playtest's year 2 took 1,064, 1,788 and 2,311, and every year 3 quota went to a flat 1,550.
    const weak = into3(500, 100);
    const strong = into3(2300, 20000);
    expect(strong).toEqual(weak);
    expect(weak).toEqual(TUNING.quotas3);
    for (let k = 1; k < 4; k++) expect(TUNING.quotas3[k]).toBeGreaterThan(TUNING.quotas3[k - 1]);
    // A step up from year 2 winter, not a cliff.
    expect(TUNING.quotas3[0]).toBeGreaterThan(TUNING.quotas2[3]);
    expect(TUNING.quotas3[0]).toBeLessThan(TUNING.quotas2[3] * 1.3);
    // Year 2 asks more of a built plot from summer.
    for (let k = 1; k < 4; k++) expect(TUNING.quotas2[k]).toBeGreaterThan(TUNING.quotas2[k - 1]);
  });

  it('a scoop for good is sold only when last season\'s bench had few to spare', () => {
    calm();
    /** A season of six days, leaving this many scoops on the bench at each dusk, then the stall. */
    const season = (s: RunState, left: number) => {
      for (let g = 0; g < 10 && s.phase === 'day'; g++) {
        s.energy = left;
        s.earned = Math.max(s.earned, s.quota);
        endDay(s);
      }
    };
    const { s } = newRun(3, null);
    s.year = 2;
    // Three scoops a day sat unused (the sixth playtest: 3 to 6 most days, then a 3,200-coin scoop): none for sale.
    season(s, 3);
    expect(s.phase).toBe('shop');
    s.coins = 100000;
    expect(buyScoop(s)).toBeNull();
    expect(s.stats.log.at(-1)!.idle).toBe(3);
    expect(scoopOnSale(s)).toBe(false);
    // A bench spent to the last scoop most days: scoops for sale, each twice the last, four at most.
    leaveShop(s);
    season(s, 0);
    s.coins = 100000;
    expect(scoopOnSale(s)).toBe(true);
    const e0 = energyMax(s);
    for (let k = 0; k < TUNING.maxScoops; k++) expect(buyScoop(s)).not.toBeNull();
    expect(buyScoop(s)).toBeNull();
    expect(energyMax(s)).toBe(e0 + TUNING.maxScoops);
    // Even one scoop a day to spare: none for sale.
    const t = newRun(4, null).s;
    t.year = 2;
    season(t, 1);
    t.coins = 100000;
    expect(buyScoop(t)).toBeNull();
  });

  it('a held seed shows what a neighbour it changes will pay now; the improve note counts the Root Cellar', () => {
    calm();
    const s = table(['radish']);
    s.pages = ['cellar'];
    s.plots[5].crop = crop(901, 'carrot', 1, 2);
    s.plots[4].crop = crop(902, 'radish', 0, 1);
    const p = previewPlay(s, 0, 6)!;
    const m = p.marks.find((x) => x.plot === 5)!;
    expect(m.bloom).toBe(1);
    // The new seed's own pay is the slip, not a mark's total; the carrot's total is what the night pays it.
    expect(p.marks.find((x) => x.plot === 6)?.total).toBeUndefined();
    play(s, 'radish', 6);
    expect(m.total).toBe(harvests(endDay(s)).find((h) => h.kind === 'carrot')!.score);
    // "Carrot: basket 5 to 8" ignored the Root Cellar's +2, which the face prints.
    expect(upgradeNote('carrot', ['cellar'])).toBe('Basket 7 to 10.');
    expect(upgradeNote('carrot')).toBe('Basket 5 to 8.');
    expect(upgradeNote('beans', ['cellar'])).toBe('Basket 3 to 5.');
  });
});
