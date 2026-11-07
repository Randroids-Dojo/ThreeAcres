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
import { stageOf, type Crop, type Mark, type Plot, type Season, type SeedId, type Twist } from '../rules';
import { CROP_SCALE } from '../../../render2d/crops';
import { CROP_COLOR, paintSeedCrop, paintSeedProduce } from './crops';
import { paintHiveOnPlot, paintPests } from './glyphs';
import { basket, bloom, BLOOM, bug, coin, moon, num, numWidth } from './icons';

export type PreviewMark = Mark;

export interface Preview {
  marks: PreviewMark[];
  /**
   * A seed on the plot under the finger: what it would score there (late: it is pulled next season, the plot
   * carrying over; never: it ripens after the run's last night, so no slip, only the reason).
   */
  total: { plot: number; yield: number; bloom: number; score: number; late?: boolean; never?: boolean } | null;
  /** Bloom has been introduced: show bloom with the total. */
  bloom: boolean;
  /** Why a greyed bonus won't pay, said under the aimed plot: "The radish is pulled before the carrot ripens." */
  reason: { plot: number; text: string } | null;
  /** A short line under the aimed plot when the card would do nothing there. */
  none: { plot: number | null; text: string } | null;
  /** Plots whose crop the play would bring in tonight: they get tonight's moon, ringed. */
  tonight: number[];
  /** With Market Day kept: where its x2 stamp would fall tonight after the play. */
  market: number[];
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
  /** The highest painted pixel, in plot units from the base (negative is up): measured once, for crops. */
  top?: number;
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
  /** With Market Day kept: the plots whose harvest tonight is a fifth (tenth, fifteenth), stamped x2. */
  market: number[] = [];
  /** Extra nights each plot grows tonight (the watering can). */
  boost: number[] = [];
  /** What the held card would do, or null. */
  preview: Preview | null = null;
  /** A crow sits on the bed's corner: one comes tonight. */
  crow = false;
  /** Round 9: with a crow about, the plots a scarecrow keeps: washed, so a ripe crop outside them shows. */
  guard: number[] = [];
  /** This season's twist: frost paints the bottom row; a buyer or a glut stamps a coin by each crop of its kind. */
  twist: Twist | null = null;
  /** Coin stamps painted this frame, for checks. */
  coins: { x: number; y: number; w: number; h: number }[] = [];
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

  /** The caption's box, CSS px from the canvas top left, for checks (a lifted card's key number must stay off it). */
  captionBox(): { x: number; y: number; w: number; h: number } {
    const size = captionSize(this.T);
    this.ctx.save();
    this.ctx.font = `italic 500 ${size}px 'Fraunces Variable', Georgia, serif`;
    const w = this.ctx.measureText(this.caption).width;
    this.ctx.restore();
    return { x: this.px0 + this.pw / 2 - w / 2, y: this.captionBaseline - size * 0.8, w, h: size * 1.05 };
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
    const s = this.sprite(`${kind}:${stage}:${variant}`, -0.8, -2.05, 0.8, 0.35, (g, px) => {
      g.save();
      paintSeedCrop(g, kind, stage, this.pal, px, 1000 + variant * 37 + stage);
      g.restore();
      if (stage === 0) this.paintPacket(g, kind, px);
    });
    if (s.top === undefined) s.top = paintedTop(s);
    return s;
  }

