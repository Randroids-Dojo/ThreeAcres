// The recipes for every sound in the game: plain JavaScript DSP that turns a
// job into Float32Arrays. No DOM and no AudioContext, so it runs in a worker
// as happily as on the main thread. bank.ts turns the results into buffers.

import {
  Biquad, SR, blep, brown, buf, clamp, decayK, edges, foldLoop, highpass, lowpass, mix, modal, mtof,
  normalize, onePole, peak, pink, pluck, rand, white,
} from './dsp';

export type InstName =
  | 'guitar' | 'banjo' | 'bass' | 'fiddle' | 'marimba' | 'celesta' | 'musicbox' | 'piano' | 'bell' | 'pad'
  | 'kalimba' | 'harp' | 'flute' | 'chip';

export type FxName =
  | 'kick' | 'brush' | 'tap' | 'shaker' | 'block' | 'tamb' | 'sleigh'
  | 'till' | 'water' | 'plant' | 'tend' | 'clear' | 'knock' | 'creak' | 'wither' | 'bugs' | 'sprinkle'
  | 'caw' | 'peck' | 'flap' | 'deny' | 'rooster' | 'thunder' | 'sigh' | 'whistle' | 'paper' | 'tick' | 'pop'
  | 'stepGrass' | 'stepSoil' | 'stepGravel' | 'stepDirt' | 'stepWood' | 'stepWater'
  | 'drop' | 'bird' | 'frog' | 'rain' | 'wind' | 'crickets' | 'cicadas' | 'whoosh'
  | 'frame' | 'pod' | 'card' | 'shuffle' | 'thump' | 'swish' | 'crumple'
  | 'suck' | 'puff' | 'clunk' | 'stepStone' | 'chirp' | 'squeak' | 'boing' | 'munch' | 'fluff' | 'trill' | 'snuffle' | 'splash' | 'owl'
  | 'bellows' | 'gust' | 'brook' | 'vents' | 'grass' | 'insects';


// ---------------------------------------------------------------- instruments

function guitarNote(m: number, seed: number): { data: Float32Array<ArrayBuffer>; f0: number } {
  const t60 = clamp(4.2 - (m - 40) * 0.07, 1.4, 4.2);
  const p = pluck(mtof(m), { dur: 2.4, t60, w: 0.5, bright: 0.45, pos: 0.2, seed });
  const body = new Biquad('peak', 190, 1.2, 4);
  const air = new Biquad('peak', 2800, 1, 2);
  body.apply(p.data);
  air.apply(p.data);
  lowpass(p.data, 6000);
  return { data: edges(normalize(p.data), 0.0005, 0.05), f0: p.f0 };
}

function banjoNote(m: number, seed: number): { data: Float32Array<ArrayBuffer>; f0: number } {
  const p = pluck(mtof(m), { dur: 1.5, t60: 0.75, w: 0.28, bright: 0.9, pos: 0.12, seed });
  // The head: a tight ring around 1.5 kHz that dies fast, and less low end.
  const head = new Biquad('peak', 1500, 1.4, 7);
  head.apply(p.data);
  highpass(p.data, 160);
  const r = rand(seed + 9);
  const twang = modal(mtof(m) * 4.02, [[1, 0.25, 0.05]], 0.2);
  mix(p.data, twang, 0, 0.3 * (0.8 + r() * 0.4));
  return { data: edges(normalize(p.data), 0.0005, 0.05), f0: p.f0 };
}

function bassNote(m: number, seed: number): { data: Float32Array<ArrayBuffer>; f0: number } {
  const p = pluck(mtof(m), { dur: 2, t60: 1.5, w: 0.5, bright: 0.12, pos: 0.25, seed });
  lowpass(lowpass(p.data, 1100), 1600);
  const body = new Biquad('peak', 110, 1, 3);
  body.apply(p.data);
  return { data: edges(normalize(p.data), 0.001, 0.05), f0: p.f0 };
}

/** Bowed string: a band-limited saw with delayed vibrato through body formants. */
function fiddleNote(m: number, seed: number): { data: Float32Array<ArrayBuffer>; f0: number } {
  const f = mtof(m);
  const r = rand(seed);
  const d = buf(2.6);
  const forms: [Biquad, number][] = [
    [new Biquad('bp', 290, 2.2), 0.9],
    [new Biquad('bp', 640, 2.5), 0.55],
    [new Biquad('bp', 1250, 2.5), 0.35],
    [new Biquad('bp', 2700, 1.8), 0.5],
  ];
  const hum = new Biquad('lp', 1800, 0.7);
  const bow = new Biquad('bp', 3200, 1.2);
  let ph = 0;
  let vph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const vibAmt = clamp((t - 0.22) / 0.5, 0, 1) * 0.0085;
    vph += 5.6 / SR;
    const fi = f * (1 + vibAmt * Math.sin(2 * Math.PI * vph) + (r() - 0.5) * 0.0015);
    const dt = fi / SR;
    ph += dt;
    if (ph >= 1) ph -= 1;
    const saw = 2 * ph - 1 - blep(ph, dt);
    let y = hum.run(saw) * 0.35;
    for (const [bq, g] of forms) y += bq.run(saw) * g;
    y += bow.run(r() * 2 - 1) * 0.06 * (1 + 2 * Math.exp(-t / 0.05));
    const env = Math.min(1, t / 0.07) * (0.88 + 0.12 * Math.min(1, t / 0.6));
    d[i] = y * env;
  }
  lowpass(d, 5200);
  return { data: edges(normalize(d), 0.001, 0.05), f0: f };
}

function marimbaNote(m: number): { data: Float32Array<ArrayBuffer>; f0: number } {
  const f = mtof(m);
  const tau = clamp(0.95 - (m - 48) * 0.017, 0.22, 0.95);
  const d = modal(f, [[1, 1, tau], [3.99, 0.32, tau * 0.22], [9.15, 0.08, tau * 0.07]], 1.2, 0.0015);
  const r = rand(m * 7);
  const click = lowpass(white(Math.round(0.006 * SR), r), 1800);
  for (let i = 0; i < click.length; i++) click[i] *= Math.exp(-i / (0.0015 * SR));
  mix(d, click, 0, 0.25);
  return { data: edges(normalize(d), 0.0005, 0.04), f0: f };
}

function celestaNote(m: number): { data: Float32Array<ArrayBuffer>; f0: number } {
  const f = mtof(m);
  const d = modal(f, [[1, 1, 1.1], [2, 0.16, 0.45], [3, 0.05, 0.22], [4.02, 0.07, 0.1], [1.003, 0.25, 0.9]], 2.0, 0.003);
  return { data: edges(normalize(d), 0.001, 0.05), f0: f };
}

function musicboxNote(m: number): { data: Float32Array<ArrayBuffer>; f0: number } {
  const f = mtof(m);
  const d = modal(f, [[1, 1, 1.3], [3, 0.1, 0.3], [5.4, 0.16, 0.1], [8.93, 0.06, 0.04], [1.0021, 0.3, 1.0]], 1.8, 0.0008);
  const r = rand(m * 13);
  const tick = highpass(white(Math.round(0.003 * SR), r), 3000);
  mix(d, tick, 0, 0.15);
  return { data: edges(normalize(d), 0.0005, 0.05), f0: f };
}

/** Felt piano: soft inharmonic partials, two strings a hair apart, a muffled thump. */
function pianoNote(m: number): { data: Float32Array<ArrayBuffer>; f0: number } {
  const f = mtof(m);
  const T1 = clamp(2.6 - (m - 36) * 0.035, 0.9, 2.6);
  const parts: [number, number, number][] = [];
  for (let n = 1; n <= 9; n++) {
    const ratio = n * Math.sqrt(1 + 0.0004 * n * n);
    if (ratio * f > 5000) break;
    const amp = Math.pow(n, -1.4) * Math.exp(-(n - 1) * 0.45);
    const tau = T1 / (1 + 0.55 * (n - 1));
    parts.push([ratio, amp * 0.55, tau]);
    parts.push([ratio * 1.0008, amp * 0.45, tau * 0.9]);
    if (n <= 2) parts.push([ratio, amp * 0.5, 0.18]);
  }
  const d = modal(f, parts, 2.6, 0.007);
  const r = rand(m * 3);
  const thump = lowpass(white(Math.round(0.05 * SR), r), 260);
  for (let i = 0; i < thump.length; i++) thump[i] *= Math.exp(-i / (0.012 * SR));
  mix(d, thump, 0, 0.5);
  lowpass(d, 5200);
  return { data: edges(normalize(d), 0.001, 0.05), f0: f };
}

function bellNote(m: number): { data: Float32Array<ArrayBuffer>; f0: number } {
  const f = mtof(m);
  const d = modal(
    f,
    [[1, 1, 2.0], [1.0017, 0.5, 1.8], [2.0, 0.32, 1.1], [2.76, 0.22, 0.55], [5.4, 0.1, 0.22], [8.93, 0.04, 0.1]],
    2.6,
    0.001,
  );
  return { data: edges(normalize(d), 0.0005, 0.05), f0: f };
}

