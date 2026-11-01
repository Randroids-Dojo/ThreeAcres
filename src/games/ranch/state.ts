// The ranch's live state and its save. Everything the player can see change
// lives here; the renderers and the HUD only read it.

import {
  CAPS,
  FLUFF_ROOM,
  KINDS,
  isTuft,
  type BenchUp,
  type DownyKind,
  type Food,
  type GoalId,
  type ItemType,
  type Order,
  type PadKind,
  type Thing,
  type Tuft,
} from './defs';
import { PADS, START, heightAt, type GateId, type Zone } from './world';

export interface Body {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  grounded: boolean;
}

export type Mood = 'content' | 'calm' | 'hungry' | 'frazzled';

export interface Downy extends Body {
  id: number;
  kind: DownyKind;
  hunger: number;
  /** Caught at least once: no longer tied to a wild home. */
  tame: boolean;
  homeX: number;
  homeZ: number;
  /** Pad index of the pen it is in, or -1. */
  pen: number;
  yaw: number;
  hopT: number;
  squash: number;
  squashV: number;
  blinkT: number;
  eatT: number;
  shedQ: number;
  shedT: number;
  /** Seconds of fright left from a nettleback. */
  fright: number;
  mood: Mood;
  /** Seconds it has been in the bellows' draw, 0 if not. */
  drawn: number;
  /** Seconds since it was puffed, or -1. */
  flyT: number;
  /** Game hours since it last ate. */
  sinceFed: number;
  target: Item | null;
  gone: boolean;
  /** For the porch downy and other scripted ones: never despawns. */
  keep: boolean;
  /** Seconds a wild one has dug in against the bellows (a tug of war before it comes loose). */
  tug: number;
  /** Under the crosshair and being tugged this frame. */
  held: boolean;
  /** A wild one has noticed you close by and is hopping away. */
  alert: boolean;
  /** Game hours spent starving without a meal: long neglect makes it restless. */
  starveT: number;
  /** The meal you gave it that its next fluff comes from (0: not fed by you). */
  feedId: number;
  /** The pen it hopped out of, while it is loose (-1: none). Not saved. */
  strayFrom: number;
  /** Seconds the bellows leaves it alone (just tipped out of a window, or it got away from a pull). */
  noPull: number;
  /** Seconds since a wild one first dug in against this pull (0: not fighting). Not saved. */
  strain: number;
  /** The most of the pull it has given up this fight, 0..1. Not saved. */
  peak: number;
  /** Seconds of running flat out (a thistle bolting, or one that got away). Not saved. */
  bolt: number;
  /** A brook that got away is leaping into the pond: gone when it lands in the water. Not saved. */
  dive: boolean;
  /** Seconds a wild one that got away stays wary: it hears you from further off and digs in harder. Not saved. */
  wary: number;
  /** A thistle's seconds of bolting lately, and how long it is winded for once it has run itself out. Not saved. */
  run: number;
  winded: number;
  /** The day it was caught from the wild (0: not known, or the porch downy). A live order wants one caught today. */
  caught: number;
  /** A rare individual: the morning board's sought-after downy (a gold clover, a rose ember, a silver brook). */
  rare: boolean;
  /** Seconds a rare wild one stays lured (going for its favourite food, eating it, and a while after): it lets you near. Not saved. */
  calm: number;
}

export interface Item extends Body {
  id: number;
  type: ItemType;
  /** Wild source or garden it grew on, or -1 once loose. */
  src: number;
  drawn: number;
  flyT: number;
  spin: number;
  spinV: number;
  /** Lying still where it grew: no physics until disturbed. */
  rest: boolean;
  gone: boolean;
  /** Seconds lying on the ground, for tufts blowing away. */
  idle: number;
  /** Left the bellows with a blow (or was tipped out of a window, for food): it is yours. */
  blown: boolean;
  /** For fluff: the downy that shed it (0 if none). */
  by: number;
  /** For fluff: the meal you gave that it came from (0 if not fed by you). */
  feed: number;
  /** Seconds the bellows leaves it alone (just tipped out of a window). */
  noPull: number;
}

