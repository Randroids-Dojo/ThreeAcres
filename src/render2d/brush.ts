// Painting primitives. Everything works in tile units on a context that is
// already scaled so one unit is one tile; `px` is one device pixel in those
// units, so ink keeps a sensible weight at every zoom. These run when caches
// are built, not per frame, except the few small ones the actors use.

import type { Rng } from './rng';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Ink weight in tile units: printed lines thicken with zoom, but never below a pixel. */
export function inkW(px: number, k = 1): number {
  return Math.max(px * 0.9, 0.021 * k);
}

/** A closed, slightly irregular ellipse. */
export function blob(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, r: Rng, irr = 0.12, n = 9, rot = 0): void {
  const pts = n;
  const xs: number[] = [];
  const ys: number[] = [];
  const ph = r.next() * Math.PI * 2;
  for (let i = 0; i < pts; i++) {
    const a = ph + (i / pts) * Math.PI * 2;
    const k = 1 + r.jit(irr);
    const ex = Math.cos(a) * rx * k;
    const ey = Math.sin(a) * ry * k;
    xs.push(cx + ex * Math.cos(rot) - ey * Math.sin(rot));
    ys.push(cy + ex * Math.sin(rot) + ey * Math.cos(rot));
  }
  ctx.beginPath();
  const mx = (xs[pts - 1] + xs[0]) / 2;
  const my = (ys[pts - 1] + ys[0]) / 2;
  ctx.moveTo(mx, my);
  for (let i = 0; i < pts; i++) {
    const j = (i + 1) % pts;
    ctx.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[j]) / 2, (ys[i] + ys[j]) / 2);
  }
  ctx.closePath();
}

/** Watercolour fill of the current path: a flat wash with a darker pooled edge. */
export function wash(ctx: Ctx, color: string, alpha: number, edge: string | null, px: number, edgeAlpha = 0.5): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fill();
  if (edge) {
    ctx.globalAlpha = alpha * edgeAlpha;
    ctx.strokeStyle = edge;
    ctx.lineWidth = Math.max(px * 1.2, 0.02);
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Gouache: an opaque fill. */
export function fill(ctx: Ctx, color: string, alpha = 1): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Ink the current path. */
export function ink(ctx: Ctx, color: string, w: number, alpha = 1): void {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** A hand-drawn line: a gentle wobble through jittered midpoints. */
export function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, r: Rng, amp = 0.012): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const n = Math.max(1, Math.min(8, Math.round(len / 0.14)));
  const nx = -dy / (len || 1);
  const ny = dx / (len || 1);
  ctx.moveTo(x0 + r.jit(amp * 0.5), y0 + r.jit(amp * 0.5));
  let px = x0;
  let py = y0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const j = i === n ? 0 : r.jit(amp);
    const qx = x0 + dx * t + nx * j;
    const qy = y0 + dy * t + ny * j;
    ctx.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2);
    px = qx;
    py = qy;
  }
  ctx.lineTo(px + r.jit(amp * 0.5), py + r.jit(amp * 0.5));
}

/**
 * A tapered brush stroke along a quadratic curve from (x0, y0) through the
 * control point (cx, cy) to (x1, y1). Width goes from w0 to w1, swelling in
 * the middle by `belly`.
 */
export function taper(ctx: Ctx, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w0: number, w1: number, belly = 0): void {
  const n = 8;
  const lx: number[] = [];
  const ly: number[] = [];
  const rx: number[] = [];
  const ry: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
    const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
    const tx = 2 * u * (cx - x0) + 2 * t * (x1 - cx);
    const ty = 2 * u * (cy - y0) + 2 * t * (y1 - cy);
    const tl = Math.hypot(tx, ty) || 1;
    const w = (w0 + (w1 - w0) * t + belly * Math.sin(Math.PI * t)) / 2;
    lx.push(x - (ty / tl) * w);
    ly.push(y + (tx / tl) * w);
    rx.push(x + (ty / tl) * w);
    ry.push(y - (tx / tl) * w);
  }
  ctx.beginPath();
  ctx.moveTo(lx[0], ly[0]);
  for (let i = 1; i <= n; i++) ctx.lineTo(lx[i], ly[i]);
  for (let i = n; i >= 0; i--) ctx.lineTo(rx[i], ry[i]);
  ctx.closePath();
}

/** A pointed leaf from its base along an angle. curl bends the tip sideways. */
export function leaf(ctx: Ctx, x: number, y: number, len: number, wid: number, ang: number, curl = 0): void {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const tx = x + c * len - s * curl * len;
  const ty = y + s * len + c * curl * len;
  const mx = x + c * len * 0.45;
  const my = y + s * len * 0.45;
  const nx = -s * wid;
  const ny = c * wid;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(mx + nx * 1.25, my + ny * 1.25, tx, ty);
  ctx.quadraticCurveTo(mx - nx * 1.25, my - ny * 1.25, x, y);
  ctx.closePath();
}

