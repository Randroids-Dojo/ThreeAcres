// Thistledown: a scripted player on the real, render-free sim and tutor, for
// measures that need someone to play for a while (round 9: the first fifteen
// minutes of a fresh game, and how long the rare one's hunt takes). It walks
// with the stick at the stick's speeds (running once taught, on long legs), by
// the lanes and the gates, turns the view at a thumb's pace, does what the
// journal's line says the moment it is up, aims blows with the crosshair's own
// marks (the sell, pen and feeder marks), reads the tug like the round 8 good
// thumb (200 to 350 ms, plus the loop's 75), and takes a second for each tap
// on a tag. It runs the sim at 60 frames a second, real time.
//
// What it records: every frame, whether it is walking, acting (turning to aim,
// pulling, blowing, at a tag), or waiting with nothing it can do; and when
// something new happens (a lesson line, or its next step, a page of something
// done, a catch, a sale, a build, a meal it gave, an order taken or filled, a
// sleep). From those, scripts/ranch-first15.ts adds up the dead walking (a walk
// that has gone on more than 4 s since anything new), the idle waits and the
// lesson gaps.
//   (a module: used by ranch-first15.ts and ranch-hunt.ts)
import { isDowny, isFood, isTuft, wantedFood, type DownyKind, type Food } from '../src/games/ranch/defs';
import * as lessonsMod from '../src/games/ranch/lessons';
import { Tutor, type Say } from '../src/games/ranch/lessons';
import { Sim, padSpots, type Aim, type Controls, type Ev, type Interactable } from '../src/games/ranch/sim';
import type { Downy, Item, RanchState } from '../src/games/ranch/state';
import { BOARD, CRATES, DOOR, GATES, MAXX, MAXZ, MINX, MINZ, PADS, PEN_R, WORKBENCH, zoneAt } from '../src/games/ranch/world';

const L = lessonsMod as unknown as Record<string, unknown>;
const TOUCH: Say = { dev: 'touch', locked: false, lockAvailable: false };
const EYE = 1.6;
/** The game runs at 60 frames a second, and so does this (the crosshair marks fly things ahead at 60). */
const DT = 1 / 60;
/** The good thumb's reaction to the tug (round 8's), with the loop's 75 ms. */
const REACT: [number, number] = [0.2 + 0.075, 0.35 + 0.075];
/** How fast a thumb turns the view (rad/s), and the time a tap on a tag takes (s). */
const TURN = 4.5;
const TAP = 1.0;
/** Seconds a new line on the journal takes to read before it is acted on. */
const READ = 1.0;

type Pt = { x: number; z: number };
export type Doing = 'walk' | 'act' | 'idle' | 'menu' | 'wait';

interface PagesLike {
  add(p: { title: string; lines: unknown[] }): void;
  update(dt: number, v: { line: string; done: boolean }, age: number, cut: boolean, paused?: boolean): unknown;
  showing: unknown;
}

export class Bot {
  readonly sim: Sim;
  readonly s: RanchState;
  readonly tutor = new Tutor();
  readonly pages: PagesLike | null;
  t = 0;
  view = { line: '', done: false, id: '' };
  /** What it did this frame, and the moments something new happened. */
  doing: Doing = 'idle';
  readonly news: { t: number; what: string }[] = [];
  readonly frames: { t: number; doing: Doing; lesson: string; line: string; zone: string; page: boolean }[] = [];
  /** This frame's intents. */
  private move: Pt | null = null;
  private moveStop = 1.5;
  private runOk = false;
  private look: { x: number; y: number; z: number } | null = null;
  private draw = false;
  private puff = false;
  private jump = false;
  private menuT = 0;
  private menuAct: (() => void) | null = null;
  private stuckT = 0;
  private sideT = 0;
  private side = 1;
  private route: Pt[] = [];
  private routeTo: Pt | null = null;
  // The tug, read like a good thumb.
  private releaseAt = -1;
  private pressAt = -1;
  private letGo = false;
  private wasTell = false;
  private wasBack = false;
  private puffCool = 0;
  private lastLine = '';
  private lastPage = false;
  rand: () => number;

  constructor(sim: Sim, rand: () => number) {
    this.sim = sim;
    this.s = sim.s;
    this.rand = rand;
    const P = L.Pages as (new () => PagesLike) | undefined;
    this.pages = P ? new P() : null;
  }

  // ---------------------------------------------------------------- looking and aiming

  aim(): Aim {
    const p = this.s.player;
    const cp = Math.cos(p.pitch);
    const dx = -Math.sin(p.yaw) * cp;
    const dy = Math.sin(p.pitch);
    const dz = -Math.cos(p.yaw) * cp;
    const ex = p.x;
    const ey = p.y + EYE;
    const ez = p.z;
    // (The muzzle sits low and right of the eye, as the viewmodel's does.)
    return { ex, ey, ez, dx, dy, dz, mx: ex + dx * 0.6 + Math.cos(p.yaw) * 0.15, my: ey - 0.2, mz: ez + dz * 0.6 - Math.sin(p.yaw) * 0.15 };
  }

