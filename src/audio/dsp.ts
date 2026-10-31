// Small offline DSP kit for building instrument and effect buffers in plain
// JavaScript at startup. Nothing here touches an AudioContext, so buffers can
// be made before the first tap and shared by realtime and offline contexts.

/** Sample rate for synthesized buffers. Soft farm sounds need little above 14 kHz. */
export const SR = 32000;

export type Rand = () => number;

/** Mulberry32. Seeded so renders and tests are repeatable. */
export function rand(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function buf(seconds: number, sr = SR): Float32Array<ArrayBuffer> {
  return new Float32Array(Math.max(1, Math.round(seconds * sr)));
}

/** RBJ biquad, transposed direct form II. */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private z1 = 0;
  private z2 = 0;

  constructor(
    private kind: 'lp' | 'hp' | 'bp' | 'peak',
    f: number,
    q = 0.707,
    private gainDb = 0,
    private sr = SR,
  ) {
    this.set(f, q);
  }

  set(f: number, q: number): void {
    const w = (2 * Math.PI * clamp(f, 10, this.sr * 0.45)) / this.sr;
    const cs = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    if (this.kind === 'lp') {
      b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
    } else if (this.kind === 'hp') {
      b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
    } else if (this.kind === 'bp') {
      b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
    } else {
      const A = Math.pow(10, this.gainDb / 40);
      b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }

  run(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }

  /** Filter a whole buffer in place. */
  apply<T extends Float32Array>(d: T): T {
    for (let i = 0; i < d.length; i++) d[i] = this.run(d[i]);
    return d;
  }
}

/** One-pole lowpass coefficient for a cutoff in Hz. */
export function onePole(f: number, sr = SR): number {
  return 1 - Math.exp((-2 * Math.PI * f) / sr);
}

export function lowpass<T extends Float32Array>(d: T, f: number, sr = SR): T {
  const k = onePole(f, sr);
  let y = 0;
  for (let i = 0; i < d.length; i++) {
    y += k * (d[i] - y);
    d[i] = y;
  }
  return d;
}

export function highpass<T extends Float32Array>(d: T, f: number, sr = SR): T {
  const k = onePole(f, sr);
  let y = 0;
  for (let i = 0; i < d.length; i++) {
    y += k * (d[i] - y);
    d[i] = d[i] - y;
  }
  return d;
}

export function white(n: number, r: Rand): Float32Array<ArrayBuffer> {
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
  return d;
}

/** Paul Kellet's economy pink noise. */
export function pink(n: number, r: Rand): Float32Array<ArrayBuffer> {
  const d = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
  }
  return d;
}

export function brown(n: number, r: Rand): Float32Array<ArrayBuffer> {
  const d = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y = (y + 0.02 * (r() * 2 - 1)) / 1.02;
    d[i] = y * 3.5;
  }
  return d;
}

export function peak(d: Float32Array): number {
  let p = 0;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a > p) p = a;
  }
  return p;
}

export function normalize<T extends Float32Array>(d: T, to = 0.9): T {
  const p = peak(d);
  if (p > 0) {
    const g = to / p;
    for (let i = 0; i < d.length; i++) d[i] *= g;
  }
  return d;
}

/** Short fades at both ends so a buffer never starts or stops on a click. */
export function edges<T extends Float32Array>(d: T, inS = 0.002, outS = 0.01, sr = SR): T {
  const a = Math.min(d.length, Math.round(inS * sr));
  const b = Math.min(d.length, Math.round(outS * sr));
  for (let i = 0; i < a; i++) d[i] *= i / a;
  for (let i = 0; i < b; i++) d[d.length - 1 - i] *= i / b;
  return d;
}

/** Add src into dst at a sample offset, scaled. */
export function mix(dst: Float32Array, src: Float32Array, at = 0, g = 1): void {
  const n = Math.min(src.length, dst.length - at);
  for (let i = 0; i < n; i++) dst[at + i] += src[i] * g;
}

