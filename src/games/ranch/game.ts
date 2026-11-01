// Thistledown's director: owns the renderer, the scene, the camera and the
// loop; feeds input to the sim; turns sim events into sound, particles and
// journal pages; runs the lessons (one control or system at a time, nothing
// on screen before its lesson); drives the hanging-tag menus and the pause
// page; and saves. Exposes window.ranch for scripted checks.

import {
  Color,
  InstancedMesh,
  Mesh,
  Object3D,
  MeshLambertMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type CanvasTexture,
} from 'three';
import type { GameContext } from '../../shell/types';
import { PRESETS } from '../../sim/presets';
import { CAPS, GOALS, KIND, KINDS, fmtCoins, isDowny, isFood, thingColor, thingName, type DownyKind, type GoalId, type Thing } from './defs';
import { Hud, type PageLine } from './hud';
import { Input, type Frame } from './input';
import { Tutor, creditLessons, teachAll, type Say } from './lessons';
import { angleDiff, clamp, damp } from './noise';
import { PORCH } from './physics';
import { Fx } from './scene/fx';
import { CreatureView } from './scene/creatures';
import { GroundTex, buildFluff, buildGrass } from './scene/grass';
import { Marker } from './scene/marker';
import { U, armNaNWatch } from './scene/mat';
import { PadView } from './scene/pads';
import { canvas, paintBoard, tex, type BoardRow } from './scene/paint';
import { buildProps, type Props } from './scene/props';
import { Sky } from './scene/sky';
import { TagMenu, type Rail } from './scene/tags';
import { buildHills, buildTerrain, buildWater } from './scene/terrain';
import { Viewmodel } from './scene/viewmodel';
import { Sim, padSpots, type Aim, type Controls, type Ev, type Interactable } from './sim';
import { capacity, deserialize, serialize, summary, type RanchState } from './state';
import { DOOR, GATES, PADS, PEN_R, POND, STREAM, VENTS, ZONE_NAMES, heightAt, polyDist, setGrassDisc, type GateId } from './world';
import './ranch.css';

const EYE = 1.6;
const FOV = 72;

const FIRST: Record<DownyKind, [string, string]> = {
  clover: ['First clover downy', 'Loves clover heads.'],
  ember: ['First ember downy', 'Loves sweetroot.'],
  brook: ['First brook downy', 'Loves dewberries.'],
  thistle: ['A thistle downy', 'Eats anything. Best fluff in the valley.'],
};

const CHIRP_PITCH: Record<DownyKind, number> = { clover: 1, ember: 0.88, brook: 1.12, thistle: 1.3 };

export interface DebugHooks {
  afterFrame: ((gl: WebGL2RenderingContext) => void) | null;
}

