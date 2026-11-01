// Seedbound teaches itself one thing at a time. The first season starts with
// the plot and two radishes; each lesson brings one piece of the table in,
// shows one short line (eight words at most, one action), and waits until the
// player has done it. Whatever no lesson has brought in is not on the table.
// The board's previews and the scoring do the explaining; the notes only say
// what to do next. Lessons fire on what is happening, not on the day number,
// so a run that strays from the guided deals still gets each one when it
// first matters.

import { allCards, CARDS, costOf, extraGrowth, isRipe, neighbours, ripeTonight, TUNING, type Card, type CardId, type RunState } from './rules';

/** Pieces of the table that arrive with a lesson. The plot, the hand and the almanac are always there. */
export type Piece = 'lantern' | 'peg' | 'scoops' | 'bloom' | 'coins' | 'tin' | 'spent' | 'tonight' | 'pages' | 'services';
export const PIECES: Piece[] = ['lantern', 'peg', 'scoops', 'bloom', 'coins', 'tin', 'spent', 'tonight', 'pages', 'services'];

/** What the player has learned, kept in the save with the meta unlocks. */
export interface Learn {
  seen: Piece[];
  done: string[];
  /** Counts the lessons wait on: plant, pick, night, harvest, toss, tin, detail, buy, leave, stall, crow... */
  n: Record<string, number>;
  /** Card kinds the player has had in hand. */
  cards: string[];
}

/** Where a note points: the thing on the table it is about glows softly. */
export type Point = 'hand' | 'board' | 'lantern' | 'peg' | 'scoops' | 'tin' | 'heap' | 'stall';

export type Dev = 'touch' | 'mouse' | 'key';

export interface View {
  s: RunState;
  dev: Dev;
  held: Card | null;
  learn: Learn;
  n(k: string): number;
  /** Seconds the current lesson has been on screen. */
  shown: number;
}

