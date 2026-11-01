// The eight crops. Numbers are in days and coins. Companion rules only matter
// under synergy growth; they are written here so the UI can explain them.

import type { CropId } from './types';

export interface CropDef {
  id: CropId;
  name: string;
  /** Plural for counts: "6 radishes". */
  plural: string;
  /** Days of growth to ripen. */
  days: number;
  /** Regrowing crops ripen again this many days after a pick; 0 means one harvest. */
  regrow: number;
  seed: number;
  price: number;
  /** Synergy: soil nutrient used at harvest. Beans give it back instead. */
  feed: number;
  /** Synergy: least moisture it needs at day end to grow. */
  thirst: number;
  /** Tall crops shade lettuce. */
  tall: boolean;
  /** Synergy companion, in a few words, for tooltips. */
  likes: string;
  /** A flat colour for UI chips and fallbacks. */
  color: string;
  /** Seasons it grows in (0 spring to 3 winter). Out of season it cannot be sown and withers at the turn. */
  seasons: number[];
}

export const CROPS: Record<CropId, CropDef> = {
  radish: { id: 'radish', name: 'Radish', plural: 'radishes', days: 3, regrow: 0, seed: 10, price: 30, feed: 1, thirst: 1, tall: false, likes: 'Lettuce next door', color: '#d9465f', seasons: [0, 2, 3] },
  lettuce: { id: 'lettuce', name: 'Lettuce', plural: 'lettuces', days: 4, regrow: 0, seed: 15, price: 45, feed: 1, thirst: 2, tall: false, likes: 'Shade from corn or sunflowers. Thirsty', color: '#8cc152', seasons: [0, 2] },
  carrot: { id: 'carrot', name: 'Carrot', plural: 'carrots', days: 5, regrow: 0, seed: 15, price: 55, feed: 1, thirst: 1, tall: false, likes: 'Radishes loosen the soil', color: '#ee8a2b', seasons: [0, 2, 3] },
  beans: { id: 'beans', name: 'Beans', plural: 'beans', days: 5, regrow: 2, seed: 30, price: 30, feed: 0, thirst: 1, tall: false, likes: 'Corn to climb. Feeds the soil around it', color: '#4f9a3a', seasons: [1] },
  strawberry: { id: 'strawberry', name: 'Strawberry', plural: 'strawberries', days: 6, regrow: 3, seed: 45, price: 40, feed: 1, thirst: 1, tall: false, likes: 'Beans next door', color: '#e0303f', seasons: [0, 1] },
  sunflower: { id: 'sunflower', name: 'Sunflower', plural: 'sunflowers', days: 6, regrow: 0, seed: 25, price: 80, feed: 1, thirst: 1, tall: true, likes: 'Brings bees: every neighbour does better', color: '#f4c22b', seasons: [1] },
  corn: { id: 'corn', name: 'Corn', plural: 'corn', days: 7, regrow: 0, seed: 35, price: 110, feed: 2, thirst: 1, tall: true, likes: 'Beans at its feet. Hungry', color: '#f0d35a', seasons: [1, 2] },
  pumpkin: { id: 'pumpkin', name: 'Pumpkin', plural: 'pumpkins', days: 10, regrow: 0, seed: 60, price: 220, feed: 2, thirst: 1, tall: false, likes: 'Room to sprawl: one neighbour at most. Hungry', color: '#e8772e', seasons: [2] },
};

export const CROP_IDS: CropId[] = ['radish', 'lettuce', 'carrot', 'beans', 'strawberry', 'sunflower', 'corn', 'pumpkin'];

/** Price multiplier per quality grade. */
export const QUALITY_MULT = [1, 1.25, 1.5, 2] as const;
export const QUALITY_NAME = ['Plain', 'Silver', 'Gold', 'Star'] as const;

/** Stage from age: 0 seed, 1 sprout, 2 young, 3 grown, 4 ripe. */
export function stageOf(kind: CropId, age: number): 0 | 1 | 2 | 3 | 4 {
  const d = CROPS[kind].days;
  if (age >= d) return 4;
  if (age <= 0) return 0;
  return Math.min(3, Math.max(1, Math.ceil((3 * age) / d - 1e-9))) as 1 | 2 | 3;
}

export function inSeason(kind: CropId, season: number): boolean {
  return CROPS[kind].seasons.includes(season);
}

/** The name for a count of a crop, without the number: "radish" or "radishes". */
export function cropWord(kind: CropId, n: number): string {
  return n === 1 ? CROPS[kind].name.toLowerCase() : CROPS[kind].plural;
}

export function count(kind: CropId, n: number): string {
  return `${n} ${n === 1 ? CROPS[kind].name.toLowerCase() : CROPS[kind].plural}`;
}
