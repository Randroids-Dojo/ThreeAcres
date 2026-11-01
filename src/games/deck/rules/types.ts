// Seedbound's rules state. Plain JSON so a run saves and reloads exactly; every
// random choice comes from `rng` in the state, never from Math.random or the clock.

export type SeedId = 'radish' | 'carrot' | 'lettuce' | 'beans' | 'corn' | 'sunflower' | 'pumpkin' | 'strawberry' | 'mint' | 'garlic' | 'wheat' | 'chili';
export type ToolId = 'can' | 'compost' | 'fertiliser' | 'trowel' | 'shears' | 'ladybirds';
export type ObjectId = 'scarecrow' | 'beehive';
export type WeatherId = 'rain' | 'sun' | 'storm';
export type CardId = SeedId | ToolId | ObjectId | WeatherId;
export type CardType = 'seed' | 'tool' | 'object' | 'weather';
export type Rarity = 'common' | 'uncommon' | 'rare';
export type PageId = 'barrel' | 'cellar' | 'bees' | 'thumb' | 'basket' | 'rotation' | 'market' | 'clover' | 'furrow' | 'coldframe';

/**
 * A season's twist: one plain rule for the coming season, picked at the stall from two. Boons nudge the plot one way
 * (a buyer for one crop, good company, no pests, longer picks, sunflowers all round), hitches another (frost on the
 * bottom row, a glut of one crop, sunflowers facing up, crows twice as often).
 */
export type TwistId = 'buyer' | 'company' | 'calm' | 'picks' | 'sunall' | 'frost' | 'glut' | 'sunup' | 'crows';

export interface Twist {
  id: TwistId;
  /** The crop a buyer or a glut is about. */
  crop?: SeedId;
}

/** 0 spring, 1 summer, 2 autumn, 3 winter. */
export type Season = 0 | 1 | 2 | 3;

/**
 * What a card needs to be played on.
 * empty: a plot with nothing in it. plot: any plot. crop: any crop. growing: a crop not yet ripe.
 * ripe: a ripe crop. move: a crop, then an empty plot. board: no target, the whole board.
 */
export type Target = 'empty' | 'plot' | 'crop' | 'growing' | 'ripe' | 'move' | 'board';

export interface Card {
  uid: number;
  id: CardId;
  up: boolean;
}

export interface Crop {
  /** Stable id for animation. */
  uid: number;
  kind: SeedId;
  /** Days grown so far. Ripe when age >= days. */
  age: number;
  days: number;
  up: boolean;
  /** Compost laid on it: +6 chips each. */
  compost: number;
  /** Planted where a different crop was harvested today (Crop Rotation). */
  rot: boolean;
  /** Picks taken so far (perennials). */
  picks: number;
  /** Nights of pests left on it; 0 when clean. A pested crop still grows and is picked, at half pay. */
  pest: number;
  /** A mint sprout that spread on its own. */
  sprout: boolean;
}

export interface Plot {
  crop: Crop | null;
  obj: ObjectId | null;
  /** Extra nights of growth tonight (the watering can, the Rain Barrel). Cleared each night. */
  boost: number;
  /** The crop harvested here today, for Crop Rotation. */
  last: SeedId | null;
}

export interface Step {
  /** Short label for the almanac, e.g. "next to a carrot". The table shows the icon, not this. */
  label: string;
  /** What the bonus came from, as an icon key: a seed or card id, a page id, or 'alone'. */
  icon: string;
  op: '+' | 'x';
  v: number;
  /** Plot the bonus came from, for drawing its arc. */
  from?: number;
}

export interface Harvest {
  plot: number;
  uid: number;
  kind: SeedId;
  up: boolean;
  base: number;
  chips: Step[];
  mult: Step[];
  chipsTotal: number;
  multTotal: number;
  score: number;
  /** Index of this harvest within the day, from 1. */
  n: number;
  golden: boolean;
  shears: boolean;
  /** The crop leaves its plot (annuals, or a perennial's last pick). */
  leaves: boolean;
  /** Scoops this harvest puts back on the bench: one when a crop is pulled up, and a strawberry's every pick. */
  scoops: number;
}

