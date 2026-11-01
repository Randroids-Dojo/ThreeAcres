// Ink-and-wash drawings of the tools, the weather and the two objects, in the
// almanac's hand. Each draws centred on (0, 0) in a box from -0.5 to 0.5.
// Weather glyphs are cut like woodblocks: solid ink with one spot colour.

import { blob, fill, groundShadow, ink, inkW, leaf, roundLeaf, taper, type Ctx } from '../../../render2d/brush';
import type { Palette } from '../../../render2d/palette';
import { paintScarecrow } from '../../../render2d/props';
import { Rng } from '../../../render2d/rng';
import type { CardId } from '../rules';

const STEEL = '#9aaca6';
const STEEL_DARK = '#66786f';
const WOOD = '#a27a4c';
const WOOD_DARK = '#74532f';
const WATER = '#5d93c4';

function drops(ctx: Ctx, pts: [number, number][], px: number, inkc: string): void {
  for (const [x, y] of pts) {
    ctx.beginPath();
    ctx.moveTo(x, y - 0.04);
    ctx.quadraticCurveTo(x + 0.025, y, x, y + 0.02);
    ctx.quadraticCurveTo(x - 0.025, y, x, y - 0.04);
    fill(ctx, WATER);
    ink(ctx, inkc, inkW(px, 0.5), 0.7);
  }
}

function can(ctx: Ctx, px: number, inkc: string): void {
  // Spout first, behind the body.
  taper(ctx, 0.12, 0.08, 0.3, -0.05, 0.38, -0.2, 0.07, 0.035);
  fill(ctx, STEEL);
  ink(ctx, inkc, inkW(px), 0.9);
  ctx.beginPath();
  ctx.ellipse(0.4, -0.22, 0.06, 0.035, -0.6, 0, Math.PI * 2);
  fill(ctx, STEEL_DARK);
  ink(ctx, inkc, inkW(px, 0.8), 0.9);
  // Body.
  ctx.beginPath();
  ctx.moveTo(-0.3, -0.12);
  ctx.lineTo(0.16, -0.12);
  ctx.lineTo(0.2, 0.26);
  ctx.quadraticCurveTo(-0.06, 0.32, -0.34, 0.26);
  ctx.closePath();
  fill(ctx, STEEL);
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.rect(0.02, -0.2, 0.3, 0.6);
  fill(ctx, STEEL_DARK, 0.45);
  ctx.beginPath();
  ctx.rect(-0.24, -0.2, 0.05, 0.6);
  fill(ctx, '#ffffff', 0.35);
  for (const y of [0.0, 0.14]) {
    ctx.beginPath();
    ctx.moveTo(-0.4, y);
    ctx.lineTo(0.3, y + 0.01);
    ink(ctx, inkc, inkW(px, 0.5), 0.45);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-0.3, -0.12);
  ctx.lineTo(0.16, -0.12);
  ctx.lineTo(0.2, 0.26);
  ctx.quadraticCurveTo(-0.06, 0.32, -0.34, 0.26);
  ctx.closePath();
  ink(ctx, inkc, inkW(px), 0.95);
  ctx.beginPath();
  ctx.ellipse(-0.07, -0.12, 0.23, 0.045, 0, 0, Math.PI * 2);
  fill(ctx, STEEL_DARK);
  ink(ctx, inkc, inkW(px, 0.8), 0.9);
  // Handle.
  ctx.beginPath();
  ctx.moveTo(-0.26, -0.12);
  ctx.bezierCurveTo(-0.3, -0.42, 0.1, -0.42, 0.1, -0.12);
  ink(ctx, inkc, Math.max(px * 3.5, 0.05), 0.95);
  ctx.beginPath();
  ctx.moveTo(-0.26, -0.12);
  ctx.bezierCurveTo(-0.3, -0.42, 0.1, -0.42, 0.1, -0.12);
  ink(ctx, STEEL, Math.max(px * 2, 0.028), 1);
  drops(ctx, [[0.42, -0.08], [0.47, 0.04], [0.38, 0.1]], px, inkc);
}

