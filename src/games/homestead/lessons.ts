// Sunup teaches itself one thing at a time. The farm starts with only your
// hands and four ripe radishes; each lesson brings in one tool or system,
// says one line about it, and waits until you have done it before the next
// one appears. Everything a lesson has not introduced stays off the screen.
// A line about a place on the farm points at it: a chevron over it, or on
// the screen's edge, turned towards it, while it is out of view.

import type { Command } from '../../sim/commands';
import { BUILD_COST, TOOL_UPGRADES } from '../../sim/constants';
import { CROPS, cropWord } from '../../sim/crops';
import { nightsToTurn } from '../../sim/actions';
import { PROPS } from '../../sim/map';
import { season, SEASON_NAMES } from '../../sim/world';
import type { Crop, SimEvent, WorldState } from '../../sim/types';

type Point = { x: number; y: number };

interface Lesson {
  id: string;
  /** Lessons that must be finished first. */
  after: string[];
  /** Features this lesson brings onto the screen (and into the farm) when it starts. */
  unlocks: string[];
  ready(s: WorldState): boolean;
  /** Eight words or fewer: one action. The world shows the rest. */
  text(s: WorldState, touch: boolean): string;
  /** Finished? `n` reads the counts the tutor keeps. Passive lessons finish on their own after `passive` seconds. */
  done?(s: WorldState, n: (k: string) => number): boolean;
  passive?: number;
  /** Takes over from a calm lesson when it becomes ready (a crow will not wait), which comes back after. */
  urgent?: boolean;
  /** A tile to point at while the line is up (a chevron over it, or at the screen's edge when it is out of view). */
  point?(s: WorldState): Point | null;
}

const ownedAt = (s: WorldState, i: number) => s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned;

/** The owned plot nearest the farmer that passes a test, as the middle of its tile. */
function nearest(s: WorldState, test: (crop: Crop | null, i: number) => boolean): Point | null {
  const f = s.actors[0];
  let best: Point | null = null;
  let bd = Infinity;
  for (let i = 0; i < s.plots.length; i++) {
    if (!ownedAt(s, i) || !test(s.plots[i].crop, i)) continue;
    const x = (i % s.W) + 0.5;
    const y = Math.floor(i / s.W) + 0.5;
    const d = Math.hypot(x - f.x, y - f.y);
    if (d < bd) {
      bd = d;
      best = { x, y };
    }
  }
  return best;
}

const live = (c: Crop | null): c is Crop => !!c && !c.dead;
const anyRipe = (s: WorldState) => !!nearest(s, (c) => live(c) && c.stage === 4);
const thirsty = (s: WorldState, c: Crop | null, i: number) => live(c) && c.stage < 4 && !s.plots[i].wet;
const anyThirsty = (s: WorldState) => !!nearest(s, (c, i) => thirsty(s, c, i));
/** A crow on the farm right now, flying in or pecking. */
const crowHere = (s: WorldState) => s.crows.some((c) => c.phase === 'in' || c.phase === 'peck');
const theCrow = (s: WorldState) => s.crows.find((c) => c.phase === 'in' || c.phase === 'peck') ?? null;
/** The bugged crop nearest the farmer, on an owned field. */
const theBugs = (s: WorldState) => nearest(s, (c) => live(c) && c.bugs > 0);
const bugsHere = (s: WorldState) => !!theBugs(s);
const fields = (s: WorldState) => s.parcels.filter((p) => p.owned).length;
/** Owned meadow, not hoed yet: a field just bought. */
const meadow = (s: WorldState) => nearest(s, (c, i) => !c && !s.plots[i].tilled && !s.builds.some((b) => b.y * s.W + b.x === i));
const prop = (kind: string): Point => {
  const p = PROPS.find((q) => q.kind === kind)!;
  return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
};

/** Features that arrive with no line of their own: crows and bugs start coming from day 5, once a request is understood. */
const QUIET: { what: string; after: string[]; when(s: WorldState): boolean }[] = [{ what: 'pests', after: ['deliver'], when: (s) => s.day >= 5 }];

