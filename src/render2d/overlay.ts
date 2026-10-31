// What sits on top of the painting so the farm can be read and played: the
// soil readout, quality pips, queued job flags, the aimed tile and its verb.
// Drawn after the light so they stay legible at night. Tile units throughout.

import type { Verb, WorldState } from '../sim/types';
import type { Ctx } from './brush';
import { SHIRTS, VERB_COLOR } from './palette';

const RED = '#c0392b';
const PAPER = '#f7efd9';

/** A small verb icon centred on (x, y), about `s` tiles across. */
export function verbIcon(ctx: Ctx, verb: Verb, x: number, y: number, s: number, ink: string, lw: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineWidth = lw / s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink;
  ctx.beginPath();
  switch (verb) {
    case 'till':
      ctx.moveTo(-0.32, 0.36);
      ctx.lineTo(0.22, -0.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0.12, -0.38);
      ctx.lineTo(0.42, -0.08);
      ctx.lineTo(0.3, 0.0);
      ctx.closePath();
      ctx.fillStyle = '#8a8f96';
      ctx.fill();
      ctx.stroke();
      break;
    case 'water':
      ctx.rect(-0.34, -0.1, 0.42, 0.36);
      ctx.fillStyle = '#6f9aa8';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0.08, 0.0);
      ctx.lineTo(0.38, -0.24);
      ctx.moveTo(-0.3, -0.1);
      ctx.quadraticCurveTo(-0.13, -0.42, 0.04, -0.1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0.4, -0.08);
      ctx.quadraticCurveTo(0.48, 0.06, 0.4, 0.12);
      ctx.quadraticCurveTo(0.32, 0.06, 0.4, -0.08);
      ctx.fillStyle = '#4f9ad8';
      ctx.fill();
      break;
    case 'plant':
      ctx.moveTo(0, 0.38);
      ctx.lineTo(0, -0.05);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0.0);
      ctx.quadraticCurveTo(-0.38, -0.05, -0.34, -0.36);
      ctx.quadraticCurveTo(-0.02, -0.3, 0, 0.0);
      ctx.moveTo(0, -0.05);
      ctx.quadraticCurveTo(0.32, -0.1, 0.3, -0.38);
      ctx.quadraticCurveTo(0.04, -0.34, 0, -0.05);
      ctx.fillStyle = '#6fa848';
      ctx.fill();
      ctx.stroke();
      break;
    case 'harvest':
      ctx.moveTo(-0.4, -0.02);
      ctx.lineTo(0.4, -0.02);
      ctx.lineTo(0.3, 0.36);
      ctx.lineTo(-0.3, 0.36);
      ctx.closePath();
      ctx.fillStyle = '#c99a62';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -0.02, 0.3, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-0.12, -0.1, 0.12, 0, Math.PI * 2);
      ctx.fillStyle = '#d9465f';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0.13, -0.1, 0.11, 0, Math.PI * 2);
      ctx.fillStyle = '#ee8a2b';
      ctx.fill();
      break;
    case 'tend':
      ctx.ellipse(0, 0.04, 0.22, 0.28, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#c84a3a';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -0.24);
      ctx.lineTo(0, 0.32);
      ctx.moveTo(-0.22, -0.08);
      ctx.lineTo(-0.4, -0.18);
      ctx.moveTo(0.22, -0.08);
      ctx.lineTo(0.4, -0.18);
      ctx.moveTo(-0.22, 0.14);
      ctx.lineTo(-0.4, 0.2);
      ctx.moveTo(0.22, 0.14);
      ctx.lineTo(0.4, 0.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-0.09, -0.02, 0.05, 0, Math.PI * 2);
      ctx.arc(0.09, 0.12, 0.05, 0, Math.PI * 2);
      ctx.fillStyle = ink;
      ctx.fill();
      break;
    case 'clear':
      ctx.arc(0.04, -0.06, 0.3, -2.6, 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-0.22, 0.12);
      ctx.lineTo(-0.38, 0.38);
      ctx.lineWidth = (lw * 1.8) / s;
      ctx.strokeStyle = '#8a6238';
      ctx.stroke();
      break;
    case 'build':
      ctx.moveTo(-0.3, 0.38);
      ctx.lineTo(0.12, -0.12);
      ctx.lineWidth = (lw * 1.6) / s;
      ctx.strokeStyle = '#8a6238';
      ctx.stroke();
      ctx.lineWidth = lw / s;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.moveTo(-0.06, -0.3);
      ctx.lineTo(0.38, 0.06);
      ctx.lineTo(0.26, 0.2);
      ctx.lineTo(-0.18, -0.16);
      ctx.closePath();
      ctx.fillStyle = '#7a7f86';
      ctx.fill();
      ctx.stroke();
      break;
    case 'scare':
      // A crow taking off, with motion lines.
      ctx.moveTo(-0.36, 0.1);
      ctx.quadraticCurveTo(-0.1, -0.4, 0.0, 0.0);
      ctx.quadraticCurveTo(0.1, -0.4, 0.36, 0.1);
      ctx.quadraticCurveTo(0.0, -0.05, -0.36, 0.1);
      ctx.fillStyle = '#262a36';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-0.3, 0.3);
      ctx.lineTo(0.3, 0.3);
      ctx.moveTo(-0.18, 0.42);
      ctx.lineTo(0.18, 0.42);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/** Corner brackets round a tile, like a printer's crop marks. */
