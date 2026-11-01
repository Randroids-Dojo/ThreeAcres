// Sunup teaches itself one thing at a time. The farm starts with only your
// hands and four ripe radishes; each lesson brings in one tool or system,
// says one line about it, and waits until you have done it before the next
// one appears. Everything a lesson has not introduced stays off the screen.

import type { Command } from '../../sim/commands';
import { CROPS } from '../../sim/crops';
import { dayOfSeason } from '../../sim/world';
import type { SimEvent, WorldState } from '../../sim/types';

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
  point?(s: WorldState): { x: number; y: number } | null;
}

const anyRipe = (s: WorldState) => s.plots.some((p, i) => s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned && p.crop && !p.crop.dead && p.crop.stage === 4);
/** A crow on the farm right now, flying in or pecking. */
const crowHere = (s: WorldState) => s.crows.some((c) => c.phase === 'in' || c.phase === 'peck');
const theCrow = (s: WorldState) => s.crows.find((c) => c.phase === 'in' || c.phase === 'peck') ?? null;

/** Features that arrive with no line of their own: crows start coming from day 5, on a dry day with something growing. */
const QUIET: { what: string; after: string[]; when(s: WorldState): boolean }[] = [{ what: 'pests', after: ['deliver'], when: (s) => s.day >= 5 }];

const anyThirsty = (s: WorldState) => s.plots.some((p) => p.crop && !p.crop.dead && p.crop.stage < 4 && !p.wet);

const LESSONS: Lesson[] = [
  {
    id: 'pull',
    after: [],
    unlocks: [],
    ready: () => true,
    text: (_s, touch) => (touch ? 'Walk to a radish. Hold Harvest.' : 'Walk to a radish. Space harvests it.'),
    done: (s, n) => n('harvest') >= 4 || !anyRipe(s),
  },
  {
    id: 'water',
    after: ['pull'],
    unlocks: ['can'],
    ready: () => true,
    text: () => 'Take the can. Water the carrots.',
    done: (s, n) => n('water') >= 4 || !anyThirsty(s),
  },
  {
    id: 'well',
    after: ['water'],
    unlocks: [],
    ready: (s) => s.water <= 3,
    text: () => 'Can nearly dry. Fill it at the well.',
    done: (_s, n) => n('refill') >= 1,
  },
  {
    id: 'sleep',
    after: ['water'],
    unlocks: ['sleep'],
    ready: () => true,
    text: () => 'Done for today. Sleep.',
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
  },
  {
    id: 'requests',
    after: ['plant'],
    unlocks: ['board', 'requests'],
    ready: (s) => s.day >= 3,
    text: () => 'A request is pinned on the board.',
    done: (_s, n) => n('board') >= 1,
  },
  {
    id: 'deliver',
    after: ['requests'],
    unlocks: [],
    ready: () => true,
    text: () => 'Grow it. It ships with the crate.',
    passive: 8,
  },
  {
    id: 'field',
    after: ['deliver'],
    unlocks: ['hoe'],
    ready: (s) => s.coins >= 200 && s.parcels.filter((p) => p.owned).length === 1,
    text: () => 'Buy a second field. Hoe it first.',
    done: (s, n) => s.parcels.filter((p) => p.owned).length >= 2 && n('till') >= 2,
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
    text: () => 'Scarecrows keep crows away. Build one.',
    passive: 9,
  },
  {
    id: 'turn',
    after: ['plant'],
    unlocks: [],
    ready: (s) => dayOfSeason(s.day) >= 8,
    text: () => 'Season ends soon. Plant what grows next.',
    passive: 9,
  },
  {
    id: 'smith',
    after: ['deliver'],
    unlocks: ['smith'],
    ready: (s) => s.rep >= 1,
    text: () => 'The smith has better tools now.',
    passive: 9,
  },
];

/** Every line any lesson can show, on touch and on keys: for checks of length and wording. */
export function allLines(s: WorldState): string[] {
  return [...new Set(LESSONS.flatMap((l) => [l.text(s, true), l.text(s, false)]))];
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
  update(s: WorldState, dt: number, touch: boolean): { line: string; cmds: Command[]; point: { x: number; y: number } | null } {
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
    const up = !!this.active && s.turnover < 0;
    return { line: up ? this.active!.text(s, touch) : '', cmds, point: up ? (this.active!.point?.(s) ?? null) : null };
  }
}

/** A farm saved before the lessons existed: credit what it has clearly done. */
export function inferLessons(s: WorldState): void {
  s.learn ??= [];
  s.learnCount ??= {};
  if (s.learn.length) return;
  const harvested = Object.values(s.stats.harvested).reduce((a, b) => a + b, 0);
  const add = (...xs: string[]) => xs.forEach((x) => s.learn.includes(x) || s.learn.push(x));
  if (harvested > 0 || s.stats.days > 0) add('lesson:pull', 'can');
  if (s.stats.days > 0) add('lesson:water', 'lesson:sleep', 'sleep', 'coins', 'seeds', 'stamina');
  if (s.parcels.filter((p) => p.owned).length > 1) add('hoe');
}
