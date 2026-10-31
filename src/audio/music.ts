// The score. One transport and one chord progression drive five arrangements:
// the three clocks, the title and a lullaby for late hours. Switching clock
// crossfades their buses; nothing restarts. A lookahead scheduler books notes
// a fraction of a second ahead, and only for arrangements that can be heard.

import type { Season } from '../sim/types';
import type { Bank, FxName, InstName } from './bank';
import { clamp, rand } from './dsp';
import { FORM, SEASON_MUSIC, STYLES, melody, rootAt, tonesIn, voiceLead } from './theory';
import type { Chord, MNote, SeasonMusic, Section } from './theory';
import type { Voice, Voices } from './voices';

export type ArrId = 'day' | 'turns' | 'flow' | 'title' | 'lullaby';
export type Clock = 'day' | 'turns' | 'flow';

export interface MusicParams {
  scene: 'title' | 'farm' | 'menu';
  clock: Clock;
  season: Season;
  /** Flow speed 0, 1, 2 or 4. */
  speed: number;
  /** 0 by day, 1 late in the evening: the arrangement thins. */
  lateness: number;
  /** 0 to 1: how far the lullaby has taken over. */
  lull: number;
  tired: boolean;
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
};

const DRUM_TRIM: Partial<Record<FxName, number>> = {
  kick: 0.5,
  brush: 0.3,
  tap: 0.2,
  shaker: 0.22,
  block: 0.32,
  tamb: 0.16,
  sleigh: 0.1,
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
  kick: 0,
  brush: 0.2,
  tap: 0.15,
  shaker: -0.32,
  block: 0.3,
  tamb: -0.25,
  sleigh: 0.25,
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
};

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
  speed: number;
}