  /**
   * A just-sown seed's packet, larger, with the crop painted on it, so a radish sown today and a strawberry sown today
   * no longer look the same (the fifth playtest: "the same red packet on a stake"). It covers the shared packet the
   * almanac renderer paints at (0.17, -0.42).
   */
  private paintPacket(g: Ctx, kind: SeedId, px: number): void {
    const pal = this.pal;
    // The renderer scales each crop (mint, garlic, wheat and chili borrow the radish's mound): match it, to cover its packet.
    const sc = CROP_SCALE[kind as keyof typeof CROP_SCALE] ?? CROP_SCALE.radish;
    g.save();
    g.scale(sc, sc);
    px /= sc;
    g.translate(0.17, -0.43);
    g.rotate(0.06);
    const w = 0.25;
    const h = 0.28;
    g.beginPath();
    g.rect(-w / 2, -h / 2, w, h);
    fill(g, '#f6eedb');
    ink(g, pal.ink, Math.max(px * 1.3, 0.012), 0.9);
    g.beginPath();
    g.rect(-w / 2, -h / 2, w, h * 0.24);
    fill(g, CROP_COLOR[kind]);
    ink(g, pal.ink, Math.max(px, 0.008), 0.7);
    // The crop itself, as on the card's packet.
    g.save();
    g.translate(0, h * 0.12);
    g.scale(0.5, 0.5);
    paintSeedProduce(g, kind, pal, px / 0.5);
    g.restore();
    g.restore();
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
    this.stakes = [];
    this.stamps = [];
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

    this.drawHighlights(plots);

    // Frost on a row (a twist): an icy wash and rime on its bare plots; nothing can be sown there.
    if (this.twist?.id === 'frost') this.drawFrost(plots);
    if (this.crow && this.night < 0.05 && this.guard.length) this.drawGuard();
    // The soil's washes first: a passing splash, and the sickly wash of pests.
    for (let i = 0; i < plots.length; i++) {
      const c = this.centre(i);
      if (this.splash[i] > 0) {
        ctx.fillStyle = `rgba(180, 215, 240, ${this.splash[i] * 0.35})`;
        ctx.fillRect(c.x - T / 2 + 2, c.y - T / 2 + 2, T - 4, T - 4);
      }
      if (plots[i].crop?.pest) {
        // A sickly wash on the soil, so a pested plot reads from across the table.
        ctx.fillStyle = 'rgba(196, 168, 40, 0.3)';
        ctx.fillRect(c.x - T / 2 + 2, c.y - T / 2 + 2, T - 4, T - 4);
      }
    }

    // Crops and objects. Each is drawn inside its own plot; what a tall one (a bean pole, a sunflower, corn, a
    // scarecrow's hat) reaches above its plot is drawn first, behind everything, and faded where the plot above
    // holds something, so the crop above is always on top. Tall crops used to be painted over the row above: a
    // young sunflower at B3 disappeared behind a bean pole, and column C read as one vine from row 1 to row 3.
    // A crop being scored (lifted and glowing), taken by a crow or flattened is drawn whole, on top of the rest.
    const loose = (c: Crop | null) => {
      const a = c ? this.anims.get(c.uid) : undefined;
      return !!a && (a.glow > 0.01 || a.lift > 0.1 || Math.abs(a.tilt) > 0.01);
    };
    const taken = (i: number) => i >= 0 && i < plots.length && (!!plots[i].crop || !!plots[i].obj);
    for (const part of ['over', 'in'] as const) {
      for (let i = 0; i < plots.length; i++) {
        const p = plots[i];
        if (!p.obj && (!p.crop || loose(p.crop))) continue;
        if (part === 'over' && !p.obj) continue;
        const col = i % this.cols;
        const row = Math.floor(i / this.cols);
        const x0 = this.bx + col * T;
        const top = this.by + row * T;
        const bands = part === 'in' ? [{ y: top, h: T, a: 1 }] : [1, 2].map((k) => ({ y: top - k * T - (k === 2 ? T : 0), h: k === 2 ? 2 * T : T, a: row - k >= 0 && taken(i - k * this.cols) ? OVERHANG_FADE : 1 }));
        for (const band of bands) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(x0, band.y, T, band.h);
          ctx.clip();
          ctx.globalAlpha = band.a;
          this.drawPlot(p, i, part);
          ctx.restore();
        }
      }
    }
    for (let i = 0; i < plots.length; i++) if (plots[i].crop && loose(plots[i].crop)) this.drawCrop(plots[i].crop!, i, this.base(i).x, this.base(i).y, 'all');

    // Watered plots: a drop in the corner while they wait for tonight's extra night.
    for (let i = 0; i < plots.length; i++) {
      if (!this.boost[i] || this.night > 0.05) continue;
      const ctr = this.centre(i);
      this.drop(ctr.x - T * 0.36, ctr.y + T * 0.34, T * 0.07);
    }

