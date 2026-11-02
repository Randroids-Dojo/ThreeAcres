// Every card and almanac page: cost, rarity, target and the short rule text the
// card face shows. The rules themselves live in run.ts and night.ts.

import type { CardId, CardType, EngineId, PageId, Rarity, SeedId, Target, Twist } from './types';

export interface CardDef {
  id: CardId;
  name: string;
  type: CardType;
  cost: number;
  rarity: Rarity;
  target: Target;
  text: string;
  /** Rule text for the upgraded card, when it differs beyond the cost or chips. */
  upText?: string;
}

export interface SeedDef {
  days: number;
  base: number;
  tall: boolean;
  /** Picks a perennial gives before it leaves; 1 for everything else. */
  picks: number;
}

export const SEEDS: Record<SeedId, SeedDef> = {
  radish: { days: 1, base: 2, tall: false, picks: 1 },
  carrot: { days: 2, base: 5, tall: false, picks: 1 },
  lettuce: { days: 2, base: 4, tall: false, picks: 1 },
  beans: { days: 3, base: 3, tall: false, picks: 3 },
  corn: { days: 4, base: 12, tall: true, picks: 1 },
  sunflower: { days: 3, base: 3, tall: true, picks: 1 },
  pumpkin: { days: 5, base: 30, tall: false, picks: 1 },
  strawberry: { days: 3, base: 4, tall: false, picks: 4 },
  mint: { days: 2, base: 2, tall: false, picks: 1 },
  garlic: { days: 2, base: 3, tall: false, picks: 1 },
  wheat: { days: 3, base: 4, tall: false, picks: 1 },
  chili: { days: 2, base: 6, tall: false, picks: 1 },
};

const D = (id: CardId, name: string, type: CardType, cost: number, rarity: Rarity, target: Target, text: string, upText?: string): CardDef => ({ id, name, type, cost, rarity, target, text, upText });

/**
 * Seeds are priced by power, from free fillers to dear stars: a radish costs
 * nothing, the everyday crops a scoop, the strong ones two and corn and the
 * pumpkin three. A crop pulled up puts a scoop back on the next morning's
 * bench, so a plot of quick crops pays for the dear ones (see night.ts).
 */
export const CARDS: Record<CardId, CardDef> = {
  radish: D('radish', 'Radish', 'seed', 0, 'common', 'empty', '+2 yield next to a carrot.'),
  carrot: D('carrot', 'Carrot', 'seed', 1, 'common', 'empty', '+1 bloom for each radish next to it.'),
  lettuce: D('lettuce', 'Lettuce', 'seed', 1, 'common', 'empty', '+4 yield next to a tall crop (sunflower or corn).'),
  beans: D('beans', 'Beans', 'seed', 2, 'uncommon', 'empty', 'Picks for 3 nights. Neighbours get +2 yield.'),
  corn: D('corn', 'Corn', 'seed', 3, 'rare', 'empty', 'Tall. x1.5 bloom next to beans.'),
  sunflower: D('sunflower', 'Sunflower', 'seed', 2, 'uncommon', 'empty', 'Tall. It faces the crop below it: +2 bloom.'),
  pumpkin: D('pumpkin', 'Pumpkin', 'seed', 3, 'rare', 'empty', 'x2 bloom with nothing next to it.'),
  strawberry: D('strawberry', 'Strawberry', 'seed', 2, 'uncommon', 'empty', 'Picks for 4 nights. Every pick puts a scoop back.'),
  // It gave no reason to want it: the sprouts it spreads are free crops, each a harvest and a scoop back.
  mint: D('mint', 'Mint', 'seed', 1, 'common', 'empty', 'Free crops: each night it spreads to a bare plot beside it.'),
  garlic: D('garlic', 'Garlic', 'seed', 1, 'common', 'empty', 'Pests keep off it and its neighbours.'),
  wheat: D('wheat', 'Wheat', 'seed', 1, 'common', 'empty', '+2 yield for each wheat next to it.'),
  chili: D('chili', 'Chili', 'seed', 2, 'uncommon', 'empty', 'Neighbours get x1.5 bloom.'),
  can: D('can', 'Watering Can', 'tool', 1, 'common', 'plot', 'A row grows an extra night tonight.'),
  compost: D('compost', 'Compost', 'tool', 1, 'uncommon', 'crop', 'A crop gets +6 yield at harvest.'),
  fertiliser: D('fertiliser', 'Fertiliser', 'tool', 1, 'uncommon', 'growing', 'A crop grows a night now.'),
  trowel: D('trowel', 'Trowel', 'tool', 0, 'uncommon', 'move', 'Move a crop to an empty plot next to it.', 'Move a crop to any empty plot.'),
  shears: D('shears', 'Shears', 'tool', 1, 'rare', 'ripe', 'Pull a ripe crop now, at double yield.'),
  ladybirds: D('ladybirds', 'Ladybirds', 'tool', 0, 'common', 'board', 'Clear every pest.', 'Clear every pest and draw a card.'),
  scarecrow: D('scarecrow', 'Scarecrow', 'object', 1, 'uncommon', 'empty', 'Crows keep off the 3 by 3 around it.'),
  beehive: D('beehive', 'Beehive', 'object', 2, 'rare', 'empty', 'Crops in the 3 by 3 around it get +1 bloom.'),
  rain: D('rain', 'Rain', 'weather', 1, 'uncommon', 'board', 'Every crop grows an extra night tonight.'),
  sun: D('sun', 'Sun', 'weather', 1, 'uncommon', 'board', 'Crops pulled tonight get +3 yield.'),
  storm: D('storm', 'Storm', 'weather', 2, 'rare', 'board', 'Every crop grows 2 extra nights tonight. One is flattened.'),
};