/** A pad that loops cleanly: every oscillator fits a whole number of cycles in the loop. */
function padNote(m: number): { data: Float32Array<ArrayBuffer>; f0: number } {
  const L = 2;
  const k = Math.round(mtof(m) * L);
  const f0 = k / L;
  const xf = 0.3;
  const d = buf(L + xf);
  const fs = [(k - 1) / L, k / L, (k + 1) / L];
  const ph = [0.1, 0.5, 0.8];
  const sineK = (2 * Math.PI * f0) / SR;
  const k1 = onePole(Math.min(1800, f0 * 3.5));
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < d.length; i++) {
    let s = 0;
    for (let v = 0; v < 3; v++) {
      const dt = fs[v] / SR;
      ph[v] += dt;
      if (ph[v] >= 1) ph[v] -= 1;
      s += 2 * ph[v] - 1 - blep(ph[v], dt);
    }
    s = s * 0.3 + Math.sin(sineK * i) * 0.6;
    y1 += k1 * (s - y1);
    y2 += k1 * (y1 - y2);
    const breath = 1 + 0.08 * Math.sin((2 * Math.PI * i) / (SR * L));
    d[i] = y2 * breath;
  }
  // Warm up the filters by dropping nothing: the fold hides the start.
  return { data: normalize(foldLoop(d, Math.round(xf * SR)), 0.8), f0 };
}

// ---------------------------------------------------------------- percussion

function env<T extends Float32Array>(d: T, a: number, tau: number): T {
  const an = Math.max(1, Math.round(a * SR));
  const k = decayK(tau);
  let e = 1;
  for (let i = 0; i < d.length; i++) {
    if (i < an) d[i] *= i / an;
    else {
      d[i] *= e;
      e *= k;
    }
  }
  return d;
}

function kick(): Float32Array<ArrayBuffer> {
  const d = buf(0.45);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const f = 48 + 75 * Math.exp(-t / 0.028);
    ph += (2 * Math.PI * f) / SR;
    d[i] = Math.sin(ph) * Math.exp(-t / 0.16);
  }
  const r = rand(5);
  const click = lowpass(white(Math.round(0.004 * SR), r), 2500);
  mix(d, click, 0, 0.2);
  return edges(normalize(d), 0.0005, 0.02);
}

function brush(seed: number, long: boolean): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = white(Math.round((long ? 0.3 : 0.12) * SR), r);
  const bp = new Biquad('bp', long ? 3800 : 4500, 0.6);
  bp.apply(d);
  env(d, long ? 0.03 : 0.002, long ? 0.075 : 0.03);
  return edges(normalize(d), 0.0005, 0.02);
}

function shaker(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = highpass(highpass(white(Math.round(0.09 * SR), r), 5500), 5500);
  env(d, 0.012, 0.025);
  return edges(normalize(d), 0.0005, 0.01);
}

function block(): Float32Array<ArrayBuffer> {
  const d = modal(980, [[1, 1, 0.035], [2.48, 0.45, 0.014], [4.1, 0.15, 0.006]], 0.18, 0.0004);
  const r = rand(11);
  mix(d, highpass(white(Math.round(0.002 * SR), r), 2000), 0, 0.3);
  return edges(normalize(d), 0.0002, 0.01);
}

function jingle(seed: number, shakes: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.35 + shakes * 0.05);
  for (let s = 0; s < shakes; s++) {
    const at = Math.round(s * 0.045 * SR);
    const amp = 1 - s * 0.18;
    for (let j = 0; j < 7; j++) {
      const f = 4800 + r() * 4200;
      const ring = modal(f, [[1, 1, 0.05 + r() * 0.05], [1.37, 0.4, 0.03]], 0.25, 0.0003);
      mix(d, ring, at + Math.round(r() * 0.008 * SR), amp * (0.4 + r() * 0.6));
    }
    const hiss = highpass(white(Math.round(0.04 * SR), r), 6000);
    env(hiss, 0.002, 0.012);
    mix(d, hiss, at, amp * 0.5);
  }
  return edges(normalize(d), 0.0003, 0.02);
}

// ---------------------------------------------------------------- effects

function thud(f: number, tau: number, dur: number): Float32Array<ArrayBuffer> {
  const d = buf(dur);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * f * (1 + 0.6 * Math.exp(-t / 0.02))) / SR;
    d[i] = Math.sin(ph) * Math.exp(-t / tau);
  }
  return d;
}

/** Scatter of tiny filtered clicks: gravel, soil, crunch. */
function grains(dur: number, count: number, lo: number, hi: number, r: () => number, decay = 1): Float32Array<ArrayBuffer> {
  const d = buf(dur);
  for (let g = 0; g < count; g++) {
    const at = Math.floor(Math.pow(r(), decay) * (d.length - 200));
    const f = lo + r() * (hi - lo);
    const len = Math.round((0.0015 + r() * 0.003) * SR);
    const amp = 0.3 + r() * 0.7;
    const bp = new Biquad('bp', f, 2.5);
    for (let i = 0; i < len; i++) d[at + i] += bp.run((r() * 2 - 1) * Math.exp(-i / (len * 0.3))) * amp;
  }
  return d;
}

function till(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = thud(62 + r() * 12, 0.07, 0.4);
  const crunch = lowpass(white(Math.round(0.12 * SR), r), 1400);
  env(crunch, 0.002, 0.04);
  mix(d, crunch, 0, 0.5);
  mix(d, grains(0.3, 40, 900, 3200, r, 1.6), Math.round(0.02 * SR), 0.35);
  return edges(normalize(d), 0.0005, 0.03);
}

function water(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.62);
  const n = white(d.length, r);
  const bp = new Biquad('bp', 700, 2.2);
  let gurgle = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    if (i % 64 === 0) {
      gurgle += (r() - 0.5) * 0.5;
      gurgle *= 0.92;
      bp.set(650 + 500 * Math.min(1, t / 0.4) + gurgle * 500, 2.2);
    }
    const e = Math.min(1, t / 0.05) * (t < 0.42 ? 1 : Math.exp(-(t - 0.42) / 0.06));
    d[i] = bp.run(n[i]) * e * (0.7 + 0.3 * Math.sin(t * 2 * Math.PI * (19 + gurgle * 8)));
  }
  // Droplets landing.
  for (let k = 0; k < 6; k++) {
    const f = 1300 + r() * 1800;
    const at = Math.round((0.12 + r() * 0.45) * SR);
    const len = Math.round(0.04 * SR);
    let ph = 0;
    for (let i = 0; i < len && at + i < d.length; i++) {
      ph += (2 * Math.PI * f * (1 + 0.5 * Math.exp(-i / (0.006 * SR)))) / SR;
      d[at + i] += Math.sin(ph) * Math.exp(-i / (0.009 * SR)) * 0.25 * (0.5 + r());
    }
  }
  const splash = highpass(white(Math.round(0.2 * SR), r), 2500);
  env(splash, 0.01, 0.05);
  mix(d, splash, Math.round(0.08 * SR), 0.25);
  return edges(normalize(d), 0.002, 0.03);
}

function pop(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.2);
  let ph = 0;
  const f0 = 320 + r() * 80;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (f0 + 650 * (1 - Math.exp(-t / 0.018)))) / SR;
    d[i] = Math.sin(ph) * Math.exp(-t / 0.035) * Math.min(1, t / 0.003);
  }
  const pat = lowpass(white(Math.round(0.05 * SR), r), 500);
  env(pat, 0.002, 0.012);
  mix(d, pat, 0, 0.8);
  return edges(normalize(d), 0.0005, 0.02);
}

function plant(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.3);
  const pat = lowpass(white(Math.round(0.08 * SR), r), 700);
  env(pat, 0.002, 0.02);
  mix(d, pat, 0, 0.7);
  mix(d, pop(seed + 1), Math.round(0.05 * SR), 0.8);
  return edges(normalize(d), 0.0005, 0.02);
}

function rustle(dur: number, r: () => number, f = 3000): Float32Array<ArrayBuffer> {
  const d = white(Math.round(dur * SR), r);
  const bp = new Biquad('bp', f, 0.9);
  bp.apply(d);
  for (let i = 0; i < d.length; i++) {
    const t = i / d.length;
    d[i] *= Math.sin(Math.PI * t) * (0.6 + 0.4 * Math.sin(i / (0.004 * SR) + r()));
  }
  return d;
}

function tend(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.42);
  mix(d, rustle(0.13, r, 2800), 0, 0.8);
  mix(d, rustle(0.11, r, 3400), Math.round(0.16 * SR), 0.7);
  mix(d, grains(0.35, 18, 2500, 6000, r), 0, 0.3);
  const flick = modal(2400, [[1, 1, 0.012]], 0.05, 0.0003);
  mix(d, flick, Math.round(0.3 * SR), 0.35);
  return edges(normalize(d), 0.002, 0.03);
}

