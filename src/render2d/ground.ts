// The ground of the almanac page, cached offscreen. The back layer holds the
// washes, soil, fences, tall grass and the trees behind the farm; the front
// layer holds the hedge and trees along the south edge, drawn over the actors.
// Both are lists of painted items with bounds, so a change to a few plots
// repaints only the patch around them, and a new zoom bucket or season is
// repainted a few items per frame while the old canvas stays on screen.

import type { Rules, WorldState } from '../sim/types';
import { blob, fill, flower, ink, inkW, leaf, letter, line, taper, tuft, type Ctx, wash } from './brush';
import { rgba } from './color';
import type { Palette } from './palette';
import { buildRegions, loopPath, type Regions } from './regions';
import { Rng, hash3, hashf } from './rng';
import { paintTree, type TreeSpec } from './trees';

export interface Paint {
  ctx: Ctx;
  /** One device pixel in tile units. */
  px: number;
  pal: Palette;
  s: Readonly<WorldState>;
  rules: Readonly<Rules>;
  snow: boolean;
  reg: Regions;
}

interface Item {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  draw: (p: Paint) => void;
}

/** Soil moisture as the page shows it: 0 dry to 3 soaked. */
export function wetLevel(rules: Readonly<Rules>, s: Readonly<WorldState>, i: number): number {
  const p = s.plots[i];
  if (rules.growth === 'classic') return p.wet ? 3 : 0;
  return Math.max(0, Math.min(3, Math.round(p.moisture)));
}

/** What a field tile looks like, as a small integer. Changes trigger a repaint. */
export function plotCode(rules: Readonly<Rules>, s: Readonly<WorldState>, i: number): number {
  const pid = s.parcelOf[i];
  const owned = pid >= 0 && s.parcels[pid].owned;
  const p = s.plots[i];
  return (owned ? 1 : 0) | (p.tilled ? 2 : 0) | (wetLevel(rules, s, i) << 2);
}

// ---------------------------------------------------------------------------
// Tile painters

function soilColor(pal: Palette, lvl: number): string {
  return lvl <= 0 ? pal.soilDry : lvl === 1 ? pal.soilDamp : lvl === 2 ? pal.soilMoist : pal.soilWet;
}

function paintSoil(p: Paint, x: number, y: number, lvl: number): void {
  const { ctx, px, pal } = p;
  const r = new Rng(hash3(x, y, 101));
  // Dry ground first; water darkens it as a patch that reaches the edges and
  // leaves the corners pale, so a watered row reads as soaked earth, not boards.
  ctx.beginPath();
  ctx.rect(x, y, 1, 1);
  fill(ctx, pal.soilDry, 0.9);
  for (let i = 0; i < 3; i++) {
    blob(ctx, x + r.range(0.2, 0.8), y + r.range(0.2, 0.8), r.range(0.18, 0.3), r.range(0.12, 0.22), r, 0.2, 7);
    fill(ctx, i === 0 ? pal.soilShadow : pal.soilRidge, 0.16);
  }
  if (lvl > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, 1, 1);
    ctx.clip();
    const k = lvl === 1 ? 0.5 : lvl === 2 ? 0.58 : 0.66;
    blob(ctx, x + 0.5 + r.jit(0.03), y + 0.5 + r.jit(0.03), k, k * 0.97, r, 0.07, 10);
    wash(ctx, soilColor(pal, lvl), 0.9, pal.ink, px, 0.25);
    ctx.restore();
  }
  const w = inkW(px);
  // Three furrows a tile, engraved in broken strokes. Their ends are hashed on
  // the shared tile edge so the rows run on across the field.
  for (let k = 0; k < 3; k++) {
    const row = y * 3 + k;
    const fy = y + 0.2 + k * 0.33;
    const yl = fy + (hashf(x, row, 7) - 0.5) * 0.04;
    const yr = fy + (hashf(x + 1, row, 7) - 0.5) * 0.04;
    const ym = (yl + yr) / 2 + r.jit(0.018);
    const at = (u: number) => (u < 0.5 ? yl + (ym - yl) * u * 2 : ym + (yr - ym) * (u - 0.5) * 2);
    // Soft trough shadow under the ridge.
    ctx.beginPath();
    ctx.moveTo(x, yl + 0.055);
    ctx.quadraticCurveTo(x + 0.5, ym + 0.06, x + 1, yr + 0.055);
    ink(ctx, lvl >= 2 ? '#3a2818' : pal.soilShadow, Math.max(px * 3, 0.07), lvl >= 2 ? 0.22 : 0.32);
    // Hatching in the trough, in short broken runs.
    ctx.beginPath();
    for (let u = r.next() * 0.05; u < 1; u += 0.045) {
      if (r.chance(0.3)) continue;
      const yy = at(u) + 0.03;
      ctx.moveTo(x + u, yy);
      ctx.lineTo(x + u + 0.03, yy + 0.05);
    }
    ink(ctx, pal.ink, w * 0.55, lvl >= 2 ? 0.25 : 0.32);
    // The ridge line itself: two or three strokes with gaps, a pen lifting.
    ctx.beginPath();
    let u = r.next() * 0.12;
    while (u < 1) {
      const len = r.range(0.22, 0.45);
      const u1 = Math.min(1, u + len);
      ctx.moveTo(x + u, at(u) + 0.012);
      ctx.quadraticCurveTo(x + (u + u1) / 2, at((u + u1) / 2) + 0.012 + r.jit(0.006), x + u1, at(u1) + 0.012);
      u = u1 + r.range(0.04, 0.14);
    }
    ink(ctx, pal.ink, w * 0.8, lvl >= 2 ? 0.45 : 0.5);
    // Light catching the ridge tops, in dabs.
    ctx.beginPath();
    for (let j = 0; j < 3; j++) {
      const u0 = r.range(0, 0.8);
      const u1 = Math.min(1, u0 + r.range(0.08, 0.2));
      ctx.moveTo(x + u0, at(u0) - 0.018);
      ctx.lineTo(x + u1, at(u1) - 0.018);
    }
    ink(ctx, pal.frost ? '#ffffff' : lvl >= 2 ? pal.sheen : pal.soilRidge, Math.max(px * 1.4, 0.03), lvl >= 2 ? 0.55 : 0.8);
    if (p.snow) {
      ctx.beginPath();
      for (let j = 0; j < 3; j++) {
        const u0 = r.range(0, 0.75);
        const u1 = Math.min(1, u0 + r.range(0.12, 0.3));
        ctx.moveTo(x + u0, at(u0) + 0.05);
        ctx.lineTo(x + u1, at(u1) + 0.05);
      }
      ink(ctx, '#ffffff', Math.max(px * 2.5, 0.07), 0.9);
    }
  }
  // Clods.
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const cx = x + r.range(0.06, 0.94);
    const cy = y + r.range(0.06, 0.94);
    const cr = 0.01 + r.next() * 0.014;
    ctx.moveTo(cx + cr, cy);
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
  }
  fill(ctx, pal.ink, 0.32);
  if (lvl === 3) {
    // Standing water glints in the troughs when soaked.
    ctx.beginPath();
    for (let i = 0; i < 2; i++) {
      const gx = x + r.range(0.2, 0.75);
      const gy = y + 0.2 + r.int(3) * 0.33 + 0.07;
      ctx.moveTo(gx + 0.1, gy);
      ctx.ellipse(gx, gy, 0.1, 0.022, 0, 0, Math.PI * 2);
    }
    fill(ctx, pal.sheen, 0.6);
  }
  if (pal.frost) {
    ctx.beginPath();
    for (let i = 0; i < 18; i++) ctx.rect(x + r.next(), y + r.next(), px * 1.4, px * 1.4);
    fill(ctx, '#ffffff', 0.8);
  }
}