export const CARD_IDS = Object.keys(CARDS) as CardId[];

/** The Root Cellar's yield on radishes and carrots: TUNING.cellarYield, the faces and the stall's words all read this. */
export const CELLAR_YIELD = 2;

export function isSeed(id: CardId): id is SeedId {
  return CARDS[id].type === 'seed';
}

/** A card's energy cost: upgraded tools, objects and weather cost one less. */
export function costOf(id: CardId, up: boolean): number {
  const c = CARDS[id].cost;
  return up && CARDS[id].type !== 'seed' ? Math.max(0, c - 1) : c;
}

/** A seed's base yield (chips in the code): upgraded seeds get +50%, rounded up. */
export function baseChips(kind: SeedId, up: boolean): number {
  const b = SEEDS[kind].base;
  return up ? Math.ceil(b * 1.5) : b;
}

export function cardText(id: CardId, up: boolean): string {
  const d = CARDS[id];
  return up && d.upText ? d.upText : d.text;
}

/**
 * What improving a card does, said plainly: "Basket 5 to 8." Free cards gain a stronger rule instead. With the Root
 * Cellar kept, a radish's or carrot's basket counts its +2, as the face prints it ("Basket 7 to 10.").
 */
export function upgradeNote(id: CardId, pages: readonly PageId[] = []): string {
  const d = CARDS[id];
  if (d.type === 'seed') {
    const add = (id === 'radish' || id === 'carrot') && pages.includes('cellar') ? CELLAR_YIELD : 0;
    return `Basket ${SEEDS[id as SeedId].base + add} to ${baseChips(id as SeedId, true) + add}.`;
  }
  if (d.upText) return d.upText;
  const n = costOf(id, true);
  return `Costs ${n === 0 ? 'nothing' : `${n} ${n === 1 ? 'scoop' : 'scoops'}`} instead of ${d.cost}.`;
}

/**
 * The start deck. Its core stands on the plot for days: beans and a
 * strawberry pick night after night, the carrot takes three nights and the
 * sunflower is the tall crop the lettuce wants, so the plot fills and what
 * you sow today has to fit what is already there.
 */
export const START_DECK: CardId[] = ['radish', 'radish', 'radish', 'radish', 'carrot', 'carrot', 'carrot', 'lettuce', 'beans', 'beans', 'strawberry', 'sunflower', 'can', 'can'];

