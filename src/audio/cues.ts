// Named sounds for Thistledown and Seedbound (docs/AUDIO_CUES.md): one-shots
// by name with cue(), held sounds with loop(). Every cue honours pan, gain and
// pitch. The busy ones (chips, steps, sucks, hovers) are rate-limited and
// voice-capped. The pitch-stepped ones climb a pentatonic ladder or the chord
// now sounding, so a scoring cascade stays in tune with the music. Loops fade
// in and out on their own gain, so they never start or stop on a click, and
// a game's loops only sound while that game is playing.

import type { CueOpts } from '../contract';
import type { Bank, FxName, InstName } from './bank';
import { clamp, rand } from './dsp';
import type { GameId, Music } from './music';
import { tonesIn } from './theory';
import type { Voices } from './voices';

export const DECK_CUES = [
  'deck.draw', 'deck.shuffle', 'deck.hover', 'deck.pick', 'deck.drop', 'deck.play', 'deck.plant', 'deck.water',
  'deck.weather', 'deck.grow', 'deck.harvest', 'deck.chip', 'deck.mult', 'deck.big', 'deck.quota', 'deck.fail',
  'deck.buy', 'deck.page', 'deck.remove', 'deck.reroll', 'deck.pest', 'deck.crow', 'deck.endday', 'deck.deny',
] as const;

export const RANCH_CUES = [
  'ranch.suck', 'ranch.puff', 'ranch.full', 'ranch.slot', 'ranch.step', 'ranch.stepstone', 'ranch.jump', 'ranch.land',
  'ranch.glide', 'ranch.chirp', 'ranch.squeak', 'ranch.boing', 'ranch.eat', 'ranch.shed', 'ranch.frazzle', 'ranch.sell',
  'ranch.coins', 'ranch.build', 'ranch.gate', 'ranch.nettle', 'ranch.nettlehit', 'ranch.splash', 'ranch.goal',
  'ranch.deny', 'ranch.sleep',
] as const;

export const LOOPS = ['ranch.draw', 'ranch.wind', 'ranch.water', 'ranch.vents'] as const;

export type CueName = (typeof DECK_CUES)[number] | (typeof RANCH_CUES)[number];
export type LoopName = (typeof LOOPS)[number];

/**
 * Live effect voices above which a cue is dropped: the busy little ones
 * first, then ordinary cues, and last the ones that matter (a fanfare, a
 * refusal, the run ending).
 */
export const CUE_CAP = { busy: 30, normal: 38, key: 48 } as const;

interface Limit {
  /** Shortest gap between two of these, seconds. */
  gap: number;
  /** Longest a cue may queue behind the last one before it is dropped. 0: drop at once. */
  wait: number;
  /** Most plays of this cue sounding at once. */
  max: number;
  /** Share the limit with other cues (both footsteps share one). */
  key?: string;
  level?: keyof typeof CUE_CAP;
}

const DEFAULT_LIMIT: Limit = { gap: 0.04, wait: 0.08, max: 8 };

const LIMITS: Partial<Record<CueName, Limit>> = {
  // Chips are tiny and hold at most four plays, so a busy cascade drops other things before them.
  // A chip may slip up to 12 ms to keep a fast count ticking near the 29 a second ceiling.
  'deck.chip': { gap: 0.034, wait: 0.012, max: 4, level: 'key' },
  'deck.hover': { gap: 0.05, wait: 0, max: 2, level: 'busy' },
  'deck.draw': { gap: 0.065, wait: 0.5, max: 8 },
  'deck.harvest': { gap: 0.06, wait: 0.2, max: 8 },
  'deck.mult': { gap: 0.07, wait: 0.15, max: 8 },
  'deck.grow': { gap: 1, wait: 0, max: 16 },
  'deck.big': { gap: 0.3, wait: 0.3, max: 16, level: 'key' },
  'deck.quota': { gap: 1, wait: 0, max: 24, level: 'key' },
  'deck.fail': { gap: 1, wait: 0, max: 16, level: 'key' },
  'deck.deny': { gap: 0.15, wait: 0, max: 2, level: 'key' },
  'ranch.step': { gap: 0.085, wait: 0, max: 3, key: 'ranch.step', level: 'busy' },
  'ranch.stepstone': { gap: 0.085, wait: 0, max: 3, key: 'ranch.step', level: 'busy' },
  'ranch.suck': { gap: 0.028, wait: 0, max: 8, level: 'busy' },
  'ranch.puff': { gap: 0.06, wait: 0.05, max: 4 },
  'ranch.chirp': { gap: 0.05, wait: 0.1, max: 6 },
  'ranch.squeak': { gap: 0.05, wait: 0.1, max: 6 },
  'ranch.boing': { gap: 0.05, wait: 0.1, max: 6 },
  'ranch.shed': { gap: 0.06, wait: 0.1, max: 6 },
  'ranch.full': { gap: 0.25, wait: 0, max: 4, level: 'key' },
  'ranch.deny': { gap: 0.15, wait: 0, max: 2, level: 'key' },
  'ranch.goal': { gap: 0.5, wait: 0, max: 16, level: 'key' },
  'ranch.sleep': { gap: 2, wait: 0, max: 16, level: 'key' },
};

