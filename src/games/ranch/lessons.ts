// Thistledown teaches itself one thing at a time. A new ranch starts with only
// the view, walking and looking; each lesson brings in one control or system,
// shows one short line on the journal page and points at the spot in the
// world, then waits until you have done it. Anything a lesson has not brought
// in is not on screen (buttons, coins, the clock, slot windows) and not in the
// world (posts, the door, the bench, gate prices, nettlebacks, nightfall).
//
// Lines are eight words or fewer, one action, imperative. Rules are shown in
// the world instead (an arrow, a ring, the favourite food over a head); the
// longer notes live on the pause page.

import { BENCH_UPS, BUILD_COST, FOOD_INFO, GARDEN_HOURS, GOALS, ORDER_BY, ORDER_MORN, PEN_MAX, PEN_UPS, RARE_NAME, eats, fmtCoins, isDowny, isFood, isTuft, wantedFood, type DownyKind, type Food, type GoalId, type Order } from './defs';
import { BED_HALF } from './physics';
import { NOTICE_RUN, RARE_SEEN, padSpots, rareLured, rarePenOf, type Ev, type Getaway } from './sim';
import { slotCap, type Downy, type Item, type RanchState } from './state';
import { BERRY_BUSHES, BOARD, CLOVER_PATCHES, CRATES, DOOR, GATES, PADS, PEN_R, POND, RANCH_GATE, RIDGE_TOP, ROOT_PATCHES, SIGHTINGS, VENTS, WORKBENCH, zoneAt } from './world';

export type Dev = 'touch' | 'mouse' | 'pad';

/** How to word a line: the device, and for the mouse whether it is captured. */
export interface Say {
  dev: Dev;
  locked: boolean;
  lockAvailable: boolean;
}

/** Where to point in the world: an arrow (or a bobbing food) over a spot, and a soft ring on the ground. */
export interface Mark {
  on: boolean;
  icon: 'arrow' | Food;
  x: number;
  y: number;
  z: number;
  /** Ring centre and radius; r 0 for no ring. */
  rx: number;
  rz: number;
  r: number;
  /** The ring's height above the ground: 0 drapes it on the ground; more rings a thing up there (round 9: the feeder's hopper, not the post's foot). */
  ry?: number;
  /** A slot window on the bellows to point at, or -1. */
  slot: number;
}

type Floor = (x: number, z: number) => number;
type N = (k: string) => number;

interface Lesson {
  id: string;
  /** Lessons that must be finished first. */
  after: string[];
  /** Features this lesson brings in when it starts. */
  unlocks: string[];
  /** Features it brings in once finished. */
  then?: string[];
  /** Takes over from the lesson on screen when it becomes ready. */
  urgent?: boolean;
  /**
   * Cuts in at once over any lesson, urgent ones and a ticked line too, then hands back (round 8: the first pull
   * back came under "Tap Jump to hop over bumps." and the hunt's lines, and its own line first showed at the fifth catch).
   */
  cut?: boolean;
  /** Comes back whenever it applies again (a downy out of its pen); never counted as learned. */
  repeat?: boolean;
  /** The hanging tag it teaches: chosen for you when that post's tags come down. */
  tag?: string;
  ready(s: RanchState, n: N): boolean;
  /** The line now. A lesson with steps words each one from the ranch as it stands. */
  text(say: Say, s?: RanchState): string;
  /** Every other line it can show, for checks of length and wording. */
  also?(say: Say): string[];
  /** Runs every frame while it is on screen (dt: seconds this frame). */
  each?(s: RanchState, dt: number): void;
  done(s: RanchState, n: N): boolean;
  /** The moment passed without it being done (night fell before you slept): it leaves quietly, not learned, and comes back the next time it applies. */
  lapse?(s: RanchState): boolean;
  /** Runs when it comes on screen. */
  start?(s: RanchState): void;
  /** Point at something. Return false for nothing to point at. */
  mark?(s: RanchState, m: Mark, floor: Floor): boolean;
  /** A longer note for the pause page, once learned. */
  note?: string;
}

// ---------------------------------------------------------------- helpers

const kinds = (s: RanchState) => s.slots.reduce((a, q) => a + (q.t ? 1 : 0), 0);
const carrying = (s: RanchState, f: (t: NonNullable<RanchState['slots'][0]['t']>) => boolean) => s.slots.some((q) => q.t !== null && q.n > 0 && f(q.t));
const dist = (s: RanchState, x: number, z: number) => Math.hypot(s.player.x - x, s.player.z - z);

function nearestDowny(s: RanchState, ok: (d: Downy) => boolean, max = 1e9): Downy | null {
  let best: Downy | null = null;
  let bd = max;
  for (const d of s.downies) {
    if (d.gone || !ok(d)) continue;
    const dd = dist(s, d.x, d.z);
    if (dd < bd) {
      bd = dd;
      best = d;
    }
  }
  return best;
}

