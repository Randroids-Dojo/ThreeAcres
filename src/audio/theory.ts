// Keys, progressions and a small melody writer. One progression per season is
// shared by every arrangement, so switching clock never changes the harmony.

import type { Season } from '../sim/types';
import { rand } from './dsp';

export interface Chord {
  /** Semitones above the tonic. */
  root: number;
  /** Intervals above the root. */
  tones: number[];
}

export type Section = 'A' | 'B';

export interface SeasonMusic {
  /** Tonic as a MIDI note. */
  key: number;
  bpm: number;
  /** 0.5 straight, 0.66 a full triplet swing. */
  swing: number;
  A: Chord[];
  B: Chord[];
}

const Q: Record<string, number[]> = {
  M: [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  M7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  '6': [0, 4, 7, 9],
  s4: [0, 5, 7],
  s2: [0, 2, 7],
};

function prog(s: string): Chord[] {
  return s.split(' ').map((c) => {
    const [r, q] = c.split(':');
    return { root: Number(r), tones: Q[q] };
  });
}

/**
 * Spring is bright D major. Summer is lazy G with sevenths and a swing.
 * Autumn is A with a mixolydian flat seven and a borrowed minor four.
 * Winter is slow and leans on its relative minor.
 */
export const SEASON_MUSIC: Record<Season, SeasonMusic> = {
  0: { key: 62, bpm: 100, swing: 0.54, A: prog('0:M 7:M 9:m 5:M 0:M 5:M 7:M 0:M'), B: prog('5:M 0:M 7:M 9:m 5:M 0:M 2:m7 7:7') },
  1: { key: 55, bpm: 86, swing: 0.62, A: prog('0:M7 5:M7 0:M7 5:6 4:m7 9:m7 2:m7 7:7'), B: prog('5:M7 4:m7 2:m7 0:M7 5:M7 4:m7 2:m7 7:s4') },
  2: { key: 57, bpm: 92, swing: 0.56, A: prog('0:M 10:M 5:M 0:M 9:m 10:M 5:m 0:M'), B: prog('5:M 5:M 0:M 0:M 10:M 5:M 7:s4 0:M') },
  3: { key: 60, bpm: 76, swing: 0.5, A: prog('9:m 5:M 0:M 7:M 9:m 5:M 7:s4 7:M'), B: prog('5:M7 0:M 7:M 9:m7 5:M7 4:m 2:m7 7:s4') },
};

/** The 32-bar form every arrangement follows. */
export const FORM: Section[] = ['A', 'A', 'B', 'A'];

export function pcs(key: number, c: Chord): number[] {
  return c.tones.map((t) => (((key + c.root + t) % 12) + 12) % 12);
}

/** Every chord tone between lo and hi, ascending. */
export function tonesIn(key: number, c: Chord, lo: number, hi: number): number[] {
  const set = pcs(key, c);
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (set.includes(((m % 12) + 12) % 12)) out.push(m);
  return out;
}

/** The chord root at or above lo. */
export function rootAt(key: number, c: Chord, lo: number): number {
  const pc = (((key + c.root) % 12) + 12) % 12;
  let m = lo;
  while (((m % 12) + 12) % 12 !== pc) m++;
  return m;
}

/** n chord tones close together, moving as little as possible from prev. */
export function voiceLead(key: number, c: Chord, lo: number, hi: number, n: number, prev: number[] | null): number[] {
  const all = tonesIn(key, c, lo, hi);
  let best: number[] = all.slice(0, n);
  let bestCost = Infinity;
  const mid = (lo + hi) / 2;
  for (let s = 0; s + n <= all.length; s++) {
    const v = all.slice(s, s + n);
    let cost = 0;
    if (prev && prev.length === n) for (let k = 0; k < n; k++) cost += Math.abs(v[k] - prev[k]);
    else cost = Math.abs(v.reduce((a, b) => a + b, 0) / n - mid) * n;
    if (cost < bestCost) {
      bestCost = cost;
      best = v;
    }
  }
  return best;
}

export interface MNote {
  /** Sixteenth within the 8-bar section. */
  at: number;
  len: number;
  midi: number;
  vel: number;
}

export interface MelodyStyle {
  lo: number;
  hi: number;
  centre: number;
  /** One-bar rhythms as [start, length] in sixteenths. Empty bars are rests. */
  rhythms: [number, number][][];
  cadence: [number, number][][];
}

const PENTA = [0, 2, 4, 7, 9];

/**
 * Write an 8-bar line over a section. A two-bar motif, its echo, new material,
 * the motif again and a cadence onto the last chord's root. Strong beats land
 * on chord tones, weak beats walk the pentatonic scale.
 */
export function melody(sm: SeasonMusic, section: Section, st: MelodyStyle, seed: number): MNote[] {
  const r = rand(seed);
  const progr = sm[section];
  const key = sm.key;
  const scale = PENTA.map((p) => (key + p) % 12);
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const m0 = pick(st.rhythms);
  const m1 = pick(st.rhythms);
  const n0 = pick(st.rhythms);
  const n1 = pick(st.rhythms);
  const plan = [m0, m1, m0, r() < 0.5 ? m1 : n1, n0, n1, m0, pick(st.cadence)];
  const out: MNote[] = [];
  let cur = st.centre;
  const contour: number[] = [];
  for (let b = 0; b < 8; b++) {
    const chord = progr[b];
    const cps = pcs(key, chord);
    const pool: number[] = [];
    const ct: number[] = [];
    for (let m = st.lo; m <= st.hi; m++) {
      const pc = ((m % 12) + 12) % 12;
      if (cps.includes(pc)) ct.push(m);
      if (cps.includes(pc) || scale.includes(pc)) pool.push(m);
    }
    const near = (list: number[], x: number) => list.reduce((a, m) => (Math.abs(m - x) < Math.abs(a - x) ? m : a), list[0]);
    const idx = (m: number) => pool.indexOf(near(pool, m));
    const rh = plan[b];
    rh.forEach(([at, len], k) => {
      const strong = at === 0 || at === 8 || len >= 6;
      let m: number;
      if (b === 7 && k === rh.length - 1) {
        const rootPc = cps[0];
        m = near(ct.filter((x) => ((x % 12) + 12) % 12 === rootPc), cur);
      } else if ((b === 2 || b === 6) && k > 0 && k < contour.length) {
        const j = Math.max(0, Math.min(pool.length - 1, idx(cur) + contour[k]));
        m = strong ? near(ct, pool[j]) : pool[j];
      } else if (strong) {
        const sorted = ct.slice().sort((a, c) => Math.abs(a - cur) - Math.abs(c - cur));
        m = r() < 0.3 && sorted.length > 1 ? sorted[1] : sorted[0];
      } else {
        const dir = cur > st.centre + 5 ? -1 : cur < st.centre - 5 ? 1 : r() < 0.5 ? -1 : 1;
        const stepN = r() < 0.75 ? 1 : 2;
        const j = Math.max(0, Math.min(pool.length - 1, idx(cur) + dir * stepN));
        m = pool[j];
      }
      if (b === 0) contour.push(idx(m) - idx(cur));
      out.push({ at: b * 16 + at, len, midi: m, vel: strong ? 1 : 0.8 });
      cur = m;
    });
  }
  return out;
}

export const STYLES: Record<string, MelodyStyle> = {
  fiddle: {
    lo: 62, hi: 84, centre: 74,
    rhythms: [
      [[0, 4], [4, 2], [6, 2], [8, 4], [12, 4]],
      [[0, 6], [6, 2], [8, 4], [12, 2], [14, 2]],
      [[0, 2], [2, 2], [4, 4], [8, 8]],
      [[0, 4], [4, 4], [8, 6], [14, 2]],
      [[0, 8], [8, 4], [12, 4]],
      [[2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
    ],
    cadence: [[[0, 12]], [[0, 4], [4, 12]]],
  },
  fiddleLow: {
    lo: 57, hi: 79, centre: 67,
    rhythms: [
      [[0, 6], [6, 2], [8, 8]],
      [[0, 4], [4, 4], [8, 4], [12, 4]],
      [[0, 8], [8, 4], [12, 4]],
      [[0, 4], [4, 2], [6, 2], [8, 8]],
    ],
    cadence: [[[0, 16]]],
  },
  banjo: {
    lo: 64, hi: 83, centre: 72,
    rhythms: [
      [[0, 2], [2, 2], [4, 2], [6, 2], [8, 4], [12, 4]],
      [[0, 3], [3, 3], [6, 2], [8, 2], [10, 2], [12, 4]],
      [[0, 4], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
      [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
    ],
    cadence: [[[0, 4], [4, 12]], [[0, 2], [2, 2], [4, 12]]],
  },
  celesta: {
    lo: 72, hi: 91, centre: 81,
    rhythms: [[[0, 8], [8, 8]], [[0, 12]], [[4, 4], [8, 8]], [[0, 6], [8, 8]], [], [[0, 16]]],
    cadence: [[[0, 16]]],
  },
  piano: {
    lo: 64, hi: 81, centre: 72,
    rhythms: [[[0, 8], [8, 4], [12, 4]], [[0, 12], [12, 4]], [[0, 4], [4, 4], [8, 8]], [[0, 16]]],
    cadence: [[[0, 16]]],
  },
  marimba: {
    lo: 67, hi: 86, centre: 76,
    rhythms: [
      [[0, 3], [3, 3], [6, 2], [8, 2], [10, 2], [12, 4]],
      [[0, 2], [3, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
      [[0, 4], [6, 2], [8, 2], [10, 6]],
      [[0, 2], [2, 2], [4, 2], [6, 4], [10, 2], [12, 4]],
    ],
    cadence: [[[0, 4], [6, 10]], [[0, 2], [2, 2], [4, 12]]],
  },
  counter: {
    lo: 74, hi: 91, centre: 81,
    rhythms: [[[0, 4], [4, 4], [8, 8]], [[0, 8], [8, 8]], [[2, 2], [4, 4], [12, 4]], [[0, 12]]],
    cadence: [[[0, 16]]],
  },
  title: {
    lo: 62, hi: 81, centre: 72,
    rhythms: [[[0, 6], [6, 2], [8, 8]], [[0, 4], [4, 4], [8, 8]], [[0, 8], [8, 4], [12, 4]], [[0, 12], [12, 4]]],
    cadence: [[[0, 16]]],
  },
  lullaby: {
    lo: 72, hi: 88, centre: 79,
    rhythms: [[[0, 4], [4, 4], [8, 8]], [[0, 8], [8, 8]], [[0, 12]], [[0, 4], [8, 4]]],
    cadence: [[[0, 16]]],
  },
  bell: {
    lo: 69, hi: 88, centre: 78,
    rhythms: [[[0, 8], [8, 8]], [[0, 12]], [[0, 4], [8, 8]], []],
    cadence: [[[0, 16]]],
  },
  // Thistledown: a breathy flute that wanders and rests, a lower one for autumn and winter.
  flute: {
    lo: 69, hi: 88, centre: 78,
    rhythms: [[[0, 6], [6, 2], [8, 8]], [[0, 12], [12, 4]], [[0, 4], [4, 4], [8, 8]], [[0, 8], [10, 2], [12, 4]], [], [[4, 4], [8, 8]]],
    cadence: [[[0, 16]]],
  },
  fluteLow: {
    lo: 62, hi: 81, centre: 71,
    rhythms: [[[0, 8], [8, 8]], [[0, 12], [12, 4]], [[0, 6], [6, 2], [8, 8]], [], [[2, 6], [8, 8]]],
    cadence: [[[0, 16]]],
  },
  kalimbaLead: {
    lo: 69, hi: 88, centre: 79,
    rhythms: [
      [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
      [[0, 3], [3, 3], [6, 2], [8, 8]],
      [[0, 4], [6, 2], [8, 4], [12, 4]],
      [[2, 2], [4, 2], [6, 2], [8, 8]],
    ],
    cadence: [[[0, 4], [4, 12]]],
  },
  // Thistledown at night: an ocarina far off, mostly resting.
  ocarina: {
    lo: 64, hi: 79, centre: 71,
    rhythms: [[[0, 16]], [], [[0, 8], [8, 8]], [], [[4, 12]]],
    cadence: [[[0, 16]]],
  },
};
