// Board geometry and the numbers that set a run's pace. Plots are indexed in
// reading order: row by row, left to right, which is also the harvest order.

import { CELLAR_YIELD, SEEDS } from './cards';
import type { Crop, PageId, Plot, RunState, Season, SeedId, Twist, TwistId } from './types';

/** Tunable numbers. The balance bot sweeps these; the game uses them as they are. */
export const TUNING = {
  /** Year 1's quotas, spring to winter. */
  quotas: [170, 260, 300, 350] as number[],
  /**
   * Year 2's. Takes grow faster through year 2 than year 1, so it has its own row. Round 4 set years 2 and 3 against
   * the strong builds (roots with the Cellar, bloom with Busy Bees, perennials), which ran at 1.8 to 2.5 times the old
   * quotas: a run that clears year 2 no longer all but surely clears year 3, and the combos are needed to win. Round 6
   * raised summer to winter (600, 710, 790 before): the sixth playtest called year 2 a walkover once a build exists.
   */
  quotas2: [430, 620, 740, 830] as number[],
  /**
   * Year 3's, the last: its winter is the finish line. A fixed row that grows through the year, so earning more never
   * makes the game harder: round 5 set year 3 at least 0.95 times the run's own year 2 autumn and winter, which pushed
   * the sixth playtest's every year 3 quota to a flat 1,550 ("Spring asks 1550", up from 630, with no reason given),
   * and every extra coin earned in year 2 raised next year's quotas, so holding back paid.
   */
  quotas3: [900, 980, 1060, 1140] as number[],
  /** Each year after the third multiplies year 3's quotas by this (checks and the balance scripts only: a run ends after year 3). */
  yearMult: 1.3,
  /**
   * Years in a run. Its last winter is the finish line: meet it and the run is
   * won. The fourth playtest's strong runs never ended (a roots run was still at
   * 1.5 times the quota in year 4 summer with 5,113 coins it could not spend);
   * by the end of year 3 the almanac is full, the scoops are bought and the
   * engine is built, so the run ends there.
   */
  years: 3,
  /** The guided first season's quota: its first three days are set hands, so it takes less. */
  guidedQuota: 70,
  /**
   * The guided run's summer, its first season played without set hands. At 88% of the usual (230) it was the
   * tightest season of year 1 for the bot (a median take of 1.19 times it, against 1.40 to 1.59 for the rest), and the
   * sixth playtest missed it by 5 playing carefully with every preview: the run ended in its first season on its own.
   */
  guidedSummer: 180,
  /** A guided first run's year 1 autumn and winter are this much of the usual: its first stall had fewer coins to spend. */
  firstYear: 0.88,
  /**
   * A guided first run's year 2 is this much of the usual, about round 5's row (400, 580, 690, 770): round 6 raised year
   * 2 from summer for the built plots, and at the full rate the guided bot cleared year 2 22% of the time against the
   * decent bot's 30% (34% at this).
   */
  guidedYear2: 0.93,
  days: 6,
  handSize: 5,
  energy: 3,
  /**
   * Chance of new pests on a night, by season from the run's first (the last
   * value repeats). Hazards ramp a step each season rather than jumping at the
   * year's turn: the old by-year odds doubled overnight from year 1 winter to
   * year 2 spring, and takes fell from 231 to 161 for the tester.
   */
  pestChance: [0, 0.15, 0.2, 0.25, 0.3, 0.34, 0.38, 0.42, 0.46, 0.5, 0.55] as number[],
  /** Nights pests stay on a crop before they move on. */
  pestNights: 2,
  /**
   * What a pested crop's harvest pays: half. Pests used to stop a crop growing and
   * being picked; perennial builds lost whole nights to them and three of the third
   * playtest's four deaths came after a pest-struck season. Now they press, not decide.
   */
  pestPay: 0.5,
  /** Scoops a crop puts back on the next morning's bench when it is pulled up. */
  scoopBack: 1,
  /** Checks only (the quota fit): a missed season still opens the stall, so every run sees every season with the real quotas in play. */
  noEnd: false,
  /** Which crops put a scoop back when pulled up: every crop (shipped), or for checks only those that cost a scoop, or none. */
  scoopFrom: 'all' as 'all' | 'paid' | 'none',
  /**
   * The most scoops pulled crops put back in one night. Uncapped, the morning
   * bench grew to 9 to 12 scoops and the budget bound on 5% of days; at two it
   * holds 4 to 8 and binds on about 45% (deck-board).
   */
  scoopCap: 2,
  /** Bloom a sunflower gives the crop below it. */
  sunBloom: 2,
  /** In a season of sunflowers all round (a twist), the bloom it gives each other crop beside it. */
  sunAll: 1,
  /** Yield the Root Cellar adds to radishes and carrots (on top of its bloom for each radish and carrot pair). */
  cellarYield: CELLAR_YIELD,
  /**
   * The most bloom the Root Cellar gives one crop: +1 when a radish stands beside
   * a carrot (or a carrot beside a radish), up to this. It counted every root
   * beside a root, uncapped, and decided the run: the same shopping cleared year 3
   * 76% of the time with it and 0% without. Capped at 2 a roots build still took
   * about 1,200 a season in year 3 against about 1,000 for the other strong builds.
   */
  cellarCap: 1,
  /**
   * Busy Bees' one multiplier for a crop a sunflower or a beehive blooms, however
   * many. At x2 the bloom build took about 1,600 a season in year 3, a half again
   * as much as any other strong build, once the quotas were set against them.
   */
  beesTimes: 1.5,
  /**
   * Almanac pages kept before any slot is bought. Four, not five: buying only
   * pages cleared year 2 more often than buying good cards (the tester's 40%
   * against 35%; 59% against 48% with this round's cards), and a fifth page
   * now costs a slot.
   */
  maxPages: 4,
  /** Chance each pested crop spreads to a neighbour on a night. */
  pestSpread: 0.4,
  /** Chance a crow comes at dawn, by season from the run's first, like the pests. */
  crowChance: [0, 0, 0.12, 0.16, 0.2, 0.23, 0.26, 0.29, 0.32, 0.36, 0.4, 0.45] as number[],
  removePrice: 35,
  upgradePrice: 40,
  /** Removing or upgrading again in the same visit costs this much more each time. */
  serviceStep: 15,
  rerollBase: 8,
  rerollStep: 3,
  /** Cards on the merchant's tray: at least one seed and one uncommon or rarer. */
  goods: 4,
  /** Cards the merchant brings each new year of a run, at random from those the catalogue does not hold yet, for that run only. */
  newStock: 2,
  /** Shop prices rise by this much each year after the first. */
  priceYear: 0.5,
  minDeck: 6,
  /** A seed scoop for good, from year 2: this much, doubling for each one after. The bench holds any number. */
  scoopPrice: 200,
  maxScoops: 4,
  /**
   * The stall sells a scoop for good only if fewer than this many scoops a day sat unused on the bench at dusk last
   * season (`scoopOnSale`): a bench spent to the last scoop on most days. In a deck of free radishes and one-scoop
   * carrots the hand, not the scoops, limits a day's plays: the sixth playtest bought a 3,200-coin scoop, then left 3
   * to 6 unspent most days. A deck of dear seeds runs short of scoops, not cards, so a cap at the hand's size (tried)
   * cut its year 3 takes by 2 to 12%; a scoop that comes with a card (tried) lifted the roots builds' by 37%. At 1.5
   * the roots builds still bought a scoop or two in a lean season, then left 3 to 4 a day unused.
   */
  scoopIdle: 1,
  /** Room for one more almanac page, sold once the almanac is full: this much, doubling each time. A late use for coins. */
  slotPrice: 250,
  /**
   * From this season (0 is year 1 spring) each season has a twist, picked at the stall before it from two: year 2
   * spring on. The fifth playtest: "Year 2 is a coin flip on the draw. Year 3 is a victory lap, run after run on the
   * same 23 cards", the same carrot ringed by radishes, a sunflower above it and chilies beside it, every day.
   */
  twistFrom: 4,
  /** Checks only: no twists, for the strategy table with and without. */
  twists: true,
  /** A buyer pays this many times for its crop; a glut this much. Crows come this many times as often. */
  buyerTimes: 2,
  glutTimes: 0.5,
  crowTimes: 2,
  /**
   * A share of each season's surplus is carried into the next season's take, so strong play buffers a bad draw (the
   * playtest's runs went 817 of 440, then 463 of 510, dead). At most this share of the next quota.
   */
  carryShare: 0.25,
  carryCap: 0.25,
  /** The first run after the guided one: its first spring asks this (the guided spring asked 70, the next 170). */
  softSpring: 120,
  /**
   * A season's twist is a trade: a hitch takes this share off the season's quota, so it pays for itself. Round 5's
   * hitches gave nothing back, and the sixth playtest picked the help all nine times, never close. A hitch that misses
   * the build (crows with a scarecrow standing, frost on a plot of perennials) is now the better pick, and one that
   * hits it (a glut of the crop it leans on) is not.
   */
  hitchEase: { frost: 0.15, glut: 0.15, sunup: 0.1, crows: 0.12 } as Partial<Record<TwistId, number>>,
  /** Improved stock costs this many coins more than the plain card (times the year's rise). */
  selectPrice: 25,
  /** Won runs the record keeps, latest last. */
  winsKept: 6,
};

