// Buildings and builds, painted as sprites. Each building is anchored at the
// south-west corner of its footprint on the ground, so its front wall stands
// on the footprint's south edge and its roof rises up the page over the
// footprint, the oblique way. Window and lantern spots are exported for the
// night glow.

import type { BuildKind } from '../sim/types';
import { blob, fill, groundShadow, hatch, ink, inkW, letter, line, taper, type Ctx } from './brush';
import type { Palette } from './palette';
import { Rng } from './rng';

/** House front wall height, tiles. */
const HWALL = 0.95;
const HGABLE = 0.85;
/** Bunkhouse. */
const BWALL = 0.8;
const BRISE = 0.55;

/** Glow spots relative to each prop's anchor: [x, y, radius, kind 0 window 1 lantern]. */
export const LIGHTS: Record<string, [number, number, number, number][]> = {
  house: [
    [0.62, -0.53, 0.5, 0],
    [2.38, -0.53, 0.5, 0],
    [1.5, -HWALL - 0.36, 0.35, 0],
    [1.95, -0.62, 0.9, 1],
  ],
  bunkhouse: [
    [0.55, -0.45, 0.45, 0],
    [2.45, -0.45, 0.45, 0],
    [1.95, -0.6, 0.85, 1],
  ],
  board: [[1.93, -1.25, 0.75, 1]],
  crate: [],
};

/** Where chimney smoke leaves the house, relative to its anchor. */
export const CHIMNEY = { x: 2.33, y: -HWALL - 2.92 };
export const STOVEPIPE = { x: 2.4, y: -BWALL - 2.25 };

function windowPane(ctx: Ctx, x: number, y: number, w: number, h: number, pal: Palette, px: number, round = false): void {
  ctx.beginPath();
  if (round) ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
  else ctx.rect(x, y, w, h);
  fill(ctx, '#3d4a58');
  ctx.save();
  ctx.clip();
  // Sky in the glass.
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.7);
  ctx.lineTo(x + w * 0.6, y);
  ctx.lineTo(x + w * 0.9, y);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  fill(ctx, '#a9c2cf', 0.6);
  ctx.restore();
  ctx.beginPath();
  if (round) {
    ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + h);
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
  } else {
    ctx.rect(x, y, w, h);
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + h);
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
  }
  ink(ctx, '#f4ecd8', Math.max(px * 1.6, 0.028), 1);
  ink(ctx, pal.ink, inkW(px, 0.6), 0.8);
  if (!round) {
    // Sill and a pot of geraniums.
    ctx.beginPath();
    ctx.rect(x - 0.04, y + h, w + 0.08, 0.04);
    fill(ctx, '#f4ecd8');
    ink(ctx, pal.ink, inkW(px, 0.6), 0.8);
  }
}

function lantern(ctx: Ctx, x: number, y: number, pal: Palette, px: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - 0.12);
  ctx.lineTo(x, y - 0.07);
  ink(ctx, pal.ink, inkW(px, 0.8), 0.9);
  ctx.beginPath();
  ctx.rect(x - 0.04, y - 0.07, 0.08, 0.11);
  fill(ctx, '#f2d27a');
  ink(ctx, pal.ink, inkW(px, 0.8), 0.95);
  ctx.beginPath();
  ctx.moveTo(x - 0.055, y - 0.07);
  ctx.lineTo(x, y - 0.11);
  ctx.lineTo(x + 0.055, y - 0.07);
  ctx.closePath();
  fill(ctx, '#3a3a3a');
}

function snowOn(pal: Palette, snow: boolean): boolean {
  return pal.frost > 0 && snow;
}

