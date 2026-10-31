// Trees and hedges for the wood belt around the farm. Painted into the ground
// caches, never per frame. The base of each tree is its trunk foot; the crown
// rises up the page. `fade` thins the outer trees into a sketch so the plate
// dissolves into the paper at its edge.

import { blob, fill, groundShadow, hatch, ink, inkW, taper, type Ctx } from './brush';
import type { Palette } from './palette';
import { Rng } from './rng';

export interface TreeSpec {
  x: number;
  y: number;
  kind: 'oak' | 'pine' | 'bush';
  size: number;
  seed: number;
  /** 1 full colour, towards 0 an ink sketch on bare paper. */
  fade: number;
}

/** Round lobes that make a crown or a bush: positions and radii. */
interface Lobes {
  n: number;
  x: number[];
  y: number[];
  r: number[];
  a: number[];
}

function makeLobes(cx: number, cy: number, rx: number, ry: number, r: Rng, n: number): Lobes {
  const L: Lobes = { n: n + 1, x: [], y: [], r: [], a: [] };
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.jit(0.3);
    const d = 0.55 + r.next() * 0.2;
    L.x.push(cx + Math.cos(a) * rx * d);
    L.y.push(cy + Math.sin(a) * ry * d);
    L.r.push(Math.min(rx, ry) * (0.44 + r.next() * 0.16));
    L.a.push(a);
  }
  // A heart lobe so the middle is never hollow.
  L.x.push(cx);
  L.y.push(cy);
  L.r.push(Math.min(rx, ry) * 0.66);
  L.a.push(NaN);
  return L;
}

function lobesPath(ctx: Ctx, L: Lobes, dx = 0, dy = 0, k = 1): void {
  ctx.beginPath();
  for (let i = 0; i < L.n; i++) {
    const x = L.x[i] * k + dx;
    const y = L.y[i] * k + dy;
    ctx.moveTo(x + L.r[i] * k, y);
    ctx.arc(x, y, L.r[i] * k, 0, Math.PI * 2);
  }
}

/** Only the outward arc of each lobe: a scalloped outer contour without inner rings. */
function lobesOutline(ctx: Ctx, L: Lobes): void {
  ctx.beginPath();
  for (let i = 0; i < L.n; i++) {
    const a = L.a[i];
    if (Number.isNaN(a)) continue;
    const a0 = a - 1.25;
    const a1 = a + 1.25;
    ctx.moveTo(L.x[i] + Math.cos(a0) * L.r[i], L.y[i] + Math.sin(a0) * L.r[i]);
    ctx.arc(L.x[i], L.y[i], L.r[i], a0, a1);
  }
}

function crownColor(pal: Palette, r: Rng): string[] {
  if (pal.season === 2) {
    // Autumn trees turn at their own pace.
    const k = r.int(3);
    if (k === 0) return ['#ecc057', '#d99a3a', '#a8662a'];
    if (k === 1) return ['#e39a48', '#c9642e', '#8e3a22'];
    return ['#c9b65a', '#a8963e', '#76682e'];
  }
  return pal.crown;
}

function bareTree(ctx: Ctx, h: number, pal: Palette, px: number, r: Rng, alpha: number): void {
  const w = inkW(px, 1.1);
  const branch = (x: number, y: number, ang: number, len: number, depth: number, wid: number) => {
    const ex = x + Math.cos(ang) * len;
    const ey = y + Math.sin(ang) * len;
    taper(ctx, x, y, (x + ex) / 2 + r.jit(len * 0.15), (y + ey) / 2, ex, ey, wid, wid * 0.55);
    fill(ctx, pal.trunk, alpha);
    if (depth > 0) {
      const n = 2;
      for (let i = 0; i < n; i++) branch(ex, ey, ang + (i === 0 ? -0.5 : 0.45) + r.jit(0.25), len * (0.62 + r.next() * 0.12), depth - 1, wid * 0.6);
    }
  };
  // Trunk, then a fan of limbs.
  taper(ctx, 0, 0, r.jit(0.02), -h * 0.25, 0, -h * 0.45, 0.13, 0.08);
  fill(ctx, pal.trunk, alpha);
  ink(ctx, pal.ink, w * 0.8, 0.7 * alpha);
  branch(0, -h * 0.42, -Math.PI / 2 - 0.55, h * 0.24, 2, 0.06);
  branch(0, -h * 0.45, -Math.PI / 2 + 0.5, h * 0.26, 2, 0.06);
  branch(0, -h * 0.47, -Math.PI / 2 + r.jit(0.15), h * 0.3, 2, 0.065);
  // A cold haze where the leaves were.
  blob(ctx, 0, -h * 0.68, h * 0.3, h * 0.27, r, 0.1, 9);
  fill(ctx, pal.crown[1], 0.22 * alpha);
}

