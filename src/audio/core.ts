// The audio engine proper, on any BaseAudioContext: a realtime AudioContext in
// the game, an OfflineAudioContext in tests and renders. It owns the mix and
// the master chain, turns moods into music and ambience settings, and routes
// events to the effects.
//
//   music ─ duck ─ tone ─ vol ─┐
//   sfx ───────────────── vol ─┼─ mix ─ master ─ fade ─ compressor ─ trim ─ soft clipper ─ out
//   ambience ──────────── vol ─┤
//   (sends) ─ reverb ──────────┘

import type { AudioMood, UiCue } from '../contract';
import type { SimEvent, WorldState } from '../sim/types';
import { Ambience } from './ambience';
import type { Bank } from './bank';
import { clamp, rand, smoothstep } from './dsp';
import { Music } from './music';
import { Sfx } from './sfx';
import { Voices } from './voices';

/** How far ahead the scheduler books notes, seconds. */
export const LOOKAHEAD = 0.25;
/** The soft clipper's ceiling: -1.5 dBFS. Nothing leaves the engine louder. */
export const CEILING = 0.84;

export interface CoreOptions {
  /** Run our own scheduling timer. Off for offline renders, which drive tick() themselves. */
  realtime: boolean;
  /** Leave out the soft clipper, to measure how hard it would have worked. */
  noClipper?: boolean;
  /** Add an analyser on the output for meters. */
  meter?: boolean;
}

interface Seen {
  clock: string;
  camera: string;
  scene: string;
  season: number;
  weather: string;
  hourQ: number;
  nightQ: number;
  speed: number;
  tired: boolean;
  lateQ: number;
  lullQ: number;
}

function softClipCurve(n = 4097): Float32Array<ArrayBuffer> {
  // The shaper sees half the signal, so the curve spans -2 to 2 in real level.
  const c = new Float32Array(n);
  const T = 0.6;
  const C = CEILING;
  for (let i = 0; i < n; i++) {
    const a = ((i / (n - 1)) * 2 - 1) * 2;
    const x = Math.abs(a);
    const y = x <= T ? x : T + (C - T) * Math.tanh((x - T) / (C - T));
    c[i] = Math.sign(a) * y;
  }
  return c;
}

function impulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.round(seconds * sr);
  const b = ctx.createBuffer(2, n, sr);
  const r = rand(31337);
  const pre = Math.round(0.012 * sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let y = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      // Darker as it decays, like air and soft walls.
      const f = 7000 * Math.exp(-t / 0.5) + 1200;
      const k = 1 - Math.exp((-2 * Math.PI * f) / sr);
      y += k * (r() * 2 - 1 - y);
      d[i] = y * Math.exp(-t / 0.3);
    }
    // A few early reflections.
    for (let e = 0; e < 6; e++) {
      const at = pre + Math.round((0.004 + r() * 0.05) * sr);
      d[at] += (r() < 0.5 ? -1 : 1) * (0.5 - e * 0.06);
    }
  }
  return b;
}

export class Core {
  readonly music: Music;
  readonly amb: Ambience;
  readonly sfx: Sfx;
  readonly musicVoices: Voices;
  readonly sfxVoices: Voices;
  readonly ambVoices: Voices;
  readonly analyser: AnalyserNode | null = null;
  errors = 0;
  lastError = '';
  /** Calls to mood() that changed something, for tests of how cheap it is. */
  moodChanges = 0;
  private duck: GainNode;
  private tone: BiquadFilterNode;
  private vol: { music: GainNode; sfx: GainNode; amb: GainNode; farSend: GainNode };
  private master: GainNode;
  private fade: GainNode;
  readonly output: AudioNode;
  private timer = 0;
  private seen: Seen | null = null;
  private suspended = false;
  private gen = 0;
  private lastTick = 0;

