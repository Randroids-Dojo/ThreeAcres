// A sound for every simulation event and interface cue. Bursts are gated: the
// first of a kind plays at once, the next ones queue a short way apart, and
// anything that would land too late is dropped. Hands sound quieter than the
// farmer and are panned by where they stand.

import type { UiCue } from '../contract';
import type { SimEvent, TileKind, WorldState } from '../sim/types';
import type { Bank, FxName, InstName } from './bank';
import { clamp, rand } from './dsp';
import type { Music } from './music';
import { tonesIn } from './theory';
import type { Voices } from './voices';

const STEP_FX: Record<TileKind, FxName> = {
  grass: 'stepGrass',
  field: 'stepSoil',
  path: 'stepGravel',
  yard: 'stepDirt',
  wood: 'stepWood',
  water: 'stepWater',
};

/** Shortest gap between two footsteps of the farmer, and of any one hand. */
export const STEP_GAP_FARMER = 0.1;
export const STEP_GAP_HAND = 0.2;
/** All hands together never step more often than this. */
export const STEP_GAP_HANDS = 0.12;
/**
 * Live effect voices above which new sounds are dropped: hands' work first,
 * then the farm's own (growth, sprinklers, sales), and last the farmer's own
 * actions and the rare sounds that matter.
 */
export const SFX_CAP = { hands: 20, farm: 30, key: 48 } as const;

const PENTA = [0, 2, 4, 7, 9];

interface Gate {
  next: number;
  n: number;
}

interface Place {
  pan: number;
  gain: number;
}

export class Sfx {
  /** Plays and drops per kind, for the workbench and tests. */
  started: Record<string, number> = {};
  dropped: Record<string, number> = {};
  /** The clock in force, so the dawn knows whether to crow, chime or sting. */
  clock: 'day' | 'turns' | 'flow' = 'day';
  private gates = new Map<string, Gate>();
  private lastStep = new Map<number, number>();
  private r = rand(99);

  constructor(
    private ctx: BaseAudioContext,
    private bank: Bank,
    private voices: Voices,
    private music: Music,
    private out: AudioNode,
    private far: AudioNode,
  ) {}

  // ------------------------------------------------------------ plumbing

  private count(kind: string, into: Record<string, number>): void {
    into[kind] = (into[kind] ?? 0) + 1;
  }

  /**
   * The time a sound of this kind may start, or null to drop it. `k` counts
   * how far into a burst we are, so cascades can climb.
   */
  private gate(key: string, spacing: number, maxDelay: number, now: number): { t: number; k: number } | null {
    let g = this.gates.get(key);
    if (!g) {
      g = { next: 0, n: -1 };
      this.gates.set(key, g);
    }
    const t = Math.max(now, g.next);
    if (t - now > maxDelay + 1e-6) return null;
    g.n = now > g.next + 0.35 ? 0 : g.n + 1;
    g.next = t + spacing;
    return { t, k: g.n };
  }

  private fx(name: FxName, t: number, gain: number, o: { rate?: number; pan?: number; far?: boolean; dur?: number } = {}): void {
    const b = this.bank.get(name, Math.floor(this.r() * 16));
    if (!b) return;
    this.voices.play(b, o.far ? this.far : this.out, t, { gain, rate: o.rate ?? 1, pan: o.pan, dur: o.dur, release: 0.1 });
  }

  private tone(inst: InstName, midi: number, t: number, gain: number, o: { pan?: number; dur?: number; attack?: number } = {}): void {
    const s = this.bank.note(inst, midi);
    if (!s) return;
    this.voices.play(s.buf, this.out, t, { gain, rate: s.rate, pan: o.pan, dur: o.dur ?? 1.6, release: 0.3, attack: o.attack });
  }

  /** Chord tones of the music now playing, from lo up. Effects stay in tune with the score. */
  private tones(lo: number, hi: number): number[] {
    const h = this.music.harmony();
    const list = tonesIn(h.key, h.chord, lo, hi);
    return list.length ? list : [lo];
  }

  private get key(): number {
    return this.music.harmony().key;
  }

