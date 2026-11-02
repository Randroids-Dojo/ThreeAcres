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

import { FOOD_INFO, GARDEN_HOURS, GOALS, ORDER_BY, ORDER_NOON, PEN_MAX, PEN_UPS, RARE_NAME, eats, fmtCoins, isDowny, isFood, isTuft, wantedFood, type Food, type GoalId, type Order } from './defs';
import { NOTICE_RUN, RARE_SEEN, padSpots, rareLured, rarePenOf, type Ev } from './sim';
import type { Downy, Item, RanchState } from './state';
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

/** A lesson sending you to the garden never sends you to an empty bed: the nearest clover bed ripens. */
function ripen(s: RanchState, food: Food = 'cloverhead'): void {
  const lying = s.items.some((it) => !it.gone && it.type === food && it.src >= 1000);
  if (lying) return;
  const g = s.pads.findIndex((p) => p.kind === 'garden' && p.crop === food);
  if (g >= 0) s.pads[g].grow = Math.max(s.pads[g].grow, 1 - 0.05 / GARDEN_HOURS);
}

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

/** Downies in the jar. */
const aboard = (s: RanchState) => s.slots.reduce((a, q) => a + (q.t && isDowny(q.t) ? q.n : 0), 0);

/** A pen near the limit: eight in it, or five and the jar would take it past ten. */
function crowding(s: RanchState): boolean {
  const f = fullest(s);
  return f.n > PEN_MAX || f.n >= 8 || (f.n >= 5 && f.n + aboard(s) > PEN_MAX);
}

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
  return penWithRoom(s) >= 0 || !s.pads.some((p) => p.kind === 'pen') ? 'catch' : 'build';
}
/** Whole turns of the loop the farm lesson waits for. */
export const FARM_CYCLES = 3;
const FARM = {
  pull: 'Pull up the fluff your downies dropped.',
  feed: 'Feed the hungry downy its favourite food.',
  food: 'Pull up food for the hungry downy.',
  catch: 'Catch another downy out in Clover Meadow.',
  pen: 'Blow the downy into a pen.',
};

