// The table's picture vocabulary. Rules are shown, not told: a basket is
// yield, a red flower is bloom, a moon is a night, a scoop is what a card
// costs, and a little cross of plots means "the plots next to it". Card faces,
// the board's previews and the score slips all draw from here, so a "+2" with
// a basket means the same thing everywhere.

import { fill, ink, type Ctx } from '../../../render2d/brush';
import { PALETTES } from '../../../render2d/palette';
import { CARDS, TUNING, type CardId, type SeedId } from '../rules';
import { paintScoop } from './art';
import { paintSeedProduce } from './crops';
import { paintGlyph } from './glyphs';

export const INK = '#2e2418';
export const BLOOM = '#b02a44';
export const YIELD = '#2e2418';
const SERIF = "'Fraunces Variable', 'Fraunces', Georgia, serif";
const pal = PALETTES[1];

/** A wicker basket: yield. Centred on (x, y), s across. */
export function basket(g: Ctx, x: number, y: number, s: number, col = INK): void {
  g.save();
  g.translate(x, y);
  g.scale(s / 20, s / 20);
  // Handle.
  g.beginPath();
  g.arc(0, -1, 7, Math.PI * 1.05, Math.PI * 1.95);
  g.strokeStyle = col;
  g.lineWidth = 1.8;
  g.stroke();
  // Body.
  g.beginPath();
  g.moveTo(-9, -2);
  g.lineTo(9, -2);
  g.lineTo(6.5, 8);
  g.lineTo(-6.5, 8);
  g.closePath();
  fill(g, '#c8955a');
  ink(g, col, 1.5, 1);
  g.beginPath();
  for (const yy of [1.5, 4.8]) {
    g.moveTo(-8 + (yy + 2) * 0.25, yy);
    g.lineTo(8 - (yy + 2) * 0.25, yy);
  }
  for (const xx of [-3.5, 0, 3.5]) {
    g.moveTo(xx, -2);
    g.lineTo(xx * 0.8, 8);
  }
  ink(g, col, 0.8, 0.8);
  g.restore();
}

/** A small aphid: pests. Centred on (x, y), r across its body. */
export function bug(g: Ctx, x: number, y: number, r: number): void {
  g.save();
  g.translate(x, y);
  g.strokeStyle = '#2a3010';
  g.lineWidth = Math.max(0.8, r * 0.14);
  g.beginPath();
  for (const k of [-1, 0, 1]) {
    g.moveTo(k * r * 0.35, -r * 0.1);
    g.lineTo(k * r * 0.6 - r * 0.5, r * 0.55);
    g.moveTo(k * r * 0.35, -r * 0.1);
    g.lineTo(k * r * 0.6 + r * 0.5, r * 0.55);
  }
  g.stroke();
  g.beginPath();
  g.ellipse(0, 0, r * 0.62, r * 0.46, 0, 0, Math.PI * 2);
  g.fillStyle = '#a8c832';
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(-r * 0.55, -r * 0.1, r * 0.26, 0, Math.PI * 2);
  g.fillStyle = '#4a5a14';
  g.fill();
  g.restore();
}

/** A five-petalled flower in bloom red: bloom. */
export function bloom(g: Ctx, x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y);
  const r = s / 2;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
    g.beginPath();
    g.ellipse(Math.cos(a) * r * 0.48, Math.sin(a) * r * 0.48, r * 0.46, r * 0.32, a, 0, Math.PI * 2);
    fill(g, BLOOM);
  }
  g.beginPath();
  g.arc(0, 0, r * 0.28, 0, Math.PI * 2);
  fill(g, '#f2c64a');
  g.restore();
}

/** A crescent moon: a night. */
export function moon(g: Ctx, x: number, y: number, r: number, col = '#3a4a78'): void {
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.clip();
  // The disc less a smaller disc to its upper right: a fat crescent that reads as a moon at any size.
  g.beginPath();
  g.rect(x - r, y - r, r * 2, r * 2);
  g.arc(x + r * 0.58, y - r * 0.28, r * 0.74, 0, Math.PI * 2);
  g.fillStyle = col;
  g.fill('evenodd');
  g.restore();
}