function brackets(ctx: Ctx, x: number, y: number, inset: number, len: number, col: string, lw: number): void {
  const x0 = x + inset;
  const y0 = y + inset;
  const x1 = x + 1 - inset;
  const y1 = y + 1 - inset;
  ctx.beginPath();
  ctx.moveTo(x0, y0 + len);
  ctx.lineTo(x0, y0);
  ctx.lineTo(x0 + len, y0);
  ctx.moveTo(x1 - len, y0);
  ctx.lineTo(x1, y0);
  ctx.lineTo(x1, y0 + len);
  ctx.moveTo(x1, y1 - len);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1 - len, y1);
  ctx.moveTo(x0 + len, y1);
  ctx.lineTo(x0, y1);
  ctx.lineTo(x0, y1 - len);
  ctx.strokeStyle = col;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

export interface OverlayStyle {
  ink: string;
  px: number;
  t: number;
  /** CSS px per tile, to pick how much detail fits. */
  tilePx: number;
  /** 0 day, 1 night: overlay ink lightens in the dark. */
  dark: number;
}

export function drawHighlight(ctx: Ctx, x: number, y: number, verb: Verb | null, ok: boolean, st: OverlayStyle, shake: number): void {
  const breathe = Math.sin(st.t * 4) * 0.018;
  const lw = Math.max(st.px * 2.2, 0.05);
  const col = !ok ? RED : st.dark > 0.5 ? '#f7efd9' : st.ink;
  const sx = shake ? Math.sin(st.t * 60) * 0.05 * shake : 0;
  ctx.save();
  ctx.translate(sx, 0);
  // A pale wash so the aimed tile lifts off the page.
  ctx.beginPath();
  ctx.rect(x + 0.04, y + 0.04, 0.92, 0.92);
  ctx.fillStyle = ok ? 'rgba(255,250,232,0.22)' : 'rgba(192,57,43,0.2)';
  ctx.fill();
  brackets(ctx, x, y, 0.03 - breathe, 0.26, ok || st.dark > 0.5 ? PAPER : '#f7d9d0', lw * 2.2);
  brackets(ctx, x, y, 0.03 - breathe, 0.26, col, lw);
  if (verb) {
    // The verb, in a paper medallion above the tile's corner.
    const mx = x + 0.86;
    const my = y + 0.02 + Math.sin(st.t * 3) * 0.02;
    const r = st.tilePx < 34 ? 0.3 : 0.22;
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fillStyle = ok ? PAPER : '#f7d9d0';
    ctx.fill();
    ctx.lineWidth = lw * 0.8;
    ctx.strokeStyle = ok ? st.ink : RED;
    ctx.stroke();
    verbIcon(ctx, verb, mx, my, r * 1.25, ok ? st.ink : RED, Math.max(st.px * 1.2, 0.022));
  }
  ctx.restore();
}

/** Queued jobs: a chalk ring on the soil and a pennant in the verb's colour. */
export function drawJobs(ctx: Ctx, s: Readonly<WorldState>, st: OverlayStyle): void {
  const lw = Math.max(st.px * 1.6, 0.035);
  for (let ji = 0; ji < s.jobs.length; ji++) {
    const j = s.jobs[ji];
    let tint = -1;
    if (j.claimedBy !== null) {
      for (let ai = 0; ai < s.actors.length; ai++) {
        const a = s.actors[ai];
        if (a.id === j.claimedBy) tint = a.role === 'hand' ? a.tint : 6;
      }
    }
    const claimed = j.claimedBy !== null;
    ctx.globalAlpha = claimed ? 1 : 0.6;
    const x = j.x;
    const y = j.y;
    // Chalk ring, dashed by hand.
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2 + 0.2;
      ctx.moveTo(x + 0.5 + Math.cos(a0) * 0.36, y + 0.62 + Math.sin(a0) * 0.2);
      ctx.ellipse(x + 0.5, y + 0.62, 0.36, 0.2, 0, a0, a0 + 0.75);
    }
    ctx.strokeStyle = 'rgba(255,253,245,0.9)';
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.stroke();
    // Pennant on a stake at the tile's corner.
    const fx = x + 0.16;
    const fy = y + 0.74;
    const wave = Math.sin(st.t * 3 + x + y) * 0.03;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx, fy - 0.62);
    ctx.strokeStyle = st.ink;
    ctx.lineWidth = Math.max(st.px * 1.4, 0.03);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(fx, fy - 0.62);
    ctx.lineTo(fx + 0.34, fy - 0.53 + wave);
    ctx.lineTo(fx, fy - 0.42);
    ctx.closePath();
    ctx.fillStyle = VERB_COLOR[j.verb];
    ctx.fill();
    ctx.lineWidth = Math.max(st.px, 0.02);
    ctx.stroke();
    if (claimed && tint >= 0) {
      // Whoever has taken the job: a knot of their shirt colour on the stake.
      ctx.beginPath();
      ctx.arc(fx, fy - 0.36, 0.055, 0, Math.PI * 2);
      ctx.fillStyle = tint === 6 ? '#3f62a6' : SHIRTS[tint % SHIRTS.length];
      ctx.fill();
      ctx.stroke();
    }
    if (st.tilePx >= 30) verbIcon(ctx, j.verb, x + 0.5, y + 0.6, 0.3, st.ink, Math.max(st.px * 1.1, 0.02));
  }
  ctx.globalAlpha = 1;
}