export interface Nettle extends Body {
  id: number;
  yaw: number;
  mode: 'roam' | 'roll' | 'flee' | 'leave';
  modeT: number;
  tx: number;
  tz: number;
  bristle: number;
  roll: number;
  gone: boolean;
  snuffT: number;
  /** Stepping sideways along something in its way, and for how long; the side it tries. */
  detourT?: number;
  detourYaw?: number;
  detourSide?: number;
  /** Seconds it has been pushing without getting anywhere. */
  stuckT?: number;
  /** Where it was a few seconds ago, and the seconds since: a roaming pest that has got nowhere (a corner) goes elsewhere. */
  wx?: number;
  wz?: number;
  wT?: number;
}

/**
 * A downy in the jar: its hunger (kept, so a starving one does not come out
 * fed: the fifth playtest's 0.06 came out 0.37), the day it was caught (a live
 * order wants one caught today) and whether it is the board's rare one.
 */
export interface DownRec {
  h: number;
  c: number;
  rare?: boolean;
}

export interface Slot {
  /** What it holds; for the fluff window, the kind of fluff that comes out next. */
  t: Thing | null;
  n: number;
  /** For a downy's window: each downy in it, oldest first (one per downy). */
  downs?: DownRec[];
  /** For fluff: the meals you gave that it came from, oldest first (not saved). */
  feeds?: number[];
  /**
   * The fluff window takes every kind of fluff (the fourth playtest's four
   * windows choked on three foods and four fluffs): the kinds in it, oldest
   * first, one per fluff (mix[0] is t).
   */
  mix?: Tuft[];
}

export interface Pad {
  kind: PadKind;
  ups: string[];
  crop: Food | null;
  /** 0..1 towards the next crop. */
  grow: number;
  silo: { t: ItemType; n: number }[];
  siloSel: number;
  feeder: { t: Food | null; n: number };
  feedT: number;
  chute: number[];
}

export interface Source {
  kind: 'clover' | 'berry' | 'root';
  x: number;
  z: number;
  t: number;
}

export interface Player {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  grounded: boolean;
  gliding: boolean;
}

export interface Market {
  /** Today's drift on each kind's base price, 0.75..1.25. */
  mult: Record<DownyKind, number>;
  /** Tufts of each kind sold today. */
  sold: Record<DownyKind, number>;
  /** Yesterday's closing price, for the arrows on the board. */
  prev: Record<DownyKind, number>;
}

export interface RanchState {
  day: number;
  hour: number;
  coins: number;
  earned: number;
  player: Player;
  slots: Slot[];
  sel: number;
  up: Record<BenchUp, number>;
  gates: Record<GateId, boolean>;
  pads: Pad[];
  downies: Downy[];
  items: Item[];
  nettles: Nettle[];
  sources: Source[];
  market: Market;
  goals: GoalId[];
  /** The journal page has been shown (after the first draw). */
  journal: boolean;
  hints: string[];
  caught: DownyKind[];
  zones: Zone[];
  stats: Stats;
  /** Today's orders from the price board: the offers, then the one taken (see defs.ts, Order). */
  orders: Order[];
  /** The day the board last posted orders. */
  orderDay: number;
  /** The orders the board has offered lately (kind, live, day), newest last: it asks for what it has not asked for in a while. */
  orderLog: { kind: DownyKind; live: boolean; day: number; rare?: boolean; spot?: number }[];
  /** Last day the overnight changes ran. */
  night: number;
  nextId: number;
  /** What the lessons have brought in (features) and finished (`lesson:id`). */
  learn: string[];
  /** Counts the lessons wait on. */
  learnCount: Record<string, number>;
}

export interface Stats {
  sold: number;
  fed: number;
  drawn: number;
  /** Orders filled, and prized ones among them. */
  filled: number;
  prized: number;
  /** Fluff sold of each kind, all told. */
  kinds?: Partial<Record<DownyKind, number>>;
  /** Live downies sent to the crate for orders. */
  live?: number;
}

export function emptyPad(): Pad {
  return { kind: 'empty', ups: [], crop: null, grow: 0, silo: [], siloSel: 0, feeder: { t: null, n: 0 }, feedT: 0, chute: [0, 0, 0, 0] };
}

export function capacity(s: RanchState): number {
  return CAPS[s.up.cap] ?? CAPS[0];
}