function paintMeadow(p: Paint, x: number, y: number): void {
  const { ctx, px, pal } = p;
  const r = new Rng(hash3(x, y, 202));
  ctx.beginPath();
  ctx.rect(x, y, 1, 1);
  fill(ctx, pal.meadow, 0.85);
  for (let i = 0; i < 3; i++) {
    blob(ctx, x + r.range(0.15, 0.85), y + r.range(0.15, 0.85), r.range(0.15, 0.3), r.range(0.1, 0.2), r, 0.25, 7);
    fill(ctx, i ? pal.meadowDeep : pal.grassLight, 0.3);
  }
  // Tussocks and the odd stone: rough, unworked ground.
  for (let i = 0; i < 5; i++) {
    tuft(ctx, x + r.range(0.1, 0.9), y + r.range(0.2, 0.95), r.range(0.09, 0.15), 5, pal.tuft, r, r.jit(0.2), 0.018);
  }
  if (r.chance(0.5)) {
    const sx = x + r.range(0.2, 0.8);
    const sy = y + r.range(0.3, 0.85);
    blob(ctx, sx, sy, 0.06, 0.04, r, 0.2, 6);
    fill(ctx, '#b8b0a0');
    ink(ctx, pal.ink, inkW(px) * 0.8, 0.7);
  }
  if (pal.season < 2 && r.chance(0.5)) {
    for (let i = 0; i < 2; i++) flower(ctx, x + r.range(0.15, 0.85), y + r.range(0.2, 0.9), 0.035, pal.flower[r.int(4)], '#e8b83a', pal.ink, px, r);
  }
  if (pal.frost) frostSpeckle(p, x, y, r, 16);
  if (p.snow) snowPatch(p, x, y, r);
}

function paintTallBase(p: Paint, x: number, y: number): void {
  const { ctx, pal } = p;
  const r = new Rng(hash3(x, y, 303));
  ctx.beginPath();
  ctx.rect(x, y, 1, 1);
  fill(ctx, pal.tall, 0.8);
  for (let i = 0; i < 3; i++) {
    blob(ctx, x + r.range(0.2, 0.8), y + r.range(0.2, 0.8), r.range(0.2, 0.32), r.range(0.15, 0.25), r, 0.2, 7);
    fill(ctx, i ? pal.tallDeep : pal.tallLight, 0.3);
  }
  if (p.snow) snowPatch(p, x, y, r);
}

/** Tall unmown grass on a field that is still for sale: an upright, so it overlaps upward. */
function paintTallGrass(p: Paint, x: number, y: number): void {
  const { ctx, px, pal } = p;
  const r = new Rng(hash3(x, y, 304));
  const cols = [pal.tallDeep, pal.tall, pal.tallLight];
  for (let row = 0; row < 3; row++) {
    const by = y + 0.36 + row * 0.3;
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const bx = x + (i + r.next()) / 9;
      const h = r.range(0.26, 0.44);
      const lean = r.jit(0.18) + 0.06;
      taperPath(ctx, bx, by, bx + lean * h * 0.5, by - h * 0.55, bx + lean * h, by - h, 0.03, 0.004);
    }
    fill(ctx, cols[row], 0.95);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const bx = x + r.next();
      const h = r.range(0.22, 0.4);
      const lean = r.jit(0.2);
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + lean * h * 0.5, by - h * 0.5, bx + lean * h, by - h);
    }
    ink(ctx, pal.ink, inkW(px) * 0.7, 0.45);
    if (pal.season >= 1 && pal.season <= 2) {
      // Seed heads.
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const hx = x + r.range(0.05, 0.95);
        const hy = by - r.range(0.32, 0.46);
        ctx.ellipse(hx, hy, 0.014, 0.04, r.jit(0.4), 0, Math.PI * 2);
      }
      fill(ctx, pal.season === 2 ? '#b0884a' : '#d8c27a');
    }
  }
}

function taperPath(ctx: Ctx, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w0: number, w1: number): void {
  // Like taper(), but adds to the current path so a whole clump is one fill.
  const n = 5;
  const L: number[] = [];
  const R: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
    const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
    const tx = 2 * u * (cx - x0) + 2 * t * (x1 - cx);
    const ty = 2 * u * (cy - y0) + 2 * t * (y1 - cy);
    const tl = Math.hypot(tx, ty) || 1;
    const w = (w0 + (w1 - w0) * t) / 2;
    L.push(x - (ty / tl) * w, y + (tx / tl) * w);
    R.push(x + (ty / tl) * w, y - (tx / tl) * w);
  }
  ctx.moveTo(L[0], L[1]);
  for (let i = 2; i < L.length; i += 2) ctx.lineTo(L[i], L[i + 1]);
  for (let i = R.length - 2; i >= 0; i -= 2) ctx.lineTo(R[i], R[i + 1]);
  ctx.closePath();
}

