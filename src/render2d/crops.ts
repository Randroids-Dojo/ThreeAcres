// The eight crops as botanical drawings, one painter per crop and stage. Each
// is gouache over a hatched ground shadow, with wobbly ink on top, and has its
// own silhouette and colour at every stage so a field reads at 24 px a tile.
// The base (0, 0) is where the plant meets the soil; it grows up the page (-y).
// Painted once into the sprite cache, never per frame.

import type { CropId } from '../sim/types';
import { blob, fill, flower, groundShadow, ink, inkW, leaf, midrib, roundLeaf, taper, type Ctx } from './brush';
import type { Palette } from './palette';
import { Rng } from './rng';

export interface CropTone {
  leaf: string;
  leafDark: string;
  leafLight: string;
  stem: string;
  ink: string;
  dead: boolean;
}

const LIVE: Record<CropId, { leaf: string; leafDark: string; leafLight: string; stem: string }> = {
  radish: { leaf: '#6fa848', leafDark: '#477f35', leafLight: '#9cc865', stem: '#b8566a' },
  lettuce: { leaf: '#9fd06a', leafDark: '#6ea545', leafLight: '#d6eda0', stem: '#c7e08e' },
  carrot: { leaf: '#5d9c3c', leafDark: '#3b6e2c', leafLight: '#8cc05a', stem: '#5d9c3c' },
  beans: { leaf: '#5f9e40', leafDark: '#3c7230', leafLight: '#90c463', stem: '#5f8f3a' },
  strawberry: { leaf: '#4f8f3c', leafDark: '#33652c', leafLight: '#7fb85a', stem: '#6d8f3e' },
  sunflower: { leaf: '#6aa244', leafDark: '#437a33', leafLight: '#97c766', stem: '#6f9a3c' },
  corn: { leaf: '#7cb24c', leafDark: '#4f8536', leafLight: '#b0d478', stem: '#8fb455' },
  pumpkin: { leaf: '#5c9a3e', leafDark: '#3a6e2e', leafLight: '#8cc260', stem: '#6f8a3a' },
};

const DEAD = { leaf: '#a69468', leafDark: '#7c6a48', leafLight: '#c2b088', stem: '#8c7a56' };

/** How tall each crop's sprite may grow, tiles above the base. */
export const CROP_TOP: Record<CropId, number> = {
  radish: 0.62,
  lettuce: 0.55,
  carrot: 0.82,
  beans: 1.42,
  strawberry: 0.55,
  sunflower: 1.86,
  corn: 1.8,
  pumpkin: 0.62,
};

/** How much bigger than life each crop is drawn, so low crops fill their tile. */
export const CROP_SCALE: Record<CropId, number> = {
  radish: 1.3,
  lettuce: 1.25,
  carrot: 1.2,
  beans: 1.0,
  strawberry: 1.35,
  sunflower: 1.0,
  corn: 1.0,
  pumpkin: 1.22,
};

/** Height of the crop's crown at a stage, for crows and the harvest pop. */
export function cropHeight(kind: CropId, stage: number): number {
  const top = CROP_TOP[kind];
  const k = [0.12, 0.22, 0.45, 0.75, 1][stage] ?? 1;
  return Math.max(0.1, top * k * 0.85 * CROP_SCALE[kind]);
}

type Painter = (ctx: Ctx, st: number, t: CropTone, px: number, r: Rng, pal: Palette) => void;

function tone(kind: CropId, dead: boolean, pal: Palette): CropTone {
  const c = dead ? DEAD : LIVE[kind];
  return { ...c, ink: pal.ink, dead };
}

/** A leaf with a shaded half, a midrib and an ink edge. */
function leafP(ctx: Ctx, x: number, y: number, len: number, wid: number, ang: number, curl: number, t: CropTone, px: number, light = false): void {
  leaf(ctx, x, y, len, wid, ang, curl);
  fill(ctx, light ? t.leafLight : t.leaf);
  ctx.save();
  ctx.clip();
  // The underside, away from the light.
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + c * len * 1.2 + s * wid * 3, y + s * len * 1.2 - c * wid * 3);
  ctx.lineTo(x + c * len * 1.2 + s * wid * 0.1, y + s * len * 1.2 - c * wid * 0.1);
  ctx.closePath();
  fill(ctx, t.leafDark, 0.55);
  ctx.restore();
  leaf(ctx, x, y, len, wid, ang, curl);
  ink(ctx, t.ink, inkW(px, 0.8), 0.85);
  midrib(ctx, x, y, len, ang, curl, t.ink, inkW(px, 0.55), 0.5);
}

function roundLeafP(ctx: Ctx, x: number, y: number, len: number, wid: number, ang: number, t: CropTone, px: number, col?: string): void {
  roundLeaf(ctx, x, y, len, wid, ang);
  fill(ctx, col ?? t.leaf);
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(x + Math.cos(ang) * len * 0.6 + wid * 0.5, y + Math.sin(ang) * len * 0.6 + wid * 0.6, len * 0.5, wid * 0.9, ang, 0, Math.PI * 2);
  fill(ctx, t.leafDark, 0.5);
  ctx.restore();
  roundLeaf(ctx, x, y, len, wid, ang);
  ink(ctx, t.ink, inkW(px, 0.8), 0.85);
  midrib(ctx, x, y, len, ang, 0, t.ink, inkW(px, 0.5), 0.45);
}

