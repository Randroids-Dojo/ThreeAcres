// Tuning. Times are game minutes unless they say seconds.

import type { BuildKind, Verb } from './types';

/** 6:00 to midnight. */
export const DAY_MINUTES = 1080;
export const DAYS_PER_SEASON = 10;

/**
 * Day clock: real seconds from 6:00 to midnight. Sized so a dry day's work on
 * a farm of two or three fields, at a person's pace, runs to early afternoon
 * (the can wets a plot for one night, so dry days mean watering), and stamina
 * (with Sunup's cheaper actions) lasts about as long as the work.
 * `npx tsx scripts/balance.ts` measures both.
 */
export const DAY_SECONDS = 120;
/**
 * Sunup's day, real seconds from 6:00 to midnight, by fields owned. The
 * fourth playtest found the last job done between 8 and 11 most days, after
 * 15 to 40 seconds of work, with the rest of a 120-second day empty. A
 * one-field farm now has a minute, and the day grows with the farm.
 */
export const SUNUP_DAY_SECONDS = [60, 75, 90, 105, 120, 120] as const;
/** Flow clock: real seconds per day at speed 1. */
export const FLOW_SECONDS = 60;
export const FLOW_SPEEDS = [0, 1, 2, 4] as const;

/** Night transition length, real seconds, per clock. The day turns over at the midpoint. */
export const NIGHT_SECONDS = { day: 2.4, turns: 1.6, flow: 0.9 } as const;

export const STAMINA_MAX = 100;
export const AP_MAX = 12;

/** Stamina per verb under the day clock. Turns charge one move for each, scaring included. Clearing a withered crop is free. */
export const STAMINA_COST: Record<Verb, number> = {
  till: 2,
  water: 2,
  plant: 1,
  harvest: 1,
  tend: 1,
  clear: 0,
  build: 2,
  scare: 0,
  refill: 0,
};

/** Real seconds an action takes to perform (farmer). Hands are slower. */
export const ACTION_SECONDS: Record<Verb, number> = {
  till: 0.5,
  water: 0.45,
  plant: 0.35,
  harvest: 0.35,
  tend: 0.5,
  clear: 0.45,
  build: 0.6,
  scare: 0.25,
  refill: 0.7,
};

/** Sunup: the moisture a can's watering leaves, enough for one night (rain leaves 3, two nights). */
export const CAN_MOISTURE = 2;
/** Water the can holds at each level. */
export const CAN_WATER = [12, 24, 40] as const;

/** Tool upgrades: coins, and the town reputation needed before the smith will make them. */
export const TOOL_UPGRADES: Record<'can' | 'hoe', { cost: number; rep: number; name: string }[]> = {
  can: [
    { cost: 400, rep: 3, name: 'Copper can' },
    { cost: 1500, rep: 8, name: 'Gold can' },
  ],
  hoe: [
    { cost: 300, rep: 2, name: 'Copper hoe' },
    { cost: 1200, rep: 6, name: 'Gold hoe' },
  ],
};

/** Town requests open at once under the homestead: one until the first is filled; after that a pair on offer and what is under way. A pair comes only while fewer than this are open. */
export const REQUEST_SLOTS = 4;
export function requestSlots(rep: number): number {
  return rep >= 1 ? REQUEST_SLOTS : 1;
}
/**
 * What a request pays over market (its gain), round 5. The fourth playtest's
 * pairs were priced to earn the same for each plot and day, and the fifth
 * found them identical ("corn 675 over 42 against sunflower 675 over 42"):
 * no decision. Now the two of a pair differ in kind (`RequestKind`): a bold
 * one (more gain, and more soil, more days or no day to spare) against a safe
 * one. The safe one pays `REQUEST_RATE` for each plot and day its sowing
 * takes; the bold one is priced so the two come out alike for a typical farm
 * (each plot-day of soil worth `REQUEST_SOIL`, and one request in five that
 * has no day to spare lost, `REQUEST_RISK`). Which is better then turns on
 * the farm: its free soil, coins, stamina and the forecast.
 */
export const REQUEST_RATE = 5;
/**
 * What a plot-day of soil is worth to a typical farm, by the sort of pair: a plot held days longer (long against
 * quick) ties up coins and soil that would have been sown again, so it is worth more than one more plot held for the
 * same days (big against small). Tuned on `scripts/balance.ts --pairs`: with one value for both (3), the quick one
 * beat the long one in 71% of the play-outs that were not a wash, and the big one beat the small one in 69%.
 */
