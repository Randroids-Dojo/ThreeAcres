// Thistledown's tables: the four kinds of downy, the three foods, down, what
// things cost and the journal. Plain data, read by the sim, the HUD and the save.

export type DownyKind = 'clover' | 'ember' | 'brook' | 'thistle';
export type Food = 'cloverhead' | 'sweetroot' | 'dewberry';
export type FoodGroup = 'greens' | 'roots' | 'fruit';
export type Tuft = 'tuft-clover' | 'tuft-ember' | 'tuft-brook' | 'tuft-thistle';
export type ItemType = Food | Tuft;
/** Anything the bellows can carry. */
export type Thing = DownyKind | ItemType;

export const KINDS: DownyKind[] = ['clover', 'ember', 'brook', 'thistle'];
export const FOODS: Food[] = ['cloverhead', 'sweetroot', 'dewberry'];
export const TUFTS: Tuft[] = ['tuft-clover', 'tuft-ember', 'tuft-brook', 'tuft-thistle'];

export const FOOD_GROUP: Record<Food, FoodGroup> = { cloverhead: 'greens', sweetroot: 'roots', dewberry: 'fruit' };

export interface KindInfo {
  name: string;
  plural: string;
  body: number;
  belly: number;
  accent: number;
  favourite: Food | 'any';
  eats: FoodGroup | 'any';
  value: number;
  /** Hop height on a calm day, m. */
  hop: number;
}

export const KIND: Record<DownyKind, KindInfo> = {
  clover: { name: 'clover downy', plural: 'clover downies', body: 0xb3d07c, belly: 0xf3ecd0, accent: 0x5e9a3e, favourite: 'cloverhead', eats: 'greens', value: 12, hop: 0.55 },
  ember: { name: 'ember downy', plural: 'ember downies', body: 0xf0a060, belly: 0xffdcaa, accent: 0xe0663a, favourite: 'sweetroot', eats: 'roots', value: 20, hop: 0.5 },
  brook: { name: 'brook downy', plural: 'brook downies', body: 0x78a4e4, belly: 0xd6e4f8, accent: 0x4a78c4, favourite: 'dewberry', eats: 'fruit', value: 26, hop: 0.6 },
  thistle: { name: 'thistle downy', plural: 'thistle downies', body: 0xa486d4, belly: 0xe2d6f0, accent: 0x6e4c9e, favourite: 'any', eats: 'any', value: 60, hop: 1.6 },
};

export const FOOD_INFO: Record<Food, { name: string; plural: string; color: number }> = {
  cloverhead: { name: 'clover head', plural: 'clover heads', color: 0xe9a0c4 },
  sweetroot: { name: 'sweetroot', plural: 'sweetroots', color: 0xe08a4a },
  dewberry: { name: 'dewberry', plural: 'dewberries', color: 0x5a62c8 },
};

export const TUFT_KIND: Record<Tuft, DownyKind> = { 'tuft-clover': 'clover', 'tuft-ember': 'ember', 'tuft-brook': 'brook', 'tuft-thistle': 'thistle' };
export const KIND_TUFT: Record<DownyKind, Tuft> = { clover: 'tuft-clover', ember: 'tuft-ember', brook: 'tuft-brook', thistle: 'tuft-thistle' };

export function isDowny(t: Thing): t is DownyKind {
  return t === 'clover' || t === 'ember' || t === 'brook' || t === 'thistle';
}
export function isFood(t: Thing): t is Food {
  return t === 'cloverhead' || t === 'sweetroot' || t === 'dewberry';
}
export function isTuft(t: Thing): t is Tuft {
  return t.startsWith('tuft-');
}

export function thingName(t: Thing, n = 1): string {
  if (isDowny(t)) return n === 1 ? KIND[t].name : KIND[t].plural;
  if (isFood(t)) return n === 1 ? FOOD_INFO[t].name : FOOD_INFO[t].plural;
  return `${TUFT_KIND[t]} fluff`;
}

export function thingColor(t: Thing): number {
  if (isDowny(t)) return KIND[t].body;
  if (isFood(t)) return FOOD_INFO[t].color;
  return KIND[TUFT_KIND[t]].body;
}

export function eats(k: DownyKind, f: Food): boolean {
  const e = KIND[k].eats;
  return e === 'any' || FOOD_GROUP[f] === e;
}

/** The food a hungry downy shows it wants: its favourite, or clover for one that eats anything. */
export function wantedFood(k: DownyKind): Food {
  const fav = KIND[k].favourite;
  return fav === 'any' ? 'cloverhead' : (fav as Food);
}

