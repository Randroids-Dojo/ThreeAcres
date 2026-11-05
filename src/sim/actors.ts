// Moving people around: the farmer under walk control, paths for point
// control and the hands, actions in progress, footsteps, and the hands' own
// choice of chores.

import { canAfford, crowAt, homestead, perform, resolve, resolveBuild, sowing, type Resolved } from './actions';
import { ACTION_SECONDS, BUILD_COST, HAND_SLOWER, HAND_SPEED, HOP_SECONDS, WALK_SPEED } from './constants';
import { CROPS } from './crops';
import { BUNK, PROPS, propAt } from './map';
import { pathNextTo, pathTo } from './path';
import { needsWater } from './soil';
import { idx, inMap, isField, owned, walkable } from './world';
import type { Actor, CropId, Facing, Job, SimEvent, Tap, ToolId, Verb, WorldState } from './types';

const RADIUS = 0.28;
const STEP_EVERY = 0.55;

export function farmer(s: WorldState): Actor {
  return s.actors[0];
}

export function hands(s: WorldState): Actor[] {
  return s.actors.filter((a) => a.role === 'hand' && !a.away);
}

export function tileOf(a: Actor): { x: number; y: number } {
  return { x: Math.floor(a.x), y: Math.floor(a.y) };
}

export function facingVec(f: Facing): { x: number; y: number } {
  return f === 'n' ? { x: 0, y: -1 } : f === 's' ? { x: 0, y: 1 } : f === 'e' ? { x: 1, y: 0 } : { x: -1, y: 0 };
}

/** The tile in front of the farmer, which walk control acts on. */
export function facingTile(a: Actor): { x: number; y: number } {
  const t = tileOf(a);
  const v = facingVec(a.facing);
  return { x: t.x + v.x, y: t.y + v.y };
}

/**
 * The tile acting works on under walk control: the one in front when acting
 * there would do something, else the nearest useful tile in reach (the
 * farmer's own and the eight around it), ties going to the one most in front.
 * Walking along a row while holding act then works each plot in turn, and
 * the well or the board answer from any side. `useful` says what counts;
 * the sim asks the tool, the director also counts the notice board. Null
 * when nothing in reach is useful. `held` (a repeat from a held act key)
 * leaves out what is behind the farmer: walking with Space held never sows
 * a plot it has passed.
 */
export function snapAim(a: Actor, useful: (x: number, y: number) => boolean, held = false): { x: number; y: number } | null {
  const front = facingTile(a);
  if (inMap(front.x, front.y) && useful(front.x, front.y)) return front;
  const t = tileOf(a);
  const v = facingVec(a.facing);
  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = t.x + dx;
      const y = t.y + dy;
      if (!inMap(x, y) || !useful(x, y)) continue;
      const cx = x + 0.5 - a.x;
      const cy = y + 0.5 - a.y;
      const d = Math.hypot(cx, cy);
      const ahead = d > 1e-6 ? (cx * v.x + cy * v.y) / d : 1;
      // A held act key works what it walks past at its side, never what it has left behind.
      if (held && ahead < -0.05) continue;
      const score = d - 0.35 * ahead;
      if (score < bestScore - 1e-9) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best;
}

function faceTowards(a: Actor, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  a.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n';
}

function turnAngle(a: Actor, target: number, dt: number): void {
  let d = target - a.angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  a.angle += d * Math.min(1, dt * 14);
}