function frostSpeckle(p: Paint, x: number, y: number, r: Rng, n: number): void {
  const { ctx, px } = p;
  ctx.beginPath();
  for (let i = 0; i < n; i++) ctx.rect(x + r.next(), y + r.next(), px * 1.5, px * 1.5);
  fill(ctx, '#ffffff', 0.85);
}

/** Snow lies over everything in a sheet; this only adds blue drift lines. */
function snowPatch(p: Paint, x: number, y: number, r: Rng): void {
  const { ctx, px } = p;
  ctx.beginPath();
  for (let i = 0; i < 2; i++) {
    const sx = x + r.range(0.1, 0.6);
    const sy = y + r.range(0.2, 0.9);
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + 0.15, sy - 0.05, sx + 0.32, sy);
  }
  ink(ctx, '#9fb2c8', Math.max(px * 1.2, 0.022), 0.6);
}

function paintGrass(p: Paint, x: number, y: number): void {
  const { ctx, px, pal, s } = p;
  const r = new Rng(hash3(x, y, 404));
  for (let i = 0; i < (p.snow ? 0 : 2); i++) {
    blob(ctx, x + r.range(0.25, 0.75), y + r.range(0.25, 0.75), r.range(0.2, 0.32), r.range(0.14, 0.24), r, 0.25, 7);
    fill(ctx, i ? pal.grassDeep : pal.grassLight, 0.32);
  }
  for (let i = 0; i < 3; i++) tuft(ctx, x + r.range(0.12, 0.88), y + r.range(0.25, 0.95), r.range(0.06, 0.1), 4, pal.tuft, r, r.jit(0.25), 0.014);
  // Near the trees in autumn the grass is littered with leaves.
  const nearWood = (dx: number, dy: number) => {
    const X = x + dx;
    const Y = y + dy;
    return X < 0 || Y < 0 || X >= s.W || Y >= s.H || s.tiles[Y * s.W + X] === 'wood';
  };
  if (pal.season === 2 && (nearWood(0, -1) || nearWood(-1, 0) || nearWood(1, 0) || nearWood(0, 1) || r.chance(0.3))) {
    for (let i = 0; i < 4; i++) {
      leaf(ctx, x + r.range(0.1, 0.9), y + r.range(0.1, 0.9), 0.07, 0.03, r.next() * 6.28);
      fill(ctx, pal.crown[r.int(3)], 0.9);
    }
  } else if (pal.season < 2 && r.chance(0.42)) {
    const n = 1 + r.int(3);
    for (let i = 0; i < n; i++) flower(ctx, x + r.range(0.15, 0.85), y + r.range(0.2, 0.9), 0.03 + r.next() * 0.01, pal.flower[r.int(4)], '#e8b83a', pal.ink, px, r);
  }
  if (pal.frost) frostSpeckle(p, x, y, r, 22);
  if (p.snow) snowPatch(p, x, y, r);
}

function paintYard(p: Paint, x: number, y: number): void {
  const { ctx, px, pal } = p;
  const r = new Rng(hash3(x, y, 505));
  for (let i = 0; i < (p.snow ? 0 : 2); i++) {
    blob(ctx, x + r.range(0.25, 0.75), y + r.range(0.25, 0.75), r.range(0.2, 0.35), r.range(0.12, 0.22), r, 0.3, 7);
    fill(ctx, pal.yardDeep, 0.22);
  }
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const cx = x + r.range(0.08, 0.92);
    const cy = y + r.range(0.08, 0.92);
    ctx.moveTo(cx + 0.02, cy);
    ctx.ellipse(cx, cy, 0.02 + r.next() * 0.015, 0.013, 0, 0, Math.PI * 2);
  }
  fill(ctx, pal.pebble, 0.75);
  ink(ctx, pal.ink, inkW(px) * 0.5, 0.35);
  // Straw and scuffs.
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const sx = x + r.range(0.1, 0.85);
    const sy = y + r.range(0.1, 0.9);
    const a = r.next() * 3.14;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(a) * 0.08, sy + Math.sin(a) * 0.03);
  }
  ink(ctx, pal.season === 3 ? '#a89a7a' : '#c8a64a', Math.max(px, 0.014), 0.7);
  if (pal.frost) frostSpeckle(p, x, y, r, 14);
  if (p.snow) snowPatch(p, x, y, r);
}

function paintPath(p: Paint, x: number, y: number): void {
  const { ctx, px, pal, s } = p;
  const r = new Rng(hash3(x, y, 606));
  // Which way the path runs, for the worn strip down its middle.
  const isPath = (X: number, Y: number) => X >= 0 && Y >= 0 && X < s.W && Y < s.H && s.tiles[Y * s.W + X] === 'path';
  const ew = isPath(x - 1, y) || isPath(x + 1, y) || x === s.W - 1;
  const ns = isPath(x, y - 1) || isPath(x, y + 1);
  ctx.beginPath();
  if (ew) ctx.rect(x, y + 0.36, 1, 0.28);
  if (ns) ctx.rect(x + 0.36, y, 0.28, 1);
  fill(ctx, '#ffffff', 0.28);
  // Gravel.
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const cx = x + r.range(0.04, 0.96);
    const cy = y + r.range(0.04, 0.96);
    const rr = 0.012 + r.next() * 0.018;
    ctx.moveTo(cx + rr, cy);
    ctx.ellipse(cx, cy, rr, rr * 0.75, 0, 0, Math.PI * 2);
  }
  fill(ctx, pal.pebble, 0.7);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const cx = x + r.range(0.1, 0.9);
    const cy = y + r.range(0.1, 0.9);
    ctx.moveTo(cx + 0.035, cy);
    ctx.ellipse(cx, cy, 0.035, 0.024, r.jit(0.5), 0, Math.PI * 2);
  }
  fill(ctx, pal.path, 1);
  ink(ctx, pal.ink, inkW(px) * 0.6, 0.55);
  if (pal.frost) frostSpeckle(p, x, y, r, 10);
  if (p.snow) snowPatch(p, x, y, r);
}

