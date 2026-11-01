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

import { eats, isDowny, isFood, isTuft, wantedFood, type Food } from './defs';
import { padSpots, type Ev } from './sim';
import type { Downy, RanchState } from './state';
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
  ready(s: RanchState, n: N): boolean;
  /** The line now. A lesson with steps words each one from the ranch as it stands. */
  text(say: Say, s?: RanchState): string;
  /** Every other line it can show, for checks of length and wording. */
  also?(say: Say): string[];
  /** Runs every frame while it is on screen. */
  each?(s: RanchState): void;
  done(s: RanchState, n: N): boolean;
  /** The moment passed without it being done (night fell before you slept): it leaves quietly. */
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

/** Your loose clover downies work up an appetite, so they eat as soon as food lands near them. */
function appetite(s: RanchState): void {
  for (const d of s.downies) if (!d.gone && (d.tame || d.keep) && d.pen < 0 && d.kind === 'clover') d.hunger = Math.max(d.hunger, 0.62);
}

/**
 * Where selling stands: blow (fluff is the chosen kind), choose (fluff is
 * aboard but another kind is chosen, so Blow would send that), pull (fluff
 * lies on the ground, or a fed downy is about to drop it) or feed (no fluff
 * anywhere: feed a downy for more).
 */
function sellStep(s: RanchState): 'blow' | 'choose' | 'pull' | 'feed' {
  const chosen = s.slots[s.sel];
  if (chosen?.t && chosen.n > 0 && isTuft(chosen.t)) return 'blow';
  if (carrying(s, isTuft)) return 'choose';
  return s.items.some((it) => !it.gone && isTuft(it.type)) || s.downies.some((d) => !d.gone && d.shedQ > 0) ? 'pull' : 'feed';
}
/** Your downies (tame or the porch one), not gone. */
const mine = (d: Downy) => !d.gone && (d.tame || d.keep);
/** The nearest of your downies that is hungry enough to eat. */
const hungryOne = (s: RanchState) => nearestDowny(s, (d) => mine(d) && d.hunger > 0.5 && d.drawn === 0);

/**
 * The ranch's loop, where it stands: fluff first (blow, choose or pull it),
 * then a hungry downy (feed it, or fetch food for it), and with everyone fed,
 * catch another downy.
 */