function heap(ctx: Ctx, col: string, dark: string, px: number, inkc: string, r: Rng, w = 0.4, h = 0.24): void {
  ctx.beginPath();
  ctx.moveTo(-w, 0.2);
  ctx.bezierCurveTo(-w * 0.7, 0.2 - h * 1.2, w * 0.6, 0.2 - h * 1.3, w, 0.2);
  ctx.closePath();
  fill(ctx, col);
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    ctx.arc(r.range(-w, w), r.range(0.2 - h, 0.2), r.range(0.008, 0.02), 0, Math.PI * 2);
    fill(ctx, i % 3 ? dark : '#ffffff', i % 3 ? 0.6 : 0.25);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-w, 0.2);
  ctx.bezierCurveTo(-w * 0.7, 0.2 - h * 1.2, w * 0.6, 0.2 - h * 1.3, w, 0.2);
  ink(ctx, inkc, inkW(px), 0.9);
}

function compost(ctx: Ctx, px: number, inkc: string): void {
  const r = new Rng(22);
  // A slatted bin.
  ctx.beginPath();
  ctx.rect(-0.38, -0.12, 0.76, 0.36);
  fill(ctx, WOOD);
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    ctx.rect(-0.38, -0.12 + k * 0.09, 0.76, 0.06);
    fill(ctx, k % 2 ? '#b48a58' : WOOD);
    ink(ctx, inkc, inkW(px, 0.6), 0.8);
  }
  heap(ctx, '#4a3424', '#2a1c12', px, inkc, r, 0.36, 0.3);
  ctx.save();
  ctx.translate(0, -0.33);
  // Peelings and a leaf on top.
  leaf(ctx, -0.12, 0.12, 0.14, 0.04, -0.5, 0.1);
  fill(ctx, '#7fae4a');
  ink(ctx, inkc, inkW(px, 0.6), 0.8);
  ctx.beginPath();
  ctx.ellipse(0.1, 0.16, 0.05, 0.025, 0.4, 0, Math.PI * 2);
  fill(ctx, '#f0e6d0');
  ink(ctx, inkc, inkW(px, 0.5), 0.8);
  ctx.beginPath();
  ctx.ellipse(0.02, 0.1, 0.04, 0.02, -0.3, 0, Math.PI * 2);
  fill(ctx, '#e07a26');
  ink(ctx, inkc, inkW(px, 0.5), 0.8);
  ctx.restore();
  // A worm.
  ctx.beginPath();
  ctx.moveTo(0.22, -0.02);
  ctx.bezierCurveTo(0.28, -0.1, 0.34, 0.0, 0.4, -0.06);
  ink(ctx, '#d48a8a', Math.max(px * 2.5, 0.035), 1);
}