const LESSONS: Lesson[] = [
  {
    // On a phone, tapping a plot walks there and does the job: the easiest first move. The stick and act button work too.
    id: 'pull',
    after: [],
    unlocks: [],
    ready: () => true,
    text: (_s, touch) => (touch ? 'Tap a radish to harvest it.' : 'Walk to a radish. Space harvests it.'),
    done: (s, n) => n('harvest') >= 4 || !anyRipe(s),
    point: (s) => nearest(s, (c) => live(c) && c.stage === 4 && c.kind === 'radish'),
  },
  {
    id: 'water',
    after: ['pull'],
    unlocks: ['can'],
    ready: () => true,
    text: () => 'Take the can. Water the carrots.',
    done: (s, n) => n('water') >= 4 || !anyThirsty(s),
    point: (s) => nearest(s, (c, i) => thirsty(s, c, i)),
  },
  {
    id: 'well',
    after: ['water'],
    unlocks: [],
    ready: (s) => s.water <= 3,
    text: () => 'Fill the can at the well.',
    done: (_s, n) => n('refill') >= 1,
    point: () => prop('well'),
  },
  {
    id: 'sleep',
    after: ['water'],
    unlocks: ['sleep'],
    ready: () => true,
    text: () => 'Crops grow overnight. Sleep.',
    done: (s) => s.stats.days >= 1,
  },
  {
    // Seeds cost coins. With an empty purse and a full crate, the night is the answer.
    id: 'broke',
    after: ['sleep'],
    unlocks: [],
    ready: (s) => s.coins < 10 && Object.values(s.stock).some((q) => q.some((n) => n > 0)),
    text: () => 'No coins yet. Sleep to sell the crate.',
    done: (s) => s.coins >= 10,
  },
  {
    id: 'plant',
    after: ['sleep'],
    unlocks: ['coins', 'seeds', 'stamina'],
    ready: (s) => s.coins >= 10,
    text: () => 'Plant seeds in the bare soil.',
    done: (_s, n) => n('plant') >= 3,
    point: (s) => nearest(s, (c, i) => !c && s.plots[i].tilled && !s.builds.some((b) => b.y * s.W + b.x === i)),
  },
  {
    // However the field was bought (from the board, or by tapping it), owning
    // meadow brings the hoe and this line. It cuts in, like the crow: the
    // field is new and the line is about it.
    id: 'hoe',
    urgent: true,
    after: ['sleep'],
    unlocks: ['hoe'],
    ready: (s) => fields(s) >= 2 && !!meadow(s),
    text: () => 'Hoe the new field.',
    done: (s, n) => n('till') >= 2 || !meadow(s),
    point: (s) => meadow(s),
  },
  {
    id: 'requests',
    after: ['plant'],
    unlocks: ['board', 'requests'],
    ready: (s) => s.day >= 3,
    text: () => 'Read the board.',
    done: (_s, n) => n('board') >= 1,
    point: () => ({ x: prop('board').x, y: prop('board').y + 0.1 }),
  },
  {
    id: 'deliver',
    after: ['requests'],
    unlocks: [],
    ready: () => true,
    // Names what the request wants, so the line says what to grow.
    text: (s) => {
      const it = s.orders[0]?.items[0];
      return it ? `Harvest ${it.n} ${cropWord(it.crop, it.n)}. The crate ships them.` : 'Harvest what it asks. The crate ships it.';
    },
    passive: 8,
    point: () => prop('crate'),
  },
  {
    id: 'field',
    after: ['deliver'],
    unlocks: [],
    ready: (s) => s.coins >= s.parcels[1].price && fields(s) === 1,
    text: () => 'Buy a second field.',
    done: (s) => fields(s) >= 2,
    // The field itself: a tap on it offers it for sale.
    point: (s) => {
      const p = s.parcels.find((q) => !q.owned);
      return p ? { x: p.x + p.w / 2, y: p.y + p.h / 2 } : null;
    },
  },
  {
    // Crows are let onto the farm quietly (see QUIET); the line waits for a
    // real one to land, so it never talks about crows that are not there.
    id: 'pests',
    urgent: true,
    after: ['deliver'],
    unlocks: ['build', 'forecast'],
    ready: (s) => crowHere(s),
    // Names what it is after, so you know where to look.
    text: (s) => {
      const c = theCrow(s);
      const crop = c ? s.plots[c.y * s.W + c.x]?.crop : null;
      return `A crow is on your ${crop ? CROPS[crop.kind].plural.toLowerCase() : 'crops'}. Shoo it.`;
    },
    point: (s) => {
      const c = theCrow(s);
      return c ? { x: c.x + 0.5, y: c.y + 0.5 } : null;
    },
    // Shooed, or it flew off with its dinner: either way the crow has gone.
    done: (s, n) => n('scare') + n('build') >= 1 || !crowHere(s),
  },
  {
    id: 'scarecrow',
    urgent: true,
    after: ['pests'],
    unlocks: [],
    ready: () => true,
    // Never "build one" to a farmer who cannot pay for it.
    text: (s) => (s.coins >= BUILD_COST.scarecrow ? 'Scarecrows keep crows away. Build one.' : `Scarecrows keep crows away. They cost ${BUILD_COST.scarecrow}.`),
    passive: 9,
  },
  {
    // Bugs come with the crows, quietly. Like the crow, the line waits for real
    // bugs on a real crop, names it, points at it, and ends when they are picked.
    id: 'bugs',
    urgent: true,
    after: ['deliver'],
    unlocks: [],
    ready: (s) => s.learn.includes('pests') && bugsHere(s),
    text: (s) => {
      const at = theBugs(s);
      const c = at ? s.plots[Math.floor(at.y) * s.W + Math.floor(at.x)].crop : null;
      return `Bugs on your ${c ? CROPS[c.kind].plural.toLowerCase() : 'crops'}. Pick them off.`;
    },
    point: (s) => theBugs(s),
    done: (s, n) => n('tend') >= 1 || !bugsHere(s),
  },
  {
    // The last days of a season: the picker now offers the next season's seeds.
    id: 'turn',
    after: ['plant'],
    unlocks: [],
    ready: (s) => nightsToTurn(s.day) <= 3,
    text: (s) => `${SEASON_NAMES[season(s.day)]} ends soon. Plant ${SEASON_NAMES[(season(s.day) + 1) % 4].toLowerCase()} seeds.`,
    passive: 9,
  },
  {
    id: 'smith',
    after: ['deliver'],
    unlocks: ['smith'],
    ready: (s) => s.rep >= Math.min(TOOL_UPGRADES.can[0].rep, TOOL_UPGRADES.hoe[0].rep),
    text: () => 'The smith has better tools now.',
    passive: 9,
  },
];