export interface ShopCard {
  card: CardId;
  price: number;
  sold: boolean;
  /** Improved stock: the card comes improved (new stock once the catalogue holds every card). */
  up?: boolean;
}

export interface ShopPage {
  page: PageId;
  price: number;
  sold: boolean;
}

export interface Shop {
  cards: ShopCard[];
  pages: ShopPage[];
  reroll: number;
  rerolls: number;
  removed: number;
  upgraded: number;
  /** The two twists offered for the coming season (from year 2), and the one picked. */
  twists?: Twist[];
  twist?: number;
}

export interface RunStats {
  bestHarvest: number;
  bestKind: SeedId | null;
  totalEarned: number;
  harvests: number;
  seasonsCleared: number;
  bestDay: number;
  /** Pests landed and crows seen this run: the merchant stocks an answer once a hazard has shown. */
  pests: number;
  crows: number;
  /**
   * Every season played, for the almanac entry at the end. `carried`: the part of `earned` carried in from the season
   * before. `idle`: the scoops a day left on the bench at dusk, on average.
   */
  log: { year: number; season: Season; earned: number; quota: number; cleared: boolean; carried?: number; twist?: Twist | null; idle?: number }[];
  /** Coins each crop took this run: the build that won. */
  byKind?: Partial<Record<SeedId, number>>;
}

export interface RunEnd {
  year: number;
  season: Season;
  earned: number;
  quota: number;
  unlocked: CardId[];
  /** The meta record has taken this run. */
  recorded: boolean;
  /** Every season met to the last winter: the run is won. */
  won?: boolean;
  /** The player gave the run up (on this day, or at the stall: day 0). It ends like a missed quota. */
  gaveUp?: boolean;
  day?: number;
  /** A won run: the day of the last winter its quota was met (the run ends that night). */
  metDay?: number;
}

export type Phase = 'day' | 'shop' | 'over';

export interface RunState {
  v: 1;
  seed: number;
  rng: number;
  year: number;
  season: Season;
  day: number;
  phase: Phase;
  /** Purse: spent in the shop, carries over. */
  coins: number;
  /** Earned this season, against the quota. */
  earned: number;
  quota: number;
  energy: number;
  /** Scoops on the bench today: the day's refill and the scoops pulled crops put back. The bench lays out this many. */
  bench: number;
  /** Scoops put back tonight by crops pulled up, for the next morning's bench. */
  saved: number;
  /** Seed scoops bought for good at the stall, on top of the usual three. */
  scoops: number;
  /** Almanac page slots bought at the stall, on top of the usual five. */
  slots: number;
  /** A crow is about tonight: rolled at dawn and shown on the plate, so a scarecrow is a choice. */
  crow: boolean;
  /** Today's toss is used. */
  tossed: boolean;
  cols: number;
  rows: number;
  plots: Plot[];
  draw: Card[];
  hand: Card[];
  discard: Card[];
  /** Object cards out on the board. The plot carries over, so they stay out until the run ends. */
  placed: Card[];
  pages: PageId[];
  /** Weather set for tonight, in the order played. */
  tonight: WeatherId[];
  shop: Shop | null;
  nextUid: number;
  /** Harvests so far today (Market Day). */
  dayHarvests: number;
  /** A new player's first run: the guided first season, and a gentler first year. */
  guided: boolean;
  /** The guided first season: the hands still to deal, one list per day. Empty once dealt. */
  script: CardId[][];
  /** The card pool for this run's shop. It grows at each new year with cards the catalogue does not hold yet, for this run only. */
  pool: CardId[];
  /** Cards on the last tray the merchant laid out, so the next tray brings different ones where it can. */
  lastTray?: CardId[];
  /** Scoops left on the bench at dusk this season, and the days counted: the stall says how many sat unused. */
  idle?: { scoops: number; days: number };
  /** This season's twist, picked at the stall before it (from year 2); null for none. */
  twist?: Twist | null;
  /** Part of the last season's surplus, waiting to be carried into the next season's take. */
  carry?: number;
  /** What this season's take started from: carried in from the season before. */
  carried?: number;
  /** The first run after the guided one: its first spring asks less. */
  soft?: boolean;
  /** This year's new stock, laid on the year's first tray. */
  stock?: { card: CardId; up: boolean }[];
  /** Cards the merchant sells improved, once the catalogue holds every card (new stock never runs dry). */
  select?: CardId[];
  stats: RunStats;
  end: RunEnd | null;
}