// ---------------------------------------------------------------------------
// Fences around fields still for sale

const POST_H = 0.42;

function post(p: Paint, x: number, y: number, r: Rng): void {
  const { ctx, px, pal } = p;
  const w = 0.07;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x - w / 2 + r.jit(0.005), y - POST_H);
  ctx.lineTo(x + r.jit(0.01), y - POST_H - 0.03);
  ctx.lineTo(x + w / 2, y - POST_H + 0.005);
  ctx.lineTo(x + w / 2, y);
  ctx.closePath();
  fill(ctx, pal.fence);
  ink(ctx, pal.ink, inkW(px) * 0.9, 0.85);
  ctx.beginPath();
  ctx.rect(x + w * 0.05, y - POST_H, w * 0.45, POST_H);
  fill(ctx, pal.fenceDeep, 0.5);
  if (p.snow || pal.frost) {
    ctx.beginPath();
    ctx.ellipse(x, y - POST_H - 0.015, w * 0.65, 0.02, 0, 0, Math.PI * 2);
    fill(ctx, '#ffffff', 0.9);
  }
}

function rail(p: Paint, x0: number, y0: number, x1: number, y1: number, r: Rng): void {
  const { ctx, px, pal } = p;
  for (const h of [0.15, 0.32]) {
    const sag = 0.015;
    taper(ctx, x0, y0 - h, (x0 + x1) / 2, (y0 + y1) / 2 - h + sag, x1, y1 - h, 0.045, 0.04);
    fill(ctx, pal.fence);
    ink(ctx, pal.ink, inkW(px) * 0.8, 0.75);
    ctx.beginPath();
    line(ctx, x0, y0 - h + 0.012, x1, y1 - h + 0.012, r, 0.004);
    ink(ctx, pal.fenceDeep, Math.max(px, 0.012), 0.7);
  }
}

function saleTag(p: Paint, x: number, y: number): void {
  const { ctx, px, pal } = p;
  const r = new Rng(hash3(x * 10, y * 10, 707));
  const w = 0.82;
  const h = 0.32;
  const ty = y - 0.28;
  ctx.save();
  ctx.translate(x, ty);
  ctx.rotate(-0.06);
  // String to the rail.
  ctx.beginPath();
  ctx.moveTo(-w * 0.35, -0.06);
  ctx.lineTo(-w * 0.25, h * 0.15);
  ctx.moveTo(w * 0.35, -0.06);
  ctx.lineTo(w * 0.25, h * 0.15);
  ink(ctx, pal.ink, inkW(px) * 0.7, 0.8);
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 0.06, h * 0.1);
  ctx.lineTo(w / 2 - 0.06, h * 0.1 + r.jit(0.01));
  ctx.lineTo(w / 2, h * 0.55);
  ctx.lineTo(w / 2 - 0.06, h + 0.1);
  ctx.lineTo(-w / 2 + 0.06, h + 0.1 + r.jit(0.01));
  ctx.lineTo(-w / 2, h * 0.55);
  ctx.closePath();
  fill(ctx, '#f7efd9');
  ink(ctx, pal.ink, inkW(px), 0.9);
  letter(ctx, 'for sale', 0, h * 0.86, 0.24, pal.ink, 'center', true, 600);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The layer: a cached canvas of items

export interface LayerBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

class Layer {
  items: Item[] = [];
  canvas: HTMLCanvasElement | null = null;
  bucket = 0;
  private next: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; bucket: number; i: number } | null = null;
  /** Dirty patch found while a rebuild was underway, repainted after the swap. */
  private late: LayerBounds | null = null;
  constructor(public b: LayerBounds) {}

  private make(bucket: number) {
    const c = document.createElement('canvas');
    c.width = Math.ceil((this.b.x1 - this.b.x0) * bucket);
    c.height = Math.ceil((this.b.y1 - this.b.y0) * bucket);
    const ctx = c.getContext('2d')!;
    return { canvas: c, ctx, bucket, i: 0 };
  }

  private prep(ctx: CanvasRenderingContext2D, bucket: number) {
    ctx.setTransform(bucket, 0, 0, bucket, -this.b.x0 * bucket, -this.b.y0 * bucket);
  }

  /** Start a repaint at a new bucket; the old canvas stays until it lands. */
  rebuild(bucket: number, mk: (ctx: Ctx, px: number) => Paint, sync: boolean): void {
    this.next = this.make(bucket);
    this.late = null;
    if (sync || !this.canvas) this.work(mk, Infinity);
  }

  get busy(): boolean {
    return this.next !== null;
  }

  /** Paint items into the pending canvas for up to `ms`. */
  work(mk: (ctx: Ctx, px: number) => Paint, ms: number): void {
    const n = this.next;
    if (!n) return;
    const t0 = performance.now();
    const p = mk(n.ctx, 1 / n.bucket);
    this.prep(n.ctx, n.bucket);
    while (n.i < this.items.length) {
      const it = this.items[n.i++];
      n.ctx.save();
      it.draw(p);
      n.ctx.restore();
      if (performance.now() - t0 > ms) break;
    }
    if (n.i >= this.items.length) {
      this.canvas = n.canvas;
      this.bucket = n.bucket;
      this.next = null;
      if (this.late) {
        const l = this.late;
        this.late = null;
        this.repaint(l, mk);
      }
    }
  }

  /** Repaint everything that touches a patch, clipped to it. */
  repaint(rc: LayerBounds, mk: (ctx: Ctx, px: number) => Paint): void {
    if (this.next) {
      this.late = this.late ? union(this.late, rc) : { ...rc };
    }
    if (!this.canvas) return;
    const ctx = this.canvas.getContext('2d')!;
    const B = this.bucket;
    this.prep(ctx, B);
    // Snap the patch to whole device pixels so the clear and the clip agree.
    const x0 = Math.floor((rc.x0 - this.b.x0) * B) / B + this.b.x0;
    const y0 = Math.floor((rc.y0 - this.b.y0) * B) / B + this.b.y0;
    const x1 = Math.ceil((rc.x1 - this.b.x0) * B) / B + this.b.x0;
    const y1 = Math.ceil((rc.y1 - this.b.y0) * B) / B + this.b.y0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.clip();
    ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
    const p = mk(ctx, 1 / B);
    for (const it of this.items) {
      if (it.x1 < x0 || it.x0 > x1 || it.y1 < y0 || it.y0 > y1) continue;
      ctx.save();
      it.draw(p);
      ctx.restore();
    }
    ctx.restore();
  }
}

