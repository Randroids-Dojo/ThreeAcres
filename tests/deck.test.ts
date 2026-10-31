// Seedbound's rules: the day, the board, the scoring cascade, hazards, the
// shop, meta unlocks and determinism.
import { describe, expect, it } from 'vitest';
import { cloneRun, Dice, playRun, botDay, botShop } from '../src/games/deck/bot';
import {
  allCards,
  buyCard,
  buyPage,
  CARDS,
  endDay,
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
    const was = TUNING.crowChance;
    TUNING.crowChance = [1];
    const s = table(['strawberry', 'scarecrow'], { season: 2 });
    play(s, 'strawberry', 0);
    play(s, 'scarecrow', 5);
    s.plots[0].crop!.age = 3;
    const ev = endDay(s);
    TUNING.crowChance = was;
    expect(ev.some((e) => e.t === 'crow')).toBe(false);
    expect(harvests(ev).length).toBe(1);
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
    expect(s.shop!.cards.length).toBe(3);
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
  it('a finished run unlocks two cards once, and keeps a best record', () => {
    const meta = newMeta();
    const { s } = newRun(3, meta);
    while (s.phase === 'day') endDay(s);
    expect(recordRun(meta, s, UNLOCK_ORDER)).toEqual(UNLOCK_ORDER.slice(0, 2));
    expect(recordRun(meta, s, UNLOCK_ORDER)).toEqual(UNLOCK_ORDER.slice(0, 2));
    expect(meta.unlocked).toEqual(UNLOCK_ORDER.slice(0, 2));
    expect(meta.runs).toBe(1);
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
    expect(s.hand.length).toBe(5);
    expect(allCards(s).length).toBe(START_DECK.length);
    expect(s.script.length).toBe(0);
  });

  it('is deterministic, and a normal run is untouched by it', () => {
    expect(JSON.stringify(newRun(5, null, true).s)).toBe(JSON.stringify(newRun(5, null, true).s));
    expect(newRun(5, null).s.script).toEqual([]);
  });
});

describe('previews', () => {
  it('a radish held next to a carrot shows its +2 and the carrot +1 bloom, and touches nothing', () => {
    const s = table(['carrot', 'radish']);
    play(s, 'carrot', 5);
    const before = JSON.stringify(s);
    const p = previewPlay(s, 0, 6)!;
    expect(p.harvest).toEqual({ yield: 4, bloom: 1, score: 4 });
    expect(p.marks).toContainEqual({ plot: 6, yield: 2, bloom: 0, times: 1, nights: 0 });
    expect(p.marks).toContainEqual({ plot: 5, yield: 0, bloom: 1, times: 1, nights: 0 });
    expect(previewPlay(s, 0, 15)!.marks).toEqual([]);
    expect(JSON.stringify(s)).toBe(before);
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
});
