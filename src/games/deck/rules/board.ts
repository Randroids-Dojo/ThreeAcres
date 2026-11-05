// Board geometry and the numbers that set a run's pace. Plots are indexed in
// reading order: row by row, left to right, which is also the harvest order.

import { cardText, CELLAR_YIELD, SEEDS } from './cards';
import type { CardId, Crop, PageId, Plot, RunState, Season, SeedId, Tally, Twist, TwistId } from './types';

/** Tunable numbers. The balance bot sweeps these; the game uses them as they are. */
export const TUNING = {
  /**
   * Year 1's quotas, spring to winter. Round 7 raised summer to winter (260, 300, 350): every run takes an engine at its
   * first stall, and at the old row the decent bot met year 1 97% of the time at 1.6 to 2 times the quota. Round 8
   * (320, 400, 470 before): with an engine year 1 was free (the eighth playtest's bees took 721 against 320, Tall Rows
   * 1,282 against 400; the bot's median take was 1.62 times the quota with bees, 1.65 with corn). Round 9 (170, 360, 480,
   * 590 before): a dealt first hand and a spring of 160, and summer to winter raised with every engine on offer and the
   * starts of the four evened (deck-fit, 150 runs each: every engine clears year 1 86 to 89% of the time). Round 10:
   * spring 150 (160): the tenth playtest's no-engine run ended its first spring 158 of 160, before any choice; summer to
   * winter 410, 540, 680 (380, 500, 640), with years 2 and 3, so every season asks about the same share of its take: three
   * corn took the tall engine's year 1 median to 1.59 times 380, 500, 640. Round 11: spring 140 (150): a first hand with no
   * spare radish takes about 4% less, and the greedy preview-follower met 150 96% of the time, 98% before.
   */
  quotas: [140, 410, 540, 680] as number[],
  /**
   * Year 2's. Takes grow faster through year 2 than year 1, so it has its own row. Round 4 set years 2 and 3 against
   * the strong builds (roots with the Cellar, bloom with Busy Bees, perennials), which ran at 1.8 to 2.5 times the old
   * quotas: a run that clears year 2 no longer all but surely clears year 3, and the combos are needed to win. Round 6
   * raised summer to winter (600, 710, 790 before): the sixth playtest called year 2 a walkover once a build exists.
   * Round 7 (430, 620, 740, 830 before) prices them against the four engines every run now builds (deck-fit): each
   * engine wins 31 to 40% at these rows. Round 8 (540, 860, 1,060, 1,200 before): the engine pages level up, so years
   * 2 and 3 climb a step each season from a year 2 spring that is no walkover (round 7's bot took 1.85 times 540).
   * Round 9 (730, 920, 1,080, 1,220 before): the bots took 1.55 to 1.76 times year 2 spring, the stall before it bringing
   * the engine's level II and the first twist; raised so no engine's median season runs past about 1.6 times its quota.
   * Round 10 (840, 1,030, 1,200, 1,370 before): year 2 was easy and year 3 a wall (the tenth playtest took 1.3 to 2.1
   * times its year 2 quotas, then failed year 3 autumn; the decent bot met year 3 autumn 74 to 78% of the time). Priced
   * with deck-fit (200 runs, every engine and bot) so the decent bot's median take sits at 1.35 to 1.55 times every
   * season's quota and the engines win 31 to 41%: hitches cut about what they cost now, so the bots' quotas are lower
   * by less, and a raised row meets a median of about 1.4 sooner than it would have. Asked to run under 1.4 every season,
   * the wins fall under 30%: the takes spread too widely from run to run for every season to sit that close.
   */
  quotas2: [900, 1090, 1250, 1540] as number[],
  /**
   * Year 3's, the last: its winter is the finish line. A fixed row that grows through the year, so earning more never
   * makes the game harder: round 5 set year 3 at least 0.95 times the run's own year 2 autumn and winter, which pushed
   * the sixth playtest's every year 3 quota to a flat 1,550 ("Spring asks 1550", up from 630, with no reason given),
   * and every extra coin earned in year 2 raised next year's quotas, so holding back paid. Round 7: 900, 980, 1,060,
   * 1,140 before the engines. Round 8: 1,250, 1,350, 1,450, 1,550 before the levels. Round 9: 1,440, 1,640, 1,820 and
   * 2,000 before, with level IV to buy. Round 10: 1,560, 1,760, 1,940, 2,000 before: autumn stepped 180 over a summer
   * whose take had stopped growing (the wall), and winter only 60, the plot at its fullest. See `quotas2`.
   */
  quotas3: [1700, 1860, 2020, 2250] as number[],
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
   * then 106 with day 6's second radish) meets it on the last night. Round 9: 75, since day 3 deals a radish or a
   * carrot, not both: the careful line takes the radish and has 73 by day 5 and 84 by day 6; made to take the carrot,
   * 83 and 94. Round 10 kept 75: the tenth playtest met it with 80 on night 5, the carrot's line, but at 80 (with a third
   * radish on day 6) deck-lessons' line by the notes ended a desktop spring 75 of 80, and at 85 the decent bot missed it in
   * 11% of its runs. Stakes on day 6 are not worth a first season lost by following the notes (deck-guided-days).
   */
  guidedQuota: 75,
  /**
   * The guided run's summer, its first season played without set hands. At 88% of the usual (230) it was the
   * tightest season of year 1 for the bot (a median take of 1.19 times it, against 1.40 to 1.59 for the rest), and the
   * sixth playtest missed it by 5 playing carefully with every preview: the run ended in its first season on its own.
   * Round 7: 240 (180 before), since the guided run takes an engine at its first stall: at 180 the guided bot took a
   * median 2.3 times it (its takes: 5% under 297, 10% under 314, median 416). Round 9: 330 (240 before): the ninth
   * playtest took 457 of 240 and met it on night 3, and the careful line took a median 1.82 times it, the walkover of
   * a guided year that then ended in winter. Round 11: 260 (330 before), with the engine's card dealt in that season's
   * first hand: the eleventh playtest followed every lesson and every preview and took 259 of 330 from a nearly bare plot,
   * with the hive first in hand on day 3 and 309 coins unspent. The bot clears it; the new player does not look ahead.
   */
  guidedSummer: 270,
  /**
   * A guided first run's year 1 autumn and winter are this much of the usual: its first stall had fewer coins to spend.
   * Round 9: of the raised row, 440 and 560 (420 and 520 before). At 0.92 (460 and 590) the bots met each season at
   * 1.27 to 1.42 times its quota but the guided bot cleared year 1 76% of the time (deck-seasons, 200 runs). Round 11: 0.86,
   * 460 and 580 (480 and 600 before): a player who reads the previews and looks no further (the novice in deck-players)
   * got through the guided year in 35 runs of 100 at the old row, 52 at the old autumn and winter with the summer's fix, 63 at this.
   */
  firstYear: 0.86,
  /**
   * A guided first run's year 2 is this much of the usual, about round 5's row (400, 580, 690, 770): round 6 raised year
   * 2 from summer for the built plots, and at the full rate the guided bot cleared year 2 22% of the time against the
   * decent bot's 30% (34% at this). Round 11: 0.85 (0.93): with autumn and winter eased, year 2 spring stepped 1.45 times over
   * the guided winter, against 1.32 for every other run, and the novice met it 51% of the time (64% at this).
   */
  guidedYear2: 0.85,
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
  /**
   * Round 11: scoops a day Tall Rows adds. Corn costs three, on some dawns the bench holds three, and the eleventh
   * playtest's tall run paid a 144 corn on its first night and 14 on another. Tried against a corn that puts two scoops
   * back (deck-crops, 150 runs, nights under a third of a night's share of the quota, the biggest harvest's share of its
   * season): 19% and 26% as it was, 18% and 26% with two scoops back, 16% and 22% with this and the gentler bloom below.
   */
  tallScoop: 1,
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
   * (a median take of 1.62 times the quota). Round 10: x1.5, on no root: it no
   * longer lands on the carrots ringed by radishes that made most of its coins. Round 11: x1.6: the greedy preview-follower
   * cleared year 1 70% of the time with it, the least of the four (78% at this).
   */
  beesTimes: 1.6,
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
  /**
   * Engines the first stall offers, of the four. Round 9: all four (three before): the ninth playtest's runs 2 and 3
   * were never offered the bees, and the engine a run is handed decided it.
   */
  engineChoices: 4,
  /** Hot Beds: the picks a chili gives. */
  hotPicks: 3,
  /**
   * Hot Beds: the bloom a chili gives each crop beside it, by the page's level (I, II, III, IV); x1.5 without the page.
   * Round 9: the levels raise this, not the picks (the ninth playtest's hot run met year 1 summer by 6 coins and died in
   * autumn: its best harvest was 42, as x1.5 on a bloom of 1 or 2 never got going, and levels came only in year 2).
   * Round 10 (1.6, 1.75, 1.9, 2 before): x1.7 at level I, its raised heat on no radish or carrot: the tenth playtest's
   * first summer previewed a carrot at 8 and a strawberry at 10; chilies side by side are where its value shows. Round 11:
   * x1.75 to x2.05 (1.7 to 2), capped at two chilies (`chiliCap`): at the old row the decent bot won 24% with it and the
   * other engines 33 to 39; at this it wins 36 and the greedy preview-follower 46 (33 to 37).
   */
  hotTimes: [1.75, 1.85, 1.95, 2.05] as number[],
  /**
   * Round 10: checks only. True lets the engine pages' bonuses land on radishes and carrots as they did before round 10;
   * shipped, Busy Bees, Hot Beds' raised heat and Trellis skip them (Tall Rows is corn's and the sunflower's own).
   */
  engineRoots: false,
  /** Round 10: the ledger says what is still to go from this day of a season (5 before: the last two days). */
  toGoFrom: 4,
  /**
   * The chilies a crop takes bloom from, at most. Round 11: two (no cap before): x1.7 to x2 for each chili beside it stacked
   * without end while Trellis applies once and hives are capped at one. The eleventh playtest's harvests hit 257 and 347 in
   * year 2, a night paid 668, its takes ran 2.4 and 2.6 times the quotas, and year 2 spring was met on night 2 of 6.
   */
  chiliCap: 2,
  /**
   * Round 9: the cards a run's first hand is dealt from the tin before it draws up (not the guided run, whose days are
   * set). The ninth playtest's run 4 drew no carrot in its first two hands and its spring ended at 146 of 170.
   */
  firstHand: ['carrot', 'radish'] as CardId[],
  /**
   * Round 11: the dear seed a run's first hand is dealt beside its carrot and radish, one of these by run. The rest draws
   * from the tin with no spare radish, no other dear seed and one can at most (`firstDraw`). All four of the eleventh playtest's later runs
   * opened with the same move, carrot, radishes beside it, can: the hand's spare radishes and can were always the most the
   * previews offered for the scoops. A run counts through these; one with no record picks by its seed.
   */
  firstLeads: ['beans', 'strawberry', 'sunflower'] as CardId[],

  /**
   * Trellis: the bloom beans and strawberries give each other crop beside them, from this many of them at most. Round 7
   * measured +1 to every crop beside them, beans and strawberries too: bean beds bloomed each other and the vines engine
   * took 2.1 times its year 2 quotas against 1.8 to 2.0 for the others; without that, at +1, 1.5. Round 10: +1.25 (+2.5):
   * it no longer lands on roots, and beans and strawberries take it from each other, so a bed of them is the layout.
   */
  vinesBloom: 1.25,
  vinesCap: 1,
  /** Strawberries bloom their neighbours with Trellis too. */
  vinesBerry: true,
  /** Beans and strawberries take Trellis' bloom from each other too (round 7: no; round 10: yes, the vines' own bed). */
  vinesSelf: true,
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
  /**
   * Tall Rows: the bloom corn and sunflowers get for each crop beside them. Round 11: 0.8 (1 before), with the scoop it
   * now brings (`tallScoop`): more corn, each a smaller feast. At +1 with the scoop the tall engine won 68%.
   */
  tallBloom: 0.8,
  /**
   * Round 7: a hitch is aimed at what the run relies on and offered only if it would cost this run at least this share
   * of a season's take, read from the season just played. The seventh playtest took "sunflowers face up" with no
   * sunflower planted and crows with a scarecrow standing, each 60 to 70 off the quota for nothing.
   */
  minHit: 0.06,
  /**
   * A help is offered only if it would bring this run at least this share of a season's take. Round 9: 8% (4% before):
   * the ninth playtest's corn run was offered buyers of sunflowers for 35 coins, lettuce for 50 and radishes for 65
   * against quotas of 730 to 920.
   */
  minWorth: 0.08,
  /**
   * A hitch's cut (what it still costs a careful player, and `hitchMargin`), times this, is the share it takes off the
   * quota, within these bounds (a heavier one is not offered).
   */
  easeTimes: { glut: 1, frost: 1, crows: 1, rest: 1 } as Partial<Record<TwistId, number>>,
  easeMin: 0.05,
  /** Round 10: 0.45 (0.35): a cut is in coins of a take that can be 1.6 times its quota (`takeRatio`). */
  easeMax: 0.45,
  /**
   * Round 9: when no pair of twists keeps the cut within `easeMax`, the lightest pair is offered with its cut in full,
   * up to this, so the hitch still takes off what it costs and a share of what the help brings (the cap used to clip it).
   */
  easeHard: 0.7,
  /**
   * The share of a hitch's expected cost a careful player still pays after playing round it (measured with
   * deck-twists: the decent bot sows elsewhere under frost and grows other crops in a glut, and can do little about a
   * page at rest). Round 8 measured frost at 10.5% played against 25.3% expected (0.6 before), and then, with the
   * levels, frost 13.7 against 33.2, a glut 27.0 against 29.3, a rest 20.6 against 27.2 (deck-twists, 30 runs).
   * Round 10 (glut 0.92, rest 0.85 before): a glut said 294 coins and cost 231 played, a rest said 551 and cost 602
   * (deck-twists, 200 runs played ahead two plays deep after the stall's shopping); frost is priced by `frostRoom`.
   */
  adapt: { glut: 0.72, frost: 0.42, crows: 0.6, rest: 0.95 } as Partial<Record<TwistId, number>>,
  /**
   * A help's estimate from the season just played, times this, is what it brought when played ahead (deck-twists, the
   * bot's own buying with every card: a buyer brought about half its crop's coins, since the crop is grown less once
   * the season has a new top crop; long picks more than one last pick each, since the perennial stands longer). Round 8
   * re-measured them twice (deck-twists, 30 runs): a buyer brought 1.55 times its estimate both times, long picks 1.5
   * to 1.6 times, good company 1.3 then 0.64 times (1.1 is between), sunflowers all round 0.4 then 1.6 times on few
   * offers (0.3: seldom worth offering). Round 10 (buyer 1.2, company 1.1, picks 3, sunall 0.3 before; in coins of the
   * run's take now, `takeRatio`): a buyer said 233 coins and brought 172, good company 383 and 341, long picks 330 and
   * 254 (deck-twists, 200 runs played ahead as the run plays).
   */
  worthTimes: { buyer: 0.81, company: 0.85, calm: 0.15, picks: 0.85, sunall: 0.2 } as Partial<Record<TwistId, number>>,
  /** In a season of crows a crow comes every morning (round 6: twice as often, which cost a few coins). */
  crowEvery: 1,
  /**
   * Round 8: each engine page's number at levels II and III, bought at the stall (level I is `beesTimes`, `hotPicks`,
   * `vinesBloom` and `tallBloom`). Round 9: and IV; Hot Beds' levels are `hotTimes` now (these picks only if its
   * bloom is set back to a flat x1.5). The eighth playtest died in every run with 1,979 to 5,711 coins unspent: the scoop
   * was refused, the page slot doubled to 4,000 and year 3 takes stayed flat while the quotas climbed. Round 10: Busy Bees'
   * and Trellis' rows are set against crops other than radishes and carrots; Tall Rows' is unchanged, with a third corn.
   */
  levelUp: { bees: [1.75, 2, 2.3], hot: [4, 6, 6], vines: [1.45, 1.7, 1.9], tall: [1.15, 1.4, 1.6] } as Partial<Record<PageId, number[]>>,
  /** What levels II, III and IV cost at the stall (the same in every year). */
  levelPrice: [800, 1800, 3600] as number[],
  /**
   * The engine page's last level. Round 9: IV (III before), the late use for coins: the ninth playtest's won run had
   * 4,736 coins after its page reached III, then 7,040, then 8,908, with nothing left to buy.
   */
  maxLevel: 4,
  /** The next level is pinned from the stall before this season on (3 is year 1 winter). */
  levelFrom: 4,
  /**
   * Round 8: a hitch takes off what it would still cost a careful player (`adapt` of its expected cost) and the worth of
   * the help offered beside it; with no help to read, this much. Round 7 took its whole expected cost off: frost cut 25%
   * and cost 10.5% played, a free cut.
   */
  hitchMargin: 0.08,
  /**
   * Round 10: the share of the help's worth a hitch's cut adds to its careful cost (round 8 added all of it, so the cut
   * ran about twice what the hitch cost when played and the hitch was nearly always the better pick: frost cut 348 coins
   * and cost 158, a glut cut 399 and cost 211, and the bot took the hitch at 62% of stalls). Round 11: 0.1 (0.25): the rest of
   * the help's worth comes as the merchant's coins (`hitchPay`), and with more of it on the quota the bots took the hitch
   * at 48 to 60% of stalls.
   */
  helpShare: 0.1,
  /**
   * Round 10: a twist's share of a season's take is said, and cut, in coins of the take the run is making: its last
   * season's take over its quota, between 1 and this. The stall said a share of the quota, so a run taking 1.45 times its
   * quota read "About 112 fewer coins." for a frost that cost 167 played (deck-twists, 200 runs).
   */
  takeMax: 1.6,
  /** Round 10: a help is paired with a hitch if its worth is within this of the worth that weighs the same (`pairWorth`). */
  pairNear: 0.04,
  /** Round 10: a hitch stays on the offer if some help comes within this of weighing the same, or none comes nearer. */
  pairSpread: 0.05,
  /**
   * Round 10: the share of a frosted row's coins a careful player still loses, by the room on the rest of the plot at
   * dusk (bare plots on the other rows, on average): `top - per x room`, between `least` and `most`. Measured with the
   * play-ahead of deck-twists (591 rows priced, decent bot): 1.13 with under one bare plot, 0.97 with one or two, 0.75
   * with two or three, 0.62 with three to five, 0.52 with more. Scaled to what it cost in all (at 1.3 - 0.18 x room it
   * said 201 coins and cost 174).
   */
  frostRoom: { top: 0.97, per: 0.134, least: 0.45, most: 1 },
  /** Round 10: checks only. True aims hitches at free crops too (a glut of radishes, frost on their row), as before. */
  freeHitch: false,
};