function union(a: LayerBounds, b: LayerBounds): LayerBounds {
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

// ---------------------------------------------------------------------------
// The ground: builds both layers' item lists for a farm and a season.

export class Ground {
  back: Layer;
  front: Layer;
  private codes: Int16Array = new Int16Array(0);
  private fieldIdx: Int32Array = new Int32Array(0);
  private reg: Regions | null = null;
  private state: Readonly<WorldState> | null = null;
  private key = '';
  pal!: Palette;
  rules!: Readonly<Rules>;
  snow = false;
  /** Paint time of the last full rebuild of each layer, ms, for the perf log. */
  constructor(W: number, H: number) {
    this.back = new Layer({ x0: -2.2, y0: -2.6, x1: W + 2.2, y1: H + 2.4 });
    this.front = new Layer({ x0: -2.2, y0: H - 2.2, x1: W + 2.2, y1: H + 2.4 });
  }

  private mk = (ctx: Ctx, px: number): Paint => ({ ctx, px, pal: this.pal, s: this.state!, rules: this.rules, snow: this.snow, reg: this.reg! });

  /**
   * Bring the caches up to date with the farm. Returns true when the visible
   * ground changed this frame.
   */
  update(s: Readonly<WorldState>, rules: Readonly<Rules>, pal: Palette, snow: boolean, bucket: number, fontsReady: boolean): void {
    const key = `${pal.season}|${snow ? 1 : 0}|${fontsReady ? 1 : 0}`;
    const newState = s !== this.state;
    this.rules = rules;
    if (newState) {
      this.state = s;
      this.reg = buildRegions(s);
      this.fieldIdx = new Int32Array(s.tiles.map((k, i) => (k === 'field' ? i : -1)).filter((i) => i >= 0));
      this.codes = new Int16Array(s.W * s.H).fill(-1);
    }
    if (newState || key !== this.key) {
      this.key = key;
      this.pal = pal;
      this.snow = snow;
      for (const i of this.fieldIdx) this.codes[i] = plotCode(rules, s, i);
      this.buildItems(s);
      // A new farm paints at once; a new season fades in over a few frames.
      this.back.rebuild(bucket, this.mk, newState);
      this.front.rebuild(bucket, this.mk, newState);
      return;
    }
    if (bucket !== this.back.bucket && !this.back.busy) {
      this.back.rebuild(bucket, this.mk, false);
      this.front.rebuild(bucket, this.mk, false);
    }
    // Plots that changed since the last frame.
    let x0 = 1e9;
    let y0 = 1e9;
    let x1 = -1e9;
    let y1 = -1e9;
    let n = 0;
    for (const i of this.fieldIdx) {
      const c = plotCode(rules, s, i);
      if (c === this.codes[i]) continue;
      this.codes[i] = c;
      const x = i % s.W;
      const y = (i - x) / s.W;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x + 1);
      y1 = Math.max(y1, y + 1);
      n++;
    }
    if (n > 0) {
      // Fences and tall grass reach up the page, so repaint a tile around the change.
      const rc = { x0: x0 - 0.6, y0: y0 - 0.9, x1: x1 + 0.6, y1: y1 + 0.6 };
      this.back.repaint(rc, this.mk);
    }
    this.back.work(this.mk, 5);
    this.front.work(this.mk, 2);
  }

  private buildItems(s: Readonly<WorldState>): void {
    const W = s.W;
    const H = s.H;
    const back: Item[] = [];
    const front: Item[] = [];
    const all = { x0: -3, y0: -3, x1: W + 3, y1: H + 3 };
    const reg = this.reg!;

    // 1. Region washes.
    back.push({
      ...all,
      draw: (p) => {
        const { ctx, px, pal } = p;
        // The wood floor fades into the paper at its ragged edge.
        ctx.fillStyle = pal.woodFloor;
        ctx.globalAlpha = 0.85;
        (ctx as CanvasRenderingContext2D).fill(reg.path.wood, 'evenodd');
        ctx.globalAlpha = 1;
        const order = ['grass', 'yard', 'path', 'water', 'field'] as const;
        const col: Record<(typeof order)[number], string> = { grass: pal.grass, yard: pal.yard, path: pal.path, water: pal.water, field: pal.meadow };
        for (const k of order) {
          ctx.fillStyle = col[k];
          ctx.globalAlpha = k === 'water' ? 0.95 : 0.85;
          (ctx as CanvasRenderingContext2D).fill(reg.path[k], 'evenodd');
        }
        ctx.globalAlpha = 1;
        if (p.snow) {
          ctx.fillStyle = '#fbfcff';
          ctx.globalAlpha = 0.62;
          for (const k of ['grass', 'yard', 'path'] as const) (ctx as CanvasRenderingContext2D).fill(reg.path[k], 'evenodd');
          (ctx as CanvasRenderingContext2D).fill(reg.path.wood, 'evenodd');
          ctx.globalAlpha = 1;
        }
        // Pooled edges where washes meet.
        for (const k of ['grass', 'yard', 'path'] as const) {
          ctx.beginPath();
          for (const l of reg.loops[k]) loopPath(ctx, l);
          ink(ctx, k === 'grass' ? pal.grassDeep : k === 'yard' ? pal.yardDeep : pal.pathDeep, Math.max(px * 1.6, 0.03), 0.55);
        }
      },
    });

    // 2. Per tile texture and soil.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const k = s.tiles[i];
        const box = { x0: x - 0.15, y0: y - 0.15, x1: x + 1.15, y1: y + 1.15 };
        if (k === 'grass') back.push({ ...box, draw: (p) => paintGrass(p, x, y) });
        else if (k === 'yard') back.push({ ...box, draw: (p) => paintYard(p, x, y) });
        else if (k === 'path') back.push({ ...box, draw: (p) => paintPath(p, x, y) });
        else if (k === 'field') {
          back.push({
            ...box,
            draw: (p) => {
              const ctx = p.ctx as CanvasRenderingContext2D;
              ctx.clip(p.reg.path.field, 'evenodd');
              const pid = p.s.parcelOf[i];
              const owned = pid >= 0 && p.s.parcels[pid].owned;
              const pl = p.s.plots[i];
              if (!owned) paintTallBase(p, x, y);
              else if (!pl.tilled) paintMeadow(p, x, y);
              else paintSoil(p, x, y, wetLevel(p.rules, p.s, i));
            },
          });
        }
      }
    }

    // 3. The pond.
    const water = reg.loops.water;
    if (water.length) {
      let wx0 = 1e9;
      let wy0 = 1e9;
      let wx1 = -1e9;
      let wy1 = -1e9;
      for (let i = 0; i < s.tiles.length; i++) {
        if (s.tiles[i] !== 'water') continue;
        const x = i % W;
        const y = (i - x) / W;
        wx0 = Math.min(wx0, x);
        wy0 = Math.min(wy0, y);
        wx1 = Math.max(wx1, x + 1);
        wy1 = Math.max(wy1, y + 1);
      }
      back.push({
        x0: wx0 - 0.5,
        y0: wy0 - 0.5,
        x1: wx1 + 0.5,
        y1: wy1 + 0.5,
        draw: (p) => paintPond(p, wx0, wy0, wx1, wy1),
      });
    }

    // 4. Ink: field and water edges.
    back.push({
      ...all,
      draw: (p) => {
        const { ctx, px, pal } = p;
        const r = new Rng(77);
        // Field edges, a bold double pass like a surveyor's line.
        for (const l of reg.loops.field) {
          ctx.beginPath();
          for (let i = 0; i < l.length; i += 2) {
            const x = l[i] + r.jit(0.006);
            const y = l[i + 1] + r.jit(0.006);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ink(ctx, pal.soilShadow, Math.max(px * 3, 0.07), 0.35);
          ink(ctx, pal.ink, inkW(px, 1.25), 0.85);
        }
        for (const l of reg.loops.water) {
          ctx.beginPath();
          loopPath(ctx, l);
          ink(ctx, '#6b5a3a', Math.max(px * 4, 0.1), 0.3);
          ink(ctx, pal.ink, inkW(px, 1.2), 0.85);
        }
        ctx.beginPath();
        for (const l of reg.loops.path) loopPath(ctx, l);
        ink(ctx, pal.ink, inkW(px, 0.8), 0.35);
      },
    });

    // 5. The road leaves east and fades into the paper.
    const road = { x: W - 1, y: 4 };
    for (let i = 0; i < s.tiles.length; i++) {
      if (s.tiles[i] === 'path' && i % W === W - 1) road.y = (i - (W - 1)) / W;
    }
    back.push({
      x0: W - 0.5,
      y0: road.y - 1.5,
      x1: W + 2.3,
      y1: road.y + 1.5,
      draw: (p) => {
        const { ctx, px, pal } = p;
        const r = new Rng(55);
        const grad = ctx.createLinearGradient(W - 0.1, 0, W + 2.1, 0);
        grad.addColorStop(0, rgba(pal.path, 1));
        grad.addColorStop(1, rgba(pal.path, 0));
        ctx.beginPath();
        ctx.moveTo(W - 0.05, road.y + 0.02);
        ctx.quadraticCurveTo(W + 1, road.y - 0.05, W + 2.2, road.y + 0.25);
        ctx.lineTo(W + 2.2, road.y + 0.75);
        ctx.quadraticCurveTo(W + 1, road.y + 1.05, W - 0.05, road.y + 0.98);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.beginPath();
        line(ctx, W - 0.05, road.y + 0.02, W + 1.6, road.y + 0.08, r, 0.02);
        line(ctx, W - 0.05, road.y + 0.98, W + 1.6, road.y + 0.9, r, 0.02);
        ink(ctx, pal.ink, inkW(px, 0.8), 0.35);
      },
    });

    // 6. Uprights painted into the ground: trees behind the farm, tall grass, fences, reeds.
    const ups: { y: number; it: Item }[] = [];
    const trees: TreeSpec[] = [];
    const frontTrees: TreeSpec[] = [];
    const seedBase = s.worldSeed * 7919;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (s.tiles[y * W + x] !== 'wood') continue;
        const h = hash3(x, y, seedBase);
        const r = new Rng(h);
        const south = y === H - 1;
        const kind: TreeSpec['kind'] = south ? 'bush' : r.chance(0.28) ? 'pine' : 'oak';
        const spec: TreeSpec = {
          x: x + 0.5 + r.jit(0.18),
          y: south ? y + 0.92 + r.jit(0.05) : y === 0 ? y + 0.86 + r.jit(0.08) : y + 0.6 + r.jit(0.2),
          kind,
          size: south ? 0.95 + r.jit(0.15) : y === 0 ? 0.92 + r.jit(0.12) : 0.8 + r.jit(0.12),
          seed: h,
          fade: 1,
        };
        if (south) frontTrees.push(spec);
        else trees.push(spec);
      }
    }
    // A sketchier ring of trees just beyond the farm, thinning into the paper.
    for (let x = -1; x <= W; x++) {
      const r = new Rng(hash3(x, -5, seedBase));
      trees.push({ x: x + 0.5 + r.jit(0.3), y: 0.12 + r.jit(0.1), kind: r.chance(0.3) ? 'pine' : 'oak', size: 0.8 + r.jit(0.1), seed: hash3(x, -5, 3), fade: 0.55 });
      const r2 = new Rng(hash3(x, 99, seedBase));
      frontTrees.push({ x: x + r2.jit(0.3), y: H + 0.75 + r2.jit(0.12), kind: r2.chance(0.35) ? 'pine' : 'oak', size: 0.72 + r2.jit(0.1), seed: hash3(x, 99, 3), fade: 0.6 });
    }
    for (let y = 0; y <= H; y++) {
      for (const x of [-0.45, W + 0.45]) {
        const r = new Rng(hash3(Math.round(x * 10), y, seedBase + 5));
        trees.push({ x: x + r.jit(0.15), y: y + 0.5 + r.jit(0.2), kind: r.chance(0.35) ? 'pine' : 'oak', size: 0.75 + r.jit(0.1), seed: hash3(Math.round(x * 10), y, 9), fade: 0.5 });
      }
    }
    for (const t of trees) {
      const R = t.kind === 'bush' ? 0.5 : 0.8;
      const Ht = t.kind === 'bush' ? 0.8 : 2.0;
      ups.push({ y: t.y, it: { x0: t.x - R, y0: t.y - Ht * t.size, x1: t.x + R, y1: t.y + 0.2, draw: (p) => paintTree(p.ctx, t, p.pal, p.px) } });
    }
    frontTrees.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const t of frontTrees) {
      front.push({ x0: t.x - 0.8, y0: t.y - 2.0 * t.size, x1: t.x + 0.8, y1: t.y + 0.2, draw: (p) => paintTree(p.ctx, t, p.pal, p.px) });
    }

    // Tall grass and fences, for fields not yet bought.
    for (const par of s.parcels) {
      const id = par.id;
      const unowned = (p: Paint) => !p.s.parcels[id].owned;
      for (let y = par.y; y < par.y + par.h; y++) {
        for (let x = par.x; x < par.x + par.w; x++) {
          ups.push({ y: y + 0.95, it: { x0: x - 0.3, y0: y - 0.3, x1: x + 1.3, y1: y + 1.05, draw: (p) => unowned(p) && paintTallGrass(p, x, y) } });
        }
      }
      const fr = (n: number) => new Rng(hash3(id, n, 808));
      // North and south rails, posts at every tile corner.
      for (const fy of [par.y, par.y + par.h]) {
        for (let x = par.x; x < par.x + par.w; x++) {
          ups.push({
            y: fy + 0.001,
            it: {
              x0: x - 0.1,
              y0: fy - 0.6,
              x1: x + 1.1,
              y1: fy + 0.1,
              draw: (p) => {
                if (!unowned(p)) return;
                const r = fr(x * 31 + fy);
                rail(p, x, fy, x + 1, fy, r);
                post(p, x, fy, r);
                if (x === par.x + par.w - 1) post(p, x + 1, fy, r);
              },
            },
          });
        }
      }
      for (const fx of [par.x, par.x + par.w]) {
        for (let y = par.y; y < par.y + par.h; y++) {
          ups.push({
            y: y + 1 - 0.002,
            it: {
              x0: fx - 0.15,
              y0: y - 0.6,
              x1: fx + 0.15,
              y1: y + 1.1,
              draw: (p) => {
                if (!unowned(p)) return;
                const r = fr(fx * 37 + y + 500);
                rail(p, fx, y, fx, y + 1, r);
                if (y + 1 < par.y + par.h) post(p, fx, y + 1, r);
              },
            },
          });
        }
      }
      // The for-sale tag hangs on the south rail.
      const tx = par.x + par.w / 2;
      const ty = par.y + par.h;
      ups.push({ y: ty + 0.01, it: { x0: tx - 0.6, y0: ty - 0.5, x1: tx + 0.6, y1: ty + 0.25, draw: (p) => unowned(p) && saleTag(p, tx, ty) } });
    }

    // Reeds and cattails where the pond meets the grass.
    for (let i = 0; i < s.tiles.length; i++) {
      if (s.tiles[i] !== 'water') continue;
      const x = i % W;
      const y = (i - x) / W;
      const r = new Rng(hash3(x, y, 909));
      const spots: [number, number][] = [];
      const land = (X: number, Y: number) => X >= 0 && Y >= 0 && X < W && Y < H && s.tiles[Y * W + X] !== 'water' && s.tiles[Y * W + X] !== 'wood';
      if (land(x - 1, y)) spots.push([x + 0.12, y + r.range(0.3, 0.8)]);
      if (land(x, y + 1)) spots.push([x + r.range(0.3, 0.8), y + 0.9]);
      if (land(x, y - 1) && r.chance(0.6)) spots.push([x + r.range(0.3, 0.7), y + 0.15]);
      for (const [rx, ry] of spots) {
        ups.push({ y: ry, it: { x0: rx - 0.3, y0: ry - 0.8, x1: rx + 0.3, y1: ry + 0.1, draw: (p) => paintReeds(p, rx, ry) } });
      }
    }

    // A fingerpost where the road leaves.
    ups.push({ y: road.y + 0.05, it: { x0: W - 0.2, y0: road.y - 1.2, x1: W + 1.6, y1: road.y + 0.2, draw: (p) => paintSignpost(p, W + 0.5, road.y + 0.02) } });

    ups.sort((a, b) => a.y - b.y);
    for (const u of ups) back.push(u.it);

    // 7. The plate: a ruled frame and a caption.
    back.push({
      ...all,
      draw: (p) => paintPlate(p, W, H),
    });

    this.back.items = back;
    this.front.items = front;
  }
}

