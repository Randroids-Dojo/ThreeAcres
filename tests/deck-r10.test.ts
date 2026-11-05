// Seedbound, round 10: each engine's bonus on its own crops and never on the root ring, frost priced by the plots it
// takes and no hitch aimed at a free card, a cut that is what the hitch costs, the late-ripening line first, a third
// corn for the tall engine, and what is still to go from day 4. Each test fails on round 9 (a `git archive` copy) on an
// assertion.
import { describe, expect, it, onTestFinished } from 'vitest';
import * as R from '../src/games/deck/rules';
import { endDay, newRun, newTally, PAGES, previewPlay, TUNING, type CardId, type Crop, type Harvest, type PageId, type RunState, type Tally, type Twist } from '../src/games/deck/rules';

/** Round 10's calls, read loosely so this file runs (and fails on assertions) against round 9. */
type Aim = { t: Twist; v: number; f?: number };
const X = R as unknown as {
  hitchAims: (s: RunState) => Aim[];
  hitchCost: (a: Aim) => number;
  hitchCut: (a: Aim, worth?: number, r?: number) => number;
  takeRatio?: (s: RunState) => number;
  pairWorth?: (c: number, r: number) => number;
  previewReason: (s: RunState, p: R.Preview, aim: number, seed: R.SeedId | null) => string | null;
  toGo?: (s: Pick<RunState, 'quota' | 'earned' | 'day'>) => number;
  ENGINES: Record<string, { gift: CardId[] }>;
};

const crop = (uid: number, kind: Crop['kind'], age: number, days: number, extra: Partial<Crop> = {}): Crop => ({ uid, kind, age, days, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: false, ...extra });
const harvests = (ev: R.Ev[]): Harvest[] => ev.filter((e): e is Extract<R.Ev, { t: 'harvest' }> => e.t === 'harvest').map((e) => e.h);

