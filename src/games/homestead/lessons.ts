// Sunup teaches itself one thing at a time. The farm starts with only your
// hands and four ripe radishes; each lesson brings in one tool or system,
// says one line about it, and waits until you have done it before the next
// one appears. Everything a lesson has not introduced stays off the screen.
// A line about a place on the farm points at it: a chevron over it, or on
// the screen's edge, turned towards it, while it is out of view.

import type { Command } from '../../sim/commands';
import { BUILD_COST, FIELD_SEED, TOOL_UPGRADES } from '../../sim/constants';
import { CROP_IDS, CROPS, cropWord } from '../../sim/crops';
import { nightsToTurn, sowing, workLeft } from '../../sim/actions';
import { guardedSure } from '../../sim/day';
import { isTaken, offered, requestProgress, ripeFor, sowByOf, stillToSow, stockCount, wanted } from '../../sim/goals';
import { PROPS } from '../../sim/map';
import { season, SEASON_NAMES } from '../../sim/world';
import type { BuildKind, Crop, SimEvent, WorldState } from '../../sim/types';

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
  /**
   * Finished? `n` reads the counts the tutor keeps; `acted` says the farmer has done the lesson's `act` since its
   * line came up. Passive lessons finish when the farmer does their `act`, or once their line has been on screen for
   * `passive` seconds while the farmer stood idle (round 7: the forecast and sprinkler lines ended on an 8 to 10 s
   * timer while the tester was busy, and were never read). Every line stays at least `MIN_SHOW` seconds.
   */
  done?(s: WorldState, n: (k: string) => number, acted: boolean): boolean;
  passive?: number;
  /**
   * Brings something new onto the screen, so it waits for a day when nothing else has: the crow, the Build tool, the
   * forecast and the smith come one a day, each with its own line.
   */
  stagger?: boolean;
  /**
   * Takes over from a calm lesson when it becomes ready (a crow will not wait), which comes back after. Urgent
   * lessons have a clear order: a higher one takes over from a lower one (a crow from bugs, bugs from the new field).
   */
  urgent?: number;
  /** Only for a keyboard: on touch it passes quietly. */
  keys?: boolean;
  /** The count that goes up when the farmer does what the line says (an urgent lesson ended by the farmer counts at once). */
  act?: string;
  /** A tile to point at while the line is up (a chevron over it, or at the screen's edge when it is out of view). */
  point?(s: WorldState): Point | null;
  /**
   * What the pointer builds: a tap inside its target tile (or on its edge arrow) asks before it builds one there,
   * once, and leaves the tool in hand alone.
   */
  build?: BuildKind;
  /** While this holds, the lesson steps aside (its line goes, unfinished) and waits: the scarecrow line while it cannot be paid for. */
  hold?(s: WorldState): boolean;
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
/**
 * The first request the player took, what was sown for it and is in the crate, and the nearest ripe crop sown for it
 * (round 6: only crops sown for a request count, so the pointer never shows one sown before it).
 */
const theRequest = (s: WorldState) => {
  for (const o of s.orders) {
    if (!isTaken(o)) continue;
    const it = o.items[0];
    const have = requestProgress(s, o).crate;
    const spots = ripeFor(s, o);
    const ripe = spots.length ? nearest(s, (_c, i) => spots.includes(i)) : null;
    if (ripe || have > 0) return { o, it, have, ripe };
  }
  return null;
};
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

/** The first request the player took that still wants seed sown for it before its sow-by day. */
const toSowFor = (s: WorldState) => s.orders.find((o) => isTaken(o) && s.day <= sowByOf(o) && stillToSow(s, o) > 0) ?? null;