/** The engine pages that level up at the stall (round 8). */
export const LEVELLED: readonly PageId[] = ['bees', 'hot', 'vines', 'tall'];
/** Levels an engine page goes to (TUNING.maxLevel is what the rules read). */
export const MAX_LEVEL = 4;
const ROMAN = ['', '', 'II', 'III', 'IV', 'V'];

/** An engine page's level as kept: I unless bought higher. */
export function pageLevel(s: Partial<Pick<RunState, 'levels'>>, id: PageId): number {
  return s.levels?.[id] ?? 1;
}

/** An engine page's number at a level: Busy Bees' times, Hot Beds' picks, Trellis' and Tall Rows' bloom. */
export function levelNum(id: PageId, level: number): number {
  if (id === 'hot' && hotLevels()) return TUNING.hotTimes[Math.max(0, Math.min(TUNING.hotTimes.length, level) - 1)] ?? 1.5;
  const first = id === 'bees' ? TUNING.beesTimes : id === 'hot' ? TUNING.hotPicks : id === 'vines' ? TUNING.vinesBloom : id === 'tall' ? TUNING.tallBloom : 0;
  if (level <= 1) return first;
  const up = TUNING.levelUp[id] ?? [];
  return up[Math.min(up.length, level - 1) - 1] ?? first;
}

