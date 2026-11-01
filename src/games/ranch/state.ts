// The ranch's live state and its save. Everything the player can see change
// lives here; the renderers and the HUD only read it.

import {
  CAPS,
  KINDS,
  type BenchUp,
  type DownyKind,
  type Food,
  type GoalId,
  type ItemType,
  type PadKind,
  type Thing,
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
}

export interface Slot {
  t: Thing | null;
  n: number;
  /** For fluff: the meals you gave that it came from, oldest first (not saved). */
  feeds?: number[];
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
  stats: { sold: number; fed: number; drawn: number };
  /** Last day the overnight changes ran. */
  night: number;
  nextId: number;
  /** What the lessons have brought in (features) and finished (`lesson:id`). */
  learn: string[];
  /** Counts the lessons wait on. */
  learnCount: Record<string, number>;
}

export function emptyPad(): Pad {
  return { kind: 'empty', ups: [], crop: null, grow: 0, silo: [], siloSel: 0, feeder: { t: null, n: 0 }, feedT: 0, chute: [0, 0, 0, 0] };
}

export function capacity(s: RanchState): number {
  return CAPS[s.up.cap] ?? CAPS[0];
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
    stats: { sold: 0, fed: 0, drawn: 0 },
    night: 0,
    nextId: 1,
    learn: [],
    learnCount: {},
  };
}

// ---------------------------------------------------------------- save

const r3 = (v: number) => Math.round(v * 1000) / 1000;

export interface SaveV1 {
  v: 1;
  day: number;
  hour: number;
  coins: number;
  earned: number;
  player: [number, number, number, number, number];
  slots: [Thing | null, number][];
  sel: number;
  up: Record<BenchUp, number>;
  gates: Record<GateId, boolean>;
  pads: Pad[];
  /** kind, x, y, z, hunger, tame, homeX, homeZ, keep */
  downies: [DownyKind, number, number, number, number, number, number, number, number][];
  /** type, x, y, z, src, rest */
  items: [ItemType, number, number, number, number, number][];
  sources: number[];
  market: Market;
  goals: GoalId[];
  journal: boolean;
  hints: string[];
  caught: DownyKind[];
  zones: Zone[];
  stats: { sold: number; fed: number; drawn: number };
  night: number;
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
    slots: s.slots.map((q) => [q.t, q.n]),
    sel: s.sel,
    up: { ...s.up },
    gates: { ...s.gates },
    pads: s.pads.map((q) => ({ ...q, ups: [...q.ups], grow: r3(q.grow), feedT: r3(q.feedT), silo: q.silo.map((x) => ({ ...x })), feeder: { ...q.feeder }, chute: [...q.chute] })),
    downies: s.downies.filter((d) => !d.gone).map((d) => [d.kind, r3(d.x), r3(d.y), r3(d.z), r3(d.hunger), d.tame ? 1 : 0, r3(d.homeX), r3(d.homeZ), d.keep ? 1 : 0]),
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
  s.slots = d.slots.map(([t, n]) => ({ t, n: num(n, 0) }));
  s.sel = Math.min(num(d.sel, 0), s.slots.length - 1);
  s.up = { ...s.up, ...d.up };
  s.gates = { ...s.gates, ...d.gates };
  s.pads = PADS.map((_, i) => ({ ...emptyPad(), ...(d.pads[i] ?? {}) }));
  s.sources = sources.map((q, i) => ({ ...q, t: num(d.sources?.[i], 0) }));
  s.downies = [];
  for (const [kind, x, y, z, hunger, tame, hx, hz, keep] of d.downies ?? []) {
    const q = newDowny(s, kind, x, y, z);
    q.hunger = hunger;
    q.tame = !!tame;
    q.homeX = hx;
    q.homeZ = hz;
    q.keep = !!keep;
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