function blockedAt(s: WorldState, x: number, y: number): boolean {
  const x0 = Math.floor(x - RADIUS);
  const x1 = Math.floor(x + RADIUS);
  const y0 = Math.floor(y - RADIUS);
  const y1 = Math.floor(y + RADIUS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (!walkable(s, tx, ty)) return true;
  return false;
}

function stepSound(s: WorldState, a: Actor, dist: number, ev: SimEvent[]): void {
  const before = Math.floor(a.walked / STEP_EVERY);
  a.walked += dist;
  if (Math.floor(a.walked / STEP_EVERY) !== before) {
    const t = tileOf(a);
    const i = idx(Math.max(0, Math.min(s.W - 1, t.x)), Math.max(0, Math.min(s.H - 1, t.y)));
    ev.push({ type: 'step', by: a.id, x: t.x, y: t.y, ground: s.tiles[i] });
  }
}

/** Jobs quick enough to do on the move: walking with the act button held does not stop at each plot. */
const ON_THE_MOVE = new Set<Verb>(['harvest', 'water', 'plant', 'tend', 'clear', 'scare']);
/** How fast the farmer walks through a quick job, as a share of a walk. */
const MOVE_WHILE_WORKING = 0.6;

/** Walk control: push the farmer by the stick, sliding along walls. */
export function walkFarmer(s: WorldState, mx: number, my: number, dt: number, ev: SimEvent[]): void {
  const a = farmer(s);
  const len = Math.hypot(mx, my);
  // Sunup keeps walking, a little slower, through a quick job: holding the act button along a row is one smooth walk.
  const working = !!a.task && homestead(s) && ON_THE_MOVE.has(a.task.verb);
  // Round 9: walking with the act key held waits for the work beside it to be done before it walks past (a zigzag
  // watering pass left 4 of 11 dry: two rows at once outran the can).
  if ((a.task && !working) || len < 0.15 || (working && a.task!.held && workBeside(s, a, mx, my))) {
    a.moving = false;
    return;
  }
  if (a.path.length) a.path = [];
  if (a.aim) a.aim = null;
  const k = Math.min(1, len) * (working ? MOVE_WHILE_WORKING : 1);
  const vx = (mx / len) * WALK_SPEED * k * dt;
  const vy = (my / len) * WALK_SPEED * k * dt;
  const ox = a.x;
  const oy = a.y;
  if (!blockedAt(s, a.x + vx, a.y)) a.x += vx;
  if (!blockedAt(s, a.x, a.y + vy)) a.y += vy;
  const moved = Math.hypot(a.x - ox, a.y - oy);
  a.moving = moved > 1e-4;
  // While a job plays out the farmer keeps facing it.
  if (!working) {
    faceTowards(a, mx, my);
    turnAngle(a, Math.atan2(my, mx), dt);
  }
  if (moved > 0) stepSound(s, a, moved, ev);
}

/**
 * Round 9: is there free work for the tool in hand (water, a harvest, bugs)
 * on a plot in reach beside or behind the farmer, as it walks (mx, my), other
 * than the one being worked? A held act key does it before walking past.
 */
function workBeside(s: WorldState, a: Actor, mx: number, my: number): boolean {
  const t = tileOf(a);
  const len = Math.hypot(mx, my) || 1;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = t.x + dx;
    const y = t.y + dy;
    if (!inMap(x, y) || (a.task && a.task.x === x && a.task.y === y)) continue;
    const cx = x + 0.5 - a.x;
    const cy = y + 0.5 - a.y;
    // Only what the walk is about to leave behind: beside the farmer, or just behind.
    if ((cx * mx + cy * my) / len > 0.35) continue;
    const r = resolve(s, s.tool, x, y);
    if (r.verb && r.ok && BESIDE_JOBS.has(r.verb)) return true;
  }
  return false;
}
const BESIDE_JOBS = new Set<Verb>(['water', 'harvest', 'tend', 'clear']);

/** Follow the current path. In turns the steps are quick hops. */
function followPath(s: WorldState, a: Actor, dt: number, ev: SimEvent[]): void {
  if (!a.path.length) {
    a.hop = 0;
    if (!a.task) a.moving = false;
    return;
  }
  const turns = s.rules.clock === 'turns';
  let speed = turns ? 1 / HOP_SECONDS : a.role === 'farmer' ? WALK_SPEED : HAND_SPEED;
  if (s.rules.clock === 'flow' && a.role === 'hand') speed *= Math.max(1, s.speed);
  let budget = speed * dt;
  while (budget > 0 && a.path.length) {
    const next = a.path[0];
    const tx = next.x + 0.5;
    const ty = next.y + 0.5;
    const dx = tx - a.x;
    const dy = ty - a.y;
    const d = Math.hypot(dx, dy);
    if (d > 1e-6) {
      faceTowards(a, dx, dy);
      turnAngle(a, Math.atan2(dy, dx), dt);
    }
    if (d <= budget) {
      a.x = tx;
      a.y = ty;
      budget -= d;
      a.path.shift();
      stepSound(s, a, d, ev);
      a.hop = 0;
    } else {
      a.x += (dx / d) * budget;
      a.y += (dy / d) * budget;
      stepSound(s, a, budget, ev);
      a.hop = turns ? Math.max(0, Math.min(1, 1 - (d - budget) / Math.max(1, Math.hypot(Math.round(dx), Math.round(dy))))) : 0;
      budget = 0;
    }
  }
  a.moving = true;
}

