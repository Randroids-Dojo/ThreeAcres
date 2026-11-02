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
import { RARE_WARY, Sim, type Aim, type Controls } from '../src/games/ranch/sim';
import { CRAG, MAXX, MAXZ, MINX, MINZ, POND, RIDGE_TOP, VENTS, waterAt, zoneAt } from '../src/games/ranch/world';

/** How near a point comes to a segment. */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

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
  /**
   * Reading the tug: it lets go of Pull this long after a pull back shows on the ring (and presses again this
   * long after it stops): its lag, plus a wandering eye's spread (exponential, this mean in seconds).
   */
  spread: number;
}

/** Radians of view per px of a look drag on touch (the game's). */
const SENS = 0.0062;
/**
 * The real game's own loop adds about 100 ms between what is on screen and a look move landing (the touch
 * event, a frame, the page): without it this harness ran far kinder than real touch (round 5, the same build:
 * careless clover 100% here against 50% with real touch). With it, 80 tries a kind here against 20 with real
 * touch: careless clover 53% (50), ember 55% (35), brook 53% (45), thistle 19% (40); careful 100 (100), 86
 * (90), 95 (85), 89 (90).
 */
export const LOOP_LAG = 0.1;
/** The fourth playtest's careless thumb: 180 ms of lag (and the loop's), 55% a move, 6 px of wobble either way; it walks. */
export const CARELESS: Thumb = { name: 'careless', lag: 0.18 + LOOP_LAG, gain: 0.55, noise: 6 * SENS, run: false, spread: 0.15 };
/** A careful thumb: sees it in 70 ms (and the loop's), moves 80% of the way, wobbles 1.5 px; runs at a thistle. */
export const CAREFUL: Thumb = { name: 'careful', lag: 0.07 + LOOP_LAG, gain: 0.8, noise: 1.5 * SENS, run: true, spread: 0.03 };
/** A thumb that never reads the tug: holds Pull all the way (the seventh playtest's way, for the control). */
export const HOLDER: Thumb = { ...CAREFUL, name: 'holds on', spread: -1 };

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
  /** Caught on the first try: no slip and no getaway before it came in. */
  first: boolean;
  /** Seconds from the first tug to the jar (0 if not caught). */
  fight: number;
  /** Times it pulled back, and slipped free. */
  backs: number;
  slips: number;
}

/**
 * One try at a wild downy of a kind with a thumb, starting `start` m off from a dry side picked by the seed.
 * rare: the board's rare one instead, lured (it has just eaten the food you blew near it, so it lets you come
 * in: the fight is what is measured) or not (it hears you coming and bolts).
 */