/** Quality pip at a crop's shoulder: silver, gold, or a gold star. */
export function drawPip(ctx: Ctx, x: number, y: number, q: number, st: OverlayStyle): void {
  if (q <= 0) return;
  const r = st.tilePx < 34 ? 0.13 : 0.1;
  ctx.beginPath();
  if (q >= 3) {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const rr = i % 2 ? r * 0.5 : r * 1.25;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.lineWidth = Math.max(st.px * 3.2, 0.06);
  ctx.strokeStyle = PAPER;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fillStyle = q === 1 ? '#c9d1d8' : '#f0bf3a';
  ctx.fill();
  ctx.lineWidth = Math.max(st.px * 1.1, 0.02);
  ctx.strokeStyle = st.ink;
  ctx.stroke();
  if (q < 3) {
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();
  }
}

/**
 * Soil readout for one tilled plot: moisture as three drops, filled to the
 * level, and nutrient as three cells from spent brown to rich green, on a
 * slim strip of paper along the bottom of the tile. Small tiles get bigger,
 * simpler marks.
 */
export function drawSoil(ctx: Ctx, x: number, y: number, m: number, n: number, st: OverlayStyle): void {
  const lw = Math.max(st.px * 0.9, 0.016);
  const small = st.tilePx < 34;
  const h = small ? 0.27 : 0.2;
  const y0 = y + 0.98 - h;
  ctx.beginPath();
  ctx.moveTo(x + 0.08, y0);
  ctx.lineTo(x + 0.92, y0);
  ctx.quadraticCurveTo(x + 0.96, y0 + h / 2, x + 0.92, y0 + h);
  ctx.lineTo(x + 0.08, y0 + h);
  ctx.quadraticCurveTo(x + 0.04, y0 + h / 2, x + 0.08, y0);
  ctx.fillStyle = 'rgba(250,244,226,0.82)';
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = 'rgba(58,45,32,0.45)';
  ctx.stroke();
  const cy = y0 + h * 0.55;
  const r = small ? 0.06 : 0.045;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const cx = x + 0.17 + i * (small ? 0.13 : 0.12);
    ctx.moveTo(cx, cy - r * 1.9);
    ctx.quadraticCurveTo(cx + r * 1.25, cy - r * 0.15, cx, cy + r);
    ctx.quadraticCurveTo(cx - r * 1.25, cy - r * 0.15, cx, cy - r * 1.9);
  }
  ctx.strokeStyle = '#2a5a8a';
  ctx.lineWidth = lw;
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < m; i++) {
    const cx = x + 0.17 + i * (small ? 0.13 : 0.12);
    ctx.moveTo(cx, cy - r * 1.9);
    ctx.quadraticCurveTo(cx + r * 1.25, cy - r * 0.15, cx, cy + r);
    ctx.quadraticCurveTo(cx - r * 1.25, cy - r * 0.15, cx, cy - r * 1.9);
  }
  ctx.fillStyle = '#3f86c8';
  ctx.fill();
  const cw = small ? 0.1 : 0.085;
  for (let i = 0; i < 3; i++) {
    const cx = x + 0.55 + i * (cw + 0.03);
    ctx.beginPath();
    ctx.rect(cx, y0 + h * 0.24, cw, h * 0.56);
    ctx.fillStyle = i < n ? (n >= 2 ? '#4f9a3a' : n === 1 ? '#a8963e' : '#8a6a42') : 'rgba(122,90,58,0.12)';
    ctx.fill();
    ctx.strokeStyle = '#4a3a24';
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

/** Floating words: coin amounts and the crows' caw. */
export function drawWord(ctx: Ctx, text: string, x: number, y: number, size: number, col: string, alpha: number, ink: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.font = "italic 700 100px 'Fraunces Variable', 'Fraunces', Georgia, serif";
  ctx.textAlign = 'center';
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 16;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PAPER;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = col;
  ctx.fillText(text, 0, 0);
  ctx.lineWidth = 3;
  ctx.strokeStyle = ink;
  ctx.strokeText(text, 0, 0);
  ctx.restore();
}