export function paintHouse(ctx: Ctx, pal: Palette, px: number, snow: boolean): void {
  const r = new Rng(1101);
  const w = inkW(px, 1.2);
  const top = -HWALL - HGABLE;
  // Cast shadow off the east side.
  ctx.beginPath();
  ctx.moveTo(2.95, 0);
  ctx.lineTo(3.45, -0.2);
  ctx.lineTo(3.45, -1.9);
  ctx.lineTo(2.95, -2);
  ctx.closePath();
  ctx.save();
  fill(ctx, pal.ink, 0.12);
  ctx.clip();
  hatch(ctx, 2.9, -2.1, 3.5, 0.05, -0.75, Math.max(px * 2.6, 0.05), w * 0.55, pal.ink, 0.4, r);
  ctx.restore();

  // Roof planes, east (shaded) then west (lit), each running back from the gable.
  const roofCol = '#a9573f';
  const roofLit = '#c8735a';
  const back = -2;
  const eave = -HWALL + 0.08;
  const planes: [number, string][] = [
    [3.1, roofCol],
    [-0.1, roofLit],
  ];
  for (const [ex, col] of planes) {
    ctx.beginPath();
    ctx.moveTo(ex, eave);
    ctx.lineTo(1.5, top - 0.06);
    ctx.lineTo(1.5, top - 0.06 + back);
    ctx.lineTo(ex, eave + back);
    ctx.closePath();
    fill(ctx, col);
    ctx.save();
    ctx.clip();
    // Shingle courses run front to back; short ticks between shingles.
    ctx.beginPath();
    for (let k = 0.12; k < 1; k += 0.14) {
      const x = ex + (1.5 - ex) * k;
      const y0 = eave + (top - 0.06 - eave) * k;
      ctx.moveTo(x, y0 + 0.02);
      ctx.lineTo(x, y0 + back - 0.02);
      for (let yy = y0 - 0.05 - (k * 7 % 2) * 0.08; yy > y0 + back; yy -= 0.16) {
        ctx.moveTo(x, yy);
        ctx.lineTo(x + (1.5 - ex) * 0.14, yy - 0.012);
      }
    }
    ink(ctx, pal.ink, inkW(px, 0.6), 0.45);
    if (ex > 1.5) hatch(ctx, 1.5, top + back, ex, eave, -0.75, Math.max(px * 2.6, 0.05), w * 0.5, pal.ink, 0.35, r);
    if (snowOn(pal, snow)) {
      ctx.beginPath();
      ctx.moveTo(1.5, top - 0.06);
      ctx.lineTo(1.5, top - 0.06 + back);
      ctx.lineTo(1.5 + (ex - 1.5) * 0.8, eave + back + (top - eave) * 0.2);
      ctx.lineTo(1.5 + (ex - 1.5) * 0.8, eave + (top - eave) * 0.2);
      ctx.closePath();
      fill(ctx, '#ffffff', 0.92);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(ex, eave);
    ctx.lineTo(1.5, top - 0.06);
    ctx.lineTo(1.5, top - 0.06 + back);
    ctx.lineTo(ex, eave + back);
    ctx.closePath();
    ink(ctx, pal.ink, w, 0.9);
  }
  // Chimney on the east slope near the back.
  const cx = CHIMNEY.x;
  const cyTop = CHIMNEY.y;
  ctx.beginPath();
  ctx.rect(cx - 0.12, cyTop, 0.24, 0.62);
  fill(ctx, '#9a4a36');
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  for (let yy = cyTop + 0.08; yy < cyTop + 0.62; yy += 0.09) {
    ctx.moveTo(cx - 0.12, yy);
    ctx.lineTo(cx + 0.12, yy);
  }
  ink(ctx, '#f0dcc8', inkW(px, 0.5), 0.6);
  ctx.beginPath();
  ctx.rect(cx + 0.02, cyTop, 0.1, 0.62);
  fill(ctx, pal.ink, 0.2);
  ctx.restore();
  ctx.beginPath();
  ctx.rect(cx - 0.12, cyTop, 0.24, 0.62);
  ink(ctx, pal.ink, w, 0.9);
  ctx.beginPath();
  ctx.rect(cx - 0.15, cyTop - 0.05, 0.3, 0.07);
  fill(ctx, '#7a3a2a');
  ink(ctx, pal.ink, w * 0.8, 0.9);

  // Front wall and gable, white clapboard.
  ctx.beginPath();
  ctx.moveTo(0.08, 0);
  ctx.lineTo(0.08, -HWALL);
  ctx.lineTo(1.5, top);
  ctx.lineTo(2.92, -HWALL);
  ctx.lineTo(2.92, 0);
  ctx.closePath();
  fill(ctx, '#f1e8d3');
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  for (let yy = -0.1; yy > top; yy -= 0.1) {
    ctx.moveTo(0, yy + r.jit(0.004));
    ctx.lineTo(3, yy + r.jit(0.004));
  }
  ink(ctx, '#b9a888', inkW(px, 0.5), 0.8);
  // Soft shade on the east third, and under the eaves.
  ctx.beginPath();
  ctx.rect(2.2, top, 0.8, -top);
  fill(ctx, '#8a7a66', 0.2);
  ctx.beginPath();
  ctx.moveTo(0, -HWALL);
  ctx.lineTo(1.5, top);
  ctx.lineTo(3, -HWALL);
  ctx.lineTo(3, -HWALL + 0.12);
  ctx.lineTo(1.5, top + 0.12);
  ctx.lineTo(0, -HWALL + 0.12);
  ctx.closePath();
  fill(ctx, pal.ink, 0.18);
  // Stone footing.
  ctx.beginPath();
  ctx.rect(0, -0.1, 3, 0.1);
  fill(ctx, '#a89a86');
  ctx.beginPath();
  for (let xx = 0.1; xx < 2.95; xx += 0.17) {
    ctx.moveTo(xx + r.jit(0.02), -0.1);
    ctx.lineTo(xx + r.jit(0.02), 0);
  }
  ink(ctx, pal.ink, inkW(px, 0.5), 0.5);
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(0.08, 0);
  ctx.lineTo(0.08, -HWALL);
  ctx.lineTo(1.5, top);
  ctx.lineTo(2.92, -HWALL);
  ctx.lineTo(2.92, 0);
  ctx.closePath();
  ink(ctx, pal.ink, w, 0.95);
  // Bargeboards.
  ctx.beginPath();
  ctx.moveTo(-0.12, -HWALL + 0.1);
  ctx.lineTo(1.5, top - 0.08);
  ctx.lineTo(3.12, -HWALL + 0.1);
  ink(ctx, '#f6efe0', Math.max(px * 3, 0.07), 1);
  ink(ctx, pal.ink, w * 0.8, 0.9);
  if (snowOn(pal, snow)) {
    ctx.beginPath();
    ctx.moveTo(-0.12, -HWALL + 0.06);
    ctx.lineTo(1.5, top - 0.13);
    ctx.lineTo(3.12, -HWALL + 0.06);
    ink(ctx, '#ffffff', Math.max(px * 3, 0.07), 1);
  }

  windowPane(ctx, 0.42, -0.72, 0.4, 0.38, pal, px);
  windowPane(ctx, 2.18, -0.72, 0.4, 0.38, pal, px);
  windowPane(ctx, 1.38, -HWALL - 0.48, 0.24, 0.24, pal, px, true);
  // Geraniums on the sills.
  for (const wx of [0.62, 2.38]) {
    ctx.beginPath();
    ctx.rect(wx - 0.12, -0.32, 0.24, 0.07);
    fill(ctx, '#b0603a');
    ink(ctx, pal.ink, inkW(px, 0.5), 0.8);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) ctx.arc(wx - 0.1 + i * 0.05, -0.35 + r.jit(0.01), 0.025, 0, Math.PI * 2);
    fill(ctx, pal.season === 3 ? '#7a8a6a' : '#d9465f');
  }

  // The door, its step and a little porch roof.
  ctx.beginPath();
  ctx.rect(1.28, -0.66, 0.44, 0.62);
  fill(ctx, '#3f6b4a');
  ctx.beginPath();
  ctx.rect(1.33, -0.6, 0.15, 0.22);
  ctx.rect(1.52, -0.6, 0.15, 0.22);
  ctx.rect(1.33, -0.32, 0.15, 0.24);
  ctx.rect(1.52, -0.32, 0.15, 0.24);
  ink(ctx, pal.ink, inkW(px, 0.5), 0.6);
  ctx.beginPath();
  ctx.rect(1.28, -0.66, 0.44, 0.62);
  ink(ctx, pal.ink, w, 0.95);
  ctx.beginPath();
  ctx.arc(1.65, -0.33, 0.018, 0, Math.PI * 2);
  fill(ctx, '#e8c45a');
  ctx.beginPath();
  ctx.rect(1.2, -0.05, 0.6, 0.07);
  fill(ctx, '#b8ab96');
  ink(ctx, pal.ink, inkW(px, 0.7), 0.9);
  ctx.beginPath();
  ctx.moveTo(1.1, -0.68);
  ctx.lineTo(1.5, -0.86);
  ctx.lineTo(1.9, -0.68);
  ctx.closePath();
  fill(ctx, roofCol);
  ink(ctx, pal.ink, w * 0.9, 0.9);
  lantern(ctx, 1.95, -0.58, pal, px);
}