function fertiliser(ctx: Ctx, px: number, inkc: string): void {
  // A tied paper sack.
  ctx.beginPath();
  ctx.moveTo(-0.26, 0.34);
  ctx.quadraticCurveTo(-0.34, 0.0, -0.22, -0.24);
  ctx.lineTo(-0.08, -0.32);
  ctx.lineTo(0.1, -0.32);
  ctx.lineTo(0.24, -0.24);
  ctx.quadraticCurveTo(0.36, 0.0, 0.28, 0.34);
  ctx.closePath();
  fill(ctx, '#d9c49a');
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.rect(0.06, -0.4, 0.4, 0.8);
  fill(ctx, '#b49a6a', 0.45);
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-0.26, 0.34);
  ctx.quadraticCurveTo(-0.34, 0.0, -0.22, -0.24);
  ctx.lineTo(-0.08, -0.32);
  ctx.lineTo(0.1, -0.32);
  ctx.lineTo(0.24, -0.24);
  ctx.quadraticCurveTo(0.36, 0.0, 0.28, 0.34);
  ctx.closePath();
  ink(ctx, inkc, inkW(px), 0.9);
  // Tie and ears.
  ctx.beginPath();
  ctx.moveTo(-0.1, -0.32);
  ctx.lineTo(-0.16, -0.44);
  ctx.lineTo(0.0, -0.38);
  ctx.lineTo(0.16, -0.46);
  ctx.lineTo(0.12, -0.32);
  fill(ctx, '#d9c49a');
  ink(ctx, inkc, inkW(px, 0.8), 0.9);
  ctx.beginPath();
  ctx.moveTo(-0.12, -0.3);
  ctx.lineTo(0.14, -0.3);
  ink(ctx, '#7a5a3a', Math.max(px * 2.5, 0.035), 1);
  // A printed sprout.
  ctx.beginPath();
  ctx.moveTo(0, 0.2);
  ctx.lineTo(0, -0.02);
  ink(ctx, '#3f6e2a', inkW(px, 1.2), 1);
  roundLeaf(ctx, 0, -0.02, 0.13, 0.05, -2.4);
  fill(ctx, '#5f9a3a');
  ink(ctx, inkc, inkW(px, 0.6), 0.8);
  roundLeaf(ctx, 0, -0.02, 0.13, 0.05, -0.75);
  fill(ctx, '#7fb85a');
  ink(ctx, inkc, inkW(px, 0.6), 0.8);
}

function trowel(ctx: Ctx, px: number, inkc: string): void {
  ctx.save();
  ctx.rotate(-0.7);
  // Handle.
  ctx.beginPath();
  ctx.ellipse(0, 0.28, 0.06, 0.16, 0, 0, Math.PI * 2);
  fill(ctx, WOOD);
  ink(ctx, inkc, inkW(px), 0.9);
  ctx.beginPath();
  ctx.moveTo(-0.02, 0.16);
  ctx.lineTo(-0.02, 0.38);
  ink(ctx, '#ffffff', inkW(px, 0.6), 0.35);
  ctx.beginPath();
  ctx.rect(-0.02, 0.06, 0.04, 0.08);
  fill(ctx, STEEL_DARK);
  ink(ctx, inkc, inkW(px, 0.6), 0.9);
  // Blade.
  ctx.beginPath();
  ctx.moveTo(-0.12, 0.06);
  ctx.quadraticCurveTo(-0.16, -0.22, 0, -0.44);
  ctx.quadraticCurveTo(0.16, -0.22, 0.12, 0.06);
  ctx.closePath();
  fill(ctx, STEEL);
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.rect(0, -0.5, 0.2, 0.6);
  fill(ctx, STEEL_DARK, 0.5);
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-0.12, 0.06);
  ctx.quadraticCurveTo(-0.16, -0.22, 0, -0.44);
  ctx.quadraticCurveTo(0.16, -0.22, 0.12, 0.06);
  ctx.closePath();
  ink(ctx, inkc, inkW(px), 0.95);
  ctx.beginPath();
  ctx.moveTo(0, 0.04);
  ctx.lineTo(0, -0.36);
  ink(ctx, inkc, inkW(px, 0.5), 0.5);
  ctx.restore();
  // A little soil on the tip.
  const r = new Rng(4);
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(-0.3 + r.jit(0.05), -0.32 + r.jit(0.05), r.range(0.012, 0.025), 0, Math.PI * 2);
    fill(ctx, '#6a4a30');
  }
}

function shears(ctx: Ctx, px: number, inkc: string): void {
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.rotate(side * 0.3);
    // Handle.
    taper(ctx, 0, 0.02, side * 0.06, 0.2, side * 0.04, 0.42, 0.07, 0.09);
    fill(ctx, side > 0 ? '#b8423a' : '#a83a32');
    ink(ctx, inkc, inkW(px), 0.9);
    // Blade.
    ctx.beginPath();
    ctx.moveTo(0, 0.02);
    ctx.quadraticCurveTo(side * 0.09, -0.18, side * 0.01, -0.42);
    ctx.quadraticCurveTo(-side * 0.03, -0.2, 0, 0.02);
    ctx.closePath();
    fill(ctx, STEEL);
    ink(ctx, inkc, inkW(px), 0.95);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0.02, 0.035, 0, Math.PI * 2);
  fill(ctx, '#d4a83a');
  ink(ctx, inkc, inkW(px, 0.7), 0.9);
  // Spring.
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) ctx.lineTo((i % 2 ? 0.03 : -0.03), 0.12 + i * 0.018);
  ink(ctx, STEEL_DARK, inkW(px, 0.6), 0.9);
}

