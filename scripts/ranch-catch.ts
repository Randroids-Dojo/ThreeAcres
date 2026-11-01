// Thistledown: how often a thumb catches a wild downy of each kind, on the
// real sim. A scripted thumb plays the way the fourth playtest's real-touch
// chase did: it starts 12 m off (16 m from a thistle, at dusk), from any side
// that is dry land, with the valley's wild food lying about (the berries by
// the brooks, the roots by the embers), walks in with the stick until it is
// 5.5 m off (again past 7.6 m), and holds Pull while it is within 7.6 m. The
// view moves the way a look finger does, once every 40 ms: it sees the downy
// a little late (lag), moves part of the way to it (gain, at most 60 px a
// move) and wobbles (plus or minus so many px). The sim runs at 60 frames a
// second, as the game does. A careful thumb sees sooner, moves truer and
// wobbles less, and runs at a thistle; a careless one walks. As in real play
// a downy that gets away can be chased again: a try succeeds if the downy is
// in the jar within 14 s (a brook that slips into the pond is gone for good).
//
// The third playtest's harness (standing 6.5 m off, the view moved every
// frame, no food about, a getaway the end of a try) said a careless thumb
// caught embers 46% of the time; the fourth playtest's real-touch thumb
// caught 4 of 4, chasing again after a getaway, and in 3 of 4 careful tries
// at a brook Pull drew dewberries instead. This one plays like that (and
// scripts/ranch-catch-real.mjs plays the same thumbs with real touch, with
// three faults of the playtest's chase put right).
//   npx tsx scripts/ranch-catch.ts [tries per kind]
import { pathToFileURL } from 'node:url';
import type { DownyKind } from '../src/games/ranch/defs';
import { isDowny } from '../src/games/ranch/defs';
import { rng } from '../src/games/ranch/noise';
import { Sim, type Aim, type Controls } from '../src/games/ranch/sim';
import { MAXX, MAXZ, MINX, MINZ, POND, RIDGE_TOP, VENTS, waterAt, zoneAt } from '../src/games/ranch/world';

export interface Thumb {
  name: string;
  /** Seconds late it sees where the downy is. */
  lag: number;
  /** Share of the aim error a look move makes up (one move every 40 ms). */
  gain: number;
  /** Wobble on each move, radians either way (uniform). */
  noise: number;
  /** Runs in (rather than walks) while out of reach. */
  run: boolean;
}

/** Radians of view per px of a look drag on touch (the game's). */
const SENS = 0.0062;
/** The fourth playtest's careless thumb: 180 ms of lag, 55% a move, 6 px of wobble either way; it walks. */
export const CARELESS: Thumb = { name: 'careless', lag: 0.18, gain: 0.55, noise: 6 * SENS, run: false };
/** A careful thumb: sees it in 70 ms, moves 80% of the way, wobbles 1.5 px; runs at a thistle. */
export const CAREFUL: Thumb = { name: 'careful', lag: 0.07, gain: 0.8, noise: 1.5 * SENS, run: true };

/** The game's frame, and how often the look finger moves. */
const DT = 1 / 60;
const TICK = 0.04;

/** Where each kind lives (its groups' homes, as in the sim); each try picks one by its seed. */
const HOMES: Record<DownyKind, [number, number][]> = {
  clover: [
    [-16, -9],
    [14, -4],
    [-8, -44],
    [20, -32],
  ],
  ember: [
    [VENTS[0][0] + 3, VENTS[0][1] + 4],
    [VENTS[1][0] - 2, VENTS[1][1] + 3],
    [VENTS[3][0] - 3, VENTS[3][1]],
  ],
  brook: [
    [POND.x - 14, POND.z + 10],
    [POND.x + 8, POND.z + 15],
    [POND.x - 4, POND.z - 16],
  ],
  thistle: [[RIDGE_TOP.x, RIDGE_TOP.z]],
};
function home(kind: DownyKind, seed: number): { x: number; z: number } {
  const h = HOMES[kind][seed % HOMES[kind].length];
  return { x: h[0], z: h[1] };
}