/** The nearest pad of a kind (or with a test), by its centre. */
function nearestPad(s: RanchState, ok: (i: number) => boolean): number {
  let best = -1;
  let bd = 1e9;
  for (let i = 0; i < PADS.length; i++) {
    if (!ok(i)) continue;
    const d = dist(s, PADS[i].x, PADS[i].z);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

const porch = (s: RanchState) => nearestDowny(s, (d) => d.keep) ?? nearestDowny(s, () => true, 12);

/** Your loose clover downies work up an appetite, so they eat as soon as food lands near them, but never starve while a lesson waits on them. */
function appetite(s: RanchState): void {
  for (const d of s.downies) if (!d.gone && (d.tame || d.keep) && d.pen < 0 && d.kind === 'clover') d.hunger = Math.min(0.8, Math.max(d.hunger, 0.62));
}

/** Before the feeding lesson, your downy's hunger waits: it is not hungry yet when that lesson comes. */
function rested(s: RanchState): void {
  for (const d of s.downies) if (!d.gone && (d.tame || d.keep)) d.hunger = Math.min(d.hunger, 0.3);
}

/** While a lesson leans on your loose downies, none of them goes past hungry into starving. */
function noStarving(s: RanchState): void {
  for (const d of s.downies) if (!d.gone && (d.tame || d.keep) && d.pen < 0) d.hunger = Math.min(d.hunger, 0.8);
}

/**
 * A lesson sending you to the garden never sends you to an empty bed: the nearest clover bed ripens. (Round 9: only
 * crops still on a bed count as lying there; a head that rolled off into the lane kept the bed from ripening, and the
 * first-fifteen-minutes player stood by a bare bed for 45 s at a time while the feeder lesson said to pull from it.)
 */
function ripen(s: RanchState, food: Food = 'cloverhead'): void {
  const lying = s.items.some((it) => !it.gone && it.type === food && it.src >= 1000 && onBed(it));
  if (lying) return;
  const g = s.pads.findIndex((p) => p.kind === 'garden' && p.crop === food);
  if (g >= 0) s.pads[g].grow = Math.max(s.pads[g].grow, 1 - 0.05 / GARDEN_HOURS);
}

/** A garden's crop still lying on its bed. */
const onBed = (it: Item) => {
  const p = PADS[it.src - 1000];
  return !!p && Math.abs(it.x - p.x) < BED_HALF + 0.3 && Math.abs(it.z - p.z) < BED_HALF + 0.3;
};

/** Is a plot on the same row as one of this kind, next to it (where a feed run reaches)? */
const besideA = (s: RanchState, i: number, kind: string) => [i - 1, i + 1].some((j) => j >= 0 && j < s.pads.length && Math.floor(j / 3) === Math.floor(i / 3) && s.pads[j].kind === kind);

/**
 * The empty plot to build a pen on: one beside a garden on its row first (a
 * feed run reaches only the next plot on the row, and the fourth playtest's
 * first pen went across the lane from the starter garden), else the nearest.
 */
function plotForPen(s: RanchState): number {
  const beside = nearestPad(s, (i) => s.pads[i].kind === 'empty' && besideA(s, i, 'garden'));
  return beside >= 0 ? beside : nearestPad(s, (i) => s.pads[i].kind === 'empty');
}

/** The empty plot to build a garden on: one beside a pen first, else the nearest. */
function plotForGarden(s: RanchState): number {
  const beside = nearestPad(s, (i) => s.pads[i].kind === 'empty' && besideA(s, i, 'pen'));
  return beside >= 0 ? beside : nearestPad(s, (i) => s.pads[i].kind === 'empty');
}

/** Your downies (tame or the porch one), not gone. */
const mine = (d: Downy) => !d.gone && (d.tame || d.keep);

/** How many downies are in pen i. */
const penCount = (s: RanchState, i: number) => s.downies.reduce((a, d) => a + (!d.gone && d.pen === i ? 1 : 0), 0);

/** The nearest pen with room for another downy (fewer than ten), or -1. */
const penWithRoom = (s: RanchState, not = -1) => nearestPad(s, (i) => i !== not && s.pads[i].kind === 'pen' && penCount(s, i) < PEN_MAX);

/** The fullest pen, and how many are in it. */
function fullest(s: RanchState): { pad: number; n: number } {
  let pad = -1;
  let n = 0;
  s.pads.forEach((p, i) => {
    if (p.kind !== 'pen') return;
    const c = penCount(s, i);
    if (c > n) {
      n = c;
      pad = i;
    }
  });
  return { pad, n };
}

/** A wild downy pulling back against you now, or puffing up to (back), or in a fight with you at all. */
const fighting = (s: RanchState, back: boolean) => s.downies.some((d) => !d.gone && !d.tame && !d.keep && (d.back > 0 || d.tell > 0 || (!back && (d.strain > 0 || d.easeT > 0))));

/** The sell crate to point at: the nearer of the two (round 8: one by the house, one in the lane between the pens). */
function crateFor(s: RanchState): { x: number; z: number } {
  return CRATES.reduce((a, c) => (dist(s, c.x, c.z) < dist(s, a.x, a.z) ? c : a), CRATES[0]);
}


/**
 * A pen actually crowded: more than ten in it (round 9: "Keep ten or fewer downies in a pen." stayed up all day while
 * the jar carried five embers for an after-dark order, the pen at six). The posts' counts ("8 of 10") come in quietly
 * from eight, so the world says it before it bites.
 */
function crowding(s: RanchState): boolean {
  return fullest(s).n > PEN_MAX;
}
/** A pen near the limit (eight in it): the posts' count tags hang, with no line. */
const nearLimit = (s: RanchState) => fullest(s).n >= 8;

/** A thistle of yours behind a low fence (in the pen, or loose having hopped out of it): the pen, or -1. */
function lowThistlePen(s: RanchState): number {
  for (const d of s.downies) {
    if (d.gone || !d.tame || d.kind !== 'thistle') continue;
    const pen = d.pen >= 0 ? d.pen : d.strayFrom;
    if (pen >= 0 && s.pads[pen]?.kind === 'pen' && !s.pads[pen].ups.includes('high')) return pen;
  }
  return -1;
}

/** A pen with a high fence and room. */
const highPen = (s: RanchState) => nearestPad(s, (i) => s.pads[i].kind === 'pen' && s.pads[i].ups.includes('high') && penCount(s, i) < PEN_MAX);

/**
 * The pen post to point at for a high fence: a low pen a thistle of yours is
 * in (or hopped out of), or, with a thistle in the jar and no high pen to put
 * it in, the pen it would go to (taught as soon as you catch one, before it is
 * penned: the fourth playtest's two thistles left a low pen in about seven
 * seconds, before the tester reached the post). -1 for none.
 */
function fencePost(s: RanchState): number {
  const low = lowThistlePen(s);
  if (low >= 0) return low;
  if (!carrying(s, (t) => t === 'thistle') || highPen(s) >= 0) return -1;
  const room = penWithRoom(s);
  return room >= 0 ? room : nearestPad(s, (i) => s.pads[i].kind === 'pen');
}

/** Fluff you have blown that is still in the air: a sale is on its way, so the line stays on blowing. */
const blowing = (s: RanchState) => s.items.some((it) => !it.gone && it.blown && it.flyT >= 0 && isTuft(it.type));

/** Fluff lying on the ranch: never a wild downy's out in the meadow, never what is already flying into the crate. */
const ranchFluff = (s: RanchState) => s.items.filter((it) => !it.gone && isTuft(it.type) && zoneAt(it.x, it.z) === 'ranch' && !(it.blown && it.flyT >= 0));

/** The fluff to point at: what your downies dropped last, else the nearest on the ranch. */
function fluffToPoint(s: RanchState): Item | null {
  const ids = new Set(s.downies.filter(mine).map((d) => d.id));
  let best: Item | null = null;
  let bd = 1e9;
  for (const it of ranchFluff(s)) {
    // Your own downies' fluff first, the newest of it; then the nearest.
    const score = (ids.has(it.by) ? -1e6 - it.id : 0) + dist(s, it.x, it.z);
    if (score < bd) {
      bd = score;
      best = it;
    }
  }
  return best;
}

/**
 * Where selling stands: blow (fluff is the chosen kind, or a blown one is on
 * its way in), choose (fluff is aboard but another kind is chosen, so Blow
 * would send that), pull (fluff lies on the ranch, or a fed downy of yours is
 * about to drop it) or feed (no fluff anywhere: feed a downy for more).
 */
function sellStep(s: RanchState): 'blow' | 'choose' | 'pull' | 'feed' {
  const chosen = s.slots[s.sel];
  if ((chosen?.t && chosen.n > 0 && isTuft(chosen.t)) || blowing(s)) return 'blow';
  if (carrying(s, isTuft)) return 'choose';
  return ranchFluff(s).length > 0 || s.downies.some((d) => mine(d) && d.shedQ > 0) ? 'pull' : 'feed';
}
/** The nearest of your downies that is hungry enough to eat. */
const hungryOne = (s: RanchState) => nearestDowny(s, (d) => mine(d) && d.hunger > 0.5 && d.drawn === 0);

/**
 * The ranch's loop, where it stands: fluff first (blow, choose or pull it),
 * then a hungry downy (feed it, or fetch food for it), and with everyone fed,
 * catch another downy.
 */
function farmStep(s: RanchState): 'blow' | 'pen' | 'build' | 'choose' | 'pull' | 'feed' | 'food' | 'catch' {
  const sell = sellStep(s);
  if (sell === 'blow') return sell;
  // A downy aboard (a fresh catch): pen it first (the third playtest's line said to catch another
  // with one in the jar). With every pen full, build another.
  if (carrying(s, isDowny)) return penWithRoom(s) >= 0 ? 'pen' : 'build';
  if (sell === 'choose' || sell === 'pull') return sell;
  const d = hungryOne(s);
  if (d) return carrying(s, (t) => isFood(t) && eats(d.kind, t)) ? 'feed' : 'food';
  // (Round 10: catch another only while you keep fewer than three; the tenth playtest was sent out for "another" clover
  // five times, the same 23 s round trip. With three, a downy of yours gets hungry instead: see peckish.)
  if (keptCount(s) >= FARM_HERD) return 'feed';
  return penWithRoom(s) >= 0 || !s.pads.some((p) => p.kind === 'pen') ? 'catch' : 'build';
}
/** Whole turns of the loop the farm lesson waits for (round 10: it was three; each step is taught once, then on). */
export const FARM_CYCLES = 2;
/** Round 10: the loop lesson sends you out for another downy only while you keep fewer than this many. */
export const FARM_HERD = 3;
/** Your downies, penned, loose or in the jar (not the wild ones). */
const keptCount = (s: RanchState) => s.downies.filter(mine).length + s.slots.reduce((a, q) => a + (q.t && isDowny(q.t) ? q.n : 0), 0);
/**
 * Round 10: with three downies kept and nobody hungry, the loop lesson gives the one of yours longest unfed an
 * appetite, so its next step is at home (feed it) rather than another trip out for a downy.
 */
function peckish(s: RanchState): void {
  if (hungryOne(s) || keptCount(s) < FARM_HERD) return;
  let best: Downy | null = null;
  for (const d of s.downies) if (mine(d) && d.drawn === 0 && d.flyT < 0 && (!best || d.hunger > best.hunger)) best = d;
  if (best) best.hunger = Math.max(best.hunger, 0.62);
}
const MEADOW = {
  first: 'Catch a downy out in Clover Meadow.',
  more: 'Catch one more while you are out.',
};

const FARM = {
  pull: 'Pull up the fluff your downies dropped.',
  feed: 'Feed the hungry downy its favourite food.',
  food: 'Pull up food for the hungry downy.',
  catch: 'Catch another downy out in Clover Meadow.',
  pen: 'Blow the downy into a pen.',
};

// (Round 11: there is no line for choosing the fluff: aimed at a crate it is chosen for you, see Sim.autoFluff. "Tap the
// fluff's window" came up twice in the first 2.5 minutes, then again the next day.)
const SELL = {
  blow: 'Blow the fluff into the sell crate.',
  pull: 'Pull up the fluff the downy dropped.',
  feed: 'Feed the downy again for more fluff.',
};
/** Today's live order for downies (not the rare one), open and not yet filled. */
const liveOrder = (s: RanchState) => s.orders.find((o) => o.state === 'open' && o.live && !o.rare && o.got < o.n) ?? null;
/** Today's rare order, open and not yet filled. */
export const rareOrder = (s: RanchState): Order | null => s.orders.find((o) => o.state === 'open' && o.rare && o.got < o.n) ?? null;

/** A downy aboard that an order wants: one of its kind caught today (or, for the rare order, the rare one caught today). */
function wantedAboard(s: RanchState, o: Order): boolean {
  return s.slots.some((q) => q.t === o.kind && q.n > 0 && (q.downs ?? []).some((d) => d.c === s.day && (!o.rare || !!d.rare)));
}

/** A live order: catch a downy of its kind, or blow the one aboard (caught today) into the crate. */
function liveStep(s: RanchState): 'catch' | 'blow' {
  const o = liveOrder(s);
  return o && wantedAboard(s, o) ? 'blow' : 'catch';
}

/** The board's rare one, wild and out where it was seen. */
const rareWild = (s: RanchState) => s.downies.find((q) => !q.gone && q.rare && !q.tame) ?? null;
/** The board's rare one caught today and out of the jar, not yet in a pen (flying from a blow, or loose). */
const rareCaught = (s: RanchState) => s.downies.find((q) => !q.gone && q.rare && q.tame && q.pen < 0 && q.caught === s.day) ?? null;

/**
 * The rare hunt, where it stands: find it from the clue (no arrow until you are
 * close), fetch its favourite food, blow some near it to lure it, walk up and
 * pull it in while it is lured, then blow it into a pen.
 */
export function rareStep(s: RanchState): 'find' | 'fetch' | 'lure' | 'pull' | 'pen' {
  const o = rareOrder(s);
  if (o && wantedAboard(s, o)) return 'pen';
  // Caught today and blown out of the jar: on its way into a pen (round 9: "Find the rose ember by the crag." showed
  // while it flew into the pen), or loose on the ground, to pull in again.
  const mine = rareCaught(s);
  if (o && mine) return mine.flyT >= 0 ? 'pen' : 'pull';
  const d = rareWild(s);
  if (!d || (!o?.rare?.seen && dist(s, d.x, d.z) > RARE_SEEN)) return 'find';
  if (rareLured(d)) return 'pull';
  return carrying(s, (t) => t === wantedFood(d.kind)) ? 'lure' : 'fetch';
}

/** "the gold clover", for the rare order's lines. */
const rareName = (o: Order) => `the ${RARE_NAME[o.kind]}`;
const foods = (o: Order) => FOOD_INFO[wantedFood(o.kind)].plural;

const RARE = {
  find: (o: Order) => `Find ${rareName(o)} by ${SIGHTINGS[o.rare!.spot].name}.`,
  fetch: (o: Order) => `Bring ${foods(o)} to lure it.`,
  lure: (o: Order) => `Blow ${foods(o)} near it.`,
  pull: (q: Say) => (q.dev === 'touch' ? 'Walk up and hold Pull on it.' : q.dev === 'pad' ? 'Walk up and hold LT on it.' : 'Walk up and hold right click on it.'),
  pen: (o: Order) => `Blow ${rareName(o)} into a pen.`,
};

/** The rare hunt's line now. */
function rareLine(s: RanchState, o: Order, q: Say): string {
  const step = rareStep(s);
  return step === 'find' ? RARE.find(o) : step === 'fetch' ? RARE.fetch(o) : step === 'lure' ? RARE.lure(o) : step === 'pull' ? RARE.pull(q) : RARE.pen(o);
}

/** Where a food grows: the nearest garden growing it, or wild patch of it. */
function foodSpot(s: RanchState, f: Food): { x: number; z: number } | null {
  const spots: { x: number; z: number }[] = [];
  s.pads.forEach((p, i) => p.kind === 'garden' && p.crop === f && spots.push(PADS[i]));
  for (const p of f === 'cloverhead' ? CLOVER_PATCHES : f === 'dewberry' ? BERRY_BUSHES : ROOT_PATCHES) spots.push(p);
  let best: { x: number; z: number } | null = null;
  let bd = 1e9;
  for (const p of spots) {
    const d = dist(s, p.x, p.z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/**
 * The rare hunt's marks. Finding it, only a clue: the way to its part of the
 * valley (the ranch gate, its zone's gate), and no arrow inside it until you
 * are close (the sixth playtest's waited under an arrow, so it was no hunt).
 * Close, the arrow is on the downy; fetching food, on where it grows; aboard,
 * on a pen with room (a chevron over its window if another is chosen).
 */
function rareMark(s: RanchState, m: Mark, floor: Floor): boolean {
  const o = rareOrder(s);
  if (!o?.rare) return false;
  const step = rareStep(s);
  if (step === 'pen') {
    if (s.slots[s.sel]?.t !== o.kind) m.slot = s.slots.findIndex((q) => q.t === o.kind && q.n > 0);
    // The pen it adds most to: the fullest with room and no rare one yet, of its own kind first (round 12).
    const best = rarePenOf(s, false, o.kind);
    const i = best >= 0 ? best : penWithRoom(s);
    if (i < 0) return false;
    const p = PADS[i];
    arrow(m, p.x, floor(p.x, p.z) + 2.6, p.z);
    ring(m, p.x, p.z, PEN_R);
    return true;
  }
  const d = rareWild(s) ?? rareCaught(s);
  if (step === 'find') {
    const sp = SIGHTINGS[o.rare.spot];
    const here = zoneAt(s.player.x, s.player.z);
    if (here === zoneAt(sp.x, sp.z)) return false;
    return wayTo(s, m, o.kind, floor);
  }
  if (step === 'fetch') {
    // Its food, where it grows nearest; on the downy again once you are back with some.
    const f = foodSpot(s, wantedFood(o.kind));
    if (!f) return onDowny(m, d);
    return arrow(m, f.x, floor(f.x, f.z) + 2.2, f.z);
  }
  if (step === 'lure') {
    const f = wantedFood(o.kind);
    if (s.slots[s.sel]?.t !== f) m.slot = s.slots.findIndex((q) => q.t === f && q.n > 0);
  }
  return onDowny(m, d);
}

const LIVE = {
  blow: 'Blow the downy into the sell crate.',
  // (Round 8: an order for after dark takes them from 9 pm.)
  later: 'Blow it into the crate after 9 pm.',
  catch: (k: 'clover' | 'ember' | 'brook' | 'thistle') => `Catch ${k === 'ember' ? 'an' : 'a'} ${k} downy for the order.`,
};

/** Where a kind lives: the way there from the ranch (its gate, then its home ground). */
function wayTo(s: RanchState, m: Mark, kind: string, floor: Floor): boolean {
  const z = zoneAt(s.player.x, s.player.z);
  if (z === 'ranch') return arrow(m, RANCH_GATE.x, 6.2, RANCH_GATE.z);
  if (kind === 'ember' && z !== 'ridge') return arrow(m, GATES.ridge.x, floor(GATES.ridge.x, GATES.ridge.z) + 3.6, GATES.ridge.z);
  if (kind === 'brook' && z !== 'hollow') return arrow(m, GATES.hollow.x, floor(GATES.hollow.x, GATES.hollow.z) + 3.6, GATES.hollow.z);
  const home = kind === 'ember' ? VENTS[0] : kind === 'brook' ? ([POND.x - 14, POND.z + 10] as const) : ([-16, -9] as const);
  return arrow(m, home[0], floor(home[0], home[1]) + 3, home[1]);
}

/** A downy of yours, loose (not penned, not in the canister). */
/** One of yours out of a pen (not one on its way into one: the eighth playtest's ticked line read "Pull in the downy." after the blow). */
const loose = (s: RanchState) => nearestDowny(s, (d) => (d.tame || d.keep) && d.pen < 0 && d.flyT < 0);

const FEED = {
  pull: 'Pull clover heads from the garden.',
  feed: 'Feed the downy a clover head.',
  out: 'Blow the downy back out.',
  choose: (q: Say) => (q.dev === 'touch' ? "Tap the clover heads' window to choose them." : q.dev === 'pad' ? 'Press LB or RB to choose clover heads.' : 'Press Q until the clover heads are chosen.'),
};

/**
 * Where feeding stands: pull (no clover heads aboard: fetch some from the
 * garden), choose (aboard, but another kind is chosen), out (the downy is in
 * the jar) or feed.
 */
function feedStep(s: RanchState): 'pull' | 'choose' | 'out' | 'feed' {
  if (!loose(s) && carrying(s, isDowny)) return 'out';
  if (!carrying(s, (t) => t === 'cloverhead')) return 'pull';
  if (s.slots[s.sel]?.t !== 'cloverhead' && s.learn.includes('slots')) return 'choose';
  return 'feed';
}

/** The garden to send you to for food: the nearest with that food lying on it, else the nearest growing it, else the first. */
function gardenFor(s: RanchState, food: Food): number {
  const lying = nearestPad(s, (i) => s.pads[i].kind === 'garden' && s.items.some((it) => !it.gone && it.type === food && it.src === 1000 + i && onBed(it)));
  if (lying >= 0) return lying;
  const growing = nearestPad(s, (i) => s.pads[i].kind === 'garden' && s.pads[i].crop === food);
  return growing >= 0 ? growing : 0;
}

/** The feeding marks: the garden ringed while you have no clover heads, the window to choose, or a clover head over the downy. */
function feedMark(s: RanchState, m: Mark, floor: Floor): boolean {
  const step = feedStep(s);
  if (step === 'out') return false;
  if (step === 'choose') {
    m.slot = s.slots.findIndex((q) => q.t === 'cloverhead' && q.n > 0);
    return false;
  }
  if (step === 'pull') {
    const i = gardenFor(s, 'cloverhead');
    arrow(m, PADS[i].x, floor(PADS[i].x, PADS[i].z) + 2.2, PADS[i].z);
    ring(m, PADS[i].x, PADS[i].z, 3.1);
    return true;
  }
  const d = loose(s);
  if (!d) return false;
  m.icon = 'cloverhead';
  m.x = d.x;
  m.y = d.y + 1.05;
  m.z = d.z;
  m.r = 0;
  return true;
}

/** Your downies that hopped out of a pen and are still loose. */
const strays = (s: RanchState) => s.downies.filter((d) => !d.gone && d.strayFrom >= 0 && d.pen < 0);

/**
 * A downy out of its pen: pull it in (it is loose), then blow it back into a
 * pen (it is in the jar). Done once no stray is loose and a downy has come down
 * in a pen since (or none is aboard): the jar may hold others, caught wild.
 */
function strayStep(s: RanchState): 'pull' | 'blow' | 'other' | null {
  if (strays(s).length) return 'pull';
  const back = (s.learnCount['penned'] ?? 0) > (s.learnCount['stray:penned'] ?? 0);
  if (!carrying(s, isDowny) || back) return null;
  // Its pen is full (it hopped out of a crowd): another pen with room, or nothing to nag about.
  const was = s.learnCount['stray:pen'] ?? -1;
  if (was >= 0 && s.pads[was]?.kind === 'pen' && penCount(s, was) >= PEN_MAX) return penWithRoom(s, was) >= 0 ? 'other' : null;
  return 'blow';
}

const PENIN = {
  pull: 'Pull in the downy.',
  blow: 'Blow the downy into the pen.',
};

const PLANT = {
  blow: 'Blow some food onto the bare soil.',
  fetch: 'Pull food from a garden first.',
};
/** Food aboard, or just blown and still flying (for the planting lesson's line). */
const plantFood = (s: RanchState) => carrying(s, isFood) || s.items.some((it) => !it.gone && it.blown && it.flyT >= 0 && isFood(it.type));

const STRAY = {
  pull: 'Pull in the downy that got out.',
  blow: 'Blow the downy into the pen.',
  other: 'Blow the downy into another pen.',
  // (Round 11: on a full jar it said to pull, and the pull's refusal said "No window free.": the two fought. Now the line says what the note does.)
  room: (q: Say) => (q.dev === 'touch' ? 'Hold a window to empty it.' : q.dev === 'pad' ? 'Hold LB to empty a window.' : 'Hold Q to empty a window.'),
};
/** Is there a window for this kind of downy (its own with room, or an empty one)? */
const jarTakes = (s: RanchState, k: DownyKind) => s.slots.some((q) => q.t === k && q.n < slotCap(s, q)) || s.slots.some((q) => q.t === null);
/** A stray with no window to come into. */
const strayNoRoom = (s: RanchState) => {
  const d = nearestDowny(s, (q) => q.strayFrom >= 0 && q.pen < 0);
  return !!d && !jarTakes(s, d.kind);
};

/** The pen with a feeder to fill: the nearest. */
const feederPad = (s: RanchState) => nearestPad(s, (i) => s.pads[i].kind === 'pen' && s.pads[i].ups.includes('feeder'));

/** The food that pen's downies want (clover heads with nobody in it yet). */
function feederFood(s: RanchState, i: number): Food {
  const d = s.downies.find((q) => !q.gone && q.pen === i);
  return d ? wantedFood(d.kind) : 'cloverhead';
}

/** Filling a new feeder: fetch the food (pull), choose its window (choose), then blow it in at the top (fill). */
function feederStep(s: RanchState): 'pull' | 'choose' | 'fill' {
  const f = feederFood(s, feederPad(s));
  const chosen = s.slots[s.sel];
  if (chosen?.t === f && chosen.n > 0) return 'fill';
  return carrying(s, (t) => t === f) ? 'choose' : 'pull';
}

const FEEDER = {
  fill: 'Blow food into the feeder.',
  choose: (q: Say) => (q.dev === 'touch' ? "Tap the food's window to choose it." : q.dev === 'pad' ? 'Press LB or RB to choose the food.' : 'Press Q until the food is chosen.'),
  pull: (f: Food) => (f === 'cloverhead' ? FEED.pull : 'Pull food from the garden.'),
};

/** The note under the crosshair when the jar refuses something, worded for the device (eight words or fewer). */
export function fullNote(dev: Dev, noneFree: boolean, windowsKnown: boolean, what = ''): string {
  const how = !windowsKnown ? '' : dev === 'touch' ? ' Hold one to empty it.' : dev === 'pad' ? ' Hold LB to empty one.' : ' Hold Q to empty one.';
  // Its own window is full (round 8: "Window full. Hold one to empty it." came up with three windows empty, and
  // emptying another would not help): say which, and to blow some out.
  if (!noneFree) return `${what ? `${what[0].toUpperCase()}${what.slice(1)} window` : 'Window'} full.${windowsKnown ? ' Blow some out.' : ''}`;
  return `No window free.${how}`;
}

/** The ring round a feeder's hopper (m), at the hopper's own height. */
export const HOPPER_RING = 0.62;

/** What a feeder costs: its lesson comes as soon as you can pay. */
const FEEDER_COST = PEN_UPS.find((u) => u.id === 'feeder')!.cost;

/** Steps for the plot lessons: what to tap or press at the post, and which tag to take. */
const plotLine = (q: Say, tag: string) => `${q.dev === 'touch' ? 'Tap Post' : q.dev === 'pad' ? 'Press X' : 'Press E'} at an empty plot, then ${tag}.`;

function arrow(m: Mark, x: number, y: number, z: number): boolean {
  m.icon = 'arrow';
  m.x = x;
  m.y = y;
  m.z = z;
  m.r = 0;
  return true;
}

function ring(m: Mark, x: number, z: number, r: number, y = 0): void {
  m.rx = x;
  m.rz = z;
  m.r = r;
  m.ry = y;
}

function onDowny(m: Mark, d: Downy | null): boolean {
  if (!d) return false;
  arrow(m, d.x, d.y + 1.15, d.z);
  ring(m, d.x, d.z, 0.75);
  return true;
}

function onPost(m: Mark, i: number, floor: Floor, padRing: boolean): boolean {
  if (i < 0) return false;
  const p = padSpots(i).post;
  arrow(m, p.x + 0.9, floor(p.x, p.z) + 2.8, p.z);
  if (padRing) ring(m, PADS[i].x, PADS[i].z, PEN_R);
  return true;
}

/** What the bigger jar costs: the workbench lesson waits for it. */
const JAR_COST = BENCH_UPS.find((u) => u.id === 'cap')!.costs[0];
/** The jar has filled: it has refused something, or a window is full now. */
const jarHasFilled = (s: RanchState, n: N) => n('full') >= 1 || s.slots.some((q) => q.t !== null && q.n >= slotCap(s, q));

/** A pen with room for one more of a kind: one that holds that kind already, or an empty one. */
function penFor(s: RanchState, k: DownyKind): boolean {
  return s.pads.some((p, i) => {
    if (p.kind !== 'pen') return false;
    const here = s.downies.filter((d) => !d.gone && d.pen === i);
    return here.length < PEN_MAX && (!here.length || here.some((d) => d.kind === k));
  });
}

/**
 * Kinds of downy aboard with no pen for them (round 10): not those an open order wants (caught today for the crate,
 * or the rare one for its pen), and not thistles (the high fence line has those).
 */
export function homeless(s: RanchState): DownyKind[] {
  const out: DownyKind[] = [];
  const live = liveOrder(s);
  for (const q of s.slots) {
    if (!q.t || !isDowny(q.t) || q.n <= 0 || q.t === 'thistle' || out.includes(q.t)) continue;
    const k = q.t;
    const spare = (q.downs ?? [{ h: 0, c: 0 }]).some((r) => !r.rare && !(live && live.kind === k && r.c === s.day));
    if (spare && !penFor(s, k)) out.push(k);
  }
  return out;
}

const KIND_PLURAL: Record<DownyKind, string> = { clover: 'clovers', ember: 'embers', brook: 'brooks', thistle: 'thistles' };
const HOME = {
  build: (k: DownyKind) => `Build a pen for your ${KIND_PLURAL[k]}.`,
  save: (k: DownyKind, coins: number) => `Save for ${k === 'ember' ? 'an' : 'a'} ${k} pen, ${fmtCoins(coins)} of ${fmtCoins(BUILD_COST.pen)}.`,
  // (Round 12: and then into it. With the ember pen bought at 18:23, "Sleep at the front door" took the page with two embers aboard.)
  blow: (k: DownyKind) => `Blow the ${KIND_PLURAL[k]} into the pen.`,
};
const HOME_KINDS: DownyKind[] = ['clover', 'ember', 'brook', 'thistle'];
/** Round 12: the kind the home lesson is about, while it is up (-1: none yet). */
const homeKind = (s: RanchState): DownyKind | null => HOME_KINDS[s.learnCount['home:kind'] ?? -1] ?? null;
/** Its pen built, they are still aboard: the pen step. */
const homePenStep = (s: RanchState) => {
  const k = homeKind(s);
  return !!k && !homeless(s).length && s.slots.some((q) => q.t === k && q.n > 0) && penFor(s, k);
};
/** Seconds the pen step waits for them before the line goes quietly (it is urgent, and must not hold the evening's lines for good). */
const HOME_PEN_WAIT = 45;
function homeLine(s?: RanchState): string {
  if (s && homePenStep(s)) return HOME.blow(homeKind(s)!);
  const k = s ? (homeless(s)[0] ?? 'ember') : 'ember';
  if (s && oneMoreOf(s)) return MEADOW.more;
  return !s || s.coins >= BUILD_COST.pen ? HOME.build(k) : HOME.save(k, s.coins);
}
/** The pen they go in: the nearest with room that is for their kind, or an empty one. */
function homePen(s: RanchState, k: DownyKind): number {
  return nearestPad(s, (i) => s.pads[i].kind === 'pen' && penCount(s, i) < PEN_MAX && (penCount(s, i) === 0 || penKinds(s, i).includes(k)));
}
/**
 * Round 11: out where it lives with just the one aboard, and another near: one more first, as a first clover asks (the
 * eleventh playtest's first ember brought "Build a pen for your embers." at once, 12 s from home). The downy to go for, or null.
 */
function oneMoreOf(s: RanchState): Downy | null {
  if (zoneAt(s.player.x, s.player.z) === 'ranch') return null;
  const k = homeless(s)[0];
  if (!k || s.slots.reduce((a, q) => a + (q.t === k ? q.n : 0), 0) !== 1) return null;
  return nearestDowny(s, (d) => !d.tame && !d.keep && !d.rare && d.kind === k, 26);
}

// ---------------------------------------------------------------- the lessons

const LESSONS: Lesson[] = [
  {
    id: 'look',
    after: [],
    unlocks: [],
    ready: () => true,
    text: (q) =>
      q.dev === 'touch'
        ? 'Drag on the right to look around.'
        : q.dev === 'pad'
          ? 'Use the right stick to look around.'
          : q.locked
            ? 'Move the mouse to look around.'
            : q.lockAvailable
              ? 'Click the view to look around.'
              : 'Right-drag to look around.',
    done: (_s, n) => n('look') >= 0.6,
  },
  {
    id: 'walk',
    after: ['look'],
    unlocks: [],
    ready: () => true,
    text: (q) => (q.dev === 'touch' ? 'Walk to the downy with your left thumb.' : q.dev === 'pad' ? 'Walk to the downy with the left stick.' : 'Walk to the downy with WASD.'),
    // (Round 9: walking from 3.5 m to 2.2 m did not tick it, as it wanted 0.6 s of walking: any walk that ends by it does.)
    done: (s, n) => {
      const d = porch(s);
      return n('walk') >= 0.15 && (!d || dist(s, d.x, d.z) < 3.4);
    },
    each: rested,
    mark: (s, m) => onDowny(m, porch(s)),
  },
  {
    id: 'draw',
    after: ['walk'],
    unlocks: ['bellows', 'draw'],
    ready: () => true,
    text: (q) => (q.dev === 'touch' ? 'Aim at the downy and hold Pull.' : q.dev === 'pad' ? 'Aim at the downy and hold LT.' : 'Aim at the downy and hold right click.'),
    done: (_s, n) => n('catch') >= 1,
    each: rested,
    mark: (s, m) => onDowny(m, porch(s)),
    note: 'Pull brings in downies, food and fluff. Wild downies tug back.',
  },
  {
    id: 'puff',
    after: ['draw'],
    unlocks: ['puff'],
    ready: () => true,
    text: (q) => (q.dev === 'touch' ? 'Tap Blow to send it back out.' : q.dev === 'pad' ? 'Press RT to blow it back out.' : 'Click to blow it back out.'),
    done: (_s, n) => n('puff') >= 1,
    each: rested,
    note: 'Blow sends out one of whatever is chosen.',
  },
  {
    id: 'feed',
    after: ['puff'],
    unlocks: ['pause'],
    ready: () => true,
    // In steps: fetch clover heads from the garden (it points there), then feed the downy (a clover head over it).
    text: (q, s) => {
      const step = s ? feedStep(s) : 'feed';
      return step === 'choose' ? FEED.choose(q) : FEED[step];
    },
    also: (q) => [FEED.pull, FEED.out, FEED.choose(q)],
    done: (_s, n) => n('feed') >= 1,
    start: appetite,
    each: (s) => {
      appetite(s);
      if (feedStep(s) === 'pull') ripen(s);
    },
    mark: feedMark,
    note: 'Each kind loves one food. Its favourite makes double fluff.',
  },
  {
    id: 'sell',
    after: ['feed'],
    unlocks: [],
    then: ['coins'],
    ready: () => true,
    // Feeding drops fluff on the ground; the line follows each step from there.
    text: (_q, s) => {
      const step = s ? sellStep(s) : 'blow';
      if (step === 'feed') return s && feedStep(s) === 'pull' ? FEED.pull : SELL.feed;
      return step === 'choose' ? SELL.blow : SELL[step];
    },
    also: () => [SELL.pull, SELL.feed, FEED.pull],
    // Only fluff you blew in counts: the crate drawing in fluff that fell beside it is not a sale you made.
    done: (_s, n) => n('sell:blown') >= 1,
    each: (s) => {
      noStarving(s);
      if (sellStep(s) === 'feed') {
        appetite(s);
        if (feedStep(s) === 'pull') ripen(s);
      }
    },
    mark: (s, m, floor) => {
      const step = sellStep(s);
      if (step === 'blow' || step === 'choose') {
        const cr = crateFor(s);
        arrow(m, cr.x, floor(cr.x, cr.z) + 2.3, cr.z);
        ring(m, cr.x, cr.z, 1.2);
        return true;
      }
      if (step === 'feed') return feedMark(s, m, floor);
      // The fluff your downy dropped, on the ranch; never a wild one's out in the meadow.
      const it = fluffToPoint(s);
      if (it) return arrow(m, it.x, it.y + 0.9, it.z);
      // Not dropped yet: point at the downy it is coming from.
      return onDowny(m, nearestDowny(s, (d) => mine(d) && d.shedQ > 0));
    },
    note: 'The sell crate buys fluff. Prices change each day.',
  },
  {
    id: 'pen',
    after: ['sell'],
    unlocks: ['pads'],
    ready: () => true,
    tag: 'build:pen',
    text: (q) => plotLine(q, 'Pen'),
    done: (s, n) => n('build:pen') >= 1 || s.pads.some((p) => p.kind === 'pen'),
    // The plot beside the starter garden, so a feed run can reach the first pen.
    mark: (s, m, floor) => onPost(m, plotForPen(s), floor, true),
  },
  {
    // In steps: pull the downy in first if it is loose (the fourth playtest's line said to blow it into the
    // pen while it sat 17 m behind the house and the jar held clover heads), then blow it into the pen.
    id: 'penin',
    after: ['pen'],
    unlocks: [],
    ready: () => true,
    text: (_q, s) => (s && !carrying(s, isDowny) && loose(s) ? PENIN.pull : PENIN.blow),
    also: () => [PENIN.pull, PENIN.blow],
    done: (s) => s.downies.some((d) => !d.gone && d.pen >= 0),
    mark: (s, m, floor) => {
      const i = nearestPad(s, (k) => s.pads[k].kind === 'pen');
      if (i < 0) return false;
      const p = PADS[i];
      if (!carrying(s, isDowny) && loose(s)) {
        // Pull it in: the arrow on the downy.
        onDowny(m, loose(s));
        return true;
      }
      // Aboard: the pen, and a chevron over its window if another is chosen.
      const sel = s.slots[s.sel];
      if (!(sel?.t && isDowny(sel.t))) m.slot = s.slots.findIndex((q) => q.t !== null && q.n > 0 && isDowny(q.t));
      arrow(m, p.x, floor(p.x, p.z) + 2.6, p.z);
      ring(m, p.x, p.z, PEN_R);
      return true;
    },
    note: 'Calm downies stay in a pen. Frazzled ones hop out.',
  },
  {
    id: 'slots',
    after: ['puff'],
    unlocks: ['slots'],
    urgent: true,
    ready: (s) => kinds(s) >= 2,
    text: (q) => (q.dev === 'touch' ? 'Tap a window to switch what you blow.' : q.dev === 'pad' ? 'Press LB or RB to switch kinds.' : 'Roll the wheel or press Q to switch.'),
    done: (_s, n) => n('slot') >= 1,
    note: 'Each window holds one kind. The chosen one blows.',
  },
  {
    id: 'meadow',
    after: ['penin'],
    unlocks: [],
    // Your downies' hunger runs again (the loop lesson needs them hungry); the clock waits for the loop to end
    // (the fifth playtest's loop ran from 16:30 through the pests to 2:40 am, and the sleep line lapsed both nights).
    then: ['appetite'],
    ready: () => true,
    // Round 10: two in the one trip (the three wild clovers just past the gate), so the loop has three downies to
    // work with and never sends you out again for "another" (the tenth playtest went out for one five times). Back
    // in the ranch with one, that will do.
    start: (s) => {
      s.learnCount['meadow:from'] ??= s.learnCount['catch:wild'] ?? 0;
    },
    text: (_q, s) => (s && (s.learnCount['catch:wild'] ?? 0) - (s.learnCount['meadow:from'] ?? 0) >= 1 ? MEADOW.more : MEADOW.first),
    also: () => [MEADOW.more],
    done: (s, n) => {
      const got = n('catch:wild') - n('meadow:from');
      return got >= 2 || (got >= 1 && zoneAt(s.player.x, s.player.z) === 'ranch');
    },
    mark: (s, m) => {
      if (zoneAt(s.player.x, s.player.z) === 'ranch') return arrow(m, RANCH_GATE.x, 6.2, RANCH_GATE.z);
      return onDowny(m, nearestDowny(s, (d) => !d.tame && !d.keep, 26));
    },
  },
  {
    // The loop the ranch runs on, taught once the pens and the meadow are known:
    // hungry downies show the food they want, fed ones drop fluff, fluff sells.
    id: 'farm',
    after: ['meadow'],
    unlocks: [],
    // Then the price board's orders begin, and the clock runs on from the held afternoon.
    then: ['orders', 'time'],
    ready: () => true,
    // Count whole turns of the loop from when it first came up (dusk taking over and handing back must
    // not start the count again): a meal you gave, its fluff pulled up and blown into the crate.
    start: (s) => {
      s.learnCount['farm:from'] ??= s.learnCount['cycle'] ?? 0;
    },
    each: (s) => {
      // (Nothing to do but wait for hunger, with three downies: one gets hungry now.)
      if (sellStep(s) === 'feed' && !carrying(s, isDowny)) peckish(s);
      if (farmStep(s) === 'food') {
        const d = hungryOne(s);
        if (d) ripen(s, wantedFood(d.kind));
      }
    },
    text: (q, s) => {
      const step = s ? farmStep(s) : 'feed';
      return step === 'blow' || step === 'choose' ? SELL.blow : step === 'build' ? plotLine(q, 'Pen') : FARM[step];
    },
    also: (q) => [SELL.blow, FARM.pull, FARM.food, FARM.catch, FARM.pen, plotLine(q, 'Pen')],
    done: (_s, n) => n('cycle') - n('farm:from') >= FARM_CYCLES,
    mark: (s, m, floor) => {
      const step = farmStep(s);
      if (step === 'blow' || step === 'choose') {
        const cr = crateFor(s);
        arrow(m, cr.x, floor(cr.x, cr.z) + 2.3, cr.z);
        ring(m, cr.x, cr.z, 1.2);
        return true;
      }
      if (step === 'pen') {
        // The pen with room, and a chevron over the downy's window if it is not chosen.
        const sel = s.slots[s.sel];
        if (!(sel?.t && isDowny(sel.t))) m.slot = s.slots.findIndex((q) => q.t !== null && q.n > 0 && isDowny(q.t));
        const i = penWithRoom(s);
        const p = PADS[i];
        arrow(m, p.x, floor(p.x, p.z) + 2.6, p.z);
        ring(m, p.x, p.z, PEN_R);
        return true;
      }
      if (step === 'build') return onPost(m, plotForPen(s), floor, true);
      if (step === 'pull') {
        const it = fluffToPoint(s);
        if (it) return arrow(m, it.x, it.y + 0.9, it.z);
        return onDowny(m, nearestDowny(s, (d) => mine(d) && d.shedQ > 0));
      }
      if (step === 'feed') {
        const d = hungryOne(s);
        if (!d) return false;
        const f = wantedFood(d.kind);
        // Its food aboard but not chosen: a chevron over that window too.
        if (s.slots[s.sel]?.t !== f) m.slot = s.slots.findIndex((q) => q.t === f && q.n > 0);
        m.icon = f;
        m.x = d.x;
        m.y = d.y + 1.05;
        m.z = d.z;
        m.r = 0;
        return true;
      }
      if (step === 'food') {
        // The nearest garden with that food on it, or growing it, or the first garden.
        const d = hungryOne(s);
        const i = gardenFor(s, d ? wantedFood(d.kind) : 'cloverhead');
        arrow(m, PADS[i].x, floor(PADS[i].x, PADS[i].z) + 2.2, PADS[i].z);
        ring(m, PADS[i].x, PADS[i].z, 3.1);
        return true;
      }
      if (zoneAt(s.player.x, s.player.z) === 'ranch') return arrow(m, RANCH_GATE.x, 6.2, RANCH_GATE.z);
      return onDowny(m, nearestDowny(s, (d) => !d.tame && !d.keep, 26));
    },
    note: 'Hungry downies show the food they want. Fed ones drop fluff.',
  },
  {
    // The day's orders, taught when the first is posted (as soon as the loop lesson ends), pointing at the
    // price board: take one there. Each morning after, the board offers two or three to choose from.
    id: 'order',
    after: ['farm'],
    unlocks: [],
    // It comes when the first order does, over whatever calm lesson is up, and hands back.
    urgent: true,
    tag: 'order:0',
    ready: (s) => s.orders.some((o) => o.state === 'offer'),
    text: () => 'Take an order at the price board.',
    done: (s, n) => n('order:taken') >= 1 || s.orders.some((o) => o.state === 'open' || o.state === 'filled'),
    // The offers went with the day before you took one: it comes back with the next.
    lapse: (s) => !s.orders.some((o) => o.state !== 'missed'),
    mark: (_s, m, floor) => {
      arrow(m, BOARD.x, floor(BOARD.x, BOARD.z) + 2.6, BOARD.z);
      ring(m, BOARD.x, BOARD.z, 1.1);
      return true;
    },
    note: 'Each morning the price board offers orders. Take one.',
  },
  {
    // A live order taken for the first time: catch a downy of its kind, then blow it into the sell crate.
    id: 'live',
    after: ['order'],
    unlocks: [],
    urgent: true,
    ready: (s) => !!liveOrder(s),
    text: (_q, s) => {
      if (!s || liveStep(s) !== 'blow') return LIVE.catch(s ? (liveOrder(s)?.kind ?? 'clover') : 'clover');
      const o = liveOrder(s);
      return o && o.from !== undefined && s.hour < o.from ? LIVE.later : LIVE.blow;
    },
    also: () => [LIVE.blow, LIVE.later, LIVE.catch('clover'), LIVE.catch('ember'), LIVE.catch('brook')],
    done: (_s, n) => n('order:live') >= 1,
    lapse: (s) => !liveOrder(s),
    mark: (s, m, floor) => {
      const o = liveOrder(s);
      if (!o) return false;
      if (liveStep(s) === 'blow') {
        const sel = s.slots[s.sel];
        if (sel?.t !== o.kind) m.slot = s.slots.findIndex((q) => q.t === o.kind && q.n > 0);
        const cr = crateFor(s);
        arrow(m, cr.x, floor(cr.x, cr.z) + 2.3, cr.z);
        ring(m, cr.x, cr.z, 1.2);
        return true;
      }
      // The nearest wild one of its kind, once you are near; else the way to it.
      const d = nearestDowny(s, (q) => !q.tame && !q.keep && q.kind === o.kind, 26);
      if (d) return onDowny(m, d);
      return wayTo(s, m, o.kind, floor);
    },
    note: 'Live orders want downies caught today. Blow them into the sell crate.',
  },
  {
    // The board's rare downy, the first time one is taken: a hunt. Find it from the clue, lure it with its
    // favourite food, walk up and pull it in while it is lured, then blow it into a pen, where it stays.
    id: 'rare',
    after: ['order'],
    unlocks: [],
    urgent: true,
    ready: (s) => !!rareOrder(s),
    text: (q, s) => {
      const o = s ? rareOrder(s) : null;
      if (!s || !o?.rare) return RARE.pull(q);
      return rareLine(s, o, q);
    },
    also: (q) => {
      const any = (i: number): Order => ({ kind: SIGHTINGS[i].kind, n: 1, got: 0, paid: 0, mult: 2, pay: 0, state: 'open', live: true, rare: { spot: i } });
      return [RARE.pull(q), ...SIGHTINGS.flatMap((_sp, i) => [RARE.find(any(i)), RARE.fetch(any(i)), RARE.lure(any(i)), RARE.pen(any(i))])];
    },
    done: (_s, n) => n('order:rare') >= 1,
    lapse: (s) => !rareOrder(s),
    mark: rareMark,
    note: 'A rare downy is warier. Lure it with food.',
  },
  {
    id: 'jump',
    after: ['penin'],
    unlocks: ['jump'],
    urgent: true,
    // Out in the meadow, or just now pushing against something that will not give.
    ready: (s, n) => zoneAt(s.player.x, s.player.z) === 'meadow' || (n('stuckAt') > 0 && n('walk') - n('stuckAt') < 2),
    text: (q) => (q.dev === 'touch' ? 'Tap Jump to hop over bumps.' : q.dev === 'pad' ? 'Press A to jump.' : 'Press Space to jump.'),
    done: (_s, n) => n('jump') >= 1,
  },
  {
    // Running, taught when a wild downy has seen you and hops off (the fifth playtest's walker never closed on a
    // fleeing clover: 8 m off after 20 s; running caught one in 4.4 s).
    id: 'run',
    after: ['jump'],
    unlocks: [],
    urgent: true,
    ready: (s) => zoneAt(s.player.x, s.player.z) !== 'ranch' && s.downies.some((d) => !d.gone && !d.tame && !d.keep && d.alert && dist(s, d.x, d.z) < NOTICE_RUN + 2),
    text: (q) => (q.dev === 'touch' ? 'Push the stick to its rim to run.' : q.dev === 'pad' ? 'Click the left stick to run.' : 'Hold Shift to run.'),
    // Counted from when it comes up: a thumb that hit the stick's rim by chance on the porch has not learned to run.
    start: (s) => {
      s.learnCount['run:from'] = s.learnCount['catch:wild'] ?? 0;
      s.learnCount['run:at'] = s.learnCount['run'] ?? 0;
    },
    done: (_s, n) => n('run') - n('run:at') >= 0.5,
    // Caught one without running, or no wild downy about any more: it goes, not learned, and comes back next time.
    lapse: (s) => (s.learnCount['catch:wild'] ?? 0) > (s.learnCount['run:from'] ?? 0) || !s.downies.some((d) => !d.gone && !d.tame && !d.keep && dist(s, d.x, d.z) < 20),
    mark: (s, m) => onDowny(m, nearestDowny(s, (d) => !d.tame && !d.keep && d.alert, NOTICE_RUN + 2)),
    note: 'Run to close on a downy that hops away.',
  },
  {
    // The tug, the first time a wild one pulls back against you (the seventh playtest held Pull through every
    // catch: "catching is rote"). Let go while it pulls, press again once it stops. It cuts in over any line the
    // moment a wild one puffs up to pull back (the first wild catch always does, early), and only while it is up
    // are pulls back gentle: they last until you let go, are slow to slip and never bolt (see TEACH_BACK).
    id: 'ease',
    after: ['draw'],
    unlocks: [],
    then: ['ease'],
    urgent: true,
    cut: true,
    ready: (s) => fighting(s, true),
    text: (q) => (q.dev === 'touch' ? 'Let go of Pull when it pulls back.' : q.dev === 'pad' ? 'Release LT when it pulls back.' : 'Release right click when it pulls back.'),
    start: (s) => {
      s.learnCount['ease:from'] = s.learnCount['eased'] ?? 0;
      s.learnCount['ease:up'] = 0;
    },
    each: (s, dt) => {
      s.learnCount['ease:up'] = (s.learnCount['ease:up'] ?? 0) + dt;
    },
    done: (_s, n) => n('eased') > n('ease:from'),
    // The fight ended (caught, slipped free or got away) without a let-go: it goes, not learned, and comes back at the next pull back.
    lapse: (s) => (s.learnCount['ease:up'] ?? 0) > 2.5 && !fighting(s, false),
    note: 'Wild downies pull back. Let go of Pull until they stop.',
  },
  {
    id: 'dusk',
    after: ['meadow'],
    unlocks: ['clock', 'sleep'],
    urgent: true,
    tag: 'sleep',
    ready: (s) => s.hour >= 18.3 || s.hour < 4.5,
    text: () => 'Sleep at the front door till morning.',
    done: (s) => s.hour >= 5.5 && s.hour < 18,
    lapse: (s) => s.hour >= 20.5 || s.hour < 4.5,
    mark: (_s, m, floor) => arrow(m, DOOR.x, floor(DOOR.x, DOOR.z + 0.6) + 2.9, DOOR.z + 0.3),
    note: 'Sleep at the front door to skip the night.',
  },
  {
    id: 'night',
    // Not after dusk: staying up lets the dusk line lapse unlearned, and the night still comes.
    after: ['meadow'],
    unlocks: ['nettles', 'up:hedge'],
    urgent: true,
    ready: (s) => s.hour >= 20.5 || s.hour < 4.5,
    text: () => 'Blow anything at the pest to shoo it.',
    done: (_s, n) => n('nettlehit') >= 1,
    lapse: (s) => s.hour >= 5.5 && s.hour < 20,
    mark: (s, m) => {
      // However far off it is: the arrow (or the chevron on the screen's edge) shows the way.
      let best = -1;
      let bd = 1e9;
      s.nettles.forEach((q, i) => {
        if (q.gone) return;
        const d = dist(s, q.x, q.z);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      if (best < 0) return false;
      const q = s.nettles[best];
      arrow(m, q.x, q.y + 1.3, q.z);
      return true;
    },
    note: 'Spiky pests roam at night and eat loose fluff. A hedge keeps them out.',
  },
  {
    // The feeder, before the garden and before the first night, as soon as you can pay for it (the sixth
    // playtest's garden lesson left 88 coins, the feeder cost 300, and the first night woke the pen starving).
    id: 'ups',
    after: ['farm'],
    unlocks: ['up:feeder'],
    tag: 'pen:feeder',
    ready: (s) => s.coins >= FEEDER_COST && s.pads.some((p) => p.kind === 'pen'),
    text: () => 'Buy a feeder at the pen post.',
    done: (_s, n) => n('upgrade') >= 1,
    // The coins went on something else: it goes, not learned, and comes back once you can pay again.
    lapse: (s) => s.coins < FEEDER_COST,
    mark: (s, m, floor) => onPost(m, nearestPad(s, (i) => s.pads[i].kind === 'pen'), floor, false),
    note: 'Pen posts sell upgrades as you need them.',
  },
  {
    // A feeder bought is no use empty: fill it, the hopper marked (the playtest's sat empty for a day and a half).
    id: 'feeder',
    after: ['ups'],
    unlocks: [],
    ready: (s) => feederPad(s) >= 0,
    text: (q, s) => {
      const step = s ? feederStep(s) : 'fill';
      return step === 'fill' ? FEEDER.fill : step === 'choose' ? FEEDER.choose(q) : FEEDER.pull(s ? feederFood(s, feederPad(s)) : 'cloverhead');
    },
    also: (q) => [FEEDER.choose(q), FEEDER.pull('cloverhead'), FEEDER.pull('sweetroot')],
    // Food you blew in (a garden beside the pen may tip its crop in by itself; that does not teach it).
    done: (_s, n) => n('feeder:fill') >= 1,
    each: (s) => {
      if (feederStep(s) === 'pull') ripen(s, feederFood(s, feederPad(s)));
    },
    mark: (s, m, floor) => {
      const i = feederPad(s);
      if (i < 0) return false;
      const step = feederStep(s);
      const f = feederFood(s, i);
      if (step === 'choose') {
        m.slot = s.slots.findIndex((q) => q.t === f && q.n > 0);
        return false;
      }
      if (step === 'pull') {
        const g = gardenFor(s, f);
        arrow(m, PADS[g].x, floor(PADS[g].x, PADS[g].z) + 2.2, PADS[g].z);
        ring(m, PADS[g].x, PADS[g].z, 3.1);
        return true;
      }
      // The hopper itself, ringed up where it is (round 9: the ring lay round the post's foot, and the ninth
      // playtest blew 10 clover heads at the post before finding the hopper higher up).
      const h = padSpots(i).hopper;
      arrow(m, h.x, floor(h.x, h.z) + h.y + 1.0, h.z);
      ring(m, h.x, h.z, HOPPER_RING, h.y + 0.12);
      return true;
    },
    note: 'A feeder drops food when its downies are hungry.',
  },
  {
    // The second morning, not the first evening (the seventh playtest's came at 23:30, in the dark, the sixth
    // line in two real minutes).
    id: 'garden',
    after: ['meadow'],
    unlocks: ['garden'],
    ready: (s) => s.coins >= 200 && s.day > 1,
    tag: 'build:garden',
    text: (q) => plotLine(q, 'Garden'),
    done: (s, n) => n('build:garden') >= 1 || s.pads.filter((p) => p.kind === 'garden').length >= 2,
    mark: (s, m, floor) => onPost(m, plotForGarden(s), floor, true),
  },
  {
    id: 'plant',
    after: ['garden'],
    unlocks: [],
    ready: () => true,
    // Round 10: with no food aboard it says to fetch some first, and points at a bed with food on it (the tenth
    // playtest's line pointed only at the bare bed, and Blow there said "Nothing in the jar.": a 22 s detour).
    // (Food just blown and still in the air counts as aboard: the line does not flick to "Pull food" as it lands.)
    text: (_q, s) => (s && !plantFood(s) ? PLANT.fetch : PLANT.blow),
    also: () => [PLANT.fetch],
    done: (_s, n) => n('plant') >= 1,
    // (Round 9: with no food aboard, the starter bed ripens, so planting is never a wait for a crop.)
    each: (s) => {
      if (!plantFood(s)) ripen(s);
    },
    mark: (s, m, floor) => {
      if (!plantFood(s)) {
        const g = gardenFor(s, 'cloverhead');
        const P = PADS[g];
        arrow(m, P.x, floor(P.x, P.z) + 2.2, P.z);
        ring(m, P.x, P.z, 3.1);
        return true;
      }
      const i = nearestPad(s, (k) => s.pads[k].kind === 'garden' && !s.pads[k].crop);
      if (i < 0) return false;
      const p = PADS[i];
      arrow(m, p.x, floor(p.x, p.z) + 2.2, p.z);
      ring(m, p.x, p.z, 3.1);
      return true;
    },
    note: 'Blow food onto a bare garden bed to plant it.',
  },
  {
    // After the ridge gate: the jar at 400 coins spent the gate's savings while the journal counted towards 500.
    id: 'bench',
    after: ['feeder', 'gates'],
    unlocks: ['bench', 'up:cap', 'up:range'],
    tag: 'bench:cap',
    // Round 10: not while you carry downies with no pen for them, unless you can pay for the pen too (the tenth
    // playtest's jar line came with 435 coins and 3 embers aboard; buying it left 35, and the embers went into the
    // clover pen). Round 11: and not until the jar has first filled (the eleventh playtest's line took 400 of 443 coins
    // with no window ever over 9, and left the gate's savings gone for nothing).
    ready: (s, n) => s.coins >= JAR_COST && jarHasFilled(s, n) && (!homeless(s).length || s.coins >= JAR_COST + BUILD_COST.pen),
    lapse: (s) => s.coins < JAR_COST || (homeless(s).length > 0 && s.coins < JAR_COST + BUILD_COST.pen),
    text: () => 'Buy a bigger jar at the workbench.',
    done: (_s, n) => n('bench') >= 1,
    mark: (_s, m, floor) => arrow(m, WORKBENCH.x, floor(WORKBENCH.x, WORKBENCH.z) + 2.7, WORKBENCH.z),
    note: 'The workbench upgrades your bellows.',
  },
  {
    id: 'gates',
    after: ['meadow'],
    unlocks: ['gates'],
    tag: 'gate:ridge',
    ready: (s) => s.coins >= GATES.ridge.cost,
    text: () => 'Open the gate to Ember Ridge.',
    done: (s) => s.gates.ridge,
    mark: (_s, m, floor) => arrow(m, GATES.ridge.x + 0.6, floor(GATES.ridge.x + 0.6, GATES.ridge.z) + 3.6, GATES.ridge.z),
    note: 'Gates open the far meadows and their downies.',
  },
  {
    // A thistle behind a low fence hops straight out (in about six seconds): say why and point at the post,
    // its High fence tag chosen when the tags come down. Every time it happens; never counted as learned.
    // (Before the stray line, which only nagged while the thistle kept hopping out.)
    id: 'high',
    after: ['penin'],
    unlocks: ['up:high'],
    urgent: true,
    repeat: true,
    tag: 'pen:high',
    // From the moment one is caught, before it is penned.
    ready: (s) => fencePost(s) >= 0,
    text: () => 'Thistles need a high fence. Buy one.',
    done: (s) => fencePost(s) < 0,
    mark: (s, m, floor) => onPost(m, fencePost(s), floor, false),
    note: 'Thistles hop any fence but a high one.',
  },
  {
    // The pen limit, taught before it bites: when a pen holds eight, or the jar would take one past ten.
    // The pen post's count tag ("8 of 10") says it in the world from then on.
    id: 'crowd',
    after: ['penin'],
    unlocks: ['crowd'],
    urgent: true,
    ready: crowding,
    text: () => 'Keep ten or fewer downies in a pen.',
    // Up until you have seen the count on the post (stood by it a moment, or opened its tags), with no pen
    // over ten; or until the pen is back under the limit. (The fourth playtest's was up 3.5 s, mid-play, and missed.)
    start: (s) => {
      s.learnCount['crowd:read'] = 0;
      s.learnCount['crowd:post'] = 0;
      s.learnCount['crowd:over'] = 0;
    },
    each: (s, dt) => {
      const f = fullest(s);
      if (f.n > PEN_MAX) s.learnCount['crowd:over'] = 1;
      if (f.pad >= 0) {
        const p = padSpots(f.pad).post;
        if (dist(s, p.x, p.z) < 4.5) s.learnCount['crowd:read'] = (s.learnCount['crowd:read'] ?? 0) + dt;
      }
    },
    done: (s, n) => fullest(s).n <= PEN_MAX && (n('crowd:read') >= 1.2 || n('crowd:post') >= 1 || n('crowd:over') > 0),
    lapse: (s) => !crowding(s),
    mark: (s, m, floor) => onPost(m, fullest(s).pad, floor, false),
    note: 'Ten to a pen. More get frazzled and hop out.',
  },
  {
    // Whenever one of your downies hops out of its pen: a line and an arrow on it, then back into the pen.
    id: 'stray',
    after: ['penin'],
    unlocks: [],
    urgent: true,
    repeat: true,
    ready: (s) => strays(s).length > 0,
    text: (q, s) => {
      const step = s ? strayStep(s) : 'pull';
      if (s && step === 'pull' && strayNoRoom(s)) return STRAY.room(q);
      return step === 'blow' ? STRAY.blow : step === 'other' ? STRAY.other : STRAY.pull;
    },
    also: (q) => [STRAY.blow, STRAY.other, STRAY.room(q)],
    done: (s) => strayStep(s) === null,
    // While one is loose, remember its pen and how many downies have come down in pens so far.
    start: (s) => {
      s.learnCount['stray:penned'] = s.learnCount['penned'] ?? 0;
    },
    each: (s) => {
      const d = nearestDowny(s, (q) => q.strayFrom >= 0 && q.pen < 0);
      if (!d) return;
      s.learnCount['stray:pen'] = d.strayFrom;
      s.learnCount['stray:penned'] = s.learnCount['penned'] ?? 0;
    },
    mark: (s, m, floor) => {
      const d = nearestDowny(s, (q) => q.strayFrom >= 0 && q.pen < 0);
      if (d) return onDowny(m, d);
      // In the jar: the pen it came from (or, that one full, another with room).
      const was = s.learnCount['stray:pen'] ?? -1;
      const i = strayStep(s) === 'other' ? penWithRoom(s, was) : was >= 0 && s.pads[was]?.kind === 'pen' ? was : nearestPad(s, (k) => s.pads[k].kind === 'pen');
      if (i < 0) return false;
      const p = PADS[i];
      arrow(m, p.x, floor(p.x, p.z) + 2.6, p.z);
      ring(m, p.x, p.z, PEN_R);
      return true;
    },
  },
  {
    // Round 10: downies aboard of a kind with no pen to go in (none holding that kind with room, and none empty): the
    // journal says so first, with the arrow on the plot to build on (the tenth playtest carried 3 embers home to a
    // page that read "Open the Brook Hollow gate, 35 of 1,200.", and put them in the clover pen). Short of a pen's
    // price, it counts the coins, with no arrow. Never counted as learned.
    id: 'home',
    after: ['penin'],
    unlocks: [],
    urgent: true,
    repeat: true,
    tag: 'build:pen',
    ready: (s) => homeless(s).length > 0 && s.pads.some((p) => p.kind === 'empty'),
    text: (_q, s) => homeLine(s),
    also: () => [MEADOW.more, ...(['clover', 'ember', 'brook'] as const).flatMap((k) => [HOME.build(k), HOME.save(k, 35), HOME.blow(k)])],
    // (Round 12: built, it goes on to "Blow the embers into the pen." until they are in, or you have gone off with them.)
    start: (s) => {
      s.learnCount['home:kind'] = HOME_KINDS.indexOf(homeless(s)[0] ?? 'ember');
      s.learnCount['home:pen'] = 0;
    },
    each: (s, dt) => {
      const k = homeless(s)[0];
      if (k) s.learnCount['home:kind'] = HOME_KINDS.indexOf(k);
      if (homePenStep(s)) s.learnCount['home:pen'] = (s.learnCount['home:pen'] ?? 0) + dt;
    },
    done: (s) => (homeless(s).length ? !s.pads.some((p) => p.kind === 'empty') : !homePenStep(s)),
    lapse: (s) => homePenStep(s) && (zoneAt(s.player.x, s.player.z) !== 'ranch' || (s.learnCount['home:pen'] ?? 0) > HOME_PEN_WAIT),
    mark: (s, m, floor) => {
      if (homePenStep(s)) {
        const k = homeKind(s)!;
        const i = homePen(s, k);
        if (i < 0) return false;
        if (s.slots[s.sel]?.t !== k) m.slot = s.slots.findIndex((q) => q.t === k && q.n > 0);
        const p = PADS[i];
        arrow(m, p.x, floor(p.x, p.z) + 2.6, p.z);
        ring(m, p.x, p.z, PEN_R);
        return true;
      }
      const next = oneMoreOf(s);
      if (next) return onDowny(m, next);
      return s.coins >= BUILD_COST.pen ? onPost(m, plotForPen(s), floor, true) : false;
    },
  },
];

/**
 * Tags that hang quietly once they matter, after the lesson that opened their
 * post: no line, just a new tag (a trough once you have a brook downy, a down
 * chute once you are selling plenty, a fifth slot once four kinds are aboard).
 */
const QUIET: { what: string; after: string[]; when(s: RanchState, n: N): boolean }[] = [
  { what: 'up:high', after: ['ups'], when: (s) => s.caught.includes('thistle') || s.learn.includes('lesson:night') },
  { what: 'up:trough', after: ['ups'], when: (s) => s.caught.includes('brook') },
  { what: 'up:chute', after: ['ups'], when: (s) => s.stats.sold >= 20 },
  { what: 'up:garden', after: ['ups', 'plant'], when: () => true },
  { what: 'up:run', after: ['feeder'], when: (s) => s.pads.some((p) => p.kind === 'pen' && p.ups.includes('feeder')) },
  { what: 'silo', after: ['ups'], when: (s, n) => kinds(s) >= s.slots.length || n('full') >= 1 },
  { what: 'up:slots', after: ['bench'], when: (s) => kinds(s) >= 4 },
  { what: 'up:glide', after: ['bench'], when: (s) => s.gates.ridge || s.gates.hollow },
  // (Round 9: the pen limit's counts hang from eight in a pen; its line comes only once a pen is over ten.)
  { what: 'crowd', after: ['penin'], when: (s) => nearLimit(s) },
];

export const LESSON_IDS = LESSONS.map((l) => l.id);

/** Every line any lesson can show, for every device: for checks of length and wording. */
export function allLines(): { id: string; line: string }[] {
  const says: Say[] = [
    { dev: 'touch', locked: false, lockAvailable: false },
    { dev: 'pad', locked: false, lockAvailable: false },
    { dev: 'mouse', locked: true, lockAvailable: true },
    { dev: 'mouse', locked: false, lockAvailable: true },
    { dev: 'mouse', locked: false, lockAvailable: false },
  ];
  const out: { id: string; line: string }[] = [];
  for (const l of LESSONS) for (const q of says) for (const line of [l.text(q), ...(l.also?.(q) ?? [])]) if (!out.some((o) => o.id === l.id && o.line === line)) out.push({ id: l.id, line });
  return out;
}
/** Every feature any lesson brings in. */
export const FEATURES = [...new Set([...LESSONS.flatMap((l) => [...l.unlocks, ...(l.then ?? [])]), ...QUIET.map((q) => q.what)])];

const byId = new Map(LESSONS.map((l) => [l.id, l]));

export interface TutorView {
  /** The line on the journal page, or '' for none. */
  line: string;
  /** The line is done: tick it and strike it. */
  done: boolean;
  /** The lesson it belongs to. */
  id: string;
}

export class Tutor {
  private active: Lesson | null = null;
  private struck: Lesson | null = null;
  private gap = 0;
  private shownFor = 0;
  readonly mark: Mark = { on: false, icon: 'arrow', x: 0, y: 0, z: 0, rx: 0, rz: 0, r: 0, slot: -1 };
  /** The line a finished lesson showed last, kept while it ticks (a stepped line has moved on by then). */
  private struckLine = '';
  /** The line on the page now. A stepped line moving on waits a moment first, so a step that lasts a frame never shows. */
  private shownLine = '';
  /** Seconds the line on the page has been up as it reads now (a step moving on starts it again). */
  private lineT = 0;
  private pendLine = '';
  private pendT = 0;
  private lastDev = '';
  /** Features brought in this frame (cleared each update). */
  readonly fresh: string[] = [];
  private view: TutorView = { line: '', done: false, id: '' };

  /** Seconds a stepped line's next step must last before the page changes to it. */
  static readonly STEP_HOLD = 0.25;
  /**
   * Seconds no new lesson comes up while a page of something just done is showing (round 8: the first order's
   * "Earned" page was replaced by the dusk line almost at once). A lesson that cuts in still does.
   */
  hold = 0;
  /** A page of something done is waiting (round 9): no new lesson comes up, so the page goes between them. */
  pageWaiting = false;
  /**
   * Real seconds between lessons coming up on the first day once the clock runs (the seventh playtest's first
   * evening put six lines up in about two real minutes, mostly in the dark).
   */
  static readonly SPACE = 30;
  /** Real seconds since a lesson last came up (a reload starts clear), and whether it came up on the first day with the clock running. */
  private sinceBegin = 1e9;
  private spaced = false;
  /** The first day's lessons are still waiting out their 30 s. */
  private get spacing(): boolean {
    return this.spaced && this.sinceBegin < Tutor.SPACE;
  }

  /** The lesson on screen, if any. */
  get current(): string {
    return this.struck?.id ?? this.active?.id ?? '';
  }

  /** The line on screen now (for the pause page). */
  get line(): string {
    return this.active && !this.struck ? this.view.line : '';
  }

  /** Is a lesson line up (or just ticked)? */
  get busy(): boolean {
    return !!this.struck || (!!this.active && this.shownFor > 0);
  }

  /** Seconds the lesson line on the page has read as it does now (for a page of something done to wait until it has been read). */
  get lineAge(): number {
    return this.active && !this.struck ? this.lineT : 0;
  }

  /** The lesson up is one that cuts in (the first pull back): nothing covers it. */
  get cutting(): boolean {
    return !!this.active?.cut && !this.struck;
  }

  static finished(s: RanchState, id: string): boolean {
    return s.learn.includes(`lesson:${id}`);
  }

  /** Count something the lessons wait on. */
  add(s: RanchState, k: string, v = 1): void {
    s.learnCount[k] = (s.learnCount[k] ?? 0) + v;
  }

  /** The sim's events, counted. */
  onEvent(s: RanchState, e: Ev): void {
    switch (e.t) {
      case 'suck':
        if (isDowny(e.thing)) {
          this.add(s, 'catch');
          if (e.wild) this.add(s, 'catch:wild');
        }
        break;
      case 'puff':
        if (e.thing) this.add(s, 'puff');
        break;
      case 'eat':
        if (e.fav && e.tame) this.add(s, 'feed');
        break;
      case 'sell':
        this.add(s, 'sell');
        if (e.blown) this.add(s, 'sell:blown');
        if (e.cycle) this.add(s, 'cycle');
        break;
      case 'build':
        if (e.pad < 0) this.add(s, 'bench');
        else if (e.what === 'pen' || e.what === 'garden') this.add(s, `build:${e.what}`);
        else if (e.what !== 'clear') this.add(s, 'upgrade');
        break;
      case 'store':
        // Food you put in (not a garden's crop tipping in by itself).
        if (e.where === 'feeder' && !e.auto) this.add(s, 'feeder:fill');
        break;
      case 'penned':
        this.add(s, 'penned');
        break;
      case 'order':
        if (e.state === 'progress' || e.state === 'filled') this.add(s, 'order');
        if (e.state === 'taken') this.add(s, 'order:taken');
        break;
      case 'deliver':
        this.add(s, e.rare ? 'order:rare' : 'order:live');
        break;
      case 'eased':
        if (e.eased) this.add(s, 'eased');
        break;
      case 'pullback':
      case 'slip':
        this.add(s, e.t);
        break;
      case 'full':
      case 'jump':
      case 'sleep':
      case 'nettlehit':
      case 'plant':
        this.add(s, e.t);
        break;
    }
  }

  private unlock(s: RanchState, what: string): void {
    if (s.learn.includes(what)) return;
    s.learn.push(what);
    this.fresh.push(what);
  }

  private finish(s: RanchState, l: Lesson): void {
    if (!l.repeat) this.unlock(s, `lesson:${l.id}`);
    for (const w of l.unlocks) this.unlock(s, w);
    for (const w of l.then ?? []) this.unlock(s, w);
  }

  private begin(s: RanchState, l: Lesson): void {
    this.active = l;
    this.sinceBegin = 0;
    this.spaced = s.day === 1 && s.learn.includes('time');
    this.shownFor = 0;
    this.shownLine = '';
    this.pendLine = '';
    for (const w of l.unlocks) this.unlock(s, w);
    l.start?.(s);
  }

  private eligible(s: RanchState, l: Lesson, n: N): boolean {
    return (l.repeat || !Tutor.finished(s, l.id)) && l.after.every((a) => Tutor.finished(s, a)) && l.ready(s, n) && !l.lapse?.(s);
  }

  /**
   * May a calm lesson come up now? The basics come whenever (the clock waits for them). Once the clock runs,
   * calm lessons rest from 6 pm until morning (dusk and the night are the evening's lessons), and on the first
   * day they come 30 s apart. The first day's evening waits at 6 pm for the feeder lessons (see evening).
   */
  private calmMay(s: RanchState): boolean {
    if (!s.learn.includes('time')) return true;
    // The first order is about to go up (the loop just ended): its lesson comes first, never 1.5 s after another.
    if (s.learn.includes('orders') && s.orderDay === 0 && !s.learn.includes('lesson:order')) return false;
    const h = s.hour;
    const evening = s.day > 1 || s.learn.includes('evening');
    if (h < 5.5 || h >= 18.3 || (h >= 18 && evening)) return false;
    // (Round 10: never while the first dusk waits at 6 pm: the spacing stops lines piling up, and with the clock held
    // it only made you wait; the tenth playtest stood twice for about 30 s with no line at 18:00.)
    return !(s.day === 1 && this.spacing && !Tutor.duskHeld(s));
  }

  /** The first day's clock is waiting at 6 pm for the evening's lessons (see Sim.clockHeld). */
  static duskHeld(s: RanchState): boolean {
    return s.day === 1 && s.hour >= 18 && s.hour < 18.3 && s.learn.includes('time') && !s.learn.includes('evening');
  }

  /** The tag the lesson on screen teaches (chosen for you when its post's tags come down), or null. */
  get tag(): string | null {
    return this.active && !this.struck && this.shownFor > 0 ? (this.active.tag ?? null) : null;
  }

  /** Once a frame: the line to show, and where to point. */
  update(s: RanchState, dt: number, say: Say, floor: Floor): TutorView {
    this.fresh.length = 0;
    this.mark.on = false;
    this.mark.slot = -1;
    this.sinceBegin += dt;
    if (this.hold > 0) this.hold -= dt;
    const n: N = (k) => s.learnCount[k] ?? 0;
    const v = this.view;
    // A lesson that cuts in (the first pull back) takes the page at once, over any line and a ticked one, then hands back.
    const cut = LESSONS.find((q) => q.cut && q !== this.active && this.eligible(s, q, n));
    if (cut) {
      this.struck = null;
      this.begin(s, cut);
    }
    // A finished line stays up, ticked, for a moment.
    if (this.struck) {
      this.gap -= dt;
      if (this.gap > 0) {
        v.line = this.struckLine;
        v.done = true;
        v.id = this.struck.id;
        return v;
      }
      this.struck = null;
    }
    for (const q of QUIET) if (!s.learn.includes(q.what) && q.after.every((a) => Tutor.finished(s, a)) && q.when(s, n)) this.unlock(s, q.what);
    for (let guard = 0; guard < LESSONS.length + 2; guard++) {
      const l = this.active;
      // Finished elsewhere (credited, or taught all at once): let it go quietly.
      if (l && !l.repeat && Tutor.finished(s, l.id)) {
        this.active = null;
        continue;
      }
      if (l) {
        const done = l.done(s, n);
        // The moment passed (you slept through the night it was teaching): it goes, not learned, and comes back the next time it applies.
        if (!done && l.lapse?.(s)) {
          this.active = null;
          continue;
        }
        if (done) {
          this.finish(s, l);
          this.active = null;
          // A line that was on screen gets its tick; one already done when it came up passes quietly.
          if (this.shownFor > 0) {
            this.struck = l;
            this.gap = 1.3;
            this.struckLine = v.id === l.id && v.line ? v.line : l.text(say, s);
            v.line = this.struckLine;
            v.done = true;
            v.id = l.id;
            return v;
          }
          continue;
        }
      }
      // A page of something just done is up (or waiting to go up): nothing new comes for a few seconds.
      if (!this.active && (this.hold > 0 || this.pageWaiting)) break;
      // Urgent lessons take over from a calm one.
      if (!this.active?.urgent) {
        const u = LESSONS.find((q) => q.urgent && q !== this.active && this.eligible(s, q, n));
        if (u) {
          this.begin(s, u);
          continue;
        }
      }
      if (!this.active) {
        const next = LESSONS.find((q) => this.eligible(s, q, n) && (q.urgent || this.calmMay(s)));
        if (next) {
          this.begin(s, next);
          continue;
        }
      }
      break;
    }
    // The first day's dusk waits at 6 pm (the sim holds the clock) until no calm lesson is up or waiting to come
    // (the feeder bought and filled), and the last line has had its 30 s; from the second day it never waits.
    if (!s.learn.includes('evening') && s.learn.includes('time')) {
      const calmUp = (!!this.active && !this.active.urgent) || LESSONS.some((q) => !q.urgent && this.eligible(s, q, n));
      // (Round 10: and no waiting out the last line's 30 s with the clock held.)
      if (s.day > 1 || (s.hour >= 18 && !calmUp)) this.unlock(s, 'evening');
    }
    const l = this.active;
    if (!l) {
      v.line = '';
      v.done = false;
      v.id = '';
      return v;
    }
    this.shownFor += dt;
    this.lineT += dt;
    l.each?.(s, dt);
    const want = l.text(say, s);
    if (want !== this.shownLine) {
      if (want !== this.pendLine) {
        this.pendLine = want;
        this.pendT = 0;
      }
      this.pendT += dt;
      // A new lesson, or another device's words, show at once; a step moving on waits a moment.
      if (!this.shownLine || say.dev !== this.lastDev || this.pendT >= Tutor.STEP_HOLD) {
        if (!this.shownLine || say.dev === this.lastDev) this.lineT = 0;
        this.shownLine = want;
      }
    }
    this.lastDev = say.dev;
    v.line = this.shownLine;
    v.done = false;
    v.id = l.id;
    if (l.mark) this.mark.on = l.mark(s, this.mark, floor);
    return v;
  }

  /** Notes for the pause page: the few most recently learned, newest last. */
  notes(s: RanchState, max = 3): string[] {
    const order = s.learn.filter((w) => w.startsWith('lesson:')).map((w) => byId.get(w.slice(7)));
    return order.filter((l): l is Lesson => !!l?.note).slice(-max).map((l) => l.note!);
  }

  /**
   * The journal goal on the page now (round 9): one that can be done brings in what it needs (the gate's price
   * board, the Feeder tag) at any hour, so the page never sends you to something you cannot use.
   */
  goalShown(s: RanchState, id: GoalId): void {
    const f = goalBrings(id, s);
    if (f) this.unlock(s, f);
  }

  /** Start over (a reset ranch). */
  clear(): void {
    this.active = null;
    this.struck = null;
    this.hold = 0;
    this.shownLine = '';
    this.pendLine = '';
    this.gap = 0;
    this.shownFor = 0;
    this.mark.on = false;
    this.mark.slot = -1;
  }
}

/** A line on a page of something done: struck (done) and just now (fresh), or plain news with no box. */
export interface PageLine {
  text: string;
  done: boolean;
  fresh: boolean;
  plain?: boolean;
}
export interface Page {
  title: string;
  lines: PageLine[];
}

/**
 * Pages of something done ("Earned 140 coins" over the struck order or goal), round 9. The ninth playtest's first
 * order filled under "Sleep at the front door till morning.", its gold clover was penned under the same line (so
 * "It stays. Its pen sheds more.", the only place the hunt's reward is said, never showed) and its trip filled under
 * "Open the gate to Ember Ridge.": a page waited for the lesson line to go and was dropped after 6 s, and each time
 * the only sign was the coins jumping. Now a page goes up between one lesson and the next (the tutor holds the next
 * back while one waits), or over a line that has stayed up 6 s (not while it ticks, nor over the first pull back's
 * line), and has the journal for its few seconds; the lesson's line comes back after. None is dropped (the newest
 * four are kept, in turn).
 */
export class Pages {
  /** Seconds a page stays up. */
  static readonly SECS = 3.4;
  /**
   * Seconds a lesson line has read as it does before a page may step in over it: a line that stays up (the dusk
   * line, a gate's). A quick step ticks before then, and the page goes between it and the next lesson (the tutor
   * holds the next one back while a page waits: `Tutor.pageWaiting`).
   */
  static readonly READ = 6;
  /** Seconds before a page goes that the next lesson may come up, so the journal goal never shows between the two (round 11). */
  static readonly HANDOVER = 0.25;
  /**
   * Real seconds a page stays up at the least, however fast the game runs meanwhile (backlog, round 12: "Earned 150
   * coins" was up 0.5 s and "Earned 52 coins" under 0.1 s, the game run on fast by the tester's script).
   */
  static readonly MIN_REAL = 1.6;
  private queue: Page[] = [];
  /** The page up now, if any, and its seconds left (game time, and real time). */
  showing: Page | null = null;
  left = 0;
  realLeft = 0;

  add(p: Page): void {
    this.queue.push(p);
    while (this.queue.length > 4) this.queue.shift();
  }

  get waiting(): number {
    return this.queue.length;
  }

  /**
   * Once a frame: the page to put up now (returned once, as it goes up), else null. v: the tutor's view; age: how
   * long its line has read as it does (Tutor.lineAge); cut: a line that cuts in is up (Tutor.cutting).
   */
  update(dt: number, v: { line: string; done: boolean }, age: number, cut: boolean, paused = false, real = dt): Page | null {
    if (this.showing) {
      this.left -= dt;
      this.realLeft -= real;
      if (this.left > 0 || this.realLeft > 0) return null;
      this.showing = null;
    }
    if (!this.queue.length || paused) return null;
    if (v.line && (v.done || cut || age < Pages.READ)) return null;
    this.showing = this.queue.shift()!;
    this.left = Pages.SECS;
    this.realLeft = Pages.MIN_REAL;
    return this.showing;
  }

  clear(): void {
    this.queue.length = 0;
    this.showing = null;
    this.left = 0;
    this.realLeft = 0;
  }
}

/**
 * Round 9 (the ninth playtest's P1: at 21:00 on day 2 with 574 coins the journal said "Open the gate to Ember Ridge."
 * with an arrow over the gate, and at the gate there was no Gate button, as the gates lesson rests until morning and
 * the gate waited for it): what a journal goal that you do at something needs brought in, and what it costs. Shown
 * with the coins for it, the goal brings its thing in itself (the gate's price board, the Feeder tag), whatever the
 * hour, so a goal on the page can always be done; short of coins, it counts them, with no arrow.
 */
const GOAL_NEEDS: Partial<Record<GoalId, { feature: string; cost: number; after: string }>> = {
  pen: { feature: 'pads', cost: BUILD_COST.pen, after: 'sell' },
  feeder: { feature: 'up:feeder', cost: PEN_UPS.find((u) => u.id === 'feeder')!.cost, after: 'farm' },
  ridge: { feature: 'gates', cost: GATES.ridge.cost, after: 'meadow' },
  hollow: { feature: 'gates', cost: GATES.hollow.cost, after: 'meadow' },
};

/** Can this goal be done right now, with what is in play (coins, and its thing brought in or about to be)? */
export function goalDoable(id: GoalId, s: RanchState): boolean {
  const need = GOAL_NEEDS[id];
  if (id === 'ridge' || id === 'hollow') return !s.gates[id] && s.coins >= GATES[id].cost;
  if (id === 'feeder') return s.coins >= need!.cost && s.pads.some((p) => p.kind === 'pen' && !p.ups.includes('feeder'));
  if (id === 'pen') return s.coins >= need!.cost || s.pads.some((p) => p.kind === 'pen');
  if (id === 'ember') return s.gates.ridge;
  if (id === 'brook') return s.gates.hollow;
  if (id === 'thistle') return s.gates.ridge;
  return true;
}

/** The thing a goal on the page brings in now (it can be done and its lesson has not brought it in yet), or null. */
export function goalBrings(id: GoalId, s: RanchState): string | null {
  const need = GOAL_NEEDS[id];
  if (!need || s.learn.includes(need.feature) || !Tutor.finished(s, need.after) || !goalDoable(id, s)) return null;
  return need.feature;
}

/**
 * A journal goal's line. A gate's counts the coins towards it ("Open the Ember
 * Ridge gate, 288 of 500."), so the page is never a dead end while you save up,
 * and the big total counts what you have earned. Round 9: so does a feeder's or
 * a pen's, short of its price.
 */
export function goalText(id: GoalId, s: RanchState): string {
  const g = GOALS.find((q) => q.id === id);
  if (!g) return '';
  if ((id === 'ridge' || id === 'hollow') && !s.gates[id] && s.coins < GATES[id].cost) return `Open the ${GATES[id].name} gate, ${fmtCoins(s.coins)} of ${fmtCoins(GATES[id].cost)}.`;
  // (Round 10: "Build a feeder, 90 of 150.", eight words or fewer; it was "Build a feeder in a pen, 90 of 150.")
  if ((id === 'feeder' || id === 'pen') && !goalDoable(id, s) && s.coins < GOAL_NEEDS[id]!.cost) return `Build a ${id}, ${fmtCoins(s.coins)} of ${fmtCoins(GOAL_NEEDS[id]!.cost)}.`;
  if (id === 'rich') return `${g.text.slice(0, -1)}, ${fmtCoins(s.earned)} so far.`;
  // The thistle hunt has a clue (it had none): by day, when they come; at dusk, where, with an arrow.
  if (id === 'thistle') return thistleTime(s) ? 'Catch a thistle on the ridge top.' : 'Thistles visit the ridge top at dusk.';
  if (id === 'orders5') return `Fill five orders, ${Math.min(5, s.stats.filled)} so far.`;
  // (Round 10: "Sell 20 fluff at the sell crate." never said how many so far.)
  // (Eight words or fewer, as every journal line.)
  if (id === 'sell') return `Sell 20 fluff, ${Math.min(20, s.stats.sold)} so far.`;
  // (Round 10: the herd goal counts the fullest pen, so one trip can bring the rest.)
  if (id === 'herd') return `Keep five downies in one pen, ${Math.min(5, fullest(s).n)} now.`;
  if (id === 'streak') {
    const run = (s.stats.lastFill ?? -9) >= s.day - 1 ? (s.stats.streak ?? 0) : 0;
    return `Fill orders three days running, ${run} so far.`;
  }
  if (id === 'rares') {
    const have = new Set<string>();
    for (const d of s.downies) if (!d.gone && d.tame && d.rare) have.add(d.kind);
    for (const q of s.slots) if (q.t && isDowny(q.t) && (q.downs ?? []).some((r) => r.rare)) have.add(q.t);
    return `Keep all three rare downies, ${have.size} so far.`;
  }
  if (id === 'late') {
    // An order for after 9 pm: open, on the board, or not today.
    if (s.orders.some((o) => o.state === 'open' && o.from !== undefined)) return g.text;
    if (s.orders.some((o) => o.state === 'offer' && o.from !== undefined)) return 'Take an order for after 9 pm.';
    return 'Orders for after 9 pm come some mornings.';
  }
  // Nothing on the board yet (or the day's went by): say when they come, rather than ask for one there is not.
  if (id === 'order' && !s.orders.some((o) => o.state === 'offer' || o.state === 'open')) return s.learn.includes('orders') ? 'New orders come to the board at dawn.' : g.text;
  return g.text;
}

/** Dusk, when thistles are on the ridge top (half past five to half past eight). */
export const thistleTime = (s: RanchState) => s.hour >= 17.5 && s.hour < 20.5;

/** A journal goal with a place to go: an arrow over it (a gate; the ridge top or a thistle at dusk). False for goals without one. */
export function goalSpot(id: GoalId, s: RanchState, m: Mark, floor: Floor): boolean {
  if (id === 'thistle') {
    if (!thistleTime(s) || !s.gates.ridge) return false;
    // The nearest thistle once you are up there, else the ridge top.
    const d = nearestDowny(s, (q) => !q.tame && !q.keep && q.kind === 'thistle', 30);
    if (d) return onDowny(m, d);
    return arrow(m, RIDGE_TOP.x, floor(RIDGE_TOP.x, RIDGE_TOP.z) + 3, RIDGE_TOP.z);
  }
  // (Round 11: a kind just opened: the way to it, then the nearest one.)
  if ((id === 'ember' && s.gates.ridge) || (id === 'brook' && s.gates.hollow)) return catchSpot(id, s, m, floor);
  // (Round 9: only a gate you can open now: short of its price the line counts the coins, with no arrow.)
  if ((id !== 'ridge' && id !== 'hollow') || s.gates[id] || !goalDoable(id, s)) return false;
  const g = GATES[id];
  const x = g.x + (id === 'ridge' ? 0.6 : -0.6);
  return arrow(m, x, floor(x, g.z) + 3.6, g.z);
}

/** Round 11: the line under a goal waiting on coins. */
export const CATCH_MORE = 'Catch more. Ten fit in a pen.';
/** Round 11: the dusk note when fluff lies about. */
export const FLUFF_LINE = 'Fluff blows away at dawn.';

/**
 * The note when a wild one gets away, saying why (backlog, round 12: three of the tester's four "It got away." came
 * before any tell, with nothing to say what went wrong). Eight words or fewer, in the button's words.
 */
export function getawayNote(why: Getaway, dove: boolean, dev: Dev): string {
  if (dove) return 'It slipped into the water.';
  switch (why) {
    case 'slack':
      return 'It got away. Pull again once it stops.';
    case 'time':
      return 'Its time ran out. It got away.';
    case 'far':
      return 'It pulled too far. It got away.';
    case 'let':
      return dev === 'touch' ? 'It got away. Hold Pull until it comes.' : dev === 'pad' ? 'It got away. Hold LT until it comes.' : 'It got away. Hold right click longer.';
    case 'off':
      return 'It got away. Keep the crosshair on it.';
    case 'twice':
      return 'It slipped free twice. It got away.';
    case 'unlured':
      return 'It got away. Lure it first.';
  }
}

/**
 * The kinds a pen is for: those most of its downies are (the rare ones not counted, unless that is all it holds), every
 * kind tied for most. Empty: none (backlog, round 12: a gold clover in the ember pen made it count as holding clover).
 */
export function penKinds(s: RanchState, i: number): DownyKind[] {
  const here = s.downies.filter((d) => !d.gone && d.pen === i);
  const plain = here.filter((d) => !d.rare);
  const by = new Map<DownyKind, number>();
  for (const d of plain.length ? plain : here) by.set(d.kind, (by.get(d.kind) ?? 0) + 1);
  const most = Math.max(0, ...by.values());
  return [...by.keys()].filter((k) => by.get(k) === most);
}

/** Room for more of a kind: spaces in the pens for it (by their majority) or standing empty, less those aboard already. */
function roomFor(s: RanchState, k: DownyKind): number {
  let room = 0;
  s.pads.forEach((p, i) => {
    if (p.kind !== 'pen') return;
    const n = penCount(s, i);
    if (!n || penKinds(s, i).includes(k)) room += Math.max(0, PEN_MAX - n);
  });
  return room - s.slots.reduce((a, q) => a + (q.t === k ? q.n : 0), 0);
}

/**
 * Round 11: the saving stretch was thin. After all were fed the eleventh playtest had 30 s with nothing to do under
 * "Sell 20 fluff, 10 so far.", then 276 s under "Open the Brook Hollow gate, 43 of 1,200." with no line at all, and only
 * got through it by choosing to catch more: nothing suggested the best move. With a goal waiting on coins (or with
 * nothing to sell under the sell goal), by day, with no order in hand, room in a pen and no downy aboard to pen first:
 * the kind to catch, the dearest you can reach with room for it. Else null.
 */
export function catchMore(id: GoalId | undefined, s: RanchState): DownyKind | null {
  if (!id || s.hour < 5.5 || s.hour >= 18) return null;
  const saving = (id === 'ridge' || id === 'hollow') ? !s.gates[id] && s.coins < GATES[id].cost : (id === 'feeder' || id === 'pen') && !goalDoable(id, s) && s.coins < GOAL_NEEDS[id]!.cost;
  const nothingToSell = id === 'sell' && sellStep(s) === 'feed' && !hungryOne(s);
  if (!saving && !nothingToSell) return null;
  if (s.orders.some((o) => o.state === 'offer' || (o.state === 'open' && (o.live || o.rare) && o.got < o.n))) return null;
  // (Downies aboard back on the ranch: pen those first. Out in the wilds, you are already at it.)
  if (carrying(s, isDowny) && zoneAt(s.player.x, s.player.z) === 'ranch') return null;
  for (const k of ['brook', 'ember', 'clover'] as const) {
    if ((k === 'brook' && !s.gates.hollow) || (k === 'ember' && !s.gates.ridge)) continue;
    // (Round 12: and room in the jar for it. Seven embers filled the jar, and the line still sent you for a clover.)
    if (roomFor(s, k) > 0 && jarTakes(s, k)) return k;
  }
  return null;
}

/** Where wild ones of a kind are: the nearest one on your side of the valley's walls; else the way to them. */
export function catchSpot(k: DownyKind, s: RanchState, m: Mark, floor: Floor): boolean {
  const here = zoneAt(s.player.x, s.player.z);
  const d = nearestDowny(s, (q) => !q.tame && !q.keep && !q.rare && q.kind === k && zoneAt(q.x, q.z) === here, 26);
  if (d) return onDowny(m, d);
  return wayTo(s, m, k, floor);
}

/** Today's rare order, with no lesson up: an arrow where it was seen, on the downy once near, on the crate once aboard. */
export function orderSpot(s: RanchState, m: Mark, floor: Floor): boolean {
  return rareMark(s, m, floor);
}

const KIND_WORD: Record<string, string> = { clover: 'Clover', ember: 'Ember', brook: 'Brook', thistle: 'Thistle' };

/** The open orders (today's, and the first order while it runs to the next dusk), each as its tally or the hunt's step. */
function openLines(s: RanchState, say: Say): string[] {
  return s.orders
    .filter((o) => o.state === 'open' && o.got < o.n)
    // (One due by 10 am says so: "Clover fluff by 10 am, 2 of 10.")
    .map((o) => {
      const due = o.from !== undefined ? ' after 9 pm' : o.by === ORDER_MORN ? ' by 10 am' : '';
      return o.rare ? rareLine(s, o, say) : o.live ? `${KIND_WORD[o.kind]} downies${due}, ${o.got} of ${o.n}.` : `${KIND_WORD[o.kind]} fluff${due}, ${o.got} of ${o.n}.`;
    });
}

/** Game hours the journal says "Order filled. New ones come at dawn." after an order is filled (round 10). */
export const FILLED_NEWS = 1;

/**
 * The day's orders for the journal page, with their tally ("Ember fluff, 2 of
 * 6."): the open ones (the rare hunt as its step: "Find the gold clover by the
 * old oak."), and offers waiting at the board; once all are filled, a line
 * saying so until dusk. A missed day says nothing. Empty before the first order.
 */
export function orderLines(s: RanchState, say: Say = TOUCH): string[] {
  if (!s.orders.length) return [];
  const open = openLines(s, say);
  // Offers waiting: take one at the board (under an order still open from yesterday).
  if (s.orderDay === s.day && s.orders.some((o) => o.state === 'offer')) return [...open, 'Orders wait on the price board.'];
  if (open.length) return open;
  // (Round 10: for an hour after it is filled, not all day: it held two of the journal's lines until dusk.)
  if (s.orderDay === s.day && s.hour < ORDER_BY && s.orders.every((o) => o.state === 'filled') && s.day * 24 + s.hour - (s.stats.filledAt ?? -99) < FILLED_NEWS) return ['Order filled. New ones come at dawn.'];
  return [];
}

/**
 * The open orders' tallies, kept on the page under any lesson line while they
 * are open (the sixth playtest's first order lost the page to the garden and
 * dusk lessons within a second of being taken). Not the lesson's own line.
 */
export function orderTally(s: RanchState, say: Say, line: string): string[] {
  return openLines(s, say).filter((t) => t !== line);
}

const TOUCH: Say = { dev: 'touch', locked: false, lockAvailable: false };

/** Mark lessons finished, with what they bring in, and everything they come after. */
function credit(s: RanchState, ids: string[]): void {
  const add = (x: string) => s.learn.includes(x) || s.learn.push(x);
  const go = (id: string) => {
    const l = byId.get(id);
    if (!l || s.learn.includes(`lesson:${id}`)) return;
    add(`lesson:${id}`);
    for (const w of [...l.unlocks, ...(l.then ?? [])]) add(w);
    for (const a of l.after) go(a);
  };
  for (const id of ids) go(id);
}

/** Quiet tags whose posts a credited ranch already knows. */
function creditQuiet(s: RanchState): void {
  for (const q of QUIET) if (!s.learn.includes(q.what) && q.after.every((a) => s.learn.includes(`lesson:${a}`))) s.learn.push(q.what);
}

/** Everything learned: the sandbox (`&taught`) and scripted checks of single features. */
export function teachAll(s: RanchState): void {
  credit(s, LESSON_IDS);
  creditQuiet(s);
  if (!s.learn.includes('evening')) s.learn.push('evening');
}

/**
 * A ranch saved before the lessons existed: credit what it has clearly done,
 * so a returning player is not taught again. Everything a credited lesson
 * comes after is credited with it.
 */
export function creditLessons(s: RanchState): void {
  const ids: string[] = [];
  const hint = (h: string) => s.hints.includes(h);
  const pens = s.pads.filter((p) => p.kind === 'pen').length;
  const gardens = s.pads.filter((p) => p.kind === 'garden').length;
  const tame = s.downies.some((d) => !d.gone && d.tame);
  if (hint('look')) ids.push('look');
  if (hint('move')) ids.push('walk');
  if (s.stats.drawn > 0 || s.caught.length > 0) ids.push('draw');
  if (hint('puff') || tame) ids.push('puff');
  if (s.stats.fed > 0 && s.goals.includes('feed')) ids.push('feed');
  if (s.stats.sold > 0) ids.push('sell');
  if (pens > 0) ids.push('pen');
  if (s.goals.includes('pen') || s.downies.some((d) => !d.gone && d.pen >= 0)) ids.push('penin');
  if (hint('slot')) ids.push('slots');
  if (s.day > 1 || s.zones.length > 2 || (s.zones.includes('meadow') && s.downies.filter((d) => !d.gone && d.pen >= 0).length >= 2)) ids.push('meadow', 'jump');
  if (s.day > 1) ids.push('dusk', 'night');
  else if (s.hour >= 18.3) ids.push('dusk');
  if (gardens >= 2 || s.goals.includes('plant')) ids.push('garden', 'plant');
  if (s.pads.some((p) => p.ups.length > 0 || p.kind === 'silo') || s.goals.includes('feeder')) ids.push('ups');
  if (s.pads.some((p) => p.kind === 'pen' && p.ups.includes('feeder') && p.feeder.n > 0)) ids.push('feeder');
  if (Object.values(s.up).some((v) => v > 0)) ids.push('bench');
  if (s.gates.ridge || s.gates.hollow) ids.push('gates');
  if (s.stats.sold >= 10 && ids.includes('meadow')) ids.push('farm');
  credit(s, ids);
  // A ranch past its first day has had the day run on: its clock is not held for a loop lesson it never had.
  if (s.day > 1 && !s.learn.includes('time')) s.learn.push('time');
  if (s.day > 1 && !s.learn.includes('evening')) s.learn.push('evening');
  // A ranch that has sold, built or slept has seen every control on screen before.
  if (s.stats.sold > 0 || pens > 0 || s.day > 1) credit(s, ['slots', 'jump']);
  creditQuiet(s);
}