  /** The yaw and pitch that put the crosshair on a point. */
  private dirTo(x: number, y: number, z: number): { yaw: number; pitch: number } {
    const p = this.s.player;
    const dx = x - p.x;
    const dy = y - (p.y + EYE);
    const dz = z - p.z;
    return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
  }

  /** Turn towards a yaw and pitch at a thumb's pace; true once there. Counts as looking about, for the look lesson. */
  private turnTo(yaw: number, pitch: number): boolean {
    const p = this.s.player;
    let dy = yaw - p.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const step = TURN * DT;
    const ay = Math.max(-step, Math.min(step, dy));
    const ap = Math.max(-step, Math.min(step, pitch - p.pitch));
    p.yaw += ay;
    p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch + ap));
    if (Math.abs(ay) + Math.abs(ap) > 1e-4) this.tutor.add(this.s, 'look', Math.abs(ay) + Math.abs(ap));
    return Math.abs(dy) < 0.04 && Math.abs(pitch - p.pitch) < 0.04;
  }

  // ---------------------------------------------------------------- walking, by the lanes and the gates

  private distTo(x: number, z: number): number {
    return Math.hypot(this.s.player.x - x, this.s.player.z - z);
  }

  /** Waypoints from here to there: out of the ranch by its gate, into the ridge or the hollow by theirs, round the pads by the lane. */
  private plan(to: Pt): Pt[] {
    const p = this.s.player;
    const from = { x: p.x, z: p.z };
    const zf = zoneAt(from.x, from.z);
    const zt = zoneAt(to.x, to.z);
    const out: Pt[] = [];
    const inRanch = (a: Pt, b: Pt) => {
      // Round the pens and gardens by the shortest way over a few spots a person would use (the lane, the gaps
      // between the plots, the gate's mouth): the straight way, if it crosses none.
      const clear = (u: Pt, v: Pt) => !PADS.some((pd, i) => this.s.pads[i].kind !== 'empty' && segNear(pd.x, pd.z, u.x, u.z, v.x, v.z) < PEN_R + 0.7 && Math.hypot(v.x - pd.x, v.z - pd.z) > PEN_R + 0.5 && Math.hypot(u.x - pd.x, u.z - pd.z) > PEN_R + 0.5);
      if (clear(a, b)) return [b];
      const nodes: Pt[] = [a, b, ...RANCH_NODES];
      const n = nodes.length;
      const dist = nodes.map(() => Infinity);
      const prev = nodes.map(() => -1);
      const done = nodes.map(() => false);
      dist[0] = 0;
      for (let k = 0; k < n; k++) {
        let u = -1;
        for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
        if (u < 0 || dist[u] === Infinity) break;
        done[u] = true;
        if (u === 1) break;
        for (let v = 0; v < n; v++) {
          if (done[v] || !clear(nodes[u], nodes[v])) continue;
          const d = dist[u] + Math.hypot(nodes[u].x - nodes[v].x, nodes[u].z - nodes[v].z);
          if (d < dist[v]) {
            dist[v] = d;
            prev[v] = u;
          }
        }
      }
      if (prev[1] < 0) {
        const lx = (x: number) => Math.max(-9, Math.min(34, x));
        return [{ x: lx(a.x), z: 35 }, { x: lx(b.x), z: 35 }, b];
      }
      const path: Pt[] = [];
      for (let v = 1; v > 0; v = prev[v]) path.unshift(nodes[v]);
      return path;
    };
    const ridgeIn: Pt[] = [{ x: -28, z: -9.5 }, { x: GATES.ridge.x + 2, z: GATES.ridge.z }, { x: GATES.ridge.x - 3, z: GATES.ridge.z - 0.5 }];
    const hollowIn: Pt[] = [{ x: 28, z: -21 }, { x: GATES.hollow.x - 2, z: GATES.hollow.z }, { x: GATES.hollow.x + 3, z: GATES.hollow.z }];
    let at = from;
    if (zf === 'ranch' && zt !== 'ranch') {
      // To the gate's mouth (round the pads if need be), then out.
      out.push(...inRanch(at, { x: 0, z: 23 }));
      out.push({ x: 0, z: 14 });
      at = { x: 0, z: 14 };
    }
    if (zf === 'ridge' && zt !== 'ridge') {
      out.push(...[...ridgeIn].reverse());
      at = ridgeIn[0];
    }
    if (zf === 'hollow' && zt !== 'hollow') {
      out.push(...[...hollowIn].reverse());
      at = hollowIn[0];
    }
    if (zt === 'ranch' && zf !== 'ranch') {
      if (Math.hypot(at.x, at.z - 14) > 3) out.push({ x: 0, z: 14 });
      out.push({ x: 0, z: 23 });
      out.push(...inRanch({ x: 0, z: 23 }, to));
      return out;
    }
    if (zt === 'ridge' && zf !== 'ridge') out.push(...ridgeIn);
    if (zt === 'hollow' && zf !== 'hollow') out.push(...hollowIn);
    if (zt === 'ranch' && zf === 'ranch') return inRanch(at, to);
    out.push(to);
    return out;
  }

  /** Walk (or run) towards a spot; true once within `stop` m of it. */
  goTo(x: number, z: number, stop = 1.5, run = true): boolean {
    if (this.distTo(x, z) < stop) return true;
    if (!this.routeTo || Math.hypot(this.routeTo.x - x, this.routeTo.z - z) > 3 || (zoneAt(this.routeTo.x, this.routeTo.z) !== zoneAt(x, z))) {
      this.routeTo = { x, z };
      this.route = this.plan({ x, z });
    }
    while (this.route.length > 1 && this.distTo(this.route[0].x, this.route[0].z) < 1.4) this.route.shift();
    // (The last leg follows a target that moves.)
    if (this.route.length) this.route[this.route.length - 1] = { x, z };
    const w = this.route[0] ?? { x, z };
    this.move = w;
    this.moveStop = this.route.length > 1 ? 0 : stop;
    this.runOk = run;
    return false;
  }

  /** Stand still (and forget the route). */
  stop(): void {
    this.move = null;
  }

  // ---------------------------------------------------------------- the frame

  /** One frame: the intents set by the caller this frame become controls, the sim and the tutor step, and it is all recorded. */
  frame(): void {
    const s = this.s;
    const p = s.player;
    const c: Controls = { moveX: 0, moveZ: 0, sprint: false, jump: false, jumpPressed: false, draw: false, puff: false, puffPressed: false };
    let doing: Doing = 'idle';
    if (this.menuT > 0) {
      // At a tag: reading it and tapping (the tags come down, it taps one).
      this.menuT -= DT;
      doing = 'menu';
      if (this.menuT <= 0 && this.menuAct) {
        const f = this.menuAct;
        this.menuAct = null;
        f();
      }
    } else if (this.move) {
      const w = this.move;
      const d = this.distTo(w.x, w.z);
      if (d > this.moveStop) {
        const want = this.dirTo(w.x, p.y + EYE, w.z);
        // Walk where it looks, as a thumb on the stick does (turning while it goes).
        let dy = want.yaw - p.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        if (!this.look) this.turnTo(want.yaw, Math.max(-0.2, Math.min(0.1, p.pitch)));
        // The stick pushes the way to go, whatever the view.
        const ang = p.yaw - want.yaw;
        c.moveX = Math.sin(ang);
        c.moveZ = Math.cos(ang);
        // (It runs once running is taught, on a long way still to go, and while the running lesson asks it to.)
        const knowsRun = s.learn.includes('lesson:run') || !this.sim.teaching;
        let left = d;
        for (let i = 1; i < this.route.length; i++) left += Math.hypot(this.route[i].x - this.route[i - 1].x, this.route[i].z - this.route[i - 1].z);
        c.sprint = this.runOk && ((knowsRun && left > 12) || this.tutor.current === 'run');
        doing = 'walk';
        // Stuck against something: step aside, and hop.
        if (Math.hypot(p.vx, p.vz) < 0.7 && p.grounded) this.stuckT += DT;
        else this.stuckT = 0;
        if (this.stuckT > 0.45 && this.sideT <= 0) {
          this.sideT = 0.9;
          this.side = this.rand() < 0.5 ? 1 : -1;
          c.jump = c.jumpPressed = s.learn.includes('jump') || !this.sim.teaching;
          this.route = [];
          this.routeTo = null;
        }
        if (this.sideT > 0) {
          this.sideT -= DT;
          c.moveX = this.side;
          c.moveZ = 0.3;
        }
      }
    }
    if (this.look) {
      const want = this.dirTo(this.look.x, this.look.y, this.look.z);
      this.turnTo(want.yaw, want.pitch);
      if (doing === 'idle') doing = 'act';
    }
    c.draw = this.draw;
    c.puff = this.puff;
    c.puffPressed = this.puff;
    if (this.jump) c.jump = c.jumpPressed = true;
    if (this.draw || this.puff) doing = doing === 'walk' ? 'walk' : 'act';
    if ((c.moveX || c.moveZ) && this.menuT <= 0) this.tutor.add(s, 'walk', DT);
    const aim = this.aim();
    this.sim.update(DT, c, aim);
    if (c.sprint && p.grounded && Math.hypot(p.vx, p.vz) > 5.5) this.tutor.add(s, 'run', DT);
    for (const e of this.sim.events) {
      this.tutor.onEvent(s, e);
      this.onEvent(e);
    }
    this.sim.events.length = 0;
    (this.tutor as unknown as { pageWaiting?: boolean }).pageWaiting = ((this.pages as unknown as { waiting?: number })?.waiting ?? 0) > 0;
    const v = this.tutor.update(s, DT, TOUCH, (x, z) => this.sim.phys.floor(x, z));
    this.view = { line: v.line, done: v.done, id: v.id };
    if (this.pages) {
      if (this.pages.update(DT, v, (this.tutor as unknown as { lineAge?: number }).lineAge ?? 9, !!(this.tutor as unknown as { cutting?: boolean }).cutting)) this.tutor.hold = 3.4;
    }
    // A line on the journal that is new (a lesson, or its next step), or a page going up: something new.
    const page = !!this.pages?.showing;
    if (v.line && !v.done && v.line !== this.lastLine) this.mark(`line ${v.line}`);
    if (page && !this.lastPage) this.mark('page');
    this.lastLine = v.done ? this.lastLine : v.line;
    this.lastPage = page;
    this.frames.push({ t: this.t, doing: this.puffCool > 0 && doing === 'idle' ? 'act' : doing, lesson: this.tutor.current, line: v.line, zone: zoneAt(p.x, p.z), page });
    this.doing = doing;
    this.t += DT;
    this.puffCool -= DT;
    // Intents last one frame.
    this.move = null;
    this.look = null;
    this.draw = false;
    this.puff = false;
    this.jump = false;
  }

  /** Something new happened, for the record. */
  mark(what: string): void {
    this.news.push({ t: this.t, what });
  }

  private onEvent(e: Ev): void {
    switch (e.t) {
      case 'suck':
        if (isDowny(e.thing)) this.mark('catch');
        break;
      case 'sell':
        if (e.blown) this.mark('sale');
        break;
      case 'build':
        this.mark(`build ${e.what}`);
        break;
      case 'eat':
        if (e.tame) this.mark('meal');
        break;
      case 'order':
        if (e.state === 'taken' || e.state === 'filled' || e.state === 'posted') this.mark(`order ${e.state}`);
        if (e.state === 'filled') this.pages?.add({ title: 'Earned', lines: [] });
        break;
      case 'goal':
        this.mark('goal');
        this.pages?.add({ title: 'Earned', lines: [] });
        break;
      case 'sleep':
        this.mark('sleep');
        break;
      case 'deliver':
        this.mark('deliver');
        break;
      case 'nettlehit':
        this.mark('shoo');
        break;
      case 'plant':
        this.mark('plant');
        break;
    }
  }

  // ---------------------------------------------------------------- doing things

  /** At a post, the board, the door or a gate: once within reach, the tags come down and a tap takes this option. */
  useAt(kind: Interactable['kind'], x: number, z: number, opt: (it: Interactable) => string | null, reach = 2.4): boolean {
    if (this.menuT > 0) return false;
    if (!this.goTo(x, z, reach)) return false;
    const fl = this.sim.phys.floor(x, z);
    this.look = { x, y: fl + 1.4, z };
    const it = this.sim.interactable(this.aim());
    if (!it || it.kind !== kind) return false;
    const id = opt(it);
    if (!id) return false;
    this.menuT = TAP;
    this.menuAct = () => {
      this.sim.choose(it, id);
    };
    return true;
  }

  /** Choose a window holding this (a tap on it). */
  choose(test: (t: NonNullable<RanchState['slots'][0]['t']>) => boolean): boolean {
    const s = this.s;
    const i = s.slots.findIndex((q) => q.t !== null && q.n > 0 && test(q.t));
    if (i < 0) return false;
    if (i !== s.sel) {
      s.sel = i;
      this.tutor.add(s, 'slot');
    }
    return true;
  }

  /** Pull at a downy: walk within range, keep the crosshair on it, and read its tug (let go as it puffs up, pull again after). */
  pullDowny(d: Downy, near = 4.5): void {
    const dist = this.distTo(d.x, d.z);
    if (dist > near + 1) {
      this.goTo(d.x, d.z, near);
      this.letGo = false;
    } else if (dist > near) this.goTo(d.x, d.z, near);
    this.look = { x: d.x, y: d.y + 0.25, z: d.z };
    const tell = d.tell > 0;
    const back = d.back > 0;
    const r = () => REACT[0] + this.rand() * (REACT[1] - REACT[0]);
    if (tell && !this.wasTell) {
      this.releaseAt = this.t + r();
      this.pressAt = -1;
    }
    if (back && !this.wasBack && !this.wasTell && this.releaseAt < 0 && !this.letGo) this.releaseAt = this.t + r();
    if (!back && this.wasBack) {
      this.releaseAt = -1;
      if (this.letGo) this.pressAt = this.t + r();
    }
    if (this.releaseAt >= 0 && this.t >= this.releaseAt) {
      this.letGo = true;
      this.releaseAt = -1;
    }
    if (this.pressAt >= 0 && this.t >= this.pressAt) {
      this.letGo = false;
      this.pressAt = -1;
    }
    this.wasTell = tell;
    this.wasBack = back;
    const on = this.dirTo(d.x, d.y + 0.25, d.z);
    const p = this.s.player;
    let dy = on.yaw - p.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.draw = dist < 7 && !this.letGo && Math.abs(dy) < 0.35;
  }

  /** Pull things lying near a spot (food on a bed, fluff by a fence) until `enough` says so. */
  /** Seconds spent going for each thing: one it cannot get at in 12 s is given up (a tuft over a wall, say). */
  private tried = new Map<number, number>();
  canTry(it: { id: number }): boolean {
    return (this.tried.get(it.id) ?? 0) < 12;
  }

  pullItem(it: Item): void {
    this.tried.set(it.id, (this.tried.get(it.id) ?? 0) + DT);
    // (Pull reaches 7 m: from within 5 it draws what it is aimed at, over a pen's fence too; for something in a pen,
    // from just outside the fence nearest it, which for fluff is by the post.)
    const pen = this.sim.phys.penAt(it.x, it.z);
    let stand: Pt = { x: it.x, z: it.z };
    if (pen >= 0) {
      const P = PADS[pen];
      const dx = it.x - P.x;
      const dz = it.z - P.z;
      const l = Math.hypot(dx, dz) || 1;
      stand = { x: P.x + (dx / l) * (PEN_R + 1.1), z: P.z + (dz / l) * (PEN_R + 1.1) };
    }
    const d = this.distTo(it.x, it.z);
    this.look = { x: it.x, y: it.y, z: it.z };
    if (pen >= 0 ? this.distTo(stand.x, stand.z) > 1.2 && d > 3.5 : d > 5) {
      this.goTo(stand.x, stand.z, pen >= 0 ? 1 : 5);
      if (d > 6.5) return;
    }
    this.draw = d < 6.8;
  }

  /** Blow at a spot with the crosshair's own mark: walk within `near` m, then try pitches until the mark says it lands (sell, pen, feeder). */
  blowWith(x: number, y: number, z: number, near: number, marks: (a: Aim) => boolean): boolean {
    if (!this.goTo(x, z, near)) return false;
    const p = this.s.player;
    const want = this.dirTo(x, y, z);
    const yawOk = this.turnTo(want.yaw, p.pitch);
    if (!yawOk) {
      this.look = null;
      return false;
    }
    // Search the pitch for the mark (the player's thumb nudging the view up and down until the crosshair shows it).
    let best = -9;
    for (let k = -12; k <= 22; k++) {
      const pitch = want.pitch + k * 0.025;
      const save = p.pitch;
      p.pitch = pitch;
      const ok = marks(this.aim());
      p.pitch = save;
      if (ok) {
        best = pitch;
        break;
      }
    }
    if (best < -8) {
      // No mark from here: closer.
      this.goTo(x, z, Math.max(1.8, near - 1.5));
      return false;
    }
    if (!this.turnTo(want.yaw, best)) return false;
    // (Standing still: a blow carries half your speed, which the crosshair's mark leaves out.)
    if (Math.hypot(p.vx, p.vz) > 0.4) return false;
    if (this.puffCool <= 0) {
      this.puff = true;
      this.puffCool = 0.28;
    }
    return true;
  }

  /** Blow something near a spot on the ground (food near a downy, onto a bed): aimed at its foot from a few metres. */
  blowNear(x: number, z: number, near = 3.2, lift = 0): boolean {
    if (!this.goTo(x, z, near)) return false;
    const fl = this.sim.phys.floor(x, z);
    const want = this.dirTo(x, fl + lift, z);
    if (!this.turnTo(want.yaw, want.pitch - 0.12)) return false;
    if (this.puffCool <= 0) {
      this.puff = true;
      this.puffCool = 0.5;
    }
    return true;
  }

  pressPuff(): void {
    if (this.puffCool <= 0) {
      this.puff = true;
      this.puffCool = 0.35;
    }
  }

  pressJump(): void {
    this.jump = true;
  }

  spin(): void {
    const p = this.s.player;
    this.turnTo(p.yaw + 1, p.pitch);
  }

  lookAt(x: number, y: number, z: number): void {
    this.look = { x, y, z };
  }

  busy(): boolean {
    return this.menuT > 0;
  }

  /** Reading a line that just came up (READ s). */
  reading(): boolean {
    const last = this.news.length ? this.news[this.news.length - 1] : null;
    return !!last && last.what.startsWith('line ') && this.t - last.t < READ;
  }
}