  constructor(
    readonly ctx: BaseAudioContext,
    readonly bank: Bank,
    private opts: CoreOptions,
  ) {
    const g = (v = 1): GainNode => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    this.musicVoices = new Voices(ctx);
    this.sfxVoices = new Voices(ctx);
    this.ambVoices = new Voices(ctx);

    const mix = g();
    this.master = g();
    this.fade = g();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 8;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.005;
    comp.release.value = 0.22;
    // The compressor adds its own makeup gain; this sets the final level so the
    // game's default settings (0.8, 0.6, 0.8) sit comfortably on a phone.
    const trim = g(1);
    mix.connect(this.master);
    this.master.connect(this.fade);
    this.fade.connect(comp);
    comp.connect(trim);
    let last: AudioNode = trim;
    if (!opts.noClipper) {
      const pre = g(0.5);
      const shaper = ctx.createWaveShaper();
      shaper.curve = softClipCurve();
      shaper.oversample = 'none';
      trim.connect(pre);
      pre.connect(shaper);
      last = shaper;
    }
    last.connect(ctx.destination);
    this.output = last;
    if (opts.meter) {
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0;
      last.connect(an);
      this.analyser = an;
    }

    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 1.9);
    const ret = g(0.55);
    reverb.connect(ret);
    ret.connect(mix);

    // Music.
    this.music = new Music(ctx, bank, this.musicVoices);
    this.duck = g();
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 18000;
    this.tone.Q.value = 0.5;
    const musicVol = g();
    this.music.out.connect(this.duck);
    this.duck.connect(this.tone);
    this.tone.connect(musicVol);
    musicVol.connect(mix);
    const musicSend = g(0.24);
    musicVol.connect(musicSend);
    musicSend.connect(reverb);

    // Effects: a near bus and a far one with more room on it.
    const sfxNear = g();
    const sfxFar = g(0.85);
    const sfxVol = g();
    sfxNear.connect(sfxVol);
    sfxFar.connect(sfxVol);
    sfxVol.connect(mix);
    const sfxSend = g(0.1);
    sfxVol.connect(sfxSend);
    sfxSend.connect(reverb);
    const farSend = g(0.4);
    sfxFar.connect(farSend);
    farSend.connect(reverb);
    this.sfx = new Sfx(ctx, bank, this.sfxVoices, this.music, sfxNear, sfxFar);

    // Ambience.
    this.amb = new Ambience(ctx, bank, this.ambVoices);
    const ambVol = g();
    this.amb.out.connect(ambVol);
    ambVol.connect(mix);
    const ambSend = g(0.15);
    ambVol.connect(ambSend);
    ambSend.connect(reverb);