export const REQUEST_SOIL = { risk: 3, time: 5, size: 2, single: 3 } as const;
export const REQUEST_RISK = 0.8;
/** The bold one of a pair offers at least this much more gain than the safe one, or the pair is not offered. */
export const REQUEST_BOLD = 1.2;
/** The most a request's gain over market can be: this much for each plot of owned field, so requests grow with the farm. */
export const REQUEST_GAIN_PER_PLOT = 14;
/** How a bold request is sized against its safe partner, in plot-days: a long crop about twice, a big one about 2.2 times. */
export const REQUEST_SPAN = { long: 2, big: 2.2 } as const;
/** No request asks for more than this share of the farm's plots (a pair is a choice, not the whole farm). */
export const REQUEST_MOST = 0.6;
/** The most a request asks for, or of the big crops. */
export const REQUEST_MAX = 24;
export const REQUEST_MAX_BIG = 8;
/** The least a request asks for. */
export const REQUEST_MIN = 3;
/** Days a request leaves to get the seed in: its sow-by day is this many days after the morning it is pinned. */
export const REQUEST_SOW = [1, 2] as const;
/** When the soil is full, a request may wait this many days for plots to come free (it says so: "Sow 6 by Summer 8"). */
export const REQUEST_LOOK = 6;
/** The share of the farm's plots each sort of request asks to have sown (a pair is a choice, not the whole farm). */
export const REQUEST_SHARE = { rush: 0.32, easy: 0.3, quick: 0.3, small: 0.18, single: 0.3 } as const;
/** A rush request is sown today and due the day it ripens; an easy one is sown by tomorrow with two days to spare; the rest one or two to sow and one to spare (the turn of a season can squeeze them). */
export const REQUEST_GRACE = { rush: 0, easy: 2, other: 1 } as const;
/**
 * Sunup's fields beyond the first: the reputation the land agent wants before he sells each (by field id). Round 5
 * eased the later ones (2, 4, 6, 8): the fifth playtest sat on 1,755 coins by Summer 9 with nothing to buy.
 */
export const FIELD_REP = [0, 0, 2, 3, 5, 7] as const;
/** Sunup: in the last days of a season the next season's seeds can go in, so the turn takes nothing you could have planned for. */
export const SEASON_PREVIEW_DAYS = 3;
export const HAND_SLOWER = 1.4;
/** Sunup: the chance a growing crop gets bugs on a morning, and that bugs left on a crop spread overnight to a neighbour of the same kind, or of another. */
export const BUG_CHANCE = 0.035;
export const BUG_SPREAD = { same: 1, other: 0.5 } as const;
/**
 * Sunup, round 5: some days demand attention. On a dry morning after the
 * scarecrow lesson, crows are about with this chance (a flock day, told on
 * the morning card): one more crow for each field with growing crops, through
 * the afternoon, and crows still to come when the farmer sleeps take a crop
 * each. And at 13:00 bugs land again, as at dawn, so the afternoon has a look
 * worth taking (`MIDDAY_MINUTE`).
 */
export const FLOCK_CHANCE = 0.22;
export const FLOCK_HOURS = [300, 840] as const;
export const MIDDAY_MINUTE = 420;
/** Sunup: the field lesson waits until buying the field leaves this much for seed (the fifth playtest spent 250 of 270 and could not plant it). */
export const FIELD_SEED = 150;
/** Sunup: a crop left dry on a heat wave's night counts this many dry nights (three wither it). */
export const HEAT_DRY = 3;

/** Tiles per second. */
export const WALK_SPEED = 4.2;
export const HAND_SPEED = 3;
/** Point-and-turns hops are quick: seconds per hop. */
export const HOP_SECONDS = 0.16;

export const BUILD_COST: Record<BuildKind, number> = { scarecrow: 40, sprinkler: 200 };
/** Sunup: a sprinkler waters this many mornings (a season), then wears out and is gone, with a word on the morning card. */
export const SPRINKLER_MORNINGS = 10;
export const SCARECROW_RADIUS = 3;
/**
 * Sunup's scarecrow keeps crows off the five by five square around it, but
 * only the plots right beside it for sure: the outer ring of that square
 * (for one in the middle of a field, the field's far row and column) is its
 * edge, where crows still try now and then (`CROW_EDGE`). The fourth
 * playtest found two scarecrows ended the crows for good.
 */
export const SUNUP_SCARECROW_RADIUS = 2;
export const SUNUP_SCARECROW_SURE = 1;

export const HAND_HIRE = 150;
export const HAND_WAGE = 15;
export const HANDS_MAX = 4;
export const HAND_NAMES = ['Ada', 'Bram', 'Cass', 'Dov'];
/** Under turns, each hand does this many jobs during the night. */
export const HAND_NIGHT_JOBS = 6;

/** Wild weather: crows land at a random time and eat after pecking this long. */
export const CROW_PECK_MINUTES = 150;
/** Sunup: before the crow lesson, the one crow a day comes between these minutes (6:30 to 8:00). */
export const CROW_FIRST = [30, 120] as const;
export const CROW_FLY_SECONDS = 1.6;
/** Sunup, after the crow lesson: the chance on a dry morning that a crow comes for each field with crops no scarecrow watches. */
export const CROW_PER_FIELD = 0.65;
/** Sunup: the chance on a dry morning that a crow tries the edge of a field a scarecrow watches (crops only at its edge open). */
export const CROW_EDGE = 0.3;
/** Crops at the edge of a field's watch for `CROW_EDGE` in full (one scarecrow in the middle of a field leaves seven); fewer, less. */
export const CROW_EDGE_FULL = 7;
/** Sunup: real seconds a crow pecks before it takes the crop (the day's length changes with the farm, the crow's patience does not). */
export const SUNUP_CROW_PECK_SECONDS = 15;
export const CROW_SCARE_RANGE = 1.6;

export const START_COINS = 150;

export const ORDER_SLOTS = 3;
export const ORDER_PREMIUM = 1.6;
export const TOWN = [
  'Mabel’s bakery',
  'The Hollow Bend inn',
  'Fen and daughters',
  'The school kitchen',
  'Old Tamsin',
  'The Thursday market',
  'Pell’s pickles',
  'The lighthouse keeper',
];