interface Lesson {
  id: string;
  after: string[];
  unlocks: Piece[];
  /** On the table, or in the merchant's stall. */
  where: 'table' | 'stall';
  ready(v: View): boolean;
  text(v: View): string;
  point(v: View): Point;
  /** Finished? Passive lessons also finish on their own after `passive` seconds on screen. */
  done(v: View): boolean;
  passive?: number;
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const name = (id: CardId) => CARDS[id].name.toLowerCase();
const tap = (v: View) => (v.dev === 'touch' ? 'Tap' : 'Click');
const inHand = (v: View, id: CardId) => v.s.hand.findIndex((c) => c.id === id);
const affordable = (v: View, c: Card) => costOf(c.id, c.up) <= v.s.energy;
const handCost = (s: RunState) => s.hand.reduce((a, c) => a + costOf(c.id, c.up), 0);
const anyEmpty = (s: RunState) => s.plots.some((p) => !p.crop && !p.obj);
/** Nights passed since this lesson came up: a lesson about today ends with the day. */
const nightPassed = (v: View, id: string) => v.n('night') > v.n(`at:${id}`);
const carrots = (s: RunState) => s.plots.map((p, i) => (p.crop?.kind === 'carrot' ? i : -1)).filter((i) => i >= 0);
const radishesBy = (s: RunState, i: number) => neighbours(s, i).filter((j) => s.plots[j].crop?.kind === 'radish').length;
const seedKey = (v: View, c: Card) => `Press ${v.s.hand.indexOf(c) + 1} to take up a ${name(c.id)}.`;
const owns = (s: RunState, id: CardId) => allCards(s).some((c) => c.id === id);

/** Would this weather card bring something in tonight: a crop pulled tonight that otherwise would not be (rain, storm), or a harvest to warm (sun)? */
export function weatherHelps(s: RunState, id: CardId): boolean {
  if (id === 'sun') return s.plots.some((_, i) => ripeTonight(s, i));
  const add = id === 'storm' ? 2 : 1;
  return s.plots.some((p, i) => {
    const c = p.crop;
    if (!c || c.pest || isRipe(c) || ripeTonight(s, i)) return false;
    return c.age + 1 + extraGrowth(s) + p.boost + add >= c.days;
  });
}

const LESSONS: Lesson[] = [
  {
    id: 'sow',
    after: [],
    unlocks: [],
    where: 'table',
    ready: (v) => v.s.phase === 'day' && v.s.hand.some((c) => CARDS[c.id].type === 'seed') && anyEmpty(v.s),
    text: (v) => {
      if (v.held && CARDS[v.held.id].type === 'seed') return v.dev === 'key' ? 'Pick a plot with the arrows, then Enter.' : `${tap(v)} a plot to plant it.`;
      const seed = v.s.hand.find((c) => CARDS[c.id].type === 'seed' && affordable(v, c));
      if (!seed) return 'Plant a seed.';
      if (v.n('plant') >= 1) return `Plant the other ${name(seed.id)}.`;
      return v.dev === 'key' ? seedKey(v, seed) : `${tap(v)} a ${name(seed.id)} to take it up.`;
    },
    point: (v) => (v.held ? 'board' : 'hand'),
    done: (v) => v.n('plant') >= 2 || (v.n('plant') >= 1 && !v.s.hand.some((c) => CARDS[c.id].type === 'seed' && affordable(v, c))) || nightPassed(v, 'sow'),
  },
  {
    id: 'lantern',
    after: ['sow'],
    unlocks: ['lantern'],
    where: 'table',
    ready: (v) => v.s.phase === 'day',
    text: (v) => (v.dev === 'key' ? 'Press E to end the day.' : 'Blow out the lantern to end the day.'),
    point: () => 'lantern',
    done: (v) => v.n('night') >= 1,
  },
  {
    id: 'peg',
    after: ['lantern'],
    unlocks: ['peg'],
    where: 'table',
    ready: (v) => v.s.phase === 'day' && (v.learn.seen.includes('peg') || v.n('harvest') >= 1),
    text: () => `Reach the brass hole by day ${WORDS[TUNING.days] ?? TUNING.days}.`,
    point: () => 'peg',
    done: (v) => v.n('pick') > v.n('at:peg:pick') || nightPassed(v, 'peg'),
    passive: 5,
  },
  {
    id: 'stakes',
    after: ['peg'],
    unlocks: [],
    where: 'table',
    ready: (v) => v.s.phase === 'day',
    text: () => 'Miss it, and the run ends.',
    point: () => 'peg',
    done: (v) => v.n('pick') > v.n('at:stakes:pick') || nightPassed(v, 'stakes'),
    passive: 4,
  },
  {
    id: 'companion',
    after: ['stakes'],
    unlocks: [],
    where: 'table',
    ready: (v) => v.s.phase === 'day' && inHand(v, 'radish') >= 0 && (carrots(v.s).length > 0 || inHand(v, 'carrot') >= 0) && v.s.energy > 0,
    text: (v) => {
      if (!carrots(v.s).length) return v.held?.id === 'carrot' ? `${v.dev === 'key' ? 'Pick' : tap(v)} a plot for the carrot.` : 'Plant the carrot first.';
      return 'Plant a radish beside the carrot.';
    },
    point: (v) => (v.held ? 'board' : 'hand'),
    done: (v) => carrots(v.s).some((i) => radishesBy(v.s, i) > 0) || inHand(v, 'radish') < 0 || v.s.energy === 0 || nightPassed(v, 'companion'),
  },
  {
    id: 'bloom',
    after: ['companion'],
    unlocks: ['bloom'],
    where: 'table',
    ready: (v) =>
      v.s.phase === 'day' &&
      v.s.energy > 0 &&
      inHand(v, 'radish') >= 0 &&
      carrots(v.s).some((i) => ripeTonight(v.s, i) && neighbours(v.s, i).some((j) => !v.s.plots[j].crop && !v.s.plots[j].obj)),
    text: () => 'The carrot ripens tonight. Ring it with radishes.',
    point: (v) => (v.held ? 'board' : 'hand'),
    done: (v) => carrots(v.s).some((i) => radishesBy(v.s, i) >= 2) || inHand(v, 'radish') < 0 || v.s.energy === 0 || nightPassed(v, 'bloom'),
  },
  {
    id: 'scoops',
    after: ['sow'],
    unlocks: ['scoops'],
    where: 'table',
    ready: (v) => v.s.phase === 'day' && handCost(v.s) > v.s.energy,
    text: (v) => {
      const e = v.s.energy;
      // Spent, or nothing left the scoops can pay for: the day is done; they refill.
      if (e === 0 || !v.s.hand.some((c) => affordable(v, c))) return 'End the day. The scoops refill at dawn.';
      if (e === 1) return 'Spend your last scoop.';
      return `Spend your ${WORDS[e] ?? e} scoops.`;
    },
    point: (v) => (v.s.energy === 0 || !v.s.hand.some((c) => affordable(v, c)) ? 'lantern' : 'scoops'),
    done: (v) => nightPassed(v, 'scoops'),
  },
  {
    id: 'tin',
    after: ['scoops'],
    unlocks: ['tin'],
    where: 'table',
    ready: (v) => v.s.phase === 'day' && (v.s.day >= 4 || v.s.season > 0 || v.s.year > 1),
    text: (v) => (v.dev === 'key' ? 'Press D to see your cards.' : `${tap(v)} the tin to see your cards.`),
    point: () => 'tin',
    done: (v) => v.n('tin') >= 1 || nightPassed(v, 'tin'),
  },
  {
    id: 'can',
    after: ['scoops'],
    unlocks: [],
    where: 'table',
    ready: (v) => v.s.phase === 'day' && inHand(v, 'can') >= 0 && v.s.plots.some((p, i) => p.crop && !isRipe(p.crop) && !ripeTonight(v.s, i)),
    text: () => 'Water a row to grow it faster.',
    point: (v) => (v.held ? 'board' : 'hand'),
    done: (v) => v.n('can') >= 1 || inHand(v, 'can') < 0 || nightPassed(v, 'can'),
  },
  {
    id: 'weather',
    after: ['scoops'],
    unlocks: ['tonight'],
    where: 'table',
    // Only when the weather would bring a crop in tonight, so the lesson never spends a scoop on nothing.
    ready: (v) => v.s.phase === 'day' && v.s.hand.some((c) => CARDS[c.id].type === 'weather' && affordable(v, c) && weatherHelps(v.s, c.id)),
    text: (v) => {
      const c = v.s.hand.find((x) => CARDS[x.id].type === 'weather');
      if (v.dev === 'key' && c) return `Press ${v.s.hand.indexOf(c) + 1}, then Enter, for the weather.`;
      return 'Drop the weather anywhere on the plot.';
    },
    point: (v) => (v.held ? 'board' : 'hand'),
    done: (v) => v.n('weather') >= 1 || !v.s.hand.some((c) => CARDS[c.id].type === 'weather') || nightPassed(v, 'weather'),
  },
  {
    id: 'spent',
    after: ['tin'],
    unlocks: ['spent'],
    where: 'table',
    ready: (v) => v.s.phase === 'day' && !v.s.tossed && v.s.hand.length >= 3 && (v.s.day >= 5 || v.s.season > 0 || v.s.year > 1),
    text: (v) => (v.dev === 'key' ? 'Take a card up, then press X.' : 'Drag a spare card to Spent.'),
    point: () => 'heap',
    done: (v) => v.n('toss') >= 1 || nightPassed(v, 'spent'),
  },
  {
    id: 'newcard',
    after: ['scoops'],
    unlocks: [],
    where: 'table',
    ready: (v) => v.s.phase === 'day' && v.s.hand.some((c) => !v.learn.cards.includes(c.id)),
    text: (v) => (v.dev === 'touch' ? 'Press and hold the new card to read it.' : v.dev === 'mouse' ? 'Rest the pointer on the new card.' : 'Take it up, then press I.'),
    point: () => 'hand',
    done: (v) => v.n('detail') > v.n('at:newcard:detail') || nightPassed(v, 'newcard'),
  },
  {
    id: 'pests',
    after: ['scoops'],
    unlocks: [],
    where: 'table',
    ready: (v) => v.s.phase === 'day' && v.s.plots.some((p) => p.crop?.pest),
    // Only a card the player owns is named.
    text: (v) =>
      owns(v.s, 'ladybirds') ? 'Clear the pests with ladybirds.' : owns(v.s, 'garlic') ? 'Garlic keeps pests off its neighbours.' : `Pests stop that crop for ${WORDS[TUNING.pestNights] ?? TUNING.pestNights} nights.`,
    point: () => 'board',
    done: (v) => nightPassed(v, 'pests'),
    passive: 6,
  },
  {
    id: 'crows',
    after: ['scoops'],
    unlocks: [],
    where: 'table',
    // At dawn, while there is still a day to answer it.
    ready: (v) => v.s.phase === 'day' && v.s.crow,
    text: (v) => (owns(v.s, 'scarecrow') ? 'A crow is about. Set out the scarecrow.' : 'A crow will take a ripe crop tonight.'),
    point: () => 'board',
    done: (v) => nightPassed(v, 'crows'),
    passive: 6,
  },
  {
    id: 'coins',
    after: [],
    unlocks: ['coins'],
    where: 'stall',
    ready: (v) => v.s.phase === 'shop',
    text: () => 'Buy a seed with your coins.',
    point: () => 'stall',
    done: (v) => v.n('buy') >= 1 || v.n('leave') > v.n('at:coins:leave'),
  },
  {
    id: 'pages',
    after: ['coins'],
    unlocks: ['pages'],
    where: 'stall',
    ready: (v) => v.s.phase === 'shop' && v.n('stall') >= 2,
    text: () => 'Pin a page to change the rules.',
    point: () => 'stall',
    done: (v) => v.n('page') >= 1 || v.n('leave') > v.n('at:pages:leave'),
  },
  {
    id: 'services',
    after: ['pages'],
    unlocks: ['services'],
    where: 'stall',
    ready: (v) => v.s.phase === 'shop' && v.n('stall') >= 3,
    text: () => 'Throw out or improve a card here.',
    point: () => 'stall',
    done: (v) => v.n('service') >= 1 || v.n('leave') > v.n('at:services:leave'),
  },
];

export const LESSON_IDS = LESSONS.map((l) => l.id);

/** Lessons a returning player sees again: the watering can and the weather no longer work as they did. */
export const REFRESH = ['can', 'weather'];

export function newLearn(): Learn {
  return { seen: [], done: [], n: {}, cards: [] };
}

/** Everything brought in and taught: a player with finished runs, or an older save. */
export function learnedAll(refresh: readonly string[] = []): Learn {
  return { seen: [...PIECES], done: LESSON_IDS.filter((id) => !refresh.includes(id)), n: {}, cards: [] };
}

export interface Line {
  id: string;
  text: string;
  where: 'table' | 'stall';
  point: Point;
}

export class Tutor {
  private active: Lesson | null = null;
  private shown = 0;

