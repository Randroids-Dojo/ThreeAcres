// The plot, painted as a plate in an old almanac: a deckled page laid on the
// table, a ruled frame, a timber bed of soil squares and the crops drawn with
// the almanac's own botanical paintings. The page and soil are cached once per
// size and season; crops come from a sprite cache. While a card is held the
// board draws its preview: small yield, bloom and night marks on the crops it
// would touch, and what a seed would score on the plot under the finger.

import { fill, ink, type Ctx } from '../../../render2d/brush';
import { PALETTES, type Palette } from '../../../render2d/palette';
import { makePaper } from '../../../render2d/paper';
import { paintScarecrow } from '../../../render2d/props';
import { hash3, Rng } from '../../../render2d/rng';
import { stageOf, type Crop, type Mark, type Plot, type Season, type SeedId } from '../rules';
import { paintSeedCrop } from './crops';
import { paintHiveOnPlot, paintPests } from './glyphs';
import { basket, bloom, BLOOM, bug, moon, num, numWidth } from './icons';

export type PreviewMark = Mark;

export interface Preview {
  marks: PreviewMark[];
  /** A seed on the plot under the finger: what it would score there (late: it is pulled next season, the plot carrying over). */
  total: { plot: number; yield: number; bloom: number; score: number; late?: boolean } | null;
  /** Bloom has been introduced: show bloom with the total. */
  bloom: boolean;
  /** Why a greyed bonus won't pay, said under the aimed plot: "The radish is pulled before the carrot ripens." */
  reason: { plot: number; text: string } | null;
  /** A short line under the aimed plot when the card would do nothing there. */
  none: { plot: number | null; text: string } | null;
}

export interface CropAnim {
  /** Upward lift in tiles. */
  lift: number;
  scale: number;
  /** Lean in radians. */
  tilt: number;
  alpha: number;
  /** Stage to draw instead of the crop's own (mid-growth animation). */
  stage: number | null;
  /** 0 to 1: a warm glow behind the crop while it is scored. */
  glow: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  kind: 'drop' | 'dust' | 'spark' | 'feather' | 'leaf' | 'smoke';
  size: number;
  rot: number;
  col: string;
}

export interface Highlight {
  /** Plots the held card can go on. */
  valid: number[];
  /** The plot under the pointer or cursor. */
  hover: number | null;
  /** Plots the play would touch (a row of water, a 3 by 3). */
  area: number[];
  /** Water-blue for watering cards. */
  water: boolean;
  /** The hover plot refuses the card. */
  deny: boolean;
  /** Keyboard cursor, drawn even with no card held. */
  cursor: number | null;
  /** Whole board glows (cards with no target). */
  all: boolean;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
const SEASON_WORD = ['spring', 'summer', 'autumn', 'winter'];

interface Sprite {
  c: HTMLCanvasElement;
  x0: number;
  y0: number;
  w: number;
  h: number;
}

export class Board {
  readonly canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private layer = document.createElement('canvas');
  private layerKey = '';
  private sprites = new Map<string, Sprite>();
  private paper: HTMLCanvasElement | null = null;
  private paperSeason = -1;
  w = 0;
  h = 0;
  dpr = 1;
  /** Tile size and the bed's top-left corner, CSS px. */
  T = 80;
  /** The plate's margin under the bed (caption and frame). */
  botM = 34;
  bx = 0;
  by = 0;
  cols = 4;
  rows = 4;
  /** The plate (paper) rect. */
  px0 = 0;
  py0 = 0;
  pw = 0;
  ph = 0;
  season: Season = 0;
  plate = 1;
  anims = new Map<number, CropAnim>();
  particles: Particle[] = [];
  night = 0;
  /** Plots lit by a passing water splash, 0 to 1. */
  splash = new Float32Array(25);
  /** Rows and columns shake on a deny. */
  shakePlot = -1;
  shakeT = 0;
  hl: Highlight = { valid: [], hover: null, area: [], water: false, deny: false, cursor: null, all: false };
  /** Plots whose crop will be pulled tonight. */
  tonight: boolean[] = [];
  /** Extra nights each plot grows tonight (the watering can). */
  boost: number[] = [];
  /** What the held card would do, or null. */
  preview: Preview | null = null;
  /** A crow sits on the bed's corner: one comes tonight. */
  crow = false;
  /** Checks only: paint the printed frame's rules in this colour, to find them in the pixels. */
  ruleInk: string | null = null;
  frames = 0;

  constructor() {
    this.canvas.className = 'sb-board';
  }

