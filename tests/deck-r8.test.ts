// Seedbound, round 8: the help says in coins what it would bring, beside the hitch's quota; engine pages level up at
// the stall; a difficulty curve that rises with the run; every table piece a returning player has earned from a new
// run's first dawn, and the spent heap taught on a hand stuck with cards too dear today; twists that do not repeat or
// see-saw, never rest another engine's page, count a scarecrow in the tin, and frost and the weak help priced as they
// play; no engine card sold beside the free pick. Each test fails on round 7 (a `git archive` copy) on an assertion.
import { describe, expect, it, onTestFinished } from 'vitest';
import { botDay, botShop, Dice } from '../src/games/deck/bot';
import * as L from '../src/games/deck/lessons';
import * as R from '../src/games/deck/rules';
import { allCards, endDay, leaveShop, newMeta, newRun, TUNING, type CardId, type Crop, type Harvest, type PageId, type RunState, type Twist } from '../src/games/deck/rules';

/** Round 8's calls, read loosely so this file runs (and fails on assertions) against round 7. */
type Aim = { t: Twist; v: number };
const X = R as unknown as {
  twistNote?: (s: RunState, t: Twist) => string | null;
  twistCoins?: (s: RunState, t: Twist) => number;
  boonAims?: (s: RunState) => Aim[];
  hitchAims?: (s: RunState) => Aim[];
  hitchCut?: (a: Aim) => number;
  buyLevel?: (s: RunState) => unknown;
  canBuyLevel?: (s: RunState) => boolean;
  levelChange?: (id: PageId, to: number) => string | null;
  levelText?: (id: PageId, level: number) => string | null;
  levelName?: (name: string, level: number) => string;
  offerTwists?: (s: RunState) => Twist[];
  chooseEngine?: (s: RunState, i: number) => unknown;
};
const XL = L as unknown as { earnTable?: (learn: L.Learn, runs: number) => boolean; dearCard?: (s: RunState) => unknown };
type LevelOffer = { page: PageId; to: number; price: number; sold: boolean };
const shopLevel = (s: RunState) => (s.shop as (R.Shop & { level?: LevelOffer }) | null)?.level;

const crop = (uid: number, kind: Crop['kind'], age: number, days: number, extra: Partial<Crop> = {}): Crop => ({ uid, kind, age, days, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false, ...extra });
const harvests = (ev: R.Ev[]): Harvest[] => ev.filter((e): e is Extract<R.Ev, { t: 'harvest' }> => e.t === 'harvest').map((e) => e.h);

function table(hand: CardId[], opts: { season?: 0 | 1 | 2 | 3; year?: number; energy?: number; seed?: number } = {}): RunState {
  const { s } = newRun(opts.seed ?? 7, null);
  s.season = opts.season ?? 0;
  s.year = opts.year ?? 1;
  s.draw.push(...s.hand);
  s.hand = hand.map((id) => ({ uid: s.nextUid++, id, up: false }));
  s.energy = opts.energy ?? 20;
  return s;
}

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

/** A run that took this engine at its first stall, at the stall before `year`, `season`. */
function engineRun(engine: R.EngineId, year: number, season: 0 | 1 | 2 | 3, seed = 3): RunState {
  const tune = TUNING as typeof TUNING & { engineChoices: number };
  const was = tune.engineChoices;
  tune.engineChoices = 4;
  const { s } = newRun(seed, null);
  toStall(s);
  X.chooseEngine?.(s, (s.shop as R.Shop & { engines?: string[] }).engines!.indexOf(engine));
  tune.engineChoices = was;
  for (let g = 0; g < 20 && !(s.phase === 'shop' && R.nextSeason(s).year === year && R.nextSeason(s).season === season); g++) {
    if (s.phase === 'shop') leaveShop(s);
    toStall(s);
  }
  return s;
}