function actionSeconds(s: WorldState, a: Actor, verb: Verb): number {
  let t = ACTION_SECONDS[verb] * (a.role === 'hand' ? HAND_SLOWER : 1);
  if (s.rules.clock === 'flow' && a.role === 'hand') t /= Math.max(1, s.speed);
  if (s.rules.clock === 'turns') t = Math.min(t, 0.3);
  return t;
}

/** Start doing `r` at (x, y) now: the effect lands at once, the animation plays out. */
export function startAction(s: WorldState, a: Actor, r: Resolved, x: number, y: number, ev: SimEvent[]): boolean {
  const cx = x + 0.5 - a.x;
  const cy = y + 0.5 - a.y;
  if (Math.abs(cx) > 0.01 || Math.abs(cy) > 0.01) {
    faceTowards(a, cx, cy);
    a.angle = Math.atan2(cy, cx);
  }
  if (!perform(s, a, r, x, y, ev)) return false;
  a.task = { verb: r.verb!, x, y, t: 0, dur: actionSeconds(s, a, r.verb!) };
  a.moving = false;
  // Round 10: after a build with the Build tool, the tool in hand before it comes back (the tenth playtest's next tap,
  // on a plot a crow had just stripped, built a second scarecrow with no question). Taps already waiting keep the tool
  // they were tapped with.
  if (r.verb === 'build' && a.role === 'farmer' && homestead(s) && s.tool === 'build') {
    const back = s.toolBefore && s.toolBefore !== 'build' && s.toolBefore !== 'smart' ? s.toolBefore : 'hands';
    s.tool = back;
    s.kitTool = back;
  }
  return true;
}

function tickTask(a: Actor, dt: number): void {
  if (!a.task) return;
  a.task.t += dt;
  if (a.task.t >= a.task.dur) a.task = null;
}

// ---------------------------------------------------------------- jobs

function releaseJob(s: WorldState, a: Actor): void {
  if (a.job !== null) {
    const j = s.jobs.find((o) => o.id === a.job);
    if (j && j.claimedBy === a.id) j.claimedBy = null;
  }
  a.job = null;
}

export function dropJobsOf(s: WorldState, a: Actor): void {
  releaseJob(s, a);
  a.aim = null;
  a.path = [];
}

/** Turn a job back into a resolved action with its own tool choice. */
function jobAction(s: WorldState, j: Job): Resolved {
  const now = resolve(s, 'smart', j.x, j.y);
  switch (j.verb) {
    case 'plant': {
      const kind = j.crop ?? s.seed;
      const p = s.plots[idx(j.x, j.y)];
      if (!p.tilled || p.crop || s.builds.some((b) => b.x === j.x && b.y === j.y)) return { verb: null, ok: false, reason: '' };
      if (s.coins < CROPS[kind].seed) return { verb: 'plant', ok: false, reason: `${CROPS[kind].name} seeds cost ${CROPS[kind].seed}` };
      return { verb: 'plant', ok: true, reason: '', crop: kind };
    }
    case 'build': {
      const kind = j.build ?? s.buildKind;
      const p = s.plots[idx(j.x, j.y)];
      if (p.crop || s.builds.some((b) => b.x === j.x && b.y === j.y)) return { verb: null, ok: false, reason: '' };
      if (s.coins < BUILD_COST[kind]) return { verb: 'build', ok: false, reason: `A ${kind} costs ${BUILD_COST[kind]}` };
      return { verb: 'build', ok: true, reason: '', build: kind };
    }
    case 'water': {
      const p = s.plots[idx(j.x, j.y)];
      return p.tilled ? { verb: 'water', ok: true, reason: '' } : { verb: null, ok: false, reason: '' };
    }
    case 'till': {
      const p = s.plots[idx(j.x, j.y)];
      return p.tilled ? { verb: null, ok: false, reason: '' } : { verb: 'till', ok: true, reason: '' };
    }
    case 'clear': {
      const r = resolve(s, 'hoe', j.x, j.y);
      return r.verb === 'clear' ? r : { verb: null, ok: false, reason: '' };
    }
    default:
      return now.verb === j.verb ? now : { verb: null, ok: false, reason: '' };
  }
}