  /** Fit the plate into a CSS box. */
  layout(w: number, h: number, dpr: number, cols: number, rows: number, compact: boolean): void {
    const changed = w !== this.w || h !== this.h || dpr !== this.dpr || cols !== this.cols || rows !== this.rows;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.cols = cols;
    this.rows = rows;
    // The plate has a margin for the frame, a band on top for tall crops, and the caption under the bed.
    const sideM = compact ? 22 : 34;
    const topM = compact ? 44 : 64;
    let botM = compact ? 34 : 46;
    const fit = () => Math.max(30, Math.floor(Math.min((w - 2 * sideM - 12) / cols, (h - topM - botM - 12) / rows)));
    this.T = fit();
    // The caption sits under the bed and above the printed frame: size the margin from what is in it.
    for (let k = 0; k < 3; k++) {
      const need = Math.ceil(captionBand(this.T));
      if (need <= botM) break;
      botM = need;
      this.T = fit();
    }
    this.botM = botM;
    const bw = this.T * cols;
    const bh = this.T * rows;
    this.pw = bw + 2 * sideM;
    this.ph = bh + topM + botM;
    this.px0 = Math.round((w - this.pw) / 2);
    this.py0 = Math.round((h - this.ph) / 2);
    this.bx = this.px0 + sideM;
    this.by = this.py0 + topM;
    if (changed) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
      this.sprites.clear();
      this.layerKey = '';
    }
  }

  setSeason(season: Season, plate: number): void {
    if (season !== this.season || plate !== this.plate) {
      this.season = season;
      this.plate = plate;
      this.layerKey = '';
      this.sprites.clear();
    }
  }

  private get pal(): Palette {
    return PALETTES[this.season];
  }

  /** CSS px of a plot's crop base (where it meets the soil). */
  base(i: number): { x: number; y: number } {
    const c = i % this.cols;
    const r = Math.floor(i / this.cols);
    return { x: this.bx + (c + 0.5) * this.T, y: this.by + (r + 0.74) * this.T };
  }

  /** CSS px of a plot's centre. */
  centre(i: number): { x: number; y: number } {
    const c = i % this.cols;
    const r = Math.floor(i / this.cols);
    return { x: this.bx + (c + 0.5) * this.T, y: this.by + (r + 0.5) * this.T };
  }

  pick(x: number, y: number): number | null {
    const c = Math.floor((x - this.bx) / this.T);
    const r = Math.floor((y - this.by) / this.T);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return null;
    return r * this.cols + c;
  }

  /** Is the point on the plate at all (for cards with no target). */
  onPlate(x: number, y: number): boolean {
    return x >= this.px0 && x <= this.px0 + this.pw && y >= this.py0 && y <= this.py0 + this.ph;
  }

  // ---------------------------------------------------------------- the page and the soil