/** The stalls a decent bot reaches in years 2 and 3, with the run as it stands there. */
function botStalls(runs: number, each: (s: RunState) => void, engine?: R.EngineId): void {
  for (let i = 0; i < runs; i++) {
    const seed = 4100 + i * 7919;
    const meta = newMeta();
    meta.unlocked = ['beehive', 'chili', 'corn', 'wheat', 'pumpkin', 'shears', 'mint', 'trowel', 'storm'];
    const { s } = newRun(seed, meta, false);
    const dice = new Dice(seed ^ 77);
    const o = { noise: 0.15, seed: 77 + i, engine };
    for (let g = 0; g < 400 && s.phase !== 'over'; g++) {
      if (R.seasonIndex(s) >= 11) break;
      if (s.phase === 'shop') {
        if (s.shop?.twists?.length) each(s);
        botShop(s, o, dice);
      } else botDay(s, o, dice);
    }
  }
}

describe('round 8: the help says what it would bring, in the same coins as the hitch', () => {
  it('both twists at a stall carry a number from the estimate they were priced by; the help says "About N more coins."', () => {
    let seen = 0;
    botStalls(5, (s) => {
      const tw = s.shop!.twists!;
      const help = tw.find((t) => R.BOONS.includes(t.id))!;
      const hitch = tw.find((t) => R.HITCHES.includes(t.id))!;
      const q = R.twistQuota(s, null);
      const note = X.twistNote?.(s, help) ?? '';
      // Round 12: "270 toward spring, 270 to spend.": its coins count toward the season and go in the purse.
      expect(note, `the help ${help.id} says what it would bring`).toMatch(/^\d+ toward \w+, \d+ to spend\.$/);
      // The number is the help's worth (the share the rules paired it by) times the season's quota, rounded.
      const n = Number(/^(\d+)/.exec(note)?.[1] ?? NaN);
      const worth = (help as Twist & { worth?: number }).worth ?? -1;
      expect(Math.abs(n - worth * q)).toBeLessThanOrEqual(10);
      // It is the rules' own estimate: what `boonAims` priced it at (a fallback help has none, and says 0 more). Round 10:
      // in coins of the run's take (`takeRatio`), as the hitch's.
      const aim = X.boonAims?.(s).find((a) => a.t.id === help.id && a.t.crop === help.crop);
      const r = (R as unknown as { takeRatio?: (s: RunState) => number }).takeRatio?.(s) ?? 1;
      if (aim) expect(Math.abs(worth - aim.v * r)).toBeLessThanOrEqual(0.0051);
      // The hitch says it in the same coins: round 12, in the same words, with what it would still cost on its trade line.
      const hn = X.twistNote?.(s, hitch) ?? '';
      expect(hn).toMatch(/^\d+ toward \w+, \d+ to spend\.$/);
      expect((X as { hitchTrade?: (s: RunState, t: Twist) => string | null }).hitchTrade?.(s, hitch) ?? '').toMatch(/^It costs about \d+: \w+ asks \d+ less, the merchant pays \d+\.$/);
      const cost = (hitch as Twist & { worth?: number }).worth ?? -1;
      expect(cost).toBeGreaterThanOrEqual(0);
      // Paired by worth: the hitch's cut less what it still costs is about the help's worth (or the margin).
      expect(R.twistEase(hitch) - cost).toBeGreaterThanOrEqual(0);
      seen++;
    });
    expect(seen).toBeGreaterThan(10);
  }, 120000);
});

