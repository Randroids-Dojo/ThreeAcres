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
  clover: { name: 'clover downy', plural: 'clover downies', body: 0xb3d07c, belly: 0xf3ecd0, accent: 0x5e9a3e, favourite: 'cloverhead', eats: 'greens', value: 8, hop: 0.55 },
  ember: { name: 'ember downy', plural: 'ember downies', body: 0xf0a060, belly: 0xffdcaa, accent: 0xe0663a, favourite: 'sweetroot', eats: 'roots', value: 14, hop: 0.5 },
  brook: { name: 'brook downy', plural: 'brook downies', body: 0x78a4e4, belly: 0xd6e4f8, accent: 0x4a78c4, favourite: 'dewberry', eats: 'fruit', value: 18, hop: 0.6 },
  thistle: { name: 'thistle downy', plural: 'thistle downies', body: 0xa486d4, belly: 0xe2d6f0, accent: 0x6e4c9e, favourite: 'any', eats: 'any', value: 40, hop: 1.6 },
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

// ---------------------------------------------------------------- builds

export type PadKind = 'empty' | 'pen' | 'garden' | 'silo';
export type PenUp = 'high' | 'feeder' | 'trough' | 'hedge' | 'chute';
export type GardenUp = 'sprinkler' | 'soil';

export const BUILD_COST: Record<Exclude<PadKind, 'empty'>, number> = { pen: 250, garden: 200, silo: 300 };
export const BUILD_NAME: Record<Exclude<PadKind, 'empty'>, string> = { pen: 'Pen', garden: 'Garden', silo: 'Silo' };
export const PEN_UPS: { id: PenUp; name: string; cost: number; line: string }[] = [
  { id: 'high', name: 'High fence', cost: 200, line: 'Keeps jumpers in' },
  { id: 'feeder', name: 'Feeder', cost: 300, line: 'Drops food when they are hungry' },
  { id: 'trough', name: 'Trough', cost: 150, line: 'Brook downies shed more' },
  { id: 'hedge', name: 'Hedge', cost: 250, line: 'Keeps nettlebacks out' },
  { id: 'chute', name: 'Fluff chute', cost: 400, line: 'Catches shed fluff in a box' },
];
export const GARDEN_UPS: { id: GardenUp; name: string; cost: number; line: string }[] = [
  { id: 'sprinkler', name: 'Sprinkler', cost: 250, line: 'Grows half again as fast' },
  { id: 'soil', name: 'Rich soil', cost: 300, line: 'Eight to a crop, not five' },
];
export const GARDEN_HOURS = 2;
export const SILO_KINDS = 4;
export const SILO_CAP = 50;
export const FEEDER_CAP = 40;

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

export type GoalId = 'catch' | 'pen' | 'feed' | 'sell' | 'plant' | 'ridge' | 'ember' | 'feeder' | 'hollow' | 'thistle' | 'rich';

export const GOALS: { id: GoalId; text: string; reward: number }[] = [
  { id: 'catch', text: 'Catch a clover downy.', reward: 20 },
  { id: 'pen', text: 'Build a pen and blow a downy in.', reward: 40 },
  { id: 'feed', text: 'Feed a downy its favourite.', reward: 40 },
  { id: 'sell', text: 'Sell 20 fluff at the sell crate.', reward: 60 },
  { id: 'plant', text: 'Plant something in a garden.', reward: 40 },
  { id: 'ridge', text: 'Open the gate to Ember Ridge.', reward: 100 },
  { id: 'ember', text: 'Catch an ember downy.', reward: 80 },
  { id: 'feeder', text: 'Build a feeder in a pen.', reward: 100 },
  { id: 'hollow', text: 'Open the gate to Brook Hollow.', reward: 150 },
  { id: 'thistle', text: 'Find a thistle downy.', reward: 200 },
  { id: 'rich', text: 'Earn 10,000 coins in all.', reward: 500 },
];

export function fmtCoins(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}
