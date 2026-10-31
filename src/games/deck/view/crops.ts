// Crop paintings for the deck. The eight crops the farm grows come straight
// from the almanac renderer (src/render2d/crops.ts); mint, garlic, wheat and
// chili are painted here in the same gouache-over-ink hand with its brushes.
// Tile units: the base (0, 0) is where the plant meets the soil, growing up -y.

import { fill, groundShadow, ink, inkW, leaf, midrib, roundLeaf, taper, type Ctx } from '../../../render2d/brush';
import { paintCrop, paintProduce } from '../../../render2d/crops';
import type { Palette } from '../../../render2d/palette';
import { Rng } from '../../../render2d/rng';
import type { SeedId } from '../rules';

type Own = 'mint' | 'garlic' | 'wheat' | 'chili';
const OWN: readonly string[] = ['mint', 'garlic', 'wheat', 'chili'];

interface Tone {
  leaf: string;
  dark: string;
  light: string;
  stem: string;
  ink: string;
}

const TONES: Record<Own, Omit<Tone, 'ink'>> = {
  mint: { leaf: '#62b36a', dark: '#3a8448', light: '#a4d993', stem: '#7d5a86' },
  garlic: { leaf: '#86ad78', dark: '#577e52', light: '#c0d6a8', stem: '#d9dfc0' },
  wheat: { leaf: '#8db45a', dark: '#5f8a3c', light: '#c3d98c', stem: '#d4b45a' },
  chili: { leaf: '#4f8f3c', dark: '#33652c', light: '#7fb85a', stem: '#5d8a3a' },
};

/** Packet colour per crop: the printed band on the seed packet and the stake label. */
export const CROP_COLOR: Record<SeedId, string> = {
  radish: '#c8465c',
  carrot: '#e07a26',
  lettuce: '#7fae3e',
  beans: '#5a8f3a',
  corn: '#d9a92a',
  sunflower: '#e2b52e',
  pumpkin: '#d0702a',
  strawberry: '#c63a44',
  mint: '#4f9e7a',
  garlic: '#8a6aa0',
  wheat: '#b8923a',
  chili: '#b8322a',
};

/** How tall a crop's painting reaches, in tiles above its base. */
export const TOP: Record<SeedId, number> = {
  radish: 0.8,
  carrot: 1.0,
  lettuce: 0.7,
  beans: 1.42,
  strawberry: 0.75,
  sunflower: 1.86,
  corn: 1.8,
  pumpkin: 0.76,
  mint: 0.7,
  garlic: 0.85,
  wheat: 1.0,
  chili: 0.8,
};

function leafP(ctx: Ctx, x: number, y: number, len: number, wid: number, ang: number, curl: number, t: Tone, px: number, light = false): void {
  leaf(ctx, x, y, len, wid, ang, curl);
  fill(ctx, light ? t.light : t.leaf);
  ctx.save();
  ctx.clip();
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + c * len * 1.2 + s * wid * 3, y + s * len * 1.2 - c * wid * 3);
  ctx.lineTo(x + c * len * 1.2 + s * wid * 0.1, y + s * len * 1.2 - c * wid * 0.1);
  ctx.closePath();
  fill(ctx, t.dark, 0.5);
  ctx.restore();
  leaf(ctx, x, y, len, wid, ang, curl);
  ink(ctx, t.ink, inkW(px, 0.8), 0.85);
  midrib(ctx, x, y, len, ang, curl, t.ink, inkW(px, 0.5), 0.45);
}

function stemP(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, bend: number, w0: number, w1: number, col: string, t: Tone, px: number): void {
  taper(ctx, x0, y0, (x0 + x1) / 2 + bend, (y0 + y1) / 2, x1, y1, w0, w1);
  fill(ctx, col);
  ink(ctx, t.ink, inkW(px, 0.6), 0.8);
}