function clear(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.45);
  mix(d, rustle(0.22, r, 2200), 0, 0.7);
  mix(d, grains(0.3, 50, 600, 2200, r, 1.3), Math.round(0.05 * SR), 0.5);
  mix(d, thud(70, 0.05, 0.25), Math.round(0.12 * SR), 0.7);
  return edges(normalize(d), 0.002, 0.03);
}

function knock(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const f = 380 + r() * 60;
  const d = modal(f, [[1, 1, 0.05], [2.6, 0.5, 0.02], [4.3, 0.25, 0.01]], 0.2, 0.0003);
  mix(d, thud(120, 0.03, 0.12), 0, 0.5);
  mix(d, highpass(white(Math.round(0.003 * SR), r), 2000), 0, 0.4);
  return edges(normalize(d), 0.0002, 0.02);
}

function creak(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.4);
  const bp = new Biquad('bp', 900, 3);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const f = 95 - 40 * (t / 0.4) + (r() - 0.5) * 30;
    ph += f / SR;
    if (ph >= 1) ph -= 1;
    const pulse = ph < 0.08 ? 1 : 0;
    d[i] = bp.run(pulse) * Math.sin((Math.PI * t) / 0.4);
  }
  return edges(normalize(d), 0.002, 0.03);
}

function wither(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.7);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const f = 300 + 180 * Math.exp(-t / 0.25) + 6 * Math.sin(t * 2 * Math.PI * 5);
    ph += (2 * Math.PI * f) / SR;
    d[i] = (Math.sin(ph) + 0.25 * Math.sin(2 * ph)) * Math.min(1, t / 0.03) * Math.exp(-t / 0.22);
  }
  lowpass(d, 1500);
  mix(d, grains(0.5, 14, 1500, 4000, r, 1.2), Math.round(0.1 * SR), 0.15);
  return edges(normalize(d), 0.002, 0.04);
}

function bugs(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.6);
  const bp = new Biquad('bp', 1500, 1.5);
  let ph = 0;
  let wob = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    wob += (r() - 0.5) * 0.02;
    wob *= 0.999;
    const f = 205 + wob * 200 + 15 * Math.sin(t * 2 * Math.PI * 7);
    const dt = f / SR;
    ph += dt;
    if (ph >= 1) ph -= 1;
    const saw = 2 * ph - 1 - blep(ph, dt);
    const am = 0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 31);
    d[i] = bp.run(saw) * am * Math.sin((Math.PI * t) / 0.6);
  }
  return edges(normalize(d), 0.002, 0.03);
}

function sprinkle(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.7);
  const n = highpass(highpass(white(d.length, r), 2500), 2500);
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    // The tick-tick of an impact sprinkler head over a mist.
    const tick = Math.pow(Math.max(0, Math.sin(t * 2 * Math.PI * 11)), 8);
    const e = Math.min(1, t / 0.06) * (t < 0.5 ? 1 : Math.exp(-(t - 0.5) / 0.06));
    d[i] = n[i] * e * (0.35 + 0.65 * tick);
  }
  lowpass(d, 9000);
  return edges(normalize(d), 0.002, 0.03);
}

/** Harsh-ish voice through formants: crows and the rooster share it. */
function voice(
  dur: number,
  pitch: (t: number) => number,
  amp: (t: number) => number,
  forms: [number, number, number][],
  rasp: number,
  r: () => number,
): Float32Array<ArrayBuffer> {
  const d = buf(dur);
  const bqs = forms.map(([f, q, g]) => [new Biquad('bp', f, q), g] as const);
  let ph = 0;
  let jit = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const a = amp(t);
    if (a <= 0) {
      d[i] = 0;
      continue;
    }
    jit = jit * 0.995 + (r() - 0.5) * 0.004;
    const f = pitch(t) * (1 + jit);
    const dt = f / SR;
    ph += dt;
    if (ph >= 1) ph -= 1;
    const saw = 2 * ph - 1 - blep(ph, dt);
    const src = saw * (1 - rasp + rasp * (r() * 2 - 1));
    let y = 0;
    for (const [bq, g] of bqs) y += bq.run(src) * g;
    d[i] = y * a;
  }
  return d;
}

function caw(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const base = 520 + r() * 90;
  const len = 0.26 + r() * 0.06;
  const d = voice(
    len + 0.05,
    (t) => base * (1 + 0.12 * Math.sin(Math.min(1, t / len) * Math.PI) - 0.2 * Math.max(0, t / len - 0.5)),
    (t) => (t > len ? 0 : Math.min(1, t / 0.015) * Math.min(1, (len - t) / 0.06)),
    [[1150, 3, 1], [1900, 4, 0.7], [2900, 4, 0.4]],
    0.35,
    r,
  );
  return edges(normalize(d), 0.001, 0.03);
}

function peck(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.45);
  for (let k = 0; k < 3; k++) {
    const p = modal(1900 + r() * 600, [[1, 1, 0.008], [2.3, 0.4, 0.004]], 0.04, 0.0002);
    mix(d, p, Math.round((k * 0.09 + r() * 0.01) * SR), 0.8);
  }
  mix(d, grains(0.3, 25, 1000, 3000, r), Math.round(0.12 * SR), 0.4);
  return edges(normalize(d), 0.0002, 0.03);
}

function flap(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.5);
  for (let k = 0; k < 6; k++) {
    const b = lowpass(white(Math.round(0.05 * SR), r), 900 + r() * 400);
    for (let i = 0; i < b.length; i++) b[i] *= Math.sin((Math.PI * i) / b.length);
    mix(d, b, Math.round(k * 0.068 * SR), 1 - k * 0.12);
  }
  return edges(normalize(d), 0.002, 0.03);
}

function deny(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.32);
  const a = thud(150, 0.035, 0.12);
  const b = thud(125, 0.04, 0.14);
  mix(d, a, 0, 1);
  mix(d, b, Math.round(0.11 * SR), 0.85);
  const felt = lowpass(white(Math.round(0.02 * SR), r), 400);
  env(felt, 0.001, 0.006);
  mix(d, felt, 0, 0.5);
  mix(d, felt, Math.round(0.11 * SR), 0.4);
  lowpass(d, 900);
  return edges(normalize(d), 0.0005, 0.03);
}

function rooster(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  // cock, a, doodle, doooo: pitch and level per syllable.
  const segs: [number, number, number, number][] = [
    [0.0, 0.11, 470, 640],
    [0.13, 0.23, 600, 560],
    [0.25, 0.47, 570, 760],
    [0.5, 1.2, 740, 470],
  ];
  const pitch = (t: number): number => {
    for (const [a, b, f0, f1] of segs) {
      if (t <= b + 0.015) {
        const u = clamp((t - a) / (b - a), 0, 1);
        if (b - a > 0.5) return f0 + (f1 - f0) * Math.pow(u, 2.2) + 25 * Math.sin(u * Math.PI);
        return f0 + (f1 - f0) * u;
      }
    }
    return 470;
  };
  const amp = (t: number): number => {
    for (const [a, b] of segs) {
      if (t >= a && t <= b) return Math.min(1, (t - a) / 0.012) * Math.min(1, (b - t) / 0.03) * (b - a > 0.5 ? 1 : 0.85);
    }
    return 0;
  };
  const d = voice(1.3, (t) => pitch(t) * (1 + 0.012 * Math.sin(t * 2 * Math.PI * 9)), amp, [[850, 2.5, 1], [1700, 3, 0.8], [2900, 4, 0.45]], 0.22, r);
  return edges(normalize(d), 0.001, 0.05);
}

function thunder(seed: number): Float32Array<ArrayBuffer>[] {
  const r = rand(seed);
  const len = 5;
  const n = Math.round(len * SR);
  const envl = new Float32Array(n);
  const rolls = 5 + Math.floor(r() * 3);
  for (let k = 0; k < rolls; k++) {
    const at = (k === 0 ? 0.02 : 0.15 + r() * 2.6) * SR;
    const atk = (0.05 + r() * 0.3) * SR;
    const tau = (0.5 + r() * 1.1) * SR;
    const amp = k === 0 ? 1 : 0.35 + r() * 0.6;
    for (let i = Math.floor(at); i < n; i++) {
      const u = i - at;
      envl[i] += amp * (u < atk ? u / atk : Math.exp(-(u - atk) / tau));
    }
  }
  const chans: Float32Array<ArrayBuffer>[] = [];
  for (let c = 0; c < 2; c++) {
    const low = lowpass(lowpass(brown(n, r), 220), 220);
    const mid = lowpass(pink(n, r), 900);
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = (low[i] * 1.6 + mid[i] * 0.5) * envl[i];
    const crack = highpass(white(Math.round(0.18 * SR), r), 1200);
    env(crack, 0.002, 0.04);
    mix(d, crack, Math.round(0.02 * SR), 0.5);
    chans.push(d);
  }
  const p = Math.max(peak(chans[0]), peak(chans[1]));
  for (const c of chans) {
    for (let i = 0; i < c.length; i++) c[i] *= 0.9 / p;
    edges(c, 0.002, 0.2);
  }
  return chans;
}