export class Ranch {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FOV, 1, 0.05, 700);
  sim: Sim;
  private sky: Sky;
  private ground: GroundTex;
  private grassCam: { set(x: number, y: number): void };
  private fluffCam: { value: Vector3 };
  private fluffPx: { value: number };
  private props: Props;
  private pads = new PadView();
  readonly creatures = new CreatureView();
  readonly fx = new Fx();
  readonly vm: Viewmodel;
  private tags = new TagMenu();
  readonly hud = new Hud();
  readonly tutor = new Tutor();
  private marker: Marker;
  private say: Say = { dev: 'mouse', locked: false, lockAvailable: false };
  private stuckT = 0;
  private lastSale = 0;
  /** A goal page waiting to follow the one on screen (the next goal after a done one). */
  private nextGoalT = 0;
  readonly input: Input;
  private canvas: HTMLCanvasElement;
  private board: { ctx: CanvasRenderingContext2D; tex: CanvasTexture; key: string };
  private running = false;
  private raf = 0;
  private last = 0;
  private t = 0;
  private saveT = 30;
  paused = false;
  private frozen: boolean;
  private timeScale: number;
  private menu: { it: Interactable; rail: Rail; x: number; z: number; closeT: number } | null = null;
  private turn: { yaw: number; pitch: number; t: number } | null = null;
  private walkAmt = 0;
  private dip = 0;
  private dipV = 0;
  private fov = FOV;
  private kick = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private lookAccum = 0;
  private walked = 0;
  private aim: Aim = { ex: 0, ey: 0, ez: 0, dx: 0, dy: 0, dz: -1, mx: 0, my: 0, mz: 0 };
  private controls: Controls = { moveX: 0, moveZ: 0, sprint: false, jump: false, jumpPressed: false, draw: false, puff: false, puffPressed: false };
  private eye = new Vector3();
  private right = new Vector3();
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private sunView = new Vector3();
  private loopsOn = { draw: false, wind: false, water: false, vents: false };
  private forceTouch: boolean;
  private wasTouch = false;
  private spotObjs = [0, 1, 2, 3, 4].map(() => ({ x: 0, y: 0 }));
  private spots: ({ x: number; y: number } | null)[] = [null, null, null, null, null];
  private box = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private w = 0;
  private h = 0;
  private dpr = 1;
  private resizeObs: ResizeObserver;
  private prevMenuZ = 0;
  private quality: 'low' | 'high';
  private nanArmed = false;
  private crossTarget: 'target' | 'prickly' | 'sell' | null = null;
  readonly debug: DebugHooks = { afterFrame: null };
  /** Frame stats for scripted checks: CPU ms per frame (update plus render submit). */
  readonly cpu: number[] = [];
  frames = 0;
  /** The serialised state right after loading, before any update. */
  loaded: unknown = null;

  constructor(private ctx: GameContext) {
    const params = new URLSearchParams(location.search);
    this.frozen = params.has('freeze');
    // Slow motion for captures of fast moments (the draw, a puff).
    this.timeScale = params.has('slow') ? 0.2 : 1;
    this.forceTouch = params.has('touch');
    this.quality = ctx.quality();
    const low = this.quality === 'low';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'rc';
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false, preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    if (!low) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = PCFShadowMap;
    }
    ctx.root.append(this.canvas, this.hud.el);
    this.input = new Input(ctx.root, this.canvas, { noLock: params.has('nolock') });
    this.hud.el.append(this.input.touch);
    this.input.onLockLost = () => {
      if (this.running && !this.paused) this.openPause();
    };
    this.input.menuUp = () => this.paused;

    // Load or start fresh.
    const saved = ctx.load<unknown>();
    const sources = new Sim(null).s.sources;
    const st: RanchState | null = saved ? deserialize(saved, sources) : null;
    this.sim = new Sim(st);
    this.sim.teaching = true;
    // A ranch saved before the lessons: credit what it has done, so nothing is taught twice.
    if (st && !Array.isArray((saved as { learn?: unknown }).learn)) creditLessons(this.sim.s);
    // Everything learned at once: a sandbox, and scripted checks of single features.
    if (params.has('taught')) teachAll(this.sim.s);
    if (params.has('hour')) this.sim.s.hour = Number(params.get('hour')) || 7;
    this.loaded = serialize(this.sim.s);

    // The world.
    this.sky = new Sky(this.scene, !low);
    this.ground = new GroundTex();
    this.syncGrass();
    const terrain = buildTerrain();
    this.scene.add(terrain, ...buildWater(), ...buildHills());
    const grass = buildGrass(this.ground.tex, low ? 15000 : 36000, low ? 34 : 56);
    this.grassCam = grass.cam;
    this.scene.add(grass.mesh);
    const fl = buildFluff(low ? 280 : 560, 44);
    this.fluffCam = fl.cam;
    this.fluffPx = fl.px;
    this.scene.add(fl.points);
    const [bc, bg] = canvas(512, 384);
    const bt = tex(bc);
    this.board = { ctx: bg, tex: bt, key: '' };
    const boardMat = new MeshLambertMaterial({ map: bt, emissiveMap: bt, emissive: new Color(0x555555) });
    this.props = buildProps(boardMat);
    this.scene.add(this.props.group, this.pads.group, this.creatures.root, this.tags.group, ...this.fx.objects());
    this.pads.sync(this.sim.s.pads);
    this.vm = new Viewmodel(this.creatures.geos);
    this.marker = new Marker(this.creatures.geos);
    this.scene.add(this.marker.group);
    this.fx.reduced = ctx.settings().reducedMotion;

    // HUD wiring.
    this.hud.onResume = () => this.closePause();
    this.hud.onGames = () => ctx.openSwitcher();
    this.hud.onSlot = (i) => this.selectSlot(i);
    this.hud.onCycle = () => this.cycleSlot();
    this.hud.snapCoins(this.sim.s.coins);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(ctx.root);
    this.resize();
    this.placeCamera(0);
    // Fonts arrive after the first paint; redraw the painted things once they do.
    void document.fonts?.ready.then(() => {
      this.board.key = '';
    });
  }

  // ------------------------------------------------------------ lifecycle

  /** Compile every shader and upload every buffer once, so nothing hitches the first time it appears. */
  private warm(): void {
    const hidden: Object3D[] = [];
    const empty: InstancedMesh[] = [];
    for (const sc of [this.scene, this.vm.scene]) {
      sc.traverse((o) => {
        if (!o.visible) {
          hidden.push(o);
          o.visible = true;
        }
        const im = o as InstancedMesh;
        if (im.isInstancedMesh && im.count === 0) {
          empty.push(im);
          im.count = 1;
        }
      });
    }
    this.renderer.compile(this.scene, this.camera);
    this.renderer.compile(this.vm.scene, this.vm.camera);
    this.render();
    for (const o of hidden) o.visible = false;
    for (const m of empty) m.count = 0;
    this.warmed = true;
  }

  private warmed = false;

  start(): void {
    if (!this.warmed) this.warm();
    this.running = true;
    this.input.enabled = true;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  pause(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input.enabled = false;
    this.input.releaseLock();
    this.input.reset();
    this.stopLoops();
    this.closeMenu();
  }

  resume(): void {
    if (this.running) return;
    this.hud.hidePause();
    this.paused = false;
    this.input.reset();
    this.start();
  }

  save(): void {
    this.ctx.save(serialize(this.sim.s), summary(this.sim.s));
    this.saveT = 30;
  }

  reset(): void {
    this.closeMenu();
    this.sim = new Sim(null);
    this.sim.teaching = true;
    this.tutor.clear();
    this.hud.setLesson('', false);
    this.syncGrass();
    this.pads.sync(this.sim.s.pads);
    this.hud.snapCoins(this.sim.s.coins);
    this.hud.hidePage();
    this.hud.hidePause();
    this.paused = false;
    this.props.gates.ridge.left.rotation.y = this.props.gates.ridge.right.rotation.y = 0;
    this.props.gates.hollow.left.rotation.y = this.props.gates.hollow.right.rotation.y = 0;
    this.placeCamera(0);
    this.save();
  }

  private stopLoops(): void {
    for (const k of Object.keys(this.loopsOn) as (keyof typeof this.loopsOn)[]) {
      if (this.loopsOn[k]) this.ctx.audio.loop(`ranch.${k}`, false);
      this.loopsOn[k] = false;
    }
  }

  private resize(): void {
    const r = this.ctx.root.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    const cap = this.ctx.quality() === 'low' ? 1.5 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, cap);
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const touch = this.isTouch();
    this.vm.resize(w / h, this.fov, touch);
    const px = (h * dpr) / (2 * Math.tan(((FOV / 2) * Math.PI) / 180));
    this.fluffPx.value = px;
    this.fx.setPx(px);
  }

  private isTouch(): boolean {
    return this.forceTouch || this.ctx.device() === 'touch';
  }

  private syncGrass(): void {
    this.sim.s.pads.forEach((p, i) => {
      const at = PADS[i];
      setGrassDisc(at.x, at.z, PEN_R + 0.2, p.kind === 'pen' ? 0.85 : 0.04);
    });
    this.ground.refresh();
  }

  // ------------------------------------------------------------ the loop

  private loop = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const t0 = performance.now();
    const dt = clamp((now - this.last) / 1000, 0, 0.1) * this.timeScale;
    this.last = now;
    this.tick(dt);
    this.render();
    this.frames++;
    this.cpu.push(performance.now() - t0);
    if (this.cpu.length > 600) this.cpu.shift();
  };

  /** Advance the game without drawing (scripted checks). */
  step(seconds: number, dt = 1 / 60): void {
    let left = seconds;
    while (left > 1e-6) {
      const d = Math.min(dt, left);
      this.tick(d);
      left -= d;
    }
  }

  private tick(dt: number): void {
    this.t += dt;
    U.uTime.value = this.t;
    const f = this.input.frame();
    const s = this.sim.s;
    const touch = this.isTouch();
    this.input.showTouch(touch && !this.paused);
    this.hud.el.classList.toggle('rh-touch', touch);
    if (touch !== this.wasTouch) {
      this.wasTouch = touch;
      this.vm.resize(this.w / this.h, this.fov, touch);
    }

    // The pause page.
    if (f.pause) {
      if (this.paused) this.closePause();
      else if (this.menu) this.closeMenu();
      else this.openPause();
    }
    if (this.paused) {
      const dz = Math.sign(f.moveZ);
      if (dz !== this.prevMenuZ && dz !== 0) this.hud.pauseKey(-dz, false);
      this.prevMenuZ = dz;
      if (f.confirm || f.interact || f.jumpPressed) this.hud.pauseKey(0, true);
      this.hud.update(dt);
      this.mood('menu');
      this.stopLoops();
      this.placeCamera(dt);
      this.updateVisuals(0);
      return;
    }

    // Look.
    const p = s.player;
    if (this.turn) {
      if (f.lookX || f.lookY) this.turn = null;
      else {
        this.turn.t -= dt;
        const k = 1 - Math.exp(-11 * dt);
        p.yaw += angleDiff(p.yaw, this.turn.yaw) * k;
        p.pitch += (this.turn.pitch - p.pitch) * k;
        if (this.turn.t <= 0) this.turn = null;
      }
    }
    p.yaw -= f.lookX;
    p.pitch = clamp(p.pitch - f.lookY, -1.45, 1.45);
    if (f.looked) {
      const amt = Math.abs(f.lookX) + Math.abs(f.lookY);
      this.lookAccum += amt;
      this.tutor.add(s, 'look', amt);
    }
    if (this.lookAccum > 0.4) this.doneHint('look');
    const knows = (w: string) => this.sim.knows(w);

    // Slots, once the lesson about them has come.
    if (!this.menu && knows('slots')) {
      if (f.slotDirect >= 0 && f.slotDirect < s.slots.length) this.selectSlot(f.slotDirect);
      if (f.slotDelta) this.selectSlot((s.sel + f.slotDelta + s.slots.length * 4) % s.slots.length);
    }

    // A tap near one of the bellows' windows picks that slot (the nearest).
    if (f.tapped && !this.menu && knows('slots')) {
      let best = -1;
      let bd = 22;
      for (let i = 0; i < s.slots.length; i++) {
        const w = this.vm.windowScreen(i, this.tmp);
        const d = w ? Math.hypot(w.x * this.w - f.tapX, w.y * this.h - f.tapY) : 1e9;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (best >= 0) this.selectSlot(best);
    }

    // Menus and interacting.
    const near = this.menu ? null : this.sim.interactable(this.aim);
    if (this.menu) this.menuTick(f, dt);
    else if (f.interact) {
      if (near) this.openMenu(near);
      else if (knows('slots')) this.selectSlot((s.sel + 1) % s.slots.length);
    }

    // Controls.
    const c = this.controls;
    c.moveX = f.moveX;
    c.moveZ = f.moveZ;
    c.sprint = f.sprint;
    c.jump = f.jump;
    c.jumpPressed = f.jumpPressed;
    const busy = !!this.menu;
    // The bellows answers once a lesson has put it in your hands.
    c.draw = f.draw && !busy && knows('bellows');
    c.puff = f.puff && !busy && knows('puff');
    c.puffPressed = f.puffPressed && !busy && knows('puff');
    if (f.moveX || f.moveZ) {
      this.walked += dt;
      this.tutor.add(s, 'walk', dt);
      // Pushing into something that will not give: the terrain needs a jump.
      const blocked = Math.hypot(f.moveX, f.moveZ) > 0.5 && p.grounded && Math.hypot(p.vx, p.vz) < 0.6;
      this.stuckT = blocked ? this.stuckT + dt : 0;
      // Remember when (in seconds walked): only a recent bump means the ground needs a jump.
      if (this.stuckT > 1.2) {
        this.stuckT = 0;
        s.learnCount.stuckAt = s.learnCount.walk ?? 0;
      }
    } else this.stuckT = 0;
    if (this.walked > 0.8) this.doneHint('move');
    if (!this.frozen) this.sim.update(dt, c, this.aim);
    if (this.menu && Math.hypot(p.x - this.menu.x, p.z - this.menu.z) > 3.2) this.closeMenu();
    this.handleEvents();
    this.lessonTick(dt);

    this.placeCamera(dt);
    this.updateVisuals(dt);
    this.updateHud(dt, f, near);
    this.audioTick(dt);
    this.mood('farm');

    this.saveT -= dt;
    if (this.saveT <= 0) this.save();
  }

  // ------------------------------------------------------------ camera

  private placeCamera(dt: number): void {
    const s = this.sim.s;
    const p = s.player;
    const reduced = this.ctx.settings().reducedMotion;
    const sp = Math.hypot(p.vx, p.vz);
    this.walkAmt = damp(this.walkAmt, p.grounded ? clamp(sp / 4.7, 0, 1.3) : 0, 10, dt);
    const phase = this.sim.stride * (Math.PI / 1.9);
    const amt = reduced ? 0 : this.walkAmt;
    const bobY = -Math.abs(Math.sin(phase)) * 0.03 * amt + 0.015 * amt;
    const bobX = Math.sin(phase) * 0.011 * amt;
    this.dipV += (-this.dip * 110 - this.dipV * 13) * dt;
    this.dip += this.dipV * dt;
    this.kick = damp(this.kick, 0, 14, dt);
    this.right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    this.eye.set(p.x + this.right.x * bobX, p.y + EYE + bobY + (reduced ? 0 : this.dip), p.z + this.right.z * bobX);
    this.camera.position.copy(this.eye);
    this.camera.rotation.set(p.pitch + this.kick, p.yaw, 0, 'YXZ');
    const sprinting = this.controls.sprint && sp > 5;
    this.fov = damp(this.fov, FOV + (sprinting && !reduced ? 3 : 0), 5, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
      this.vm.resize(this.w / this.h, this.fov, this.isTouch());
    }
    this.camera.updateMatrixWorld();
    // Aim and the muzzle in the world.
    const cp = Math.cos(p.pitch);
    const a = this.aim;
    a.ex = this.eye.x;
    a.ey = this.eye.y;
    a.ez = this.eye.z;
    a.dx = -Math.sin(p.yaw) * cp;
    a.dy = Math.sin(p.pitch);
    a.dz = -Math.cos(p.yaw) * cp;
    this.vm.muzzle(this.tmp);
    this.camera.localToWorld(this.tmp);
    a.mx = this.tmp.x;
    a.my = this.tmp.y;
    a.mz = this.tmp.z;
  }

  // ------------------------------------------------------------ visuals

  private updateVisuals(dt: number): void {
    const s = this.sim.s;
    const night = this.sky.night;
    this.sky.update(s.hour, this.t, this.eye.x, this.eye.y, this.eye.z);
    this.grassCam.set(this.eye.x, this.eye.z);
    this.fluffCam.value.copy(this.eye);
    // Wind: a slow swing in direction and gusts that roll through.
    const wa = 0.4 + Math.sin(this.t * 0.03) * 0.5;
    const gust = 0.75 + Math.sin(this.t * 0.21) * 0.25 + Math.max(0, Math.sin(this.t * 0.083)) * 0.4;
    U.uWind.value.set(Math.cos(wa), Math.sin(wa), gust);
    const a = this.aim;
    U.uDraw.value.set(a.mx, a.my, a.mz, this.sim.drawPower);
    U.uDrawDir.value.set(a.dx, a.dy, a.dz);
    this.creatures.update(s, this.sim.phys, this.t, { x: a.mx, y: a.my, z: a.mz });
    this.pads.update(dt, s.pads);
    this.props.update(this.t, night);
    this.tags.update(dt, gust);
    if (this.sim.drawing && dt > 0) this.fx.drawStream(dt, a.ex, a.ey, a.ez, a.dx, a.dy, a.dz, a.mx, a.my, a.mz, this.sim.range);
    this.fx.update(dt, this.t, this.eye, night);
    // Gates swing open once bought.
    for (const g of Object.keys(GATES) as GateId[]) {
      const o = this.props.gates[g];
      const want = s.gates[g] ? 1.65 : 0;
      const side = g === 'ridge' ? 1 : -1;
      o.left.rotation.y = damp(o.left.rotation.y, -want * side, 2.2, dt || 1);
      o.right.rotation.y = damp(o.right.rotation.y, want * side, 2.2, dt || 1);
      // Prices hang on the gates once their lesson has come.
      o.tag.visible = !s.gates[g] && this.sim.knows('gates');
    }
    this.paintBoard();
    // The bellows.
    const p = s.player;
    const dyaw = angleDiff(this.lastYaw, p.yaw);
    const dpitch = p.pitch - this.lastPitch;
    this.lastYaw = p.yaw;
    this.lastPitch = p.pitch;
    this.sunView.copy(U.uSunDir.value).transformDirection(this.camera.matrixWorldInverse);
    this.vm.update(dt, this.t, {
      phase: this.sim.stride * (Math.PI / 1.9),
      walk: this.walkAmt,
      dyaw,
      dpitch,
      draw: this.sim.drawPower,
      slots: s.slots,
      sel: s.sel,
      cap: capacity(s),
      land: this.dip,
      reduced: this.ctx.settings().reducedMotion,
      sunDir: this.sunView,
      sunColor: this.sky.sun.color,
      skyColor: this.sky.hemi.color,
      groundColor: this.sky.hemi.groundColor,
      hidden: this.paused || !this.sim.knows('bellows'),
      windows: this.sim.knows('slots'),
    });
    this.marker.update(dt, this.t, this.tutor.mark, this.paused || !!this.menu, this.eye, this.floor, this.ctx.settings().reducedMotion);
  }

  private floor = (x: number, z: number) => this.sim.phys.floor(x, z);

  private paintBoard(): void {
    const s = this.sim.s;
    const rows: BoardRow[] = KINDS.map((k) => {
      const price = this.sim.price(k);
      const known = s.caught.includes(k) || k === 'clover';
      return { name: KIND[k].name.replace(' downy', ''), price: known ? price : null, trend: Math.sign(price - s.market.prev[k]) };
    });
    const key = `${s.day}|${rows.map((r) => `${r.price}:${r.trend}`).join(',')}`;
    if (key === this.board.key) return;
    this.board.key = key;
    paintBoard(this.board.ctx, 512, 384, s.day, rows.map((r) => ({ ...r, name: r.name[0].toUpperCase() + r.name.slice(1) })));
    this.board.tex.needsUpdate = true;
  }

  private render(): void {
    const r = this.renderer;
    r.info.reset();
    r.clear();
    r.render(this.scene, this.camera);
    r.clearDepth();
    r.render(this.vm.scene, this.vm.camera);
    if (this.debug.afterFrame) this.debug.afterFrame(r.getContext() as WebGL2RenderingContext);
  }

  // ------------------------------------------------------------ events

  private cue(name: string, x?: number, y?: number, z?: number, gain = 1, pitch = 1): void {
    if (x === undefined || y === undefined || z === undefined) {
      this.ctx.audio.cue(name, { gain, pitch });
      return;
    }
    const dx = x - this.eye.x;
    const dy = y - this.eye.y;
    const dz = z - this.eye.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > 42) return;
    const pan = clamp((dx * this.right.x + dz * this.right.z) / Math.max(d, 1), -1, 1) * 0.8;
    this.ctx.audio.cue(name, { pan, gain: clamp(gain / (1 + d * 0.11), 0, 1), pitch });
  }

  private handleEvents(): void {
    const evs = this.sim.events;
    if (!evs.length) return;
    const a = this.aim;
    for (const e of evs) {
      this.tutor.onEvent(this.sim.s, e);
      this.onEvent(e, a);
    }
    evs.length = 0;
  }

  private onEvent(e: Ev, a: Aim): void {
    const s = this.sim.s;
    switch (e.t) {
      case 'suck': {
        const big = isDowny(e.thing);
        this.cue('ranch.suck', undefined, undefined, undefined, big ? 0.9 : 0.7, big ? 0.75 : isFood(e.thing) ? 1 : 1.3);
        this.fx.gulp(a.mx, a.my, a.mz, thingColor(e.thing));
        this.vm.gulp();
        this.doneHint('draw');
        break;
      }
      case 'full': {
        this.cue('ranch.full');
        const room = this.sim.accept(e.thing) < 0;
        this.hud.note(room && s.slots.every((q) => q.t) && !s.slots.some((q) => q.t === e.thing) ? 'No slot free for another kind.' : 'That slot is full.');
        break;
      }
      case 'puff':
        this.cue('ranch.puff', undefined, undefined, undefined, e.thing ? 0.9 : 0.55, e.thing ? 1 : 1.25);
        this.vm.puffKick(!!e.thing);
        this.fx.puff(a.mx, a.my, a.mz, a.dx, a.dy, a.dz, !!e.thing);
        if (!this.ctx.settings().reducedMotion) this.kick += e.thing ? 0.012 : 0.006;
        if (e.thing) this.doneHint('puff');
        break;
      case 'boing':
        this.cue('ranch.boing', e.x, e.y, e.z, 0.4 + e.v * 0.6, CHIRP_PITCH[e.kind]);
        break;
      case 'chirp':
        this.cue('ranch.chirp', e.x, e.y, e.z, 0.8, CHIRP_PITCH[e.kind] * (0.95 + Math.random() * 0.1));
        break;
      case 'squeak':
        this.cue('ranch.squeak', e.x, e.y, e.z, 0.9, CHIRP_PITCH[e.kind]);
        break;
      case 'eat':
        this.cue('ranch.eat', e.x, e.y, e.z);
        this.fx.crumbs(e.x, e.y, e.z, thingColor(e.food));
        break;
      case 'shed':
        this.cue('ranch.shed', e.x, e.y, e.z);
        this.fx.shed(e.x, e.y, e.z, KIND[e.kind].body);
        break;
      case 'frazzle':
        this.cue('ranch.frazzle', e.x, e.y, e.z, 0.7);
        break;
      case 'sell':
        this.cue('ranch.sell', e.x, e.y, e.z);
        this.cue('ranch.coins', e.x, e.y, e.z, clamp(0.4 + e.coins / 40, 0, 1));
        this.fx.coinPop(e.x, e.y, e.z, clamp(Math.round(e.coins / 7), 1, 6));
        this.lastSale = e.coins;
        break;
      case 'reject':
        this.cue('ranch.deny', e.x, e.y, e.z);
        this.hud.note('The crate only takes fluff.');
        break;
      case 'build': {
        this.cue('ranch.build', e.x, heightAt(e.x, e.z), e.z);
        if (e.pad >= 0) {
          this.fx.dust(e.x, heightAt(e.x, e.z), e.z, e.what === 'clear' ? 2 : PEN_R);
          this.pads.sync(s.pads, e.pad);
          this.syncGrass();
        } else this.fx.burst(a.mx, a.my, a.mz, 0xc9a24a, 16, 1.5);
        break;
      }
      case 'gate': {
        const g = GATES[e.gate];
        const y = heightAt(g.x, g.z);
        this.cue('ranch.gate', g.x, y, g.z);
        this.ctx.audio.loop('ranch.wind', true, { gain: 1 });
        this.fx.burst(g.x, y + 1.5, g.z, 0xf2c890, 60, 5);
        if (!this.ctx.settings().reducedMotion) this.dipV -= 1.2;
        if (!this.tutor.busy) this.hud.showPage(`Day ${s.day}`, [{ text: `The way to ${g.name} is open.`, done: true, fresh: true }], 5);
        break;
      }
      case 'nettle':
        this.cue('ranch.nettle', e.x, e.y, e.z);
        break;
      case 'nettlehit':
        this.cue('ranch.nettlehit', e.x, e.y, e.z);
        this.fx.dust(e.x, e.y, e.z, 0.3);
        break;
      case 'splash':
        this.cue('ranch.splash', e.x, e.y, e.z);
        this.fx.splash(e.x, e.y, e.z);
        break;
      case 'goal':
        this.cue('ranch.goal');
        // While a lesson is up, the page belongs to it; the pause page keeps the tally.
        if (!this.tutor.busy) this.showGoals(e.id);
        break;
      case 'deny':
        this.cue('ranch.deny');
        this.hud.note(e.why);
        break;
      case 'plant': {
        const at = PADS[e.pad];
        this.cue('ranch.build', at.x, heightAt(at.x, at.z), at.z, 0.7, 1.3);
        this.fx.dust(at.x, heightAt(at.x, at.z) + 0.4, at.z, 1.2);
        this.hud.note(`Planted ${thingName(e.food, 2)}.`);
        break;
      }
      case 'crop': {
        const at = PADS[e.pad];
        this.cue('ranch.shed', at.x, heightAt(at.x, at.z), at.z, 0.5, 0.8);
        break;
      }
      case 'store':
        this.cue('ranch.suck', e.x, e.y, e.z, 0.6, 0.7);
        break;
      case 'first': {
        const [title, line] = FIRST[e.kind];
        this.fx.burst(a.mx + a.dx * 1.2, a.my + a.dy * 1.2, a.mz + a.dz * 1.2, KIND[e.kind].body, 30, 2.2);
        this.cue('ranch.chirp', undefined, undefined, undefined, 1, CHIRP_PITCH[e.kind]);
        if (!this.tutor.busy) {
          this.hud.showPage(title, [{ text: line, done: false, fresh: false }], 5);
          this.hud.el.querySelector('.rh-page')?.classList.add('note');
        }
        break;
      }
      case 'step':
        this.cue(e.stone ? 'ranch.stepstone' : 'ranch.step', undefined, undefined, undefined, 0.5, e.pitch);
        break;
      case 'jump':
        this.cue('ranch.jump', undefined, undefined, undefined, 0.6);
        break;
      case 'land':
        this.cue('ranch.land', undefined, undefined, undefined, 0.3 + e.v * 0.7);
        if (!this.ctx.settings().reducedMotion) this.dipV -= 0.6 + e.v * 1.6;
        break;
      case 'glide':
        this.cue('ranch.glide');
        break;
      case 'sleep':
        this.cue('ranch.sleep');
        this.hud.dim();
        this.save();
        break;
      case 'zone':
        this.hud.showZone(ZONE_NAMES[e.zone]);
        break;
      case 'air':
        break;
    }
  }

  /** One goal at a time: the one just done (then the next, a moment later), or the next on its own. */
  private showGoals(done: GoalId | null): void {
    const lines: PageLine[] = [];
    let title = 'Next';
    if (done) {
      const g = GOALS.find((q) => q.id === done)!;
      lines.push({ text: g.text, done: true, fresh: true });
      title = `Paid ${g.reward} coins`;
      this.nextGoalT = 3.4;
    } else {
      const next = this.sim.openGoals(1)[0];
      if (!next) return;
      lines.push({ text: next.text, done: false, fresh: false });
      this.nextGoalT = 0;
    }
    this.hud.el.querySelector('.rh-page')?.classList.remove('note');
    this.hud.showPage(title, lines, done ? 3.4 : 5);
  }

  // ------------------------------------------------------------ lessons

  private lessonTick(dt: number): void {
    const s = this.sim.s;
    const say = this.say;
    const dev = this.device();
    say.dev = dev === 'touch' ? 'touch' : dev === 'pad' ? 'pad' : 'mouse';
    say.locked = this.input.locked;
    say.lockAvailable = this.input.lockAvailable;
    const v = this.tutor.update(s, dt, say, this.floor);
    for (const w of this.tutor.fresh) {
      // Coins arrive with the first sale, counting up from before it.
      if (w === 'coins') this.hud.snapCoins(s.coins - this.lastSale);
    }
    if (v.done && this.prevLessonDone !== v.id) {
      this.prevLessonDone = v.id;
      this.cue('ranch.slot', undefined, undefined, undefined, 0.7, 1.3);
    }
    this.hud.setLesson(v.line, v.done);
    if (this.nextGoalT > 0 && !v.line) {
      this.nextGoalT -= dt;
      if (this.nextGoalT <= 0) this.showGoals(null);
    }
  }

  private prevLessonDone = '';

  // ------------------------------------------------------------ slots

  /** Flick the selector to the next slot that holds something (or the next one). */
  cycleSlot(): void {
    const s = this.sim.s;
    for (let k = 1; k <= s.slots.length; k++) {
      const i = (s.sel + k) % s.slots.length;
      if (s.slots[i].t) {
        this.selectSlot(i);
        return;
      }
    }
    this.selectSlot((s.sel + 1) % s.slots.length);
  }

  selectSlot(i: number): void {
    const s = this.sim.s;
    if (i < 0 || i >= s.slots.length || i === s.sel) return;
    s.sel = i;
    this.cue('ranch.slot');
    this.doneHint('slot');
    this.tutor.add(s, 'slot');
  }

  // ------------------------------------------------------------ menus

  private railFor(it: Interactable): Rail {
    const p = this.sim.phys;
    if (it.kind === 'pad' || it.kind === 'silo') {
      const sp = padSpots(it.id as number);
      const y = heightAt(sp.post.x, sp.post.z) + 2.13;
      return sp.ls > 0 ? { x: sp.post.x + 0.22, y, z: sp.post.z + 0.09, ax: 1, az: 0, ry: 0 } : { x: sp.post.x + 3.42, y, z: sp.post.z - 0.09, ax: -1, az: 0, ry: Math.PI };
    }
    if (it.kind === 'bench') {
      const r = this.props.tagRails.bench;
      return { x: r.x, y: r.y, z: r.z + 2.0, ax: 0, az: -1, ry: Math.PI / 2 };
    }
    if (it.kind === 'door') {
      const y = p.floor((PORCH.x0 + PORCH.x1) / 2, (PORCH.z0 + PORCH.z1) / 2) + 2.35;
      return { x: DOOR.x - 0.3, y, z: PORCH.z0 + 0.25, ax: 0, az: 0, ry: Math.PI };
    }
    const g = GATES[it.id as GateId];
    const side = it.id === 'ridge' ? 1 : -1;
    return { x: g.x + side * 0.55, y: heightAt(g.x, g.z) + 2.25, z: g.z + 0.3, ax: 0, az: 0, ry: (side * Math.PI) / 2 };
  }

  private openMenu(it: Interactable): void {
    const opts = this.sim.menu(it);
    this.doneHint('use');
    if (!opts.length) return;
    const rail = this.railFor(it);
    this.tags.show(rail, opts);
    const p = this.sim.s.player;
    this.menu = { it, rail, x: p.x, z: p.z, closeT: 0 };
    this.cue('ranch.slot', undefined, undefined, undefined, 0.6, 0.8);
    // Turn gently to face the tags.
    const c = this.tags.centre(this.tmp2);
    if (c) {
      const dx = c.x - this.eye.x;
      const dy = c.y - this.eye.y;
      const dz = c.z - this.eye.z;
      this.turn = { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)), t: 0.45 };
    }
    this.tags.setHot(-1);
  }

  private closeMenu(): void {
    if (!this.menu) return;
    this.tags.close();
    this.menu = null;
    this.turn = null;
  }

  private menuTick(f: Frame, dt: number): void {
    const m = this.menu!;
    if (m.closeT > 0) {
      m.closeT -= dt;
      if (m.closeT <= 0) this.closeMenu();
      return;
    }
    // Pick by looking (crosshair), by tapping or clicking a tag, or by number.
    const a = this.aim;
    let hot = this.tags.pick(a.ex, a.ey, a.ez, a.dx, a.dy, a.dz);
    if (f.tapped) {
      const ray = this.screenRay(f.tapX, f.tapY);
      const hit = this.tags.pick(this.eye.x, this.eye.y, this.eye.z, ray.x, ray.y, ray.z);
      if (hit >= 0) {
        this.tags.setHot(hit);
        this.confirm(hit);
        return;
      }
    }
    if (f.slotDirect >= 0 && f.slotDirect < this.tags.opts.length) {
      hot = f.slotDirect;
      this.tags.setHot(hot);
      this.confirm(hot);
      return;
    }
    if (hot >= 0 || !this.isTouch()) this.tags.setHot(hot);
    if (f.interact || f.confirm || (f.puffPressed && this.input.locked)) {
      if (this.tags.hot >= 0) this.confirm(this.tags.hot);
      else this.closeMenu();
    }
    // Keep options fresh (coins change while you stand there).
    if (Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2)) this.tags.refresh(this.sim.menu(m.it));
  }

  private confirm(i: number): void {
    const m = this.menu;
    if (!m) return;
    const o = this.tags.opts[i];
    if (!o || o.id === 'info') {
      this.tags.shake(i);
      return;
    }
    if (!o.ok) {
      this.tags.shake(i);
      this.cue('ranch.deny');
      if (o.price !== null) this.hud.note(`That needs ${fmtCoins(o.price)} coins. You have ${fmtCoins(this.sim.s.coins)}.`);
      return;
    }
    const ok = this.sim.choose(m.it, o.id);
    this.handleEvents();
    if (!ok) return;
    this.tags.take(i);
    if (o.id.startsWith('silo:')) {
      this.tags.refresh(this.sim.menu(m.it));
      this.cue('ranch.slot');
      return;
    }
    m.closeT = 0.35;
  }

  /** A world ray through a point on the screen (CSS px). */
  private screenRay(x: number, y: number): Vector3 {
    const nx = (x / this.w) * 2 - 1;
    const ny = -(y / this.h) * 2 + 1;
    return this.tmp2.set(nx, ny, 0.5).unproject(this.camera).sub(this.eye).normalize();
  }

  // ------------------------------------------------------------ pause

  openPause(): void {
    if (this.paused) return;
    this.closeMenu();
    this.paused = true;
    this.input.releaseLock();
    this.stopLoops();
    const s = this.sim.s;
    const h = Math.floor(s.hour);
    const m = Math.floor((s.hour - h) * 60);
    const ampm = h < 12 ? 'am' : 'pm';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const when = this.sim.knows('clock') ? `Day ${s.day}, ${h12}:${String(m).padStart(2, '0')} ${ampm}` : `Day ${s.day}`;
    this.hud.showPause(when, s.goals, this.tutor.line, this.tutor.notes(s), this.controlsLine());
    this.save();
  }

  /** The controls learned so far, in this device's words. */
  private controlsLine(): string {
    const k = (w: string) => this.sim.knows(w);
    const dev = this.device();
    const out: string[] = [];
    if (dev === 'touch') {
      out.push('Left thumb walks, the right side looks.');
      if (k('draw')) out.push(k('puff') ? 'Hold Pull to bring things in, tap Blow to send them out.' : 'Hold Pull to bring things in.');
      if (k('slots')) out.push('Tap a window to switch what you blow.');
      if (k('jump')) out.push('Jump hops.');
      if (k('pads')) out.push('The hand uses what is in front of you.');
    } else if (dev === 'pad') {
      out.push('Left stick walks, right stick looks.');
      if (k('draw')) out.push(k('puff') ? 'LT pulls, RT blows.' : 'LT pulls.');
      if (k('slots')) out.push('LB and RB switch kinds.');
      out.push('A jumps.');
      if (k('pads')) out.push('X uses what is in front of you.');
    } else {
      out.push('WASD walks, the mouse looks, Shift runs.');
      if (k('draw')) out.push(k('puff') ? 'Hold right click to pull, click to blow.' : 'Hold right click to pull.');
      if (k('slots')) out.push('Q or the wheel switch kinds.');
      out.push('Space jumps.');
      if (k('pads')) out.push('E uses what is in front of you.');
    }
    return out.join(' ');
  }

  closePause(): void {
    if (!this.paused) return;
    this.paused = false;
    this.hud.hidePause();
    this.input.reset();
    if (!this.isTouch() && this.input.lockAvailable) this.input.requestLock();
  }

  private device(): 'touch' | 'mouse' | 'key' | 'pad' {
    if (this.isTouch()) return 'touch';
    if (this.input.padActive) return 'pad';
    return this.ctx.device() === 'pad' ? 'pad' : 'mouse';
  }

  // ------------------------------------------------------------ hints and the HUD

  private doneHint(id: string): void {
    const h = this.sim.s.hints;
    if (!h.includes(id)) h.push(id);
  }

  private updateHud(dt: number, f: Frame, near: Interactable | null): void {
    const s = this.sim.s;
    const hud = this.hud;
    const touch = this.isTouch();
    const knows = (w: string) => this.sim.knows(w);
    // Only what the lessons have brought in is on the glass.
    hud.setKnown(knows('bellows'), knows('coins'), knows('clock'));
    this.input.setKnown(knows('draw'), knows('puff'), knows('jump'), knows('pause'));
    // Crosshair.
    this.crossTarget = this.sim.aimTarget(this.aim);
    if (this.menu) hud.setCross(this.tags.hot >= 0 ? 'tag' : 'idle');
    else hud.setCross(this.crossTarget ?? 'idle');
    const slot = s.slots[s.sel];
    hud.setCount(slot.t ? slot.n : 0, slot.t ? thingName(slot.t, slot.n) : '', capacity(s));
    hud.setCoins(s.coins, dt);
    hud.setHour(s.hour);
    // Use prompt: the key glyph shows until you have used something once.
    const keyGlyph = this.sim.s.hints.includes('use') ? null : touch ? null : this.device() === 'pad' ? 'X' : 'E';
    if (this.menu) {
      const hot = this.tags.hot;
      const o = hot >= 0 ? this.tags.opts[hot] : null;
      const verb = !o ? (touch ? 'Tap a tag' : 'Look at a tag') : o.id === 'sleep' ? 'Sleep' : o.id.startsWith('silo:') ? 'Pull these' : o.price !== null ? 'Buy' : o.id === 'garden:clear' ? 'Pull it' : '';
      hud.setPrompt(verb || null, o && !touch ? (this.device() === 'pad' ? 'X' : 'E') : null);
      this.input.setAct(o ? verb || 'Use' : 'Close');
    } else if (near) {
      hud.setPrompt(near.label, keyGlyph);
      this.input.setAct(near.kind === 'door' ? 'Door' : near.kind === 'bench' ? 'Bench' : near.kind === 'gate' ? 'Gate' : near.kind === 'chute' ? 'Box' : 'Post');
    } else {
      hud.setPrompt(null, null);
      this.input.setAct(null);
    }
    this.edgePointer();
    // The look lesson already says to click the view.
    hud.setClick(!touch && !this.input.locked && this.input.lockAvailable && !this.paused && this.device() !== 'pad' && this.tutor.current !== 'look');
    // Tap targets over the slot windows.
    const showSlots = (touch || !this.input.locked) && knows('slots');
    // Reused objects: nothing allocated per frame here.
    for (let i = 0; i < 5; i++) {
      const v = i < s.slots.length ? this.vm.windowScreen(i, this.tmp) : null;
      if (v) {
        this.spotObjs[i].x = v.x * this.w;
        this.spotObjs[i].y = v.y * this.h;
        this.spots[i] = this.spotObjs[i];
      } else this.spots[i] = null;
    }
    const bb = this.vm.bodyBox(this.box);
    bb.x0 *= this.w;
    bb.x1 *= this.w;
    bb.y0 *= this.h;
    bb.y1 *= this.h;
    hud.placeSlots(this.spots, showSlots && !this.paused, bb, this.paused || this.menu ? -1 : this.tutor.mark.slot);
    // J brings up the next goal, unless a lesson has the page.
    if (f.journal && !hud.lessonUp) {
      if (hud.pageUp) hud.hidePage();
      else this.showGoals(null);
    }
    hud.update(dt);
  }

  /** When the lesson's spot is out of view, a chevron on the edge of the screen points the way. */
  private edgePointer(): void {
    const m = this.tutor.mark;
    if (!m.on || this.menu || this.paused) {
      this.hud.setEdge(null);
      return;
    }
    // Camera space: z < 0 is in front.
    const v = this.tmp.set(m.x, m.y, m.z).applyMatrix4(this.camera.matrixWorldInverse);
    const behind = v.z > -0.1;
    this.tmp.set(m.x, m.y, m.z).project(this.camera);
    const sx = ((this.tmp.x + 1) / 2) * this.w;
    const sy = ((1 - this.tmp.y) / 2) * this.h;
    // The band it may sit in: clear of the shell corner, the journal page, the stick and the buttons.
    const x0 = 26;
    const x1 = this.w - 26;
    const y0 = this.h * 0.2;
    const y1 = this.h * 0.62;
    if (!behind && sx > x0 && sx < x1 && sy > 8 && sy < this.h - 8) {
      this.hud.setEdge(null);
      return;
    }
    // In front but off the edge: point straight at it. Behind you: point to the
    // side you would turn towards, at mid height.
    let dx = behind ? (v.x >= 0 ? 1 : -1) : v.x;
    const dy = behind ? 0 : -v.y;
    if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) dx = 1;
    const cx = this.w / 2;
    const cy = (y0 + y1) / 2;
    const k = Math.min(Math.abs(dx) > 1e-6 ? (x1 - cx) / Math.abs(dx) : 1e9, Math.abs(dy) > 1e-6 ? (y1 - cy) / Math.abs(dy) : 1e9);
    const ex = clamp(cx + dx * k, x0, x1);
    const ey = clamp(cy + dy * k, y0, y1);
    this.hud.setEdge(ex, ey, Math.atan2(dy, dx));
  }

  // ------------------------------------------------------------ audio

  private mood(scene: 'farm' | 'menu'): void {
    const s = this.sim.s;
    this.ctx.audio.mood({
      game: 'ranch',
      intensity: this.sim.danger,
      hour: s.hour,
      season: 0,
      weather: 'sun',
      scene,
      night: this.sky.night,
      speed: 1,
      tired: false,
      rules: PRESETS.sunup.rules,
    });
  }

  private setLoop(k: keyof Ranch['loopsOn'], on: boolean, gain = 1): void {
    if (on) this.ctx.audio.loop(`ranch.${k}`, true, { gain });
    else if (this.loopsOn[k]) this.ctx.audio.loop(`ranch.${k}`, false);
    this.loopsOn[k] = on;
  }

  private audioTick(_dt: number): void {
    const p = this.sim.s.player;
    if (this.sim.drawing !== this.loopsOn.draw) this.setLoop('draw', this.sim.drawing, 0.9);
    // Wind in gusts, water near the stream and pond, steam on the ridge.
    const g = U.uWind.value.z;
    const windGain = clamp((g - 0.7) * 1.2, 0.12, 0.8);
    if (Math.floor(this.t * 2) !== Math.floor((this.t - _dt) * 2) || !this.loopsOn.wind) this.setLoop('wind', true, windGain);
    const dWater = Math.min(polyDist(p.x, p.z, STREAM), Math.max(0, Math.hypot(p.x - POND.x, p.z - POND.z) - POND.r));
    const water = clamp(1 - dWater / 18, 0, 1);
    if (water > 0.02 || this.loopsOn.water) {
      if (Math.floor(this.t * 2) !== Math.floor((this.t - _dt) * 2)) this.setLoop('water', water > 0.02, water);
    }
    let dv = 1e9;
    for (const [vx, vz] of VENTS) dv = Math.min(dv, Math.hypot(p.x - vx, p.z - vz));
    const vent = clamp(1 - dv / 22, 0, 1);
    if (vent > 0.02 || this.loopsOn.vents) {
      if (Math.floor(this.t * 2) !== Math.floor((this.t - _dt) * 2)) this.setLoop('vents', vent > 0.02, vent);
    }
  }

  // ------------------------------------------------------------ debug

  watchNaN(on: boolean): void {
    if (!this.nanArmed) {
      armNaNWatch(this.scene);
      armNaNWatch(this.vm.scene);
      this.nanArmed = true;
    }
    U.uNaNWatch.value = on ? 1 : 0;
  }

  injectNaN(on: boolean): void {
    if (!this.nanArmed) this.watchNaN(false);
    const bw = this.w * this.dpr;
    const bh = this.h * this.dpr;
    U.uNaNPlant.value.set(bw / 2, bh / 2, on ? 10 * this.dpr : 0, 1);
  }

  renderInfo(): { calls: number; triangles: number; points: number; geometries: number; textures: number; programs: number } {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, points: i.render.points, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? 0 };
  }

  /** Point the view at a world position. */
  aimAt(x: number, y: number, z: number): void {
    const p = this.sim.s.player;
    const dx = x - p.x;
    const dy = y - (p.y + EYE);
    const dz = z - p.z;
    p.yaw = Math.atan2(-dx, -dz);
    p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    this.placeCamera(0);
  }

  get isRunning(): boolean {
    return this.running;
  }

  anyHeld(): boolean {
    return this.input.anyHeld() || this.sim.drawing;
  }

  menuOpen(): boolean {
    return !!this.menu;
  }

  menuOptions(): string[] {
    return this.menu ? this.tags.opts.map((o) => o.id) : [];
  }

  /** Where a tag is on screen (CSS px), for tapping it in checks. */
  tagScreen(i: number): { x: number; y: number } | null {
    const t = (this.tags as unknown as { tags: { face: Mesh; opt: unknown }[] }).tags[i];
    if (!t || !t.opt) return null;
    t.face.updateWorldMatrix(true, false);
    const v = this.tmp.setFromMatrixPosition(t.face.matrixWorld).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.w, y: ((1 - v.y) / 2) * this.h };
  }

  slotScreen(i: number): { x: number; y: number } | null {
    const v = this.vm.windowScreen(i, this.tmp);
    return v ? { x: v.x * this.w, y: v.y * this.h } : null;
  }

  /** Project a world point to CSS px (null if behind). */
  project(x: number, y: number, z: number): { x: number; y: number } | null {
    const v = this.tmp.set(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * this.w, y: ((1 - v.y) / 2) * this.h };
  }

  caps(): number[] {
    return CAPS;
  }

  /** What the lessons have put in the 3D layer, for checks: the bellows, its windows, the marker, gate price tags. */
  seen(): { lesson: string; done: boolean; line: string; bellows: number; windows: boolean; marker: string | null; ring: boolean; gateTags: boolean } {
    const m = this.marker.showing;
    return {
      lesson: this.tutor.current,
      done: this.tutor.current !== '' && this.tutor.line === '',
      line: this.tutor.line,
      bellows: this.vm.raised,
      windows: this.vm.windowsShown,
      marker: m.icon,
      ring: m.ring,
      gateTags: this.props.gates.ridge.tag.visible || this.props.gates.hollow.tag.visible,
    };
  }

  thing(t: Thing): string {
    return thingName(t);
  }
}
