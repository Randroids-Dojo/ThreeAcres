// The page camera. Tiles are square on the page and +y runs down it, so the
// camera is a centre and a scale (CSS px per tile). Height lifts a point
// straight up the page by HEIGHT_K tiles per tile of height (the oblique view).
//
// Close: about nine tiles across the short side, centred on the farmer and
// gently smoothed. Wide: the whole farm with a small margin, or on a narrow
// portrait screen the six fields, so tiles stay tappable.

import type { CameraIntent } from '../contract';

export const HEIGHT_K = 1;

/** Tiles of page the wide camera may show past the edge of the farm. */
const SLACK = 1.6;
/** The six fields span columns 2 to 15; narrow screens frame them with half a tile each side. */
const FIELDS_W = 15;
const FIELDS_X = 9;

export class PageCamera {
  /** CSS size of the canvas. */
  w = 1;
  h = 1;
  /** Current (drawn) framing. */
  cx = 10;
  cy = 7.5;
  scale = 32;
  /** Target framing from the last intent. */
  tx = 10;
  ty = 7.5;
  ts = 32;
  private mode: 'close' | 'wide' | null = null;
  /** Rate of the glide between modes; eases off as the glide lands. */
  private glide = 0;

  /** Default CSS px per tile for a mode, before the player's zoom. */
  baseScale(mode: 'close' | 'wide', W: number, H: number): number {
    if (mode === 'close') return Math.min(this.w, this.h) / 9;
    // The farm plus a little page, with room for the treetops above row 0.
    const full = Math.min(this.w / (W + 1.2), this.h / (H + 2.2));
    if (full >= 24) return full;
    // Narrow screens: frame the six fields (columns 1.5 to 16.5); pan for the pond and the road.
    const fields = Math.min(this.w / FIELDS_W, this.h / (H + 2.2));
    return Math.max(full, fields);
  }

  /** Where the wide view centres across: the fields on narrow screens, the farm otherwise. */
  private wideX(W: number, H: number): number {
    return Math.min(this.w / (W + 1.2), this.h / (H + 2.2)) >= 24 ? W / 2 : FIELDS_X;
  }

  target(c: CameraIntent, W: number, H: number): void {
    const zoom = Math.min(2.5, Math.max(0.6, c.zoom || 1));
    const s = this.baseScale(c.mode, W, H) * zoom;
    this.ts = s;
    if (c.mode === 'close') {
      this.tx = c.focusX;
      this.ty = c.focusY;
    } else {
      this.tx = this.clamp(this.wideX(W, H) + (c.panX || 0), W, this.w / s);
      // The treetops rise above row 0, so the optical centre sits a touch high.
      this.ty = this.clamp(H / 2 - 0.35 + (c.panY || 0), H, this.h / s);
    }
    if (this.mode !== c.mode) {
      if (this.mode !== null) this.glide = 1;
      this.mode = c.mode;
    }
  }

  /** Keep the farm on screen: a small band of page past the edge at most, or the whole farm when it fits. */
  private clamp(v: number, size: number, view: number): number {
    const half = view / 2;
    const ext = size / 2 + SLACK;
    if (half >= ext) {
      const room = half - ext;
      return Math.min(size / 2 + room, Math.max(size / 2 - room, v));
    }
    return Math.min(size + SLACK - half, Math.max(half - SLACK, v));
  }

  /** Glide the drawn framing towards the target. */
  step(dt: number): void {
    const close = this.mode === 'close';
    let rate = close ? 5 : 22;
    if (this.glide > 0) {
      rate = 5.5;
      const far = Math.abs(Math.log(this.ts / this.scale)) + Math.hypot(this.tx - this.cx, this.ty - this.cy) * 0.05;
      if (far < 0.004) this.glide = 0;
    }
    const k = 1 - Math.exp(-rate * Math.min(0.1, dt));
    this.cx += (this.tx - this.cx) * k;
    this.cy += (this.ty - this.cy) * k;
    this.scale = Math.exp(Math.log(this.scale) + (Math.log(this.ts) - Math.log(this.scale)) * k);
  }

  snap(): void {
    this.cx = this.tx;
    this.cy = this.ty;
    this.scale = this.ts;
    this.glide = 0;
  }

  /** Screen origin of tile space, CSS px. */
  get ox(): number {
    return this.w / 2 - this.cx * this.scale;
  }
  get oy(): number {
    return this.h / 2 - this.cy * this.scale;
  }
}

/**
 * The framing that was actually drawn last, frozen at frame time so pick and
 * project agree with the pixels on screen even if the intent has moved on.
 */
export interface Drawn {
  ox: number;
  oy: number;
  scale: number;
}
