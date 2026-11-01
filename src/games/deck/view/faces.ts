// Card faces, painted once per card and cached as images. Each type is made
// the way the thing would be made: seeds are printed packets with a torn top,
// tools are kraft luggage tags on twine, weather is a clipping from an almanac
// page, and objects are painted wooden plaques on a stake. Rarity shows as
// print quality (a finer double rule, or a gold-leaf corner), never a glow.
// Faces carry no sentences: the cost is printed as seed scoops in the top
// left corner, yield as a number by a basket, nights to ripen as moons, and
// the rule as one line of pictures. The sentence lives in the close-up view.
// Card units: 100 wide by 140 tall.

import { fill, ink, type Ctx } from '../../../render2d/brush';
import { PALETTES } from '../../../render2d/palette';
import { Rng } from '../../../render2d/rng';
import { baseChips, CARDS, CELLAR_YIELD, costOf, SEEDS, type CardId, type SeedId } from '../rules';
import { CROP_COLOR, paintSeedCrop, paintSeedProduce, TOP } from './crops';
import { paintGlyph } from './glyphs';
import { basket, drawBits, loop, moon, num, pictogram, scoop, tall, type Bit } from './icons';

export const CARD_W = 100;
export const CARD_H = 140;
const SERIF = "'Fraunces Variable', 'Fraunces', Georgia, serif";
const SANS = "'Bricolage Grotesque Variable', system-ui, sans-serif";

export const VARIETY: Record<SeedId, string> = {
  radish: 'French Breakfast',
  carrot: 'Early Nantes',
  lettuce: 'Butterhead',
  beans: 'Scarlet Runner',
  corn: 'Golden Bantam',
  sunflower: 'Russian Giant',
  pumpkin: 'Connecticut Field',
  strawberry: 'Royal Sovereign',
  mint: 'Spearmint',
  garlic: 'Purple Stripe',
  wheat: 'Red Fife',
  chili: 'Long Cayenne',
};

const INK = '#2e2418';
const pal = PALETTES[1];
/** Yield raised by a kept page (Root Cellar) prints in green, so the card tells the truth. */
const BOOSTED = '#2f7a2e';

/** What kept pages change on a face: extra base yield, and bees giving +2 bloom. */
export interface FaceBonus {
  yield: number;
  bees: boolean;
}

/** A box on a face in card units (100 by 140). */
export interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The type size the name was painted at, in card units. */
  size?: number;
}

/** Where the name and the rule's pictures were painted on the face being painted, for checks. */
let boxes: { name: FaceBox | null; rule: FaceBox | null } = { name: null, rule: null };
function nameAt(ctx: Ctx, text: string, x: number, baseline: number, size: number, align: 'left' | 'center', track = 0): void {
  const w = ctx.measureText(text).width + track * Math.max(0, text.length - 1);
  boxes.name = { x: align === 'center' ? x - w / 2 : x, y: baseline - size * 0.78, w, h: size * 0.98, size };
}
function ruleAt(ctx: Ctx, bits: Bit[], cx: number, cy: number, h: number, px: number): void {
  const w = drawBits(ctx, bits, cx, cy, h, px);
  boxes.rule = { x: cx - w / 2, y: cy - h / 2, w, h };
}

