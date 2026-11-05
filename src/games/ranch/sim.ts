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
  ORDER_NIGHT,
  ORDER_MORN,
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
import { BED_HALF, CRATE, CRATE_BOXES, Physics, SILO_H, SILO_R } from './physics';
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
  CRAG,
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
  | { t: 'stock'; pad: number; food: Food; n: number; feeder: boolean; gave?: boolean }
  | { t: 'crop'; pad: number }
  /** Dusk, and fluff lies about the ranch (round 11: it blows away at dawn). */
  | { t: 'fluffnote'; n: number }
  /** Aimed at a sell crate, the fluff's window was chosen for you (round 11). */
  | { t: 'autofluff'; slot: number }
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
  | { t: 'tell'; x: number; y: number; z: number; kind: DownyKind }
  /** Round 9: a fake puff (it puffs up a little and shivers, and does not pull), and letting go during one (it took a little of the pull back). */
  | { t: 'feint'; x: number; y: number; z: number; kind: DownyKind }
  | { t: 'fooled'; x: number; y: number; z: number; kind: DownyKind }
  /** Its pull back ended; eased: you let go while it pulled (and it holds what you had). */
  | { t: 'eased'; x: number; y: number; z: number; kind: DownyKind; eased: boolean }
  /** You held on through its pull back: it slipped free a few metres off (still there, try again). */
  | { t: 'slip'; x: number; y: number; z: number; kind: DownyKind }
  /** A wild downy broke free of the pull and got away (dove: into the water). */
  | { t: 'escape'; x: number; y: number; z: number; kind: DownyKind; dove: boolean; slack?: boolean }
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
  /** Radians a look input moved the view this frame (round 11: a look drag takes over from the tug's view hold). */
  look?: number;
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
/** The sell crates' middles (the house one first: events with no crate of their own happen there). */
const CRATE_AT = CRATE_BOXES.map((c) => ({ x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2, box: c }));
const CRATE_X = CRATE_AT[0].x;
const CRATE_Z = CRATE_AT[0].z;
/** The sell crate nearest a spot (its index in CRATE_AT). */
function nearestCrate(x: number, z: number): number {
  let best = 0;
  let bd = 1e9;
  for (let i = 0; i < CRATE_AT.length; i++) {
    const d = Math.hypot(CRATE_AT[i].x - x, CRATE_AT[i].z - z);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/**
 * The sell crate's pull on a piece of fluff: towards a point just over its
 * funnel, harder the nearer it is, with a little damping so it settles in
 * rather than orbiting. Shared by the real flight and the crosshair's guess.
 * floors: the ground under each crate. (Round 8: the nearest of the crates.)
 */
function cratePull(b: { x: number; y: number; z: number; vx: number; vy: number; vz: number }, floors: number[], dt: number): boolean {
  const ci = nearestCrate(b.x, b.z);
  const c = CRATE_AT[ci];
  const floor = floors[ci];
  const dx = c.x - b.x;
  const dz = c.z - b.z;
  const dh = Math.hypot(dx, dz);
  if (dh > PULL_R || b.y > floor + 3.4) return false;
  const dy = floor + c.box.h + 0.35 - b.y;
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
/** Round 11, the dusk fluff note: from when to when (hours), and how much must lie about to say so. */
export const FLUFF_NOTE = { from: 18.1, to: 22, least: 3 };
/** Round 11: at the count, a kind with fewer than this many wild still gets its refill, and the far ones of it stay. */
const WILD_KEEP = 2;
/** How close you need to be to use the workbench. */
export const BENCH_REACH = 4.4;
/**
 * How far off you can use the door, the price board and a gate (round 9: the door did nothing from 3.1 m straight
 * in front of it, nor the workbench at 3.9 m right under its arrow). A lesson's arrow shrinks away from 5 m to 3 m
 * off its spot, so wherever it has gone you are within reach, with a metre to spare.
 */
export const USE_REACH = 4;
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
 * Round 9: a clover's pull is shorter (0.9 s; it was 1.2) as a fight is now one or two pull backs, a brook's and a
 * thistle's time longer (5.0 and 4.4 s; they were 4.2 and 3.6), as theirs are two to four, and an ember darts a little
 * less often (every 0.6 to 0.95 s; it was 0.45 to 0.75), as its fight is twice as long.
 */
export const CATCH: Record<DownyKind, { need: number; limit: number; jink: [number, number]; dash: [number, number]; up: number; give: number; fade: number }> = {
  clover: { need: 0.9, limit: 0, jink: [0.3, 0.55], dash: [2.6, 3.6], up: 1.3, give: 0.3, fade: 0.9 },
  ember: { need: 1.3, limit: 0, jink: [0.6, 0.95], dash: [2.8, 3.8], up: 1.2, give: 0.28, fade: 0.8 },
  brook: { need: 1.2, limit: 5.0, jink: [0.3, 0.5], dash: [2.8, 3.6], up: 1.0, give: 0.25, fade: 0.9 },
  thistle: { need: 0.9, limit: 4.4, jink: [0.35, 0.6], dash: [1.3, 1.9], up: 1.5, give: 0.4, fade: 0.8 },
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
 * was seen. It smells its favourite food lying within `smell` metres (round 11: 8 m, it was 12, and any throw in its
 * general direction would do, so the hunt could not fail; heard from 12 m, you now have to land one well) and goes
 * to it: lured (going to the food, eating it, and `calm` seconds after) it lets
 * a walker within `nearWalk` metres and a runner within `nearRun`. Pulled at
 * unlured, it slips the pull in `slip` seconds.
 */
export const RARE_WARY = { walk: 12, run: 18, smell: 8, calm: 9, nearWalk: 3, nearRun: 6, bolt: 1.6, slip: 1.2 };
/**
 * Round 9: the rare one hears you only while you move (faster than `still` m/s, or in the air), and its distances are
 * straight-line ones, up or down alike. Spooked, it bolts for `RARE_WARY.bolt` s (it was 3), then hurries back to
 * where it was seen once it is more than `home` m off (it drifted back at a slow wander: about 40 s a bolt).
 */
export const RARE_HEAR = { still: 0.8, home: 5 };
/** A rare one fights the pull harder than its kind: this much longer to bring in, with this share of its kind's give. */
export const RARE_FIGHT = { need: 2.2, give: 0.9 };
/**
 * The tug, a duel (round 8; round 7 made it a skill you read, and the eighth playtest found one rule and no skill
 * beyond it: a 200 to 350 ms thumb caught 4 of 4 embers and brooks, and the rare one pulled back every 1.8 s, like a
 * metronome). Now and then a wild one you are pulling at gets ready to pull back: it puffs up (`tell`, at a time
 * that varies by kind and from pull to pull), then pulls back: the ring round the crosshair turns warm and it
 * squeaks. Hold Pull through its pull for longer than its grace and it slips free a few metres off (not lost: try
 * again); let go while it pulls, then pull again within its slack once it stops, and what you had holds. Leave it
 * slack longer than that after a pull back and it bolts (a getaway: see ESCAPE). every: seconds of pulling between
 * its pulls back; tell: how long it puffs up first; dur: how long a pull back lasts; grace: seconds of holding on
 * through one before it slips; slack: seconds after one before it bolts if you have not pulled again. So letting
 * go in time is the tell plus the grace, and pulling again in time is the slack. Clovers pull back rarely and
 * gently, with a long tell; embers more; brooks and thistles most; the rare one hardest of all (RARE_TUG).
 */
export interface TugRule {
  /** (Unused since round 9: a fight's pull backs are counted, not timed. Kept for older checks.) */
  every: [number, number];
  tell: [number, number];
  dur: [number, number];
  grace: number;
  slack: number;
  /**
   * Round 9 (the ninth playtest's top change, "make each wild tug 2 to 4 beats long": every plain catch pulled back
   * exactly once, a brook the same as a clover): how many times it pulls back in a fight, the most likely first
   * (weights for each count from beats[0] up), spread across its pull.
   */
  beats: number[];
  beatsFrom: number;
  /** The chance a fight has a fake puff in it (a second for the rare one), and how long one lasts: it puffs up a little, shivers and does not pull. */
  feint: number;
  feintLen: [number, number];
  /** Metres it shifts sideways in the slack after a pull back, so you aim again. */
  shift: number;
}
// (Every pull back lasts longer than its grace, so holding straight through one always slips.)
export const TUG: Record<DownyKind, TugRule> = {
  // Gentle: one pull back, now and then two, a long tell and a forgiving slack, no fake puffs.
  clover: { every: [0.5, 1.0], tell: [0.42, 0.55], dur: [0.55, 0.7], grace: 0.45, slack: 1.3, beatsFrom: 1, beats: [0.7, 0.3], feint: 0, feintLen: [0.35, 0.5], shift: 0.6 },
  ember: { every: [0.5, 1.1], tell: [0.42, 0.6], dur: [0.55, 0.75], grace: 0.2, slack: 0.8, beatsFrom: 2, beats: [0.5, 0.5], feint: 0.35, feintLen: [0.35, 0.5], shift: 0.7 },
  brook: { every: [0.5, 1.1], tell: [0.42, 0.6], dur: [0.5, 0.7], grace: 0.21, slack: 0.74, beatsFrom: 2, beats: [0.4, 0.45, 0.15], feint: 0.4, feintLen: [0.35, 0.5], shift: 1.0 },
  thistle: { every: [0.4, 0.9], tell: [0.4, 0.58], dur: [0.45, 0.65], grace: 0.21, slack: 0.76, beatsFrom: 2, beats: [0.4, 0.45, 0.15], feint: 0.4, feintLen: [0.35, 0.5], shift: 1.0 },
};
/** The rare one pulls back hardest whatever its kind: the most pulls back (three to five), the shortest slack, and fake puffs most often. */
export const RARE_TUG: TugRule = { every: [0.4, 1.5], tell: [0.38, 0.56], dur: [0.5, 0.75], grace: 0.22, slack: 0.8, beatsFrom: 3, beats: [0.35, 0.45, 0.2], feint: 0.65, feintLen: [0.35, 0.5], shift: 1.0 };
/**
 * A fake puff (round 9): letting go during one (or just after it) gives up this share of what the pull had, and
 * the slack runs from the let-go as after a pull back. Holding on through one costs nothing: the pull goes on.
 * So the tell is read (a real one swells all the way and turns the ring gold; a fake one shivers, the ring stays
 * pale), not just reacted to.
 */
export const FEINT = { cost: 0.18, after: 0.5 };
/** After a pull back, a let-go pull keeps what it has for this long (pressing again a little late costs nothing, within the slack). */
export const EASE_HOLD = 0.7;
/**
 * The first pull back, taught (round 8: the eighth playtest's first five catches pulled back under other lessons'
 * lines, and holding straight through caught 6 of 6 clovers before the line showed, 0 of 4 embers after). Until
 * the ease lesson is learned a wild one's first pull back comes `first` seconds into the fight (always, so the
 * first wild catch pulls back early and clearly), after a long tell; the lesson's line cuts in over any other at
 * that moment, and only while that line is up is it gentle: it lasts until you let go (or `dur`), slips only after
 * `grace` of holding on, and never bolts. Learned, every pull back follows TUG.
 */
export const TEACH_BACK = { first: 0.5, tell: 0.7, dur: 3.2, grace: 2.6 };
/** A slip: a hop this fast away from you, and the bellows leaves it be for this long. */
export const SLIP = { speed: 3.4, up: 3.6, noPull: 0.8, wary: 8 };
/**
 * Round 11 (the eleventh playtest's P1, "with three fingers 7, with two thumbs I'd guess about 4"): while a tug is on
 * the view holds on the downy by itself, so one thumb on Pull is enough and looking is optional. With the right thumb
 * either looking or on Pull, 180 ms to move between, it caught 1 clover of 3 and 1 brook of 5. It follows smoothly
 * (`holdView`): each second it makes up `turn` of the error sideways and `tilt` of it up and down (a hop's rise is
 * followed less), ignoring the inner `dead` share of what the crosshair may be off by, never faster than `most` rad/s,
 * coming on over `ramp` seconds and easing in and out of its speed (`ease` a second), so it never snaps. A look drag
 * (over `drag` rad, fading at `fade` a second, so a resting finger's jitter does not count) takes over at once, and it
 * stays off for `off` seconds after the last of the drag; dragged more than `leave` rad off the downy, it stays off (you
 * have left it). The first press still has to land on the downy.
 */
export const TUG_VIEW = { turn: 8, tilt: 5, most: 2, dead: 0.3, ramp: 0.25, ease: 16, drag: 0.02, fade: 6, off: 0.3, leave: 0.8 };
/**
 * Round 11: metres past Pull's reach that a wild one already on the line stays on it. Its pulls back and shifts edge it
 * away, and a press from the edge of Pull's reach lost it with the left thumb idle (brooks 25%, thistles 40%): moving
 * stays possible, but it is no longer needed once the tug is on.
 */
export const TUG_REACH = 3;
/** Round 11: how fast a leap away is reined in near the end of Pull's reach, a second. */
export const TUG_REIN = 10;
/** Round 11: metres out a held Blow's repeats may land with no mark showing (a press always sends one). */
export const HELD_REACH = 6;
/** Within this many metres of it the rare one is found, and an arrow comes on over it (before that, only the clue). */
export const RARE_SEEN = 24;
/**
 * Its coins today, in downies of its kind (`LIVE_EACH`): by dusk one, by 10 am one and a half, never more than half the
 * day's trip (round 8: it paid three quarters of the trip, and on top of its lasting worth it won every morning it was offered: "Pays 415, then about
 * 390 a day" against a one-off 390). Its worth is the lasting one; today it pays little.
 */
export const RARE_PAY = { dusk: 1, morn: 1.5 };
/** Round 9: a prized order pays at most this many times what a plain fluff order by dusk pays that day. */
export const PRIZED_CAP = 1.5;
/** Round 9: an offer of the same sort and kind is not offered again on the next this many mornings, where the ranch has another to offer. */
export const OFFER_GAP = 2;
/** The sack of food a new kind's first pen comes with (see stockFirst). */
export const STOCK = 12;

type Feeder = RanchState['pads'][number]['feeder'];
/**
 * A feeder's foods, the first in first (round 10: it holds up to two, so one feeder serves a mixed pen; the tenth
 * playtest's clover pen had a feeder of sweetroots, and clover heads bounced off it for two and a half days).
 */
export function feederFoods(fd: Feeder): { t: Food; n: number }[] {
  const out: { t: Food; n: number }[] = [];
  if (fd.t && fd.n > 0) out.push({ t: fd.t, n: fd.n });
  if (fd.t2 && (fd.n2 ?? 0) > 0) out.push({ t: fd.t2, n: fd.n2! });
  return out;
}
/** Everything in a feeder, both foods. */
export const feederTotal = (fd: Feeder): number => Math.max(0, fd.n) + Math.max(0, fd.n2 ?? 0);
/** Tidy a feeder: an empty first food gives way to the second; an empty food is no food. */
function feederTidy(fd: Feeder): void {
  if ((fd.n2 ?? 0) <= 0 || !fd.t2) {
    fd.t2 = null;
    fd.n2 = 0;
  }
  if (fd.n <= 0 || !fd.t) {
    fd.t = fd.t2 ?? null;
    fd.n = fd.t2 ? (fd.n2 ?? 0) : 0;
    fd.t2 = null;
    fd.n2 = 0;
  }
  if (!fd.t) fd.n = 0;
}
/** Put k of a food in a feeder (it must take it: see Sim.feederRefuses); returns how many went in. */
function feederAdd(fd: Feeder, food: Food, k: number): number {
  const add = Math.max(0, Math.min(k, FEEDER_CAP - feederTotal(fd)));
  if (add <= 0) return 0;
  if (!fd.t || fd.n <= 0 || fd.t === food) {
    if (fd.t !== food) fd.n = 0;
    fd.t = food;
    fd.n += add;
  } else {
    if (fd.t2 !== food) fd.n2 = 0;
    fd.t2 = food;
    fd.n2 = (fd.n2 ?? 0) + add;
  }
  feederTidy(fd);
  return add;
}
/** Take one of a food out of a feeder. */
function feederTake(fd: Feeder, food: Food): boolean {
  if (fd.t === food && fd.n > 0) fd.n--;
  else if (fd.t2 === food && (fd.n2 ?? 0) > 0) fd.n2 = (fd.n2 ?? 0) - 1;
  else return false;
  feederTidy(fd);
  return true;
}
/** Seconds between the things a Pull at a feeder's hopper draws out of it (round 10: a feeder can be emptied). */
export const HOPPER_PULL = 0.14;
/** How near the crosshair's line must pass a hopper's middle to pull from it (m). */
export const HOPPER_AIM = 0.6;
/** Seconds after a press that a steady aim settling on a penned downy still makes it a sort (round 10). */
export const SORT_LATE = 0.3;
/** How near the crosshair's line must pass a piece of food or fluff for you to be on it, not the downy past it (m). */
export const THING_AIM = 0.22;
/** A trip due by 10 am pays this much more a downy than one due by dusk (it costs you the morning at home); one after dark more again (your night, with the pests about). */
export const MORN_TRIP = 1.2;
export const NIGHT_TRIP = 1.3;
/** Meals a penned downy eats in a game day, fed (measured: 3.67 for pens of three, six and ten), for a rare one's worth. */
export const PEN_MEALS = 3.7;
/**
 * Round 10: a rare one's pen sheds at most this many more fluff a day (one more a meal from each downy in it until
 * then), and its tag counts that over RARE_DAYS days. The tenth playtest's day 2 rare one read "Pays 65, then 1,550
 * more by day 7" beside a trip of 400 and a fluff order of 420: no contest. Now its five days are about a trip's pay
 * (a clover pen's 300 against trips of 130 to 400; an ember's 500, a brook's 650, against 220 to 700).
 */
export const RARE_EXTRA = 5;
export const RARE_DAYS = 5;
/** The kinds that come rare (a gold clover, a rose ember, a silver brook). */
export const RARE_KINDS: DownyKind[] = ['clover', 'ember', 'brook'];
/**
 * Round 10: a thistle fluff order is a prized one only with this many thistles kept; with one (the tenth playtest's
 * paid 922 in one sale, more than its pen of eight clovers made in a day) or two it is a plain one.
 */
export const THISTLE_PRIZED = 3;

/** An offer's sort, kind and deadline, for "never the same as one of yesterday's". */
export function orderKey(o: { kind: DownyKind; live?: boolean; rare?: unknown; by?: number }): string {
  return `${o.rare ? 'rare' : o.live ? 'live' : 'fluff'}:${o.kind}:${o.by ?? ORDER_BY}`;
}

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
/**
 * An empty Blow still pushes a puff of air: it sends a pest within this many metres in front of you (along the
 * ground; round 10: it was by the eye, so a pest 4.8 m off was out of reach) rolling.
 */
export const AIR_REACH = 5.5;
/** A pest in front of an empty Blow within this many metres but out of its reach: "Get closer." (round 10). */
export const PEST_NEAR = 16;
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
  /** Refilled only while you are further off than this (out of sight): 30 m unless said. */
  far?: number;
}

const GROUPS: Group[] = [
  // (Round 9: three just past the ranch gate, so the first wild catch and the loop's "catch another" are a short walk:
  // the first-fifteen-minutes player spent most of its dead walking going out to the meadow and back.)
  { kind: 'clover', x: 6, z: 10, n: 3, far: 15 },
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
  /** The tug's view hold (round 11): how far it is on (0..1), its turn now (rad/s), and the look drag that takes over from it. */
  private holdAmt = 0;
  private holdYaw = 0;
  private holdTilt = 0;
  private holdDrag = 0;
  private holdOff = 0;
  /** A fresh press of Blow has yet to send its one (round 11: a held Blow's repeats can be stopped, a press never is). */
  private pressShot = false;
  /** The crate check for choosing the fluff (round 11): when next, and whether the aim was on a crate. */
  private crateT = 0;
  private onCrate = false;
  aimSpin = 0;
  /** Seconds since food or fluff was last in the cone of a pull. */
  private sweptT = 0;
  /** This press of Pull started aimed at food or fluff, or has drawn some in: it leaves penned downies be. */
  private pressFood = false;
  private wasDraw = false;
  /**
   * Round 10: this press of Pull started squarely on a penned downy of yours: it takes that kind from that pen only,
   * and no food or fluff, until it is let go (the tenth playtest's six tries to pull 2 embers out of a mixed pen also
   * took 2 clovers, 9 fluff and a root).
   */
  private pressKind: DownyKind | null = null;
  private pressPen = -1;
  /** Round 10: this press started on a feeder's hopper: it draws the feeder's food back into the jar. */
  private pressHopper = -1;
  private hopperT = 0;
  /** Seconds this press has been down, and whether it started with the crosshair on food or fluff. */
  private pressAge = 0;
  private pressThing = false;
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
    this.holdView(dt, c);
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
  private inCone(aim: Aim, x: number, y: number, z: number, extra = 0): number {
    const dx = x - aim.ex;
    const dy = y - aim.ey;
    const dz = z - aim.ez;
    const d = Math.hypot(dx, dy, dz);
    const R = this.range;
    if (d > R + 0.4 + extra || d < 1e-3) return 0;
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
    this.nightNoteT -= dt;
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
    if (c.draw && !this.wasDraw) {
      this.pressFood = this.aimedAtThing(aim);
      this.pressKind = null;
      this.pressPen = -1;
      this.pressAge = 0;
      // Fluff or food you can see the crosshair on at the press: a pull for that for good (round 3).
      this.pressThing = this.squareThing(aim) !== null && this.sortTarget(aim) === null;
      this.pressSorted(aim);
      // (And one that starts on a feeder's hopper empties it, taking no downy.)
      this.pressHopper = !this.pressFood && this.pressKind === null ? this.aimedHopper(aim) : -1;
      if (this.pressHopper >= 0) this.pressFood = true;
      this.hopperT = 0;
    } else if (c.draw && this.pressKind === null && this.pressHopper < 0 && !this.pressThing && this.pressAge <= SORT_LATE) {
      // Round 10: a real thumb's aim is still settling as it comes down. Measured with real touch on a hopping ember, a
      // press a moment off its body went on sweeping up 9 fluff and a root for the whole hold, two rounds in six.
      this.pressSorted(aim);
    }
    if (c.draw) this.pressAge += dt;
    else {
      this.pressKind = null;
      this.pressPen = -1;
      this.pressHopper = -1;
    }
    this.wasDraw = c.draw;
    if (c.draw) {
      // Downies come only when the crosshair is on them: the cone sweeps up food
      // and fluff, never a downy standing beside them.
      const sorting = this.pressKind !== null;
      const aimed = sorting ? this.aimedSort(aim) : this.aimedDowny(aim);
      // A pull with food or fluff in its cone never takes a penned downy of yours (the third playtest's
      // sweeps of a pen's fluff took a penned downy 3 times in 9). (A sorting press takes no food or fluff.)
      let sweeping = false;
      for (const it of s.items) {
        if (sorting) break;
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
        const k = this.inCone(aim, d.x, d.y + 0.25, d.z, this.lineReach(d));
        // One already coming in keeps coming while it stays in the cone.
        if (d.drawn <= 0 || k <= 0) {
          d.drawn = 0;
          if (d !== aimed) continue;
          const penned = d.tame && d.pen >= 0;
          if (penned && !sorting && (this.pressFood || this.sweptT < SWEPT || this.aimSpin > STEADY)) {
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
              // Its first pull back: early and clear while the lesson has yet to teach it, else after a while of pulling.
              d.backT = this.knows('ease') ? -1 : TEACH_BACK.first;
              d.tell = 0;
              d.slackT = -1;
              // How many beats this fight has (round 9): its kind's count of pull backs, and now and then a fake puff.
              this.dealBeats(d);
              if (d.rare && rareLured(d)) d.calm = Math.max(d.calm, need * 3);
              const j = CATCH[d.kind].jink;
              d.hopT = Math.min(d.hopT, j[0] + this.rand() * (j[1] - j[0]) * 0.5);
            }
            d.held = true;
            // Pulling again: any slack after its pull back is taken up.
            if (wildOne) d.slackT = -1;
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
            if (wildOne && d.tell > 0) {
              // Puffing up to pull back (the tell): it braces, and the pull makes no headway.
              this.bracing(d, aim, dt);
              continue;
            }
            // (A fake puff is a bluff: the pull goes on through it.)
            d.tug = Math.min(need, d.tug + dt);
            // It never comes in with a pull back still to come: the last of its pull waits for it.
            if (wildOne && d.beats > 0 && d.tug >= need - 0.02) {
              d.tug = need - 0.02;
              if (d.feint <= 0) this.startTell(d);
            } else if (wildOne && d.tug < need && d.feint <= 0) {
              // Its next pull back (or fake puff) comes after a while of pulling, spread across what is left of its pull.
              if (d.backT < 0) d.backT = this.nextBack(d, need);
              d.backT -= dt;
              if (d.backT <= 0) {
                if (d.feints > 0 && (d.beats <= 0 || this.rand() < d.feints / (d.feints + d.beats))) this.startFeint(d);
                else if (d.beats > 0 || !this.knows('ease')) this.startTell(d);
                else d.backT = 99;
              }
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
            // (Round 10: its window is chosen, so the next Blow sends the downy, not the food that was chosen: the tenth
            // playtest's Blow after a catch sent a clover head into the pen.)
            const w = s.slots.findIndex((q) => q.t === d.kind && q.n > 0);
            if (w >= 0) s.sel = w;
            this.emit({ t: 'suck', thing: d.kind, x: d.x, y: d.y, z: d.z, wild: !d.tame && !d.keep });
            if (!s.caught.includes(d.kind)) {
              s.caught.push(d.kind);
              this.emit({ t: 'first', kind: d.kind });
            }
            if (d.kind === 'clover') this.complete('catch');
            if (d.kind === 'ember') this.complete('ember');
            if (d.kind === 'brook') this.complete('brook');
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
        if (it.gone || (it.flyT >= 0 && it.flyT < 0.3) || it.noPull > 0 || fight || sorting) {
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
      // A press that started on a feeder's hopper draws its food back out, one at a time, the first food first
      // (round 10: a feeder of food nobody in its pen eats could not be emptied).
      if (this.pressHopper >= 0) {
        this.hopperT -= dt;
        const i = this.pressHopper;
        const q = feederFoods(s.pads[i].feeder)[0];
        if (this.hopperT <= 0 && q && !fight && this.aimedHopper(aim) === i && this.accept(q.t) >= 0) {
          feederTake(s.pads[i].feeder, q.t);
          const h = padSpots(i).hopper;
          const hy = this.phys.floor(h.x, h.z) + h.y + 0.1;
          // (Just out of the hopper towards you, so the hopper does not catch it straight back.)
          const tx = aim.ex - h.x;
          const tz = aim.ez - h.z;
          const tl = Math.hypot(tx, tz) || 1;
          const it = newItem(s, q.t, h.x + (tx / tl) * 0.95, hy, h.z + (tz / tl) * 0.95);
          it.vx = (tx / tl) * 2;
          it.vz = (tz / tl) * 2;
          it.vy = 1;
          it.flyT = 0.4;
          s.items.push(it);
          this.hopperT = HOPPER_PULL;
          if (feederTotal(s.pads[i].feeder) <= 0) this.emit({ t: 'feeder', pad: i, n: 0, why: '' });
        }
      }
    } else {
      for (const d of s.downies) d.drawn = 0;
      for (const it of s.items) it.drawn = 0;
    }

    this.autoFluff(dt, c, aim);
    // A window that ran out under a held Blow waits for a fresh press before the next kind goes.
    if (!c.puff || c.puffPressed) this.waitRelease = false;
    if (c.puffPressed) this.pressShot = true;
    else if (!c.puff) this.pressShot = false;
    const fire = ((c.puffPressed && this.puffWait <= 0.13) || (c.puff && this.puffWait <= 0)) && !this.waitRelease;
    // (Round 11: a held Blow stops at long range with no mark showing: 8 berries went over a hopper at 7.5 m. Each press still sends one.)
    if (fire && !c.draw && (this.pressShot || !this.heldTooFar(aim))) {
      this.puffWait = 0.25;
      this.pressShot = false;
      this.puff(aim, c.puffPressed);
    }
  }

  /**
   * Would a repeat of a held Blow be wasted? Something chosen, no mark showing where it would land (the crate, a pen, a
   * feeder, a pest), and it would come down further off than HELD_REACH.
   */
  private heldTooFar(aim: Aim): boolean {
    const s = this.s;
    const q = s.slots[s.sel];
    if (!q?.t || q.n <= 0) return false;
    const mark = this.aimTarget(aim);
    if (mark === 'sell' || mark === 'pen' || mark === 'feeder' || mark === 'prickly') return false;
    // (A silo has no mark of its own, and takes a held Blow from anywhere it reaches.)
    const siloed = s.pads.some((pad, i) => {
      if (pad.kind !== 'silo') return false;
      const dx = PADS[i].x - aim.ex;
      const dz = PADS[i].z - aim.ez;
      const l = Math.hypot(aim.dx, aim.dz) || 1;
      const along = (dx * aim.dx + dz * aim.dz) / l;
      return along > 0 && along < 12 && Math.abs(dx * aim.dz - dz * aim.dx) / l < 1.6;
    });
    if (siloed) return false;
    const vy = aim.dy * 14 + 1.4;
    const h = Math.max(0, aim.my - s.player.y);
    const t = (vy + Math.sqrt(vy * vy + 2 * G_ITEM * h)) / G_ITEM;
    return Math.hypot(aim.dx, aim.dz) * 14 * t > HELD_REACH;
  }

  /**
   * Aimed at a sell crate with fluff aboard, the fluff's window is chosen for you (round 11: "Tap the fluff's window"
   * came up twice in the first 2.5 minutes, then again the next day). Only as the aim comes onto the crate, so choosing
   * something else while aimed there stays chosen, never over a downy an order wants the crate to have, and not while
   * you are blowing or pulling.
   */
  private autoFluff(dt: number, c: Controls, aim: Aim): void {
    const s = this.s;
    this.crateT -= dt;
    if (this.crateT > 0) return;
    this.crateT = 0.1;
    const w = s.slots.findIndex((q) => q.t && q.n > 0 && isTuft(q.t));
    const p = s.player;
    if (w < 0 || !CRATE_AT.some((k) => Math.hypot(p.x - k.x, p.z - k.z) < 12)) {
      this.onCrate = false;
      return;
    }
    const was = s.sel;
    s.sel = w;
    const on = this.wouldSell(aim);
    s.sel = was;
    if (on && !this.onCrate && was !== w && !c.puff && !c.draw) {
      const q = s.slots[was];
      const rec = q?.t && q.n > 0 && isDowny(q.t) ? this.nextDown(q) : null;
      if (!(rec && this.wantsDowny(q.t as DownyKind, rec.c, !!rec.rare))) {
        s.sel = w;
        this.emit({ t: 'autofluff', slot: w });
      }
    }
    this.onCrate = on;
  }

  /** The wild downy you have a tug on (the one under the pull first, else the one with most of its pull in), or null. */
  tugged(): Downy | null {
    let best: Downy | null = null;
    let bs = 0;
    for (const d of this.s.downies) {
      if (d.gone || d.tame || d.keep || d.strain <= 0 || d.drawn > 0) continue;
      const score = (d.held ? 100 : 0) + d.tug + 1e-3;
      if (score > bs) {
        bs = score;
        best = d;
      }
    }
    return best;
  }

  /**
   * While a tug is on, the view holds on the downy by itself (see TUG_VIEW), through its pull backs and the slack when
   * you let go, on every input path: the sim turns the view, so a thumb, a mouse and a pad all get it. The next frame's
   * aim comes from the view, so what the tug reads (the crosshair on its body) is as it ever was.
   */
  private holdView(dt: number, c: Controls): void {
    const p = this.s.player;
    const V = TUG_VIEW;
    this.holdDrag = this.holdDrag * Math.exp(-V.fade * dt) + (c.look ?? 0);
    if (this.holdDrag > V.drag) this.holdOff = V.off;
    else if (this.holdOff > 0) this.holdOff -= dt;
    const d = this.holdOff > 0 ? null : this.tugged();
    let wantYaw = 0;
    let wantTilt = 0;
    if (d) {
      const dx = d.x - p.x;
      const dy = d.y + 0.25 - (p.y + EYE);
      const dz = d.z - p.z;
      const flat = Math.hypot(dx, dz);
      if (flat > 0.3) {
        // How far off its body the crosshair may be (its kind's give, as aimedDowny has it): a little of that goes unfollowed, so the view is calm on a downy hopping on the spot.
        const give = CATCH[d.kind].give * (d.rare ? RARE_FIGHT.give : 1);
        const dead = Math.atan2(d.r + give, Math.hypot(flat, dy)) * V.dead;
        const zone = (e: number) => (Math.abs(e) <= dead ? 0 : e - Math.sign(e) * dead);
        const offYaw = angleTo(p.yaw, Math.atan2(-dx, -dz));
        const offTilt = Math.atan2(dy, flat) - p.pitch;
        // (Looked well away from it, you have left it: the view stays where you put it while the pull fades.)
        if (Math.hypot(offYaw, offTilt) < V.leave) {
          wantYaw = zone(offYaw) * V.turn;
          wantTilt = zone(offTilt) * V.tilt;
          const fast = Math.hypot(wantYaw, wantTilt);
          if (fast > V.most) {
            wantYaw *= V.most / fast;
            wantTilt *= V.most / fast;
          }
        }
      }
      this.holdAmt = Math.min(1, this.holdAmt + dt / V.ramp);
    } else this.holdAmt = 0;
    // (Its speed eases in and out, the end of a tug too: the view settles rather than stops dead.)
    this.holdYaw = damp(this.holdYaw, wantYaw * this.holdAmt, V.ease, dt);
    this.holdTilt = damp(this.holdTilt, wantTilt * this.holdAmt, V.ease, dt);
    // (A look drag has the view from the first frame.)
    if (this.holdOff > 0) this.holdYaw = this.holdTilt = 0;
    p.yaw += this.holdYaw * dt;
    p.pitch = clamp(p.pitch + this.holdTilt * dt, -1.45, 1.45);
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
  private chooseNext(ok?: (q: Slot) => boolean): boolean {
    const s = this.s;
    for (let k = 1; k <= s.slots.length; k++) {
      const i = (s.sel + k) % s.slots.length;
      if (s.slots[i].t && s.slots[i].n > 0 && (!ok || ok(s.slots[i]))) {
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
    // (Round 10: a feeder's hopper with food in it, which a Pull empties.)
    if (this.aimedHopper(aim) >= 0) return 'target';
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

  /** This press sorts from now on if the aim is steady on a penned downy with nothing you can see in front of it. */
  private pressSorted(aim: Aim): void {
    if (this.aimSpin > STEADY) return;
    const d = this.sortTarget(aim);
    if (!d) return;
    this.pressKind = d.kind;
    this.pressPen = d.pen;
    this.pressFood = false;
  }

  /** The food or fluff the crosshair's line passes nearest (within THING_AIM metres of the line, within reach), or null. */
  private squareThing(aim: Aim): { off: number } | null {
    let best: { off: number } | null = null;
    for (const it of this.s.items) {
      if (it.gone || it.noPull > 0) continue;
      const dx = it.x - aim.ex;
      const dy = it.y - aim.ey;
      const dz = it.z - aim.ez;
      const along = dx * aim.dx + dy * aim.dy + dz * aim.dz;
      if (along <= 0 || along > this.range + 0.4) continue;
      const off = Math.hypot(dx - aim.dx * along, dy - aim.dy * along, dz - aim.dz * along);
      if (off < THING_AIM && (!best || off < best.off)) best = { off };
    }
    return best;
  }

  /**
   * The penned downy a press would sort, or null: the one squarely under the crosshair, unless the crosshair's line
   * passes nearer a piece of food or fluff than the downy's middle (aimed through a downy at the fluff just behind it,
   * a pull for the fluff: round 3). In a fed pen there is nearly always some within the cone's half metre of the line,
   * at the downy's feet or to the side; that is not what you are aiming at.
   */
  private sortTarget(aim: Aim): Downy | null {
    const d = this.squarePenned(aim);
    if (!d) return null;
    const dx = d.x - aim.ex;
    const dy = d.y + 0.25 - aim.ey;
    const dz = d.z - aim.ez;
    const along = dx * aim.dx + dy * aim.dy + dz * aim.dz;
    const off = Math.hypot(dx - aim.dx * along, dy - aim.dy * along, dz - aim.dz * along);
    const t = this.squareThing(aim);
    return t && t.off < off ? null : d;
  }

  /** A penned downy of yours squarely under the crosshair, within reach (the nearest to its middle), or null. */
  private squarePenned(aim: Aim): Downy | null {
    const R = this.range + 0.4;
    let best: Downy | null = null;
    let bs = 1;
    for (const d of this.s.downies) {
      if (d.gone || !d.tame || d.pen < 0 || d.noPull > 0 || (d.flyT >= 0 && d.flyT < 0.35)) continue;
      const dx = d.x - aim.ex;
      const dy = d.y + 0.25 - aim.ey;
      const dz = d.z - aim.ez;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > R || dist < 1e-3) continue;
      const r = Math.acos(clamp((dx * aim.dx + dy * aim.dy + dz * aim.dz) / dist, -1, 1)) / Math.max(Math.atan2(d.r, dist), 0.035);
      if (r < bs) {
        bs = r;
        best = d;
      }
    }
    return best;
  }

  /**
   * A sorting press's next downy (round 10): of the kind it started on, in that pen, under the crosshair with a
   * thumb's give (0.3 m round its body); never another kind, never food or fluff.
   */
  private aimedSort(aim: Aim): Downy | null {
    const R = this.range + 0.4;
    let best: Downy | null = null;
    let bs = 1;
    for (const d of this.s.downies) {
      if (d.gone || !d.tame || d.pen !== this.pressPen || d.kind !== this.pressKind || d.noPull > 0 || (d.flyT >= 0 && d.flyT < 0.35)) continue;
      const dx = d.x - aim.ex;
      const dy = d.y + 0.25 - aim.ey;
      const dz = d.z - aim.ez;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > R || dist < 1e-3) continue;
      const r = Math.acos(clamp((dx * aim.dx + dy * aim.dy + dz * aim.dz) / dist, -1, 1)) / Math.max(Math.atan2(d.r + 0.3, dist), 0.07);
      if (r < bs) {
        bs = r;
        best = d;
      }
    }
    return best;
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
      if (dist > R + this.lineReach(d) || dist < 1e-3) continue;
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

  /** Metres past Pull's reach this one stays on the line: a wild one with a tug on it, or coming in. */
  private lineReach(d: Downy): number {
    return !d.tame && !d.keep && (d.strain > 0 || d.drawn > 0) ? TUG_REACH : 0;
  }

  /** Seconds of steady pull before a downy comes loose: wild ones dig in (each kind its own), yours come at once, a penned one to a still aim. */
  tugNeed(d: Downy): number {
    if (d.tame) return d.pen >= 0 ? PEN_TUG : 0;
    if (d.keep) return 0.35;
    return CATCH[d.kind].need * (d.wary > 0 ? ESCAPE.waryNeed : 1) * (d.rare ? RARE_FIGHT.need : 1);
  }

  /** A wild one's duel rules: its kind's, or the rare one's (hardest). */
  tugRule(d: Downy): TugRule {
    return d.rare ? RARE_TUG : TUG[d.kind];
  }

  /**
   * Seconds of pulling until a wild one's next tell or fake puff (round 9): what is left of its pull, shared out among
   * the beats still to come with a little left over at the end, unevenly (it used to be every so many seconds of
   * pulling, so a short fight of 1.3 s had room for one).
   */
  private nextBack(d: Downy, need = this.tugNeed(d)): number {
    const left = Math.max(0, need - d.tug);
    const slots = d.beats + d.feints;
    if (slots <= 0) return 99;
    return Math.max(0.12, (left / (slots + 0.6)) * (0.6 + 0.8 * this.rand()));
  }

  /** A fight's beats (round 9): its kind's count of pull backs (the most likely first), and now and then a fake puff. */
  private dealBeats(d: Downy): void {
    const t = this.tugRule(d);
    let r = this.rand();
    let n = t.beatsFrom;
    for (let i = 0; i < t.beats.length; i++) {
      n = t.beatsFrom + i;
      r -= t.beats[i];
      if (r <= 0) break;
    }
    d.beats = n;
    // (Not while the first pull back is being taught: one thing at a time.)
    d.feints = !this.knows('ease') ? 0 : (this.rand() < t.feint ? 1 : 0) + (d.rare && this.rand() < t.feint * 0.5 ? 1 : 0);
    d.feint = 0;
    d.sinceFeint = -1;
  }

  /** A fake puff (round 9): it puffs up a little and shivers, the ring stays pale, and it does not pull. */
  private startFeint(d: Downy): void {
    const t = this.tugRule(d);
    d.feints--;
    d.feint = d.feintLen = t.feintLen[0] + this.rand() * (t.feintLen[1] - t.feintLen[0]);
    d.backT = -1;
    d.squashV += 1.1;
    this.emit({ t: 'feint', x: d.x, y: d.y, z: d.z, kind: d.kind });
  }

  /** Seconds of holding on through its pull back before it slips free (long while the lesson's line is up). */
  backGrace(d: Downy): number {
    if (!this.knows('ease')) return TEACH_BACK.grace;
    return this.tugRule(d).grace;
  }

  /** It gets ready to pull back: it puffs up (the tell), for a time that varies by kind and from pull to pull. */
  private startTell(d: Downy): void {
    const t = this.tugRule(d);
    d.tell = d.tellLen = this.knows('ease') ? t.tell[0] + this.rand() * (t.tell[1] - t.tell[0]) : TEACH_BACK.tell;
    d.backT = -1;
    d.squashV += 1.5;
    this.emit({ t: 'tell', x: d.x, y: d.y, z: d.z, kind: d.kind });
  }

  /** Puffing up: it digs its feet in and holds still, swelling (drawn larger by the renderer). */
  private bracing(d: Downy, aim: Aim, dt: number): void {
    d.yaw = Math.atan2(-(aim.ex - d.x), -(aim.ez - d.z));
    d.target = null;
    if (this.rand() < dt * 6) d.squashV += 1.2;
  }

  /** It pulls back: the ring turns warm and it squeaks. While the lesson teaches it, it lasts until you let go. */
  private pullBack(d: Downy): void {
    const t = this.tugRule(d);
    d.back = this.knows('ease') ? t.dur[0] + this.rand() * (t.dur[1] - t.dur[0]) : TEACH_BACK.dur;
    if (d.beats > 0) d.beats--;
    d.backHeld = 0;
    d.eased = false;
    d.backT = -1;
    d.tell = 0;
    d.slackT = -1;
    d.squashV -= 4;
    this.emit({ t: 'pullback', x: d.x, y: d.y, z: d.z, kind: d.kind });
  }

  /** In the slack after a pull back it shifts a little to one side (round 9), so the crosshair must find it again. */
  private shiftAside(d: Downy, px: number, pz: number): void {
    const t = this.tugRule(d);
    const dx = d.x - px;
    const dz = d.z - pz;
    const l = Math.hypot(dx, dz) || 1;
    const side = this.rand() < 0.5 ? -1 : 1;
    // A short hop: up 2.4 m/s for about 0.5 s in the air, so this many m/s carries it the rule's metres.
    const air = (2 * 2.4) / G_DOWNY;
    const sp = t.shift / Math.max(0.2, air);
    d.vx = (-dz / l) * side * sp;
    d.vz = (dx / l) * side * sp;
    d.vy = 2.4;
    d.grounded = false;
    d.squashV += 2;
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
    // (Round 11: one with a time that slips free while wary from the last slip is gone: a getaway. A slow thumb's tries were
    // free, and with the view held it landed 21 brooks of 22 in 20 s. A good reader never slips.)
    if (CATCH[d.kind].limit > 0 && d.wary > 0) {
      this.escape(d);
      return;
    }
    d.tug = 0;
    d.strain = 0;
    d.peak = 0;
    d.held = false;
    d.back = 0;
    d.backT = -1;
    d.backHeld = 0;
    d.easeT = 0;
    d.tell = 0;
    d.slackT = -1;
    d.feint = 0;
    d.sinceFeint = -1;
    d.noPull = SLIP.noPull;
    d.target = null;
    // (Round 11: one with a time, a brook or a thistle, stays wary after a slip, so a slow thumb's second try is harder:
    // tries were free, and the eleventh playtest's 450 to 650 ms thumb caught 4 brooks of 4.)
    if (CATCH[d.kind].limit > 0) d.wary = Math.max(d.wary, SLIP.wary);
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
      // (Round 11: nor further off once it is near the end of Pull's reach. A brook's glides carried it 3 m/s away from
      // a thumb standing still, so it needed the stick all through the fight: moving is possible, not needed.)
      const stretched = jinks && l > this.range - 0.5;
      if (towards > 0 || stretched) {
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
      if (stretched) {
        hx += (dx / l) * 0.4;
        hz += (dz / l) * 0.4;
        const sl = Math.hypot(hx, hz);
        hx /= sl;
        hz /= sl;
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
  private escape(d: Downy, slack = false): void {
    const p = this.s.player;
    d.tug = 0;
    d.strain = 0;
    d.peak = 0;
    d.back = 0;
    d.backT = -1;
    d.easeT = 0;
    d.tell = 0;
    d.slackT = -1;
    d.feint = 0;
    d.sinceFeint = -1;
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
    // (The rare one runs only a short way: a getaway used to send it 30 m off at its bolting speed, then a long walk home.)
    d.bolt = d.kind === 'thistle' ? ESCAPE.thistle : d.rare ? RARE_WARY.bolt + 0.6 : ESCAPE.bolt;
    d.wary = ESCAPE.wary;
    d.vx = Math.cos(a) * sp;
    d.vz = Math.sin(a) * sp;
    d.vy = 4.2;
    d.grounded = false;
    d.flyT = -1;
    d.hopT = 0.05;
    d.squashV += 4;
    this.emit({ t: 'squeak', x: d.x, y: d.y, z: d.z, kind: d.kind });
    this.emit({ t: 'escape', x: d.x, y: d.y, z: d.z, kind: d.kind, dove, ...(slack ? { slack } : {}) });
  }

  private firstDraw(): void {
    if (!this.s.journal) this.s.journal = true;
  }

  /**
   * The first pen of a new kind comes with a sack of its food (round 8: the eighth playtest's embers were starving by
   * their first night with no root source, and its brooks got out starving with no fruit): `STOCK` of its favourite
   * into the pen's feeder. Round 9: a pen without one gets one, with the sack in it (the sack lay by the gate, where
   * the pen's fluff gathers, and pulling the fluff at the ninth playtest's new ember pen took 9 of its 12 sweetroots
   * into the jar). Round 10: only into the feeder of a pen that holds just that kind (the tenth playtest blew its
   * first embers into its clover pen, whose feeder was empty: "12 sweetroots in the feeder", and clover heads bounced
   * off it for two and a half days). A pen with other kinds in it (or a feeder that will not take it) gets the sack on
   * its floor, on the far side from the gate, out of a pull at the fluff, and no feeder. Clover has the starter
   * garden; a thistle eats anything. Once a kind.
   */
  private stockFirst(k: DownyKind, pen: number): void {
    const s = this.s;
    if (k === 'clover' || k === 'thistle' || s.stocked.includes(k)) return;
    s.stocked.push(k);
    const food = wantedFood(k);
    const pad = s.pads[pen];
    const fd = pad.feeder;
    const only = s.downies.every((d) => d.gone || d.pen !== pen || d.kind === k);
    if (only) {
      const gave = !pad.ups.includes('feeder');
      if (gave) {
        pad.ups.push('feeder');
        fd.t = null;
        fd.n = 0;
        fd.t2 = null;
        fd.n2 = 0;
        this.phys.setPads(s.pads);
      }
      if (!this.feederRefuses(pen, food) && feederTotal(fd) + STOCK <= FEEDER_CAP) {
        feederAdd(fd, food, STOCK);
        this.emit({ t: 'stock', pad: pen, food, n: STOCK, feeder: true, gave });
        return;
      }
    }
    const P = PADS[pen];
    const far = gatherSpot(pen, 2);
    for (let i = 0; i < STOCK; i++) {
      const g = { x: P.x - (far.x - P.x) * 0.8, z: P.z - (far.z - P.z) * 0.8 };
      const it = newItem(s, food, g.x + (this.rand() - 0.5) * 1.2, 0, g.z + (this.rand() - 0.5) * 1.2);
      it.y = this.phys.floor(it.x, it.z) + it.r;
      it.rest = true;
      s.items.push(it);
    }
    this.emit({ t: 'stock', pad: pen, food, n: STOCK, feeder: false });
  }

  /** The foods you could sow at a garden post: the favourite of each kind you keep (clover heads for a thistle). */
  sowable(): Food[] {
    const kept = this.kept();
    const out: Food[] = [];
    for (const k of KINDS) if (kept[k] > 0 && !out.includes(wantedFood(k))) out.push(wantedFood(k));
    return out;
  }

  /**
   * Facing a sell crate close by (within 9 m, the aim within about 30 degrees of it): a window that runs out here
   * moves on only to fluff (or a downy an order wants), never to food (round 9: selling 2 fluff with 4 taps sent 2
   * clover heads in, "The crate only takes fluff.").
   */
  atCrate(aim: Aim): boolean {
    const l = Math.hypot(aim.dx, aim.dz) || 1;
    for (const c of CRATE_AT) {
      const dx = c.x - aim.ex;
      const dz = c.z - aim.ez;
      const d = Math.hypot(dx, dz);
      if (d < 9 && (d < 1.2 || (dx * aim.dx + dz * aim.dz) / (d * l) > 0.86)) return true;
    }
    return false;
  }

  /** What a crate takes from the jar: fluff, or a downy an open order wants. */
  private crateTakes = (q: Slot): boolean => !!q.t && (isTuft(q.t) || (isDowny(q.t) && (q.downs ?? []).some((r) => this.wantsDowny(q.t as DownyKind, r.c, !!r.rare))));

  /** Blow one of the chosen window's things out. pressed: a fresh press (not a held repeat). */
  puff(aim: Aim, pressed = true): void {
    const s = this.s;
    // The chosen window is empty but something is aboard: choose the next window that holds something (at a crate,
    // only fluff: with none left, say so and blow nothing at it).
    if (!s.slots[s.sel].t || s.slots[s.sel].n <= 0) {
      if (this.atCrate(aim) && s.slots.some((q) => q.t && q.n > 0)) {
        if (!this.chooseNext(this.crateTakes)) {
          if (pressed) this.emit({ t: 'deny', why: 'No fluff left in the jar.' });
          return;
        }
      } else this.chooseNext();
    }
    const slot = s.slots[s.sel];
    const p = s.player;
    if (!slot.t || slot.n <= 0) {
      // Nothing aboard: an empty blow still pushes a puff of air. It sends a pest in front of you rolling (the
      // sixth playtest's empty Blow at a pest 3.5 m off did nothing but say "Nothing in the jar."), shoves light
      // things about, and says why nothing came out if it moved no pest.
      this.emit({ t: 'puff', thing: null });
      let shooed = false;
      let ahead = false;
      let near = false;
      for (const n of s.nettles) {
        if (n.gone) continue;
        const dx = n.x - aim.ex;
        const dy = n.y + 0.25 - aim.ey;
        const dz = n.z - aim.ez;
        const d = Math.hypot(dx, dy, dz);
        // (Round 10: its reach is along the ground, so a pest 4.8 m off is in reach whatever the eye's height; the
        // tenth playtest's empty Blows at 4.8 to 6 m said "Nothing in the jar." under "Blow anything at the pest.")
        const flat = Math.hypot(dx, dz);
        const facing = (dx * aim.dx + dy * aim.dy + dz * aim.dz) / (d || 1);
        if (facing >= 0.8 && flat <= PEST_NEAR) ahead = true;
        if (facing >= 0.8 && flat <= AIR_REACH) near = true;
        if (n.mode === 'roll' || flat > AIR_REACH || facing < 0.8) continue;
        const hl = flat || 1;
        n.mode = 'roll';
        n.vx = (dx / hl) * 6;
        n.vz = (dz / hl) * 6;
        this.emit({ t: 'nettlehit', x: n.x, y: n.y, z: n.z });
        shooed = true;
      }
      // Nothing came out and no pest was moved: why. A pest in front, out of the puff's reach: closer (round 10);
      // else the jar is empty. A pest just shooed says nothing.
      if (pressed && !shooed && !near) this.emit({ t: 'deny', why: ahead ? 'Get closer.' : 'Nothing in the jar.' });
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
      // Run out: the next window that holds something is chosen, ready for the next press (at a crate, only one the
      // crate takes; else the window stays chosen, empty, until you turn away).
      if (this.atCrate(aim)) this.chooseNext(this.crateTakes);
      else this.chooseNext();
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
  /** The extra fluff each rare pen has shed today (round 10: at most RARE_EXTRA a day), and the day. Not saved. */
  private rareGiven: number[] = PADS.map(() => 0);
  private rareDay = -1;
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
    // A fake puff runs its own time too (round 9), and it does not pull. Let go during it (or just after) and it
    // takes a little of the pull back, and the slack runs from the let-go as after a pull back: the tell is read,
    // not just reacted to.
    if (d.feint > 0) {
      d.feint -= dt;
      if (d.feint <= 0) {
        d.feint = 0;
        d.sinceFeint = 0;
      }
    } else if (d.sinceFeint >= 0) {
      d.sinceFeint += dt;
      if (d.sinceFeint > FEINT.after) d.sinceFeint = -1;
    }
    if (wild && !d.keep && d.strain > 0 && !d.held && (d.feint > 0 || d.sinceFeint >= 0) && d.back <= 0 && d.tell <= 0 && d.slackT < 0 && !this.drawing) {
      d.tug = Math.max(0, d.tug - FEINT.cost * this.tugNeed(d));
      d.easeT = Math.max(d.easeT, EASE_HOLD);
      d.slackT = 0;
      d.sinceFeint = -1;
      d.squashV -= 2;
      this.emit({ t: 'fooled', x: d.x, y: d.y, z: d.z, kind: d.kind });
    }
    // Its tell runs its own time (it puffs up whether or not you are still pulling), then it pulls back.
    if (d.tell > 0) {
      d.tell -= dt;
      if (d.tell <= 0) {
        d.tell = 0;
        if (wild && !d.keep && d.strain > 0 && d.drawn <= 0) this.pullBack(d);
      }
    }
    // Its pull back runs its time (a let-go pull holds what it had through it, and a moment after), then it pulls
    // no more until you have pulled a while again. While the lesson teaches it, it stops once you let go.
    if (d.back > 0) {
      // (Let go as it puffed up or as it pulls: you eased off for it. A tell only starts while you pull.)
      if (!d.held) {
        if (!d.eased && !this.knows('ease')) d.back = Math.min(d.back, 0.3);
        d.eased = true;
      }
      d.back -= dt;
      if (d.back <= 0) {
        d.back = 0;
        d.easeT = EASE_HOLD;
        d.backT = this.nextBack(d);
        // Not pulling again yet: its slack runs from now, and it shifts a little to one side (round 9), so you aim again.
        d.slackT = d.held ? -1 : 0;
        if (!d.held && wild && !d.keep && this.knows('ease')) this.shiftAside(d, px, pz);
        this.emit({ t: 'eased', x: d.x, y: d.y, z: d.z, kind: d.kind, eased: d.eased });
      } else if (!d.held && wild && !d.keep) this.pullingBack(d, { ex: px, ez: pz } as Aim, dt, 0.5);
    }
    if (d.easeT > 0) d.easeT -= dt;
    // Left slack too long after a pull back (round 8: the duel asks for both, letting go in time and pulling again
    // in time), it bolts: a getaway. Not while the lesson's line is teaching the first one.
    if (d.slackT >= 0) {
      if (d.held || d.strain <= 0 || d.tame || d.keep) d.slackT = -1;
      else if (d.back <= 0 && d.tell <= 0 && !this.drawing) {
        // (Only while Pull is let go: pressed but off it, the pull fades as any lapse does.)
        d.slackT += dt;
        if (this.knows('ease') && d.slackT > this.tugRule(d).slack) {
          this.escape(d, true);
          return;
        }
      }
    }
    // A pull that slips off fades (a wild one's at its kind's rate: an ember's darts give you a moment to find it again).
    if (!d.held && d.back <= 0 && d.tell <= 0 && d.easeT <= 0) d.tug = Math.max(0, d.tug - dt * (wild && !d.keep ? CATCH[d.kind].fade : 1.5));
    if (d.bolt > 0) d.bolt -= dt;
    if (d.wary > 0) d.wary -= dt;
    // A wild one fighting the pull gets away if you are slow (its kind's limit), or if the pull lapses once it
    // was well on its way. Coming in, the fight is won.
    if (d.drawn > 0) {
      d.strain = 0;
      d.peak = 0;
      d.back = 0;
      d.easeT = 0;
      d.tell = 0;
      d.slackT = -1;
      d.feint = 0;
    } else if (wild && !d.keep && d.strain > 0) {
      // (Round 11: on the line, near the end of Pull's reach, a leap away is reined in: a thistle caught mid-bolt carried
      // on at 6 m/s to 14 m off, past any thumb standing still.)
      const off = Math.hypot(d.x - px, d.z - pz);
      if (off > this.range - 0.5) {
        const ax = (d.x - px) / off;
        const az = (d.z - pz) / off;
        const away = d.vx * ax + d.vz * az;
        if (away > 0) {
          const cut = away * (1 - Math.exp(-TUG_REIN * dt));
          d.vx -= ax * cut;
          d.vz -= az * cut;
        }
      }
      // (Its time, for one that has one, waits while it pulls back, and while it puffs up to.)
      if (d.back <= 0 && d.tell <= 0) d.strain += dt;
      d.peak = Math.max(d.peak, d.tug / CATCH[d.kind].need);
      // One with a time (a brook, a thistle) breaks free when its time runs out, shown on the tug ring; one
      // without (a clover, an ember) when the pull lapses once it was a third of the way in. (The fifth
      // playtest's careless thumb lost all ten brooks to a lapse, each into the pond.)
      const lim = fightLimit(d);
      if ((lim > 0 && d.strain >= lim) || (lim <= 0 && d.tug <= 0 && d.peak >= SHAKE_LOOSE)) this.escape(d);
      else if (d.tug <= 0 && d.back <= 0 && d.tell <= 0 && d.feint <= 0) {
        d.strain = 0;
        d.peak = 0;
        d.backT = -1;
        d.slackT = -1;
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
      if (d.calm > 0 && (d.strain > 0 || d.back > 0 || d.tell > 0 || d.easeT > 0)) d.calm = Math.max(d.calm, 0.5);
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
      // (Not mid-fight: the duel's let-gos with you close by used to make it hear you and bolt.) Round 9: it hears you
      // only while you move, running loudest, in any direction at the same distance (the ninth playtest's gold clover
      // "heard" a tester standing still at 13.7 m as it drifted their way, 20 m off once spooked, and a rose ember 4 m
      // up the crag never heard one walking 11.5 m off).
      const moving = Math.hypot(s.player.vx, s.player.vz) > RARE_HEAR.still || !s.player.grounded;
      const heard = Math.hypot(d.x - px, d.y - s.player.y, d.z - pz);
      alert = d.drawn === 0 && !d.held && d.strain <= 0 && moving && heard < (lured ? (running ? w.nearRun : w.nearWalk) : running ? w.run : w.walk);
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
    if (forCrate && this.inCrate(d.x, d.y, d.z) && this.sellDowny(d.kind, d.x, this.crateFloors[nearestCrate(d.x, d.z)] + CRATE.h, d.z, d.caught, d.rare) >= 0) {
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
        if (d.flyT >= 0 && d.tame && !forCrate && Math.hypot(d.x - CRATE_AT[nearestCrate(d.x, d.z)].x, d.z - CRATE_AT[nearestCrate(d.x, d.z)].z) < PULL_R + 0.8) {
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
          if (was < 0) this.stockFirst(d.kind, pen);
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

  /** The pen a loose downy of yours (never penned) makes for: the nearest of yours with room, or -1. */
  private loosePen(d: Downy): number {
    const s = this.s;
    let best = -1;
    let bd = 1e9;
    for (let i = 0; i < s.pads.length; i++) {
      if (s.pads[i].kind !== 'pen' || this.penCounts[i] >= PEN_MAX) continue;
      const dd = Math.hypot(PADS[i].x - d.x, PADS[i].z - d.z);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    return best;
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
    if (!cratePull(d, this.crateFloors, dt * 2.2)) return;
    const ci = nearestCrate(d.x, d.z);
    const dh = Math.hypot(CRATE_AT[ci].x - d.x, CRATE_AT[ci].z - d.z);
    const foot = d.y - this.crateFloors[ci];
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
    let homeward = false;
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
    } else if (!d.tame && d.rare && Math.hypot(d.x - d.homeX, d.z - d.homeZ) > RARE_HEAR.home) {
      // The rare one, away from where it was seen (it bolted): straight back (round 9; it wandered back at a stroll).
      tx = d.homeX;
      tz = d.homeZ;
      homeward = true;
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
    } else if (d.tame && d.pen < 0 && (d.homePen = this.loosePen(d)) >= 0) {
      // One of yours loose, never penned (the porch downy once blown out, or one that missed a pen): with a pen of
      // yours with room, it hurries over and waits by its gate (round 9: the pen lesson sent you 24 m back to the
      // porch to pull it in, then 24 m back to the pen: the first-fifteen-minutes player's longest back and forth).
      const w = strayWait(d.homePen, d.id);
      const near = Math.hypot(w.x - d.x, w.z - d.z) < 1.5;
      const a = r() * Math.PI * 2;
      tx = near ? w.x + Math.cos(a) * 0.8 : w.x;
      tz = near ? w.z + Math.sin(a) * 0.8 : w.z;
      homeward = !near;
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
    const cap = bolting ? (d.kind === 'thistle' || (d.rare && !d.tame) ? BOLT_SPEED * 1.6 : 4) : toFood ? (starving ? (d.rare && !d.tame ? 3 : 2.4) : 1.9) : homeward ? 3.2 : flee ? 2.2 : scaredIn ? 2.4 : fraz || d.kind === 'thistle' ? 2.8 : 1.8;
    const hs = Math.min(dist / air, cap);
    d.vx = dx * hs;
    d.vz = dz * hs;
    d.vy = vy;
    d.grounded = false;
    d.squashV += 2.5;
    if (dist > 0.05) d.yaw = Math.atan2(dx, dz);
    // Hungry ones bounce slowly until they spot food; then they hurry to it, faster when starving.
    d.hopT = bolting ? 0.03 + r() * 0.05 : (0.45 + r() * 1.1) * (toFood ? (starving ? (d.rare && !d.tame ? 0.25 : 0.35) : 0.55) : homeward ? 0.3 : flee ? 0.45 : hungry ? 1.5 : 1) * (fraz && !toFood ? 0.45 : 1);
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
      // A rare one of yours in the pen: everyone in it sheds one more, for good (the hunt's lasting reward), up to
      // RARE_EXTRA more a day from the pen (round 10).
      if (d.pen >= 0 && this.penRare[d.pen]) {
        if (this.rareDay !== s.day) {
          this.rareDay = s.day;
          this.rareGiven.fill(0);
        }
        if (this.rareGiven[d.pen] < RARE_EXTRA) {
          this.rareGiven[d.pen]++;
          n++;
        }
      }
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
      // (Round 11: not until the sell lesson is done, unless you blew it. A first downy fed beside the crate sold its
      // own fluff, and the line could only say to feed it again, about one fresh game in ten.)
      if (tuft && it.drawn === 0 && (it.blown || this.knows('lesson:sell')) && cratePull(it, this.crateFloors, dt)) {
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
  private get crateFloors(): number[] {
    return (this._crateFloors ??= CRATE_AT.map((c) => this.phys.floor(c.x, c.z)));
  }
  private _crateFloors: number[] | undefined;
  private ghost: Item | undefined;

  /**
   * Inside the sell crate's catch: its box, the flared sides over the rim, or
   * the backboard behind it (fluff that reaches the board drops in, as it looks
   * like it should). The front is open, facing the lane.
   */
  private inCrate(x: number, y: number, z: number): boolean {
    // (Round 8: either crate, the nearer one.)
    const ci = nearestCrate(x, z);
    const C = CRATE_AT[ci].box;
    const cfl = this.crateFloors[ci];
    const rim = cfl + C.h;
    if (y <= cfl) return false;
    if (y >= rim - 0.05 && y < rim + 0.85 && x > C.x0 - 0.2 && x < C.x1 + 0.2 && z > C.z1 - 0.1 && z < C.z1 + 0.4) return true;
    if (y >= rim + 0.5) return false;
    const m = y >= rim - 0.05 ? 0.35 : 0.15;
    return x > C.x0 - m && x < C.x1 + m && z > C.z0 - m && z < C.z1 + m;
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
    const cfl = this.crateFloors;
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
      if (b.y <= this.phys.floor(b.x, b.z)) {
        const c = CRATE_AT[nearestCrate(b.x, b.z)];
        return Math.hypot(b.x - c.x, b.z - c.z) < PULL_R - 0.1;
      }
    }
    return false;
  }

  private ghostDowny: Downy | undefined;

  /** Would a blow now send the chosen downy into the crate for today's live order? Flies it ahead the way a real blown downy flies, the crate's pull included. */
  wouldSellDowny(aim: Aim): boolean {
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
    const cfl = this.crateFloors[nearestCrate(it.x, it.z)];
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
        const why = this.feederRefuses(i, it.type);
        if (!why) {
          feederAdd(fd, it.type, 1);
          it.gone = true;
          this.emit({ t: 'store', x: it.x, y: it.y, z: it.z, where: 'feeder', pad: i });
          this.emit({ t: 'feeder', pad: i, n: feederTotal(fd), why: '' });
          return true;
        }
        // Refused (two other foods in it, or full): it bounces off the hopper, and says why, instead of vanishing into the pen.
        it.vy = 3.2;
        it.vx = -it.vx * 0.25;
        it.vz = -it.vz * 0.25;
        it.flyT = 3;
        this.emit({ t: 'feeder', pad: i, n: feederTotal(fd), why });
        return true;
      }
    }
    return false;
  }

  /**
   * Why pen i's feeder would refuse a food, or '' if it takes it (round 10): it holds up to two foods, so a mixed
   * pen's feeder holds each kind's (it held one, and a clover pen with a feeder of sweetroots could not be fed).
   */
  feederRefuses(i: number, food: Food): string {
    const p = this.s.pads[i];
    if (!p || p.kind !== 'pen' || !p.ups.includes('feeder')) return 'No feeder here.';
    const fd = p.feeder;
    if (feederTotal(fd) >= FEEDER_CAP) return 'The feeder is full.';
    const has = feederFoods(fd);
    if (has.length < 2 || has.some((q) => q.t === food)) return '';
    return `This feeder holds ${thingName(has[0].t, 2)} and ${thingName(has[1].t, 2)}.`;
  }

  /** Does pen i's feeder hold food that a downy in the pen eats? */
  private feederFeeds(i: number): boolean {
    const foods = feederFoods(this.s.pads[i].feeder);
    return this.s.downies.some((d) => !d.gone && d.pen === i && foods.some((q) => eats(d.kind, q.t)));
  }

  /**
   * The pen whose feeder hopper the crosshair is on (within Pull's reach, the line passing within HOPPER_AIM of
   * its middle), with something in it, or -1 (round 10: a Pull at the hopper takes its food back into the jar).
   */
  aimedHopper(aim: Aim): number {
    const s = this.s;
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < s.pads.length; i++) {
      const p = s.pads[i];
      if (p.kind !== 'pen' || !p.ups.includes('feeder') || feederTotal(p.feeder) <= 0) continue;
      const h = padSpots(i).hopper;
      const hy = this.phys.floor(h.x, h.z) + h.y;
      const dx = h.x - aim.ex;
      const dy = hy - aim.ey;
      const dz = h.z - aim.ez;
      const along = dx * aim.dx + dy * aim.dy + dz * aim.dz;
      if (along <= 0 || along > this.range + 0.4) continue;
      const off = Math.hypot(dx - aim.dx * along, dy - aim.dy * along, dz - aim.dz * along);
      if (off < HOPPER_AIM && off < bd) {
        bd = off;
        best = i;
      }
    }
    return best;
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
      if (p.kind === 'pen' && p.ups.includes('feeder') && !this.feederRefuses(i, food)) pens.push(i);
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
      // From the meadow's north edge; the night it is first taught, the first comes in just past the ranch gate
      // (round 9: the first-fifteen-minutes player walked about 50 m out to meet it under the night lesson's arrow).
      const near = this.teaching && !this.knows('lesson:night') && alive === 0;
      const x = near ? -8 + this.rand() * 16 : -26 + this.rand() * 52;
      const z = near ? 4 + this.rand() * 4 : -53;
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
            const add = feederAdd(s.pads[run].feeder, p.crop, yieldN);
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
          // (Round 11: only this crop counts towards the full bed. "Plant dewberries" left the old clover heads lying, they
          // counted towards its 12, and after 22 game hours it held 2 dewberries with its growth stuck at the end.)
          for (const it of s.items) if (!it.gone && it.type === p.crop && Math.abs(it.x - at.x) < BED_HALF && Math.abs(it.z - at.z) < BED_HALF && it.drawn === 0) on++;
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
                feederAdd(s.pads[next].feeder, p.crop, add);
                const h = padSpots(next).hopper;
                this.emit({ t: 'store', x: h.x, y: this.phys.floor(h.x, h.z) + h.y, z: h.z, where: 'feeder', pad: next, auto: true });
              }
              this.emit({ t: 'crop', pad: i });
            }
          }
        }
      } else if (p.kind === 'pen' && p.ups.includes('feeder')) {
        p.feedT -= dt;
        if (p.feedT > 0 || feederTotal(p.feeder) <= 0) return;
        // (Round 10: of its two foods, one a hungry downy in the pen eats and none of it lying in the pen.)
        let food: Food | null = null;
        for (const q of feederFoods(p.feeder)) {
          let hungry = false;
          for (const d of s.downies) if (!d.gone && d.pen === i && d.hunger > 0.5 && eats(d.kind, q.t)) hungry = true;
          if (!hungry) continue;
          let lying = 0;
          for (const it of s.items) if (!it.gone && it.type === q.t && this.phys.penAt(it.x, it.z) === i) lying++;
          if (lying > 0) continue;
          food = q.t;
          break;
        }
        if (!food) return;
        feederTake(p.feeder, food);
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
      if (p.kind !== 'pen' || !p.ups.includes('feeder') || this.feederRefuses(j, crop)) continue;
      // (Round 10: a food it holds already, or one a downy in the pen eats, so a mixed pen's feeder gets both.)
      const holds = feederFoods(p.feeder).some((q) => q.t === crop);
      if (!holds && feederTotal(p.feeder) > 0 && !s.downies.some((d) => !d.gone && d.pen === j && eats(d.kind, crop))) continue;
      if (feederTotal(p.feeder) === 0 && s.downies.some((d) => !d.gone && d.pen === j && !eats(d.kind, crop))) continue;
      const n = feederTotal(p.feeder);
      if (n < bn) {
        bn = n;
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
    const wildOf = (k: DownyKind) => {
      let n = 0;
      for (const d of s.downies) if (!d.gone && !d.tame && !d.keep && d.kind === k) n++;
      return n;
    };
    // Far wild downies come and go so the count stays small. (Round 11: the last of a kind stays, or a goal or an order
    // that wants it would be waiting on a refill the count keeps out.)
    for (const d of s.downies) {
      if (d.gone || d.tame || d.keep || d.rare) continue;
      const far = Math.hypot(d.x - p.x, d.z - p.z);
      const dusk = s.hour >= 17 && s.hour < 21;
      if ((d.kind === 'thistle' && !dusk && far > 25) || (active > WILD_CAP && far > 60 && d.kind !== 'thistle' && wildOf(d.kind) > WILD_KEEP)) {
        d.gone = true;
        active--;
      }
    }
    // The thistles on their own, before the count (round 11's P1: keeping 22 made it 56 with the 34 wild, so none came,
    // and the goals after the thistle stayed locked; filling pens is what caused it). A far wild one makes room.
    if (s.hour >= 17.5 && s.hour < 20.5) {
      // They come over from behind the crest, out of your sight, and hop down to the top, however near you wait
      // (round 8: they came only while you were over 18 m off, so waiting 16.6 m away from 17:24 to 18:20 brought none).
      if (wildOf('thistle') < 2 && this.thistleArrives()) {
        active++;
        if (active > WILD_CAP && this.makeRoom()) active--;
      }
    }
    // One refill a tick for the home groups. At the count, only for a kind with almost none wild left, again by making
    // room (a live order or "Keep ten brook downies" wants them however many you keep).
    for (const g of GROUPS) {
      let n = 0;
      for (const d of s.downies) if (!d.gone && !d.tame && d.kind === g.kind && Math.abs(d.homeX - g.x) < 1 && Math.abs(d.homeZ - g.z) < 1) n++;
      if (n >= g.n || Math.hypot(g.x - p.x, g.z - p.z) <= (g.far ?? 30)) continue;
      if (active >= WILD_CAP) {
        if (wildOf(g.kind) >= WILD_KEEP) continue;
        this.makeRoom(g.kind);
      }
      this.spawnWild(g);
      break;
    }
    // Seeing a thistle (the goal is to catch one: they bolt, so it takes a running approach or a quick tug).
    if (!this.thistleSeen) {
      for (const d of s.downies) if (!d.gone && d.kind === 'thistle' && Math.hypot(d.x - p.x, d.z - p.z) < 9) this.thistleSeen = true;
    }
  }

  /**
   * Make room for a wild one that a goal or an order waits on: the far wild downy of the kind most plentiful (not the
   * one coming, not a thistle, not the rare one, none you could see go, none in a tug). False if there is none: what you
   * keep is never taken, and the count goes over by that one.
   */
  private makeRoom(not?: DownyKind): boolean {
    const s = this.s;
    const p = s.player;
    const count = new Map<DownyKind, number>();
    for (const d of s.downies) if (!d.gone && !d.tame && !d.keep && !d.rare) count.set(d.kind, (count.get(d.kind) ?? 0) + 1);
    let best: Downy | null = null;
    let bs = -1;
    for (const d of s.downies) {
      if (d.gone || d.tame || d.keep || d.rare || d.kind === 'thistle' || d.kind === not || d.strain > 0 || d.drawn > 0) continue;
      const n = count.get(d.kind) ?? 0;
      if (n <= WILD_KEEP) continue;
      const far = Math.hypot(d.x - p.x, d.z - p.z);
      if (far < 25) continue;
      const score = n * 100 + far;
      if (score > bs) {
        bs = score;
        best = d;
      }
    }
    if (!best) return false;
    best.gone = true;
    return true;
  }

  /**
   * Is a spot on the ground out of your sight? Off to the side of the view or behind you (over 70 degrees from
   * where you look), behind the crag, or over a rise of the ground.
   */
  outOfSight(x: number, z: number): boolean {
    const p = this.s.player;
    const dx = x - p.x;
    const dz = z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    if ((dx * -Math.sin(p.yaw) + dz * -Math.cos(p.yaw)) / l < Math.cos((70 * Math.PI) / 180)) return true;
    // Behind the crag (it stands far taller than you).
    const t = clamp(((CRAG.x - p.x) * dx + (CRAG.z - p.z) * dz) / (l * l), 0, 1);
    if (Math.hypot(p.x + dx * t - CRAG.x, p.z + dz * t - CRAG.z) < 3.6) return true;
    // Over a rise: the ground between comes up above the line from your eye to its head.
    const ey = p.y + EYE;
    const ty = this.phys.floor(x, z) + 0.45;
    for (let k = 1; k < 16; k++) {
      const f = k / 16;
      if (this.phys.floor(p.x + dx * f, p.z + dz * f) > ey + (ty - ey) * f + 0.1) return true;
    }
    return false;
  }

  /**
   * A thistle comes to the ridge top at dusk: it appears out of your sight, 9 to 15 m from the top on the ridge
   * (behind the crest, behind the crag, or behind your back) and at least 9 m from you, and hops down to the top.
   * Nowhere out of sight: it waits for the next look away.
   */
  private thistleArrives(): Downy | null {
    const s = this.s;
    const p = s.player;
    const spots: { x: number; z: number }[] = [];
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2 + this.rand() * 0.3;
      const r = 9 + this.rand() * 6;
      const x = RIDGE_TOP.x + Math.cos(a) * r;
      const z = RIDGE_TOP.z + Math.sin(a) * r;
      if (x < MINX + 3 || z < MINZ + 3 || zoneAt(x, z) !== 'ridge' || waterAt(x, z) > this.phys.floor(x, z) - 0.05) continue;
      if (Math.hypot(x - CRAG.x, z - CRAG.z) < 4.2 || Math.hypot(x - p.x, z - p.z) < 9) continue;
      if (this.outOfSight(x, z)) spots.push({ x, z });
    }
    if (!spots.length) return null;
    const at = spots[Math.floor(this.rand() * spots.length) % spots.length];
    const d = this.spawnWild({ kind: 'thistle', x: at.x, z: at.z, n: 2 });
    d.x = at.x;
    d.z = at.z;
    d.y = this.phys.floor(at.x, at.z) + 0.3;
    d.homeX = RIDGE_TOP.x;
    d.homeZ = RIDGE_TOP.z;
    return d;
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
    // (Round 11: a ranch saved before the brook goal came in has it already.)
    if (!s.goals.includes('brook') && s.caught.includes('brook')) this.complete('brook');
    // A rare downy of every kind kept (round 10).
    if (!s.goals.includes('rares') && this.rareKinds().length >= RARE_KINDS.length) this.complete('rares');
    // Five downies in one pen, any kind (round 9).
    if (!s.goals.includes('herd')) {
      const n = s.pads.map(() => 0);
      for (const d of s.downies) if (!d.gone && d.pen >= 0) n[d.pen]++;
      if (n.some((k, i) => k >= 5 && s.pads[i].kind === 'pen')) this.complete('herd');
    }
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
    this.duskFluff();
  }

  /** The dusk the fluff note last came (a day number). */
  private fluffWarned = 0;

  /**
   * Fluff lying on the ranch at dusk blows away at dawn (round 11: 46 fluff became 9 one morning, 133 became 4 after
   * neglect, and nothing said so). Once a dusk at most, once the clock is past 6 pm (before you can sleep through it:
   * the door opens at 6) and with a few lying.
   */
  private duskFluff(): void {
    const s = this.s;
    if (s.hour < FLUFF_NOTE.from || s.hour >= FLUFF_NOTE.to || this.fluffWarned === s.day || !this.knows('lesson:sell')) return;
    let n = 0;
    for (const it of s.items) if (!it.gone && isTuft(it.type) && it.flyT < 0 && it.drawn === 0 && zoneAt(it.x, it.z) === 'ranch') n++;
    if (n < FLUFF_NOTE.least) return;
    this.fluffWarned = s.day;
    this.emit({ t: 'fluffnote', n });
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
      // (Round 10: food in it that someone in the pen eats.)
      if (feeder && this.feederFeeds(i)) return;
      if (!feeder && s.items.some((it) => !it.gone && isFood(it.type) && this.phys.penAt(it.x, it.z) === i)) return;
      // (A feeder of food nobody in the pen eats is no feeder for the night: "A pen has no food", not "A feeder is empty".)
      this.emit({ t: 'hungrynight', pen: i, feeder: feeder && feederTotal(p.feeder) <= 0 });
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
    const o = s.orders.find((q) => q.state === 'open' && !q.live && q.kind === k && q.got < q.n && this.counting(q));
    // An order for after dark, open: say why this one went as a plain sale (once in a while).
    if (!o && blown && this.nightNoteT <= 0 && s.orders.some((q) => q.state === 'open' && !q.live && q.kind === k && q.got < q.n)) {
      this.nightNoteT = 4;
      this.emit({ t: 'deny', why: 'The order takes fluff after 9 pm.' });
    }
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
    return s.orders.find((q) => q.state === 'open' && q.live && !q.rare && q.kind === k && q.got < q.n && caught === s.day && this.counting(q));
  }

  /** Does an order count what comes in now (a night one only from 9 pm)? */
  counting(o: Order): boolean {
    return o.from === undefined || this.s.hour >= o.from;
  }
  private nightNoteT = 0;

  /** Is there an open live order a downy of this kind (caught on that day) would go to at the crate? */
  wantsDowny(k: DownyKind, caught = this.s.day, rare = false): boolean {
    return !!this.liveFor(k, caught, rare);
  }

  /** Why the crate would not take a downy blown at it for today's order, or '' if no open order wants the kind. */
  staleNote(k: DownyKind, rare = false): string {
    if (rare && this.s.orders.some((q) => q.state === 'open' && q.rare && q.kind === k && q.got < q.n)) return 'Blow it into a pen. It stays.';
    const o = this.s.orders.find((q) => q.state === 'open' && q.live && !q.rare && q.kind === k && q.got < q.n);
    if (o && !this.counting(o)) return 'The order wants them after 9 pm.';
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
    // (Round 10: days running with an order filled.)
    const last = s.stats.lastFill ?? -9;
    if (last !== s.day) s.stats.streak = last === s.day - 1 ? (s.stats.streak ?? 0) + 1 : 1;
    s.stats.lastFill = s.day;
    s.stats.filledAt = s.day * 24 + s.hour;
    this.complete('order');
    if (s.stats.filled >= 5) this.complete('orders5');
    if (o.mult > 2) this.complete('prized');
    if (o.from !== undefined) this.complete('late');
    if ((s.stats.streak ?? 0) >= 3) this.complete('streak');
    return bonus;
  }

  /** The kinds of rare downy you keep (penned, loose or in the jar), for the goal of one of every kind. */
  rareKinds(): DownyKind[] {
    const s = this.s;
    const out = new Set<DownyKind>();
    for (const d of s.downies) if (!d.gone && d.tame && d.rare) out.add(d.kind);
    for (const q of s.slots) if (q.t && isDowny(q.t) && (q.downs ?? []).some((r) => r.rare)) out.add(q.t);
    return [...out];
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
  makes(k: DownyKind, hour = this.s.hour, by = ORDER_BY): number {
    const left = Math.max(0, by - Math.max(hour, 6));
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
    // Round 8: every offer has a condition, due by 10 am or by dusk (the hunt at a set place too), and none is the
    // same sort, kind and deadline as one of yesterday's (the eighth playtest's day 3 trip, 2 clovers for 132, was
    // day 2's again). The morning's is offered only to a morning start, with time to do it.
    const yday = new Set(s.orderLog.filter((o) => o.day === s.day - 1).map(orderKey));
    // Round 9: no offer of the same sort and kind as one on either of the last two mornings, where the ranch has
    // another to offer (the ninth playtest's day 6 offered day 4's pair again, almost exactly). Where it has not
    // (a ranch of clover alone), the one offered longest ago.
    const ago = (sort: 'fluff' | 'live' | 'rare', k: DownyKind) => {
      for (let i = s.orderLog.length - 1; i >= 0; i--) {
        const o = s.orderLog[i];
        if (o.kind === k && (o.rare ? 'rare' : o.live ? 'live' : 'fluff') === sort && o.day < s.day) return s.day - o.day;
      }
      return 99;
    };
    const fresh = <T>(sort: 'fluff' | 'live' | 'rare', items: T[], kind: (t: T) => DownyKind): T[] => {
      const ok = items.filter((t) => ago(sort, kind(t)) > OFFER_GAP);
      if (ok.length) return ok;
      const best = Math.max(...items.map((t) => ago(sort, kind(t))));
      return items.filter((t) => ago(sort, kind(t)) === best);
    };
    const mornOk = hour <= ORDER_MORN - 3;
    const taken = new Set<string>();
    const NIGHT = ORDER_NIGHT.by;
    // The deadline it would have, the preferred one first: by 10 am (a morning start only), by dusk, or after dark
    // (not for the hunt: the rare one goes at dusk).
    // (Round 9: and where it can, not the same sort, kind and deadline as on any of the last three mornings.)
    const recent3 = new Set(s.orderLog.filter((o) => o.day < s.day && o.day >= s.day - 3).map(orderKey));
    const when = (sort: 'fluff' | 'live' | 'rare', k: DownyKind, prefer: number): number | null => {
      const all = [ORDER_MORN, ORDER_BY, NIGHT].filter((b) => (b !== ORDER_MORN || mornOk) && (b !== NIGHT || sort !== 'rare'));
      const order = [prefer, ...all.filter((b) => b !== prefer)].filter((b) => all.includes(b));
      for (const fresh3 of [true, false]) {
        for (const by of order) {
          const key = orderKey({ kind: k, live: sort !== 'fluff', rare: sort === 'rare', by });
          if (!yday.has(key) && !taken.has(key) && (!fresh3 || !recent3.has(key))) return by;
        }
      }
      return null;
    };
    const coin = () => [ORDER_MORN, ORDER_BY, NIGHT][Math.floor(this.rand() * 3) % 3];
    const night = (by: number) => (by === NIGHT ? { from: ORDER_NIGHT.from } : {});
    // A fluff order (a day at home): by dusk about 70% of what those downies make by then, paying its price again on
    // top; by 10 am (a rush) about half of what they make by then, paying twice its price on top. A prized one pays
    // triple and is a stretch for it (half as much fluff again, or a thistle's nearly all its downies make), by dusk.
    // What a plain fluff order by dusk pays today, for the ranch's best plain kind: a prized one pays at most half as
    // much again (round 9: "9 thistle fluff by dusk, pays 1,116", from two thistles caught in 19 s, took the ninth
    // playtest from 104 to 2,685 coins in a day).
    const plains = choices.filter((c) => c.kind !== 'thistle');
    const plainDay = Math.max(0, ...(plains.length ? plains : choices).map((c) => c.n * this.price(c.kind)));
    // (Round 10: a small thistle ranch's plain thistle order, no more than that plain order: with two thistles, no
    // longer prized, it paid 594 against the capped prized 405.)
    const capAt = (o: Order): number => (o.mult > 2 ? PRIZED_CAP : o.kind === 'thistle' && plains.length ? 1 : 0);
    const capped = (o: Order): Order => (capAt(o) > 0 && plainDay > 0 ? { ...o, pay: Math.min(o.pay, Math.round((plainDay * capAt(o)) / 5) * 5) } : o);
    const fluff = (c: { kind: DownyKind; n: number }, big: boolean, by: number): Order | null => {
      const o = fluffRaw(c, big, by);
      return o ? capped(o) : null;
    };
    const fluffRaw = (c: { kind: DownyKind; n: number }, big: boolean, by: number): Order | null => {
      // (Round 10: a thistle's is prized only on a ranch of three thistles or more.)
      const prized = big || (c.kind === 'thistle' && kept.thistle >= THISTLE_PRIZED);
      const mult = prized ? 3 : 2;
      if (by === ORDER_MORN) {
        const make = this.makes(c.kind, hour, ORDER_MORN);
        // (Round 11: half of it. Due at 10 am there is about one round of meals to be had, and at 70% a keen hand got 9 of 12.)
        const n = Math.max(c.kind === 'thistle' ? 2 : 4, Math.round((make * 0.5) / 2) * 2);
        if (make < n + 0.5) return null;
        return { kind: c.kind, n, got: 0, paid: 0, mult, pay: Math.round(n * this.price(c.kind) * 2 * (mult - 1)), state: 'offer', by };
      }
      if (by === NIGHT) {
        // After dark: fluff banked in the jar through the day and sold from 9 pm (penned downies doze, and pests eat
        // fluff left lying), about half of what they make by dusk, as much as the fluff window holds at most; it pays
        // twice its price on top.
        const n = Math.max(c.kind === 'thistle' ? 2 : 4, Math.min(20, Math.round((this.makes(c.kind, hour) * 0.5) / 2) * 2));
        return { kind: c.kind, n, got: 0, paid: 0, mult, pay: Math.round(n * this.price(c.kind) * 2 * (mult - 1)), state: 'offer', by, from: ORDER_NIGHT.from };
      }
      const most = Math.floor(this.makes(c.kind, hour) * 0.9);
      const n = big ? Math.min(40, Math.round((c.n * 1.45) / 2) * 2) : c.kind === 'thistle' ? Math.max(c.n, Math.min(most, c.n + 4)) : c.n;
      return { kind: c.kind, n, got: 0, paid: 0, mult, pay: Math.round(n * this.price(c.kind) * (mult - 1)), state: 'offer', by };
    };
    const add = (o: Order | null): Order | null => {
      if (!o) return null;
      taken.add(orderKey(o));
      out.push(o);
      return o;
    };
    // A thistle you keep, its fluff not asked for in two days: the morning's fluff order is its prized one (triple).
    const fluffs = fresh('fluff', choices, (c) => c.kind);
    const th = fluffs.find((c) => c.kind === 'thistle');
    const ordered = [...fluffs, ...choices.filter((c) => !fluffs.includes(c))].sort((a, b) => (fluffs.includes(b) ? 1 : 0) - (fluffs.includes(a) ? 1 : 0) || fluffW(b) - fluffW(a));
    const firstPick = th && this.stale('thistle', 'fluff') >= 2 ? th : this.pickWeighted(fluffs, fluffW);
    let first: Order | null = null;
    for (const c of firstPick ? [firstPick, ...ordered.filter((q) => q !== firstPick)] : []) {
      const big = !!s.gates.hollow && s.day % 3 === 0 && c.kind !== 'thistle';
      // (A prized one is a stretch by dusk.)
      const by = big || c.kind === 'thistle' ? (yday.has(orderKey({ kind: c.kind, by: ORDER_BY })) ? null : ORDER_BY) : when('fluff', c.kind, coin());
      if (by === null) continue;
      first = add(fluff(c, big, by));
      if (first) break;
    }
    const tripPay = (k: DownyKind, by: number) => Math.round((LIVE_EACH[k] * (by === ORDER_MORN ? MORN_TRIP : by === NIGHT ? NIGHT_TRIP : 1)) / 5) * 5;
    // What a plain fluff order of that kind by dusk would add: the trip and the hunt are sized from it.
    const plain = first ? (choices.find((c) => c.kind === first!.kind)?.n ?? first.n) * this.price(first.kind) : 0;
    // Live downies: a trip out instead of a day at home, for about two fifths more than the fluff order adds.
    const left = Math.max(0, ORDER_BY - Math.max(hour, 6));
    let live: Order | null = null;
    if (left >= 6) {
      const fits = (k: DownyKind) => !plain || (plain * LIVE_OVER >= LIVE_EACH[k] * 1.5 && plain * LIVE_OVER <= LIVE_EACH[k] * 5.5);
      const open = fresh('live', this.liveKinds(), (k) => k);
      const fit = open.filter(fits);
      const w = (k: DownyKind) => (1 + this.stale(k, 'live')) * (kept[k] < 3 ? 2 : 1) * (first && k === first.kind ? 0.35 : 1);
      // One that fits, by weight (none fits a big order: the dearest you can catch); then the rest, should
      // that one repeat one of yesterday's.
      const lk0 = fit.length ? this.pickWeighted(fit, w) : undefined;
      const dear = [...open].sort((a, b) => LIVE_EACH[b] - LIVE_EACH[a]);
      const tries = lk0 ? [lk0, ...fit.filter((k) => k !== lk0).sort((a, b) => w(b) - w(a)), ...dear.filter((k) => !fit.includes(k))] : dear;
      for (const lk of tries) {
        const by = when('live', lk, coin());
        if (by === null) continue;
        const n = Math.max(2, Math.min(5, Math.round(((plain || LIVE_EACH[lk] * 2) * LIVE_OVER) / LIVE_EACH[lk])));
        live = add({ kind: lk, live: true, n, got: 0, paid: 0, mult: 2, pay: tripPay(lk, by), state: 'offer', by, ...night(by) });
        break;
      }
    }
    // The rare one, a hunt (the sixth playtest's top fun change): one sought-after wild downy, seen at a landmark (a
    // set place), warier than any other and lured with its favourite food. Penned, it stays and its pen sheds more
    // for good; today it pays little (one downy of its kind by dusk, one and a half by 10 am: RARE_PAY). Only while
    // one of your pens has no rare one yet (the seventh playtest was offered a second gold clover on days 3 and 5).
    let hunt: Order | null = null;
    if (left >= 4 && rarePenOf(s) >= 0) {
      const open = fresh('rare', this.liveKinds(), (k) => k);
      // (Round 10: with the goal of a rare one of every kind up, a kind you have no rare one of yet comes first.)
      const want = s.goals.includes('prized') && !s.goals.includes('rares') ? this.rareKinds() : null;
      const rk = this.pickWeighted(open, (k) => (1 + this.stale(k, 'rare')) * (live && k === live.kind && open.length > 1 ? 0.3 : 1) * (want && !want.includes(k) ? 4 : 1));
      const spots = SIGHTINGS.map((q, i) => ({ q, i })).filter((o) => o.q.kind === rk);
      const by = rk ? when('rare', rk, live?.by === ORDER_MORN || first?.by === ORDER_MORN ? ORDER_BY : coin()) : null;
      if (rk && spots.length && by !== null) {
        // Never where it was seen the morning before, and a place not seen lately more often (the sixth playtest's
        // came up at the same landmark two mornings running, twice).
        const ago = (i: number) => {
          for (let j = s.orderLog.length - 1; j >= 0; j--) if (s.orderLog[j].rare && s.orderLog[j].spot === i) return s.day - s.orderLog[j].day;
          return 6;
        };
        const at = this.pickWeighted(spots, (o) => (ago(o.i) <= 1 ? 0 : Math.min(6, ago(o.i)))) ?? spots[Math.floor(this.rand() * spots.length) % spots.length];
        // (Never more than half the day's trip: a brook's worth beside a trip of two clovers paid more than the trip.)
        const trip = live ? live.n * live.pay : LIVE_EACH[rk] * 3;
        const pay = Math.max(5, Math.min(Math.round((LIVE_EACH[rk] * (by === ORDER_MORN ? RARE_PAY.morn : RARE_PAY.dusk)) / 5) * 5, Math.round(trip / 2 / 5) * 5));
        hunt = add({ kind: rk, live: true, n: 1, got: 0, paid: 0, mult: 2, pay, state: 'offer', rare: { spot: at.i }, by });
      }
    }
    // Always three to choose from (the eighth playtest's day 3 had two): with no hunt, a second fluff order (another
    // kind you keep if you keep two, else the same kind on the other deadline), or else a second trip.
    if (!hunt && out.length < 3) {
      let third: Order | null = null;
      const second = [...ordered.filter((q) => q.kind !== first?.kind && q.kind !== 'thistle'), ...ordered.filter((q) => q.kind === first?.kind && q.kind !== 'thistle')];
      // (Another kind than the first's first, and of those, one not offered on the last two mornings.)
      second.sort((a, b) => (a.kind === first?.kind ? 1 : 0) - (b.kind === first?.kind ? 1 : 0) || (ago('fluff', b.kind) > OFFER_GAP ? 1 : 0) - (ago('fluff', a.kind) > OFFER_GAP ? 1 : 0));
      for (const c of second) {
        const by = when('fluff', c.kind, first?.by === ORDER_MORN ? NIGHT : ORDER_MORN);
        if (by === null) continue;
        third = add(fluff(c, false, by));
        if (third) break;
      }
      if (!third && live && left >= 6) {
        for (const lk of [...this.liveKinds()].sort((a, b) => (a === live!.kind ? 1 : 0) - (b === live!.kind ? 1 : 0) || (ago('live', b) > OFFER_GAP ? 1 : 0) - (ago('live', a) > OFFER_GAP ? 1 : 0))) {
          const by = when('live', lk, live.by === ORDER_MORN ? NIGHT : ORDER_MORN);
          if (by === null) continue;
          const n = Math.max(2, Math.min(5, Math.round(((plain || LIVE_EACH[lk] * 2) * LIVE_OVER) / LIVE_EACH[lk])));
          add({ kind: lk, live: true, n, got: 0, paid: 0, mult: 2, pay: tripPay(lk, by), state: 'offer', by, ...night(by) });
          break;
        }
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
      s.orderLog.push({ kind: o.kind, live: !!o.live, day: s.day, ...(o.rare ? { rare: true, spot: o.rare.spot } : {}), ...(o.by !== undefined ? { by: o.by } : {}) });
      this.emit({ t: 'order', kind: o.kind, live: !!o.live, got: 0, n: o.n, state: 'posted', bonus: 0, x: CRATE_X, z: CRATE_Z });
    }
    if (s.orderLog.length > 20) s.orderLog.splice(0, s.orderLog.length - 20);
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
    // (Not past its deadline on its last day: 10 am for a morning one.)
    if (!o || (s.hour >= (o.by ?? ORDER_BY) && (o.until ?? s.day) <= s.day)) return false;
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
    return Math.round(this.rareDaily(i) / 10) * 10;
  }

  /**
   * Coins a day a rare one adds to pen i: one more fluff a meal from each downy in it (PEN_MEALS a day each), at
   * today's prices, up to RARE_EXTRA more fluff a day (round 10).
   */
  rareDaily(i: number): number {
    const s = this.s;
    let v = 0;
    let n = 0;
    for (const d of s.downies) {
      if (d.gone || d.pen !== i) continue;
      v += PEN_MEALS * this.price(d.kind);
      n += PEN_MEALS;
    }
    return n > RARE_EXTRA ? (v / n) * RARE_EXTRA : v;
  }

  /**
   * What a rare one adds over the next few days once penned (round 9: over the rest of the week; round 10: over
   * RARE_DAYS days, as "then 140 more today" on a week's last day read as paying later today): its pen's extra fluff
   * a day (`rareWorth`), capped (RARE_EXTRA), times RARE_DAYS.
   */
  rareWeek(): { coins: number; days: number } {
    return { coins: Math.round((this.rareWorth() * RARE_DAYS) / 10) * 10, days: RARE_DAYS };
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
    // Its condition first (round 8): due by 10 am, by dusk or after dark; the hunt at its set place too.
    // (Round 9: the first order runs to the next day's dusk, so its tag says so: "By dusk" sat beside the line to sleep.)
    const due = (o.by ?? ORDER_BY) === ORDER_MORN ? '10 am' : (o.until ?? this.s.day) > this.s.day ? 'dusk tomorrow' : 'dusk';
    const night = o.from !== undefined;
    if (o.rare) {
      const r = RARE_NAME[o.kind];
      // What it is worth once penned, as a number (the seventh playtest read "Its pen sheds more." and picked the
      // biggest pay), over the rest of the week rather than "a day" (round 9: "140 a day" against a one-off 255 read as
      // the obvious pick, whatever the days left).
      const w = this.rareWeek();
      return { title: `${r[0].toUpperCase()}${r.slice(1)}, by ${due}`, note: w.coins > 0 ? `By ${SIGHTINGS[o.rare.spot].name}. Pays ${fmtCoins(o.pay)}, then ${fmtCoins(w.coins)} over ${w.days} days` : `By ${SIGHTINGS[o.rare.spot].name}. Pays ${fmtCoins(o.pay)}, and stays` };
    }
    // (Round 9: "Caught today, after dark" read as "catch them after dark".)
    if (o.live) return { title: `${o.n} ${name} downies`, note: night ? `Caught today. Sell after 9 pm. Pays ${fmtCoins(o.n * o.pay)}` : `Caught by ${due}. Pays ${fmtCoins(o.n * o.pay)}` };
    return { title: `${o.n} ${name} fluff`, note: `${night ? 'Sell after 9 pm' : `By ${due}`}. Pays ${fmtCoins(o.pay)} on top of sales` };
  }

  /** Each half second: the first order once the lessons bring orders in, the morning's offers, and dusk closing what is left. */
  private tickOrders(): void {
    const s = this.s;
    if (!this.knows('orders')) return;
    if (s.orderDay === 0) this.postFirst();
    this.postOrders();
    // An order goes at its deadline on its last day (dusk, or 10 am for a morning one): the day it was posted (the
    // first order, the next day).
    const over = (o: Order) => {
      const until = o.until ?? s.orderDay;
      return s.day > until || (s.day === until && s.hour >= (o.by ?? ORDER_BY));
    };
    for (const o of s.orders) {
      if (o.state !== 'open' || !over(o)) continue;
      o.state = 'missed';
      this.emit({ t: 'order', kind: o.kind, live: !!o.live, got: o.got, n: o.n, state: 'missed', bonus: 0, x: CRATE_X, z: CRATE_Z });
      // A hunt that ran out: the rare one goes with it.
      if (o.rare) for (const d of s.downies) if (!d.gone && d.rare && !d.tame && d.kind === o.kind) d.gone = true;
    }
    // Offers nobody took go when their deadline passes (a morning one at 10 am, the rest at dusk).
    const going = (o: Order) => o.state === 'offer' && over(o);
    if (s.orders.some(going)) s.orders = s.orders.filter((o) => !going(o));
    if (s.hour >= ORDER_BY || s.hour < ORDER_POST[0]) {
      // And so does the rare one at dusk, if it was not caught.
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
    if (this.knows('orders') && this.offers().length) consider({ kind: 'board', id: 0, label: 'Price board', x: BOARD.x, y: this.phys.floor(BOARD.x, BOARD.z) + 1.6, z: BOARD.z }, USE_REACH);
    if (this.knows('bench')) consider({ kind: 'bench', id: 0, label: 'Workbench', x: WORKBENCH.x, y: this.phys.floor(WORKBENCH.x, WORKBENCH.z) + 1.4, z: WORKBENCH.z }, BENCH_REACH);
    if (this.knows('sleep') && Sim.sleepTime(s.hour)) consider({ kind: 'door', id: 0, label: 'Front door', x: DOOR.x, y: this.phys.floor(DOOR.x, DOOR.z) + 1.4, z: DOOR.z }, USE_REACH);
    for (const g of Object.keys(GATES) as GateId[]) {
      if (s.gates[g] || !this.knows('gates')) continue;
      const gt = GATES[g];
      const side = g === 'ridge' ? 1 : -1;
      consider({ kind: 'gate', id: g, label: `Gate to ${gt.name}`, x: gt.x + side * 0.6, y: this.phys.floor(gt.x, gt.z) + 1.5, z: gt.z }, USE_REACH);
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
    // (Round 10: a bare garden with nothing to buy or plant hangs no tags, so it offers none.)
    if (pad.kind === 'garden') return this.menu({ kind: 'pad', id: i } as Interactable).length > 0;
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
        // (Round 10: food in it that nobody in the pen eats says how to get it out: a Pull at the top.)
        if (pad.ups.includes('feeder')) {
          const n = feederTotal(pad.feeder);
          const stale = n > 0 && feederFoods(pad.feeder).some((q) => !s.downies.some((d) => !d.gone && d.pen === i && eats(d.kind, q.t))) && s.downies.some((d) => !d.gone && d.pen === i);
          out.push({ id: 'info', title: n ? `Feeder: ${n}` : 'Feeder empty', price: null, ok: false, note: stale ? 'Pull at the top to empty it' : 'Blow food in at the top' });
        }
      } else if (pad.kind === 'garden') {
        // The feed run hangs only where it would reach a pen with a feeder, the next plot on the row (the fourth
        // playtest's hung beside no pen at all, a 300 coin trap).
        if (this.upKnown('garden')) for (const u of GARDEN_UPS) if (!pad.ups.includes(u.id) && (u.id !== 'run' || (this.upKnown('run') && this.runNeighbours(i).length > 0))) out.push({ id: `garden:${u.id}`, title: u.name, price: u.cost, ok: can(u.cost), note: u.line });
        // (Round 10: no "Bed is empty" tag, which only told you what the bare bed shows: with three kinds kept it was a
        // seventh tag, and "Plant dewberries" never hung, as six is all a post hangs.)
        if (pad.crop) out.push({ id: 'garden:clear', title: 'Pull the crop', price: null, ok: true, note: 'Then blow in something new' });
        // Round 8: the food of each kind you keep, sown with a tap, so a new kind's food is a garden away the day you
        // bring it home (the eighth playtest ran 87 s to the ridge for 9 wild sweetroots).
        if (this.knows('lesson:plant')) for (const f of this.sowable()) if (pad.crop !== f) out.push({ id: `garden:sow:${f}`, title: `Plant ${thingName(f, 2)}`, price: null, ok: true, note: pad.crop ? `In place of the ${thingName(pad.crop, 2)}` : 'Grows from today' });
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
        out.push({ id: `order:${i}`, title: tg.title, price: null, ok: s.hour < (o.by ?? ORDER_BY), note: tg.note });
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
    // (The first colon splits: "garden:sow:sweetroot" is the garden's "sow:sweetroot".)
    const cut = id.indexOf(':');
    const a = cut < 0 ? id : id.slice(0, cut);
    const b = cut < 0 ? '' : id.slice(cut + 1);
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
      if (b.startsWith('sow:')) {
        const f = b.slice(4) as Food;
        if (!this.sowable().includes(f)) return false;
        s.pads[i].crop = f;
        s.pads[i].grow = 0;
        this.emit({ t: 'plant', pad: i, food: f });
        this.complete('plant');
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