/** A seed scoop: cost. Centred on (x, y), w wide (the drawing is 4 by 3). */
export function scoop(g: Ctx, x: number, y: number, w: number, full = true): void {
  g.save();
  g.translate(x - w / 2, y - (w * 0.75) / 2);
  g.scale(w / 120, w / 120);
  paintScoop(g as CanvasRenderingContext2D, full, 1.6);
  g.restore();
}

/** A produce picture for a seed, about s across. */
export function produce(g: Ctx, kind: SeedId, x: number, y: number, s: number, px: number): void {
  g.save();
  g.translate(x, y);
  const k = s / 0.42;
  g.scale(k, k);
  paintSeedProduce(g, kind, pal, px / k);
  g.restore();
}

/** A tall stalk with an arrow up: a tall crop (sunflower or corn). */
export function tall(g: Ctx, x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y);
  g.scale(s / 20, s / 20);
  g.beginPath();
  g.moveTo(0, 9);
  g.lineTo(0, -6);
  ink(g, '#4f7a2c', 2, 1);
  for (const [yy, d] of [[4, -1], [0, 1], [-4, -1]] as const) {
    g.beginPath();
    g.ellipse(d * 3.2, yy, 3.4, 1.4, d * 0.5, 0, Math.PI * 2);
    fill(g, '#6a9a3a');
  }
  g.beginPath();
  g.moveTo(-4, -5);
  g.lineTo(0, -10);
  g.lineTo(4, -5);
  ink(g, INK, 1.6, 1);
  g.restore();
}

/** A looping arrow: picks again on later nights. */
export function loop(g: Ctx, x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y);
  g.scale(s / 20, s / 20);
  g.beginPath();
  g.arc(0, 0, 6.5, -Math.PI * 0.35, Math.PI * 1.4);
  ink(g, INK, 1.8, 1);
  const a = -Math.PI * 0.35;
  const ex = Math.cos(a) * 6.5;
  const ey = Math.sin(a) * 6.5;
  g.beginPath();
  g.moveTo(ex - 3.6, ey - 1.4);
  g.lineTo(ex + 0.6, ey + 0.4);
  g.lineTo(ex - 1.2, ey + 4.2);
  ink(g, INK, 1.8, 1);
  g.restore();
}

export type Diagram = 'next' | 'alone' | 'spread' | 'guard' | 'row' | 'rowcol' | 'all' | 'area' | 'one' | 'move' | 'moveany' | 'scare' | 'below';

/**
 * A little map of plots, s across, centred on (x, y): the crop in the middle
 * (dark), the plots a rule reaches (lit). 'next' is the four neighbours,
 * 'area' the 3 by 3, 'row' a row, 'all' the whole plot.
 */
