// Hand-painted canvas textures: the ranch signs, the Exchange's chalk board and
// the wooden tags that hang from posts as menus. Drawn once (or when their
// numbers change), never per frame.

import { CanvasTexture, SRGBColorSpace } from 'three';
import { hash2 } from '../noise';

export const SERIF = "'Fraunces Variable', Georgia, serif";

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

export function tex(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Weathered plank: warm wood with grain lines. */
export function plank(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base = '#b98a5c', seed = 1): void {
  g.save();
  g.fillStyle = base;
  g.fillRect(x, y, w, h);
  g.globalAlpha = 0.18;
  for (let i = 0; i < h / 3; i++) {
    const yy = y + i * 3 + hash2(i, 1, seed) * 2;
    g.strokeStyle = hash2(i, 2, seed) > 0.5 ? '#5e3f22' : '#f0d2a4';
    g.lineWidth = 0.8 + hash2(i, 3, seed) * 1.4;
    g.beginPath();
    g.moveTo(x, yy);
    for (let k = 0; k <= 8; k++) g.lineTo(x + (w * k) / 8, yy + Math.sin(k * 1.3 + i) * 1.2);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(60,38,18,0.55)';
  g.lineWidth = 3;
  g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  g.restore();
}

/** The draw glyph: a bellows nozzle with the wind curling into it and a downy riding in. */
export function drawGlyph(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string): void {
  g.save();
  g.translate(cx, cy);
  g.scale(s / 100, s / 100);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 7;
  // Nozzle on the right, mouth facing left.
  g.beginPath();
  g.moveTo(10, -14);
  g.lineTo(44, -26);
  g.lineTo(44, 26);
  g.lineTo(10, 14);
  g.closePath();
  g.stroke();
  // Wind lines curling in.
  for (const [y0, bend] of [
    [-30, -14],
    [0, 0],
    [30, 14],
  ]) {
    g.beginPath();
    g.moveTo(-46, y0);
    g.quadraticCurveTo(-20, y0 + bend * 0.2, 2, y0 * 0.25);
    g.stroke();
  }
  // Arrow heads.
  g.beginPath();
  g.moveTo(-6, -8);
  g.lineTo(4, 0);
  g.lineTo(-6, 8);
  g.stroke();
  // A downy riding the middle line.
  g.beginPath();
  g.arc(-30, 0, 9, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** The puff glyph: the nozzle facing right with a burst leaving it. */
export function puffGlyph(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string): void {
  g.save();
  g.translate(cx, cy);
  g.scale(s / 100, s / 100);
  g.strokeStyle = color;
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(-10, -14);
  g.lineTo(-44, -26);
  g.lineTo(-44, 26);
  g.lineTo(-10, 14);
  g.closePath();
  g.stroke();
  for (const a of [-0.6, -0.2, 0.2, 0.6]) {
    g.beginPath();
    g.moveTo(6 + Math.cos(a) * 8, Math.sin(a) * 18);
    g.lineTo(6 + Math.cos(a) * 34, Math.sin(a) * 40);
    g.stroke();
  }
  g.restore();
}

let atlasCache: { tex: CanvasTexture; uv: Record<string, [number, number, number, number]> } | null = null;

/** Sign atlas: the gate arch, the teaching sign, the fork signpost's arrows and the pad plates. */
export function signAtlas(): { tex: CanvasTexture; uv: Record<string, [number, number, number, number]> } {
  if (atlasCache) return atlasCache;
  const [c, g] = canvas(1024, 1024);
  // No transparent gaps: filtering would bleed black into the signs' edges.
  g.fillStyle = '#6f4a32';
  g.fillRect(0, 0, 1024, 1024);
  const uv: Record<string, [number, number, number, number]> = {};
  const region = (key: string, x: number, y: number, w: number, h: number) => {
    uv[key] = [x / 1024, 1 - (y + h) / 1024, w / 1024, h / 1024];
  };
  // Gate arch: carved lettering.
  plank(g, 0, 0, 1024, 180, '#a8794d', 3);
  g.fillStyle = '#f6ecd2';
  g.font = `600 108px ${SERIF}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('Thistledown', 512, 96);
  region('arch', 0, 0, 1024, 180);
  // Teaching sign: the draw glyph painted in cream on green.
  g.fillStyle = '#58744a';
  g.fillRect(0, 200, 400, 300);
  plank(g, 0, 200, 400, 300, '#5d7a4e', 7);
  drawGlyph(g, 200, 330, 190, '#f4ead0');
  g.font = `500 italic 40px ${SERIF}`;
  g.fillStyle = '#f4ead0';
  g.fillText('pull them in', 200, 455);
  region('teach', 0, 200, 400, 300);
  // Signpost arrows.
  const arrows: [string, string][] = [
    ['ridge', 'Ember Ridge'],
    ['hollow', 'Brook Hollow'],
    ['ranch', 'The ranch'],
    ['oak', 'Old oak'],
  ];
  const left = new Set(['ridge', 'ranch']);
  arrows.forEach(([k, label], i) => {
    const y = 520 + i * 120;
    const l = left.has(k);
    g.save();
    g.beginPath();
    if (l) {
      g.moveTo(60, y);
      g.lineTo(620, y);
      g.lineTo(620, y + 100);
      g.lineTo(60, y + 100);
      g.lineTo(0, y + 50);
    } else {
      g.moveTo(0, y);
      g.lineTo(560, y);
      g.lineTo(620, y + 50);
      g.lineTo(560, y + 100);
      g.lineTo(0, y + 100);
    }
    g.closePath();
    g.clip();
    plank(g, 0, y, 620, 100, ['#c08a5a', '#a87650', '#b88458', '#9c6e48'][i], 11 + i);
    g.restore();
    g.fillStyle = '#f6ecd2';
    g.font = `600 58px ${SERIF}`;
    g.textAlign = l ? 'right' : 'left';
    g.fillText(label, l ? 586 : 34, y + 54);
    region(k, 0, y, 620, 100);
  });
  // Pad post plates: blank, pen, garden, silo.
  const plates: [string, string][] = [
    ['plate-empty', 'Empty plot'],
    ['plate-pen', 'Pen'],
    ['plate-garden', 'Garden'],
    ['plate-silo', 'Silo'],
    ['plate-bench', 'Workbench'],
    ['plate-sell', 'Sell fluff'],
  ];
  plates.forEach(([k, label], i) => {
    const x = 640;
    const y = 200 + i * 110;
    plank(g, x, y, 380, 96, '#d9c49a', 21 + i);
    g.fillStyle = '#4a3420';
    g.font = `600 56px ${SERIF}`;
    g.textAlign = 'center';
    g.fillText(label, x + 190, y + 52);
    region(k, x, y, 380, 96);
  });
  atlasCache = { tex: tex(c), uv };
  return atlasCache;
}

// ---------------------------------------------------------------- the chalk board

export interface BoardRow {
  name: string;
  price: number | null;
  /** -1 down, 0 same, 1 up against yesterday. */
  trend: number;
}

/** A day's order chalked under the prices: "6 ember fluff by dusk", "pays double", and how it stands. */
export interface BoardOrder {
  text: string;
  pay: string;
  state: 'open' | 'filled' | 'missed';
}

function chalkText(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, seed: number, align: CanvasTextAlign = 'left'): void {
  g.font = `500 ${size}px ${SERIF}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  for (let i = 0; i < 4; i++) {
    g.globalAlpha = 0.22 + hash2(i, seed, 3) * 0.15;
    g.fillText(text, x + (hash2(i, seed, 1) - 0.5) * 2.4, y + (hash2(i, seed, 2) - 0.5) * 2.4);
  }
  g.globalAlpha = 1;
}

export function paintBoard(g: CanvasRenderingContext2D, w: number, h: number, day: number, rows: BoardRow[], orders: BoardOrder[] = []): void {
  g.fillStyle = '#2c3a33';
  g.fillRect(0, 0, w, h);
  // Old chalk ghosts.
  g.globalAlpha = 0.06;
  g.fillStyle = '#e8e4d8';
  for (let i = 0; i < 40; i++) {
    g.beginPath();
    g.ellipse(hash2(i, 1, 9) * w, hash2(i, 2, 9) * h, 20 + hash2(i, 3, 9) * 60, 6 + hash2(i, 4, 9) * 10, hash2(i, 5, 9) * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.fillStyle = '#f2eee2';
  g.strokeStyle = '#f2eee2';
  // With orders to chalk up, the prices sit closer together to leave them room below.
  const tight = orders.length > 0;
  chalkText(g, 'Fluff prices', w / 2, tight ? 36 : 46, tight ? 40 : 46, 1, 'center');
  chalkText(g, `day ${day}`, w - 24, tight ? 36 : 46, 24, 2, 'right');
  g.globalAlpha = 0.5;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(30, tight ? 62 : 80);
  g.lineTo(w - 30, tight ? 64 : 82);
  g.stroke();
  g.globalAlpha = 1;
  rows.forEach((r, i) => {
    const y = tight ? 88 + i * 40 : 122 + i * 62;
    const fs = tight ? 32 : 38;
    chalkText(g, r.name, 34, y, fs, 10 + i);
    if (r.price === null) {
      chalkText(g, '?', w - 120, y, fs, 20 + i, 'right');
      return;
    }
    chalkText(g, String(r.price), w - 100, y, tight ? 34 : 42, 20 + i, 'right');
    // Arrow: chalk strokes, up or down; a dash if steady.
    const ax = w - 62;
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.globalAlpha = 0.85;
    g.strokeStyle = r.trend > 0 ? '#bfe3a8' : r.trend < 0 ? '#f2b6a0' : '#f2eee2';
    g.beginPath();
    if (r.trend > 0) {
      g.moveTo(ax, y + 14);
      g.lineTo(ax, y - 14);
      g.moveTo(ax - 10, y - 4);
      g.lineTo(ax, y - 15);
      g.lineTo(ax + 10, y - 4);
    } else if (r.trend < 0) {
      g.moveTo(ax, y - 14);
      g.lineTo(ax, y + 14);
      g.moveTo(ax - 10, y + 4);
      g.lineTo(ax, y + 15);
      g.lineTo(ax + 10, y + 4);
    } else {
      g.moveTo(ax - 10, y);
      g.lineTo(ax + 10, y);
    }
    g.stroke();
    g.globalAlpha = 1;
  });
  if (!tight) {
    chalkText(g, 'blow fluff into the crate', w / 2, h - 30, 24, 40, 'center');
    return;
  }
  // The day's orders, under a second rule: what is wanted by dusk on the left, what it pays on the right.
  g.globalAlpha = 0.5;
  g.strokeStyle = '#f2eee2';
  g.beginPath();
  g.moveTo(30, 248);
  g.lineTo(w - 30, 246);
  g.stroke();
  g.globalAlpha = 1;
  orders.slice(0, 2).forEach((o, i) => {
    const y = orders.length === 1 ? 300 : 282 + i * 52;
    g.fillStyle = o.state === 'filled' ? '#bfe3a8' : '#f2eee2';
    g.globalAlpha = o.state === 'missed' ? 0.45 : 1;
    const right = o.state === 'filled' ? 'filled' : o.pay;
    // Both halves fit the board's width, the words shrinking a little if they must.
    let fs = 29;
    const width = (t: string, size: number) => {
      g.font = `500 ${size}px ${SERIF}`;
      return g.measureText(t).width;
    };
    for (; fs > 18 && width(o.text, fs) + width(right, fs - 4) + 24 > w - 58; fs--);
    chalkText(g, o.text, 30, y, fs, 50 + i);
    chalkText(g, right, w - 28, y, fs - 4, 60 + i, 'right');
    g.globalAlpha = 1;
    if (o.state !== 'open') {
      // Struck through in chalk.
      g.strokeStyle = o.state === 'filled' ? '#bfe3a8' : '#f2eee2';
      g.globalAlpha = 0.7;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(28, y + 2);
      g.lineTo(32 + width(o.text, fs), y);
      g.stroke();
      g.globalAlpha = 1;
    }
    g.fillStyle = '#f2eee2';
    g.strokeStyle = '#f2eee2';
  });
}

// ---------------------------------------------------------------- hanging tags

/** How a tag's words are set: sizes, the note's lines, and whether everything fits inside the tag. */
export interface TagLayout {
  titleSize: number;
  /** Prices of four figures and more are set a little smaller, so the title keeps its room. */
  priceSize: number;
  noteSize: number;
  noteLines: string[];
  fits: boolean;
}

const PAD = 22;

/**
 * Fit a tag's words to the tag: the title shrinks to clear the price, the note
 * shrinks and then wraps onto a second line. Nothing is drawn past the edges.
 */
export function layoutTag(g: CanvasRenderingContext2D, w: number, title: string, price: number | null, note: string): TagLayout {
  let priceW = 0;
  const pt = price !== null ? price.toLocaleString('en-US') : '';
  const priceSize = pt.length > 3 ? 34 : 42;
  if (pt) {
    g.font = `700 ${priceSize}px ${SERIF}`;
    priceW = g.measureText(pt).width + 14;
  }
  const room = w - PAD * 2;
  let titleSize = 40;
  for (; titleSize > 22; titleSize -= 2) {
    g.font = `650 ${titleSize}px ${SERIF}`;
    if (g.measureText(title).width <= room - priceW) break;
  }
  g.font = `650 ${titleSize}px ${SERIF}`;
  let fits = g.measureText(title).width <= room - priceW;
  let noteSize = 24;
  let noteLines = note ? [note] : [];
  if (note) {
    const width = (t: string, size: number) => {
      g.font = `italic 400 ${size}px ${SERIF}`;
      return g.measureText(t).width;
    };
    for (; noteSize > 19 && width(note, noteSize) > room; noteSize -= 1);
    if (width(note, noteSize) > room) {
      // Two lines, split at the space that best balances them.
      const words = note.split(' ');
      let best: string[] = [note];
      let bestW = Infinity;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' ');
        const b = words.slice(i).join(' ');
        const m = Math.max(width(a, 21), width(b, 21));
        if (m < bestW) {
          bestW = m;
          best = [a, b];
        }
      }
      noteLines = best;
      for (noteSize = 21; noteSize > 16 && Math.max(...noteLines.map((t) => width(t, noteSize))) > room; noteSize -= 1);
    }
    fits = fits && Math.max(...noteLines.map((t) => width(t, noteSize))) <= room;
  }
  return { titleSize, priceSize, noteSize, noteLines, fits };
}

export function paintTag(g: CanvasRenderingContext2D, w: number, h: number, title: string, price: number | null, note: string, ok: boolean, hot: boolean, seed: number): void {
  g.clearRect(0, 0, w, h);
  // Tag shape: a plank with clipped top corners and a twine hole.
  g.save();
  g.beginPath();
  g.moveTo(26, 0);
  g.lineTo(w - 26, 0);
  g.lineTo(w, 26);
  g.lineTo(w, h);
  g.lineTo(0, h);
  g.lineTo(0, 26);
  g.closePath();
  g.clip();
  // The chosen tag is plainly chosen: a paler plank and a heavy inked border (it also swings towards you).
  plank(g, 0, 0, w, h, hot ? '#f1dcae' : '#cfae7c', seed);
  g.restore();
  g.fillStyle = '#3b2814';
  g.beginPath();
  g.arc(w / 2, 18, 8, 0, Math.PI * 2);
  g.fill();
  const lay = layoutTag(g, w, title, price, note);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = ok ? '#2f2012' : 'rgba(47,32,18,0.55)';
  g.font = `650 ${lay.titleSize}px ${SERIF}`;
  g.fillText(title, PAD, 78);
  if (lay.noteLines.length) {
    g.font = `italic 400 ${lay.noteSize}px ${SERIF}`;
    g.fillStyle = ok ? 'rgba(47,32,18,0.8)' : 'rgba(47,32,18,0.5)';
    const step = lay.noteSize + 4;
    lay.noteLines.forEach((t, i) => g.fillText(t, PAD, h - 22 - (lay.noteLines.length - 1 - i) * step));
  }
  if (price !== null) {
    g.textAlign = 'right';
    g.font = `700 ${lay.priceSize}px ${SERIF}`;
    g.fillStyle = ok ? '#2f2012' : '#8e3a26';
    g.fillText(price.toLocaleString('en-US'), w - PAD, 78);
  }
  if (hot) {
    g.strokeStyle = '#2f2012';
    g.lineWidth = 9;
    g.strokeRect(6, 31, w - 12, h - 37);
  }
}