/** A stem from (x0, y0) up to (x1, y1), bowed by `bend`. */
function stem(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, bend: number, w0: number, w1: number, col: string, t: CropTone, px: number): void {
  taper(ctx, x0, y0, (x0 + x1) / 2 + bend, (y0 + y1) / 2, x1, y1, w0, w1);
  fill(ctx, col);
  ink(ctx, t.ink, inkW(px, 0.7), 0.8);
}

/** Leaves droop as a crop dies: angles fall towards the ground. */
function droop(ang: number, t: CropTone): number {
  if (!t.dead) return ang;
  const down = Math.cos(ang) >= 0 ? 0.6 : Math.PI - 0.6;
  return ang + (down - ang) * 0.45;
}

/** A broad pumpkin leaf with shallow lobes, seen from above and in front: squashed. */
function lobedLeaf(ctx: Ctx, x: number, y: number, rad: number, rot: number, t: CropTone, px: number, r: Rng): void {
  const n = 30;
  const path = () => {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 0.9 + 0.1 * Math.cos(5 * (a - rot));
      const lx = x + Math.cos(a) * rad * k;
      const ly = y + Math.sin(a) * rad * k * 0.7;
      if (i === 0) ctx.moveTo(lx, ly);
      else ctx.lineTo(lx, ly);
    }
    ctx.closePath();
  };
  path();
  fill(ctx, t.leaf);
  ctx.save();
  ctx.clip();
  // Lit upper left, shaded lower right.
  ctx.beginPath();
  ctx.ellipse(x - rad * 0.3, y - rad * 0.25, rad * 0.55, rad * 0.32, 0, 0, Math.PI * 2);
  fill(ctx, t.leafLight, 0.55);
  ctx.beginPath();
  ctx.ellipse(x + rad * 0.5, y + rad * 0.35, rad * 0.75, rad * 0.45, 0, 0, Math.PI * 2);
  fill(ctx, t.leafDark, 0.45);
  ctx.restore();
  path();
  ink(ctx, t.ink, inkW(px, 0.8), 0.8);
  // Veins from the heart.
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = rot + (i / 5) * Math.PI * 2 + r.jit(0.1);
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * rad * 0.7, y + Math.sin(a) * rad * 0.48);
  }
  ink(ctx, t.leafLight, inkW(px, 0.6), 0.85);
}

/** Seed stage, shared: a little hill of soil, the seeds, and the packet on a stake. */
function seedStage(kind: CropId, color: string): Painter {
  return (ctx, _st, t, px, r) => {
    ctx.beginPath();
    ctx.ellipse(0, -0.01, 0.2, 0.065, 0, Math.PI, 0);
    ctx.quadraticCurveTo(0.2, 0.03, 0, 0.035);
    ctx.quadraticCurveTo(-0.2, 0.03, -0.2, -0.01);
    fill(ctx, '#8a6440', 0.85);
    ink(ctx, t.ink, inkW(px, 0.8), 0.8);
    // Seeds of the crop, so even a fresh row says what it is.
    const seeds = 3;
    for (let i = 0; i < seeds; i++) {
      const sx = -0.1 + i * 0.1 + r.jit(0.02);
      const sy = -0.04 + r.jit(0.01);
      ctx.beginPath();
      if (kind === 'beans') ctx.ellipse(sx, sy, 0.032, 0.02, 0.3, 0, Math.PI * 2);
      else if (kind === 'pumpkin') ctx.ellipse(sx, sy, 0.03, 0.017, -0.3, 0, Math.PI * 2);
      else if (kind === 'sunflower') ctx.ellipse(sx, sy, 0.016, 0.028, 0.4, 0, Math.PI * 2);
      else if (kind === 'corn') ctx.ellipse(sx, sy, 0.022, 0.02, 0, 0, Math.PI * 2);
      else ctx.ellipse(sx, sy, 0.014, 0.012, 0, 0, Math.PI * 2);
      const sc = kind === 'beans' ? '#f0e6d0' : kind === 'pumpkin' ? '#efe2b8' : kind === 'sunflower' ? '#3a3330' : kind === 'corn' ? '#f0c84a' : kind === 'strawberry' ? '#d8b45a' : '#7a5a3a';
      fill(ctx, sc);
      ink(ctx, t.ink, inkW(px, 0.5), 0.7);
    }
    // The seed packet on its stake, in the crop's colour.
    const sx = 0.17;
    stem(ctx, sx, 0.02, sx, -0.36, 0, 0.03, 0.026, '#c9a878', t, px);
    ctx.save();
    ctx.translate(sx, -0.42);
    ctx.rotate(0.06);
    ctx.beginPath();
    ctx.rect(-0.1, -0.12, 0.2, 0.22);
    fill(ctx, '#f6eedb');
    ink(ctx, t.ink, inkW(px, 0.8), 0.9);
    ctx.beginPath();
    ctx.rect(-0.1, -0.12, 0.2, 0.08);
    fill(ctx, color);
    ctx.beginPath();
    ctx.arc(0, 0.03, 0.045, 0, Math.PI * 2);
    fill(ctx, color);
    ink(ctx, t.ink, inkW(px, 0.5), 0.7);
    ctx.restore();
    if (t.dead) {
      ctx.beginPath();
      ctx.moveTo(-0.05, -0.05);
      ctx.quadraticCurveTo(0, -0.14, 0.06, -0.1);
      ink(ctx, t.stem, inkW(px, 1), 0.9);
    }
  };
}