export function favourite(k: DownyKind, f: Food): boolean {
  const fav = KIND[k].favourite;
  return fav === 'any' || fav === f;
}

// ---------------------------------------------------------------- time

/** Real seconds per game hour: a day lasts 12 real minutes. */
export const HOUR = 30;
/** Hunger per game hour: empty to starving in about three. */
export const HUNGER_RATE = 1 / 3;
/** Hunger runs this much slower for a downy in a pen (sheltered, settled). */
export const PEN_HUNGER = 1 / 3;
/**
 * A penned downy that is already hungry waits patiently: past half hungry its
 * hunger runs at this share again, and at night (it dozes) at this share too.
 * So a pen goes hungry as often as before (the same meals and fluff by day),
 * but a day away or a night with no feeder no longer starves it (the sixth
 * playtest's three clovers woke starving after one night, one over the fence).
 */
export const PEN_PATIENT = 0.5;
export const PEN_DOZE = 0.5;
/** Game hours a downy can stay starving before it gets restless enough to hop a low fence. */
export const NEGLECT_HOURS = 4;

// ---------------------------------------------------------------- builds

export type PadKind = 'empty' | 'pen' | 'garden' | 'silo';
export type PenUp = 'high' | 'feeder' | 'trough' | 'hedge' | 'chute';
export type GardenUp = 'sprinkler' | 'soil' | 'run';

/** A pen holds ten calmly; more than that and they all get frazzled and hop out. */
export const PEN_MAX = 10;

// A pen costs less than the gate's reward, so the first pen for ember downies is affordable the
// moment the ridge opens (the third playtest had 180 coins after the gate and a 250 coin pen).
export const BUILD_COST: Record<Exclude<PadKind, 'empty'>, number> = { pen: 200, garden: 200, silo: 300 };
export const BUILD_NAME: Record<Exclude<PadKind, 'empty'>, string> = { pen: 'Pen', garden: 'Garden', silo: 'Silo' };
export const PEN_UPS: { id: PenUp; name: string; cost: number; line: string }[] = [
  { id: 'high', name: 'High fence', cost: 200, line: 'Keeps thistles in' },
  // Affordable before the first night (it was 300: the sixth playtest's garden had left 88 coins, and the
  // first night with no feeder woke all three clovers starving, one over the fence).
  { id: 'feeder', name: 'Feeder', cost: 150, line: 'Feeds hungry downies' },
  { id: 'trough', name: 'Trough', cost: 150, line: 'Brook downies shed more' },
  { id: 'hedge', name: 'Hedge', cost: 250, line: 'Keeps pests out' },
  { id: 'chute', name: 'Fluff chute', cost: 400, line: 'Gathers fluff in a box' },
];
export const GARDEN_UPS: { id: GardenUp; name: string; cost: number; line: string }[] = [
  { id: 'sprinkler', name: 'Sprinkler', cost: 250, line: 'Grows half again as fast' },
  { id: 'soil', name: 'Rich soil', cost: 300, line: 'Half again to each crop' },
  { id: 'run', name: 'Feed run', cost: 300, line: "Fills the next pen's feeder" },
];
/**
 * A garden grows a small crop often rather than a big one now and then: two
 * every hour and a half (three with rich soil), so every round of tending
 * finds food (the third playtest found nothing in four rounds of nine).
 */
export const GARDEN_HOURS = 1.5;
export const GARDEN_YIELD = 2;
export const GARDEN_YIELD_SOIL = 3;
/**
 * A garden stops growing once this much lies on its bed (it banks food while
 * you are away). With its bed full, a garden beside a pen with a feeder tips
 * its next crops into that feeder, so a garden fills a feeder over time (the
 * sixth playtest: a garden banked 12, a feeder holds 60).
 */
export const GARDEN_PILE = 12;
export const SILO_KINDS = 4;
export const SILO_CAP = 50;
export const FEEDER_CAP = 60;

export type BenchUp = 'slots' | 'cap' | 'range' | 'glide';
export const BENCH_UPS: { id: BenchUp; name: string; costs: number[]; line: string }[] = [
  { id: 'slots', name: 'Fifth window', costs: [800], line: 'Room for one more kind' },
  { id: 'cap', name: 'Bigger jar', costs: [400, 1200], line: 'Holds more of each kind' },
  { id: 'range', name: 'Longer pull', costs: [600], line: 'Reaches ten metres' },
  { id: 'glide', name: 'Glide vanes', costs: [1000], line: 'Hold jump in the air to drift' },
];
export const CAPS = [12, 20, 30];
export const RANGES = [7, 10];