function ladybird(ctx: Ctx, x: number, y: number, s: number, a: number, px: number, inkc: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.arc(0, -s * 0.8, s * 0.42, 0, Math.PI * 2);
  fill(ctx, '#2a2420');
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.75, s * 0.85, 0, 0, Math.PI * 2);
  fill(ctx, '#c8352a');
  ctx.beginPath();
  ctx.ellipse(-s * 0.25, -s * 0.3, s * 0.22, s * 0.14, -0.5, 0, Math.PI * 2);
  fill(ctx, '#ffffff', 0.4);
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.75, s * 0.85, 0, 0, Math.PI * 2);
  ink(ctx, inkc, inkW(px, 0.8), 0.95);
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.85);
  ctx.lineTo(0, s * 0.85);
  ink(ctx, inkc, inkW(px, 0.7), 0.9);
  for (const [dx, dy] of [[-0.38, -0.2], [0.38, -0.2], [-0.42, 0.3], [0.42, 0.3], [-0.15, 0.55], [0.15, 0.55]] as const) {
    ctx.beginPath();
    ctx.arc(dx * s, dy * s, s * 0.14, 0, Math.PI * 2);
    fill(ctx, '#2a2420');
  }
  ctx.restore();
}

function ladybirds(ctx: Ctx, px: number, inkc: string): void {
  roundLeaf(ctx, -0.38, 0.3, 0.8, 0.26, -0.55);
  fill(ctx, '#7fb85a');
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.rect(-0.5, 0, 1, 0.5);
  fill(ctx, '#5a8f3c', 0.5);
  ctx.restore();
  roundLeaf(ctx, -0.38, 0.3, 0.8, 0.26, -0.55);
  ink(ctx, inkc, inkW(px), 0.9);
  ctx.beginPath();
  ctx.moveTo(-0.38, 0.3);
  ctx.quadraticCurveTo(0, 0.0, 0.26, -0.13);
  ink(ctx, inkc, inkW(px, 0.6), 0.55);
  ladybird(ctx, -0.08, 0.06, 0.13, -0.6, px, inkc);
  ladybird(ctx, 0.2, -0.22, 0.1, 0.4, px, inkc);
}