export function diagram(g: Ctx, kind: Diagram, x: number, y: number, s: number, lit = '#e9c46a'): void {
  const n = kind === 'row' || kind === 'rowcol' || kind === 'all' ? 4 : 3;
  const c = s / n;
  const x0 = x - s / 2;
  const y0 = y - s / 2;
  const mid = kind === 'row' || kind === 'rowcol' || kind === 'all' ? -1 : 1;
  for (let r = 0; r < n; r++) {
    for (let k = 0; k < n; k++) {
      const edge = Math.abs(r - mid) + Math.abs(k - mid) === 1;
      const centre = r === mid && k === mid;
      let on = false;
      if (kind === 'next' || kind === 'spread' || kind === 'guard') on = edge;
      else if (kind === 'below') on = r === 2 && k === 1;
      else if (kind === 'area' || kind === 'scare') on = !centre;
      else if (kind === 'row') on = r === 1;
      else if (kind === 'rowcol') on = r === 1 || k === 1;
      else if (kind === 'all') on = true;
      else if (kind === 'one') on = centre;
      else if (kind === 'move' || kind === 'moveany') on = r === 1 && k === 2;
      if (kind === 'one' && !centre) continue;
      if ((kind === 'move' || kind === 'moveany') && r !== 1) continue;
      g.beginPath();
      g.rect(x0 + k * c + c * 0.08, y0 + r * c + c * 0.08, c * 0.84, c * 0.84);
      fill(g, centre && kind !== 'one' ? '#6a4a2a' : on ? lit : '#efe6cc');
      ink(g, INK, Math.max(0.5, c * 0.07), 0.85);
    }
  }
  const cx = (k: number) => x0 + (k + 0.5) * c;
  const cy = (r: number) => y0 + (r + 0.5) * c;
  if (kind === 'alone') {
    // Nothing next to it: the neighbours crossed out.
    g.beginPath();
    for (const [r, k] of [[0, 1], [1, 0], [1, 2], [2, 1]]) {
      g.moveTo(cx(k) - c * 0.22, cy(r) - c * 0.22);
      g.lineTo(cx(k) + c * 0.22, cy(r) + c * 0.22);
      g.moveTo(cx(k) + c * 0.22, cy(r) - c * 0.22);
      g.lineTo(cx(k) - c * 0.22, cy(r) + c * 0.22);
    }
    ink(g, BLOOM, Math.max(0.6, c * 0.12), 1);
  }
  if (kind === 'spread') {
    // Arrows out from the middle.
    g.beginPath();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      g.moveTo(cx(1) + dx * c * 0.45, cy(1) + dy * c * 0.45);
      g.lineTo(cx(1) + dx * c * 0.95, cy(1) + dy * c * 0.95);
    }
    ink(g, '#2f7a4a', Math.max(0.6, c * 0.14), 1);
  }
  if (kind === 'move' || kind === 'moveany') {
    g.beginPath();
    g.moveTo(cx(1) - c * 0.1, cy(1));
    g.lineTo(cx(2) - c * 0.1, cy(1));
    g.moveTo(cx(2) - c * 0.35, cy(1) - c * 0.22);
    g.lineTo(cx(2) - c * 0.08, cy(1));
    g.lineTo(cx(2) - c * 0.35, cy(1) + c * 0.22);
    ink(g, '#f6eed6', Math.max(0.7, c * 0.13), 1);
  }
  if (kind === 'guard' || kind === 'scare') {
    // A red bar across the centre: kept off.
    g.beginPath();
    g.arc(cx(1), cy(1), c * 0.38, 0, Math.PI * 2);
    g.moveTo(cx(1) - c * 0.27, cy(1) + c * 0.27);
    g.lineTo(cx(1) + c * 0.27, cy(1) - c * 0.27);
    ink(g, BLOOM, Math.max(0.6, c * 0.12), 1);
  }
}