export function paintBunkhouse(ctx: Ctx, pal: Palette, px: number, snow: boolean): void {
  const r = new Rng(2202);
  const w = inkW(px, 1.2);
  const eave = -BWALL + 0.06;
  const ridge = -1 - BWALL - BRISE;
  const back = -2 - BWALL + 0.06;
  // Cast shadow.
  ctx.beginPath();
  ctx.moveTo(2.95, 0);
  ctx.lineTo(3.4, -0.2);
  ctx.lineTo(3.4, -1.9);
  ctx.lineTo(2.95, -2);
  ctx.closePath();
  ctx.save();
  fill(ctx, pal.ink, 0.12);
  ctx.clip();
  hatch(ctx, 2.9, -2.1, 3.5, 0.05, -0.75, Math.max(px * 2.6, 0.05), w * 0.55, pal.ink, 0.4, r);
  ctx.restore();
  // Back slope sliver and the big front slope, corrugated tin.
  ctx.beginPath();
  ctx.rect(-0.1, back, 3.2, ridge - back);
  fill(ctx, '#7f8a8e');
  ink(ctx, pal.ink, w, 0.85);
  ctx.beginPath();
  ctx.moveTo(-0.12, eave);
  ctx.lineTo(3.12, eave);
  ctx.lineTo(3.1, ridge);
  ctx.lineTo(-0.1, ridge);
  ctx.closePath();
  fill(ctx, '#97a3a6');
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  for (let x = -0.05; x < 3.1; x += 0.11) {
    ctx.moveTo(x, eave);
    ctx.lineTo(x, ridge);
  }
  ink(ctx, '#5f6a70', inkW(px, 0.5), 0.6);
  ctx.beginPath();
  for (let x = 0.0; x < 3.1; x += 0.11) {
    ctx.moveTo(x, eave - 0.02);
    ctx.lineTo(x, ridge + 0.02);
  }
  ink(ctx, '#d6dfe0', inkW(px, 0.5), 0.5);
  hatch(ctx, -0.1, ridge, 3.1, eave, -0.75, Math.max(px * 3, 0.06), w * 0.45, pal.ink, 0.22, r);
  if (snowOn(pal, snow)) {
    ctx.beginPath();
    ctx.rect(-0.1, ridge, 3.2, (eave - ridge) * 0.75);
    fill(ctx, '#ffffff', 0.92);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-0.12, eave);
  ctx.lineTo(3.12, eave);
  ctx.lineTo(3.1, ridge);
  ctx.lineTo(-0.1, ridge);
  ctx.closePath();
  ink(ctx, pal.ink, w, 0.95);
  // Stovepipe.
  ctx.beginPath();
  ctx.rect(STOVEPIPE.x - 0.05, STOVEPIPE.y, 0.1, 0.45);
  fill(ctx, '#4a4a4a');
  ink(ctx, pal.ink, w * 0.8, 0.9);
  ctx.beginPath();
  ctx.rect(STOVEPIPE.x - 0.08, STOVEPIPE.y - 0.04, 0.16, 0.05);
  fill(ctx, '#3a3a3a');

  // Red board-and-batten walls with white trim.
  ctx.beginPath();
  ctx.rect(0.06, -BWALL + 0.06, 2.88, BWALL - 0.06);
  fill(ctx, '#a8432e');
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  for (let x = 0.15; x < 2.95; x += 0.13) {
    ctx.moveTo(x + r.jit(0.005), -BWALL);
    ctx.lineTo(x + r.jit(0.005), 0);
  }
  ink(ctx, '#7a2a1e', inkW(px, 0.6), 0.75);
  ctx.beginPath();
  ctx.rect(2.1, -BWALL, 0.9, BWALL);
  fill(ctx, pal.ink, 0.18);
  ctx.beginPath();
  ctx.rect(0, -BWALL, 3, 0.14);
  fill(ctx, pal.ink, 0.25);
  ctx.restore();
  ctx.beginPath();
  ctx.rect(0.06, -BWALL + 0.06, 2.88, BWALL - 0.06);
  ink(ctx, '#f2eadb', Math.max(px * 2.2, 0.045), 1);
  ink(ctx, pal.ink, w, 0.9);
  windowPane(ctx, 0.38, -0.62, 0.34, 0.3, pal, px);
  windowPane(ctx, 2.28, -0.62, 0.34, 0.3, pal, px);
  // Barn door with its cross brace.
  ctx.beginPath();
  ctx.rect(1.22, -0.62, 0.56, 0.62);
  fill(ctx, '#8a3424');
  ctx.beginPath();
  ctx.moveTo(1.22, -0.62);
  ctx.lineTo(1.78, 0);
  ctx.moveTo(1.78, -0.62);
  ctx.lineTo(1.22, 0);
  ink(ctx, '#f2eadb', Math.max(px * 1.6, 0.03), 1);
  ctx.beginPath();
  ctx.rect(1.22, -0.62, 0.56, 0.62);
  ink(ctx, '#f2eadb', Math.max(px * 1.8, 0.035), 1);
  ink(ctx, pal.ink, w * 0.9, 0.9);
  // Name board over the door.
  ctx.beginPath();
  ctx.rect(1.08, -0.79, 0.84, 0.14);
  fill(ctx, '#efe4c8');
  ink(ctx, pal.ink, inkW(px, 0.7), 0.9);
  letter(ctx, 'bunkhouse', 1.5, -0.685, 0.11, pal.ink, 'center', true, 600);
  lantern(ctx, 1.95, -0.56, pal, px);
}