  /** Pan and level for something at tile (x, y), done by actor `by`. */
  private place(s: Readonly<WorldState> | null, x?: number, y?: number, by?: number): Place {
    const hand = by !== undefined && by !== 1;
    const quiet = hand ? 0.45 : 1;
    if (!s || x === undefined || y === undefined) return { pan: 0, gain: quiet };
    if (s.rules.camera === 'close') {
      const f = s.actors.find((a) => a.id === 1);
      if (!f) return { pan: 0, gain: quiet };
      const dx = x + 0.5 - f.x;
      const dy = y + 0.5 - f.y;
      const dist = Math.hypot(dx, dy);
      return { pan: clamp(dx / 7, -0.8, 0.8), gain: quiet * clamp(1 - (dist - 2) / 14, 0.35, 1) };
    }
    return { pan: clamp(((x + 0.5 - s.W / 2) / (s.W / 2)) * 0.6, -0.6, 0.6), gain: quiet };
  }

  private busy(level: keyof typeof SFX_CAP = 'farm'): boolean {
    return this.voices.live >= SFX_CAP[level];
  }

  // ------------------------------------------------------------ events

  event(e: SimEvent, s: Readonly<WorldState> | null): void {
    const now = this.ctx.currentTime;
    const r = this.r;
    const jit = () => 0.94 + r() * 0.12;
    switch (e.type) {
      case 'step': {
        const hand = e.by !== 1;
        const last = this.lastStep.get(e.by) ?? -1;
        if (now - last < (hand ? STEP_GAP_HAND : STEP_GAP_FARMER) - 1e-6) return this.drop('step');
        if (this.busy(hand ? 'hands' : 'key')) return this.drop('step');
        if (hand && !this.gate('step:hands', STEP_GAP_HANDS, 0, now)) return this.drop('step');
        this.lastStep.set(e.by, now);
        const a = s?.actors.find((x) => x.id === e.by);
        const p = this.place(s, a ? a.x - 0.5 : e.x, a ? a.y - 0.5 : e.y, e.by);
        this.fx(STEP_FX[e.ground] ?? 'stepGrass', now, 0.3 * p.gain, { rate: jit(), pan: p.pan });
        return this.play('step');
      }
      case 'till':
      case 'water':
      case 'plant':
      case 'tend':
      case 'clear': {
        const hand = e.by !== 1;
        if (this.busy(hand ? 'hands' : 'key')) return this.drop(e.type);
        const g = this.gate(`${e.type}:${hand ? 'h' : 'f'}`, hand ? 0.12 : 0.05, hand ? 0.1 : 0.15, now);
        if (!g) return this.drop(e.type);
        const p = this.place(s, e.x, e.y, e.by);
        const level = { till: 0.55, water: 0.42, plant: 0.45, tend: 0.4, clear: 0.45 }[e.type];
        this.fx(e.type, g.t, level * p.gain, { rate: jit(), pan: p.pan });
        return this.play(e.type);
      }
      case 'grow': {
        // Dawn brings dozens at once: a short climbing sparkle, not sixty.
        if (this.busy()) return this.drop('grow');
        const g = this.gate('grow', 0.07, 0.85, now);
        if (!g) return this.drop('grow');
        const p = this.place(s, e.x, e.y);
        const k = g.k;
        const m = Math.min(100, this.key + 24 + PENTA[k % 5] + 12 * Math.floor(k / 5));
        this.tone('musicbox', m, g.t, Math.max(0.05, 0.15 - k * 0.008) * p.gain, { pan: p.pan, dur: 0.9 });
        return this.play('grow');
      }
      case 'harvest': {
        const hand = e.by !== 1;
        if (this.busy(hand ? 'hands' : 'key')) return this.drop('harvest');
        const g = this.gate(`harvest:${hand ? 'h' : 'f'}`, hand ? 0.1 : 0.05, hand ? 0.1 : 0.15, now);
        if (!g) return this.drop('harvest');
        const p = this.place(s, e.x, e.y, e.by);
        const q = clamp(Math.round(e.quality), 0, 3);
        const ladder = this.tones(this.key + 7, this.key + 31);
        // Higher quality plucks higher; quick picks climb a little more.
        const idx = Math.min(ladder.length - 1, 1 + q * 2 + (hand ? 0 : Math.min(g.k, 3)));
        this.fx('pop', g.t, 0.34 * p.gain, { rate: jit(), pan: p.pan });
        this.tone('banjo', ladder[idx], g.t + 0.012, 0.3 * p.gain, { pan: p.pan, dur: 0.7 });
        if (q >= 2) this.tone('musicbox', ladder[Math.min(ladder.length - 1, idx + 2)] + 12, g.t + 0.07, (q === 3 ? 0.16 : 0.1) * p.gain, { pan: p.pan, dur: 0.8 });
        return this.play('harvest');
      }
      case 'build': {
        const g = this.gate('build', 0.2, 0.3, now);
        if (!g || this.busy(e.by === 1 ? 'key' : 'hands')) return this.drop('build');
        const p = this.place(s, e.x, e.y, e.by);
        this.fx('knock', g.t, 0.45 * p.gain, { pan: p.pan });
        this.fx('knock', g.t + 0.14, 0.38 * p.gain, { pan: p.pan, rate: 1.08 });
        if (e.kind === 'sprinkler') this.tone('bell', this.key + 31, g.t + 0.3, 0.08 * p.gain, { pan: p.pan, dur: 0.8 });
        else this.fx('tend', g.t + 0.28, 0.16 * p.gain, { pan: p.pan });
        return this.play('build');
      }
      case 'unbuild': {
        if (this.busy()) return this.drop('unbuild');
        const p = this.place(s, e.x, e.y);
        this.fx('creak', now, 0.32 * p.gain, { pan: p.pan });
        this.fx('knock', now + 0.2, 0.3 * p.gain, { pan: p.pan, rate: 0.85 });
        return this.play('unbuild');
      }
      case 'wither': {
        const g = this.gate('wither', 0.22, 0.9, now);
        if (!g || this.busy()) return this.drop('wither');
        const p = this.place(s, e.x, e.y);
        this.fx('wither', g.t, 0.28 * p.gain, { pan: p.pan, rate: jit() });
        return this.play('wither');
      }
      case 'bugs': {
        const g = this.gate('bugs', 0.3, 0.9, now);
        if (!g || this.busy()) return this.drop('bugs');
        const p = this.place(s, e.x, e.y);
        this.fx('bugs', g.t, 0.2 * p.gain, { pan: p.pan, rate: jit() });
        return this.play('bugs');
      }
      case 'sprinkle': {
        const g = this.gate('sprinkle', 0.12, 0.5, now);
        if (!g || this.busy()) return this.drop('sprinkle');
        const p = this.place(s, e.x, e.y);
        this.fx('sprinkle', g.t, Math.max(0.08, 0.24 - g.k * 0.03) * p.gain, { pan: p.pan, rate: jit() });
        return this.play('sprinkle');
      }
      case 'crowIn': {
        const g = this.gate('crow', 0.25, 0.6, now);
        if (!g || this.busy('key')) return this.drop('crowIn');
        const p = this.place(s, e.x, e.y);
        this.fx('caw', g.t, 0.28 * p.gain, { pan: p.pan, far: true });
        this.fx('caw', g.t + 0.34, 0.24 * p.gain, { pan: p.pan, rate: 0.96, far: true });
        return this.play('crowIn');
      }
      case 'crowEat': {
        if (!this.gate('crowEat', 0.2, 0, now) || this.busy('key')) return this.drop('crowEat');
        const p = this.place(s, e.x, e.y);
        this.fx('peck', now, 0.32 * p.gain, { pan: p.pan });
        this.fx('caw', now + 0.5, 0.16 * p.gain, { pan: p.pan, rate: 0.9, far: true });
        return this.play('crowEat');
      }
      case 'crowScared': {
        const g = this.gate('crowScared', 0.15, 0.3, now);
        if (!g || this.busy('key')) return this.drop('crowScared');
        const p = this.place(s, e.x, e.y);
        this.fx('flap', g.t, 0.42 * p.gain, { pan: p.pan });
        this.fx('caw', g.t + 0.05, 0.28 * p.gain, { pan: p.pan, rate: 1.12, far: true });
        return this.play('crowScared');
      }
      case 'deny': {
        if (!this.gate('deny', 0.15, 0, now)) return this.drop('deny');
        this.fx('deny', now, 0.4);
        return this.play('deny');
      }
      case 'coins': {
        const g = this.gate('coins', 0.12, 0.3, now);
        if (!g || this.busy()) return this.drop('coins');
        const n = e.amount < 25 ? 1 : e.amount < 100 ? 2 : e.amount < 400 ? 3 : 4;
        const hi = this.tones(this.key + 24, this.key + 40);
        for (let k = 0; k < n; k++) this.tone('musicbox', hi[Math.min(hi.length - 1, k)], g.t + k * 0.055, 0.2 - k * 0.02, { dur: 1 });
        if (n >= 3) this.tone('bell', hi[Math.min(hi.length - 1, n)], g.t + n * 0.055, 0.1, { dur: 1.4 });
        return this.play('coins');
      }
      case 'sell': {
        const g = this.gate('sell', 0.14, 0.8, now);
        if (!g || this.busy()) return this.drop('sell');
        const lad = this.tones(this.key + 12, this.key + 31);
        this.fx('knock', g.t, 0.2, { rate: 0.8 });
        this.tone('marimba', lad[Math.min(lad.length - 1, g.k)], g.t + 0.01, 0.26, { dur: 0.8 });
        return this.play('sell');
      }
      case 'buy': {
        if (!this.gate('buy', 0.08, 0, now) || this.busy('key')) return this.drop('buy');
        const k = this.key;
        this.tone('musicbox', k + 31, now, 0.18, { dur: 0.8 });
        this.tone('musicbox', k + 24, now + 0.07, 0.16, { dur: 1 });
        this.fx('paper', now, 0.14);
        return this.play('buy');
      }
      case 'order': {
        if (!this.gate('order', 0.25, 0.5, now) || this.busy('key')) return this.drop('order');
        const k = this.key;
        if (e.done) {
          [0, 4, 7, 12].forEach((iv, j) => this.tone('marimba', k + 12 + iv, now + j * 0.07, 0.28, { dur: 0.9 }));
          this.tone('bell', k + 24, now + 0.28, 0.12, { dur: 1.6 });
        } else {
          this.tone('piano', k + 7, now, 0.26, { dur: 0.6 });
          this.tone('piano', k + 3, now + 0.2, 0.22, { dur: 1 });
        }
        return this.play('order');
      }
      case 'goal':
      case 'milestone': {
        if (!this.gate(e.type, 0.4, 0, now) || this.busy('key')) return this.drop(e.type);
        const k = this.key;
        const big = e.type === 'milestone';
        const run = big ? [0, 4, 7, 12, 16] : [0, 4, 7];
        run.forEach((iv, j) => this.tone('marimba', k + 12 + iv, now + j * 0.08, 0.25, { dur: 0.9 }));
        const top = now + run.length * 0.08;
        this.tone('celesta', k + 24, top, 0.2, { dur: 1.6 });
        this.tone('bell', k + 31, top, big ? 0.12 : 0.1, { dur: 2 });
        if (big) [0, 4, 7].forEach((iv, j) => this.tone('piano', k + iv, top + j * 0.012, 0.11, { dur: 1.8 }));
        return this.play(e.type);
      }
      case 'night': {
        if (!this.gate('night', 1.2, 0, now)) return this.drop('night');
        // A lullaby swell: a pad chord breathing in under a falling music box.
        const k = this.key;
        [0, 4, 7, 12].forEach((iv) => {
          const smp = this.bank.note('pad', k - 12 + iv + (iv === 0 ? 12 : 0));
          if (smp) this.voices.play(smp.buf, this.out, now, { gain: 0.07, rate: smp.rate, loop: true, attack: 0.9, dur: 2.2, release: 1.6 });
        });
        [7, 4, 0].forEach((iv, j) => this.tone('musicbox', k + 24 + iv, now + j * 0.42, 0.16, { dur: 1.4 }));
        return this.play('night');
      }
      case 'dawn': {
        if (!this.gate('dawn', 1.2, 0, now)) return this.drop('dawn');
        const k = this.key;
        if (this.clock === 'day') {
          this.fx('rooster', now, 0.3, { pan: -0.3, far: true });
        } else if (this.clock === 'turns') {
          [0, 7, 12].forEach((iv, j) => this.tone('celesta', k + 24 + iv, now + j * 0.12, 0.2, { dur: 1.6 }));
          this.tone('bell', k + 36, now + 0.36, 0.08, { dur: 2 });
        } else {
          [0, 4, 7].forEach((iv, j) => this.tone('marimba', k + 12 + iv, now + j * 0.06, 0.3, { dur: 0.7 }));
          this.tone('marimba', k + 24, now + 0.18, 0.3, { dur: 0.9 });
          this.fx('tamb', now + 0.18, 0.1);
        }
        return this.play('dawn');
      }
      case 'season': {
        if (!this.gate('season', 1.2, 0, now)) return this.drop('season');
        const k = this.music.keyOf(e.season);
        if (e.season === 0) PENTA.concat([12]).forEach((iv, j) => this.tone('celesta', k + 12 + iv, now + j * 0.07, 0.2, { dur: 1.4 }));
        else if (e.season === 1) [0, 4, 7, 9].forEach((iv, j) => this.tone('marimba', k + 12 + iv, now + j * 0.11, 0.28, { dur: 0.9 }));
        else if (e.season === 2) {
          [0, 7, 12, 16, 19, 24].forEach((iv, j) => this.tone('guitar', k - 12 + iv, now + j * 0.03, 0.26, { dur: 2 }));
          this.tone('fiddle', k + 12, now + 0.2, 0.12, { dur: 1.2, attack: 0.15 });
        } else {
          [0, 7, 12].forEach((iv, j) => this.tone('bell', k + 12 + iv, now + j * 0.2, 0.14, { dur: 2.2 }));
          this.fx('sleigh', now, 0.1);
        }
        return this.play('season');
      }
      case 'thunder': {
        if (!this.gate('thunder', 1.5, 0, now)) return this.drop('thunder');
        this.fx('thunder', now, 0.6, { far: true });
        return this.play('thunder');
      }
      case 'rules': {
        if (!this.gate('rules', 0.08, 0, now)) return this.drop('rules');
        const k = this.key;
        if (e.changed.includes('clock')) {
          this.fx('whoosh', now, 0.16);
          this.tone('celesta', k + 19, now, 0.16, { dur: 0.8 });
          this.tone('celesta', k + 24, now + 0.09, 0.16, { dur: 1 });
        } else {
          this.fx('tick', now, 0.16);
          this.tone('marimba', k + 24, now + 0.03, 0.16, { dur: 0.5 });
        }
        return this.play('rules');
      }
      case 'tired': {
        if (!this.gate('tired', 2, 0, now)) return this.drop('tired');
        this.fx('sigh', now, 0.28);
        this.tone('piano', this.key - 12, now, 0.18, { dur: 1.4 });
        return this.play('tired');
      }
      case 'hire': {
        if (!this.gate('hire', 0.5, 0, now)) return this.drop('hire');
        this.fx('whistle', now, 0.24, { pan: 0.25 });
        const k = this.key;
        this.tone('banjo', k + 12, now + 0.62, 0.22, { dur: 0.6 });
        this.tone('banjo', k + 19, now + 0.72, 0.22, { dur: 0.8 });
        return this.play('hire');
      }
    }
  }

