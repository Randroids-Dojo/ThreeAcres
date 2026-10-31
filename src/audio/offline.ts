// Offline renders of the real engine, for the workbench and the measured
// checks in scripts/audio-check.mjs. The scheduler is driven exactly as the
// game drives it: mood every frame, tick on a short timer, events as they come.

import type { AudioMood, CueOpts, UiCue } from '../contract';
import type { Rules, SimEvent, WorldState } from '../sim/types';
import type { Bank } from './bank';
import { Core } from './core';

export type Action =
  | { t: number; mood: Partial<Omit<AudioMood, 'rules'>> & { rules?: Partial<Rules> } }
  | { t: number; event: SimEvent }
  | { t: number; ui: UiCue }
  | { t: number; cue: string; opts?: CueOpts }
  | { t: number; loop: string; on: boolean; opts?: CueOpts }
  | { t: number; volumes: { master: number; music: number; sfx: number } };

export interface Scenario {
  dur: number;
  sr?: number;
  noClipper?: boolean;
  /** Silence a layer to measure the others alone. */
  mute?: ('music' | 'ambience')[];
  /** Play only these instruments and drums in the music. */
  solo?: string[];
  mood: AudioMood;
  volumes?: { master: number; music: number; sfx: number };
  actions?: Action[];
  /** Loops play a constant 1, so the render is their gain envelope (for click checks). */
  loopEnvelopes?: boolean;
  /** Times at which to read every music bus's level, for measuring crossfades. */
  probe?: number[];
}

export interface Rendered {
  buffer: AudioBuffer;
  stats: Record<string, unknown>;
  /** Bus levels at the probe times. */
  probes: { t: number; levels: Record<string, number> }[];
  /** Wall-clock milliseconds the render took. */
  ms: number;
}

/** Seconds between scheduler ticks in a render: about a frame and a half. */
const TICK = 0.025;

export async function render(sc: Scenario, bank: Bank, state: WorldState): Promise<Rendered> {
  bank.finish();
  const sr = sc.sr ?? 44100;
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.round(sc.dur * sr), sampleRate: sr });
  const core = new Core(ctx, bank, { realtime: false, noClipper: sc.noClipper });
  core.setVolumes(sc.volumes ?? { master: 1, music: 1, sfx: 1 });
  if (sc.mute?.includes('music')) core.music.out.gain.value = 0;
  if (sc.mute?.includes('ambience')) core.amb.out.gain.value = 0;
  if (sc.solo) core.music.solo = sc.solo;
  if (sc.probe?.length) core.music.enableMeters();
  if (sc.loopEnvelopes) core.cues.probeEnvelopes();
  let mood: AudioMood = { ...sc.mood, rules: { ...sc.mood.rules } };
  core.mood(mood);
  core.tick();
  const acts = (sc.actions ?? []).slice().sort((a, b) => a.t - b.t);
  const q = 128 / sr;
  const frames = new Set<number>();
  for (let t = TICK; t < sc.dur - q; t += TICK) frames.add(Math.round(t / q));
  for (const a of acts) if (a.t > 0 && a.t < sc.dur - q) frames.add(Math.round(a.t / q));
  const probeAt = new Set<number>();
  for (const t of sc.probe ?? []) {
    const f = Math.round(t / q);
    if (f > 0 && t < sc.dur - q) {
      frames.add(f);
      probeAt.add(f);
    }
  }
  const probes: Rendered['probes'] = [];
  let ai = 0;
  const apply = (now: number) => {
    while (ai < acts.length && acts[ai].t <= now + q / 2) {
      const a = acts[ai++];
      if ('mood' in a) {
        const { rules, ...rest } = a.mood;
        mood = { ...mood, ...rest, rules: { ...mood.rules, ...(rules ?? {}) } };
      } else if ('event' in a) core.event(a.event, state);
      else if ('ui' in a) core.ui(a.ui);
      else if ('cue' in a) core.cue(a.cue, a.opts);
      else if ('loop' in a) core.loop(a.loop, a.on, a.opts);
      else core.setVolumes(a.volumes);
    }
  };
  apply(0);
  core.mood(mood);
  for (const f of [...frames].sort((a, b) => a - b)) {
    void ctx.suspend(f * q).then(() => {
      apply(ctx.currentTime);
      core.mood(mood);
      core.tick();
      if (probeAt.has(f)) probes.push({ t: ctx.currentTime, levels: core.music.busLevels() });
      void ctx.resume();
    });
  }
  const t0 = performance.now();
  const buffer = await ctx.startRendering();
  return { buffer, stats: core.stats(), probes, ms: performance.now() - t0 };
}

// ---------------------------------------------------------------- analysis

export function db(x: number): number {
  return x > 0 ? 20 * Math.log10(x) : -200;
}

