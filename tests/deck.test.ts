// Seedbound's rules: the day, the board, the scoring cascade, hazards, the
// shop, meta unlocks and determinism.
import { describe, expect, it, onTestFinished } from 'vitest';
import { cloneRun, Dice, playRun, botDay, botShop } from '../src/games/deck/bot';
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
  leaveShop,
  newMeta,
  GUIDED_DEALS,
  newRun,
  playCard,
  previewPlay,
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
  type CardId,
  type Ev,
  type Harvest,
  type RunState,
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
    const s = table(['radish', 'radish'], { energy: 3 });
    play(s, 'radish', 5);
    expect(s.energy).toBe(2);
    expect(s.plots[5].crop?.kind).toBe('radish');
    expect(s.discard.at(-1)?.id).toBe('radish');
    expect(playCard(s, 0, 5)).toBeNull();
    expect(targetsFor(s, 0)).not.toContain(5);
  });

  it('refuses a card without the energy', () => {
    const s = table(['corn'], { energy: 1 });
    expect(playCard(s, 0, 0)).toBeNull();
  });

  it('the watering can boosts a row for tonight; upgraded, a row and a column', () => {
    const s = table(['can', 'can']);
    play(s, 'can', 5);
    expect(s.plots.map((p) => p.boost)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    s.hand[0].up = true;
    play(s, 'can', 2);
    expect([2, 6, 10, 14, 0, 1, 3].every((i) => s.plots[i].boost >= 1)).toBe(true);
    expect(s.plots[6].boost).toBe(2);
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

  it('sunflowers and beehives add bloom; Busy Bees doubles it', () => {
    const s = table(['sunflower', 'lettuce', 'beehive']);
    play(s, 'sunflower', 0);
    play(s, 'lettuce', 1);
    play(s, 'beehive', 6);
    s.plots[1].crop!.age = 2;
    const h = harvests(endDay(s));
    expect(h[0].kind).toBe('lettuce');
    expect(h[0].chipsTotal).toBe(8);
    expect(h[0].multTotal).toBe(3);
    const t = table(['sunflower', 'lettuce']);
    t.pages.push('bees');
    play(t, 'sunflower', 0);
    play(t, 'lettuce', 1);
    t.plots[1].crop!.age = 2;
    expect(harvests(endDay(t))[0].multTotal).toBe(3);
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

  it('pests stop growth, garlic keeps them off, ladybirds clear them', () => {
    const s = table(['carrot', 'garlic', 'carrot', 'ladybirds'], { season: 1 });
    play(s, 'carrot', 0);
    play(s, 'garlic', 5);
    play(s, 'carrot', 6);
    s.plots[0].crop!.pest = 2;
    TUNING.pestSpread = 1;
    endDay(s);
    TUNING.pestSpread = 0.4;
    expect(s.plots[0].crop!.age).toBe(0);
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

  it('pests on a crop hold it back for exactly the nights they show: no growth and no pick', () => {
    const s = table(['strawberry', 'carrot'], { season: 1 });
    play(s, 'strawberry', 0);
    play(s, 'carrot', 15);
    s.plots[0].crop!.age = 3;
    s.plots[0].crop!.pest = 1;
    s.plots[15].crop!.pest = 2;
    const was = TUNING.pestChance;
    TUNING.pestChance = [0];
    TUNING.pestSpread = 0;
    // One night of pests on a ripe strawberry: not picked tonight (the old rules picked it).
    expect(harvests(endDay(s)).map((h) => h.kind)).toEqual([]);
    expect(s.plots[0].crop!.pest).toBe(0);
    expect(s.plots[15].crop!.age).toBe(0);
    expect(harvests(endDay(s)).map((h) => h.kind)).toEqual(['strawberry']);
    // Two nights on the carrot: it stood still both nights, then grows.
    expect(s.plots[15].crop!.age).toBe(0);
    expect(s.plots[15].crop!.pest).toBe(0);
    endDay(s);
    TUNING.pestChance = was;
    TUNING.pestSpread = 0.4;
    expect(s.plots[15].crop!.age).toBe(1);
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
      const { s } = newRun(seed, null);
      s.earned = s.quota;
      toSeasonEnd(s);
      expect(s.shop!.cards.some((c) => CARDS[c.card].type === 'seed')).toBe(true);
      // Pests have landed and the player has no ladybirds or garlic: the next stall has one.
      s.stats.pests = 1;
      s.stats.crows = 1;
      s.coins = 1000;
      reroll(s);
      const ids = s.shop!.cards.map((c) => c.card);
      expect(ids.includes('ladybirds') || ids.includes('garlic')).toBe(true);
      expect(ids).toContain('scarecrow');
      // Once the player owns a scarecrow, it is no longer held back for them.
      s.draw.push({ uid: 5000, id: 'scarecrow', up: false });
      s.draw.push({ uid: 5001, id: 'ladybirds', up: false });
      let scarecrows = 0;
      for (let k = 0; k < 10; k++) {
        reroll(s);
        s.coins = 1000;
        if (s.shop!.cards.some((c) => c.card === 'scarecrow')) scarecrows++;
      }
      expect(scarecrows).toBeLessThan(10);
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
    const e0 = energyMax(s);
    // Four scoops for good, each twice the last: a sink for late coins that the bench now lays out at any count.
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

  it('only shops from the unlocked pool', () => {
    const { s } = newRun(9, null);
    for (let k = 0; k < 30; k++) {
      s.earned = s.quota;
      toSeasonEnd(s);
      for (const c of s.shop!.cards) expect(s.pool).toContain(c.card);
      s.coins = 100;
      reroll(s);
      for (const c of s.shop!.cards) expect(s.pool).toContain(c.card);
      leaveShop(s);
    }
    expect(s.pool).not.toContain('pumpkin');
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
  });

  it('is reproducible', () => {
    expect(JSON.stringify(playRun(77, null, { noise: 0.1, seed: 2 }))).toBe(JSON.stringify(playRun(77, null, { noise: 0.1, seed: 2 })));
  });
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
    expect(s.energy).toBe(3);
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
    expect(p.marks).toContainEqual({ plot: 5, yield: 0, bloom: 1, times: 1, nights: 0 });
    play(s, 'radish', 6);
    expect(harvests(endDay(s)).find((x) => x.kind === 'carrot')!.score).toBe(10);
  });

  it('a seed that ripens after the season ends previews as paying next season, its bonuses counted', () => {
    // The plot carries over: a lettuce sown on day 6 beside a sunflower is pulled on next season's first night, the sunflower still standing.
    const s = table(['sunflower', 'lettuce']);
    s.day = 6;
    play(s, 'sunflower', 5);
    const p = previewPlay(s, 0, 6)!;
    expect(p.harvest).toEqual({ yield: 8, bloom: 2, score: 16, late: true });
    expect(p.marks.every((m) => !m.lost)).toBe(true);
    expect(p.marks).toContainEqual({ plot: 6, yield: 4, bloom: 1, times: 1, nights: 0 });
  });

  it('the can and rain show extra nights, the sun shows yield on crops pulled tonight', () => {
    const s = table(['pumpkin', 'radish', 'can', 'rain', 'sun']);
    play(s, 'pumpkin', 0);
    play(s, 'radish', 15);
    expect(previewPlay(s, 0, 1)!.marks).toEqual([{ plot: 0, yield: 0, bloom: 0, times: 1, nights: 1 }]);
    expect(previewPlay(s, 1, null)!.marks.map((m) => m.plot)).toEqual([0]);
    const sun = previewPlay(s, 2, null)!.marks;
    expect(sun).toEqual([{ plot: 15, yield: 3, bloom: 0, times: 1, nights: 0 }]);
  });

  it('the forecast knows when each crop is pulled and leaves, pests included', () => {
    const s = table(['carrot', 'strawberry', 'radish']);
    play(s, 'carrot', 0);
    play(s, 'strawberry', 1);
    play(s, 'radish', 2);
    s.plots[0].crop!.pest = 2;
    const f = forecast(s);
    expect(f[2]).toEqual({ ripeIn: 0, pull: 0, leave: 0, late: false });
    // Two nights held back, then two to grow.
    expect(f[0]).toEqual({ ripeIn: 3, pull: 3, leave: 3, late: false });
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

  it('hazard lessons only name a card the player owns, and the crow comes up at dawn', () => {
    const s = table(['radish'], { season: 1 });
    s.plots[3].crop = { uid: 700, kind: 'carrot', age: 0, days: 2, up: false, compost: 0, rot: false, picks: 0, pest: 2, sprout: false };
    for (const own of [[], ['garlic'], ['ladybirds']] as CardId[][]) {
      const c = cloneRun(s);
      c.draw = c.draw.filter((x) => x.id !== 'ladybirds' && x.id !== 'garlic' && x.id !== 'scarecrow');
      for (const id of own) c.draw.push({ uid: 900 + c.draw.length, id, up: false });
      const line = tutor().update(c, 'touch', null, 0.1, false).line!;
      expect(line.id).toBe('pests');
      if (!own.length) expect(line.text).not.toMatch(/ladybird|garlic/i);
      else expect(line.text.toLowerCase()).toContain(own[0]);
    }
    const c = cloneRun(s);
    c.plots[3].crop = null;
    c.crow = true;
    c.draw = c.draw.filter((x) => x.id !== 'scarecrow');
    expect(tutor().update(c, 'touch', null, 0.1, false).line!.text).not.toMatch(/scarecrow/i);
    c.draw.push({ uid: 990, id: 'scarecrow', up: false });
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
    // And the strawberry picks on the new season's first night, for the new season's quota.
    const h = harvests(endDay(s));
    expect(h.map((x) => x.kind)).toEqual(['strawberry']);
    expect(s.earned).toBe(h[0].score);
  });

  it('a crop pulled next season pays what its preview said, and the plot stands through the year turn too', () => {
    const was = [TUNING.pestChance, TUNING.crowChance];
    TUNING.pestChance = [0];
    TUNING.crowChance = [0];
    onTestFinished(() => {
      [TUNING.pestChance, TUNING.crowChance] = was;
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
  });
});

describe('quotas after the playtest', () => {
  it('year 1 summer to winter ask more than they did (the tester ran at 1.4 to 1.55 times them), and no year turn is a cliff', () => {
    // The shipped quotas before: summer 165, autumn 185, winter 220. The plot carrying over lifts takes, so they rise at least 15%.
    expect(quotaFor(1, 1, [])).toBeGreaterThanOrEqual(Math.round(165 * 1.15));
    expect(quotaFor(1, 2, [])).toBeGreaterThanOrEqual(Math.round(185 * 1.15));
    expect(quotaFor(1, 3, [])).toBeGreaterThanOrEqual(Math.round(220 * 1.15));
    // Spring of year 1 stays where the first round left it: the real puzzle.
    expect(quotaFor(1, 0, [])).toBe(160);
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
    s.pages = (['barrel', 'cellar', 'bees', 'thumb', 'basket', 'rotation', 'market', 'clover', 'furrow', 'coldframe'] as const).filter((p) => !offered.includes(p)).slice(0, 5);
    s.coins = 100000;
    expect(maxPages(s)).toBe(5);
    expect(canBuySlot(s)).toBe(true);
    const first = slotPrice(s);
    expect(buySlot(s)).not.toBeNull();
    expect(maxPages(s)).toBe(6);
    // Room now: the next page is pinned without tearing one out.
    expect(buyPage(s, 0)).not.toBeNull();
    expect(s.pages.length).toBe(6);
    expect(slotPrice(s)).toBe(first * 2);
    // Not while there is still room.
    s.slots = 1;
    s.pages = s.pages.slice(0, 5);
    expect(canBuySlot(s)).toBe(false);
  });
});