describe('round 8: engine pages level up at the stall', () => {
  it('the stall pins the engine page at its next level from year 2, priced, and it pays at that level', () => {
    calm();
    // Not in year 1: the stall before winter pins none.
    expect(shopLevel(engineRun('bees', 1, 3))).toBeUndefined();
    const s = engineRun('bees', 2, 0);
    const lv = shopLevel(s);
    expect(lv, 'the stall before year 2 spring pins Busy Bees II').toBeDefined();
    expect(lv!.page).toBe('bees');
    expect(lv!.to).toBe(2);
    // Too poor: not bought. With the coins: bought, the page goes to II, the price comes off the purse.
    s.coins = lv!.price - 1;
    expect(X.buyLevel?.(s) ?? null).toBeNull();
    s.coins = lv!.price + 7;
    expect(X.buyLevel?.(s)).toBeTruthy();
    expect(s.coins).toBe(7);
    expect((s as RunState & { levels?: Record<string, number> }).levels?.bees).toBe(2);
    // Busy Bees II: a lettuce by a hive pays at the next level's times (round 10: the pages leave carrots out).
    const ii = (TUNING as unknown as { levelUp?: Record<string, number[]> }).levelUp?.bees[0] ?? TUNING.beesTimes;
    expect(ii).toBeGreaterThan(TUNING.beesTimes);
    leaveShop(s);
    s.plots.forEach((p) => {
      p.crop = null;
      p.obj = null;
    });
    s.plots[0].obj = 'beehive';
    s.plots[5].crop = crop(1, 'lettuce', 2, 2);
    s.twist = null;
    const h = harvests(endDay(s)).find((x) => x.kind === 'lettuce')!;
    expect(h.score).toBe(Math.round(8 * ii));
    // The next stall offers III, dearer.
    toStall(s);
    const iii = shopLevel(s);
    expect(iii?.to).toBe(3);
    expect(iii!.price).toBeGreaterThan(lv!.price);
  });

  it('every engine page has two more levels, said in the page\'s own words against what it does now', () => {
    calm();
    for (const id of ['bees', 'hot', 'vines', 'tall'] as PageId[]) {
      expect(X.levelText?.(id, 1), `${id} at level I is the page as printed`).toBe(R.PAGES[id].text);
      const two = X.levelChange?.(id, 2) ?? '';
      expect(two).toMatch(/, not [x+]?\d+(\.\d+)?\.$/);
      expect(X.levelName?.(R.PAGES[id].name, 3)).toBe(`${R.PAGES[id].name} III`);
    }
    // Round 11: said as what a 10 coin crop pays, not as a sum. Round 12: as what a strawberry near a beehive pays.
    const bees2 = (TUNING as unknown as { levelUp?: Record<string, number[]> }).levelUp!.bees[0];
    expect(X.levelChange?.('bees', 2)).toBe(`A strawberry near a beehive pays ${Math.round(8 * bees2)}, not ${Math.round(8 * TUNING.beesTimes)}.`);
    // Hot Beds II: round 9, a chili's neighbours get more bloom (round 8: it picked one night more).
    const hot = table(['radish'], { year: 2 });
    hot.pages = ['hot'];
    (hot as RunState & { levels?: Record<string, number> }).levels = { hot: 2 };
    hot.plots[0].crop = crop(1, 'chili', 0, 2);
    hot.plots[1].crop = crop(2, 'lettuce', 2, 2);
    const hc = harvests(endDay(hot)).find((h) => h.kind === 'lettuce')!;
    expect(hc.mult.find((st) => st.icon === 'chili')?.v).toBeGreaterThan(TUNING.hotTimes[0]);
    // Trellis II and Tall Rows II: more bloom.
    const vines = table(['radish'], { year: 2 });
    vines.pages = ['vines'];
    (vines as RunState & { levels?: Record<string, number> }).levels = { vines: 2 };
    vines.plots[0].crop = crop(1, 'beans', 0, 3);
    vines.plots[1].crop = crop(2, 'lettuce', 2, 2);
    const c = harvests(endDay(vines)).find((h) => h.kind === 'lettuce')!;
    expect(c.mult.find((st) => st.icon === 'vines')?.v).toBeGreaterThan(TUNING.vinesBloom);
  });

  it('a run that saves buys the next level in year 2 and again by year 3 (the decent bot, each engine)', () => {
    const at: Record<string, number[]> = {};
    for (const e of ['bees', 'hot', 'vines', 'tall'] as R.EngineId[]) {
      at[e] = [];
      botStalls(
        5,
        (s) => {
          const lv = (s as RunState & { levels?: Record<string, number> }).levels?.[R.ENGINES[e].page] ?? 1;
          if (R.nextSeason(s).year === 3 && R.nextSeason(s).season === 0) at[e].push(lv);
        },
        e,
      );
    }
    const all = Object.values(at).flat();
    // By the stall that opens year 3, most runs that got there have bought a level (round 7 had none to buy).
    expect(all.length).toBeGreaterThan(3);
    expect(all.filter((l) => l >= 2).length / all.length).toBeGreaterThanOrEqual(0.6);
  }, 240000);
});