const SPEED_TEMPO: Record<number, number> = { 0: 1, 1: 1, 2: 1.05, 4: 1.1 };

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
  private p: MusicParams = { scene: 'farm', clock: 'day', season: 0, speed: 1, lateness: 0, lull: 0, tired: false };
  private lines = new Map<string, Map<number, MNote[]>>();
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
      return { id, bus, target: 0, liveUntil: 0, entering: false, pans: new Map(), pad: [], padPrev: null };
    };
    this.arrs = { day: mk('day'), turns: mk('turns'), flow: mk('flow'), title: mk('title'), lullaby: mk('lullaby') };
  }

  /** The key and chord now sounding, so effects can sit in tune with the music. */
  harmony(): { key: number; chord: Chord } {
    return this.lastChord;
  }

  /** The tonic of a season (or of the one about to start). */
  keyOf(season?: Season): number {
    return SEASON_MUSIC[season ?? this.pendingSeason ?? this.season].key;
  }

  /** Levels of each arrangement, for the workbench. */
  levels(): Record<ArrId, number> {
    const o = {} as Record<ArrId, number>;
    for (const id of Object.keys(this.arrs) as ArrId[]) o[id] = this.arrs[id].target;
    return o;
  }

  set(p: MusicParams): void {
    const prev = this.p;
    this.p = p;
    const now = this.ctx.currentTime;
    const title = p.scene === 'title';
    const lull = title ? 0 : clamp(p.lull, 0, 1);
    const targets: Record<ArrId, number> = {
      day: !title && p.clock === 'day' ? 1 - 0.85 * lull : 0,
      turns: !title && p.clock === 'turns' ? 1 - 0.85 * lull : 0,
      flow: !title && p.clock === 'flow' ? 1 - 0.85 * lull : 0,
      title: title ? 1 : 0,
      lullaby: title ? 0 : lull * 0.75,
    };
    for (const id of Object.keys(targets) as ArrId[]) {
      const a = this.arrs[id];
      const tg = targets[id];
      if (Math.abs(tg - a.target) < 0.001) continue;
      if (tg > 0 && a.target <= 0.001 && now >= a.liveUntil) a.entering = true;
      // Come in a little faster than the other goes out, so the sum never dips.
      a.bus.gain.setTargetAtTime(tg, now, tg > a.target ? 0.28 : 0.42);
      if (tg <= 0.001) {
        a.liveUntil = now + 2.6;
        for (const v of a.pad) this.voices.release(v, now + 0.4, 0.5);
        a.pad = [];
      }
      a.target = tg;
    }
    if (p.season !== this.season && p.season !== this.pendingSeason) this.pendingSeason = p.season;
    // Pausing the flow clock swaps the groove for a held pad, at once.
    const flow = this.arrs.flow;
    if (p.clock === 'flow' && prev.speed !== p.speed && flow.target > 0) {
      if (p.speed <= 0) flow.entering = true;
      else {
        for (const v of flow.pad) this.voices.release(v, now, 0.4);
        flow.pad = [];
      }
    }
    const sp = p.speed >= 4 ? 4 : p.speed >= 2 ? 2 : p.speed > 0 ? 1 : 0;
    this.tempoMul = (title ? 0.9 : p.clock === 'flow' ? SPEED_TEMPO[sp] : 1) * (1 - 0.12 * lull);
    const winter = (this.pendingSeason ?? this.season) === 3;
    this.densityTarget = title ? 1 : clamp(1 - 0.75 * p.lateness, 0.2, 1) * (p.tired ? 0.8 : 1) * (winter ? 0.9 : 1);
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
      density: this.density, season: this.season, speed: this.p.speed,
    };
    const now = this.ctx.currentTime;
    if (this.silent) return;
    for (const a of Object.values(this.arrs)) {
      if (a.target <= 0.001 && now >= a.liveUntil) continue;
      if (a.entering) {
        a.entering = false;
        this.enter(a, s);
      }
      if (a.id === 'day') this.day(a, s);
      else if (a.id === 'turns') this.turns(a, s);
      else if (a.id === 'flow') this.flow(a, s);
      else if (a.id === 'title') this.title(a, s);
      else this.lullaby(a, s);
    }
  }

  // ------------------------------------------------------------ helpers

  private dest(a: Arr, name: string): AudioNode {
    let p = a.pans.get(name);
    if (!p) {
      p = this.ctx.createStereoPanner();
      p.pan.value = PAN[name] ?? 0;
      p.connect(a.bus);
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
    for (const old of a.pad) this.voices.release(old, s.t, 0.4);
    a.pad = [];
    if (this.solo && !this.solo.includes('pad')) return;
    const pans = [-0.4, -0.12, 0.12, 0.4];
    v.forEach((m, k) => {
      const smp = this.bank.note('pad', m);
      if (!smp) return;
      const voice = this.voices.play(smp.buf, a.bus, s.t, { gain: vel * TRIM.pad, rate: smp.rate, loop: true, attack: 0.45, pan: pans[k % 4] });
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

  /** An arrangement coming in mid-bar sounds the chord at once. */
  private enter(a: Arr, s: StepInfo): void {
    if (a.id === 'turns' || a.id === 'title' || a.id === 'lullaby' || (a.id === 'flow' && s.speed <= 0)) {
      this.padChord(a, s, a.id === 'lullaby' ? 0.6 : 0.85);
      if (a.id === 'turns') this.n(a, 'piano', rootAt(s.key, s.chord, 43), s.t, 0.45);
      return;
    }
    if (a.id === 'day') {
      tonesIn(s.key, s.chord, 52, 67).slice(0, 4).forEach((m, k) => this.n(a, 'guitar', m, s.t + k * 0.03, 0.4));
      this.n(a, 'bass', rootAt(s.key, s.chord, 38), s.t, 0.7);
    } else {
      tonesIn(s.key, s.chord, 60, 74).slice(0, 3).forEach((m) => this.n(a, 'marimba', m, s.t, 0.4));
      this.n(a, 'bass', rootAt(s.key, s.chord, 38), s.t, 0.7);
    }
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

  /** Patchwork: a held pad, sparse felt piano, a celesta line. Room to think. */
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

  /** Bushel & Co.: marimba and banjo groove that builds with the clock speed. */
  private flow(a: Arr, s: StepInfo): void {
    const { i, t, chord, key, density: d, section, d16, speed } = s;
    const beat = d16 * 4;
    if (speed <= 0) {
      // Paused: hold a soft pad and the odd music box note.
      if (i === 0) this.padChord(a, s, 0.75);
      if (i === 0 && s.bar % 2 === 0) {
        const hi = tonesIn(key, chord, 76, 88);
        this.n(a, 'musicbox', hi[Math.floor(this.r() * hi.length)], t, 0.3);
      }
      return;
    }
    const sp = speed >= 4 ? 4 : speed >= 2 ? 2 : 1;
    const mv = voiceLead(key, chord, 60, 76, 3, null);
    const root = rootAt(key, chord, 38);
    // Marimba: a 3-3-2 ostinato, with off-sixteenths as the clock speeds up.
    const tres = i === 0 ? mv[0] : i === 6 ? mv[1] : i === 12 ? mv[2] : -1;
    if (tres > 0) this.n(a, 'marimba', tres, t, 0.55);
    else if (d >= 0.5) {
      if (sp >= 2 && (i === 3 || i === 9 || i === 14)) this.n(a, 'marimba', i === 9 ? mv[0] + 12 : mv[2], t, 0.3);
      else if (sp >= 4 && i % 2 === 0) this.n(a, 'marimba', mv[(i >> 1) % 3], t, 0.2);
    }
    // Bass.
    if (sp === 1) {
      if (i === 0) this.n(a, 'bass', root, t, 0.8, { dur: beat * 1.5 });
      if (i === 8) this.n(a, 'bass', this.fifth(s, root), t, 0.62, { dur: beat * 1.5 });
    } else {
      const pat: Record<number, [number, number]> = sp === 2
        ? { 0: [0, 0.8], 6: [12, 0.45], 8: [7, 0.65], 14: [12, 0.4] }
        : { 0: [0, 0.8], 4: [12, 0.42], 6: [0, 0.5], 8: [7, 0.65], 12: [12, 0.42], 14: [10, 0.4] };
      const hitB = pat[i];
      if (hitB) {
        const iv = hitB[0] === 7 ? this.fifth(s, root) - root : hitB[0] === 10 ? (s.next.root !== chord.root ? 11 : 12) : hitB[0];
        this.n(a, 'bass', root + iv, t, hitB[1], { dur: beat * 0.45 });
      }
    }
    // Banjo rolls.
    if (sp >= 2 && d >= 0.5 && (sp === 4 || section === 'A') && i % 2 === 0) {
      const bv = tonesIn(key, chord, 62, 79);
      const roll = [0, 2, 4, 1, 3, 5, 2, 4];
      this.n(a, 'banjo', bv[roll[i >> 1] % bv.length], t, sp === 4 ? 0.6 : 0.5);
    }
    // Percussion.
    if (i === 0) this.hit(a, 'kick', t, 0.55);
    if (sp >= 2 && i === 8) this.hit(a, 'kick', t, 0.45);
    if (sp >= 4 && (i === 4 || i === 12)) this.hit(a, 'kick', t, 0.3);
    if ((sp === 1 && i === 12) || (sp >= 2 && (i === 4 || i === 12))) this.hit(a, 'block', t, 0.4);
    if (sp === 1 && i % 4 === 2) this.hit(a, 'shaker', t, 0.42);
    if (sp === 2 && i % 2 === 0) this.hit(a, 'shaker', t, i % 4 === 2 ? 0.36 : 0.2);
    if (sp === 4) this.hit(a, 'shaker', t, i % 4 === 2 ? 0.4 : i % 2 ? 0.17 : 0.25);
    if (sp === 4 && (i === 4 || i === 12)) this.hit(a, 'tamb', t, 0.3);
    // Lead.
    if (section === 'A') this.lead(a, 'marimba', 'marimba', s, 0.7, false);
    else if (sp >= 2) this.lead(a, 'musicbox', 'counter', s, 0.6, false);
    else this.lead(a, 'marimba', 'marimba', s, 0.6, false);
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

  /** Late hours: a music box over a slow arpeggio, coloured by the clock. */
  private lullaby(a: Arr, s: StepInfo): void {
    const { i, t, chord, key, season, d16 } = s;
    if (i === 0) {
      this.padChord(a, s, 0.4);
      this.n(a, 'piano', rootAt(key, chord, 40), t, 0.18, { dur: d16 * 14 });
    }
    if (i % 4 === 0) {
      const inst: InstName = this.p.clock === 'turns' ? 'piano' : this.p.clock === 'flow' ? 'marimba' : 'guitar';
      const g = voiceLead(key, chord, 52, 69, 3, null);
      this.n(a, inst, g[[0, 1, 2, 1][i >> 2]], t, 0.28);
    }
    this.lead(a, season === 3 ? 'bell' : 'musicbox', 'lullaby', s, 0.6, false);
  }
}