// ---------------------------------------------------------------------------

const radish: Painter = (ctx, st, t, px, r) => {
  const n = [0, 2, 4, 6, 7][st];
  const len = [0, 0.11, 0.2, 0.27, 0.31][st];
  const baseY = st >= 3 ? -0.12 : -0.02;
  for (let i = 0; i < n; i++) {
    const a = droop(-Math.PI / 2 + (i / Math.max(1, n - 1) - 0.5) * (st === 1 ? 1.8 : 2.6) + r.jit(0.12), t);
    roundLeafP(ctx, r.jit(0.02), baseY, len * (0.85 + r.next() * 0.25), len * 0.36, a, t, px);
  }
  if (st >= 2) {
    // Red shoulders push out of the soil as it swells.
    const rad = [0, 0, 0.045, 0.085, 0.13][st];
    const cy = -rad * 0.55;
    ctx.beginPath();
    ctx.moveTo(-0.012, cy + rad * 0.9);
    ctx.lineTo(0, cy + rad * 1.65);
    ctx.lineTo(0.012, cy + rad * 0.9);
    fill(ctx, '#efe2d6');
    ink(ctx, t.ink, inkW(px, 0.5), 0.6);
    ctx.beginPath();
    ctx.ellipse(0, cy, rad, rad * 0.92, 0, 0, Math.PI * 2);
    fill(ctx, t.dead ? '#8a5a4a' : '#d9465f');
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(rad * 0.4, cy + rad * 0.35, rad * 0.8, rad * 0.7, 0, 0, Math.PI * 2);
    fill(ctx, t.dead ? '#6a4038' : '#a52a45', 0.6);
    ctx.beginPath();
    ctx.ellipse(-rad * 0.35, cy - rad * 0.35, rad * 0.3, rad * 0.2, -0.6, 0, Math.PI * 2);
    fill(ctx, '#ffffff', t.dead ? 0.15 : 0.55);
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(0, cy, rad, rad * 0.92, 0, 0, Math.PI * 2);
    ink(ctx, t.ink, inkW(px, 0.9), 0.9);
  }
};

const lettuce: Painter = (ctx, st, t, px, r) => {
  if (st === 1) {
    for (let i = 0; i < 3; i++) leafP(ctx, 0, -0.01, 0.1, 0.045, droop(-Math.PI / 2 + (i - 1) * 0.9, t), 0, t, px, true);
    return;
  }
  const R = [0, 0, 0.15, 0.23, 0.33][st];
  const cy = -R * 0.5;
  // Outer leaves, a ruffled ring, darker; then lighter inner leaves; a pale heart.
  const rings = st === 4 ? 3 : 2;
  for (let k = 0; k < rings; k++) {
    const rr = R * (1 - k * 0.3);
    const n = 9 - k * 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + k * 0.4 + r.jit(0.1);
      const lx = Math.cos(a) * rr * 0.55;
      const ly = cy + Math.sin(a) * rr * 0.32 - k * R * 0.12;
      blob(ctx, lx, ly, rr * 0.5, rr * 0.36, r, 0.22, 11, a);
      fill(ctx, k === 0 ? t.leafDark : k === 1 ? t.leaf : t.leafLight);
      ink(ctx, t.ink, inkW(px, 0.7), 0.7);
    }
  }
  blob(ctx, 0, cy - R * 0.32, R * 0.32, R * 0.22, r, 0.2, 9);
  fill(ctx, t.dead ? t.leafLight : '#e8f5bc');
  ink(ctx, t.ink, inkW(px, 0.6), 0.6);
  // Veins catch the light.
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.moveTo(Math.cos(a) * R * 0.15, cy + Math.sin(a) * R * 0.1);
    ctx.lineTo(Math.cos(a) * R * 0.6, cy + Math.sin(a) * R * 0.38);
  }
  ink(ctx, '#f4fbe0', inkW(px, 0.6), t.dead ? 0.2 : 0.7);
};

function frond(ctx: Ctx, x: number, y: number, h: number, ang: number, t: CropTone, px: number, r: Rng): void {
  const tx = x + Math.cos(ang) * h;
  const ty = y + Math.sin(ang) * h;
  const cx = x + Math.cos(ang) * h * 0.5 + r.jit(0.03);
  const cy = y + Math.sin(ang) * h * 0.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(cx, cy, tx, ty);
  ink(ctx, t.stem, inkW(px, 0.8), 1);
  // Feathery leaflets along the stalk.
  const n = 6;
  ctx.beginPath();
  for (let i = 1; i <= n; i++) {
    const k = i / (n + 1);
    const u = 1 - k;
    const px0 = u * u * x + 2 * u * k * cx + k * k * tx;
    const py0 = u * u * y + 2 * u * k * cy + k * k * ty;
    const l = h * 0.22 * (1 - k * 0.6);
    for (const side of [-1, 1]) {
      const a = ang + side * 0.9;
      for (let j = 0; j < 3; j++) {
        const aa = a + (j - 1) * 0.3 * side;
        ctx.moveTo(px0, py0);
        ctx.lineTo(px0 + Math.cos(aa) * l, py0 + Math.sin(aa) * l);
      }
    }
  }
  ink(ctx, t.leaf, Math.max(px * 1.6, 0.03), 1);
  ink(ctx, t.ink, inkW(px, 0.45), 0.45);
}