function paintPond(p: Paint, x0: number, y0: number, x1: number, y1: number): void {
  const { ctx, px, pal } = p;
  const c = ctx as CanvasRenderingContext2D;
  const r = new Rng(31337);
  c.save();
  c.clip(p.reg.path.water, 'evenodd');
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  blob(ctx, cx + 0.05, cy + 0.1, (x1 - x0) * 0.32, (y1 - y0) * 0.34, r, 0.15, 8);
  fill(ctx, pal.waterDeep, 0.6);
  blob(ctx, cx + 0.1, cy + 0.2, (x1 - x0) * 0.18, (y1 - y0) * 0.2, r, 0.15, 8);
  fill(ctx, pal.waterDeep, 0.45);
  // Ripples, in short ink arcs, and the light on the water.
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const rx = x0 + r.range(0.2, x1 - x0 - 0.2);
    const ry = y0 + r.range(0.2, y1 - y0 - 0.2);
    ctx.moveTo(rx - 0.12, ry);
    ctx.quadraticCurveTo(rx, ry - 0.03, rx + 0.12, ry);
  }
  ink(ctx, pal.ink, inkW(px, 0.8), 0.4);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const rx = x0 + r.range(0.15, x1 - x0 - 0.3);
    const ry = y0 + r.range(0.15, y1 - y0 - 0.2);
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx + r.range(0.1, 0.25), ry);
  }
  ink(ctx, pal.waterLight, Math.max(px * 1.6, 0.035), 0.85);
  if (pal.frost) {
    // Ice: a pale skin with cracks.
    c.fillStyle = '#f2f6f8';
    c.globalAlpha = 0.6;
    c.fill(p.reg.path.water, 'evenodd');
    c.globalAlpha = 1;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      let lx = x0 + r.range(0.2, x1 - x0 - 0.2);
      let ly = y0 + r.range(0.2, y1 - y0 - 0.2);
      ctx.moveTo(lx, ly);
      for (let j = 0; j < 3; j++) {
        lx += r.jit(0.25);
        ly += r.jit(0.25);
        ctx.lineTo(lx, ly);
      }
    }
    ink(ctx, pal.inkSoft, inkW(px, 0.7), 0.6);
  } else {
    // Lily pads.
    for (let i = 0; i < 3; i++) {
      const lx = x0 + r.range(0.3, x1 - x0 - 0.3);
      const ly = y0 + r.range(0.4, y1 - y0 - 0.3);
      const lr = 0.09 + r.next() * 0.04;
      const a = r.next() * 6.28;
      ctx.beginPath();
      ctx.ellipse(lx, ly, lr, lr * 0.62, 0, a + 0.35, a + Math.PI * 2 - 0.05);
      ctx.lineTo(lx, ly);
      ctx.closePath();
      fill(ctx, pal.season === 2 ? '#a8963e' : '#5e9a48');
      ink(ctx, pal.ink, inkW(px, 0.8), 0.8);
      if (pal.season === 1 && i === 0) flower(ctx, lx + 0.02, ly - 0.03, 0.045, '#f3b9cc', '#f2d24a', pal.ink, px, r);
    }
  }
  c.restore();
}