export interface Meta {
  v: 1;
  /** Shop cards unlocked so far, beyond the starting pool. */
  unlocked: CardId[];
  runs: number;
  /** Seasons met across every run so far: the catalogue grows with these, so every run can add to it. */
  seasons?: number;
  best: { seasons: number; harvest: number; coins: number; year: number; season: Season };
  /** Runs won: every season met to the last winter. */
  wins?: number;
  /** The most coins a won run took in all. */
  bestWin?: number;
  /** Won runs, latest last (a few kept): what took them there. */
  winLog?: WinRecord[];
}

export interface WinRecord {
  /** Which run it was, counting every run finished. */
  run: number;
  coins: number;
  best: number;
  bestKind: SeedId | null;
  /** The crops that took the most, most first. */
  top: SeedId[];
  pages: PageId[];
}

export interface NightGrowth {
  plot: number;
  uid: number;
  from: number;
  to: number;
}

/** Everything the rules did, in order, for the table to animate and the audio to voice. */
export type Ev =
  | { t: 'draw'; card: Card }
  | { t: 'shuffle'; n: number }
  | { t: 'play'; card: Card; plot: number | null; to?: number }
  | { t: 'plant'; plot: number; kind: SeedId; uid: number }
  /** The watering can: these plots grow an extra night tonight. */
  | { t: 'water'; plots: number[] }
  | { t: 'compost'; plot: number }
  | { t: 'grow'; growth: NightGrowth[] }
  | { t: 'move'; from: number; to: number }
  | { t: 'clear'; plots: number[] }
  | { t: 'object'; plot: number; obj: ObjectId }
  | { t: 'weather'; kind: WeatherId }
  | { t: 'toss'; card: Card }
  | { t: 'dusk'; weather: WeatherId[] }
  | { t: 'rain'; plots: number[] }
  | { t: 'flatten'; plot: number; kind: SeedId; uid: number }
  | { t: 'pest'; plot: number; from: number | null }
  | { t: 'pestGone'; plots: number[] }
  | { t: 'mint'; from: number; to: number; uid: number }
  | { t: 'crow'; plot: number; kind: SeedId; uid: number }
  | { t: 'harvest'; h: Harvest }
  | { t: 'quota'; earned: number; quota: number }
  | { t: 'seasonEnd'; cleared: boolean; earned: number; quota: number; year: number; season: Season }
  | { t: 'discardExcess'; cards: Card[] }
  | { t: 'dawn'; day: number }
  /** A crow sits on the plate's edge at dawn: it takes one ripe, unguarded crop tonight. */
  | { t: 'crowAbout' }
  | { t: 'season'; year: number; season: Season; quota: number; carried: number; twist: Twist | null }
  | { t: 'shop' }
  | { t: 'over'; end: RunEnd }
  /** The merchant has new stock this year, for this run: cards the catalogue does not hold yet. */
  | { t: 'stock'; cards: CardId[]; select: CardId[] }
  | { t: 'twist'; i: number }
  | { t: 'buy'; card: CardId }
  | { t: 'page'; page: PageId }
  | { t: 'remove'; card: Card }
  | { t: 'upgrade'; card: Card }
  | { t: 'scoop' }
  | { t: 'slot' }
  | { t: 'reroll' };
