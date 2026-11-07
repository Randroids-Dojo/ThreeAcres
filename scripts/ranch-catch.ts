// Thistledown: how often a thumb catches a wild downy of each kind, on the
// real sim. A scripted thumb plays the way the fourth playtest's real-touch
// chase did: it starts 12 m off (16 m from a thistle, at dusk), from any side
// that is dry land, with the valley's wild food lying about (the berries by
// the brooks, the roots by the embers), walks in with the stick until it is
// 5.5 m off (again once it is out of Pull's reach: past 7 m; round 8, it was
// 7.6 m, and a pull back that edged a downy to 7.1 m left the thumb pressing
// at nothing), and holds Pull while it is within 7.6 m. The
// view moves the way a look finger does, once every 40 ms: it sees the downy
// a little late (lag), moves part of the way to it (gain, at most 60 px a
// move) and wobbles (plus or minus so many px). The sim runs at 60 frames a
// second, as the game does. A careful thumb sees sooner, moves truer and
// wobbles less, and runs at a thistle; a careless one walks. As in real play
// a downy that gets away can be chased again: a try succeeds if the downy is
// in the jar within 20 s (14 s before round 9 made each fight two to five
// beats long; a brook that slips into the pond is gone for good).
//
// The third playtest's harness (standing 6.5 m off, the view moved every
// frame, no food about, a getaway the end of a try) said a careless thumb
// caught embers 46% of the time; the fourth playtest's real-touch thumb
// caught 4 of 4, chasing again after a getaway, and in 3 of 4 careful tries
// at a brook Pull drew dewberries instead. This one plays like that (and
// scripts/ranch-catch-real.mjs plays the same thumbs with real touch, with
// three faults of the playtest's chase put right).
//
// Round 11 adds two thumbs (TWO, TWO_IDLE, TWO_SLOW): the right thumb on Pull or looking, never both, 180 ms between; once
// the tug is on it stays on Pull, and the view holds on the downy by itself. The three-finger thumbs now move the view
// as the game's look does and tell the sim so (`Controls.look`), which takes over from the hold.
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
   * Reading the tug (round 8, the duel): it lets go of Pull a reaction after the downy puffs up (the tell), and
   * pulls again a reaction after its pull back stops: each reaction drawn evenly from this range, in seconds (the
   * eighth playtest's thumbs: a good one 200 to 350 ms, a slow one 450 to 650). null: never reads it (holds on).
   */
  react: [number, number] | null;
  /**
   * Round 9, fake puffs: the share of them it takes for a real tell and lets go on (the gold ring is the sign to read;
   * a fake one only shivers, the ring pale). It presses again a reaction after it lets go, having seen it was fake.
   */
  fooled: number;
  /**
   * Round 11, two thumbs (the eleventh playtest: "with two thumbs I'd guess about 4"): the right thumb is on Pull or
   * looking, never both, `travel` seconds to move between. It looks until the crosshair marks the downy, moves to Pull
   * and stays there while the tug is on (the view holds on the downy by itself); it goes back to looking only once the
   * tug is over (a slip, a getaway) or a press found nothing. The left thumb walks (`stick`), or (false) stays idle once
   * a tug is on. Not set: three fingers, a look finger that moves all through the fight.
   */
  two?: { travel: number; stick: boolean };
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
/**
 * Round 8: reading the tug goes through the same loop as a look move: the ring shows the tell a frame after the sim,
 * the page is read every 40 ms or so, the lift waits for the next read, and the game takes it the frame after. The
 * real-touch harness (and the playtest's driver) carry that on top of the thumb's own reaction, about 75 ms in all;
 * without it this harness caught a slow thumb's embers and brooks far more often than real touch (70% and 55%
 * against 7 and 3 of 16).
 */
export const TUG_LAG = 0.075;
/** The fourth playtest's careless thumb: 180 ms of lag (and the loop's), 55% a move, 6 px of wobble either way; it walks; it reads the tug slowly (450 to 650 ms, the eighth playtest's slow thumb). */
export const CARELESS: Thumb = { name: 'careless', lag: 0.18 + LOOP_LAG, gain: 0.55, noise: 6 * SENS, run: false, react: [0.45, 0.65], fooled: 0.6 };
/** A careful thumb: sees it in 70 ms (and the loop's), moves 80% of the way, wobbles 1.5 px; runs at a thistle; reads the tug in 200 to 350 ms (the eighth playtest's good thumb). */
export const CAREFUL: Thumb = { name: 'careful', lag: 0.07 + LOOP_LAG, gain: 0.8, noise: 1.5 * SENS, run: true, react: [0.2, 0.35], fooled: 0.2 };
/** A thumb that never reads the tug: holds Pull all the way (the seventh playtest's way, for the control). */
export const HOLDER: Thumb = { ...CAREFUL, name: 'holds on', react: null };
/** Round 11: 180 ms to move the right thumb between looking and Pull (the playtest's). */
export const THUMB_TRAVEL = 0.18;
/** Round 11, two thumbs: the good thumb's eyes and reactions (200 to 350 ms), the right thumb on Pull, the left on the stick. */
export const TWO: Thumb = { ...CAREFUL, name: 'two thumbs', two: { travel: THUMB_TRAVEL, stick: true } };
/** The same, the left thumb idle once a tug is on. */
export const TWO_IDLE: Thumb = { ...CAREFUL, name: 'two, idle', two: { travel: THUMB_TRAVEL, stick: false } };
/** Two thumbs, the slow reader (450 to 650 ms, the careless thumb's aim while it looks). */
export const TWO_SLOW: Thumb = { ...CARELESS, name: 'two, slow', two: { travel: THUMB_TRAVEL, stick: true } };

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
  /** Round 9: fake puffs it made, and how many the thumb let go on. */
  feints: number;
  fooled: number;
  /** Round 11: how fast the view turned by itself while no look moved it (rad/s, the fastest), and the most it changed that turn in a frame. */
  holdFast: number;
  holdJerk: number;
  /**
   * Backlog, round 12 (three of the tester's four "It got away." came before any tell): getaways that came before the
   * fight showed a tell, a pull back or a fake puff, and why each was (the escape event's reason).
   */
  early: number;
  earlyWhy: string[];
}