/**
 * Reminders, not lessons: they come back whenever they apply. The empty can
 * has no lesson of its own after the well, so it points the way back there
 * while the can is in hand, empty, with something still thirsty.
 */
const NUDGES: { id: string; after: string; ready(s: WorldState): boolean; text: string; point?(s: WorldState): Point | null }[] = [
  {
    id: 'empty',
    after: 'well',
    ready: (s) => s.water <= 0 && s.tool === 'can' && anyThirsty(s),
    text: 'Can empty. Fill the can at the well.',
    point: () => prop('well'),
  },
];

/** Every line any lesson can show, on touch and on keys: for checks of length and wording. */
export function allLines(s: WorldState): string[] {
  const out = LESSONS.flatMap((l) => [l.text(s, true), l.text(s, false)]);
  for (const n of NUDGES) out.push(n.text);
  // Lines that change with the farm, in their other forms.
  const poor = { ...s, coins: 0 } as WorldState;
  for (const l of LESSONS) out.push(l.text(poor, true));
  const withRequest = { ...s, orders: [{ id: 1, who: 'x', items: [{ crop: 'strawberry', n: 3 }], reward: 1, rep: 1, due: 9 }] } as WorldState;
  for (const l of LESSONS) out.push(l.text(withRequest, true));
  return [...new Set(out)];
}

export class Tutor {
  private active: Lesson | null = null;
  /** Quiet unlocks already sent (the sim adds them to the farm's learning on its next step). */
  private sent = new Set<string>();