export interface Try {
  caught: boolean;
  /** It got away at least once. */
  escaped: boolean;
  /** Times it got away. */
  escapes: number;
  secs: number;
  /** Closest you came, m. */
  closest: number;
  /** Food or fluff the pull took in during the try. */
  food: number;
  /** Closest the downy came to you while it was out of the pull (m): a glide through the view is under 1. */
  near: number;
}

/** One try at a wild downy of a kind with a thumb, starting `start` m off from a dry side picked by the seed. */
export function tryCatch(kind: DownyKind, thumb: Thumb, seed: number, start = kind === 'thistle' ? 16 : 12): Try {
  const realRandom = Math.random;
  Math.random = rng(seed);
  try {
    const sim = new Sim(null);
    const s = sim.s;
    sim.wild = false;
    // The valley's wild food stays where it grows; the other downies go.
    s.downies = [];
    s.hour = kind === 'thistle' ? 18.6 : 10;
    s.gates.ridge = s.gates.hollow = true;
    sim.phys.gates = { ...s.gates };
    const h = home(kind, seed);
    const d = sim.spawn(kind, h.x, h.z, false);
    d.hunger = 0.2;
    const p = s.player;
    // A side to come from: dry land in the downy's own zone, inside the valley.
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2;
      const x = h.x + Math.cos(a) * start;
      const z = h.z + Math.sin(a) * start;
      const ok = x > MINX + 4 && x < MAXX - 4 && z > MINZ + 4 && z < MAXZ - 4 && waterAt(x, z) < sim.phys.floor(x, z) && (zoneAt(x, z) === zoneAt(h.x, h.z) || k > 30);
      p.x = x;
      p.z = z;
      if (ok) break;
    }
    p.y = sim.phys.floor(p.x, p.z);
    const dir = (tx: number, ty: number, tz: number) => {
      const dx = tx - p.x;
      const dy = ty - (p.y + 1.6);
      const dz = tz - p.z;
      return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
    };
    // The thumb starts on it, with a little error.
    let { yaw, pitch } = dir(d.x, d.y + 0.25, d.z);
    yaw += (Math.random() - 0.5) * 0.04;
    const hist: { t: number; x: number; y: number; z: number }[] = [];
    let caught = false;
    let escapes = 0;
    let gone = false;
    let closest = 1e9;
    let near = 1e9;
    let t = 0;
    let tick = 0;
    let walking = true;
    const aboard = () => s.slots.reduce((a, q) => a + (q.t && !isDowny(q.t) ? q.n : 0), 0);
    const kept0 = () => s.slots.reduce((a, q) => a + (q.t === kind ? q.n : 0), 0);
    for (; t < 14 && !caught && !gone; t += DT) {
      hist.push({ t, x: d.x, y: d.y, z: d.z });
      if (t >= tick) {
        tick += TICK;
        // What the thumb sees is `lag` seconds old.
        let seen = hist[0];
        for (let i = hist.length - 1; i >= 0; i--) {
          if (hist[i].t <= t - thumb.lag) {
            seen = hist[i];
            break;
          }
        }
        const want = dir(seen.x, seen.y + 0.25, seen.z);
        let ey = want.yaw - yaw;
        while (ey > Math.PI) ey -= Math.PI * 2;
        while (ey < -Math.PI) ey += Math.PI * 2;
        const my = Math.max(-60 * SENS, Math.min(60 * SENS, ey * thumb.gain + (Math.random() - 0.5) * 2 * thumb.noise));
        const mp = Math.max(-40 * SENS, Math.min(40 * SENS, (want.pitch - pitch) * thumb.gain + (Math.random() - 0.5) * 2 * thumb.noise));
        yaw += my;
        pitch += mp;
      }
      p.yaw = yaw;
      p.pitch = pitch;
      const dist = Math.hypot(d.x - p.x, d.z - p.z);
      closest = Math.min(closest, dist);
      if (d.drawn <= 0) near = Math.min(near, dist);
      // Walk (or run) in until 5.5 m off, again past 7.6 m; hold Pull within 7.6 m.
      if (walking && dist < 5.5) walking = false;
      else if (!walking && dist > 7.6) walking = true;
      const c: Controls = { moveX: 0, moveZ: walking ? 0.73 : 0, sprint: thumb.run && kind === 'thistle' && walking, jump: false, jumpPressed: false, draw: dist < 7.6, puff: false, puffPressed: false };
      const cp = Math.cos(pitch);
      const ax = -Math.sin(yaw) * cp;
      const ay = Math.sin(pitch);
      const az = -Math.cos(yaw) * cp;
      const ex = p.x;
      const eyY = p.y + 1.6;
      const ez = p.z;
      const aim: Aim = { ex, ey: eyY, ez, dx: ax, dy: ay, dz: az, mx: ex + ax * 0.6 + 0.15, my: eyY - 0.2, mz: ez + az * 0.6 };
      sim.update(DT, c, aim);
      for (const e of sim.events) if (e.t === 'escape') escapes++;
      sim.events.length = 0;
      if (kept0() > 0) caught = true;
      else if (d.gone) gone = true;
    }
    return { caught, escaped: escapes > 0, escapes, secs: t, closest, food: aboard(), near };
  } finally {
    Math.random = realRandom;
  }
}