function nearestJob(s: WorldState, a: Actor): Job | null {
  let best: Job | null = null;
  let bd = Infinity;
  for (const j of s.jobs) {
    if (j.claimedBy !== null) continue;
    const d = Math.abs(j.x + 0.5 - a.x) + Math.abs(j.y + 0.5 - a.y);
    if (d < bd) {
      bd = d;
      best = j;
    }
  }
  return best;
}

function goTo(s: WorldState, a: Actor, x: number, y: number): boolean {
  const t = tileOf(a);
  const p = pathNextTo(s, t.x, t.y, x, y);
  if (!p) return false;
  a.path = p;
  return true;
}

/** Work through painted jobs: claim the nearest, walk to it, do it. */
function workJobs(s: WorldState, a: Actor, ev: SimEvent[]): void {
  if (a.task) return;
  if (a.job !== null) {
    const j = s.jobs.find((o) => o.id === a.job);
    if (!j) {
      a.job = null;
      return;
    }
    if (a.path.length) return;
    const t = tileOf(a);
    if (Math.max(Math.abs(t.x - j.x), Math.abs(t.y - j.y)) > 1) {
      if (!goTo(s, a, j.x, j.y)) s.jobs = s.jobs.filter((o) => o !== j);
      return;
    }
    s.jobs = s.jobs.filter((o) => o !== j);
    a.job = null;
    const r = jobAction(s, j);
    if (r.verb && r.ok) startAction(s, a, r, j.x, j.y, ev);
    else if (r.reason && a.role === 'farmer') ev.push({ type: 'deny', x: j.x, y: j.y, reason: r.reason });
    return;
  }
  const j = nearestJob(s, a);
  if (!j) return;
  j.claimedBy = a.id;
  a.job = j.id;
  const t = tileOf(a);
  if (Math.max(Math.abs(t.x - j.x), Math.abs(t.y - j.y)) > 1 && !goTo(s, a, j.x, j.y)) {
    s.jobs = s.jobs.filter((o) => o !== j);
    a.job = null;
  }
}

// ---------------------------------------------------------------- hands

interface Chore {
  verb: Verb;
  x: number;
  y: number;
  rank: number;
}

/** The most pressing chore nobody else has taken, nearest first within a rank. */
export function findChore(s: WorldState, from: { x: number; y: number } | null, taken: Set<number>): Chore | null {
  let best: Chore | null = null;
  let bestScore = Infinity;
  const consider = (verb: Verb, x: number, y: number, rank: number) => {
    if (taken.has(idx(x, y))) return;
    const d = from ? Math.abs(x + 0.5 - from.x) + Math.abs(y + 0.5 - from.y) : 0;
    const score = rank * 100 + d;
    if (score < bestScore) {
      bestScore = score;
      best = { verb, x, y, rank };
    }
  };
  for (const c of s.crows) if (c.phase === 'peck' || c.phase === 'in') consider('scare', c.x, c.y, 0);
  for (let y = 0; y < s.H; y++) {
    for (let x = 0; x < s.W; x++) {
      if (!owned(s, x, y)) continue;
      const p = s.plots[idx(x, y)];
      const c = p.crop;
      if (!c) continue;
      if (c.dead) consider('clear', x, y, 4);
      else if (c.stage === 4) consider('harvest', x, y, 1);
      else if (c.bugs > 0) consider('tend', x, y, 2);
      else if (needsWater(s, p)) consider('water', x, y, 3);
    }
  }
  return best;
}

function takenTiles(s: WorldState, except: Actor): Set<number> {
  const out = new Set<number>();
  for (const o of s.actors) {
    if (o === except) continue;
    if (o.aim) out.add(idx(o.aim.x, o.aim.y));
    if (o.task) out.add(idx(o.task.x, o.task.y));
  }
  for (const j of s.jobs) out.add(idx(j.x, j.y));
  return out;
}

