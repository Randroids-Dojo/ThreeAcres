// Effects for simulation events. Everything lives in preallocated typed
// arrays: a ring of particles, per-tile timers (bounce, wet, deny, wither),
// a few harvest arcs and floating words. onEvent only writes numbers, so a
// burst of dawn `grow` events is cheap, and nothing is spawned while the view
// is hidden.

import type { CropId, SimEvent, WorldState } from '../sim/types';
import { CROP_IDS } from '../sim/crops';
import { CRATE, PROPS } from '../sim/map';
import type { Ctx } from './brush';
import { cropHeight } from './crops';

/** Particle kinds. */
const P = { Dust: 0, Clod: 1, Drop: 2, Seed: 3, Leaf: 4, Feather: 5, Speck: 6, Glint: 7, Twig: 8, Ring: 9, Pop: 10 } as const;
type PK = (typeof P)[keyof typeof P];

const COLORS = [
  '#d9c09a', // 0 dust
  '#6b4a2e', // 1 clod
  '#7fb7e0', // 2 water
  '#c9a060', // 3 seed
  '#a8803e', // 4 dead leaf
  '#262a36', // 5 feather
  '#2a2420', // 6 bug
  '#f2c84a', // 7 gold
  '#7a5a3a', // 8 twig
  'rgba(120,170,210,0.8)', // 9 water ring
  '#ece2cc', // 10 pale dust
  '#d8e2ea', // 11 silver
  '#c84a3a', // 12 red
  '#ffffff', // 13 white
  '#6fa848', // 14 green scrap
];

const N = 640;
/** A bounce waiting for the night to lift. */
const PENDING = 1e9;

export class Fx {
  // Particles.
  private kind = new Uint8Array(N);
  private col = new Uint8Array(N);
  private x = new Float32Array(N);
  private y = new Float32Array(N);
  private z = new Float32Array(N);
  private vx = new Float32Array(N);
  private vy = new Float32Array(N);
  private vz = new Float32Array(N);
  private age = new Float32Array(N);
  private life = new Float32Array(N);
  private size = new Float32Array(N);
  private rot = new Float32Array(N);
  private next = 0;
  private live = 0;

  /** Per-tile start times, in the fx clock. */
  bounce = new Float32Array(0);
  wet = new Float32Array(0);
  deny = new Float32Array(0);
  wither = new Float32Array(0);
  W = 20;

  // Harvest arcs to the crate.
  arcKind = new Uint8Array(16);
  arcQ = new Uint8Array(16);
  arcT = new Float32Array(16).fill(-1);
  arcX = new Float32Array(16);
  arcY = new Float32Array(16);
  arcH = new Float32Array(16);
  private arcNext = 0;

  // Floating words: coins and caws.
  wordT = new Float32Array(8).fill(-1);
  wordX = new Float32Array(8);
  wordY = new Float32Array(8);
  wordKind = new Uint8Array(8);
  wordN = new Int32Array(8);
  private wordNext = 0;

  /** Screen-wide flashes. */
  thunderT = -10;
  dawnT = -10;

  /** The fx clock, real seconds, advanced by frame(). */
  clock = 0;
  /** The night transition as last drawn. Growth that lands in the dark waits for the light. */
  night = 0;
  private pendingGrow = false;
  /** False while the renderer is not being drawn; events then only touch cheap state. */
  awake = true;
  reduced = false;