export function paintTree(ctx: Ctx, t: TreeSpec, pal: Palette, px: number): void {
  const r = new Rng(t.seed);
  const a = t.fade;
  const s = t.size;
  ctx.save();
  ctx.translate(t.x, t.y);
  if (a > 0.5) groundShadow(ctx, 0.12 * s, 0.02, 0.42 * s, 0.13 * s, pal.ink, px, r, a);
  const w = inkW(px, 1.15);

  if (t.kind === 'bush' && pal.bare) {
    // A winter hedge: a fan of bare twigs with a pale haze and a cap of snow.
    const rx = 0.42 * s;
    const ry = 0.3 * s;
    blob(ctx, 0, -ry * 0.9, rx * 0.95, ry * 0.85, r, 0.15, 9);
    fill(ctx, pal.crown[1], 0.3 * a);
    ctx.beginPath();
    for (let i = 0; i < 11; i++) {
      const ang = -Math.PI / 2 + (i / 10 - 0.5) * 2.4 + r.jit(0.1);
      const len = ry * (1.4 + r.next() * 0.6);
      const ex = Math.cos(ang) * len * 1.2;
      const ey = Math.sin(ang) * len;
      ctx.moveTo(r.jit(0.05), 0);
      ctx.quadraticCurveTo(ex * 0.5 + r.jit(0.04), ey * 0.5, ex, ey);
      ctx.moveTo(ex * 0.6, ey * 0.6);
      ctx.lineTo(ex * 0.6 + Math.cos(ang + 0.6) * 0.07, ey * 0.6 + Math.sin(ang + 0.6) * 0.07);
    }
    ink(ctx, pal.trunk, w * 1.1, 0.9 * a);
    ctx.beginPath();
    ctx.ellipse(r.jit(0.05), -ry * 1.55, rx * 0.7, ry * 0.22, 0, Math.PI, 0);
    fill(ctx, '#ffffff', 0.85 * a);
    ctx.restore();
    return;
  }

  if (t.kind === 'bush') {
    const cols = crownColor(pal, r);
    const rx = 0.42 * s;
    const ry = 0.3 * s;
    const cy = -ry * 0.9;
    const L = makeLobes(0, cy, rx, ry, r, 6);
    lobesPath(ctx, L);
    fill(ctx, pal.bare ? pal.crown[2] : cols[2], 0.92 * a);
    ctx.save();
    ctx.clip();
    lobesPath(ctx, makeLobes(-rx * 0.18, cy - ry * 0.22, rx * 0.8, ry * 0.72, r, 5));
    fill(ctx, pal.bare ? pal.crown[1] : cols[1], 0.9 * a);
    lobesPath(ctx, makeLobes(-rx * 0.32, cy - ry * 0.42, rx * 0.45, ry * 0.4, r, 4));
    fill(ctx, pal.bare ? pal.crown[0] : cols[0], 0.85 * a);
    hatch(ctx, 0, cy - ry, rx, ry * 0.2, -0.75, Math.max(px * 2.4, 0.04), w * 0.6, pal.ink, 0.5 * a, r);
    ctx.restore();
    lobesOutline(ctx, L);
    ink(ctx, pal.ink, w, 0.75 * Math.max(0.5, a));
    if (pal.frost) {
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const bx = r.range(-rx * 0.7, rx * 0.5);
        const by = cy - ry * r.range(0.55, 0.95);
        ctx.moveTo(bx - 0.08, by);
        ctx.quadraticCurveTo(bx, by - 0.04, bx + 0.08, by);
      }
      ink(ctx, '#ffffff', w * 1.6, 0.85 * a);
    }
    ctx.restore();
    return;
  }

  if (t.kind === 'pine') {
    const h = 1.75 * s;
    taper(ctx, 0, 0, 0, -0.1, 0, -0.28 * s, 0.1 * s, 0.07 * s);
    fill(ctx, pal.trunk, a);
    const tiers = 4;
    for (let i = 0; i < tiers; i++) {
      const k = i / (tiers - 1);
      const by = -0.2 * s - k * h * 0.62;
      const ty = by - h * 0.42;
      const hw = (0.48 - k * 0.3) * s;
      ctx.beginPath();
      ctx.moveTo(-hw, by);
      // Jagged boughs along the hem.
      const n = 5;
      for (let j = 1; j <= n; j++) {
        const x = -hw + (2 * hw * j) / n;
        ctx.lineTo(x - hw / n, by + 0.05 * s + r.jit(0.02));
        ctx.lineTo(x, by + r.jit(0.015));
      }
      ctx.lineTo(r.jit(0.02), ty);
      ctx.closePath();
      fill(ctx, i % 2 ? pal.conifer : pal.coniferDeep, 0.95 * a);
      ctx.save();
      ctx.clip();
      // Lit west side, hatched east side.
      ctx.beginPath();
      ctx.moveTo(-hw, by);
      ctx.lineTo(0, ty);
      ctx.lineTo(-hw * 0.1, by);
      ctx.closePath();
      fill(ctx, '#9cc08a', 0.28 * a);
      hatch(ctx, 0, ty, hw, by + 0.06, -0.8, Math.max(px * 2.4, 0.04), w * 0.6, pal.ink, 0.55 * a, r);
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(-hw, by);
      ctx.lineTo(r.jit(0.01), ty);
      ctx.lineTo(hw, by);
      ink(ctx, pal.ink, w, 0.8 * Math.max(0.5, a));
      if (pal.frost) {
        ctx.beginPath();
        ctx.moveTo(-hw * 0.85, by - 0.02);
        ctx.quadraticCurveTo(-hw * 0.3, by - h * 0.12, 0, ty + 0.03);
        ctx.quadraticCurveTo(hw * 0.2, by - h * 0.1, hw * 0.55, by - 0.02);
        ink(ctx, '#ffffff', w * 2.2, 0.9 * a);
      }
    }
    ctx.restore();
    return;
  }

  // Oak: trunk, a lumpy crown in three washes, hatched on the shady side.
  const h = 1.85 * s;
  if (pal.bare) {
    bareTree(ctx, h, pal, px, r, a);
    ctx.restore();
    return;
  }
  const cols = crownColor(pal, r);
  taper(ctx, 0, 0, r.jit(0.03), -h * 0.2, r.jit(0.03), -h * 0.48, 0.15 * s, 0.08 * s);
  fill(ctx, pal.trunk, a);
  ctx.save();
  ctx.clip();
  hatch(ctx, 0, -h * 0.5, 0.1 * s, 0, -0.9, Math.max(px * 2, 0.035), w * 0.6, pal.ink, 0.6 * a, r);
  ctx.restore();
  taper(ctx, 0, 0, r.jit(0.03), -h * 0.2, r.jit(0.03), -h * 0.48, 0.15 * s, 0.08 * s);
  ink(ctx, pal.ink, w * 0.85, 0.75 * a);

  const cy = -h * 0.64;
  const rx = 0.58 * s;
  const ry = 0.5 * s;
  const L = makeLobes(0, cy, rx, ry, r, 7);
  lobesPath(ctx, L);
  fill(ctx, cols[2], 0.95 * a);
  ctx.save();
  ctx.clip();
  lobesPath(ctx, makeLobes(-rx * 0.14, cy - ry * 0.16, rx * 0.84, ry * 0.8, r, 6));
  fill(ctx, cols[1], 0.92 * a);
  lobesPath(ctx, makeLobes(-rx * 0.3, cy - ry * 0.36, rx * 0.5, ry * 0.46, r, 5));
  fill(ctx, cols[0], 0.9 * a);
  // Shade on the south-east of the crown.
  ctx.beginPath();
  ctx.ellipse(rx * 0.35, cy + ry * 0.35, rx * 0.85, ry * 0.7, 0, 0, Math.PI * 2);
  ctx.save();
  ctx.clip();
  hatch(ctx, -rx * 0.5, cy - ry * 0.4, rx * 1.2, cy + ry * 1.1, -0.75, Math.max(px * 2.4, 0.045), w * 0.65, pal.ink, 0.5 * a, r);
  ctx.restore();
  // Little leaf ticks catch the light.
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const lx = r.range(-rx * 0.7, rx * 0.3);
    const ly = cy + r.range(-ry * 0.8, ry * 0.2);
    ctx.moveTo(lx, ly);
    ctx.quadraticCurveTo(lx + 0.03, ly - 0.04, lx + 0.07, ly - 0.01);
  }
  ink(ctx, pal.ink, w * 0.7, 0.45 * a);
  if (pal.season === 0 && r.chance(0.45)) {
    // Spring blossom.
    for (let i = 0; i < 14; i++) {
      const bx = r.range(-rx * 0.85, rx * 0.8);
      const by = cy + r.range(-ry * 0.85, ry * 0.75);
      ctx.beginPath();
      ctx.arc(bx, by, 0.028 * s + r.next() * 0.02, 0, Math.PI * 2);
      fill(ctx, pal.blossom[i % pal.blossom.length], 0.95 * a);
    }
  } else if (pal.season === 1 && r.chance(0.3)) {
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(r.range(-rx * 0.7, rx * 0.7), cy + r.range(-ry * 0.6, ry * 0.7), 0.035 * s, 0, Math.PI * 2);
      fill(ctx, '#c8463a', 0.9 * a);
    }
  }
  ctx.restore();
  lobesOutline(ctx, L);
  ink(ctx, pal.ink, w, 0.8 * Math.max(0.55, a));
  ctx.restore();
}
