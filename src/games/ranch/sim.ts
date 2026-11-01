// Thistledown's rules, render-free: the clock, walking, the bellows, downies,
// loose things, gardens, pens, silos, the Exchange, nettlebacks, wild
// spawning and the journal. The game feeds it controls and an aim each frame
// and reacts to the events it emits; renderers only read its state. While
// teaching, the world holds back what the lessons have not brought in yet
// (see lessons.ts): posts, the door, the bench and gates stay inert, the
// clock stops in the late afternoon and nettlebacks stay away.

import {
  BENCH_UPS,
  BUILD_COST,
  BUILD_NAME,
  FEEDER_CAP,
  GARDEN_HOURS,
  GARDEN_UPS,
  GOALS,
  HOUR,
  HUNGER_RATE,
  KIND,
  NEGLECT_HOURS,
  PEN_HUNGER,
  KINDS,
  KIND_TUFT,
  PEN_UPS,
  RANGES,
  SILO_CAP,
  SILO_KINDS,
  TUFT_KIND,
  eats,
  favourite,
  fmtCoins,
  isDowny,
  isFood,
  isTuft,
  thingName,
  type BenchUp,
  type DownyKind,
  type Food,
  type GardenUp,
  type GoalId,
  type ItemType,
  type PadKind,
  type PenUp,
  type Thing,
} from './defs';
import { clamp, damp } from './noise';
import { BED_HALF, CRATE, Physics, SILO_H, SILO_R } from './physics';
import {
  capacity,
  freshState,
  newDowny,
  newItem,
  type Downy,
  type Item,
  type Nettle,
  type RanchState,
  type Source,
} from './state';
import {
  BERRY_BUSHES,
  CLOVER_PATCHES,
  DOOR,
  GATES,
  PADS,
  PEN_R,
  POND,
  RANCH_Z,
  RIDGE_TOP,
  ROOT_PATCHES,
  VENTS,
  WORKBENCH,
  pathAt,
  waterAt,
  zoneAt,
  type GateId,
  type Zone,
} from './world';

export type Ev =
  | { t: 'suck'; thing: Thing; x: number; y: number; z: number; wild?: boolean }
  | { t: 'full'; thing: Thing }
  | { t: 'puff'; thing: Thing | null }
  | { t: 'boing'; x: number; y: number; z: number; v: number; kind: DownyKind }
  | { t: 'chirp'; x: number; y: number; z: number; kind: DownyKind }
  | { t: 'squeak'; x: number; y: number; z: number; kind: DownyKind }
  | { t: 'eat'; x: number; y: number; z: number; kind: DownyKind; food: Food; fav: boolean; tame: boolean; you: boolean }
  | { t: 'shed'; x: number; y: number; z: number; kind: DownyKind; n: number }
  | { t: 'frazzle'; x: number; y: number; z: number }
  /** blown: you blew it in (not drawn in by the crate from where it lay); cycle: it finished a meal you gave, start to sale. */
  | { t: 'sell'; x: number; y: number; z: number; kind: DownyKind; coins: number; blown: boolean; cycle: boolean }
  | { t: 'empty'; thing: Thing; n: number }
  | { t: 'reject'; x: number; y: number; z: number }
  | { t: 'build'; pad: number; what: string; x: number; z: number }
  | { t: 'gate'; gate: GateId }
  | { t: 'nettle'; x: number; y: number; z: number }
  | { t: 'nettlehit'; x: number; y: number; z: number }
  | { t: 'splash'; x: number; y: number; z: number }
  | { t: 'goal'; id: GoalId }
  | { t: 'deny'; why: string }
  | { t: 'plant'; pad: number; food: Food }
  | { t: 'crop'; pad: number }
  | { t: 'store'; x: number; y: number; z: number; where: 'feeder' | 'silo'; pad: number }
  /** A downy of yours hopped out of its pen. */
  | { t: 'stray'; x: number; y: number; z: number; pen: number }
  /** A downy came down inside a pen (blown in, or hopped back). */
  | { t: 'penned'; pen: number }
  | { t: 'first'; kind: DownyKind }
  | { t: 'step'; stone: boolean; pitch: number }
  | { t: 'jump' }
  | { t: 'land'; v: number }
  | { t: 'glide' }
  | { t: 'sleep' }
  | { t: 'zone'; zone: Zone }
  | { t: 'air' };

export interface Controls {
  /** Strafe right, -1..1. */
  moveX: number;
  /** Forward, -1..1. */
  moveZ: number;
  sprint: boolean;
  jump: boolean;
  jumpPressed: boolean;
  draw: boolean;
  puff: boolean;
  puffPressed: boolean;
}

export interface Aim {
  /** Eye position. */
  ex: number;
  ey: number;
  ez: number;
  /** Unit look direction. */
  dx: number;
  dy: number;
  dz: number;
  /** Where the bellows' muzzle is in the world. */
  mx: number;
  my: number;
  mz: number;
}

export interface Interactable {
  kind: 'pad' | 'chute' | 'bench' | 'door' | 'gate' | 'silo';
  id: number | GateId;
  label: string;
  x: number;
  y: number;
  z: number;
}

export interface MenuOption {
  id: string;
  title: string;
  price: number | null;
  ok: boolean;
  /** A short line under the title, if any. */
  note: string;
}

const G_DOWNY = 9;
const G_ITEM = 16;
const G_TUFT = 2.4;
/** The sell crate draws in fluff within this many metres of its middle (flying or lying). */
const PULL_R = 2.4;
const CRATE_X = (CRATE.x0 + CRATE.x1) / 2;
const CRATE_Z = (CRATE.z0 + CRATE.z1) / 2;

/**
 * The sell crate's pull on a piece of fluff: towards a point just over its
 * funnel, harder the nearer it is, with a little damping so it settles in
 * rather than orbiting. Shared by the real flight and the crosshair's guess.
 */
function cratePull(b: { x: number; y: number; z: number; vx: number; vy: number; vz: number }, floor: number, dt: number): boolean {
  const dx = CRATE_X - b.x;
  const dz = CRATE_Z - b.z;
  const dh = Math.hypot(dx, dz);
  if (dh > PULL_R || b.y > floor + 3.4) return false;
  const dy = floor + CRATE.h + 0.35 - b.y;
  const k = 1 - dh / PULL_R;
  const pull = 7 + 12 * k;
  const l = Math.hypot(dx, dy, dz) || 1;
  b.vx += (dx / l) * pull * dt;
  b.vy += (dy / l) * pull * dt;
  b.vz += (dz / l) * pull * dt;
  const damp = Math.exp(-3 * k * dt);
  b.vx *= damp;
  b.vz *= damp;
  return true;
}
const PLAYER_G = 22;
const EYE = 1.6;
const CONE = Math.cos((25 * Math.PI) / 180);
const NEAR_CONE = Math.cos((50 * Math.PI) / 180);
const ABSORB = 1.0;
const WILD_CAP = 56;
/** How close you need to be to use the workbench. */
export const BENCH_REACH = 3.5;
/**
 * Wild downies notice you within this many metres (more when you run) and hop
 * away. Both are further than Pull reaches (7.4 m), so a catch means closing in
 * on one that has seen you, then keeping the crosshair on it while it jinks.
 */
export const NOTICE = 9;
export const NOTICE_RUN = 12;
/** Seconds the bellows leaves things tipped out of a window alone, so the next pull does not sweep them straight back in. */
export const TIP_IGNORE = 1.6;
/** Each fluff of a kind sold today takes this share off its price, down to the floor. */
export const SATURATION = 0.004;
export const SAT_FLOOR = 0.6;

interface Group {
  kind: DownyKind;
  x: number;
  z: number;
  n: number;
}

const GROUPS: Group[] = [
  { kind: 'clover', x: -16, z: -9, n: 3 },
  { kind: 'clover', x: 14, z: -4, n: 3 },
  { kind: 'clover', x: -8, z: -44, n: 3 },
  { kind: 'clover', x: 20, z: -32, n: 3 },
  { kind: 'clover', x: -22, z: -28, n: 2 },
  { kind: 'ember', x: VENTS[0][0] + 3, z: VENTS[0][1] + 4, n: 3 },
  { kind: 'ember', x: VENTS[1][0] - 2, z: VENTS[1][1] + 3, n: 3 },
  { kind: 'ember', x: VENTS[3][0] - 3, z: VENTS[3][1], n: 3 },
  { kind: 'brook', x: POND.x - 14, z: POND.z + 10, n: 3 },
  { kind: 'brook', x: POND.x + 8, z: POND.z + 15, n: 3 },
  { kind: 'brook', x: POND.x - 4, z: POND.z - 16, n: 3 },
];

export function makeSources(): Source[] {
  return [
    ...CLOVER_PATCHES.map((p) => ({ kind: 'clover' as const, x: p.x, z: p.z, t: 0 })),
    ...BERRY_BUSHES.map((p) => ({ kind: 'berry' as const, x: p.x, z: p.z, t: 0 })),
    ...ROOT_PATCHES.map((p) => ({ kind: 'root' as const, x: p.x, z: p.z, t: 0 })),
  ];
}

const SOURCE_FOOD: Record<Source['kind'], Food> = { clover: 'cloverhead', berry: 'dewberry', root: 'sweetroot' };
const SOURCE_MAX = 3;
const SOURCE_REGROW = 40;
/** Garden items carry src = GARDEN_SRC + pad index. */
export const GARDEN_SRC = 1000;

/** Fixed spots around a pad: its post, the feeder hopper, the down box, the trough and the silo outlet. */
export function padSpots(i: number) {
  const p = PADS[i];
  const ls = i < 3 ? 1 : -1;
  return {
    post: { x: p.px, z: p.pz },
    hopper: { x: p.x + PEN_R * 0.72, z: p.z + ls * PEN_R * 0.69, y: 1.55 },
    chute: { x: p.x + 0.6, z: p.z + ls * (PEN_R + 0.75) },
    trough: { x: p.x - 0.4, z: p.z - ls * (PEN_R - 1.3) },
    outlet: { x: p.x, z: p.z + ls * (SILO_R + 0.35), y: 0.7 },
    ls,
  };
}