function sigh(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.85);
  const n = white(d.length, r);
  const f1 = new Biquad('bp', 700, 4);
  const f2 = new Biquad('bp', 1150, 5);
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    if (i % 64 === 0) {
      f1.set(720 - 180 * (t / 0.85), 4);
      f2.set(1180 - 250 * (t / 0.85), 5);
    }
    const e = Math.min(1, t / 0.06) * Math.exp(-Math.max(0, t - 0.15) / 0.22);
    d[i] = (f1.run(n[i]) + f2.run(n[i]) * 0.6) * e;
  }
  return edges(normalize(d), 0.002, 0.04);
}

function whistle(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.62);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    let f: number;
    let a: number;
    if (t < 0.17) {
      f = 1250 + 600 * Math.pow(t / 0.17, 0.7);
      a = Math.min(1, t / 0.02) * Math.min(1, (0.17 - t) / 0.02 + 0.3);
    } else if (t > 0.21) {
      const u = (t - 0.21) / 0.38;
      f = 1700 - 450 * u;
      a = Math.min(1, (t - 0.21) / 0.02) * Math.min(1, (1 - u) / 0.15);
    } else {
      f = 1800;
      a = 0.25;
    }
    ph += (2 * Math.PI * f * (1 + 0.004 * Math.sin(t * 2 * Math.PI * 6))) / SR;
    d[i] = Math.sin(ph) * Math.max(0, a);
  }
  const breath = highpass(white(d.length, r), 3000);
  for (let i = 0; i < d.length; i++) d[i] += breath[i] * Math.abs(d[i]) * 0.15;
  return edges(normalize(d), 0.002, 0.03);
}

function paper(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = white(Math.round(0.16 * SR), r);
  const bp = new Biquad('bp', 2500, 0.8);
  for (let i = 0; i < d.length; i++) {
    if (i % 32 === 0) bp.set(1800 + 3000 * (i / d.length), 0.8);
    d[i] = bp.run(d[i]) * Math.sin((Math.PI * i) / d.length);
  }
  mix(d, grains(0.16, 12, 3000, 7000, r), 0, 0.4);
  return edges(normalize(d), 0.001, 0.02);
}

function tick(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = modal(1750 + r() * 100, [[1, 1, 0.012], [2.7, 0.35, 0.005]], 0.06, 0.0002);
  return edges(normalize(d), 0.0002, 0.01);
}

function whoosh(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = pink(Math.round(0.5 * SR), r);
  const bp = new Biquad('bp', 500, 1.2);
  for (let i = 0; i < d.length; i++) {
    const u = i / d.length;
    if (i % 32 === 0) bp.set(400 + 2600 * Math.sin(u * Math.PI), 1.2);
    d[i] = bp.run(d[i]) * Math.pow(Math.sin(Math.PI * u), 1.5);
  }
  return edges(normalize(d), 0.002, 0.02);
}

// Footsteps: a few variants per ground so a walk never repeats exactly.

function stepGrass(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.16);
  mix(d, rustle(0.1, r, 2600 + r() * 800), 0, 0.8);
  const t = lowpass(white(Math.round(0.03 * SR), r), 300);
  env(t, 0.003, 0.01);
  mix(d, t, 0, 0.5);
  return edges(normalize(d), 0.001, 0.02);
}

function stepSoil(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.18);
  const t = lowpass(white(Math.round(0.08 * SR), r), 380);
  env(t, 0.004, 0.025);
  mix(d, t, 0, 1);
  mix(d, thud(85 + r() * 15, 0.025, 0.08), 0, 0.5);
  mix(d, grains(0.12, 12, 800, 2200, r, 1.5), Math.round(0.008 * SR), 0.25);
  return edges(normalize(d), 0.001, 0.02);
}

function stepGravel(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.17);
  mix(d, grains(0.15, 70, 2200, 6500, r, 1.8), 0, 1);
  const t = lowpass(white(Math.round(0.04 * SR), r), 500);
  env(t, 0.003, 0.012);
  mix(d, t, 0, 0.6);
  return edges(normalize(d), 0.001, 0.02);
}

function stepDirt(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.15);
  const t = lowpass(white(Math.round(0.06 * SR), r), 650);
  env(t, 0.002, 0.018);
  mix(d, t, 0, 1);
  mix(d, grains(0.1, 8, 1200, 3000, r, 1.4), 0, 0.2);
  return edges(normalize(d), 0.001, 0.02);
}

function stepWood(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = modal(220 + r() * 40, [[1, 1, 0.04], [2.3, 0.5, 0.015]], 0.14, 0.001);
  mix(d, lowpass(white(Math.round(0.02 * SR), r), 800), 0, 0.3);
  return edges(normalize(d), 0.001, 0.02);
}

function stepWater(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = highpass(white(Math.round(0.2 * SR), r), 900);
  lowpass(d, 4000);
  env(d, 0.01, 0.05);
  return edges(normalize(d), 0.001, 0.02);
}

// Ambience: droplets, birds, frogs and the loops.

function drop(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const f = 1400 + r() * 1800;
  const d = buf(0.08);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * f * (1 + 0.8 * Math.exp(-t / 0.005))) / SR;
    d[i] = Math.sin(ph) * Math.exp(-t / 0.012);
  }
  mix(d, highpass(white(Math.round(0.006 * SR), r), 3000), 0, 0.3);
  return edges(normalize(d), 0.0003, 0.01);
}

/** A sine bird call from (time, freq) points; amplitude follows a shape per note. */
function chirps(notes: { at: number; len: number; f: (u: number) => number }[], r: () => number): Float32Array<ArrayBuffer> {
  const end = Math.max(...notes.map((n) => n.at + n.len)) + 0.02;
  const d = buf(end);
  for (const n of notes) {
    const a0 = Math.round(n.at * SR);
    const len = Math.round(n.len * SR);
    let ph = r() * 6;
    for (let i = 0; i < len && a0 + i < d.length; i++) {
      const u = i / len;
      ph += (2 * Math.PI * n.f(u)) / SR;
      d[a0 + i] += Math.sin(ph) * Math.pow(Math.sin(Math.PI * u), 0.7);
    }
  }
  return d;
}

function bird(kind: number, seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  let d: Float32Array<ArrayBuffer>;
  if (kind === 0) {
    // Three quick upward chirps.
    const b = 2800 + r() * 600;
    d = chirps([0, 0.09, 0.18].map((at) => ({ at, len: 0.05, f: (u: number) => b + 1900 * u })), r);
  } else if (kind === 1) {
    // fee-bee
    d = chirps([
      { at: 0, len: 0.28, f: (u) => 3900 + 150 * Math.sin(u * 3) },
      { at: 0.34, len: 0.3, f: (u) => 3300 - 120 * u },
    ], r);
  } else if (kind === 2) {
    // Trill.
    const b = 4600 + r() * 600;
    d = chirps(Array.from({ length: 13 }, (_, k) => ({ at: k * 0.055, len: 0.04, f: (u: number) => b - 900 * u + k * 20 })), r);
  } else if (kind === 3) {
    // Warble.
    d = chirps([{ at: 0, len: 0.42, f: (u) => 3500 + 600 * Math.sin(u * 2 * Math.PI * 9) + 400 * u }], r);
  } else if (kind === 4) {
    // Falling cascade.
    d = chirps(Array.from({ length: 6 }, (_, k) => ({ at: k * 0.08, len: 0.06, f: (u: number) => 5200 - k * 320 - 500 * u })), r);
  } else {
    // A robin-ish phrase.
    const pts = [3100, 3600, 3300, 3900, 3500];
    d = chirps(pts.map((p, k) => ({ at: k * 0.13, len: 0.1, f: (u: number) => p + 500 * Math.sin(u * Math.PI) })), r);
  }
  return edges(normalize(d), 0.002, 0.02);
}

function frog(kind: number, seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  if (kind === 3) {
    // A peeper: a short rising whistle.
    const d = chirps([{ at: 0, len: 0.13, f: (u) => 2700 + 400 * u }], r);
    return edges(normalize(d), 0.002, 0.02);
  }
  // Ribbit: two bursts of a low pulse train through a throat formant.
  const pr = [52, 64, 44][kind];
  const d = buf(0.42);
  const f1 = new Biquad('bp', 520 + kind * 90, 4);
  const f2 = new Biquad('bp', 1350 + kind * 120, 5);
  const bursts = [[0, 0.11], [0.16, 0.32]];
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    let a = 0;
    for (const [s, e] of bursts) if (t >= s && t <= e) a = Math.sin((Math.PI * (t - s)) / (e - s));
    ph += (pr * (1 + 0.15 * (t > 0.16 ? 1 : 0))) / SR;
    if (ph >= 1) ph -= 1;
    const pulse = ph < 0.12 ? 1 - ph / 0.12 : 0;
    d[i] = (f1.run(pulse) + 0.5 * f2.run(pulse)) * a;
  }
  return edges(normalize(d), 0.002, 0.02);
}