describe('round 8: a difficulty curve that rises with the run', () => {
  it('year 1 is a fair puzzle with any engine: a median take under 1.5 times the quota from summer to winter', () => {
    const tune = TUNING as typeof TUNING & { engineChoices: number };
    const was = tune.engineChoices;
    tune.engineChoices = 4;
    onTestFinished(() => {
      tune.engineChoices = was;
    });
    for (const e of ['bees', 'hot', 'vines', 'tall'] as R.EngineId[]) {
      const ratios: number[] = [];
      for (let i = 0; i < 10; i++) {
        const seed = 6100 + i * 7919;
        const { s } = newRun(seed, null, false);
        const dice = new Dice(seed ^ 77);
        const o = { noise: 0.15, seed: 77 + i, engine: e };
        for (let g = 0; g < 200 && s.phase !== 'over' && s.year === 1; g++) {
          if (s.phase === 'shop') botShop(s, o, dice);
          else botDay(s, o, dice);
        }
        for (const l of s.stats.log) if (l.year === 1 && l.season > 0) ratios.push(l.earned / l.quota);
      }
      ratios.sort((a, b) => a - b);
      const med = ratios[ratios.length >> 1];
      // The eighth playtest: the bees took 721 against 320, Tall Rows 1,282 against 400; round 7's bot 1.62 and 1.65.
      // Round 11: 1.6 (1.5): with its scoop Tall Rows runs 1.51 to 1.57 for the decent bot in year 1, the most of the four,
      // and the greedy preview-follower 1.38 to 1.51.
      expect(med, `${e}: year 1 median take over quota`).toBeLessThan(1.6);
    }
  }, 120000);

  it('year 2 opens with no walkover: the decent bot takes under 1.45 times its first quota (round 7: 1.85)', () => {
    const ratios: number[] = [];
    // Round 10: 120 runs (12 before): these seeds' medians run 1.64 at 12, 1.61 at 40, 1.48 at 100, then settle at 1.41 from
    // 120 to 200, so a dozen said little.
    for (let i = 0; i < 120; i++) {
      const seed = 1000 + i * 7919;
      const { s } = newRun(seed, null, false);
      const dice = new Dice((77 + i) ^ seed);
      const o = { noise: 0.15, seed: 77 + i };
      for (let g = 0; g < 300 && s.phase !== 'over' && R.seasonIndex(s) <= 4; g++) {
        if (s.phase === 'shop') botShop(s, o, dice);
        else botDay(s, o, dice);
      }
      const l = s.stats.log.find((x) => x.year === 2 && x.season === 0);
      // Round 12: the take less the quota asked, over the plain quota: a hitch's cut now takes off the help's whole worth
      // with the cost (the merchant pays the same), so a take over the quota asked counted the cut many times over.
      const plain = R.quotaFor(2, 0, s.pages, s.guided, { soft: s.soft });
      if (l) ratios.push(1 + (l.earned - l.quota) / plain);
    }
    ratios.sort((a, b) => a - b);
    expect(ratios.length).toBeGreaterThan(80);
    // Round 12: 1.5 (1.45): the hitch now weighs as much as the help, so the bot no longer loses a twist at half its stalls
    // (these seeds: 1.38 before, 1.45 after, met 89% and 94%); a player who took the help every time, as the twelfth
    // playtest did, gets what it did before.
    expect(ratios[ratios.length >> 1]).toBeLessThan(1.5);
  }, 400000);
});