function paintReeds(p: Paint, x: number, y: number): void {
  const { ctx, px, pal } = p;
  const r = new Rng(hash3(Math.round(x * 100), Math.round(y * 100), 919));
  const col = pal.season === 3 ? '#a89a76' : pal.season === 2 ? '#a8963e' : '#6f9a48';
  for (let i = 0; i < 4; i++) {
    const bx = x + r.jit(0.12);
    const h = r.range(0.3, 0.6);
    const lean = r.jit(0.12);
    taper(ctx, bx, y, bx + lean * 0.5, y - h * 0.5, bx + lean, y - h, 0.035, 0.005);
    fill(ctx, col);
    ink(ctx, pal.ink, inkW(px) * 0.7, 0.6);
    if (i < 2 && pal.season < 3) {
      // Cattail heads.
      ctx.beginPath();
      ctx.ellipse(bx + lean * 0.8, y - h * 0.82, 0.022, 0.06, lean, 0, Math.PI * 2);
      fill(ctx, '#6b4a2e');
      ink(ctx, pal.ink, inkW(px) * 0.6, 0.7);
    }
  }
}

function paintSignpost(p: Paint, x: number, y: number): void {
  const { ctx, px, pal } = p;
  ctx.beginPath();
  ctx.rect(x - 0.03, y - 0.75, 0.06, 0.75);
  fill(ctx, pal.fence);
  ink(ctx, pal.ink, inkW(px), 0.85);
  ctx.beginPath();
  ctx.moveTo(x - 0.05, y - 0.72);
  ctx.lineTo(x + 0.62, y - 0.72);
  ctx.lineTo(x + 0.72, y - 0.62);
  ctx.lineTo(x + 0.62, y - 0.52);
  ctx.lineTo(x - 0.05, y - 0.52);
  ctx.closePath();
  fill(ctx, '#e9dcb8');
  ink(ctx, pal.ink, inkW(px), 0.9);
  letter(ctx, 'to town', x + 0.31, y - 0.57, 0.15, pal.ink, 'center', true, 600);
}