/** What a window holds at most: the fluff window twice as much (fluff is light). */
export function slotCap(s: RanchState, q: Slot): number {
  return q.t && isTuft(q.t) ? capacity(s) * FLUFF_ROOM : capacity(s);
}

const rec = <T>(f: (k: DownyKind) => T) => Object.fromEntries(KINDS.map((k) => [k, f(k)])) as Record<DownyKind, T>;

export function freshState(): RanchState {
  const pads = PADS.map(() => emptyPad());
  pads[0].kind = 'garden';
  pads[0].crop = 'cloverhead';
  pads[0].grow = 0.55;
  return {
    day: 1,
    hour: 7.2,
    coins: 300,
    earned: 0,
    player: { x: START.x, y: heightAt(START.x, START.z), z: START.z, vx: 0, vy: 0, vz: 0, yaw: START.yaw, pitch: -0.08, grounded: true, gliding: false },
    slots: [
      { t: null, n: 0 },
      { t: null, n: 0 },
      { t: null, n: 0 },
      { t: null, n: 0 },
    ],
    sel: 0,
    up: { slots: 0, cap: 0, range: 0, glide: 0 },
    gates: { ridge: false, hollow: false },
    pads,
    downies: [],
    items: [],
    nettles: [],
    sources: [],
    market: { mult: rec(() => 1), sold: rec(() => 0), prev: rec(() => 0) },
    goals: [],
    journal: false,
    hints: [],
    caught: [],
    zones: ['ranch'],
    stats: { sold: 0, fed: 0, drawn: 0, filled: 0, prized: 0 },
    orders: [],
    orderDay: 0,
    orderLog: [],
    night: 0,
    nextId: 1,
    learn: [],
    learnCount: {},
  };
}

// ---------------------------------------------------------------- save

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const isDownyKind = (t: Thing): t is DownyKind => (KINDS as string[]).includes(t);

export interface SaveV1 {
  v: 1;
  day: number;
  hour: number;
  coins: number;
  earned: number;
  player: [number, number, number, number, number];
  /** what, how many, for the fluff window the kinds in it, and for a downy's window each downy's hunger, day caught and rarity. */
  slots: [Thing | null, number, Tuft[]?, [number, number, number][]?][];
  sel: number;
  up: Record<BenchUp, number>;
  gates: Record<GateId, boolean>;
  pads: Pad[];
  /** kind, x, y, z, hunger, tame, homeX, homeZ, keep, day caught, rare (0 no; any other number a rare one: older saves wrote 1 to 3) */
  downies: [DownyKind, number, number, number, number, number, number, number, number, number?, number?][];
  /** type, x, y, z, src, rest */
  items: [ItemType, number, number, number, number, number][];
  sources: number[];
  market: Market;
  goals: GoalId[];
  journal: boolean;
  hints: string[];
  caught: DownyKind[];
  zones: Zone[];
  stats: Partial<Stats>;
  night: number;
  /** Added with orders; older saves have none and get their first at the next morning. */
  orders?: Order[];
  orderDay?: number;
  orderLog?: { kind: DownyKind; live: boolean; day: number; rare?: boolean; spot?: number }[];
  /** Added with the lessons; older saves have neither and are credited on load. */
  learn?: string[];
  learnCount?: Record<string, number>;
}