const carrot: Painter = (ctx, st, t, px, r) => {
  if (st === 1) {
    for (const a of [-1.9, -1.25]) {
      taper(ctx, 0, 0, Math.cos(a) * 0.06, -0.08, Math.cos(a) * 0.1, -0.14, 0.022, 0.004);
      fill(ctx, t.leaf);
      ink(ctx, t.ink, inkW(px, 0.6), 0.8);
    }
    return;
  }
  const n = [0, 0, 3, 5, 7][st];
  const h = [0, 0, 0.26, 0.42, 0.55][st];
  for (let i = 0; i < n; i++) {
    const a = droop(-Math.PI / 2 + (i / (n - 1) - 0.5) * 1.5 + r.jit(0.1), t);
    frond(ctx, r.jit(0.015), -0.02, h * (0.8 + r.next() * 0.3) * (t.dead ? 0.7 : 1), a, t, px, r);
  }
  if (st >= 3) {
    // The orange shoulder of the root, and its rings.
    const w = st === 4 ? 0.085 : 0.05;
    ctx.beginPath();
    ctx.moveTo(-w, -0.02);
    ctx.quadraticCurveTo(-w, -w * 0.9, 0, -w * 0.95);
    ctx.quadraticCurveTo(w, -w * 0.9, w, -0.02);
    ctx.quadraticCurveTo(w * 0.6, w * 0.9, 0, w * 1.4);
    ctx.quadraticCurveTo(-w * 0.6, w * 0.9, -w, -0.02);
    ctx.closePath();
    fill(ctx, t.dead ? '#9a6a3a' : '#ee8a2b');
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(w * 0.5, w * 0.4, w * 0.7, w * 1.2, 0, 0, Math.PI * 2);
    fill(ctx, t.dead ? '#6a4a2a' : '#c4601c', 0.55);
    ctx.restore();
    ink(ctx, t.ink, inkW(px, 0.85), 0.9);
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const yy = -w * 0.3 + i * w * 0.45;
      ctx.moveTo(-w * 0.6, yy);
      ctx.quadraticCurveTo(0, yy + w * 0.15, w * 0.5, yy);
    }
    ink(ctx, t.ink, inkW(px, 0.5), 0.5);
  }
};

function pole(ctx: Ctx, h: number, t: CropTone, px: number): void {
  stem(ctx, 0.05, 0.03, 0.04, -h, 0, 0.045, 0.035, '#cfae78', t, px);
  ctx.beginPath();
  for (let y = -0.2; y > -h + 0.05; y -= 0.26) {
    ctx.moveTo(0.025, y);
    ctx.lineTo(0.065, y - 0.01);
  }
  ink(ctx, t.ink, inkW(px, 0.6), 0.7);
}

const beans: Painter = (ctx, st, t, px, r) => {
  if (st === 1) {
    stem(ctx, 0, 0, 0.02, -0.12, 0.03, 0.03, 0.022, t.stem, t, px);
    roundLeafP(ctx, 0.02, -0.12, 0.1, 0.05, droop(-2.4, t), t, px);
    roundLeafP(ctx, 0.02, -0.12, 0.1, 0.05, droop(-0.7, t), t, px);
    return;
  }
  const H = st === 2 ? 0.95 : 1.25;
  const vineTop = [0, 0, 0.45, 0.95, 1.2][st] * (t.dead ? 0.8 : 1);
  pole(ctx, H, t, px);
  // The vine twines up the pole.
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let y = 0; y > -vineTop; y -= 0.02) ctx.lineTo(0.045 + Math.sin(y * 26) * 0.07, y);
  ink(ctx, t.stem, Math.max(px * 1.6, 0.025), 1);
  ink(ctx, t.ink, inkW(px, 0.4), 0.4);
  const n = [0, 0, 3, 6, 8][st];
  for (let i = 0; i < n; i++) {
    const y = -0.08 - (i / Math.max(1, n - 1)) * (vineTop - 0.1);
    const side = i % 2 ? 1 : -1;
    const lx = 0.045 + Math.sin(y * 26) * 0.07;
    // Heart-shaped bean leaves hang off the vine.
    roundLeafP(ctx, lx, y, 0.16, 0.075, droop(side > 0 ? 0.35 : Math.PI - 0.35, t) + r.jit(0.2), t, px, i % 3 === 0 ? t.leafLight : t.leaf);
  }
  if (st >= 3 && !t.dead) {
    for (let i = 0; i < 3; i++) flower(ctx, 0.04 + r.jit(0.12), -0.3 - i * 0.25, 0.028, '#efe6f5', '#b48ad0', t.ink, px, r);
  }
  if (st === 4) {
    for (let i = 0; i < 5; i++) {
      const y = -0.2 - i * 0.2;
      const side = i % 2 ? 1 : -1;
      const x0 = 0.045 + side * 0.05;
      taper(ctx, x0, y, x0 + side * 0.04, y + 0.1, x0 + side * 0.02, y + 0.22, 0.03, 0.012, 0.012);
      fill(ctx, t.dead ? '#8a7a4a' : '#7cc04a');
      ink(ctx, t.ink, inkW(px, 0.7), 0.85);
    }
  }
};