function choreAction(s: WorldState, verb: Verb, x: number, y: number): Resolved {
  if (verb === 'scare') return crowAt(s, x, y) ? { verb, ok: true, reason: '' } : { verb: null, ok: false, reason: '' };
  if (verb === 'clear') return resolve(s, 'hoe', x, y);
  if (verb === 'water') {
    const p = s.plots[idx(x, y)];
    return needsWater(s, p) ? { verb, ok: true, reason: '' } : { verb: null, ok: false, reason: '' };
  }
  const r = resolve(s, 'smart', x, y);
  return r.verb === verb ? r : { verb: null, ok: false, reason: '' };
}

/** After a hand harvests a one-shot crop, it puts the same seed back if it can. */
function replant(s: WorldState, a: Actor, kind: string, x: number, y: number, ev: SimEvent[]): void {
  const crop = kind as keyof typeof CROPS;
  const p = s.plots[idx(x, y)];
  if (p.crop || !p.tilled) return;
  if (s.rules.goal === 'almanac' && !s.almanac.unlocked.includes(crop)) return;
  if (s.coins < CROPS[crop].seed) return;
  perform(s, a, { verb: 'plant', ok: true, reason: '', crop }, x, y, ev);
}

/** Do one chore on the spot. Used for turns, where hands work through the night. */
export function choreNow(s: WorldState, a: Actor, ev: SimEvent[]): boolean {
  const c = findChore(s, null, takenTiles(s, a));
  if (!c) return false;
  return doChore(s, a, c.verb, c.x, c.y, ev);
}

function doChore(s: WorldState, a: Actor, verb: Verb, x: number, y: number, ev: SimEvent[]): boolean {
  const r = choreAction(s, verb, x, y);
  if (!r.verb || !r.ok) return false;
  const kind = s.plots[idx(x, y)].crop?.kind;
  if (!perform(s, a, r, x, y, ev)) return false;
  if (verb === 'harvest' && kind) replant(s, a, kind, x, y, ev);
  return true;
}

function handTick(s: WorldState, a: Actor, ev: SimEvent[]): void {
  if (a.task) return;
  // Painted jobs come first, except under turns where the farmer does them.
  if (s.rules.clock !== 'turns' && (a.job !== null || s.jobs.some((j) => j.claimedBy === null))) {
    a.aim = null;
    workJobs(s, a, ev);
    return;
  }
  if (s.rules.clock === 'turns') {
    a.aim = null;
    if (!a.path.length) idleHome(s, a);
    return;
  }
  if (a.aim) {
    if (a.path.length) return;
    const { verb, x, y } = a.aim;
    const t = tileOf(a);
    if (Math.max(Math.abs(t.x - x), Math.abs(t.y - y)) > 1) {
      if (!goTo(s, a, x, y)) a.aim = null;
      return;
    }
    a.aim = null;
    const r = choreAction(s, verb, x, y);
    if (!r.verb || !r.ok) return;
    const kind = s.plots[idx(x, y)].crop?.kind;
    if (startAction(s, a, r, x, y, ev) && verb === 'harvest' && kind) replant(s, a, kind, x, y, ev);
    return;
  }
  const c = findChore(s, a, takenTiles(s, a));
  if (c) {
    a.aim = { verb: c.verb, x: c.x, y: c.y };
    const t = tileOf(a);
    if (Math.max(Math.abs(t.x - c.x), Math.abs(t.y - c.y)) > 1 && !goTo(s, a, c.x, c.y)) a.aim = null;
    return;
  }
  if (!a.path.length) idleHome(s, a);
}

function idleHome(s: WorldState, a: Actor): void {
  const t = tileOf(a);
  if (Math.abs(t.x - BUNK.x) + Math.abs(t.y - BUNK.y) <= 2) return;
  const p = pathTo(s, t.x, t.y, BUNK.x, BUNK.y + 1);
  if (p) a.path = p;
}

// ---------------------------------------------------------------- per step

export function tickActors(s: WorldState, dt: number, ev: SimEvent[]): void {
  const f = farmer(s);
  for (const a of s.actors) {
    if (a.away) continue;
    tickTask(a, dt);
    if (a === f) {
      if (s.rules.control === 'point' && !a.task) workJobs(s, a, ev);
      else if (s.rules.control === 'walk' && !a.task && a.aim && !a.path.length) finishWalkTap(s, a, ev);
      // Sunup: the next tap waiting its turn, once the farmer is free.
      if (s.rules.control === 'walk' && !a.task && !a.aim && !a.path.length && s.taps?.length) doTap(s, a, s.taps.shift()!, ev);
    } else {
      handTick(s, a, ev);
    }
    if (!a.task) followPath(s, a, dt, ev);
  }
}