/**
 * Make a seamless loop: render `loop + xf` samples, then fold the tail over
 * the head with an equal-power crossfade and drop the tail.
 */
export function foldLoop(d: Float32Array, xf: number): Float32Array<ArrayBuffer> {
  const n = d.length - xf;
  const out = new Float32Array(n);
  out.set(d.subarray(0, n));
  for (let i = 0; i < xf; i++) {
    const t = i / xf;
    out[i] = d[i] * Math.sin((t * Math.PI) / 2) + d[n + i] * Math.cos((t * Math.PI) / 2);
  }
  return out;
}

/** Exponential decay envelope multiplier per sample for a time constant. */
export function decayK(tau: number, sr = SR): number {
  return Math.exp(-1 / (tau * sr));
}

/** PolyBLEP correction for band-limited sawtooth and square waves. */
export function blep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

/**
 * A sum of decaying sine partials: bars, bells, tines. Each partial is
 * [ratio, amplitude, decay seconds]. Uses a rotating oscillator, not Math.sin.
 */
export function modal(f: number, parts: [number, number, number][], dur: number, attack = 0.001, sr = SR): Float32Array<ArrayBuffer> {
  const d = buf(dur, sr);
  for (const [ratio, amp, tau] of parts) {
    const fr = f * ratio;
    if (fr >= sr * 0.45) continue;
    const w = (2 * Math.PI * fr) / sr;
    const c = 2 * Math.cos(w);
    let s1 = Math.sin(-w);
    let s2 = Math.sin(-2 * w);
    let e = amp;
    const k = decayK(tau, sr);
    const n = Math.min(d.length, Math.round(tau * 9 * sr));
    for (let i = 0; i < n; i++) {
      const s = c * s1 - s2;
      s2 = s1;
      s1 = s;
      d[i] += s * e;
      e *= k;
    }
  }
  const a = Math.max(1, Math.round(attack * sr));
  for (let i = 0; i < a && i < d.length; i++) d[i] *= i / a;
  return d;
}

/**
 * Karplus-Strong plucked string. Returns the buffer and its true pitch: the
 * loop delay is an integer plus the filter's delay, so the sample is tagged
 * with the frequency it really sounds at and the player repitches exactly.
 */
export function pluck(
  f: number,
  o: { dur: number; t60: number; w?: number; bright?: number; pos?: number; seed: number },
): { data: Float32Array<ArrayBuffer>; f0: number } {
  const w = o.w ?? 0.5;
  // y[n] = s((1 - w) y[n - N] + w y[n - N + 1]): the loop delay is N - w.
  const N = Math.max(2, Math.round(SR / f + w));
  const f0 = SR / (N - w);
  const r = rand(o.seed);
  const line = new Float32Array(N);
  // Excitation: noise softened by a one-pole, then a pluck-position comb.
  const k = onePole(400 + (o.bright ?? 0.5) * 7000);
  let y = 0;
  for (let i = 0; i < N; i++) {
    y += k * (r() * 2 - 1 - y);
    line[i] = y;
  }
  const P = Math.max(1, Math.round(N * (o.pos ?? 0.18)));
  const ex = line.slice();
  for (let i = 0; i < N; i++) line[i] = ex[i] - ex[(i + P) % N] * 0.9;
  let mean = 0;
  for (let i = 0; i < N; i++) mean += line[i];
  mean /= N;
  for (let i = 0; i < N; i++) line[i] -= mean;
  // Loss per pass sets the decay of the fundamental.
  const g = Math.pow(10, -3 / (o.t60 * f0));
  const lp = Math.cos((Math.PI * f0) / SR);
  const s = Math.min(0.99995, g / Math.max(0.5, lp));
  const d = buf(o.dur);
  let i = 0;
  for (let n = 0; n < d.length; n++) {
    const a = line[i];
    const j = i + 1 === N ? 0 : i + 1;
    d[n] = a;
    line[i] = s * ((1 - w) * a + w * line[j]);
    i = j;
  }
  return { data: d, f0 };
}