  /** Count the things lessons wait for. */
  onEvent(s: WorldState, e: SimEvent): void {
    const farmerId = s.actors[0].id;
    const bump = (k: string) => (s.learnCount[k] = (s.learnCount[k] ?? 0) + 1);
    switch (e.type) {
      case 'harvest':
      case 'water':
      case 'plant':
      case 'till':
      case 'build':
      case 'refill':
      case 'tend':
        if (e.by === farmerId) bump(e.type);
        break;
      case 'crowScared':
        bump('scare');
        break;
    }
  }

  /** The board was opened. */
  board(s: WorldState): void {
    s.learnCount.board = (s.learnCount.board ?? 0) + 1;
  }

  /** Once a frame: the line to show, and any unlocks for the farm. */
  update(s: WorldState, dt: number, touch: boolean): { line: string; cmds: Command[]; point: Point | null } {
    const cmds: Command[] = [];
    const n = (k: string) => s.learnCount[k] ?? 0;
    const finished = (id: string) => s.learn.includes(`lesson:${id}`);
    for (const q of QUIET) if (!s.learn.includes(q.what) && !this.sent.has(q.what) && q.after.every(finished) && q.when(s)) {
      this.sent.add(q.what);
      cmds.push({ type: 'unlock', what: q.what });
    }
    // A lesson finished elsewhere (credited to an old save) leaves quietly.
    if (this.active && finished(this.active.id)) this.active = null;
    // Finish the lesson on screen when its condition is met.
    if (this.active) {
      const l = this.active;
      if (l.passive) s.learnCount[`shown:${l.id}`] = n(`shown:${l.id}`) + dt;
      const over = l.passive ? n(`shown:${l.id}`) >= l.passive : l.done!(s, n);
      if (over) {
        cmds.push({ type: 'unlock', what: `lesson:${l.id}` });
        s.learn.push(`lesson:${l.id}`);
        this.active = null;
      }
    }
    const eligible = (l: Lesson) => !finished(l.id) && l.after.every(finished) && l.ready(s);
    const urgentNow = () => LESSONS.find((l) => l.urgent && eligible(l));
    // An urgent lesson takes the line from a calm one; the calm one is picked up again after.
    if (this.active && !this.active.urgent && s.turnover < 0 && urgentNow()) this.active = null;
    if (!this.active && s.turnover < 0) {
      this.active = urgentNow() ?? LESSONS.find(eligible) ?? null;
      if (this.active) {
        s.learnCount[`since:${this.active.id}`] = s.day;
        for (const what of this.active.unlocks) if (!s.learn.includes(what)) cmds.push({ type: 'unlock', what });
        // A lesson already satisfied (rain watered the carrots) passes quietly.
        if (!this.active.passive && this.active.done!(s, n)) return { line: '', cmds, point: null };
      }
    }
    if (s.turnover >= 0) return { line: '', cmds, point: null };
    // A reminder that applies right now speaks over a calm lesson (never over an urgent one).
    if (!this.active?.urgent) {
      const nudge = NUDGES.find((g) => finished(g.after) && g.ready(s));
      if (nudge) return { line: nudge.text, cmds, point: nudge.point?.(s) ?? null };
    }
    const up = !!this.active;
    return { line: up ? this.active!.text(s, touch) : '', cmds, point: up ? (this.active!.point?.(s) ?? null) : null };
  }
}

/** A farm saved before the lessons existed: credit what it has clearly done. */
export function inferLessons(s: WorldState): void {
  s.learn ??= [];
  s.learnCount ??= {};
  // A field bought before the hoe always came with one: bring the hoe now.
  if (s.parcels.filter((p) => p.owned).length > 1 && !s.learn.includes('hoe') && s.learn.length) s.learn.push('hoe');
  if (s.learn.length) return;
  const harvested = Object.values(s.stats.harvested).reduce((a, b) => a + b, 0);
  const add = (...xs: string[]) => xs.forEach((x) => s.learn.includes(x) || s.learn.push(x));
  if (harvested > 0 || s.stats.days > 0) add('lesson:pull', 'can');
  if (s.stats.days > 0) add('lesson:water', 'lesson:sleep', 'sleep', 'coins', 'seeds', 'stamina');
  if (s.parcels.filter((p) => p.owned).length > 1) add('hoe');
}