function paintPlate(p: Paint, W: number, H: number): void {
  const { ctx, px, pal } = p;
  const r = new Rng(4242);
  const x0 = -1.15;
  const y0 = -2.2;
  const x1 = W + 1.15;
  const y1 = H + 1.6;
  ctx.beginPath();
  line(ctx, x0, y0, x1, y0, r, 0.01);
  line(ctx, x1, y0, x1, y1, r, 0.01);
  line(ctx, x1, y1, x0, y1, r, 0.01);
  line(ctx, x0, y1, x0, y0, r, 0.01);
  ink(ctx, pal.ink, inkW(px, 1.6), 0.8);
  const d = 0.14;
  ctx.beginPath();
  ctx.rect(x0 + d, y0 + d, x1 - x0 - 2 * d, y1 - y0 - 2 * d);
  ink(ctx, pal.ink, inkW(px, 0.6), 0.6);
  // Corner fleurons.
  for (const [cx, cy] of [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 0.12);
    ctx.lineTo(cx + 0.12, cy);
    ctx.lineTo(cx, cy + 0.12);
    ctx.lineTo(cx - 0.12, cy);
    ctx.closePath();
    fill(ctx, pal.paper);
    ink(ctx, pal.ink, inkW(px), 0.85);
  }
  const plate = ['I', 'II', 'III', 'IV'][pal.season];
  const name = ['spring', 'summer', 'autumn', 'winter'][pal.season];
  letter(ctx, `Plate ${plate}.  The farm at Three Acres, in ${name}`, W / 2, y1 + 0.55, 0.34, pal.ink, 'center', true, 500);
  ctx.beginPath();
  line(ctx, W / 2 - 1.2, y1 + 0.78, W / 2 + 1.2, y1 + 0.78, r, 0.01);
  ink(ctx, pal.ink, inkW(px, 0.6), 0.5);
}
