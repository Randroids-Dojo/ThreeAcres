// Board geometry and the numbers that set a run's pace. Plots are indexed in
// reading order: row by row, left to right, which is also the harvest order.

import { CELLAR_YIELD, SEEDS } from './cards';
import type { Crop, PageId, Plot, RunState, Season, SeedId, Tally, Twist, TwistId } from './types';

/** Tunable numbers. The balance bot sweeps these; the game uses them as they are. */
export const TUNING = {
  /**
   * Year 1's quotas, spring to winter. Round 7 raised summer to winter (260, 300, 350): every run takes an engine at its
   * first stall, and at the old row the decent bot met year 1 97% of the time at 1.6 to 2 times the quota. Round 8
   * (320, 400, 470 before): with an engine year 1 was free (the eighth playtest's bees took 721 against 320, Tall Rows
   * 1,282 against 400; the bot's median take was 1.62 times the quota with bees, 1.65 with corn).
   */
  quotas: [170, 360, 480, 590] as number[],
  /**
   * Year 2's. Takes grow faster through year 2 than year 1, so it has its own row. Round 4 set years 2 and 3 against
   * the strong builds (roots with the Cellar, bloom with Busy Bees, perennials), which ran at 1.8 to 2.5 times the old
   * quotas: a run that clears year 2 no longer all but surely clears year 3, and the combos are needed to win. Round 6
   * raised summer to winter (600, 710, 790 before): the sixth playtest called year 2 a walkover once a build exists.
   * Round 7 (430, 620, 740, 830 before) prices them against the four engines every run now builds (deck-fit): each
   * engine wins 31 to 40% at these rows. Round 8 (540, 860, 1,060, 1,200 before): the engine pages level up, so years
   * 2 and 3 climb a step each season from a year 2 spring that is no walkover (round 7's bot took 1.85 times 540).
   */
  quotas2: [730, 920, 1080, 1220] as number[],
  /**
   * Year 3's, the last: its winter is the finish line. A fixed row that grows through the year, so earning more never
   * makes the game harder: round 5 set year 3 at least 0.95 times the run's own year 2 autumn and winter, which pushed
   * the sixth playtest's every year 3 quota to a flat 1,550 ("Spring asks 1550", up from 630, with no reason given),
   * and every extra coin earned in year 2 raised next year's quotas, so holding back paid. Round 7: 900, 980, 1,060,
   * 1,140 before the engines. Round 8: 1,250, 1,350, 1,450, 1,550 before the levels.
   */
  quotas3: [1440, 1640, 1820, 2000] as number[],
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
  /**
   * The guided first season's quota: its days are set hands, so it takes less. It was 70, met on day 5 every time
   * (the bot took 85 to 89 by then, the seventh playtest 88), so day 6 did nothing; at 90 a careful line (89 by day 5,
   * then 106 with day 6's second radish) meets it on the last night.
   */
  guidedQuota: 90,
  /**
   * The guided run's summer, its first season played without set hands. At 88% of the usual (230) it was the
   * tightest season of year 1 for the bot (a median take of 1.19 times it, against 1.40 to 1.59 for the rest), and the
   * sixth playtest missed it by 5 playing carefully with every preview: the run ended in its first season on its own.
   * Round 7: 240 (180 before), since the guided run takes an engine at its first stall: at 180 the guided bot took a
   * median 2.3 times it (its takes: 5% under 297, 10% under 314, median 416).
   */
  guidedSummer: 240,
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
   * Busy Bees' one multiplier for a crop near a beehive, however many. At x2 the
   * bloom build took about 1,600 a season in year 3, a half again as much as any
   * other strong build, once the quotas were set against them. Round 7: x1.3,
   * since every run now takes an engine at its first stall and the bee engine,
   * at x1.5, took 2.4 times its year 2 quotas against 1.8 to 1.9 for the others
   * (priced with deck-fit at round 7's rows it won 77% at x1.5, 54% at x1.35,
   * 30% at x1.25, the other engines 24 to 47%). Round 8: x1.2 at level I (Busy
   * Bees II and III are x1.6 and x2.1), since the bees made year 1 a walkover
   * (a median take of 1.62 times the quota).
   */
  beesTimes: 1.2,
  /** Busy Bees reaches the crop below a sunflower too (round 7: only crops near a beehive, the engine's own card). */
  beesSun: false,
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
  /** Round 7: a run's first stall offers an engine, free (checks only: false for none). */
  engines: true,
  /** Engines the first stall offers, of the four (checks set four, so a policy can always take its own). */
  engineChoices: 3,
  /** Hot Beds: the picks a chili gives. */
  hotPicks: 3,
  /**
   * Trellis: the bloom beans and strawberries give each other crop beside them, from this many of them at most. Round 7
   * measured +1 to every crop beside them, beans and strawberries too: bean beds bloomed each other and the vines engine
   * took 2.1 times its year 2 quotas against 1.8 to 2.0 for the others; without that, at +1, 1.5.
   */
  vinesBloom: 2,
  vinesCap: 1,
  /** Strawberries bloom their neighbours with Trellis too. */
  vinesBerry: true,
  /** Beans and strawberries take Trellis' bloom from each other too (round 7: no). */
  vinesSelf: false,
  /** Checks only: the vines engine's stock holds strawberries; its pick brings beans. */
  vinesStockBerry: true,
  vinesGift: true,
  /**
   * Nights sooner Tall Rows brings corn in (round 7: corn's four nights and three scoops held the tall engine back; at
   * one night sooner it won 24% at round 7's rows, at two 43%, the other engines 40 to 47%).
   */
  tallFast: 2 as number | boolean,
  /** The beehives a crop takes bloom from, at most. */
  hiveCap: 1,
  /** Tall Rows: the bloom corn and sunflowers get for each crop beside them. */
  tallBloom: 1,
  /**
   * Round 7: a hitch is aimed at what the run relies on and offered only if it would cost this run at least this share
   * of a season's take, read from the season just played. The seventh playtest took "sunflowers face up" with no
   * sunflower planted and crows with a scarecrow standing, each 60 to 70 off the quota for nothing.
   */
  minHit: 0.06,
  /** A help is offered only if it would bring this run at least this share of a season's take. */
  minWorth: 0.04,
  /**
   * A hitch's cut (what it still costs a careful player, and `hitchMargin`), times this, is the share it takes off the
   * quota, within these bounds (a heavier one is not offered).
   */
  easeTimes: { glut: 1, frost: 1, crows: 1, rest: 1 } as Partial<Record<TwistId, number>>,
  easeMin: 0.05,
  easeMax: 0.35,
  /**
   * The share of a hitch's expected cost a careful player still pays after playing round it (measured with
   * deck-twists: the decent bot sows elsewhere under frost and grows other crops in a glut, and can do little about a
   * page at rest). Round 8 measured frost at 10.5% played against 25.3% expected (0.6 before), and then, with the
   * levels, frost 13.7 against 33.2, a glut 27.0 against 29.3, a rest 20.6 against 27.2 (deck-twists, 30 runs).
   */
  adapt: { glut: 0.92, frost: 0.42, crows: 0.6, rest: 0.85 } as Partial<Record<TwistId, number>>,
  /**
   * A help's estimate from the season just played, times this, is what it brought when played ahead (deck-twists, the
   * bot's own buying with every card: a buyer brought about half its crop's coins, since the crop is grown less once
   * the season has a new top crop; long picks more than one last pick each, since the perennial stands longer). Round 8
   * re-measured them twice (deck-twists, 30 runs): a buyer brought 1.55 times its estimate both times, long picks 1.5
   * to 1.6 times, good company 1.3 then 0.64 times (1.1 is between), sunflowers all round 0.4 then 1.6 times on few
   * offers (0.3: seldom worth offering).
   */
  worthTimes: { buyer: 1.2, company: 1.1, calm: 0.15, picks: 3, sunall: 0.3 } as Partial<Record<TwistId, number>>,
  /** In a season of crows a crow comes every morning (round 6: twice as often, which cost a few coins). */
  crowEvery: 1,
  /**
   * Round 8: each engine page's number at levels II and III, bought at the stall (level I is `beesTimes`, `hotPicks`,
   * `vinesBloom` and `tallBloom`). The eighth playtest died in every run with 1,979 to 5,711 coins unspent: the scoop
   * was refused, the page slot doubled to 4,000 and year 3 takes stayed flat while the quotas climbed.
   */
  levelUp: { bees: [1.6, 2.1], hot: [4, 6], vines: [3, 6], tall: [2, 2.5] } as Partial<Record<PageId, number[]>>,
  /** What levels II and III cost at the stall (the same in every year). */
  levelPrice: [800, 1800] as number[],
  /** The next level is pinned from the stall before this season on (3 is year 1 winter). */
  levelFrom: 4,
  /**
   * Round 8: a hitch takes off what it would still cost a careful player (`adapt` of its expected cost) and the worth of
   * the help offered beside it; with no help to read, this much. Round 7 took its whole expected cost off: frost cut 25%
   * and cost 10.5% played, a free cut.
   */
  hitchMargin: 0.08,
};

