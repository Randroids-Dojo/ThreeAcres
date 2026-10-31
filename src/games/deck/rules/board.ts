// Board geometry and the numbers that set a run's pace. Plots are indexed in
// reading order: row by row, left to right, which is also the harvest order.

import { SEEDS } from './cards';
import type { Crop, PageId, Plot, RunState, Season } from './types';

/** Tunable numbers. The balance bot sweeps these; the game uses them as they are. */
export const TUNING = {
  quotas: [40, 55, 65, 80] as number[],
  yearMult: 1.75,
  days: 6,
  handSize: 5,
  energy: 3,
  /** Chance of new pests on a night, by year (the last value repeats). */
  pestChance: [0.2, 0.4, 0.55] as number[],
  /** Nights pests stay on a crop before they move on. */
  pestNights: 2,
  /** Chance each pested crop spreads to a neighbour on a night. */
  pestSpread: 0.4,
  /** Chance a crow comes on a night, by year. */
  crowChance: [0.15, 0.3, 0.45] as number[],
  removePrice: 25,
  upgradePrice: 30,
  /** Removing or upgrading again in the same visit costs this much more each time. */
  serviceStep: 10,
  rerollBase: 5,
  rerollStep: 2,
  /** Shop prices rise by this much each year after the first. */
  priceYear: 0.4,
  minDeck: 6,
};

export function byYear(list: number[], year: number): number {
  return list[Math.min(list.length - 1, year - 1)];
}

function nice(q: number): number {
  return q < 100 ? Math.round(q / 5) * 5 : Math.round(q / 10) * 10;
}

export function quotaFor(year: number, season: Season, pages: readonly PageId[]): number {
  let q = TUNING.quotas[season] * Math.pow(TUNING.yearMult, year - 1);
  if (season === 3 && pages.includes('coldframe')) q *= 0.8;
  return nice(q);
}

export function energyMax(s: RunState): number {
  return TUNING.energy + (s.pages.includes('thumb') ? 1 : 0);
}

export function handSize(s: RunState): number {
  return TUNING.handSize + (s.pages.includes('basket') ? 1 : 0);
}

/** Pests from summer of year 1; crows from autumn. */
export function pestsOn(s: RunState): boolean {
  return s.year > 1 || s.season >= 1;
}

export function crowsOn(s: RunState): boolean {
  return s.year > 1 || s.season >= 2;
}

export function emptyPlot(): Plot {
  return { crop: null, obj: null, wet: false, mulch: 0, last: null };
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

/** Will this crop be harvested tonight, as things stand (before hazards)? */
export function ripeTonight(s: RunState, i: number): boolean {
  const p = s.plots[i];
  const c = p.crop;
  if (!c || c.pest) return false;
  if (isRipe(c)) return true;
  const watered = p.wet || s.tonight.some((w) => w === 'rain' || w === 'storm');
  return watered && c.age + 1 + extraGrowth(s) >= c.days;
}
