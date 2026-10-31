// Every card and almanac page: cost, rarity, target and the short rule text the
// card face shows. The rules themselves live in run.ts and night.ts.

import type { CardId, CardType, PageId, Rarity, SeedId, Target } from './types';

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
  strawberry: { days: 3, base: 3, tall: false, picks: 4 },
  mint: { days: 2, base: 2, tall: false, picks: 1 },
  garlic: { days: 2, base: 3, tall: false, picks: 1 },
  wheat: { days: 3, base: 4, tall: false, picks: 1 },
  chili: { days: 2, base: 6, tall: false, picks: 1 },
};

const D = (id: CardId, name: string, type: CardType, cost: number, rarity: Rarity, target: Target, text: string, upText?: string): CardDef => ({ id, name, type, cost, rarity, target, text, upText });

export const CARDS: Record<CardId, CardDef> = {
  radish: D('radish', 'Radish', 'seed', 1, 'common', 'empty', '+2 yield next to a carrot.'),
  carrot: D('carrot', 'Carrot', 'seed', 1, 'common', 'empty', '+1 bloom for each radish pulled before it tonight.'),
  lettuce: D('lettuce', 'Lettuce', 'seed', 1, 'common', 'empty', '+4 yield next to a tall crop.'),
  beans: D('beans', 'Beans', 'seed', 1, 'uncommon', 'empty', 'Picks for 3 nights. Neighbours get +2 yield.'),
  corn: D('corn', 'Corn', 'seed', 2, 'rare', 'empty', 'Tall. x1.5 bloom next to beans.'),
  sunflower: D('sunflower', 'Sunflower', 'seed', 1, 'uncommon', 'empty', 'Tall. Its bees give neighbours +1 bloom.'),
  pumpkin: D('pumpkin', 'Pumpkin', 'seed', 2, 'rare', 'empty', 'x2 bloom with nothing beside it.'),
  strawberry: D('strawberry', 'Strawberry', 'seed', 1, 'uncommon', 'empty', 'Picks for 4 nights, +1 yield each pick.'),
  mint: D('mint', 'Mint', 'seed', 1, 'common', 'empty', 'Each night it creeps into an empty neighbour.'),
  garlic: D('garlic', 'Garlic', 'seed', 1, 'common', 'empty', 'Pests keep off it and its neighbours.'),
  wheat: D('wheat', 'Wheat', 'seed', 1, 'common', 'empty', '+1 yield for every other wheat in the plot.'),
  chili: D('chili', 'Chili', 'seed', 1, 'uncommon', 'empty', 'The next crop pulled after it gets x1.5 bloom.'),
  can: D('can', 'Watering Can', 'tool', 0, 'common', 'plot', 'Water a row.', 'Water a row and a column.'),
  hose: D('hose', 'Hose', 'tool', 1, 'uncommon', 'board', 'Water every plot.'),
  mulch: D('mulch', 'Mulch', 'tool', 1, 'common', 'plot', 'Water a plot. It stays wet for 3 nights.'),
  compost: D('compost', 'Compost', 'tool', 1, 'uncommon', 'crop', 'A crop gets +6 yield at harvest.'),
  fertiliser: D('fertiliser', 'Fertiliser', 'tool', 1, 'uncommon', 'growing', 'A crop grows one day now.'),
  trowel: D('trowel', 'Trowel', 'tool', 0, 'uncommon', 'move', 'Move a crop to an empty plot next to it.', 'Move a crop to any empty plot.'),
  shears: D('shears', 'Shears', 'tool', 1, 'rare', 'ripe', 'Pull a ripe crop now, at double yield.'),
  ladybirds: D('ladybirds', 'Ladybirds', 'tool', 0, 'common', 'board', 'Clear every pest.', 'Clear every pest and draw a card.'),
  scarecrow: D('scarecrow', 'Scarecrow', 'object', 1, 'uncommon', 'empty', 'Crows keep off the 3 by 3 around it.'),
  beehive: D('beehive', 'Beehive', 'object', 2, 'rare', 'empty', 'Crops in the 3 by 3 around it get +1 bloom.'),
  rain: D('rain', 'Rain', 'weather', 1, 'uncommon', 'board', 'Tonight: water every plot. Crops grow an extra day.'),
  sun: D('sun', 'Sun', 'weather', 1, 'uncommon', 'board', 'Tonight: ripe crops get +3 yield.'),
  storm: D('storm', 'Storm', 'weather', 2, 'rare', 'board', 'Tonight: crops grow 2 extra days. One is flattened.'),
};

export const CARD_IDS = Object.keys(CARDS) as CardId[];

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

/** Can this card be upgraded to something better? Free cards gain a stronger rule instead. */
export function upgradeNote(id: CardId): string {
  const d = CARDS[id];
  if (d.type === 'seed') return `Base yield ${SEEDS[id as SeedId].base} to ${baseChips(id as SeedId, true)}.`;
  if (d.upText) return d.upText;
  return `Costs ${costOf(id, true)} instead of ${d.cost}.`;
}

export const START_DECK: CardId[] = ['radish', 'radish', 'radish', 'radish', 'radish', 'carrot', 'carrot', 'carrot', 'lettuce', 'lettuce', 'can', 'can', 'can', 'rain'];

/** The shop's pool before any unlocks. */
export const START_POOL: CardId[] = ['radish', 'carrot', 'lettuce', 'beans', 'sunflower', 'strawberry', 'garlic', 'can', 'hose', 'mulch', 'compost', 'fertiliser', 'ladybirds', 'scarecrow', 'rain', 'sun'];

/** Locked cards, unlocked two per finished run in this order. */
export const UNLOCK_ORDER: CardId[] = ['beehive', 'chili', 'corn', 'wheat', 'pumpkin', 'shears', 'mint', 'trowel', 'storm'];

export const PRICE: Record<Rarity, number> = { common: 15, uncommon: 28, rare: 45 };

export interface PageDef {
  id: PageId;
  name: string;
  price: number;
  text: string;
}

export const PAGES: Record<PageId, PageDef> = {
  barrel: { id: 'barrel', name: 'Rain Barrel', price: 60, text: 'Each morning the first plot of every row is wet.' },
  cellar: { id: 'cellar', name: 'Root Cellar', price: 70, text: 'Radishes and carrots get +3 yield.' },
  bees: { id: 'bees', name: 'Busy Bees', price: 80, text: 'Sunflowers and beehives give +2 bloom, not +1.' },
  thumb: { id: 'thumb', name: 'Green Thumb', price: 120, text: '+1 energy every day.' },
  basket: { id: 'basket', name: 'Big Basket', price: 100, text: 'Hand size +1.' },
  rotation: { id: 'rotation', name: 'Crop Rotation', price: 70, text: 'Sow a different crop where one was just pulled: +4 yield.' },
  market: { id: 'market', name: 'Market Day', price: 90, text: 'Every fifth harvest in a day is x2.' },
  clover: { id: 'clover', name: 'Four-Leaf Clover', price: 100, text: 'One harvest in eight comes up golden, x3.' },
  furrow: { id: 'furrow', name: 'Long Furrow', price: 110, text: 'The plot gains a fifth column.' },
  coldframe: { id: 'coldframe', name: 'Cold Frame', price: 60, text: 'Winter quotas are 20% lower.' },
};

export const PAGE_IDS = Object.keys(PAGES) as PageId[];
export const MAX_PAGES = 5;

export const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'] as const;
