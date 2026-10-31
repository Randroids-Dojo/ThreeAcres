// The score. One transport and one chord progression drive every
// arrangement: a folk band for Sunup, a felt piano for Seedbound, an open-air
// band for Thistledown (by day and by night), the title, and a lullaby for
// Sunup's late hours. Two layers ride on intensity: a lift for Seedbound's
// scoring and a tension for Thistledown's dangers. Switching games crossfades
// their buses; nothing restarts. A lookahead scheduler books notes a fraction
// of a second ahead, and only for arrangements that can be heard.

import type { Season } from '../sim/types';
import type { Bank, FxName, InstName } from './bank';
import { clamp, rand } from './dsp';
import { FORM, SEASON_MUSIC, STYLES, melody, rootAt, tonesIn, voiceLead } from './theory';
import type { Chord, MNote, SeasonMusic, Section } from './theory';
import type { Voice, Voices } from './voices';

export type ArrId = 'day' | 'turns' | 'lift' | 'ranch' | 'ranchNight' | 'tension' | 'title' | 'lullaby';
export type GameId = 'title' | 'homestead' | 'ranch' | 'deck';

export interface MusicParams {
  scene: 'title' | 'farm' | 'menu';
  game: GameId;
  season: Season;
  /** Sunup: 0 by day, 1 late in the evening: the arrangement thins. */
  lateness: number;
  /** Sunup: 0 to 1, how far the lullaby has taken over. */
  lull: number;
  tired: boolean;
  /** 0 calm to 1 busy: lifts Seedbound, adds tension to Thistledown. */
  intensity: number;
  /** Thistledown: 0 by day, 1 at night. */
  dark: number;
}

/** Level of each instrument at velocity 1. Buffers are normalized to the same peak. */
const TRIM: Record<InstName, number> = {
  guitar: 0.3,
  banjo: 0.2,
  bass: 0.45,
  fiddle: 0.17,
  marimba: 0.3,
  celesta: 0.26,
  musicbox: 0.15,
  piano: 0.34,
  bell: 0.16,
  pad: 0.06,
  kalimba: 0.24,
  harp: 0.36,
  flute: 0.15,
  chip: 0.1,
};

const DRUM_TRIM: Partial<Record<FxName, number>> = {
  kick: 0.5,
  brush: 0.3,
  tap: 0.2,
  shaker: 0.22,
  block: 0.32,
  tamb: 0.16,
  sleigh: 0.1,
  frame: 0.6,
  pod: 0.4,
};

const PAN: Record<string, number> = {
  guitar: -0.22,
  banjo: 0.38,
  bass: 0,
  fiddle: 0.18,
  marimba: -0.12,
  celesta: 0.24,
  musicbox: 0.3,
  piano: -0.06,
  bell: 0.3,
  kalimba: -0.24,
  harp: 0.08,
  flute: 0.16,
  kick: 0,
  brush: 0.2,
  tap: 0.15,
  shaker: -0.32,
  block: 0.3,
  tamb: -0.25,
  sleigh: 0.25,
  frame: -0.05,
  pod: 0.34,
};

/** Longest a plucked or struck note may ring, seconds. Keeps the voice count low. */
const RING: Record<InstName, number> = {
  guitar: 2,
  banjo: 1,
  bass: 1.4,
  fiddle: 2.4,
  marimba: 0.9,
  celesta: 1.8,
  musicbox: 1.6,
  piano: 2.4,
  bell: 2.4,
  pad: 8,
  kalimba: 1.6,
  harp: 2.4,
  flute: 2.4,
  chip: 0.1,
};

/** How much of each instrument goes into the valley echo, in the ranch arrangements. */
const ECHO_SEND: Partial<Record<string, number>> = { flute: 0.45, kalimba: 0.35, bell: 0.35, harp: 0.12 };

/** Kalimba ostinatos: sixteenth to index into the chord tones. A 3-3-2 bar, then a lilting one. */
const KAL_A: Record<number, number> = { 0: 0, 3: 2, 6: 1, 8: 3, 11: 2, 14: 4 };
const KAL_B: Record<number, number> = { 0: 0, 2: 2, 4: 1, 6: 3, 8: 2, 10: 4, 12: 3, 14: 1 };