function mint(ctx: Ctx, st: number, t: Tone, px: number, r: Rng): void {
  const stems = st === 1 ? 1 : st === 2 ? 3 : 5;
  const h = [0, 0.18, 0.32, 0.48, 0.58][st];
  for (let k = 0; k < stems; k++) {
    const x = (k - (stems - 1) / 2) * 0.1 + r.jit(0.02);
    const top = -h * (0.75 + r.next() * 0.3);
    const lean = (k - (stems - 1) / 2) * 0.05;
    stemP(ctx, x, 0, x + lean, top, lean * 0.4, 0.026, 0.016, t.stem, t, px);
    const pairs = Math.max(1, Math.round((-top / 0.12) * 0.9));
    for (let p = 1; p <= pairs; p++) {
      const y = (top * p) / pairs;
      const xx = x + (lean * p) / pairs;
      const sz = 0.12 - p * 0.012;
      roundLeaf(ctx, xx, y, sz, sz * 0.5, Math.PI + 0.35);
      fill(ctx, p % 2 ? t.leaf : t.light);
      ink(ctx, t.ink, inkW(px, 0.6), 0.8);
      roundLeaf(ctx, xx, y, sz, sz * 0.5, -0.35);
      fill(ctx, p % 2 ? t.leaf : t.light);
      ink(ctx, t.ink, inkW(px, 0.6), 0.8);
      // Crinkled veins.
      ctx.beginPath();
      ctx.moveTo(xx - sz * 0.15, y - sz * 0.05);
      ctx.lineTo(xx - sz * 0.75, y - sz * 0.3);
      ctx.moveTo(xx + sz * 0.15, y - sz * 0.05);
      ctx.lineTo(xx + sz * 0.75, y - sz * 0.3);
      ink(ctx, t.dark, inkW(px, 0.4), 0.6);
    }
    if (st === 4) {
      // Lilac flower spike.
      for (let f = 0; f < 4; f++) {
        ctx.beginPath();
        ctx.ellipse(x + lean + r.jit(0.012), top - 0.02 - f * 0.028, 0.022, 0.016, 0, 0, Math.PI * 2);
        fill(ctx, f % 2 ? '#b9a0d8' : '#cdb8e6');
      }
      ctx.beginPath();
      ctx.ellipse(x + lean, top - 0.05, 0.026, 0.06, 0, 0, Math.PI * 2);
      ink(ctx, t.ink, inkW(px, 0.45), 0.6);
    }
  }
}

function bulb(ctx: Ctx, x: number, y: number, w: number, h: number, t: Tone, px: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.bezierCurveTo(x + w * 0.2, y - h * 0.6, x + w, y - h * 0.5, x + w * 0.8, y - h * 0.05);
  ctx.quadraticCurveTo(x, y + h * 0.2, x - w * 0.8, y - h * 0.05);
  ctx.bezierCurveTo(x - w, y - h * 0.5, x - w * 0.2, y - h * 0.6, x, y - h);
  ctx.closePath();
  fill(ctx, '#f3ecdf');
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  for (const k of [-0.5, 0, 0.5]) {
    ctx.moveTo(x + k * w * 0.3, y - h * 0.85);
    ctx.quadraticCurveTo(x + k * w * 1.4, y - h * 0.5, x + k * w * 0.9, y);
  }
  ink(ctx, '#9a6aa8', inkW(px, 0.9), 0.7);
  ctx.beginPath();
  ctx.ellipse(x + w * 0.4, y - h * 0.2, w * 0.5, h * 0.4, 0, 0, Math.PI * 2);
  fill(ctx, '#c9b8a6', 0.35);
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.bezierCurveTo(x + w * 0.2, y - h * 0.6, x + w, y - h * 0.5, x + w * 0.8, y - h * 0.05);
  ctx.quadraticCurveTo(x, y + h * 0.2, x - w * 0.8, y - h * 0.05);
  ctx.bezierCurveTo(x - w, y - h * 0.5, x - w * 0.2, y - h * 0.6, x, y - h);
  ink(ctx, t.ink, inkW(px, 0.8), 0.9);
}

function garlic(ctx: Ctx, st: number, t: Tone, px: number, r: Rng): void {
  const h = [0, 0.26, 0.42, 0.58, 0.66][st];
  const blades = st === 1 ? 3 : 5;
  if (st >= 3) bulb(ctx, 0, 0.02, st === 4 ? 0.13 : 0.09, st === 4 ? 0.16 : 0.1, t, px);
  for (let b = 0; b < blades; b++) {
    const a = -Math.PI / 2 + (b - (blades - 1) / 2) * 0.32 + r.jit(0.06);
    const len = h * (0.75 + r.next() * 0.3);
    const x0 = (b - (blades - 1) / 2) * 0.02;
    taper(ctx, x0, -0.03, x0 + Math.cos(a) * len * 0.5, -0.03 + Math.sin(a) * len * 0.55, x0 + Math.cos(a) * len, -0.03 + Math.sin(a) * len + (Math.abs(Math.cos(a)) > 0.3 ? len * 0.15 : 0), 0.045, 0.004);
    fill(ctx, b % 2 ? t.leaf : t.light);
    ink(ctx, t.ink, inkW(px, 0.6), 0.8);
  }
  if (st === 4) {
    // The curling scape with its bud.
    ctx.beginPath();
    ctx.moveTo(0.01, -0.05);
    ctx.bezierCurveTo(0.02, -0.5, 0.25, -0.62, 0.2, -0.45);
    ink(ctx, t.dark, Math.max(px * 2, 0.025), 1);
    ctx.beginPath();
    ctx.ellipse(0.19, -0.43, 0.025, 0.05, 0.4, 0, Math.PI * 2);
    fill(ctx, '#e8e2c8');
    ink(ctx, t.ink, inkW(px, 0.5), 0.8);
  }
}