  constructor(public learn: Learn) {}

  get lesson(): string | null {
    return this.active?.id ?? null;
  }

  /** A new run: whatever lesson was up is put away unfinished, to come back when it next matters. */
  drop(): void {
    this.active = null;
    this.shown = 0;
  }

  count(k: string, by = 1): void {
    this.learn.n[k] = (this.learn.n[k] ?? 0) + by;
  }

  n(k: string): number {
    return this.learn.n[k] ?? 0;
  }

  seen(p: Piece): boolean {
    return this.learn.seen.includes(p);
  }

  /** Bring a piece onto the table now (the pegboard at the first harvest, bloom at the first bloom). Returns true if it is new. */
  unlock(p: Piece): boolean {
    if (this.seen(p)) return false;
    this.learn.seen.push(p);
    return true;
  }

  /** Note the card kinds in hand once the new-card lesson has had its say. */
  private meet(s: RunState): void {
    for (const c of s.hand) if (!this.learn.cards.includes(c.id)) this.learn.cards.push(c.id);
  }

  /**
   * Once a frame (and after every action): finish the lesson on screen if it is
   * done, start the next ready one, and return the line to show (or null).
   * `quiet` is true while the night runs or a sheet covers the table: nothing
   * starts and passive lessons do not count down.
   */
  update(s: RunState, dev: Dev, held: Card | null, dt: number, quiet: boolean): { line: Line | null; unlocked: Piece[] } {
    const unlocked: Piece[] = [];
    const view: View = { s, dev, held, learn: this.learn, n: (k) => this.n(k), shown: this.shown };
    if (this.active) {
      const l = this.active;
      const onStall = l.where === 'stall';
      if (!quiet || onStall) this.shown += dt;
      view.shown = this.shown;
      const over = l.done(view) || (l.passive !== undefined && this.shown >= l.passive);
      if (over) {
        this.learn.done.push(l.id);
        if (l.id === 'newcard') this.meet(s);
        this.active = null;
      }
    }
    if (!this.active) {
      const done = (id: string) => this.learn.done.includes(id);
      const next = LESSONS.find((l) => !done(l.id) && l.after.every(done) && (l.where === 'stall' ? s.phase === 'shop' : !quiet) && l.ready(view));
      if (next) {
        this.active = next;
        this.shown = 0;
        this.learn.n[`at:${next.id}`] = this.n('night');
        for (const k of ['pick', 'leave', 'detail']) this.learn.n[`at:${next.id}:${k}`] = this.n(k);
        for (const p of next.unlocks) if (this.unlock(p)) unlocked.push(p);
        view.shown = 0;
      }
    }
    // Cards in hand when no new-card lesson is pending are simply known.
    if (this.learn.done.includes('newcard') || !this.learn.done.includes('scoops')) {
      if (this.active?.id !== 'newcard') this.meet(s);
    }
    const l = this.active;
    if (!l) return { line: null, unlocked };
    if (l.where === 'table' && quiet) return { line: null, unlocked };
    if (l.where === 'stall' && s.phase !== 'shop') return { line: null, unlocked };
    return { line: { id: l.id, text: l.text(view), where: l.where, point: l.point(view) }, unlocked };
  }
}

/** Words in a note, for checks: every note is one short line. */
export function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