// ---------------------------------------------------------------- the journal

export type GoalId =
  | 'catch'
  | 'pen'
  | 'feed'
  | 'sell'
  | 'plant'
  | 'order'
  | 'herd'
  | 'ridge'
  | 'ember'
  | 'feeder'
  | 'hollow'
  | 'brook'
  | 'thistle'
  | 'orders5'
  | 'prized'
  | 'late'
  | 'streak'
  | 'rares'
  | 'fullclover'
  | 'fullember'
  | 'fullbrook'
  | 'fullthistle'
  | 'rich';

/**
 * The journal, shown one goal at a time. After the gates come the long goals:
 * orders to fill, a prized order, and a full pen of each kind, so the page
 * always has something worth chasing (the third playtest found only the
 * 10,000 coins left after the thistle, then a blank page for good).
 */
export const GOALS: { id: GoalId; text: string; reward: number }[] = [
  { id: 'catch', text: 'Catch a clover downy.', reward: 20 },
  { id: 'pen', text: 'Build a pen and blow a downy in.', reward: 40 },
  { id: 'feed', text: 'Feed a downy its favourite.', reward: 40 },
  // (Round 9: something to do with the time once the loop is taught: the first-fifteen-minutes player stood about for
  // two minutes at a time with nothing on the page it could act on. More downies, more fluff, the gate sooner.)
  { id: 'herd', text: 'Keep five downies in one pen.', reward: 60 },
  { id: 'sell', text: 'Sell 20 fluff at the sell crate.', reward: 60 },
  { id: 'plant', text: 'Plant something in a garden.', reward: 40 },
  { id: 'order', text: 'Fill an order from the price board.', reward: 60 },
  // The gate pays for the first pen beyond it.
  { id: 'ridge', text: 'Open the gate to Ember Ridge.', reward: 200 },
  { id: 'ember', text: 'Catch an ember downy.', reward: 80 },
  { id: 'feeder', text: 'Build a feeder in a pen.', reward: 100 },
  { id: 'hollow', text: 'Open the gate to Brook Hollow.', reward: 150 },
  // (Round 11: paying 1,200 for the Hollow moved the page straight to thistles, with no word about what it opened.)
  { id: 'brook', text: 'Catch a brook downy.', reward: 120 },
  { id: 'thistle', text: 'Catch a thistle downy.', reward: 250 },
  { id: 'orders5', text: 'Fill five orders.', reward: 150 },
  { id: 'prized', text: 'Fill a prized order.', reward: 250 },
  // (Round 10: goals that use what you have built, each one line: the tenth playtest had 14 of 19 goals done by day 5,
  // and the rest were four full pens and 10,000 coins. An order for after 9 pm, orders on three days running, and a
  // rare downy of every kind.)
  { id: 'late', text: 'Fill an order after 9 pm.', reward: 150 },
  { id: 'streak', text: 'Fill an order three days running.', reward: 200 },
  { id: 'rares', text: 'Keep a rare downy of every kind.', reward: 300 },
  { id: 'fullclover', text: 'Keep ten clover downies in one pen.', reward: 150 },
  { id: 'fullember', text: 'Keep ten ember downies in one pen.', reward: 250 },
  { id: 'fullbrook', text: 'Keep ten brook downies in one pen.', reward: 300 },
  { id: 'fullthistle', text: 'Keep five thistle downies in one pen.', reward: 400 },
  { id: 'rich', text: 'Earn 10,000 coins in all.', reward: 500 },
];

/**
 * The pause page's journal: the goals done, in the order you did them, then
 * the one you are on, last (the fourth playtest's page showed goal 6, the
 * board's order, unstruck between struck goals, as the ridge gate came first).
 */
export function journalGoals(done: GoalId[]): { text: string; done: boolean }[] {
  const rows = done.map((id) => GOALS.find((g) => g.id === id)).filter((g): g is (typeof GOALS)[number] => !!g).map((g) => ({ text: g.text, done: true }));
  const current = nextGoals(done)[0];
  if (current) rows.push({ text: current.text, done: false });
  return rows;
}

/**
 * The goals not yet done, in the order the journal takes them: a kind's catch goal first once its gate is open
 * (round 12: paying for the ridge gate with 20 fluff not yet sold dropped the page back to the sell goal).
 */