export function serialize(s: RanchState): SaveV1 {
  const p = s.player;
  return {
    v: 1,
    day: s.day,
    hour: r3(s.hour),
    coins: s.coins,
    earned: s.earned,
    player: [r3(p.x), r3(p.y), r3(p.z), r3(p.yaw), r3(p.pitch)],
    slots: s.slots.map((q) => (q.mix && q.t && isTuft(q.t) ? [q.t, q.n, [...q.mix]] : q.downs && q.t && isDownyKind(q.t) ? [q.t, q.n, [], q.downs.map((d) => [r3(d.h), d.c, d.rare ? 1 : 0] as [number, number, number])] : [q.t, q.n])),
    sel: s.sel,
    up: { ...s.up },
    gates: { ...s.gates },
    pads: s.pads.map((q) => ({ ...q, ups: [...q.ups], grow: r3(q.grow), feedT: r3(q.feedT), silo: q.silo.map((x) => ({ ...x })), feeder: { ...q.feeder }, chute: [...q.chute] })),
    downies: s.downies.filter((d) => !d.gone).map((d) => [d.kind, r3(d.x), r3(d.y), r3(d.z), r3(d.hunger), d.tame ? 1 : 0, r3(d.homeX), r3(d.homeZ), d.keep ? 1 : 0, d.caught, d.rare ? 1 : 0]),
    items: s.items.filter((i) => !i.gone).map((i) => [i.type, r3(i.x), r3(i.y), r3(i.z), i.src, i.rest ? 1 : 0]),
    sources: s.sources.map((q) => r3(q.t)),
    market: { mult: { ...s.market.mult }, sold: { ...s.market.sold }, prev: { ...s.market.prev } },
    goals: [...s.goals],
    journal: s.journal,
    hints: [...s.hints],
    caught: [...s.caught],
    zones: [...s.zones],
    stats: { ...s.stats },
    night: s.night,
    orders: s.orders.map((o) => ({ ...o })),
    orderDay: s.orderDay,
    orderLog: s.orderLog.map((o) => ({ ...o })),
    learn: [...s.learn],
    learnCount: Object.fromEntries(Object.entries(s.learnCount).map(([k, v]) => [k, r3(v)])),
  };
}

export function newDowny(s: RanchState, kind: DownyKind, x: number, y: number, z: number): Downy {
  return {
    id: s.nextId++,
    kind,
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    r: kind === 'thistle' ? 0.22 : 0.26,
    grounded: false,
    hunger: 0.2,
    tame: false,
    homeX: x,
    homeZ: z,
    pen: -1,
    yaw: Math.random() * Math.PI * 2,
    hopT: Math.random() * 1.5,
    squash: 1,
    squashV: 0,
    blinkT: 1 + Math.random() * 3,
    eatT: 0,
    shedQ: 0,
    shedT: 0,
    fright: 0,
    mood: 'calm',
    drawn: 0,
    flyT: -1,
    sinceFed: 2,
    target: null,
    gone: false,
    keep: false,
    tug: 0,
    held: false,
    alert: false,
    starveT: 0,
    feedId: 0,
    strayFrom: -1,
    noPull: 0,
    strain: 0,
    peak: 0,
    bolt: 0,
    dive: false,
    wary: 0,
    run: 0,
    winded: 0,
    caught: 0,
    rare: false,
    calm: 0,
  };
}

export function newItem(s: RanchState, type: ItemType, x: number, y: number, z: number, src = -1): Item {
  return {
    id: s.nextId++,
    type,
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    r: type.startsWith('tuft') ? 0.14 : 0.12,
    grounded: false,
    src,
    drawn: 0,
    flyT: -1,
    spin: Math.random() * 6.28,
    spinV: 0,
    rest: false,
    gone: false,
    idle: 0,
    blown: false,
    by: 0,
    feed: 0,
    noPull: 0,
  };
}

function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