function ear(ctx: Ctx, x: number, y: number, len: number, ang: number, col: string, t: Tone, px: number, awns: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const yy = -i * (len / n);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * 0.016, yy, 0.016, 0.028, side * 0.35, 0, Math.PI * 2);
      fill(ctx, col);
      ink(ctx, t.ink, inkW(px, 0.4), 0.7);
      if (awns) {
        ctx.beginPath();
        ctx.moveTo(side * 0.02, yy - 0.02);
        ctx.lineTo(side * 0.06, yy - 0.11);
        ink(ctx, t.ink, inkW(px, 0.3), 0.5);
      }
    }
  }
  ctx.restore();
}

function wheat(ctx: Ctx, st: number, t: Tone, px: number, r: Rng): void {
  const ripe = st === 4;
  const h = [0, 0.3, 0.55, 0.78, 0.85][st];
  const stalks = st === 1 ? 4 : 7;
  for (let k = 0; k < stalks; k++) {
    const x = (k - (stalks - 1) / 2) * 0.05 + r.jit(0.01);
    const lean = (k - (stalks - 1) / 2) * 0.035 + r.jit(0.02);
    const top = -h * (0.82 + r.next() * 0.2);
    if (st <= 2) {
      taper(ctx, x, 0, x + lean * 0.6, top * 0.5, x + lean, top, 0.03, 0.004);
      fill(ctx, k % 2 ? t.leaf : t.light);
      ink(ctx, t.ink, inkW(px, 0.5), 0.75);
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + lean * 0.5, top * 0.5, x + lean, top);
    ink(ctx, ripe ? '#c7a24a' : t.leaf, Math.max(px * 1.6, 0.018), 1);
    ink(ctx, t.ink, inkW(px, 0.3), 0.4);
    // A leaf off the stalk.
    if (k % 2 === 0) leafP(ctx, x + lean * 0.3, top * 0.35, 0.18, 0.025, lean > 0 ? -0.5 : Math.PI + 0.5, 0.2, { ...t, leaf: ripe ? '#cdb46a' : t.leaf, light: ripe ? '#e2cd8a' : t.light, dark: ripe ? '#a88a3c' : t.dark }, px);
    ear(ctx, x + lean, top, 0.17, Math.atan2(lean, 1) * 0.6, ripe ? '#e2bf5a' : '#a9c86e', t, px, ripe);
  }
}

function pod(ctx: Ctx, x: number, y: number, len: number, ang: number, col: string, t: Tone, px: number): void {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  taper(ctx, x, y, x + c * len * 0.5 + s * 0.02, y + s * len * 0.5, x + c * len, y + s * len, 0.05, 0.006, 0.01);
  fill(ctx, col);
  ink(ctx, t.ink, inkW(px, 0.6), 0.85);
  ctx.beginPath();
  ctx.moveTo(x + c * len * 0.15 - 0.01, y + s * len * 0.15 - 0.008);
  ctx.lineTo(x + c * len * 0.45 - 0.01, y + s * len * 0.45 - 0.008);
  ink(ctx, '#ffffff', inkW(px, 0.6), 0.45);
  // Calyx.
  ctx.beginPath();
  ctx.ellipse(x, y, 0.022, 0.016, ang, 0, Math.PI * 2);
  fill(ctx, t.dark);
}