/** A rounded leaf (radish, bean, sunflower): a fat teardrop. */
export function roundLeaf(ctx: Ctx, x: number, y: number, len: number, wid: number, ang: number): void {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const nx = -s * wid;
  const ny = c * wid;
  const ex = x + c * len;
  const ey = y + s * len;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x + c * len * 0.2 + nx * 1.1, y + s * len * 0.2 + ny * 1.1, ex + nx * 1.0, ey + ny * 1.0, ex, ey);
  ctx.bezierCurveTo(ex - nx * 1.0, ey - ny * 1.0, x + c * len * 0.2 - nx * 1.1, y + s * len * 0.2 - ny * 1.1, x, y);
  ctx.closePath();
}

/** The midrib of a leaf drawn with leaf(): a thin ink line from base towards the tip. */
export function midrib(ctx: Ctx, x: number, y: number, len: number, ang: number, curl: number, color: string, w: number, alpha = 0.7): void {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const tx = x + c * len * 0.85 - s * curl * len * 0.8;
  const ty = y + s * len * 0.85 + c * curl * len * 0.8;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + c * len * 0.45, y + s * len * 0.45, tx, ty);
  ink(ctx, color, w, alpha);
}

/**
 * Hatch inside the current clip with parallel strokes at an angle. Strokes are
 * broken and slightly wavering, like a pen nib. Call between save() and
 * restore() after clip().
 */
export function hatch(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, ang: number, gap: number, w: number, color: string, alpha: number, r: Rng): void {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const R = Math.hypot(x1 - x0, y1 - y0) / 2 + gap;
  ctx.beginPath();
  for (let d = -R; d <= R; d += gap) {
    const ox = cx - s * d;
    const oy = cy + c * d;
    let t = -R + r.next() * gap;
    while (t < R) {
      const seg = R * (0.5 + r.next() * 0.9);
      const t2 = Math.min(R, t + seg);
      const jy = r.jit(gap * 0.12);
      ctx.moveTo(ox + c * t - s * jy, oy + s * t + c * jy);
      ctx.lineTo(ox + c * t2 - s * jy * 0.5, oy + s * t2 + c * jy * 0.5);
      t = t2 + gap * (0.2 + r.next() * 0.6);
    }
  }
  ink(ctx, color, w, alpha);
}

/** Hatched shadow ellipse on the ground, offset away from the north-west light. */
export function groundShadow(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, ink: string, px: number, r: Rng, alpha = 1): void {
  ctx.save();
  blob(ctx, cx, cy, rx, ry, r, 0.08, 8);
  ctx.globalAlpha = 0.16 * alpha;
  ctx.fillStyle = ink;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.clip();
  const gap = Math.max(px * 2.6, 0.045);
  hatch(ctx, cx - rx, cy - ry, cx + rx, cy + ry, -0.7, gap, Math.max(px * 0.8, 0.012), ink, 0.45 * alpha, r);
  ctx.restore();
}

/** Small five-petal flower. */
export function flower(ctx: Ctx, x: number, y: number, rad: number, petal: string, eye: string, inkc: string, px: number, r: Rng): void {
  const ph = r.next() * 6.28;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = ph + (i / 5) * Math.PI * 2;
    ctx.moveTo(x + Math.cos(a) * rad * 0.2, y + Math.sin(a) * rad * 0.2);
    ctx.arc(x + Math.cos(a) * rad * 0.6, y + Math.sin(a) * rad * 0.6, rad * 0.45, 0, Math.PI * 2);
  }
  fill(ctx, petal);
  ink(ctx, inkc, Math.max(px * 0.7, rad * 0.12), 0.55);
  ctx.beginPath();
  ctx.arc(x, y, rad * 0.3, 0, Math.PI * 2);
  fill(ctx, eye);
}

/** A tuft of grass: a fan of tapered blades. */
export function tuft(ctx: Ctx, x: number, y: number, h: number, n: number, color: string, r: Rng, lean = 0, w = 0.02): void {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    const a = -Math.PI / 2 + t * 1.3 + lean + r.jit(0.15);
    const hh = h * (0.7 + r.next() * 0.45) * (1 - Math.abs(t) * 0.4);
    const bx = x + t * w * 2.5;
    const tx = bx + Math.cos(a) * hh;
    const ty = y + Math.sin(a) * hh;
    const mx = bx + Math.cos(a) * hh * 0.5 + r.jit(hh * 0.12);
    const my = y + Math.sin(a) * hh * 0.5;
    ctx.moveTo(bx - w * 0.5, y);
    ctx.quadraticCurveTo(mx, my, tx, ty);
    ctx.quadraticCurveTo(mx + w * 0.3, my, bx + w * 0.5, y);
  }
  ctx.fillStyle = color;
  ctx.fill();
}

/** Lettering in the almanac hand. */
export function letter(ctx: Ctx, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', italic = true, weight = 500): void {
  // Fonts misbehave at fractional pixel sizes, so letter at 100 px and scale.
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.font = `${italic ? 'italic ' : ''}${weight} 100px 'Fraunces Variable', 'Fraunces', Georgia, serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