function farmStep(s: RanchState): 'blow' | 'choose' | 'pull' | 'feed' | 'food' | 'catch' {
  const sell = sellStep(s);
  if (sell === 'blow' || sell === 'choose') return sell;
  if (s.items.some((it) => !it.gone && isTuft(it.type) && zoneAt(it.x, it.z) === 'ranch')) return 'pull';
  const d = hungryOne(s);
  if (d) return carrying(s, (t) => isFood(t) && eats(d.kind, t)) ? 'feed' : 'food';
  return 'catch';
}
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
    mark: (s, m) => onDowny(m, porch(s)),
  },
  {
    id: 'draw',
    after: ['walk'],
    unlocks: ['bellows', 'draw'],
    ready: () => true,
    text: (q) => (q.dev === 'touch' ? 'Aim at the downy and hold Pull.' : q.dev === 'pad' ? 'Aim at the downy and hold LT.' : 'Aim at the downy and hold right click.'),
    done: (_s, n) => n('catch') >= 1,
    mark: (s, m) => onDowny(m, porch(s)),
    note: 'Pull brings in downies, food and fluff.',
  },
  {
    id: 'puff',
    after: ['draw'],
    unlocks: ['puff'],
    ready: () => true,
    text: (q) => (q.dev === 'touch' ? 'Tap Blow to send it back out.' : q.dev === 'pad' ? 'Press RT to blow it back out.' : 'Click to blow it back out.'),
    done: (_s, n) => n('puff') >= 1,
    note: 'Blow sends out one of whatever is chosen.',
  },
  {
    id: 'feed',
    after: ['puff'],
    unlocks: ['pause'],
    ready: () => true,
    text: () => 'Feed the downy a clover head.',
    done: (_s, n) => n('feed') >= 1,
    start: appetite,
    mark: (s, m) => {
      const d = loose(s);
      if (!d) return false;
      m.icon = 'cloverhead';
      m.x = d.x;
      m.y = d.y + 1.05;
      m.z = d.z;
      // The garden glows until you have some clover heads aboard.
      if (carrying(s, (t) => t === 'cloverhead')) m.r = 0;
      else ring(m, PADS[0].x, PADS[0].z, 3.1);
      return true;
    },
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
      return step === 'choose' ? SELL.choose(q) : SELL[step];
    },
    also: (q) => [SELL.choose(q), SELL.pull, SELL.feed],
    done: (_s, n) => n('sell') >= 1,
    each: (s) => {
      if (sellStep(s) === 'feed') appetite(s);
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
      if (step === 'feed') {
        const d = loose(s);
        if (!d) return false;
        m.icon = 'cloverhead';
        m.x = d.x;
        m.y = d.y + 1.05;
        m.z = d.z;
        if (carrying(s, (t) => t === 'cloverhead')) m.r = 0;
        else ring(m, PADS[0].x, PADS[0].z, 3.1);
        return true;
      }
      let best = -1;
      let bd = 1e9;
      s.items.forEach((it, i) => {
        if (it.gone || !isTuft(it.type)) return;
        const d = dist(s, it.x, it.z);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      if (best >= 0) {
        const it = s.items[best];
        return arrow(m, it.x, it.y + 0.9, it.z);
      }
      // Not dropped yet: point at the downy it is coming from.
      return onDowny(m, nearestDowny(s, (d) => d.shedQ > 0));
    },
    note: 'The sell crate buys fluff. Prices change each day.',
  },
  {
    id: 'pen',
    after: ['sell'],
    unlocks: ['pads'],
    ready: () => true,
    text: () => 'Build a pen on an empty plot.',
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
    // Count sales from when it first came up; dusk taking over and handing back must not start the count again.
    start: (s) => {
      s.learnCount['farm:from'] ??= s.learnCount['sell'] ?? 0;
    },
    text: (q, s) => {
      const step = s ? farmStep(s) : 'feed';
      return step === 'blow' ? SELL.blow : step === 'choose' ? SELL.choose(q) : FARM[step];
    },
    also: () => [SELL.blow, FARM.pull, FARM.food, FARM.catch],
    done: (_s, n) => n('sell') - n('farm:from') >= 4,
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
        let best = -1;
        let bd = 1e9;
        s.items.forEach((it, i) => {
          if (it.gone || !isTuft(it.type) || zoneAt(it.x, it.z) !== 'ranch') return;
          const d = dist(s, it.x, it.z);
          if (d < bd) {
            bd = d;
            best = i;
          }
        });
        if (best < 0) return false;
        const it = s.items[best];
        return arrow(m, it.x, it.y + 0.9, it.z);
      }
      if (step === 'feed') {
        const d = hungryOne(s)!;
        m.icon = wantedFood(d.kind);
        m.x = d.x;
        m.y = d.y + 1.05;
        m.z = d.z;
        m.r = 0;
        return true;
      }
      if (step === 'food') {
        // The nearest garden with something growing, or the first garden.
        const g = nearestPad(s, (i) => s.pads[i].kind === 'garden' && !!s.pads[i].crop);
        const i = g >= 0 ? g : 0;
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
    ready: (s) => s.hour >= 18.3 || s.hour < 4.5,
    text: () => 'Sleep at the front door till morning.',
    done: (s) => s.hour >= 5.5 && s.hour < 18,
    lapse: (s) => s.hour >= 20.5 || s.hour < 4.5,
    mark: (_s, m, floor) => arrow(m, DOOR.x, floor(DOOR.x, DOOR.z + 0.6) + 2.9, DOOR.z + 0.3),
    note: 'Sleep at the front door to skip the night.',
  },
  {
    id: 'night',
    after: ['dusk'],
    unlocks: ['nettles', 'up:hedge'],
    urgent: true,
    ready: (s) => s.hour >= 20.5 || s.hour < 4.5,
    text: () => 'Blow anything at the pest to shoo it.',
    done: (_s, n) => n('nettlehit') >= 1,
    lapse: (s) => s.hour >= 5.5 && s.hour < 20,
    mark: (s, m) => {
      let best = -1;
      let bd = 60;
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
    text: () => 'Build a garden on an empty plot.',
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
    ready: (s) => s.coins >= 300 && s.pads.some((p) => p.kind === 'pen'),
    text: () => 'Buy a feeder at the pen post.',
    done: (_s, n) => n('upgrade') >= 1,
    mark: (s, m, floor) => onPost(m, nearestPad(s, (i) => s.pads[i].kind === 'pen'), floor, false),
    note: 'Pen posts sell upgrades as you need them.',
  },
  {
    id: 'bench',
    after: ['ups'],
    unlocks: ['bench', 'up:cap', 'up:range'],
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
    ready: (s) => s.coins >= GATES.ridge.cost,
    text: () => 'Open the gate to Ember Ridge.',
    done: (s) => s.gates.ridge,
    mark: (_s, m, floor) => arrow(m, GATES.ridge.x + 0.6, floor(GATES.ridge.x + 0.6, GATES.ridge.z) + 3.6, GATES.ridge.z),
    note: 'Gates open the far meadows and their downies.',
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
  /** Features brought in this frame (cleared each update). */
  readonly fresh: string[] = [];
  private view: TutorView = { line: '', done: false, id: '' };

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
        break;
      case 'build':
        if (e.pad < 0) this.add(s, 'bench');
        else if (e.what === 'pen' || e.what === 'garden') this.add(s, `build:${e.what}`);
        else if (e.what !== 'clear') this.add(s, 'upgrade');
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
    this.unlock(s, `lesson:${l.id}`);
    for (const w of l.unlocks) this.unlock(s, w);
    for (const w of l.then ?? []) this.unlock(s, w);
  }

  private begin(s: RanchState, l: Lesson): void {
    this.active = l;
    this.shownFor = 0;
    for (const w of l.unlocks) this.unlock(s, w);
    l.start?.(s);
  }

  private eligible(s: RanchState, l: Lesson, n: N): boolean {
    return !Tutor.finished(s, l.id) && l.after.every((a) => Tutor.finished(s, a)) && l.ready(s, n);
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
      if (l && Tutor.finished(s, l.id)) {
        this.active = null;
        continue;
      }
      if (l) {
        const done = l.done(s, n);
        if (done || l.lapse?.(s)) {
          this.finish(s, l);
          this.active = null;
          // A line that was on screen gets its tick; one already done when it came up passes quietly.
          if (done && this.shownFor > 0) {
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
    v.line = l.text(say, s);
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
    this.gap = 0;
    this.shownFor = 0;
    this.mark.on = false;
    this.mark.slot = -1;
  }
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