function trifoliate(ctx: Ctx, x: number, y: number, h: number, ang: number, s: number, t: CropTone, px: number): void {
  const tx = x + Math.cos(ang) * h;
  const ty = y + Math.sin(ang) * h;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo((x + tx) / 2 + 0.02, (y + ty) / 2, tx, ty);
  ink(ctx, t.stem, inkW(px, 0.9), 1);
  for (const da of [-0.8, 0, 0.8]) {
    const a = ang + da;
    ctx.beginPath();
    ctx.ellipse(tx + Math.cos(a) * s * 0.6, ty + Math.sin(a) * s * 0.6, s * 0.62, s * 0.42, a, 0, Math.PI * 2);
    fill(ctx, da === 0 ? t.leafLight : t.leaf);
    ink(ctx, t.ink, inkW(px, 0.7), 0.85);
    // Toothed edge and a midrib.
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + Math.cos(a) * s * 1.05, ty + Math.sin(a) * s * 1.05);
    ink(ctx, t.leafDark, inkW(px, 0.5), 0.8);
  }
}

function berry(ctx: Ctx, x: number, y: number, s: number, ripe: boolean, t: CropTone, px: number, r: Rng): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 1.25);
  ctx.bezierCurveTo(x - s * 1.25, y + s * 0.4, x - s * 0.9, y - s * 0.75, x, y - s * 0.55);
  ctx.bezierCurveTo(x + s * 0.9, y - s * 0.75, x + s * 1.25, y + s * 0.4, x, y + s * 1.25);
  ctx.closePath();
  fill(ctx, t.dead ? '#7a5040' : ripe ? '#e0303f' : '#cfe0a0');
  ink(ctx, t.ink, inkW(px, 0.8), 0.9);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const sx = x + r.jit(s * 0.5);
    const sy = y + r.range(-s * 0.2, s * 0.8);
    ctx.rect(sx, sy, Math.max(px, s * 0.12), Math.max(px, s * 0.12));
  }
  fill(ctx, ripe ? '#f7d36a' : '#8aa860', 0.9);
  // The green calyx.
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (i - 1.5) * 0.6;
    ctx.moveTo(x, y - s * 0.55);
    ctx.lineTo(x + Math.cos(a + Math.PI) * s * 0.5 * (i % 2 ? 1 : -1), y - s * 0.55 - Math.abs(Math.sin(a)) * s * 0.35);
  }
  ink(ctx, t.leafDark, Math.max(px * 1.4, s * 0.25), 1);
}

const strawberry: Painter = (ctx, st, t, px, r) => {
  if (st === 1) {
    trifoliate(ctx, 0, 0, 0.1, droop(-Math.PI / 2, t), 0.05, t, px);
    return;
  }
  // A runner snakes off across the soil.
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(0.12, 0.05, 0.2, -0.03, 0.34, 0.04);
  ink(ctx, t.stem, inkW(px, 0.9), 0.9);
  ctx.beginPath();
  ctx.arc(0.34, 0.03, 0.025, 0, Math.PI * 2);
  fill(ctx, t.leaf);
  const n = [0, 0, 3, 5, 6][st];
  const s = [0, 0, 0.07, 0.085, 0.095][st];
  for (let i = 0; i < n; i++) {
    const a = droop(-Math.PI / 2 + (i / Math.max(1, n - 1) - 0.5) * 2.2 + r.jit(0.15), t);
    trifoliate(ctx, r.jit(0.03), 0, s * 2.2 * (0.8 + r.next() * 0.35), a, s, t, px);
  }
  if (st === 3 && !t.dead) {
    for (let i = 0; i < 3; i++) flower(ctx, -0.18 + i * 0.18, -0.08 - (i % 2) * 0.08, 0.04, '#fbf7ee', '#f2c84a', t.ink, px, r);
    berry(ctx, 0.1, -0.02, 0.03, false, t, px, r);
  }
  if (st === 4) {
    const spots: [number, number][] = [
      [-0.22, -0.02],
      [0.2, 0.0],
      [-0.06, 0.04],
      [0.08, -0.12],
      [-0.15, -0.16],
    ];
    for (const [bx, by] of spots) berry(ctx, bx, by, 0.045, true, t, px, r);
    if (!t.dead) flower(ctx, 0.22, -0.18, 0.035, '#fbf7ee', '#f2c84a', t.ink, px, r);
  }
};

