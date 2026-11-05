// Seedbound, round 7: an engine to pick at a run's first stall, each with a page that multiplies it; twists aimed at
// what the run relies on and priced for it; Green Thumb only for a bench that ran short; the toss lesson only for a
// card with nowhere to go; the coins a watered crop will pay tonight; a crow takes a perennial's pick that night; the
// guided spring's last day matters. Each test fails on round 6 (a `git archive` copy) on an assertion.
import { describe, expect, it, onTestFinished } from 'vitest';
import { botDay, botShop, Dice } from '../src/games/deck/bot';
import { spareCard } from '../src/games/deck/lessons';
import * as R from '../src/games/deck/rules';
import { allCards, CARDS, endDay, HITCHES, leaveShop, newMeta, newRun, PAGES, playCard, previewPlay, TUNING, type CardId, type Crop, type Harvest, type RunState } from '../src/games/deck/rules';

/** Round 7's calls, read loosely so this file runs (and fails on assertions) against round 6. */
type Aim = { t: R.Twist; v: number };
const X = R as unknown as {
  ENGINES?: Record<string, { page: R.PageId; gift: CardId[]; cards: CardId[] }>;
  chooseEngine?: (s: RunState, i: number) => unknown;
  hitchAims?: (s: RunState) => Aim[];
  pageOnSale?: (s: RunState, id: R.PageId) => boolean;
};

const crop = (uid: number, kind: Crop['kind'], age: number, days: number, extra: Partial<Crop> = {}): Crop => ({ uid, kind, age, days, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false, ...extra });

function table(hand: CardId[], opts: { season?: 0 | 1 | 2 | 3; year?: number; energy?: number; seed?: number } = {}): RunState {
  const { s } = newRun(opts.seed ?? 7, null);
  s.season = opts.season ?? 0;
  s.year = opts.year ?? 1;
  s.draw.push(...s.hand);
  s.hand = hand.map((id) => ({ uid: s.nextUid++, id, up: false }));
  s.energy = opts.energy ?? 20;
  return s;
}

const harvests = (ev: R.Ev[]): Harvest[] => ev.filter((e): e is Extract<R.Ev, { t: 'harvest' }> => e.t === 'harvest').map((e) => e.h);

const calm = () => {
  const was = [TUNING.pestChance, TUNING.crowChance] as const;
  TUNING.pestChance = [0];
  TUNING.crowChance = [0];
  onTestFinished(() => {
    [TUNING.pestChance, TUNING.crowChance] = was;
  });
};

/** Meet every day of the season without playing (the stall opens). */
function toStall(s: RunState): void {
  for (let g = 0; g < 10 && s.phase === 'day'; g++) {
    s.earned = Math.max(s.earned, s.quota);
    endDay(s);
  }
}

