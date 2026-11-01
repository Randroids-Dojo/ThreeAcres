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

import { GARDEN_HOURS, GOALS, eats, fmtCoins, isDowny, isFood, isTuft, wantedFood, type Food, type GoalId } from './defs';
import { padSpots, type Ev } from './sim';
import type { Downy, Item, RanchState } from './state';
import { DOOR, EXCHANGE, GATES, PADS, PEN_R, RANCH_GATE, WORKBENCH, zoneAt } from './world';

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
  /** Comes back whenever it applies again (a downy out of its pen); never counted as learned. */
  repeat?: boolean;
  /** The hanging tag it teaches: chosen for you when that post's tags come down. */
  tag?: string;
  ready(s: RanchState, n: N): boolean;
  /** The line now. A lesson with steps words each one from the ranch as it stands. */
  text(say: Say, s?: RanchState): string;
  /** Every other line it can show, for checks of length and wording. */
  also?(say: Say): string[];
  /** Runs every frame while it is on screen. */
  each?(s: RanchState): void;
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

/** Your downies (tame or the porch one), not gone. */
const mine = (d: Downy) => !d.gone && (d.tame || d.keep);

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
function farmStep(s: RanchState): 'blow' | 'choose' | 'pull' | 'feed' | 'food' | 'catch' {
  const sell = sellStep(s);
  if (sell === 'blow' || sell === 'choose' || sell === 'pull') return sell;
  const d = hungryOne(s);
  if (d) return carrying(s, (t) => isFood(t) && eats(d.kind, t)) ? 'feed' : 'food';
  return 'catch';
}
/** Whole turns of the loop the farm lesson waits for. */
export const FARM_CYCLES = 3;
const FARM = {
  pull: 'Pull up the fluff your downies dropped.',
  feed: 'Feed the hungry downy its favourite food.',
  food: 'Pull up food for the hungry downy.',
  catch: 'Catch another downy out in Clover Meadow.',
};

const SELL = {
  blow: 'Blow the fluff into the sell crate.',
  choose: (q: Say) => (q.dev === 'touch' ? "Tap the fluff's window to choose it." : q.dev === 'pad' ? 'Press LB or RB to choose the fluff.' : 'Press Q until the fluff is chosen.'),
  pull: 'Pull up the fluff the downy dropped.',
  feed: 'Feed the downy again for more fluff.',
};
/** A downy of yours, loose (not penned, not in the canister). */
const loose = (s: RanchState) => nearestDowny(s, (d) => (d.tame || d.keep) && d.pen < 0);

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
function strayStep(s: RanchState): 'pull' | 'blow' | null {
  if (strays(s).length) return 'pull';
  const back = (s.learnCount['penned'] ?? 0) > (s.learnCount['stray:penned'] ?? 0);
  return carrying(s, isDowny) && !back ? 'blow' : null;
}