const sunflower: Painter = (ctx, st, t, px, r) => {
  if (st === 1) {
    stem(ctx, 0, 0, 0, -0.15, 0.01, 0.035, 0.03, t.stem, t, px);
    roundLeafP(ctx, 0, -0.15, 0.11, 0.06, droop(-2.6, t), t, px);
    roundLeafP(ctx, 0, -0.15, 0.11, 0.06, droop(-0.55, t), t, px);
    return;
  }
  const H = [0, 0, 0.5, 1.1, 1.42][st] * (t.dead ? 0.8 : 1);
  const bend = t.dead ? 0.25 : 0.03;
  const topX = t.dead ? 0.22 : 0.03;
  stem(ctx, 0, 0, topX, -H, bend, 0.07, 0.045, t.stem, t, px);
  const pairs = [0, 0, 2, 3, 4][st];
  for (let i = 0; i < pairs; i++) {
    const k = (i + 0.6) / (pairs + 0.6);
    const y = -H * k * 0.92;
    const x = topX * k + bend * Math.sin(Math.PI * k);
    const l = 0.24 * (1 - k * 0.35) * (st === 2 ? 0.7 : 1);
    roundLeafP(ctx, x, y, l, l * 0.55, droop(-0.25 + (i % 2) * 0.2, t), t, px);
    roundLeafP(ctx, x, y, l, l * 0.55, droop(Math.PI + 0.25 - (i % 2) * 0.2, t), t, px, t.leafLight);
  }
  if (st === 3) {
    // A green bud with its bracts.
    ctx.beginPath();
    ctx.arc(topX, -H - 0.05, 0.085, 0, Math.PI * 2);
    fill(ctx, t.leafDark);
    ink(ctx, t.ink, inkW(px, 0.8), 0.9);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      leaf(ctx, topX + Math.cos(a) * 0.04, -H - 0.05 + Math.sin(a) * 0.04, 0.07, 0.025, a);
      fill(ctx, t.leaf);
      ink(ctx, t.ink, inkW(px, 0.5), 0.7);
    }
  }
  if (st === 4) {
    const hx = topX + (t.dead ? 0.05 : 0);
    const hy = -H - (t.dead ? -0.05 : 0.1);
    const R = 0.25;
    ctx.save();
    ctx.translate(hx, hy);
    if (t.dead) ctx.rotate(0.9);
    // Petals behind, then the seed disc in its spiral.
    for (let ring = 0; ring < 2; ring++) {
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * (Math.PI / n);
        leaf(ctx, Math.cos(a) * R * 0.45, Math.sin(a) * R * 0.42, R * (ring ? 0.6 : 0.68), R * 0.13, a, r.jit(0.12));
        fill(ctx, t.dead ? (ring ? '#9a7a42' : '#8a6a3a') : ring ? '#f7d24a' : '#eaa92a');
        ink(ctx, t.ink, inkW(px, 0.55), 0.7);
      }
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.5, R * 0.47, 0, 0, Math.PI * 2);
    fill(ctx, t.dead ? '#4a3a2a' : '#6b4423');
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    for (let i = 0; i < 40; i++) {
      const a = i * 2.4;
      const d = Math.sqrt(i / 40) * R * 0.46;
      ctx.rect(Math.cos(a) * d, Math.sin(a) * d, Math.max(px * 1.2, 0.012), Math.max(px * 1.2, 0.012));
    }
    fill(ctx, '#3a2414', 0.9);
    ctx.beginPath();
    ctx.ellipse(-R * 0.15, -R * 0.15, R * 0.2, R * 0.14, -0.6, 0, Math.PI * 2);
    fill(ctx, '#a8763a', 0.5);
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.5, R * 0.47, 0, 0, Math.PI * 2);
    ink(ctx, t.ink, inkW(px, 1), 0.95);
    ctx.restore();
  }
};

function blade(ctx: Ctx, x: number, y: number, len: number, ang: number, droopK: number, t: CropTone, px: number, col: string): void {
  // A long arching corn blade: out along the angle, then falling away.
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const ex = x + c * len;
  const ey = y + s * len + len * droopK;
  taper(ctx, x, y, x + c * len * 0.6, y + s * len * 0.75, ex, ey, 0.05, 0.004, 0.02);
  fill(ctx, col);
  ink(ctx, t.ink, inkW(px, 0.65), 0.8);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + c * len * 0.6, y + s * len * 0.75, ex, ey);
  ink(ctx, t.leafLight, inkW(px, 0.45), 0.7);
}

const corn: Painter = (ctx, st, t, px, r) => {
  if (st === 1) {
    blade(ctx, 0, 0, 0.16, -1.75, 0.1, t, px, t.leaf);
    blade(ctx, 0, -0.02, 0.1, -1.1, 0.2, t, px, t.leafLight);
    return;
  }
  const dk = t.dead ? 0.9 : 0;
  if (st === 2) {
    const angs = [-2.3, -1.85, -1.3, -0.8];
    angs.forEach((a, i) => blade(ctx, 0, 0, 0.42 - Math.abs(i - 1.5) * 0.06, a, 0.25 + dk, t, px, i % 2 ? t.leaf : t.leafLight));
    return;
  }
  const H = (st === 3 ? 1.1 : 1.38) * (t.dead ? 0.82 : 1);
  const lean = t.dead ? 0.18 : 0;
  stem(ctx, 0, 0, lean, -H, lean * 0.4, 0.075, 0.04, t.dead ? t.stem : '#9cc060', t, px);
  // Nodes on the stalk.
  ctx.beginPath();
  for (let k = 0.15; k < 0.95; k += 0.17) {
    const y = -H * k;
    const x = lean * k;
    ctx.moveTo(x - 0.03, y);
    ctx.lineTo(x + 0.03, y - 0.005);
  }
  ink(ctx, t.ink, inkW(px, 0.6), 0.7);
  const n = st === 3 ? 7 : 8;
  for (let i = 0; i < n; i++) {
    const k = 0.1 + (i / n) * 0.78;
    const side = i % 2 ? 1 : -1;
    const a = side > 0 ? -0.5 + r.jit(0.15) : Math.PI + 0.5 + r.jit(0.15);
    blade(ctx, lean * k, -H * k, 0.42 * (1 - k * 0.3), a, 0.35 + dk, t, px, i % 3 === 0 ? t.leafLight : t.leaf);
  }
  // The tassel.
  const tx = lean;
  const ty = -H;
  ctx.beginPath();
  const tas = st === 3 ? 3 : 6;
  for (let i = 0; i < tas; i++) {
    const a = -Math.PI / 2 + (i / (tas - 1) - 0.5) * 1.6;
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + Math.cos(a) * 0.1, ty + Math.sin(a) * 0.12, tx + Math.cos(a) * 0.17, ty + Math.sin(a) * 0.12 + 0.06);
  }
  ink(ctx, t.dead ? '#8a7a56' : '#d9b84a', Math.max(px * 1.8, 0.028), 1);
  ink(ctx, t.ink, inkW(px, 0.4), 0.5);
  if (st === 4) {
    for (const [k, side] of [
      [0.48, 1],
      [0.62, -1],
    ] as const) {
      const x = lean * k + side * 0.04;
      const y = -H * k;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(side * 0.45);
      // Husk, kernels peeking out, and the silk.
      ctx.beginPath();
      ctx.ellipse(0, -0.11, 0.055, 0.14, 0, 0, Math.PI * 2);
      fill(ctx, t.dead ? '#a08a5a' : '#f0d35a');
      ctx.save();
      ctx.clip();
      ctx.beginPath();
      for (let yy = -0.22; yy < 0; yy += 0.03) {
        ctx.moveTo(-0.05, yy);
        ctx.lineTo(0.05, yy);
      }
      ink(ctx, '#c49a2a', inkW(px, 0.45), 0.7);
      ctx.restore();
      taper(ctx, -0.06, 0.02, -0.08, -0.12, -0.01, -0.22, 0.03, 0.005);
      fill(ctx, t.leaf);
      ink(ctx, t.ink, inkW(px, 0.6), 0.8);
      taper(ctx, 0.06, 0.02, 0.08, -0.12, 0.02, -0.2, 0.03, 0.005);
      fill(ctx, t.leafDark);
      ink(ctx, t.ink, inkW(px, 0.6), 0.8);
      ctx.beginPath();
      ctx.moveTo(0, -0.24);
      ctx.quadraticCurveTo(0.03, -0.3, 0.06, -0.3);
      ctx.moveTo(0, -0.24);
      ctx.quadraticCurveTo(-0.02, -0.3, 0.01, -0.33);
      ink(ctx, '#8a5a2a', Math.max(px * 1.2, 0.016), 1);
      ctx.restore();
    }
  }
};