/** The shipping crate. `heap` 0 empty, 1 some produce, 2 brimming. */
export function paintCrate(ctx: Ctx, pal: Palette, px: number, heap: number): void {
  const r = new Rng(3303);
  const w = inkW(px, 1.1);
  groundShadow(ctx, 0.62, -0.1, 0.48, 0.16, pal.ink, px, r);
  const x0 = 0.1;
  const x1 = 0.9;
  const fh = 0.48;
  const depth = 0.72;
  // Top: the open bin, its far wall and the dark inside.
  ctx.beginPath();
  ctx.rect(x0, -fh - depth, x1 - x0, depth);
  fill(ctx, '#b88a56');
  ink(ctx, pal.ink, w, 0.9);
  ctx.beginPath();
  ctx.rect(x0 + 0.06, -fh - depth + 0.08, x1 - x0 - 0.12, depth - 0.1);
  fill(ctx, '#4a3424');
  if (heap > 0) {
    const cols = ['#d9465f', '#ee8a2b', '#9fd06a', '#e8772e', '#f0d35a', '#e0303f'];
    const n = heap === 1 ? 6 : 14;
    for (let i = 0; i < n; i++) {
      const hx = x0 + 0.12 + r.next() * (x1 - x0 - 0.24);
      const hy = -fh - 0.08 - r.next() * (depth - 0.2) * (heap === 1 ? 0.5 : 1);
      ctx.beginPath();
      ctx.arc(hx, hy, 0.05 + r.next() * 0.03, 0, Math.PI * 2);
      fill(ctx, cols[i % cols.length]);
      ink(ctx, pal.ink, inkW(px, 0.6), 0.8);
    }
  }
  // Front face: slats.
  ctx.beginPath();
  ctx.rect(x0, -fh, x1 - x0, fh);
  fill(ctx, '#c99a62');
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  for (let y = -fh + 0.12; y < 0; y += 0.12) {
    ctx.moveTo(x0, y + r.jit(0.005));
    ctx.lineTo(x1, y + r.jit(0.005));
  }
  ink(ctx, '#8a6238', inkW(px, 0.7), 0.85);
  ctx.beginPath();
  ctx.rect(x1 - 0.22, -fh, 0.22, fh);
  fill(ctx, pal.ink, 0.15);
  ctx.restore();
  ctx.beginPath();
  ctx.rect(x0, -fh, x1 - x0, fh);
  ink(ctx, pal.ink, w, 0.95);
  // Corner posts.
  for (const x of [x0, x1 - 0.07]) {
    ctx.beginPath();
    ctx.rect(x, -fh - 0.03, 0.07, fh + 0.03);
    fill(ctx, '#a87a48');
    ink(ctx, pal.ink, inkW(px, 0.8), 0.9);
  }
  // A stencilled word.
  letter(ctx, 'ship', 0.5, -0.17, 0.2, '#3a2a1a', 'center', false, 700);
}