function chili(ctx: Ctx, st: number, t: Tone, px: number, r: Rng): void {
  const h = [0, 0.18, 0.34, 0.5, 0.56][st];
  stemP(ctx, 0, 0, 0.01, -h, 0.02, 0.035, 0.018, t.stem, t, px);
  const branches = st === 1 ? 1 : st === 2 ? 2 : 4;
  for (let b = 0; b < branches; b++) {
    const y = -h * (0.4 + (b / branches) * 0.55);
    const side = b % 2 ? 1 : -1;
    const bx = side * (0.1 + r.next() * 0.05);
    stemP(ctx, 0, y, bx, y - 0.08, 0, 0.02, 0.012, t.stem, t, px);
    leafP(ctx, bx, y - 0.08, 0.14, 0.04, side > 0 ? -0.4 : Math.PI + 0.4, 0.1, t, px, b % 2 === 0);
    leafP(ctx, bx * 0.5, y - 0.03, 0.11, 0.032, side > 0 ? 0.25 : Math.PI - 0.25, -0.1, t, px);
  }
  leafP(ctx, 0.01, -h, 0.12, 0.035, -1.2, 0.05, t, px, true);
  leafP(ctx, 0.01, -h, 0.12, 0.035, -1.95, -0.05, t, px);
  if (st === 3) {
    for (const [x, y] of [[-0.1, -0.22], [0.12, -0.3]] as const) {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.moveTo(x, y);
        ctx.ellipse(x + Math.cos(a) * 0.018, y + Math.sin(a) * 0.018, 0.016, 0.01, a, 0, Math.PI * 2);
      }
      fill(ctx, '#f6f1e2');
      ink(ctx, t.ink, inkW(px, 0.4), 0.6);
    }
    pod(ctx, 0.05, -0.2, 0.12, 1.75, '#6fa840', t, px);
  }
  if (st === 4) {
    pod(ctx, -0.1, -0.3, 0.2, 1.85, '#cf3326', t, px);
    pod(ctx, 0.08, -0.36, 0.18, 1.45, '#d8402c', t, px);
    pod(ctx, 0.16, -0.22, 0.15, 1.65, '#c22e24', t, px);
    pod(ctx, -0.17, -0.16, 0.13, 1.9, '#e0502e', t, px);
  }
}

const PAINT: Record<Own, (ctx: Ctx, st: number, t: Tone, px: number, r: Rng) => void> = { mint, garlic, wheat, chili };

/** Paint a crop at a growth stage (0 sown to 4 ripe). */
export function paintSeedCrop(ctx: Ctx, kind: SeedId, stage: number, pal: Palette, px: number, seed: number): void {
  if (!OWN.includes(kind)) {
    paintCrop(ctx, kind as Parameters<typeof paintCrop>[1], stage, false, pal, px, seed, CROP_COLOR[kind]);
    return;
  }
  if (stage === 0) {
    // The shared seed mound and packet stake, in this crop's colour.
    paintCrop(ctx, 'radish', 0, false, pal, px, seed, CROP_COLOR[kind]);
    return;
  }
  const r = new Rng(seed);
  const t: Tone = { ...TONES[kind as Own], ink: pal.ink };
  const sc = 1.25;
  ctx.save();
  ctx.scale(sc, sc);
  px /= sc;
  groundShadow(ctx, 0.08, 0.03, 0.26 * (0.5 + stage * 0.12), 0.08, pal.ink, px, r, 0.9);
  PAINT[kind as Own](ctx, stage, t, px, r);
  ctx.restore();
}

/** The produce alone, centred on (0, 0), about 0.4 tiles across. */
export function paintSeedProduce(ctx: Ctx, kind: SeedId, pal: Palette, px: number): void {
  if (!OWN.includes(kind)) {
    paintProduce(ctx, kind as Parameters<typeof paintProduce>[1], pal, px);
    return;
  }
  const t: Tone = { ...TONES[kind as Own], ink: pal.ink };
  const r = new Rng(91);
  switch (kind as Own) {
    case 'mint':
      ctx.save();
      ctx.translate(0, 0.14);
      mint(ctx, 3, t, px, r);
      ctx.restore();
      break;
    case 'garlic':
      bulb(ctx, 0, 0.1, 0.15, 0.22, t, px);
      taper(ctx, 0, -0.1, 0.01, -0.15, 0.02, -0.2, 0.03, 0.015);
      fill(ctx, '#e8e0c8');
      ink(ctx, t.ink, inkW(px, 0.5), 0.8);
      break;
    case 'wheat':
      for (const [x, a] of [[-0.05, -0.25], [0, 0], [0.05, 0.25]] as const) {
        ctx.beginPath();
        ctx.moveTo(x * 0.4, 0.2);
        ctx.lineTo(x + Math.sin(a) * 0.1, -0.05);
        ink(ctx, '#c7a24a', Math.max(px * 1.6, 0.018), 1);
        ear(ctx, x + Math.sin(a) * 0.1, -0.05, 0.17, a, '#e2bf5a', t, px, true);
      }
      break;
    case 'chili':
      pod(ctx, -0.02, -0.14, 0.3, 1.45, '#cf3326', t, px);
      break;
  }
}