describe('round 7: an engine at every run\'s first stall', () => {
  it('a run\'s first stall offers engines (round 9: all four), each a card and the page that multiplies it; later stalls offer none', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 24; seed++) {
      for (const guided of [false, true]) {
        const { s } = newRun(seed, null, guided);
        toStall(s);
        const offer = (s.shop as R.Shop & { engines?: string[] }).engines;
        expect(offer, 'the first stall offers engines').toBeDefined();
        expect(offer).toHaveLength(TUNING.engineChoices);
        expect(new Set(offer).size).toBe(TUNING.engineChoices);
        for (const id of offer!) seen.add(id);
        // Pick the second: it goes home with the run, free.
        const coins = s.coins;
        const e = X.ENGINES![offer![1]];
        const tin = allCards(s).length;
        expect(X.chooseEngine?.(s, 1)).toBeTruthy();
        leaveShop(s);
        expect(s.coins).toBe(coins);
        expect(allCards(s).length).toBe(tin + e.gift.length);
        for (const c of e.gift) expect(allCards(s).some((x) => x.id === c)).toBe(true);
        expect(s.pages).toContain(e.page);
        // Its cards join the run's stock even while the catalogue holds them locked (beehive, chili and corn are).
        for (const c of e.cards) expect(s.pool).toContain(c);
        // The next stall offers no engine, and its tray keeps one of the engine's cards in stock.
        toStall(s);
        expect((s.shop as R.Shop & { engines?: string[] }).engines).toBeUndefined();
        expect(s.shop!.cards.some((o) => e.cards.includes(o.card))).toBe(true);
      }
    }
    // Across runs, every engine is offered.
    expect(seen.size).toBe(4);
  }, 30000);

  it('each engine\'s page multiplies it', () => {
    calm();
    const night = (pages: R.PageId[], set: (s: RunState) => void) => {
      const s = table(['radish'], { year: 2 });
      s.pages = pages;
      set(s);
      return harvests(endDay(s));
    };
    // Busy Bees: a crop near a beehive gets +1 bloom and x1.5; a second hive beside it adds no more (they stacked
    // without end: the seventh playtest's beehive nights paid 150 to 320). Round 10: a lettuce, since the engine pages
    // leave radishes and carrots out.
    const hive = (pages: R.PageId[], hives: number[]) =>
      night(pages, (s) => {
        for (const h of hives) s.plots[h].obj = 'beehive';
        s.plots[5].crop = crop(1, 'lettuce', 2, 2);
      })[0];
    expect(hive([], [0]).score).toBe(8);
    expect(hive(['bees'], [0]).score).toBe(Math.round(8 * TUNING.beesTimes));
    expect(hive(['bees'], [0, 2]).score).toBe(Math.round(8 * TUNING.beesTimes));
    // A crop below a sunflower and near no hive gets no Busy Bees (round 7: it reached the sunflower's crop too).
    const sun = night(['bees'], (s) => {
      s.plots[1].crop = crop(1, 'sunflower', 0, 3);
      s.plots[5].crop = crop(2, 'carrot', 2, 2);
    }).find((h) => h.kind === 'carrot')!;
    expect(sun.mult.some((st) => st.icon === 'bees')).toBe(false);
    // Hot Beds: a chili stays and picks for three nights, its x1.5 with it.
    const hot = table(['radish'], { year: 2 });
    hot.pages = ['hot' as R.PageId];
    hot.plots[0].crop = crop(1, 'chili', 2, 2);
    hot.plots[1].crop = crop(2, 'carrot', 2, 2);
    const h1 = harvests(endDay(hot));
    expect(h1.find((h) => h.kind === 'chili')!.leaves).toBe(false);
    expect(h1.find((h) => h.kind === 'carrot')!.score).toBe(Math.round(5 * 1.5));
    expect(hot.plots[0].crop?.kind).toBe('chili');
    expect(harvests(endDay(hot)).find((h) => h.kind === 'chili')!.leaves).toBe(false);
    expect(harvests(endDay(hot)).find((h) => h.kind === 'chili')!.leaves).toBe(true);
    // Without it a chili is pulled up on its first pick.
    const plain = table(['radish'], { year: 2 });
    plain.plots[0].crop = crop(1, 'chili', 2, 2);
    expect(harvests(endDay(plain))[0].leaves).toBe(true);
    // Trellis: a crop beside beans or a strawberry gets +2 bloom (once, however many stand beside it). Round 10: a
    // lettuce (the pages leave radishes and carrots out), and beans and strawberries bloom each other (`vinesSelf`).
    const vine = (pages: R.PageId[]) =>
      night(pages, (s) => {
        s.plots[5].crop = crop(1, 'lettuce', 2, 2);
        s.plots[4].crop = crop(2, 'beans', 3, 3);
        s.plots[6].crop = crop(3, 'strawberry', 3, 3);
      });
    expect(vine([]).find((h) => h.kind === 'lettuce')!.multTotal).toBe(1);
    const vines = vine(['vines' as R.PageId]);
    expect(vines.find((h) => h.kind === 'lettuce')!.multTotal).toBe(1 + TUNING.vinesBloom * Math.min(2, TUNING.vinesCap));
    // The beans' only neighbour on the plot is the lettuce, which gives them nothing.
    expect(vines.find((h) => h.kind === 'beans')!.mult.some((st) => st.icon === 'vines')).toBe(false);
    // Tall Rows: corn gets +1 bloom for each crop beside it.
    const tall = (pages: R.PageId[]) =>
      night(pages, (s) => {
        s.plots[5].crop = crop(1, 'corn', 4, 4);
        s.plots[4].crop = crop(2, 'radish', 0, 1);
        s.plots[6].crop = crop(3, 'carrot', 0, 2);
        s.plots[9].crop = crop(4, 'lettuce', 0, 2);
      }).find((h) => h.kind === 'corn')!;
    expect(tall([]).multTotal).toBe(1);
    expect(tall(['tall' as R.PageId]).multTotal).toBe(1 + 3 * TUNING.tallBloom);
    // And corn sown with it ripens a night sooner.
    const sow = table(['corn'], { year: 2 });
    sow.pages = ['tall' as R.PageId];
    expect(playCard(sow, 0, 5)).not.toBeNull();
    expect(sow.plots[5].crop!.days).toBe(R.SEEDS.corn.days - Number(TUNING.tallFast));
    expect(sow.plots[5].crop!.days).toBeLessThan(R.SEEDS.corn.days);
    // Every engine names a real page and card.
    for (const e of Object.values(X.ENGINES ?? {})) {
      expect(PAGES[e.page]).toBeDefined();
      for (const c of [...e.gift, ...e.cards]) expect(CARDS[c]).toBeDefined();
    }
  });
});