export function paintBoard(ctx: Ctx, pal: Palette, px: number, notes: number): void {
  const r = new Rng(4404);
  const w = inkW(px, 1.1);
  const base = -0.42;
  groundShadow(ctx, 1.1, base + 0.04, 0.9, 0.12, pal.ink, px, r);
  for (const x of [0.22, 1.78]) {
    ctx.beginPath();
    ctx.rect(x - 0.045, base - 1.4, 0.09, 1.4);
    fill(ctx, '#8a6a48');
    ink(ctx, pal.ink, w * 0.9, 0.9);
  }
  // Board.
  ctx.beginPath();
  ctx.rect(0.1, base - 1.2, 1.8, 0.62);
  fill(ctx, '#b88e5e');
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  for (let y = base - 1.2 + 0.15; y < base - 0.58; y += 0.15) {
    ctx.moveTo(0.1, y);
    ctx.lineTo(1.9, y);
  }
  ink(ctx, '#7a5a38', inkW(px, 0.6), 0.8);
  ctx.restore();
  ctx.beginPath();
  ctx.rect(0.1, base - 1.2, 1.8, 0.62);
  ink(ctx, pal.ink, w, 0.95);
  // Pinned notices.
  const n = Math.max(2, Math.min(5, notes));
  for (let i = 0; i < n; i++) {
    const nx = 0.2 + i * (1.55 / n) + r.jit(0.03);
    const ny = base - 1.12 + r.jit(0.04);
    const nw = 0.26;
    const nh = 0.42;
    ctx.save();
    ctx.translate(nx + nw / 2, ny + nh / 2);
    ctx.rotate(r.jit(0.08));
    ctx.beginPath();
    ctx.rect(-nw / 2, -nh / 2, nw, nh);
    fill(ctx, i % 3 === 1 ? '#f2e6c4' : '#f8f2e2');
    ink(ctx, pal.ink, inkW(px, 0.6), 0.85);
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      ctx.moveTo(-nw * 0.35, -nh * 0.25 + k * 0.07);
      ctx.lineTo(nw * (0.15 + r.next() * 0.2), -nh * 0.25 + k * 0.07);
    }
    ink(ctx, pal.inkSoft, inkW(px, 0.5), 0.8);
    ctx.beginPath();
    ctx.arc(0, -nh / 2 + 0.035, 0.022, 0, Math.PI * 2);
    fill(ctx, '#b8433a');
    ctx.restore();
  }
  // Little shingle roof.
  ctx.beginPath();
  ctx.moveTo(-0.05, base - 1.2);
  ctx.lineTo(1.0, base - 1.42);
  ctx.lineTo(2.05, base - 1.2);
  ctx.closePath();
  fill(ctx, '#a9573f');
  ink(ctx, pal.ink, w, 0.9);
  lantern(ctx, 1.93, base - 0.8, pal, px);
}