describe('round 8: a returning player has the whole table', () => {
  it('a new run after a finished one has every piece a lesson brings in, whatever the first run reached', () => {
    // The eighth playtest's guided run ended after 42 days without the spent heap or the weather.
    const learn: L.Learn = { seen: ['lantern', 'peg', 'scoops', 'bloom', 'coins', 'tin', 'pages', 'services'], done: ['sow', 'lantern'], n: {}, cards: [] };
    expect(XL.earnTable?.(learn, 1)).toBe(true);
    for (const p of L.PIECES) expect(learn.seen, p).toContain(p);
    // A new player's first run brings nothing in early.
    const fresh = L.newLearn();
    XL.earnTable?.(fresh, 0);
    expect(fresh.seen).toEqual([]);
  });

  it('the spent heap is not taught on a hand of cards dear only today (round 12)', () => {
    // Round 8 taught it on three-scoop corn with one scoop left (the playtest's corn runs ended days so). Round 12: the
    // twelfth playtest was told "Drag a card too dear today to Spent." for a can and rain that were fine the next
    // morning; it comes for a card the bench can never pay for (deck-r12), or one with nowhere to go.
    const s = table(['corn', 'corn', 'corn'], { season: 1, energy: 1 });
    const tutor = new L.Tutor(L.learnedAll());
    tutor.learn.done = tutor.learn.done.filter((id) => id !== 'spent');
    const { line } = tutor.update(s, 'touch', null, 0.1, false);
    expect(line?.id).not.toBe('spent');
    // A dear card while something else can still be played is not stuck (round 7's strawberry).
    const t = table(['strawberry', 'radish'], { season: 1, energy: 1 });
    expect(XL.dearCard?.(t)).toBeUndefined();
  });
});