/**
 * One try at a wild downy of a kind with a thumb, starting `start` m off from a dry side picked by the seed.
 * rare: the board's rare one instead, lured (it has just eaten the food you blew near it, so it lets you come
 * in: the fight is what is measured) or not (it hears you coming and bolts).
 */
export function tryCatch(kind: DownyKind, thumb: Thumb, seed: number, start = kind === 'thistle' ? 16 : 12, rare: '' | 'lured' | 'wary' = '', group = false): Try {
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
    // (Backlog, round 12: with its group about, as the valley has them, two more of its kind a metre or two off. The
    // harness had the one alone, and another hopping nearer the crosshair took the pull from it: a getaway with no tell.)
    if (group) {
      for (const [ox, oz] of [
        [1.6, 0.8],
        [-1.2, 1.4],
      ]) {
        const e = sim.spawn(kind, h.x + ox, h.z + oz, false);
        e.hunger = 0.2;
      }
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
    const start0 = dir(d.x, d.y + 0.25, d.z);
    p.yaw = start0.yaw + (Math.random() - 0.5) * 0.04;
    p.pitch = start0.pitch;
    // Round 11, two thumbs: where the right thumb is, when it gets there, and when it pressed.
    const two = thumb.two;
    let right: 'look' | 'pull' = 'look';
    let there = 0;
    let lastYaw = p.yaw;
    let lastPitch = p.pitch;
    let lastTurn = 0;
    let holdFast = 0;
    let holdJerk = 0;
    const eyeAim = (): Aim => {
      const cp = Math.cos(p.pitch);
      const ax = -Math.sin(p.yaw) * cp;
      const ay = Math.sin(p.pitch);
      const az = -Math.cos(p.yaw) * cp;
      const eyY = p.y + 1.6;
      return { ex: p.x, ey: eyY, ez: p.z, dx: ax, dy: ay, dz: az, mx: p.x + ax * 0.6 + 0.15, my: eyY - 0.2, mz: p.z + az * 0.6 };
    };
    const hist: { t: number; x: number; y: number; z: number }[] = [];
    let caught = false;
    let escapes = 0;
    let gone = false;
    let closest = 1e9;
    let near = 1e9;
    let t = 0;
    let tick = 0;
    let walking = true;
    // Reading the tug: let go a reaction after it puffs up (the tell), press again a reaction after its pull back stops.
    const react = () => (thumb.react ? TUG_LAG + thumb.react[0] + Math.random() * (thumb.react[1] - thumb.react[0]) : 0);
    let wasBack = false;
    let wasTell = false;
    let wasFeint = false;
    let feints = 0;
    let fooledN = 0;
    let letGo = false;
    let releaseAt = -1;
    let pressAt = -1;
    let backs = 0;
    let slips = 0;
    let fought = -1;
    let caughtAt = 0;
    let blockedT = 0;
    let sideT = 0;
    let lookedLast = false;
    let pressed = -1;
    let told = false;
    let early = 0;
    const earlyWhy: string[] = [];
    const side = seed % 2 ? 1 : -1;
    const aboard = () => s.slots.reduce((a, q) => a + (q.t && !isDowny(q.t) ? q.n : 0), 0);
    const kept0 = () => s.slots.reduce((a, q) => a + (q.t === kind ? q.n : 0), 0);
    // (Round 9: a fight is two to five beats now, 4 to 10 s, so a try runs to 20 s; it was 14.)
    const limit = 20;
    for (; t < limit && !caught && !gone; t += DT) {
      hist.push({ t, x: d.x, y: d.y, z: d.z });
      let looked = 0;
      const looking = !two || (right === 'look' && t >= there);
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
        let ey = want.yaw - p.yaw;
        while (ey > Math.PI) ey -= Math.PI * 2;
        while (ey < -Math.PI) ey += Math.PI * 2;
        const my = Math.max(-60 * SENS, Math.min(60 * SENS, ey * thumb.gain + (Math.random() - 0.5) * 2 * thumb.noise));
        const mp = Math.max(-40 * SENS, Math.min(40 * SENS, (want.pitch - p.pitch) * thumb.gain + (Math.random() - 0.5) * 2 * thumb.noise));
        // (A look finger moves the view as the game's look does, and tells the sim it did: it takes over from the view hold.)
        if (looking) {
          p.yaw += my;
          p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch + mp));
          looked = Math.abs(my) + Math.abs(mp);
        }
      }
      // The view's turn by itself, frame to frame (what the sim's hold did last frame), while no look moved it.
      if (!looked && !lookedLast) {
        const turn = Math.hypot(p.yaw - lastYaw, p.pitch - lastPitch) / DT;
        holdFast = Math.max(holdFast, turn);
        holdJerk = Math.max(holdJerk, Math.abs(turn - lastTurn));
        lastTurn = turn;
      } else lastTurn = 0;
      lookedLast = looked > 0;
      const dist = Math.hypot(d.x - p.x, d.z - p.z);
      closest = Math.min(closest, dist);
      if (d.drawn <= 0) near = Math.min(near, dist);
      // Walk (or run) in until 5.5 m off (a lured rare one lets you nearer: 4 m), again once out of reach (past 7 m); hold Pull within 7.6 m.
      if (walking && dist < (rare === 'lured' ? 4 : 5.5)) walking = false;
      else if (!walking && dist > 7) walking = true;
      const back = d.back > 0;
      const tell = d.tell > 0;
      const feint = d.feint > 0;
      if (thumb.react) {
        // The tell (or a pull back that came with none): let go a reaction later.
        if ((tell && !wasTell) || (back && !wasBack && !wasTell && releaseAt < 0 && !letGo)) {
          releaseAt = t + react();
          pressAt = -1;
        }
        // A fake puff: taken for a tell now and then (its share), let go on, and pulled again a reaction after.
        if (feint && !wasFeint) {
          feints++;
          if (!letGo && releaseAt < 0 && Math.random() < thumb.fooled) {
            fooledN++;
            releaseAt = t + react();
            pressAt = releaseAt + react();
          }
        }
        if (!back && wasBack) {
          releaseAt = -1;
          if (letGo) pressAt = t + react();
        }
        if (releaseAt >= 0 && t >= releaseAt) {
          letGo = true;
          releaseAt = -1;
        }
        // (A pull back that comes while it is let go on a fake puff: it waits for that to stop, as ever.)
        if (letGo && back && pressAt >= 0) pressAt = -1;
        if (pressAt >= 0 && t >= pressAt) {
          letGo = false;
          pressAt = -1;
        }
      }
      wasBack = back;
      wasTell = tell;
      wasFeint = feint;
      if (fought < 0 && d.strain > 0) fought = t;
      // Two thumbs: from looking to Pull once the crosshair marks it, back once the tug is over or a press found nothing.
      if (two) {
        if (right === 'look' && t >= there && dist < 7.4 && d.noPull <= 0 && sim.aimedDowny(eyeAim()) === d) {
          right = 'pull';
          there = t + two.travel;
          pressed = there;
        } else if (right === 'pull' && t >= there && d.strain <= 0 && d.drawn <= 0 && t - pressed > 0.35) {
          right = 'look';
          there = t + two.travel;
          letGo = false;
          releaseAt = pressAt = -1;
        }
        if (d.strain > 0 || d.drawn > 0) pressed = t;
      }
      // Walking into a rock or the crag, a thumb steps aside round it (the harness used to walk on into it).
      if (walking && Math.hypot(p.vx, p.vz) < 1) blockedT += DT;
      else blockedT = 0;
      if (blockedT > 0.3 && sideT <= 0) sideT = 1.2;
      sideT -= DT;
      // (Two thumbs, the left one idle: no walking once a tug is on.)
      const walk = walking && !(two && !two.stick && d.strain > 0);
      const onPull = !two || (right === 'pull' && t >= there);
      const c: Controls = { moveX: sideT > 0 && walk ? side : 0, moveZ: walk ? 0.73 : 0, sprint: thumb.run && kind === 'thistle' && walk, jump: false, jumpPressed: false, draw: (dist < 7.6 || d.strain > 0) && !letGo && onPull, puff: false, puffPressed: false, look: looked };
      lastYaw = p.yaw;
      lastPitch = p.pitch;
      const onLine0 = d.strain > 0;
      if (!onLine0) told = false;
      sim.update(DT, c, eyeAim());
      if (d.tell > 0 || d.back > 0 || d.feint > 0) told = true;
      // (Its own getaway, not one of its group's: its fight ended and the bellows leaves it be for GOT_AWAY.)
      const mine = onLine0 && d.strain <= 0 && d.noPull > 1.2;
      for (const e of sim.events) {
        if (e.t === 'escape' && mine) {
          escapes++;
          letGo = false;
          releaseAt = pressAt = -1;
          if (!told) {
            early++;
            earlyWhy.push(e.why);
          }
        }
        if (e.t === 'pullback') backs++;
        if (e.t === 'slip') {
          slips++;
          letGo = false;
          releaseAt = pressAt = -1;
        }
      }
      sim.events.length = 0;
      // (With its group about, only this one in the jar counts.)
      if (kept0() > 0 && (!group || (d.gone && !d.dive))) {
        caught = true;
        caughtAt = t;
      } else if (d.gone) gone = true;
    }
    return { caught, escaped: escapes > 0, escapes, secs: t, closest, food: aboard(), near, first: caught && escapes === 0 && slips === 0, fight: caught && fought >= 0 ? caughtAt - fought : 0, backs, slips, feints, fooled: fooledN, holdFast, holdJerk, early, earlyWhy };
  } finally {
    Math.random = realRandom;
  }
}

