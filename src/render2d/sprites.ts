// Sprites: crops, produce, buildings and builds painted once at the current
// zoom bucket (device px per tile) and reused every frame. When the bucket or
// season changes, old sprites stay drawable (scaled) while new ones are
// painted a few per frame, so a zoom never stalls a frame.

import type { CropId } from '../sim/types';
import { CROP_IDS, CROPS } from '../sim/crops';
import type { Ctx } from './brush';
import { CROP_SCALE, CROP_TOP, paintCrop, paintProduce } from './crops';
import type { Palette } from './palette';
import { paintBoard, paintBunkhouse, paintCrate, paintHouse, paintScarecrow, paintSprinkler } from './props';
import { hash3 } from './rng';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Bounds in tile units relative to the anchor. */
  x0: number;
  y0: number;
  w: number;
  h: number;
  bucket: number;
  theme: number;
}

interface Def {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  paint: (ctx: Ctx, px: number) => void;
}

// Sprite keys. Crops: kind * 16 + stage * 2 + dead (0..127), variant adds 128.
export const K_PRODUCE = 300;
export const K_HOUSE = 400;
export const K_BUNK = 401;
export const K_CRATE = 402; // + heap 0..2
export const K_BOARD = 410; // + notes 2..5
export const K_SCARECROW = 420;
export const K_SPRINKLER = 421;

export function cropKey(kind: CropId, stage: number, dead: boolean, variant: number): number {
  return CROP_IDS.indexOf(kind) * 16 + stage * 2 + (dead ? 1 : 0) + variant * 128;
}

export class Sprites {
  private map = new Map<number, Sprite>();
  private queue: number[] = [];
  private queued = new Set<number>();
  bucket = 64;
  theme = -1;
  pal!: Palette;
  snow = false;

  /** Change the bucket or the theme: everything gets repainted in the background. */
  setup(bucket: number, pal: Palette, snow: boolean): void {
    const theme = pal.season * 2 + (snow ? 1 : 0);
    if (bucket === this.bucket && theme === this.theme) return;
    this.bucket = bucket;
    this.theme = theme;
    this.pal = pal;
    this.snow = snow;
    for (const k of this.map.keys()) this.enqueue(k);
  }

  private enqueue(k: number): void {
    if (this.queued.has(k)) return;
    this.queued.add(k);
    this.queue.push(k);
  }

  private def(k: number): Def {
    const pal = this.pal;
    const snow = this.snow;
    if (k < 256) {
      const variant = k >= 128 ? 1 : 0;
      const base = k % 128;
      const kind = CROP_IDS[base >> 4];
      const stage = (base & 15) >> 1;
      const dead = (base & 1) === 1;
      const sc = CROP_SCALE[kind];
      const top = CROP_TOP[kind] * sc;
      const wide = (kind === 'pumpkin' || kind === 'strawberry' ? 0.56 : 0.5) * sc;
      return {
        x0: -wide,
        y0: -top - 0.12,
        x1: wide,
        y1: 0.24 * sc,
        paint: (ctx, px) => paintCrop(ctx, kind, stage, dead, pal, px, hash3(base, variant, 17), CROPS[kind].color),
      };
    }
    if (k >= K_PRODUCE && k < K_PRODUCE + 8) {
      const kind = CROP_IDS[k - K_PRODUCE];
      return { x0: -0.3, y0: -0.34, x1: 0.3, y1: 0.3, paint: (ctx, px) => paintProduce(ctx, kind, pal, px) };
    }
    switch (k) {
      case K_HOUSE:
        return { x0: -0.3, y0: -3.95, x1: 3.6, y1: 0.15, paint: (ctx, px) => paintHouse(ctx, pal, px, snow) };
      case K_BUNK:
        return { x0: -0.3, y0: -3.0, x1: 3.55, y1: 0.15, paint: (ctx, px) => paintBunkhouse(ctx, pal, px, snow) };
      case K_SCARECROW:
        return { x0: -0.5, y0: -1.25, x1: 0.5, y1: 0.15, paint: (ctx, px) => paintScarecrow(ctx, pal, px) };
      case K_SPRINKLER:
        return { x0: -0.3, y0: -0.4, x1: 0.32, y1: 0.12, paint: (ctx, px) => paintSprinkler(ctx, pal, px) };
    }
    if (k >= K_CRATE && k < K_CRATE + 3) {
      const heap = k - K_CRATE;
      return { x0: 0, y0: -1.3, x1: 1.15, y1: 0.12, paint: (ctx, px) => paintCrate(ctx, pal, px, heap) };
    }
    const notes = k - K_BOARD;
    return { x0: -0.15, y0: -1.95, x1: 2.1, y1: 0.1, paint: (ctx, px) => paintBoard(ctx, pal, px, notes) };
  }

  private paint(k: number): Sprite {
    const d = this.def(k);
    const B = this.bucket;
    const old = this.map.get(k);
    const canvas = old && old.canvas.width === Math.ceil((d.x1 - d.x0) * B) ? old.canvas : document.createElement('canvas');
    canvas.width = Math.ceil((d.x1 - d.x0) * B);
    canvas.height = Math.ceil((d.y1 - d.y0) * B);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(B, 0, 0, B, -d.x0 * B, -d.y0 * B);
    ctx.clearRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    d.paint(ctx, 1 / B);
    const s: Sprite = old ?? { canvas, x0: d.x0, y0: d.y0, w: d.x1 - d.x0, h: d.y1 - d.y0, bucket: B, theme: this.theme };
    s.canvas = canvas;
    s.bucket = B;
    s.theme = this.theme;
    this.map.set(k, s);
    return s;
  }

  /** A sprite, painted now if it has never been painted, else possibly stale until the queue reaches it. */
  get(k: number): Sprite {
    const s = this.map.get(k);
    if (s) {
      if ((s.bucket !== this.bucket || s.theme !== this.theme) && !this.queued.has(k)) this.enqueue(k);
      return s;
    }
    return this.paint(k);
  }

  /** Repaint stale sprites for up to `ms`. */
  work(ms: number): void {
    if (!this.queue.length) return;
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < ms) {
      const k = this.queue.shift()!;
      this.queued.delete(k);
      const s = this.map.get(k);
      if (s && s.bucket === this.bucket && s.theme === this.theme) continue;
      this.paint(k);
    }
  }

  clear(): void {
    this.map.clear();
    this.queue.length = 0;
    this.queued.clear();
  }
}