function rainLoop(seed: number): Float32Array<ArrayBuffer>[] {
  const r = rand(seed);
  const L = 4;
  const xf = 0.4;
  const n = Math.round((L + xf) * SR);
  const out: Float32Array<ArrayBuffer>[] = [];
  for (let c = 0; c < 2; c++) {
    const d = pink(n, r);
    highpass(d, 350);
    lowpass(d, 5200);
    for (let i = 0; i < n; i++) d[i] *= 0.6;
    const drops = Math.round((L + xf) * 140);
    for (let k = 0; k < drops; k++) {
      const at = Math.floor(r() * (n - 400));
      const f = 1800 + r() * 4200;
      const w = (2 * Math.PI * f) / SR;
      const amp = Math.pow(r(), 2.5) * 0.9;
      const len = Math.round((0.004 + r() * 0.008) * SR);
      for (let i = 0; i < len; i++) d[at + i] += Math.sin(w * i) * amp * Math.exp(-i / (len * 0.25));
    }
    out.push(normalize(foldLoop(d, Math.round(xf * SR)), 0.8));
  }
  return out;
}

function windLoop(seed: number): Float32Array<ArrayBuffer>[] {
  const r = rand(seed);
  const L = 8;
  const xf = 1;
  const n = Math.round((L + xf) * SR);
  const out: Float32Array<ArrayBuffer>[] = [];
  for (let c = 0; c < 2; c++) {
    const src = pink(n, r);
    const bp = new Biquad('bp', 500, 0.7);
    const d = new Float32Array(n);
    const p1 = r() * 6;
    const p2 = r() * 6;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const g = 0.55 + 0.3 * Math.sin(t * 0.9 + p1) + 0.15 * Math.sin(t * 2.3 + p2);
      if (i % 64 === 0) bp.set(320 + 520 * g, 0.7);
      d[i] = bp.run(src[i]) * g;
    }
    out.push(normalize(foldLoop(d, Math.round(xf * SR)), 0.8));
  }
  return out;
}

function cricketLoop(seed: number): Float32Array<ArrayBuffer>[] {
  const r = rand(seed);
  const L = 4;
  const xf = 0.25;
  const n = Math.round((L + xf) * SR);
  const chans = [new Float32Array(n), new Float32Array(n)];
  const crickets = [
    { f: 4400, every: 0.52, pan: 0.25 },
    { f: 4950, every: 0.71, pan: 0.8 },
    { f: 4100, every: 0.9, pan: 0.5 },
  ];
  for (const cr of crickets) {
    let t = r() * cr.every;
    const w = (2 * Math.PI * cr.f) / SR;
    while (t < L + xf - 0.2) {
      for (let p = 0; p < 3; p++) {
        const at = Math.round((t + p * 0.032) * SR);
        const len = Math.round(0.014 * SR);
        for (let i = 0; i < len && at + i < n; i++) {
          const s = Math.sin(w * i) * Math.sin((Math.PI * i) / len);
          chans[0][at + i] += s * (1 - cr.pan);
          chans[1][at + i] += s * cr.pan;
        }
      }
      t += cr.every * (0.9 + r() * 0.2);
    }
  }
  return chans.map((c) => normalize(foldLoop(c, Math.round(xf * SR)), 0.7));
}

function cicadaLoop(seed: number): Float32Array<ArrayBuffer>[] {
  const r = rand(seed);
  const L = 6;
  const xf = 0.5;
  const n = Math.round((L + xf) * SR);
  const out: Float32Array<ArrayBuffer>[] = [];
  for (let c = 0; c < 2; c++) {
    const src = white(n, r);
    const bp = new Biquad('bp', 4700 + c * 350, 3.5);
    const d = new Float32Array(n);
    const off = c * 2.2 + r();
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const u = ((t + off) % 3.2) / 3.2;
      const swell = Math.pow(Math.sin(Math.PI * u), 1.5);
      const buzz = Math.pow(Math.abs(Math.sin(t * Math.PI * 140)), 4);
      d[i] = bp.run(src[i]) * (0.25 + 0.75 * buzz) * (0.25 + 0.75 * swell);
    }
    out.push(normalize(foldLoop(d, Math.round(xf * SR)), 0.7));
  }
  return out;
}

// ---------------------------------------------------------------- Thistledown and Seedbound

type Note = { data: Float32Array<ArrayBuffer>; f0: number };

/** Kalimba: a steel tine over a small box. The fundamental rings; the bar's high overtones die fast. */
function kalimbaNote(m: number): Note {
  const f = mtof(m);
  const tau = clamp(1.5 - (m - 60) * 0.03, 0.45, 1.5);
  const d = modal(f, [[1, 1, tau], [1.0012, 0.18, tau * 0.7], [2.01, 0.05, tau * 0.25], [5.95, 0.2, 0.045], [16.7, 0.05, 0.01]], 1.9, 0.0005);
  const r = rand(m * 17);
  const tick = highpass(white(Math.round(0.003 * SR), r), 2500);
  env(tick, 0.0002, 0.0007);
  mix(d, tick, 0, 0.18);
  new Biquad('peak', 320, 1.1, 3).apply(d);
  return { data: edges(normalize(d), 0.0005, 0.05), f0: f };
}

/** Plucked harp: a round string plucked near the middle, longer and darker than the guitar. */
function harpNote(m: number, seed: number): Note {
  const t60 = clamp(3.4 - (m - 43) * 0.05, 1.1, 3.4);
  const p = pluck(mtof(m), { dur: 2.6, t60, w: 0.5, bright: 0.3, pos: 0.42, seed });
  new Biquad('peak', 240, 1, 3).apply(p.data);
  lowpass(p.data, 5000);
  return { data: edges(normalize(p.data), 0.001, 0.05), f0: p.f0 };
}

/** A breathy wooden flute or ocarina: nearly a sine, a little second harmonic, breath noise and a chiff. */
function fluteNote(m: number, seed: number): Note {
  const f = mtof(m);
  const r = rand(seed);
  const d = buf(2.6);
  const breath = new Biquad('bp', f * 2, 1.5);
  const hiss = new Biquad('hp', 3200, 0.7);
  let ph = 0;
  let vph = r();
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const vib = clamp((t - 0.3) / 0.6, 0, 1) * 0.006;
    vph += 4.8 / SR;
    ph += (f * (1 + vib * Math.sin(2 * Math.PI * vph))) / SR;
    if (ph >= 1) ph -= 1;
    const w = 2 * Math.PI * ph;
    const tone = Math.sin(w) + 0.2 * Math.sin(2 * w) + 0.06 * Math.sin(3 * w);
    const n = r() * 2 - 1;
    const chiff = Math.exp(-t / 0.035);
    const air = breath.run(n) * (0.45 + 1.4 * chiff) + hiss.run(n) * 0.05;
    const a = Math.min(1, t / 0.08) * (0.9 + 0.1 * Math.min(1, t / 0.5)) * (1 + 0.04 * Math.sin(2 * Math.PI * 0.7 * t));
    d[i] = (tone * (1 - 0.4 * chiff) + air) * a;
  }
  lowpass(d, 6500);
  return { data: edges(normalize(d), 0.001, 0.05), f0: f };
}

/** A tiny bright tone for chip counts: short enough to fire twenty times a second. */
function chipNote(m: number): Note {
  const f = mtof(m);
  const d = modal(f, [[1, 1, 0.03], [2, 0.22, 0.014], [3, 0.07, 0.008]], 0.12, 0.0004);
  const r = rand(m);
  mix(d, highpass(white(Math.round(0.0015 * SR), r), 4000), 0, 0.12);
  return { data: edges(normalize(d), 0.0003, 0.01), f0: f };
}

/** A frame drum played with the hand: a low skin thump and the frame's ring. */
function frame(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = thud(78 + r() * 8, 0.16, 0.5);
  const skin = lowpass(white(Math.round(0.06 * SR), r), 900);
  env(skin, 0.001, 0.012);
  mix(d, skin, 0, 0.35);
  mix(d, modal(190 + r() * 20, [[1, 1, 0.05], [1.58, 0.4, 0.03]], 0.2, 0.001), 0, 0.25);
  return edges(normalize(d), 0.0008, 0.03);
}

/** A dry seed pod shaken once: softer and grainier than the shaker. */
function pod(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = grains(0.13, 55, 3000, 8500, r, 1.2);
  env(d, 0.008, 0.035);
  return edges(normalize(d), 0.001, 0.01);
}