  private paintLayer(plots: readonly Plot[]): void {
    const { dpr, T } = this;
    const L = this.layer;
    L.width = this.canvas.width;
    L.height = this.canvas.height;
    const g = L.getContext('2d')!;
    const pal = this.pal;
    if (this.paperSeason !== this.season || !this.paper) {
      this.paper = makePaper(pal.paper, pal.paperDeep, 17 + this.season);
      this.paperSeason = this.season;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = new Rng(hash3(this.season, this.cols, 77));
    // The page: a deckled edge, its shadow on the table, a slight curl at the corners.
    const deckle = () => {
      g.beginPath();
      const { px0: x0, py0: y0, pw, ph } = this;
      const pts: [number, number][] = [];
      const step = 7;
      for (let x = x0; x < x0 + pw; x += step) pts.push([x, y0 + r.jit(1.2)]);
      for (let y = y0; y < y0 + ph; y += step) pts.push([x0 + pw + r.jit(1.2), y]);
      for (let x = x0 + pw; x > x0; x -= step) pts.push([x, y0 + ph + r.jit(1.2)]);
      for (let y = y0 + ph; y > y0; y -= step) pts.push([x0 + r.jit(1.2), y]);
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
    };
    g.save();
    g.shadowColor = 'rgba(28, 16, 6, 0.45)';
    g.shadowBlur = 18;
    g.shadowOffsetY = 6;
    deckle();
    g.fillStyle = pal.paper;
    g.fill();
    g.restore();
    g.save();
    deckle();
    g.clip();
    g.fillStyle = g.createPattern(this.paper!, 'repeat')!;
    g.fillRect(this.px0, this.py0, this.pw, this.ph);
    // Age: a darker rim.
    const rim = g.createRadialGradient(this.px0 + this.pw / 2, this.py0 + this.ph / 2, Math.min(this.pw, this.ph) * 0.35, this.px0 + this.pw / 2, this.py0 + this.ph / 2, Math.max(this.pw, this.ph) * 0.72);
    rim.addColorStop(0, 'rgba(0,0,0,0)');
    rim.addColorStop(1, 'rgba(120, 84, 40, 0.22)');
    g.fillStyle = rim;
    g.fillRect(this.px0, this.py0, this.pw, this.ph);
    g.restore();

    // Printed frame: a heavy rule and a hairline inside it.
    const m = FRAME_M;
    g.strokeStyle = this.ruleInk ?? pal.ink;
    g.globalAlpha = this.ruleInk ? 1 : 0.75;
    g.lineWidth = 1.6;
    g.strokeRect(this.px0 + m, this.py0 + m, this.pw - 2 * m, this.ph - 2 * m);
    g.lineWidth = 0.6;
    g.strokeRect(this.px0 + m + 3.5, this.py0 + m + 3.5, this.pw - 2 * m - 7, this.ph - 2 * m - 7);
    g.globalAlpha = 1;

    // The bed: a timber frame around the soil.
    const bw = T * this.cols;
    const bh = T * this.rows;
    const fw = Math.max(5, T * 0.09);
    g.save();
    g.fillStyle = 'rgba(60, 40, 20, 0.22)';
    g.fillRect(this.bx - fw + 3, this.by - fw + 4, bw + fw * 2, bh + fw * 2);
    g.fillStyle = '#9c7446';
    g.fillRect(this.bx - fw, this.by - fw, bw + fw * 2, bh + fw * 2);
    g.strokeStyle = 'rgba(70, 46, 22, 0.55)';
    g.lineWidth = 0.6;
    for (let k = 1; k < 3; k++) {
      const o = (fw / 3) * k;
      g.strokeRect(this.bx - fw + o, this.by - fw + o, bw + fw * 2 - o * 2, bh + fw * 2 - o * 2);
    }
    g.strokeStyle = pal.ink;
    g.lineWidth = 1.1;
    g.strokeRect(this.bx - fw, this.by - fw, bw + fw * 2, bh + fw * 2);
    g.restore();

    // Soil squares in tile units.
    g.save();
    g.translate(this.bx, this.by);
    g.scale(T, T);
    const px = 1 / (T * dpr);
    for (let i = 0; i < plots.length; i++) this.paintSoil(g, i % this.cols, Math.floor(i / this.cols), plots[i], px, pal);
    g.restore();

    // Caption, between the bed and the printed frame's hairline.
    g.fillStyle = pal.ink;
    g.textAlign = 'center';
    const cap = captionSize(T);
    g.font = `italic 500 ${cap}px 'Fraunces Variable', Georgia, serif`;
    g.fillText(this.caption, this.px0 + this.pw / 2, this.captionBaseline);
  }

  /** Repaint the page and soil on the next frame. */
  repaint(): void {
    this.layerKey = '';
  }

  /** The plate's caption text. */
  get caption(): string {
    return `Plate ${ROMAN[(this.plate - 1) % ROMAN.length]}. The kitchen plot in ${SEASON_WORD[this.season]}.`;
  }

  /** Where the caption's baseline sits, CSS px from the canvas top. */
  get captionBaseline(): number {
    return this.by + this.T * this.rows + frameW(this.T) + captionSize(this.T) + 7;
  }

  /** The printed frame's rules under the bed, CSS px from the canvas top: the heavy rule and the hairline inside it. */
  get frameRules(): { heavy: number; hair: number } {
    const bottom = this.py0 + this.ph - FRAME_M;
    return { heavy: bottom, hair: bottom - 3.5 };
  }

  private paintSoil(g: Ctx, c: number, rr: number, _p: Plot, px: number, pal: Palette): void {
    const r = new Rng(hash3(c, rr, 303));
    const x = c;
    const y = rr;
    const gap = 0.035;
    // The soil square.
    g.beginPath();
    g.rect(x + gap, y + gap, 1 - gap * 2, 1 - gap * 2);
    fill(g, pal.soilDry);
    g.save();
    g.clip();
    // Mottle.
    for (let k = 0; k < 10; k++) {
      g.beginPath();
      g.ellipse(x + r.next(), y + r.next(), 0.12 + r.next() * 0.16, 0.06 + r.next() * 0.08, r.next() * 3, 0, Math.PI * 2);
      fill(g, pal.soilDamp, 0.22);
    }
    // Three furrows, engraved in broken strokes.
    for (let f = 0; f < 3; f++) {
      const fy = y + 0.24 + f * 0.27;
      g.beginPath();
      let fx = x + 0.08 + r.next() * 0.05;
      while (fx < x + 0.92) {
        const l = 0.12 + r.next() * 0.22;
        g.moveTo(fx, fy + r.jit(0.012));
        g.lineTo(Math.min(x + 0.93, fx + l), fy + r.jit(0.012));
        fx += l + 0.03 + r.next() * 0.05;
      }
      ink(g, pal.soilShadow, Math.max(px * 1.6, 0.026), 0.75);
      g.beginPath();
      g.moveTo(x + 0.1, fy - 0.035);
      g.lineTo(x + 0.9, fy - 0.035);
      ink(g, pal.soilRidge, Math.max(px * 1.2, 0.018), 0.65);
    }
    g.restore();
    g.beginPath();
    g.rect(x + gap, y + gap, 1 - gap * 2, 1 - gap * 2);
    ink(g, pal.ink, Math.max(px * 1.1, 0.012), 0.6);
  }

  // ---------------------------------------------------------------- sprites

  private sprite(key: string, x0: number, y0: number, x1: number, y1: number, paint: (g: Ctx, px: number) => void): Sprite {
    let s = this.sprites.get(key);
    if (s) return s;
    const k = this.T * this.dpr;
    const c = document.createElement('canvas');
    c.width = Math.ceil((x1 - x0) * k);
    c.height = Math.ceil((y1 - y0) * k);
    const g = c.getContext('2d')!;
    g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    paint(g, 1 / k);
    s = { c, x0, y0, w: x1 - x0, h: y1 - y0 };
    this.sprites.set(key, s);
    return s;
  }

  private cropSprite(kind: SeedId, stage: number, variant: number): Sprite {
    return this.sprite(`${kind}:${stage}:${variant}`, -0.8, -2.05, 0.8, 0.35, (g, px) => {
      g.save();
      paintSeedCrop(g, kind, stage, this.pal, px, 1000 + variant * 37 + stage);
      g.restore();
    });
  }

  /** Paint sprites a crop will need soon (its next stages), a few per frame, so growth never stalls a frame. */
  private warm(plots: readonly Plot[]): void {
    const t0 = performance.now();
    for (let i = 0; i < plots.length; i++) {
      const c = plots[i].crop;
      if (!c) continue;
      const v = (c.uid + i) % 2;
      const now = stageOf(c);
      for (let st = now; st <= 4; st++) {
        if (this.sprites.has(`${c.kind}:${st}:${v}`)) continue;
        this.cropSprite(c.kind, st, v);
        if (performance.now() - t0 > 3) return;
      }
    }
  }

  // ---------------------------------------------------------------- per frame

  draw(plots: readonly Plot[], dt: number): void {
    this.frames++;
    this.warm(plots);
    const { ctx, dpr, T } = this;
    const key = `${this.season}|${this.plate}|${this.cols}|${this.rows}|${this.T}|${this.botM}|${this.ruleInk}`;
    if (key !== this.layerKey) {
      this.paintLayer(plots);
      this.layerKey = key;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.layer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Water splashes fade.
    for (let i = 0; i < this.splash.length; i++) if (this.splash[i] > 0) this.splash[i] = Math.max(0, this.splash[i] - dt * 1.6);
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);

    this.drawKey();
    this.drawHighlights(plots);

    // Crops and objects, back row first so tall ones overlap the row above.
    for (let i = 0; i < plots.length; i++) {
      const p = plots[i];
      const b = this.base(i);
      const shake = i === this.shakePlot && this.shakeT > 0 ? Math.sin(this.shakeT * 60) * this.shakeT * 14 : 0;
      if (this.splash[i] > 0) {
        ctx.fillStyle = `rgba(180, 215, 240, ${this.splash[i] * 0.35})`;
        const c = this.centre(i);
        ctx.fillRect(c.x - T / 2 + 2, c.y - T / 2 + 2, T - 4, T - 4);
      }
      if (p.crop?.pest) {
        // A sickly wash on the soil, so a pested plot reads from across the table.
        const c = this.centre(i);
        ctx.fillStyle = 'rgba(196, 168, 40, 0.3)';
        ctx.fillRect(c.x - T / 2 + 2, c.y - T / 2 + 2, T - 4, T - 4);
      }
      if (p.obj) {
        const s = p.obj === 'scarecrow'
          ? this.sprite('scarecrow', -0.6, -1.15, 0.6, 0.25, (g, px) => {
              g.scale(0.92, 0.92);
              paintScarecrow(g, this.pal, px / 0.92);
            })
          : this.sprite('beehive', -0.6, -1.0, 0.6, 0.25, (g, px) => paintHiveOnPlot(g, px, this.pal.ink));
        ctx.drawImage(s.c, b.x + s.x0 * T + shake, b.y + s.y0 * T, s.w * T, s.h * T);
      }
      if (p.crop) this.drawCrop(p.crop, i, b.x + shake, b.y);
    }

    // Watered plots: a drop in the corner while they wait for tonight's extra night.
    for (let i = 0; i < plots.length; i++) {
      if (!this.boost[i] || this.night > 0.05) continue;
      const ctr = this.centre(i);
      this.drop(ctr.x - T * 0.36, ctr.y + T * 0.34, T * 0.07);
    }

    // Ripe-tonight moons and pests on top: a pested crop gets a badge with its nights, and if ripe, a struck moon.
    const day = this.night < 0.05;
    for (let i = 0; i < plots.length; i++) {
      const c = plots[i].crop;
      if (!c) continue;
      const ctr = this.centre(i);
      if (this.tonight[i] && day) this.moon(ctr.x + T * 0.36, ctr.y + T * 0.36, T * 0.085);
      if (c.pest) {
        const a = this.anims.get(c.uid);
        const s = this.sprite(`pest:${c.uid % 5}`, -0.44, -0.8, 0.44, 0.1, (g, px) => paintPests(g, px, 40 + (c.uid % 5)));
        const b = this.base(i);
        ctx.globalAlpha = a ? a.alpha : 1;
        ctx.drawImage(s.c, b.x + s.x0 * T, b.y + s.y0 * T - (a?.lift ?? 0) * T, s.w * T, s.h * T);
        ctx.globalAlpha = 1;
        if (day) {
          this.pestBadge(i, c.pest);
          if (c.age >= c.days) this.heldMoon(ctr.x + T * 0.36, ctr.y + T * 0.36, T * 0.085);
        }
      }
    }
    this.drawCrow();

    this.drawPreview();
    this.drawParticles(dt);
  }

  /** Key letters along the top and numbers down the side, like a plate's key. They fade at night, when slips fly over them. */
  private drawKey(): void {
    const { ctx, T } = this;
    const a = Math.max(0, 1 - this.night * 1.8);
    if (a <= 0.01) return;
    const fw = frameW(T);
    ctx.globalAlpha = a;
    ctx.fillStyle = this.pal.inkSoft;
    ctx.font = `italic 500 ${Math.round(Math.max(10, T * 0.14))}px 'Fraunces Variable', Georgia, serif`;
    ctx.textAlign = 'center';
    for (let c = 0; c < this.cols; c++) ctx.fillText('ABCDE'[c], this.bx + (c + 0.5) * T, this.by - fw - 5);
    if (this.bx - this.px0 > 28) {
      ctx.textAlign = 'right';
      for (let rr = 0; rr < this.rows; rr++) ctx.fillText(String(rr + 1), this.bx - fw - 5, this.by + (rr + 0.55) * T);
    }
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  /** A crow on the bed's top right corner: one comes tonight for a ripe crop no scarecrow guards. */
  private drawCrow(): void {
    if (!this.crow || this.night > 0.05) return;
    const { ctx, T } = this;
    const fw = frameW(T);
    const s = T * 0.34;
    const x = this.bx + this.T * this.cols - s * 0.2;
    const y = this.by - fw;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#1c1a22';
    ctx.strokeStyle = '#0a090c';
    ctx.lineWidth = 1;
    // Tail, body, head.
    ctx.beginPath();
    ctx.moveTo(s * 0.45, -s * 0.35);
    ctx.lineTo(s * 0.95, -s * 0.1);
    ctx.lineTo(s * 0.85, -s * 0.02);
    ctx.lineTo(s * 0.35, -s * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.42, s * 0.5, s * 0.3, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-s * 0.42, -s * 0.78, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    // Beak and eye.
    ctx.beginPath();
    ctx.moveTo(-s * 0.58, -s * 0.84);
    ctx.lineTo(-s * 0.92, -s * 0.74);
    ctx.lineTo(-s * 0.58, -s * 0.7);
    ctx.closePath();
    ctx.fillStyle = '#5a5046';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-s * 0.46, -s * 0.82, s * 0.045, 0, Math.PI * 2);
    ctx.fillStyle = '#e8d8a0';
    ctx.fill();
    // A wing's sheen and the legs gripping the frame.
    ctx.beginPath();
    ctx.ellipse(s * 0.05, -s * 0.45, s * 0.3, s * 0.13, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(120, 130, 170, 0.35)';
    ctx.fill();
    ctx.strokeStyle = '#3a3030';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(-s * 0.08, -s * 0.15);
    ctx.lineTo(-s * 0.12, 0);
    ctx.moveTo(s * 0.1, -s * 0.15);
    ctx.lineTo(s * 0.08, 0);
    ctx.stroke();
    ctx.restore();
  }

  /** Pests on a crop: a badge in the plot's top left with a bug and the nights they stay. */
  private pestBadge(i: number, nights: number): void {
    const { ctx, T } = this;
    const c = this.centre(i);
    const size = Math.max(11, Math.round(T * 0.15));
    const text = String(nights);
    const tw = numWidth(ctx, text, size);
    const w = size * 1.3 + tw + 8;
    const h = size + 6;
    const x = c.x - T / 2 + 3;
    const y = c.y - T / 2 + 3;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fillStyle = '#f4e8a8';
    ctx.fill();
    ctx.strokeStyle = '#5a4a10';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    bug(ctx, x + 3 + size * 0.6, y + h / 2, size * 0.55);
    num(ctx, text, x + size * 1.3 + 4, y + h / 2, size, '#3a2e08');
  }

  /** A moon with a red stroke through it: this ripe crop will not be pulled tonight. */
  private heldMoon(x: number, y: number, r: number): void {
    this.moon(x, y, r);
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x - r * 1.3, y + r * 1.3);
    ctx.lineTo(x + r * 1.3, y - r * 1.3);
    ctx.strokeStyle = '#f6eed2';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = '#b8352a';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  /** A blue drop: this plot grows an extra night tonight. */
  private drop(x: number, y: number, r: number): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 1.8);
    ctx.quadraticCurveTo(x + r * 1.1, y - r * 0.2, x, y + r);
    ctx.quadraticCurveTo(x - r * 1.1, y - r * 0.2, x, y - r * 1.8);
    ctx.fillStyle = '#5d93c4';
    ctx.fill();
    ctx.strokeStyle = this.pal.ink;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /**
   * The held card's preview: chips in a plot's top corner for what its crop
   * would gain (a basket and +2, a red flower and +1, a moon and +1), and a
   * dark slip under the aimed plot with what the seed would score there.
   */
  private drawPreview(): void {
    const pv = this.preview;
    if (!pv || this.night > 0.05) return;
    const { ctx, T } = this;
    const size = Math.max(11, Math.round(T * 0.15));
    const chip = (x: number, y: number, text: string, col: string, icon: (cx: number, cy: number) => void, lost = false): number => {
      const tw = numWidth(ctx, text, size);
      const w = tw + size * 1.25 + 6;
      const h = size + 6;
      ctx.beginPath();
      ctx.roundRect(x - w, y, w, h, 4);
      ctx.fillStyle = lost ? 'rgba(226, 220, 204, 0.94)' : 'rgba(251, 244, 222, 0.96)';
      ctx.fill();
      ctx.strokeStyle = lost ? '#8c8676' : col;
      ctx.lineWidth = 1.2;
      if (lost) ctx.setLineDash([3, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (lost) ctx.globalAlpha = 0.55;
      num(ctx, text, x - w + 3, y + h / 2, size, lost ? '#5a5448' : col);
      icon(x - size * 0.62 - 2, y + h / 2);
      ctx.globalAlpha = 1;
      if (lost) {
        // Struck through: shown, but the night won't pay it.
        ctx.beginPath();
        ctx.moveTo(x - w + 2, y + h - 3);
        ctx.lineTo(x - 2, y + 3);
        ctx.strokeStyle = '#6a6458';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      return h + 2;
    };
    const sign = (v: number) => (v > 0 ? `+${fmt(v)}` : fmt(v));
    for (const m of pv.marks) {
      const c = this.centre(m.plot);
      const x = c.x + T / 2 - 3;
      let y = c.y - T / 2 + 3;
      if (m.yield) y += chip(x, y, sign(m.yield), '#2e2418', (cx, cy) => basket(ctx, cx, cy, size * 1.05));
      if (m.bloom) y += chip(x, y, sign(m.bloom), BLOOM, (cx, cy) => bloom(ctx, cx, cy, size * 1.05));
      if (Math.abs(m.times - 1) > 1e-6) y += chip(x, y, `×${fmt(m.times)}`, BLOOM, (cx, cy) => bloom(ctx, cx, cy, size * 1.05));
      if (m.nights) y += chip(x, y, `+${m.nights}`, '#3a4a78', (cx, cy) => moon(ctx, cx, cy, size * 0.42));
      const l = m.lost;
      if (l) {
        if (l.yield) y += chip(x, y, sign(l.yield), '#2e2418', (cx, cy) => basket(ctx, cx, cy, size * 1.05), true);
        if (l.bloom) y += chip(x, y, sign(l.bloom), BLOOM, (cx, cy) => bloom(ctx, cx, cy, size * 1.05), true);
        if (l.times > 1 + 1e-6) y += chip(x, y, `×${fmt(l.times)}`, BLOOM, (cx, cy) => bloom(ctx, cx, cy, size * 1.05), true);
      }
    }
    const t = pv.total;
    let under = -1;
    if (t) {
      const c = this.centre(t.plot);
      // The arithmetic only when bloom changes the total; otherwise just what it pays. A crop pulled
      // next season shows what it will pay then, on a grey slip: it counts toward next season's quota.
      const showBloom = t.bloom !== 1;
      const big = Math.max(12, Math.round(T * 0.17));
      const parts = showBloom ? [fmt(t.yield), '×', fmt(t.bloom), '=', String(t.score)] : [String(t.score)];
      const widths = parts.map((s) => numWidth(ctx, s, big));
      const icon = big * 1.1;
      const w = widths.reduce((a, b) => a + b, 0) + (parts.length - 1) * 3 + icon + 12;
      const h = big + 8;
      // Straddling the plot's bottom edge, clear of a thumb on the plot.
      const x0 = c.x - w / 2;
      const y0 = c.y + T / 2 - h * 0.45;
      ctx.beginPath();
      ctx.roundRect(x0, y0, w, h, 5);
      ctx.fillStyle = t.late ? 'rgba(90, 84, 72, 0.92)' : 'rgba(42, 30, 18, 0.92)';
      ctx.fill();
      let x = x0 + 6;
      basket(ctx, x + icon / 2, y0 + h / 2, icon * 0.95, '#f6ecd0');
      x += icon + 2;
      parts.forEach((s, k) => {
        const col = showBloom && k === 2 ? '#f39aa8' : '#f6ecd0';
        num(ctx, s, x, y0 + h / 2, big, col);
        x += widths[k] + 3;
      });
      under = y0 + h + 3;
    }
    // Why: one plain line under the aimed plot.
    const why = pv.reason ?? (pv.none ? { plot: pv.none.plot, text: pv.none.text } : null);
    if (why) {
      const at = why.plot !== null ? this.centre(why.plot) : { x: this.bx + (T * this.cols) / 2, y: this.by + T * (this.rows - 0.5) };
      const fs = Math.max(11, Math.round(T * 0.135));
      ctx.font = `italic 600 ${fs}px 'Fraunces Variable', Georgia, serif`;
      const tw = ctx.measureText(why.text).width;
      const w = tw + 14;
      const h = fs + 9;
      const x0 = Math.max(this.px0 + 4, Math.min(this.px0 + this.pw - 4 - w, at.x - w / 2));
      const y0 = under >= 0 ? under : at.y + T / 2 + 2;
      ctx.beginPath();
      ctx.roundRect(x0, Math.min(y0, this.py0 + this.ph - h - 4), w, h, 3);
      ctx.fillStyle = 'rgba(246, 238, 214, 0.97)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(58, 38, 20, 0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#3a2614';
      ctx.textBaseline = 'middle';
      ctx.fillText(why.text, x0 + 7, Math.min(y0, this.py0 + this.ph - h - 4) + h / 2 + 0.5);
      ctx.textBaseline = 'alphabetic';
    }
  }

  private drawCrop(c: Crop, i: number, x: number, y: number): void {
    const { ctx, T } = this;
    const a = this.anims.get(c.uid);
    const stage = a?.stage ?? stageOf(c);
    const s = this.cropSprite(c.kind, stage, (c.uid + i) % 2);
    const lift = (a?.lift ?? 0) * T;
    const sc = a?.scale ?? 1;
    const alpha = a?.alpha ?? 1;
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y - lift);
    if (a?.tilt) ctx.rotate(a.tilt);
    if (sc !== 1) ctx.scale(sc, sc);
    if (a && a.glow > 0.01) {
      const gr = ctx.createRadialGradient(0, -T * 0.3, 2, 0, -T * 0.3, T * 0.7);
      gr.addColorStop(0, `rgba(255, 226, 140, ${0.6 * a.glow})`);
      gr.addColorStop(1, 'rgba(255, 226, 140, 0)');
      ctx.fillStyle = gr;
      ctx.fillRect(-T, -T * 1.1, T * 2, T * 1.6);
    }
    ctx.drawImage(s.c, s.x0 * T, s.y0 * T, s.w * T, s.h * T);
    if (c.up) {
      // A small red stake label for Select stock.
      ctx.fillStyle = '#b8352a';
      ctx.fillRect(T * 0.28, -T * 0.16, T * 0.12, T * 0.07);
    }
    ctx.restore();
  }

  private moon(x: number, y: number, r: number): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#f6eed2';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + r * 0.45, y - r * 0.2, r * 0.85, 0, Math.PI * 2);
    ctx.fillStyle = '#3a4a78';
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = this.pal.ink;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private drawHighlights(_plots: readonly Plot[]): void {
    void _plots;
    const { ctx, T } = this;
    const h = this.hl;
    const rect = (i: number, inset: number) => {
      const c = this.centre(i);
      return [c.x - T / 2 + inset, c.y - T / 2 + inset, T - inset * 2, T - inset * 2] as const;
    };
    if (h.all) {
      ctx.fillStyle = h.water ? 'rgba(120, 175, 225, 0.22)' : 'rgba(255, 236, 170, 0.22)';
      ctx.fillRect(this.bx, this.by, T * this.cols, T * this.rows);
    }
    for (const i of h.valid) {
      const [x, y, w, hh] = rect(i, 5);
      ctx.fillStyle = 'rgba(255, 244, 205, 0.26)';
      ctx.fillRect(x, y, w, hh);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(60, 40, 20, 0.7)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(x, y, w, hh);
      ctx.setLineDash([]);
    }
    for (const i of h.area) {
      const [x, y, w, hh] = rect(i, 3);
      ctx.fillStyle = h.water ? 'rgba(70, 140, 225, 0.4)' : 'rgba(240, 186, 60, 0.46)';
      ctx.fillRect(x, y, w, hh);
      ctx.strokeStyle = h.water ? 'rgba(30, 80, 150, 0.75)' : 'rgba(140, 90, 10, 0.85)';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(x + 1, y + 1, w - 2, hh - 2);
    }
    const ring = (i: number, col: string, wd: number) => {
      const [x, y, w, hh] = rect(i, 3);
      ctx.strokeStyle = col;
      ctx.lineWidth = wd;
      ctx.strokeRect(x, y, w, hh);
    };
    if (h.hover !== null) ring(h.hover, h.deny ? '#b4472f' : '#2d2416', 2.6);
    if (h.cursor !== null && h.cursor !== h.hover) ring(h.cursor, 'rgba(45, 36, 22, 0.55)', 2);
  }

  // ---------------------------------------------------------------- particles

  emit(kind: Particle['kind'], x: number, y: number, n: number, opts: { spread?: number; up?: number; col?: string; size?: number; life?: number } = {}): void {
    const r = Math.random;
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const sp = (opts.spread ?? 40) * (0.4 + r() * 0.6);
      this.particles.push({
        x: x + (r() - 0.5) * (opts.size ?? 6),
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.6 - (opts.up ?? 60) * (0.5 + r() * 0.5),
        life: 0,
        max: (opts.life ?? 0.7) * (0.7 + r() * 0.5),
        kind,
        size: (opts.size ?? 4) * (0.6 + r() * 0.6),
        rot: r() * 6,
        col: opts.col ?? '#5d93c4',
      });
    }
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }

  private drawParticles(dt: number): void {
    const { ctx } = this;
    let w = 0;
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.max) continue;
      const k = p.life / p.max;
      const grav = p.kind === 'drop' ? 420 : p.kind === 'dust' ? 160 : p.kind === 'smoke' ? -30 : p.kind === 'feather' ? 30 : p.kind === 'leaf' ? 60 : 40;
      p.vy += grav * dt;
      p.vx *= 1 - dt * (p.kind === 'smoke' || p.kind === 'feather' ? 2 : 0.6);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += dt * (p.kind === 'feather' || p.kind === 'leaf' ? 4 : 1);
      const a = 1 - k * k;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.col;
      if (p.kind === 'spark') {
        const s = p.size * (1 - k * 0.5);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const an = (i / 4) * Math.PI * 2;
          ctx.lineTo(Math.cos(an) * s, Math.sin(an) * s);
          ctx.lineTo(Math.cos(an + Math.PI / 4) * s * 0.3, Math.sin(an + Math.PI / 4) * s * 0.3);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.kind === 'drop') {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size * 0.35, p.size * 0.6, Math.atan2(p.vx, -p.vy), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'feather' || p.kind === 'leaf') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.kind === 'smoke' ? 0.6 + k : 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      this.particles[w++] = p;
    }
    this.particles.length = w;
    ctx.globalAlpha = 1;
  }

  shake(i: number): void {
    this.shakePlot = i;
    this.shakeT = 0.35;
  }
}


const FRAME_M = 9;

function frameW(T: number): number {
  return Math.max(5, T * 0.09);
}

function captionSize(T: number): number {
  return Math.round(Math.max(11, T * 0.16));
}

/** The margin under the bed that keeps the caption clear of the printed frame: bed frame, caption with its descenders, the gap, the frame's two rules, and air. */
function captionBand(T: number): number {
  return frameW(T) + captionSize(T) * 1.35 + 7 + FRAME_M + 3.5 + 4;
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
}