/** The run's last season: its winter is the finish line. */
export function isFinal(s: Pick<RunState, 'year' | 'season'>): boolean {
  return s.year >= TUNING.years && s.season === 3;
}

/** Seasons in a whole run, and how many this is, from 1. */
export function seasonsInRun(): number {
  return TUNING.years * 4;
}

export function byYear(list: number[], year: number): number {
  return list[Math.min(list.length - 1, year - 1)];
}

/** Seasons since the run began: 0 is year 1 spring. */
export function seasonIndex(s: Pick<RunState, 'year' | 'season'>): number {
  return (s.year - 1) * 4 + s.season;
}

/** A value from a by-season list (the last value repeats). */
export function bySeason(list: number[], s: Pick<RunState, 'year' | 'season'>): number {
  return list[Math.min(list.length - 1, seasonIndex(s))];
}

/** The season after this one. */
export function nextSeason(s: Pick<RunState, 'year' | 'season'>): { year: number; season: Season } {
  return s.season === 3 ? { year: s.year + 1, season: 0 } : { year: s.year, season: (s.season + 1) as Season };
}

function nice(q: number): number {
  return q < 100 ? Math.round(q / 5) * 5 : Math.round(q / 10) * 10;
}

export interface QuotaOpts {
  /** The first run after the guided one: a softer first spring. */
  soft?: boolean;
  /** The season's twist: a hitch takes its share off the quota. */
  twist?: Twist | null;
}