const SELL = {
  blow: 'Blow the fluff into the sell crate.',
  choose: (q: Say) => (q.dev === 'touch' ? "Tap the fluff's window to choose it." : q.dev === 'pad' ? 'Press LB or RB to choose the fluff.' : 'Press Q until the fluff is chosen.'),
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

/**
 * The rare hunt, where it stands: find it from the clue (no arrow until you are
 * close), fetch its favourite food, blow some near it to lure it, walk up and
 * pull it in while it is lured, then blow it into a pen.
 */
export function rareStep(s: RanchState): 'find' | 'fetch' | 'lure' | 'pull' | 'pen' {
  const o = rareOrder(s);
  if (o && wantedAboard(s, o)) return 'pen';
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
    // The pen it adds most to: the fullest with room and no rare one yet.
    const best = rarePenOf(s, false);
    const i = best >= 0 ? best : penWithRoom(s);
    if (i < 0) return false;
    const p = PADS[i];
    arrow(m, p.x, floor(p.x, p.z) + 2.6, p.z);
    ring(m, p.x, p.z, PEN_R);
    return true;
  }
  const d = rareWild(s);
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
  later: 'Blow it into the crate after dark.',
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
  const lying = nearestPad(s, (i) => s.pads[i].kind === 'garden' && s.items.some((it) => !it.gone && it.type === food && it.src === 1000 + i));
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

const STRAY = {
  pull: 'Pull in the downy that got out.',
  blow: 'Blow the downy into the pen.',
  other: 'Blow the downy into another pen.',
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

function ring(m: Mark, x: number, z: number, r: number): void {
  m.rx = x;
  m.rz = z;
  m.r = r;
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
    done: (s, n) => {
      const d = porch(s);
      return n('walk') >= 0.6 && (!d || dist(s, d.x, d.z) < 3.4);
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
    text: (q, s) => {
      const step = s ? sellStep(s) : 'blow';
      if (step === 'feed') return s && feedStep(s) === 'pull' ? FEED.pull : SELL.feed;
      return step === 'choose' ? SELL.choose(q) : SELL[step];
    },
    also: (q) => [SELL.choose(q), SELL.pull, SELL.feed, FEED.pull],
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
      if (step === 'blow') {
        const cr = crateFor(s);
        arrow(m, cr.x, floor(cr.x, cr.z) + 2.3, cr.z);
        ring(m, cr.x, cr.z, 1.2);
        return true;
      }
      if (step === 'choose') {
        m.slot = s.slots.findIndex((q) => q.t !== null && q.n > 0 && isTuft(q.t));
        return false;
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
    text: () => 'Catch a downy out in Clover Meadow.',
    done: (_s, n) => n('catch:wild') >= 1,
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
      if (farmStep(s) === 'food') {
        const d = hungryOne(s);
        if (d) ripen(s, wantedFood(d.kind));
      }
    },
    text: (q, s) => {
      const step = s ? farmStep(s) : 'feed';
      return step === 'blow' ? SELL.blow : step === 'choose' ? SELL.choose(q) : step === 'build' ? plotLine(q, 'Pen') : FARM[step];
    },
    also: (q) => [SELL.blow, FARM.pull, FARM.food, FARM.catch, FARM.pen, plotLine(q, 'Pen')],
    done: (_s, n) => n('cycle') - n('farm:from') >= FARM_CYCLES,
    mark: (s, m, floor) => {
      const step = farmStep(s);
      if (step === 'blow') {
        const cr = crateFor(s);
        arrow(m, cr.x, floor(cr.x, cr.z) + 2.3, cr.z);
        ring(m, cr.x, cr.z, 1.2);
        return true;
      }
      if (step === 'choose') {
        m.slot = s.slots.findIndex((q) => q.t !== null && q.n > 0 && isTuft(q.t));
        return false;
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
        const d = hungryOne(s)!;
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
      const h = padSpots(i).hopper;
      arrow(m, h.x, floor(h.x, h.z) + h.y + 1.0, h.z);
      ring(m, h.x, h.z, 0.9);
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
    text: () => 'Blow some food onto the bare soil.',
    done: (_s, n) => n('plant') >= 1,
    mark: (s, m, floor) => {
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
    ready: (s) => s.coins >= 400,
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
    text: (_q, s) => {
      const step = s ? strayStep(s) : 'pull';
      return step === 'blow' ? STRAY.blow : step === 'other' ? STRAY.other : STRAY.pull;
    },
    also: () => [STRAY.blow, STRAY.other],
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
    return !(s.day === 1 && this.spacing);
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
      // A page of something just done is up: nothing new comes for a few seconds.
      if (!this.active && this.hold > 0) break;
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
      if (s.day > 1 || (s.hour >= 18 && !calmUp && !this.spacing)) this.unlock(s, 'evening');
    }
    const l = this.active;
    if (!l) {
      v.line = '';
      v.done = false;
      v.id = '';
      return v;
    }
    this.shownFor += dt;
    l.each?.(s, dt);
    const want = l.text(say, s);
    if (want !== this.shownLine) {
      if (want !== this.pendLine) {
        this.pendLine = want;
        this.pendT = 0;
      }
      this.pendT += dt;
      // A new lesson, or another device's words, show at once; a step moving on waits a moment.
      if (!this.shownLine || say.dev !== this.lastDev || this.pendT >= Tutor.STEP_HOLD) this.shownLine = want;
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

/**
 * A journal goal's line. A gate's counts the coins towards it ("Open the Ember
 * Ridge gate, 288 of 500."), so the page is never a dead end while you save up,
 * and the big total counts what you have earned.
 */
export function goalText(id: GoalId, s: RanchState): string {
  const g = GOALS.find((q) => q.id === id);
  if (!g) return '';
  if ((id === 'ridge' || id === 'hollow') && !s.gates[id] && s.coins < GATES[id].cost) return `Open the ${GATES[id].name} gate, ${fmtCoins(s.coins)} of ${fmtCoins(GATES[id].cost)}.`;
  if (id === 'rich') return `${g.text.slice(0, -1)}, ${fmtCoins(s.earned)} so far.`;
  // The thistle hunt has a clue (it had none): by day, when they come; at dusk, where, with an arrow.
  if (id === 'thistle') return thistleTime(s) ? 'Catch a thistle on the ridge top.' : 'Thistles visit the ridge top at dusk.';
  if (id === 'orders5') return `Fill five orders, ${Math.min(5, s.stats.filled)} so far.`;
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
  if ((id !== 'ridge' && id !== 'hollow') || s.gates[id]) return false;
  const g = GATES[id];
  const x = g.x + (id === 'ridge' ? 0.6 : -0.6);
  return arrow(m, x, floor(x, g.z) + 3.6, g.z);
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
    // (One due by noon says so: "Clover fluff by noon, 2 of 10.")
    .map((o) => {
      const due = o.from !== undefined ? ' after dark' : o.by === ORDER_NOON ? ' by noon' : '';
      return o.rare ? rareLine(s, o, say) : o.live ? `${KIND_WORD[o.kind]} downies${due}, ${o.got} of ${o.n}.` : `${KIND_WORD[o.kind]} fluff${due}, ${o.got} of ${o.n}.`;
    });
}

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
  if (s.orderDay === s.day && s.hour < ORDER_BY && s.orders.every((o) => o.state === 'filled')) return ['Order filled. New ones come at dawn.'];
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