const PENTA = [0, 2, 4, 7, 9];
/** The scale each season's tunes live in, for the ninth in open voicings. Autumn is mixolydian. */
const SCALE: Record<Season, number[]> = { 0: [0, 2, 4, 5, 7, 9, 11], 1: [0, 2, 4, 5, 7, 9, 11], 2: [0, 2, 4, 5, 7, 9, 10], 3: [0, 2, 4, 5, 7, 9, 11] };

interface Echo {
  send: GainNode;
  delay: DelayNode;
}

interface Arr {
  id: ArrId;
  bus: GainNode;
  target: number;
  /** Keep scheduling until this time even after the target drops to 0, so the fade has notes in it. */
  liveUntil: number;
  entering: boolean;
  pans: Map<string, StereoPannerNode>;
  pad: Voice[];
  padPrev: number[] | null;
  echo: Echo | null;
}

export interface StepInfo {
  /** Time of this sixteenth, swing applied. */
  t: number;
  /** Sixteenth in the bar, 0 to 15. */
  i: number;
  /** Bar in the section, 0 to 7. */
  bar: number;
  section: Section;
  sectionIdx: number;
  cycle: number;
  chord: Chord;
  next: Chord;
  key: number;
  /** Seconds per sixteenth. */
  d16: number;
  density: number;
  season: Season;
}

const IDS: ArrId[] = ['day', 'turns', 'lift', 'ranch', 'ranchNight', 'tension', 'title', 'lullaby'];

export class Music {
  readonly out: GainNode;
  /** Notes booked since start, for the workbench and tests. */
  notes = 0;
  /** Workbench only: play just these instruments, to measure the balance of the mix. */
  solo: string[] | null = null;
  /** Music volume is zero: keep time, book nothing. */
  silent = false;
  private arrs: Record<ArrId, Arr>;
  private r = rand(77);
  private season: Season = 0;
  private pendingSeason: Season | null = null;
  private sm: SeasonMusic = SEASON_MUSIC[0];
  private bpm = SEASON_MUSIC[0].bpm;
  private tempoMul = 1;
  private nextT = -1;
  private i = 0;
  private bar = 0;
  private cycle = 0;
  private density = 1;
  private densityTarget = 1;
  private p: MusicParams = { scene: 'farm', game: 'homestead', season: 0, lateness: 0, lull: 0, tired: false, intensity: 0, dark: 0 };
  private lines = new Map<string, Map<number, MNote[]>>();
  /** Tests only: each bus's fades mirrored onto a constant, read back through an analyser. */
  private meters: Map<ArrId, { g: GainNode; an: AnalyserNode; td: Float32Array<ArrayBuffer> }> | null = null;
  private lastChord: { key: number; chord: Chord } = { key: 62, chord: SEASON_MUSIC[0].A[0] };

  constructor(
    private ctx: BaseAudioContext,
    private bank: Bank,
    private voices: Voices,
  ) {
    this.out = ctx.createGain();
    const mk = (id: ArrId): Arr => {
      const bus = ctx.createGain();
      bus.gain.value = 0;
      bus.connect(this.out);
      const echo = id === 'ranch' || id === 'ranchNight' ? this.makeEcho(bus, id === 'ranchNight' ? 0.42 : 0.3) : null;
      return { id, bus, target: 0, liveUntil: 0, entering: false, pans: new Map(), pad: [], padPrev: null, echo };
    };
    this.arrs = {} as Record<ArrId, Arr>;
    for (const id of IDS) this.arrs[id] = mk(id);
  }

  /** A dotted-eighth echo with a darkening feedback loop, panned a little off centre: the valley answering. */
  private makeEcho(bus: GainNode, feedback: number): Echo {
    const ctx = this.ctx;
    const send = ctx.createGain();
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = this.echoTime();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const fb = ctx.createGain();
    fb.gain.value = feedback;
    const ret = ctx.createGain();
    ret.gain.value = 0.55;
    const pan = ctx.createStereoPanner();
    pan.pan.value = 0.35;
    send.connect(delay);
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    lp.connect(ret);
    ret.connect(pan);
    pan.connect(bus);
    return { send, delay };
  }

  private echoTime(): number {
    return (3 * 60) / (this.sm.bpm * this.tempoMul) / 4;
  }

  /** The key and chord now sounding, so effects can sit in tune with the music. */
  harmony(): { key: number; chord: Chord } {
    return this.lastChord;
  }

  /** The tonic of a season (or of the one about to start). */
  keyOf(season?: Season): number {
    return SEASON_MUSIC[season ?? this.pendingSeason ?? this.season].key;
  }