    // Ripe-tonight moons and pests on top: a pested crop gets a badge with the nights it pays half. A held card that
    // would bring a crop in tonight gives it the moon now, ringed; Market Day stamps the crops tonight's harvest
    // reaches fifth (where the stamp would move to, while a card is aimed).
    const day = this.night < 0.05;
    const comes = day && this.preview ? this.preview.tonight : [];
    const market = day ? (this.preview ? this.preview.market : this.market) : [];
    this.coins = [];
    for (let i = 0; i < plots.length; i++) {
      const c = plots[i].crop;
      if (!c) continue;
      const ctr = this.centre(i);
      if ((this.tonight[i] || comes.includes(i)) && day) this.moon(ctr.x + T * 0.36, ctr.y + T * 0.36, T * 0.085, comes.includes(i) && !this.tonight[i]);
      const tw = this.twist;
      if (day && tw && (tw.id === 'buyer' || tw.id === 'glut') && tw.crop === c.kind) this.coinStamp(i, tw.id === 'glut', c.pest > 0);
      if (market.includes(i)) this.marketStamp(ctr.x + T * 0.36 - T * 0.12, ctr.y + T * 0.36);
      if (c.pest) {
        const a = this.anims.get(c.uid);
        const s = this.sprite(`pest:${c.uid % 5}`, -0.44, -0.8, 0.44, 0.1, (g, px) => paintPests(g, px, 40 + (c.uid % 5)));
        const b = this.base(i);
        ctx.globalAlpha = a ? a.alpha : 1;
        ctx.drawImage(s.c, b.x + s.x0 * T, b.y + s.y0 * T - (a?.lift ?? 0) * T, s.w * T, s.h * T);
        ctx.globalAlpha = 1;
        if (day) this.pestBadge(i, c.pest);
      }
    }
    this.drawCrow();
    // The key goes over the crops, on a paper chip, so a bean pole or a scarecrow's hat never hides a letter.
    this.drawKey();