  ui(cue: UiCue): void {
    const now = this.ctx.currentTime;
    if (!this.gate(`ui:${cue}`, 0.03, 0, now) || this.busy('key')) return this.drop(`ui:${cue}`);
    const k = this.key;
    switch (cue) {
      case 'tap':
        this.fx('tick', now, 0.16);
        break;
      case 'open':
        this.tone('marimba', k + 19, now, 0.18, { dur: 0.5 });
        this.tone('marimba', k + 24, now + 0.06, 0.18, { dur: 0.6 });
        this.fx('paper', now, 0.1);
        break;
      case 'close':
        this.tone('marimba', k + 24, now, 0.16, { dur: 0.5 });
        this.tone('marimba', k + 19, now + 0.06, 0.16, { dur: 0.6 });
        break;
      case 'toggle':
        this.fx('tick', now, 0.18, { rate: 1.2 });
        this.fx('tick', now + 0.05, 0.15, { rate: 0.9 });
        break;
      case 'preset':
        [0, 4, 7].forEach((iv, j) => this.tone('musicbox', k + 24 + iv, now + j * 0.05, 0.18, { dur: 1 }));
        break;
      case 'buy':
        this.tone('musicbox', k + 24, now, 0.18, { dur: 0.8 });
        this.tone('musicbox', k + 31, now + 0.06, 0.16, { dur: 1 });
        this.tone('bell', k + 36, now + 0.12, 0.07, { dur: 1.2 });
        break;
      case 'deny':
        this.fx('deny', now, 0.34);
        break;
      case 'tool':
        this.tone('marimba', k + 24 + PENTA[Math.floor(this.r() * 5)], now, 0.15, { dur: 0.4 });
        this.fx('tick', now, 0.08);
        break;
      case 'page':
        this.fx('paper', now, 0.22, { rate: 0.9 + this.r() * 0.2 });
        break;
      case 'star':
        [0, 4, 7].forEach((iv, j) => this.tone('celesta', k + 24 + iv, now + j * 0.07, 0.2, { dur: 1.2 }));
        this.tone('bell', k + 36, now + 0.21, 0.1, { dur: 1.6 });
        break;
      case 'order':
        this.fx('paper', now, 0.16);
        this.tone('bell', k + 31, now + 0.02, 0.12, { dur: 1.4 });
        break;
    }
    this.play(`ui:${cue}`);
  }

  private play(kind: string): void {
    this.count(kind, this.started);
  }

  private drop(kind: string): void {
    this.count(kind, this.dropped);
  }
}