/**
 * Walk control: a tap on a far tile walks there, then acts if it still makes
 * sense. Sunup's tap does the job it was tapped as, with the tool and seed
 * it was tapped with, whatever is in hand by the time the farmer gets there.
 */
function finishWalkTap(s: WorldState, a: Actor, ev: SimEvent[]): void {
  const aim = a.aim!;
  a.aim = null;
  const t = tileOf(a);
  if (Math.max(Math.abs(t.x - aim.x), Math.abs(t.y - aim.y)) > 1) return;
  // A one-off build from the lesson pointer builds that; anything else is the tapped tool's job.
  const r = aim.build ? resolveBuild(s, aim.build, aim.x, aim.y) : homestead(s) && aim.tool ? tapJob(s, { x: aim.x, y: aim.y, tool: aim.tool, seed: aim.seed }).r : resolve(s, s.tool, aim.x, aim.y);
  if (r.verb && r.ok) startAction(s, a, r, aim.x, aim.y, ev);
}

/** Taps that can wait their turn while the farmer is busy: three fields' worth. One more is refused, and says so. */
export const TAP_QUEUE = 48;

/** Jobs a tap may change tools for: free of coins and never undoing anything. */
const TAP_JOBS = new Set<Verb>(['harvest', 'tend', 'scare', 'clear', 'water']);

/**
 * Sunup: does the plot hold a crop the hands would take away first, so seed
 * can go in after: a ripe crop that is picked once, or a withered one?
 */
function clearsFor(s: WorldState, x: number, y: number, seed: CropId): boolean {
  const c = s.plots[idx(x, y)]?.crop;
  if (!c || !homestead(s) || !sowing(s.day, seed).ok || s.builds.some((b) => b.x === x && b.y === y)) return false;
  return c.dead || (c.stage === 4 && CROPS[c.kind].regrow === 0);
}

/**
 * Sunup: the tool for a tapped plot. The tool in hand when it can do the job
 * there; otherwise, when a free job waits there for the hands or the can (a
 * ripe crop, bugs, a crow, a withered crop, a thirsty one), the tool for it.
 * A crow comes before water. Never seeds or the hoe: a stray tap must not
 * spend coins or turn meadow. Round 8: seeds in hand on a ripe crop that is
 * picked once (or a withered one) stay seeds: the tap picks it, then plants
 * there (the eighth playtest's seed taps on a row not yet harvested became
 * harvest taps, and seven of ten plots stayed bare); and the can on a dry,
 * bugged crop stays the can, which picks the bugs as it waters.
 */
export function tapTool(s: WorldState, inHand: ToolId, x: number, y: number, seed: CropId = s.seed): ToolId {
  const r = resolve(s, inHand, x, y, seed);
  if (!homestead(s)) return inHand;
  if (r.verb === 'water' && inHand !== 'hands' && crowAt(s, x, y)) return 'hands';
  if (r.verb && r.ok) return inHand;
  if (inHand === 'seeds' && clearsFor(s, x, y, seed)) return 'seeds';
  for (const t of ['hands', 'can'] as ToolId[]) {
    if (t === inHand || (t !== 'hands' && !s.learn.includes(t))) continue;
    const q = resolve(s, t, x, y, seed);
    if (q.verb && q.ok && TAP_JOBS.has(q.verb)) return t;
  }
  return inHand;
}

/** Sunup: the wells, nearest first from a point. */
export function wellsFrom(x: number, y: number): { x: number; y: number }[] {
  return PROPS.filter((p) => p.kind === 'well')
    .map((p) => ({ x: p.x, y: p.y }))
    .sort((a, b) => Math.hypot(a.x + 0.5 - x, a.y + 0.5 - y) - Math.hypot(b.x + 0.5 - x, b.y + 0.5 - y));
}

/**
 * Sunup: a tap on the ground beside a well, with nothing to do there, is a
 * tap on the well (it fills the can), even while the can is still full from
 * a watering not yet done: the waterings tapped before it empty it first.
 * Round 8: never a plot of a field (the field well stands among four of
 * them): a tap on a plot is for the plot, whatever the can holds just then.
 */