    this.vol = { music: musicVol, sfx: sfxVol, amb: ambVol, farSend };
    if (opts.realtime) this.startTimer();
  }

  private startTimer(): void {
    if (this.timer) return;
    this.timer = window.setInterval(() => this.tick(), 50);
  }

  private stopTimer(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
  }

  private fail(err: unknown): void {
    this.errors++;
    this.lastError = String(err instanceof Error ? err.stack ?? err.message : err);
    if (this.errors <= 3) console.warn('[audio]', err);
  }

  /** Book music and ambience ahead of the playhead. */
  tick(): void {
    try {
      const now = this.ctx.currentTime;
      this.lastTick = now;
      this.music.schedule(now + LOOKAHEAD);
      this.amb.tick(now + LOOKAHEAD);
    } catch (err) {
      this.fail(err);
    }
  }

  mood(m: AudioMood): void {
    try {
      this.applyMood(m);
      // The frame loop is a second clock for the scheduler, in case timers lag.
      if (this.opts.realtime && this.ctx.currentTime - this.lastTick > 0.06) this.tick();
    } catch (err) {
      this.fail(err);
    }
  }

  private applyMood(m: AudioMood): void {
    const clock = m.rules.clock;
    const hourQ = Math.round(m.hour * 12);
    const nightQ = Math.round(m.night * 20);
    const s = this.seen;
    if (
      s && s.clock === clock && s.camera === m.rules.camera && s.scene === m.scene && s.season === m.season &&
      s.weather === m.weather && s.hourQ === hourQ && s.nightQ === nightQ && s.speed === m.speed && s.tired === m.tired
    ) return;
    this.moodChanges++;
    const fast = clock === 'flow' && m.speed >= 2;
    const lateness = smoothstep(17.5, 22.5, m.hour) * (fast ? 0.4 : 1);
    const lull = smoothstep(21, 23.6, m.hour) * (fast ? 0.3 : 1);
    const lateQ = Math.round(lateness * 32);
    const lullQ = Math.round(lull * 32);
    const now = this.ctx.currentTime;
    const musicChanged = !s || s.clock !== clock || s.scene !== m.scene || s.season !== m.season || s.speed !== m.speed ||
      s.tired !== m.tired || s.lateQ !== lateQ || s.lullQ !== lullQ;
    if (musicChanged) {
      this.music.set({ scene: m.scene, clock, season: m.season, speed: m.speed, lateness: lateQ / 32, lull: lullQ / 32, tired: m.tired });
    }
    if (!s || s.scene !== m.scene || s.season !== m.season || s.weather !== m.weather || s.hourQ !== hourQ) {
      this.amb.set({ hour: m.hour, season: m.season, weather: m.weather, scene: m.scene });
    }
    if (!s || s.scene !== m.scene || s.nightQ !== nightQ) {
      const menu = m.scene === 'menu';
      this.duck.gain.setTargetAtTime((menu ? 0.6 : 1) * (1 - 0.3 * clamp(m.night, 0, 1)), now, 0.15);
      this.tone.frequency.setTargetAtTime(menu ? 1700 : 18000, now, 0.15);
    }
    this.sfx.clock = clock;
    this.seen = {
      clock, camera: m.rules.camera, scene: m.scene, season: m.season, weather: m.weather, hourQ, nightQ,
      speed: m.speed, tired: m.tired, lateQ, lullQ,
    };
  }

  event(e: SimEvent, state: Readonly<WorldState> | null): void {
    try {
      if (e.type === 'rules') this.sfx.clock = e.rules.clock;
      this.sfx.event(e, state);
    } catch (err) {
      this.fail(err);
    }
  }

  ui(cue: UiCue): void {
    try {
      this.sfx.ui(cue);
    } catch (err) {
      this.fail(err);
    }
  }

  setVolumes(v: { master: number; music: number; sfx: number }): void {
    const now = this.ctx.currentTime;
    // Plain gains: the game's defaults (music 0.6) read as a little softer, not far away.
    const sq = (x: number) => clamp(Number.isFinite(x) ? x : 1, 0, 1);
    this.master.gain.setTargetAtTime(sq(v.master), now, 0.03);
    this.vol.music.gain.setTargetAtTime(sq(v.music), now, 0.03);
    this.music.silent = sq(v.music) === 0 || sq(v.master) === 0;
    this.vol.sfx.gain.setTargetAtTime(sq(v.sfx), now, 0.03);
    this.vol.amb.gain.setTargetAtTime(sq(v.sfx), now, 0.03);
    this.vol.farSend.gain.setTargetAtTime(0.4 * sq(v.sfx), now, 0.03);
  }

  suspend(on: boolean): void {
    if (on === this.suspended) return;
    this.suspended = on;
    const ctx = this.ctx;
    const gen = ++this.gen;
    const now = ctx.currentTime;
    if (on) {
      this.fade.gain.setTargetAtTime(0, now, 0.012);
      this.stopTimer();
      if (ctx instanceof AudioContext) {
        window.setTimeout(() => {
          if (gen === this.gen && this.suspended && ctx.state === 'running') void ctx.suspend().catch(() => {});
        }, 70);
      }
    } else {
      if (ctx instanceof AudioContext && ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => {});
      this.fade.gain.setTargetAtTime(1, now, 0.05);
      if (this.opts.realtime) this.startTimer();
    }
  }

  get isSuspended(): boolean {
    return this.suspended;
  }

  stats(): Record<string, unknown> {
    return {
      time: this.ctx.currentTime,
      voices: { music: this.musicVoices.live, sfx: this.sfxVoices.live, amb: this.ambVoices.live },
      maxVoices: { music: this.musicVoices.maxLive, sfx: this.sfxVoices.maxLive, amb: this.ambVoices.maxLive },
      notes: this.music.notes,
      arrangements: this.music.levels(),
      loops: this.amb.loops(),
      ambienceShots: this.amb.shotsPlayed,
      started: { ...this.sfx.started },
      dropped: { ...this.sfx.dropped },
      errors: this.errors,
      lastError: this.lastError,
      moodChanges: this.moodChanges,
    };
  }

  dispose(): void {
    this.stopTimer();
    this.output.disconnect();
  }
}