  /** Target level of each arrangement, for the workbench. */
  levels(): Record<ArrId, number> {
    const o = {} as Record<ArrId, number>;
    for (const id of IDS) o[id] = this.arrs[id].target;
    return o;
  }

  /**
   * Tests only: mirror every bus fade onto a constant source with an analyser
   * behind it, so a render can read each bus's level as the engine rendered it.
   */
  enableMeters(): void {
    if (this.meters) return;
    const ctx = this.ctx;
    const one = ctx.createConstantSource();
    one.start();
    this.meters = new Map();
    for (const id of IDS) {
      const g = ctx.createGain();
      g.gain.value = this.arrs[id].bus.gain.value;
      const an = ctx.createAnalyser();
      an.fftSize = 128;
      one.connect(g);
      g.connect(an);
      this.meters.set(id, { g, an, td: new Float32Array(128) });
    }
  }

  /** Each bus's level at the last rendered sample, from the meters. Empty without enableMeters(). */
  busLevels(): Record<ArrId, number> {
    const o = {} as Record<ArrId, number>;
    if (!this.meters) return o;
    for (const [id, m] of this.meters) {
      m.an.getFloatTimeDomainData(m.td);
      o[id] = m.td[m.td.length - 1];
    }
    return o;
  }

  private fade(a: Arr, tg: number, now: number, tau: number): void {
    a.bus.gain.setTargetAtTime(tg, now, tau);
    this.meters?.get(a.id)?.g.gain.setTargetAtTime(tg, now, tau);
  }

  set(p: MusicParams): void {
    const prev = this.p;
    this.p = p;
    const now = this.ctx.currentTime;
    const title = p.scene === 'title' || p.game === 'title';
    const wasTitle = prev.scene === 'title' || prev.game === 'title';
    const home = !title && p.game === 'homestead';
    const deck = !title && p.game === 'deck';
    const ranch = !title && p.game === 'ranch';
    const lull = home ? clamp(p.lull, 0, 1) : 0;
    const dark = ranch ? clamp(p.dark, 0, 1) : 0;
    const k = clamp(p.intensity, 0, 1);
    const targets: Record<ArrId, number> = {
      day: home ? 1 - 0.85 * lull : 0,
      turns: deck ? 1 : 0,
      lift: deck ? 0.9 * k : 0,
      ranch: ranch ? 1 - dark : 0,
      ranchNight: ranch ? dark : 0,
      tension: ranch ? 0.85 * k : 0,
      title: title ? 1 : 0,
      lullaby: home ? lull * 0.75 : 0,
    };
    // A game switch fades over about 0.8 s, the new one in a little faster than the old goes out, so the sum never dips.
    const switching = title !== wasTitle || p.game !== prev.game;
    for (const id of IDS) {
      const a = this.arrs[id];
      const tg = targets[id];
      if (Math.abs(tg - a.target) < 0.001) continue;
      const up = tg > a.target;
      if (up && a.target <= 0.001 && now >= a.liveUntil) a.entering = true;
      let tau: number;
      if (switching) tau = up ? 0.2 : 0.26;
      else if (id === 'lift' || id === 'tension') tau = up ? 0.3 : 0.9;
      else if (id === 'ranch' || id === 'ranchNight') tau = 1.2;
      else tau = up ? 0.28 : 0.42;
      this.fade(a, tg, now, tau);
      if (tg <= 0.001) {
        a.liveUntil = now + Math.max(1.4, tau * 7);
        for (const v of a.pad) this.voices.release(v, now + 0.4, 0.5);
        a.pad = [];
      }
      a.target = tg;
    }
    if (p.season !== this.season && p.season !== this.pendingSeason) this.pendingSeason = p.season;
    this.tempoMul = (title ? 0.9 : deck ? 0.96 : 1) * (1 - 0.12 * lull) * (1 - 0.1 * dark);
    const winter = (this.pendingSeason ?? this.season) === 3;
    this.densityTarget = title ? 1 : home ? clamp(1 - 0.75 * p.lateness, 0.2, 1) * (p.tired ? 0.8 : 1) * (winter ? 0.9 : 1) : winter ? 0.9 : 1;
  }