/** A card slid off the deck: an air flick that rises, and the edge snapping free of the thumb. */
function card(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const n = Math.round(0.08 * SR);
  const src = white(n, r);
  const bp = new Biquad('bp', 2500, 0.9);
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (i % 32 === 0) bp.set(2200 + 3600 * (i / n), 0.9);
    d[i] = bp.run(src[i]) * Math.min(1, t / 0.004) * Math.exp(-t / 0.022);
  }
  mix(d, modal(2400 + r() * 500, [[1, 1, 0.004]], 0.02, 0.0002), Math.round(0.005 * SR), 0.25);
  return edges(normalize(d), 0.0005, 0.01);
}

/** A riffle shuffle: flicks closer and closer together, the bridge settling, a tap to square the deck. */
function shuffle(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.95);
  let t = 0.02;
  for (let k = 0; k < 26; k++) {
    mix(d, card(seed * 31 + k), Math.round(t * SR), 0.35 + r() * 0.25);
    t += 0.028 - k * 0.0006;
  }
  const brr = lowpass(white(Math.round(0.18 * SR), r), 1500);
  for (let i = 0; i < brr.length; i++) brr[i] *= Math.sin((Math.PI * i) / brr.length) * (0.7 + 0.3 * Math.sin(i / (0.003 * SR)));
  mix(d, brr, Math.round((t + 0.04) * SR), 0.5);
  mix(d, thud(140, 0.02, 0.08), Math.round((t + 0.26) * SR), 0.4);
  return edges(normalize(d), 0.001, 0.02);
}

/** A card set down on felt. */
function thump(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = thud(95 + r() * 15, 0.035, 0.18);
  const felt = lowpass(white(Math.round(0.03 * SR), r), 600);
  env(felt, 0.001, 0.008);
  mix(d, felt, 0, 0.5);
  return edges(normalize(d), 0.0005, 0.02);
}

/** A paper swish through the air, falling in pitch. */
function swish(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const n = Math.round(0.22 * SR);
  const d = white(n, r);
  const bp = new Biquad('bp', 4000, 0.8);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if (i % 32 === 0) bp.set(4800 - 3000 * u, 0.8);
    d[i] = bp.run(d[i]) * Math.pow(Math.sin(Math.PI * u), 2);
  }
  return edges(normalize(d), 0.001, 0.02);
}

/** A card crumpled and set aside. */
function crumple(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.42);
  for (let k = 0; k < 5; k++) mix(d, grains(0.08, 30, 1500, 6000, r, 1), Math.round((k * 0.06 + r() * 0.02) * SR), 1 - k * 0.12);
  const bed = lowpass(white(d.length, r), 3000);
  for (let i = 0; i < bed.length; i++) bed[i] *= Math.sin((Math.PI * i) / bed.length) * 0.2;
  mix(d, bed);
  return edges(normalize(d), 0.001, 0.02);
}

/** Into the canister: a rush of air up a tube and a hollow pop. Repitched by size. */
function suck(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.16);
  const bp = new Biquad('bp', 300, 2.5);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const u = Math.min(1, t / 0.07);
    if (i % 16 === 0) bp.set(300 + 1700 * u * u, 2.5);
    const rush = bp.run(r() * 2 - 1) * Math.min(1, t / 0.01) * (t < 0.07 ? 1 : Math.exp(-(t - 0.07) / 0.012));
    let pop = 0;
    if (t >= 0.06) {
      const tt = t - 0.06;
      ph += (2 * Math.PI * (380 + 900 * (1 - Math.exp(-tt / 0.015)))) / SR;
      pop = Math.sin(ph) * Math.exp(-tt / 0.025) * Math.min(1, tt / 0.002);
    }
    d[i] = rush * 1.2 + pop * 0.6;
  }
  return edges(normalize(d), 0.001, 0.01);
}

/** A shot from the bellows: a burst of air, a low thump and a cork-like pop at the muzzle. */
function puff(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.35);
  const air = lowpass(lowpass(white(d.length, r), 1600), 2200);
  for (let i = 0; i < air.length; i++) {
    const t = i / SR;
    air[i] *= Math.min(1, t / 0.006) * Math.exp(-t / 0.07);
  }
  mix(d, air);
  mix(d, thud(70 + r() * 10, 0.04, 0.2), 0, 0.6);
  mix(d, modal(520 + r() * 80, [[1, 1, 0.012], [2.2, 0.3, 0.006]], 0.06, 0.0005), 0, 0.3);
  return edges(normalize(d), 0.0008, 0.02);
}

/** A full canister: a hollow metal clunk. */
function clunk(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = modal(240, [[1, 1, 0.06], [2.32, 0.55, 0.04], [3.91, 0.3, 0.02], [5.3, 0.12, 0.01]], 0.3, 0.0004);
  mix(d, thud(90, 0.04, 0.15), 0, 0.6);
  mix(d, highpass(white(Math.round(0.004 * SR), r), 1500), 0, 0.3);
  return edges(normalize(d), 0.0004, 0.02);
}

/** A footstep on stone or a path: a hard heel, a click and a little grit. */
function stepStone(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.14);
  mix(d, thud(110 + r() * 20, 0.018, 0.08), 0, 0.7);
  mix(d, modal(1300 + r() * 500, [[1, 1, 0.006], [2.4, 0.4, 0.003]], 0.03, 0.0002), 0, 0.35);
  mix(d, grains(0.1, 14, 1800, 5000, r, 1.6), Math.round(0.004 * SR), 0.3);
  return edges(normalize(d), 0.0005, 0.02);
}

/** A downy's happy chirp, four kinds: pip-wee, three pips, wee-oo and a rolling brrip. */
function downyChirp(kind: number, seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const b = 1900 + r() * 300;
  let d: Float32Array<ArrayBuffer>;
  if (kind === 0) {
    d = chirps([{ at: 0, len: 0.05, f: (u) => b * (1 + 0.25 * u) }, { at: 0.08, len: 0.12, f: (u) => b * 1.2 * (1 + 0.35 * Math.sin(u * Math.PI * 0.5)) }], r);
  } else if (kind === 1) {
    d = chirps([0, 0.07, 0.14].map((at, k) => ({ at, len: 0.045, f: (u: number) => b * (1 + k * 0.12) * (1 + 0.2 * u) })), r);
  } else if (kind === 2) {
    d = chirps([{ at: 0, len: 0.22, f: (u) => b * (1 + 0.45 * Math.sin(u * Math.PI)) }], r);
  } else {
    d = chirps(Array.from({ length: 7 }, (_, k) => ({ at: k * 0.025, len: 0.022, f: (u: number) => b * 1.1 * (1 + 0.15 * u + k * 0.02) })), r);
  }
  return edges(normalize(d), 0.001, 0.01);
}

/** A downy drawn up off the ground: a rising squeak with a wobble. */
function squeak(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const b = 1250 + r() * 150;
  const d = chirps([{ at: 0, len: 0.28, f: (u) => b + 1500 * u * u + 120 * Math.sin(u * 2 * Math.PI * 7) }], r);
  return edges(normalize(d), 0.001, 0.01);
}

/** A soft round body landing: a springy tone that settles, over a thud. */
function boing(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.45);
  let ph = 0;
  const f0 = 150 + r() * 30;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const f = f0 * (1 + 0.9 * (1 - Math.exp(-t / 0.03))) * (1 + 0.06 * Math.sin(2 * Math.PI * 11 * t) * Math.exp(-t / 0.2));
    ph += (2 * Math.PI * f) / SR;
    d[i] = (Math.sin(ph) + 0.3 * Math.sin(2 * ph)) * Math.min(1, t / 0.002) * Math.exp(-t / 0.12);
  }
  mix(d, thud(80, 0.03, 0.12), 0, 0.5);
  return edges(normalize(d), 0.0008, 0.02);
}

/** Three small crunchy bites. */
function munch(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.5);
  for (let k = 0; k < 3; k++) {
    const at = Math.round((k * 0.14 + r() * 0.02) * SR);
    mix(d, grains(0.07, 40, 1200, 4500, r, 1.4), at, 0.8);
    mix(d, thud(120 + r() * 30, 0.015, 0.05), at, 0.4);
  }
  return edges(normalize(d), 0.001, 0.02);
}

/** Down tufts popping free: soft breathy puffs, each with a tiny high pip. */
function fluff(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.3);
  for (let k = 0; k < 3; k++) {
    const at = Math.round((k * 0.07 + r() * 0.015) * SR);
    const p = lowpass(white(Math.round(0.05 * SR), r), 2500);
    env(p, 0.004, 0.015);
    mix(d, p, at, 0.8 - k * 0.15);
    mix(d, chirps([{ at: 0, len: 0.02, f: () => 1800 + r() * 600 }], r), at + Math.round(0.004 * SR), 0.25);
  }
  return edges(normalize(d), 0.001, 0.02);
}

