// Thistledown's rules, render-free: the clock, walking, the bellows, downies,
// loose things, gardens, pens, silos, the Exchange, nettlebacks, wild
// spawning and the journal. The game feeds it controls and an aim each frame
// and reacts to the events it emits; renderers only read its state. While
// teaching, the world holds back what the lessons have not brought in yet
// (see lessons.ts): posts, the door, the bench and gates stay inert, the
// clock stops in the late afternoon and nettlebacks stay away.

import {
  BENCH_UPS,
  BUILD_COST,
  BUILD_NAME,
  FEEDER_CAP,
  FULL_PEN,
  GARDEN_HOURS,
  GARDEN_PILE,
  GARDEN_UPS,
  GARDEN_YIELD,
  GARDEN_YIELD_SOIL,
  GOALS,
  HOUR,
  LIVE_EACH,
  HUNGER_RATE,
  KIND,
  NEGLECT_HOURS,
  ORDER_BY,
  ORDER_POST,
  PEN_DOZE,
  PEN_HUNGER,
  PEN_MAX,
  PEN_PATIENT,
  KINDS,
  KIND_TUFT,
  PEN_UPS,
  RANGES,
  SILO_CAP,
  SILO_KINDS,
  TUFT_KIND,
  eats,
  favourite,
  RARE_NAME,
  fmtCoins,
  isDowny,
  isFood,
  isTuft,
  thingName,
  wantedFood,
  type BenchUp,
  type DownyKind,
  type Food,
  type GardenUp,
  type GoalId,
  type ItemType,
  type Order,
  type PadKind,
  type PenUp,
  type Thing,
  type Tuft,
} from './defs';
import { clamp, damp } from './noise';
import { BED_HALF, CRATE, Physics, SILO_H, SILO_R } from './physics';
import {
  freshState,
  slotCap,
  newDowny,
  newItem,
  type Downy,
  type DownRec,
  type Item,
  type Nettle,
  type RanchState,
  type Slot,
  type Source,
} from './state';
import {
  BERRY_BUSHES,
  BOARD,
  CLOVER_PATCHES,
  MAXX,
  MAXZ,
  MINX,
  MINZ,
  DOOR,
  GATES,
  PADS,
  PEN_R,
  POND,
  RANCH_Z,
  RIDGE_TOP,
  ROOT_PATCHES,
  SIGHTINGS,
  VENTS,
  WINDMILL,
  WORKBENCH,
  pathAt,
  waterAt,
  zoneAt,
  type GateId,
  type Zone,
  RIDGE_X,
  HOLLOW_X,
} from './world';

export type Ev =
  | { t: 'suck'; thing: Thing; x: number; y: number; z: number; wild?: boolean }
  | { t: 'full'; thing: Thing }
  | { t: 'puff'; thing: Thing | null }
  | { t: 'boing'; x: number; y: number; z: number; v: number; kind: DownyKind }
  | { t: 'chirp'; x: number; y: number; z: number; kind: DownyKind }
  | { t: 'squeak'; x: number; y: number; z: number; kind: DownyKind }
  | { t: 'eat'; x: number; y: number; z: number; kind: DownyKind; food: Food; fav: boolean; tame: boolean; you: boolean }
  | { t: 'shed'; x: number; y: number; z: number; kind: DownyKind; n: number }
  | { t: 'frazzle'; x: number; y: number; z: number }
  /** blown: you blew it in (not drawn in by the crate from where it lay); cycle: it finished a meal you gave, start to sale. */
  | { t: 'sell'; x: number; y: number; z: number; kind: DownyKind; coins: number; blown: boolean; cycle: boolean }
  /** A window tipped out (mixed: the fluff window, holding more than one kind). */
  | { t: 'empty'; thing: Thing; n: number; mixed: boolean }
  | { t: 'reject'; x: number; y: number; z: number }
  | { t: 'build'; pad: number; what: string; x: number; z: number }
  | { t: 'gate'; gate: GateId }
  | { t: 'nettle'; x: number; y: number; z: number }
  | { t: 'nettlehit'; x: number; y: number; z: number }
  | { t: 'splash'; x: number; y: number; z: number }
  | { t: 'goal'; id: GoalId }
  | { t: 'deny'; why: string }
  | { t: 'plant'; pad: number; food: Food }
  | { t: 'crop'; pad: number }
  /** Something went into a feeder or silo (auto: a garden's crop, by its feed run or its full bed, not you). */
  | { t: 'store'; x: number; y: number; z: number; where: 'feeder' | 'silo'; pad: number; auto?: boolean }
  /** A downy of yours hopped out of its pen. */
  | { t: 'stray'; x: number; y: number; z: number; pen: number }
  /** A downy came down inside a pen (blown in, or hopped back). */
  | { t: 'penned'; pen: number }
  /** Dusk, and a pen with downies in it has nothing to eat for the night: its feeder empty (or none, and no food lying in it). */
  | { t: 'hungrynight'; pen: number; feeder: boolean }
  | { t: 'first'; kind: DownyKind }
  /** The board's rare one heard you coming, unlured, and bolted. */
  | { t: 'heard'; x: number; y: number; z: number; kind: DownyKind }
  /** The board's rare one finished eating and its calm ran out: it is wary again (near: you are close enough to see it). */
  | { t: 'unlured'; x: number; y: number; z: number; kind: DownyKind; near: boolean }
  /** A wild downy you are pulling at pulls back (the ring turns warm): let go of Pull until it stops. */
  | { t: 'pullback'; x: number; y: number; z: number; kind: DownyKind }
  /** Its pull back ended; eased: you let go while it pulled (and it holds what you had). */
  | { t: 'eased'; x: number; y: number; z: number; kind: DownyKind; eased: boolean }
  /** You held on through its pull back: it slipped free a few metres off (still there, try again). */
  | { t: 'slip'; x: number; y: number; z: number; kind: DownyKind }
  /** A wild downy broke free of the pull and got away (dove: into the water). */
  | { t: 'escape'; x: number; y: number; z: number; kind: DownyKind; dove: boolean }
  /** An order moved: posted (an offer on the board), taken, counted towards (got of n), filled (bonus: what filling paid, or a live order's whole sum), or missed at dusk. */
  | { t: 'order'; kind: DownyKind; live: boolean; got: number; n: number; state: 'posted' | 'taken' | 'progress' | 'filled' | 'missed'; bonus: number; x: number; z: number; rare?: boolean }
  /** A downy of yours blown into the sell crate for a live order. */
  | { t: 'deliver'; x: number; y: number; z: number; kind: DownyKind; coins: number; rare: boolean }
  /** Food landed in a feeder's hopper (n: what it holds now), or bounced off it (why). */
  | { t: 'feeder'; pad: number; n: number; why: string }
  | { t: 'step'; stone: boolean; pitch: number }
  | { t: 'jump' }
  | { t: 'land'; v: number }
  | { t: 'glide' }
  | { t: 'sleep' }
  | { t: 'zone'; zone: Zone }
  | { t: 'air' };

export interface Controls {
  /** Strafe right, -1..1. */
  moveX: number;
  /** Forward, -1..1. */
  moveZ: number;
  sprint: boolean;
  jump: boolean;
  jumpPressed: boolean;
  draw: boolean;
  puff: boolean;
  puffPressed: boolean;
}

export interface Aim {
  /** Eye position. */
  ex: number;
  ey: number;
  ez: number;
  /** Unit look direction. */
  dx: number;
  dy: number;
  dz: number;
  /** Where the bellows' muzzle is in the world. */
  mx: number;
  my: number;
  mz: number;
}

export interface Interactable {
  kind: 'pad' | 'chute' | 'bench' | 'door' | 'gate' | 'silo' | 'board';
  id: number | GateId;
  label: string;
  x: number;
  y: number;
  z: number;
}

export interface MenuOption {
  id: string;
  title: string;
  price: number | null;
  ok: boolean;
  /** A short line under the title, if any. */
  note: string;
}

const G_DOWNY = 9;
const G_ITEM = 16;
const G_TUFT = 2.4;
/** The sell crate draws in fluff within this many metres of its middle (flying or lying). */
const PULL_R = 2.4;
const CRATE_X = (CRATE.x0 + CRATE.x1) / 2;
const CRATE_Z = (CRATE.z0 + CRATE.z1) / 2;

/**
 * The sell crate's pull on a piece of fluff: towards a point just over its
 * funnel, harder the nearer it is, with a little damping so it settles in
 * rather than orbiting. Shared by the real flight and the crosshair's guess.
 */
function cratePull(b: { x: number; y: number; z: number; vx: number; vy: number; vz: number }, floor: number, dt: number): boolean {
  const dx = CRATE_X - b.x;
  const dz = CRATE_Z - b.z;
  const dh = Math.hypot(dx, dz);
  if (dh > PULL_R || b.y > floor + 3.4) return false;
  const dy = floor + CRATE.h + 0.35 - b.y;
  const k = 1 - dh / PULL_R;
  const pull = 7 + 12 * k;
  const l = Math.hypot(dx, dy, dz) || 1;
  b.vx += (dx / l) * pull * dt;
  b.vy += (dy / l) * pull * dt;
  b.vz += (dz / l) * pull * dt;
  const damp = Math.exp(-3 * k * dt);
  b.vx *= damp;
  b.vz *= damp;
  return true;
}
const PLAYER_G = 22;
const EYE = 1.6;
const CONE = Math.cos((25 * Math.PI) / 180);
const NEAR_CONE = Math.cos((50 * Math.PI) / 180);
const ABSORB = 1.0;
const WILD_CAP = 56;
/** How close you need to be to use the workbench. */
export const BENCH_REACH = 3.5;
/**
 * Wild downies notice you within this many metres (more when you run) and hop
 * away. Both are further than Pull reaches (7.4 m), so a catch means closing in
 * on one that has seen you, then keeping the crosshair on it while it jinks.
 */
export const NOTICE = 9;
export const NOTICE_RUN = 12;
/** Seconds the bellows leaves things tipped out of a window alone, so the next pull does not sweep them straight back in. */
export const TIP_IGNORE = 1.6;
/** Each fluff of a kind sold today takes this share off its price, down to the floor. */
export const SATURATION = 0.004;
export const SAT_FLOOR = 0.6;

/**
 * How each kind fights the bellows. need: seconds of pull to bring it in (its pulls back not counted).
 * limit: seconds of the fight before it breaks free if you are slow (0: never; the time waits while it
 * pulls back). jink: seconds between its hops while held, and dash: how fast it hops sideways (m/s), up:
 * how high. give: how far off its body the crosshair may be and still hold it (m; yours and the porch downy
 * keep 0.3). fade: how fast a pull that slipped off fades (a second).
 * Round 7 (the seventh playtest: "catch everything in under 3 s, hold Pull, hold Blow") made the tug the
 * skill (see TUG): the aim asks less than it did (an ember's give was 0.13 and its darts 4.4 to 5.8 m/s; a
 * thistle hopped every 0.12 to 0.28 s), and each kind's pulls back ask more.
 * - Clover: quick sideways hops; it only gets away if you let the pull go.
 * - Ember: darts, a low leap every half second or so; lose it and it is off.
 * - Brook: slippery, it slips off towards the pond and into the water if you are slow.
 * - Thistle: bolts when it notices you (faster than you walk, slower than you run) and needs a quick tug
 *   before it breaks free.
 * Every kind gets away for good (out of reach, the bellows refused for a moment) if the pull
 * lapses once it was a third of the way in.
 */
export const CATCH: Record<DownyKind, { need: number; limit: number; jink: [number, number]; dash: [number, number]; up: number; give: number; fade: number }> = {
  clover: { need: 1.2, limit: 0, jink: [0.3, 0.55], dash: [2.6, 3.6], up: 1.3, give: 0.3, fade: 0.9 },
  ember: { need: 1.3, limit: 0, jink: [0.45, 0.75], dash: [2.8, 3.8], up: 1.2, give: 0.28, fade: 0.8 },
  brook: { need: 1.2, limit: 4.2, jink: [0.3, 0.5], dash: [2.8, 3.6], up: 1.0, give: 0.25, fade: 0.9 },
  thistle: { need: 0.9, limit: 3.6, jink: [0.35, 0.6], dash: [1.3, 1.9], up: 1.5, give: 0.4, fade: 0.8 },
};
/** A fight lost once the pull had this share of the way in: the downy gets away. */
export const SHAKE_LOOSE = 0.34;
/** Seconds the bellows cannot take a downy that just got away. */
export const GOT_AWAY = 1.6;
/**
 * A downy that got away runs flat out for this long (a thistle longer), and
 * stays wary for a while after: it hears you from further off and fights the
 * next pull harder. So a getaway costs a chase (the fourth playtest's careless
 * thumb caught 4 embers of 4, a second or third pull straight after the first).
 */
export const ESCAPE = { bolt: 3.5, thistle: 4, wary: 10, waryNeed: 1.5, boltFor: 2, winded: 8 };
/** A thistle that has noticed you bolts at about this speed (m/s): faster than you walk (4.7), slower than you run (7.4). */
export const BOLT_SPEED = 5.6;
/** Seconds of steady aim before a penned downy of yours comes, and how still the aim must be (rad/s). */
export const PEN_TUG = 0.45;
export const STEADY = 0.9;
/** Seconds since food or fluff was last in the cone before a penned downy may start to come (the sweep has moved on). */
export const SWEPT = 0.6;
/**
 * A press of Pull that started aimed at food or fluff (within reach or past
 * it, up to this much further) never takes a penned downy, and nor does one
 * that has drawn any in: the fifth playtest's pulls at a pen's far-side fluff,
 * out of reach behind a downy, took the downy in 2 of 4.
 */
export const PRESS_LOOK = 4;
/**
 * Fluff lying in a pen without a chute gathers by the fence on the lane side,
 * beside the post, where Pull reaches it from outside (a pen is 8.8 m across
 * and Pull reaches 7 m, so the far side's fluff was out of reach). It drifts at
 * this speed once it has lain this long.
 */
export const GATHER = { speed: 0.9, after: 0.6, inset: 0.85 };
/**
 * The board's rare downy is a hunt (the sixth playtest's top fun change; its
 * "shy of running" one let a walker within 5 m, nearer than a plain clover's 9).
 * Unlured, it hears a walker from `walk` metres and a runner from `run` (a plain
 * downy: 9 and 12) and bolts for `bolt` seconds, then drifts back to where it
 * was seen. It smells its favourite food lying within `smell` metres and goes
 * to it: lured (going to the food, eating it, and `calm` seconds after) it lets
 * a walker within `nearWalk` metres and a runner within `nearRun`. Pulled at
 * unlured, it slips the pull in `slip` seconds.
 */
export const RARE_WARY = { walk: 13, run: 20, smell: 12, calm: 9, nearWalk: 3, nearRun: 6, bolt: 3, slip: 1.2 };
/** A rare one fights the pull harder than its kind: this much longer to bring in, with this share of its kind's give. */
export const RARE_FIGHT = { need: 2.2, give: 0.9 };
/**
 * The tug, a small skill you read (the seventh playtest: "catch everything in under 3 s, hold Pull"). Now and
 * then a wild one you are pulling at pulls back: the ring round the crosshair turns warm and it squeaks. Hold
 * Pull through its pull for longer than its grace and it slips free a few metres off (not lost: try again); let
 * go while it pulls and press again once it stops, and what you had holds. every: seconds of pulling between its
 * pulls back; dur: how long one lasts; grace: seconds of holding on through one before it slips. Clovers rarely
 * pull back, and gently; embers more; brooks and thistles most.
 */
export const TUG: Record<DownyKind, { every: [number, number]; dur: [number, number]; grace: number }> = {
  clover: { every: [0.7, 1.3], dur: [0.75, 0.95], grace: 0.68 },
  ember: { every: [0.8, 1.3], dur: [0.65, 0.85], grace: 0.55 },
  brook: { every: [0.5, 0.8], dur: [0.6, 0.8], grace: 0.48 },
  thistle: { every: [0.38, 0.6], dur: [0.55, 0.75], grace: 0.46 },
};
/** The rare one pulls back most often and fastest, whatever its kind. */
export const RARE_TUG: { every: [number, number]; dur: [number, number]; grace: number } = { every: [0.6, 0.95], dur: [0.6, 0.8], grace: 0.5 };
/** After a pull back, a let-go pull keeps what it has for this long (pressing again a little late costs nothing). */
export const EASE_HOLD = 0.7;
/** Until the lesson has taught it, a pull back lasts until you let go (or this long), and holding on slips only after this. */
export const TEACH_BACK = { dur: 3.2, grace: 2.6 };
/** A slip: a hop this fast away from you, and the bellows leaves it be for this long. */
export const SLIP = { speed: 3.4, up: 3.6, noPull: 0.8 };
/** Within this many metres of it the rare one is found, and an arrow comes on over it (before that, only the clue). */
export const RARE_SEEN = 24;
/** Its coins: this share of the day's trip, so never more than about the trip's (the sixth playtest's paid 3.8 times it). */
export const RARE_PAY = 0.75;
/** Meals a penned downy eats in a game day, fed (measured: 3.67 for pens of three, six and ten), for a rare one's worth. */
export const PEN_MEALS = 3.7;

/**
 * The pen a rare one would join: the fullest of yours with room and no rare one in it yet, so it adds the
 * most (one more fluff a meal from everyone in its pen, once: a second rare in a pen adds nothing). A rare one
 * in the jar, not yet penned, takes the first such pen. -1: none.
 */
export function rarePenOf(s: RanchState, countAboard = true): number {
  const n = s.pads.map(() => 0);
  const has = s.pads.map(() => false);
  for (const d of s.downies) {
    if (d.gone || d.pen < 0) continue;
    n[d.pen]++;
    if (d.rare && d.tame) has[d.pen] = true;
  }
  const open = s.pads.map((_p, i) => i).filter((i) => s.pads[i].kind === 'pen' && !has[i] && n[i] < PEN_MAX).sort((a, b) => n[b] - n[a]);
  const aboard = countAboard ? s.slots.reduce((a, q) => a + (q.t && isDowny(q.t) ? (q.downs ?? []).filter((r) => r.rare).length : 0), 0) : 0;
  return open[aboard] ?? -1;
}
/** An empty Blow still pushes a puff of air: it sends a pest within this many metres in front of you rolling. */
export const AIR_REACH = 5;
/**
 * How pests get about (the seventh playtest's sat in the ranch's north-east corner at speed 0, roaming for 40 s,
 * and leaving from 20:52 until after 7 am). leave: walking speed off north at dawn. stuck: seconds of getting
 * nowhere against the speed it wanted before it tries the other side. watch: the watchdog's window (s), in every
 * mode; lost: a leaving pest that has got nowhere this long, while you are not watching it closely, is gone. near
 * and cone: watching closely (within near metres, within cone radians of the view). slip: seconds a leaving one
 * out of sight (and over 8 m off) takes to slip away.
 */
export const PEST = { leave: 2, stuck: 1, watch: 5, lost: 10, near: 14, cone: 0.7, slip: 6 };

/**
 * A full garden bed tips this share of what it grows into the feeder next door (without a feed run): it helps,
 * but a feeder still wants a top-up every day or two (it took it all, and kept a pen of six fed for good).
 */
export const GARDEN_TIP = { share: 1 / 3 };

/**
 * A trip for live downies pays about this much more than the plain fluff order beside it (it was 1.25; with the
 * tug a skill, a trip takes longer, and at 1.25 it was never the best pick once its time out was counted).
 */
export const LIVE_OVER = 1.4;

/** A downy's record in the jar for one that came in without one (an older save, a test): as they used to come out. */
const NO_REC: DownRec = { h: 0.35, c: 0 };

interface Group {
  kind: DownyKind;
  x: number;
  z: number;
  n: number;
}

const GROUPS: Group[] = [
  { kind: 'clover', x: -16, z: -9, n: 3 },
  { kind: 'clover', x: 14, z: -4, n: 3 },
  { kind: 'clover', x: -8, z: -44, n: 3 },
  { kind: 'clover', x: 20, z: -32, n: 3 },
  { kind: 'clover', x: -22, z: -28, n: 2 },
  { kind: 'ember', x: VENTS[0][0] + 3, z: VENTS[0][1] + 4, n: 3 },
  { kind: 'ember', x: VENTS[1][0] - 2, z: VENTS[1][1] + 3, n: 3 },
  { kind: 'ember', x: VENTS[3][0] - 3, z: VENTS[3][1], n: 3 },
  { kind: 'brook', x: POND.x - 14, z: POND.z + 10, n: 3 },
  { kind: 'brook', x: POND.x + 8, z: POND.z + 15, n: 3 },
  { kind: 'brook', x: POND.x - 4, z: POND.z - 16, n: 3 },
];

export function makeSources(): Source[] {
  return [
    ...CLOVER_PATCHES.map((p) => ({ kind: 'clover' as const, x: p.x, z: p.z, t: 0 })),
    ...BERRY_BUSHES.map((p) => ({ kind: 'berry' as const, x: p.x, z: p.z, t: 0 })),
    ...ROOT_PATCHES.map((p) => ({ kind: 'root' as const, x: p.x, z: p.z, t: 0 })),
  ];
}

const SOURCE_FOOD: Record<Source['kind'], Food> = { clover: 'cloverhead', berry: 'dewberry', root: 'sweetroot' };
const SOURCE_MAX = 3;
const SOURCE_REGROW = 40;
/** Garden items carry src = GARDEN_SRC + pad index. */
export const GARDEN_SRC = 1000;

/** Fixed spots around a pad: its post, the feeder hopper, the down box, the trough and the silo outlet. */
export function padSpots(i: number) {
  const p = PADS[i];
  const ls = i < 3 ? 1 : -1;
  return {
    post: { x: p.px, z: p.pz },
    hopper: { x: p.x + PEN_R * 0.72, z: p.z + ls * PEN_R * 0.69, y: 1.55 },
    chute: { x: p.x + 0.6, z: p.z + ls * (PEN_R + 0.75) },
    trough: { x: p.x - 0.4, z: p.z - ls * (PEN_R - 1.3) },
    outlet: { x: p.x, z: p.z + ls * (SILO_R + 0.35), y: 0.7 },
    ls,
  };
}

/**
 * Where a pen's fluff gathers (without a chute): just inside the fence on the
 * lane side, beside the post, spread a little along the rail by the fluff's id.
 */
export function gatherSpot(i: number, id = 2): { x: number; z: number } {
  const p = PADS[i];
  let dx = p.px - p.x;
  let dz = p.pz - p.z;
  const l = Math.hypot(dx, dz) || 1;
  dx /= l;
  dz /= l;
  const r = PEN_R - GATHER.inset;
  const along = ((id % 5) - 2) * 0.3;
  return { x: p.x + dx * r - dz * along, z: p.z + dz * r + dx * along };
}

/**
 * Where a downy that got out of pen i waits: just outside the fence on the
 * lane side, by the post (its gate), spread along the rail by its id.
 */
export function strayWait(i: number, id = 0): { x: number; z: number } {
  const p = PADS[i];
  let dx = p.px - p.x;
  let dz = p.pz - p.z;
  const l = Math.hypot(dx, dz) || 1;
  dx /= l;
  dz /= l;
  const r = PEN_R + 1.3;
  const along = ((id % 5) - 2) * 0.55;
  return { x: p.x + dx * r - dz * along, z: p.z + dz * r + dx * along };
}