/** The engine pages that level up at the stall (round 8). */
export const LEVELLED: readonly PageId[] = ['bees', 'hot', 'vines', 'tall'];
/** Levels an engine page goes to. */
export const MAX_LEVEL = 3;
const ROMAN = ['', '', 'II', 'III', 'IV'];

/** An engine page's level as kept: I unless bought higher. */
export function pageLevel(s: Partial<Pick<RunState, 'levels'>>, id: PageId): number {
  return s.levels?.[id] ?? 1;
}

/** An engine page's number at a level: Busy Bees' times, Hot Beds' picks, Trellis' and Tall Rows' bloom. */
export function levelNum(id: PageId, level: number): number {
  const first = id === 'bees' ? TUNING.beesTimes : id === 'hot' ? TUNING.hotPicks : id === 'vines' ? TUNING.vinesBloom : id === 'tall' ? TUNING.tallBloom : 0;
  if (level <= 1) return first;
  const up = TUNING.levelUp[id] ?? [];
  return up[Math.min(up.length, level - 1) - 1] ?? first;
}

/** The number at work for this run's page (its level). */
export function engineNum(s: Partial<Pick<RunState, 'levels'>>, id: PageId): number {
  return levelNum(id, pageLevel(s, id));
}

/** A page's name at a level: "Busy Bees II". */
export function levelName(name: string, level: number): string {
  return level >= 2 ? `${name} ${ROMAN[level] ?? level}` : name;
}