/** A frazzled downy: an anxious trill between two notes a semitone apart. */
function trill(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.55);
  const fa = 1500 + r() * 100;
  const fb = fa * 1.0595;
  const k = onePole(120);
  let f = fa;
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    f += k * ((Math.floor(t * 22) % 2 ? fb : fa) - f);
    ph += (2 * Math.PI * f) / SR;
    d[i] = Math.sin(ph) * Math.pow(Math.sin((Math.PI * t) / 0.55), 0.5) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 7 * t));
  }
  return edges(normalize(d), 0.001, 0.02);
}

/** A nettleback nosing about: wet sniffs and a small grunt. */
function snuffle(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.75);
  for (let k = 0; k < 4; k++) {
    const len = Math.round((0.06 + r() * 0.03) * SR);
    const s = white(len, r);
    new Biquad('bp', 800 + r() * 500, 3).apply(s);
    for (let i = 0; i < len; i++) s[i] *= Math.min(1, i / (0.01 * SR)) * Math.exp(-i / (0.03 * SR));
    mix(d, s, Math.round((k * 0.13 + r() * 0.02) * SR), k % 2 ? 0.7 : 1);
  }
  const grunt = voice(0.16, (t) => 110 - 30 * t, (t) => Math.min(1, t / 0.01) * Math.max(0, 1 - t / 0.15), [[480, 3, 1], [1100, 4, 0.4]], 0.5, r);
  mix(d, grunt, Math.round(0.55 * SR), 0.6);
  return edges(normalize(d), 0.002, 0.03);
}

/** Something dropping into water: a plop, a burst of spray and bubbles rising. */
function splash(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const d = buf(0.6);
  const burst = lowpass(highpass(white(Math.round(0.3 * SR), r), 400), 4000);
  env(burst, 0.003, 0.08);
  mix(d, burst);
  mix(d, thud(140, 0.03, 0.1), 0, 0.5);
  for (let k = 0; k < 8; k++) {
    const f = 500 + r() * 1100;
    const at = Math.round((0.05 + r() * 0.4) * SR);
    const len = Math.round(0.05 * SR);
    let ph = 0;
    for (let i = 0; i < len && at + i < d.length; i++) {
      ph += (2 * Math.PI * f * (1 + 0.6 * (i / len))) / SR;
      d[at + i] += Math.sin(ph) * Math.exp(-i / (0.012 * SR)) * (0.2 + r() * 0.3);
    }
  }
  return edges(normalize(d), 0.001, 0.03);
}

/** A tawny owl far off: hoo, hoo-hoo. */
function owl(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const f = 360 + r() * 40;
  const d = buf(1.3);
  const hoots: [number, number][] = [[0, 0.32], [0.55, 0.12], [0.74, 0.38]];
  const lp = new Biquad('lp', 800, 0.7);
  for (const [at, len] of hoots) {
    const a0 = Math.round(at * SR);
    const n = Math.round(len * SR);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      ph += (2 * Math.PI * f * (1.04 - 0.06 * u)) / SR;
      const a = Math.pow(Math.sin(Math.PI * u), 0.6);
      d[a0 + i] += (Math.sin(ph) + lp.run(r() * 2 - 1) * 0.15) * a;
    }
  }
  lowpass(d, 1200);
  return edges(normalize(d), 0.002, 0.03);
}

/** The bellows drawing: a rushing inhale that pumps twice a second, and the leather creaking with it. */
function bellowsLoop(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const L = 2;
  const xf = 0.25;
  const n = Math.round((L + xf) * SR);
  const air = white(n, r);
  const bp = new Biquad('bp', 900, 0.8);
  const hp = new Biquad('hp', 250, 0.7);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const pump = 0.75 + 0.25 * Math.sin(2 * Math.PI * 2 * t);
    if (i % 64 === 0) bp.set(800 + 500 * pump, 0.8);
    air[i] = hp.run(bp.run(air[i])) * pump;
  }
  normalize(air, 0.7);
  const creak = new Float32Array(n);
  for (const at of [0.35, 0.85, 1.35, 1.85]) {
    const a0 = Math.round(at * SR);
    const len = Math.round(0.11 * SR);
    const cb = new Biquad('bp', 1000 + r() * 300, 4);
    let cph = 0;
    for (let j = 0; j < len; j++) {
      const u = j / len;
      cph += (70 + 40 * u + (r() - 0.5) * 20) / SR;
      if (cph >= 1) cph -= 1;
      creak[a0 + j] += cb.run(cph < 0.1 ? 1 : 0) * Math.sin(Math.PI * u);
    }
  }
  normalize(creak, 0.3);
  mix(air, creak);
  return normalize(foldLoop(air, Math.round(xf * SR)), 0.8);
}

/** A gust over open ground: airy, swelling twice in four seconds. */
function gustLoop(seed: number): Float32Array<ArrayBuffer>[] {
  const r = rand(seed);
  const L = 4;
  const xf = 0.6;
  const n = Math.round((L + xf) * SR);
  const out: Float32Array<ArrayBuffer>[] = [];
  for (let c = 0; c < 2; c++) {
    const src = white(n, r);
    lowpass(src, 3000);
    const bp = new Biquad('bp', 900, 0.9);
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const s = Math.sin((Math.PI * t) / 2 + c * 0.4);
      const g = 0.35 + 0.65 * s * s;
      if (i % 64 === 0) bp.set(500 + 1600 * g, 0.9);
      d[i] = bp.run(src[i]) * g;
    }
    out.push(normalize(foldLoop(d, Math.round(xf * SR)), 0.8));
  }
  return out;
}

/** A brook: a bed of moving water and many small bubbles. */
function brookLoop(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const L = 4;
  const xf = 0.5;
  const n = Math.round((L + xf) * SR);
  const d = pink(n, r);
  highpass(d, 250);
  lowpass(d, 2200);
  const gur = new Biquad('bp', 600, 2);
  const src = white(n, r);
  let walk = 0;
  for (let i = 0; i < n; i++) {
    if (i % 64 === 0) {
      walk = walk * 0.9 + (r() - 0.5) * 0.4;
      gur.set(550 + walk * 400, 2);
    }
    d[i] = d[i] * 0.5 + gur.run(src[i]) * 0.25;
  }
  const bubbles = Math.round((L + xf) * 55);
  for (let k = 0; k < bubbles; k++) {
    const f = 350 + r() * 1100;
    const at = Math.floor(r() * (n - 1600));
    const len = Math.round((0.015 + r() * 0.025) * SR);
    const amp = Math.pow(r(), 2) * 0.5;
    let ph = 0;
    for (let i = 0; i < len; i++) {
      ph += (2 * Math.PI * f * (1 + 0.5 * (i / len))) / SR;
      d[at + i] += Math.sin(ph) * amp * Math.sin((Math.PI * i) / len);
    }
  }
  return normalize(foldLoop(d, Math.round(xf * SR)), 0.8);
}

/** Steam vents: a hiss that surges, a low rumble and the odd bloop of mud. */
function ventsLoop(seed: number): Float32Array<ArrayBuffer> {
  const r = rand(seed);
  const L = 4;
  const xf = 0.5;
  const n = Math.round((L + xf) * SR);
  const hiss = highpass(highpass(white(n, r), 1800), 1800);
  lowpass(hiss, 9000);
  const rumble = lowpass(lowpass(brown(n, r), 160), 160);
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const s = Math.sin((Math.PI * t) / 2);
    d[i] = hiss[i] * (0.45 + 0.55 * Math.pow(s * s, 2)) + rumble[i] * 0.8;
  }
  for (let k = 0; k < 3; k++) {
    const at = Math.round((0.4 + k * 1.3 + r() * 0.3) * SR);
    const len = Math.round(0.12 * SR);
    let ph = 0;
    const f = 120 + r() * 140;
    for (let i = 0; i < len; i++) {
      ph += (2 * Math.PI * f * (1 + 0.8 * (i / len))) / SR;
      d[at + i] += Math.sin(ph) * Math.sin((Math.PI * i) / len) * 0.25;
    }
  }
  return normalize(foldLoop(d, Math.round(xf * SR)), 0.8);
}

/** Wind in long grass: a rustle that flutters and swells, over a low wind. */
function grassLoop(seed: number): Float32Array<ArrayBuffer>[] {
  const r = rand(seed);
  const L = 6;
  const xf = 0.8;
  const n = Math.round((L + xf) * SR);
  const out: Float32Array<ArrayBuffer>[] = [];
  for (let c = 0; c < 2; c++) {
    const src = white(n, r);
    const low = pink(n, r);
    const bp = new Biquad('bp', 3200, 0.7);
    const lbp = new Biquad('bp', 420, 0.8);
    const kf = onePole(25);
    let flutter = 0;
    const p1 = r() * 6;
    const p2 = r() * 6;
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      flutter += kf * (r() - flutter);
      const g = 0.45 + 0.35 * Math.sin((2 * Math.PI * t) / 3 + p1) + 0.2 * Math.sin((2 * Math.PI * t) / 2 + p2);
      d[i] = bp.run(src[i]) * g * (0.5 + flutter) + lbp.run(low[i]) * g * 0.5;
    }
    out.push(normalize(foldLoop(d, Math.round(xf * SR)), 0.8));
  }
  return out;
}