/** Share of tries caught, for a kind and a thumb. */
export function catchRate(kind: DownyKind, thumb: Thumb, tries: number, seed0 = 1): { rate: number; secs: number; escaped: number; food: number; under: number } {
  let n = 0;
  let secs = 0;
  let esc = 0;
  let food = 0;
  let under = 0;
  for (let k = 0; k < tries; k++) {
    const r = tryCatch(kind, thumb, seed0 + k * 7919);
    if (r.caught) {
      n++;
      secs += r.secs;
    }
    if (r.escaped) esc++;
    if (r.food > 0) food++;
    if (r.near < 1) under++;
  }
  return { rate: n / tries, secs: n ? secs / n : 0, escaped: esc / tries, food: food / tries, under: under / tries };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const tries = Number(process.argv[2]) || 80;
  console.log(`Thistledown catches: ${tries} tries per kind and thumb, from 12 m on any dry side (a thistle from 16 m, at dusk), walking in to 5.5 m.`);
  console.log(`   careless: ${CARELESS.lag * 1000} ms lag, ${Math.round(CARELESS.gain * 100)}% a move, ${(CARELESS.noise / SENS).toFixed(1)} px wobble, walks`);
  console.log(`   careful:  ${CAREFUL.lag * 1000} ms lag, ${Math.round(CAREFUL.gain * 100)}% a move, ${(CAREFUL.noise / SENS).toFixed(1)} px wobble, runs at a thistle\n`);
  console.log('   kind      careless  (secs, got away, food drawn)   careful  (secs, got away, food drawn)   gap    glided under 1 m');
  for (const kind of ['clover', 'ember', 'brook', 'thistle'] as DownyKind[]) {
    const a = catchRate(kind, CARELESS, tries);
    const b = catchRate(kind, CAREFUL, tries);
    const pct = (v: number) => `${Math.round(v * 100)}%`.padStart(4);
    console.log(`   ${kind.padEnd(8)}  ${pct(a.rate)}      (${a.secs.toFixed(1)} s, ${pct(a.escaped)}, ${pct(a.food)})       ${pct(b.rate)}     (${b.secs.toFixed(1)} s, ${pct(b.escaped)}, ${pct(b.food)})       ${String(Math.round((b.rate - a.rate) * 100)).padStart(3)} pts  ${pct((a.under + b.under) / 2)}`);
  }
}