/** A crow, side on and facing left, s across, centred on (x, y). With `kept`, a red ring and bar over it: crows kept off. */
export function crow(g: Ctx, x: number, y: number, s: number, kept = false): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#1c1a22';
  // Tail, body, head.
  g.beginPath();
  g.moveTo(s * 0.12, -s * 0.02);
  g.lineTo(s * 0.5, s * 0.16);
  g.lineTo(s * 0.44, s * 0.24);
  g.lineTo(s * 0.06, s * 0.12);
  g.closePath();
  g.fill();
  g.beginPath();
  g.ellipse(-s * 0.06, s * 0.04, s * 0.26, s * 0.16, -0.2, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(-s * 0.28, -s * 0.12, s * 0.11, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(-s * 0.36, -s * 0.16);
  g.lineTo(-s * 0.52, -s * 0.1);
  g.lineTo(-s * 0.36, -s * 0.07);
  g.closePath();
  g.fillStyle = '#5a5046';
  g.fill();
  // Legs.
  g.beginPath();
  g.moveTo(-s * 0.08, s * 0.18);
  g.lineTo(-s * 0.1, s * 0.32);
  g.moveTo(s * 0.02, s * 0.18);
  g.lineTo(s * 0.02, s * 0.32);
  ink(g, '#1c1a22', Math.max(0.6, s * 0.04), 1);
  if (kept) {
    g.beginPath();
    g.arc(0, s * 0.04, s * 0.46, 0, Math.PI * 2);
    g.moveTo(-s * 0.33, s * 0.37);
    g.lineTo(s * 0.33, -s * 0.29);
    ink(g, BLOOM, Math.max(0.8, s * 0.09), 1);
  }
  g.restore();
}

/** A pest in a red ring with a bar across it: pests kept off, or cleared. s across, centred on (x, y). */
export function noBug(g: Ctx, x: number, y: number, s: number): void {
  bug(g, x, y + s * 0.02, s * 0.5);
  g.save();
  g.beginPath();
  g.arc(x, y, s * 0.44, 0, Math.PI * 2);
  g.moveTo(x - s * 0.31, y + s * 0.31);
  g.lineTo(x + s * 0.31, y - s * 0.31);
  ink(g, BLOOM, Math.max(0.8, s * 0.09), 1);
  g.restore();
}

/** A bold number or sign, left-aligned at x, baseline centred on y. Returns its width. */
export function num(g: Ctx, text: string, x: number, y: number, size: number, col: string): number {
  g.save();
  g.font = `760 ${size}px ${SERIF}`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = col;
  g.fillText(text, x, y + size * 0.04);
  const w = g.measureText(text).width;
  g.restore();
  return w;
}

/** Width a number would take. */
export function numWidth(g: Ctx, text: string, size: number): number {
  g.save();
  g.font = `760 ${size}px ${SERIF}`;
  const w = g.measureText(text).width;
  g.restore();
  return w;
}

// ---------------------------------------------------------------- pictograms

/** One piece of a card's pictogram line. */
export type Bit =
  | { t: 'produce'; k: SeedId }
  | { t: 'glyph'; k: CardId }
  | { t: 'tall' }
  | { t: 'loop' }
  | { t: 'moon' }
  | { t: 'basket' }
  | { t: 'bloom' }
  | { t: 'map'; k: Diagram }
  | { t: 'nocrow' }
  | { t: 'nobug' }
  | { t: 'scoop' }
  | { t: 'text'; s: string; c: 'y' | 'b' | 'i' };

const Y = (s: string): Bit => ({ t: 'text', s, c: 'y' });
const B = (s: string): Bit => ({ t: 'text', s, c: 'b' });
const I = (s: string): Bit => ({ t: 'text', s, c: 'i' });
const BASKET: Bit = { t: 'basket' };
const BLOOMB: Bit = { t: 'bloom' };
const MOON: Bit = { t: 'moon' };
const map = (k: Diagram): Bit => ({ t: 'map', k });
const prod = (k: SeedId): Bit => ({ t: 'produce', k });

/** What a card does, as a line of pictures: "carrot +2 basket" for the radish. `bees`: Busy Bees is kept. */
export function pictogram(id: CardId, up: boolean, bees = false): Bit[] {
  switch (id) {
    case 'radish':
      return [prod('carrot'), Y('+2'), BASKET];
    case 'carrot':
      return [prod('radish'), B('+1'), BLOOMB];
    case 'lettuce':
      return [{ t: 'tall' }, Y('+4'), BASKET];
    case 'beans':
      return [map('next'), Y('+2'), BASKET];
    case 'corn':
      return [prod('beans'), B('×1.5'), BLOOMB];
    case 'sunflower':
      // It faces the crop below it.
      return bees ? [map('below'), B('+2'), BLOOMB, B(`×${TUNING.beesTimes}`)] : [map('below'), B('+2'), BLOOMB];
    case 'pumpkin':
      return [map('alone'), B('×2'), BLOOMB];
    case 'strawberry':
      // Its picks are on the basket row; its rule is the scoop each pick puts back.
      return [{ t: 'loop' }, { t: 'scoop' }, I('+1')];
    case 'mint':
      return [map('spread')];
    case 'garlic':
      // A pest kept off, and the plots it is kept off: the garlic and its neighbours (it used to be the cross alone).
      return [{ t: 'nobug' }, map('next')];
    case 'wheat':
      return [prod('wheat'), Y('+2'), BASKET];
    case 'chili':
      return [map('next'), B('×1.5'), BLOOMB];
    case 'can':
      return [map('row'), MOON, I('+1')];
    case 'compost':
      return [map('one'), Y('+6'), BASKET];
    case 'fertiliser':
      return [map('one'), MOON, I('+1')];
    case 'trowel':
      return [map(up ? 'moveany' : 'move')];
    case 'shears':
      return [Y('×2'), BASKET];
    case 'ladybirds':
      // Every pest on the plot cleared.
      return up ? [{ t: 'nobug' }, map('all'), I('+1')] : [{ t: 'nobug' }, map('all')];
    case 'scarecrow':
      // A crow kept off, and the 3 by 3 it is kept off.
      return [{ t: 'nocrow' }, map('area')];
    case 'beehive':
      return bees ? [map('area'), B('+1'), BLOOMB, B(`×${TUNING.beesTimes}`)] : [map('area'), B('+1'), BLOOMB];
    case 'rain':
      return [map('all'), MOON, I('+1')];
    case 'sun':
      return [Y('+3'), BASKET];
    case 'storm':
      return [map('all'), MOON, I('+2')];
  }
}

/** Draw a pictogram line centred on (cx, cy), h tall. Returns its width. */
export function drawBits(g: Ctx, bits: Bit[], cx: number, cy: number, h: number, px: number, light = false): number {
  const gap = h * 0.12;
  const size = (b: Bit): number => {
    switch (b.t) {
      case 'text':
        return numWidth(g, b.s, h * 0.78);
      case 'map':
      case 'nocrow':
      case 'nobug':
        return h;
      case 'basket':
      case 'bloom':
      case 'moon':
        return h * 0.78;
      case 'scoop':
        return h * 1.1;
      default:
        return h;
    }
  };
  const total = bits.reduce((a, b) => a + size(b), 0) + gap * (bits.length - 1);
  let x = cx - total / 2;
  for (const b of bits) {
    const w = size(b);
    const mx = x + w / 2;
    switch (b.t) {
      case 'produce':
        produce(g, b.k, mx, cy, h * 0.95, px);
        break;
      case 'glyph':
        g.save();
        g.translate(mx, cy);
        g.scale(h, h);
        paintGlyph(g, b.k, px / h, INK, pal);
        g.restore();
        break;
      case 'tall':
        tall(g, mx, cy, h);
        break;
      case 'loop':
        loop(g, mx, cy, h);
        break;
      case 'moon':
        moon(g, mx, cy, h * 0.36, light ? '#f3e7c6' : '#3a4a78');
        break;
      case 'basket':
        basket(g, mx, cy, h * 0.82, light ? '#2a1a0a' : INK);
        break;
      case 'bloom':
        bloom(g, mx, cy, h * 0.78);
        break;
      case 'map':
        diagram(g, b.k, mx, cy, h);
        break;
      case 'nocrow':
        crow(g, mx, cy, h, true);
        break;
      case 'nobug':
        noBug(g, mx, cy, h);
        break;
      case 'scoop':
        scoop(g, mx, cy, h * 1.1, true);
        break;
      case 'text':
        num(g, b.s, x, cy, h * 0.78, b.c === 'b' ? BLOOM : light ? '#f6ecd0' : INK);
        break;
    }
    x += w + gap;
  }
  return total;
}

// ---------------------------------------------------------------- images for the table's own slips and notes

const urls = new Map<string, string>();

/** A small square image of an icon, for slips: a seed, a card, a page, 'basket', 'bloom', 'moon', 'alone', 'tall'. */
export function iconUrl(key: string, size = 40): string {
  const k = `${key}@${size}`;
  let u = urls.get(k);
  if (u) return u;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const m = size / 2;
  const px = 1 / size;
  if (key in CARDS && CARDS[key as CardId].type === 'seed') produce(g, key as SeedId, m, m, size * 0.92, px);
  else if (key in CARDS) {
    g.save();
    g.translate(m, m);
    g.scale(size * 0.95, size * 0.95);
    paintGlyph(g, key as CardId, px, INK, pal);
    g.restore();
  } else if (key === 'basket') basket(g, m, m * 1.05, size * 0.9);
  else if (key === 'bloom') bloom(g, m, m, size * 0.9);
  else if (key === 'moon') moon(g, m, m, size * 0.4);
  else if (key === 'alone') diagram(g, 'alone', m, m, size * 0.9);
  else if (key === 'tall') tall(g, m, m, size);
  else if (key === 'pest') bug(g, m, m, size * 0.3);
  else if (key === 'scoop') scoop(g, m, m, size * 0.95, true);
  else {
    // An almanac page: a ruled leaf with a red ribbon.
    g.save();
    g.translate(m, m);
    g.rotate(-0.12);
    g.beginPath();
    g.rect(-size * 0.3, -size * 0.38, size * 0.6, size * 0.76);
    fill(g, '#f3e9cf');
    ink(g, INK, size * 0.04, 1);
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      g.moveTo(-size * 0.2, -size * 0.18 + i * size * 0.13);
      g.lineTo(size * 0.2, -size * 0.18 + i * size * 0.13);
    }
    ink(g, INK, size * 0.025, 0.6);
    g.beginPath();
    g.rect(size * 0.1, -size * 0.42, size * 0.08, size * 0.3);
    fill(g, '#9a2a2a');
    g.restore();
  }
  u = c.toDataURL();
  urls.set(k, u);
  return u;
}