    this.drawPreview();
    this.drawParticles(dt);
  }

  /**
   * Key letters along the top and numbers down the side, like a plate's key.
   * They are painted after the crops on a small paper chip, so a tall crop in
   * the first row (a bean pole, a scarecrow's hat) passes behind them. They fade
   * at night, when slips fly over them.
   */
  private drawKey(): void {
    const { ctx } = this;
    const a = Math.max(0, 1 - this.night * 1.8);
    if (a <= 0.01) return;
    const boxes = this.keyBoxes();
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `italic 600 ${this.keySize}px 'Fraunces Variable', Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of boxes) {
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, b.h * 0.3);
      ctx.fillStyle = this.pal.paper;
      ctx.globalAlpha = a * 0.92;
      ctx.fill();
      ctx.globalAlpha = a;
      ctx.fillStyle = this.pal.ink;
      ctx.fillText(b.text, b.x + b.w / 2, b.y + b.h / 2 + 0.5);
    }
    ctx.restore();
  }

  /** The key's type size, CSS px. */
  private get keySize(): number {
    return Math.round(Math.max(11, this.T * 0.15));
  }

  /** Where each key letter and number sits, with its paper chip, CSS px from the canvas top left. */
  keyBoxes(): { text: string; x: number; y: number; w: number; h: number }[] {
    const { T } = this;
    const fw = frameW(T);
    const size = this.keySize;
    const h = Math.round(size * 1.3);
    const w = Math.round(size * 1.25);
    const out: { text: string; x: number; y: number; w: number; h: number }[] = [];
    for (let c = 0; c < this.cols; c++) out.push({ text: 'ABCDE'[c], x: this.bx + (c + 0.5) * T - w / 2, y: this.by - fw - 4 - h, w, h });
    if (this.bx - this.px0 > 28) for (let rr = 0; rr < this.rows; rr++) out.push({ text: String(rr + 1), x: this.bx - fw - 4 - w, y: this.by + (rr + 0.5) * T - h / 2, w, h });
    return out;
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

  /**
   * Round 9: the plots a scarecrow keeps while a crow is about, a warm straw wash with a dashed edge round the kept
   * ground, so a ripe crop outside it reads at a glance (the ninth playtest's carrot on D4 sat outside it unseen).
   */
  private drawGuard(): void {
    const { ctx, T } = this;
    const kept = new Set(this.guard);
    ctx.save();
    ctx.fillStyle = 'rgba(232, 204, 120, 0.2)';
    for (const i of kept) {
      const x = this.bx + (i % this.cols) * T;
      const y = this.by + Math.floor(i / this.cols) * T;
      ctx.fillRect(x + 2, y + 2, T - 4, T - 4);
    }
    // The edge of the kept ground: a dashed line wherever a kept plot meets one that is not.
    ctx.strokeStyle = 'rgba(122, 88, 30, 0.75)';
    ctx.lineWidth = Math.max(1.2, T * 0.018);
    ctx.setLineDash([T * 0.08, T * 0.06]);
    ctx.beginPath();
    for (const i of kept) {
      const c = i % this.cols;
      const r = Math.floor(i / this.cols);
      const x = this.bx + c * T + 2;
      const y = this.by + r * T + 2;
      const w = T - 4;
      const out = (dc: number, dr: number) => {
        const cc = c + dc;
        const rr = r + dr;
        return cc < 0 || rr < 0 || cc >= this.cols || rr >= this.rows || !kept.has(rr * this.cols + cc);
      };
      if (out(0, -1)) (ctx.moveTo(x, y), ctx.lineTo(x + w, y));
      if (out(0, 1)) (ctx.moveTo(x, y + w), ctx.lineTo(x + w, y + w));
      if (out(-1, 0)) (ctx.moveTo(x, y), ctx.lineTo(x, y + w));
      if (out(1, 0)) (ctx.moveTo(x + w, y), ctx.lineTo(x + w, y + w));
    }
    ctx.stroke();
    ctx.restore();
  }

  /** The frosted row (the one the run sowed most): a pale icy wash and a few rime stars, so it reads as no place to sow. */
  private drawFrost(plots: readonly Plot[]): void {
    const { ctx, T } = this;
    const r = Math.min(this.rows - 1, this.twist?.row ?? this.rows - 1);
    for (let c = 0; c < this.cols; c++) {
      const i = r * this.cols + c;
      const x = this.bx + c * T;
      const y = this.by + r * T;
      ctx.fillStyle = plots[i]?.crop || plots[i]?.obj ? 'rgba(214, 232, 246, 0.32)' : 'rgba(222, 238, 250, 0.62)';
      ctx.fillRect(x + 2, y + 2, T - 4, T - 4);
      ctx.save();
      ctx.strokeStyle = 'rgba(70, 120, 170, 0.75)';
      ctx.lineWidth = Math.max(1, T * 0.012);
      for (const [fx, fy, fr] of [[0.25, 0.3, 0.07], [0.7, 0.22, 0.05], [0.55, 0.7, 0.08], [0.18, 0.78, 0.05]] as const) {
        const cx = x + fx * T;
        const cy = y + fy * T;
        const rr = fr * T;
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const a = (k * Math.PI) / 3;
          ctx.moveTo(cx - Math.cos(a) * rr, cy - Math.sin(a) * rr);
          ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** A buyer's gold coin (or a glut's grey one) in a crop's top left, after its pest badge if it has one. */
  private coinStamp(i: number, grey: boolean, pested: boolean): void {
    const { ctx, T } = this;
    const c = this.centre(i);
    const size = Math.max(11, Math.round(T * 0.15));
    const d = size + 4;
    const x = c.x - T / 2 + 3 + (pested ? size * 2.6 + 8 : 0);
    const y = c.y - T / 2 + 3;
    coin(ctx, x + d / 2, y + d / 2, d, grey);
    num(ctx, grey ? '½' : '2', x + d / 2 - numWidth(ctx, grey ? '½' : '2', size * 0.7) / 2, y + d / 2, size * 0.7, grey ? '#3a3630' : '#5a3a0a');
    this.coins.push({ x, y, w: d, h: d });
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
    this.chips = [];
    if (!pv || this.night > 0.05) return;
    const { ctx, T } = this;
    const size = Math.max(11, Math.round(T * 0.15));
    let at = -1;
    // A chip: a gain; greyed, dashed and struck (lost: the night won't pay it); greyed and dashed, not struck (risk:
    // round 9, from a crop a crow about tonight may take first); or a neighbour's new total on a dark chip.
    const chip = (x: number, y: number, text: string, col: string, icon: (cx: number, cy: number) => void, kind: 'lost' | 'risk' | false = false, dark = false): number => {
      const lost = kind === 'lost';
      const grey = !!kind;
      const tw = numWidth(ctx, text, size);
      const w = tw + size * 1.25 + 6;
      const h = size + 6;
      this.chips.push({ plot: at, text, kind: dark ? 'total' : kind || 'gain', x: x - w, y, w, h });
      ctx.beginPath();
      ctx.roundRect(x - w, y, w, h, 4);
      ctx.fillStyle = dark ? 'rgba(42, 30, 18, 0.92)' : grey ? 'rgba(226, 220, 204, 0.94)' : 'rgba(251, 244, 222, 0.96)';
      ctx.fill();
      ctx.strokeStyle = dark ? 'rgba(42, 30, 18, 0.92)' : grey ? '#8c8676' : col;
      ctx.lineWidth = 1.2;
      if (grey) ctx.setLineDash([3, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (grey) ctx.globalAlpha = lost ? 0.55 : 0.75;
      num(ctx, text, x - w + 3, y + h / 2, size, dark ? '#f6ecd0' : grey ? '#5a5448' : col);
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
      at = m.plot;
      // Round 9: what comes from a crop the crow may take first is shown apart, greyed, not struck.
      const r = m.risk;
      const sure = r ? { yield: m.yield - r.yield, bloom: m.bloom - r.bloom, times: m.times / r.times } : m;
      const tiny = (v: number) => Math.abs(v) < 1e-6;
      if (!tiny(sure.yield)) y += chip(x, y, sign(sure.yield), '#2e2418', (cx, cy) => basket(ctx, cx, cy, size * 1.05));
      if (!tiny(sure.bloom)) y += chip(x, y, sign(sure.bloom), BLOOM, (cx, cy) => bloom(ctx, cx, cy, size * 1.05));
      if (Math.abs(sure.times - 1) > 1e-6) y += chip(x, y, `×${fmt(sure.times)}`, BLOOM, (cx, cy) => bloom(ctx, cx, cy, size * 1.05));
      if (r) {
        if (!tiny(r.yield)) y += chip(x, y, sign(r.yield), '#2e2418', (cx, cy) => basket(ctx, cx, cy, size * 1.05), 'risk');
        if (!tiny(r.bloom)) y += chip(x, y, sign(r.bloom), BLOOM, (cx, cy) => bloom(ctx, cx, cy, size * 1.05), 'risk');
        if (r.times > 1 + 1e-6) y += chip(x, y, `×${fmt(r.times)}`, BLOOM, (cx, cy) => bloom(ctx, cx, cy, size * 1.05), 'risk');
      }
      if (m.nights) y += chip(x, y, `+${m.nights}`, '#3a4a78', (cx, cy) => moon(ctx, cx, cy, size * 0.42));
      const l = m.lost;
      if (l) {
        if (l.yield) y += chip(x, y, sign(l.yield), '#2e2418', (cx, cy) => basket(ctx, cx, cy, size * 1.05), 'lost');
        if (l.bloom) y += chip(x, y, sign(l.bloom), BLOOM, (cx, cy) => bloom(ctx, cx, cy, size * 1.05), 'lost');
        if (l.times > 1 + 1e-6) y += chip(x, y, `×${fmt(l.times)}`, BLOOM, (cx, cy) => bloom(ctx, cx, cy, size * 1.05), 'lost');
      }
      // A neighbour the play changes shows what it will pay now, on a dark chip like the aimed seed's own slip, by a
      // coin: the basket means yield everywhere else (the seventh playtest read "14 basket" as yield).
      if (m.total !== undefined) y += chip(x, y, String(m.total), '#f6ecd0', (cx, cy) => coin(ctx, cx, cy, size * 0.95), false, true);
    }
    const t = pv.total && !pv.total.never ? pv.total : null;
    let under = -1;
    let slip: { x: number; y: number; w: number; h: number } | null = null;
    this.totalSlip = null;
    this.reasonBox = null;
    if (t) {
      const c = this.centre(t.plot);
      // The arithmetic only when bloom changes the total; otherwise just what it pays. A crop pulled
      // next season shows what it will pay then, on a grey slip: it counts toward next season's quota.
      const showBloom = t.bloom !== 1;
      const big = Math.max(12, Math.round(T * 0.17));
      const parts = showBloom ? [fmt(t.yield), '×', fmt(t.bloom), '=', String(t.score)] : [String(t.score)];
      const widths = parts.map((s) => numWidth(ctx, s, big));
      const icon = big * 1.1;
      // The yield by its basket when the arithmetic shows, and the coins it pays by a coin.
      const w = widths.reduce((a, b) => a + b, 0) + (parts.length - 1) * 3 + icon * (showBloom ? 2 : 1) + 12 + (showBloom ? 3 : 0);
      const h = big + 8;
      // Straddling the plot's bottom edge, clear of a thumb on the plot. Round 12: where it covers no chip (the twelfth
      // playtest's "3 x 3.2 = 10" hid the "+2" on the plot below, and a "287" the "x2" beside it on five columns): inside the
      // plot's foot, then shifted to the plot's left or right edge, then straddling its top edge or its middle.
      const keys = this.keyBoxes();
      const cap = this.captionBox();
      const clampX = (x: number) => Math.max(this.px0 + 2, Math.min(this.px0 + this.pw - 2 - w, x));
      const xs = [c.x - w / 2, c.x - T / 2 + 2, c.x + T / 2 - 2 - w].map(clampX);
      const ys = [c.y + T / 2 - h * 0.45, c.y + T / 2 - h - 2, c.y - T / 2 - h * 0.55, c.y - h / 2];
      const spots = ys.flatMap((y) => xs.map((x) => ({ x, y })));
      const covers = (r: { x: number; y: number }) => [...this.chips, ...keys, cap].some((b) => r.x < b.x + b.w - 0.5 && r.x + w > b.x + 0.5 && r.y < b.y + b.h - 0.5 && r.y + h > b.y + 0.5);
      const spot = spots.find((r) => !covers(r)) ?? spots[0];
      const x0 = spot.x;
      const y0 = spot.y;
      ctx.beginPath();
      ctx.roundRect(x0, y0, w, h, 5);
      // Round 10: a seed that ripens next season shows its pay on a pale slip with a dashed edge and grey ink, clearly
      // not tonight's dark slip (the tenth playtest read a late corn's "12 x 3.2 = 38" as this season's; the grey was
      // 'rgba(90, 84, 72)', a shade off the usual dark brown).
      ctx.fillStyle = t.late ? 'rgba(226, 219, 202, 0.95)' : 'rgba(42, 30, 18, 0.92)';
      ctx.fill();
      if (t.late) {
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = 'rgba(70, 62, 50, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
      const ink = t.late ? '#4f473b' : '#f6ecd0';
      let x = x0 + 6;
      if (showBloom) {
        basket(ctx, x + icon / 2, y0 + h / 2, icon * 0.95, ink);
        x += icon + 2;
      }
      parts.forEach((s, k) => {
        const col = showBloom && k === 2 ? (t.late ? '#8a5a60' : '#f39aa8') : ink;
        if (k === parts.length - 1) {
          coin(ctx, x + icon / 2, y0 + h / 2, icon * 0.85);
          x += icon + 2;
        }
        num(ctx, s, x, y0 + h / 2, big, col);
        x += widths[k] + 3;
      });
      slip = { x: x0, y: y0, w, h };
      this.totalSlip = { ...slip, text: parts.join(' '), coin: true, late: !!t.late };
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
      // Round 7: where it covers no chip and not the aimed seed's slip (the seventh playtest's reason hid the beans'
      // +2 bloom and their new total). Under the slip first, then above the aimed plot, then the plate's foot.
      const clampY = (y: number) => Math.max(this.py0 + 2, Math.min(y, this.py0 + this.ph - h - 4));
      const bedTop = this.by;
      const bedFoot = this.by + this.rows * T;
      const tries = [under >= 0 ? under : at.y + T / 2 + 2, at.y - T / 2 - h - 2, bedFoot + 2, bedTop - h - 2, at.y - h / 2, at.y + T / 2 - h - 2, at.y - T / 2 + 2].map(clampY);
      // Round 9: never over the plate's caption either (the ninth playtest's reason line sat on it). Round 12: nor the key
      // letters and numbers ("Ripens next season." sat over the C of a first-row plot).
      const cap = this.captionBox();
      const keys = this.keyBoxes();
      const hits = (y: number) => [...this.chips, ...(slip ? [slip] : []), cap, ...keys].some((r) => x0 < r.x + r.w && x0 + w > r.x && y < r.y + r.h && y + h > r.y);
      const y0 = tries.find((y) => !hits(y)) ?? tries[0];
      ctx.beginPath();
      ctx.roundRect(x0, y0, w, h, 3);
      ctx.fillStyle = 'rgba(246, 238, 214, 0.97)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(58, 38, 20, 0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#3a2614';
      ctx.textBaseline = 'middle';
      ctx.fillText(why.text, x0 + 7, y0 + h / 2 + 0.5);
      ctx.textBaseline = 'alphabetic';
      this.reasonBox = { x: x0, y: y0, w, h, text: why.text };
    }
  }

  /** A plot's object and crop, or the part of them above the plot (over) or inside it (in); the caller clips. */
  private drawPlot(p: Plot, i: number, part: 'over' | 'in'): void {
    const { ctx, T } = this;
    const b = this.base(i);
    const shake = i === this.shakePlot && this.shakeT > 0 ? Math.sin(this.shakeT * 60) * this.shakeT * 14 : 0;
    if (p.obj) {
      const s = p.obj === 'scarecrow'
        ? this.sprite('scarecrow', -0.6, -1.15, 0.6, 0.25, (g, px) => {
            // Round 11: fitted inside its own plot, like a crop: its hat tangled with the crop above (the eleventh playtest).
            g.scale(SCARECROW_FIT, SCARECROW_FIT);
            paintScarecrow(g, this.pal, px / SCARECROW_FIT);
          })
        : this.sprite('beehive', -0.6, -1.0, 0.6, 0.25, (g, px) => paintHiveOnPlot(g, px, this.pal.ink));
      ctx.drawImage(s.c, b.x + s.x0 * T + shake, b.y + s.y0 * T, s.w * T, s.h * T);
    }
    // A crop is drawn whole inside its plot (fitted); only an object's top (a scarecrow's hat) reaches above it.
    if (p.crop && part === 'in') this.drawCrop(p.crop, i, b.x + shake, b.y, part);
  }

  /** Checks only: the plot rect a crop is kept inside, CSS px from the canvas top left. */
  plotRect(i: number): { x: number; y: number; w: number; h: number } {
    return { x: this.bx + (i % this.cols) * this.T, y: this.by + Math.floor(i / this.cols) * this.T, w: this.T, h: this.T };
  }

  private drawCrop(c: Crop, i: number, x: number, y: number, part: 'over' | 'in' | 'all'): void {
    const { ctx, T } = this;
    const a = this.anims.get(c.uid);
    const stage = a?.stage ?? stageOf(c);
    const s = this.cropSprite(c.kind, stage, (c.uid + i) % 2);
    const lift = (a?.lift ?? 0) * T;
    const sc = a?.scale ?? 1;
    const alpha = a?.alpha ?? 1;
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y - lift);
    if (a?.tilt) ctx.rotate(a.tilt);
    // Round 7: a tall crop (beans on their pole, a sunflower, corn) is drawn to fit its own plot, so it never reaches
    // over the plot above or the key letters (the seventh playtest's bean pole stood over row 1 and the letter D).
    const fit = s.top !== undefined && s.top < PLOT_TOP ? PLOT_TOP / s.top : 1;
    if (sc * fit !== 1) ctx.scale(sc * fit, sc * fit);
    if (a && a.glow > 0.01) {
      const gr = ctx.createRadialGradient(0, -T * 0.3, 2, 0, -T * 0.3, T * 0.7);
      gr.addColorStop(0, `rgba(255, 226, 140, ${0.6 * a.glow})`);
      gr.addColorStop(1, 'rgba(255, 226, 140, 0)');
      ctx.fillStyle = gr;
      ctx.fillRect(-T, -T * 1.1, T * 2, T * 1.6);
    }
    ctx.drawImage(s.c, s.x0 * T, s.y0 * T, s.w * T, s.h * T);
    ctx.restore();
    // Select stock: a plant label on a stake by the crop, stamped with a red star (the face's red stamp, at plot size).
    if (c.up && alpha > 0.5 && part !== 'over') this.selectStake(x - T * 0.34, y - lift);
  }

  /** The label staked by an improved crop: a cream tag with a red ring and star, at least 14 px across. */
  private selectStake(x: number, y: number): void {
    const { ctx, T } = this;
    const r = Math.max(7, T * 0.1);
    const cy = y - T * 0.3;
    ctx.save();
    ctx.strokeStyle = '#6a4a2a';
    ctx.lineWidth = Math.max(1.2, T * 0.018);
    ctx.beginPath();
    ctx.moveTo(x, y - T * 0.02);
    ctx.lineTo(x, cy + r);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#f8f0d8';
    ctx.fill();
    ctx.strokeStyle = '#b8352a';
    ctx.lineWidth = Math.max(1.3, r * 0.17);
    ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const an = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 ? r * 0.3 : r * 0.68;
      if (k) ctx.lineTo(x + Math.cos(an) * rr, cy + Math.sin(an) * rr);
      else ctx.moveTo(x + Math.cos(an) * rr, cy + Math.sin(an) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = '#b8352a';
    ctx.fill();
    ctx.restore();
    this.stakes.push({ x: x - r, y: cy - r, w: r * 2, h: r * 2 });
  }

  /** Select stakes painted this frame, for checks. */
  stakes: { x: number; y: number; w: number; h: number }[] = [];

  /** The aimed seed's slip and the reason line painted this frame, for checks (canvas CSS px). */
  totalSlip: { x: number; y: number; w: number; h: number; text: string; coin: boolean; late?: boolean } | null = null;
  reasonBox: { x: number; y: number; w: number; h: number; text: string } | null = null;

  /** Preview chips painted this frame, for checks: a gain, a greyed bonus, or a neighbour's new total (canvas px). */
  chips: { plot: number; text: string; kind: 'gain' | 'lost' | 'risk' | 'total'; x: number; y: number; w: number; h: number }[] = [];

  /** Market Day's stamp: a red-ringed x2 to the left of the crop's moon, on the harvest it doubles tonight. */
  private marketStamp(x: number, y: number): void {
    const { ctx, T } = this;
    const size = Math.max(10, Math.round(T * 0.13));
    const text = '×2';
    const w = numWidth(ctx, text, size) + 8;
    const h = size + 5;
    ctx.save();
    ctx.translate(x - w, y - h / 2);
    ctx.rotate(-0.06);
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 3);
    ctx.fillStyle = '#fbf1d8';
    ctx.fill();
    ctx.strokeStyle = BLOOM;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    num(ctx, text, 4, h / 2, size, BLOOM);
    ctx.restore();
    this.stamps.push({ x: x - w, y: y - h / 2, w, h });
  }

  /** Market stamps painted this frame, for checks. */
  stamps: { x: number; y: number; w: number; h: number }[] = [];

  private moon(x: number, y: number, r: number, fresh = false): void {
    const { ctx } = this;
    if (fresh) {
      // Brought in tonight by the held card: a ring round the moon.
      ctx.beginPath();
      ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(246, 238, 210, 0.85)';
      ctx.fill();
      ctx.strokeStyle = '#3a4a78';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
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
/** How much of a tall crop shows where it reaches up behind a plot that holds a crop or an object. */
const OVERHANG_FADE = 0.28;
/** The top of a plot, in plot units from a crop's base (0.74 down the plot), less a hair: a crop is fitted under it. */
const PLOT_TOP = -0.7;
/** Round 11: the scarecrow's scale, so its hat stays inside its plot. */
const SCARECROW_FIT = 0.62;

/** The highest painted pixel of a sprite, in plot units from its base (negative is up). */
function paintedTop(s: Sprite): number {
  const g = s.c.getContext('2d', { willReadFrequently: true });
  if (!g || !s.c.width || !s.c.height) return s.y0;
  const d = g.getImageData(0, 0, s.c.width, s.c.height).data;
  const w = s.c.width;
  for (let y = 0; y < s.c.height; y++) {
    for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 24) return s.y0 + (y / s.c.height) * s.h;
  }
  return 0;
}

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
