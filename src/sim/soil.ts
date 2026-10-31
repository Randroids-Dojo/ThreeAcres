// Synergy soil: what a crop's neighbours and ground do for its quality, and
// whether a plot needs water. Moisture and nutrients are tracked under every
// rule set so switching soil mid-season needs no conversion.

import { CROPS } from './crops';
import { idx, inMap, isField } from './world';
import type { Crop, CropId, Plot, WorldState } from './types';

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export interface QualityWhy {
  quality: 0 | 1 | 2 | 3;
  friend: boolean;
  bees: boolean;
  rich: boolean;
  spent: boolean;
  crowded: boolean;
  parched: boolean;
}

function neighbours(s: WorldState, x: number, y: number): Crop[] {
  const out: Crop[] = [];
  for (const [dx, dy] of N4) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inMap(nx, ny)) continue;
    const c = s.plots[idx(nx, ny)].crop;
    if (c && !c.dead) out.push(c);
  }
  return out;
}

function likes(kind: CropId, n: Crop[]): boolean {
  switch (kind) {
    case 'radish':
      return n.some((c) => c.kind === 'lettuce');
    case 'lettuce':
      return n.some((c) => CROPS[c.kind].tall);
    case 'carrot':
      return n.some((c) => c.kind === 'radish');
    case 'beans':
      return n.some((c) => c.kind === 'corn');
    case 'strawberry':
      return n.some((c) => c.kind === 'beans');
    case 'sunflower':
      return false;
    case 'corn':
      return n.some((c) => c.kind === 'beans');
    case 'pumpkin':
      return n.length <= 1;
  }
}

/** Quality and the reasons for it, for a crop (or a crop of `kind` about to go in) at (x, y). */
export function qualityAt(s: WorldState, x: number, y: number, kind?: CropId): QualityWhy {
  const plot = s.plots[idx(x, y)];
  const k = kind ?? plot.crop?.kind ?? 'radish';
  const n = neighbours(s, x, y);
  const friend = likes(k, n);
  const bees = n.some((c) => c.kind === 'sunflower');
  const nut = Math.floor(plot.nutrient);
  const rich = nut >= 2;
  const spent = nut < 1;
  const crowded = n.filter((c) => c.kind === k).length >= 2;
  const parched = !kind && !!plot.crop?.parched;
  const q = (friend ? 1 : 0) + (bees ? 1 : 0) + (rich ? 1 : 0) - (spent ? 1 : 0) - (crowded ? 1 : 0) - (parched ? 1 : 0);
  return { quality: Math.max(0, Math.min(3, q)) as 0 | 1 | 2 | 3, friend, bees, rich, spent, crowded, parched };
}

/** Refresh every crop's predicted quality. Cheap: 300 tiles. */
export function refreshQuality(s: WorldState): void {
  const synergy = s.rules.growth === 'synergy';
  for (let y = 0; y < s.H; y++) {
    for (let x = 0; x < s.W; x++) {
      const c = s.plots[y * s.W + x].crop;
      if (!c) continue;
      c.quality = synergy && !c.dead ? qualityAt(s, x, y).quality : 0;
    }
  }
}

/** Would this crop fail to grow tonight without water? Smart tools and hands water these. */
export function needsWater(s: WorldState, p: Plot): boolean {
  const c = p.crop;
  if (!c || c.dead || c.stage === 4) return false;
  if (s.rules.growth === 'classic') return !p.wet;
  return p.moisture <= CROPS[c.kind].thirst;
}

/** Does this crop grow tonight on its water? */
export function wateredForTonight(s: WorldState, p: Plot): boolean {
  const c = p.crop;
  if (!c) return false;
  if (s.rules.growth === 'classic') return p.wet;
  return p.moisture >= CROPS[c.kind].thirst;
}

export function soak(p: Plot): void {
  p.wet = true;
  p.moisture = 3;
}

/** Beans put nutrient back into their plot and the four around it. */
export function feedAround(s: WorldState, x: number, y: number): void {
  const bump = (px: number, py: number) => {
    if (!isField(s, px, py)) return;
    const p = s.plots[idx(px, py)];
    p.nutrient = Math.min(3, p.nutrient + 1);
  };
  bump(x, y);
  for (const [dx, dy] of N4) bump(x + dx, y + dy);
}
