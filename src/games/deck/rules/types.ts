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
  /** Nights of pests left on it; 0 when clean. A pested crop doesn't grow or get picked. */
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
}

export interface ShopCard {
  card: CardId;
  price: number;
  sold: boolean;
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
}

export interface RunStats {
  bestHarvest: number;
  bestKind: SeedId | null;
  totalEarned: number;
  harvests: number;
  seasonsCleared: number;
  bestDay: number;
  /** Every season played, for the almanac entry at the end. */
  log: { year: number; season: Season; earned: number; quota: number; cleared: boolean }[];
}

export interface RunEnd {
  year: number;
  season: Season;
  earned: number;
  quota: number;
  unlocked: CardId[];
  /** The meta record has taken this run. */
  recorded: boolean;
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
  /** Today's toss is used. */
  tossed: boolean;
  cols: number;
  rows: number;
  plots: Plot[];
  draw: Card[];
  hand: Card[];
  discard: Card[];
  /** Object cards out on the board; they come back at the season's end. */
  placed: Card[];
  pages: PageId[];
  /** Weather set for tonight, in the order played. */
  tonight: WeatherId[];
  shop: Shop | null;
  nextUid: number;
  /** Harvests so far today (Market Day). */
  dayHarvests: number;
  /** The guided first season: the hands still to deal, one list per day. Empty once dealt. */
  script: CardId[][];
  /** The card pool for this run's shop. */
  pool: CardId[];
  stats: RunStats;
  end: RunEnd | null;
}

export interface Meta {
  v: 1;
  /** Shop cards unlocked so far, beyond the starting pool. */
  unlocked: CardId[];
  runs: number;
  best: { seasons: number; harvest: number; coins: number; year: number; season: Season };
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
  | { t: 'season'; year: number; season: Season; quota: number }
  | { t: 'shop' }
  | { t: 'over'; end: RunEnd }
  | { t: 'buy'; card: CardId }
  | { t: 'page'; page: PageId }
  | { t: 'remove'; card: Card }
  | { t: 'upgrade'; card: Card }
  | { t: 'reroll' };