function beehive(ctx: Ctx, px: number, inkc: string): void {
  const r = new Rng(77);
  groundShadow(ctx, 0.06, 0.38, 0.36, 0.09, inkc, px, r, 0.9);
  // Stand.
  ctx.beginPath();
  ctx.rect(-0.36, 0.26, 0.72, 0.08);
  fill(ctx, WOOD);
  ink(ctx, inkc, inkW(px, 0.8), 0.9);
  for (const x of [-0.3, 0.26]) {
    ctx.beginPath();
    ctx.rect(x, 0.34, 0.05, 0.1);
    fill(ctx, WOOD_DARK);
    ink(ctx, inkc, inkW(px, 0.6), 0.9);
  }
  // The skep: coiled straw bands.
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const y0 = 0.26 - i * 0.1;
    const w = 0.3 * Math.sqrt(1 - Math.pow(i / bands, 1.6)) + 0.04;
    ctx.beginPath();
    ctx.ellipse(0, y0 - 0.05, w, 0.065, 0, 0, Math.PI * 2);
    fill(ctx, i % 2 ? '#d9b25a' : '#e6c16a');
    ink(ctx, inkc, inkW(px, 0.7), 0.85);
    ctx.beginPath();
    for (let k = -3; k <= 3; k++) {
      ctx.moveTo((k / 3.5) * w, y0 - 0.1);
      ctx.lineTo((k / 3.5) * w + 0.012, y0);
    }
    ink(ctx, '#a07a2a', inkW(px, 0.4), 0.55);
  }
  ctx.beginPath();
  ctx.arc(0, -0.38, 0.05, 0, Math.PI * 2);
  fill(ctx, '#d9b25a');
  ink(ctx, inkc, inkW(px, 0.7), 0.85);
  // Entrance.
  ctx.beginPath();
  ctx.ellipse(0, 0.22, 0.07, 0.04, 0, Math.PI, 0);
  fill(ctx, '#2a2018');
  // Bees.
  for (const [x, y] of [[0.3, -0.24], [-0.32, -0.08], [0.38, 0.06]] as const) {
    ctx.beginPath();
    ctx.ellipse(x, y, 0.035, 0.024, 0.3, 0, Math.PI * 2);
    fill(ctx, '#e8b830');
    ink(ctx, inkc, inkW(px, 0.5), 0.9);
    ctx.beginPath();
    ctx.ellipse(x - 0.01, y - 0.03, 0.025, 0.015, -0.4, 0, Math.PI * 2);
    fill(ctx, '#ffffff', 0.7);
    ink(ctx, inkc, inkW(px, 0.35), 0.6);
  }
}

// ---------------------------------------------------------------- woodcut weather

function cloud(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x - 0.36 * s, y + 0.08 * s);
  ctx.bezierCurveTo(x - 0.46 * s, y - 0.06 * s, x - 0.3 * s, y - 0.2 * s, x - 0.18 * s, y - 0.14 * s);
  ctx.bezierCurveTo(x - 0.16 * s, y - 0.34 * s, x + 0.12 * s, y - 0.36 * s, x + 0.14 * s, y - 0.16 * s);
  ctx.bezierCurveTo(x + 0.3 * s, y - 0.26 * s, x + 0.46 * s, y - 0.06 * s, x + 0.36 * s, y + 0.08 * s);
  ctx.closePath();
}

function woodcutLines(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, gap: number, w: number, col: string): void {
  ctx.beginPath();
  for (let y = y0; y < y1; y += gap) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
  }
  ink(ctx, col, w, 1);
}

function rain(ctx: Ctx, px: number, inkc: string): void {
  cloud(ctx, 0, -0.1, 1);
  fill(ctx, '#f4efe2');
  ctx.save();
  ctx.clip();
  woodcutLines(ctx, -0.5, -0.06, 0.5, 0.1, 0.035, Math.max(px * 1.6, 0.016), inkc);
  ctx.restore();
  cloud(ctx, 0, -0.1, 1);
  ink(ctx, inkc, Math.max(px * 3, 0.04), 1);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const x = -0.28 + i * 0.11;
    ctx.moveTo(x, 0.06 + (i % 2) * 0.04);
    ctx.lineTo(x - 0.07, 0.3 + (i % 2) * 0.06);
  }
  ink(ctx, WATER, Math.max(px * 3.2, 0.045), 1);
}

function sun(ctx: Ctx, px: number, inkc: string): void {
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r0 = 0.24;
    const r1 = i % 2 ? 0.36 : 0.46;
    ctx.moveTo(Math.cos(a - 0.09) * r0, Math.sin(a - 0.09) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a + 0.09) * r0, Math.sin(a + 0.09) * r0);
  }
  fill(ctx, '#e8a92a');
  ink(ctx, inkc, Math.max(px * 2, 0.025), 1);
  ctx.beginPath();
  ctx.arc(0, 0, 0.22, 0, Math.PI * 2);
  fill(ctx, '#f2c64a');
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  for (let k = 0; k < 5; k++) {
    ctx.moveTo(-0.3, 0.04 + k * 0.045);
    ctx.lineTo(0.3, 0.04 + k * 0.045);
  }
  ink(ctx, inkc, Math.max(px * 1.4, 0.014), 0.9);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, 0.22, 0, Math.PI * 2);
  ink(ctx, inkc, Math.max(px * 3, 0.04), 1);
}