interface LoopSpec {
  fx: FxName;
  level: number;
  /** Fade in and out time constants, seconds. */
  attack: number;
  release: number;
  /** Effects bus or ambience bus. */
  bus: 'sfx' | 'amb';
  /** Start at the top of the buffer (the bellows' inhale) or anywhere. */
  fromTop: boolean;
}

const LOOP_SPEC: Record<LoopName, LoopSpec> = {
  'ranch.draw': { fx: 'bellows', level: 0.22, attack: 0.02, release: 0.04, bus: 'sfx', fromTop: true },
  'ranch.wind': { fx: 'gust', level: 0.2, attack: 0.25, release: 0.5, bus: 'sfx', fromTop: false },
  'ranch.water': { fx: 'brook', level: 0.13, attack: 0.5, release: 0.8, bus: 'amb', fromTop: false },
  'ranch.vents': { fx: 'vents', level: 0.11, attack: 0.5, release: 0.8, bus: 'amb', fromTop: false },
};

const PENTA = [0, 2, 4, 7, 9];
/** Transpositions that keep an arpeggio in the key: down an octave, fifth or fourth, up a fourth, fifth or octave. */
const SAFE_SHIFTS = [-12, -7, -5, 0, 5, 7, 12];

/** One cue being played: when, where in a burst, and the caller's pan, gain and pitch. */
interface Play {
  name: CueName;
  key: string;
  now: number;
  t: number;
  /** How far into a burst of this cue: 0 for the first. */
  k: number;
  pan: number;
  gain: number;
  pitch: number;
  /** The caller gave a pitch (pitch-stepped cues climb by themselves when not). */
  pitched: boolean;
}

interface Gate {
  next: number;
  n: number;
}

interface Chain {
  at: number;
  pitch: number;
  idx: number;
}

/** A held loop: a buffer on its own gain and panner. */
class Held {
  private cur: { src: AudioBufferSourceNode; g: GainNode; p: StereoPannerNode; level: number; rate: number; pan: number } | null = null;
  /** The game wants it on. */
  on = false;
  /** Its game is the one playing. */
  allowed = true;
  level = 0;
  rate = 1;
  pan = 0;
  starts = 0;

  constructor(
    private ctx: BaseAudioContext,
    private buffer: () => AudioBuffer | null,
    private spec: LoopSpec,
    private dest: AudioNode,
  ) {}

  get sounding(): boolean {
    return this.cur !== null;
  }

  /** Bring the sound in line with on, allowed and the levels. Returns false when the buffer is not built yet. */
  apply(now: number): boolean {
    const want = this.on && this.allowed && this.level > 0.0005;
    const c = this.cur;
    if (!want) {
      if (c) {
        // Leaving for another game fades with the music, about 0.8 s.
        const rel = this.allowed ? this.spec.release : Math.min(this.spec.release, 0.22);
        c.g.gain.setTargetAtTime(0, now, rel);
        c.src.stop(now + rel * 9);
        this.cur = null;
      }
      return true;
    }
    if (c) {
      if (Math.abs(c.level - this.level) > 0.002) {
        c.g.gain.setTargetAtTime(this.level, now, 0.06);
        c.level = this.level;
      }
      if (Math.abs(c.rate - this.rate) > 0.002) {
        c.src.playbackRate.setTargetAtTime(this.rate, now, 0.05);
        c.rate = this.rate;
      }
      if (Math.abs(c.pan - this.pan) > 0.01) {
        c.p.pan.setTargetAtTime(this.pan, now, 0.05);
        c.pan = this.pan;
      }
      return true;
    }
    const b = this.buffer();
    if (!b) return false;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    src.playbackRate.value = this.rate;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, now);
    g.gain.setTargetAtTime(this.level, now, this.spec.attack);
    const p = ctx.createStereoPanner();
    p.pan.value = this.pan;
    src.connect(g);
    g.connect(p);
    p.connect(this.dest);
    src.onended = () => {
      g.disconnect();
      p.disconnect();
    };
    src.start(now, this.spec.fromTop ? 0 : Math.random() * b.duration);
    this.cur = { src, g, p, level: this.level, rate: this.rate, pan: this.pan };
    this.starts++;
    return true;
  }
}