/** Share of tries caught, for a kind and a thumb. */
export function catchRate(kind: DownyKind, thumb: Thumb, tries: number, seed0 = 1, rare: '' | 'lured' | 'wary' = ''): { rate: number; first: number; secs: number; fight: number; escaped: number; slipped: number; backs: number; food: number; under: number; fights: number[]; firstBacks: number; feints: number; fooled: number; holdFast: number; holdJerk: number } {
  let n = 0;
  let first = 0;
  let secs = 0;
  let fight = 0;
  let esc = 0;
  let slipped = 0;
  let backs = 0;
  let food = 0;
  let under = 0;
  const fights: number[] = [];
  let firstBacks = 0;
  let feints = 0;
  let fooled = 0;
  let holdFast = 0;
  let holdJerk = 0;
  for (let k = 0; k < tries; k++) {
    const r = rare ? tryCatch(kind, thumb, seed0 + k * 7919, rare === 'lured' ? 8 : 12, rare) : tryCatch(kind, thumb, seed0 + k * 7919);
    if (r.caught) {
      n++;
      secs += r.secs;
    }
    if (r.first) {
      first++;
      fight += r.fight;
      fights.push(r.fight);
      firstBacks += r.backs;
    }
    feints += r.feints;
    fooled += r.fooled;
    holdFast = Math.max(holdFast, r.holdFast);
    holdJerk = Math.max(holdJerk, r.holdJerk);
    if (r.escaped) esc++;
    if (r.slips > 0) slipped++;
    backs += r.backs;
    if (r.food > 0) food++;
    if (r.near < 1) under++;
  }
  fights.sort((a, b) => a - b);
  return { rate: n / tries, first: first / tries, secs: n ? secs / n : 0, fight: first ? fight / first : 0, escaped: esc / tries, slipped: slipped / tries, backs: backs / tries, food: food / tries, under: under / tries, fights, firstBacks: first ? firstBacks / first : 0, feints: feints / tries, fooled: fooled / tries, holdFast, holdJerk };
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
  console.log(`   reading the tug: each lets go of Pull a reaction after the downy puffs up, and pulls again a reaction after its pull back stops (careless ${CARELESS.react!.map((v) => v * 1000).join(' to ')} ms, careful ${CAREFUL.react!.map((v) => v * 1000).join(' to ')} ms)`);
  console.log(`   first: caught on the first try (no slip, no getaway); in 20 s: chased again after a slip or a getaway; fight: first tug to the jar on a first try\n`);
  const pct = (v: number) => `${Math.round(v * 100)}%`.padStart(4);
  const row = (name: string, a: ReturnType<typeof catchRate>, b: ReturnType<typeof catchRate>, c: ReturnType<typeof catchRate>) =>
    console.log(`   ${name.padEnd(13)} ${pct(a.first)} ${pct(a.rate)}  ${a.fight.toFixed(1)} s  ${a.backs.toFixed(1)} backs ${pct(a.slipped)} slipped ${pct(a.escaped)} away   |  ${pct(b.first)} ${pct(b.rate)}  ${b.fight.toFixed(1)} s  ${b.backs.toFixed(1)} backs ${pct(b.slipped)} slipped ${pct(b.escaped)} away   |  ${pct(c.first)}`);
  console.log('   kind          careless: first, in 20 s, fight, pull backs, slipped, got away  |  careful: the same                                 |  holding on (control): first');
  for (const kind of ['clover', 'ember', 'brook', 'thistle'] as DownyKind[]) row(kind, catchRate(kind, CARELESS, tries), catchRate(kind, CAREFUL, tries), catchRate(kind, HOLDER, Math.max(10, tries >> 1)));
  // The board's rare one (round 6: a hunt). Lured (it has just eaten the food you blew near it), from 8 m: it
  // fights harder than its kind, and pulls back most often and fastest. Not lured, walking in from 12 m: it hears you and bolts.
  for (const kind of ['clover', 'ember', 'brook'] as DownyKind[]) row(`rare ${kind}`, catchRate(kind, CARELESS, tries, 1, 'lured'), catchRate(kind, CAREFUL, tries, 1, 'lured'), catchRate(kind, HOLDER, Math.max(10, tries >> 1), 1, 'lured'));
  for (const kind of ['clover', 'ember', 'brook'] as DownyKind[]) console.log(`   rare ${kind} not lured, careful, walking in from 12 m: ${pct(catchRate(kind, CAREFUL, Math.max(10, tries >> 2), 1, 'wary').rate)}`);
  // Round 9: how long a fight lasts, by kind (first tug to the jar on a first try), and its beats: the ninth playtest's
  // 18 plain catches each pulled back exactly once in 3.2 to 4.1 s. Target: clover 2 to 3 s, the others 4 to 7, rares 7 to 10.
  console.log('\n   fight lengths on a first try (round 9), the good thumb then the slow one: middle and the middle half, s; pull backs a fight; fake puffs a try and the share let go on');
  const q = (a: number[], f: number) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * f))] : 0);
  for (const [name, kind, rare] of [['clover', 'clover', ''], ['ember', 'ember', ''], ['brook', 'brook', ''], ['thistle', 'thistle', ''], ['rare clover', 'clover', 'lured'], ['rare ember', 'ember', 'lured'], ['rare brook', 'brook', 'lured']] as [string, DownyKind, '' | 'lured'][]) {
    const g = catchRate(kind, CAREFUL, tries, 1, rare);
    const sl = catchRate(kind, CARELESS, tries, 1, rare);
    const f = (r: ReturnType<typeof catchRate>) => `${q(r.fights, 0.5).toFixed(1)} s (${q(r.fights, 0.25).toFixed(1)} to ${q(r.fights, 0.75).toFixed(1)}), ${r.firstBacks.toFixed(1)} backs, ${r.feints.toFixed(2)} fakes, ${r.feints ? Math.round((r.fooled / r.feints) * 100) : 0}% let go`;
    console.log(`   ${name.padEnd(13)} good ${f(g)}   |   slow ${f(sl)}`);
  }
  // Round 11: two thumbs. The right thumb on Pull (180 ms from looking), the view holding on the downy by itself; the
  // left thumb on the stick, or idle once a tug is on. Targets for the good thumb, in 20 s: clover 90%+, ember and thistle
  // 80%+, brook 75%+, rares 60%+, its fights within about a fifth of three fingers'. The slow thumb's brooks and thistles
  // about 40 to 60%.
  console.log(`\n   two thumbs (right thumb on Pull, ${THUMB_TRAVEL * 1000} ms from looking; view held by itself): first try, in 20 s, the middle fight on a first try against three fingers', slipped, got away`);
  console.log('   kind          good, left thumb on the stick                         |  good, left thumb idle    |  slow (450 to 650 ms)');
  const mid = (a: number[]) => q(a, 0.5);
  let fast = 0;
  let jerk = 0;
  for (const [name, kind, rare] of [['clover', 'clover', ''], ['ember', 'ember', ''], ['brook', 'brook', ''], ['thistle', 'thistle', ''], ['rare clover', 'clover', 'lured'], ['rare ember', 'ember', 'lured'], ['rare brook', 'brook', 'lured']] as [string, DownyKind, '' | 'lured'][]) {
    const three = catchRate(kind, CAREFUL, tries, 1, rare);
    const g = catchRate(kind, TWO, tries, 1, rare);
    const i = catchRate(kind, TWO_IDLE, tries, 1, rare);
    const sl = catchRate(kind, TWO_SLOW, tries, 1, rare);
    fast = Math.max(fast, g.holdFast, i.holdFast);
    jerk = Math.max(jerk, g.holdJerk, i.holdJerk);
    console.log(`   ${name.padEnd(13)} ${pct(g.first)} ${pct(g.rate)}  fight ${mid(g.fights).toFixed(1)} s (three fingers ${mid(three.fights).toFixed(1)})  ${pct(g.slipped)} slipped ${pct(g.escaped)} away  |  ${pct(i.first)} ${pct(i.rate)}  ${mid(i.fights).toFixed(1)} s      |  ${pct(sl.first)} ${pct(sl.rate)}  ${mid(sl.fights).toFixed(1)} s  ${pct(sl.slipped)} slipped ${pct(sl.escaped)} away`);
  }
  console.log(`   the view's own turn, good thumb, all kinds: fastest ${fast.toFixed(2)} rad/s, the most it changed in a frame ${jerk.toFixed(2)} rad/s`);
  // Backlog, round 12: three of the tester's four "It got away." came before any tell. Getaways before the fight showed a
  // tell, a pull back or a fake puff, for the two-thumb players, with the downy alone and with its group of three about
  // (as the valley has them), and why (the note says it). Target for the good reader: none.
  console.log('\n   getaways before any tell (round 12), two thumbs: of all getaways, and why; alone, then with its group of three about');
  for (const th of [TWO, TWO_IDLE, TWO_SLOW]) {
    for (const group of [false, true]) {
      const parts: string[] = [];
      for (const [name, kind, rare] of [['clover', 'clover', ''], ['ember', 'ember', ''], ['brook', 'brook', ''], ['thistle', 'thistle', ''], ['rare clover', 'clover', 'lured'], ['rare ember', 'ember', 'lured'], ['rare brook', 'brook', 'lured']] as [string, DownyKind, '' | 'lured'][]) {
        let all = 0;
        let early = 0;
        const why: Record<string, number> = {};
        for (let k = 0; k < tries; k++) {
          const r = tryCatch(kind, th, 1 + k * 7919, rare ? 8 : kind === 'thistle' ? 16 : 12, rare, group);
          all += r.escapes;
          early += r.early;
          for (const w of r.earlyWhy) why[w] = (why[w] ?? 0) + 1;
        }
        parts.push(`${name} ${early} of ${all}${early ? ` (${Object.entries(why).map(([w, n]) => `${w} ${n}`).join(', ')})` : ''}`);
      }
      console.log(`   ${th.name.padEnd(11)} ${group ? 'group' : 'alone'}  ${parts.join('; ')}`);
    }
  }
  // Closing on a clover that has seen you, walking against running (taught now: the running lesson in the meadow).
  for (const run of [false, true]) {
    const rows = Array.from({ length: 12 }, (_, k) => chaseGap(run, 31 + k * 7919));
    const gaps = rows.map((q) => q.gap).sort((x, y) => x - y);
    const reached = rows.filter((q) => q.reach >= 0).map((q) => q.reach).sort((x, y) => x - y);
    console.log(`   closing on a clover that has seen you, ${run ? 'running' : 'walking'} from 10 m: within Pull's reach in ${reached.length} of 12 (middle ${reached.length ? reached[Math.floor(reached.length / 2)].toFixed(1) : '-'} s), ${gaps[Math.floor(gaps.length / 2)].toFixed(1)} m off after 20 s (middle)`);
  }
}
