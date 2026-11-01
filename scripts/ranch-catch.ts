// Thistledown: how often a thumb catches a wild downy of each kind, on the
// real sim. A scripted thumb walks (or runs) in on a wild downy at its home,
// holds Pull once it is in reach, and keeps the crosshair on it the way a
// thumb would: it sees the downy a little late (lag), corrects part of the
// error each frame (gain) and wobbles (noise). A careful thumb sees it sooner,
// corrects more and wobbles less, and runs at a thistle; a careless one walks.
// A try succeeds if the downy comes into the jar before it gets away.
//
// The third playtest's thumb (180 ms of lag, 55% of the error corrected every
// 40 ms, about 6 px of wobble) caught 8 of 8 in 2 to 6 s; each kind now has its
// own way of getting away (see CATCH in sim.ts).
//   npx tsx scripts/ranch-catch.ts [tries per kind]
import { pathToFileURL } from 'node:url';
import type { DownyKind } from '../src/games/ranch/defs';
import { rng } from '../src/games/ranch/noise';
import { Sim, type Aim, type Controls } from '../src/games/ranch/sim';
import { POND, RIDGE_TOP, VENTS } from '../src/games/ranch/world';

export interface Thumb {
  name: string;
  /** Seconds late it sees where the downy is. */
  lag: number;
  /** Share of the aim error corrected every 40 ms. */
  gain: number;
  /** Wobble each frame, radians (uniform, plus or minus half). */
  noise: number;
  /** Runs in (rather than walks) while out of reach. */
  run: boolean;
}

/** The third playtest's scripted thumb: 180 ms of lag, 55% a tick, 6 px of wobble at 0.0062 rad a pixel; it walks. */
export const CARELESS: Thumb = { name: 'careless', lag: 0.18, gain: 0.55, noise: 6 * 0.0062, run: false };
/** A careful thumb: sees it in 70 ms, corrects 80% a tick, wobbles 1.5 px; runs at a thistle. */
export const CAREFUL: Thumb = { name: 'careful', lag: 0.07, gain: 0.8, noise: 1.5 * 0.0062, run: true };

const DT = 1 / 30;

/** Where each kind lives, and the way you come at it from (a brook from the land side, so the pond is behind it). */
function home(kind: DownyKind): { x: number; z: number; fromX: number; fromZ: number } {
  if (kind === 'clover') return { x: -16, z: -9, fromX: 0, fromZ: 1 };
  if (kind === 'ember') return { x: VENTS[0][0] + 3, z: VENTS[0][1] + 4, fromX: 1, fromZ: 0 };
  if (kind === 'brook') {
    const x = POND.x - 14;
    const z = POND.z + 10;
    const l = Math.hypot(x - POND.x, z - POND.z);
    return { x, z, fromX: (x - POND.x) / l, fromZ: (z - POND.z) / l };
  }
  return { x: RIDGE_TOP.x, z: RIDGE_TOP.z, fromX: 1, fromZ: 0.3 };
}

export interface Try {
  caught: boolean;
  escaped: boolean;
  secs: number;
  /** Closest you came, m. */
  closest: number;
}