export class Cues {
  /** Plays and drops per cue, for the workbench and tests. */
  started: Record<string, number> = {};
  dropped: Record<string, number> = {};
  /** Calls with names nobody knows. They make no sound. */
  unknown = 0;
  /** The last notes the pitch-stepped cues played, for the musical checks. */
  readonly log: { name: string; midi: number; key: number; chord: number[] }[] = [];
  private gates = new Map<string, Gate>();
  private live = new Map<string, number[]>();
  private chains = new Map<string, Chain>();
  private held = new Map<LoopName, Held>();
  private waiting = false;
  /** When the cue being played ends: its last voice. */
  private playEnd = 0;
  private game: GameId = 'title';
  /** Tests only: loops play a constant 1 instead of their sound, so a render shows the gain envelope exactly. */
  private dc: AudioBuffer | null = null;
  private r = rand(271);
  private readonly players: Record<CueName, (p: Play) => void>;

  constructor(
    private ctx: BaseAudioContext,
    private bank: Bank,
    private voices: Voices,
    private music: Music,
    private out: AudioNode,
    private far: AudioNode,
    private amb: AudioNode,
  ) {
    this.players = this.build();
  }

  // ------------------------------------------------------------ public

  cue(name: string, o: CueOpts = {}): void {
    const play = (this.players as Record<string, ((p: Play) => void) | undefined>)[name];
    if (!play) {
      this.unknown++;
      return;
    }
    const cue = name as CueName;
    const now = this.ctx.currentTime;
    const lim = LIMITS[cue] ?? DEFAULT_LIMIT;
    const key = lim.key ?? cue;
    if (this.voices.live >= CUE_CAP[lim.level ?? 'normal'] || this.liveOf(key, now) >= lim.max) return this.count(cue, this.dropped);
    const g = this.gate(key, lim.gap, lim.wait, now);
    if (!g) return this.count(cue, this.dropped);
    const num = (v: number | undefined, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    this.playEnd = 0;
    play({
      name: cue, key, now, t: g.t, k: g.k,
      pan: clamp(num(o.pan, 0), -1, 1),
      gain: clamp(num(o.gain, 1), 0, 1),
      pitch: clamp(num(o.pitch, 1), 0.25, 4),
      pitched: typeof o.pitch === 'number' && Number.isFinite(o.pitch),
    });
    if (this.playEnd > 0) this.track(key, this.playEnd);
    this.count(cue, this.started);
  }

  loop(name: string, on: boolean, o: CueOpts = {}): void {
    const spec = (LOOP_SPEC as Record<string, LoopSpec | undefined>)[name];
    if (!spec) {
      this.unknown++;
      return;
    }
    const n = name as LoopName;
    let h = this.held.get(n);
    if (!h) {
      if (!on) return;
      h = new Held(this.ctx, () => this.dc ?? this.bank.get(spec.fx, 0), spec, spec.bus === 'amb' ? this.amb : this.out);
      h.allowed = this.allowedFor(n);
      this.held.set(n, h);
    }
    const level = spec.level * clamp(typeof o.gain === 'number' && Number.isFinite(o.gain) ? o.gain : 1, 0, 1);
    const rate = clamp(typeof o.pitch === 'number' && Number.isFinite(o.pitch) ? o.pitch : 1, 0.25, 4);
    const pan = clamp(typeof o.pan === 'number' && Number.isFinite(o.pan) ? o.pan : 0, -1, 1);
    // Called every frame with nothing new: nothing to do.
    if (h.on === on && (!on || (Math.abs(h.level - level) < 0.001 && Math.abs(h.rate - rate) < 0.001 && Math.abs(h.pan - pan) < 0.005))) return;
    h.on = on;
    if (on) {
      h.level = level;
      h.rate = rate;
      h.pan = pan;
    }
    if (!h.apply(this.ctx.currentTime)) this.waiting = true;
  }

  /** Tests only: play every loop as a constant 1, to measure its envelope for clicks. */
  probeEnvelopes(): void {
    const sr = this.ctx.sampleRate;
    this.dc = this.ctx.createBuffer(1, sr, sr);
    this.dc.getChannelData(0).fill(1);
  }

  /** The game now playing. A game's loops are silent while another game plays, and come back with it. */
  setGame(game: GameId): void {
    if (game === this.game) return;
    this.game = game;
    const now = this.ctx.currentTime;
    for (const [n, h] of this.held) {
      h.allowed = this.allowedFor(n);
      if (!h.apply(now)) this.waiting = true;
    }
  }

  /** Start loops that were asked for before their buffer was built. */
  tick(now: number): void {
    if (!this.waiting) return;
    this.waiting = false;
    for (const h of this.held.values()) if (!h.apply(now)) this.waiting = true;
  }

  /** Which loops are on and sounding, for the workbench and tests. */
  loops(): Record<string, { on: boolean; sounding: boolean; level: number; starts: number }> {
    const o: Record<string, { on: boolean; sounding: boolean; level: number; starts: number }> = {};
    for (const [n, h] of this.held) o[n] = { on: h.on, sounding: h.sounding, level: Number(h.level.toFixed(3)), starts: h.starts };
    return o;
  }

  // ------------------------------------------------------------ plumbing

  private allowedFor(n: LoopName): boolean {
    return n.startsWith(`${this.game}.`);
  }

  private count(kind: string, into: Record<string, number>): void {
    into[kind] = (into[kind] ?? 0) + 1;
  }

  /** The time a cue may start, or null to drop it. `k` counts how far into a burst we are. */
  private gate(key: string, gap: number, wait: number, now: number): { t: number; k: number } | null {
    let g = this.gates.get(key);
    if (!g) {
      g = { next: 0, n: -1 };
      this.gates.set(key, g);
    }
    const t = Math.max(now, g.next);
    if (t - now > wait + 1e-6) return null;
    g.n = now > g.next + 0.35 ? 0 : g.n + 1;
    g.next = t + gap;
    return { t, k: g.n };
  }

  private liveOf(key: string, now: number): number {
    const l = this.live.get(key);
    if (!l) return 0;
    let n = 0;
    for (let i = 0; i < l.length; i++) if (l[i] > now) l[n++] = l[i];
    l.length = n;
    return n;
  }

  private track(key: string, end: number): void {
    const l = this.live.get(key);
    if (l) l.push(end);
    else this.live.set(key, [end]);
  }

  /** An effect buffer, at the cue's pan, gain and pitch. */
  private fx(p: Play, name: FxName, at: number, gain: number, o: { rate?: number; pan?: number; far?: boolean; dur?: number } = {}): void {
    const b = this.bank.get(name, Math.floor(this.r() * 16));
    if (!b) return;
    const v = this.voices.play(b, o.far ? this.far : this.out, p.t + at, {
      gain: gain * p.gain, rate: (o.rate ?? 1) * p.pitch, pan: o.pan ?? p.pan, dur: o.dur, release: 0.1,
    });
    this.playEnd = Math.max(this.playEnd, v.end);
  }

  /** A note at the cue's pan and gain. Its pitch comes from the music, not from opts.pitch. */
  private tone(p: Play, inst: InstName, midi: number, at: number, gain: number, o: { dur?: number; attack?: number; release?: number; loop?: boolean } = {}): void {
    const s = this.bank.note(inst, midi);
    if (!s) return;
    const v = this.voices.play(s.buf, this.out, p.t + at, {
      gain: gain * p.gain, rate: s.rate, pan: p.pan, dur: o.dur ?? 1.2, release: o.release ?? 0.3, attack: o.attack, loop: o.loop,
    });
    this.playEnd = Math.max(this.playEnd, v.end);
  }

  private get key(): number {
    return this.music.harmony().key;
  }

  /** Pentatonic notes of the key now playing, lo to hi. */
  private penta(lo: number, hi: number): number[] {
    const k = this.key;
    const out: number[] = [];
    for (let m = lo; m <= hi; m++) if (PENTA.includes((((m - k) % 12) + 12) % 12)) out.push(m);
    return out;
  }

  /** Chord tones of the music now playing, lo to hi. */
  private chord(lo: number, hi: number): number[] {
    const h = this.music.harmony();
    const t = tonesIn(h.key, h.chord, lo, hi);
    return t.length ? t : [lo];
  }

  /**
   * The note for a pitch-stepped cue. With a pitch, the nearest ladder note
   * to that many semitones above the bottom, kept moving the way the pitch
   * moves along a chain (so a chain of rising pitches never repeats or falls
   * back). Without one, each cue in a chain takes the next rung, wrapping or
   * holding at the top.
   */
  private stepped(p: Play, lad: number[], wrap: boolean): number {
    const n = lad.length;
    const c = this.chains.get(p.key);
    const fresh = !c || p.now - c.at > 0.9;
    let idx: number;
    if (!p.pitched) {
      idx = fresh ? 0 : c.idx + 1;
      if (idx >= n) idx = wrap ? idx % n : n - 1;
    } else {
      const want = lad[0] + 12 * Math.log2(p.pitch);
      idx = 0;
      for (let i = 1; i < n; i++) if (Math.abs(lad[i] - want) < Math.abs(lad[idx] - want)) idx = i;
      if (!fresh) {
        if (p.pitch > c.pitch * 1.002 && idx <= c.idx) idx = Math.min(n - 1, c.idx + 1);
        else if (p.pitch < c.pitch / 1.002 && idx >= c.idx) idx = Math.max(0, c.idx - 1);
        else if (Math.abs(p.pitch / c.pitch - 1) <= 0.002) idx = c.idx;
      }
    }
    this.chains.set(p.key, { at: p.now, pitch: p.pitch, idx });
    const midi = lad[idx];
    const h = this.music.harmony();
    this.log.push({ name: p.name, midi, key: h.key, chord: h.chord.tones.map((t) => (((h.key + h.chord.root + t) % 12) + 12) % 12) });
    if (this.log.length > 400) this.log.splice(0, 100);
    return midi;
  }

  /** opts.pitch for a tune: the nearest transposition that stays in the key. */
  private shift(p: Play): number {
    const want = 12 * Math.log2(p.pitch);
    return SAFE_SHIFTS.reduce((a, s) => (Math.abs(s - want) < Math.abs(a - want) ? s : a), 0);
  }

  /** Same pan, a new gain: for cues whose gain carries an amount (plots watered, fall speed, coins). */
  private scaled(p: Play, floor: number): Play {
    return { ...p, gain: floor + (1 - floor) * p.gain };
  }

  /** A pad chord breathing in and out, for night and the run's big moments. */
  private swell(p: Play, notes: number[], at: number, gain: number, hold: number): void {
    for (const m of notes) this.tone(p, 'pad', m, at, gain, { loop: true, attack: 0.6, dur: hold, release: 1.4 });
  }

  // ------------------------------------------------------------ the sounds

  private build(): Record<CueName, (p: Play) => void> {
    const r = this.r;
    const jit = () => 0.95 + r() * 0.1;
    return {
      // ---------------------------------------------------------- Seedbound
      'deck.draw': (p) => {
        // Several in a row queue up into a soft riffle, alternating a little in pitch.
        this.fx(p, 'card', 0, Math.max(0.16, 0.3 - p.k * 0.02), { rate: (p.k % 2 ? 1.06 : 0.98) * jit() });
      },
      'deck.shuffle': (p) => this.fx(p, 'shuffle', 0, 0.36, { rate: jit() }),
      'deck.hover': (p) => this.fx(p, 'card', 0, 0.06, { rate: 1.5, dur: 0.04 }),
      'deck.pick': (p) => {
        this.fx(p, 'card', 0, 0.2, { rate: 1.25 });
        this.fx(p, 'tick', 0.012, 0.07, { rate: 1.3 });
      },
      'deck.drop': (p) => {
        this.fx(p, 'card', 0, 0.16, { rate: 0.85 });
        this.fx(p, 'thump', 0.03, 0.2, { rate: jit() });
      },
      'deck.play': (p) => {
        this.fx(p, 'swish', 0, 0.3, { rate: jit() });
        this.fx(p, 'thump', 0.12, 0.38, { rate: jit() });
      },
      'deck.plant': (p) => this.fx(p, 'plant', 0, 0.42, { rate: jit() }),
      'deck.water': (p) => this.fx(this.scaled(p, 0.35), 'water', 0, 0.42, { rate: jit() }),
      'deck.weather': (p) => {
        this.fx(p, 'whoosh', 0, 0.16, { rate: 0.8 });
        const c = this.chord(this.key + 19, this.key + 36);
        this.tone(p, 'celesta', c[0], 0.08, 0.16, { dur: 1.2 });
        this.tone(p, 'celesta', c[Math.min(c.length - 1, 2)], 0.2, 0.15, { dur: 1.4 });
        this.tone(p, 'bell', c[c.length - 1], 0.32, 0.07, { dur: 1.6 });
      },
      'deck.grow': (p) => {
        // A soft shimmer up the pentatonic and a breath of pad, once a night.
        const lad = this.penta(this.key + 24, this.key + 40);
        lad.slice(0, 6).forEach((m, j) => this.tone(p, j % 2 ? 'celesta' : 'musicbox', m, j * 0.06, 0.11 - j * 0.008, { dur: 0.9 }));
        this.swell(p, [this.key, this.key + 7], 0, 0.05, 0.9);
      },
      'deck.harvest': (p) => {
        const m = this.stepped(p, this.penta(this.key + 7, this.key + 38), false);
        this.fx(p, 'pop', 0, 0.26, { rate: 1 / Math.sqrt(p.pitch) });
        this.tone(p, 'marimba', m, 0.012, 0.3, { dur: 0.7 });
      },
      'deck.chip': (p) => {
        const m = this.stepped(p, this.chord(this.key + 17, this.key + 41), true);
        this.tone(p, 'chip', m, 0, 0.12, { dur: 0.07, release: 0.03 });
      },
      'deck.mult': (p) => {
        // Brighter and bigger as the mult climbs: an octave bell from the fifth rung, a music box fifth from the eighth.
        const lad = this.penta(this.key + 12, this.key + 36);
        const m = this.stepped(p, lad, false);
        const rung = lad.indexOf(m);
        this.fx(p, 'tick', 0, 0.1, { rate: 1.4 / p.pitch });
        this.tone(p, 'celesta', m, 0, 0.26, { dur: 0.8 });
        if (rung >= 4) this.tone(p, 'bell', m + 12, 0.02, 0.1, { dur: 0.9 });
        if (rung >= 7) this.tone(p, 'musicbox', m + 19, 0.05, 0.12, { dur: 0.8 });
      },
      'deck.big': (p) => {
        const s = this.shift(p);
        const c = this.chord(this.key + 12 + s, this.key + 36 + s);
        c.slice(0, 4).forEach((m, j) => this.tone(p, 'celesta', m, j * 0.07, 0.22, { dur: 1.2 }));
        const top = c[Math.min(c.length - 1, 4)];
        this.tone(p, 'bell', top, 0.28, 0.12, { dur: 1.8 });
        this.chord(this.key - 5 + s, this.key + 9 + s).slice(0, 3).forEach((m, j) => this.tone(p, 'piano', m, 0.28 + j * 0.012, 0.13, { dur: 1.6 }));
      },
      'deck.quota': (p) => {
        const k = this.key + this.shift(p);
        [0, 4, 7, 12, 16, 19].forEach((iv, j) => this.tone(p, 'celesta', k + 12 + iv, j * 0.075, 0.17, { dur: 1.4 }));
        const top = 6 * 0.075;
        [0, 4, 7, 12].forEach((iv, j) => this.tone(p, 'piano', k - 12 + iv, top + j * 0.015, 0.12, { dur: 2.2 }));
        this.tone(p, 'bell', k + 24, top, 0.11, { dur: 2.4 });
        this.tone(p, 'bell', k + 31, top + 0.2, 0.08, { dur: 2.2 });
        this.swell(p, [k - 12, k - 5, k, k + 4], top, 0.05, 1.8);
        this.fx(p, 'frame', top, 0.26);
      },
      'deck.fail': (p) => {
        // Gentle: a slow piano falling home over a low pad. Nothing harsh.
        const k = this.key + this.shift(p);
        [9, 7, 4, 2, 0].forEach((iv, j) => this.tone(p, 'piano', k + iv, j * 0.36, 0.2 - j * 0.015, { dur: 1.6 }));
        this.swell(p, [k - 12, k - 5], 0.2, 0.07, 2.4);
      },
      'deck.buy': (p) => {
        const c = this.chord(this.key + 24, this.key + 40);
        this.tone(p, 'musicbox', c[0], 0, 0.17, { dur: 0.8 });
        this.tone(p, 'musicbox', c[Math.min(c.length - 1, 2)], 0.07, 0.15, { dur: 1 });
        this.fx(p, 'paper', 0, 0.12);
        this.fx(p, 'tick', 0.07, 0.08, { rate: 1.5 });
      },
      'deck.page': (p) => {
        this.fx(p, 'paper', 0, 0.24, { rate: 0.85 * jit() });
        const c = this.chord(this.key + 19, this.key + 31);
        this.tone(p, 'celesta', c[c.length - 1], 0.1, 0.14, { dur: 1.2 });
      },
      'deck.remove': (p) => {
        this.fx(p, 'crumple', 0, 0.3, { rate: jit() });
        this.tone(p, 'piano', this.chord(this.key - 5, this.key + 7)[0], 0.18, 0.14, { dur: 0.9 });
      },
      'deck.reroll': (p) => {
        this.fx(p, 'shuffle', 0, 0.24, { rate: 1.3, dur: 0.4 });
        const c = this.chord(this.key + 12, this.key + 28);
        this.tone(p, 'marimba', c[0], 0.3, 0.2, { dur: 0.5 });
        this.tone(p, 'marimba', c[Math.min(c.length - 1, 2)], 0.38, 0.2, { dur: 0.6 });
      },
      'deck.pest': (p) => this.fx(p, 'bugs', 0, 0.22, { rate: jit() }),
      'deck.crow': (p) => {
        this.fx(p, 'flap', 0, 0.3);
        this.fx(p, 'caw', 0.08, 0.26, { far: true });
      },
      'deck.endday': (p) => {
        this.fx(p, 'thump', 0, 0.3);
        this.fx(p, 'whoosh', 0.02, 0.1, { rate: 0.7 });
        const c = this.chord(this.key + 12, this.key + 26);
        this.tone(p, 'celesta', c[c.length - 1], 0.04, 0.16, { dur: 1.2 });
        this.tone(p, 'celesta', c[0], 0.2, 0.16, { dur: 1.6 });
      },
      'deck.deny': (p) => this.fx(p, 'deny', 0, 0.36),

      // ---------------------------------------------------------- Thistledown
      'ranch.suck': (p) => this.fx(p, 'suck', 0, 0.28 * Math.max(0.55, 1 - p.k * 0.02), { rate: jit() }),
      'ranch.puff': (p) => this.fx(p, 'puff', 0, 0.4, { rate: jit() }),
      'ranch.full': (p) => {
        this.fx(p, 'clunk', 0, 0.34);
        this.fx(p, 'deny', 0.09, 0.22);
      },
      'ranch.slot': (p) => {
        this.fx(p, 'tick', 0, 0.14, { rate: 1.15 });
        const lad = this.penta(this.key + 19, this.key + 33);
        const want = lad[0] + 12 * Math.log2(p.pitch);
        const m = lad.reduce((a, x) => (Math.abs(x - want) < Math.abs(a - want) ? x : a), lad[0]);
        this.tone(p, 'kalimba', m, 0.01, 0.14, { dur: 0.5 });
      },
      'ranch.step': (p) => this.fx(p, 'stepGrass', 0, 0.2, { rate: jit() }),
      'ranch.stepstone': (p) => this.fx(p, 'stepStone', 0, 0.24, { rate: jit() }),
      'ranch.jump': (p) => {
        this.fx(p, 'whoosh', 0, 0.12, { rate: 1.7, dur: 0.18 });
        this.fx(p, 'stepGrass', 0, 0.14, { rate: 0.9 });
      },
      'ranch.land': (p) => {
        const q = this.scaled(p, 0.3);
        this.fx(q, 'thump', 0, 0.34, { rate: 0.85 });
        this.fx(q, 'stepGrass', 0.005, 0.24, { rate: 0.8 });
      },
      'ranch.glide': (p) => {
        this.fx(p, 'whoosh', 0, 0.2, { rate: 0.75 });
        const c = this.chord(this.key + 12, this.key + 26);
        this.tone(p, 'flute', c[c.length - 1], 0.05, 0.1, { attack: 0.15, dur: 0.7, release: 0.4 });
      },
      'ranch.chirp': (p) => this.fx(p, 'chirp', 0, 0.24, { rate: jit() }),
      'ranch.squeak': (p) => this.fx(p, 'squeak', 0, 0.2, { rate: jit() }),
      'ranch.boing': (p) => this.fx(p, 'boing', 0, 0.3, { rate: jit() }),
      'ranch.eat': (p) => this.fx(p, 'munch', 0, 0.3, { rate: jit() }),
      'ranch.shed': (p) => {
        this.fx(p, 'fluff', 0, 0.3, { rate: jit() });
        const c = this.chord(this.key + 24, this.key + 36);
        this.tone(p, 'kalimba', c[Math.floor(r() * c.length)], 0.02, 0.1, { dur: 0.8 });
      },
      'ranch.frazzle': (p) => this.fx(p, 'trill', 0, 0.22, { rate: jit() }),
      'ranch.sell': (p) => {
        this.fx(p, 'whoosh', 0, 0.12, { rate: 1.2, dur: 0.25 });
        this.fx(p, 'knock', 0.12, 0.26, { rate: 0.85 });
        const c = this.chord(this.key + 12, this.key + 28);
        this.tone(p, 'kalimba', c[Math.min(c.length - 1, 1 + (p.k % 3))], 0.14, 0.24, { dur: 0.9 });
      },
      'ranch.coins': (p) => {
        // More coins, more notes: gain carries the amount.
        const n = 1 + Math.round(p.gain * 3);
        const q = this.scaled(p, 0.6);
        const c = this.chord(this.key + 24, this.key + 40);
        for (let j = 0; j < n; j++) this.tone(q, 'musicbox', c[Math.min(c.length - 1, j)], j * 0.055, 0.18 - j * 0.02, { dur: 1 });
        if (n >= 3) this.tone(q, 'bell', c[Math.min(c.length - 1, n)], n * 0.055, 0.09, { dur: 1.4 });
      },
      'ranch.build': (p) => {
        this.fx(p, 'knock', 0, 0.42);
        this.fx(p, 'knock', 0.14, 0.36, { rate: 1.08 });
        this.fx(p, 'knock', 0.26, 0.3, { rate: 0.95 });
        this.tone(p, 'bell', this.key + 31, 0.42, 0.08, { dur: 1 });
      },
      'ranch.gate': (p) => {
        this.fx(p, 'creak', 0, 0.3);
        this.fx(p, 'knock', 0.36, 0.3, { rate: 0.8 });
        const c = this.chord(this.key + 12, this.key + 31);
        c.slice(0, 4).forEach((m, j) => this.tone(p, 'kalimba', m, 0.5 + j * 0.09, 0.22, { dur: 1 }));
        this.tone(p, 'bell', c[Math.min(c.length - 1, 4)], 0.5 + 0.36, 0.1, { dur: 1.8 });
      },
      'ranch.nettle': (p) => this.fx(p, 'snuffle', 0, 0.3, { rate: jit() }),
      'ranch.nettlehit': (p) => {
        this.fx(p, 'thump', 0, 0.32);
        this.fx(p, 'squeak', 0.03, 0.2, { rate: 0.8 });
        // Rolling away: a few soft bumps, further and further off.
        for (let j = 0; j < 4; j++) this.fx(p, 'stepGrass', 0.18 + j * 0.13, 0.16 - j * 0.03, { rate: 0.7 + j * 0.05 });
      },
      'ranch.splash': (p) => this.fx(p, 'splash', 0, 0.36, { rate: jit() }),
      'ranch.goal': (p) => {
        const s = this.shift(p);
        const c = this.chord(this.key + 12 + s, this.key + 36 + s);
        c.slice(0, 4).forEach((m, j) => this.tone(p, 'kalimba', m, j * 0.08, 0.26, { dur: 1 }));
        const top = 4 * 0.08;
        this.tone(p, 'celesta', c[Math.min(c.length - 1, 4)], top, 0.18, { dur: 1.6 });
        this.tone(p, 'bell', c[Math.min(c.length - 1, 5)], top, 0.09, { dur: 2 });
      },
      'ranch.deny': (p) => this.fx(p, 'deny', 0, 0.36),
      'ranch.sleep': (p) => {
        // A pad chord breathing in under a falling kalimba, as the valley goes quiet.
        const k = this.key + this.shift(p);
        this.swell(p, [k - 12, k - 5, k, k + 4], 0, 0.07, 2.2);
        [7, 4, 2, 0].forEach((iv, j) => this.tone(p, 'kalimba', k + 24 + iv, j * 0.42, 0.18, { dur: 1.4 }));
      },
    };
  }
}
