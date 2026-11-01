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
  water: 1,
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
    { cost: 1500, rep: 10, name: 'Gold can' },
  ],
  hoe: [
    { cost: 300, rep: 2, name: 'Copper hoe' },
    { cost: 1200, rep: 8, name: 'Gold hoe' },
  ],
};

/** Town requests open at once under the homestead: one until the first is filled, then two, never more. */
export const REQUEST_SLOTS = 2;
export function requestSlots(rep: number): number {
  return rep >= 1 ? REQUEST_SLOTS : 1;
}
/** A request pays what its crops fetch at market and at most this much more (a fifth), ... */
export const REQUEST_PREMIUM = 1.2;
/** ... and never more than this many coins over market. */
export const REQUEST_EXTRA = 60;
/** The most a request asks for (so two of them can still outgrow two fields of free soil), or five of the big crops. */
export const REQUEST_MAX = 20;
export const REQUEST_MAX_BIG = 5;
/** Days a request leaves to get the seed in, beyond its crop's growing time. */
export const REQUEST_SLACK = [2, 3] as const;
/** The chance a morning pins a second request while one is open. */
export const REQUEST_CHANCE = 0.6;
/** Sunup's fields beyond the first: the reputation the land agent wants before he sells each (by field id). */
export const FIELD_REP = [0, 0, 2, 4, 6, 8] as const;
/** Sunup: in the last days of a season the next season's seeds can go in, so the turn takes nothing you could have planned for. */
export const SEASON_PREVIEW_DAYS = 3;
export const HAND_SLOWER = 1.4;

/** Tiles per second. */
export const WALK_SPEED = 4.2;
export const HAND_SPEED = 3;
/** Point-and-turns hops are quick: seconds per hop. */
export const HOP_SECONDS = 0.16;

export const BUILD_COST: Record<BuildKind, number> = { scarecrow: 40, sprinkler: 120 };
export const SCARECROW_RADIUS = 3;

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