describe('round 7: twists aimed at the run', () => {
  /** Bot-played runs to the stalls of years 2 and 3: every pair of twists offered, with the run at that stall. */
  function stalls(runs: number, f: (s: RunState) => void): void {
    for (let i = 0; i < runs; i++) {
      const meta = newMeta();
      meta.unlocked = [...R.UNLOCK_ORDER];
      const { s } = newRun(500 + i * 7919, meta, false);
      const dice = new Dice(31 + i);
      const o = { noise: 0.15, seed: 31 + i, depth: 1 };
      const was = TUNING.noEnd;
      TUNING.noEnd = true;
      onTestFinished(() => {
        TUNING.noEnd = was;
      });
      for (let g = 0; g < 400 && s.phase !== 'over' && R.seasonIndex(s) < 11; g++) {
        if (s.phase === 'shop') {
          if (s.shop?.twists?.length) f(s);
          botShop(s, o, dice);
        } else botDay(s, o, dice);
      }
    }
  }

  it('a hitch that misses the build is never offered, and a hitch takes off what it would cost this run', () => {
    let offered = 0;
    let crowsGuarded = 0;
    stalls(10, (s) => {
      const hitch = s.shop!.twists!.find((t) => HITCHES.includes(t.id))!;
      offered++;
      // What it would cost this run, from the season just played: at least the floor, and its quota cut is that.
      // Round 9: glut and frost can aim at the second crop or row too, so the aim is the one on the same crop and row.
      const aim = X.hitchAims?.(s).find((a) => a.t.id === hitch.id && a.t.crop === hitch.crop && (a.t.row ?? -1) === (hitch.row ?? -1) && a.t.page === hitch.page);
      expect(aim, `${hitch.id} is aimed`).toBeDefined();
      expect(aim!.v).toBeGreaterThanOrEqual(TUNING.minHit);
      // Round 8: the cut is what it still costs a careful player and the worth of the help beside it.
      const help = s.shop!.twists!.find((t) => !HITCHES.includes(t.id)) as R.Twist & { worth?: number };
      // Round 10: a share of the help's worth (`helpShare`), both in coins of the run's take (`takeRatio`): the help's
      // worth is kept in those coins already.
      const r = R.takeRatio(s);
      const cut = R.hitchCut(aim!, (help.worth ?? 0) / r, r);
      // Round 9: never clipped at the usual most when a pair fits it; a pair that cannot be weighed within it is cut in
      // full, up to `easeHard`.
      const hard = (TUNING as typeof TUNING & { easeHard?: number }).easeHard ?? TUNING.easeMax;
      expect(Math.abs(R.twistEase(hitch) - Math.min(hard, Math.max(TUNING.easeMin, Math.round(cut * 100) / 100)))).toBeLessThanOrEqual(0.0101);
      // Crows never come while a scarecrow stands; sunflowers facing up never come (played ahead they cost nothing).
      if (hitch.id === 'crows' && s.plots.some((p) => p.obj === 'scarecrow')) crowsGuarded++;
      expect(hitch.id).not.toBe('sunup');
      // A glut is of the crop that took the most last season (round 9: or the next, a lighter hitch), and says so:
      // "Your carrots sell for half."
      const t = s.tally!;
      if (hitch.id === 'glut') {
        const top = (Object.keys(t.kinds) as R.SeedId[]).sort((a, b) => (t.kinds[b] ?? 0) - (t.kinds[a] ?? 0)).slice(0, 3);
        expect(top).toContain(hitch.crop);
        expect(R.twistText(hitch).toLowerCase()).toContain(`your ${R.PLURALS[hitch.crop!]} sell`);
      }
      // Frost falls on the row the run's sown crops paid most from (round 9: or the next), and names the crop sown there.
      if (hitch.id === 'frost') {
        expect([...t.rows].sort((a, b) => b - a).slice(0, 3)).toContain(t.rows[hitch.row!]);
        // Round 11: the line names the row (the crop named may have moved on by then).
        expect(R.twistText(hitch)).toBe(`Frost on the ${R.ROW_NAMES[hitch.row!]}.`);
      }
    });
    expect(offered).toBeGreaterThan(40);
    expect(crowsGuarded).toBe(0);
  }, 120000);

  it('a help is priced from what the plot already holds: a buyer only for a crop the run grows', () => {
    stalls(6, (s) => {
      const help = s.shop!.twists!.find((t) => R.BOONS.includes(t.id))!;
      if (help.id !== 'buyer') return;
      expect(s.tally, 'the season just played is kept').toBeDefined();
      const t = s.tally!;
      // The seventh playtest's buyer for sunflowers (yield 3) was worth nothing next to 60 off.
      // Round 8: its estimate is scaled to what a buyer brought when played ahead (`worthTimes`). Round 10: wherever a
      // help worth that much could be offered (a season that took nearly all its coins from one crop has none).
      if (R.boonAims(s).some((a) => a.v >= TUNING.minWorth)) expect(((t.kinds[help.crop!] ?? 0) / t.take) * (TUNING.buyerTimes - 1) * (TUNING.worthTimes.buyer ?? 1)).toBeGreaterThanOrEqual(TUNING.minWorth - 1e-9);
      expect(R.twistText(help)).toBe(`A buyer pays double for your ${R.PLURALS[help.crop!]}.`);
    });
  }, 120000);

  it('a crow every morning, in a season of crows', () => {
    calm();
    const s = table(['radish'], { year: 2 });
    s.twist = { id: 'crows' };
    TUNING.crowChance = [0.2];
    let crows = 0;
    for (let d = 0; d < 20; d++) {
      R.startDay(s, []);
      if (s.crow) crows++;
    }
    // Round 6 brought one twice as often: about 8 mornings in 20 here.
    expect(crows).toBe(20);
  });
});