/** Peak of either channel between two times, in dBFS. */
export function peakDb(b: AudioBuffer, from = 0, to = b.duration): number {
  let p = 0;
  const a = Math.max(0, Math.floor(from * b.sampleRate));
  const z = Math.min(b.length, Math.floor(to * b.sampleRate));
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = a; i < z; i++) {
      const v = Math.abs(d[i]);
      if (v > p) p = v;
    }
  }
  return db(p);
}

/** RMS of both channels between two times, in dBFS. */
export function rmsDb(b: AudioBuffer, from = 0, to = b.duration): number {
  let s = 0;
  let n = 0;
  const a = Math.max(0, Math.floor(from * b.sampleRate));
  const z = Math.min(b.length, Math.floor(to * b.sampleRate));
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = a; i < z; i++) s += d[i] * d[i];
    n += z - a;
  }
  return db(Math.sqrt(s / Math.max(1, n)));
}

/** RMS per window, dBFS, both channels summed in power. */
export function windows(b: AudioBuffer, win = 0.005, from = 0, to = b.duration): number[] {
  const w = Math.max(1, Math.round(win * b.sampleRate));
  const a = Math.max(0, Math.floor(from * b.sampleRate));
  const z = Math.min(b.length, Math.floor(to * b.sampleRate));
  const out: number[] = [];
  const chans = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
  for (let i = a; i + w <= z; i += w) {
    let s = 0;
    for (const d of chans) for (let j = i; j < i + w; j++) s += d[j] * d[j];
    out.push(db(Math.sqrt(s / (w * chans.length))));
  }
  return out;
}

/**
 * The largest jump between two neighbouring samples between two times, on
 * either channel: a click shows as a step far bigger than the sound's own.
 */
export function maxStep(b: AudioBuffer, from = 0, to = b.duration): number {
  let p = 0;
  const a = Math.max(1, Math.floor(from * b.sampleRate));
  const z = Math.min(b.length, Math.floor(to * b.sampleRate));
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = a; i < z; i++) {
      const v = Math.abs(d[i] - d[i - 1]);
      if (v > p) p = v;
    }
  }
  return p;
}

/** Energy of the left and right channels between two times, in dB, for checking pan. */
export function sidesDb(b: AudioBuffer, from = 0, to = b.duration): { left: number; right: number } {
  const a = Math.max(0, Math.floor(from * b.sampleRate));
  const z = Math.min(b.length, Math.floor(to * b.sampleRate));
  const e = (c: number) => {
    const d = b.getChannelData(c);
    let s = 0;
    for (let i = a; i < z; i++) s += d[i] * d[i];
    return 10 * Math.log10(s / Math.max(1, z - a) + 1e-20);
  };
  return { left: e(0), right: e(b.numberOfChannels - 1) };
}

/** Seconds from `t` until a 5 ms window first rises above `thresh` dBFS, or Infinity. */
export function onsetAfter(b: AudioBuffer, t: number, thresh = -50, within = 1): number {
  const ws = windows(b, 0.002, t, t + within);
  for (let i = 0; i < ws.length; i++) if (ws[i] > thresh) return i * 0.002;
  return Infinity;
}

/** Longest run of 10 ms windows below `thresh` between two times, seconds. */
export function longestQuiet(b: AudioBuffer, from: number, to: number, thresh = -55): number {
  const ws = windows(b, 0.01, from, to);
  let best = 0;
  let run = 0;
  for (const v of ws) {
    run = v < thresh ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best * 0.01;
}

const twiddles = new Map<number, { cos: Float64Array; sin: Float64Array }>();

/** Radix-2 FFT magnitudes of one frame (length a power of two). */
function magnitudes(frame: Float32Array): Float32Array {
  const n = frame.length;
  let tw = twiddles.get(n);
  if (!tw) {
    tw = { cos: new Float64Array(n / 2), sin: new Float64Array(n / 2) };
    for (let k = 0; k < n / 2; k++) {
      tw.cos[k] = Math.cos((-2 * Math.PI * k) / n);
      tw.sin[k] = Math.sin((-2 * Math.PI * k) / n);
    }
    twiddles.set(n, tw);
  }
  const re = Float64Array.from(frame);
  const im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const t = re[i];
      re[i] = re[j];
      re[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const step = n / len;
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const wr = tw.cos[k * step];
        const wi = tw.sin[k * step];
        const a = i + k;
        const b = a + half;
        const vr = re[b] * wr - im[b] * wi;
        const vi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] += vr;
        im[a] += vi;
      }
    }
  }
  const out = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) out[i] = Math.hypot(re[i], im[i]);
  return out;
}

/** Mono mix of a buffer. */
function mono(b: AudioBuffer): Float32Array {
  const l = b.getChannelData(0);
  const r = b.getChannelData(b.numberOfChannels - 1);
  const m = new Float32Array(b.length);
  for (let i = 0; i < m.length; i++) m[i] = (l[i] + r[i]) * 0.5;
  return m;
}

/**
 * Note onsets per second by spectral flux: 10 ms hops, log magnitudes, and a
 * peak counts when it stands clear of the local average and is the largest
 * within 50 ms.
 */