  private seed = 1;
  private rnd(): number {
    // Effects may be random; a tiny LCG keeps it allocation free.
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  reset(s: Readonly<WorldState>): void {
    this.W = s.W;
    const n = s.W * s.H;
    this.bounce = new Float32Array(n).fill(-10);
    this.wet = new Float32Array(n).fill(-10);
    this.deny = new Float32Array(n).fill(-10);
    this.wither = new Float32Array(n).fill(-10);
    this.life.fill(0);
    this.arcT.fill(-1);
    this.wordT.fill(-1);
    this.live = 0;
  }

  private spawn(k: PK, col: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number): void {
    const i = this.next;
    this.next = (this.next + 1) % N;
    this.kind[i] = k;
    this.col[i] = col;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.age[i] = 0;
    this.life[i] = life;
    this.size[i] = size;
    this.rot[i] = this.rnd() * 6.28;
    this.live = Math.min(N, this.live + 1);
  }

  private burst(k: PK, col: number, n: number, x: number, y: number, z: number, speed: number, up: number, life: number, size: number): void {
    const m = this.reduced ? Math.ceil(n / 2) : n;
    for (let i = 0; i < m; i++) {
      const a = this.rnd() * Math.PI * 2;
      const s = speed * (0.4 + this.rnd() * 0.6);
      this.spawn(k, col, x + (this.rnd() - 0.5) * 0.2, y + (this.rnd() - 0.5) * 0.12, z, Math.cos(a) * s, Math.sin(a) * s * 0.6, up * (0.6 + this.rnd() * 0.6), life * (0.7 + this.rnd() * 0.6), size * (0.7 + this.rnd() * 0.6));
    }
  }

  /** Pen strokes bursting out from a point: the almanac way to say pop. */
  private pop(col: number, x: number, y: number, z: number, size: number): void {
    this.spawn(P.Pop, col, x, y, z, 0, 0, 0, 0.32, size);
  }

  private word(kind: number, x: number, y: number, n: number): void {
    const i = this.wordNext;
    this.wordNext = (this.wordNext + 1) % 8;
    this.wordT[i] = this.clock;
    this.wordX[i] = x;
    this.wordY[i] = y;
    this.wordKind[i] = kind;
    this.wordN[i] = n;
  }

  event(e: SimEvent, s: Readonly<WorldState>): void {
    if (!this.awake) return;
    const c = this.clock;
    const W = this.W;
    if ('x' in e && typeof e.x === 'number' && 'y' in e && typeof e.y === 'number') {
      if (e.x < 0 || e.y < 0 || e.x >= s.W || e.y >= s.H) return;
    }
    switch (e.type) {
      case 'till': {
        const x = e.x + 0.5;
        const y = e.y + 0.6;
        this.burst(P.Dust, 0, 5, x, y, 0.05, 0.55, 0.35, 0.65, 0.12);
        this.burst(P.Clod, 1, 7, x, y, 0.05, 1.0, 1.7, 0.6, 0.04);
        this.bounce[e.y * W + e.x] = c;
        break;
      }
      case 'water': {
        const x = e.x + 0.5;
        const y = e.y + 0.6;
        this.burst(P.Drop, 2, 10, x, y, 0.12, 0.9, 1.4, 0.55, 0.028);
        this.spawn(P.Ring, 9, x, y, 0, 0, 0, 0, 0.6, 0.45);
        this.wet[e.y * W + e.x] = c;
        break;
      }
      case 'plant': {
        const x = e.x + 0.5;
        const y = e.y + 0.65;
        this.burst(P.Seed, 3, 5, x, y, 0.35, 0.45, 0.7, 0.5, 0.032);
        this.spawn(P.Ring, 10, x, y, 0, 0, 0, 0, 0.45, 0.3);
        this.pop(3, x, y, 0.15, 0.32);
        this.bounce[e.y * W + e.x] = c;
        break;
      }
      case 'grow': {
        if (this.night > 0.3) {
          this.bounce[e.y * W + e.x] = PENDING;
          this.pendingGrow = true;
          break;
        }
        const d = (((e.x * 7 + e.y * 13) % 10) / 10) * 0.35;
        this.bounce[e.y * W + e.x] = c + d;
        // A tick of new growth, staggered so a dawn of growth ripples.
        const i = this.next;
        this.pop(14, e.x + 0.5, e.y + 0.68, cropHeight(e.crop, e.stage) * 0.8 + 0.1, 0.22);
        this.age[i] = -d;
        break;
      }
      case 'harvest': {
        const i = this.arcNext;
        this.arcNext = (this.arcNext + 1) % 16;
        this.arcKind[i] = CROP_IDS.indexOf(e.crop as CropId);
        this.arcQ[i] = e.quality;
        this.arcT[i] = c;
        this.arcX[i] = e.x + 0.5;
        this.arcY[i] = e.y + 0.68;
        this.arcH[i] = cropHeight(e.crop, 4) * 0.6;
        this.burst(P.Leaf, 14, 4, e.x + 0.5, e.y + 0.65, 0.2, 0.5, 0.8, 0.6, 0.07);
        this.pop(e.quality > 0 ? 7 : 14, e.x + 0.5, e.y + 0.68, 0.35, 0.4);
        this.bounce[e.y * W + e.x] = c;
        break;
      }
      case 'tend':
        this.burst(P.Speck, 6, 9, e.x + 0.5, e.y + 0.55, 0.25, 1.4, 0.8, 0.7, 0.026);
        break;
      case 'clear':
        this.burst(P.Twig, 8, 8, e.x + 0.5, e.y + 0.6, 0.15, 1.0, 1.5, 0.75, 0.14);
        this.burst(P.Dust, 0, 4, e.x + 0.5, e.y + 0.6, 0.05, 0.45, 0.3, 0.6, 0.12);
        break;
      case 'build':
      case 'unbuild':
        this.burst(P.Dust, 10, 8, e.x + 0.5, e.y + 0.7, 0.05, 0.85, 0.3, 0.75, 0.14);
        this.pop(10, e.x + 0.5, e.y + 0.7, 0.3, 0.45);
        if (e.type === 'unbuild') this.burst(P.Twig, 8, 5, e.x + 0.5, e.y + 0.6, 0.3, 0.8, 1.2, 0.7, 0.08);
        this.bounce[e.y * W + e.x] = c;
        break;
      case 'wither':
        this.wither[e.y * W + e.x] = c;
        this.burst(P.Leaf, 4, 6, e.x + 0.5, e.y + 0.55, 0.5, 0.35, 0.25, 1.5, 0.075);
        break;
      case 'bugs':
        // Specks fly in and settle.
        for (let i = 0; i < (this.reduced ? 3 : 6); i++) {
          const a = this.rnd() * 6.28;
          const d = 0.5 + this.rnd() * 0.3;
          this.spawn(P.Speck, 6, e.x + 0.5 + Math.cos(a) * d, e.y + 0.6 + Math.sin(a) * d * 0.6, 0.5, -Math.cos(a) * d * 2, -Math.sin(a) * d * 1.2, -0.6, 0.5, 0.02);
        }
        break;
      case 'sprinkle': {
        const x = e.x + 0.5;
        const y = e.y + 0.6;
        this.spawn(P.Ring, 9, x, y, 0, 0, 0, 0, 0.9, 1.5);
        const n = this.reduced ? 10 : 22;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          this.spawn(P.Drop, 2, x, y, 0.35, Math.cos(a) * 1.7, Math.sin(a) * 1.0, 1.4, 0.75, 0.024);
        }
        break;
      }
      case 'crowIn':
        this.word(1, e.x + 0.9, e.y + 0.1, 0);
        break;
      case 'crowEat':
        this.burst(P.Feather, 5, 5, e.x + 0.7, e.y + 0.6, 0.3, 0.5, 0.6, 1.5, 0.07);
        this.burst(P.Leaf, 14, 6, e.x + 0.5, e.y + 0.6, 0.2, 0.7, 1.0, 0.8, 0.05);
        break;
      case 'crowScared':
        this.burst(P.Feather, 5, 7, e.x + 0.7, e.y + 0.6, 0.4, 0.8, 1.0, 1.6, 0.07);
        break;
      case 'deny':
        this.deny[e.y * W + e.x] = c;
        break;
      case 'coins': {
        const x = e.x !== undefined ? e.x + 0.5 : CRATE.x + 0.5;
        const y = e.y !== undefined ? e.y + 0.5 : PROPS[1].y + 0.6;
        for (let i = 0; i < (this.reduced ? 4 : 9); i++) this.spawn(P.Glint, 7, x + (this.rnd() - 0.5) * 0.6, y + (this.rnd() - 0.5) * 0.3, 0.2 + this.rnd() * 0.4, 0, 0, 0.9 + this.rnd() * 0.6, 0.9 + this.rnd() * 0.4, 0.06);
        this.word(0, x, y - 0.6, e.amount);
        break;
      }
      case 'thunder':
        this.thunderT = c;
        break;
      case 'dawn':
        this.dawnT = c;
        break;
      case 'step':
        if (e.ground === 'path' || e.ground === 'yard' || e.ground === 'field') {
          this.spawn(P.Dust, e.ground === 'field' ? 0 : 10, e.x + 0.5 + (this.rnd() - 0.5) * 0.3, e.y + 0.55, 0.02, (this.rnd() - 0.5) * 0.3, 0, 0.15, 0.45, 0.07);
        }
        break;
      case 'hire': {
        const b = PROPS[3];
        this.burst(P.Dust, 10, 6, b.doorX + 0.5, b.doorY + 0.4, 0.05, 0.6, 0.2, 0.7, 0.14);
        break;
      }
      default:
        break;
    }
  }