function storm(ctx: Ctx, px: number, inkc: string): void {
  cloud(ctx, 0, -0.14, 1.05);
  fill(ctx, '#4a4a52');
  ctx.save();
  ctx.clip();
  woodcutLines(ctx, -0.5, -0.4, 0.5, 0.1, 0.035, Math.max(px * 1.6, 0.016), '#22222a');
  ctx.restore();
  cloud(ctx, 0, -0.14, 1.05);
  ink(ctx, inkc, Math.max(px * 3, 0.04), 1);
  ctx.beginPath();
  ctx.moveTo(0.04, 0.0);
  ctx.lineTo(-0.1, 0.2);
  ctx.lineTo(0.01, 0.2);
  ctx.lineTo(-0.08, 0.44);
  ctx.lineTo(0.16, 0.14);
  ctx.lineTo(0.05, 0.14);
  ctx.lineTo(0.14, 0.0);
  ctx.closePath();
  fill(ctx, '#f2c64a');
  ink(ctx, inkc, inkW(px, 1), 1);
  ctx.beginPath();
  for (const x of [-0.3, -0.2, 0.26, 0.36]) {
    ctx.moveTo(x, 0.04);
    ctx.lineTo(x - 0.08, 0.3);
  }
  ink(ctx, WATER, Math.max(px * 3, 0.04), 1);
}

/** Draw the picture for a tool, weather or object card. */
export function paintGlyph(ctx: Ctx, id: CardId, px: number, inkc: string, pal: Palette): void {
  switch (id) {
    case 'can':
      return can(ctx, px, inkc);
    case 'compost':
      return compost(ctx, px, inkc);
    case 'fertiliser':
      return fertiliser(ctx, px, inkc);
    case 'trowel':
      return trowel(ctx, px, inkc);
    case 'shears':
      return shears(ctx, px, inkc);
    case 'ladybirds':
      return ladybirds(ctx, px, inkc);
    case 'beehive':
      return beehive(ctx, px, inkc);
    case 'scarecrow':
      ctx.save();
      ctx.translate(0, 0.46);
      ctx.scale(0.9, 0.9);
      paintScarecrow(ctx, pal, px / 0.9);
      ctx.restore();
      return;
    case 'rain':
      return rain(ctx, px, inkc);
    case 'sun':
      return sun(ctx, px, inkc);
    case 'storm':
      return storm(ctx, px, inkc);
    default:
      return;
  }
}

/** The beehive as it stands on a plot: base at (0, 0), about a tile tall. */
export function paintHiveOnPlot(ctx: Ctx, px: number, inkc: string): void {
  ctx.save();
  ctx.translate(0, -0.42);
  ctx.scale(0.85, 0.85);
  beehive(ctx, px / 0.85, inkc);
  ctx.restore();
}