/** Meadow insects by day: grasshoppers chirring in phrases, near and far. */
function insectLoop(seed: number): Float32Array<ArrayBuffer>[] {
  const r = rand(seed);
  const L = 4;
  const xf = 0.3;
  const n = Math.round((L + xf) * SR);
  const chans = [new Float32Array(n), new Float32Array(n)];
  const bugs = [
    { f: 6800, rate: 38, pan: 0.2, amp: 1 },
    { f: 7600, rate: 46, pan: 0.75, amp: 0.7 },
    { f: 6200, rate: 31, pan: 0.5, amp: 0.5 },
  ];
  for (const b of bugs) {
    let t = r() * 0.8;
    const w = (2 * Math.PI * b.f) / SR;
    while (t < L + xf - 0.3) {
      const phrase = 0.4 + r() * 0.8;
      for (let p = 0; p < phrase * b.rate; p++) {
        const at = Math.round((t + p / b.rate) * SR);
        const len = Math.round(0.004 * SR);
        const swell = Math.sin((Math.PI * p) / (phrase * b.rate));
        for (let i = 0; i < len && at + i < n; i++) {
          const s = Math.sin(w * i) * Math.sin((Math.PI * i) / len) * swell * b.amp;
          chans[0][at + i] += s * (1 - b.pan);
          chans[1][at + i] += s * b.pan;
        }
      }
      t += phrase + 0.5 + r() * 1;
    }
  }
  return chans.map((c) => normalize(foldLoop(c, Math.round(xf * SR)), 0.7));
}

// ---------------------------------------------------------------- jobs

export const CENTRES: Record<InstName, number[]> = {
  guitar: [40, 47, 54, 61, 68, 75],
  banjo: [57, 64, 71, 78, 85],
  bass: [31, 38, 45, 52],
  fiddle: [57, 64, 71, 78, 85],
  marimba: [48, 55, 62, 69, 76, 83],
  celesta: [60, 67, 74, 81, 88],
  musicbox: [67, 74, 81, 88, 95],
  piano: [36, 43, 50, 57, 64, 71, 78, 85],
  bell: [62, 69, 76, 83, 90],
  pad: [45, 52, 59, 66, 73],
  kalimba: [60, 67, 74, 81, 88],
  harp: [43, 50, 57, 64, 71, 78],
  flute: [60, 67, 74, 81, 88],
  chip: [79, 91],
};

const MAKERS: Record<InstName, (m: number, seed: number) => { data: Float32Array<ArrayBuffer>; f0: number }> = {
  guitar: guitarNote,
  banjo: banjoNote,
  bass: bassNote,
  fiddle: fiddleNote,
  marimba: (m) => marimbaNote(m),
  celesta: (m) => celestaNote(m),
  musicbox: (m) => musicboxNote(m),
  piano: (m) => pianoNote(m),
  bell: (m) => bellNote(m),
  pad: (m) => padNote(m),
  kalimba: (m) => kalimbaNote(m),
  harp: harpNote,
  flute: fluteNote,
  chip: (m) => chipNote(m),
};

export type Job = { type: 'inst'; name: InstName; centre: number } | { type: 'fx'; name: FxName; k: number };

type FxMaker = (seed: number, k: number) => Float32Array<ArrayBuffer> | Float32Array<ArrayBuffer>[];

const FX: [FxName, number, FxMaker][] = [];
const PLAN: (InstName | [FxName, number, FxMaker])[] = [
  // Most needed first: interface cues, then the instruments, then the rest.
  ['tick', 2, (s) => tick(s)],
  ['paper', 2, (s) => paper(s)],
  ['deny', 1, (s) => deny(s)],
  'pad', 'musicbox', 'marimba', 'guitar', 'bass', 'celesta', 'piano', 'fiddle', 'banjo', 'bell',
  // The ranch's band and the deck's chip tone, then the cards in hand.
  'kalimba', 'harp', 'flute', 'chip',
  ['card', 4, (s) => card(s)],
  ['thump', 2, (s) => thump(s)],
  ['swish', 2, (s) => swish(s)],
  ['frame', 2, (s) => frame(s)],
  ['pod', 3, (s) => pod(s)],
  ['kick', 1, () => kick()],
  ['brush', 3, (s) => brush(s, true)],
  ['tap', 2, (s) => brush(s, false)],
  ['shaker', 3, (s) => shaker(s)],
  ['block', 1, () => block()],
  ['tamb', 2, (s) => jingle(s, 1)],
  ['sleigh', 2, (s) => jingle(s, 3)],
  ['stepGrass', 4, (s) => stepGrass(s)],
  ['stepSoil', 4, (s) => stepSoil(s)],
  ['stepGravel', 4, (s) => stepGravel(s)],
  ['stepDirt', 4, (s) => stepDirt(s)],
  ['stepWood', 2, (s) => stepWood(s)],
  ['stepWater', 2, (s) => stepWater(s)],
  ['till', 3, (s) => till(s)],
  ['water', 2, (s) => water(s)],
  ['plant', 3, (s) => plant(s)],
  ['pop', 3, (s) => pop(s)],
  ['tend', 2, (s) => tend(s)],
  ['clear', 2, (s) => clear(s)],
  ['knock', 3, (s) => knock(s)],
  ['creak', 1, (s) => creak(s)],
  ['wither', 1, (s) => wither(s)],
  ['bugs', 1, (s) => bugs(s)],
  ['sprinkle', 3, (s) => sprinkle(s)],
  ['caw', 3, (s) => caw(s)],
  ['peck', 1, (s) => peck(s)],
  ['flap', 2, (s) => flap(s)],
  ['whoosh', 1, (s) => whoosh(s)],
  ['sigh', 1, (s) => sigh(s)],
  ['whistle', 1, (s) => whistle(s)],
  ['rooster', 1, (s) => rooster(s)],
  ['rain', 1, (s) => rainLoop(s)],
  ['wind', 1, (s) => windLoop(s)],
  ['crickets', 1, (s) => cricketLoop(s)],
  ['cicadas', 1, (s) => cicadaLoop(s)],
  ['drop', 4, (s) => drop(s)],
  ['bird', 6, (s, k) => bird(k, s)],
  ['frog', 4, (s, k) => frog(k, s)],
  ['thunder', 2, (s) => thunder(s)],
  // Thistledown's tool, creatures and valley, and the rest of Seedbound's table.
  ['bellows', 1, (s) => bellowsLoop(s)],
  ['suck', 3, (s) => suck(s)],
  ['puff', 3, (s) => puff(s)],
  ['stepStone', 4, (s) => stepStone(s)],
  ['chirp', 4, (s, k) => downyChirp(k, s)],
  ['squeak', 2, (s) => squeak(s)],
  ['boing', 2, (s) => boing(s)],
  ['clunk', 1, (s) => clunk(s)],
  ['munch', 2, (s) => munch(s)],
  ['fluff', 3, (s) => fluff(s)],
  ['trill', 2, (s) => trill(s)],
  ['snuffle', 2, (s) => snuffle(s)],
  ['splash', 2, (s) => splash(s)],
  ['shuffle', 2, (s) => shuffle(s)],
  ['crumple', 2, (s) => crumple(s)],
  ['grass', 1, (s) => grassLoop(s)],
  ['insects', 1, (s) => insectLoop(s)],
  ['gust', 1, (s) => gustLoop(s)],
  ['brook', 1, (s) => brookLoop(s)],
  ['vents', 1, (s) => ventsLoop(s)],
  ['owl', 2, (s) => owl(s)],
];

/** Every buffer to build, in the order they are wanted. */
export const JOBS: Job[] = [];
for (const item of PLAN) {
  if (typeof item === 'string') {
    for (const centre of CENTRES[item]) JOBS.push({ type: 'inst', name: item, centre });
  } else {
    FX.push(item);
    for (let k = 0; k < item[1]; k++) JOBS.push({ type: 'fx', name: item[0], k });
  }
}

/** Run one job: its channels, and for instruments the pitch the sample really sounds at. */
export function runJob(j: Job): { chans: Float32Array<ArrayBuffer>[]; f0: number } {
  if (j.type === 'inst') {
    const { data, f0 } = MAKERS[j.name](j.centre, j.centre * 31 + j.name.length);
    return { chans: [data], f0 };
  }
  const make = FX.find((f) => f[0] === j.name)![2];
  const out = make(1000 + j.k * 77 + j.name.length * 13, j.k);
  return { chans: Array.isArray(out) ? out : [out], f0: 0 };
}