/** Two requests offered together, neither accepted yet: the morning's choice. */
const thePair = (s: WorldState) => {
  const open = s.orders.filter((o) => o.pair !== undefined && offered(o));
  return open.find((o) => open.some((q) => q !== o && q.pair === o.pair)) ?? null;
};
/** Work waiting on the farm: ripe, thirsty or bugged crops, or a crow. A line never sends the farmer to bed over it. */
const busy = (s: WorldState) => {
  const w = workLeft(s);
  return w.ripe + w.thirsty + w.bugs + w.crows > 0;
};
/** Crops in the crate that would sell tonight (not kept for a request the player took). */
const sellable = (s: WorldState) => {
  const keep = wanted(s);
  return CROP_IDS.some((c) => stockCount(s, c) > (keep[c] ?? 0));
};
/** The day a lesson finished (0 for a farm that finished it before days were kept). */
const doneOn = (s: WorldState, id: string) => s.learnCount[`done:${id}`] ?? 0;
/** Bare, hoed soil with nothing built on it: where a scarecrow or a sprinkler can go. */
const bareAt = (s: WorldState, i: number) => !s.plots[i].crop && s.plots[i].tilled && s.tiles[i] === 'field' && !s.builds.some((b) => b.y * s.W + b.x === i);
/** Is a plot one of the middle four of its field (where one scarecrow or sprinkler reaches the most of it)? */
const midField = (s: WorldState, i: number) => {
  const p = s.parcels[s.parcelOf[i]];
  if (!p) return false;
  const dx = (i % s.W) - p.x;
  const dy = Math.floor(i / s.W) - p.y;
  return dx >= 1 && dx <= p.w - 2 && dy >= 1 && dy <= p.h - 2;
};
/** Does a plot's field have a growing crop a scarecrow does not watch for sure? */
const fieldOpen = (s: WorldState, i: number) => {
  const p = s.parcels[s.parcelOf[i]];
  if (!p) return false;
  for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
    const c = s.plots[y * s.W + x].crop;
    if (live(c) && c.stage >= 1 && !guardedSure(s, x, y)) return true;
  }
  return false;
};
/**
 * Where to build: bare soil in the middle of a field with crops a crow could
 * take (for a scarecrow), or of any field (for a sprinkler); else any bare
 * soil. Never a crop: building goes on bare soil only.
 */
const buildSpot = (s: WorldState, guard: boolean) =>
  nearest(s, (_c, i) => bareAt(s, i) && midField(s, i) && (!guard || fieldOpen(s, i))) ?? nearest(s, (_c, i) => bareAt(s, i) && midField(s, i)) ?? nearest(s, (_c, i) => bareAt(s, i));
/** The nearest bare plot, or null when every plot is sown or built on (a line about bare soil waits for one). */
const bareSpot = (s: WorldState) => nearest(s, (_c, i) => bareAt(s, i));
/** Can the smith make something now that the farm can pay for: a better can or hoe (one the farm has), its reputation and its coins enough? */
const smithReady = (s: WorldState) =>
  (['can', 'hoe'] as const).some((t) => {
    const u = TOOL_UPGRADES[t][s.tools[t]];
    return s.learn.includes(t) && u !== undefined && s.rep >= u.rep && s.coins >= u.cost;
  });

/** Features that arrive with no line of their own: crows and bugs start coming from day 5, once a request is understood. */
const QUIET: { what: string; after: string[]; when(s: WorldState): boolean }[] = [{ what: 'pests', after: ['deliver'], when: (s) => s.day >= 5 }];