export function wellTap(s: WorldState, x: number, y: number): { x: number; y: number } | null {
  if (!homestead(s) || isField(s, x, y)) return null;
  const at = propAt(x, y);
  if (at?.kind === 'well') return null;
  const w = wellsFrom(x + 0.5, y + 0.5).find((q) => Math.max(Math.abs(x - q.x), Math.abs(y - q.y)) <= 1);
  if (!w) return null;
  const here = resolve(s, s.tool, x, y);
  if (here.verb && here.ok) return null;
  return resolve(s, s.tool, w.x, w.y).verb === 'refill' ? w : null;
}

/** Is a tile a place to fill the can (a well, or the pond)? */
function refillAt(s: WorldState, x: number, y: number): boolean {
  return inMap(x, y) && (propAt(x, y)?.kind === 'well' || s.tiles[idx(x, y)] === 'water');
}

/** Does a tapped plot hold trouble that will not wait: a crow, or bugs on a living crop? */
export function urgentAt(s: WorldState, x: number, y: number): boolean {
  if (!inMap(x, y)) return false;
  const c = s.plots[idx(x, y)].crop;
  return !!crowAt(s, x, y) || (!!c && !c.dead && c.bugs > 0 && c.stage < 4);
}

/**
 * What a tap does now, with the tool and seed it was tapped with: that
 * tool's job if it still has one there; else the job its plot holds now (a
 * crop that got bugs since, say), never the tool in hand's. Seeds on a plot
 * not yet free pick (or clear) what is there first: `then` is the seeds tap
 * to do next, on the same plot.
 */
function tapJob(s: WorldState, tap: Tap): { r: Resolved; tool: ToolId; then?: Tap } {
  let tool = tap.tool;
  const fits = (t: ToolId) => {
    const q = resolve(s, t, tap.x, tap.y, tap.seed);
    return !!(q.verb && q.ok);
  };
  if (!fits(tool)) tool = tapTool(s, tool, tap.x, tap.y, tap.seed);
  const r = resolve(s, tool, tap.x, tap.y, tap.seed);
  if (tool === 'seeds' && !r.ok && tap.seed && clearsFor(s, tap.x, tap.y, tap.seed)) {
    const h = resolve(s, 'hands', tap.x, tap.y);
    if (h.verb && h.ok) return { r: h, tool: 'hands', then: { ...tap } };
  }
  return { r, tool };
}

/**
 * Sunup: do one tap now: act on it from beside it, or walk there and then
 * act. A tap carrying `build` is the lesson pointer's one-off build: it
 * builds that, once, and leaves the tool in hand alone. Round 8: the job is
 * the one tapped, with the tool and seed it was tapped with (a seed picked
 * while taps waited changed what they planted); the tool in hand is left as
 * the player last chose it. Too tired for the job: one refusal, and the taps
 * still waiting are dropped (the fifth playtest drew two refusals on top of
 * each other).
 */
export function doTap(s: WorldState, a: Actor, tap: Tap, ev: SimEvent[]): void {
  let r: Resolved;
  let then: Tap | undefined;
  let tool = tap.tool;
  if (tap.build) r = resolveBuild(s, tap.build, tap.x, tap.y);
  else if (homestead(s)) ({ r, tool, then } = tapJob(s, tap));
  else r = resolve(s, s.tool, tap.x, tap.y);
  // Round 10: the can ran dry with watering still tapped: the farmer fills it at the nearer well first, then waters
  // there and carries on (the tenth playtest tapped 13 plots with 8 water, and the other 5 were dropped without a word).
  if (homestead(s) && !tap.build && tool === 'can' && r.verb === 'water' && !r.ok && s.water <= 0) {
    const w = wellsFrom(a.x, a.y)[0];
    (s.taps ??= []).unshift(tap);
    ev.push({ type: 'deny', x: tap.x, y: tap.y, reason: 'Can empty. To the well first' });
    doTap(s, a, { x: w.x, y: w.y, tool: 'can' }, ev);
    return;
  }
  if (r.verb && r.ok && homestead(s)) {
    const tired = canAfford(s, r.verb);
    if (tired) {
      ev.push({ type: 'deny', x: tap.x, y: tap.y, reason: tired });
      ev.push({ type: 'tired' });
      s.taps = [];
      return;
    }
  }
  // Seeds on a plot not yet free: the crop there is picked first, and the seed goes in straight after.
  if (then) (s.taps ??= []).unshift(then);
  // A well with the can still full says so at once, rather than walking there for nothing.
  if (!r.ok && r.verb === 'refill' && r.reason) {
    ev.push({ type: 'deny', x: tap.x, y: tap.y, reason: r.reason });
    return;
  }
  const t = tileOf(a);
  if (Math.max(Math.abs(t.x - tap.x), Math.abs(t.y - tap.y)) <= 1) {
    if (r.verb && r.ok) startAction(s, a, r, tap.x, tap.y, ev);
    else if (r.reason) ev.push({ type: 'deny', x: tap.x, y: tap.y, reason: r.reason });
  } else {
    walkTo(s, a, tap.x, tap.y, !!(r.verb && r.ok), r.verb ?? undefined);
    if (a.aim) {
      if (tap.build) a.aim.build = tap.build;
      // The tool for the job found now (the hands, to pick a ripe crop before its plot is sown), and the seed tapped.
      a.aim.tool = tool;
      if (tap.seed) a.aim.seed = tap.seed;
    }
  }
}