/** Round 9: Hot Beds' levels raise the chili's bloom (its picks stay at `hotPicks`) once `hotTimes` climbs. */
export function hotLevels(): boolean {
  return TUNING.hotTimes.some((v) => v !== TUNING.hotTimes[0]) || TUNING.hotTimes[0] !== 1.5;
}

/** The bloom a chili gives each crop beside it on night n: x1.5, or Hot Beds' at its level. */
export function chiliTimes(s: Pick<RunState, 'pages' | 'twist' | 'day'> & Partial<Pick<RunState, 'levels'>>, n = 0): number {
  return pageOn(s, 'hot', n) && hotLevels() ? engineNum(s, 'hot') : 1.5;
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
export function levelText(id: PageId, level: number, roots = true): string | null {
  const n = levelNum(id, level);
  // Round 10: an engine page never blooms radishes and carrots, and says so in a short line of its own. Round 11: every
  // number said as what a 10 coin crop pays, or what a corn gains: "x1.7 bloom" and "+1.25 bloom" read as sums.
  const not = roots && !TUNING.engineRoots ? ' Not radishes or carrots.' : '';
  switch (id) {
    case 'bees':
      return `Near a beehive, a 10 coin crop pays ${tenCoin(n)}.${not}`;
    case 'hot':
      // A chili's own x1.5 stays on radishes and carrots: the chili's card says so (`cardLine`), not the page.
      return hotLevels() ? `Chilies pick for ${TUNING.hotPicks} nights. A 10 coin crop pays ${tenCoin(n)} beside one, ${tenCoin(n * n)} beside two.` : `Chilies stay and pick for ${n} nights.`;
    case 'vines':
      return `By beans or strawberries, a 10 coin crop pays ${tenCoin(1 + n)}.${not}`;
    case 'tall':
      return `One more scoop a day. Corn ripens two nights sooner. Crops beside it add ${Math.round(SEEDS.corn.base * n)} coins.`;
    default:
      return null;
  }
}

const tenCoin = (times: number) => Math.round(10 * times);

/**
 * What the next level does, said against what it does now: "Near a beehive, a 10 coin crop pays 17, not 15." (the page's
 * own line says it leaves radishes and carrots out).
 */
export function levelChange(id: PageId, to: number): string | null {
  const n = levelNum(id, to);
  const was = levelNum(id, to - 1);
  switch (id) {
    case 'bees':
      return `Near a beehive, a 10 coin crop pays ${tenCoin(n)}, not ${tenCoin(was)}.`;
    case 'hot':
      return hotLevels() ? `A 10 coin crop pays ${tenCoin(n)} beside a chili, not ${tenCoin(was)}.` : `Chilies stay and pick for ${n} nights, not ${was}.`;
    case 'vines':
      return `By beans or strawberries, a 10 coin crop pays ${tenCoin(1 + n)}, not ${tenCoin(1 + was)}.`;
    case 'tall':
      return `Crops beside a corn add ${Math.round(SEEDS.corn.base * n)} coins, not ${Math.round(SEEDS.corn.base * was)}.`;
    default:
      return null;
  }
}

/**
 * A card's rule as this run reads it (round 11). With Hot Beds kept a chili says the page's number at its level: the
 * eleventh playtest's stall slip still said x1.5 with Hot Beds IV kept.
 */
export function cardLine(id: CardId, up: boolean, s: Partial<Pick<RunState, 'pages' | 'levels'>>): string {
  if (id === 'chili' && s.pages?.includes('hot') && hotLevels()) return `A 10 coin crop beside it pays ${tenCoin(engineNum(s, 'hot'))}. Two chilies at most.`;
  return cardText(id, up);
}

/**
 * Round 10: the coins still to go that the ledger shows ("64 to go"), or 0 when it shows none: from day 4 of a season
 * (`toGoFrom`) until the quota is met. It came on days 5 and 6, and the tenth playtest's no-engine run ended its first
 * spring 158 of 160 before it had made a choice.
 */
export function toGo(s: Pick<RunState, 'quota' | 'earned' | 'day'>, take = s.earned, day = s.day): number {
  return day >= TUNING.toGoFrom && take < s.quota ? s.quota - take : 0;
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
  if (kind === 'chili' && s.pages && pageOn(s as Pick<RunState, 'pages' | 'twist' | 'day'>, 'hot', n)) p = hotLevels() ? TUNING.hotPicks : engineNum(s, 'hot');
  return p > 1 && twistOn(s, n)?.id === 'picks' ? p + 1 : p;
}

/** A season's tally, empty. */
export function newTally(rows: number): Tally {
  return { take: 0, harvests: 0, kinds: {}, rows: new Array(rows).fill(0), rowKinds: Array.from({ length: rows }, () => ({})), from: {}, pests: 0, company: 0, last: 0, empty: new Array(rows).fill(0), dusks: 0 };
}

/** Is this crop a perennial (it picks more than once, as things stand)? */
export function perennial(kind: SeedId): boolean {
  return SEEDS[kind].picks > 1;
}

/** The bench's morning refill: three scoops, one more for Green Thumb, one for the Long Furrow, one for Tall Rows (round 11), and any bought for good. */
export function energyMax(s: Pick<RunState, 'pages' | 'scoops'>): number {
  return TUNING.energy + (s.pages.includes('thumb') ? 1 : 0) + (s.pages.includes('furrow') ? 1 : 0) + (s.pages.includes('tall') ? TUNING.tallScoop : 0) + (s.scoops ?? 0);
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

/**
 * Round 9: the plots a crow about tonight could take a crop from: ripe by the harvest, and no scarecrow guards them.
 * The ninth playtest was told "Your scarecrow keeps watch." while D4 sat outside its 3 by 3, and the crow took the
 * carrot there.
 */
export function crowReach(s: RunState): number[] {
  return s.plots.map((p, i) => (p.crop && ripeTonight(s, i) && !guarded(s, i) ? i : -1)).filter((i) => i >= 0);
}

/** Round 10: radishes and carrots, the root ring: no engine page's bonus lands on them (`TUNING.engineRoots`). */
export function isRoot(kind: string): boolean {
  return kind === 'radish' || kind === 'carrot';
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