function table(hand: CardId[], opts: { season?: 0 | 1 | 2 | 3; year?: number; day?: number } = {}): RunState {
  const { s } = newRun(7, null);
  s.season = opts.season ?? 0;
  s.year = opts.year ?? 2;
  s.day = opts.day ?? 1;
  s.draw.push(...s.hand);
  s.hand = hand.map((id) => ({ uid: s.nextUid++, id, up: false }));
  s.energy = 20;
  for (const p of s.plots) {
    p.crop = null;
    p.obj = null;
  }
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

/** The bonus a page's icon put on this kind's harvest, if any. */
const bonus = (hs: Harvest[], kind: string, icon: string) => hs.find((h) => h.kind === kind)?.mult.find((st) => st.icon === icon);

describe('round 10: each engine on its own crops', () => {
  it('Busy Bees, Hot Beds and Trellis work on the engine\'s crops and never on radishes and carrots', () => {
    calm();
    // The tenth playtest's beans run took 3,349 coins from radishes and 3,303 from carrots, 1,064 from beans: every
    // engine multiplied the same carrot ringed by radishes.
    const night = (page: PageId, set: (s: RunState) => void) => {
      const s = table(['radish']);
      s.pages = [page];
      set(s);
      return harvests(endDay(s));
    };
    // A carrot and a lettuce both in a beehive's ground (A1 is the hive; A2 and B2 are in its 3 by 3).
    const bees = night('bees', (s) => {
      s.plots[0].obj = 'beehive';
      s.plots[4].crop = crop(1, 'lettuce', 2, 2);
      s.plots[5].crop = crop(2, 'carrot', 2, 2);
    });
    expect(bonus(bees, 'lettuce', 'bees')?.v, 'the lettuce by the hive gets Busy Bees').toBeGreaterThan(1);
    expect(bonus(bees, 'carrot', 'bees'), 'the carrot by the hive does not').toBeUndefined();
    // Both still get the hive's own +1 bloom: the beehive is a card, not the page.
    expect(bonus(bees, 'carrot', 'beehive')?.v).toBe(1);
    // A chili between a carrot and a lettuce: the lettuce takes Hot Beds' heat, the carrot only the chili's own x1.5.
    const hot = night('hot', (s) => {
      s.plots[5].crop = crop(1, 'chili', 0, 2);
      s.plots[4].crop = crop(2, 'carrot', 2, 2);
      s.plots[6].crop = crop(3, 'lettuce', 2, 2);
    });
    expect(bonus(hot, 'lettuce', 'chili')?.v).toBe(TUNING.hotTimes[0]);
    expect(TUNING.hotTimes[0]).toBeGreaterThan(1.5);
    expect(bonus(hot, 'carrot', 'chili')?.v).toBe(1.5);
    // Beans between a carrot and a lettuce: Trellis blooms the lettuce, not the carrot.
    const vines = night('vines', (s) => {
      s.plots[5].crop = crop(1, 'beans', 0, 3);
      s.plots[4].crop = crop(2, 'carrot', 2, 2);
      s.plots[6].crop = crop(3, 'lettuce', 2, 2);
    });
    expect(bonus(vines, 'lettuce', 'vines')?.v).toBeGreaterThan(0);
    expect(bonus(vines, 'carrot', 'vines')).toBeUndefined();
    // Each page says so in its own words.
    for (const id of ['bees', 'vines'] as PageId[]) expect(PAGES[id].text).toMatch(/not radishes or carrots/i);
    expect(PAGES.hot.text).toMatch(/radishes and carrots x1\.5/);
  });

  it('the tall engine takes three corn home, so a season seldom goes without one', () => {
    // The tenth playtest's corn paid 192, 38% of a summer; in autumn the one corn came too late to ripen and the run ended.
    expect(X.ENGINES.tall.gift.filter((c) => c === 'corn').length).toBe(3);
  });
});

describe('round 10: hitches priced by what they cost, never aimed at a free card', () => {
  /** A stall before year 2 summer with a season's tally read from this plot: rows 1 and 4 paid, row 4 in radishes. */
  function stall(empty: number[]): RunState {
    const s = table([], { year: 2, season: 0, day: 6 });
    s.phase = 'shop';
    const t: Tally = newTally(4);
    t.take = 600;
    t.harvests = 60;
    t.kinds = { radish: 260, carrot: 200, beans: 140 } as Tally['kinds'];
    t.rows = [200, 80, 0, 300];
    t.rowKinds = [{ carrot: 200 }, { beans: 80 }, {}, { radish: 260, beans: 40 }] as Tally['rowKinds'];
    t.from = {};
    (t as Tally & { empty?: number[]; dusks?: number }).empty = empty;
    (t as Tally & { empty?: number[]; dusks?: number }).dusks = 6;
    s.tally = t;
    return s;
  }

  it('no glut of radishes and no frost on a row that paid in radishes: they are free and go anywhere', () => {
    // The tenth playtest: "Frost on your radishes' row. About 110 fewer coins." cut summer from 1,030 to 750 and cost
    // nothing; in the beans run 5 of 7 stalls aimed a hitch at radishes.
    const aims = X.hitchAims(stall([0, 0, 0, 0]));
    expect(aims.length).toBeGreaterThan(0);
    expect(aims.some((a) => a.t.id === 'glut' && a.t.crop === 'radish'), 'a glut of radishes').toBe(false);
    expect(aims.some((a) => a.t.id === 'frost' && a.t.row === 3), 'frost on the radishes\' row').toBe(false);
    expect(aims.some((a) => a.t.crop === 'radish'), 'any hitch named for radishes').toBe(false);
  });

  it('frost costs more on a plot with no room to sow elsewhere, and the cut is what the hitch costs', () => {
    const full = X.hitchAims(stall([0, 0, 0, 0])).find((a) => a.t.id === 'frost' && a.t.row === 0)!;
    // Five bare plots on the other rows at every dusk: the carrots go there instead.
    const roomy = X.hitchAims(stall([0, 12, 12, 6])).find((a) => a.t.id === 'frost' && a.t.row === 0)!;
    expect(full && roomy).toBeTruthy();
    expect(X.hitchCost(full)).toBeGreaterThan(X.hitchCost(roomy) * 1.5);
    // With no room every carrot sown on the row is lost: about all of its coins.
    expect(X.hitchCost(full)).toBeGreaterThan(0.9 * full.v);
    // Round 8 cut a quota by the hitch's cost and the help's whole worth beside it, so the cut ran 2 to 3 times what the
    // hitch cost when played (deck-twists: frost cut 380 and cost 159) and the tenth playtest took the hitch at all
    // nine stalls. Now the help adds at most a small share.
    const worth = 0.2;
    expect(X.hitchCut(full, worth) - X.hitchCost(full)).toBeLessThanOrEqual(0.35 * worth);
  });
});

describe('round 10: the late-ripening line first, and what is still to go from day 4', () => {
  it('a seed that ripens next season says so before any lost bonus', () => {
    calm();
    // The tenth playtest's corn on autumn day 6 previewed "12 x 3.2 = 38" with "The beans are pulled before the corn
    // ripens.", and the run ended that night without it.
    const s = table(['corn'], { year: 2, season: 2, day: 6 });
    s.plots[5].crop = crop(1, 'beans', 3, 3, { picks: 2 });
    const p = previewPlay(s, 0, 6)!;
    expect(p.harvest?.late).toBe(true);
    expect(p.marks.some((m) => m.plot === 6 && m.lost)).toBe(true);
    expect(X.previewReason(s, p, 6, 'corn')).toBe('Ripens next season.');
  });

  it('the ledger says what is still to go from day 4, not only the last two days', () => {
    // The tenth playtest's no-engine run ended its first spring 158 of 160 before it had said anything.
    const at = (day: number, earned: number) => X.toGo?.({ quota: 160, earned, day }) ?? 0;
    expect(at(3, 100)).toBe(0);
    expect(at(4, 100)).toBe(60);
    expect(at(6, 158)).toBe(2);
    expect(at(5, 170)).toBe(0);
    // And a little slack in that first spring.
    expect(newRun(7, null).s.quota).toBeLessThan(158);
  });
});

describe('round 10: a twist said and paired in coins of the run\'s own take', () => {
  /** A stall before year 2 summer, after a season that took 1.5 times its quota. */
  function rich(seed: number): RunState {
    const { s } = newRun(seed, null);
    s.year = 2;
    s.season = 0;
    s.day = 6;
    s.phase = 'shop';
    s.engine = 'bees';
    s.pages = ['bees'];
    const t: Tally = newTally(4);
    t.take = 1.5 * s.quota;
    const k = (share: number) => share * t.take;
    t.harvests = 60;
    t.kinds = { carrot: k(0.4), beans: k(0.2), strawberry: k(0.12), lettuce: k(0.08), radish: k(0.2) } as Tally['kinds'];
    t.rows = [k(0.1), k(0.2), k(0.3), k(0.4)];
    t.rowKinds = [{ carrot: k(0.1) }, { beans: k(0.2) }, { lettuce: k(0.08), strawberry: k(0.12), carrot: k(0.1) }, { carrot: k(0.2), radish: k(0.2) }] as Tally['rowKinds'];
    t.from = { bees: k(0.15) };
    t.pests = k(0.3);
    t.company = k(0.12);
    t.last = k(0.1);
    s.tally = t;
    return s;
  }

  it('the quota comes down by the hitch\'s cost in coins of the take, not of the quota', () => {
    // The stall said a share of the quota, so a run taking 1.45 times its quota read "About 112 fewer coins." for a frost
    // that cost 167 played.
    const s = rich(3);
    const aim = X.hitchAims(s).find((a) => a.t.id === 'frost')!;
    expect(X.takeRatio?.(s)).toBeCloseTo(1.5, 5);
    expect(X.hitchCut(aim, 0.1, 1.5)).toBeCloseTo(1.5 * X.hitchCut(aim, 0.1, 1), 5);
  });

  it('a help beside a hitch is worth about what the hitch is worth to this run, and every kind still comes', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const s = rich(seed);
      const tw = R.offerTwists(s);
      const help = tw.find((t) => R.BOONS.includes(t.id))!;
      const hitch = tw.find((t) => R.HITCHES.includes(t.id))!;
      seen.add(help.id);
      seen.add(hitch.id);
      const r = X.takeRatio?.(s) ?? 1;
      const aim = X.hitchAims(s).find((a) => R.sameAim(a.t, hitch))!;
      const want = X.pairWorth?.(X.hitchCost(aim), r) ?? -1;
      expect(want, 'the worth that weighs the same').toBeGreaterThanOrEqual(0);
      const worth = (help as Twist & { worth?: number }).worth ?? 0;
      expect(Math.abs(worth / r - want), `${hitch.id} beside ${help.id}`).toBeLessThanOrEqual(TUNING.pairSpread + TUNING.pairNear + 0.01);
    }
    for (const k of ['frost', 'glut', 'rest', 'buyer', 'company']) expect(seen.has(k), `${k} comes`).toBe(true);
  });
});