/** Rebuilds live state from a save. Unknown or broken saves return null. */
export function deserialize(raw: unknown, sources: Source[]): RanchState | null {
  const d = raw as SaveV1 | null;
  if (!d || d.v !== 1 || !Array.isArray(d.pads) || !Array.isArray(d.slots)) return null;
  const s = freshState();
  s.day = num(d.day, 1);
  s.hour = num(d.hour, 7);
  s.coins = num(d.coins, 0);
  s.earned = num(d.earned, 0);
  const [px, py, pz, yaw, pitch] = d.player;
  Object.assign(s.player, { x: num(px, START.x), y: num(py, 5), z: num(pz, START.z), yaw: num(yaw, 0), pitch: num(pitch, 0), grounded: true });
  s.slots = d.slots.map(([t, n, mix, downs]) => {
    const q: Slot = { t, n: num(n, 0) };
    // A downy's window: each downy's hunger, day caught and rarity (an older save's come out as they used to).
    if (t && isDownyKind(t) && Array.isArray(downs) && downs.length === q.n) q.downs = downs.map(([h, c, r]) => ({ h: num(h, 0.35), c: num(c, 0), ...(r ? { rare: true } : {}) }));
    // The fluff window: the kinds in it (an older save's fluff window holds one kind).
    if (t && isTuft(t)) {
      q.mix = Array.isArray(mix) && mix.length === q.n && mix.every((m) => typeof m === 'string' && isTuft(m)) ? [...mix] : Array.from({ length: q.n }, () => t);
      q.t = q.mix[0] ?? null;
      if (!q.n) q.mix = undefined;
    }
    return q;
  });
  // An older save may hold fluff in more than one window: they pour into the first.
  const tuftSlots = s.slots.filter((q) => q.t && isTuft(q.t) && q.mix);
  for (const q of tuftSlots.slice(1)) {
    const into = tuftSlots[0];
    into.mix!.push(...q.mix!);
    into.n = into.mix!.length;
    q.t = null;
    q.n = 0;
    q.mix = undefined;
  }
  s.sel = Math.min(num(d.sel, 0), s.slots.length - 1);
  s.up = { ...s.up, ...d.up };
  s.gates = { ...s.gates, ...d.gates };
  s.pads = PADS.map((_, i) => ({ ...emptyPad(), ...(d.pads[i] ?? {}) }));
  s.sources = sources.map((q, i) => ({ ...q, t: num(d.sources?.[i], 0) }));
  s.downies = [];
  for (const [kind, x, y, z, hunger, tame, hx, hz, keep, caught, rare] of d.downies ?? []) {
    const q = newDowny(s, kind, x, y, z);
    q.hunger = hunger;
    q.tame = !!tame;
    q.homeX = hx;
    q.homeZ = hz;
    q.keep = !!keep;
    q.caught = num(caught, 0);
    q.rare = !!rare;
    q.grounded = false;
    s.downies.push(q);
  }
  s.items = [];
  for (const [type, x, y, z, src, rest] of d.items ?? []) {
    const it = newItem(s, type, x, y, z, src);
    it.rest = !!rest;
    s.items.push(it);
  }
  s.market = { mult: { ...s.market.mult, ...d.market?.mult }, sold: { ...s.market.sold, ...d.market?.sold }, prev: { ...s.market.prev, ...d.market?.prev } };
  s.goals = [...(d.goals ?? [])];
  s.journal = !!d.journal;
  s.hints = [...(d.hints ?? [])];
  s.caught = [...(d.caught ?? [])];
  s.zones = [...(d.zones ?? ['ranch'])];
  s.stats = { ...s.stats, ...d.stats };
  s.night = num(d.night, 0);
  s.orders = Array.isArray(d.orders)
    ? d.orders
        .filter((o) => o && KINDS.includes(o.kind) && Number.isFinite(o.n))
        .map((o) => ({
          kind: o.kind,
          live: !!o.live,
          n: o.n,
          got: num(o.got, 0),
          paid: num(o.paid, 0),
          mult: num(o.mult, 2),
          pay: num(o.pay, 0),
          state: o.state === 'filled' || o.state === 'missed' || o.state === 'offer' ? o.state : 'open',
          ...(o.rare && Number.isFinite(o.rare.spot) ? { rare: { spot: o.rare.spot, ...(o.rare.seen ? { seen: true } : {}) } } : {}),
          ...(Number.isFinite(o.until) ? { until: o.until } : {}),
        }))
    : [];
  s.orderDay = num(d.orderDay, 0);
  s.orderLog = Array.isArray(d.orderLog) ? d.orderLog.filter((o) => o && KINDS.includes(o.kind)).map((o) => ({ kind: o.kind, live: !!o.live, day: num(o.day, 0), ...(o.rare ? { rare: true } : {}), ...(Number.isFinite(o.spot) ? { spot: o.spot } : {}) })) : [];
  // A save from before the lessons has no list: the director credits it (see creditLessons).
  s.learn = Array.isArray(d.learn) ? d.learn.filter((x) => typeof x === 'string') : [];
  s.learnCount = {};
  for (const [k, v] of Object.entries(d.learnCount ?? {})) if (typeof v === 'number' && Number.isFinite(v)) s.learnCount[k] = v;
  return s;
}

export function summary(s: RanchState): string {
  const pens = s.pads.filter((p) => p.kind === 'pen').length;
  return `Day ${s.day}, ${pens} ${pens === 1 ? 'pen' : 'pens'}, ${Math.floor(s.coins).toLocaleString('en-US')} coins`;
}