/** One try at a wild downy of a kind with a thumb, starting `start` m off (a thistle further: you come at it). */
export function tryCatch(kind: DownyKind, thumb: Thumb, seed: number, start = kind === 'thistle' ? 16 : 6.5): Try {
  const realRandom = Math.random;
  Math.random = rng(seed);
  try {
    const sim = new Sim(null);
    const s = sim.s;
    sim.wild = false;
    s.downies = [];
    s.items = [];
    s.hour = kind === 'thistle' ? 18.6 : 10;
    s.gates.ridge = s.gates.hollow = true;
    sim.phys.gates = { ...s.gates };
    const h = home(kind);
    const d = sim.spawn(kind, h.x, h.z, false);
    d.hunger = 0.2;
    const fl = Math.hypot(h.fromX, h.fromZ);
    const p = s.player;
    p.x = h.x + (h.fromX / fl) * start;
    p.z = h.z + (h.fromZ / fl) * start;
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
    const hist: { x: number; y: number; z: number }[] = [];
    const lagN = Math.round(thumb.lag / DT);
    const g = 1 - Math.pow(1 - thumb.gain, DT / 0.04);
    let caught = false;
    let escaped = false;
    let closest = 1e9;
    let t = 0;
    const kept0 = () => s.slots.reduce((a, q) => a + (q.t === kind ? q.n : 0), 0);
    for (; t < 14 && !caught && !escaped; t += DT) {
      hist.push({ x: d.x, y: d.y, z: d.z });
      const seen = hist[Math.max(0, hist.length - 1 - lagN)];
      const want = dir(seen.x, seen.y + 0.25, seen.z);
      let ey = want.yaw - yaw;
      while (ey > Math.PI) ey -= Math.PI * 2;
      while (ey < -Math.PI) ey += Math.PI * 2;
      yaw += ey * g + (Math.random() - 0.5) * thumb.noise;
      pitch += (want.pitch - pitch) * g + (Math.random() - 0.5) * thumb.noise;
      p.yaw = yaw;
      p.pitch = pitch;
      const dist = Math.hypot(d.x - p.x, d.z - p.z);
      closest = Math.min(closest, dist);
      // Walk (or run) in while out of comfortable reach; hold Pull once in reach.
      const c: Controls = { moveX: 0, moveZ: dist > 5.6 ? 1 : 0, sprint: thumb.run && dist > 5.6, jump: false, jumpPressed: false, draw: dist < 7.3, puff: false, puffPressed: false };
      const cp = Math.cos(pitch);
      const ax = -Math.sin(yaw) * cp;
      const ay = Math.sin(pitch);
      const az = -Math.cos(yaw) * cp;
      const ex = p.x;
      const eyY = p.y + 1.6;
      const ez = p.z;
      const aim: Aim = { ex, ey: eyY, ez, dx: ax, dy: ay, dz: az, mx: ex + ax * 0.6 + 0.15, my: eyY - 0.2, mz: ez + az * 0.6 };
      sim.update(DT, c, aim);
      for (const e of sim.events) if (e.t === 'escape') escaped = true;
      sim.events.length = 0;
      if (kept0() > 0) caught = true;
      else if (d.gone) escaped = true;
    }
    return { caught, escaped, secs: t, closest };
  } finally {
    Math.random = realRandom;
  }
}

/** Share of tries caught, for a kind and a thumb. */
export function catchRate(kind: DownyKind, thumb: Thumb, tries: number, seed0 = 1): { rate: number; secs: number; escaped: number } {
  let n = 0;
  let secs = 0;
  let esc = 0;
  for (let k = 0; k < tries; k++) {
    const r = tryCatch(kind, thumb, seed0 + k * 7919);
    if (r.caught) {
      n++;
      secs += r.secs;
    }
    if (r.escaped) esc++;
  }
  return { rate: n / tries, secs: n ? secs / n : 0, escaped: esc / tries };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const tries = Number(process.argv[2]) || 60;
  console.log(`Thistledown catches: ${tries} tries per kind and thumb, from 6.5 m (a thistle from 16 m, at dusk).`);
  console.log(`   careless: ${CARELESS.lag * 1000} ms lag, ${CARELESS.gain * 100}% a tick, ${(CARELESS.noise / 0.0062).toFixed(1)} px wobble, walks`);
  console.log(`   careful:  ${CAREFUL.lag * 1000} ms lag, ${CAREFUL.gain * 100}% a tick, ${(CAREFUL.noise / 0.0062).toFixed(1)} px wobble, runs at a thistle\n`);
  console.log('   kind      careless  (secs, got away)   careful  (secs, got away)   gap');
  for (const kind of ['clover', 'ember', 'brook', 'thistle'] as DownyKind[]) {
    const a = catchRate(kind, CARELESS, tries);
    const b = catchRate(kind, CAREFUL, tries);
    const pct = (v: number) => `${Math.round(v * 100)}%`.padStart(4);
    console.log(`   ${kind.padEnd(8)}  ${pct(a.rate)}      (${a.secs.toFixed(1)} s, ${pct(a.escaped)})      ${pct(b.rate)}     (${b.secs.toFixed(1)} s, ${pct(b.escaped)})      ${Math.round((b.rate - a.rate) * 100)} pts`);
  }
}