export function nextGoals(done: GoalId[]): typeof GOALS {
  const left = GOALS.filter((g) => !done.includes(g.id));
  const opened = (id: GoalId) => (id === 'ember' && done.includes('ridge')) || (id === 'brook' && done.includes('hollow'));
  return [...left.filter((g) => opened(g.id)), ...left.filter((g) => !opened(g.id))];
}

/** The full-pen goals: how many of a kind in one pen. */
export const FULL_PEN: Partial<Record<GoalId, { kind: DownyKind; n: number }>> = {
  fullclover: { kind: 'clover', n: 10 },
  fullember: { kind: 'ember', n: 10 },
  fullbrook: { kind: 'brook', n: 10 },
  fullthistle: { kind: 'thistle', n: 5 },
};

// ---------------------------------------------------------------- orders

/**
 * An order from the price board: so much of one kind of fluff by dusk, or so
 * many live downies of a kind, blown into the sell crate by dusk. Each
 * morning the board offers two or three, and you take one of them at the
 * board: the fourth playtest found every day's orders asked for what you
 * already made, with no choice in them ("after day 4 it's only chores").
 */
export interface Order {
  kind: DownyKind;
  /** Live downies of the kind (blown into the crate), not its fluff. */
  live?: boolean;
  /** Fluff or downies wanted. */
  n: number;
  /** Sent so far. */
  got: number;
  /** What the order's fluff has sold for so far. */
  paid: number;
  /** 2 a plain order; 3 a prized one. */
  mult: number;
  /** Coins filling it pays, on top of what its fluff sells for (a fluff order), or for each downy as it goes in (a live order). Set when posted. */
  pay: number;
  /** offer: on the board, to take or leave; open: taken, today's order. */
  state: 'offer' | 'open' | 'filled' | 'missed';
  /**
   * The morning's rare downy, a hunt (the sixth playtest's top fun change): one
   * sought-after wild downy, seen at a landmark (`SIGHTINGS[spot]` in
   * world.ts), warier than any other, lured with its favourite food. Penned,
   * it fills the order and stays: its pen sheds more for good. Its coins are
   * capped at about the trip's (the sixth playtest's paid 2,680 against a 700
   * trip). It comes when taken and is gone at dusk.
   */
  rare?: { spot: number; seen?: boolean };
  /**
   * The last day it may be filled, at dusk (the day it was posted if not set).
   * The first order runs to the next day's dusk: the sixth playtest's was taken
   * at 17:38, lessons took the page, and it lapsed 40 real seconds later.
   */
  until?: number;
  /**
   * The hour it must be filled by on its day (round 8: every offer has a condition, and the eighth playtest's
   * picks were rarely a real decision): the morning (`ORDER_MORN`) or dusk (`ORDER_BY`, when not set).
   */
  by?: number;
  /** The hour from which it counts (a night one, after dark: `ORDER_NIGHT`); fluff sold or downies blown in before then go as plain sales. */
  from?: number;
}

/** The rare downy of each kind, by its colour: "Gold clover downy". */
export const RARE_NAME: Record<DownyKind, string> = { clover: 'gold clover', ember: 'rose ember', brook: 'silver brook', thistle: 'pale thistle' };

/** Orders close at dusk. */
export const ORDER_BY = 19;
/**
 * A morning order's deadline: the board's offers are due by 10 am, by dusk, or after dark. (Round 11: it was noon, 3 real
 * minutes after waking, and a trip takes about one, so the eleventh playtest found nothing could fail. Now it is 2.)
 */
export const ORDER_MORN = 10;
/** A night order (round 8: "night only"): it counts from 9 pm and runs to midnight. */
export const ORDER_NIGHT = { from: 21, by: 24 };
/** The board posts the day's orders in the morning (from dawn until noon; a later start waits for the next morning). */
export const ORDER_POST: [number, number] = [5, 12];
/**
 * What a live downy brings in for an order, each: a trip pays about a quarter
 * more than a stay-at-home fluff order adds on top of a day's sales (the fifth
 * playtest found the trip extra work for the same coins; it was 55, 95, 120),
 * so going out for downies and staying in for fluff compete (see
 * scripts/ranch-orders.ts).
 */
export const LIVE_EACH: Record<DownyKind, number> = { clover: 66, ember: 110, brook: 140, thistle: 300 };
/** The fluff window holds this many times what a window of anything else holds: fluff is light. */
export const FLUFF_ROOM = 2;

export function fmtCoins(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}