function pumpkinFruit(ctx: Ctx, x: number, y: number, rx: number, ry: number, t: CropTone, px: number, green: boolean): void {
  const body = t.dead ? '#8a6a46' : green ? '#9ab85a' : '#e8772e';
  const dark = t.dead ? '#5a4632' : green ? '#6a8a3a' : '#b04e1c';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  fill(ctx, body);
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(x + rx * 0.45, y + ry * 0.35, rx * 0.8, ry * 0.85, 0, 0, Math.PI * 2);
  fill(ctx, dark, 0.5);
  ctx.beginPath();
  ctx.ellipse(x - rx * 0.4, y - ry * 0.45, rx * 0.3, ry * 0.18, -0.3, 0, Math.PI * 2);
  fill(ctx, '#fff6dc', t.dead ? 0.1 : 0.45);
  ctx.restore();
  // Ribs.
  ctx.beginPath();
  for (const k of [-0.62, -0.25, 0.25, 0.62]) {
    ctx.moveTo(x + k * rx * 0.35, y - ry * 0.92);
    ctx.quadraticCurveTo(x + k * rx * 1.25, y, x + k * rx * 0.35, y + ry * 0.95);
  }
  ink(ctx, dark, inkW(px, 0.8), 0.8);
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ink(ctx, t.ink, inkW(px, 1), 0.95);
  // Stem.
  taper(ctx, x, y - ry * 0.85, x + 0.01, y - ry - 0.03, x + 0.04, y - ry - 0.06, 0.04, 0.03);
  fill(ctx, '#7a8a4a');
  ink(ctx, t.ink, inkW(px, 0.7), 0.9);
}

const pumpkin: Painter = (ctx, st, t, px, r) => {
  if (st === 1) {
    leafP(ctx, 0, -0.01, 0.13, 0.05, droop(-2.5, t), 0, t, px);
    leafP(ctx, 0, -0.01, 0.13, 0.05, droop(-0.65, t), 0, t, px, true);
    return;
  }
  // The vine sprawls along the ground with curling tendrils.
  const span = [0, 0, 0.25, 0.42, 0.44][st];
  ctx.beginPath();
  ctx.moveTo(-span, 0.02);
  ctx.bezierCurveTo(-span * 0.4, -0.06, span * 0.3, 0.08, span, -0.01);
  ink(ctx, t.stem, Math.max(px * 1.8, 0.03), 1);
  ink(ctx, t.ink, inkW(px, 0.45), 0.5);
  ctx.beginPath();
  for (const sx of [-span * 0.85, span * 0.95]) {
    ctx.moveTo(sx, 0);
    for (let a = 0; a < 6.5; a += 0.35) ctx.lineTo(sx + Math.cos(a) * 0.03 * (1 - a / 8), -0.03 + Math.sin(a) * 0.024 - a * 0.003);
  }
  ink(ctx, t.stem, inkW(px, 0.6), 0.8);
  const leaves: [number, number, number][] =
    st === 2
      ? [
          [-0.12, -0.1, 0.12],
          [0.12, -0.08, 0.11],
        ]
      : [
          [-0.26, -0.08, 0.15],
          [0.0, -0.2, 0.17],
          [0.27, -0.1, 0.15],
          [-0.1, -0.04, 0.12],
        ];
  for (const [lx, ly, lr] of leaves) lobedLeaf(ctx, lx, ly + (t.dead ? 0.05 : 0), lr * (t.dead ? 0.8 : 1), r.next(), t, px, r);
  if (st === 3) {
    if (!t.dead) {
      // A yellow trumpet flower.
      ctx.beginPath();
      ctx.moveTo(0.18, -0.2);
      ctx.lineTo(0.28, -0.32);
      ctx.lineTo(0.33, -0.27);
      ctx.closePath();
      fill(ctx, '#f2c84a');
      ink(ctx, t.ink, inkW(px, 0.6), 0.8);
    }
    pumpkinFruit(ctx, -0.04, 0.0, 0.08, 0.06, t, px, true);
  }
  if (st === 4) pumpkinFruit(ctx, 0.02, -0.06, 0.27, 0.19, t, px, false);
};