describe('round 7: the guided run sets no traps', () => {
  it('Green Thumb is pinned only for a bench that ran short last season', () => {
    calm();
    let pinned = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const left of [3, 0]) {
        const { s } = newRun(seed, null);
        // Round 9: days played after the quota is met do not count, so the quota is met only on the last night.
        for (let g = 0; g < 10 && s.phase === 'day'; g++) {
          s.energy = left;
          if (s.day === TUNING.days) s.earned = Math.max(s.earned, s.quota);
          if (s.day === TUNING.days) s.idle = { scoops: (s.idle?.scoops ?? 0) + left, days: (s.idle?.days ?? 0) + 1 };
          endDay(s);
        }
        const thumb = s.shop!.pages.some((p) => p.page === 'thumb');
        // Three scoops a day sat unused: Green Thumb (a scoop a day, 170 coins) is not pinned.
        if (left === 3) {
          expect(thumb, `seed ${seed}`).toBe(false);
          expect(X.pageOnSale?.(s, 'thumb')).toBe(false);
        } else if (thumb) pinned++;
      }
    }
    // A bench spent to the last scoop: it is pinned as often as any page.
    expect(pinned).toBeGreaterThan(5);
  });

  it('the toss lesson waits for a card with nowhere to go, not one the scoops cannot pay for today', () => {
    const s = table(['strawberry', 'radish'], { energy: 1 });
    // A strawberry the bench cannot pay for today has a place to go: not spare (the playtest tossed it).
    expect(spareCard(s)).toBeUndefined();
    // With the plot full, it has nowhere to go: spare.
    s.plots.forEach((p, i) => (p.crop = crop(100 + i, 'radish', 0, 1)));
    expect(spareCard(s)?.id).toBe('strawberry');
  });

  it('a crop the can brings in tonight shows what it will pay tonight', () => {
    calm();
    // A lone carrot a night from ripe: the can brings it in tonight and changes nothing else about its pay.
    const s = table(['can']);
    s.plots[5].crop = crop(1, 'carrot', 0, 2);
    const p = previewPlay(s, 0, 5)!;
    const m = p.marks.find((x) => x.plot === 5)!;
    expect(m.nights).toBe(1);
    expect(p.tonight).toContain(5);
    // The seventh playtest watered a carrot that then paid 21 and saw only "+1 moon".
    expect(m.total).toBeDefined();
    expect(playCard(s, 0, 5)).not.toBeNull();
    expect(m.total).toBe(harvests(endDay(s)).find((h) => h.kind === 'carrot')!.score);
  });

  it('the guided spring asks for its last night, and day 6 brings radishes to ring the carrot', () => {
    // Round 9: 75, since day 3 deals a radish or a carrot, not both (the careful line takes 84 with the radish).
    expect(newRun(1, null, true).s.quota).toBeGreaterThanOrEqual(75);
    expect(R.GUIDED_DEALS[5].filter((c) => c === 'radish').length).toBe(2);
  });
});

describe('round 7: a crow on a perennial', () => {
  it('takes that night\'s pick: nothing is paid for it that night', () => {
    calm();
    const s = table(['radish'], { season: 2 });
    s.plots[0].crop = crop(1, 'beans', 3, 3);
    s.crow = true;
    const ev = endDay(s);
    expect(ev.some((e) => e.t === 'crow' && e.plot === 0)).toBe(true);
    // The beans stay with a pick used up, and pay nothing tonight (round 6 paid the pick in full).
    expect(harvests(ev).filter((h) => h.plot === 0)).toHaveLength(0);
    expect(s.plots[0].crop?.picks).toBe(1);
  });
});

describe('round 7: the engines said plainly', () => {
  it('each engine reads as its gift and its page', () => {
    const say = (R as unknown as { engineText?: (id: string) => string }).engineText;
    expect(say?.('bees')).toBe('A beehive and Busy Bees.');
    expect(say?.('hot')).toBe('Four chilies and Hot Beds.');
    expect(say?.('vines')).toBe('Beans and Trellis.');
    // Round 9: the tall engine brings two corn again. Round 10: three.
    expect(say?.('tall')).toBe('Three corn and Tall Rows.');
  });
});