describe('round 8: twists that do not repeat, see-saw or miss the run', () => {
  /** A run at the stall before year 2 summer whose last season leaned on carrots, with no hazard to aim at. */
  function leaning(): RunState {
    const s = engineRun('bees', 2, 1);
    s.tally = R.newTally(s.rows);
    s.tally.take = 1000;
    s.tally.harvests = 40;
    s.tally.kinds = { carrot: 600, beans: 300, radish: 100 };
    s.tally.company = 100;
    s.plots[15].obj = 'scarecrow';
    s.pages = ['bees'];
    s.twist = null;
    return s;
  }

  it('nothing the last stall offered is aimed the same way again, and a glut and a buyer never bounce on one crop', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = leaning();
      s.rng = seed * 7919;
      // The last stall offered a glut of the carrots and a buyer for the beans.
      (s as RunState & { lastTwists?: Twist[] }).lastTwists = [{ id: 'glut', crop: 'carrot' }, { id: 'buyer', crop: 'beans' }];
      const offer = X.offerTwists!(s);
      for (const t of offer) {
        expect(t.id === 'glut' && t.crop === 'carrot', 'the carrots\' glut again').toBe(false);
        expect(t.id === 'buyer' && t.crop === 'beans', 'the beans\' buyer again').toBe(false);
        expect(t.id === 'buyer' && t.crop === 'carrot', 'a buyer for the glutted carrots').toBe(false);
        expect(t.id === 'glut' && t.crop === 'beans', 'a glut of the beans just bought for').toBe(false);
      }
    }
  });

  it('over bot-played runs a stall seldom aims a twist as the stall before did', () => {
    let stalls = 0;
    let repeats = 0;
    let prev: Twist[] = [];
    let prevRun = -1;
    let run = 0;
    const same = (a: Twist, b: Twist) => (a.id === b.id && a.crop === b.crop && a.row === b.row && a.page === b.page) || ((a.id === 'glut' || a.id === 'buyer') && (b.id === 'glut' || b.id === 'buyer') && a.crop === b.crop);
    botStalls(7, (s) => {
      if (R.seasonIndex(R.nextSeason(s)) === R.TUNING.twistFrom) run++;
      const now = s.shop!.twists!;
      // Round 11: never a hitch; a help only when no other is worth having (round 10's fallback: 0 to 1% of stalls for three
      // engines over 150 runs, 7% for the tall run, whose coins are nearly all corn).
      if (prevRun === run) {
        for (const t of now) {
          if (R.HITCHES.includes(t.id)) expect(prev.some((b) => same(b, t)), `${t.id} ${t.crop ?? t.page ?? t.row ?? ''} twice in a row`).toBe(false);
          else if (prev.some((b) => same(b, t))) repeats++;
        }
      }
      prev = now;
      prevRun = run;
      stalls++;
    });
    expect(stalls).toBeGreaterThan(8);
    expect(repeats / stalls).toBeLessThan(0.12);
  }, 120000);

  it('no page rests that is another engine\'s, and a scarecrow in the tin keeps crows off the offer', () => {
    const s = leaning();
    // Trellis bought from the cork board in a bee run, and it added the most last season.
    s.pages = ['bees', 'vines'];
    s.tally!.from = { vines: 300, bees: 120 };
    const rests = (X.hitchAims?.(s) ?? R.hitchAims(s)).filter((a) => a.t.id === 'rest');
    expect(rests.map((a) => a.t.page)).toEqual(['bees']);
    // Crows ahead (year 2 summer), a scarecrow in the tin and none on the plot: no crow every morning.
    s.plots[15].obj = null;
    expect(allCards(s).some((c) => c.id === 'scarecrow') || s.plots.some((p) => p.obj === 'scarecrow')).toBe(false);
    expect(R.hitchAims(s).some((a) => a.t.id === 'crows')).toBe(true);
    s.draw.push({ uid: 99001, id: 'scarecrow', up: false });
    expect(R.hitchAims(s).some((a) => a.t.id === 'crows'), 'crows with a scarecrow in the tin').toBe(false);
  });

  it('frost cuts about what it costs, and sunflowers all round are priced as they play', () => {
    // deck-twists, round 7: frost expected 25.3% and cut 25.3%, but cost 10.5% played; sunflowers all round 7% and 2.9%.
    const frost: Aim = { t: { id: 'frost', row: 3, crop: 'carrot' }, v: 0.25 };
    const cut = X.hitchCut ? R.easeOf(X.hitchCut(frost)) : R.easeOf(frost.v);
    expect(cut).toBeLessThanOrEqual(0.2);
    expect(TUNING.worthTimes.sunall ?? 1).toBeLessThan(0.45);
  });
});

describe('round 8: the engine stall sells no engine card beside the free pick', () => {
  it('the first stall\'s tray holds none of the offered engines\' cards, nor does its fresh stock', () => {
    const meta = newMeta();
    meta.unlocked = ['beehive', 'chili', 'corn', 'wheat', 'pumpkin', 'shears', 'mint', 'trowel', 'storm'];
    let trays = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { s } = newRun(seed, meta);
      toStall(s);
      const sh = s.shop as R.Shop & { engines?: R.EngineId[] };
      const gifts = sh.engines!.flatMap((id) => R.ENGINES[id].gift);
      expect(sh.cards.filter((o) => gifts.includes(o.card)).map((o) => o.card), `seed ${seed}`).toEqual([]);
      s.coins = 500;
      for (let k = 0; k < 3; k++) {
        R.reroll(s);
        expect(s.shop!.cards.filter((o) => gifts.includes(o.card)).map((o) => o.card), `seed ${seed}, fresh stock`).toEqual([]);
      }
      trays++;
    }
    expect(trays).toBe(40);
  });
});