/** Spots in the ranch a person walks by: along the lane, in the gaps between the plots on each row, and the gate's mouth. */
const RANCH_NODES: Pt[] = [
  ...[-9, 0, 11.5, 22.5, 34].map((x) => ({ x, z: 35 })),
  ...[0, 11.5, 22.5, 33].flatMap((x) => [
    { x, z: 31 },
    { x, z: 21 },
  ]),
  ...[11.5, 22.5, 33].flatMap((x) => [
    { x, z: 39 },
    { x, z: 47 },
  ]),
  { x: 0, z: 23 },
  { x: -6, z: 34 },
];

/** How near a point comes to a segment. */
export function segNear(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

// ---------------------------------------------------------------- what the journal says, and doing it

const has = (s: RanchState, f: (t: NonNullable<RanchState['slots'][0]['t']>) => boolean) => s.slots.some((q) => q.t !== null && q.n > 0 && f(q.t));
const mine = (d: Downy) => !d.gone && (d.tame || d.keep);
const near = (s: RanchState, x: number, z: number) => Math.hypot(s.player.x - x, s.player.z - z);

function nearest<T extends { x: number; z: number }>(s: RanchState, list: T[]): T | null {
  let best: T | null = null;
  let bd = 1e9;
  for (const q of list) {
    const d = near(s, q.x, q.z);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}

/** The garden to pull a food from: one with it lying on the bed, else one growing it. */
function gardenWith(s: RanchState, f: Food): number {
  const lying = s.pads.findIndex((p, i) => p.kind === 'garden' && s.items.some((it) => !it.gone && it.type === f && it.src === 1000 + i));
  if (lying >= 0) return lying;
  return s.pads.findIndex((p) => p.kind === 'garden' && p.crop === f);
}

/** Pull a food from a garden (its bed ripens for the lessons); true while doing it. */
function fetchFood(b: Bot, f: Food, want = 3): boolean {
  const s = b.s;
  const aboard = s.slots.reduce((a, q) => a + (q.t === f ? q.n : 0), 0);
  if (aboard >= want) return false;
  const g = gardenWith(s, f);
  const P = g >= 0 ? PADS[g] : PADS[0];
  // (On the bed, or rolled off it nearby.)
  const lying = s.items.filter((it) => !it.gone && it.type === f && Math.hypot(it.x - P.x, it.z - P.z) < 8 && zoneAt(it.x, it.z) === 'ranch' && b.canTry(it));
  const it = nearest(s, lying);
  if (it) {
    b.pullItem(it);
    return true;
  }
  if (aboard > 0) return false;
  // The bed is bare: wait by it for the next crop.
  b.goTo(P.x, P.z + (P.z < 35 ? PEN_R + 0.5 : -PEN_R - 0.5), 1.5);
  return true;
}

/** Fluff lying on the ranch (yours to pull), nearest first. */
function ranchFluff(s: RanchState, b?: Bot): Item[] {
  // (Not what it blew at a crate, nor what lies by one: the crate draws that in itself.)
  return s.items.filter((it) => !it.gone && isTuft(it.type) && zoneAt(it.x, it.z) === 'ranch' && it.flyT < 0 && !(it.blown && it.idle < 1.5) && !CRATES.some((c) => Math.hypot(c.x - it.x, c.z - it.z) < 2.5) && (!b || b.canTry(it)));
}

/** The nearer sell crate. */
const crate = (s: RanchState) => nearest(s, CRATES)!;

/** Blow fluff into the nearer crate. */
function sellFluff(b: Bot): boolean {
  const s = b.s;
  if (!has(s, isTuft)) return false;
  b.choose(isTuft);
  const c = crate(s);
  b.blowWith(c.x, b.sim.phys.floor(c.x, c.z) + 0.6, c.z, 5, (a) => b.sim.wouldSell(a));
  return true;
}

/** A pen with room (nearest). */
function penRoom(s: RanchState): number {
  let best = -1;
  let bd = 1e9;
  s.pads.forEach((p, i) => {
    if (p.kind !== 'pen') return;
    const n = s.downies.filter((d) => !d.gone && d.pen === i).length;
    if (n >= 10) return;
    const d = near(s, PADS[i].x, PADS[i].z);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Blow the downy aboard into a pen with room, from the lane side. */
function penDowny(b: Bot): boolean {
  const s = b.s;
  if (!has(s, isDowny)) return false;
  b.choose(isDowny);
  const i = penRoom(s);
  if (i < 0) return false;
  const P = PADS[i];
  const post = padSpots(i).post;
  if (near(s, post.x, post.z) > 5) {
    b.goTo(post.x + 2, post.z, 3);
    return true;
  }
  b.blowWith(P.x, b.sim.phys.floor(P.x, P.z) + 0.5, P.z, 7, (a) => b.sim.wouldPen(a) >= 0);
  return true;
}

/** Feed a hungry downy of yours its favourite: food aboard (else fetch it), then blow some at its feet. */
function feedDowny(b: Bot, d: Downy): boolean {
  const s = b.s;
  const f = wantedFood(d.kind);
  if (!has(s, (t) => t === f)) return fetchFood(b, f, 3);
  b.choose((t) => t === f);
  // In a pen: from outside the fence, at the floor near it; loose: at its feet.
  if (d.pen >= 0) {
    const post = padSpots(d.pen).post;
    if (near(s, post.x + 2, post.z) > 4.5) b.goTo(post.x + 2, post.z, 2.5);
    else b.blowNear(PADS[d.pen].x * 0.6 + post.x * 0.4, PADS[d.pen].z * 0.6 + post.z * 0.4, 7);
  } else b.blowNear(d.x, d.z, 3.4);
  return true;
}

/** Tend the ranch: fluff to the crate, hungry downies fed. True if there was something to do. */
export function tend(b: Bot): boolean {
  const s = b.s;
  if (has(s, isTuft) && (ranchFluff(s, b).length === 0 || s.slots.some((q) => q.t && isTuft(q.t) && q.n >= 6))) return sellFluff(b);
  const fl = nearest(s, ranchFluff(s, b));
  if (fl && near(s, fl.x, fl.z) < 40) {
    b.pullItem(fl);
    return true;
  }
  if (has(s, isTuft)) return sellFluff(b);
  const hungry = s.downies.filter((d) => mine(d) && d.hunger > 0.5 && d.drawn === 0);
  const h = nearest(s, hungry);
  if (h) return feedDowny(b, h);
  return false;
}

/** Catch a wild downy of a kind (any kind if none given) near the mark or nearest. */
export function catchWild(b: Bot, kind?: DownyKind): boolean {
  const s = b.s;
  const wild = s.downies.filter((d) => !d.gone && !d.tame && !d.keep && !d.rare && (!kind || d.kind === kind) && d.noPull <= 0 && zoneAt(d.x, d.z) !== 'ranch' && (zoneAt(d.x, d.z) === 'meadow' || (zoneAt(d.x, d.z) === 'ridge' ? s.gates.ridge : s.gates.hollow)));
  const fighting = wild.find((d) => d.strain > 0 || d.back > 0 || d.tell > 0 || d.easeT > 0);
  const target = fighting ?? nearest(s, wild);
  if (!target) return false;
  b.pullDowny(target, 4.8);
  return true;
}

/**
 * The eager player: does what the journal's line says, the moment it is up. Returns what it is about, for the record.
 */
export function eager(b: Bot): void {
  const s = b.s;
  const v = b.view;
  const id = b.tutor.current;
  const line = v.done ? '' : v.line;
  if (b.busy()) return;
  // A new line is read first (about a second), as a person would.
  if (b.reading()) return;
  const sim = b.sim;
  const m = b.tutor.mark;
  const loose = s.downies.filter((d) => mine(d) && d.pen < 0 && d.flyT < 0);
  const porch = s.downies.find((d) => !d.gone && d.keep) ?? loose[0];
  switch (id) {
    case 'look':
      b.spin();
      return;
    case 'walk':
      if (porch) b.goTo(porch.x, porch.z, 2.4);
      return;
    case 'draw':
      if (porch) b.pullDowny(porch, 3.5);
      return;
    case 'puff':
      b.lookAt(s.player.x - Math.sin(s.player.yaw) * 4, s.player.y + 1.2, s.player.z - Math.cos(s.player.yaw) * 4);
      b.pressPuff();
      return;
    case 'slots': {
      const i = s.slots.findIndex((q, k) => k !== s.sel && q.t && q.n > 0);
      if (i >= 0) b.choose((t) => t === s.slots[i].t);
      return;
    }
    case 'jump':
      b.pressJump();
      if (m.on) b.goTo(m.x, m.z, 2);
      return;
    case 'ease':
    case 'run':
    case 'meadow': {
      if (id === 'run') {
        const d = nearest(
          s,
          s.downies.filter((q) => !q.gone && !q.tame && !q.keep),
        );
        if (d) b.goTo(d.x, d.z, 2, true);
        return;
      }
      catchWild(b, 'clover');
      return;
    }
    case 'feed':
    case 'sell': {
      if (has(s, isDowny) && !loose.length) {
        b.pressPuff();
        return;
      }
      if (/window/.test(line) || /choose/.test(line)) {
        b.choose(/fluff/.test(line) ? isTuft : (t) => t === 'cloverhead');
        return;
      }
      if (/sell crate/.test(line)) {
        sellFluff(b);
        return;
      }
      if (/fluff/.test(line)) {
        const fl = nearest(s, ranchFluff(s, b));
        if (fl) b.pullItem(fl);
        else if (porch) b.goTo(porch.x, porch.z, 3);
        return;
      }
      if (/garden/.test(line)) {
        fetchFood(b, 'cloverhead', 3);
        return;
      }
      if (porch) feedDowny(b, porch);
      return;
    }
    case 'pen':
    case 'garden': {
      const tag = id === 'pen' ? 'build:pen' : 'build:garden';
      if (m.on) {
        const i = PADS.findIndex((_p, k) => Math.hypot(padSpots(k).post.x + 0.9 - m.x, padSpots(k).post.z - m.z) < 0.3);
        const post = padSpots(Math.max(0, i)).post;
        b.useAt('pad', post.x + 0.9, post.z, () => tag);
      }
      return;
    }
    case 'penin':
    case 'stray': {
      if (has(s, isDowny)) {
        penDowny(b);
        return;
      }
      const d = id === 'stray' ? s.downies.find((q) => !q.gone && q.strayFrom >= 0 && q.pen < 0) : loose[0];
      if (d) b.pullDowny(d, 4);
      return;
    }
    case 'farm': {
      if (/sell crate/.test(line)) sellFluff(b);
      else if (/window/.test(line)) b.choose(isTuft);
      else if (/into a pen/.test(line)) penDowny(b);
      else if (/Tap Post/.test(line)) {
        const i = s.pads.findIndex((p) => p.kind === 'empty');
        const post = padSpots(i).post;
        b.useAt('pad', post.x + 0.9, post.z, () => 'build:pen');
      } else if (/Pull up the fluff/.test(line)) {
        const fl = nearest(s, ranchFluff(s, b));
        if (fl) b.pullItem(fl);
        else if (m.on) b.goTo(m.x, m.z, 3);
      } else if (/Feed the hungry/.test(line) || /food for/.test(line)) {
        const d = nearest(
          s,
          s.downies.filter((q) => mine(q) && q.hunger > 0.5),
        );
        if (d) feedDowny(b, d);
      } else if (/Catch another/.test(line)) catchWild(b, 'clover');
      return;
    }
    case 'order': {
      b.useAt('board', BOARD.x, BOARD.z + 1.5, () => {
        const offers = sim.offers();
        // The fluff order first (a day at home), else the first.
        const k = offers.findIndex((o) => !o.live);
        return `order:${Math.max(0, k)}`;
      }, 2.6);
      return;
    }
    case 'ups': {
      const i = s.pads.findIndex((p) => p.kind === 'pen' && !p.ups.includes('feeder'));
      if (i >= 0) {
        const post = padSpots(i).post;
        b.useAt('pad', post.x + 0.9, post.z, () => 'pen:feeder');
      }
      return;
    }
    case 'feeder': {
      const i = s.pads.findIndex((p) => p.kind === 'pen' && p.ups.includes('feeder'));
      const f: Food = 'cloverhead';
      if (/garden/.test(line)) {
        fetchFood(b, f, 4);
        return;
      }
      b.choose((t) => t === f);
      const h = padSpots(Math.max(0, i)).hopper;
      b.blowWith(h.x, sim.phys.floor(h.x, h.z) + h.y, h.z, 4.5, (a) => sim.wouldFeed(a) >= 0);
      return;
    }
    case 'plant': {
      const i = s.pads.findIndex((p) => p.kind === 'garden' && !p.crop);
      if (i < 0) return;
      if (!has(s, isFood)) {
        fetchFood(b, 'cloverhead', 2);
        return;
      }
      b.choose(isFood);
      b.blowNear(PADS[i].x, PADS[i].z + (PADS[i].z < 35 ? 1 : -1), 4.2);
      return;
    }
    case 'dusk':
      b.useAt('door', DOOR.x, DOOR.z - 1.6, () => 'sleep', 2.4);
      return;
    case 'night': {
      const n = nearest(
        s,
        s.nettles.filter((q) => !q.gone),
      );
      if (n) {
        if (b.goTo(n.x, n.z, 3.6)) {
          b.lookAt(n.x, n.y + 0.25, n.z);
          b.pressPuff();
        }
      }
      return;
    }
    case 'gates': {
      // From the meadow side of the ridge gate.
      b.useAt('gate', GATES.ridge.x + 2.2, GATES.ridge.z, () => 'gate:ridge', 1.2);
      return;
    }
    case 'bench':
      b.useAt('bench', WORKBENCH.x, WORKBENCH.z - 2.2, () => 'bench:cap', 1.2);
      return;
    case 'high': {
      const i = s.pads.findIndex((p) => p.kind === 'pen' && !p.ups.includes('high'));
      if (i >= 0) {
        const post = padSpots(i).post;
        b.useAt('pad', post.x + 0.9, post.z, () => 'pen:high');
      }
      return;
    }
    case 'crowd': {
      const i = s.pads.findIndex((p) => p.kind === 'pen');
      const post = padSpots(Math.max(0, i)).post;
      b.goTo(post.x + 1, post.z, 2);
      return;
    }
    default:
      break;
  }
  // No lesson up: the journal's orders and goal. An open fluff order or the next goal: tend the ranch and sell.
  const open = s.orders.find((o) => o.state === 'open' && o.got < o.n);
  const offers = sim.offers();
  if (offers.length && !open && s.hour < 12) {
    b.useAt('board', BOARD.x, BOARD.z + 1.5, () => `order:${Math.max(0, offers.findIndex((o) => !o.live))}`, 2.6);
    return;
  }
  if (open?.live && !open.rare) {
    const aboard = s.slots.some((q) => q.t === open.kind && (q.downs ?? []).some((r) => r.c === s.day));
    if (aboard && (open.from === undefined || s.hour >= open.from)) {
      b.choose((t) => t === open.kind);
      const c = crate(s);
      b.blowWith(c.x, sim.phys.floor(c.x, c.z) + 0.6, c.z, 5, (a) => sim.wouldSellDowny(a));
      return;
    }
    if (!aboard || s.slots.reduce((a, q) => a + (q.t === open.kind ? q.n : 0), 0) < open.n - open.got) {
      catchWild(b, open.kind);
      return;
    }
  }
  // Night with nothing to do: sleep.
  if (Sim.sleepTime(s.hour) && (s.hour >= 21 || s.hour < 5) && sim.knows('sleep')) {
    b.useAt('door', DOOR.x, DOOR.z - 1.6, () => 'sleep', 2.4);
    return;
  }
  if (tend(b)) return;
  const g = sim.openGoals(1)[0];
  // More downies for the pen (the herd goal, and the loop's way to more fluff): catch one and pen it.
  if (g && g.id === 'herd') {
    if (has(s, isDowny)) penDowny(b);
    else catchWild(b, 'clover');
    return;
  }
  // A goal with a place (a gate you can open now): go and open it.
  if (g && (g.id === 'ridge' || g.id === 'hollow') && !s.gates[g.id] && s.coins >= GATES[g.id].cost && sim.knows('gates')) {
    b.useAt('gate', GATES[g.id].x + (g.id === 'ridge' ? 0.6 : -0.6), GATES[g.id].z, () => `gate:${g.id}`, 2.6);
  }
}

/** A fresh game, as a new phone player starts it: the lessons on, the view where the game puts it. */
export function freshGame(seed: number, rng: (seed: number) => () => number): Bot {
  Math.random = rng(seed);
  const sim = new Sim(null);
  sim.teaching = true;
  return new Bot(sim, Math.random);
}

export { MINX, MAXX, MINZ, MAXZ };
