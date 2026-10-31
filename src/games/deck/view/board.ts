// The plot, painted as a plate in an old almanac: a deckled page laid on the
// table, a ruled frame, a timber bed of soil squares and the crops drawn with
// the almanac's own botanical paintings. The page and soil are cached and
// repainted only when a plot's soil changes; crops come from a sprite cache.

import { fill, ink, type Ctx } from '../../../render2d/brush';
import { PALETTES, type Palette } from '../../../render2d/palette';
import { makePaper } from '../../../render2d/paper';
import { paintScarecrow } from '../../../render2d/props';
import { hash3, Rng } from '../../../render2d/rng';
import { stageOf, type Crop, type Plot, type Season, type SeedId } from '../rules';
import { paintSeedCrop } from './crops';
import { paintHiveOnPlot, paintPests } from './glyphs';

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
    const botM = compact ? 34 : 46;
    const T = Math.floor(Math.min((w - 2 * sideM - 12) / cols, (h - topM - botM - 12) / rows));
    this.T = Math.max(30, T);
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
    const m = 9;
    g.strokeStyle = pal.ink;
    g.globalAlpha = 0.75;
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

    // Key letters along the top and numbers down the side, like a plate's key.
    g.fillStyle = pal.inkSoft;
    g.font = `italic 500 ${Math.round(Math.max(10, T * 0.14))}px 'Fraunces Variable', Georgia, serif`;
    g.textAlign = 'center';
    for (let c = 0; c < this.cols; c++) g.fillText('ABCDE'[c], this.bx + (c + 0.5) * T, this.by - fw - 5);
    if (this.bx - this.px0 > 28) {
      g.textAlign = 'right';
      for (let rr = 0; rr < this.rows; rr++) g.fillText(String(rr + 1), this.bx - fw - 5, this.by + (rr + 0.55) * T);
    }

    // Caption.
    g.fillStyle = pal.ink;
    g.textAlign = 'center';
    const cap = Math.round(Math.max(11, T * 0.16));
    g.font = `italic 500 ${cap}px 'Fraunces Variable', Georgia, serif`;
    g.fillText(`Plate ${ROMAN[(this.plate - 1) % ROMAN.length]}. The kitchen plot in ${SEASON_WORD[this.season]}.`, this.px0 + this.pw / 2, this.by + bh + fw + cap + 7);
  }

  private paintSoil(g: Ctx, c: number, rr: number, p: Plot, px: number, pal: Palette): void {
    const r = new Rng(hash3(c, rr, 303));
    const x = c;
    const y = rr;
    const gap = 0.035;
    // The soil square.
    g.beginPath();
    g.rect(x + gap, y + gap, 1 - gap * 2, 1 - gap * 2);
    fill(g, p.wet ? pal.soilWet : pal.soilDry);
    g.save();
    g.clip();
    // Mottle.
    for (let k = 0; k < 10; k++) {
      g.beginPath();
      g.ellipse(x + r.next(), y + r.next(), 0.12 + r.next() * 0.16, 0.06 + r.next() * 0.08, r.next() * 3, 0, Math.PI * 2);
      fill(g, p.wet ? pal.soilMoist : pal.soilDamp, 0.22);
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
      ink(g, pal.soilShadow, Math.max(px * 1.6, 0.026), p.wet ? 0.5 : 0.75);
      g.beginPath();
      g.moveTo(x + 0.1, fy - 0.035);
      g.lineTo(x + 0.9, fy - 0.035);
      ink(g, p.wet ? pal.sheen : pal.soilRidge, Math.max(px * 1.2, 0.018), p.wet ? 0.35 : 0.65);
    }
    if (p.wet) {
      // A sheen and a few beads of water.
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.ellipse(x + 0.2 + r.next() * 0.6, y + 0.2 + r.next() * 0.6, 0.04 + r.next() * 0.04, 0.012, -0.2, 0, Math.PI * 2);
        fill(g, pal.sheen, 0.55);
      }
    }
    if (p.mulch > 0) {
      // Straw laid over the soil.
      g.beginPath();
      for (let k = 0; k < 34; k++) {
        const sx = x + 0.1 + r.next() * 0.8;
        const sy = y + 0.1 + r.next() * 0.8;
        const a = r.jit(0.9);
        const l = 0.08 + r.next() * 0.12;
        g.moveTo(sx, sy);
        g.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l);
      }
      ink(g, '#e2bf68', Math.max(px * 2, 0.022), 0.95);
      ink(g, pal.ink, Math.max(px * 0.6, 0.006), 0.4);
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
    const key = `${this.season}|${this.plate}|${this.cols}|${this.T}|${plots.map((p) => `${p.wet ? 1 : 0}${p.mulch > 0 ? 1 : 0}`).join('')}`;
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

    // Ripe-tonight moons and pests on top.
    for (let i = 0; i < plots.length; i++) {
      const c = plots[i].crop;
      if (!c) continue;
      const ctr = this.centre(i);
      if (this.tonight[i] && this.night < 0.05) this.moon(ctr.x + T * 0.36, ctr.y + T * 0.36, T * 0.085);
      if (c.pest) {
        const a = this.anims.get(c.uid);
        const s = this.sprite(`pest:${c.uid % 5}`, -0.36, -0.42, 0.36, 0.06, (g, px) => paintPests(g, px, 40 + (c.uid % 5)));
        const b = this.base(i);
        ctx.globalAlpha = a ? a.alpha : 1;
        ctx.drawImage(s.c, b.x + s.x0 * T, b.y + s.y0 * T - (a?.lift ?? 0) * T, s.w * T, s.h * T);
        ctx.globalAlpha = 1;
      }
    }

    this.drawParticles(dt);

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
      ctx.fillStyle = h.water ? 'rgba(70, 140, 225, 0.36)' : 'rgba(255, 220, 120, 0.3)';
      ctx.fillRect(x, y, w, hh);
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