/** A blob of a few pests (aphids) for a pested crop, around (0, 0). */
export function paintPests(ctx: Ctx, px: number, seed: number): void {
  const r = new Rng(seed);
  // A crawl of fat lime aphids up the stem and leaves, outlined dark so they read against green and soil alike,
  // with chewed, yellowed leaf behind them.
  ctx.beginPath();
  ctx.ellipse(0, -0.3, 0.32, 0.26, 0, 0, Math.PI * 2);
  fill(ctx, '#c8a828', 0.22);
  for (let i = 0; i < 9; i++) {
    const x = r.jit(0.3);
    const y = -0.08 - r.next() * 0.6;
    const rx = 0.06 + r.next() * 0.02;
    // Legs.
    ctx.beginPath();
    for (const k of [-1, 0, 1]) {
      ctx.moveTo(x + k * rx * 0.4, y);
      ctx.lineTo(x + k * rx * 0.7 - rx * 0.6, y + rx * 0.9);
      ctx.moveTo(x + k * rx * 0.4, y);
      ctx.lineTo(x + k * rx * 0.7 + rx * 0.6, y + rx * 0.9);
    }
    ink(ctx, '#1e2408', inkW(px, 0.7), 0.95);
    blob(ctx, x, y, rx, rx * 0.72, r, 0.12, 7, r.next() * 3);
    fill(ctx, i % 4 === 0 ? '#d8e85a' : '#a8c832');
    ink(ctx, '#1e2408', inkW(px, 0.9), 1);
    ctx.beginPath();
    ctx.arc(x - rx * 0.6, y - rx * 0.1, rx * 0.32, 0, Math.PI * 2);
    fill(ctx, '#3a4810');
    ctx.beginPath();
    ctx.arc(x + rx * 0.15, y - rx * 0.3, rx * 0.22, 0, Math.PI * 2);
    fill(ctx, '#f4f8d0', 0.85);
  }
}

/** The merchant's rubber stamp (upgrade), on its ink pad. */
export function paintStamp(ctx: Ctx, px: number, inkc: string): void {
  ctx.beginPath();
  ctx.rect(-0.42, 0.18, 0.84, 0.16);
  fill(ctx, '#3a3a48');
  ink(ctx, inkc, inkW(px), 0.9);
  ctx.beginPath();
  ctx.rect(-0.36, 0.14, 0.72, 0.06);
  fill(ctx, '#b8352a');
  ctx.beginPath();
  ctx.rect(-0.18, -0.02, 0.36, 0.14);
  fill(ctx, '#7a4a2a');
  ink(ctx, inkc, inkW(px, 0.8), 0.9);
  taper(ctx, 0, -0.02, 0.0, -0.18, 0, -0.32, 0.1, 0.08);
  fill(ctx, WOOD);
  ink(ctx, inkc, inkW(px, 0.8), 0.9);
  ctx.beginPath();
  ctx.ellipse(0, -0.38, 0.13, 0.1, 0, 0, Math.PI * 2);
  fill(ctx, '#b8423a');
  ink(ctx, inkc, inkW(px, 0.8), 0.9);
  ctx.beginPath();
  ctx.ellipse(-0.04, -0.41, 0.05, 0.03, -0.4, 0, Math.PI * 2);
  fill(ctx, '#ffffff', 0.4);
}

/** A brass hand bell (fresh stock). */
export function paintBell(ctx: Ctx, px: number, inkc: string): void {
  ctx.beginPath();
  ctx.moveTo(-0.3, 0.22);
  ctx.quadraticCurveTo(-0.26, -0.18, 0, -0.2);
  ctx.quadraticCurveTo(0.26, -0.18, 0.3, 0.22);
  ctx.quadraticCurveTo(0, 0.3, -0.3, 0.22);
  ctx.closePath();
  fill(ctx, '#d4a83a');
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.rect(0.06, -0.3, 0.3, 0.6);
  fill(ctx, '#9a7420', 0.45);
  ctx.beginPath();
  ctx.rect(-0.2, -0.3, 0.05, 0.6);
  fill(ctx, '#fff2c0', 0.5);
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-0.3, 0.22);
  ctx.quadraticCurveTo(-0.26, -0.18, 0, -0.2);
  ctx.quadraticCurveTo(0.26, -0.18, 0.3, 0.22);
  ctx.quadraticCurveTo(0, 0.3, -0.3, 0.22);
  ctx.closePath();
  ink(ctx, inkc, inkW(px), 0.95);
  ctx.beginPath();
  ctx.arc(0, 0.27, 0.05, 0, Math.PI * 2);
  fill(ctx, '#7a5418');
  taper(ctx, 0, -0.2, 0.01, -0.32, 0, -0.46, 0.08, 0.1);
  fill(ctx, '#2a1a10');
  ink(ctx, inkc, inkW(px, 0.6), 0.9);
}
