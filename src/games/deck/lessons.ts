// Seedbound teaches itself one thing at a time. The first season starts with
// the plot and two radishes; each lesson brings one piece of the table in,
// shows one short line (eight words at most, one action), and waits until the
// player has done it. Whatever no lesson has brought in is not on the table.
// The board's previews and the scoring do the explaining; the notes only say
// what to do next. Lessons fire on what is happening, not on the day number,
// so a run that strays from the guided deals still gets each one when it
// first matters.

import { CARDS, costOf, crowReach, energyMax, extraGrowth, isRipe, MASS, neighbours, nextSeason, PLURALS, ripeTonight, SEASON_NAMES, targetsFor, TUNING, type Card, type CardId, type RunState, type SeedId } from './rules';

/** Pieces of the table that arrive with a lesson. The plot, the hand and the almanac are always there. */
export type Piece = 'lantern' | 'peg' | 'scoops' | 'bloom' | 'coins' | 'tin' | 'spent' | 'tonight' | 'pages' | 'services';
export const PIECES: Piece[] = ['lantern', 'peg', 'scoops', 'bloom', 'coins', 'tin', 'spent', 'tonight', 'pages', 'services'];

/** What the player has learned, kept in the save with the meta unlocks. */
export interface Learn {
  seen: Piece[];
  done: string[];
  /** Counts the lessons wait on: plant, pick, night, harvest, toss, tin, detail, dear (a card of two scoops or more played), buy, leave, stall, crow... */
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
  /** On touch, the held card is aimed at a plot and waits for its second tap. */
  aimed: boolean;
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
  /** Put away unfinished, to come back when it next matters (the hand no longer has a spare card). */
  away?(v: View): boolean;
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
/**
 * A card the player can bring out now: in the hand. Not one still in the tin (the fifth playtest's first crow said
 * "Set out the scarecrow." with the scarecrow in the tin), nor one already standing on the plot (the third playtest
 * was told to set out the one on C2).
 */
const toHand = (s: RunState, id: CardId) => s.hand.some((c) => c.id === id);
/**
 * A card in hand with nowhere to go: no plot it can be played on today. The spent lesson waits for one (guided day 6
 * said "Drag a spare card to Spent." with all three cards needed, and stayed up with the hand empty). Round 7: not a
 * card that is only dear today: the seventh playtest was told to toss a strawberry the scoops could not pay for that
 * day, and threw out a good card that would have been sown the next morning.
 */
export function spareCard(s: RunState): Card | undefined {
  return s.hand.find((c, i) => CARDS[c.id].target !== 'board' && targetsFor(s, i).length === 0);
}
/**
 * Round 8: a card the scoops cannot pay for today, once nothing else in the hand can be played: the hand is stuck. The
 * eighth playtest's corn runs ended days with three to five three-scoop corn cards in hand and never met the spent
 * heap, whose lesson came only for a card with no plot. A card that is merely dear while others can still be played
 * is not one (round 7: the playtest tossed a strawberry it would have sown the next morning).
 */
export function dearCard(s: RunState): Card | undefined {
  const playable = (c: Card, i: number) => costOf(c.id, c.up) <= s.energy && (CARDS[c.id].target === 'board' || targetsFor(s, i).length > 0);
  if (s.hand.some(playable)) return undefined;
  return s.hand.find((c, i) => costOf(c.id, c.up) > s.energy && (CARDS[c.id].target === 'board' || targetsFor(s, i).length > 0));
}
const standing = (s: RunState, obj: 'scarecrow' | 'beehive') => s.plots.some((p) => p.obj === obj);
/** The pair in hand that is one or the other (round 9), if any. */
export const pairCards = (s: RunState): [Card, Card] | null => {
  const e = s.either;
  if (!e) return null;
  const a = s.hand.find((c) => c.uid === e[0]);
  const b = s.hand.find((c) => c.uid === e[1]);
  return a && b ? [a, b] : null;
};

/**
 * Round 9: what a crow about tonight means for this plot, in one line. With a scarecrow standing it names the ripe
 * crops outside its 3 by 3 ("The crow can reach your carrot."), and says it keeps watch only when none are; the ninth
 * playtest was told "Your scarecrow keeps watch." while the carrot on D4 sat outside it, and the crow took it.
 */
export function crowLine(s: RunState): string {
  if (toHand(s, 'scarecrow')) return 'A crow is about. Set out the scarecrow.';
  if (!standing(s, 'scarecrow')) return 'A crow will take a ripe crop tonight.';
  const reach = crowReach(s);
  if (!reach.length) return 'A crow is about. Your scarecrow keeps watch.';
  const kinds = [...new Set(reach.map((i) => s.plots[i].crop!.kind))];
  const one = (k: SeedId) => (MASS.includes(k) || k === 'beans' ? `your ${CARDS[k].name.toLowerCase()}` : reach.filter((i) => s.plots[i].crop!.kind === k).length > 1 ? `your ${PLURALS[k]}` : `your ${CARDS[k].name.toLowerCase()}`);
  if (kinds.length === 1) return `The crow can reach ${one(kinds[0])}.`;
  if (kinds.length === 2) return `The crow can reach ${one(kinds[0])} and ${one(kinds[1]).replace(/^your /, '')}.`;
  return `The crow can reach ${WORDS[reach.length] ?? reach.length} ripe crops.`;
}
/** A dear card in hand the scoops can pay for: two scoops or more. */
const dear = (v: View) => v.s.hand.find((c) => costOf(c.id, c.up) >= 2 && affordable(v, c));
const morning = (s: RunState) => s.energy === s.bench;

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
      if (v.held && CARDS[v.held.id].type === 'seed' && v.aimed) return 'Tap the plot again to plant.';
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
    text: () => `Fill the pegboard by day ${WORDS[TUNING.days] ?? TUNING.days}.`,
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
    // Round 9: the guided day 3 deals a radish or a carrot, one of the two, and the previews show what each pays: the
    // spring's first real choice (the ninth playtest: "spring is set hands, so there are no real decisions").
    id: 'either',
    after: ['companion'],
    unlocks: [],
    where: 'table',
    ready: (v) => v.s.phase === 'day' && !!pairCards(v.s),
    text: (v) => {
      const [a, b] = pairCards(v.s) ?? [];
      return a && b ? `Plant a ${name(a.id)} or a ${name(b.id)}, not both.` : 'Plant one of the two.';
    },
    point: (v) => (v.held ? 'board' : 'hand'),
    done: (v) => !v.s.either || nightPassed(v, 'either'),
  },
  {
    id: 'bloom',
    after: ['companion'],
    unlocks: ['bloom'],
    where: 'table',
    // Round 9: also once its day has gone by, or once a radish rings the carrot that ripens tonight: the day 3 pair can
    // take the radish it waits for (then it is done at once, never shown), and the lessons after it must still come.
    ready: (v) =>
      v.s.phase === 'day' &&
      ((v.s.energy > 0 && inHand(v, 'radish') >= 0 && carrots(v.s).some((i) => ripeTonight(v.s, i) && neighbours(v.s, i).some((j) => !v.s.plots[j].crop && !v.s.plots[j].obj))) ||
        carrots(v.s).some((i) => ripeTonight(v.s, i) && radishesBy(v.s, i) > 0) ||
        v.s.day > 3 ||
        v.s.season > 0 ||
        v.s.year > 1),
    text: () => 'The carrot ripens tonight. Ring it with radishes.',
    point: (v) => (v.held ? 'board' : 'hand'),
    done: (v) => carrots(v.s).some((i) => radishesBy(v.s, i) >= 2) || inHand(v, 'radish') < 0 || v.s.energy === 0 || !carrots(v.s).some((i) => ripeTonight(v.s, i)) || nightPassed(v, 'bloom'),
  },
  {
    // Cost, one piece at a time: the scoops and the cost printed on every card arrive with the first
    // dear seed (the beans, two scoops), since quick crops cost little and the first days never run short.
    id: 'scoops',
    after: ['newcard'],
    unlocks: ['scoops'],
    where: 'table',
    ready: (v) => v.s.phase === 'day' && (!!dear(v) || handCost(v.s) > v.s.energy),
    text: (v) => {
      const d = dear(v);
      if (d) return `Spend ${WORDS[costOf(d.id, d.up)]} scoops on the ${name(d.id)}.`;
      const e = v.s.energy;
      // Spent, or nothing left the scoops can pay for: the day is done; they refill.
      if (e === 0 || !v.s.hand.some((c) => affordable(v, c))) return 'End the day. The scoops refill at dawn.';
      if (e === 1) return 'Spend your last scoop.';
      return `Spend your ${WORDS[e] ?? e} scoops.`;
    },
    point: (v) => (v.s.energy === 0 || !v.s.hand.some((c) => affordable(v, c)) ? 'lantern' : v.held ? 'board' : 'scoops'),
    // Done once the dear seed is sown (a lesson that came up short of scoops runs to the day's end).
    done: (v) => nightPassed(v, 'scoops') || v.n('dear') > v.n('at:scoops:dear'),
  },
  {
    // Then the scoops a pulled crop puts back, at the first dawn the bench holds more than its refill.
    id: 'saved',
    after: ['scoops'],
    unlocks: [],
    where: 'table',
    ready: (v) => v.s.phase === 'day' && v.s.bench > energyMax(v.s) && morning(v.s),
    text: () => 'Crops pulled last night put scoops back.',
    point: () => 'scoops',
    done: (v) => nightPassed(v, 'saved') || !morning(v.s),
    passive: 5,
  },
  {
    id: 'tin',
    after: ['scoops'],
    unlocks: ['tin'],
    where: 'table',
    ready: (v) => v.s.phase === 'day' && (v.s.day >= 5 || v.s.season > 0 || v.s.year > 1),
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
    // A card with nowhere to go, or (round 8) a hand stuck with cards the scoops cannot pay for today.
    ready: (v) => v.s.phase === 'day' && !v.s.tossed && v.s.hand.length >= 2 && (!!spareCard(v.s) || !!dearCard(v.s)) && (v.s.day >= 6 || v.s.season > 0 || v.s.year > 1),
    text: (v) => {
      const spare = spareCard(v.s);
      const dear = spare ? undefined : dearCard(v.s);
      if (v.dev === 'key') return dear ? `Press Shift ${v.s.hand.indexOf(dear) + 1}, then X.` : 'Take a card up, then press X.';
      return dear ? 'Drag a card too dear today to Spent.' : 'Drag a spare card to Spent.';
    },
    point: () => 'heap',
    done: (v) => v.n('toss') >= 1 || nightPassed(v, 'spent'),
    // No spare or stuck card left in the hand (played, or the hand empty): put away until one comes.
    away: (v) => !spareCard(v.s) && !dearCard(v.s) && !v.s.tossed,
  },
  {
    id: 'newcard',
    after: ['bloom'],
    unlocks: [],
    where: 'table',
    ready: (v) => v.s.phase === 'day' && v.s.hand.some((c) => !v.learn.cards.includes(c.id)),
    text: (v) => (v.dev === 'touch' ? 'Hold the new card to read it.' : v.dev === 'mouse' ? 'Rest the pointer on the new card.' : 'Take it up, then press I.'),
    point: () => 'hand',
    done: (v) => v.n('detail') > v.n('at:newcard:detail') || nightPassed(v, 'newcard'),
  },
  {
    // First what pests cost, then (next) the answer: the first pest lesson used to name garlic before saying it.
    id: 'pests',
    after: ['scoops'],
    unlocks: [],
    where: 'table',
    ready: (v) => v.s.phase === 'day' && v.s.plots.some((p) => p.crop?.pest),
    text: () => `Pests halve that crop's pay for ${WORDS[TUNING.pestNights] ?? TUNING.pestNights} nights.`,
    point: () => 'board',
    done: (v) => nightPassed(v, 'pests'),
    passive: 5,
  },
  {
    id: 'pestfix',
    after: ['pests'],
    unlocks: [],
    where: 'table',
    // Only a card the player can still bring out is named.
    ready: (v) => v.s.phase === 'day' && v.s.plots.some((p) => p.crop?.pest) && (toHand(v.s, 'ladybirds') || toHand(v.s, 'garlic')),
    away: (v) => !toHand(v.s, 'ladybirds') && !toHand(v.s, 'garlic'),
    text: (v) => (toHand(v.s, 'ladybirds') ? 'Clear the pests with ladybirds.' : 'Garlic keeps pests off its neighbours.'),
    point: () => 'board',
    done: (v) => nightPassed(v, 'pestfix'),
    passive: 6,
  },
  {
    id: 'crows',
    after: ['scoops'],
    unlocks: [],
    where: 'table',
    // At dawn, while there is still a day to answer it.
    ready: (v) => v.s.phase === 'day' && v.s.crow,
    text: (v) => crowLine(v.s),
    point: () => 'board',
    done: (v) => nightPassed(v, 'crows'),
    passive: 6,
  },
  {
    // The season's twist: from year 2 each stall offers two plain rules for the season ahead; pick one.
    id: 'twist',
    after: ['coins'],
    unlocks: [],
    where: 'stall',
    ready: (v) => v.s.phase === 'shop' && !!v.s.shop?.twists?.length,
    text: (v) => `Pick one of the two for ${SEASON_NAMES[nextSeason(v.s).season]}.`,
    point: () => 'stall',
    done: (v) => v.s.shop?.twist !== undefined || v.n('leave') > v.n('at:twist:leave'),
  },
  {
    // Round 7: a run's first stall offers an engine to take home, free. Its pick comes before the purse's lesson.
    id: 'engine',
    after: [],
    unlocks: [],
    where: 'stall',
    ready: (v) => v.s.phase === 'shop' && !!v.s.shop?.engines?.length && v.s.shop.engine === undefined,
    // Round 8: the stall's own line over the three says it, with "free" (later runs had no line at all).
    text: () => 'Pick one to take home, free.',
    point: () => 'stall',
    done: (v) => v.s.shop?.engine !== undefined || v.n('leave') > v.n('at:engine:leave'),
  },
  {
    id: 'coins',
    after: [],
    unlocks: ['coins'],
    where: 'stall',
    // After the engine's pick, at a stall that offers one.
    ready: (v) => v.s.phase === 'shop' && !(v.s.shop?.engines?.length && v.s.shop.engine === undefined),
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

/** Lessons a returning player sees again: the watering can and the weather no longer work as they did, and scoops come back from pulled crops. */
export const REFRESH = ['can', 'weather', 'saved', 'twist', 'engine'];

export function newLearn(): Learn {
  return { seen: [], done: [], n: {}, cards: [] };
}

/**
 * Round 8: a returning player has earned the whole table. Every piece a lesson brings in is there from the start of a
 * run after the first one finishes, whatever the first run reached (the eighth playtest's guided run ended after 42
 * days without the spent heap or the weather, and runs 2 to 4 never had the heap). Lessons not yet given still come
 * when they first matter. Returns true if anything was added.
 */
export function earnTable(learn: Learn, runsFinished: number): boolean {
  if (runsFinished < 1) return false;
  const add = PIECES.filter((p) => !learn.seen.includes(p));
  learn.seen.push(...add);
  return add.length > 0;
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
   * starts and passive lessons do not count down. `hidden` (round 9) is true
   * while a note stands in the lesson strip in front of the lesson: it waits
   * behind the note and its time starts when it shows (the ninth playtest's
   * pest lesson came up behind "54 carried over from summer." and was gone
   * three seconds after the note).
   */
  update(s: RunState, dev: Dev, held: Card | null, dt: number, quiet: boolean, aimed = false, hidden = false): { line: Line | null; unlocked: Piece[] } {
    const unlocked: Piece[] = [];
    const view: View = { s, dev, held, aimed, learn: this.learn, n: (k) => this.n(k), shown: this.shown };
    if (this.active) {
      const l = this.active;
      const onStall = l.where === 'stall';
      if (onStall || (!quiet && !hidden)) this.shown += dt;
      view.shown = this.shown;
      const over = l.done(view) || (l.passive !== undefined && this.shown >= l.passive);
      if (over) {
        this.learn.done.push(l.id);
        if (l.id === 'newcard') this.meet(s);
        this.active = null;
      } else if (l.away?.(view)) this.active = null;
    }
    if (!this.active) {
      const done = (id: string) => this.learn.done.includes(id);
      const next = LESSONS.find((l) => !done(l.id) && l.after.every(done) && (l.where === 'stall' ? s.phase === 'shop' : !quiet) && l.ready(view));
      if (next) {
        this.active = next;
        this.shown = 0;
        this.learn.n[`at:${next.id}`] = this.n('night');
        for (const k of ['pick', 'leave', 'detail', 'dear']) this.learn.n[`at:${next.id}:${k}`] = this.n(k);
        for (const p of next.unlocks) if (this.unlock(p)) unlocked.push(p);
        view.shown = 0;
        // Round 9: a lesson already done as it comes (the player did it unasked) is marked done and never shown.
        if (next.done(view)) {
          this.learn.done.push(next.id);
          if (next.id === 'newcard') this.meet(s);
          this.active = null;
        }
      }
    }
    // Cards in hand when no new-card lesson is pending are simply known: the guided days 1 to 3, and after it.
    if (this.learn.done.includes('newcard') || !this.learn.done.includes('bloom')) {
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