  /** Once the dark lifts, play the growth that happened overnight, rippling across the farm. */
  releaseGrowth(s: Readonly<WorldState>): void {
    if (!this.pendingGrow || this.night > 0.2) return;
    this.pendingGrow = false;
    for (let i = 0; i < this.bounce.length; i++) {
      if (this.bounce[i] !== PENDING) continue;
      const x = i % this.W;
      const y = (i - x) / this.W;
      const d = 0.1 + (x + y) * 0.03 + (((x * 7 + y * 13) % 10) / 10) * 0.15;
      this.bounce[i] = this.clock + d;
      const c = s.plots[i]?.crop;
      if (c && !c.dead) {
        const j = this.next;
        this.pop(14, x + 0.5, y + 0.68, cropHeight(c.kind, c.stage) * 0.8 + 0.1, 0.22);
        this.age[j] = -d;
      }
    }
  }

  /** Advance particles. */
  step(dt: number, wind: number): void {
    this.clock += dt;
    if (this.live === 0) return;
    let alive = 0;
    for (let i = 0; i < N; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += dt;
      alive++;
      if (this.age[i] < 0) continue;
      const k = this.kind[i];
      if (k === P.Ring || k === P.Pop) continue;
      let g = 3.2;
      let drag = 0.5;
      if (k === P.Dust) {
        g = -0.25;
        drag = 2.5;
      } else if (k === P.Leaf || k === P.Feather) {
        g = 0.55;
        drag = 2.2;
        this.vx[i] += Math.sin(this.age[i] * 5 + i) * dt * 1.6 + wind * dt;
      } else if (k === P.Glint) {
        g = -0.2;
        drag = 1.2;
      } else if (k === P.Speck) {
        g = 1.2;
        drag = 1.8;
      }
      const f = Math.exp(-drag * dt);
      this.vx[i] *= f;
      this.vy[i] *= f;
      this.vz[i] = this.vz[i] * f - g * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] += this.vz[i] * dt;
      if (this.z[i] < 0) {
        this.z[i] = 0;
        this.vz[i] *= -0.25;
        this.vx[i] *= 0.6;
        this.vy[i] *= 0.6;
      }
      this.rot[i] += dt * (k === P.Twig ? 9 : 3);
    }
    if (alive === 0) this.live = 0;
  }

  /** Ground rings, under the uprights. ctx is in tile units. */
  drawGround(ctx: Ctx, px: number): void {
    if (this.live === 0) return;
    for (let i = 0; i < N; i++) {
      if (this.age[i] >= this.life[i] || this.kind[i] !== P.Ring) continue;
      const e = this.age[i] / this.life[i];
      const r = this.size[i] * (0.3 + e * 0.9);
      ctx.beginPath();
      ctx.ellipse(this.x[i], this.y[i], r, r * 0.45, 0, 0, Math.PI * 2);
      ctx.globalAlpha = (1 - e) * 0.9;
      ctx.strokeStyle = COLORS[this.col[i]];
      ctx.lineWidth = Math.max(px * 1.5, 0.03);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Everything in the air, over the uprights. */
  drawAir(ctx: Ctx, px: number, ink: string): void {
    if (this.live === 0) return;
    for (let i = 0; i < N; i++) {
      if (this.age[i] >= this.life[i] || this.age[i] < 0) continue;
      const k = this.kind[i];
      if (k === P.Ring) continue;
      const e = this.age[i] / this.life[i];
      const x = this.x[i];
      const y = this.y[i] - this.z[i];
      const s = this.size[i];
      ctx.globalAlpha = e > 0.7 ? (1 - e) / 0.3 : 1;
      ctx.fillStyle = COLORS[this.col[i]];
      if (k === P.Dust) {
        // A little inked cloud of dust.
        ctx.globalAlpha = (1 - e) * 0.9;
        ctx.beginPath();
        ctx.arc(x, y, s * (0.55 + e * 0.9), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = ink;
        ctx.lineWidth = Math.max(px * 0.9, 0.012);
        ctx.globalAlpha = (1 - e) * 0.55;
        ctx.stroke();
      } else if (k === P.Pop) {
        const r0 = s * (0.35 + e * 0.6);
        const r1 = s * (0.55 + e * 0.75);
        ctx.beginPath();
        for (let j = 0; j < 6; j++) {
          const a = -Math.PI / 2 + (j - 2.5) * 0.48;
          ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
          ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
        }
        ctx.globalAlpha = 1 - e;
        ctx.strokeStyle = COLORS[this.col[i]];
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(px * 2.6, 0.04);
        ctx.stroke();
        ctx.strokeStyle = ink;
        ctx.lineWidth = Math.max(px * 1.1, 0.016);
        ctx.stroke();
      } else if (k === P.Leaf || k === P.Feather || k === P.Twig) {
        const c = Math.cos(this.rot[i]);
        const sn = Math.sin(this.rot[i]);
        ctx.beginPath();
        if (k === P.Twig) {
          ctx.moveTo(x - c * s * 0.5, y - sn * s * 0.5);
          ctx.lineTo(x + c * s * 0.5, y + sn * s * 0.5);
          ctx.strokeStyle = COLORS[this.col[i]];
          ctx.lineWidth = Math.max(px * 1.5, 0.02);
          ctx.stroke();
        } else {
          ctx.ellipse(x, y, s, s * (k === P.Feather ? 0.28 : 0.45), this.rot[i], 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = ink;
          ctx.lineWidth = Math.max(px * 0.8, 0.008);
          ctx.stroke();
        }
      } else if (k === P.Glint) {
        const tw = 0.6 + 0.4 * Math.sin(this.age[i] * 18 + i);
        const r = s * tw;
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r * 0.25, y - r * 0.25);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x + r * 0.25, y + r * 0.25);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r * 0.25, y + r * 0.25);
        ctx.lineTo(x - r, y);
        ctx.lineTo(x - r * 0.25, y - r * 0.25);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fill();
        if (k === P.Clod || k === P.Seed) {
          ctx.strokeStyle = ink;
          ctx.lineWidth = Math.max(px * 0.8, 0.01);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** A sparkle for a quality harvest. */
  sparkle(x: number, y: number, q: number): void {
    if (!this.awake || q <= 0) return;
    for (let i = 0; i < q * 3; i++) this.spawn(P.Glint, q >= 2 ? 7 : 11, x + (this.rnd() - 0.5) * 0.4, y, 0.4 + this.rnd() * 0.3, (this.rnd() - 0.5) * 0.6, 0, 0.6, 0.7, 0.05);
  }
}