/**
 * An engine page's rule at a level, in the page's own words ("Crops near a beehive get x1.5 bloom."), so the stall
 * says what the next level does in the same terms as the page. Level I is the page as printed.
 */
export function levelText(id: PageId, level: number): string | null {
  const n = levelNum(id, level);
  switch (id) {
    case 'bees':
      return `Crops near a beehive get x${n} bloom.`;
    case 'hot':
      return `Chilies stay and pick for ${n} nights.`;
    case 'vines':
      return `Beans and strawberries give the other crops beside them +${n} bloom.`;
    case 'tall':
      return `Corn ripens two nights sooner. Tall crops get +${n} bloom for each neighbour.`;
    default:
      return null;
  }
}

/** What the next level does, said against what it does now: "Crops near a beehive get x1.5 bloom, not x1.3." */
export function levelChange(id: PageId, to: number): string | null {
  const t = levelText(id, to);
  if (!t) return null;
  const n = levelNum(id, to - 1);
  const was = id === 'bees' ? `x${n}` : id === 'hot' ? `${n}` : `+${n}`;
  return `${t.replace(/\.$/, '')}, not ${was}.`;
}

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

/**
 * The share a twist takes off its season's quota: a hitch pays for itself, by what it is expected to cost this run
 * (set when it is offered); a help takes nothing off. A save from before round 7 has the old fixed shares.
 */
export function twistEase(t: Twist | null | undefined): number {
  if (!t) return 0;
  return t.ease ?? TUNING.hitchEase[t.id] ?? 0;
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

/** Frost on a row (the one the run sowed most, named by the twist): nothing can be sown there this season. */
export function frosted(s: Pick<RunState, 'twist' | 'cols' | 'rows'>, i: number): boolean {
  return s.twist?.id === 'frost' && Math.floor(i / s.cols) === (s.twist.row ?? s.rows - 1);
}

/** Is this page at work on night n from tonight: kept, and not resting this season (a twist)? */
export function pageOn(s: Pick<RunState, 'pages' | 'twist' | 'day'>, id: PageId, n = 0): boolean {
  if (!s.pages.includes(id)) return false;
  const t = twistOn(s, n);
  return !(t?.id === 'rest' && t.page === id);
}

/**
 * Picks a crop gives before it leaves: one more for beans and strawberries in a season of long picks; a chili picks
 * for three nights with Hot Beds.
 */
export function picksOf(s: Pick<RunState, 'twist' | 'day'> & Partial<Pick<RunState, 'pages' | 'levels'>>, kind: SeedId, n = 0): number {
  let p = SEEDS[kind].picks;
  if (kind === 'chili' && s.pages && pageOn(s as Pick<RunState, 'pages' | 'twist' | 'day'>, 'hot', n)) p = engineNum(s, 'hot');
  return p > 1 && twistOn(s, n)?.id === 'picks' ? p + 1 : p;
}

/** A season's tally, empty. */
export function newTally(rows: number): Tally {
  return { take: 0, harvests: 0, kinds: {}, rows: new Array(rows).fill(0), rowKinds: Array.from({ length: rows }, () => ({})), from: {}, pests: 0, company: 0, last: 0 };
}

/** Is this crop a perennial (it picks more than once, as things stand)? */
export function perennial(kind: SeedId): boolean {
  return SEEDS[kind].picks > 1;
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