export class Sim {
  s: RanchState;
  phys = new Physics();
  rand: () => number = Math.random;
  events: Ev[] = [];
  /** Walked distance, for the head bob and footsteps. */
  stride = 0;
  private stepAt = 0;
  private coyote = 0;
  private puffWait = 0;
  private fullWait = 0;
  private spawnT = 0;
  private srcT = 0;
  private srcCount: number[] = [];
  private nettleT = 8;
  private goalT = 0;
  private siloT = 0;
  private glided = false;
  /** The chosen window ran out under a held Blow: wait for the button to come up before blowing the next kind. */
  private waitRelease = false;
  /** Blown downies are helped into a pen they were aimed at (off for the before-and-after measure). */
  penAssist = true;
  /** Things currently being drawn, for the renderer's stream effect. */
  drawing = false;
  drawPower = 0;
  /** Nearest danger to the player, 0 calm to 1 close, for the music. */
  danger = 0;
  thistleSeen = false;
  /** Wild downies come and go (off in some tests). */
  wild = true;
  /** Hold back what the lessons have not brought in. Off, everything is there (tests, sandbox). */
  teaching = false;
  private airborneVy = 0;
  /** Numbers the meals you give; fluff from one carries it, and its first sale closes the loop. */
  private feedSerial = 0;
  private cycled = new Set<number>();
  private pbody = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0.34, grounded: true };

  constructor(state: RanchState | null) {
    const sources = makeSources();
    if (state) {
      this.s = state;
      if (this.s.sources.length !== sources.length) this.s.sources = sources;
    } else {
      this.s = freshState();
      this.s.night = 1;
      this.s.sources = sources;
      this.rollMarket(true);
      this.seedWorld();
    }
    this.phys.setPads(this.s.pads);
    this.phys.gates = { ...this.s.gates };
    for (const d of this.s.downies) d.pen = this.phys.penAt(d.x, d.z);
    this.srcCount = this.s.sources.map(() => 0);
    this.countSources();
  }

  emit(e: Ev): void {
    this.events.push(e);
  }

  /** Has a lesson brought this in? Always yes when not teaching. */
  knows(what: string): boolean {
    return !this.teaching || this.s.learn.includes(what);
  }

  // ------------------------------------------------------------ setup

  private seedWorld(): void {
    const s = this.s;
    // Food already growing in the wild.
    s.sources.forEach((src, i) => {
      for (let k = 0; k < 2 + Math.floor(this.rand() * 2); k++) this.growAt(i, src);
    });
    // The starter garden has a few heads ready.
    for (let k = 0; k < 3; k++) {
      const p = PADS[0];
      const it = newItem(s, 'cloverhead', p.x + (this.rand() - 0.5) * 3.5, 0, p.z + (this.rand() - 0.5) * 3.5, GARDEN_SRC);
      it.y = this.phys.floor(it.x, it.z) + it.r;
      it.rest = true;
      s.items.push(it);
    }
    for (const g of GROUPS) for (let k = 0; k < g.n; k++) this.spawnWild(g);
    // A downy on the porch, to say hello.
    const d = newDowny(s, 'clover', -12.6, 0, 35.6);
    d.y = this.phys.floor(d.x, d.z);
    d.homeX = -11.5;
    d.homeZ = 34.5;
    d.keep = true;
    d.hunger = 0.25;
    s.downies.push(d);
  }

  private spawnWild(g: Group): Downy {
    const a = this.rand() * Math.PI * 2;
    const r = this.rand() * 4;
    const x = g.x + Math.cos(a) * r;
    const z = g.z + Math.sin(a) * r;
    const d = newDowny(this.s, g.kind, x, 0, z);
    d.y = this.phys.floor(x, z) + 0.6;
    d.homeX = g.x;
    d.homeZ = g.z;
    d.hunger = 0.1 + this.rand() * 0.3;
    this.s.downies.push(d);
    return d;
  }

  private growAt(i: number, src: Source): void {
    const food = SOURCE_FOOD[src.kind];
    const a = this.rand() * Math.PI * 2;
    let x = src.x;
    let z = src.z;
    let lift = 0.12;
    if (src.kind === 'berry') {
      const r = 0.55 + this.rand() * 0.25;
      x += Math.cos(a) * r;
      z += Math.sin(a) * r;
      lift = 0.55 + this.rand() * 0.5;
    } else {
      const r = 0.2 + this.rand() * 0.8;
      x += Math.cos(a) * r;
      z += Math.sin(a) * r;
      lift = src.kind === 'root' ? 0.1 : 0.14;
    }
    const it = newItem(this.s, food, x, 0, z, i);
    it.y = this.phys.floor(x, z) + lift;
    it.rest = true;
    this.s.items.push(it);
  }

  private countSources(): void {
    this.srcCount.fill(0);
    for (const it of this.s.items) if (!it.gone && it.rest && it.src >= 0 && it.src < GARDEN_SRC) this.srcCount[it.src]++;
  }

  // ------------------------------------------------------------ market

  /** Today's price: the day's drift, softened a little by each sale today, never below the floor. */
  price(k: DownyKind): number {
    const m = this.s.market;
    return Math.max(1, Math.round(KIND[k].value * m.mult[k] * Math.max(SAT_FLOOR, Math.pow(1 - SATURATION, m.sold[k]))));
  }

  private rollMarket(first: boolean): void {
    const m = this.s.market;
    for (const k of KINDS) {
      m.prev[k] = first ? KIND[k].value : this.price(k);
      m.mult[k] = 0.75 + this.rand() * 0.5;
      m.sold[k] = 0;
    }
  }

  // ------------------------------------------------------------ the clock

  get night(): number {
    const h = this.s.hour;
    if (h >= 21 || h < 4) return 1;
    if (h >= 18.5) return (h - 18.5) / 2.5;
    if (h < 6.5) return 1 - (h - 4) / 2.5;
    return 0;
  }

  /** Until the lessons let the day run on, it stays late afternoon. */
  static readonly HOLD_HOUR = 16.5;

  /** The clock is held (late afternoon, the lessons not yet letting the day run on): your downies' hunger waits with it. */
  get clockHeld(): boolean {
    const h = this.s.hour;
    return h >= Sim.HOLD_HOUR && h < 20 && !this.knows('time');
  }

  private tickClock(dt: number): void {
    const s = this.s;
    if (this.clockHeld) return;
    s.hour += dt / HOUR;
    if (s.hour >= 24) {
      s.hour -= 24;
      s.day++;
    }
    if (s.hour >= 5 && s.night < s.day) this.overnight();
  }

  private overnight(): void {
    const s = this.s;
    // Tufts left lying blow away; prices drift and recover.
    for (const it of s.items) if (!it.gone && isTuft(it.type) && it.drawn === 0) it.gone = true;
    this.rollMarket(false);
    s.night = s.day;
  }

  sleep(): void {
    const s = this.s;
    if (s.hour >= 5) s.day++;
    s.hour = 6;
    if (s.night < s.day) this.overnight();
    // The pests leave with the night; the next night's first comes a few seconds after dark.
    for (const n of s.nettles) n.gone = true;
    this.nettleT = Math.min(this.nettleT, 5);
    this.emit({ t: 'sleep' });
  }

  // ------------------------------------------------------------ frame

  update(dt: number, c: Controls, aim: Aim): void {
    this.tickClock(dt);
    this.movePlayer(dt, c);
    this.bellows(dt, c, aim);
    this.updateDownies(dt);
    this.updateItems(dt);
    this.updateNettles(dt);
    this.updatePads(dt);
    this.updateSources(dt);
    this.updateSpawns(dt);
    this.goalT -= dt;
    if (this.goalT <= 0) {
      this.goalT = 0.5;
      this.checkGoals();
      this.sweep();
    }
  }

  /** Drop gone things from the lists now and then (not every frame). */
  private sweep(): void {
    const s = this.s;
    if (s.items.some((i) => i.gone)) s.items = s.items.filter((i) => !i.gone);
    if (s.downies.some((d) => d.gone)) s.downies = s.downies.filter((d) => !d.gone);
    if (s.nettles.some((n) => n.gone)) s.nettles = s.nettles.filter((n) => !n.gone);
  }

  // ------------------------------------------------------------ the player

  private movePlayer(dt: number, c: Controls): void {
    const p = this.s.player;
    const wet = waterAt(p.x, p.z) > p.y + 0.3;
    const sp = (c.sprint ? 7.4 : 4.7) * (wet ? 0.6 : 1);
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    const rx = Math.cos(p.yaw);
    const rz = -Math.sin(p.yaw);
    let wx = fx * c.moveZ + rx * c.moveX;
    let wz = fz * c.moveZ + rz * c.moveX;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) {
      wx /= wl;
      wz /= wl;
    }
    const k = p.grounded ? 11 : 2.2;
    p.vx = damp(p.vx, wx * sp, k, dt);
    p.vz = damp(p.vz, wz * sp, k, dt);
    this.coyote = p.grounded ? 0.12 : this.coyote - dt;
    if (c.jumpPressed && this.coyote > 0) {
      p.vy = 7.3;
      p.grounded = false;
      this.coyote = 0;
      this.glided = false;
      this.emit({ t: 'jump' });
    }
    p.gliding = false;
    if (!p.grounded) {
      if (this.s.up.glide > 0 && c.jump && p.vy < -1.4) {
        // The bellows' updraft: settle into a slow drift down.
        p.vy = damp(p.vy, -1.4, 7, dt);
        p.gliding = true;
        if (!this.glided) {
          this.glided = true;
          this.emit({ t: 'glide' });
        }
      } else p.vy -= PLAYER_G * dt;
    }
    const ox = p.x;
    const oz = p.z;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.y += p.vy * dt;
    const body = this.pbody;
    body.x = p.x;
    body.y = p.y;
    body.z = p.z;
    body.vx = p.vx;
    body.vy = p.vy;
    body.vz = p.vz;
    body.grounded = p.grounded;
    this.phys.collide(body, ox, oz, 'player');
    p.x = body.x;
    p.z = body.z;
    p.vx = body.vx;
    p.vz = body.vz;
    const fl = this.phys.floor(p.x, p.z);
    if (p.y <= fl) {
      if (!p.grounded && this.airborneVy < -4) this.emit({ t: 'land', v: clamp(-this.airborneVy / 14, 0, 1) });
      p.y = fl;
      p.vy = 0;
      p.grounded = true;
      this.glided = false;
    } else if (p.grounded && p.vy <= 0 && p.y - fl < 0.45) {
      // Walking downhill or off a step: stay on the ground.
      p.y = fl;
    } else {
      p.grounded = false;
    }
    this.airborneVy = p.vy;
    if (p.grounded) {
      const moved = Math.hypot(p.x - ox, p.z - oz);
      this.stride += moved;
      const every = c.sprint ? 2.3 : 1.9;
      if (this.stride - this.stepAt > every) {
        this.stepAt = this.stride;
        const z = zoneAt(p.x, p.z);
        const stone = pathAt(p.x, p.z) > 0.5 || z === 'ridge' || this.phys.floors.some((f) => f.a !== 0 && Math.hypot(p.x - f.cx, p.z - f.cz) < 3);
        this.emit({ t: 'step', stone, pitch: 0.9 + this.rand() * 0.2 });
      }
    }
    const z = zoneAt(p.x, p.z);
    if (!this.s.zones.includes(z)) {
      this.s.zones.push(z);
      this.emit({ t: 'zone', zone: z });
    }
  }

  // ------------------------------------------------------------ the bellows

  get range(): number {
    return RANGES[this.s.up.range] ?? RANGES[0];
  }

  /** The slot a thing would go into, or -1 if the canister refuses it. One slot per kind. */
  accept(t: Thing): number {
    const s = this.s;
    const cap = capacity(s);
    for (let i = 0; i < s.slots.length; i++) if (s.slots[i].t === t) return s.slots[i].n < cap ? i : -1;
    for (let i = 0; i < s.slots.length; i++) if (s.slots[i].t === null) return i;
    return -1;
  }

  /** Puts a thing in the canister. Returns false if refused. Fluff remembers the meal it came from. */
  stow(t: Thing, feed = 0): boolean {
    const i = this.accept(t);
    if (i < 0) return false;
    const s = this.s;
    const slot = s.slots[i];
    if (slot.t !== t) slot.feeds = undefined;
    slot.t = t;
    slot.n++;
    if (feed > 0 && isTuft(t)) (slot.feeds ??= []).push(feed);
    if (s.slots[s.sel].t === null) s.sel = i;
    return true;
  }

  /** Is a point inside the draw cone? Returns a pull strength 0..1, or 0. */
  private inCone(aim: Aim, x: number, y: number, z: number): number {
    const dx = x - aim.ex;
    const dy = y - aim.ey;
    const dz = z - aim.ez;
    const d = Math.hypot(dx, dy, dz);
    const R = this.range;
    if (d > R + 0.4 || d < 1e-3) return 0;
    const cos = (dx * aim.dx + dy * aim.dy + dz * aim.dz) / d;
    if (cos > CONE || (d < 2 && cos > NEAR_CONE)) return 0.35 + 0.65 * (1 - d / (R + 0.4));
    return 0;
  }

  private pull(b: { x: number; y: number; z: number; vx: number; vy: number; vz: number }, aim: Aim, k: number, dt: number): number {
    const dx = aim.mx - b.x;
    const dy = aim.my - b.y;
    const dz = aim.mz - b.z;
    const d = Math.hypot(dx, dy, dz) || 1e-3;
    const a = 34 * k + 10;
    b.vx += (dx / d) * a * dt;
    b.vy += (dy / d) * a * dt + 6 * dt;
    b.vz += (dz / d) * a * dt;
    // Bleed off sideways speed so things stream in instead of orbiting.
    const along = (b.vx * dx + b.vy * dy + b.vz * dz) / d;
    const bleed = Math.exp(-5 * dt);
    b.vx = (dx / d) * along + (b.vx - (dx / d) * along) * bleed;
    b.vy = (dy / d) * along + (b.vy - (dy / d) * along) * bleed;
    b.vz = (dz / d) * along + (b.vz - (dz / d) * along) * bleed;
    const sp = Math.hypot(b.vx, b.vy, b.vz);
    const max = 16;
    if (sp > max) {
      b.vx *= max / sp;
      b.vy *= max / sp;
      b.vz *= max / sp;
    }
    return d;
  }

  private refuse(b: { vx: number; vy: number; vz: number }, aim: Aim, t: Thing): void {
    b.vx = aim.dx * 5;
    b.vy = 2.5;
    b.vz = aim.dz * 5;
    if (this.fullWait <= 0) {
      this.fullWait = 0.7;
      this.emit({ t: 'full', thing: t });
    }
  }

  private bellows(dt: number, c: Controls, aim: Aim): void {
    const s = this.s;
    this.fullWait -= dt;
    this.puffWait -= dt;
    this.drawing = c.draw;
    this.drawPower = damp(this.drawPower, c.draw ? 1 : 0, c.draw ? 8 : 5, dt);
    for (const d of s.downies) d.held = false;
    if (c.draw) {
      // Downies come only when the crosshair is on them: the cone sweeps up food
      // and fluff, never a downy standing beside them.
      const aimed = this.aimedDowny(aim);
      for (const d of s.downies) {
        if (d.gone || (d.flyT >= 0 && d.flyT < 0.35) || d.noPull > 0) {
          d.drawn = 0;
          continue;
        }
        const k = this.inCone(aim, d.x, d.y + 0.25, d.z);
        // One already coming in keeps coming while it stays in the cone.
        if (d.drawn <= 0 || k <= 0) {
          d.drawn = 0;
          if (d !== aimed) continue;
          // A wild one digs in and struggles for a moment before it comes loose; a penned one of yours
          // takes a moment of steady aim, so a pull sweeping fluff up in the pen leaves it be.
          const need = this.tugNeed(d);
          if (d.tug < need) {
            if (d.tug === 0 && !d.tame) this.emit({ t: 'squeak', x: d.x, y: d.y, z: d.z, kind: d.kind });
            d.held = true;
            d.tug = Math.min(need, d.tug + dt);
            if (!d.tame) this.struggle(d, aim, dt, d.tug / need, !d.keep);
            continue;
          }
          if (need > 0 && !d.tame) this.emit({ t: 'squeak', x: d.x, y: d.y, z: d.z, kind: d.kind });
        }
        d.drawn += dt;
        d.grounded = false;
        d.target = null;
        const dist = this.pull(d, aim, Math.max(k, 0.35), dt);
        if (dist < ABSORB) {
          if (this.stow(d.kind)) {
            d.gone = true;
            s.stats.drawn++;
            this.emit({ t: 'suck', thing: d.kind, x: d.x, y: d.y, z: d.z, wild: !d.tame && !d.keep });
            if (!s.caught.includes(d.kind)) {
              s.caught.push(d.kind);
              this.emit({ t: 'first', kind: d.kind });
            }
            if (d.kind === 'clover') this.complete('catch');
            if (d.kind === 'ember') this.complete('ember');
            if (d.kind === 'thistle') this.complete('thistle');
            this.firstDraw();
          } else this.refuse(d, aim, d.kind);
        }
      }
      for (const it of s.items) {
        if (it.gone || (it.flyT >= 0 && it.flyT < 0.3) || it.noPull > 0) {
          it.drawn = 0;
          continue;
        }
        const k = this.inCone(aim, it.x, it.y, it.z);
        if (k <= 0) {
          it.drawn = 0;
          continue;
        }
        if (it.rest) {
          it.rest = false;
          it.src = -1;
        }
        it.drawn += dt;
        it.grounded = false;
        it.idle = 0;
        it.spinV = 14;
        const dist = this.pull(it, aim, k, dt);
        if (dist < ABSORB) {
          if (this.stow(it.type, it.feed)) {
            it.gone = true;
            s.stats.drawn++;
            this.emit({ t: 'suck', thing: it.type, x: it.x, y: it.y, z: it.z });
            this.firstDraw();
          } else this.refuse(it, aim, it.type);
        }
      }
      for (const n of s.nettles) {
        if (this.inCone(aim, n.x, n.y + 0.2, n.z) > 0) {
          if (n.bristle < 0.2) this.emit({ t: 'nettle', x: n.x, y: n.y, z: n.z });
          n.bristle = 1;
        }
      }
      // Silos give up their chosen kind to a draw at the outlet.
      this.siloT -= dt;
      if (this.siloT <= 0) {
        s.pads.forEach((p, i) => {
          if (p.kind !== 'silo' || !p.silo.length) return;
          const o = padSpots(i).outlet;
          const oy = this.phys.floor(o.x, o.z) + o.y;
          if (this.inCone(aim, o.x, oy, o.z) <= 0) return;
          const bin = p.silo[Math.min(p.siloSel, p.silo.length - 1)];
          if (!bin || bin.n <= 0) return;
          if (this.accept(bin.t) < 0) return;
          bin.n--;
          const it = newItem(s, bin.t, o.x, oy, o.z);
          it.flyT = 0.4;
          s.items.push(it);
          if (bin.n <= 0) {
            p.silo = p.silo.filter((b) => b.n > 0);
            p.siloSel = 0;
          }
          this.siloT = 0.14;
        });
      }
    } else {
      for (const d of s.downies) d.drawn = 0;
      for (const it of s.items) it.drawn = 0;
    }

    // A window that ran out under a held Blow waits for a fresh press before the next kind goes.
    if (!c.puff || c.puffPressed) this.waitRelease = false;
    const fire = ((c.puffPressed && this.puffWait <= 0.13) || (c.puff && this.puffWait <= 0)) && !this.waitRelease;
    if (fire && !c.draw) {
      this.puffWait = 0.25;
      this.puff(aim, c.puffPressed);
    }
  }

  /** Choose the next window after the chosen one that holds something. False if nothing is aboard. */
  private chooseNext(): boolean {
    const s = this.s;
    for (let k = 1; k <= s.slots.length; k++) {
      const i = (s.sel + k) % s.slots.length;
      if (s.slots[i].t && s.slots[i].n > 0) {
        s.sel = i;
        return true;
      }
    }
    return false;
  }

  /** What the crosshair is on: something drawable, a prickly nettleback, or nothing. */
  aimTarget(aim: Aim): 'target' | 'prickly' | 'sell' | 'pen' | null {
    const s = this.s;
    for (const n of s.nettles) if (!n.gone && this.inCone(aim, n.x, n.y + 0.2, n.z) > 0) return 'prickly';
    if (this.wouldSell(aim)) return 'sell';
    if (this.wouldPen(aim) >= 0) return 'pen';
    if (this.aimedDowny(aim)) return 'target';
    // Only what is under the crosshair and within Pull's reach: not something at the cone's edge while you aim past it.
    for (const it of s.items) if (!it.gone && it.noPull <= 0 && this.underAim(aim, it.x, it.y, it.z)) return 'target';
    return null;
  }

  /** Is a point within Pull's reach and close to the crosshair's line? */
  private underAim(aim: Aim, x: number, y: number, z: number): boolean {
    const dx = x - aim.ex;
    const dy = y - aim.ey;
    const dz = z - aim.ez;
    const d = Math.hypot(dx, dy, dz);
    if (d > this.range + 0.4 || d < 1e-3) return false;
    const ang = Math.acos(clamp((dx * aim.dx + dy * aim.dy + dz * aim.dz) / d, -1, 1));
    return ang < Math.max(Math.atan2(0.45, d), 0.09);
  }

  /**
   * The downy under the crosshair, if any: within reach, and the aim within
   * its body (with a little give for thumbs). Food or fluff nearer the
   * crosshair wins, so pulling fluff up beside a downy leaves the downy be.
   */
  aimedDowny(aim: Aim): Downy | null {
    const s = this.s;
    const R = this.range + 0.4;
    let best: Downy | null = null;
    let bs = 1;
    let ba = 0;
    let penned = false;
    for (const d of s.downies) {
      if (d.gone || (d.flyT >= 0 && d.flyT < 0.35) || d.noPull > 0) continue;
      const dx = d.x - aim.ex;
      const dy = d.y + 0.25 - aim.ey;
      const dz = d.z - aim.ez;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > R || dist < 1e-3) continue;
      const ang = Math.acos(clamp((dx * aim.dx + dy * aim.dy + dz * aim.dz) / dist, -1, 1));
      // Your penned downies come only when aimed at directly (no give for thumbs); one already tugging keeps a little more give.
      const inPen = d.tame && d.pen >= 0;
      let tol = inPen ? Math.max(Math.atan2(d.r, dist), 0.035) : Math.max(Math.atan2(d.r + 0.3, dist), 0.07);
      if (d.tug > 0) tol *= 1.3;
      if (ang / tol < bs) {
        bs = ang / tol;
        best = d;
        ba = ang;
        penned = inPen;
      }
    }
    if (!best) return null;
    // Food or fluff nearer the crosshair wins (by a wider margin over a penned downy).
    const beat = penned ? Math.max(ba * 1.6, 0.03) : ba * 0.8;
    for (const it of s.items) {
      if (it.gone || it.noPull > 0) continue;
      const dx = it.x - aim.ex;
      const dy = it.y - aim.ey;
      const dz = it.z - aim.ez;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > R || dist < 1e-3) continue;
      if (Math.acos(clamp((dx * aim.dx + dy * aim.dy + dz * aim.dz) / dist, -1, 1)) < beat) return null;
    }
    return best;
  }

  /** Seconds of steady pull before a downy comes loose: wild ones dig in, yours come at once. */
  tugNeed(d: Downy): number {
    if (d.tame) return d.pen >= 0 ? 0.3 : 0;
    if (d.keep) return 0.35;
    return d.kind === 'thistle' ? 1.5 : d.kind === 'clover' ? 0.9 : 1.1;
  }

  /**
   * A downy digging in against the pull: it creeps your way as it tires and
   * shakes. A wild one jinks: quick hops to one side or the other, so you keep
   * the crosshair on it to hold it (the porch downy only dodges a little).
   */
  private struggle(d: Downy, aim: Aim, dt: number, k: number, jinks: boolean): void {
    const dx = aim.ex - d.x;
    const dz = aim.ez - d.z;
    const l = Math.hypot(dx, dz) || 1;
    const creep = 0.2 + 0.7 * k;
    d.x += (dx / l) * creep * dt;
    d.z += (dz / l) * creep * dt;
    d.yaw = Math.atan2(-dx, -dz);
    d.target = null;
    // A wild one's hop timer (its own hopping waits while it is held) times the jinks: one every quarter to half second.
    if (jinks) d.hopT -= dt;
    if (d.grounded && (jinks ? d.hopT <= 0 : this.rand() < dt * 3)) {
      const side = this.rand() < 0.5 ? -1 : 1;
      const sp = jinks ? 1.5 + this.rand() * 0.8 : 0.9;
      d.vx = (-dz / l) * side * sp;
      d.vz = (dx / l) * side * sp;
      d.vy = jinks ? 1.9 : 1.5;
      d.grounded = false;
      d.squashV += 3;
      if (jinks) d.hopT = (d.kind === 'thistle' ? 0.12 : 0.2) + this.rand() * 0.3;
    }
  }

  private firstDraw(): void {
    if (!this.s.journal) this.s.journal = true;
  }

  /** Blow one of the chosen window's things out. pressed: a fresh press (not a held repeat). */
  puff(aim: Aim, pressed = true): void {
    const s = this.s;
    // The chosen window is empty but something is aboard: choose the next window that holds something.
    if (!s.slots[s.sel].t || s.slots[s.sel].n <= 0) this.chooseNext();
    const slot = s.slots[s.sel];
    const p = s.player;
    if (!slot.t || slot.n <= 0) {
      // Nothing aboard: an empty blow still shoves light things about, and says why nothing came out.
      this.emit({ t: 'puff', thing: null });
      if (pressed) this.emit({ t: 'deny', why: 'Nothing in the jar.' });
      for (const it of s.items) {
        if (it.gone) continue;
        const dx = it.x - aim.ex;
        const dz = it.z - aim.ez;
        const d = Math.hypot(dx, it.y - aim.ey, dz);
        if (d < 3.5 && (dx * aim.dx + (it.y - aim.ey) * aim.dy + dz * aim.dz) / (d || 1) > 0.8) {
          it.rest = false;
          it.src = -1;
          it.vx += aim.dx * 5;
          it.vy += 2.5;
          it.vz += aim.dz * 5;
          it.grounded = false;
        }
      }
      return;
    }
    const t = slot.t;
    slot.n--;
    const feed = isTuft(t) ? (slot.feeds?.shift() ?? 0) : 0;
    if (slot.n <= 0) {
      slot.n = 0;
      slot.t = null;
      slot.feeds = undefined;
      // Run out: the next window that holds something is chosen, ready for the next press.
      this.chooseNext();
      this.waitRelease = true;
    }
    const sp = 14;
    const x = aim.mx + aim.dx * 0.3;
    const y = aim.my + aim.dy * 0.3;
    const z = aim.mz + aim.dz * 0.3;
    if (isDowny(t)) {
      const d = newDowny(s, t, x, y - 0.25, z);
      d.vx = aim.dx * sp + p.vx * 0.5;
      d.vy = aim.dy * sp + 1.6;
      d.vz = aim.dz * sp + p.vz * 0.5;
      d.flyT = 0;
      d.tame = true;
      d.hunger = 0.35;
      d.squash = 1.3;
      d.yaw = Math.atan2(aim.dx, aim.dz);
      // A blown downy remembers where you stood (a pen helps in only one blown from outside it).
      d.homeX = p.x;
      d.homeZ = p.z;
      this.overRail(d);
      s.downies.push(d);
    } else {
      const it = newItem(s, t, x, y, z);
      it.vx = aim.dx * sp + p.vx * 0.5;
      it.vy = aim.dy * sp + 1.4;
      it.vz = aim.dz * sp + p.vz * 0.5;
      it.flyT = 0;
      it.spinV = 10;
      it.blown = true;
      it.feed = feed;
      s.items.push(it);
    }
    this.emit({ t: 'puff', thing: t });
  }

  /**
   * Tips a whole window out onto the ground just in front of you, so a full
   * jar never means blowing things out one by one. Returns how many came out.
   */
  empty(i: number, aim: Aim): number {
    const s = this.s;
    const slot = s.slots[i];
    if (!slot || !slot.t || slot.n <= 0) return 0;
    const t = slot.t;
    const n = slot.n;
    const feeds = slot.feeds ?? [];
    slot.t = null;
    slot.n = 0;
    slot.feeds = undefined;
    const p = s.player;
    const hl = Math.hypot(aim.dx, aim.dz) || 1;
    const fx = aim.dx / hl;
    const fz = aim.dz / hl;
    // Tossed a few metres ahead (not dropped at your feet), and left alone by the bellows for a moment,
    // so the next pull does not sweep them straight back in.
    for (let k = 0; k < n; k++) {
      const a = this.rand() * Math.PI * 2;
      const r = Math.sqrt(this.rand()) * 0.25;
      const x = p.x + fx * 0.8 + Math.cos(a) * r;
      const z = p.z + fz * 0.8 + Math.sin(a) * r;
      const y = p.y + 1.15 + k * 0.01;
      const sp = 4.2 + this.rand() * 1.4;
      const side = (this.rand() - 0.5) * 1.6;
      if (isDowny(t)) {
        const d = newDowny(s, t, x, y, z);
        d.tame = true;
        d.hunger = 0.35;
        d.vx = fx * sp * 0.75 - fz * side;
        d.vz = fz * sp * 0.75 + fx * side;
        d.vy = 3;
        d.flyT = 0.4;
        d.noPull = TIP_IGNORE;
        d.yaw = Math.atan2(fx, fz);
        d.homeX = p.x;
        d.homeZ = p.z;
        s.downies.push(d);
      } else {
        const it = newItem(s, t, x, y, z);
        it.vx = fx * sp - fz * side;
        it.vz = fz * sp + fx * side;
        it.vy = 2.4 + this.rand() * 0.6;
        it.spinV = 6;
        it.flyT = 0.3;
        it.noPull = TIP_IGNORE;
        // Tipped out on purpose, it is still yours: food to feed with, fluff to sell (the crate may take it).
        it.blown = true;
        it.feed = feeds[k] ?? 0;
        s.items.push(it);
      }
    }
    if (i === s.sel) this.chooseNext();
    this.emit({ t: 'empty', thing: t, n });
    return n;
  }

  // ------------------------------------------------------------ downies

  private penCounts: number[] = [0, 0, 0, 0, 0, 0];
  private penKinds: number[][] = PADS.map(() => [0, 0, 0, 0]);

  private updateDownies(dt: number): void {
    const s = this.s;
    const ds = s.downies;
    this.penCounts.fill(0);
    for (const row of this.penKinds) row.fill(0);
    for (const d of ds) {
      if (d.gone || d.pen < 0) continue;
      this.penCounts[d.pen]++;
      this.penKinds[d.pen][KINDS.indexOf(d.kind)]++;
    }
    const p = s.player;
    const running = Math.hypot(p.vx, p.vz) > 5.5;
    // While the clock is held for the lessons, your downies' hunger waits with it (penned, loose or on the porch),
    // and until the day runs on none of yours goes past hungry into starving.
    this.hungerWaits = this.clockHeld;
    this.hungerCap = this.teaching && !this.knows('time') ? 0.8 : 1;
    for (const d of ds) {
      if (d.gone) continue;
      this.updateDowny(d, dt, p.x, p.z, running);
    }
    // Soft bumps between downies.
    for (let i = 0; i < ds.length; i++) {
      const a = ds[i];
      if (a.gone || a.drawn > 0) continue;
      for (let j = i + 1; j < ds.length; j++) {
        const b = ds[j];
        if (b.gone || b.drawn > 0) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        if (Math.abs(dx) > 0.6 || Math.abs(dz) > 0.6 || Math.abs(b.y - a.y) > 0.5) continue;
        const d = Math.hypot(dx, dz);
        const min = a.r + b.r;
        if (d >= min || d < 1e-4) continue;
        const push = (min - d) * 0.5;
        a.x -= (dx / d) * push;
        a.z -= (dz / d) * push;
        b.x += (dx / d) * push;
        b.z += (dz / d) * push;
      }
    }
  }

  private hungerWaits = false;
  private hungerCap = 1;

  private updateDowny(d: Downy, dt: number, px: number, pz: number, running: boolean): void {
    const s = this.s;
    const info = KIND[d.kind];
    const wild = !d.tame;
    const kindIdx = KINDS.indexOf(d.kind);
    const company = d.pen >= 0 && this.penKinds[d.pen][kindIdx] > 1;
    // Penned downies settle: their hunger runs a third as fast as out in the open.
    const rate = (HUNGER_RATE / HOUR) * (wild ? 0.5 : 1) * (d.pen >= 0 ? PEN_HUNGER : 1) * (company ? 0.85 : 1);
    const yours = d.tame || d.keep;
    if (!(this.hungerWaits && yours)) d.hunger = Math.min(wild ? 0.7 : 1, d.hunger + rate * dt);
    if (yours && d.hunger > this.hungerCap) d.hunger = this.hungerCap;
    if (d.noPull > 0) d.noPull -= dt;
    d.starveT = d.hunger >= 1 ? d.starveT + dt / HOUR : 0;
    d.sinceFed += dt / HOUR;
    d.fright = Math.max(0, d.fright - dt);
    if (!d.held) d.tug = Math.max(0, d.tug - dt * 1.5);
    const crowded = d.pen >= 0 && this.penCounts[d.pen] > 10;
    // Hunger alone never frazzles: a starving downy still eats and sheds. Fright,
    // crowding and long neglect do.
    const restless = d.starveT >= NEGLECT_HOURS;
    const was = d.mood;
    d.mood = crowded || d.fright > 0 || restless ? 'frazzled' : d.hunger > 0.5 ? 'hungry' : d.sinceFed < 1 ? 'content' : 'calm';
    // A wild one notices you close by and hops away (yours and the porch downy do not).
    const pd0 = Math.hypot(d.x - px, d.z - pz);
    const alert = wild && !d.keep && d.drawn === 0 && !d.held && pd0 < (running ? NOTICE_RUN : NOTICE) && Math.abs(d.y - s.player.y) < 3;
    if (alert && !d.alert) {
      this.emit({ t: 'squeak', x: d.x, y: d.y, z: d.z, kind: d.kind });
      d.hopT = Math.min(d.hopT, 0.12 + this.rand() * 0.15);
    }
    d.alert = alert;
    if (d.mood === 'frazzled' && was !== 'frazzled' && d.drawn === 0) this.emit({ t: 'frazzle', x: d.x, y: d.y, z: d.z });
    d.blinkT -= dt;
    if (d.blinkT < -0.12) d.blinkT = 1.5 + this.rand() * 3.5;
    if (d.flyT >= 0) d.flyT += dt;

    // Motion. A downy blown at a pen is helped over the fence and in.
    if (d.flyT >= 0 && !d.grounded && d.drawn === 0 && this.penAssist) this.penPull(d, dt);
    const g = d.drawn > 0 ? 1.5 : G_DOWNY;
    if (!d.grounded) {
      d.vy -= g * dt;
      const drag = Math.exp(-(d.drawn > 0 ? 0.2 : 0.55) * dt);
      d.vx *= drag;
      d.vz *= drag;
    }
    const ox = d.x;
    const oz = d.z;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.z += d.vz * dt;
    if (d.drawn === 0) this.phys.collide(d, ox, oz, 'downy');
    const fl = this.phys.rest(d.x, d.z, true);
    if (d.y <= fl) {
      if (!d.grounded) {
        const impact = -d.vy;
        d.squashV -= Math.min(impact, 9) * 1.9;
        if (impact > 2.2) this.emit({ t: 'boing', x: d.x, y: d.y, z: d.z, v: clamp(impact / 9, 0, 1), kind: d.kind });
        if (waterAt(d.x, d.z) > fl - 0.1 && impact > 2) this.emit({ t: 'splash', x: d.x, y: fl, z: d.z });
        d.flyT = -1;
        d.vx *= 0.25;
        d.vz *= 0.25;
        d.hopT = Math.min(d.hopT, 0.25 + this.rand() * 0.5);
      }
      d.y = fl;
      d.vy = 0;
      d.grounded = true;
      const f = Math.exp(-9 * dt);
      d.vx *= f;
      d.vz *= f;
    } else if (d.y > fl + 0.02) d.grounded = false;
    if (d.grounded) {
      const pen = this.phys.penAt(d.x, d.z);
      if (pen !== d.pen) {
        // Hopped out of its pen: it has strayed (the journal says so and points at it).
        if (d.pen >= 0 && pen < 0 && d.tame) {
          d.strayFrom = d.pen;
          this.emit({ t: 'stray', x: d.x, y: d.y, z: d.z, pen: d.pen });
        }
        const was = d.pen;
        d.pen = pen;
        if (pen >= 0) {
          d.tame = true;
          d.strayFrom = -1;
          if (was < 0) this.emit({ t: 'penned', pen });
          this.complete('pen');
        }
      }
    }

    // Player bumps.
    const pdx = d.x - px;
    const pdz = d.z - pz;
    const pd = Math.hypot(pdx, pdz);
    if (pd < 0.62 && d.grounded && pd > 1e-3 && Math.abs(d.y - s.player.y) < 1) {
      d.vx += (pdx / pd) * 2.4;
      d.vz += (pdz / pd) * 2.4;
      d.vy = 2.2;
      d.grounded = false;
    }

    // Squash and stretch: a spring towards round, stretched in flight.
    const want = d.grounded ? 1 : clamp(1 + Math.abs(d.vy) * 0.035, 1, 1.22);
    d.squashV += ((want - d.squash) * 140 - d.squashV * 10) * dt;
    d.squash = clamp(d.squash + d.squashV * dt, 0.55, 1.45);

    if (d.drawn > 0 || d.held || !d.grounded) return;

    // Eating and shedding.
    if (d.eatT > 0) d.eatT -= dt;
    if (d.shedQ > 0) {
      d.shedT -= dt;
      if (d.shedT <= 0) this.shed(d);
    }
    // Hungry or starving, it looks for food it can see, unless something has
    // frightened it or it is busy getting away from you.
    if (d.hunger > 0.5 && d.eatT <= 0 && d.fright <= 0 && !alert) {
      const had = !!d.target && !d.target.gone;
      if (!d.target || d.target.gone || d.target.drawn > 0 || this.rand() < dt * 0.5) d.target = this.findFood(d);
      // Just spotted it: no more slow hungry bouncing, off it goes.
      if (!had && d.target) d.hopT = Math.min(d.hopT, d.hunger >= 1 ? 0.12 : 0.25);
      const t = d.target;
      if (t && Math.hypot(t.x - d.x, t.z - d.z) < d.r + 0.32 && Math.abs(t.y - d.y) < 0.9) this.eat(d, t);
    } else d.target = null;

    // Facing: towards where it is going, or the player if close and idle.
    if (pd < 6 && d.hopT > 0.25 && !alert) d.yaw += clamp(angleTo(d.yaw, Math.atan2(-pdx, -pdz)), -3 * dt, 3 * dt);

    d.hopT -= dt;
    if (d.hopT > 0 || d.eatT > 0) return;
    this.hop(d, info.hop, px, pz, alert);
  }

  /** Leaning on a fence and blowing down over it: the downy leaves the bellows above the rail, not into it. */
  private overRail(d: { x: number; y: number; z: number; r: number }): void {
    if (!this.penAssist) return;
    for (const ring of this.phys.rings) {
      if (Math.abs(Math.hypot(d.x - ring.x, d.z - ring.z) - PEN_R) > d.r + 0.7) continue;
      const fl = this.phys.floor(d.x, d.z);
      d.y = Math.max(d.y, fl + ring.top + 0.12);
    }
  }

  /** A downy blown at a pen: steered in, and lifted over the rail if it would hit the fence (like the sell crate's pull on fluff). */
  private penPull(d: { x: number; y: number; z: number; vx: number; vy: number; vz: number; homeX: number; homeZ: number }, dt: number): void {
    const reach = PEN_R + 3.2;
    for (const ring of this.phys.rings) {
      const dx = ring.x - d.x;
      const dz = ring.z - d.z;
      const dh = Math.hypot(dx, dz) || 1e-3;
      if (dh > reach) continue;
      // Blown in from outside (a blown downy's home is where you stood): once over the fence it settles in
      // rather than sailing on over the far side.
      if (dh < PEN_R - 0.2) {
        if (Math.hypot(d.homeX - ring.x, d.homeZ - ring.z) < PEN_R) return;
        const k = Math.exp(-2.6 * dt);
        d.vx = d.vx * k + (dx / dh) * 1.5 * dt;
        d.vz = d.vz * k + (dz / dh) * 1.5 * dt;
        return;
      }
      // Only one heading in.
      if ((d.vx * dx + d.vz * dz) / dh < 1) continue;
      const inner = PEN_R * 0.45;
      const k = 1 - (dh - inner) / (reach - inner);
      const a = 3 + 6 * k;
      d.vx += (dx / dh) * a * dt;
      d.vz += (dz / dh) * a * dt;
      if (dh > PEN_R - 0.4) {
        const foot = d.y - this.phys.floor(d.x, d.z);
        const want = ring.top + 0.9;
        if (foot < want) d.vy = Math.max(d.vy, Math.min(5, (want - foot) * 5));
      }
      return;
    }
  }

  private hop(d: Downy, base: number, px: number, pz: number, flee: boolean): void {
    const fraz = d.mood === 'frazzled';
    // A fright in a pen sends a downy running round inside the fence. Only a crowded pen or long neglect gets one over it.
    const crowded = d.pen >= 0 && this.penCounts[d.pen] > 10;
    const restless = d.starveT >= NEGLECT_HOURS;
    const scaredIn = fraz && d.pen >= 0 && !crowded && !restless;
    let tx = d.x;
    let tz = d.z;
    const r = this.rand;
    // Food it has seen comes first, whatever its mood: it heads straight for it, never away.
    const toFood = !!d.target && !d.target.gone && d.fright <= 0;
    if (toFood) {
      tx = d.target!.x;
      tz = d.target!.z;
    } else if (flee) {
      const a = Math.atan2(d.z - pz, d.x - px) + (r() - 0.5) * 0.9;
      tx = d.x + Math.cos(a) * 3;
      tz = d.z + Math.sin(a) * 3;
    } else if (d.pen >= 0 && d.kind === 'thistle' && !this.s.pads[d.pen].ups.includes('high')) {
      // Thistles will not stay behind a low fence: they back off from the
      // rails, then hop so the top of the hop is over them.
      const p = PADS[d.pen];
      const a = Math.atan2(d.z - p.z, d.x - p.x) + (r() - 0.5) * 0.5;
      const f = PEN_R - Math.hypot(d.x - p.x, d.z - p.z);
      const len = f < 1.2 ? -1.8 : Math.min(f * 2, 3);
      tx = d.x + Math.cos(a) * len;
      tz = d.z + Math.sin(a) * len;
    } else if (d.pen >= 0) {
      const p = PADS[d.pen];
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * (PEN_R - 1.2);
      tx = p.x + Math.cos(a) * rr;
      tz = p.z + Math.sin(a) * rr;
    } else if (!d.tame) {
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * (d.keep ? 3 : 6);
      tx = d.homeX + Math.cos(a) * rr;
      tz = d.homeZ + Math.sin(a) * rr;
    } else {
      const a = r() * Math.PI * 2;
      tx = d.x + Math.cos(a) * 2.5;
      tz = d.z + Math.sin(a) * 2.5;
    }
    // In water: head for the bank.
    if (waterAt(d.x, d.z) > this.phys.floor(d.x, d.z)) {
      const ax = d.x - POND.x;
      const az = d.z - POND.z;
      const l = Math.hypot(ax, az) || 1;
      tx = d.x + (ax / l) * 4;
      tz = d.z + (az / l) * 4;
    }
    // Frightened, crowded or long neglected, with no food to go to: quick hops anywhere (inside the fence, if only frightened).
    if (fraz && !toFood && !flee) {
      if (scaredIn) {
        const p = PADS[d.pen];
        const a = r() * Math.PI * 2;
        const rr = Math.sqrt(r()) * (PEN_R - 1.3);
        tx = p.x + Math.cos(a) * rr;
        tz = p.z + Math.sin(a) * rr;
      } else {
        const a = r() * Math.PI * 2;
        tx = d.x + Math.cos(a) * 3;
        tz = d.z + Math.sin(a) * 3;
      }
    }
    let dx = tx - d.x;
    let dz = tz - d.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 1e-3) {
      dx /= dist;
      dz /= dist;
    }
    const hungry = d.mood === 'hungry';
    const starving = d.hunger >= 1;
    // Only a crowded or long-neglected downy hops high enough to clear a low fence, and never on its way to food.
    const h = d.kind === 'thistle' ? base * (fraz ? 1.3 : 1) : toFood || flee || scaredIn ? base : fraz ? base * 2.3 : hungry ? base * 0.72 : base;
    const vy = Math.sqrt(2 * G_DOWNY * h);
    const air = (2 * vy) / G_DOWNY;
    const cap = toFood ? (starving ? 2.4 : 1.9) : flee ? 2.2 : scaredIn ? 2.4 : fraz || d.kind === 'thistle' ? 2.8 : 1.8;
    const hs = Math.min(dist / air, cap);
    d.vx = dx * hs;
    d.vz = dz * hs;
    d.vy = vy;
    d.grounded = false;
    d.squashV += 2.5;
    if (dist > 0.05) d.yaw = Math.atan2(dx, dz);
    // Hungry ones bounce slowly until they spot food; then they hurry to it, faster when starving.
    d.hopT = (0.45 + r() * 1.1) * (toFood ? (starving ? 0.35 : 0.55) : flee ? 0.45 : hungry ? 1.5 : 1) * (fraz && !toFood ? 0.45 : 1);
    if (d.mood === 'content' && r() < 0.2) this.emit({ t: 'chirp', x: d.x, y: d.y, z: d.z, kind: d.kind });
  }

  private findFood(d: Downy): Item | null {
    let best: Item | null = null;
    let bd = 10;
    for (const it of this.s.items) {
      if (it.gone || it.drawn > 0 || !isFood(it.type) || !eats(d.kind, it.type)) continue;
      // Food still flying from a blow is not food yet; food just dropping (a feeder, a crop) is.
      if (!it.grounded && !it.rest && it.flyT >= 0) continue;
      // Penned downies only see food inside their pen.
      if (d.pen >= 0 && this.phys.penAt(it.x, it.z) !== d.pen) continue;
      const dd = Math.hypot(it.x - d.x, it.z - d.z);
      if (dd < bd) {
        bd = dd;
        best = it;
      }
    }
    return best;
  }

  private eat(d: Downy, it: Item): void {
    const s = this.s;
    const food = it.type as Food;
    it.gone = true;
    d.target = null;
    d.eatT = 0.7;
    d.hunger = 0;
    d.starveT = 0;
    d.sinceFed = 0;
    s.stats.fed++;
    const fav = favourite(d.kind, food);
    // However hungry it was, a meal makes fluff. Only fright and a crowded pen stop it, and only a downy
    // you keep makes any: a wild one's meal makes none, so sweeping the meadow is no way to get rich.
    const crowded = d.pen >= 0 && this.penCounts[d.pen] > 10;
    if (d.fright <= 0 && !crowded && (d.tame || d.keep)) {
      let n = fav ? 2 : 1;
      if (d.kind === 'brook' && d.pen >= 0 && s.pads[d.pen].ups.includes('trough')) n++;
      d.shedQ = n;
      d.shedT = 0.75;
    }
    // A meal you gave (food you blew or tipped out) to a downy of yours: its fluff carries the meal's number.
    const you = it.blown && (d.tame || d.keep);
    d.feedId = you ? ++this.feedSerial : 0;
    this.emit({ t: 'eat', x: d.x, y: d.y, z: d.z, kind: d.kind, food, fav, tame: d.tame, you });
    // Wild downies forage on their own; the goal is for feeding one of yours.
    if (fav && d.tame) this.complete('feed');
  }

  private shed(d: Downy): void {
    const s = this.s;
    const n = d.shedQ;
    d.shedQ = 0;
    for (let i = 0; i < n; i++) {
      const it = newItem(s, KIND_TUFT[d.kind], d.x, d.y + 0.55, d.z);
      it.by = d.id;
      it.feed = d.feedId;
      const a = this.rand() * Math.PI * 2;
      it.vx = Math.cos(a) * 1.3;
      it.vz = Math.sin(a) * 1.3;
      it.vy = 2.6 + this.rand();
      it.spinV = 4;
      s.items.push(it);
    }
    d.squashV += 4;
    this.emit({ t: 'shed', x: d.x, y: d.y + 0.5, z: d.z, kind: d.kind, n });
    this.emit({ t: 'chirp', x: d.x, y: d.y, z: d.z, kind: d.kind });
  }

  // ------------------------------------------------------------ loose things

  private updateItems(dt: number): void {
    const s = this.s;
    for (const it of s.items) {
      if (it.gone) continue;
      if (it.noPull > 0) it.noPull -= dt;
      if (it.rest && it.drawn === 0) continue;
      const tuft = isTuft(it.type);
      // Fluff near the sell crate is drawn in, even lying on the ground, and counts as in flight so the crate takes it.
      if (tuft && it.drawn === 0 && cratePull(it, this.crateFloor, dt)) {
        if (it.grounded || it.rest) {
          it.grounded = false;
          it.rest = false;
          it.src = -1;
          it.vy = Math.max(it.vy, 1.4);
        }
        it.flyT = Math.min(Math.max(it.flyT, 0), 1);
      }
      if (it.flyT >= 0) it.flyT += dt;
      it.spin += it.spinV * dt;
      it.spinV *= Math.exp(-2 * dt);
      if (!it.grounded) {
        const g = it.drawn > 0 ? 1 : tuft ? G_TUFT : G_ITEM;
        it.vy -= g * dt;
        const drag = Math.exp(-(it.drawn > 0 ? 0.3 : tuft ? 1.5 : 0.12) * dt);
        it.vx *= drag;
        it.vz *= drag;
        if (tuft) it.vy *= Math.exp(-1.2 * dt);
        if (tuft && it.drawn === 0) {
          // Down drifts on the breeze.
          it.vx += 0.25 * dt;
          it.vz += Math.sin(it.id + it.y) * 0.2 * dt;
        }
      }
      const ox = it.x;
      const oz = it.z;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.z += it.vz * dt;
      if (it.drawn > 0) continue;
      this.phys.collide(it, ox, oz, 'item');
      if (it.flyT >= 0 && it.flyT < 3 && this.catchers(it)) continue;
      const fl = this.phys.rest(it.x, it.z, true) + it.r * 0.6;
      // Rolling downhill stays on the ground (and under its friction) instead of
      // hopping off every dip and skidding on: food puffed by a downy stays by it.
      if (it.y <= fl || (it.grounded && it.vy <= 0 && it.y - fl < 0.3)) {
        if (!it.grounded) {
          const wet = waterAt(it.x, it.z) > fl - it.r;
          if (wet && it.vy < -2) this.emit({ t: 'splash', x: it.x, y: fl, z: it.z });
          if (!tuft && it.vy < -2.5 && !wet) {
            it.vy = -it.vy * 0.3;
            it.y = fl;
            it.vx *= 0.6;
            it.vz *= 0.6;
            continue;
          }
          if (it.flyT >= 0) this.landed(it);
        }
        it.y = fl;
        it.vy = 0;
        it.grounded = true;
        it.flyT = -1;
        const f = Math.exp(-(tuft ? 6 : 5) * dt);
        it.vx *= f;
        it.vz *= f;
        it.idle += dt;
        this.chuteDrift(it, dt);
      } else if (it.y > fl + 0.03) it.grounded = false;
    }
  }

  /** The ground under the sell crate. */
  private get crateFloor(): number {
    return (this._crateFloor ??= this.phys.floor(CRATE_X, CRATE_Z));
  }
  private _crateFloor: number | undefined;
  private ghost: Item | undefined;

  /**
   * Inside the sell crate's catch: its box, the flared sides over the rim, or
   * the backboard behind it (fluff that reaches the board drops in, as it looks
   * like it should). The front is open, facing the lane.
   */
  private inCrate(x: number, y: number, z: number): boolean {
    const cfl = this.crateFloor;
    const rim = cfl + CRATE.h;
    if (y <= cfl) return false;
    if (y >= rim - 0.05 && y < rim + 0.85 && x > CRATE.x0 - 0.2 && x < CRATE.x1 + 0.2 && z > CRATE.z1 - 0.1 && z < CRATE.z1 + 0.4) return true;
    if (y >= rim + 0.5) return false;
    const m = y >= rim - 0.05 ? 0.35 : 0.15;
    return x > CRATE.x0 - m && x < CRATE.x1 + m && z > CRATE.z0 - m && z < CRATE.z1 + m;
  }

  /**
   * Would a blow now sell? Flies the chosen fluff ahead the way the real one
   * flies (the crate's pull included) and says whether it lands in the crate,
   * or on the ground near enough for the crate to draw it in.
   */
  wouldSell(aim: Aim): boolean {
    const s = this.s;
    const slot = s.slots[s.sel];
    if (!slot.t || slot.n <= 0 || !isTuft(slot.t)) return false;
    const p = s.player;
    // A scratch tuft, never added to the ranch, bumping into things as a real one would.
    const b = (this.ghost ??= newItem(s, 'tuft-clover', 0, 0, 0));
    b.x = aim.mx + aim.dx * 0.3;
    b.y = aim.my + aim.dy * 0.3;
    b.z = aim.mz + aim.dz * 0.3;
    b.vx = aim.dx * 14 + p.vx * 0.5;
    b.vy = aim.dy * 14 + 1.4;
    b.vz = aim.dz * 14 + p.vz * 0.5;
    const cfl = this.crateFloor;
    // The real step, so thin things (the board's easel legs) stop it here too.
    const dt = 1 / 60;
    for (let t = 0; t < 3; t += dt) {
      cratePull(b, cfl, dt);
      b.vy -= G_TUFT * dt;
      const drag = Math.exp(-1.5 * dt);
      b.vx *= drag;
      b.vz *= drag;
      b.vy *= Math.exp(-1.2 * dt);
      b.vx += 0.25 * dt;
      const ox = b.x;
      const oz = b.z;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      this.phys.collide(b, ox, oz, 'item');
      if (this.inCrate(b.x, b.y, b.z)) return true;
      if (b.y <= this.phys.floor(b.x, b.z)) return Math.hypot(b.x - CRATE_X, b.z - CRATE_Z) < PULL_R - 0.1;
    }
    return false;
  }

  private ghostDowny: Downy | undefined;

  /**
   * Would a blow now land the chosen downy in a pen? Flies it ahead the way a
   * real blown downy flies (the pen's help included) and returns the pen it
   * comes down in, or -1. The crosshair shows a little fence when it would.
   */
  wouldPen(aim: Aim): number {
    const s = this.s;
    const slot = s.slots[s.sel];
    if (!slot.t || slot.n <= 0 || !isDowny(slot.t) || !this.phys.rings.length) return -1;
    const p = s.player;
    const b = (this.ghostDowny ??= newDowny(s, 'clover', 0, 0, 0));
    b.x = aim.mx + aim.dx * 0.3;
    b.y = aim.my + aim.dy * 0.3 - 0.25;
    b.z = aim.mz + aim.dz * 0.3;
    b.vx = aim.dx * 14 + p.vx * 0.5;
    b.vy = aim.dy * 14 + 1.6;
    b.vz = aim.dz * 14 + p.vz * 0.5;
    b.homeX = p.x;
    b.homeZ = p.z;
    b.r = 0.26;
    this.overRail(b);
    b.grounded = false;
    const dt = 1 / 60;
    for (let t = 0; t < 3; t += dt) {
      if (this.penAssist) this.penPull(b, dt);
      b.vy -= G_DOWNY * dt;
      const drag = Math.exp(-0.55 * dt);
      b.vx *= drag;
      b.vz *= drag;
      const ox = b.x;
      const oz = b.z;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      this.phys.collide(b, ox, oz, 'downy');
      if (b.y <= this.phys.rest(b.x, b.z, true)) return this.phys.penAt(b.x, b.z);
    }
    return -1;
  }

  /** The Exchange crate, silos and feeder hoppers swallow things puffed into them. */
  private catchers(it: Item): boolean {
    const s = this.s;
    // The Exchange.
    const cfl = this.crateFloor;
    if (this.inCrate(it.x, it.y, it.z)) {
      if (isTuft(it.type)) {
        const k = TUFT_KIND[it.type];
        const coins = this.price(k);
        s.market.sold[k]++;
        s.coins += coins;
        s.earned += coins;
        s.stats.sold++;
        it.gone = true;
        // The loop closed: a meal you gave, its fluff pulled up and blown in. Counted once per meal.
        const cycle = it.blown && it.feed > 0 && !this.cycled.has(it.feed);
        if (cycle) {
          this.cycled.add(it.feed);
          if (this.cycled.size > 64) this.cycled.delete(this.cycled.values().next().value!);
        }
        this.emit({ t: 'sell', x: it.x, y: cfl + CRATE.h, z: it.z, kind: k, coins, blown: it.blown, cycle });
        if (s.stats.sold >= 20) this.complete('sell');
        return true;
      }
      it.vy = 5;
      it.vx = -it.vx * 0.3 + 1;
      it.vz = -it.vz * 0.3 - 1.5;
      it.flyT = 3;
      this.emit({ t: 'reject', x: it.x, y: it.y, z: it.z });
      return true;
    }
    for (let i = 0; i < s.pads.length; i++) {
      const p = s.pads[i];
      const at = PADS[i];
      if (p.kind === 'silo') {
        const fl = this.phys.floor(at.x, at.z);
        if (Math.hypot(it.x - at.x, it.z - at.z) < SILO_R + it.r + 0.15 && it.y < fl + SILO_H + 0.6) {
          let bin = p.silo.find((b) => b.t === it.type);
          if (!bin && p.silo.length < SILO_KINDS) p.silo.push((bin = { t: it.type, n: 0 }));
          if (bin && bin.n < SILO_CAP) {
            bin.n++;
            it.gone = true;
            this.emit({ t: 'store', x: it.x, y: it.y, z: it.z, where: 'silo', pad: i });
            return true;
          }
          this.emit({ t: 'deny', why: 'The silo is full.' });
          return false;
        }
      } else if (p.kind === 'pen' && p.ups.includes('feeder') && isFood(it.type)) {
        const h = padSpots(i).hopper;
        const fl = this.phys.floor(h.x, h.z);
        if (Math.hypot(it.x - h.x, it.z - h.z) < 0.75 && Math.abs(it.y - (fl + h.y)) < 0.8) {
          const fd = p.feeder;
          if ((fd.t === null || fd.t === it.type) && fd.n < FEEDER_CAP) {
            fd.t = it.type;
            fd.n++;
            it.gone = true;
            this.emit({ t: 'store', x: it.x, y: it.y, z: it.z, where: 'feeder', pad: i });
            return true;
          }
        }
      }
    }
    return false;
  }

  /** A puffed thing came down: plant it if it landed on an empty garden. */
  private landed(it: Item): void {
    if (!isFood(it.type)) return;
    const s = this.s;
    for (let i = 0; i < s.pads.length; i++) {
      const p = s.pads[i];
      if (p.kind !== 'garden' || p.crop) continue;
      const at = PADS[i];
      if (Math.abs(it.x - at.x) < BED_HALF && Math.abs(it.z - at.z) < BED_HALF) {
        p.crop = it.type;
        p.grow = 0;
        it.gone = true;
        this.emit({ t: 'plant', pad: i, food: it.type });
        this.complete('plant');
        return;
      }
    }
  }

  /** Down lying in a pen with a chute slides to the box. */
  private chuteDrift(it: Item, dt: number): void {
    if (!isTuft(it.type)) return;
    const pen = this.phys.penAt(it.x, it.z);
    if (pen < 0) return;
    const p = this.s.pads[pen];
    if (!p.ups.includes('chute')) return;
    const c = padSpots(pen).chute;
    const dx = c.x - it.x;
    const dz = c.z - it.z;
    const d = Math.hypot(dx, dz);
    if (d < PEN_R * 0.25 + 0.9 || it.idle > 1.2) {
      p.chute[KINDS.indexOf(TUFT_KIND[it.type])]++;
      it.gone = true;
      return;
    }
    it.x += (dx / d) * 1.6 * dt;
    it.z += (dz / d) * 1.6 * dt;
  }

  // ------------------------------------------------------------ nettlebacks

  private updateNettles(dt: number): void {
    const s = this.s;
    const night = s.hour >= 20.5 || s.hour < 4.5;
    const p = s.player;
    this.nettleT -= dt;
    const max = Math.min(4, 2 + Math.floor(s.day / 3));
    const alive = s.nettles.filter((n) => !n.gone).length;
    if (night && this.nettleT <= 0 && alive < max && this.knows('nettles')) {
      this.nettleT = 22 + this.rand() * 14;
      const x = -26 + this.rand() * 52;
      const z = -53;
      s.nettles.push({ id: s.nextId++, x, y: this.phys.floor(x, z), z, vx: 0, vy: 0, vz: 0, r: 0.35, grounded: true, yaw: 0, mode: 'roam', modeT: 0, tx: 0, tz: RANCH_Z - 2, bristle: 0, roll: 0, gone: false, snuffT: 2 });
    }
    let danger = 0;
    for (const n of s.nettles) {
      if (n.gone) continue;
      n.modeT -= dt;
      n.bristle = Math.max(0, n.bristle - dt * 0.8);
      if (!night && n.mode !== 'leave' && n.mode !== 'roll') n.mode = 'leave';
      let speed = 1.3;
      if (n.mode === 'roll') {
        const sp = Math.hypot(n.vx, n.vz);
        n.roll += (sp * dt) / 0.35;
        const f = Math.exp(-1.6 * dt);
        n.vx *= f;
        n.vz *= f;
        if (sp < 0.6) {
          n.mode = 'flee';
          n.modeT = 20;
        }
      } else {
        if (n.mode === 'flee' || n.mode === 'leave') {
          n.tx = n.x * 0.6;
          n.tz = -56;
          speed = n.mode === 'flee' ? 2.3 : 1.5;
          if (n.mode === 'flee' && n.modeT <= 0) n.mode = 'roam';
          if (n.mode === 'leave' && n.z < -50 && Math.hypot(n.x - p.x, n.z - p.z) > 20) n.gone = true;
        } else this.nettleAim(n);
        const dx = n.tx - n.x;
        const dz = n.tz - n.z;
        const want = Math.atan2(dx, dz);
        n.yaw += clamp(angleTo(n.yaw, want), -2.5 * dt, 2.5 * dt);
        const go = Math.hypot(dx, dz) > 0.4 ? speed : 0;
        n.vx = Math.sin(n.yaw) * go;
        n.vz = Math.cos(n.yaw) * go;
        n.roll = damp(n.roll, 0, 6, dt);
      }
      const ox = n.x;
      const oz = n.z;
      n.x += n.vx * dt;
      n.z += n.vz * dt;
      if (this.phys.collide(n, ox, oz, 'nettle') && n.mode === 'roam') n.yaw += 0.8;
      n.y = this.phys.floor(n.x, n.z);
      // Frighten downies that can see it; eat down lying about.
      for (const d of s.downies) {
        if (d.gone || Math.abs(d.x - n.x) > 3 || Math.abs(d.z - n.z) > 3) continue;
        if (Math.hypot(d.x - n.x, d.z - n.z) > 3) continue;
        if (d.pen >= 0 && s.pads[d.pen].ups.includes('hedge')) continue;
        d.fright = 3;
      }
      if (n.mode === 'roam') {
        for (const it of s.items) {
          if (it.gone || !isTuft(it.type) || !it.grounded) continue;
          if (Math.abs(it.x - n.x) < 0.6 && Math.abs(it.z - n.z) < 0.6) it.gone = true;
        }
      }
      const pd = Math.hypot(n.x - p.x, n.z - p.z);
      danger = Math.max(danger, 1 - clamp((pd - 4) / 16, 0, 1));
      n.snuffT -= dt;
      if (n.snuffT <= 0 && pd < 14) {
        n.snuffT = 4 + this.rand() * 4;
        this.emit({ t: 'nettle', x: n.x, y: n.y, z: n.z });
      }
      // Hit by something puffed.
      if (n.mode !== 'roll') this.nettleHits(n);
    }
    let fraz = 0;
    for (const d of s.downies) if (!d.gone && d.pen >= 0 && d.mood === 'frazzled') fraz++;
    this.danger = clamp(Math.max(danger, fraz > 0 ? 0.35 : 0), 0, 1);
  }

  private nettleAim(n: Nettle): void {
    const s = this.s;
    // Down on the ground nearby is a treat.
    let best = 8;
    let tx = NaN;
    let tz = NaN;
    for (const it of s.items) {
      if (it.gone || !isTuft(it.type) || !it.grounded) continue;
      const d = Math.hypot(it.x - n.x, it.z - n.z);
      if (d < best) {
        best = d;
        tx = it.x;
        tz = it.z;
      }
    }
    if (!Number.isNaN(tx)) {
      n.tx = tx;
      n.tz = tz;
      return;
    }
    if (n.z < RANCH_Z - 1) {
      n.tx = 0;
      n.tz = RANCH_Z + 2;
      return;
    }
    if (n.modeT <= 0) {
      n.modeT = 8 + this.rand() * 8;
      const open = s.pads.map((p, i) => ({ p, i })).filter(({ p }) => p.kind === 'pen' && !p.ups.includes('hedge'));
      if (open.length) {
        const pick = open[Math.floor(this.rand() * open.length)];
        const at = PADS[pick.i];
        const a = this.rand() * Math.PI * 2;
        n.tx = at.x + Math.cos(a) * 2;
        n.tz = at.z + Math.sin(a) * 2;
      } else {
        n.tx = -20 + this.rand() * 50;
        n.tz = 24 + this.rand() * 20;
      }
    }
  }

  private nettleHits(n: Nettle): void {
    const hit = (b: { x: number; y: number; z: number; vx: number; vy: number; vz: number; flyT: number; drawn: number }) => {
      // Anything puffed, in the air or skidding along the ground.
      if (b.drawn > 0 || (b.flyT < 0 && Math.hypot(b.vx, b.vz) < 4)) return false;
      if (Math.abs(b.x - n.x) > 0.8 || Math.abs(b.z - n.z) > 0.8 || b.y - n.y > 1.1) return false;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp < 3) return false;
      n.mode = 'roll';
      n.vx = (b.vx / sp) * 7.5;
      n.vz = (b.vz / sp) * 7.5;
      b.vx *= -0.25;
      b.vz *= -0.25;
      b.vy = 2;
      this.emit({ t: 'nettlehit', x: n.x, y: n.y, z: n.z });
      return true;
    };
    for (const it of this.s.items) if (!it.gone && hit(it)) return;
    for (const d of this.s.downies) if (!d.gone && hit(d)) return;
  }

  // ------------------------------------------------------------ pads

  private updatePads(dt: number): void {
    const s = this.s;
    s.pads.forEach((p, i) => {
      const at = PADS[i];
      if (p.kind === 'garden' && p.crop) {
        const speed = p.ups.includes('sprinkler') ? 1.5 : 1;
        p.grow = Math.min(1, p.grow + (dt * speed) / (GARDEN_HOURS * HOUR));
        if (p.grow >= 1) {
          const yieldN = p.ups.includes('soil') ? 8 : 5;
          let on = 0;
          for (const it of s.items) if (!it.gone && Math.abs(it.x - at.x) < BED_HALF && Math.abs(it.z - at.z) < BED_HALF && it.drawn === 0) on++;
          if (on + yieldN <= yieldN * 2) {
            p.grow = 0;
            const fl = this.phys.floor(at.x, at.z);
            for (let k = 0; k < yieldN; k++) {
              const it = newItem(s, p.crop, at.x + (this.rand() - 0.5) * 4, fl + 0.3, at.z + (this.rand() - 0.5) * 4, GARDEN_SRC + i);
              it.vy = 2.5 + this.rand() * 1.5;
              it.vx = (this.rand() - 0.5) * 0.6;
              it.vz = (this.rand() - 0.5) * 0.6;
              it.spinV = 6;
              s.items.push(it);
            }
            this.emit({ t: 'crop', pad: i });
          }
        }
      } else if (p.kind === 'pen' && p.ups.includes('feeder')) {
        p.feedT -= dt;
        if (p.feedT > 0 || p.feeder.n <= 0 || !p.feeder.t) return;
        const food = p.feeder.t;
        let hungry = false;
        for (const d of s.downies) if (!d.gone && d.pen === i && d.hunger > 0.5 && eats(d.kind, food)) hungry = true;
        if (!hungry) return;
        let lying = 0;
        for (const it of s.items) if (!it.gone && it.type === food && this.phys.penAt(it.x, it.z) === i) lying++;
        if (lying > 0) return;
        p.feeder.n--;
        if (p.feeder.n <= 0) p.feeder.t = null;
        p.feedT = 2.5;
        const h = padSpots(i).hopper;
        const fl = this.phys.floor(h.x, h.z);
        const it = newItem(s, food, h.x, fl + 0.9, h.z);
        it.vx = (at.x - h.x) * 0.4;
        it.vz = (at.z - h.z) * 0.4;
        it.vy = 1;
        s.items.push(it);
      }
    });
  }

  // ------------------------------------------------------------ wild food and spawning

  private updateSources(dt: number): void {
    const s = this.s;
    this.srcT -= dt;
    if (this.srcT <= 0) {
      this.srcT = 1;
      this.countSources();
    }
    s.sources.forEach((src, i) => {
      if (this.srcCount[i] >= SOURCE_MAX) {
        src.t = 0;
        return;
      }
      src.t += dt;
      if (src.t >= SOURCE_REGROW) {
        src.t = 0;
        this.growAt(i, src);
        this.srcCount[i]++;
      }
    });
  }

  private updateSpawns(dt: number): void {
    this.spawnT -= dt;
    if (this.spawnT > 0 || !this.wild) return;
    this.spawnT = 2;
    const s = this.s;
    const p = s.player;
    let active = 0;
    for (const d of s.downies) if (!d.gone) active++;
    // Far wild downies come and go so the count stays small.
    for (const d of s.downies) {
      if (d.gone || d.tame || d.keep) continue;
      const far = Math.hypot(d.x - p.x, d.z - p.z);
      const dusk = s.hour >= 17 && s.hour < 21;
      if ((d.kind === 'thistle' && !dusk && far > 25) || (active > WILD_CAP && far > 60)) {
        d.gone = true;
        active--;
      }
    }
    if (active >= WILD_CAP) return;
    // One refill a tick for the home groups, and the thistles on their own.
    for (const g of GROUPS) {
      let n = 0;
      for (const d of s.downies) if (!d.gone && !d.tame && d.kind === g.kind && Math.abs(d.homeX - g.x) < 1 && Math.abs(d.homeZ - g.z) < 1) n++;
      if (n < g.n && Math.hypot(g.x - p.x, g.z - p.z) > 30) {
        this.spawnWild(g);
        break;
      }
    }
    const dusk = s.hour >= 17.5 && s.hour < 20.5;
    if (dusk) {
      let n = 0;
      for (const d of s.downies) if (!d.gone && !d.tame && d.kind === 'thistle') n++;
      if (n < 2 && Math.hypot(RIDGE_TOP.x - p.x, RIDGE_TOP.z - p.z) > 18) this.spawnWild({ kind: 'thistle', x: RIDGE_TOP.x, z: RIDGE_TOP.z, n: 2 });
    }
    // Finding a thistle: being close to one counts.
    if (!this.thistleSeen) {
      for (const d of s.downies) {
        if (!d.gone && d.kind === 'thistle' && Math.hypot(d.x - p.x, d.z - p.z) < 9) {
          this.thistleSeen = true;
          this.complete('thistle');
        }
      }
    }
  }

  // ------------------------------------------------------------ the journal

  complete(id: GoalId): void {
    const s = this.s;
    if (s.goals.includes(id)) return;
    s.goals.push(id);
    const g = GOALS.find((q) => q.id === id)!;
    s.coins += g.reward;
    s.earned += g.reward;
    this.emit({ t: 'goal', id });
  }

  private checkGoals(): void {
    const s = this.s;
    if (s.earned >= 10000) this.complete('rich');
  }

  /** The next goals to show: the first two not yet done. */
  openGoals(n = 2): typeof GOALS {
    return GOALS.filter((g) => !this.s.goals.includes(g.id)).slice(0, n);
  }

  // ------------------------------------------------------------ interacting

  /** What the player could interact with from here, if anything. */
  interactable(aim: Aim): Interactable | null {
    const s = this.s;
    const p = s.player;
    let best: Interactable | null = null;
    let bs = -1;
    const consider = (it: Interactable, reach: number) => {
      const dx = it.x - p.x;
      const dz = it.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > reach) return;
      const facing = d < 0.8 ? 1 : (dx * aim.dx + dz * aim.dz) / (d * Math.hypot(aim.dx, aim.dz) || 1);
      if (facing < 0.35) return;
      const score = facing * 2 - d / reach;
      if (score > bs) {
        bs = score;
        best = it;
      }
    };
    s.pads.forEach((pad, i) => {
      if (!this.padUsable(i)) return;
      const sp = padSpots(i);
      const fl = this.phys.floor(sp.post.x, sp.post.z);
      const label = pad.kind === 'empty' ? 'Empty plot' : pad.kind === 'pen' ? 'Pen post' : pad.kind === 'garden' ? 'Garden post' : 'Silo post';
      // The post's arm is where the tags hang: aim anywhere along it.
      consider({ kind: pad.kind === 'silo' ? 'silo' : 'pad', id: i, label, x: sp.post.x, y: fl + 1.2, z: sp.post.z }, 2.8);
      consider({ kind: pad.kind === 'silo' ? 'silo' : 'pad', id: i, label, x: sp.post.x + 1.7, y: fl + 1.8, z: sp.post.z }, 3.2);
      if (pad.kind === 'pen' && pad.ups.includes('chute')) {
        const n = pad.chute.reduce((a, b) => a + b, 0);
        const cfl = this.phys.floor(sp.chute.x, sp.chute.z);
        consider({ kind: 'chute', id: i, label: n ? `Fluff box, ${n}` : 'Fluff box, empty', x: sp.chute.x, y: cfl + 0.6, z: sp.chute.z }, 2.4);
      }
    });
    if (this.knows('bench')) consider({ kind: 'bench', id: 0, label: 'Workbench', x: WORKBENCH.x, y: this.phys.floor(WORKBENCH.x, WORKBENCH.z) + 1.4, z: WORKBENCH.z }, BENCH_REACH);
    if (this.knows('sleep')) consider({ kind: 'door', id: 0, label: 'Front door', x: DOOR.x, y: this.phys.floor(DOOR.x, DOOR.z) + 1.4, z: DOOR.z }, 2.6);
    for (const g of Object.keys(GATES) as GateId[]) {
      if (s.gates[g] || !this.knows('gates')) continue;
      const gt = GATES[g];
      const side = g === 'ridge' ? 1 : -1;
      consider({ kind: 'gate', id: g, label: `Gate to ${gt.name}`, x: gt.x + side * 0.6, y: this.phys.floor(gt.x, gt.z) + 1.5, z: gt.z }, 3.4);
    }
    return best;
  }

  /** Which builds and upgrades the lessons have brought in: each tag hangs once it matters. */
  private buildKnown(k: Exclude<PadKind, 'empty'>): boolean {
    return k === 'pen' ? this.knows('pads') : k === 'garden' ? this.knows('garden') : this.knows('silo');
  }

  private upKnown(id: string): boolean {
    return this.knows(`up:${id}`);
  }

  /** Does this pad's post have anything to offer yet? (Cheap: no menu is built.) */
  padUsable(i: number): boolean {
    if (!this.knows('pads')) return false;
    const pad = this.s.pads[i];
    if (pad.kind === 'empty') return true;
    if (pad.kind === 'pen') return pad.ups.includes('feeder') || PEN_UPS.some((u) => !pad.ups.includes(u.id) && this.upKnown(u.id));
    return true;
  }

  menu(it: Interactable): MenuOption[] {
    const s = this.s;
    const can = (c: number) => s.coins >= c;
    const out: MenuOption[] = [];
    if (it.kind === 'pad' || it.kind === 'silo') {
      const i = it.id as number;
      const pad = s.pads[i];
      if (pad.kind === 'empty') {
        for (const k of ['pen', 'garden', 'silo'] as const) if (this.buildKnown(k)) out.push({ id: `build:${k}`, title: BUILD_NAME[k], price: BUILD_COST[k], ok: can(BUILD_COST[k]), note: k === 'pen' ? 'A round corral' : k === 'garden' ? 'Blow food in to plant' : 'Stores four kinds' });
      } else if (pad.kind === 'pen') {
        for (const u of PEN_UPS) if (!pad.ups.includes(u.id) && this.upKnown(u.id)) out.push({ id: `pen:${u.id}`, title: u.name, price: u.cost, ok: can(u.cost), note: u.line });
        if (pad.ups.includes('feeder')) out.push({ id: 'info', title: pad.feeder.n ? `Feeder: ${pad.feeder.n}` : 'Feeder empty', price: null, ok: false, note: 'Blow food in at the top' });
      } else if (pad.kind === 'garden') {
        if (this.upKnown('garden')) for (const u of GARDEN_UPS) if (!pad.ups.includes(u.id)) out.push({ id: `garden:${u.id}`, title: u.name, price: u.cost, ok: can(u.cost), note: u.line });
        out.push({ id: 'garden:clear', title: pad.crop ? 'Pull the crop' : 'Bed is empty', price: null, ok: !!pad.crop, note: pad.crop ? 'Then blow in something new' : 'Blow food in to plant it' });
      } else if (pad.kind === 'silo') {
        if (!pad.silo.length) out.push({ id: 'info', title: 'Silo is empty', price: null, ok: false, note: 'Blow food or fluff at it' });
        pad.silo.forEach((b, k) => out.push({ id: `silo:${k}`, title: `${thingName(b.t, 2)}`, price: null, ok: true, note: `${b.n} stored${k === pad.siloSel ? ', pulling these' : ''}` }));
      }
    } else if (it.kind === 'bench') {
      for (const u of BENCH_UPS) {
        if (!this.upKnown(u.id)) continue;
        const lvl = s.up[u.id];
        if (lvl >= u.costs.length) continue;
        const c = u.costs[lvl];
        out.push({ id: `bench:${u.id}`, title: u.name, price: c, ok: can(c), note: u.line });
      }
      if (!out.length) out.push({ id: 'info', title: 'Nothing left to fit', price: null, ok: false, note: 'The bellows are as good as they get' });
    } else if (it.kind === 'door') {
      out.push({ id: 'sleep', title: 'Sleep till morning', price: null, ok: true, note: 'Saves the ranch' });
    } else if (it.kind === 'gate') {
      const g = GATES[it.id as GateId];
      out.push({ id: `gate:${it.id}`, title: g.name, price: g.cost, ok: can(g.cost), note: 'Opens the gate' });
    } else if (it.kind === 'chute') {
      this.emptyChute(it.id as number);
    }
    return out;
  }

  /** Carries out a menu choice. Returns true if something changed. */
  choose(it: Interactable, id: string): boolean {
    const s = this.s;
    const [a, b] = id.split(':');
    const pay = (c: number) => {
      if (s.coins < c) {
        this.emit({ t: 'deny', why: `That needs ${fmtCoins(c)} coins.` });
        return false;
      }
      s.coins -= c;
      return true;
    };
    if (a === 'build') {
      const i = it.id as number;
      const k = b as Exclude<PadKind, 'empty'>;
      if (!pay(BUILD_COST[k])) return false;
      const pad = s.pads[i];
      pad.kind = k;
      pad.ups = [];
      pad.crop = null;
      pad.grow = 0;
      this.phys.setPads(s.pads);
      // Anything standing on a new pen stays on the side it was on.
      this.emit({ t: 'build', pad: i, what: k, x: PADS[i].x, z: PADS[i].z });
      return true;
    }
    if (a === 'pen') {
      const i = it.id as number;
      const u = PEN_UPS.find((q) => q.id === b)!;
      if (!pay(u.cost)) return false;
      s.pads[i].ups.push(u.id as PenUp);
      this.phys.setPads(s.pads);
      this.emit({ t: 'build', pad: i, what: u.id, x: PADS[i].x, z: PADS[i].z });
      if (u.id === 'feeder') this.complete('feeder');
      return true;
    }
    if (a === 'garden') {
      const i = it.id as number;
      if (b === 'clear') {
        s.pads[i].crop = null;
        s.pads[i].grow = 0;
        this.emit({ t: 'build', pad: i, what: 'clear', x: PADS[i].x, z: PADS[i].z });
        return true;
      }
      const u = GARDEN_UPS.find((q) => q.id === b)!;
      if (!pay(u.cost)) return false;
      s.pads[i].ups.push(u.id as GardenUp);
      this.emit({ t: 'build', pad: i, what: u.id, x: PADS[i].x, z: PADS[i].z });
      return true;
    }
    if (a === 'silo') {
      s.pads[it.id as number].siloSel = Number(b);
      return true;
    }
    if (a === 'bench') {
      const u = BENCH_UPS.find((q) => q.id === b)!;
      const lvl = s.up[u.id as BenchUp];
      if (lvl >= u.costs.length || !pay(u.costs[lvl])) return false;
      s.up[u.id as BenchUp]++;
      if (u.id === 'slots') s.slots.push({ t: null, n: 0 });
      this.emit({ t: 'build', pad: -1, what: u.id, x: WORKBENCH.x, z: WORKBENCH.z });
      return true;
    }
    if (a === 'gate') {
      const g = b as GateId;
      if (!pay(GATES[g].cost)) return false;
      s.gates[g] = true;
      this.phys.gates = { ...s.gates };
      this.emit({ t: 'gate', gate: g });
      this.complete(g === 'ridge' ? 'ridge' : 'hollow');
      return true;
    }
    if (a === 'sleep') {
      this.sleep();
      return true;
    }
    return false;
  }

  emptyChute(i: number): number {
    const s = this.s;
    const pad = s.pads[i];
    let moved = 0;
    KINDS.forEach((k, j) => {
      while (pad.chute[j] > 0 && this.stow(KIND_TUFT[k])) {
        pad.chute[j]--;
        moved++;
      }
    });
    if (moved) {
      const c = padSpots(i).chute;
      this.emit({ t: 'suck', thing: 'tuft-clover', x: c.x, y: this.phys.floor(c.x, c.z) + 0.6, z: c.z });
    } else if (pad.chute.some((n) => n > 0)) this.refuseFull();
    return moved;
  }

  private refuseFull(): void {
    const s = this.s;
    this.emit({ t: 'full', thing: s.slots[s.sel].t ?? 'tuft-clover' });
  }

  // ------------------------------------------------------------ debug helpers

  spawn(kind: DownyKind, x: number, z: number, tame = true): Downy {
    const d = newDowny(this.s, kind, x, 0, z);
    d.y = this.phys.floor(x, z) + 0.3;
    d.tame = tame;
    d.homeX = x;
    d.homeZ = z;
    d.pen = this.phys.penAt(x, z);
    this.s.downies.push(d);
    return d;
  }

  drop(type: ItemType, x: number, z: number): Item {
    const it = newItem(this.s, type, x, 0, z);
    it.y = this.phys.floor(x, z) + 0.4;
    this.s.items.push(it);
    return it;
  }
}

export function angleTo(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export { EYE };