export function paintScarecrow(ctx: Ctx, pal: Palette, px: number): void {
  const r = new Rng(5505);
  const w = inkW(px, 1);
  groundShadow(ctx, 0.12, 0.02, 0.3, 0.09, pal.ink, px, r);
  // Post and crossbar.
  ctx.beginPath();
  ctx.rect(-0.03, -1.0, 0.06, 1.0);
  fill(ctx, '#8a6a48');
  ink(ctx, pal.ink, w * 0.9, 0.9);
  // Patched shirt on the crossbar.
  ctx.beginPath();
  ctx.moveTo(-0.42, -0.78);
  ctx.lineTo(-0.15, -0.84);
  ctx.lineTo(0.15, -0.84);
  ctx.lineTo(0.42, -0.78);
  ctx.lineTo(0.42, -0.66);
  ctx.lineTo(0.17, -0.67);
  ctx.lineTo(0.2, -0.36);
  ctx.lineTo(-0.2, -0.36);
  ctx.lineTo(-0.17, -0.67);
  ctx.lineTo(-0.42, -0.66);
  ctx.closePath();
  fill(ctx, '#b0533e');
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  for (let x = -0.45; x < 0.45; x += 0.07) {
    ctx.moveTo(x, -0.9);
    ctx.lineTo(x, -0.3);
  }
  for (let y = -0.84; y < -0.3; y += 0.07) {
    ctx.moveTo(-0.45, y);
    ctx.lineTo(0.45, y);
  }
  ink(ctx, '#7a2a20', inkW(px, 0.5), 0.6);
  ctx.beginPath();
  ctx.rect(0.02, -0.6, 0.12, 0.12);
  fill(ctx, '#5a7aa8');
  ink(ctx, pal.ink, inkW(px, 0.5), 0.8);
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-0.42, -0.78);
  ctx.lineTo(-0.15, -0.84);
  ctx.lineTo(0.15, -0.84);
  ctx.lineTo(0.42, -0.78);
  ctx.lineTo(0.42, -0.66);
  ctx.lineTo(0.17, -0.67);
  ctx.lineTo(0.2, -0.36);
  ctx.lineTo(-0.2, -0.36);
  ctx.lineTo(-0.17, -0.67);
  ctx.lineTo(-0.42, -0.66);
  ctx.closePath();
  ink(ctx, pal.ink, w, 0.9);
  // Straw at cuffs and hem.
  ctx.beginPath();
  for (const [sx, sy, dx] of [
    [-0.42, -0.72, -1],
    [0.42, -0.72, 1],
  ] as const) {
    for (let i = 0; i < 4; i++) {
      ctx.moveTo(sx, sy + (i - 1.5) * 0.025);
      ctx.lineTo(sx + dx * (0.07 + r.next() * 0.04), sy + (i - 1.5) * 0.04 + 0.02);
    }
  }
  for (let i = 0; i < 6; i++) {
    const sx = -0.16 + i * 0.065;
    ctx.moveTo(sx, -0.36);
    ctx.lineTo(sx + r.jit(0.03), -0.26 - r.next() * 0.04);
  }
  ink(ctx, '#e0be5a', Math.max(px * 1.4, 0.022), 1);
  // Sack head with a stitched face.
  ctx.beginPath();
  ctx.ellipse(0, -0.95, 0.12, 0.13, 0, 0, Math.PI * 2);
  fill(ctx, '#d8c08a');
  ink(ctx, pal.ink, w, 0.9);
  ctx.beginPath();
  ctx.moveTo(-0.06, -0.97);
  ctx.lineTo(-0.03, -0.94);
  ctx.moveTo(-0.03, -0.97);
  ctx.lineTo(-0.06, -0.94);
  ctx.moveTo(0.03, -0.97);
  ctx.lineTo(0.06, -0.94);
  ctx.moveTo(0.06, -0.97);
  ctx.lineTo(0.03, -0.94);
  ctx.moveTo(-0.06, -0.89);
  ctx.quadraticCurveTo(0, -0.86, 0.06, -0.89);
  ink(ctx, pal.ink, inkW(px, 0.6), 0.9);
  // Straw hat.
  ctx.beginPath();
  ctx.ellipse(0, -1.04, 0.22, 0.055, -0.08, 0, Math.PI * 2);
  fill(ctx, '#e0be5a');
  ink(ctx, pal.ink, w * 0.9, 0.9);
  ctx.beginPath();
  ctx.moveTo(-0.1, -1.05);
  ctx.quadraticCurveTo(-0.09, -1.17, 0, -1.17);
  ctx.quadraticCurveTo(0.09, -1.17, 0.1, -1.05);
  ctx.closePath();
  fill(ctx, '#d4ae4a');
  ink(ctx, pal.ink, w * 0.9, 0.9);
  ctx.beginPath();
  ctx.rect(-0.1, -1.09, 0.2, 0.03);
  fill(ctx, '#7a3a2a');
}

export function paintSprinkler(ctx: Ctx, pal: Palette, px: number): void {
  const r = new Rng(6606);
  const w = inkW(px, 1);
  // A dark ring of wet earth.
  blob(ctx, 0, 0, 0.26, 0.09, r, 0.15, 8);
  fill(ctx, '#5a4430', 0.35);
  groundShadow(ctx, 0.06, 0.01, 0.12, 0.04, pal.ink, px, r);
  // Riser pipe and brass head.
  taper(ctx, 0, 0, 0, -0.15, 0, -0.3, 0.06, 0.045);
  fill(ctx, '#9aa4a8');
  ink(ctx, pal.ink, w * 0.9, 0.9);
  ctx.beginPath();
  line(ctx, 0.012, -0.02, 0.012, -0.28, r, 0.002);
  ink(ctx, '#e8eef0', inkW(px, 0.5), 0.8);
  ctx.beginPath();
  ctx.ellipse(0, -0.32, 0.055, 0.035, 0, 0, Math.PI * 2);
  fill(ctx, '#c8a04a');
  ink(ctx, pal.ink, w * 0.9, 0.95);
}

export function buildTop(kind: BuildKind): number {
  return kind === 'scarecrow' ? 1.2 : 0.35;
}