export function tryCatch(kind: DownyKind, thumb: Thumb, seed: number, start = kind === 'thistle' ? 16 : 12, rare: '' | 'lured' | 'wary' = ''): Try {
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
    if (rare) {
      d.rare = true;
      if (rare === 'lured') d.calm = RARE_WARY.calm;
    }
    const p = s.player;
    // A side to come from: dry land in the downy's own zone, inside the valley.
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2;
      const x = h.x + Math.cos(a) * start;
      const z = h.z + Math.sin(a) * start;
      // (Not with the crag between: the scripted thumb walks straight, and a real one would go round it.)
      const ok = x > MINX + 4 && x < MAXX - 4 && z > MINZ + 4 && z < MAXZ - 4 && waterAt(x, z) < sim.phys.floor(x, z) && (zoneAt(x, z) === zoneAt(h.x, h.z) || k > 30) && (segDist(CRAG.x, CRAG.z, x, z, h.x, h.z) > 5 || k > 34);
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
    // Reading the tug: let go a reaction after the ring shows a pull back, press again a reaction after it stops.
    const react = () => thumb.lag + -Math.log(1 - Math.random() * 0.999) * thumb.spread;
    let wasBack = false;
    let letGo = false;
    let releaseAt = -1;
    let pressAt = -1;
    let backs = 0;
    let slips = 0;
    let fought = -1;
    let caughtAt = 0;
    let blockedT = 0;
    let sideT = 0;
    const side = seed % 2 ? 1 : -1;
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
      // Walk (or run) in until 5.5 m off (a lured rare one lets you nearer: 4 m), again past 7.6 m; hold Pull within 7.6 m.
      if (walking && dist < (rare === 'lured' ? 4 : 5.5)) walking = false;
      else if (!walking && dist > 7.6) walking = true;
      const back = d.back > 0;
      if (thumb.spread >= 0) {
        if (back && !wasBack) {
          releaseAt = t + react();
          pressAt = -1;
        }
        if (!back && wasBack) {
          releaseAt = -1;
          if (letGo) pressAt = t + react();
        }
        if (releaseAt >= 0 && t >= releaseAt) {
          letGo = true;
          releaseAt = -1;
        }
        if (pressAt >= 0 && t >= pressAt) {
          letGo = false;
          pressAt = -1;
        }
      }
      wasBack = back;
      if (fought < 0 && d.strain > 0) fought = t;
      // Walking into a rock or the crag, a thumb steps aside round it (the harness used to walk on into it).
      if (walking && Math.hypot(p.vx, p.vz) < 1) blockedT += DT;
      else blockedT = 0;
      if (blockedT > 0.3 && sideT <= 0) sideT = 1.2;
      sideT -= DT;
      const c: Controls = { moveX: sideT > 0 ? side : 0, moveZ: walking ? 0.73 : 0, sprint: thumb.run && kind === 'thistle' && walking, jump: false, jumpPressed: false, draw: dist < 7.6 && !letGo, puff: false, puffPressed: false };
      const cp = Math.cos(pitch);
      const ax = -Math.sin(yaw) * cp;
      const ay = Math.sin(pitch);
      const az = -Math.cos(yaw) * cp;
      const ex = p.x;
      const eyY = p.y + 1.6;
      const ez = p.z;
      const aim: Aim = { ex, ey: eyY, ez, dx: ax, dy: ay, dz: az, mx: ex + ax * 0.6 + 0.15, my: eyY - 0.2, mz: ez + az * 0.6 };
      sim.update(DT, c, aim);
      for (const e of sim.events) {
        if (e.t === 'escape') escapes++;
        if (e.t === 'pullback') backs++;
        if (e.t === 'slip') {
          slips++;
          letGo = false;
          releaseAt = pressAt = -1;
        }
      }
      sim.events.length = 0;
      if (kept0() > 0) {
        caught = true;
        caughtAt = t;
      } else if (d.gone) gone = true;
    }
    return { caught, escaped: escapes > 0, escapes, secs: t, closest, food: aboard(), near, first: caught && escapes === 0 && slips === 0, fight: caught && fought >= 0 ? caughtAt - fought : 0, backs, slips };
  } finally {
    Math.random = realRandom;
  }
}

/** Share of tries caught, for a kind and a thumb. */
export function catchRate(kind: DownyKind, thumb: Thumb, tries: number, seed0 = 1, rare: '' | 'lured' | 'wary' = ''): { rate: number; first: number; secs: number; fight: number; escaped: number; slipped: number; backs: number; food: number; under: number } {
  let n = 0;
  let first = 0;
  let secs = 0;
  let fight = 0;
  let esc = 0;
  let slipped = 0;
  let backs = 0;
  let food = 0;
  let under = 0;
  for (let k = 0; k < tries; k++) {
    const r = rare ? tryCatch(kind, thumb, seed0 + k * 7919, rare === 'lured' ? 8 : 12, rare) : tryCatch(kind, thumb, seed0 + k * 7919);
    if (r.caught) {
      n++;
      secs += r.secs;
    }
    if (r.first) {
      first++;
      fight += r.fight;
    }
    if (r.escaped) esc++;
    if (r.slips > 0) slipped++;
    backs += r.backs;
    if (r.food > 0) food++;
    if (r.near < 1) under++;
  }
  return { rate: n / tries, first: first / tries, secs: n ? secs / n : 0, fight: first ? fight / first : 0, escaped: esc / tries, slipped: slipped / tries, backs: backs / tries, food: food / tries, under: under / tries };
}

/**
 * Closing on a clover that has seen you, with no pull: walking or running straight at it from 10 m for 20 s.
 * The gap at the end and the first time you were within Pull's reach (the fifth playtest's walker was still 8 m
 * off after 20 s; running, it caught one in 4.4 s).
 */
