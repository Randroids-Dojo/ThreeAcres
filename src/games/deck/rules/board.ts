// Board geometry and the numbers that set a run's pace. Plots are indexed in
// reading order: row by row, left to right, which is also the harvest order.

import { SEEDS } from './cards';
import type { Crop, PageId, Plot, RunState, Season } from './types';

/** Tunable numbers. The balance bot sweeps these; the game uses them as they are. */
export const TUNING = {
  /** Year 1's quotas, spring to winter. */
  quotas: [170, 260, 300, 350] as number[],
  /**
   * Year 2's. Takes grow faster through year 2 than year 1, so it has its own row. Round 4 set years 2 and 3 against
   * the strong builds (roots with the Cellar, bloom with Busy Bees, perennials), which ran at 1.8 to 2.5 times the old
   * quotas: a run that clears year 2 no longer all but surely clears year 3, and the combos are needed to win.
   */
  quotas2: [420, 500, 580, 650] as number[],
  /** Year 3's, the last: its winter is the finish line. Takes climb into year 3 and flatten, so it has its own row too. */
  quotas3: [740, 820, 900, 960] as number[],
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
   * A guided first run's other year 1 quotas, and its year 2 quotas, are this much of the usual: its first stall had
   * fewer coins to spend, and its deck is a year behind. (Year 2 at the full rate cleared 9% of guided bot runs.)
   */
  firstYear: 0.88,
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
  /** Yield the Root Cellar adds to radishes and carrots (on top of its bloom for each radish and carrot pair). */
  cellarYield: 2,
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
  /** Room for one more almanac page, sold once the almanac is full: this much, doubling each time. A late use for coins. */
  slotPrice: 250,
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

export function quotaFor(year: number, season: Season, pages: readonly PageId[], guided = false): number {
  let q = year === 1 ? TUNING.quotas[season] : year === 2 ? TUNING.quotas2[season] : TUNING.quotas3[season] * Math.pow(TUNING.yearMult, year - 3);
  if (year === 1 && guided) q = season === 0 ? TUNING.guidedQuota : q * TUNING.firstYear;
  if (year === 2 && guided) q *= TUNING.firstYear;
  if (season === 3 && pages.includes('coldframe')) q *= 0.8;
  return nice(q);
}

/** The bench's morning refill: three scoops, one more for Green Thumb, one for the Long Furrow, and any bought for good. */
export function energyMax(s: Pick<RunState, 'pages' | 'scoops'>): number {
  return TUNING.energy + (s.pages.includes('thumb') ? 1 : 0) + (s.pages.includes('furrow') ? 1 : 0) + (s.scoops ?? 0);
}

export function handSize(s: RunState): number {
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
    const max = SEEDS[c.kind].picks;
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
        if (picks >= max) {
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