/** The job under way as a tap: the one the farmer is walking to. */
function inFlight(a: Actor): Tap | null {
  return a.aim?.tool ? { x: a.aim.x, y: a.aim.y, tool: a.aim.tool, seed: a.aim.seed, build: a.aim.build } : null;
}

/** The same tap: tile, tool, seed and build. */
function sameTap(a: Tap, b: Tap): boolean {
  return a.x === b.x && a.y === b.y && a.tool === b.tool && a.seed === b.seed && a.build === b.build;
}

/**
 * Sunup: a tap while the farmer is busy waits its turn, in the order tapped
 * (up to `TAP_QUEUE`; one more is refused with a word, never dropped
 * silently). Round 8: only a true duplicate is merged: the same tile, tool
 * and seed as the tap just before it (or the walk under way), with nothing
 * between, and never a trip to a well (a second well trip in one queue was
 * dropped, the can ran dry, and on a heat day the crops after it withered).
 * A crow or bugs go first, after any other crow or bugs already waiting, and
 * even before a walk under way to a calmer job, which waits its turn after
 * them (a crow tapped during a 24-tap watering pass waited at the back and
 * ate five request crops).
 */
export function queueTap(s: WorldState, a: Actor, tap: Tap, ev: SimEvent[]): void {
  const queue = (s.taps ??= []);
  if (!a.task && !a.path.length && !a.aim && !queue.length) {
    doTap(s, a, tap, ev);
    return;
  }
  const urgent = homestead(s) && !tap.build && urgentAt(s, tap.x, tap.y);
  if (urgent) {
    // The same job already waiting further back (tapped before the crow came, say) moves up with it.
    for (let k = queue.length - 1; k >= 0; k--) if (sameTap(queue[k], tap)) queue.splice(k, 1);
    const now = inFlight(a);
    if (now && sameTap(now, tap)) return;
  } else {
    const last = queue.length ? queue[queue.length - 1] : inFlight(a);
    if (last && sameTap(last, tap) && !refillAt(s, tap.x, tap.y)) return;
  }
  if (queue.length >= TAP_QUEUE) {
    ev.push({ type: 'deny', x: tap.x, y: tap.y, reason: 'Busy. Tap it again soon' });
    return;
  }
  if (!urgent) {
    queue.push(tap);
    return;
  }
  let i = 0;
  while (i < queue.length && !queue[i].build && urgentAt(s, queue[i].x, queue[i].y)) i++;
  queue.splice(i, 0, tap);
  const aim = a.aim;
  if (!a.task && aim && a.path.length && !urgentAt(s, aim.x, aim.y)) {
    const back = inFlight(a);
    if (back) queue.splice(i + 1, 0, back);
    a.aim = null;
    a.path = [];
  }
}

export function walkTo(s: WorldState, a: Actor, x: number, y: number, thenAct: boolean, verb: Verb = 'harvest'): void {
  const t = tileOf(a);
  const p = thenAct ? pathNextTo(s, t.x, t.y, x, y) : pathTo(s, t.x, t.y, x, y) ?? pathNextTo(s, t.x, t.y, x, y);
  if (!p) return;
  a.path = p;
  a.aim = thenAct ? { verb, x, y } : null;
}