const PAINTERS: Record<CropId, Painter> = { radish, lettuce, carrot, beans, strawberry, sunflower, corn, pumpkin };

/** Paint one crop sprite: ground shadow, plant, all in tile units from the base. */
export function paintCrop(ctx: Ctx, kind: CropId, stage: number, dead: boolean, pal: Palette, px: number, seed: number, color: string): void {
  const r = new Rng(seed);
  const t = tone(kind, dead, pal);
  const top = CROP_TOP[kind];
  const sc = CROP_SCALE[kind];
  ctx.scale(sc, sc);
  px /= sc;
  const k = [0.3, 0.35, 0.55, 0.8, 1][stage];
  const tall = top > 1;
  groundShadow(ctx, 0.08, 0.03, (tall ? 0.22 : 0.3) * Math.max(0.5, k), 0.09 * Math.max(0.6, k), pal.ink, px, r, 0.9);
  if (stage === 0) {
    seedStage(kind, color)(ctx, 0, t, px, r, pal);
    return;
  }
  PAINTERS[kind](ctx, stage, t, px, r, pal);
}

/** The produce on its own, for the harvest arc and the crate. Centred on (0, 0). */
export function paintProduce(ctx: Ctx, kind: CropId, pal: Palette, px: number): void {
  const r = new Rng(77);
  const t = tone(kind, false, pal);
  switch (kind) {
    case 'radish': {
      for (const a of [-2.0, -1.6, -1.2]) roundLeafP(ctx, 0, -0.08, 0.16, 0.06, a, t, px);
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.1, 0.095, 0, 0, Math.PI * 2);
      fill(ctx, '#d9465f');
      ink(ctx, t.ink, inkW(px, 0.9), 0.9);
      ctx.beginPath();
      ctx.ellipse(-0.035, -0.035, 0.03, 0.02, -0.6, 0, Math.PI * 2);
      fill(ctx, '#ffffff', 0.6);
      break;
    }
    case 'lettuce':
      ctx.translate(0, 0.1);
      lettuce(ctx, 3, t, px, r, pal);
      break;
    case 'carrot': {
      for (const a of [-2.0, -1.55, -1.1]) frond(ctx, 0, -0.1, 0.18, a, t, px, r);
      ctx.beginPath();
      ctx.moveTo(-0.06, -0.1);
      ctx.quadraticCurveTo(0, -0.14, 0.06, -0.1);
      ctx.quadraticCurveTo(0.04, 0.05, 0.0, 0.2);
      ctx.quadraticCurveTo(-0.04, 0.05, -0.06, -0.1);
      fill(ctx, '#ee8a2b');
      ink(ctx, t.ink, inkW(px, 0.9), 0.9);
      break;
    }
    case 'beans':
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 0.06;
        taper(ctx, x, -0.12, x + 0.04, 0, x + 0.0, 0.13, 0.035, 0.012, 0.012);
        fill(ctx, '#7cc04a');
        ink(ctx, t.ink, inkW(px, 0.8), 0.9);
      }
      break;
    case 'strawberry':
      berry(ctx, 0, -0.02, 0.08, true, t, px, r);
      break;
    case 'sunflower':
      sunflowerHead(ctx, t, px, r);
      break;
    case 'corn':
      ctx.rotate(0.5);
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.06, 0.16, 0, 0, Math.PI * 2);
      fill(ctx, '#f0d35a');
      ink(ctx, t.ink, inkW(px, 0.8), 0.9);
      ctx.beginPath();
      for (let y = -0.13; y < 0.14; y += 0.035) {
        ctx.moveTo(-0.05, y);
        ctx.lineTo(0.05, y);
      }
      ink(ctx, '#c49a2a', inkW(px, 0.5), 0.8);
      taper(ctx, -0.06, 0.16, -0.09, 0, -0.01, -0.12, 0.035, 0.005);
      fill(ctx, t.leaf);
      ink(ctx, t.ink, inkW(px, 0.6), 0.8);
      break;
    case 'pumpkin':
      pumpkinFruit(ctx, 0, 0.02, 0.16, 0.12, t, px, false);
      break;
  }
}

function sunflowerHead(ctx: Ctx, t: CropTone, px: number, r: Rng): void {
  const R = 0.2;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    leaf(ctx, Math.cos(a) * R * 0.45, Math.sin(a) * R * 0.42, R * 0.66, R * 0.14, a, r.jit(0.1));
    fill(ctx, '#f7d24a');
    ink(ctx, t.ink, inkW(px, 0.55), 0.7);
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 0.5, R * 0.47, 0, 0, Math.PI * 2);
  fill(ctx, '#6b4423');
  ink(ctx, t.ink, inkW(px, 1), 0.95);
}