/**
 * Seconds a wild one fights the pull before it breaks free (0: only if the pull lapses). The board's rare one,
 * pulled at unlured, bolts out of the pull in `RARE_WARY.slip` seconds: it is to be lured, not chased.
 */
export function fightLimit(d: Downy): number {
  // (The rare one's time, for a kind that has one, stretches with its longer fight.)
  const lim = CATCH[d.kind].limit * (d.rare ? RARE_FIGHT.need : 1);
  if (!d.rare || d.tame || d.keep || d.calm > 0 || d.eatT > 0) return lim;
  return lim > 0 ? Math.min(lim, RARE_WARY.slip) : RARE_WARY.slip;
}

/** A rare wild one lured by its favourite food: going to it, eating it, or a while after. Then it lets you near. */
export function rareLured(d: Downy): boolean {
  return d.calm > 0 || d.eatT > 0 || (!!d.target && !d.target.gone && d.target.drawn === 0);
}

/**
 * The rare one's fed window, for the ring over it: 1 while it goes to its food and eats, then the share of
 * its calm left; -1 when it is not lured (the seventh playtest's window ran out with nothing to show it).
 */
export function rareFed(d: Downy): number {
  if (d.tame || !d.rare || !rareLured(d)) return -1;
  if (d.eatT > 0 || d.calm <= 0) return 1;
  return Math.min(1, d.calm / RARE_WARY.calm);
}

/** The fluff window's kinds, oldest first, one per fluff (a window set up without them holds n of its kind). */
function mixOf(q: Slot): Tuft[] {
  if (!q.mix || q.mix.length !== q.n) q.mix = q.t && isTuft(q.t) ? Array.from({ length: q.n }, () => q.t as Tuft) : [];
  return q.mix;
}

/** A downy's window: each downy in it, oldest first (a window set up without them holds n as they used to come out). */
export function downsOf(q: Slot): DownRec[] {
  if (!q.t || !isDowny(q.t)) return [];
  if (!q.downs) q.downs = [];
  while (q.downs.length < q.n) q.downs.unshift({ ...NO_REC });
  if (q.downs.length > q.n) q.downs.splice(0, q.downs.length - q.n);
  return q.downs;
}