  /** Book every sixteenth that starts before `until`. */
  schedule(until: number): void {
    const now = this.ctx.currentTime;
    if (this.nextT < 0 || this.nextT < now - 0.3) {
      // First run, or the page stalled: pick the beat up from here.
      this.nextT = now + 0.02;
      this.density = this.densityTarget;
    }
    while (this.nextT < until) {
      this.step(this.nextT);
      this.nextT += 60 / this.bpm / 4;
      this.bpm += (this.sm.bpm * this.tempoMul - this.bpm) * 0.05;
      if (++this.i === 16) {
        this.i = 0;
        this.onBar();
      }
    }
  }

  private onBar(): void {
    this.bar++;
    if (this.bar === 32) {
      this.bar = 0;
      this.cycle++;
    }
    this.density += (this.densityTarget - this.density) * 0.6;
    if (this.pendingSeason !== null) {
      this.season = this.pendingSeason;
      this.pendingSeason = null;
      this.sm = SEASON_MUSIC[this.season];
      this.bar = 0;
      for (const a of Object.values(this.arrs)) a.padPrev = null;
    }
    // Keep the valley echo on the beat as the tempo moves.
    const et = this.echoTime();
    for (const a of Object.values(this.arrs)) {
      if (a.echo && Math.abs(a.echo.delay.delayTime.value - et) > 0.004) a.echo.delay.delayTime.setTargetAtTime(et, this.ctx.currentTime, 0.3);
    }
  }

  private step(t0: number): void {
    const sm = this.sm;
    const d16 = 60 / this.bpm / 4;
    const sw = sm.swing - 0.5;
    const t = t0 + [0, sw * 2, sw * 4, sw * 2][this.i % 4] * d16;
    const sectionIdx = this.bar >> 3;
    const section = FORM[sectionIdx];
    const sb = this.bar & 7;
    const chord = sm[section][sb];
    const next = sb < 7 ? sm[section][sb + 1] : sm[FORM[(sectionIdx + 1) % 4]][0];
    this.lastChord = { key: sm.key, chord };
    const s: StepInfo = {
      t, i: this.i, bar: sb, section, sectionIdx, cycle: this.cycle, chord, next, key: sm.key, d16,
      density: this.density, season: this.season,
    };
    const now = this.ctx.currentTime;
    if (this.silent) return;
    for (const a of Object.values(this.arrs)) {
      if (a.target <= 0.001 && now >= a.liveUntil) continue;
      if (a.entering) {
        a.entering = false;
        this.enter(a, s);
      }
      switch (a.id) {
        case 'day': this.day(a, s); break;
        case 'turns': this.turns(a, s); break;
        case 'lift': this.lift(a, s); break;
        case 'ranch': this.ranch(a, s); break;
        case 'ranchNight': this.ranchNight(a, s); break;
        case 'tension': this.tension(a, s); break;
        case 'title': this.title(a, s); break;
        default: this.lullaby(a, s);
      }
    }
  }

  // ------------------------------------------------------------ helpers

  private dest(a: Arr, name: string): AudioNode {
    let p = a.pans.get(name);
    if (!p) {
      p = this.ctx.createStereoPanner();
      p.pan.value = PAN[name] ?? 0;
      p.connect(a.bus);
      const send = ECHO_SEND[name];
      if (a.echo && send) {
        const g = this.ctx.createGain();
        g.gain.value = send;
        p.connect(g);
        g.connect(a.echo.send);
      }
      a.pans.set(name, p);
    }
    return p;
  }

  private n(a: Arr, inst: InstName, midi: number, t: number, vel: number, o: { dur?: number; release?: number; attack?: number; slide?: number } = {}): void {
    if (this.solo && !this.solo.includes(inst)) return;
    const s = this.bank.note(inst, midi);
    if (!s) return;
    // Under heavy load drop the quiet notes first.
    if (this.voices.live > 110 && vel < 0.35) return;
    this.voices.play(s.buf, this.dest(a, inst), t, {
      gain: vel * TRIM[inst],
      rate: s.rate,
      dur: Math.min(o.dur ?? RING[inst], RING[inst]),
      release: o.release ?? 0.12,
      attack: o.attack,
      slide: o.slide,
    });
    this.notes++;
  }

  private hit(a: Arr, fx: FxName, t: number, vel: number, rate = 1): void {
    const b = this.bank.get(fx, Math.floor(this.r() * 8));
    if (!b || (this.solo && !this.solo.includes(fx))) return;
    if (this.voices.live > 110 && vel < 0.35) return;
    this.voices.play(b, this.dest(a, fx), t, { gain: vel * (DRUM_TRIM[fx] ?? 0.1), rate: rate * (0.98 + this.r() * 0.04) });
    this.notes++;
  }