const STRAY = {
  pull: 'Pull in the downy that got out.',
  blow: 'Blow the downy into the pen.',
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
export function fullNote(dev: Dev, noneFree: boolean, windowsKnown: boolean): string {
  const how = !windowsKnown ? '' : dev === 'touch' ? ' Hold one to empty it.' : dev === 'pad' ? ' Hold LB to empty one.' : ' Hold Q to empty one.';
  return noneFree ? `No window free.${how}` : `Window full.${how}`;
}

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
        arrow(m, EXCHANGE.x, floor(EXCHANGE.x, EXCHANGE.z) + 2.3, EXCHANGE.z);
        ring(m, EXCHANGE.x, EXCHANGE.z, 1.2);
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
    mark: (s, m, floor) => onPost(m, nearestPad(s, (i) => s.pads[i].kind === 'empty'), floor, true),
  },
  {
    id: 'penin',
    after: ['pen'],
    unlocks: [],
    ready: () => true,
    text: () => 'Blow the downy into the pen.',
    done: (s) => s.downies.some((d) => !d.gone && d.pen >= 0),
    mark: (s, m, floor) => {
      const i = nearestPad(s, (k) => s.pads[k].kind === 'pen');
      if (i < 0) return false;
      const p = PADS[i];
      if (carrying(s, isDowny) || !loose(s)) arrow(m, p.x, floor(p.x, p.z) + 2.6, p.z);
      else onDowny(m, loose(s));
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
    then: ['time'],
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
      return step === 'blow' ? SELL.blow : step === 'choose' ? SELL.choose(q) : FARM[step];
    },
    also: () => [SELL.blow, FARM.pull, FARM.food, FARM.catch],
    done: (_s, n) => n('cycle') - n('farm:from') >= FARM_CYCLES,
    mark: (s, m, floor) => {
      const step = farmStep(s);
      if (step === 'blow') {
        arrow(m, EXCHANGE.x, floor(EXCHANGE.x, EXCHANGE.z) + 2.3, EXCHANGE.z);
        ring(m, EXCHANGE.x, EXCHANGE.z, 1.2);
        return true;
      }
      if (step === 'choose') {
        m.slot = s.slots.findIndex((q) => q.t !== null && q.n > 0 && isTuft(q.t));
        return false;
      }
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
    id: 'garden',
    after: ['meadow'],
    unlocks: ['garden'],
    ready: (s) => s.coins >= 200,
    tag: 'build:garden',
    text: (q) => plotLine(q, 'Garden'),
    done: (s, n) => n('build:garden') >= 1 || s.pads.filter((p) => p.kind === 'garden').length >= 2,
    mark: (s, m, floor) => onPost(m, nearestPad(s, (i) => s.pads[i].kind === 'empty'), floor, true),
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
    id: 'ups',
    after: ['penin', 'meadow'],
    unlocks: ['up:feeder'],
    tag: 'pen:feeder',
    ready: (s) => s.coins >= 300 && s.pads.some((p) => p.kind === 'pen'),
    text: () => 'Buy a feeder at the pen post.',
    done: (_s, n) => n('upgrade') >= 1,
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
    done: (s, n) => n('feeder:fill') >= 1 || s.pads.some((p) => p.kind === 'pen' && p.feeder.n > 0),
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
    id: 'bench',
    after: ['feeder'],
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
    // Whenever one of your downies hops out of its pen: a line and an arrow on it, then back into the pen.
    id: 'stray',
    after: ['penin'],
    unlocks: [],
    urgent: true,
    repeat: true,
    ready: (s) => strays(s).length > 0,
    text: (_q, s) => (s && strayStep(s) === 'blow' ? STRAY.blow : STRAY.pull),
    also: () => [STRAY.blow],
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
      // In the jar: the pen it came from.
      const was = s.learnCount['stray:pen'] ?? -1;
      const i = was >= 0 && s.pads[was]?.kind === 'pen' ? was : nearestPad(s, (k) => s.pads[k].kind === 'pen');
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
        if (e.where === 'feeder') this.add(s, 'feeder:fill');
        break;
      case 'penned':
        this.add(s, 'penned');
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
    this.shownFor = 0;
    this.shownLine = '';
    this.pendLine = '';
    for (const w of l.unlocks) this.unlock(s, w);
    l.start?.(s);
  }

  private eligible(s: RanchState, l: Lesson, n: N): boolean {
    return (l.repeat || !Tutor.finished(s, l.id)) && l.after.every((a) => Tutor.finished(s, a)) && l.ready(s, n) && !l.lapse?.(s);
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
    const n: N = (k) => s.learnCount[k] ?? 0;
    const v = this.view;
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
      // Urgent lessons take over from a calm one.
      if (!this.active?.urgent) {
        const u = LESSONS.find((q) => q.urgent && q !== this.active && this.eligible(s, q, n));
        if (u) {
          this.begin(s, u);
          continue;
        }
      }
      if (!this.active) {
        const next = LESSONS.find((q) => this.eligible(s, q, n));
        if (next) {
          this.begin(s, next);
          continue;
        }
      }
      break;
    }
    const l = this.active;
    if (!l) {
      v.line = '';
      v.done = false;
      v.id = '';
      return v;
    }
    this.shownFor += dt;
    l.each?.(s);
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
  return g.text;
}

/** A journal goal with a place to go: an arrow over it (a gate). False for goals without one. */
export function goalSpot(id: GoalId, s: RanchState, m: Mark, floor: Floor): boolean {
  if ((id !== 'ridge' && id !== 'hollow') || s.gates[id]) return false;
  const g = GATES[id];
  const x = g.x + (id === 'ridge' ? 0.6 : -0.6);
  return arrow(m, x, floor(x, g.z) + 3.6, g.z);
}

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
  if (Object.values(s.up).some((v) => v > 0)) ids.push('bench');
  if (s.gates.ridge || s.gates.hollow) ids.push('gates');
  if (s.stats.sold >= 10 && ids.includes('meadow')) ids.push('farm');
  credit(s, ids);
  // A ranch that has sold, built or slept has seen every control on screen before.
  if (s.stats.sold > 0 || pens > 0 || s.day > 1) credit(s, ['slots', 'jump']);
  creditQuiet(s);
}