export class Sim {
  s: RanchState;
  phys = new Physics();
  rand: () => number = Math.random;
  events: Ev[] = [];
  /** Walked distance, for the head bob and footsteps. */
  stride = 0;
  private stepAt = 0;
  private coyote = 0;
  private puffWait = 0;
  private fullWait = 0;
  private spawnT = 0;
  private srcT = 0;
  private srcCount: number[] = [];
  private nettleT = 8;
  private goalT = 0;
  private siloT = 0;
  private glided = false;
  /** The chosen window ran out under a held Blow: wait for the button to come up before blowing the next kind. */
  private waitRelease = false;
  /** Blown downies are helped into a pen they were aimed at (off for the before-and-after measure). */
  penAssist = true;
  /** Things currently being drawn, for the renderer's stream effect. */
  drawing = false;
  drawPower = 0;
  /** Nearest danger to the player, 0 calm to 1 close, for the music. */
  danger = 0;
  thistleSeen = false;
  /** Wild downies come and go (off in some tests). */
  wild = true;
  /** Hold back what the lessons have not brought in. Off, everything is there (tests, sandbox). */
  teaching = false;
  private airborneVy = 0;
  /** The last aim direction, and how fast it is turning (rad/s), for the steady pull on a penned downy. */
  private lastAim = [0, 0, -1];
  aimSpin = 0;
  /** Seconds since food or fluff was last in the cone of a pull. */
  private sweptT = 0;
  /** This press of Pull started aimed at food or fluff, or has drawn some in: it leaves penned downies be. */
  private pressFood = false;
  private wasDraw = false;
  /** Numbers the meals you give; fluff from one carries it, and its first sale closes the loop. */
  private feedSerial = 0;
  private cycled = new Set<number>();
  private pbody = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0.34, grounded: true };

  constructor(state: RanchState | null) {
    const sources = makeSources();
    if (state) {
      this.s = state;
      if (this.s.sources.length !== sources.length) this.s.sources = sources;
    } else {
      this.s = freshState();
      this.s.night = 1;
      this.s.sources = sources;
      this.rollMarket(true);
      this.seedWorld();
    }
    this.phys.setPads(this.s.pads);
    this.phys.gates = { ...this.s.gates };
    for (const d of this.s.downies) d.pen = this.phys.penAt(d.x, d.z);
    this.srcCount = this.s.sources.map(() => 0);
    this.countSources();
  }

  emit(e: Ev): void {
    this.events.push(e);
  }

  /** Has a lesson brought this in? Always yes when not teaching. */
  knows(what: string): boolean {
    return !this.teaching || this.s.learn.includes(what);
  }

  // ------------------------------------------------------------ setup

  private seedWorld(): void {
    const s = this.s;
    // Food already growing in the wild.
    s.sources.forEach((src, i) => {
      for (let k = 0; k < 2 + Math.floor(this.rand() * 2); k++) this.growAt(i, src);
    });
    // The starter garden has a few heads ready.
    for (let k = 0; k < 3; k++) {
      const p = PADS[0];
      const it = newItem(s, 'cloverhead', p.x + (this.rand() - 0.5) * 3.5, 0, p.z + (this.rand() - 0.5) * 3.5, GARDEN_SRC);
      it.y = this.phys.floor(it.x, it.z) + it.r;
      it.rest = true;
      s.items.push(it);
    }
    for (const g of GROUPS) for (let k = 0; k < g.n; k++) this.spawnWild(g);
    // A downy on the porch, to say hello.
    const d = newDowny(s, 'clover', -12.6, 0, 35.6);
    d.y = this.phys.floor(d.x, d.z);
    d.homeX = -11.5;
    d.homeZ = 34.5;
    d.keep = true;
    d.hunger = 0.25;
    s.downies.push(d);
  }

  private spawnWild(g: Group): Downy {
    const a = this.rand() * Math.PI * 2;
    const r = this.rand() * 4;
    const x = g.x + Math.cos(a) * r;
    const z = g.z + Math.sin(a) * r;
    const d = newDowny(this.s, g.kind, x, 0, z);
    d.y = this.phys.floor(x, z) + 0.6;
    d.homeX = g.x;
    d.homeZ = g.z;
    d.hunger = 0.1 + this.rand() * 0.3;
    this.s.downies.push(d);
    return d;
  }

  private growAt(i: number, src: Source): void {
    const food = SOURCE_FOOD[src.kind];
    const a = this.rand() * Math.PI * 2;
    let x = src.x;
    let z = src.z;
    let lift = 0.12;
    if (src.kind === 'berry') {
      const r = 0.55 + this.rand() * 0.25;
      x += Math.cos(a) * r;
      z += Math.sin(a) * r;
      lift = 0.55 + this.rand() * 0.5;
    } else {
      const r = 0.2 + this.rand() * 0.8;
      x += Math.cos(a) * r;
      z += Math.sin(a) * r;
      lift = src.kind === 'root' ? 0.1 : 0.14;
    }
    const it = newItem(this.s, food, x, 0, z, i);
    it.y = this.phys.floor(x, z) + lift;
    it.rest = true;
    this.s.items.push(it);
  }

  private countSources(): void {
    this.srcCount.fill(0);
    for (const it of this.s.items) if (!it.gone && it.rest && it.src >= 0 && it.src < GARDEN_SRC) this.srcCount[it.src]++;
  }

  // ------------------------------------------------------------ market

  /** Today's price: the day's drift, softened a little by each sale today, never below the floor. */
  price(k: DownyKind): number {
    const m = this.s.market;
    return Math.max(1, Math.round(KIND[k].value * m.mult[k] * Math.max(SAT_FLOOR, Math.pow(1 - SATURATION, m.sold[k]))));
  }

  private rollMarket(first: boolean): void {
    const m = this.s.market;
    for (const k of KINDS) {
      m.prev[k] = first ? KIND[k].value : this.price(k);
      m.mult[k] = 0.75 + this.rand() * 0.5;
      m.sold[k] = 0;
    }
  }

  // ------------------------------------------------------------ the clock

  get night(): number {
    const h = this.s.hour;
    if (h >= 21 || h < 4) return 1;
    if (h >= 18.5) return (h - 18.5) / 2.5;
    if (h < 6.5) return 1 - (h - 4) / 2.5;
    return 0;
  }

  /** Until the lessons let the day run on, it stays late afternoon. */
  static readonly HOLD_HOUR = 16.5;

  /**
   * The clock is held (late afternoon, the lessons not yet letting the day run
   * on: until the loop lesson ends). Your downies' hunger waits with it until
   * the meadow is done, then runs, so the loop lesson's downies get hungry.
   */
  get clockHeld(): boolean {
    const h = this.s.hour;
    if (h >= Sim.HOLD_HOUR && h < 20 && !this.knows('time')) return true;
    // The first day's dusk waits at 6 pm for the feeder lessons (see Tutor: 'evening'): the seventh playtest's
    // dusk took over before the feeder was filled, and the arrow moved to the front door.
    return this.s.day === 1 && h >= Sim.DUSK_HOLD && h < 18.3 && !this.knows('evening');
  }
  /** Where the first day's clock waits for the feeder lessons. */
  static readonly DUSK_HOLD = 18;

  private tickClock(dt: number): void {
    const s = this.s;
    if (this.clockHeld) return;
    s.hour += dt / HOUR;
    if (s.hour >= 24) {
      s.hour -= 24;
      s.day++;
    }
    if (s.hour >= 5 && s.night < s.day) this.overnight();
  }

  private overnight(): void {
    const s = this.s;
    // Tufts left lying blow away; prices drift and recover.
    for (const it of s.items) if (!it.gone && isTuft(it.type) && it.drawn === 0) it.gone = true;
    this.rollMarket(false);
    s.night = s.day;
  }

  /** The front door offers sleep from 6 pm until half past five in the morning (the seventh playtest slept at 08:12). */
  static sleepTime(hour: number): boolean {
    return hour >= 18 || hour < 5.5;
  }

  sleep(): void {
    const s = this.s;
    // From dusk, the night through to the next morning; after midnight, to this morning. Never a day skipped by
    // sleeping in the morning (it added a day whenever it was past 5 am), and by day there is no sleeping at all.
    if (!Sim.sleepTime(s.hour) && s.hour >= 6) return;
    if (s.hour >= 18) s.day++;
    s.hour = 6;
    if (s.night < s.day) this.overnight();
    // The pests leave with the night; the next night's first comes a few seconds after dark.
    for (const n of s.nettles) n.gone = true;
    this.nettleT = Math.min(this.nettleT, 5);
    this.emit({ t: 'sleep' });
  }

  // ------------------------------------------------------------ frame

  update(dt: number, c: Controls, aim: Aim): void {
    this.tickClock(dt);
    this.movePlayer(dt, c);
    this.bellows(dt, c, aim);
    this.updateDownies(dt);
    this.updateItems(dt);
    this.updateNettles(dt);
    this.updatePads(dt);
    this.updateSources(dt);
    this.updateSpawns(dt);
    this.goalT -= dt;
    if (this.goalT <= 0) {
      this.goalT = 0.5;
      this.checkGoals();
      this.sweep();
    }
  }

  /** Drop gone things from the lists now and then (not every frame). */
  private sweep(): void {
    const s = this.s;
    if (s.items.some((i) => i.gone)) s.items = s.items.filter((i) => !i.gone);
    if (s.downies.some((d) => d.gone)) s.downies = s.downies.filter((d) => !d.gone);
    if (s.nettles.some((n) => n.gone)) s.nettles = s.nettles.filter((n) => !n.gone);
  }

  // ------------------------------------------------------------ the player

  private movePlayer(dt: number, c: Controls): void {
    const p = this.s.player;
    const wet = waterAt(p.x, p.z) > p.y + 0.3;
    const sp = (c.sprint ? 7.4 : 4.7) * (wet ? 0.6 : 1);
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw);
    const rz = -Math.sin(p.yaw);
    let wx = fx * c.moveZ + rx * c.moveX;
    let wz = fz * c.moveZ + rz * c.moveX;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) {
      wx /= wl;
      wz /= wl;
    }
    const k = p.grounded ? 11 : 2.2;
    p.vx = damp(p.vx, wx * sp, k, dt);
    p.vz = damp(p.vz, wz * sp, k, dt);
    this.coyote = p.grounded ? 0.12 : this.coyote - dt;
    if (c.jumpPressed && this.coyote > 0) {
      p.vy = 7.3;
      p.grounded = false;
      this.coyote = 0;
      this.glided = false;
      this.emit({ t: 'jump' });
    }
    p.gliding = false;
    if (!p.grounded) {
      if (this.s.up.glide > 0 && c.jump && p.vy < -1.4) {
        // The bellows' updraft: settle into a slow drift down.
        p.vy = damp(p.vy, -1.4, 7, dt);
        p.gliding = true;
        if (!this.glided) {
          this.glided = true;
          this.emit({ t: 'glide' });
        }
      } else p.vy -= PLAYER_G * dt;
    }
    const ox = p.x;
    const oz = p.z;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.y += p.vy * dt;
    const body = this.pbody;
    body.x = p.x;
    body.y = p.y;
    body.z = p.z;
    body.vx = p.vx;
    body.vy = p.vy;
    body.vz = p.vz;
    body.grounded = p.grounded;
    this.phys.collide(body, ox, oz, 'player');
    p.x = body.x;
    p.z = body.z;
    p.vx = body.vx;
    p.vz = body.vz;
    const fl = this.phys.floor(p.x, p.z);
    if (p.y <= fl) {
      if (!p.grounded && this.airborneVy < -4) this.emit({ t: 'land', v: clamp(-this.airborneVy / 14, 0, 1) });
      p.y = fl;
      p.vy = 0;
      p.grounded = true;
      this.glided = false;
    } else if (p.grounded && p.vy <= 0 && p.y - fl < 0.45) {
      // Walking downhill or off a step: stay on the ground.
      p.y = fl;
    } else {
      p.grounded = false;
    }
    this.airborneVy = p.vy;
    if (p.grounded) {
      const moved = Math.hypot(p.x - ox, p.z - oz);
      this.stride += moved;
      const every = c.sprint ? 2.3 : 1.9;
      if (this.stride - this.stepAt > every) {
        this.stepAt = this.stride;
        const z = zoneAt(p.x, p.z);
        const stone = pathAt(p.x, p.z) > 0.5 || z === 'ridge' || this.phys.floors.some((f) => f.a !== 0 && Math.hypot(p.x - f.cx, p.z - f.cz) < 3);
        this.emit({ t: 'step', stone, pitch: 0.9 + this.rand() * 0.2 });
      }
    }
    const z = zoneAt(p.x, p.z);
    if (!this.s.zones.includes(z)) {
      this.s.zones.push(z);
      this.emit({ t: 'zone', zone: z });
    }
  }

  // ------------------------------------------------------------ the bellows

  get range(): number {
    return RANGES[this.s.up.range] ?? RANGES[0];
  }

  /**
   * The slot a thing would go into, or -1 if the canister refuses it. One slot
   * per kind, except fluff: one window takes every kind of fluff, and holds
   * twice as much (the fourth playtest's four windows held three foods and
   * one fluff, and 19 ember and thistle fluff lay unpulled).
   */
  accept(t: Thing): number {
    const s = this.s;
    const tuft = isTuft(t);
    for (let i = 0; i < s.slots.length; i++) {
      const q = s.slots[i];
      if (q.t === t || (tuft && q.t !== null && isTuft(q.t))) return q.n < slotCap(s, q) ? i : -1;
    }
    for (let i = 0; i < s.slots.length; i++) if (s.slots[i].t === null) return i;
    return -1;
  }

  /** Puts a thing in the canister. Returns false if refused. Fluff remembers the meal it came from; a downy its hunger, the day it was caught and whether it is rare. */
  stow(t: Thing, feed = 0, rec?: DownRec): boolean {
    const i = this.accept(t);
    if (i < 0) return false;
    const s = this.s;
    const slot = s.slots[i];
    if (isTuft(t)) {
      // The fluff window: the kinds in it in the order they came; the next out shows.
      if (!slot.t || !isTuft(slot.t)) {
        slot.mix = [];
        slot.feeds = undefined;
      }
      const mix = mixOf(slot);
      mix.push(t);
      slot.t = mix[0];
      slot.n = mix.length;
    } else if (isDowny(t)) {
      if (slot.t !== t) {
        slot.feeds = undefined;
        slot.downs = [];
        slot.n = 0;
      }
      slot.t = t;
      const downs = downsOf(slot);
      downs.push({ ...(rec ?? NO_REC) });
      slot.n = downs.length;
    } else {
      if (slot.t !== t) slot.feeds = undefined;
      slot.t = t;
      slot.n++;
    }
    if (feed > 0 && isTuft(t)) (slot.feeds ??= []).push(feed);
    if (s.slots[s.sel].t === null) s.sel = i;
    return true;
  }

  /** Take one thing from a window: what it was (the fluff window gives its oldest fluff first; see takeDown for downies). */
  private takeOne(slot: Slot): Thing | null {
    const t = slot.t;
    if (!t || slot.n <= 0) return null;
    if (isTuft(t)) {
      const mix = mixOf(slot);
      mix.shift();
      slot.n = mix.length;
      slot.t = mix[0] ?? null;
    } else if (isDowny(t)) {
      this.takeDown(slot);
      return t;
    } else slot.n--;
    if (slot.n <= 0) {
      slot.n = 0;
      slot.t = null;
      slot.feeds = undefined;
      slot.mix = undefined;
    }
    return t;
  }

  /**
   * The downy that comes out of a window next: the one today's live order
   * wants, if one is aboard (the board's rare one first), else the newest.
   * So a fresh catch for the order is never stuck behind one from a pen.
   */
  nextDown(slot: Slot): DownRec | null {
    if (!slot.t || !isDowny(slot.t) || slot.n <= 0) return null;
    const downs = downsOf(slot);
    const k = slot.t;
    // The board's rare one, caught today, first: its order wants it in a pen.
    const rare = this.s.orders.some((o) => o.state === 'open' && o.rare && o.kind === k && o.got < o.n);
    for (let i = downs.length - 1; i >= 0; i--) if (rare && downs[i].rare && downs[i].c === this.s.day) return downs[i];
    for (let i = downs.length - 1; i >= 0; i--) if (this.wantsDowny(k, downs[i].c, !!downs[i].rare)) return downs[i];
    return downs[downs.length - 1];
  }

  /** Take a downy from its window (see nextDown): its record. */
  private takeDown(slot: Slot): DownRec {
    const rec = this.nextDown(slot) ?? { ...NO_REC };
    const downs = downsOf(slot);
    const i = downs.indexOf(rec);
    if (i >= 0) downs.splice(i, 1);
    slot.n = downs.length;
    if (slot.n <= 0) {
      slot.n = 0;
      slot.t = null;
      slot.feeds = undefined;
      slot.mix = undefined;
      slot.downs = undefined;
    }
    return rec;
  }

  /** Is a point inside the draw cone? Returns a pull strength 0..1, or 0. */
  private inCone(aim: Aim, x: number, y: number, z: number): number {
    const dx = x - aim.ex;
    const dy = y - aim.ey;
    const dz = z - aim.ez;
    const d = Math.hypot(dx, dy, dz);
    const R = this.range;
    if (d > R + 0.4 || d < 1e-3) return 0;
    const cos = (dx * aim.dx + dy * aim.dy + dz * aim.dz) / d;
    if (cos > CONE || (d < 2 && cos > NEAR_CONE)) return 0.35 + 0.65 * (1 - d / (R + 0.4));
    return 0;
  }

  private pull(b: { x: number; y: number; z: number; vx: number; vy: number; vz: number }, aim: Aim, k: number, dt: number): number {
    const dx = aim.mx - b.x;
    const dy = aim.my - b.y;
    const dz = aim.mz - b.z;
    const d = Math.hypot(dx, dy, dz) || 1e-3;
    const a = 34 * k + 10;
    b.vx += (dx / d) * a * dt;
    b.vy += (dy / d) * a * dt + 6 * dt;
    b.vz += (dz / d) * a * dt;
    // Bleed off sideways speed so things stream in instead of orbiting.
    const along = (b.vx * dx + b.vy * dy + b.vz * dz) / d;
    const bleed = Math.exp(-5 * dt);
    b.vx = (dx / d) * along + (b.vx - (dx / d) * along) * bleed;
    b.vy = (dy / d) * along + (b.vy - (dy / d) * along) * bleed;
    b.vz = (dz / d) * along + (b.vz - (dz / d) * along) * bleed;
    const sp = Math.hypot(b.vx, b.vy, b.vz);
    const max = 16;
    if (sp > max) {
      b.vx *= max / sp;
      b.vy *= max / sp;
      b.vz *= max / sp;
    }
    return d;
  }

  private refuse(b: { vx: number; vy: number; vz: number }, aim: Aim, t: Thing): void {
    b.vx = aim.dx * 5;
    b.vy = 2.5;
    b.vz = aim.dz * 5;
    if (this.fullWait <= 0) {
      this.fullWait = 0.7;
      this.emit({ t: 'full', thing: t });
    }
  }

  private bellows(dt: number, c: Controls, aim: Aim): void {
    const s = this.s;
    this.fullWait -= dt;
    this.puffWait -= dt;
    this.drawing = c.draw;
    this.drawPower = damp(this.drawPower, c.draw ? 1 : 0, c.draw ? 8 : 5, dt);
    for (const d of s.downies) d.held = false;
    // How fast the aim is turning (rad/s, smoothed): a penned downy comes only to an aim held still on it.
    const turn = Math.acos(clamp(aim.dx * this.lastAim[0] + aim.dy * this.lastAim[1] + aim.dz * this.lastAim[2], -1, 1));
    this.lastAim[0] = aim.dx;
    this.lastAim[1] = aim.dy;
    this.lastAim[2] = aim.dz;
    if (dt > 0) this.aimSpin = damp(this.aimSpin, turn / dt, 14, dt);
    // A press that starts aimed at food or fluff (even past Pull's reach) is a pull for that, and never takes a penned downy.
    if (c.draw && !this.wasDraw) this.pressFood = this.aimedAtThing(aim);
    this.wasDraw = c.draw;
    if (c.draw) {
      // Downies come only when the crosshair is on them: the cone sweeps up food
      // and fluff, never a downy standing beside them.
      const aimed = this.aimedDowny(aim);
      // A pull with food or fluff in its cone never takes a penned downy of yours (the third playtest's
      // sweeps of a pen's fluff took a penned downy 3 times in 9).
      let sweeping = false;
      for (const it of s.items) {
        if (it.gone || it.noPull > 0 || (it.flyT >= 0 && it.flyT < 0.3)) continue;
        if (this.inCone(aim, it.x, it.y, it.z) > 0) {
          sweeping = true;
          break;
        }
      }
      this.sweptT = sweeping ? 0 : this.sweptT + dt;
      for (const d of s.downies) {
        if (d.gone || (d.flyT >= 0 && d.flyT < 0.35) || d.noPull > 0) {
          d.drawn = 0;
          continue;
        }
        const k = this.inCone(aim, d.x, d.y + 0.25, d.z);
        // One already coming in keeps coming while it stays in the cone.
        if (d.drawn <= 0 || k <= 0) {
          d.drawn = 0;
          if (d !== aimed) continue;
          const penned = d.tame && d.pen >= 0;
          if (penned && (this.pressFood || this.sweptT < SWEPT || this.aimSpin > STEADY)) {
            d.tug = 0;
            continue;
          }
          // A wild one digs in and fights in its own way before it comes loose; a penned one of yours
          // takes a moment of aim held still on it, so a pull sweeping fluff up in the pen leaves it be.
          const need = this.tugNeed(d);
          if (d.tug < need) {
            const wildOne = !d.tame && !d.keep;
            if (d.tug === 0 && !d.tame) this.emit({ t: 'squeak', x: d.x, y: d.y, z: d.z, kind: d.kind });
            if (wildOne && d.strain <= 0) {
              // The fight starts: it starts fighting at once, in its own way (its next jink comes soon). A rare one
              // lured when it starts stays lured through it.
              d.strain = 1e-4;
              if (d.rare && rareLured(d)) d.calm = Math.max(d.calm, need * 3);
              const j = CATCH[d.kind].jink;
              d.hopT = Math.min(d.hopT, j[0] + this.rand() * (j[1] - j[0]) * 0.5);
            }
            d.held = true;
            if (wildOne && d.back > 0) {
              // It is pulling back and you are holding on: no headway, and the line strains. Hold on past its
              // grace and it slips free.
              d.backHeld += dt;
              if (d.backHeld >= this.backGrace(d)) {
                this.slip(d);
                continue;
              }
              this.pullingBack(d, aim, dt, 1.1);
              continue;
            }
            d.tug = Math.min(need, d.tug + dt);
            if (wildOne && d.tug < need) {
              // Its next pull back comes after a while of pulling.
              if (d.backT < 0) d.backT = this.nextBack(d);
              d.backT -= dt;
              if (d.backT <= 0) this.pullBack(d);
            }
            if (!d.tame) this.struggle(d, aim, dt, d.tug / need, wildOne);
            continue;
          }
          if (need > 0 && !d.tame) this.emit({ t: 'squeak', x: d.x, y: d.y, z: d.z, kind: d.kind });
        }
        d.drawn += dt;
        d.grounded = false;
        d.target = null;
        const dist = this.pull(d, aim, Math.max(k, 0.35), dt);
        if (dist < ABSORB) {
          // Into the jar with its hunger, the day it was caught (today, if it was wild) and whether it is the board's rare one.
          const wildOne = !d.tame && !d.keep;
          if (this.stow(d.kind, 0, { h: d.hunger, c: wildOne ? s.day : d.caught, ...(d.rare ? { rare: true } : {}) })) {
            d.gone = true;
            s.stats.drawn++;
            this.emit({ t: 'suck', thing: d.kind, x: d.x, y: d.y, z: d.z, wild: !d.tame && !d.keep });
            if (!s.caught.includes(d.kind)) {
              s.caught.push(d.kind);
              this.emit({ t: 'first', kind: d.kind });
            }
            if (d.kind === 'clover') this.complete('catch');
            if (d.kind === 'ember') this.complete('ember');
            if (d.kind === 'thistle') this.complete('thistle');
            this.firstDraw();
          } else this.refuse(d, aim, d.kind);
        }
      }
      // Pulling against a wild downy (the fight under way, or it coming in), the bellows is busy with it: food
      // and fluff in the cone stay put, and any on its way drops.
      let fight = false;
      for (const d of s.downies) if (!d.gone && !d.tame && !d.keep && (d.strain > 0 || d.drawn > 0)) fight = true;
      for (const it of s.items) {
        if (it.gone || (it.flyT >= 0 && it.flyT < 0.3) || it.noPull > 0 || fight) {
          it.drawn = 0;
          continue;
        }
        const k = this.inCone(aim, it.x, it.y, it.z);
        if (k <= 0) {
          it.drawn = 0;
          continue;
        }
        if (it.rest) {
          it.rest = false;
          it.src = -1;
        }
        // This press has drawn food or fluff: it leaves penned downies be until it is let go.
        this.pressFood = true;
        it.drawn += dt;
        it.grounded = false;
        it.idle = 0;
        it.spinV = 14;
        const dist = this.pull(it, aim, k, dt);
        if (dist < ABSORB) {
          if (this.stow(it.type, it.feed)) {
            it.gone = true;
            s.stats.drawn++;
            this.emit({ t: 'suck', thing: it.type, x: it.x, y: it.y, z: it.z });
            this.firstDraw();
          } else this.refuse(it, aim, it.type);
        }
      }
      for (const n of s.nettles) {
        if (this.inCone(aim, n.x, n.y + 0.2, n.z) > 0) {
          if (n.bristle < 0.2) this.emit({ t: 'nettle', x: n.x, y: n.y, z: n.z });
          n.bristle = 1;
        }
      }
      // Silos give up their chosen kind to a draw at the outlet.
      this.siloT -= dt;
      if (this.siloT <= 0) {
        s.pads.forEach((p, i) => {
          if (p.kind !== 'silo' || !p.silo.length) return;
          const o = padSpots(i).outlet;
          const oy = this.phys.floor(o.x, o.z) + o.y;
          if (this.inCone(aim, o.x, oy, o.z) <= 0) return;
          const bin = p.silo[Math.min(p.siloSel, p.silo.length - 1)];
          if (!bin || bin.n <= 0) return;
          if (this.accept(bin.t) < 0) return;
          bin.n--;
          const it = newItem(s, bin.t, o.x, oy, o.z);
          it.flyT = 0.4;
          s.items.push(it);
          if (bin.n <= 0) {
            p.silo = p.silo.filter((b) => b.n > 0);
            p.siloSel = 0;
          }
          this.siloT = 0.14;
        });
      }
    } else {
      for (const d of s.downies) d.drawn = 0;
      for (const it of s.items) it.drawn = 0;
    }

    // A window that ran out under a held Blow waits for a fresh press before the next kind goes.
    if (!c.puff || c.puffPressed) this.waitRelease = false;
    const fire = ((c.puffPressed && this.puffWait <= 0.13) || (c.puff && this.puffWait <= 0)) && !this.waitRelease;
    if (fire && !c.draw) {
      this.puffWait = 0.25;
      this.puff(aim, c.puffPressed);
    }
  }

  /**
   * The next window in a direction (1 or -1) that holds something, skipping
   * empty ones, or the chosen window if no other holds anything. Q, R, the
   * wheel, LB and RB step with it (the third playtest's Q stepped through
   * empty windows, and a Blow mid-step sent clover heads at the crate).
   */
  stepWindow(dir: number): number {
    const s = this.s;
    const n = s.slots.length;
    for (let k = 1; k < n; k++) {
      const i = (((s.sel + dir * k) % n) + n) % n;
      if (s.slots[i].t && s.slots[i].n > 0) return i;
    }
    return s.sel;
  }

  /** Choose the next window after the chosen one that holds something. False if nothing is aboard. */
  private chooseNext(): boolean {
    const s = this.s;
    for (let k = 1; k <= s.slots.length; k++) {
      const i = (s.sel + k) % s.slots.length;
      if (s.slots[i].t && s.slots[i].n > 0) {
        s.sel = i;
        return true;
      }
    }
    return false;
  }

  /** What the crosshair is on: something drawable, a prickly nettleback, or nothing. */
  aimTarget(aim: Aim): 'target' | 'prickly' | 'sell' | 'pen' | 'feeder' | null {
    const s = this.s;
    for (const n of s.nettles) if (!n.gone && this.inCone(aim, n.x, n.y + 0.2, n.z) > 0) return 'prickly';
    if (this.wouldSell(aim)) return 'sell';
    if (this.wouldPen(aim) >= 0) return 'pen';
    if (this.wouldFeed(aim) >= 0) return 'feeder';
    if (this.aimedDowny(aim)) return 'target';
    // Only what is under the crosshair and within Pull's reach: not something at the cone's edge while you aim past it.
    for (const it of s.items) if (!it.gone && it.noPull <= 0 && this.underAim(aim, it.x, it.y, it.z)) return 'target';
    return null;
  }

  /** Is a point within Pull's reach and close to the crosshair's line? */
  private underAim(aim: Aim, x: number, y: number, z: number): boolean {
    const dx = x - aim.ex;
    const dy = y - aim.ey;
    const dz = z - aim.ez;
    const d = Math.hypot(dx, dy, dz);
    if (d > this.range + 0.4 || d < 1e-3) return false;
    const ang = Math.acos(clamp((dx * aim.dx + dy * aim.dy + dz * aim.dz) / d, -1, 1));
    return ang < Math.max(Math.atan2(0.45, d), 0.09);
  }

  /**
   * Is the crosshair on food or fluff, within reach or up to PRESS_LOOK past
   * it (and not squarely on a penned downy of yours in front of it)? Asked as
   * a press of Pull starts.
   */
  private aimedAtThing(aim: Aim): boolean {
    const s = this.s;
    let best = Infinity;
    let bestD = 0;
    const far = this.range + 0.4 + PRESS_LOOK;
    for (const it of s.items) {
      if (it.gone || it.noPull > 0) continue;
      const dx = it.x - aim.ex;
      const dy = it.y - aim.ey;
      const dz = it.z - aim.ez;
      const d = Math.hypot(dx, dy, dz);
      if (d > far || d < 1e-3) continue;
      const r = Math.acos(clamp((dx * aim.dx + dy * aim.dy + dz * aim.dz) / d, -1, 1)) / Math.max(Math.atan2(0.45, d), 0.09);
      if (r < best) {
        best = r;
        bestD = d;
      }
    }
    if (best >= 1) return false;
    // A penned downy squarely under the crosshair, in front of the food, is what you meant to pull.
    for (const d of s.downies) {
      if (d.gone || !d.tame || d.pen < 0) continue;
      const dx = d.x - aim.ex;
      const dy = d.y + 0.25 - aim.ey;
      const dz = d.z - aim.ez;
      const dist = Math.hypot(dx, dy, dz);
      if (dist >= bestD || dist < 1e-3) continue;
      const ang = Math.acos(clamp((dx * aim.dx + dy * aim.dy + dz * aim.dz) / dist, -1, 1));
      if (ang / Math.max(Math.atan2(d.r, dist), 0.035) < 0.6) return false;
    }
    return true;
  }

  /**
   * The downy under the crosshair, if any: within reach, and the aim within
   * its body (with a little give for thumbs). Food or fluff nearer the
   * crosshair wins, so pulling fluff up beside a downy leaves the downy be.
   */
  aimedDowny(aim: Aim): Downy | null {
    const s = this.s;
    const R = this.range + 0.4;
    let best: Downy | null = null;
    let bs = 1;
    let ba = 0;
    let penned = false;
    for (const d of s.downies) {
      if (d.gone || (d.flyT >= 0 && d.flyT < 0.35) || d.noPull > 0) continue;
      const dx = d.x - aim.ex;
      const dy = d.y + 0.25 - aim.ey;
      const dz = d.z - aim.ez;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > R || dist < 1e-3) continue;
      const ang = Math.acos(clamp((dx * aim.dx + dy * aim.dy + dz * aim.dz) / dist, -1, 1));
      // Your penned downies come only when aimed at directly (no give for thumbs); one already tugging keeps a little more give.
      const inPen = d.tame && d.pen >= 0;
      // A wild one's give is its kind's (a brook is slippery); yours and the porch downy keep the thumb's give.
      const give = !d.tame && !d.keep ? CATCH[d.kind].give * (d.rare ? RARE_FIGHT.give : 1) : 0.3;
      let tol = inPen ? Math.max(Math.atan2(d.r, dist), 0.035) : Math.max(Math.atan2(d.r + give, dist), 0.07 * (give / 0.3));
      if (d.tug > 0) tol *= 1.3;
      if (ang / tol < bs) {
        bs = ang / tol;
        best = d;
        ba = ang;
        penned = inPen;
      }
    }
    if (!best) return null;
    // A wild one already tugging against you keeps the pull: food in the cone never steals it (the fourth
    // playtest's careful pulls at a brook drew dewberries in 3 tries of 4).
    if (!best.tame && !best.keep && (best.tug > 0 || best.strain > 0)) return best;
    // Nor does food beat a wild one with the crosshair on its very body (the fifth playtest's careful pulls at
    // embers drew sweetroot instead in 3 tries of 8).
    if (!best.tame && !best.keep && ba < Math.atan2(best.r, Math.hypot(best.x - aim.ex, best.y + 0.25 - aim.ey, best.z - aim.ez))) return best;
    // Food or fluff nearer the crosshair wins (by a wider margin over a penned downy).
    const beat = penned ? Math.max(ba * 1.6, 0.03) : ba * 0.8;
    for (const it of s.items) {
      if (it.gone || it.noPull > 0) continue;
      const dx = it.x - aim.ex;
      const dy = it.y - aim.ey;
      const dz = it.z - aim.ez;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > R || dist < 1e-3) continue;
      if (Math.acos(clamp((dx * aim.dx + dy * aim.dy + dz * aim.dz) / dist, -1, 1)) < beat) return null;
    }
    return best;
  }

  /** Seconds of steady pull before a downy comes loose: wild ones dig in (each kind its own), yours come at once, a penned one to a still aim. */
  tugNeed(d: Downy): number {
    if (d.tame) return d.pen >= 0 ? PEN_TUG : 0;
    if (d.keep) return 0.35;
    return CATCH[d.kind].need * (d.wary > 0 ? ESCAPE.waryNeed : 1) * (d.rare ? RARE_FIGHT.need : 1);
  }

  /** Seconds of pulling until a wild one's next pull back (the rare one's come sooner). */
  private nextBack(d: Downy): number {
    const t = d.rare ? RARE_TUG : TUG[d.kind];
    return t.every[0] + this.rand() * (t.every[1] - t.every[0]);
  }

  /** Seconds of holding on through its pull back before it slips free (long while the lesson is teaching it). */
  backGrace(d: Downy): number {
    if (!this.knows('ease')) return TEACH_BACK.grace;
    return (d.rare ? RARE_TUG : TUG[d.kind]).grace;
  }

  /** It pulls back: the ring turns warm and it squeaks. While the lesson teaches it, it lasts until you let go. */
  private pullBack(d: Downy): void {
    const t = d.rare ? RARE_TUG : TUG[d.kind];
    d.back = this.knows('ease') ? t.dur[0] + this.rand() * (t.dur[1] - t.dur[0]) : TEACH_BACK.dur;
    d.backHeld = 0;
    d.eased = false;
    d.backT = -1;
    d.squashV -= 4;
    this.emit({ t: 'pullback', x: d.x, y: d.y, z: d.z, kind: d.kind });
  }

  /** Pulling back: it digs in and edges away from you (faster while you strain against it), shaking. */
  private pullingBack(d: Downy, aim: Aim, dt: number, k: number): void {
    const dx = d.x - aim.ex;
    const dz = d.z - aim.ez;
    const l = Math.hypot(dx, dz) || 1;
    d.x += (dx / l) * 0.55 * k * dt;
    d.z += (dz / l) * 0.55 * k * dt;
    d.yaw = Math.atan2(dx, dz);
    d.target = null;
    if (this.rand() < dt * 10) d.squashV += 2.5;
  }

  /** Held on through its pull back: it slips free, a hop of a few metres away from you. Not lost: try again. */
  private slip(d: Downy): void {
    const p = this.s.player;
    d.tug = 0;
    d.strain = 0;
    d.peak = 0;
    d.held = false;
    d.back = 0;
    d.backT = -1;
    d.backHeld = 0;
    d.easeT = 0;
    d.noPull = SLIP.noPull;
    d.target = null;
    const a = Math.atan2(d.z - p.z, d.x - p.x) + (this.rand() - 0.5) * 1.2;
    d.vx = Math.cos(a) * SLIP.speed;
    d.vz = Math.sin(a) * SLIP.speed;
    d.vy = SLIP.up;
    d.grounded = false;
    d.flyT = -1;
    d.hopT = 0.35;
    d.squashV += 4;
    this.emit({ t: 'squeak', x: d.x, y: d.y, z: d.z, kind: d.kind });
    this.emit({ t: 'slip', x: d.x, y: d.y, z: d.z, kind: d.kind });
  }

  /**
   * A downy digging in against the pull: it creeps your way as it tires and
   * shakes. A wild one jinks in its own way (see CATCH): little hops for a
   * clover, fast low darts for an ember, so you keep the crosshair on it to
   * hold it (the porch downy only dodges a little).
   */
  private struggle(d: Downy, aim: Aim, dt: number, k: number, jinks: boolean): void {
    const dx = aim.ex - d.x;
    const dz = aim.ez - d.z;
    const l = Math.hypot(dx, dz) || 1;
    const creep = 0.2 + 0.7 * k;
    d.x += (dx / l) * creep * dt;
    d.z += (dz / l) * creep * dt;
    d.yaw = Math.atan2(-dx, -dz);
    d.target = null;
    const c = CATCH[d.kind];
    // A wild one's hop timer (its own hopping waits while it is held) times the jinks.
    if (jinks) d.hopT -= dt;
    if (d.grounded && (jinks ? d.hopT <= 0 : this.rand() < dt * 3)) {
      const side = this.rand() < 0.5 ? -1 : 1;
      const sp = jinks ? c.dash[0] + this.rand() * (c.dash[1] - c.dash[0]) : 0.9;
      // Sideways; a brook slips off towards the pond instead, half sideways and half away.
      let hx = (-dz / l) * side;
      let hz = (dx / l) * side;
      if (jinks && d.kind === 'brook') {
        const px = POND.x - d.x;
        const pz = POND.z - d.z;
        const pl = Math.hypot(px, pz) || 1;
        hx = hx * 0.6 + (px / pl) * 0.8;
        hz = hz * 0.6 + (pz / pl) * 0.8;
      }
      // Never towards you: a glide goes sideways or away, not under the view (the fourth playtest's brook
      // glided under it at 0.8 m, then dove).
      const towards = (hx * dx + hz * dz) / l;
      if (towards > 0) {
        hx -= (dx / l) * towards;
        hz -= (dz / l) * towards;
      }
      const hl = Math.hypot(hx, hz);
      if (hl < 0.2) {
        hx = (-dz / l) * side;
        hz = (dx / l) * side;
      } else {
        hx /= hl;
        hz /= hl;
      }
      d.vx = hx * sp;
      d.vz = hz * sp;
      d.vy = jinks ? c.up : 1.5;
      d.grounded = false;
      d.squashV += 3;
      if (jinks) d.hopT = c.jink[0] + this.rand() * (c.jink[1] - c.jink[0]);
    }
  }

  /**
   * A wild downy breaks free: a long leap away, and the bellows cannot take it
   * for a moment. A brook by the pond leaps into the water and is gone; a
   * thistle bolts.
   */
  private escape(d: Downy): void {
    const p = this.s.player;
    d.tug = 0;
    d.strain = 0;
    d.peak = 0;
    d.back = 0;
    d.backT = -1;
    d.easeT = 0;
    d.held = false;
    d.noPull = GOT_AWAY;
    d.alert = true;
    d.target = null;
    d.calm = 0;
    let a = Math.atan2(d.z - p.z, d.x - p.x) + (this.rand() - 0.5) * 0.7;
    let sp = 4.6;
    const pond = Math.hypot(d.x - POND.x, d.z - POND.z);
    // (The board's rare brook never dives: it would be gone for good.)
    const dove = d.kind === 'brook' && pond < POND.r + 9 && !d.rare;
    if (dove) {
      // Into the water, towards the middle of the pond; if you stand between, round you rather than past your face.
      a = Math.atan2(POND.z - d.z, POND.x - d.x);
      const toYou = Math.atan2(p.z - d.z, p.x - d.x);
      const off = angleTo(toYou, a);
      if (Math.abs(off) < 0.9 && Math.hypot(p.x - d.x, p.z - d.z) < pond) a = toYou + (off >= 0 ? 0.9 : -0.9);
      sp = Math.min(8, (pond - POND.r + 2.5) / 0.9);
      d.dive = true;
    }
    d.bolt = d.kind === 'thistle' ? ESCAPE.thistle : ESCAPE.bolt;
    d.wary = ESCAPE.wary;
    d.vx = Math.cos(a) * sp;
    d.vz = Math.sin(a) * sp;
    d.vy = 4.2;
    d.grounded = false;
    d.flyT = -1;
    d.hopT = 0.05;
    d.squashV += 4;
    this.emit({ t: 'squeak', x: d.x, y: d.y, z: d.z, kind: d.kind });
    this.emit({ t: 'escape', x: d.x, y: d.y, z: d.z, kind: d.kind, dove });
  }

  private firstDraw(): void {
    if (!this.s.journal) this.s.journal = true;
  }

  /** Blow one of the chosen window's things out. pressed: a fresh press (not a held repeat). */
  puff(aim: Aim, pressed = true): void {
    const s = this.s;
    // The chosen window is empty but something is aboard: choose the next window that holds something.
    if (!s.slots[s.sel].t || s.slots[s.sel].n <= 0) this.chooseNext();
    const slot = s.slots[s.sel];
    const p = s.player;
    if (!slot.t || slot.n <= 0) {
      // Nothing aboard: an empty blow still pushes a puff of air. It sends a pest in front of you rolling (the
      // sixth playtest's empty Blow at a pest 3.5 m off did nothing but say "Nothing in the jar."), shoves light
      // things about, and says why nothing came out if it moved no pest.
      this.emit({ t: 'puff', thing: null });
      let shooed = false;
      for (const n of s.nettles) {
        if (n.gone || n.mode === 'roll') continue;
        const dx = n.x - aim.ex;
        const dy = n.y + 0.25 - aim.ey;
        const dz = n.z - aim.ez;
        const d = Math.hypot(dx, dy, dz);
        if (d > AIR_REACH || (dx * aim.dx + dy * aim.dy + dz * aim.dz) / (d || 1) < 0.8) continue;
        const hl = Math.hypot(dx, dz) || 1;
        n.mode = 'roll';
        n.vx = (dx / hl) * 6;
        n.vz = (dz / hl) * 6;
        this.emit({ t: 'nettlehit', x: n.x, y: n.y, z: n.z });
        shooed = true;
      }
      if (pressed && !shooed) this.emit({ t: 'deny', why: 'Nothing in the jar.' });
      for (const it of s.items) {
        if (it.gone) continue;
        const dx = it.x - aim.ex;
        const dz = it.z - aim.ez;
        const d = Math.hypot(dx, it.y - aim.ey, dz);
        if (d < 3.5 && (dx * aim.dx + (it.y - aim.ey) * aim.dy + dz * aim.dz) / (d || 1) > 0.8) {
          it.rest = false;
          it.src = -1;
          it.vx += aim.dx * 5;
          it.vy += 2.5;
          it.vz += aim.dz * 5;
          it.grounded = false;
        }
      }
      return;
    }
    const feed = isTuft(slot.t) ? (slot.feeds?.shift() ?? 0) : 0;
    const kind = slot.t;
    const rec = isDowny(kind) ? this.takeDown(slot) : null;
    const t = rec ? kind : this.takeOne(slot)!;
    if (slot.n <= 0) {
      // Run out: the next window that holds something is chosen, ready for the next press.
      this.chooseNext();
      this.waitRelease = true;
    }
    const sp = 14;
    const x = aim.mx + aim.dx * 0.3;
    const y = aim.my + aim.dy * 0.3;
    const z = aim.mz + aim.dz * 0.3;
    if (isDowny(t)) {
      const d = newDowny(s, t, x, y - 0.25, z);
      d.vx = aim.dx * sp + p.vx * 0.5;
      d.vy = aim.dy * sp + 1.6;
      d.vz = aim.dz * sp + p.vz * 0.5;
      d.flyT = 0;
      d.tame = true;
      // It keeps its hunger through the jar (the fifth playtest's 0.06 came out 0.37), and when it was caught.
      d.hunger = rec!.h;
      d.caught = rec!.c;
      d.rare = !!rec!.rare;
      d.squash = 1.3;
      d.yaw = Math.atan2(aim.dx, aim.dz);
      // A blown downy remembers where you stood (a pen helps in only one blown from outside it).
      d.homeX = p.x;
      d.homeZ = p.z;
      this.overRail(d);
      s.downies.push(d);
    } else {
      const it = newItem(s, t, x, y, z);
      it.vx = aim.dx * sp + p.vx * 0.5;
      it.vy = aim.dy * sp + 1.4;
      it.vz = aim.dz * sp + p.vz * 0.5;
      it.flyT = 0;
      it.spinV = 10;
      it.blown = true;
      it.feed = feed;
      s.items.push(it);
    }
    this.emit({ t: 'puff', thing: t });
  }

  /**
   * Tips a whole window out onto the ground just in front of you, so a full
   * jar never means blowing things out one by one. Returns how many came out.
   */
  empty(i: number, aim: Aim): number {
    const s = this.s;
    const slot = s.slots[i];
    if (!slot || !slot.t || slot.n <= 0) return 0;
    const t = slot.t;
    const n = slot.n;
    const feeds = slot.feeds ?? [];
    // The fluff window tips out every kind in it; a downy's window each downy as it went in.
    const kinds: Thing[] = isTuft(t) ? [...mixOf(slot)] : [];
    const downs = isDowny(t) ? [...downsOf(slot)] : [];
    slot.t = null;
    slot.n = 0;
    slot.feeds = undefined;
    slot.mix = undefined;
    slot.downs = undefined;
    const p = s.player;
    const hl = Math.hypot(aim.dx, aim.dz) || 1;
    const fx = aim.dx / hl;
    const fz = aim.dz / hl;
    // Tossed a few metres ahead (not dropped at your feet), and left alone by the bellows for a moment,
    // so the next pull does not sweep them straight back in.
    for (let k = 0; k < n; k++) {
      const a = this.rand() * Math.PI * 2;
      const r = Math.sqrt(this.rand()) * 0.25;
      const x = p.x + fx * 0.8 + Math.cos(a) * r;
      const z = p.z + fz * 0.8 + Math.sin(a) * r;
      const y = p.y + 1.15 + k * 0.01;
      const sp = 4.2 + this.rand() * 1.4;
      const side = (this.rand() - 0.5) * 1.6;
      if (isDowny(t)) {
        const d = newDowny(s, t, x, y, z);
        d.tame = true;
        const rec = downs[k] ?? NO_REC;
        d.hunger = rec.h;
        d.caught = rec.c;
        d.rare = !!rec.rare;
        d.vx = fx * sp * 0.75 - fz * side;
        d.vz = fz * sp * 0.75 + fx * side;
        d.vy = 3;
        d.flyT = 0.4;
        d.noPull = TIP_IGNORE;
        d.yaw = Math.atan2(fx, fz);
        d.homeX = p.x;
        d.homeZ = p.z;
        s.downies.push(d);
      } else {
        const it = newItem(s, (kinds[k] ?? t) as ItemType, x, y, z);
        it.vx = fx * sp - fz * side;
        it.vz = fz * sp + fx * side;
        it.vy = 2.4 + this.rand() * 0.6;
        it.spinV = 6;
        it.flyT = 0.3;
        it.noPull = TIP_IGNORE;
        // Tipped out on purpose, it is still yours: food to feed with, fluff to sell (the crate may take it).
        it.blown = true;
        it.feed = feeds[k] ?? 0;
        s.items.push(it);
      }
    }
    if (i === s.sel) this.chooseNext();
    this.emit({ t: 'empty', thing: t, n, mixed: kinds.some((k) => k !== t) });
    return n;
  }

  // ------------------------------------------------------------ downies

  private penCounts: number[] = [0, 0, 0, 0, 0, 0];
  private penKinds: number[][] = PADS.map(() => [0, 0, 0, 0]);
  /** A rare one of yours is in this pen: everyone in it sheds one more fluff a meal. */
  private penRare: boolean[] = PADS.map(() => false);
  /** Night: penned downies doze, and their hunger runs slower. */
  private dozing = false;

  private updateDownies(dt: number): void {
    const s = this.s;
    const ds = s.downies;
    this.penCounts.fill(0);
    this.penRare.fill(false);
    for (const row of this.penKinds) row.fill(0);
    for (const d of ds) {
      if (d.gone || d.pen < 0) continue;
      this.penCounts[d.pen]++;
      this.penKinds[d.pen][KINDS.indexOf(d.kind)]++;
      if (d.rare && d.tame) this.penRare[d.pen] = true;
    }
    this.dozing = s.hour >= 21 || s.hour < 5;
    const p = s.player;
    const running = Math.hypot(p.vx, p.vz) > 5.5;
    // While the clock is held for the lessons, your downies' hunger waits with it (penned, loose or on the porch),
    // and until the day runs on none of yours goes past hungry into starving.
    this.hungerWaits = this.clockHeld && !this.knows('appetite');
    this.hungerCap = this.teaching && !this.knows('time') ? 0.8 : 1;
    for (const d of ds) {
      if (d.gone) continue;
      this.updateDowny(d, dt, p.x, p.z, running);
    }
    // Soft bumps between downies.
    for (let i = 0; i < ds.length; i++) {
      const a = ds[i];
      if (a.gone || a.drawn > 0) continue;
      for (let j = i + 1; j < ds.length; j++) {
        const b = ds[j];
        if (b.gone || b.drawn > 0) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        if (Math.abs(dx) > 0.6 || Math.abs(dz) > 0.6 || Math.abs(b.y - a.y) > 0.5) continue;
        const d = Math.hypot(dx, dz);
        const min = a.r + b.r;
        if (d >= min || d < 1e-4) continue;
        const push = (min - d) * 0.5;
        a.x -= (dx / d) * push;
        a.z -= (dz / d) * push;
        b.x += (dx / d) * push;
        b.z += (dz / d) * push;
      }
    }
  }

  private hungerWaits = false;
  private hungerCap = 1;

  private updateDowny(d: Downy, dt: number, px: number, pz: number, running: boolean): void {
    const s = this.s;
    const info = KIND[d.kind];
    const wild = !d.tame;
    const kindIdx = KINDS.indexOf(d.kind);
    const company = d.pen >= 0 && this.penKinds[d.pen][kindIdx] > 1;
    // Penned downies settle: their hunger runs a third as fast as out in the open.
    let rate = (HUNGER_RATE / HOUR) * (wild ? 0.5 : 1) * (d.pen >= 0 ? PEN_HUNGER : 1) * (company ? 0.85 : 1);
    // A penned one already hungry waits patiently, and at night it dozes: the same meals by day, but a day away
    // or a night with no feeder no longer starves a pen (the sixth playtest's clovers woke starving after one night).
    if (d.pen >= 0 && !wild) rate *= (d.hunger >= 0.5 ? PEN_PATIENT : 1) * (this.dozing ? PEN_DOZE : 1);
    const yours = d.tame || d.keep;
    if (!(this.hungerWaits && yours)) d.hunger = Math.min(wild ? 0.7 : 1, d.hunger + rate * dt);
    if (yours && d.hunger > this.hungerCap) d.hunger = this.hungerCap;
    if (d.noPull > 0) d.noPull -= dt;
    d.starveT = d.hunger >= 1 ? d.starveT + dt / HOUR : 0;
    d.sinceFed += dt / HOUR;
    d.fright = Math.max(0, d.fright - dt);
    // Its pull back runs its time (a let-go pull holds what it had through it, and a moment after), then it pulls
    // no more until you have pulled a while again. While the lesson teaches it, it stops once you let go.
    if (d.back > 0) {
      if (!d.held) {
        if (!d.eased && !this.knows('ease')) d.back = Math.min(d.back, 0.3);
        d.eased = true;
      }
      d.back -= dt;
      if (d.back <= 0) {
        d.back = 0;
        d.easeT = EASE_HOLD;
        d.backT = this.nextBack(d);
        this.emit({ t: 'eased', x: d.x, y: d.y, z: d.z, kind: d.kind, eased: d.eased });
      } else if (!d.held && wild && !d.keep) this.pullingBack(d, { ex: px, ez: pz } as Aim, dt, 0.5);
    }
    if (d.easeT > 0) d.easeT -= dt;
    // A pull that slips off fades (a wild one's at its kind's rate: an ember's darts give you a moment to find it again).
    if (!d.held && d.back <= 0 && d.easeT <= 0) d.tug = Math.max(0, d.tug - dt * (wild && !d.keep ? CATCH[d.kind].fade : 1.5));
    if (d.bolt > 0) d.bolt -= dt;
    if (d.wary > 0) d.wary -= dt;
    // A wild one fighting the pull gets away if you are slow (its kind's limit), or if the pull lapses once it
    // was well on its way. Coming in, the fight is won.
    if (d.drawn > 0) {
      d.strain = 0;
      d.peak = 0;
      d.back = 0;
      d.easeT = 0;
    } else if (wild && !d.keep && d.strain > 0) {
      // (Its time, for one that has one, waits while it pulls back.)
      if (d.back <= 0) d.strain += dt;
      d.peak = Math.max(d.peak, d.tug / CATCH[d.kind].need);
      // One with a time (a brook, a thistle) breaks free when its time runs out, shown on the tug ring; one
      // without (a clover, an ember) when the pull lapses once it was a third of the way in. (The fifth
      // playtest's careless thumb lost all ten brooks to a lapse, each into the pond.)
      const lim = fightLimit(d);
      if ((lim > 0 && d.strain >= lim) || (lim <= 0 && d.tug <= 0 && d.peak >= SHAKE_LOOSE)) this.escape(d);
      else if (d.tug <= 0 && d.back <= 0) {
        d.strain = 0;
        d.peak = 0;
        d.backT = -1;
      }
    }
    const crowded = d.pen >= 0 && this.penCounts[d.pen] > PEN_MAX;
    // Hunger alone never frazzles: a starving downy still eats and sheds. Fright,
    // crowding and long neglect do.
    const restless = d.starveT >= NEGLECT_HOURS;
    const was = d.mood;
    d.mood = crowded || d.fright > 0 || restless ? 'frazzled' : d.hunger > 0.5 ? 'hungry' : d.sinceFed < 1 ? 'content' : 'calm';
    // A wild one notices you close by and hops away (yours and the porch downy do not). A thistle hears you
    // from further off, walking or running, and bolts.
    const pd0 = Math.hypot(d.x - px, d.z - pz);
    const thistle = d.kind === 'thistle';
    let alert = wild && !d.keep && d.drawn === 0 && !d.held && pd0 < (running || thistle || d.wary > 0 ? NOTICE_RUN : NOTICE) && Math.abs(d.y - s.player.y) < (thistle ? 9 : 3);
    // The board's rare one is warier than any: unlured it hears a walker from 13 m (a plain downy, 9) and bolts.
    // Lured by its favourite food (going to it, eating it, and a while after) it lets you near.
    if (wild && d.rare) {
      if (d.calm > 0) d.calm -= dt;
      // A fight begun while it was lured keeps it lured to the end (its pulls back make the fight a long one).
      if (d.calm > 0 && (d.strain > 0 || d.back > 0 || d.easeT > 0)) d.calm = Math.max(d.calm, 0.5);
      const lured = rareLured(d);
      // Its fed window ran out: say so (the seventh playtest walked up to "It heard you", the window gone unseen).
      if (d.lured && !lured && d.drawn === 0) this.emit({ t: 'unlured', x: d.x, y: d.y, z: d.z, kind: d.kind, near: pd0 < 30 });
      d.lured = lured;
      // Found: once you have been close, the arrow stays on it (fetching food for it does not lose it again).
      if (pd0 < RARE_SEEN) {
        const o = s.orders.find((q) => q.state === 'open' && q.rare && q.kind === d.kind);
        if (o?.rare && !o.rare.seen) o.rare.seen = true;
      }
      const w = RARE_WARY;
      alert = d.drawn === 0 && !d.held && pd0 < (lured ? (running ? w.nearRun : w.nearWalk) : running || d.wary > 0 ? w.run : w.walk) && Math.abs(d.y - s.player.y) < 4;
      if (alert && d.bolt <= 0 && !d.alert) {
        d.bolt = w.bolt;
        d.calm = 0;
        d.target = null;
        this.emit({ t: 'heard', x: d.x, y: d.y, z: d.z, kind: d.kind });
      }
      // Unlured, it keeps bolting while it hears you, faster than you run: chasing it does not work, luring does.
      if (alert && !lured) d.bolt = Math.max(d.bolt, 0.6);
      // Spooked, it runs until its bolt is spent, however far off you are.
      if (d.bolt > 0 && d.drawn === 0 && !d.held) alert = true;
    }
    if (alert && !d.alert) {
      this.emit({ t: 'squeak', x: d.x, y: d.y, z: d.z, kind: d.kind });
      d.hopT = Math.min(d.hopT, 0.12 + this.rand() * 0.15);
    }
    // A thistle bolts while it hears you, until it is winded: after BOLT_FOR seconds of running it slows to
    // ordinary hops for a while, so a walker who keeps after it can close in (a runner sooner).
    if (thistle && d.bolt > 0 && !d.tame) {
      d.run += dt;
      if (d.run >= ESCAPE.boltFor) {
        d.run = 0;
        d.bolt = 0;
        d.winded = ESCAPE.winded;
      }
    } else if (d.run > 0) d.run = Math.max(0, d.run - dt * 0.5);
    if (d.winded > 0) d.winded -= dt;
    if (alert && thistle && d.winded <= 0) d.bolt = Math.max(d.bolt, 0.6);
    d.alert = alert;
    if (d.mood === 'frazzled' && was !== 'frazzled' && d.drawn === 0) this.emit({ t: 'frazzle', x: d.x, y: d.y, z: d.z });
    d.blinkT -= dt;
    if (d.blinkT < -0.12) d.blinkT = 1.5 + this.rand() * 3.5;
    if (d.flyT >= 0) d.flyT += dt;

    // Motion. A downy blown at a pen is helped over the fence and in.
    if (d.flyT >= 0 && !d.grounded && d.drawn === 0 && this.penAssist) this.penPull(d, dt);
    const g = d.drawn > 0 ? 1.5 : G_DOWNY;
    if (!d.grounded) {
      d.vy -= g * dt;
      const drag = Math.exp(-(d.drawn > 0 ? 0.2 : 0.55) * dt);
      d.vx *= drag;
      d.vz *= drag;
    }
    // A downy of yours blown at the sell crate for today's live order (one caught today, or the board's rare one):
    // drawn in like fluff, and taken.
    const forCrate = d.flyT >= 0 && d.tame && d.drawn === 0 && this.wantsDowny(d.kind, d.caught, d.rare);
    if (forCrate) this.downyCratePull(d, dt);
    const ox = d.x;
    const oz = d.z;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.z += d.vz * dt;
    if (forCrate && this.inCrate(d.x, d.y, d.z) && this.sellDowny(d.kind, d.x, this.crateFloor + CRATE.h, d.z, d.caught, d.rare) >= 0) {
      d.gone = true;
      return;
    }
    if (d.drawn === 0) this.phys.collide(d, ox, oz, 'downy');
    const fl = this.phys.rest(d.x, d.z, true);
    if (d.y <= fl) {
      if (!d.grounded) {
        const impact = -d.vy;
        d.squashV -= Math.min(impact, 9) * 1.9;
        if (impact > 2.2) this.emit({ t: 'boing', x: d.x, y: d.y, z: d.z, v: clamp(impact / 9, 0, 1), kind: d.kind });
        if (waterAt(d.x, d.z) > fl - 0.1 && impact > 2) this.emit({ t: 'splash', x: d.x, y: fl, z: d.z });
        // A brook that got away, into the pond: gone (its group fills again out of sight).
        if (d.dive) {
          d.dive = false;
          if (waterAt(d.x, d.z) > fl - 0.1) {
            if (impact <= 2) this.emit({ t: 'splash', x: d.x, y: fl, z: d.z });
            d.gone = true;
            return;
          }
        }
        // Blown at the crate for an order that wants another (one caught today), or the rare one (it goes in a pen): say so.
        if (d.flyT >= 0 && d.tame && !forCrate && Math.hypot(d.x - CRATE_X, d.z - CRATE_Z) < PULL_R + 0.8) {
          const why = this.staleNote(d.kind, d.rare);
          if (why) this.emit({ t: 'deny', why });
        }
        d.flyT = -1;
        d.vx *= 0.25;
        d.vz *= 0.25;
        d.hopT = Math.min(d.hopT, 0.25 + this.rand() * 0.5);
      }
      d.y = fl;
      d.vy = 0;
      d.grounded = true;
      const f = Math.exp(-9 * dt);
      d.vx *= f;
      d.vz *= f;
    } else if (d.y > fl + 0.02) d.grounded = false;
    if (d.grounded) {
      const pen = this.phys.penAt(d.x, d.z);
      if (pen !== d.pen) {
        // Hopped out of its pen: it has strayed (the journal says so and points at it).
        if (d.pen >= 0 && pen < 0 && d.tame) {
          d.strayFrom = d.pen;
          this.emit({ t: 'stray', x: d.x, y: d.y, z: d.z, pen: d.pen });
        }
        const was = d.pen;
        d.pen = pen;
        if (pen >= 0) {
          d.tame = true;
          d.strayFrom = -1;
          if (was < 0) this.emit({ t: 'penned', pen });
          this.complete('pen');
          // The board's rare one, caught today, blown into a pen: it fills the order, and stays.
          if (d.rare && was < 0) this.rarePenned(d, pen);
        }
      }
    }

    // Player bumps.
    const pdx = d.x - px;
    const pdz = d.z - pz;
    const pd = Math.hypot(pdx, pdz);
    if (pd < 0.62 && d.grounded && pd > 1e-3 && Math.abs(d.y - s.player.y) < 1) {
      d.vx += (pdx / pd) * 2.4;
      d.vz += (pdz / pd) * 2.4;
      d.vy = 2.2;
      d.grounded = false;
    }

    // Squash and stretch: a spring towards round, stretched in flight.
    const want = d.grounded ? 1 : clamp(1 + Math.abs(d.vy) * 0.035, 1, 1.22);
    d.squashV += ((want - d.squash) * 140 - d.squashV * 10) * dt;
    d.squash = clamp(d.squash + d.squashV * dt, 0.55, 1.45);

    // Pulling back (or a moment after, as you take hold again) it stays dug in where it is.
    if (d.drawn > 0 || d.held || !d.grounded || d.back > 0 || d.easeT > 0) return;

    // Eating and shedding.
    if (d.eatT > 0) d.eatT -= dt;
    if (d.shedQ > 0) {
      d.shedT -= dt;
      if (d.shedT <= 0) this.shed(d);
    }
    // Hungry or starving, it looks for food it can see, unless something has
    // frightened it or it is busy getting away from you.
    // The rare wild one goes to its favourite food whenever it smells some, hungry or not: that is how it is lured.
    const lure = wild && d.rare;
    if ((d.hunger > 0.5 || lure) && d.eatT <= 0 && d.fright <= 0 && !alert) {
      const had = !!d.target && !d.target.gone;
      if (!d.target || d.target.gone || d.target.drawn > 0 || this.rand() < dt * 0.5) d.target = this.findFood(d);
      // Just spotted it: no more slow hungry bouncing, off it goes.
      if (!had && d.target) d.hopT = Math.min(d.hopT, d.hunger >= 1 ? 0.12 : 0.25);
      const t = d.target;
      if (t && Math.hypot(t.x - d.x, t.z - d.z) < d.r + 0.32 && Math.abs(t.y - d.y) < 0.9) this.eat(d, t);
    } else d.target = null;

    // Facing: towards where it is going, or the player if close and idle.
    if (pd < 6 && d.hopT > 0.25 && !alert) d.yaw += clamp(angleTo(d.yaw, Math.atan2(-pdx, -pdz)), -3 * dt, 3 * dt);

    d.hopT -= dt;
    if (d.hopT > 0 || d.eatT > 0) return;
    this.hop(d, info.hop, px, pz, alert);
  }

  /** Leaning on a fence and blowing down over it: the downy leaves the bellows above the rail, not into it. */
  private overRail(d: { x: number; y: number; z: number; r: number }): void {
    if (!this.penAssist) return;
    for (const ring of this.phys.rings) {
      // (A high fence from further back: blown from the lane a couple of metres off, it met the 2 m rails.)
      if (Math.abs(Math.hypot(d.x - ring.x, d.z - ring.z) - PEN_R) > d.r + (ring.top > 1.5 ? 2.4 : 0.7)) continue;
      const fl = this.phys.floor(d.x, d.z);
      d.y = Math.max(d.y, fl + ring.top + 0.12);
    }
  }

  /** A downy blown at a pen: steered in, and lifted over the rail if it would hit the fence (like the sell crate's pull on fluff). */
  private penPull(d: { x: number; y: number; z: number; vx: number; vy: number; vz: number; homeX: number; homeZ: number }, dt: number): void {
    const reach = PEN_R + 3.2;
    for (const ring of this.phys.rings) {
      const dx = ring.x - d.x;
      const dz = ring.z - d.z;
      const dh = Math.hypot(dx, dz) || 1e-3;
      if (dh > reach) continue;
      // Blown in from outside (a blown downy's home is where you stood): once over the fence it settles in
      // rather than sailing on over the far side.
      if (dh < PEN_R - 0.2) {
        if (Math.hypot(d.homeX - ring.x, d.homeZ - ring.z) < PEN_R) return;
        const k = Math.exp(-2.6 * dt);
        d.vx = d.vx * k + (dx / dh) * 1.5 * dt;
        d.vz = d.vz * k + (dz / dh) * 1.5 * dt;
        return;
      }
      // Only one heading in.
      if ((d.vx * dx + d.vz * dz) / dh < 1) continue;
      const inner = PEN_R * 0.45;
      const k = 1 - (dh - inner) / (reach - inner);
      const a = 3 + 6 * k;
      d.vx += (dx / dh) * a * dt;
      d.vz += (dz / dh) * a * dt;
      if (dh > PEN_R - 0.4) {
        const foot = d.y - this.phys.floor(d.x, d.z);
        const want = ring.top + 0.9;
        // A high fence (2 m) lifts it harder: at 5 m/s at most, a thistle aimed at its floor met the rails (the
        // seventh playtest's showed no pen mark from the floor aim and landed outside).
        if (foot < want) d.vy = Math.max(d.vy, Math.min(ring.top > 1.5 ? 9 : 5, (want - foot) * 5));
      }
      return;
    }
  }

  /**
   * The sell crate's pull on a blown downy a live order wants: like its pull on
   * fluff, twice as strong (a downy is heavier), and lifted over the rim if it
   * would hit the crate's side. Shared by the real flight and the crosshair's guess.
   */
  private downyCratePull(d: { x: number; y: number; z: number; vx: number; vy: number; vz: number }, dt: number): void {
    if (!cratePull(d, this.crateFloor, dt * 2.2)) return;
    const dh = Math.hypot(CRATE_X - d.x, CRATE_Z - d.z);
    const foot = d.y - this.crateFloor;
    if (dh < 1.6 && dh > 0.75 && foot < CRATE.h + 0.25) d.vy = Math.max(d.vy, Math.min(4, (CRATE.h + 0.4 - foot) * 6));
  }

  private hop(d: Downy, base: number, px: number, pz: number, flee: boolean): void {
    const fraz = d.mood === 'frazzled';
    // A fright in a pen sends a downy running round inside the fence. Only a crowded pen or long neglect gets one over it.
    const crowded = d.pen >= 0 && this.penCounts[d.pen] > PEN_MAX;
    const restless = d.starveT >= NEGLECT_HOURS;
    const scaredIn = fraz && d.pen >= 0 && !crowded && !restless;
    let tx = d.x;
    let tz = d.z;
    const r = this.rand;
    // Food it has seen comes first, whatever its mood: it heads straight for it, never away.
    const toFood = !!d.target && !d.target.gone && d.fright <= 0;
    if (toFood) {
      tx = d.target!.x;
      tz = d.target!.z;
    } else if (flee) {
      let a = Math.atan2(d.z - pz, d.x - px) + (r() - 0.5) * (d.bolt > 0 ? 0.5 : 0.9);
      const far = d.bolt > 0 ? 8.5 : 3;
      // Bolting: the way that takes it furthest from you without climbing (never into the valley's edge or up a crag).
      if (d.bolt > 0) {
        const here = this.phys.floor(d.x, d.z);
        let best = a + Math.PI / 2;
        let bs = -Infinity;
        for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
          const q = a + off;
          const qx = d.x + Math.cos(q) * far;
          const qz = d.z + Math.sin(q) * far;
          if (qx < MINX + 3 || qx > MAXX - 3 || qz < MINZ + 3 || qz > MAXZ - 3) continue;
          const score = Math.hypot(qx - px, qz - pz) - Math.max(0, this.phys.floor(qx, qz) - here) * 2.5;
          if (score > bs) {
            bs = score;
            best = q;
          }
        }
        a = best;
      }
      tx = d.x + Math.cos(a) * far;
      tz = d.z + Math.sin(a) * far;
      // A bolting wild one settles where it fled to, rather than hopping back past you to where it was
      // (the board's rare one drifts back to where it was seen, so the clue stays true).
      if (d.bolt > 0 && !d.tame && !d.rare) {
        d.homeX = tx;
        d.homeZ = tz;
      }
    } else if (d.pen >= 0 && d.kind === 'thistle' && !this.s.pads[d.pen].ups.includes('high')) {
      // Thistles will not stay behind a low fence: they back off from the
      // rails, then hop so the top of the hop is over them.
      const p = PADS[d.pen];
      const a = Math.atan2(d.z - p.z, d.x - p.x) + (r() - 0.5) * 0.5;
      const f = PEN_R - Math.hypot(d.x - p.x, d.z - p.z);
      const len = f < 1.2 ? -1.8 : Math.min(f * 2, 3);
      tx = d.x + Math.cos(a) * len;
      tz = d.z + Math.sin(a) * len;
    } else if (d.pen >= 0) {
      const p = PADS[d.pen];
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * (PEN_R - 1.2);
      tx = p.x + Math.cos(a) * rr;
      tz = p.z + Math.sin(a) * rr;
    } else if (!d.tame) {
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * (d.keep ? 3 : d.rare ? 3.5 : 6);
      tx = d.homeX + Math.cos(a) * rr;
      tz = d.homeZ + Math.sin(a) * rr;
    } else if (d.strayFrom >= 0 && this.s.pads[d.strayFrom]?.kind === 'pen') {
      // One of yours out of its pen waits by the pen's gate, beside the post, rather than wandering off into the
      // meadow (the sixth playtest's day of trips left 15 of 19 loose).
      const w = strayWait(d.strayFrom, d.id);
      const pc = PADS[d.strayFrom];
      // Round the pen, not into its fence: from the far side it works its way round towards the gate.
      const ad = Math.atan2(d.z - pc.z, d.x - pc.x);
      const off = angleTo(ad, Math.atan2(w.z - pc.z, w.x - pc.x));
      const a = r() * Math.PI * 2;
      const near = Math.hypot(w.x - d.x, w.z - d.z) < 1.5;
      if (Math.abs(off) > 0.7) {
        const step = ad + Math.sign(off) * 0.7;
        tx = pc.x + Math.cos(step) * (PEN_R + 1.4);
        tz = pc.z + Math.sin(step) * (PEN_R + 1.4);
      } else {
        tx = near ? w.x + Math.cos(a) * 0.8 : w.x;
        tz = near ? w.z + Math.sin(a) * 0.8 : w.z;
      }
    } else {
      const a = r() * Math.PI * 2;
      tx = d.x + Math.cos(a) * 2.5;
      tz = d.z + Math.sin(a) * 2.5;
    }
    // In water: head for the bank.
    if (waterAt(d.x, d.z) > this.phys.floor(d.x, d.z)) {
      const ax = d.x - POND.x;
      const az = d.z - POND.z;
      const l = Math.hypot(ax, az) || 1;
      tx = d.x + (ax / l) * 4;
      tz = d.z + (az / l) * 4;
    }
    // Frightened, crowded or long neglected, with no food to go to: quick hops anywhere (inside the fence, if only
    // frightened). One that is out of its pen keeps to its gate.
    const waiting = d.tame && d.pen < 0 && d.strayFrom >= 0;
    if (fraz && !toFood && !flee && !waiting) {
      if (scaredIn) {
        const p = PADS[d.pen];
        const a = r() * Math.PI * 2;
        const rr = Math.sqrt(r()) * (PEN_R - 1.3);
        tx = p.x + Math.cos(a) * rr;
        tz = p.z + Math.sin(a) * rr;
      } else {
        const a = r() * Math.PI * 2;
        tx = d.x + Math.cos(a) * 3;
        tz = d.z + Math.sin(a) * 3;
      }
    }
    let dx = tx - d.x;
    let dz = tz - d.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 1e-3) {
      dx /= dist;
      dz /= dist;
    }
    const hungry = d.mood === 'hungry';
    // (The rare one, lured, hurries to its food like a starving one: the seventh playtest stood 10 to 13 s waiting.)
    const starving = d.hunger >= 1 || (toFood && d.rare && !d.tame);
    // Bolting (a thistle that has noticed you, or one that just got away): long, flat, fast leaps.
    const bolting = flee && d.bolt > 0;
    // Only a crowded or long-neglected downy hops high enough to clear a low fence, and never on its way to food.
    const h = bolting ? 0.9 : d.kind === 'thistle' ? base * (fraz ? 1.3 : 1) : toFood || flee || scaredIn || waiting ? base : fraz ? base * 2.3 : hungry ? base * 0.72 : base;
    const vy = Math.sqrt(2 * G_DOWNY * h);
    const air = (2 * vy) / G_DOWNY;
    const cap = bolting ? (d.kind === 'thistle' || (d.rare && !d.tame) ? BOLT_SPEED * 1.6 : 4) : toFood ? (starving ? (d.rare && !d.tame ? 3 : 2.4) : 1.9) : flee ? 2.2 : scaredIn ? 2.4 : fraz || d.kind === 'thistle' ? 2.8 : 1.8;
    const hs = Math.min(dist / air, cap);
    d.vx = dx * hs;
    d.vz = dz * hs;
    d.vy = vy;
    d.grounded = false;
    d.squashV += 2.5;
    if (dist > 0.05) d.yaw = Math.atan2(dx, dz);
    // Hungry ones bounce slowly until they spot food; then they hurry to it, faster when starving.
    d.hopT = bolting ? 0.03 + r() * 0.05 : (0.45 + r() * 1.1) * (toFood ? (starving ? (d.rare && !d.tame ? 0.25 : 0.35) : 0.55) : flee ? 0.45 : hungry ? 1.5 : 1) * (fraz && !toFood ? 0.45 : 1);
    if (d.mood === 'content' && r() < 0.2) this.emit({ t: 'chirp', x: d.x, y: d.y, z: d.z, kind: d.kind });
  }


  private findFood(d: Downy): Item | null {
    let best: Item | null = null;
    // The rare wild one smells its favourite food from further off, and only that.
    const lure = d.rare && !d.tame;
    const fav = wantedFood(d.kind);
    let bd = lure ? RARE_WARY.smell : 10;
    for (const it of this.s.items) {
      // (Only food you blew or tipped out lures it: what grows wild about its spot does not.)
      if (it.gone || it.drawn > 0 || !isFood(it.type) || !eats(d.kind, it.type) || (lure && (it.type !== fav || !it.blown))) continue;
      // Food still flying from a blow is not food yet; food just dropping (a feeder, a crop) is.
      if (!it.grounded && !it.rest && it.flyT >= 0) continue;
      // Penned downies only see food inside their pen.
      if (d.pen >= 0 && this.phys.penAt(it.x, it.z) !== d.pen) continue;
      const dd = Math.hypot(it.x - d.x, it.z - d.z);
      if (dd < bd) {
        bd = dd;
        best = it;
      }
    }
    return best;
  }

  private eat(d: Downy, it: Item): void {
    const s = this.s;
    const food = it.type as Food;
    it.gone = true;
    d.target = null;
    d.eatT = 0.7;
    d.hunger = 0;
    d.starveT = 0;
    d.sinceFed = 0;
    s.stats.fed++;
    // The rare wild one, lured: it eats, then lets you near for a while.
    if (d.rare && !d.tame) d.calm = RARE_WARY.calm;
    const fav = favourite(d.kind, food);
    // However hungry it was, a meal makes fluff. Only fright and a crowded pen stop it, and only a downy
    // you keep makes any: a wild one's meal makes none, so sweeping the meadow is no way to get rich.
    const crowded = d.pen >= 0 && this.penCounts[d.pen] > PEN_MAX;
    if (d.fright <= 0 && !crowded && (d.tame || d.keep)) {
      let n = fav ? 2 : 1;
      if (d.kind === 'brook' && d.pen >= 0 && s.pads[d.pen].ups.includes('trough')) n++;
      // A rare one of yours in the pen: everyone in it sheds one more, for good (the hunt's lasting reward).
      if (d.pen >= 0 && this.penRare[d.pen]) n++;
      d.shedQ = n;
      d.shedT = 0.75;
    }
    // A meal you gave (food you blew or tipped out) to a downy of yours: its fluff carries the meal's number.
    const you = it.blown && (d.tame || d.keep);
    d.feedId = you ? ++this.feedSerial : 0;
    this.emit({ t: 'eat', x: d.x, y: d.y, z: d.z, kind: d.kind, food, fav, tame: d.tame, you });
    // Wild downies forage on their own; the goal is for feeding one of yours.
    if (fav && d.tame) this.complete('feed');
  }

  private shed(d: Downy): void {
    const s = this.s;
    const n = d.shedQ;
    d.shedQ = 0;
    for (let i = 0; i < n; i++) {
      const it = newItem(s, KIND_TUFT[d.kind], d.x, d.y + 0.55, d.z);
      it.by = d.id;
      it.feed = d.feedId;
      const a = this.rand() * Math.PI * 2;
      it.vx = Math.cos(a) * 1.3;
      it.vz = Math.sin(a) * 1.3;
      it.vy = 2.6 + this.rand();
      it.spinV = 4;
      s.items.push(it);
    }
    d.squashV += 4;
    this.emit({ t: 'shed', x: d.x, y: d.y + 0.5, z: d.z, kind: d.kind, n });
    this.emit({ t: 'chirp', x: d.x, y: d.y, z: d.z, kind: d.kind });
  }

  // ------------------------------------------------------------ loose things

  private updateItems(dt: number): void {
    const s = this.s;
    for (const it of s.items) {
      if (it.gone) continue;
      if (it.noPull > 0) it.noPull -= dt;
      if (it.rest && it.drawn === 0) continue;
      const tuft = isTuft(it.type);
      // Fluff near the sell crate is drawn in, even lying on the ground, and counts as in flight so the crate takes it.
      if (tuft && it.drawn === 0 && cratePull(it, this.crateFloor, dt)) {
        if (it.grounded || it.rest) {
          it.grounded = false;
          it.rest = false;
          it.src = -1;
          it.vy = Math.max(it.vy, 1.4);
        }
        it.flyT = Math.min(Math.max(it.flyT, 0), 1);
      }
      if (it.flyT >= 0) it.flyT += dt;
      it.spin += it.spinV * dt;
      it.spinV *= Math.exp(-2 * dt);
      if (!it.grounded) {
        const g = it.drawn > 0 ? 1 : tuft ? G_TUFT : G_ITEM;
        it.vy -= g * dt;
        const drag = Math.exp(-(it.drawn > 0 ? 0.3 : tuft ? 1.5 : 0.12) * dt);
        it.vx *= drag;
        it.vz *= drag;
        if (tuft) it.vy *= Math.exp(-1.2 * dt);
        if (tuft && it.drawn === 0) {
          // Down drifts on the breeze.
          it.vx += 0.25 * dt;
          it.vz += Math.sin(it.id + it.y) * 0.2 * dt;
        }
      }
      const ox = it.x;
      const oz = it.z;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.z += it.vz * dt;
      if (it.drawn > 0) continue;
      this.phys.collide(it, ox, oz, 'item');
      if (it.flyT >= 0 && it.flyT < 3 && this.catchers(it)) continue;
      const fl = this.phys.rest(it.x, it.z, true) + it.r * 0.6;
      // Rolling downhill stays on the ground (and under its friction) instead of
      // hopping off every dip and skidding on: food puffed by a downy stays by it.
      if (it.y <= fl || (it.grounded && it.vy <= 0 && it.y - fl < 0.3)) {
        if (!it.grounded) {
          const wet = waterAt(it.x, it.z) > fl - it.r;
          if (wet && it.vy < -2) this.emit({ t: 'splash', x: it.x, y: fl, z: it.z });
          if (!tuft && it.vy < -2.5 && !wet) {
            it.vy = -it.vy * 0.3;
            it.y = fl;
            it.vx *= 0.6;
            it.vz *= 0.6;
            continue;
          }
          if (it.flyT >= 0) this.landed(it);
        }
        it.y = fl;
        it.vy = 0;
        it.grounded = true;
        it.flyT = -1;
        const f = Math.exp(-(tuft ? 6 : 5) * dt);
        it.vx *= f;
        it.vz *= f;
        it.idle += dt;
        this.chuteDrift(it, dt);
      } else if (it.y > fl + 0.03) it.grounded = false;
    }
  }

  /** The ground under the sell crate. */
  private get crateFloor(): number {
    return (this._crateFloor ??= this.phys.floor(CRATE_X, CRATE_Z));
  }
  private _crateFloor: number | undefined;
  private ghost: Item | undefined;

  /**
   * Inside the sell crate's catch: its box, the flared sides over the rim, or
   * the backboard behind it (fluff that reaches the board drops in, as it looks
   * like it should). The front is open, facing the lane.
   */
  private inCrate(x: number, y: number, z: number): boolean {
    const cfl = this.crateFloor;
    const rim = cfl + CRATE.h;
    if (y <= cfl) return false;
    if (y >= rim - 0.05 && y < rim + 0.85 && x > CRATE.x0 - 0.2 && x < CRATE.x1 + 0.2 && z > CRATE.z1 - 0.1 && z < CRATE.z1 + 0.4) return true;
    if (y >= rim + 0.5) return false;
    const m = y >= rim - 0.05 ? 0.35 : 0.15;
    return x > CRATE.x0 - m && x < CRATE.x1 + m && z > CRATE.z0 - m && z < CRATE.z1 + m;
  }

  /**
   * Would a blow now sell? Flies the chosen fluff ahead the way the real one
   * flies (the crate's pull included) and says whether it lands in the crate,
   * or on the ground near enough for the crate to draw it in.
   */
  wouldSell(aim: Aim): boolean {
    const s = this.s;
    const slot = s.slots[s.sel];
    if (slot.t && slot.n > 0 && isDowny(slot.t)) {
      // The downy that would come out next: one the order wants (caught today, or the rare one)?
      const rec = this.nextDown(slot);
      return !!rec && this.wantsDowny(slot.t, rec.c, !!rec.rare) && this.wouldSellDowny(aim);
    }
    if (!slot.t || slot.n <= 0 || !isTuft(slot.t)) return false;
    const p = s.player;
    // A scratch tuft, never added to the ranch, bumping into things as a real one would.
    const b = (this.ghost ??= newItem(s, 'tuft-clover', 0, 0, 0));
    b.x = aim.mx + aim.dx * 0.3;
    b.y = aim.my + aim.dy * 0.3;
    b.z = aim.mz + aim.dz * 0.3;
    b.vx = aim.dx * 14 + p.vx * 0.5;
    b.vy = aim.dy * 14 + 1.4;
    b.vz = aim.dz * 14 + p.vz * 0.5;
    const cfl = this.crateFloor;
    // The real step, so thin things (the board's easel legs) stop it here too.
    const dt = 1 / 60;
    for (let t = 0; t < 3; t += dt) {
      cratePull(b, cfl, dt);
      b.vy -= G_TUFT * dt;
      const drag = Math.exp(-1.5 * dt);
      b.vx *= drag;
      b.vz *= drag;
      b.vy *= Math.exp(-1.2 * dt);
      b.vx += 0.25 * dt;
      const ox = b.x;
      const oz = b.z;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      this.phys.collide(b, ox, oz, 'item');
      if (this.inCrate(b.x, b.y, b.z)) return true;
      if (b.y <= this.phys.floor(b.x, b.z)) return Math.hypot(b.x - CRATE_X, b.z - CRATE_Z) < PULL_R - 0.1;
    }
    return false;
  }

  private ghostDowny: Downy | undefined;

  /** Would a blow now send the chosen downy into the crate for today's live order? Flies it ahead the way a real blown downy flies, the crate's pull included. */
  private wouldSellDowny(aim: Aim): boolean {
    const s = this.s;
    const p = s.player;
    const b = (this.ghostDowny ??= newDowny(s, 'clover', 0, 0, 0));
    b.x = aim.mx + aim.dx * 0.3;
    b.y = aim.my + aim.dy * 0.3 - 0.25;
    b.z = aim.mz + aim.dz * 0.3;
    b.vx = aim.dx * 14 + p.vx * 0.5;
    b.vy = aim.dy * 14 + 1.6;
    b.vz = aim.dz * 14 + p.vz * 0.5;
    b.homeX = p.x;
    b.homeZ = p.z;
    b.r = 0.26;
    this.overRail(b);
    b.grounded = false;
    const dt = 1 / 60;
    for (let t = 0; t < 3; t += dt) {
      if (this.penAssist) this.penPull(b, dt);
      b.vy -= G_DOWNY * dt;
      const drag = Math.exp(-0.55 * dt);
      b.vx *= drag;
      b.vz *= drag;
      this.downyCratePull(b, dt);
      const ox = b.x;
      const oz = b.z;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (this.inCrate(b.x, b.y, b.z)) return true;
      this.phys.collide(b, ox, oz, 'downy');
      if (b.y <= this.phys.rest(b.x, b.z, true)) return false;
    }
    return false;
  }

  /**
   * Would a blow now land the chosen downy in a pen? Flies it ahead the way a
   * real blown downy flies (the pen's help included) and returns the pen it
   * comes down in, or -1. The crosshair shows a little fence when it would.
   */
  wouldPen(aim: Aim): number {
    const s = this.s;
    const slot = s.slots[s.sel];
    if (!slot.t || slot.n <= 0 || !isDowny(slot.t) || !this.phys.rings.length) return -1;
    const p = s.player;
    const b = (this.ghostDowny ??= newDowny(s, 'clover', 0, 0, 0));
    b.x = aim.mx + aim.dx * 0.3;
    b.y = aim.my + aim.dy * 0.3 - 0.25;
    b.z = aim.mz + aim.dz * 0.3;
    b.vx = aim.dx * 14 + p.vx * 0.5;
    b.vy = aim.dy * 14 + 1.6;
    b.vz = aim.dz * 14 + p.vz * 0.5;
    b.homeX = p.x;
    b.homeZ = p.z;
    b.r = 0.26;
    this.overRail(b);
    b.grounded = false;
    const dt = 1 / 60;
    for (let t = 0; t < 3; t += dt) {
      if (this.penAssist) this.penPull(b, dt);
      b.vy -= G_DOWNY * dt;
      const drag = Math.exp(-0.55 * dt);
      b.vx *= drag;
      b.vz *= drag;
      const ox = b.x;
      const oz = b.z;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      this.phys.collide(b, ox, oz, 'downy');
      if (b.y <= this.phys.rest(b.x, b.z, true)) return this.phys.penAt(b.x, b.z);
    }
    return -1;
  }

  /** The Exchange crate, silos and feeder hoppers swallow things puffed into them. */
  private catchers(it: Item): boolean {
    const s = this.s;
    // The Exchange.
    const cfl = this.crateFloor;
    if (this.inCrate(it.x, it.y, it.z)) {
      if (isTuft(it.type)) {
        it.gone = true;
        this.sellFluff(TUFT_KIND[it.type], it.blown, it.feed, it.x, cfl + CRATE.h, it.z);
        return true;
      }
      it.vy = 5;
      it.vx = -it.vx * 0.3 + 1;
      it.vz = -it.vz * 0.3 - 1.5;
      it.flyT = 3;
      this.emit({ t: 'reject', x: it.x, y: it.y, z: it.z });
      return true;
    }
    for (let i = 0; i < s.pads.length; i++) {
      const p = s.pads[i];
      const at = PADS[i];
      if (p.kind === 'silo') {
        const fl = this.phys.floor(at.x, at.z);
        if (Math.hypot(it.x - at.x, it.z - at.z) < SILO_R + it.r + 0.15 && it.y < fl + SILO_H + 0.6) {
          let bin = p.silo.find((b) => b.t === it.type);
          if (!bin && p.silo.length < SILO_KINDS) p.silo.push((bin = { t: it.type, n: 0 }));
          if (bin && bin.n < SILO_CAP) {
            bin.n++;
            it.gone = true;
            this.emit({ t: 'store', x: it.x, y: it.y, z: it.z, where: 'silo', pad: i });
            return true;
          }
          this.emit({ t: 'deny', why: 'The silo is full.' });
          return false;
        }
      } else if (p.kind === 'pen' && p.ups.includes('feeder') && isFood(it.type)) {
        if (!this.inHopper(i, it.x, it.y, it.z)) continue;
        const fd = p.feeder;
        if ((fd.t === null || fd.t === it.type) && fd.n < FEEDER_CAP) {
          fd.t = it.type;
          fd.n++;
          it.gone = true;
          this.emit({ t: 'store', x: it.x, y: it.y, z: it.z, where: 'feeder', pad: i });
          this.emit({ t: 'feeder', pad: i, n: fd.n, why: '' });
          return true;
        }
        // Refused (another food in it, or full): it bounces off the hopper, and says why, instead of vanishing into the pen.
        it.vy = 3.2;
        it.vx = -it.vx * 0.25;
        it.vz = -it.vz * 0.25;
        it.flyT = 3;
        this.emit({ t: 'feeder', pad: i, n: fd.n, why: fd.n >= FEEDER_CAP ? 'The feeder is full.' : `This feeder holds ${thingName(fd.t!, 2)}.` });
        return true;
      }
    }
    return false;
  }

  /** Inside a feeder's hopper (the funnel at its top). */
  private inHopper(i: number, x: number, y: number, z: number): boolean {
    const h = padSpots(i).hopper;
    const fl = this.phys.floor(h.x, h.z);
    return Math.hypot(x - h.x, z - h.z) < 0.75 && Math.abs(y - (fl + h.y)) < 0.8;
  }

  private ghostFood: Item | undefined;

  /**
   * Would a blow now land the chosen food in a feeder that takes it? Flies it
   * ahead the way a real blown thing flies and returns the pen, or -1. The
   * crosshair shows a little hopper when it would (the feeder had no mark).
   */
  wouldFeed(aim: Aim): number {
    const s = this.s;
    const slot = s.slots[s.sel];
    if (!slot.t || slot.n <= 0 || !isFood(slot.t)) return -1;
    const food = slot.t;
    const pens: number[] = [];
    s.pads.forEach((p, i) => {
      if (p.kind === 'pen' && p.ups.includes('feeder') && (p.feeder.t === null || p.feeder.t === food) && p.feeder.n < FEEDER_CAP) pens.push(i);
    });
    if (!pens.length) return -1;
    const p = s.player;
    const b = (this.ghostFood ??= newItem(s, 'cloverhead', 0, 0, 0));
    b.x = aim.mx + aim.dx * 0.3;
    b.y = aim.my + aim.dy * 0.3;
    b.z = aim.mz + aim.dz * 0.3;
    b.vx = aim.dx * 14 + p.vx * 0.5;
    b.vy = aim.dy * 14 + 1.4;
    b.vz = aim.dz * 14 + p.vz * 0.5;
    b.grounded = false;
    const dt = 1 / 60;
    for (let t = 0; t < 2.5; t += dt) {
      b.vy -= G_ITEM * dt;
      const drag = Math.exp(-0.12 * dt);
      b.vx *= drag;
      b.vz *= drag;
      const ox = b.x;
      const oz = b.z;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      this.phys.collide(b, ox, oz, 'item');
      for (const i of pens) if (this.inHopper(i, b.x, b.y, b.z)) return i;
      if (b.y <= this.phys.floor(b.x, b.z)) return -1;
    }
    return -1;
  }

  /** A puffed thing came down: plant it if it landed on an empty garden. */
  private landed(it: Item): void {
    if (!isFood(it.type)) return;
    const s = this.s;
    for (let i = 0; i < s.pads.length; i++) {
      const p = s.pads[i];
      if (p.kind !== 'garden' || p.crop) continue;
      const at = PADS[i];
      if (Math.abs(it.x - at.x) < BED_HALF && Math.abs(it.z - at.z) < BED_HALF) {
        p.crop = it.type;
        p.grow = 0;
        it.gone = true;
        this.emit({ t: 'plant', pad: i, food: it.type });
        this.complete('plant');
        return;
      }
    }
  }

  /** Down lying in a pen with a chute slides to the box; in a pen without one it gathers by the fence beside the post. */
  private chuteDrift(it: Item, dt: number): void {
    if (!isTuft(it.type)) return;
    const pen = this.phys.penAt(it.x, it.z);
    if (pen < 0) return;
    const p = this.s.pads[pen];
    if (!p.ups.includes('chute')) {
      // The breeze carries it to the fence on the lane side, where Pull reaches it from outside.
      if (it.idle < GATHER.after) return;
      const g = gatherSpot(pen, it.id);
      const gx = g.x - it.x;
      const gz = g.z - it.z;
      const gd = Math.hypot(gx, gz);
      if (gd < 0.2) return;
      const step = Math.min(gd, GATHER.speed * dt);
      it.x += (gx / gd) * step;
      it.z += (gz / gd) * step;
      return;
    }
    const c = padSpots(pen).chute;
    const dx = c.x - it.x;
    const dz = c.z - it.z;
    const d = Math.hypot(dx, dz);
    if (d < PEN_R * 0.25 + 0.9 || it.idle > 1.2) {
      p.chute[KINDS.indexOf(TUFT_KIND[it.type])]++;
      it.gone = true;
      return;
    }
    it.x += (dx / d) * 1.6 * dt;
    it.z += (dz / d) * 1.6 * dt;
  }

  // ------------------------------------------------------------ nettlebacks

  private updateNettles(dt: number): void {
    const s = this.s;
    const night = s.hour >= 20.5 || s.hour < 4.5;
    const p = s.player;
    this.nettleT -= dt;
    const max = Math.min(4, 2 + Math.floor(s.day / 3));
    const alive = s.nettles.filter((n) => !n.gone).length;
    if (night && this.nettleT <= 0 && alive < max && this.knows('nettles')) {
      this.nettleT = 22 + this.rand() * 14;
      const x = -26 + this.rand() * 52;
      const z = -53;
      s.nettles.push({ id: s.nextId++, x, y: this.phys.floor(x, z), z, vx: 0, vy: 0, vz: 0, r: 0.35, grounded: true, yaw: 0, mode: 'roam', modeT: 0, tx: 0, tz: RANCH_Z - 2, bristle: 0, roll: 0, gone: false, snuffT: 2 });
    }
    let danger = 0;
    for (const n of s.nettles) {
      if (n.gone) continue;
      n.modeT -= dt;
      n.bristle = Math.max(0, n.bristle - dt * 0.8);
      if (!night && n.mode !== 'leave' && n.mode !== 'roll') n.mode = 'leave';
      let speed = 1.3;
      let go = 0;
      let head = n.yaw;
      if (n.mode === 'roll') {
        const sp = Math.hypot(n.vx, n.vz);
        n.roll += (sp * dt) / 0.35;
        const f = Math.exp(-1.6 * dt);
        n.vx *= f;
        n.vz *= f;
        if (sp < 0.6) {
          n.mode = 'flee';
          n.modeT = 20;
        }
      } else {
        if (n.mode === 'flee' || n.mode === 'leave') {
          // Off north out of the valley: from the ranch by its gate, from the ridge or the hollow straight up its own side.
          n.tx = n.x < RIDGE_X || n.x > HOLLOW_X ? n.x : clamp(n.x * 0.6, RIDGE_X + 3, HOLLOW_X - 3);
          n.tz = -56;
          speed = n.mode === 'flee' ? 2.3 : PEST.leave;
          // A fleeing one that has run its time (or run out of valley) roams again.
          if (n.mode === 'flee' && (n.modeT <= 0 || n.z < MINZ + 7)) n.mode = 'roam';
          if (n.mode === 'leave') {
            // Out of sight, it slips away; at the valley's north rim it is gone (the sixth playtest's sat in a corner till 7 am).
            const seen = this.pestWatched(n);
            n.unseenT = seen ? 0 : (n.unseenT ?? 0) + dt;
            if ((n.z < -50 && (!seen || Math.hypot(n.x - p.x, n.z - p.z) > 20)) || n.z < MINZ + 6 || (n.unseenT > PEST.slip && Math.hypot(n.x - p.x, n.z - p.z) > 8)) n.gone = true;
          }
        }
        if (n.mode === 'roam') this.nettleAim(n);
        const [sx, sz] = this.pestRoute(n);
        head = Math.atan2(sx - n.x, sz - n.z);
        // Stepping along something in the way. A detour that ran out having got nowhere tries the other side next
        // time (it used to flip on every blocked frame, so a pest in a corner turned back and forth in place).
        if ((n.detourT ?? 0) > 0) {
          n.detourT = (n.detourT ?? 0) - dt;
          if (n.detourT <= 0 && Math.hypot(n.x - (n.dfx ?? n.x), n.z - (n.dfz ?? n.z)) < 0.5) n.detourSide = -(n.detourSide ?? 1);
        }
        const want = (n.detourT ?? 0) > 0 ? n.detourYaw! : head;
        n.yaw = angleTo(0, n.yaw + clamp(angleTo(n.yaw, want), -5 * dt, 5 * dt));
        go = Math.hypot(n.tx - n.x, n.tz - n.z) > 0.4 ? speed : 0;
        n.vx = Math.sin(n.yaw) * go;
        n.vz = Math.cos(n.yaw) * go;
        n.roll = damp(n.roll, 0, 6, dt);
      }
      const ox = n.x;
      const oz = n.z;
      const ix = n.x + n.vx * dt;
      const iz = n.z + n.vz * dt;
      n.x = ix;
      n.z = iz;
      const hit = this.phys.collide(n, ox, oz, 'nettle');
      const moved = Math.hypot(n.x - ox, n.z - oz);
      if (n.mode !== 'roll' && go > 0.2) {
        // Blocked only when it got well short of where it was going: brushing along a wall is not being blocked (a
        // pest touching a wall took every step for a new detour along it, and slid along the wall into a corner).
        if (hit && moved < go * dt * 0.6 && !((n.detourT ?? 0) > 0)) this.pestDetour(n, n.x - ix, n.z - iz, head, false);
        // Counted from the speed it wanted against how far it got (the walls zero what is left of its speed, so
        // reading the speed after them never counted a pest wedged in a corner).
        n.stuckT = moved < 0.3 * go * dt ? (n.stuckT ?? 0) + dt : Math.max(0, (n.stuckT ?? 0) - dt * 2);
        if (n.stuckT > PEST.stuck) {
          n.stuckT = 0;
          n.detourSide = -(n.detourSide ?? 1);
          // Wedged at the same spot again: a longer way round each time.
          n.stuckN = Math.hypot(n.x - (n.sx ?? 1e9), n.z - (n.sz ?? 1e9)) < 1.5 ? Math.min(4, (n.stuckN ?? 0) + 1) : 0;
          n.sx = n.x;
          n.sz = n.z;
          this.pestDetour(n, n.x - ix, n.z - iz, head, true);
        }
      } else n.stuckT = 0;
      // The watchdog, in every mode: a pest that has got nowhere for a while goes somewhere else (roaming: out of
      // the corner, treats ignored for a while), or, leaving, steps off towards the open ranch; a leaving one that
      // has got nowhere for 10 s while you are not watching it closely is gone.
      if (n.mode !== 'roll') {
        n.wT = (n.wT ?? 0) + dt;
        if (n.wx === undefined || n.wz === undefined) {
          n.wx = n.x;
          n.wz = n.z;
          n.wT = 0;
        }
        if (n.wT >= PEST.watch) {
          const got = Math.hypot(n.x - n.wx, n.z - (n.wz ?? n.z));
          n.wx = n.x;
          n.wz = n.z;
          n.wT = 0;
          if (got < 1.5 && Math.hypot(n.tx - n.x, n.tz - n.z) > 1.2) {
            n.lostT = (n.lostT ?? 0) + PEST.watch;
            if (n.mode === 'leave' && n.lostT >= PEST.lost && !this.pestWatched(n)) n.gone = true;
            else if (n.mode === 'roam') this.unstick(n);
            else {
              n.detourYaw = Math.atan2(clamp(0, RIDGE_X + 6, HOLLOW_X - 6) - n.x, (n.z > RANCH_Z ? 32 : 0) - n.z);
              n.detourT = 2;
              n.dfx = n.x;
              n.dfz = n.z;
            }
          } else n.lostT = 0;
        }
      }
      if ((n.ignoreT ?? 0) > 0) n.ignoreT = (n.ignoreT ?? 0) - dt;
      n.y = this.phys.floor(n.x, n.z);
      // Frighten downies that can see it; eat down lying about.
      for (const d of s.downies) {
        if (d.gone || Math.abs(d.x - n.x) > 3 || Math.abs(d.z - n.z) > 3) continue;
        if (Math.hypot(d.x - n.x, d.z - n.z) > 3) continue;
        if (d.pen >= 0 && s.pads[d.pen].ups.includes('hedge')) continue;
        d.fright = 3;
      }
      if (n.mode === 'roam') {
        for (const it of s.items) {
          if (it.gone || !isTuft(it.type) || !it.grounded) continue;
          if (Math.abs(it.x - n.x) < 0.6 && Math.abs(it.z - n.z) < 0.6) it.gone = true;
        }
      }
      const pd = Math.hypot(n.x - p.x, n.z - p.z);
      danger = Math.max(danger, 1 - clamp((pd - 4) / 16, 0, 1));
      n.snuffT -= dt;
      if (n.snuffT <= 0 && pd < 14) {
        n.snuffT = 4 + this.rand() * 4;
        this.emit({ t: 'nettle', x: n.x, y: n.y, z: n.z });
      }
      // Hit by something puffed.
      if (n.mode !== 'roll') this.nettleHits(n);
    }
    let fraz = 0;
    for (const d of s.downies) if (!d.gone && d.pen >= 0 && d.mood === 'frazzled') fraz++;
    this.danger = clamp(Math.max(danger, fraz > 0 ? 0.35 : 0), 0, 1);
  }

  /** Is the pest close by and in front of you (are you watching it closely)? A leaving one out of sight slips away. */
  private pestWatched(n: Nettle): boolean {
    const p = this.s.player;
    const dx = n.x - p.x;
    const dz = n.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > PEST.near) return false;
    if (d < 1.5) return true;
    const al = Math.hypot(this.lastAim[0], this.lastAim[2]) || 1;
    return (dx * this.lastAim[0] + dz * this.lastAim[2]) / (d * al) > Math.cos(PEST.cone);
  }

  /**
   * Where a pest steers for where it is going: straight there, or, with a wall
   * between, by the gap in it on this side and then through (the ranch fence
   * opens only at its gate, the ridge and hollow walls at theirs once open).
   */
  private pestRoute(n: Nettle): [number, number] {
    const here = zoneAt(n.x, n.z);
    const there = zoneAt(n.tx, n.tz);
    if (here === there) return [n.tx, n.tz];
    // In the ridge or the hollow: out by its gate. In the meadow: to the ranch by its gate, to the far sides by theirs.
    if (here === 'ridge' || here === 'hollow') return this.byGate(n, here, true);
    if (here === 'meadow') return there === 'ranch' ? byRanchGate(n, false) : this.byGate(n, there as 'ridge' | 'hollow', false);
    return byRanchGate(n, true);
  }

  /** By the ridge's or the hollow's gate: to the gap on this side, then through (out of that zone, or into it). */
  private byGate(n: Nettle, zone: 'ridge' | 'hollow', leaving: boolean): [number, number] {
    const g = GATES[zone === 'ridge' ? 'ridge' : 'hollow'];
    // The zone's side of its wall: west of the ridge's, east of the hollow's.
    const out = zone === 'ridge' ? -1 : 1;
    const side = leaving ? out : -out;
    if (!this.s.gates[zone === 'ridge' ? 'ridge' : 'hollow']) return [n.x, n.tz];
    if (Math.abs(n.z - g.z) > 1.0 || (n.x - g.x) * side > 1.8) return [g.x + side * 1.4, g.z];
    return [g.x - side * 2.2, g.z];
  }

  /**
   * A pest blocked, stepping aside along what is in the way: of the two ways
   * along it (from the push the colliders gave it), the one nearer where it is
   * going, or its own side if neither is nearer (or flip: the side it has).
   */
  private pestDetour(n: Nettle, px: number, pz: number, head: number, flip: boolean): void {
    const side = (n.detourSide ??= n.id % 2 ? 1 : -1);
    const pl = Math.hypot(px, pz);
    if (pl > 1e-5) {
      const ax = -pz / pl;
      const az = px / pl;
      const dot = ax * Math.sin(head) + az * Math.cos(head);
      const k = flip || Math.abs(dot) < 0.25 ? side : Math.sign(dot);
      // Stuck (wedged where two things meet, both ways along them run into one or the other): back off as well.
      const out = flip ? 0.75 + 0.25 * (n.stuckN ?? 0) : 0;
      n.detourYaw = Math.atan2(ax * k + (px / pl) * out, az * k + (pz / pl) * out);
    } else n.detourYaw = n.yaw + (side * Math.PI) / 2;
    n.detourT = flip ? 1.4 + 0.8 * (n.stuckN ?? 0) : 1;
    n.dfx = n.x;
    n.dfz = n.z;
  }

  /** Can a pest stand here: inside the ranch's bounds, clear of the house, the crate, the bench and every pen's fence or hedge? */
  private pestRoom(x: number, z: number): boolean {
    if (x < RIDGE_X + 1.5 || x > HOLLOW_X - 1.5 || z < RANCH_Z + 1.5 || z > MAXZ - 3.5) return false;
    for (const ring of this.phys.rings) if (Math.hypot(x - ring.x, z - ring.z) < PEN_R + (ring.hedge ? 1.8 : 0.8)) return false;
    for (const q of this.phys.boxes) if (x > q.x0 - 1 && x < q.x1 + 1 && z > q.z0 - 1 && z < q.z1 + 1) return false;
    return Math.hypot(x - WINDMILL.x, z - WINDMILL.z) > 2.6;
  }

  /** A spot in the ranch a pest can stand on, picked at random (the open middle, failing that). */
  private pestSpot(): [number, number] {
    for (let k = 0; k < 12; k++) {
      const x = -30 + this.rand() * 62;
      const z = 21 + this.rand() * 34;
      if (this.pestRoom(x, z)) return [x, z];
    }
    return [6 + this.rand() * 16, 34 + this.rand() * 2];
  }

  /** A pest prowling round pen i: the spot just outside its fence at angle a, or false if a pest cannot stand there. */
  private prowlAt(n: Nettle, i: number, a: number): boolean {
    // Just outside the fence and its post.
    const x = PADS[i].x + Math.cos(a) * (PEN_R + 1.5);
    const z = PADS[i].z + Math.sin(a) * (PEN_R + 1.5);
    for (const ring of this.phys.rings) if (ring.pad !== i && Math.hypot(x - ring.x, z - ring.z) < PEN_R + (ring.hedge ? 1.8 : 0.8)) return false;
    if (x < RIDGE_X + 1.5 || x > HOLLOW_X - 1.5 || z < RANCH_Z + 1.2 || z > MAXZ - 3.5) return false;
    n.tx = x;
    n.tz = z;
    n.pa = a;
    return true;
  }

  /** A roaming pest stuck in a corner: somewhere else to go, back towards the open middle of the ranch, and a few steps that way first. */
  private unstick(n: Nettle): void {
    const s = this.s;
    const open = s.pads.map((p, i) => ({ p, i })).filter(({ p }) => p.kind === 'pen' && !p.ups.includes('hedge'));
    // Round a pen further from here than the corner it is in, or the open ranch.
    const far = open.filter(({ i }) => Math.hypot(PADS[i].x - n.x, PADS[i].z - n.z) > 8);
    n.prowl = -1;
    if (far.length) {
      const i = far[Math.floor(this.rand() * far.length) % far.length].i;
      const a0 = Math.atan2(n.z - PADS[i].z, n.x - PADS[i].x);
      for (let k = 0; k < 8 && n.prowl < 0; k++) if (this.prowlAt(n, i, a0 + k * 0.8)) n.prowl = i;
    }
    if (n.prowl < 0) [n.tx, n.tz] = this.pestSpot();
    n.modeT = 10 + this.rand() * 6;
    n.detourYaw = Math.atan2(n.tx - n.x, n.tz - n.z);
    n.detourT = 1.5;
    n.dfx = n.x;
    n.dfz = n.z;
    // Treats are ignored for a while (one beyond a fence held it there).
    n.ignoreT = 12;
  }

  private nettleAim(n: Nettle): void {
    const s = this.s;
    // Down on the ground nearby is a treat, if it can get there: not beyond the valley's walls, and not while it
    // has given up on one it could not reach.
    let best = 8;
    let tx = NaN;
    let tz = NaN;
    for (const it of s.items) {
      if ((n.ignoreT ?? 0) > 0 || it.gone || !isTuft(it.type) || !it.grounded) continue;
      if (it.x > HOLLOW_X !== n.x > HOLLOW_X || it.x < RIDGE_X !== n.x < RIDGE_X) continue;
      if (this.phys.penAt(it.x, it.z) >= 0) continue;
      const d = Math.hypot(it.x - n.x, it.z - n.z);
      if (d < best) {
        best = d;
        tx = it.x;
        tz = it.z;
      }
    }
    if (!Number.isNaN(tx)) {
      n.tx = tx;
      n.tz = tz;
      return;
    }
    // Out of the ranch (the meadow, or a far side): in by the ranch gate.
    if (zoneAt(n.x, n.z) !== 'ranch') {
      n.tx = 0;
      n.tz = RANCH_Z + 2;
      n.modeT = Math.min(n.modeT, 0);
      return;
    }
    // In the ranch it never stands about: round and round a pen (just outside the fence, frightening the downies
    // by it), and every so often another pen; with no pens, from one open spot to the next.
    const there = Math.hypot(n.tx - n.x, n.tz - n.z) < 0.9 || zoneAt(n.tx, n.tz) !== 'ranch';
    if (n.modeT <= 0) {
      n.modeT = 8 + this.rand() * 8;
      const open = s.pads.map((p, i) => ({ p, i })).filter(({ p }) => p.kind === 'pen' && !p.ups.includes('hedge'));
      n.prowl = open.length ? open[Math.floor(this.rand() * open.length) % open.length].i : -1;
      n.pdir = this.rand() < 0.5 ? -1 : 1;
      if (n.prowl >= 0) {
        const a0 = Math.atan2(n.z - PADS[n.prowl].z, n.x - PADS[n.prowl].x);
        let ok = false;
        for (let k = 0; k < 8 && !ok; k++) ok = this.prowlAt(n, n.prowl, a0 + k * 0.8 * n.pdir);
        if (!ok) n.prowl = -1;
      }
      if (n.prowl < 0) [n.tx, n.tz] = this.pestSpot();
    } else if (there) {
      if ((n.prowl ?? -1) >= 0 && s.pads[n.prowl!]?.kind === 'pen') {
        let ok = false;
        for (let k = 1; k < 8 && !ok; k++) ok = this.prowlAt(n, n.prowl!, (n.pa ?? 0) + k * 0.8 * (n.pdir ?? 1));
        if (!ok) [n.tx, n.tz] = this.pestSpot();
      } else [n.tx, n.tz] = this.pestSpot();
    }
  }

  private nettleHits(n: Nettle): void {
    const hit = (b: { x: number; y: number; z: number; vx: number; vy: number; vz: number; flyT: number; drawn: number }) => {
      // Anything puffed, in the air or skidding along the ground.
      if (b.drawn > 0 || (b.flyT < 0 && Math.hypot(b.vx, b.vz) < 4)) return false;
      if (Math.abs(b.x - n.x) > 0.8 || Math.abs(b.z - n.z) > 0.8 || b.y - n.y > 1.1) return false;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp < 3) return false;
      n.mode = 'roll';
      n.vx = (b.vx / sp) * 7.5;
      n.vz = (b.vz / sp) * 7.5;
      b.vx *= -0.25;
      b.vz *= -0.25;
      b.vy = 2;
      this.emit({ t: 'nettlehit', x: n.x, y: n.y, z: n.z });
      return true;
    };
    for (const it of this.s.items) if (!it.gone && hit(it)) return;
    for (const d of this.s.downies) if (!d.gone && hit(d)) return;
  }

  // ------------------------------------------------------------ pads

  private updatePads(dt: number): void {
    const s = this.s;
    s.pads.forEach((p, i) => {
      const at = PADS[i];
      if (p.kind === 'garden' && p.crop) {
        const speed = p.ups.includes('sprinkler') ? 1.5 : 1;
        p.grow = Math.min(1, p.grow + (dt * speed) / (GARDEN_HOURS * HOUR));
        if (p.grow >= 1) {
          let yieldN = p.ups.includes('soil') ? GARDEN_YIELD_SOIL : GARDEN_YIELD;
          // A feed run sends the crop straight into the next pen's feeder, while it has room.
          const run = p.ups.includes('run') ? this.runTarget(i) : -1;
          if (run >= 0) {
            const fd = s.pads[run].feeder;
            const add = Math.min(yieldN, FEEDER_CAP - fd.n);
            fd.t = p.crop;
            fd.n += add;
            yieldN -= add;
            const h = padSpots(run).hopper;
            this.emit({ t: 'store', x: h.x, y: this.phys.floor(h.x, h.z) + h.y, z: h.z, where: 'feeder', pad: run, auto: true });
            if (yieldN <= 0) {
              p.grow = 0;
              this.emit({ t: 'crop', pad: i });
              return;
            }
          }
          let on = 0;
          for (const it of s.items) if (!it.gone && Math.abs(it.x - at.x) < BED_HALF && Math.abs(it.z - at.z) < BED_HALF && it.drawn === 0) on++;
          if (on + yieldN <= GARDEN_PILE) {
            p.grow = 0;
            const fl = this.phys.floor(at.x, at.z);
            for (let k = 0; k < yieldN; k++) {
              const it = newItem(s, p.crop, at.x + (this.rand() - 0.5) * 4, fl + 0.3, at.z + (this.rand() - 0.5) * 4, GARDEN_SRC + i);
              it.vy = 2.5 + this.rand() * 1.5;
              it.vx = (this.rand() - 0.5) * 0.6;
              it.vz = (this.rand() - 0.5) * 0.6;
              it.spinV = 6;
              s.items.push(it);
            }
            this.emit({ t: 'crop', pad: i });
          } else {
            // The bed is full: a pen with a feeder beside it on the row takes a share of the crop (the sixth
            // playtest's garden banked 12 against a feeder of 60; the seventh's feeder, taking it all, read 58 to 60
            // every day for a week untouched). The rest spoils on the bed; a feed run sends it all.
            const next = this.runTarget(i);
            if (next >= 0) {
              p.tip = (p.tip ?? 0) + yieldN * GARDEN_TIP.share;
              const add = Math.floor(p.tip + 1e-9);
              p.tip -= add;
              p.grow = 0;
              if (add > 0) {
                const fd = s.pads[next].feeder;
                fd.t = p.crop;
                fd.n = Math.min(FEEDER_CAP, fd.n + add);
                const h = padSpots(next).hopper;
                this.emit({ t: 'store', x: h.x, y: this.phys.floor(h.x, h.z) + h.y, z: h.z, where: 'feeder', pad: next, auto: true });
              }
              this.emit({ t: 'crop', pad: i });
            }
          }
        }
      } else if (p.kind === 'pen' && p.ups.includes('feeder')) {
        p.feedT -= dt;
        if (p.feedT > 0 || p.feeder.n <= 0 || !p.feeder.t) return;
        const food = p.feeder.t;
        let hungry = false;
        for (const d of s.downies) if (!d.gone && d.pen === i && d.hunger > 0.5 && eats(d.kind, food)) hungry = true;
        if (!hungry) return;
        let lying = 0;
        for (const it of s.items) if (!it.gone && it.type === food && this.phys.penAt(it.x, it.z) === i) lying++;
        if (lying > 0) return;
        p.feeder.n--;
        if (p.feeder.n <= 0) p.feeder.t = null;
        p.feedT = 2.5;
        const h = padSpots(i).hopper;
        const fl = this.phys.floor(h.x, h.z);
        const it = newItem(s, food, h.x, fl + 0.9, h.z);
        it.vx = (at.x - h.x) * 0.4;
        it.vz = (at.z - h.z) * 0.4;
        it.vy = 1;
        s.items.push(it);
      }
    });
  }

  /** The plots next to this one on its row (a feed run reaches only these): pens with a feeder. */
  runNeighbours(i: number): number[] {
    const s = this.s;
    const out: number[] = [];
    for (const j of [i - 1, i + 1]) {
      if (j < 0 || j >= s.pads.length || Math.floor(j / 3) !== Math.floor(i / 3)) continue;
      if (s.pads[j].kind === 'pen' && s.pads[j].ups.includes('feeder')) out.push(j);
    }
    return out;
  }

  /**
   * The pen a garden's feed run fills: a neighbour on the same row with a
   * feeder that takes this crop (the same food in it, or empty with downies
   * that eat it) and has room, the emptier first. -1 for none.
   */
  runTarget(i: number): number {
    const s = this.s;
    const crop = s.pads[i].crop;
    if (!crop) return -1;
    let best = -1;
    let bn = Infinity;
    for (const j of [i - 1, i + 1]) {
      if (j < 0 || j >= s.pads.length || Math.floor(j / 3) !== Math.floor(i / 3)) continue;
      const p = s.pads[j];
      if (p.kind !== 'pen' || !p.ups.includes('feeder') || p.feeder.n >= FEEDER_CAP) continue;
      if (p.feeder.t !== null && p.feeder.t !== crop) continue;
      if (p.feeder.t === null && s.downies.some((d) => !d.gone && d.pen === j && !eats(d.kind, crop))) continue;
      if (p.feeder.n < bn) {
        bn = p.feeder.n;
        best = j;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ wild food and spawning

  private updateSources(dt: number): void {
    const s = this.s;
    this.srcT -= dt;
    if (this.srcT <= 0) {
      this.srcT = 1;
      this.countSources();
    }
    s.sources.forEach((src, i) => {
      if (this.srcCount[i] >= SOURCE_MAX) {
        src.t = 0;
        return;
      }
      src.t += dt;
      if (src.t >= SOURCE_REGROW) {
        src.t = 0;
        this.growAt(i, src);
        this.srcCount[i]++;
      }
    });
  }

  private updateSpawns(dt: number): void {
    this.spawnT -= dt;
    if (this.spawnT > 0 || !this.wild) return;
    this.spawnT = 2;
    const s = this.s;
    const p = s.player;
    let active = 0;
    for (const d of s.downies) if (!d.gone) active++;
    // Far wild downies come and go so the count stays small.
    for (const d of s.downies) {
      if (d.gone || d.tame || d.keep || d.rare) continue;
      const far = Math.hypot(d.x - p.x, d.z - p.z);
      const dusk = s.hour >= 17 && s.hour < 21;
      if ((d.kind === 'thistle' && !dusk && far > 25) || (active > WILD_CAP && far > 60)) {
        d.gone = true;
        active--;
      }
    }
    if (active >= WILD_CAP) return;
    // One refill a tick for the home groups, and the thistles on their own.
    for (const g of GROUPS) {
      let n = 0;
      for (const d of s.downies) if (!d.gone && !d.tame && d.kind === g.kind && Math.abs(d.homeX - g.x) < 1 && Math.abs(d.homeZ - g.z) < 1) n++;
      if (n < g.n && Math.hypot(g.x - p.x, g.z - p.z) > 30) {
        this.spawnWild(g);
        break;
      }
    }
    const dusk = s.hour >= 17.5 && s.hour < 20.5;
    if (dusk) {
      let n = 0;
      for (const d of s.downies) if (!d.gone && !d.tame && d.kind === 'thistle') n++;
      if (n < 2 && Math.hypot(RIDGE_TOP.x - p.x, RIDGE_TOP.z - p.z) > 18) this.spawnWild({ kind: 'thistle', x: RIDGE_TOP.x, z: RIDGE_TOP.z, n: 2 });
    }
    // Seeing a thistle (the goal is to catch one: they bolt, so it takes a running approach or a quick tug).
    if (!this.thistleSeen) {
      for (const d of s.downies) if (!d.gone && d.kind === 'thistle' && Math.hypot(d.x - p.x, d.z - p.z) < 9) this.thistleSeen = true;
    }
  }

  // ------------------------------------------------------------ the journal

  complete(id: GoalId): void {
    const s = this.s;
    if (s.goals.includes(id)) return;
    s.goals.push(id);
    const g = GOALS.find((q) => q.id === id)!;
    s.coins += g.reward;
    s.earned += g.reward;
    this.emit({ t: 'goal', id });
  }

  private checkGoals(): void {
    const s = this.s;
    if (s.earned >= 10000) this.complete('rich');
    // A full pen of a kind.
    for (const [id, want] of Object.entries(FULL_PEN) as [GoalId, { kind: DownyKind; n: number }][]) {
      if (s.goals.includes(id)) continue;
      for (let i = 0; i < s.pads.length; i++) {
        if (s.pads[i].kind !== 'pen') continue;
        let n = 0;
        for (const d of s.downies) if (!d.gone && d.pen === i && d.kind === want.kind) n++;
        if (n >= want.n) {
          this.complete(id);
          break;
        }
      }
    }
    this.tickOrders();
    this.duskCheck();
  }

  /** The evening already warned about an empty feeder (a day number). */
  private warned = 0;
  /** When the pens are looked over at dusk: half past six, as the light goes. */
  static readonly DUSK_CHECK = 18.5;

  /**
   * At dusk, a pen with downies and nothing to eat for the night (its feeder empty, or no feeder and no food lying
   * in it) is called out, once an evening (the seventh playtest's stray starved overnight beside an empty feeder
   * with no word first).
   */
  private duskCheck(): void {
    const s = this.s;
    if (s.hour < Sim.DUSK_CHECK || s.hour >= 21 || this.warned === s.day || !this.knows('lesson:ups')) return;
    this.warned = s.day;
    s.pads.forEach((p, i) => {
      if (p.kind !== 'pen' || this.warned < 0) return;
      if (!s.downies.some((d) => !d.gone && d.pen === i)) return;
      const feeder = p.ups.includes('feeder');
      if (feeder && p.feeder.n > 0) return;
      if (!feeder && s.items.some((it) => !it.gone && isFood(it.type) && this.phys.penAt(it.x, it.z) === i)) return;
      this.emit({ t: 'hungrynight', pen: i, feeder });
      // (One word an evening: the first such pen.)
      this.warned = -s.day;
    });
    if (this.warned < 0) this.warned = s.day;
  }

  // ------------------------------------------------------------ the market and its orders

  /** Today's order, once taken (open, filled or missed), or null. */
  get order(): Order | null {
    return this.s.orders.find((o) => o.state !== 'offer') ?? null;
  }

  /** The orders on the board waiting to be taken (none once one is taken). */
  offers(): Order[] {
    return this.s.orders.filter((o) => o.state === 'offer');
  }

  /**
   * Sells one fluff at the crate at today's price, counts it towards the open
   * fluff order of its kind, and pays the order when it fills. Returns the
   * coins it brought in (the order's pay included). blown: you blew or tipped
   * it in; feed: the meal you gave that it came from (0: none).
   */
  sellFluff(k: DownyKind, blown = true, feed = 0, x = CRATE_X, y = 0, z = CRATE_Z): number {
    const s = this.s;
    const coins = this.price(k);
    s.market.sold[k]++;
    s.coins += coins;
    s.earned += coins;
    s.stats.sold++;
    const by = (s.stats.kinds ??= {});
    by[k] = (by[k] ?? 0) + 1;
    // The loop closed: a meal you gave, its fluff pulled up and blown in. Counted once per meal.
    const cycle = blown && feed > 0 && !this.cycled.has(feed);
    if (cycle) {
      this.cycled.add(feed);
      if (this.cycled.size > 64) this.cycled.delete(this.cycled.values().next().value!);
    }
    this.emit({ t: 'sell', x, y, z, kind: k, coins, blown, cycle });
    if (s.stats.sold >= 20) this.complete('sell');
    let bonus = 0;
    const o = s.orders.find((q) => q.state === 'open' && !q.live && q.kind === k && q.got < q.n);
    if (o) {
      o.got++;
      o.paid += coins;
      if (o.got >= o.n) bonus = this.fill(o);
      this.emit({ t: 'order', kind: k, live: false, got: o.got, n: o.n, state: o.state === 'filled' ? 'filled' : 'progress', bonus, x, z });
    }
    return coins + bonus;
  }

  /**
   * The open live order a downy of this kind would go to at the crate: one
   * caught today (the fifth playtest filled its live orders from its own pens,
   * so the trip out could be skipped). The board's rare one goes in a pen, not
   * the crate (see rarePenned).
   */
  private liveFor(k: DownyKind, caught: number, _rare = false): Order | undefined {
    const s = this.s;
    return s.orders.find((q) => q.state === 'open' && q.live && !q.rare && q.kind === k && q.got < q.n && caught === s.day);
  }

  /** Is there an open live order a downy of this kind (caught on that day) would go to at the crate? */
  wantsDowny(k: DownyKind, caught = this.s.day, rare = false): boolean {
    return !!this.liveFor(k, caught, rare);
  }

  /** Why the crate would not take a downy blown at it for today's order, or '' if no open order wants the kind. */
  staleNote(k: DownyKind, rare = false): string {
    if (rare && this.s.orders.some((q) => q.state === 'open' && q.rare && q.kind === k && q.got < q.n)) return 'Blow it into a pen. It stays.';
    const o = this.s.orders.find((q) => q.state === 'open' && q.live && !q.rare && q.kind === k && q.got < q.n);
    return o ? 'The order wants one caught today.' : '';
  }

  /**
   * The board's rare one, caught today, comes down in one of your pens: it
   * fills the order and pays its coins (capped at about the trip's), and stays,
   * its pen shedding more for good (the sixth playtest's paid 2,680 coins in
   * the crate and was gone).
   */
  private rarePenned(d: Downy, pen: number): void {
    const s = this.s;
    if (d.caught !== s.day) return;
    const o = s.orders.find((q) => q.state === 'open' && q.rare && q.kind === d.kind && q.got < q.n);
    if (!o) return;
    o.got = 1;
    o.paid = o.pay;
    s.coins += o.pay;
    s.earned += o.pay;
    s.stats.live = (s.stats.live ?? 0) + 1;
    const at = PADS[pen];
    this.emit({ t: 'deliver', x: d.x, y: d.y, z: d.z, kind: d.kind, coins: o.pay, rare: true });
    this.fill(o);
    this.emit({ t: 'order', kind: d.kind, live: true, got: 1, n: 1, state: 'filled', bonus: o.pay, x: at.x, z: at.z, rare: true });
  }

  /**
   * For the tug ring: of a wild downy you are pulling at that breaks free if you
   * are slow (a brook slips into the pond, a thistle bolts), the share of its
   * time left, 1 down to 0; -1 for one with no time limit.
   */
  tugLeft(d: Downy): number {
    const lim = fightLimit(d);
    if (d.tame || d.keep || lim <= 0 || d.strain <= 0) return -1;
    return clamp(1 - d.strain / lim, 0, 1);
  }

  /**
   * A downy of yours blown into the sell crate for today's live order: it goes
   * to the buyer, and pays the order's price for it. Returns the coins, or -1
   * if no open order wants it (the crate takes downies only for one, and only
   * one caught today, or the board's rare one for its order).
   */
  sellDowny(k: DownyKind, x = CRATE_X, y = 0, z = CRATE_Z, caught = this.s.day, rare = false): number {
    const s = this.s;
    const o = this.liveFor(k, caught, rare);
    if (!o) return -1;
    o.got++;
    o.paid += o.pay;
    s.coins += o.pay;
    s.earned += o.pay;
    s.stats.live = (s.stats.live ?? 0) + 1;
    this.emit({ t: 'deliver', x, y, z, kind: k, coins: o.pay, rare: !!o.rare });
    if (o.got >= o.n) this.fill(o);
    // A filled live order says what it all came to.
    this.emit({ t: 'order', kind: k, live: true, got: o.got, n: o.n, state: o.state === 'filled' ? 'filled' : 'progress', bonus: o.state === 'filled' ? o.paid : 0, x, z, rare: !!o.rare });
    return o.pay;
  }

  /** An order filled: a fluff order pays its sum on top of the sales. Returns that bonus. */
  private fill(o: Order): number {
    const s = this.s;
    o.state = 'filled';
    // (An order from an older save, posted before orders had a price, pays its fluff's sales again.)
    const bonus = o.live ? 0 : o.pay > 0 ? o.pay : Math.round(o.paid * (o.mult - 1));
    s.coins += bonus;
    s.earned += bonus;
    s.stats.filled++;
    if (o.mult > 2) s.stats.prized++;
    this.complete('order');
    if (s.stats.filled >= 5) this.complete('orders5');
    if (o.mult > 2) this.complete('prized');
    return bonus;
  }

  /** How many of each kind you keep: tame ones penned, loose or in the jar. */
  kept(): Record<DownyKind, number> {
    const s = this.s;
    const out: Record<DownyKind, number> = { clover: 0, ember: 0, brook: 0, thistle: 0 };
    for (const d of s.downies) if (!d.gone && d.tame) out[d.kind]++;
    for (const q of s.slots) if (q.t && isDowny(q.t)) out[q.t] += q.n;
    return out;
  }

  /** Room for this many more downies in your pens, all told (ten to a pen). */
  penRoom(): number {
    const s = this.s;
    let room = 0;
    s.pads.forEach((p, i) => {
      if (p.kind !== 'pen') return;
      let n = 0;
      for (const d of s.downies) if (!d.gone && d.pen === i) n++;
      room += Math.max(0, PEN_MAX - n);
    });
    return room;
  }

  /** About how much fluff of a kind the downies you keep make by dusk, from this hour (a meal every five hours or so, two fluff a meal). */
  makes(k: DownyKind, hour = this.s.hour): number {
    const left = Math.max(0, ORDER_BY - Math.max(hour, 6));
    return this.kept()[k] * 2 * (left / 5);
  }

  /**
   * The fluff orders the board may ask for, and how much: only kinds you keep,
   * about 70% of what those downies make by dusk (so filling one is a day of
   * tending them: feeders kept up, fluff pulled; the fourth playtest's asked
   * about 45%, what you made anyway), at least 4 (a thistle 2), and only if
   * they can make it.
   */
  orderChoices(hour = this.s.hour): { kind: DownyKind; n: number; kept: number }[] {
    const kept = this.kept();
    const out: { kind: DownyKind; n: number; kept: number }[] = [];
    const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
    const cap: Record<DownyKind, number> = { clover: 30, ember: 26, brook: 22, thistle: 12 };
    for (const k of KINDS) {
      const have = kept[k];
      if (have <= 0) continue;
      const make = this.makes(k, hour);
      const n = Math.max(k === 'thistle' ? 2 : 4, Math.min(cap[k], even(make * 0.7)));
      if (make >= n + 0.5) out.push({ kind: k, n, kept: have });
    }
    return out;
  }

  /** The kinds a live order may ask for: those you can go out and catch today (their gate open). Thistles come only at dusk, so never. */
  liveKinds(): DownyKind[] {
    const g = this.s.gates;
    return KINDS.filter((k) => k === 'clover' || (k === 'ember' && g.ridge) || (k === 'brook' && g.hollow));
  }

  /** Days since the board last offered this (kind, and fluff, live downies or a rare one), up to 4; 4 if it never has. */
  private stale(k: DownyKind, what: 'fluff' | 'live' | 'rare'): number {
    const s = this.s;
    for (let i = s.orderLog.length - 1; i >= 0; i--) {
      const o = s.orderLog[i];
      if (o.kind === k && (o.rare ? 'rare' : o.live ? 'live' : 'fluff') === what) return Math.min(4, Math.max(0, s.day - o.day));
    }
    return 4;
  }

  /** Pick one by weight (deterministic: the sim's own rand). */
  private pickWeighted<T>(items: T[], w: (t: T) => number): T | undefined {
    const ws = items.map(w);
    const total = ws.reduce((a, b) => a + b, 0);
    if (!(total > 0)) return undefined;
    let r = this.rand() * total;
    for (let i = 0; i < items.length; i++) {
      r -= ws[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  /**
   * The morning's offers (the fourth playtest's top fun change): you take one
   * at the board, so each morning is a choice with a trade-off.
   * - A fluff order for a kind you keep: a day of tending at home. The board
   *   asks for what it has not asked for lately and for kinds you keep but
   *   sell little of, so a kind kept and never asked for (the playtest's six
   *   brooks) comes up.
   * - Live downies of a kind you can catch today, blown into the crate: a trip
   *   out, worth about what the fluff order adds (two to four downies), so
   *   catching keeps its purpose once the pens are full.
   * - Once you keep two kinds, a fluff order for another: a prized one (pays
   *   triple) for thistles, and with Brook Hollow open every third day's first
   *   is a big prized one.
   */
  offerOrders(hour = this.s.hour): Order[] {
    const s = this.s;
    const kept = this.kept();
    const out: Order[] = [];
    const choices = this.orderChoices(hour);
    const keptTotal = KINDS.reduce((a, k) => a + kept[k], 0) || 1;
    const sold = s.stats.kinds ?? {};
    const soldTotal = KINDS.reduce((a, k) => a + (sold[k] ?? 0), 0);
    // A kind you keep plenty of but sell little of is asked for more.
    const under = (k: DownyKind) => (soldTotal >= 20 && (sold[k] ?? 0) / soldTotal < (kept[k] / keptTotal) * 0.6 ? 1.6 : 1);
    // Yesterday's first order is asked for again less often.
    const yFirst = s.orderLog.find((o) => o.day === s.day - 1);
    const fluffW = (c: { kind: DownyKind; kept: number }) => Math.sqrt(c.kept) * (1 + this.stale(c.kind, 'fluff')) * under(c.kind) * (c.kind === 'thistle' ? 0.7 : 1) * (yFirst && !yFirst.live && yFirst.kind === c.kind ? 0.45 : 1);
    // A prized order pays triple, and is a stretch for it: half as much fluff again (a big one), or a thistle's
    // nearly all its downies make by dusk, so it never pays more for the same share of a day as a plain one.
    const fluff = (c: { kind: DownyKind; n: number }, big: boolean): Order => {
      const prized = big || c.kind === 'thistle';
      const most = Math.floor(this.makes(c.kind, hour) * 0.9);
      const n = big ? Math.min(40, Math.round((c.n * 1.45) / 2) * 2) : c.kind === 'thistle' ? Math.max(c.n, Math.min(most, c.n + 4)) : c.n;
      const mult = prized ? 3 : 2;
      return { kind: c.kind, n, got: 0, paid: 0, mult, pay: Math.round(n * this.price(c.kind) * (mult - 1)), state: 'offer' };
    };
    // A thistle you keep, its fluff not asked for in two days: the morning's fluff order is its prized one (triple).
    const th = choices.find((c) => c.kind === 'thistle');
    const first = th && this.stale('thistle', 'fluff') >= 2 ? th : this.pickWeighted(choices, fluffW);
    if (first) out.push(fluff(first, !!s.gates.hollow && s.day % 3 === 0 && first.kind !== 'thistle'));
    // Live downies: a trip out instead of a day at home, for about what the fluff order adds.
    const left = Math.max(0, ORDER_BY - Math.max(hour, 6));
    if (left >= 6) {
      // About what a plain fluff order adds (a prized one's pay counts once, not twice), in two to five downies:
      // a kind whose price fits that comes up more often.
      const worth = out[0] ? out[0].pay / (out[0].mult - 1) : 0;
      // (A quarter more than the fluff order: the fifth playtest found the trip extra work for the same coins.)
      const fits = (k: DownyKind) => !worth || (worth * LIVE_OVER >= LIVE_EACH[k] * 1.5 && worth * LIVE_OVER <= LIVE_EACH[k] * 5.5);
      const open = this.liveKinds();
      // None fits (a big thistle order): the dearest kind you can catch.
      const fit = open.filter(fits);
      const lk = fit.length ? this.pickWeighted(fit, (k) => (1 + this.stale(k, 'live')) * (kept[k] < 3 ? 2 : 1) * (first && k === first.kind ? 0.35 : 1)) : open.sort((a, b) => LIVE_EACH[b] - LIVE_EACH[a])[0];
      if (lk) {
        const n = Math.max(2, Math.min(5, Math.round(((worth || LIVE_EACH[lk] * 2) * LIVE_OVER) / LIVE_EACH[lk])));
        out.push({ kind: lk, live: true, n, got: 0, paid: 0, mult: 2, pay: LIVE_EACH[lk], state: 'offer' });
      }
    }
    // The rare one, a hunt (the sixth playtest's top fun change): one sought-after wild downy, seen at a landmark,
    // warier than any other and lured with its favourite food. Penned, it stays and its pen sheds more for good;
    // its coins are three quarters of the day's trip, never more (the sixth playtest's paid 3.8 times the trip).
    // The offers differ in kind, not size: a day at home tending, a trip for downies caught today, or a hunt.
    // Only while one of your pens has no rare one yet (the seventh playtest was offered a second gold clover on days 3
    // and 5, though a second in its pen added nothing).
    if (left >= 4 && rarePenOf(s) >= 0) {
      const open = this.liveKinds();
      const live = out.find((o) => o.live);
      const rk = this.pickWeighted(open, (k) => (1 + this.stale(k, 'rare')) * (live && k === live.kind && open.length > 1 ? 0.3 : 1));
      const spots = SIGHTINGS.map((q, i) => ({ q, i })).filter((o) => o.q.kind === rk);
      if (rk && spots.length) {
        // Never where it was seen the morning before, and a place not seen lately more often (the sixth playtest's
        // came up at the same landmark two mornings running, twice).
        const ago = (i: number) => {
          for (let j = s.orderLog.length - 1; j >= 0; j--) if (s.orderLog[j].rare && s.orderLog[j].spot === i) return s.day - s.orderLog[j].day;
          return 6;
        };
        const at = this.pickWeighted(spots, (o) => (ago(o.i) <= 1 ? 0 : Math.min(6, ago(o.i)))) ?? spots[Math.floor(this.rand() * spots.length) % spots.length];
        // Three quarters of the trip's, never less than one downy of its kind would fetch, never more than the trip.
        const trip = live ? live.n * live.pay : LIVE_EACH[rk] * 3;
        const pay = Math.min(trip, Math.max(LIVE_EACH[rk], Math.round((trip * RARE_PAY) / 5) * 5));
        out.push({ kind: rk, live: true, n: 1, got: 0, paid: 0, mult: 2, pay, state: 'offer', rare: { spot: at.i } });
      }
    }
    return out;
  }

  /**
   * The board posts the morning's offers (from dawn to noon; a later start
   * waits for the next morning). force: post now, whatever the hour.
   */
  postOrders(force = false): void {
    const s = this.s;
    if (!force && (s.orderDay >= s.day || s.hour < ORDER_POST[0] || s.hour >= ORDER_POST[1])) return;
    s.orderDay = s.day;
    // An order still open from yesterday (the first order runs to the next dusk) stays beside the new offers.
    const kept = s.orders.filter((o) => o.state === 'open' && (o.until ?? 0) >= s.day);
    const fresh = this.offerOrders();
    s.orders = [...kept, ...fresh];
    this.logOffers(fresh);
  }

  /** Remember what the board offered today (it asks for what it has not asked for lately), and say so. */
  private logOffers(list: Order[]): void {
    const s = this.s;
    for (const o of list) {
      s.orderLog.push({ kind: o.kind, live: !!o.live, day: s.day, ...(o.rare ? { rare: true, spot: o.rare.spot } : {}) });
      this.emit({ t: 'order', kind: o.kind, live: !!o.live, got: 0, n: o.n, state: 'posted', bonus: 0, x: CRATE_X, z: CRATE_Z });
    }
    if (s.orderLog.length > 16) s.orderLog.splice(0, s.orderLog.length - 16);
  }

  /**
   * The first order, as soon as the loop lesson ends (the fourth playtest's
   * came the next dawn, twenty real minutes on, while the journal asked for
   * one): four fluff of the kind you keep most. It runs until the next day's
   * dusk (the sixth playtest's was taken at 17:38, the garden and dusk lessons
   * took the page, and it lapsed at 19:00, 40 real seconds later).
   */
  private postFirst(): void {
    const s = this.s;
    const kept = this.kept();
    const k = KINDS.reduce((a, b) => (kept[b] > kept[a] ? b : a), 'clover' as DownyKind);
    if (kept[k] <= 0) return;
    s.orderDay = s.day;
    // Posted after midnight (a late loop), it is the morning's: it runs to that dusk and the next.
    s.orders = [{ kind: k, n: 4, got: 0, paid: 0, mult: 2, pay: 4 * this.price(k), state: 'offer', until: s.day + 1 }];
    this.logOffers(s.orders);
  }

  /**
   * Take an offer from the board (index among the offers): it is today's
   * order, and the others are wiped off. Returns false if there is no such offer.
   */
  takeOrder(i: number): boolean {
    const s = this.s;
    const o = this.offers()[i];
    if (!o || (s.hour >= ORDER_BY && (o.until ?? s.day) <= s.day)) return false;
    o.state = 'open';
    o.until ??= s.day;
    // The others on offer are wiped off; an order still open from yesterday stays.
    s.orders = s.orders.filter((q) => q === o || q.state === 'open');
    if (o.rare) this.spawnRare(o);
    this.emit({ t: 'order', kind: o.kind, live: !!o.live, got: 0, n: o.n, state: 'taken', bonus: 0, x: CRATE_X, z: CRATE_Z });
    return true;
  }

  /** The board's rare downy, at the landmark where it was seen (a few metres off it, on dry ground), from now until dusk. */
  private spawnRare(o: Order): Downy | null {
    const s = this.s;
    if (!o.rare) return null;
    for (const d of s.downies) if (!d.gone && d.rare && !d.tame) d.gone = true;
    const sp = SIGHTINGS[o.rare.spot];
    let x = sp.x;
    let z = sp.z;
    for (let k = 0; k < 8; k++) {
      const a = this.rand() * Math.PI * 2;
      const r = 0.8 + this.rand() * 1.8;
      const qx = sp.x + Math.cos(a) * r;
      const qz = sp.z + Math.sin(a) * r;
      if (waterAt(qx, qz) < this.phys.floor(qx, qz) - 0.05) {
        x = qx;
        z = qz;
        break;
      }
    }
    const d = newDowny(s, o.kind, x, 0, z);
    d.y = this.phys.floor(x, z) + 0.3;
    d.homeX = sp.x;
    d.homeZ = sp.z;
    d.hunger = 0.2;
    d.rare = true;
    s.downies.push(d);
    return d;
  }

  /**
   * About how many coins a day a rare one adds once penned: one more fluff a meal from every downy in the pen
   * it would join (see rarePenOf), at today's prices, rounded to ten.
   */
  rareWorth(): number {
    const s = this.s;
    const i = rarePenOf(s);
    if (i < 0) return 0;
    let v = 0;
    for (const d of s.downies) if (!d.gone && d.pen === i) v += PEN_MEALS * this.price(d.kind);
    return Math.round(v / 10) * 10;
  }

  /** The board's rare downy, wild and waiting where it was seen, if it is out today. */
  rareWild(): Downy | null {
    return this.s.downies.find((d) => !d.gone && d.rare && !d.tame) ?? null;
  }

  /**
   * The words for an offer on its tag: what it wants, and what the order pays
   * (a fluff order on top of its fluff's sales, so "168 more" beside a trip's
   * "165" no longer reads as the same money; the fifth playtest misread it).
   * The rare one's says where it was seen, what it pays, and that it stays.
   */
  offerTag(o: Order): { title: string; note: string } {
    const name = KIND[o.kind].name.replace(' downy', '');
    if (o.rare) {
      const r = RARE_NAME[o.kind];
      // What it is worth once penned, as a number (the seventh playtest read "Its pen sheds more." and picked the biggest pay).
      const worth = this.rareWorth();
      return { title: `${r[0].toUpperCase()}${r.slice(1)} downy`, note: worth > 0 ? `By ${SIGHTINGS[o.rare.spot].name}. Pays ${fmtCoins(o.pay)}, then about ${fmtCoins(worth)} a day` : `By ${SIGHTINGS[o.rare.spot].name}. Pays ${fmtCoins(o.pay)}, and stays` };
    }
    if (o.live) return { title: `${o.n} ${name} downies`, note: `Caught today. Pays ${fmtCoins(o.n * o.pay)}` };
    return { title: `${o.n} ${name} fluff`, note: `Pays ${fmtCoins(o.pay)} on top of sales` };
  }

  /** Each half second: the first order once the lessons bring orders in, the morning's offers, and dusk closing what is left. */
  private tickOrders(): void {
    const s = this.s;
    if (!this.knows('orders')) return;
    if (s.orderDay === 0) this.postFirst();
    this.postOrders();
    // An order goes at dusk on its last day: the day it was posted (the first order, the next day).
    const over = (o: Order) => {
      const until = o.until ?? s.orderDay;
      return s.day > until || (s.day === until && s.hour >= ORDER_BY);
    };
    for (const o of s.orders) {
      if (o.state !== 'open' || !over(o)) continue;
      o.state = 'missed';
      this.emit({ t: 'order', kind: o.kind, live: !!o.live, got: o.got, n: o.n, state: 'missed', bonus: 0, x: CRATE_X, z: CRATE_Z });
    }
    if (s.hour >= ORDER_BY || s.hour < ORDER_POST[0]) {
      // Offers nobody took go with their day, and so does the rare one, if it was not caught.
      const going = (o: Order) => o.state === 'offer' && over(o);
      if (s.orders.some(going)) s.orders = s.orders.filter((o) => !going(o));
      for (const d of s.downies) if (!d.gone && d.rare && !d.tame) d.gone = true;
    }
  }

  /** The next goals to show: the first two not yet done. */
  openGoals(n = 2): typeof GOALS {
    return GOALS.filter((g) => !this.s.goals.includes(g.id)).slice(0, n);
  }

  // ------------------------------------------------------------ interacting

  /** What the player could interact with from here, if anything. */
  interactable(aim: Aim): Interactable | null {
    const s = this.s;
    const p = s.player;
    let best: Interactable | null = null;
    let bs = -1;
    const consider = (it: Interactable, reach: number) => {
      const dx = it.x - p.x;
      const dz = it.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > reach) return;
      const facing = d < 0.8 ? 1 : (dx * aim.dx + dz * aim.dz) / (d * Math.hypot(aim.dx, aim.dz) || 1);
      if (facing < 0.35) return;
      const score = facing * 2 - d / reach;
      if (score > bs) {
        bs = score;
        best = it;
      }
    };
    s.pads.forEach((pad, i) => {
      if (!this.padUsable(i)) return;
      const sp = padSpots(i);
      const fl = this.phys.floor(sp.post.x, sp.post.z);
      const label = pad.kind === 'empty' ? 'Empty plot' : pad.kind === 'pen' ? 'Pen post' : pad.kind === 'garden' ? 'Garden post' : 'Silo post';
      // The post's arm is where the tags hang: aim anywhere along it.
      consider({ kind: pad.kind === 'silo' ? 'silo' : 'pad', id: i, label, x: sp.post.x, y: fl + 1.2, z: sp.post.z }, 2.8);
      consider({ kind: pad.kind === 'silo' ? 'silo' : 'pad', id: i, label, x: sp.post.x + 1.7, y: fl + 1.8, z: sp.post.z }, 3.2);
      if (pad.kind === 'pen' && pad.ups.includes('chute')) {
        const n = pad.chute.reduce((a, b) => a + b, 0);
        const cfl = this.phys.floor(sp.chute.x, sp.chute.z);
        consider({ kind: 'chute', id: i, label: n ? `Fluff box, ${n}` : 'Fluff box, empty', x: sp.chute.x, y: cfl + 0.6, z: sp.chute.z }, 2.4);
      }
    });
    // The price board, while the morning's offers wait to be taken.
    if (this.knows('orders') && this.offers().length) consider({ kind: 'board', id: 0, label: 'Price board', x: BOARD.x, y: this.phys.floor(BOARD.x, BOARD.z) + 1.6, z: BOARD.z }, 3.4);
    if (this.knows('bench')) consider({ kind: 'bench', id: 0, label: 'Workbench', x: WORKBENCH.x, y: this.phys.floor(WORKBENCH.x, WORKBENCH.z) + 1.4, z: WORKBENCH.z }, BENCH_REACH);
    if (this.knows('sleep') && Sim.sleepTime(s.hour)) consider({ kind: 'door', id: 0, label: 'Front door', x: DOOR.x, y: this.phys.floor(DOOR.x, DOOR.z) + 1.4, z: DOOR.z }, 2.6);
    for (const g of Object.keys(GATES) as GateId[]) {
      if (s.gates[g] || !this.knows('gates')) continue;
      const gt = GATES[g];
      const side = g === 'ridge' ? 1 : -1;
      consider({ kind: 'gate', id: g, label: `Gate to ${gt.name}`, x: gt.x + side * 0.6, y: this.phys.floor(gt.x, gt.z) + 1.5, z: gt.z }, 3.4);
    }
    return best;
  }

  /** Which builds and upgrades the lessons have brought in: each tag hangs once it matters. */
  private buildKnown(k: Exclude<PadKind, 'empty'>): boolean {
    return k === 'pen' ? this.knows('pads') : k === 'garden' ? this.knows('garden') : this.knows('silo');
  }

  private upKnown(id: string): boolean {
    return this.knows(`up:${id}`);
  }

  /** Does this pad's post have anything to offer yet? (Cheap: no menu is built.) */
  padUsable(i: number): boolean {
    if (!this.knows('pads')) return false;
    const pad = this.s.pads[i];
    if (pad.kind === 'empty') return true;
    if (pad.kind === 'pen') return pad.ups.includes('feeder') || PEN_UPS.some((u) => !pad.ups.includes(u.id) && this.upKnown(u.id));
    return true;
  }

  menu(it: Interactable): MenuOption[] {
    const s = this.s;
    const can = (c: number) => s.coins >= c;
    const out: MenuOption[] = [];
    if (it.kind === 'pad' || it.kind === 'silo') {
      const i = it.id as number;
      const pad = s.pads[i];
      if (pad.kind === 'empty') {
        for (const k of ['pen', 'garden', 'silo'] as const) if (this.buildKnown(k)) out.push({ id: `build:${k}`, title: BUILD_NAME[k], price: BUILD_COST[k], ok: can(BUILD_COST[k]), note: k === 'pen' ? 'A round corral' : k === 'garden' ? 'Blow food in to plant' : 'Stores four kinds' });
      } else if (pad.kind === 'pen') {
        for (const u of PEN_UPS) if (!pad.ups.includes(u.id) && this.upKnown(u.id)) out.push({ id: `pen:${u.id}`, title: u.name, price: u.cost, ok: can(u.cost), note: u.line });
        if (pad.ups.includes('feeder')) out.push({ id: 'info', title: pad.feeder.n ? `Feeder: ${pad.feeder.n}` : 'Feeder empty', price: null, ok: false, note: 'Blow food in at the top' });
      } else if (pad.kind === 'garden') {
        // The feed run hangs only where it would reach a pen with a feeder, the next plot on the row (the fourth
        // playtest's hung beside no pen at all, a 300 coin trap).
        if (this.upKnown('garden')) for (const u of GARDEN_UPS) if (!pad.ups.includes(u.id) && (u.id !== 'run' || (this.upKnown('run') && this.runNeighbours(i).length > 0))) out.push({ id: `garden:${u.id}`, title: u.name, price: u.cost, ok: can(u.cost), note: u.line });
        out.push({ id: 'garden:clear', title: pad.crop ? 'Pull the crop' : 'Bed is empty', price: null, ok: !!pad.crop, note: pad.crop ? 'Then blow in something new' : 'Blow food in to plant it' });
      } else if (pad.kind === 'silo') {
        if (!pad.silo.length) out.push({ id: 'info', title: 'Silo is empty', price: null, ok: false, note: 'Blow food or fluff at it' });
        pad.silo.forEach((b, k) => out.push({ id: `silo:${k}`, title: `${thingName(b.t, 2)}`, price: null, ok: true, note: `${b.n} stored${k === pad.siloSel ? ', pulling these' : ''}` }));
      }
    } else if (it.kind === 'bench') {
      for (const u of BENCH_UPS) {
        if (!this.upKnown(u.id)) continue;
        const lvl = s.up[u.id];
        if (lvl >= u.costs.length) continue;
        const c = u.costs[lvl];
        out.push({ id: `bench:${u.id}`, title: u.name, price: c, ok: can(c), note: u.line });
      }
      if (!out.length) out.push({ id: 'info', title: 'Nothing left to fit', price: null, ok: false, note: 'The bellows are as good as they get' });
    } else if (it.kind === 'board') {
      // The morning's offers: take one.
      this.offers().forEach((o, i) => {
        const tg = this.offerTag(o);
        out.push({ id: `order:${i}`, title: tg.title, price: null, ok: s.hour < ORDER_BY, note: tg.note });
      });
    } else if (it.kind === 'door') {
      out.push({ id: 'sleep', title: 'Sleep till morning', price: null, ok: true, note: 'Saves the ranch' });
    } else if (it.kind === 'gate') {
      const g = GATES[it.id as GateId];
      out.push({ id: `gate:${it.id}`, title: g.name, price: g.cost, ok: can(g.cost), note: 'Opens the gate' });
    } else if (it.kind === 'chute') {
      this.emptyChute(it.id as number);
    }
    return out;
  }

  /** Carries out a menu choice. Returns true if something changed. */
  choose(it: Interactable, id: string): boolean {
    const s = this.s;
    const [a, b] = id.split(':');
    const pay = (c: number) => {
      if (s.coins < c) {
        this.emit({ t: 'deny', why: `That needs ${fmtCoins(c)} coins.` });
        return false;
      }
      s.coins -= c;
      return true;
    };
    if (a === 'build') {
      const i = it.id as number;
      const k = b as Exclude<PadKind, 'empty'>;
      if (!pay(BUILD_COST[k])) return false;
      const pad = s.pads[i];
      pad.kind = k;
      pad.ups = [];
      pad.crop = null;
      pad.grow = 0;
      this.phys.setPads(s.pads);
      // Anything standing on a new pen stays on the side it was on.
      this.emit({ t: 'build', pad: i, what: k, x: PADS[i].x, z: PADS[i].z });
      return true;
    }
    if (a === 'pen') {
      const i = it.id as number;
      const u = PEN_UPS.find((q) => q.id === b)!;
      if (!pay(u.cost)) return false;
      s.pads[i].ups.push(u.id as PenUp);
      this.phys.setPads(s.pads);
      this.emit({ t: 'build', pad: i, what: u.id, x: PADS[i].x, z: PADS[i].z });
      if (u.id === 'feeder') this.complete('feeder');
      return true;
    }
    if (a === 'garden') {
      const i = it.id as number;
      if (b === 'clear') {
        s.pads[i].crop = null;
        s.pads[i].grow = 0;
        this.emit({ t: 'build', pad: i, what: 'clear', x: PADS[i].x, z: PADS[i].z });
        return true;
      }
      const u = GARDEN_UPS.find((q) => q.id === b)!;
      if (!pay(u.cost)) return false;
      s.pads[i].ups.push(u.id as GardenUp);
      this.emit({ t: 'build', pad: i, what: u.id, x: PADS[i].x, z: PADS[i].z });
      return true;
    }
    if (a === 'silo') {
      s.pads[it.id as number].siloSel = Number(b);
      return true;
    }
    if (a === 'bench') {
      const u = BENCH_UPS.find((q) => q.id === b)!;
      const lvl = s.up[u.id as BenchUp];
      if (lvl >= u.costs.length || !pay(u.costs[lvl])) return false;
      s.up[u.id as BenchUp]++;
      if (u.id === 'slots') s.slots.push({ t: null, n: 0 });
      this.emit({ t: 'build', pad: -1, what: u.id, x: WORKBENCH.x, z: WORKBENCH.z });
      return true;
    }
    if (a === 'gate') {
      const g = b as GateId;
      if (!pay(GATES[g].cost)) return false;
      s.gates[g] = true;
      this.phys.gates = { ...s.gates };
      this.emit({ t: 'gate', gate: g });
      this.complete(g === 'ridge' ? 'ridge' : 'hollow');
      return true;
    }
    if (a === 'sleep') {
      this.sleep();
      return true;
    }
    if (a === 'order') return this.takeOrder(Number(b));
    return false;
  }

  emptyChute(i: number): number {
    const s = this.s;
    const pad = s.pads[i];
    let moved = 0;
    KINDS.forEach((k, j) => {
      while (pad.chute[j] > 0 && this.stow(KIND_TUFT[k])) {
        pad.chute[j]--;
        moved++;
      }
    });
    if (moved) {
      const c = padSpots(i).chute;
      this.emit({ t: 'suck', thing: 'tuft-clover', x: c.x, y: this.phys.floor(c.x, c.z) + 0.6, z: c.z });
    } else if (pad.chute.some((n) => n > 0)) this.refuseFull();
    return moved;
  }

  private refuseFull(): void {
    const s = this.s;
    this.emit({ t: 'full', thing: s.slots[s.sel].t ?? 'tuft-clover' });
  }

  // ------------------------------------------------------------ debug helpers

  spawn(kind: DownyKind, x: number, z: number, tame = true): Downy {
    const d = newDowny(this.s, kind, x, 0, z);
    d.y = this.phys.floor(x, z) + 0.3;
    d.tame = tame;
    d.homeX = x;
    d.homeZ = z;
    d.pen = this.phys.penAt(x, z);
    this.s.downies.push(d);
    return d;
  }

  drop(type: ItemType, x: number, z: number): Item {
    const it = newItem(this.s, type, x, 0, z);
    it.y = this.phys.floor(x, z) + 0.4;
    this.s.items.push(it);
    return it;
  }
}

/** By the ranch gate: to the gap on this side of the fence, then straight through (inside: out; outside: in). */
function byRanchGate(n: Nettle, inside: boolean): [number, number] {
  if (Math.abs(n.x) > 1.4) return [0, RANCH_Z + (inside ? 1.4 : -1.4)];
  return [0, RANCH_Z + (inside ? -2 : 2)];
}

export function angleTo(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export { EYE };