/** The share a twist takes off its season's quota: a hitch pays for itself; a help takes nothing off. */
export function twistEase(t: Twist | null | undefined): number {
  return t ? (TUNING.hitchEase[t.id] ?? 0) : 0;
}

/**
 * A season's quota. Fixed rows for each year (the guided run's year 1 its own), Cold Frame a fifth off winter, a
 * hitch its share off its season. Nothing the run earns moves it: round 5 set year 3 from the run's own year 2.
 */
export function quotaFor(year: number, season: Season, pages: readonly PageId[], guided = false, o: QuotaOpts = {}): number {
  let q = year === 1 ? TUNING.quotas[season] : year === 2 ? TUNING.quotas2[season] : TUNING.quotas3[season] * Math.pow(TUNING.yearMult, year - 3);
  if (year === 1 && guided) q = season === 0 ? TUNING.guidedQuota : season === 1 ? TUNING.guidedSummer : q * TUNING.firstYear;
  if (year === 2 && guided) q *= TUNING.guidedYear2;
  if (year === 1 && season === 0 && o.soft && !guided) q = TUNING.softSpring;
  if (season === 3 && pages.includes('coldframe')) q *= 0.8;
  q *= 1 - twistEase(o.twist);
  return nice(q);
}

/** The quota for a season of this run, as it would be set now (with this twist, if one is given). */
export function runQuota(s: Pick<RunState, 'pages' | 'guided' | 'soft'>, year: number, season: Season, twist: Twist | null = null): number {
  return quotaFor(year, season, s.pages, s.guided, { soft: s.soft, twist });
}