function font(ctx: Ctx, size: number, weight = 500, italic = false, family = SERIF): void {
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`;
}

/** Text with letter spacing, for stamped and printed capitals. */
function spaced(ctx: Ctx, text: string, x: number, y: number, track: number, align: 'left' | 'center' = 'left'): void {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
  let cx = align === 'center' ? x - total / 2 : x;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y);
    cx += widths[i] + track;
  });
}

/** Set a font size that fits the text in max units, from size down. */
function fit(ctx: Ctx, text: string, size: number, max: number, weight: number, track = 0): number {
  let s = size;
  for (;;) {
    font(ctx, s, weight);
    const w = ctx.measureText(text).width + track * (text.length - 1);
    if (w <= max || s < 6) return s;
    s -= 0.3;
  }
}

/** Where each cost scoop sits on a face, in card units: the top left corner, so it shows in a fanned hand. */
export interface CostBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SCOOP_W = 17;
/**
 * Where the cost chip sits. On a seed packet it is a price sticker over the
 * torn top edge, so the name keeps the whole band: seeds now cost up to three
 * scoops, and three beside the name squeezed "Pumpkin" to 6 units.
 */
const COST_AT: Record<string, { x: number; y: number }> = { seed: { x: 5, y: 0.5 }, tool: { x: 15, y: 37 }, weather: { x: 9, y: 30 }, object: { x: 10, y: 33 } };

/** The cost scoops' boxes on a face. Free cards have none. */
export function costBoxes(id: CardId, up: boolean): CostBox[] {
  const n = costOf(id, up);
  const at = COST_AT[CARDS[id].type];
  return Array.from({ length: n }, (_, i) => ({ x: at.x + 2.5 + i * (SCOOP_W + 1), y: at.y + 2.5, w: SCOOP_W, h: SCOOP_W * 0.75 }));
}

/** The width the cost chip takes, so a name can start after it. */
function costWidth(id: CardId, up: boolean, shown: boolean): number {
  if (!shown) return 0;
  const n = costOf(id, up);
  return n === 0 ? 27 : 5 + n * (SCOOP_W + 1);
}

/** The cost, printed as seed scoops on a cream chip in the top left; "Free" for free cards. */
function costChip(ctx: Ctx, id: CardId, up: boolean): void {
  const at = COST_AT[CARDS[id].type];
  const n = costOf(id, up);
  const w = costWidth(id, up, true);
  const h = SCOOP_W * 0.75 + 5;
  ctx.beginPath();
  ctx.roundRect(at.x, at.y, w, h, 3);
  fill(ctx, '#f8f0da');
  ink(ctx, '#3a2614', 0.8, 0.9);
  if (n === 0) {
    font(ctx, 9.6, 720, true);
    ctx.fillStyle = '#3a2614';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Free', at.x + w / 2, at.y + h / 2 + 0.5);
    ctx.textBaseline = 'alphabetic';
    return;
  }
  for (const b of costBoxes(id, up)) scoop(ctx, b.x + b.w / 2, b.y + b.h / 2, b.w, true);
}

function grain(ctx: Ctx, r: Rng, x0: number, y0: number, w: number, h: number, dark: string, light: string, n: number, fibres = false): void {
  for (let i = 0; i < n; i++) {
    const x = x0 + r.next() * w;
    const y = y0 + r.next() * h;
    ctx.globalAlpha = 0.05 + r.next() * 0.09;
    ctx.fillStyle = i % 3 ? dark : light;
    if (fibres) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(r.next() * Math.PI);
      ctx.fillRect(-r.range(1, 3.5), -0.18, r.range(2, 7), 0.36);
      ctx.restore();
    } else ctx.fillRect(x, y, 0.7, 0.7);
  }
  ctx.globalAlpha = 1;
}

/** A gilt corner, for rare stock. */
function goldLeaf(ctx: Ctx, x: number, y: number, size: number, flip = false): void {
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, 0);
  ctx.lineTo(0, -size);
  ctx.closePath();
  const g = ctx.createLinearGradient(-size, 0, 0, -size);
  g.addColorStop(0, '#b8862a');
  g.addColorStop(0.45, '#f3d27a');
  g.addColorStop(0.55, '#fff0b8');
  g.addColorStop(1, '#c9962e');
  ctx.fillStyle = g;
  ctx.fill();
  ink(ctx, '#7a5418', 0.6, 0.9);
  ctx.beginPath();
  ctx.moveTo(-size * 0.72, -size * 0.12);
  ctx.lineTo(-size * 0.12, -size * 0.72);
  ink(ctx, '#7a5418', 0.4, 0.6);
  ctx.restore();
}

/** A red rubber stamp, for upgraded stock. */
function stamp(ctx: Ctx, text: string, x: number, y: number, rot: number, r: Rng): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  font(ctx, 8.4, 760, false, SERIF);
  const w = ctx.measureText(text.toUpperCase()).width + text.length * 1.1 + 8;
  ctx.globalAlpha = 0.82;
  ctx.strokeStyle = '#b8352a';
  ctx.lineWidth = 1.1;
  ctx.strokeRect(-w / 2, -7, w, 13);
  ctx.strokeRect(-w / 2 + 1.6, -5.4, w - 3.2, 9.8);
  ctx.fillStyle = '#b8352a';
  spaced(ctx, text.toUpperCase(), 0, 2.6, 1.1, 'center');
  // Worn ink.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    ctx.globalAlpha = 0.5 + r.next() * 0.5;
    ctx.beginPath();
    ctx.arc(r.range(-w / 2, w / 2), r.range(-7, 6), r.range(0.3, 0.9), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- the four materials

function packet(ctx: Ctx, id: SeedId, up: boolean, S: number, showCost: boolean, bonus: FaceBonus | null): void {
  const r = new Rng(1000 + Object.keys(SEEDS).indexOf(id));
  const col = CROP_COLOR[id];
  const rare = CARDS[id].rarity === 'rare';
  const fine = CARDS[id].rarity !== 'common';
  // Body with a torn top edge.
  const top: [number, number][] = [];
  for (let x = 5; x <= 95; x += 2.2 + r.next() * 2.4) top.push([x, 11 + r.jit(1.8) + (r.next() < 0.2 ? r.next() * 2.5 : 0)]);
  top.push([95, 11.5]);
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(5, 136);
    ctx.lineTo(5, top[0][1]);
    for (const [x, y] of top) ctx.lineTo(x, y);
    ctx.lineTo(95, 136);
    ctx.closePath();
  };
  body();
  fill(ctx, '#f4ecd6');
  ctx.save();
  body();
  ctx.clip();
  grain(ctx, r, 5, 8, 90, 130, '#8a7350', '#ffffff', 900);
  // The fold seam on the left and the glued flap at the bottom.
  ctx.fillStyle = 'rgba(120,96,60,0.10)';
  ctx.fillRect(5, 0, 5, 140);
  ctx.fillStyle = 'rgba(120,96,60,0.07)';
  ctx.fillRect(5, 128, 90, 8);
  // The band.
  ctx.fillStyle = col;
  ctx.fillRect(5, 15, 90, 22);
  ctx.globalAlpha = 0.18;
  grain(ctx, r, 5, 15, 90, 22, '#000000', '#ffffff', 220);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(251,243,223,0.75)';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(8, 17.5, 84, 17);
  ctx.restore();
  // Torn fringe: paper fibres catching light.
  ctx.beginPath();
  ctx.moveTo(5, top[0][1]);
  for (const [x, y] of top) ctx.lineTo(x, y);
  ink(ctx, '#fffaf0', 1.4, 0.9);
  ink(ctx, '#a08a68', 0.4, 0.6);
  body();
  ink(ctx, '#7a6446', 0.6, 0.6);

  // The cost as a sticker on the top edge; the name has the band to itself.
  if (showCost) costChip(ctx, id, up);
  const nx = 10;
  ctx.fillStyle = '#fbf3df';
  const nsize = fit(ctx, CARDS[id].name, 15, 91 - nx, 720);
  ctx.textAlign = 'left';
  ctx.fillText(CARDS[id].name, nx, 31.5);
  nameAt(ctx, CARDS[id].name, nx, 31.5, nsize, 'left');
  // Vignette: an oval plate with the crop and its produce.
  const vy = 63;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(50, vy, 40, 21, 0, 0, Math.PI * 2);
  fill(ctx, '#eef0dc');
  ctx.clip();
  ctx.fillStyle = 'rgba(160,140,100,0.16)';
  ctx.fillRect(10, vy + 9, 80, 20);
  // Soil line.
  ctx.beginPath();
  ctx.ellipse(40, vy + 14, 22, 4.5, 0, 0, Math.PI * 2);
  fill(ctx, '#b48a5a', 0.55);
  const tile = Math.min(34, 36 / TOP[id]);
  ctx.save();
  ctx.translate(38, vy + 14);
  ctx.scale(tile, tile);
  paintSeedCrop(ctx, id, 4, pal, 1 / (tile * S), 4242);
  ctx.restore();
  ctx.save();
  ctx.translate(72, vy + 1);
  ctx.scale(26, 26);
  paintSeedProduce(ctx, id, pal, 1 / (26 * S));
  ctx.restore();
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(50, vy, 40, 21, 0, 0, Math.PI * 2);
  ink(ctx, INK, 0.9, 0.85);
  if (fine) {
    ctx.beginPath();
    ctx.ellipse(50, vy, 42.4, 23.4, 0, 0, Math.PI * 2);
    ink(ctx, col, 0.6, 0.9);
  }
  // Yield by its basket on the left, moons for the nights to ripen on the right.
  const ry = 96;
  let x = 9;
  const extra = bonus?.yield ?? 0;
  x += num(ctx, String(baseChips(id, up) + extra), x, ry, 15, extra ? BOOSTED : INK) + 1.5;
  basket(ctx, x + 6.5, ry, 13);
  x += 15;
  const picks = SEEDS[id].picks;
  if (picks > 1) {
    loop(ctx, x + 6, ry, 12);
    x += 12.5;
    x += num(ctx, String(picks), x, ry, 10.5, INK) + 2;
  }
  if (SEEDS[id].tall) tall(ctx, x + 6, ry, 13);
  const days = SEEDS[id].days;
  for (let i = 0; i < days; i++) moon(ctx, 87 - i * 8.6, ry, 3.6);
  ctx.beginPath();
  ctx.moveTo(10, 106);
  ctx.lineTo(90, 106);
  ink(ctx, '#8a7350', 0.4, 0.7);
  // The rule, as pictures.
  ruleAt(ctx, pictogram(id, up, !!bonus?.bees), 50, 120, 19, 1 / S);
  if (fine) {
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(7.5, 39, 85, 94.5);
    ctx.globalAlpha = 1;
  }
  if (rare) goldLeaf(ctx, 95, 136, 15);
  if (up) stamp(ctx, 'Select', 76, 47, -0.18, r);
}

function tag(ctx: Ctx, id: CardId, up: boolean, S: number, showCost: boolean): void {
  const r = new Rng(2000 + Object.keys(CARDS).indexOf(id));
  const rare = CARDS[id].rarity === 'rare';
  const fine = CARDS[id].rarity !== 'common';
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(29, 18);
    ctx.lineTo(71, 18);
    ctx.lineTo(87, 34);
    ctx.lineTo(87, 135);
    ctx.lineTo(13, 135);
    ctx.lineTo(13, 34);
    ctx.closePath();
  };
  shape();
  fill(ctx, '#c79d6b');
  ctx.save();
  shape();
  ctx.clip();
  grain(ctx, r, 13, 18, 74, 118, '#6e4a26', '#f0d6aa', 520, true);
  const g = ctx.createRadialGradient(50, 80, 20, 50, 80, 75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(90,60,30,0.28)');
  ctx.fillStyle = g;
  ctx.fillRect(10, 15, 80, 125);
  ctx.restore();
  shape();
  ink(ctx, '#7a5430', 0.7, 0.8);
  // Reinforced hole.
  ctx.beginPath();
  ctx.arc(50, 31, 8.4, 0, Math.PI * 2);
  fill(ctx, '#d8b585');
  ink(ctx, '#8a6238', 0.5, 0.8);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(50, 31, 3.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  ctx.arc(50, 31, 3.8, 0, Math.PI * 2);
  ink(ctx, '#6e4a26', 0.6, 0.9);
  // Twine through the hole and up off the card.
  ctx.beginPath();
  ctx.moveTo(47, 29);
  ctx.bezierCurveTo(40, 14, 46, 6, 52, 0);
  ctx.moveTo(53, 29.5);
  ctx.bezierCurveTo(58, 16, 50, 8, 56, 0);
  ink(ctx, '#5a4a34', 2.6, 0.9);
  ink(ctx, '#e9dcbc', 1.6, 1);
  ctx.beginPath();
  ctx.moveTo(47, 29);
  ctx.bezierCurveTo(40, 14, 46, 6, 52, 0);
  ink(ctx, '#b8a47e', 0.35, 1);
  // The cost, then the name, stamped.
  if (showCost) costChip(ctx, id, up);
  ctx.fillStyle = '#2a1e14';
  // Stamped capitals, as large as the tag allows; a two-word name takes two lines, under the cost, so it stays legible in a full hand.
  const words = CARDS[id].name.toUpperCase().split(' ');
  const lines = words.length > 1 ? words : [words[0]];
  const two = lines.length > 1;
  const tsize = Math.min(...lines.map((l) => fit(ctx, l, two ? 9.4 : 11, 68, 760, 0.9)));
  font(ctx, tsize, 760);
  ctx.globalAlpha = 0.92;
  const lh = tsize * 1.04;
  const base0 = two ? 62 : 66;
  lines.forEach((l, k) => spaced(ctx, l, 50, base0 + k * lh, 0.9, 'center'));
  const widest = lines.reduce((a, l) => (ctx.measureText(l).width > ctx.measureText(a).width ? l : a), lines[0]);
  nameAt(ctx, widest, 50, base0 + lh * (lines.length - 1), tsize, 'center', 0.9);
  if (two && boxes.name) {
    boxes.name.y -= lh;
    boxes.name.h += lh;
  }
  ctx.globalAlpha = 1;
  const ruleY = two ? 75 : 70;
  ctx.beginPath();
  ctx.moveTo(22, ruleY);
  ctx.lineTo(78, ruleY);
  ink(ctx, '#2a1e14', 0.5, 0.6);
  // The tool.
  ctx.save();
  ctx.translate(50, two ? 92 : 89);
  ctx.scale(two ? 30 : 32, two ? 30 : 32);
  paintGlyph(ctx, id, 1 / ((two ? 30 : 32) * S), '#2a1e14', pal);
  ctx.restore();
  ruleAt(ctx, pictogram(id, up), 50, 119, 19, 1 / S);
  if (fine) {
    ctx.save();
    ctx.setLineDash([1.6, 1.4]);
    ctx.strokeStyle = 'rgba(42,30,20,0.55)';
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(30.5, 21);
    ctx.lineTo(69.5, 21);
    ctx.lineTo(84, 35.5);
    ctx.lineTo(84, 132);
    ctx.lineTo(16, 132);
    ctx.lineTo(16, 35.5);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
  if (rare) goldLeaf(ctx, 87, 135, 14);
  if (up) stamp(ctx, 'Select', 70, 46, -0.2, r);
}

function clipping(ctx: Ctx, id: CardId, up: boolean, S: number, showCost: boolean): void {
  const r = new Rng(3000 + Object.keys(CARDS).indexOf(id));
  const rare = CARDS[id].rarity === 'rare';
  const fine = CARDS[id].rarity !== 'common';
  // Scissor-cut outline: straight-ish runs with small jogs.
  const pts: [number, number][] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push([x0 + (x1 - x0) * t + r.jit(0.7), y0 + (y1 - y0) * t + r.jit(0.7)]);
    }
  };
  edge(7, 11, 94, 9);
  edge(94, 9, 93, 133);
  edge(93, 133, 6, 135);
  edge(6, 135, 7, 11);
  const shape = () => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
  shape();
  fill(ctx, '#ece6d3');
  ctx.save();
  shape();
  ctx.clip();
  grain(ctx, r, 5, 8, 92, 130, '#6a6050', '#ffffff', 700);
  // Print showing through from the other side of the page.
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = '#2a2a2a';
  for (let y = 14; y < 134; y += 3.4) {
    for (const [x0, x1] of [[9, 48], [52, 92]]) {
      const w = (x1 - x0) * (0.6 + r.next() * 0.4);
      ctx.fillRect(x1 - w, y, w, 1.1);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  shape();
  ink(ctx, '#8a8270', 0.5, 0.7);
  // Masthead between two rules.
  ctx.beginPath();
  ctx.moveTo(11, 16);
  ctx.lineTo(89, 15.5);
  ctx.moveTo(11, 27.5);
  ctx.lineTo(89, 27);
  ink(ctx, INK, 0.7, 0.9);
  ctx.beginPath();
  ctx.moveTo(11, 17.4);
  ctx.lineTo(89, 16.9);
  ink(ctx, INK, 0.3, 0.8);
  ctx.fillStyle = INK;
  font(ctx, 6.4, 650);
  spaced(ctx, 'THE FORECAST', 50, 24, 1.3, 'center');
  if (showCost) costChip(ctx, id, up);
  // The woodcut.
  ctx.save();
  ctx.translate(50, 67);
  ctx.scale(38, 38);
  paintGlyph(ctx, id, 1 / (38 * S), INK, pal);
  ctx.restore();
  ctx.fillStyle = INK;
  font(ctx, 14, 760);
  ctx.textAlign = 'center';
  ctx.fillText(CARDS[id].name, 50, 99);
  nameAt(ctx, CARDS[id].name, 50, 99, 14, 'center');
  ctx.beginPath();
  ctx.moveTo(30, 104);
  ctx.lineTo(70, 104);
  ink(ctx, INK, 0.4, 0.7);
  ruleAt(ctx, pictogram(id, up), 50, 119, 19, 1 / S);
  if (fine) {
    ctx.strokeStyle = 'rgba(46,36,24,0.6)';
    ctx.lineWidth = 0.45;
    ctx.strokeRect(10, 30.5, 80, 100);
    ctx.strokeRect(11.3, 31.8, 77.4, 97.4);
  }
  if (rare) goldLeaf(ctx, 93, 133, 14);
  if (up) stamp(ctx, 'Select', 72, 40, -0.22, r);
}

function plaque(ctx: Ctx, id: CardId, up: boolean, S: number, showCost: boolean, bonus: FaceBonus | null): void {
  const r = new Rng(4000 + Object.keys(CARDS).indexOf(id));
  const rare = CARDS[id].rarity === 'rare';
  const fine = CARDS[id].rarity !== 'common';
  // The stake.
  ctx.beginPath();
  ctx.moveTo(44, 100);
  ctx.lineTo(56, 100);
  ctx.lineTo(55, 128);
  ctx.lineTo(50, 139);
  ctx.lineTo(45, 128);
  ctx.closePath();
  fill(ctx, '#8e6a42');
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(60,36,16,0.35)';
  ctx.fillRect(51, 100, 6, 40);
  ctx.fillStyle = 'rgba(70,50,30,0.5)';
  ctx.fillRect(43, 127, 14, 13);
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(44, 100);
  ctx.lineTo(56, 100);
  ctx.lineTo(55, 128);
  ctx.lineTo(50, 139);
  ctx.lineTo(45, 128);
  ctx.closePath();
  ink(ctx, '#3a2614', 0.7, 0.9);
  // The board, slightly uneven.
  const board = () => {
    ctx.beginPath();
    ctx.moveTo(9, 15);
    ctx.lineTo(91, 13.5);
    ctx.lineTo(92.5, 104);
    ctx.lineTo(8, 105.5);
    ctx.closePath();
  };
  board();
  fill(ctx, '#b88a58');
  ctx.save();
  board();
  ctx.clip();
  // Grain: long wavy lines and a knot.
  ctx.strokeStyle = 'rgba(110,70,34,0.5)';
  ctx.lineWidth = 0.5;
  for (let y = 16; y < 106; y += 3 + r.next() * 3) {
    ctx.beginPath();
    ctx.moveTo(6, y);
    for (let x = 6; x <= 94; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.07 + y) * 0.9 + (Math.abs(x - 72) < 10 ? Math.sign(y - 88) * (10 - Math.abs(x - 72)) * 0.25 : 0));
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(72, 88, 3.2, 1.8, 0.1, 0, Math.PI * 2);
  fill(ctx, '#7a5430', 0.7);
  ctx.fillStyle = 'rgba(255,240,210,0.18)';
  ctx.fillRect(6, 14, 90, 3);
  ctx.fillStyle = 'rgba(60,36,16,0.22)';
  ctx.fillRect(6, 100, 90, 6);
  ctx.restore();
  board();
  ink(ctx, '#3a2614', 0.8, 0.9);
  // Nails.
  for (const [x, y] of [[15, 21], [85, 98]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 1.9, 0, Math.PI * 2);
    fill(ctx, '#6f6a62');
    ink(ctx, '#2a2420', 0.5, 0.9);
    ctx.beginPath();
    ctx.arc(x - 0.5, y - 0.5, 0.6, 0, Math.PI * 2);
    fill(ctx, '#d8d2c6', 0.8);
  }
  // Painted name, the cost under it.
  ctx.fillStyle = '#f3e7c6';
  font(ctx, 12.5, 720);
  ctx.textAlign = 'center';
  ctx.fillText(CARDS[id].name, 52, 29);
  nameAt(ctx, CARDS[id].name, 52, 29, 12.5, 'center');
  if (showCost) costChip(ctx, id, up);
  // The thing itself, clear of a three-scoop cost chip.
  ctx.save();
  ctx.translate(60, 63);
  ctx.scale(25, 25);
  paintGlyph(ctx, id, 1 / (25 * S), '#2a1a0a', pal);
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(14, 76, 72, 22, 4);
  fill(ctx, '#f3e7c6', 0.85);
  ruleAt(ctx, pictogram(id, up, !!bonus?.bees), 50, 87, 18, 1 / S);
  if (fine) {
    ctx.strokeStyle = 'rgba(243,231,198,0.55)';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(12, 34, 76, 66);
  }
  if (rare) goldLeaf(ctx, 92.5, 104, 13);
  if (up) stamp(ctx, 'Select', 72, 45, -0.2, r);
}

// ---------------------------------------------------------------- cache

const cache = new Map<string, string>();
let ready: Promise<void> | null = null;

/** Wait for the two faces' fonts so canvas text uses them. */
export function fontsReady(): Promise<void> {
  if (!ready) {
    ready = Promise.all([
      document.fonts.load(`720 20px ${SERIF}`),
      document.fonts.load(`italic 500 20px ${SERIF}`),
      document.fonts.load(`600 20px ${SANS}`),
    ])
      .then(() => undefined)
      .catch(() => undefined);
  }
  return ready;
}

export const FACE_SCALE = 3;

/** Every string painted on each face, for checks: names, numbers, Free, the masthead. Never a sentence. */
const painted = new Map<string, string[]>();
/** Where each face's name and rule were painted. */
const placed = new Map<string, { name: FaceBox | null; rule: FaceBox | null }>();

/** The strings painted on a card's face. */
export function faceText(id: CardId, up: boolean): string[] {
  faceUrl(id, up);
  return painted.get(`${id}${up ? '+' : ''}`) ?? [];
}

/** Where a face's name and its rule's pictures sit, in card units, so a check can see they show in a fanned hand. */
export function faceBoxes(id: CardId, up: boolean, cost = true, bonus: FaceBonus | null = null): { name: FaceBox | null; rule: FaceBox | null } {
  faceUrl(id, up, cost, bonus);
  return placed.get(faceKey(id, up, cost, bonus)) ?? { name: null, rule: null };
}

function faceKey(id: CardId, up: boolean, cost: boolean, bonus: FaceBonus | null): string {
  return `${id}${up ? '+' : ''}${cost ? '' : '-'}${bonus && (bonus.yield || bonus.bees) ? `~${bonus.yield}${bonus.bees ? 'b' : ''}` : ''}`;
}

/** What the kept pages change on this card's face, or null: the Root Cellar's +2 on the radish and carrot, Busy Bees' x2 on the sunflower and the beehive. */
export function faceBonus(id: CardId, pages: readonly string[]): FaceBonus | null {
  const y = (id === 'radish' || id === 'carrot') && pages.includes('cellar') ? CELLAR_YIELD : 0;
  const bees = (id === 'sunflower' || id === 'beehive') && pages.includes('bees');
  return y || bees ? { yield: y, bees } : null;
}

/** A data URL of a card face, painted once. `cost` false leaves the scoops off (before the scoops are introduced). */
export function faceUrl(id: CardId, up: boolean, cost = true, bonus: FaceBonus | null = null): string {
  const key = faceKey(id, up, cost, bonus);
  let url = cache.get(key);
  if (url) return url;
  const S = FACE_SCALE;
  const c = document.createElement('canvas');
  c.width = CARD_W * S;
  c.height = CARD_H * S;
  const ctx = c.getContext('2d')!;
  ctx.scale(S, S);
  ctx.textBaseline = 'alphabetic';
  // Note each string as it is painted (letter-spaced capitals arrive a letter at a time).
  const texts: string[] = [];
  const fillText = ctx.fillText.bind(ctx);
  let spacedRun = '';
  ctx.fillText = (t: string, x: number, y: number, w?: number) => {
    if (t.length === 1 && /[A-Z ]/.test(t)) spacedRun += t;
    else {
      if (spacedRun) texts.push(spacedRun);
      spacedRun = '';
      texts.push(t);
    }
    fillText(t, x, y, w);
  };
  boxes = { name: null, rule: null };
  const type = CARDS[id].type;
  if (type === 'seed') packet(ctx, id as SeedId, up, S, cost, bonus);
  else if (type === 'tool') tag(ctx, id, up, S, cost);
  else if (type === 'weather') clipping(ctx, id, up, S, cost);
  else plaque(ctx, id, up, S, cost, bonus);
  if (spacedRun) texts.push(spacedRun);
  if (cost && !bonus) painted.set(`${id}${up ? '+' : ''}`, texts);
  placed.set(key, boxes);
  url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/** Forget painted faces (after fonts arrive late). */
export function clearFaces(): void {
  cache.clear();
}