export function chaseGap(run: boolean, seed: number): { gap: number; reach: number } {
  const realRandom = Math.random;
  Math.random = rng(seed);
  try {
    const sim = new Sim(null);
    const s = sim.s;
    sim.wild = false;
    s.downies = [];
    s.hour = 10;
    const h = home('clover', seed);
    const d = sim.spawn('clover', h.x, h.z, false);
    const p = s.player;
    const a = Math.random() * Math.PI * 2;
    p.x = h.x + Math.cos(a) * 10;
    p.z = h.z + Math.sin(a) * 10;
    p.y = sim.phys.floor(p.x, p.z);
    let reach = -1;
    let t = 0;
    for (; t < 20; t += DT) {
      const dx = d.x - p.x;
      const dz = d.z - p.z;
      p.yaw = Math.atan2(-dx, -dz);
      const dist = Math.hypot(dx, dz);
      if (reach < 0 && dist < 6.5) reach = t;
      const aim: Aim = { ex: p.x, ey: p.y + 1.6, ez: p.z, dx: -Math.sin(p.yaw), dy: 0, dz: -Math.cos(p.yaw), mx: p.x, my: p.y + 1.4, mz: p.z };
      sim.update(DT, { moveX: 0, moveZ: dist > 3 ? 1 : 0, sprint: run, jump: false, jumpPressed: false, draw: false, puff: false, puffPressed: false }, aim);
      sim.events.length = 0;
    }
    return { gap: Math.hypot(d.x - p.x, d.z - p.z), reach };
  } finally {
    Math.random = realRandom;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const tries = Number(process.argv[2]) || 80;
  console.log(`Thistledown catches: ${tries} tries per kind and thumb, from 12 m on any dry side (a thistle from 16 m, at dusk), walking in to 5.5 m.`);
  console.log(`   careless: ${Math.round(CARELESS.lag * 1000)} ms lag (the loop's ${LOOP_LAG * 1000} in it), ${Math.round(CARELESS.gain * 100)}% a move, ${(CARELESS.noise / SENS).toFixed(1)} px wobble, walks`);
  console.log(`   careful:  ${Math.round(CAREFUL.lag * 1000)} ms lag, ${Math.round(CAREFUL.gain * 100)}% a move, ${(CAREFUL.noise / SENS).toFixed(1)} px wobble, runs at a thistle\n`);
  console.log(`   reading the tug: each lets go of Pull its lag plus a spread after a pull back shows (careless mean ${CARELESS.spread * 1000} ms, careful ${CAREFUL.spread * 1000} ms), and presses again the same way after it stops`);
  console.log(`   first: caught on the first try (no slip, no getaway); in 14 s: chased again after a slip or a getaway; fight: first tug to the jar on a first try\n`);
  const pct = (v: number) => `${Math.round(v * 100)}%`.padStart(4);
  const row = (name: string, a: ReturnType<typeof catchRate>, b: ReturnType<typeof catchRate>, c: ReturnType<typeof catchRate>) =>
    console.log(`   ${name.padEnd(13)} ${pct(a.first)} ${pct(a.rate)}  ${a.fight.toFixed(1)} s  ${a.backs.toFixed(1)} backs ${pct(a.slipped)} slipped ${pct(a.escaped)} away   |  ${pct(b.first)} ${pct(b.rate)}  ${b.fight.toFixed(1)} s  ${b.backs.toFixed(1)} backs ${pct(b.slipped)} slipped ${pct(b.escaped)} away   |  ${pct(c.first)}`);
  console.log('   kind          careless: first, in 14 s, fight, pull backs, slipped, got away  |  careful: the same                                 |  holding on (control): first');
  for (const kind of ['clover', 'ember', 'brook', 'thistle'] as DownyKind[]) row(kind, catchRate(kind, CARELESS, tries), catchRate(kind, CAREFUL, tries), catchRate(kind, HOLDER, Math.max(10, tries >> 1)));
  // The board's rare one (round 6: a hunt). Lured (it has just eaten the food you blew near it), from 8 m: it
  // fights harder than its kind, and pulls back most often and fastest. Not lured, walking in from 12 m: it hears you and bolts.
  for (const kind of ['clover', 'ember', 'brook'] as DownyKind[]) row(`rare ${kind}`, catchRate(kind, CARELESS, tries, 1, 'lured'), catchRate(kind, CAREFUL, tries, 1, 'lured'), catchRate(kind, HOLDER, Math.max(10, tries >> 1), 1, 'lured'));
  for (const kind of ['clover', 'ember', 'brook'] as DownyKind[]) console.log(`   rare ${kind} not lured, careful, walking in from 12 m: ${pct(catchRate(kind, CAREFUL, Math.max(10, tries >> 2), 1, 'wary').rate)}`);
  // Closing on a clover that has seen you, walking against running (taught now: the running lesson in the meadow).
  for (const run of [false, true]) {
    const rows = Array.from({ length: 12 }, (_, k) => chaseGap(run, 31 + k * 7919));
    const gaps = rows.map((q) => q.gap).sort((x, y) => x - y);
    const reached = rows.filter((q) => q.reach >= 0).map((q) => q.reach).sort((x, y) => x - y);
    console.log(`   closing on a clover that has seen you, ${run ? 'running' : 'walking'} from 10 m: within Pull's reach in ${reached.length} of 12 (middle ${reached.length ? reached[Math.floor(reached.length / 2)].toFixed(1) : '-'} s), ${gaps[Math.floor(gaps.length / 2)].toFixed(1)} m off after 20 s (middle)`);
  }
}