  /** Hold the chord on the pad until the next chord releases it. */
  private padChord(a: Arr, s: StepInfo, vel: number, lo = 50, hi = 70, n = 4): void {
    const v = voiceLead(s.key, s.chord, lo, hi, n, a.padPrev);
    a.padPrev = v;
    this.padHold(a, s, v, vel);
  }

  /** Hold these notes on the pad until the next call releases them. */
  private padHold(a: Arr, s: StepInfo, v: number[], vel: number, attack = 0.45): void {
    for (const old of a.pad) this.voices.release(old, s.t, 0.4);
    a.pad = [];
    if (this.solo && !this.solo.includes('pad')) return;
    const pans = [-0.4, -0.12, 0.12, 0.4];
    v.forEach((m, k) => {
      const smp = this.bank.note('pad', m);
      if (!smp) return;
      const voice = this.voices.play(smp.buf, a.bus, s.t, { gain: vel * TRIM.pad, rate: smp.rate, loop: true, attack, pan: pans[k % 4] });
      // A safety stop two bars on; the next chord normally releases it first.
      voice.end = s.t + s.d16 * 32 + 1.5;
      voice.src.stop(voice.end);
      a.pad.push(voice);
      this.notes++;
    });
  }

  /** Notes of a written line that start on this sixteenth. */
  private lead(a: Arr, inst: InstName, style: string, s: StepInfo, vel: number, legato: boolean): void {
    const variant = s.section === 'A' ? (s.sectionIdx === 1 ? 1 : 0) : s.cycle % 2;
    const key = `${style}:${this.season}:${s.section}:${variant}`;
    let line = this.lines.get(key);
    if (!line) {
      const seed = [...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
      line = new Map();
      for (const nt of melody(this.sm, s.section, STYLES[style], seed)) {
        const list = line.get(nt.at) ?? [];
        list.push(nt);
        line.set(nt.at, list);
      }
      this.lines.set(key, line);
    }
    const here = line.get(s.bar * 16 + s.i);
    if (!here) return;
    for (const nt of here) {
      if (s.density < 0.45 && nt.len < 4) continue;
      const dur = nt.len * s.d16;
      this.n(a, inst, nt.midi, s.t, vel * nt.vel, legato
        ? { dur: dur * 0.94, release: 0.18, attack: 0.03, slide: this.r() < 0.35 ? 0.985 : undefined }
        : { dur: dur + 0.35, release: 0.3 });
    }
  }

  private fifth(s: StepInfo, root: number): number {
    const tones = s.chord.tones;
    const iv = tones.includes(7) ? 7 : tones[tones.length - 1];
    return root + iv > root + 9 ? root + iv - 12 : root + iv;
  }

  /** Root, fifth, ninth (or octave) and the third on top: wide and open, for outdoors. */
  private openVoicing(s: StepInfo, lo = 45): number[] {
    const root = rootAt(s.key, s.chord, lo);
    const tones = s.chord.tones;
    const fifth = tones.includes(7) ? 7 : tones[tones.length - 1];
    const ninth = SCALE[s.season].includes((s.chord.root + 2) % 12);
    return [root, root + fifth, root + (ninth ? 14 : 12), root + 12 + tones[1]];
  }

  /** Pentatonic notes of the key between lo and hi. */
  private ladder(key: number, lo: number, hi: number): number[] {
    const out: number[] = [];
    for (let m = lo; m <= hi; m++) if (PENTA.includes((((m - key) % 12) + 12) % 12)) out.push(m);
    return out;
  }

  /** An arrangement coming in mid-bar sounds the chord at once. */
  private enter(a: Arr, s: StepInfo): void {
    if (a.id === 'lift' || a.id === 'tension') return;
    if (a.id === 'ranch' || a.id === 'ranchNight') {
      this.padHold(a, s, this.openVoicing(s, a.id === 'ranch' ? 45 : 43), a.id === 'ranch' ? 0.55 : 0.5, 0.3);
      this.n(a, 'harp', rootAt(s.key, s.chord, 43), s.t, 0.55);
      if (a.id === 'ranch') tonesIn(s.key, s.chord, 64, 79).slice(0, 2).forEach((m, k) => this.n(a, 'kalimba', m, s.t + k * 0.05, 0.4));
      return;
    }
    if (a.id === 'turns' || a.id === 'title' || a.id === 'lullaby') {
      this.padChord(a, s, a.id === 'lullaby' ? 0.6 : 0.85);
      if (a.id === 'turns') this.n(a, 'piano', rootAt(s.key, s.chord, 43), s.t, 0.45);
      return;
    }
    tonesIn(s.key, s.chord, 52, 67).slice(0, 4).forEach((m, k) => this.n(a, 'guitar', m, s.t + k * 0.03, 0.4));
    this.n(a, 'bass', rootAt(s.key, s.chord, 38), s.t, 0.7);
  }

  // ------------------------------------------------------------ arrangements

  /** Sunup: fingerpicked guitar, upright bass, fiddle lead, banjo break, brushes. */
  private day(a: Arr, s: StepInfo): void {
    const { i, t, chord, key, density: d, season, section, d16 } = s;
    const beat = d16 * 4;
    const winter = season === 3;
    const summer = season === 1;
    const autumn = season === 2;
    const root = rootAt(key, chord, 38);
    // Autumn: a low, warm bed under the band.
    if (autumn && i === 0) this.padChord(a, s, 0.55, 45, 62, 3);
    else if (!autumn && i === 0 && a.pad.length) {
      for (const v of a.pad) this.voices.release(v, t, 0.6);
      a.pad = [];
    }
    if (i === 0) this.n(a, 'bass', root, t, 0.85, { dur: beat * (winter ? 3.6 : 1.8) });
    if (i === 8 && d > 0.35 && !winter) this.n(a, 'bass', this.fifth(s, root), t, 0.65, { dur: beat * 1.6 });
    if (i === 14 && d > 0.7 && !winter && s.next.root !== chord.root && this.r() < 0.45) {
      const nr = rootAt(key, s.next, 38);
      this.n(a, 'bass', nr + (this.r() < 0.5 ? -1 : 2), t, 0.5, { dur: beat * 0.45 });
    }
    if (i % 2 === 0) {
      const e = i >> 1;
      const g = voiceLead(key, chord, 55, 71, 3, null);
      const thumbs = [rootAt(key, chord, 40), this.fifth(s, rootAt(key, chord, 43))];
      if (winter) {
        if (e % 2 === 0) this.n(a, 'guitar', e === 0 ? thumbs[0] : e === 4 ? thumbs[1] : g[(e >> 1) % 3], t, 0.5);
      } else if (e % 2 === 0) {
        this.n(a, 'guitar', thumbs[(e >> 1) % 2], t, autumn ? 0.6 : 0.52);
        if (e === 0 && section === 'A' && d > 0.6) this.n(a, 'guitar', g[2], t + 0.008, 0.36);
      } else {
        const keep = d >= 0.75 || (d >= 0.5 && (e === 3 || e === 7)) || e === 3;
        if (keep) this.n(a, 'guitar', [g[1], g[2], g[0], g[1]][e >> 1], t, summer ? 0.34 : 0.4);
      }
    }
    if (section === 'A') this.lead(a, 'fiddle', autumn ? 'fiddleLow' : 'fiddle', s, 0.85, true);
    else {
      if (winter) this.lead(a, 'bell', 'bell', s, 0.8, false);
      else this.lead(a, 'banjo', 'banjo', s, 0.75, false);
      if (i === 0 && d > 0.6) {
        const h = tonesIn(key, chord, 64, 76);
        this.n(a, 'fiddle', h[Math.min(1, h.length - 1)], t, 0.38, { dur: beat * 3.6, attack: 0.18, release: 0.3 });
      }
    }
    if (!winter && d > 0.55) {
      if (i === 0) this.hit(a, 'kick', t, 0.4);
      if (i === 8 && !autumn) this.hit(a, 'kick', t, 0.28);
      if (i === 4 || i === 12) this.hit(a, 'brush', t, autumn ? 0.4 : 0.5);
      if (season === 0 && (i === 6 || i === 14)) this.hit(a, 'tap', t, 0.28);
      if (summer && i % 4 === 2) this.hit(a, 'shaker', t, 0.32);
    }
    if (winter && section === 'B' && d > 0.6 && (i === 4 || i === 12)) this.hit(a, 'sleigh', t, 0.3);
  }

  /** Seedbound: a held pad, sparse felt piano, a celesta line. Room to think. */
  private turns(a: Arr, s: StepInfo): void {
    const { i, t, chord, key, density: d, season, section, d16, bar } = s;
    const beat = d16 * 4;
    if (i === 0) {
      this.padChord(a, s, 0.9);
      this.n(a, 'piano', rootAt(key, chord, 40), t, 0.3, { dur: beat * 3 });
    }
    const m = voiceLead(key, chord, 55, 72, 3, null);
    if (bar % 2 === 0) {
      if (i === 6) this.n(a, 'piano', m[0], t, 0.34);
      if (i === 12 && d > 0.5) this.n(a, 'piano', m[2], t, 0.28);
    } else {
      if (i === 4) this.n(a, 'piano', m[1], t, 0.32);
      if (i === 10 && d > 0.5) this.n(a, 'piano', m[2], t, 0.28);
      if (i === 14 && d > 0.75) this.n(a, 'piano', m[0] + 12, t, 0.2);
    }
    if (section === 'A') {
      if (season === 3) this.lead(a, 'bell', 'bell', s, 0.85, false);
      else this.lead(a, 'celesta', 'celesta', s, 0.8, false);
    } else {
      this.lead(a, 'piano', 'piano', s, 0.6, false);
      if (i === 8 && this.r() < 0.3) {
        const hi = tonesIn(key, chord, 79, 91);
        this.n(a, 'musicbox', hi[Math.floor(this.r() * hi.length)], t, 0.3);
      }
    }
  }

  /** Seedbound's scoring lift: a soft piano pulse, celesta a register up, a seed pod and a frame drum. */
  private lift(a: Arr, s: StepInfo): void {
    const { i, t, chord, key, d16 } = s;
    const v = voiceLead(key, chord, 67, 84, 3, null);
    if (i % 2 === 0) this.n(a, 'piano', v[[0, 1, 2, 1][(i >> 1) % 4]], t, i % 4 === 0 ? 0.3 : 0.2, { dur: d16 * 1.8, release: 0.15 });
    if (i === 0 || i === 8) this.n(a, 'celesta', v[i === 0 ? 2 : 1] + 12, t, 0.34);
    if (i === 0) this.n(a, 'piano', rootAt(key, chord, 40), t, 0.32, { dur: d16 * 7 });
    if (i % 4 === 2) this.hit(a, 'pod', t, 0.3);
    if (i === 0 || i === 8) this.hit(a, 'frame', t, i === 0 ? 0.32 : 0.22);
  }

  /** Thistledown by day: kalimba, harp, a breathy flute, open pads and hand percussion, with the valley's echo. */
  private ranch(a: Arr, s: StepInfo): void {
    const { i, t, chord, key, density: d, season, section, d16, bar } = s;
    const beat = d16 * 4;
    const winter = season === 3;
    const summer = season === 1;
    const autumn = season === 2;
    if (i === 0) this.padHold(a, s, this.openVoicing(s), 0.55, 0.6);
    // Harp: the bass, root on one and the fifth on three.
    const root = rootAt(key, chord, 43);
    if (i === 0) this.n(a, 'harp', root, t, 0.8, { dur: beat * 3.5 });
    if (i === 8 && !winter && d > 0.4) this.n(a, 'harp', this.fifth(s, root), t, 0.55, { dur: beat * 1.8 });
    // Kalimba: a 3-3-2 ostinato on even bars, a lilting one on odd bars. Winter keeps only the downbeats.
    const kv = tonesIn(key, chord, 69, 88);
    const idx = (bar % 2 === 0 ? KAL_A : KAL_B)[i];
    if (kv.length && idx !== undefined && (d >= 0.75 || i % 4 === 0 || i === 6) && !(winter && i % 8 !== 0)) {
      this.n(a, 'kalimba', kv[idx % kv.length], t, (i === 0 ? 0.4 : 0.28) * (section === 'B' ? 0.7 : 1));
    }
    if (section === 'A') this.lead(a, 'flute', autumn || winter ? 'fluteLow' : 'flute', s, 0.8, true);
    else {
      if (winter) this.lead(a, 'bell', 'bell', s, 0.7, false);
      else this.lead(a, 'kalimba', 'kalimbaLead', s, 0.75, false);
      // Harp rolls up under the B section, and the flute holds a long note over it.
      if (i % 2 === 0 && d > 0.6) {
        const hv = tonesIn(key, chord, 55, 76);
        this.n(a, 'harp', hv[(i >> 1) % hv.length], t, 0.24);
      }
      if (i === 0 && bar % 2 === 0 && d > 0.6 && !winter) {
        const h = tonesIn(key, chord, 72, 84);
        if (h.length) this.n(a, 'flute', h[0], t, 0.42, { dur: beat * 7, attack: 0.25, release: 0.4 });
      }
    }
    // Hand percussion: a frame drum, finger taps and a seed pod. Summer skips along; winter rests.
    if (!winter && d > 0.55) {
      if (i === 0) this.hit(a, 'frame', t, 0.5);
      if (i === 10 && (autumn || summer)) this.hit(a, 'frame', t, 0.3);
      if (i === 4 || i === 12) this.hit(a, 'tap', t, summer ? 0.32 : 0.24);
      if (i % 2 === 0) this.hit(a, 'pod', t, i % 4 === 2 ? 0.4 : 0.2);
      if (summer && (i === 7 || i === 15)) this.hit(a, 'pod', t, 0.18);
    }
  }

  /** Thistledown at night: a slow harp, a few kalimba stars, an ocarina far off, and more echo. */
  private ranchNight(a: Arr, s: StepInfo): void {
    const { i, t, chord, key, season, d16, bar, section } = s;
    const beat = d16 * 4;
    if (i === 0) this.padHold(a, s, this.openVoicing(s, 43), 0.5, 1.2);
    const hv = voiceLead(key, chord, 50, 71, 4, null);
    if (i % 4 === 0 && (bar % 2 === 0 || i % 8 === 0)) this.n(a, 'harp', hv[i >> 2], t, i === 0 ? 0.36 : 0.26, { dur: beat * 3 });
    if ((i === 6 || i === 14) && this.r() < 0.3) {
      const hi = this.ladder(key, 79, 93);
      this.n(a, season === 3 ? 'bell' : 'kalimba', hi[Math.floor(this.r() * hi.length)], t, 0.26);
    }
    if (section === 'B' || s.sectionIdx === 1) this.lead(a, 'flute', 'ocarina', s, 0.55, true);
  }

  /** A gentle unease for the ranch: a heartbeat, a low harp that leans on the flat sixth, a held suspension. */
  private tension(a: Arr, s: StepInfo): void {
    const { i, t, chord, key, d16, bar } = s;
    const root = rootAt(key, chord, 40);
    if (i === 0) this.hit(a, 'frame', t, 0.55);
    if (i === 3) this.hit(a, 'frame', t, 0.32);
    if (i % 2 === 0) {
      const seq = [0, 7, 12, 7, 0, 7, 8, 7];
      this.n(a, 'harp', root + seq[i >> 1], t, i % 4 === 0 ? 0.42 : 0.28, { dur: d16 * 2.2 });
    }
    if (i === 0 && bar % 2 === 0) this.padHold(a, s, [root + 12, root + 17], 0.5, 0.8);
    if (i % 4 === 2) this.hit(a, 'pod', t, 0.16);
  }

  /** The title: the theme on felt piano over guitar arpeggios. */
  private title(a: Arr, s: StepInfo): void {
    const { i, t, chord, key, section, d16 } = s;
    if (i === 0) {
      this.padChord(a, s, 0.75);
      this.n(a, 'bass', rootAt(key, chord, 36), t, 0.5, { dur: d16 * 14 });
    }
    if (i % 2 === 0) {
      const g = voiceLead(key, chord, 52, 74, 4, null);
      this.n(a, 'guitar', g[[0, 1, 2, 3, 2, 1, 2, 3][i >> 1]], t, i === 0 ? 0.55 : 0.42);
    }
    if (section === 'A') this.lead(a, 'piano', 'title', s, 0.65, false);
    else this.lead(a, 'celesta', 'celesta', s, 0.75, false);
  }

  /** Sunup's late hours: a music box over a slow guitar arpeggio. */
  private lullaby(a: Arr, s: StepInfo): void {
    const { i, t, chord, key, season, d16 } = s;
    if (i === 0) {
      this.padChord(a, s, 0.4);
      this.n(a, 'piano', rootAt(key, chord, 40), t, 0.18, { dur: d16 * 14 });
    }
    if (i % 4 === 0) {
      const g = voiceLead(key, chord, 52, 69, 3, null);
      this.n(a, 'guitar', g[[0, 1, 2, 1][i >> 2]], t, 0.28);
    }
    this.lead(a, season === 3 ? 'bell' : 'musicbox', 'lullaby', s, 0.6, false);
  }
}