export function onsetRate(b: AudioBuffer, from: number, to: number): number {
  const sr = b.sampleRate;
  const N = 1024;
  const hop = Math.round(0.01 * sr);
  const m = mono(b);
  const hann = new Float32Array(N);
  for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const flux: number[] = [];
  let prev: Float32Array | null = null;
  const f = new Float32Array(N);
  for (let s = Math.floor(from * sr); s + N < Math.min(b.length, to * sr); s += hop) {
    for (let i = 0; i < N; i++) f[i] = m[s + i] * hann[i];
    const mag = magnitudes(f);
    for (let i = 0; i < mag.length; i++) mag[i] = Math.log1p(1000 * mag[i]);
    let fl = 0;
    if (prev) for (let i = 2; i < mag.length; i++) fl += Math.max(0, mag[i] - prev[i]);
    flux.push(fl);
    prev = mag;
  }
  let count = 0;
  for (let i = 5; i < flux.length - 5; i++) {
    let mean = 0;
    for (let j = i - 10; j <= i + 10; j++) mean += flux[Math.max(0, Math.min(flux.length - 1, j))];
    mean /= 21;
    let isMax = true;
    for (let j = i - 5; j <= i + 5; j++) if (j !== i && flux[j] >= flux[i]) isMax = false;
    if (isMax && flux[i] > mean * 1.4 + 2) count++;
  }
  return count / Math.max(0.001, to - from);
}

/** Character of a stretch of audio: brightness, how busy it is, how wide the dynamics are. */
export function character(b: AudioBuffer, from: number, to: number): { centroid: number; onsets: number; crest: number; bands: number[]; chroma: number[] } {
  const sr = b.sampleRate;
  const N = 4096;
  const m = mono(b);
  let num = 0;
  let den = 0;
  const edges = [0, 150, 400, 1000, 2500, 6000, sr / 2];
  const bands = new Array(edges.length - 1).fill(0);
  const hann = new Float32Array(N);
  for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const chroma = new Array(12).fill(0);
  const f = new Float32Array(N);
  for (let s = Math.floor(from * sr); s + N < Math.min(b.length, to * sr); s += N) {
    for (let i = 0; i < N; i++) f[i] = m[s + i] * hann[i];
    const mag = magnitudes(f);
    for (let k = 1; k < mag.length; k++) {
      const hz = (k * sr) / N;
      const p = mag[k] * mag[k];
      num += hz * p;
      den += p;
      for (let e = 0; e < bands.length; e++) if (hz >= edges[e] && hz < edges[e + 1]) bands[e] += p;
      if (hz > 100 && hz < 2000) chroma[(((Math.round(12 * Math.log2(hz / 440)) + 69) % 12) + 12) % 12] += mag[k];
    }
  }
  const cmax = Math.max(...chroma) || 1;
  const tot = bands.reduce((a, c) => a + c, 0) || 1;
  return {
    centroid: den ? num / den : 0,
    onsets: onsetRate(b, from, to),
    crest: peakDb(b, from, to) - rmsDb(b, from, to),
    bands: bands.map((v) => Math.round((1000 * v) / tot) / 10),
    chroma: chroma.map((v) => Math.round((100 * v) / cmax) / 100),
  };
}

/** The strongest frequency within a few per cent of `near`, by a fine DFT scan. For tuning checks. */
export function pitchNear(d: Float32Array, sr: number, near: number, from = 0.25, len = 0.5): number {
  const a = Math.round(from * sr);
  const n = Math.min(d.length - a, Math.round(len * sr));
  const hann = new Float32Array(n);
  for (let i = 0; i < n; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  const power = (hz: number) => {
    const w = (2 * Math.PI * hz) / sr;
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const v = d[a + i] * hann[i];
      re += v * Math.cos(w * i);
      im -= v * Math.sin(w * i);
    }
    return re * re + im * im;
  };
  let best = near;
  let bp = -1;
  for (let c = -80; c <= 80; c += 2) {
    const hz = near * Math.pow(2, c / 1200);
    const p = power(hz);
    if (p > bp) {
      bp = p;
      best = hz;
    }
  }
  // Refine to a tenth of a cent.
  let step = 1;
  while (step > 0.05) {
    const up = best * Math.pow(2, step / 1200);
    const dn = best / Math.pow(2, step / 1200);
    const pu = power(up);
    const pd = power(dn);
    if (pu > bp && pu >= pd) {
      bp = pu;
      best = up;
    } else if (pd > bp) {
      bp = pd;
      best = dn;
    } else step /= 2;
  }
  return best;
}

/** 16-bit PCM WAV, base64, so Playwright can carry it out of the page. */
export function wavBase64(b: AudioBuffer): string {
  const ch = b.numberOfChannels;
  const n = b.length;
  const bytes = new ArrayBuffer(44 + n * ch * 2);
  const v = new DataView(bytes);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * ch * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, b.sampleRate, true);
  v.setUint32(28, b.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => b.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  const u8 = new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}