/** The shop's pool before any unlocks. */
export const START_POOL: CardId[] = ['radish', 'carrot', 'lettuce', 'beans', 'sunflower', 'strawberry', 'garlic', 'can', 'compost', 'fertiliser', 'ladybirds', 'scarecrow', 'rain', 'sun'];

/** Cards cut from the game, and what an old save's copies become. */
export const RETIRED: Record<string, CardId> = { hose: 'rain', mulch: 'can' };

/** Locked cards, unlocked two at a time in this order. */
export const UNLOCK_ORDER: CardId[] = ['beehive', 'chili', 'corn', 'wheat', 'pumpkin', 'shears', 'mint', 'trowel', 'storm'];

/**
 * Seasons met, counted across every run, that unlock the next pair: earned by
 * getting further, never by finishing runs. Counting across runs means a run of
 * three or four seasons still adds to the catalogue (the third playtest's runs 2
 * to 4 met 1 to 4 seasons each and found nothing new, since the old marks were
 * for one run).
 */
export const UNLOCK_AT = [1, 3, 5, 8, 12];

/** Cards are cheaper than they were (20, 40, 65): a good card has to be worth buying over another page. */
export const PRICE: Record<Rarity, number> = { common: 15, uncommon: 30, rare: 45 };

export interface PageDef {
  id: PageId;
  name: string;
  price: number;
  text: string;
}

export const PAGES: Record<PageId, PageDef> = {
  barrel: { id: 'barrel', name: 'Rain Barrel', price: 80, text: 'Column A grows an extra night every night.' },
  cellar: { id: 'cellar', name: 'Root Cellar', price: 100, text: 'Radishes and carrots get +2 yield, and +1 bloom beside each other.' },
  bees: { id: 'bees', name: 'Busy Bees', price: 110, text: 'Crops near a beehive get x1.2 bloom.' },
  thumb: { id: 'thumb', name: 'Green Thumb', price: 170, text: 'One more seed scoop every day.' },
  basket: { id: 'basket', name: 'Big Basket', price: 140, text: 'Hand size +1.' },
  rotation: { id: 'rotation', name: 'Crop Rotation', price: 100, text: 'Plant a different crop where one was just pulled: +4 yield.' },
  market: { id: 'market', name: 'Market Day', price: 130, text: 'Every fifth harvest in a day is x2.' },
  clover: { id: 'clover', name: 'Four-Leaf Clover', price: 140, text: 'One harvest in eight comes up golden, x3.' },
  furrow: { id: 'furrow', name: 'Long Furrow', price: 150, text: 'The plot gains a fifth column, and one more scoop a day.' },
  coldframe: { id: 'coldframe', name: 'Cold Frame', price: 80, text: 'Winter quotas are 20% lower.' },
  // Round 7: the pages that multiply the engines a run's first stall offers (Busy Bees is the beehive's).
  hot: { id: 'hot', name: 'Hot Beds', price: 110, text: 'Chilies stay and pick for 3 nights.' },
  vines: { id: 'vines', name: 'Trellis', price: 110, text: 'Beans and strawberries give the other crops beside them +2 bloom.' },
  tall: { id: 'tall', name: 'Tall Rows', price: 110, text: 'Corn ripens two nights sooner. Tall crops get +1 bloom for each neighbour.' },
};

export interface EngineDef {
  id: EngineId;
  /** The page that multiplies it. */
  page: PageId;
  /** What the pick puts in the tin. */
  gift: CardId[];
  /** Cards the stall keeps in stock for it, one slot on each stall's first tray. */
  cards: CardId[];
}

/**
 * The engines a run's first stall offers, three of the four at random: each a card and the page that multiplies it,
 * free. The seventh playtest: with beehives and Busy Bees nights paid 150 to 320, without them 60 to 110, and the
 * beehive was a rare roll at the stall. Their biggest wish was "a guaranteed choice of engine at each run's first stall".
 */