// ---------------------------------------------------------------- twists

/** This season's twist, if it holds on night n from tonight (a harvest next season does not know next season's twist). */
export function twistOn(s: Pick<RunState, 'twist' | 'day'>, n = 0): Twist | null {
  const t = s.twist ?? null;
  return t && n <= TUNING.days - s.day ? t : null;
}

/** Frost on the bottom row: nothing can be sown there this season. */
export function frosted(s: Pick<RunState, 'twist' | 'cols' | 'rows'>, i: number): boolean {
  return s.twist?.id === 'frost' && Math.floor(i / s.cols) === s.rows - 1;
}

/** Picks a crop gives before it leaves: one more for beans and strawberries in a season of long picks. */
export function picksOf(s: Pick<RunState, 'twist' | 'day'>, kind: SeedId, n = 0): number {
  const p = SEEDS[kind].picks;
  return p > 1 && twistOn(s, n)?.id === 'picks' ? p + 1 : p;
}

/** The bench's morning refill: three scoops, one more for Green Thumb, one for the Long Furrow, and any bought for good. */
export function energyMax(s: Pick<RunState, 'pages' | 'scoops'>): number {
  return TUNING.energy + (s.pages.includes('thumb') ? 1 : 0) + (s.pages.includes('furrow') ? 1 : 0) + (s.scoops ?? 0);
}

/** Cards drawn up to each morning: five, and one more for Big Basket. */
export function handSize(s: Pick<RunState, 'pages'>): number {
  return TUNING.handSize + (s.pages.includes('basket') ? 1 : 0);
}

/** Pests from summer of year 1; crows from autumn. A season with no chance of either has none. */
export function pestsOn(s: Pick<RunState, 'year' | 'season'>): boolean {
  return bySeason(TUNING.pestChance, s) > 0;
}

export function crowsOn(s: Pick<RunState, 'year' | 'season'>): boolean {
  return bySeason(TUNING.crowChance, s) > 0;
}

export function emptyPlot(): Plot {
  return { crop: null, obj: null, boost: 0, last: null };
}

export function rowOf(s: RunState, i: number): number {
  return Math.floor(i / s.cols);
}

export function colOf(s: RunState, i: number): number {
  return i % s.cols;
}

/** The up to four plots that share an edge with i. */
export function neighbours(s: Pick<RunState, 'cols' | 'rows'>, i: number): number[] {
  const r = Math.floor(i / s.cols);
  const c = i % s.cols;
  const out: number[] = [];
  if (r > 0) out.push(i - s.cols);
  if (c > 0) out.push(i - 1);
  if (c < s.cols - 1) out.push(i + 1);
  if (r < s.rows - 1) out.push(i + s.cols);
  return out;
}

/** The up to eight plots in the 3 by 3 around i. */
export function around(s: Pick<RunState, 'cols' | 'rows'>, i: number): number[] {
  const r = Math.floor(i / s.cols);
  const c = i % s.cols;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < s.rows && cc >= 0 && cc < s.cols) out.push(rr * s.cols + cc);
    }
  }
  return out;
}

export function isRipe(c: Crop): boolean {
  return c.age >= c.days;
}