const LESSONS: Lesson[] = [
  {
    // On a phone, tapping a plot walks there and does the job: the easiest first move. The stick and act button work too.
    id: 'pull',
    after: [],
    unlocks: [],
    ready: () => true,
    // Round 7: the keys are named ("Walk to a radish" did not say how on a desktop).
    text: (_s, touch) => (touch ? 'Tap a radish to harvest it.' : 'Walk with WASD. Space harvests a radish.'),
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
    // Never to bed with work waiting (unless the day is nearly gone).
    ready: (s) => !busy(s) || s.minute >= 720,
    text: () => 'Crops grow overnight. Sleep.',
    done: (s) => s.stats.days >= 1,
  },
  {
    // Seeds cost coins. With an empty purse and a full crate, the night is the answer.
    id: 'broke',
    after: ['sleep'],
    unlocks: [],
    // Only when the night really would sell something, and nothing else waits to be done first.
    ready: (s) => s.coins < 10 && sellable(s) && !busy(s),
    text: () => 'No coins left. Sleep to sell the crate.',
    done: (s) => s.coins >= 10,
  },
  {
    id: 'plant',
    after: ['sleep'],
    // Seeds cost coins, so the two come together; stamina waits for a line of its own.
    unlocks: ['coins', 'seeds'],
    ready: (s) => s.coins >= 10,
    text: () => 'Plant seeds in the bare soil.',
    done: (_s, n) => n('plant') >= 3,
    point: (s) => nearest(s, (c, i) => !c && s.plots[i].tilled && !s.builds.some((b) => b.y * s.W + b.x === i)),
  },
  {
    // The stamina bar comes on its own, the first time the day's work has worn it down a little.
    id: 'stamina',
    after: ['plant'],
    unlocks: ['stamina'],
    stagger: true,
    ready: (s) => s.stamina < 70,
    text: () => 'Watch your stamina. Each job uses some.',
    passive: 4,
  },
  {
    // However the field was bought (from the board, or by tapping it), owning
    // meadow brings the hoe and this line. It cuts in, like the crow: the
    // field is new and the line is about it.
    id: 'hoe',
    urgent: 1,
    act: 'till',
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
    // Round 6: a request counts only what is sown for it (crops already growing, or in the crate, never do), so the
    // first one says to sow for it, and points at bare soil. It ends when its seed is all in.
    id: 'sowfor',
    after: ['requests'],
    unlocks: [],
    act: 'plant',
    ready: (s) => !!toSowFor(s),
    text: (s) => {
      const o = toSowFor(s) ?? s.orders.find(isTaken);
      const it = o?.items[0];
      const n = o ? Math.max(1, stillToSow(s, o)) : 3;
      // (Round 7: says "more" when some are growing for it already.)
      const more = o && n < it!.n ? ' more' : '';
      return it ? `Plant ${n}${more} ${cropWord(it.crop, n)} for the request.` : 'Plant seeds for the request.';
    },
    done: (s) => !toSowFor(s),
    hold: (s) => !bareSpot(s),
    point: (s) => bareSpot(s),
  },
  {
    // Up when it matters: once a crop the request wants is ripe (or already in
    // the crate), not on the day the request is read. Names the request, points
    // at a ripe one, and ends when the crate holds enough or the request has
    // gone. From day 7 it comes anyway, so the lessons after it never wait on
    // a request nobody grew for.
    id: 'deliver',
    after: ['requests'],
    unlocks: [],
    // (Only a request the player took: an offer on the board is not yet theirs to fill.)
    ready: (s) => !!theRequest(s) || (s.day >= 7 && s.orders.some(isTaken)),
    text: (s) => {
      const it = (theRequest(s)?.o ?? s.orders.find(isTaken))?.items[0];
      return it ? `Harvest ${it.n} ${cropWord(it.crop, it.n)}. The crate ships them.` : 'Harvest what it asks. The crate ships it.';
    },
    done: (s) => {
      const r = theRequest(s);
      return !s.orders.some(isTaken) || (!!r && r.have >= r.it.n);
    },
    point: (s) => theRequest(s)?.ripe ?? prop('crate'),
  },
  {
    // The first pair of requests: only one of them can be taken, with the board's Accept. Points at the board; ends
    // when one is accepted (or the pair has gone). Planting never takes one.
    id: 'choose',
    after: ['deliver'],
    unlocks: [],
    act: 'board',
    ready: (s) => !!thePair(s),
    text: () => 'Two requests on the board. Accept one.',
    done: (s) => !thePair(s),
    point: () => ({ x: prop('board').x, y: prop('board').y + 0.1 }),
  },
  {
    // Not before buying it leaves coins to sow it (the fifth playtest spent 250 of 270 and sat broke for five days).
    // The board's Fields tab comes with it.
    id: 'field',
    after: ['deliver'],
    unlocks: ['fields'],
    ready: (s) => s.coins >= s.parcels[1].price + FIELD_SEED && fields(s) === 1,
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
    urgent: 3,
    act: 'scare',
    after: ['deliver'],
    // Only the line: the Build tool comes the next day, and the forecast the day after (one new thing a day).
    unlocks: [],
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
    // Shooed, or it flew off with its dinner: either way the crow has gone (and the line was seen while it was here).
    done: (s) => !crowHere(s),
  },
  {
    // The morning after the first crow: the Build tool arrives, with its own line, and points at bare soil in the
    // middle of a field a crow could visit (building goes on bare soil only, never on a crop). A tap on the pointer
    // takes the Build tool with a scarecrow and builds it there. It waits until a scarecrow is up: no timeout.
    id: 'scarecrow',
    after: ['pests'],
    unlocks: ['build'],
    stagger: true,
    act: 'build:scarecrow',
    // Held until the farm can pay for one (the fifth playtest was told to sleep at 6 am, with a request waiting), and
    // until there is bare soil to build on (the sixth was told to build on bare soil with every plot sown).
    ready: (s) => s.day > doneOn(s, 'pests') && s.coins >= BUILD_COST.scarecrow,
    hold: (s) => s.coins < BUILD_COST.scarecrow || !bareSpot(s),
    text: () => 'Build a scarecrow on bare soil.',
    done: (s, _n, acted) => acted || s.builds.some((b) => b.kind === 'scarecrow'),
    point: (s) => buildSpot(s, true),
    build: 'scarecrow',
  },
  {
    // The day after the Build tool: the forecast joins the day card.
    id: 'forecast',
    after: ['scarecrow'],
    unlocks: ['forecast'],
    stagger: true,
    ready: (s) => s.day > doneOn(s, 'scarecrow'),
    text: () => 'Check the forecast for rain and heat.',
    passive: 4,
  },
  {
    // Two fields want a lot of watering: a day the forecast has come and gone, the sprinkler joins the Build tool,
    // with its own line, pointing at bare soil in the middle of a field; a tap on the pointer builds one there.
    id: 'sprinkler',
    after: ['scarecrow', 'forecast'],
    unlocks: ['sprinkler'],
    stagger: true,
    act: 'build:sprinkler',
    ready: (s) => fields(s) >= 2 && s.coins >= BUILD_COST.sprinkler && s.day > doneOn(s, 'forecast'),
    text: () => 'Build a sprinkler to water around it.',
    passive: 6,
    hold: (s) => s.coins < BUILD_COST.sprinkler || !bareSpot(s),
    point: (s) => buildSpot(s, false),
    build: 'sprinkler',
  },
  {
    // Bugs come with the crows, quietly. Like the crow, the line waits for real
    // bugs on a real crop, names it, points at it, and ends when they are picked.
    id: 'bugs',
    urgent: 2,
    act: 'tend',
    after: ['deliver'],
    unlocks: [],
    ready: (s) => s.learn.includes('pests') && bugsHere(s),
    // Says to take the hands when something else is in hand (the act button then says Pick).
    text: (s) => {
      const at = theBugs(s);
      const c = at ? s.plots[Math.floor(at.y) * s.W + Math.floor(at.x)].crop : null;
      const crop = c ? CROPS[c.kind].plural.toLowerCase() : 'crops';
      return s.tool === 'hands' ? `Bugs on your ${crop}. Pick them off.` : `Take the hands. Pick bugs off the ${crop}.`;
    },
    point: (s) => theBugs(s),
    done: (s, n) => n('tend') >= 1 || !bugsHere(s),
  },
  {
    // The last days of a season: the picker now offers the next season's seeds.
    id: 'turn',
    after: ['plant'],
    // The board's Seeds tab (every crop and its seasons) comes with the first turn of a season.
    unlocks: ['seedtab'],
    ready: (s) => nightsToTurn(s.day) <= 3,
    text: (s) => `${SEASON_NAMES[season(s.day)]} ends soon. Plant ${SEASON_NAMES[(season(s.day) + 1) % 4].toLowerCase()} seeds.`,
    // Ends when a next season's seed goes in, or once read while idle.
    act: 'plant:next',
    passive: 6,
    // It says to plant, so it waits for bare soil and points at it (the sixth playtest's chevron sat on a bug).
    hold: (s) => !bareSpot(s),
    point: (s) => bareSpot(s),
  },
  {
    // The whole farm in one view, once there is more farm than the close view holds: with the second field (close up,
    // a phone sees about two fields, so a crow or bugs in the first field can hide off screen). C on a keyboard, the
    // View button on a phone. (It came on day 2, when the one field was all on screen already.)
    id: 'wide',
    after: ['plant', 'hoe'],
    unlocks: ['wide'],
    act: 'wide',
    // Once the new field is hoed (or the day after it came), and up long enough to be read: the sixth playtest's line
    // came for 7 seconds while the tester was still hoeing, and went unseen.
    ready: (s) => fields(s) >= 2 && (!meadow(s) || s.day > doneOn(s, 'hoe')),
    text: (_s, touch) => (touch ? 'Tap View to see the whole farm.' : 'Press C to see the whole farm.'),
    // Pressing C or tapping View does what it says: the line goes; or once read while idle.
    passive: 8,
  },
  {
    id: 'smith',
    after: ['deliver'],
    unlocks: ['smith'],
    stagger: true,
    ready: (s) => smithReady(s),
    text: () => 'The smith has better tools now.',
    // Ends when the board is opened (the smith is on it), or once read while idle.
    act: 'board',
    passive: 5,
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
  {
    // A heat wave withers a crop left dry tonight: while one is still thirsty, the line says so and points at it.
    id: 'heat',
    after: 'water',
    ready: (s) => s.weather === 'heat' && anyThirsty(s),
    text: 'Heat wave. Water every crop today.',
    point: (s) => nearest(s, (c, i) => thirsty(s, c, i)),
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
  const canInHand = { ...s, tool: 'can' } as WorldState;
  for (const l of LESSONS) out.push(l.text(canInHand, true));
  return [...new Set(out)];
}

/** Seconds an urgent line must have been on screen for its trouble going away by itself to count as seen. */
export const SEEN = 1.5;
/**
 * Round 7: every lesson's line stays on screen at least this long (seconds it could be seen), however soon its job is
 * done: the seventh playtest never saw the turn, bugs, forecast or sprinkler lines, yet all four were marked learned.
 */
export const MIN_SHOW = 4;

/** Is the farmer standing idle (not walking, working, or on the way to a tap)? Passive lines count only those seconds. */
export function idleFarmer(s: WorldState): boolean {
  const f = s.actors[0];
  return !f.moving && !f.task && !f.path.length && !f.aim && !(s.taps?.length);
}

export class Tutor {
  private active: Lesson | null = null;
  /** The lesson's action count when its line came up, to tell the farmer's own doing from trouble that went away. */
  private base = new Map<string, number>();
  /** Quiet unlocks already sent (the sim adds them to the farm's learning on its next step). */
  private sent = new Set<string>();
  /** Each lesson's line as last shown: a lesson done but still on screen keeps the words it was read in. */
  private words = new Map<string, string>();

  /** Count the things lessons wait for. */
  onEvent(s: WorldState, e: SimEvent): void {
    const farmerId = s.actors[0].id;
    const bump = (k: string) => (s.learnCount[k] = (s.learnCount[k] ?? 0) + 1);
    switch (e.type) {
      case 'harvest':
      case 'water':
      case 'plant':
      case 'till':
      case 'refill':
      case 'tend':
        if (e.by === farmerId) bump(e.type);
        // Next season's seed going in (the turn lesson's own act).
        if (e.type === 'plant' && e.by === farmerId && sowing(s.day, e.crop).next) bump('plant:next');
        break;
      case 'build':
        if (e.by === farmerId) {
          bump('build');
          bump(`build:${e.kind}`);
        }
        break;
      case 'crowScared':
        bump('scare');
        break;
      case 'rules':
        if (e.changed.includes('camera')) bump('wide');
        break;
    }
  }

  /** The board was opened. */
  board(s: WorldState): void {
    s.learnCount.board = (s.learnCount.board ?? 0) + 1;
  }

  /** The lesson whose line is up, if any (for checks). */
  get current(): string | null {
    return this.active?.id ?? null;
  }

  /**
   * Once a frame: the line to show, and any unlocks for the farm. `visible`
   * says whether the line can be seen right now (no board or picker over it).
   * A lesson counts as done only once its line has been on screen: a calm one
   * when the farmer has done what it says after seeing it; an urgent one when
   * the farmer dealt with the trouble, or when the trouble went away after the
   * line had been up for SEEN seconds. One whose trouble went away unseen (the
   * crow left while the farmer slept, or under the board) is not done: it
   * waits for the next crow.
   */
  update(s: WorldState, dt: number, touch: boolean, visible = true): { line: string; cmds: Command[]; point: Point | null; build?: BuildKind } {
    const cmds: Command[] = [];
    const n = (k: string) => s.learnCount[k] ?? 0;
    const finished = (id: string) => s.learn.includes(`lesson:${id}`);
    const finish = (l: Lesson) => {
      cmds.push({ type: 'unlock', what: `lesson:${l.id}` });
      s.learn.push(`lesson:${l.id}`);
      s.learnCount[`done:${l.id}`] = s.day;
      delete s.learnCount[`over:${l.id}`];
      if (this.active === l) this.active = null;
    };
    const awake = s.turnover < 0;
    for (const q of QUIET) if (!s.learn.includes(q.what) && !this.sent.has(q.what) && q.after.every(finished) && q.when(s)) {
      this.sent.add(q.what);
      cmds.push({ type: 'unlock', what: q.what });
    }
    // A lesson finished elsewhere (credited to an old save) leaves quietly.
    if (this.active && finished(this.active.id)) this.active = null;
    // Finish the lesson on screen when it is done and its line has been seen long enough. Round 7: never on a timer
    // alone: a calm or urgent lesson ends when its job is done, a passive one when its act is done or its line has been
    // read for its seconds while the farmer stood idle; and every line stays at least MIN_SHOW seconds, its job done or
    // not (a job done stays done: the line lingers, then goes).
    if (this.active) {
      const l = this.active;
      const seen = n(`seen:${l.id}`);
      const idle = n(`idle:${l.id}`);
      const acted = !!l.act && n(l.act) > (this.base.get(l.id) ?? Infinity);
      const met = !!l.done && l.done(s, n, acted);
      // A passive line read long enough goes with its day: it never lingers into the next morning (the forecast's did).
      const stale = !!l.passive && seen >= MIN_SHOW && s.day > (s.learnCount[`seenOn:${l.id}`] ?? s.day);
      const over = !!s.learnCount[`over:${l.id}`] || (l.passive ? idle >= l.passive || acted || met || stale : met);
      if (over && l.urgent && !acted && seen < SEEN) {
        // Its trouble went before anyone saw the line: not done, and the line steps aside until it comes back.
        this.active = null;
      } else if (over) {
        // Done: the line stays until it has been up long enough to be read, but never into the next morning (the sleep
        // line, done by sleeping, must not greet the farmer at dawn).
        s.learnCount[`over:${l.id}`] ??= s.day;
        if (seen >= MIN_SHOW || s.day > s.learnCount[`over:${l.id}`]) finish(l);
      } else if (l.hold?.(s)) this.active = null;
      // (One on hold steps aside, unfinished, until it can go on.)
    }
    // One new thing on the screen a day: a staggered lesson waits for a day when no other has brought anything.
    const quietDay = (l: Lesson) => LESSONS.every((o) => o === l || !o.stagger || s.learnCount[`arrived:${o.id}`] !== s.day);
    const eligible = (l: Lesson) => !finished(l.id) && l.after.every(finished) && l.ready(s) && !l.hold?.(s) && (!l.stagger || quietDay(l));
    const rank = (l: Lesson | null) => l?.urgent ?? 0;
    const urgentNow = () => LESSONS.filter((l) => l.urgent && eligible(l)).sort((a, b) => rank(b) - rank(a))[0];
    // An urgent lesson takes the line from a calm one, or from a lower urgent one (a crow over bugs); the one it
    // took over from is picked up again after.
    if (awake) {
      const u = urgentNow();
      if (u && u !== this.active && rank(u) > rank(this.active)) this.active = null;
    }
    if (!this.active && awake) {
      let next = urgentNow() ?? LESSONS.find(eligible) ?? null;
      // A keyboard lesson passes quietly on touch (what it brings in still comes).
      while (next?.keys && touch) {
        for (const what of next.unlocks) if (!s.learn.includes(what)) cmds.push({ type: 'unlock', what });
        finish(next);
        next = urgentNow() ?? LESSONS.find(eligible) ?? null;
      }
      this.active = next;
      if (next) {
        s.learnCount[`since:${next.id}`] = s.day;
        if (next.stagger) s.learnCount[`arrived:${next.id}`] ??= s.day;
        if (next.act && !this.base.has(next.id)) this.base.set(next.id, n(next.act));
        if (next.act) s.learnCount[`${next.act}@${next.id}`] ??= n(next.act);
        // A calm lesson already satisfied before its line ever showed (rain watered the carrots) passes quietly,
        // and what it brings in still comes.
        if (!next.passive && !next.urgent && n(`seen:${next.id}`) === 0 && next.done!(s, n, false)) {
          for (const what of next.unlocks) if (!s.learn.includes(what)) cmds.push({ type: 'unlock', what });
          finish(next);
          return { line: '', cmds, point: null };
        }
      }
    }
    if (!awake) return { line: '', cmds, point: null };
    // A reminder that applies right now speaks over a calm lesson (never over an urgent one).
    if (!this.active?.urgent) {
      const nudge = NUDGES.find((g) => finished(g.after) && g.ready(s));
      if (nudge) return { line: nudge.text, cmds, point: nudge.point?.(s) ?? null };
    }
    const l = this.active;
    // What a lesson brings onto the screen arrives with its line, the first moment the line can be seen (not while
    // a reminder speaks over it, nor under the board): nothing shows before its lesson.
    if (l && visible) for (const what of l.unlocks) if (!s.learn.includes(what) && !cmds.some((c) => c.type === 'unlock' && c.what === what)) cmds.push({ type: 'unlock', what });
    if (l && visible && dt > 0) {
      s.learnCount[`seen:${l.id}`] = n(`seen:${l.id}`) + dt;
      if (idleFarmer(s)) s.learnCount[`idle:${l.id}`] = n(`idle:${l.id}`) + dt;
      s.learnCount[`seenOn:${l.id}`] ??= s.day;
    }
    // A lesson done but still up (its four seconds not over) keeps its words and points at nothing: its job is done.
    const done = !!l && !!s.learnCount[`over:${l.id}`];
    const line = l ? (done ? (this.words.get(l.id) ?? l.text(s, touch)) : l.text(s, touch)) : '';
    if (l && !done) this.words.set(l.id, line);
    // The lesson's own target, if it has one now.
    const own = l && !done ? (l.point?.(s) ?? null) : null;
    let point = own;
    // After their lessons, crows and bugs still arrive now and then: the pointer keeps finding them, without a word
    // (a crow first: it will not wait).
    const crow = theCrow(s);
    if (!point && finished('pests') && crow) point = { x: crow.x + 0.5, y: crow.y + 0.5 };
    if (!point && finished('bugs')) point = theBugs(s);
    // What the pointer builds goes only with the lesson's own target: the sixth playtest's scarecrow lesson, with no
    // bare soil, pointed at a bug and still carried the build, so a tap on the bugged crop asked to build a scarecrow.
    return { line, cmds, point, build: own && l?.build ? l.build : undefined };
  }
}

/** A farm saved before the lessons existed: credit what it has clearly done. */
export function inferLessons(s: WorldState): void {
  s.learn ??= [];
  s.learnCount ??= {};
  // A field bought before the hoe always came with one: bring the hoe now.
  if (s.parcels.filter((p) => p.owned).length > 1 && !s.learn.includes('hoe') && s.learn.length) s.learn.push('hoe');
  // Round 5: the board's Fields and Seeds tabs come with their lessons now; a farm that already had the board keeps them.
  if (!s.learnCount['tabs']) {
    if (s.learn.includes('board')) for (const w of ['fields', 'seedtab']) if (!s.learn.includes(w)) s.learn.push(w);
    s.learnCount['tabs'] = 1;
  }
    // A farm that built a sprinkler before it had a lesson of its own knows it.
  if (s.builds?.some((b) => b.kind === 'sprinkler')) for (const w of ['sprinkler', 'lesson:sprinkler']) if (!s.learn.includes(w)) s.learn.push(w);
  if (s.learn.length) return;
  const harvested = Object.values(s.stats.harvested).reduce((a, b) => a + b, 0);
  const add = (...xs: string[]) => xs.forEach((x) => s.learn.includes(x) || s.learn.push(x));
  if (harvested > 0 || s.stats.days > 0) add('lesson:pull', 'can');
  if (s.stats.days > 0) add('lesson:water', 'lesson:sleep', 'sleep', 'coins', 'seeds', 'stamina');
  if (s.parcels.filter((p) => p.owned).length > 1) add('hoe');
}