export const ENGINES: Record<EngineId, EngineDef> = {
  bees: { id: 'bees', page: 'bees', gift: ['beehive'], cards: ['beehive', 'sunflower'] },
  hot: { id: 'hot', page: 'hot', gift: ['chili', 'chili', 'chili', 'chili'], cards: ['chili'] },
  vines: { id: 'vines', page: 'vines', gift: ['beans'], cards: ['beans', 'strawberry'] },
  tall: { id: 'tall', page: 'tall', gift: ['corn'], cards: ['corn', 'sunflower'] },
};
export const ENGINE_IDS = Object.keys(ENGINES) as EngineId[];

/** An engine said plainly: "A beehive and Busy Bees." */
export function engineText(id: EngineId): string {
  const e = ENGINES[id];
  const n = e.gift.length;
  const card = CARDS[e.gift[0]].name.toLowerCase();
  // "Beans and Trellis.": a card whose name is already a plural takes no article.
  // Corn, like mint, garlic and wheat, is said as one: "Corn and Tall Rows."
  const one = /s$/.test(card) || MASS.includes(e.gift[0] as SeedId) ? `${card[0].toUpperCase()}${card.slice(1)}` : `${/^[aeiou]/.test(card) ? 'An' : 'A'} ${card}`;
  const what = n === 1 ? one : `${['', '', 'Two', 'Three', 'Four'][n] ?? String(n)} ${PLURALS[e.gift[0] as SeedId] ?? card}`;
  return `${what} and ${PAGES[e.page].name}.`;
}

export const PAGE_IDS = Object.keys(PAGES) as PageId[];
/** The row a twist names: "the second row". */
export const ROW_NAMES = ['top row', 'second row', 'third row', 'bottom row'];
/** Almanac pages kept before a slot is bought (TUNING.maxPages is what the rules read). */
export const MAX_PAGES = 4;

export const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'] as const;

/** Crops said as one, not many: "your corn grows". */
export const MASS: readonly SeedId[] = ['corn', 'mint', 'garlic', 'wheat'];

/** A crop's name for a crowd of them: "A buyer pays double for carrots." */
export const PLURALS: Record<SeedId, string> = {
  radish: 'radishes',
  carrot: 'carrots',
  lettuce: 'lettuces',
  beans: 'beans',
  corn: 'corn',
  sunflower: 'sunflowers',
  pumpkin: 'pumpkins',
  strawberry: 'strawberries',
  mint: 'mint',
  garlic: 'garlic',
  wheat: 'wheat',
  chili: 'chilies',
};

/**
 * A season's twist in one plain line, as the stall, the table and the almanac say it (no colons, no season word, so it
 * reads anywhere). Round 7: each says what it hits or helps on this run's own plot ("Your carrots sell for half.",
 * "Frost on your carrots' row.").
 */
export function twistText(t: Twist): string {
  const crop = t.crop ? PLURALS[t.crop] : '';
  // Corn, mint, garlic and wheat are said as one ("your corn sells"); the rest as many ("your carrots sell").
  const one = !!t.crop && MASS.includes(t.crop);
  const sell = one ? 'sells' : 'sell';
  switch (t.id) {
    case 'buyer':
      return `A buyer pays double for your ${crop}.`;
    case 'glut':
      return crop ? `Your ${crop} ${sell} for half.` : 'A glut.';
    case 'company':
      return 'Crops get +1 yield for each crop beside them.';
    case 'calm':
      return 'No new pests.';
    case 'picks':
      return 'Your beans and strawberries pick one more time.';
    case 'sunall':
      return 'Your sunflowers bloom every crop beside them.';
    case 'frost': {
      // A save from before round 7 frosts the bottom row and names no crop.
      const row = ROW_NAMES[t.row ?? ROW_NAMES.length - 1] ?? 'bottom row';
      // The clipping's little map and the board show which row: the line names whose row it is.
      return t.crop ? `Frost on your ${crop}${crop.endsWith('s') ? "'" : "'s"} row.` : `Frost on the ${row}: no sowing there.`;
    }
    case 'sunup':
      return 'Your sunflowers face up and bloom the crop above.';
    case 'crows':
      return 'A crow comes every morning.';
    case 'rest':
      return `${t.page ? PAGES[t.page].name : 'A page'} rests this season.`;
  }
}