export function isEmpty(p: Plot): boolean {
  return !p.crop && !p.obj;
}

/** Garlic keeps pests off itself and its neighbours. */
export function immune(s: RunState, i: number): boolean {
  if (s.plots[i].crop?.kind === 'garlic') return true;
  return neighbours(s, i).some((j) => s.plots[j].crop?.kind === 'garlic');
}

/** A scarecrow guards the 3 by 3 around it. */
export function guarded(s: RunState, i: number): boolean {
  if (s.plots[i].obj === 'scarecrow') return true;
  return around(s, i).some((j) => s.plots[j].obj === 'scarecrow');
}

export function isTall(kind: string): boolean {
  return kind in SEEDS && SEEDS[kind as keyof typeof SEEDS].tall;
}

/** Growth stage 0 (just sown) to 4 (ripe), for drawing. */
export function stageOf(c: Pick<Crop, 'age' | 'days'>): number {
  if (c.age >= c.days) return 4;
  if (c.age <= 0) return 0;
  return Math.max(1, Math.min(3, 1 + Math.floor((c.age / c.days) * 3)));
}

/** Days of growth tonight from tonight's weather, on top of the usual one. */
export function extraGrowth(s: RunState): number {
  let n = 0;
  for (const w of s.tonight) n += w === 'rain' ? 1 : w === 'storm' ? 2 : 0;
  return n;
}

/** The night a crop is next pulled and the night it leaves its plot, counted from tonight (0). */
export interface Fate {
  /** Nights until its next pick: 0 is tonight. */
  ripeIn: number;
  /** The night of its next pick (the same as ripeIn): the plot carries over, so a pick after the season ends still comes, next season. */
  pull: number;
  /** The night it leaves the plot (an annual's pick, a perennial's last), whichever season that falls in. */
  leave: number;
  /** Its next pick falls after this season's last night: it pays next season, against next season's quota. */
  late: boolean;
}

/**
 * When every crop on the plot will be pulled and when it will leave, if
 * nothing more is played and no hazard comes: each crop grows a night each
 * night (plus tonight's can, rain and storm, and the Rain Barrel each night),
 * and ripe crops are picked. Pests no longer hold a crop back (they halve its
 * pay instead), so the forecast does not count them.
 * The plot carries over from season to season, so the nights run on past the
 * season's end. The previews use it so a bonus only counts when the crop
 * giving it will still be there on the night the other is pulled.
 */
export function forecast(s: RunState): (Fate | null)[] {
  const last = TUNING.days - s.day;
  const barrel = s.pages.includes('barrel');
  const extra = extraGrowth(s);
  return s.plots.map((p, i) => {
    const c = p.crop;
    if (!c) return null;
    let age = c.age;
    let picks = c.picks;
    let ripeIn = Infinity;
    let leave = Infinity;
    for (let n = 0; n < 40; n++) {
      const grow = n === 0 ? 1 + extra + p.boost : 1 + (barrel && i % s.cols === 0 ? 1 : 0);
      if (age < c.days) age = Math.min(c.days, age + grow);
      if (age >= c.days) {
        if (ripeIn === Infinity) ripeIn = n;
        picks++;
        if (picks >= picksOf(s, c.kind, n)) {
          leave = n;
          break;
        }
      }
    }
    return { ripeIn, pull: ripeIn, leave, late: ripeIn > last };
  });
}

/** Nights a crop still needs before its next pick (0: pulled tonight), as things stand. */
export function nightsLeft(s: RunState, i: number): number {
  const f = forecast(s)[i];
  return f ? f.ripeIn : 0;
}

/** Will this crop be pulled tonight, as things stand (before a crow)? A pested crop is too, at half pay. */
export function ripeTonight(s: RunState, i: number): boolean {
  const c = s.plots[i].crop;
  if (!c) return false;
  return isRipe(c) || c.age + 1 + extraGrowth(s) + s.plots[i].boost >= c.days;
}
