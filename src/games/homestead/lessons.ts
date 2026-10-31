// Sunup teaches itself one thing at a time. The farm starts with only your
// hands and four ripe radishes; each lesson brings in one tool or system,
// says one line about it, and waits until you have done it before the next
// one appears. Everything a lesson has not introduced stays off the screen.

import type { Command } from '../../sim/commands';
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
}

const anyRipe = (s: WorldState) => s.plots.some((p, i) => s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned && p.crop && !p.crop.dead && p.crop.stage === 4);
const anyThirsty = (s: WorldState) => s.plots.some((p) => p.crop && !p.crop.dead && p.crop.stage < 4 && !p.wet);

const LESSONS: Lesson[] = [
  {
    id: 'pull',
    after: [],
    unlocks: [],
    ready: () => true,
    text: (_s, touch) => (touch ? 'Walk to a radish. Hold the hand.' : 'Walk to a radish. Space pulls it.'),
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
    id: 'plant',
    after: ['sleep'],
    unlocks: ['coins', 'seeds', 'stamina'],
    ready: () => true,
    text: () => 'Radishes sold. Sow seeds in bare soil.',
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
    id: 'pests',
    after: ['deliver'],
    unlocks: ['pests', 'build', 'forecast'],
    ready: (s) => s.day >= 5,
    text: () => 'Crows. Walk at them, or build a scarecrow.',
    done: (s, n) => n('scare') + n('build') >= 1 || s.day >= n('since:pests') + 2,
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

export class Tutor {
  private active: Lesson | null = null;

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
  update(s: WorldState, dt: number, touch: boolean): { line: string; cmds: Command[] } {
    const cmds: Command[] = [];
    const n = (k: string) => s.learnCount[k] ?? 0;
    const finished = (id: string) => s.learn.includes(`lesson:${id}`);
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
    if (!this.active && s.turnover < 0) {
      this.active = LESSONS.find((l) => !finished(l.id) && l.after.every(finished) && l.ready(s)) ?? null;
      if (this.active) {
        s.learnCount[`since:${this.active.id}`] = s.day;
        for (const what of this.active.unlocks) if (!s.learn.includes(what)) cmds.push({ type: 'unlock', what });
        // A lesson already satisfied (rain watered the carrots) passes quietly.
        if (!this.active.passive && this.active.done!(s, n)) return { line: '', cmds };
      }
    }
    return { line: this.active && s.turnover < 0 ? this.active.text(s, touch) : '', cmds };
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
