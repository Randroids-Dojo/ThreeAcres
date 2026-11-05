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
import { CAPS, GOALS, KIND, KINDS, ORDER_BY, ORDER_NOON, RARE_NAME, fmtCoins, isDowny, isFood, isTuft, thingColor, thingName, type DownyKind, type GoalId, type Order, type Thing } from './defs';
import { Hud, type PageLine, type SlotIcon } from './hud';
import { Input, buzz, type Frame } from './input';
import { Pages, Tutor, allLines, creditLessons, fullNote, goalSpot, goalText, orderLines, orderSpot, orderTally, teachAll, type Say } from './lessons';
import { edgeSpot, type EdgeSpot } from './edge';
import { TagChoice, type PickDev } from './menu';
import { angleDiff, clamp, damp } from './noise';
import { PORCH } from './physics';
import { Fx } from './scene/fx';
import { CreatureView, TELL_BODY } from './scene/creatures';
import { GroundTex, buildFluff, buildGrass } from './scene/grass';
import { Marker } from './scene/marker';
import { U, armNaNWatch } from './scene/mat';
import { PadView } from './scene/pads';
import { canvas, layoutTag, paintBoard, tex, type BoardOrder, type BoardRow, type TagLayout } from './scene/paint';
import { buildProps, type Props } from './scene/props';
import { Sky } from './scene/sky';
import { TagMenu, type Rail } from './scene/tags';
import { buildHills, buildTerrain, buildWater } from './scene/terrain';
import { Viewmodel } from './scene/viewmodel';
import { Sim, padSpots, rareFed, type Aim, type Controls, type Ev, type Interactable } from './sim';
import { capacity, deserialize, serialize, slotCap, summary, type RanchState, type Slot } from './state';
import { BOARD, CRATES, DOOR, EXCHANGE, GATES, PADS, PEN_R, POND, SIGHTINGS, STREAM, VENTS, WORKBENCH, ZONE_NAMES, heightAt, polyDist, setGrassDisc, zoneAt, type GateId } from './world';
import './ranch.css';

const EYE = 1.6;
const FOV = 72;

const FIRST: Record<DownyKind, [string, string]> = {
  clover: ['First clover downy', 'Loves clover heads.'],
  ember: ['First ember downy', 'Loves sweetroot.'],
  brook: ['First brook downy', 'Loves dewberries.'],
  thistle: ['A thistle downy', 'Eats anything. Hops any fence but a high one.'],
};

/** Journal lines that are news, not tasks: shown with no box to tick. */
const NEWS = new Set(['Order filled. New ones come at dawn.']);
const CHIRP_PITCH: Record<DownyKind, number> = { clover: 1, ember: 0.88, brook: 1.12, thistle: 1.3 };
/** The motes about the board's rare downy, by kind. */
const RARE_GLINT: Record<DownyKind, number> = { clover: 0xffe08a, ember: 0xffb6c8, brook: 0xe8f0ff, thistle: 0xf0e0ff };

/** What a window holds, in words: the fluff window holding more than one kind is just "fluff". */
function slotName(q: Slot): string {
  if (!q.t) return '';
  if (q.mix && isTuft(q.t) && q.mix.some((m) => m !== q.t)) return 'fluff';
  return thingName(q.t, q.n);
}

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
  /** For checks (round 10): how the tell shows on a downy's body; a check may set round 9's to compare. */
  readonly tellBody = TELL_BODY;
  readonly fx = new Fx();
  readonly vm: Viewmodel;
  private tags = new TagMenu();
  /** Which tag is chosen: nothing when tags come down, unless a lesson is teaching one. */
  private choice = new TagChoice();
  readonly hud = new Hud();
  readonly tutor = new Tutor();
  /** Seconds a page of something just done ("Earned 100 coins") stays up, with no new lesson over it (Pages.SECS). */
  static readonly PAGE_SECS = Pages.SECS;
  private marker: Marker;
  private say: Say = { dev: 'mouse', locked: false, lockAvailable: false };
  private stuckT = 0;
  private lastSale = 0;
  /** J hides the calm goal line until the next lesson or goal. */
  private goalHidden = false;
  private goalShown = '';
  private goalKey = '';
  /** Counts down to the darkest moment of the sleep fade, when you are turned to face the yard. */
  private wakeT = 0;
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
  private penN = [0, 0, 0, 0, 0, 0];
  private spotObjs = [0, 1, 2, 3, 4].map(() => ({ x: 0, y: 0 }));
  private spots: ({ x: number; y: number } | null)[] = [null, null, null, null, null];
  /** The windows' tap targets: where the windows sit with the bellows at rest, so they hold still while you turn. */
  private restVecs = [0, 1, 2, 3, 4].map(() => new Vector3());
  private restOuts: (Vector3 | null)[] = [null, null, null, null, null];
  private restObjs = [0, 1, 2, 3, 4].map(() => ({ x: 0, y: 0 }));
  private restSpots: ({ x: number; y: number } | null)[] = [null, null, null, null, null];
  private box = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private tagBox = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private icons: (SlotIcon | null)[] = [null, null, null, null, null];
  private w = 0;
  private h = 0;
  private dpr = 1;
  private resizeObs: ResizeObserver;
  private prevMenuZ = 0;
  private quality: 'low' | 'high';
  private nanArmed = false;
  private crossTarget: 'target' | 'prickly' | 'sell' | 'pen' | 'feeder' | null = null;
  /** Seconds the journal goal's spot (a gate) has been pointed at: the edge chevron shows only at first. */
  private goalSpotT = 0;
  private rareT = 0;
  private orderKey = '';
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
    this.hud.onEmpty = (i) => this.emptySlot(i);
    this.hud.onSlotDrag = (id, x, y) => this.input.adoptDrag(id, x, y);
    this.hud.onCycle = () => this.cycleSlot();
    this.hud.snapCoins(this.sim.s.coins);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(ctx.root);
    this.resize();
    this.placeCamera(0);
    // Fonts arrive after the first paint; redraw the painted things once they do.
    this.props.paintGates();
    void document.fonts?.ready.then(() => {
      this.board.key = '';
      this.props.paintGates();
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
    this.pages.clear();
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
    this.vm.resize(w / h, this.fov, touch, h);
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

  /** For checks (round 10): time stands still for the frame (grass, sky, drifting fluff, the sim), so frames compare. */
  still = false;

  private tick(dt: number): void {
    if (this.still) dt = 0;
    this.t += dt;
    U.uTime.value = this.t;
    const f = this.input.frame();
    const s = this.sim.s;
    const touch = this.isTouch();
    this.input.showTouch(touch && !this.paused);
    this.hud.el.classList.toggle('rh-touch', touch);
    if (touch !== this.wasTouch) {
      this.wasTouch = touch;
      this.vm.resize(this.w / this.h, this.fov, touch, this.h);
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

    // Slots, once the lesson about them has come. Holding the switch key tips a window out.
    if (!this.menu && knows('slots')) {
      if (f.slotDirect >= 0 && f.slotDirect < s.slots.length) this.selectSlot(f.slotDirect);
      // Q, R, the wheel and LB or RB step to the next window that holds something, skipping empty ones.
      if (f.slotDelta) this.stepSlot(Math.sign(f.slotDelta));
      if (f.empty !== -1) this.emptySlot(f.empty === -2 ? s.sel : f.empty);
    }

    // A tap near one of the bellows' windows picks that slot (the nearest).
    if (f.tapped && !this.menu && knows('slots')) {
      let best = -1;
      let bd = 26;
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
      else if (knows('slots')) this.stepSlot(1);
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
    // Running (for the lesson that teaches it): sprinting on the ground at a run.
    if (c.sprint && p.grounded && Math.hypot(p.vx, p.vz) > 5.5) this.tutor.add(s, 'run', dt);
    // The board's rare downy, out where it was seen: a few motes of light about it, so it can be told apart.
    this.rareT -= dt;
    if (this.rareT <= 0) {
      this.rareT = 0.7;
      const rd = this.sim.rareWild();
      if (rd && Math.hypot(rd.x - p.x, rd.z - p.z) < 45) this.fx.burst(rd.x, rd.y + 0.45, rd.z, RARE_GLINT[rd.kind], 5, 0.7);
    }
    // Waking: at the darkest moment of the fade, turn to face the yard rather than the door.
    if (this.wakeT > 0) {
      this.wakeT -= dt;
      if (this.wakeT <= 0) this.faceYard();
    }
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
      this.vm.resize(this.w / this.h, this.fov, this.isTouch(), this.h);
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
    // A lesson's marker showing food over a downy stands in for that downy's own sign.
    const mk = this.tutor.mark;
    this.creatures.update(s, this.sim.phys, this.t, { x: a.mx, y: a.my, z: a.mz }, mk.on && mk.icon !== 'arrow' ? mk : null, this.ctx.settings().reducedMotion);
    this.pads.update(dt, s.pads);
    // Each pen post's count tag, once the pen limit has been taught (no allocation: a reused array).
    this.penN.fill(0);
    for (const d of s.downies) if (!d.gone && d.pen >= 0) this.penN[d.pen]++;
    this.pads.setCounts(s.pads, this.penN, this.sim.knows('crowd'), night);
    this.props.update(this.t, night);
    this.tags.update(dt, gust);
    // Hanging tags glow a little at night, like the gates' boards, so they read in the dark.
    this.tags.setNight(night);
    if (this.sim.drawing && dt > 0) this.fx.drawStream(dt, a.ex, a.ey, a.ez, a.dx, a.dy, a.dz, a.mx, a.my, a.mz, this.sim.range);
    this.fx.update(dt, this.t, this.eye, night);
    // Gates swing open once bought.
    for (const g of Object.keys(GATES) as GateId[]) {
      const o = this.props.gates[g];
      const want = s.gates[g] ? 1.65 : 0;
      const side = g === 'ridge' ? 1 : -1;
      o.left.rotation.y = damp(o.left.rotation.y, -want * side, 2.2, dt || 1);
      o.right.rotation.y = damp(o.right.rotation.y, want * side, 2.2, dt || 1);
      // Prices hang on the gates once their lesson has come; while the gate's own tag hangs in front of its board, the
      // board steps aside (round 9: the tag sat over the painted board, and "500" showed twice).
      o.tag.visible = !s.gates[g] && this.sim.knows('gates') && !(this.menu?.it.kind === 'gate' && this.menu.it.id === g);
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
    // Today's orders, chalked under the prices.
    const orders: BoardOrder[] = s.orderDay === s.day ? s.orders.map((o) => ({ text: this.boardText(o), pay: o.state === 'offer' ? `pays ${fmtCoins(o.live ? o.n * o.pay : o.pay)}` : `${o.got} of ${o.n}`, state: o.state })) : [];
    // While the board's offer tags hang, they carry the offers: the chalk leaves those lines bare (the seventh
    // playtest's third chalked line sat half hidden behind the tags' bar, "pay: 150"), and chalks them again after.
    const tagsDown = this.menu?.it.kind === 'board';
    const key = `${s.day}|${rows.map((r) => `${r.price}:${r.trend}`).join(',')}|${orders.map((o) => `${o.text}:${o.state}`).join(',')}|${tagsDown}`;
    if (key === this.board.key) return;
    this.board.key = key;
    paintBoard(this.board.ctx, 512, 384, s.day, rows.map((r) => ({ ...r, name: r.name[0].toUpperCase() + r.name.slice(1) })), orders, tagsDown);
    this.board.tex.needsUpdate = true;
  }

  /** What the board chalks for an order: "20 clover fluff by dusk", "3 brook downies by dusk", "gold clover downy, the old oak". */
  private boardText(o: Order): string {
    const name = KIND[o.kind].name.replace(' downy', '');
    // (Round 10: the first order runs to the next day's dusk, and the chalk says so as its tag does.)
    const due = o.from !== undefined ? 'after 9 pm' : (o.by ?? ORDER_BY) === ORDER_NOON ? 'by noon' : (o.until ?? this.sim.s.day) > this.sim.s.day ? 'by dusk tomorrow' : 'by dusk';
    if (o.rare) return `${RARE_NAME[o.kind]} downy, ${SIGHTINGS[o.rare.spot].name}`;
    return o.live ? `${o.n} ${name} downies ${due}` : `${o.n} ${name} fluff ${due}`;
  }

  /** For checks: the orders as the board chalks them. */
  boardOrders(): string[] {
    const s = this.sim.s;
    return s.orderDay === s.day ? s.orders.map((o) => `${this.boardText(o)}, ${o.state === 'offer' ? `pays ${fmtCoins(o.live ? o.n * o.pay : o.pay)}` : `${o.got} of ${o.n}`}${o.state === 'open' || o.state === 'offer' ? '' : `, ${o.state}`}`) : [];
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
        // Something aboard: "Nothing in the jar." no longer holds (the sixth playtest's stayed up over 19 fluff).
        this.hud.clearNote('Nothing in the jar.');
        this.cue('ranch.suck', undefined, undefined, undefined, big ? 0.9 : 0.7, big ? 0.75 : isFood(e.thing) ? 1 : 1.3);
        this.fx.gulp(a.mx, a.my, a.mz, thingColor(e.thing));
        this.vm.gulp();
        this.doneHint('draw');
        break;
      }
      case 'full': {
        this.cue('ranch.full');
        const room = this.sim.accept(e.thing) < 0;
        const none = room && s.slots.every((q) => q.t) && !s.slots.some((q) => q.t === e.thing);
        // Once windows are known, say how to make room: tip one out.
        const dev = this.device();
        const known = this.sim.knows('slots');
        this.hud.note(fullNote(dev === 'touch' ? 'touch' : dev === 'pad' ? 'pad' : 'mouse', none, known, isTuft(e.thing) ? 'fluff' : thingName(e.thing, 1)), known ? 3.2 : 2.2);
        break;
      }
      case 'empty':
        this.cue('ranch.puff', undefined, undefined, undefined, 0.5, 0.7);
        this.vm.puffKick(false);
        this.hud.note(`Tipped out ${e.n} ${e.mixed ? 'fluff' : thingName(e.thing, e.n)}.`);
        break;
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
        this.fx.scuff(e.x, e.y, e.z);
        break;
      case 'splash':
        this.cue('ranch.splash', e.x, e.y, e.z);
        this.fx.splash(e.x, e.y, e.z);
        break;
      case 'goal':
        this.cue('ranch.goal');
        this.showGoals(e.id);
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
      case 'stock':
        // A new kind's first pen comes with a sack of its food (the eighth playtest's embers starved the first night).
        this.cue('ranch.build', PADS[e.pad].x, heightAt(PADS[e.pad].x, PADS[e.pad].z), PADS[e.pad].z, 0.5, 1.4);
        // (Round 9: a pen without a feeder gets one with the sack in it, out of a pull at the fluff by the gate.)
        if (e.gave) this.pads.sync(s.pads, e.pad);
        this.hud.note(e.gave ? `A feeder of ${e.n} ${thingName(e.food, e.n)}, to start them.` : e.feeder ? `${e.n} ${thingName(e.food, e.n)} in the feeder, to start them.` : `${e.n} ${thingName(e.food, e.n)} in the pen, to start them.`, 3.6);
        break;
      case 'crop': {
        const at = PADS[e.pad];
        this.cue('ranch.shed', at.x, heightAt(at.x, at.z), at.z, 0.5, 0.8);
        break;
      }
      case 'store':
        this.cue('ranch.suck', e.x, e.y, e.z, 0.6, 0.7);
        break;
      case 'stray':
        // One of yours hopped out of its pen: a squeak where it landed (the journal says so and points at it).
        this.cue('ranch.squeak', e.x, e.y, e.z, 0.9, 0.9);
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
        this.wakeT = 0.45;
        this.save();
        break;
      case 'zone':
        this.hud.showZone(ZONE_NAMES[e.zone]);
        break;
      case 'heard':
        // The rare one heard you coming, unlured, and bolted.
        this.hud.note('It heard you. Lure it from further off.', 2.6);
        break;
      case 'hungrynight':
        // Dusk, and a pen with downies has nothing for the night: say so while there is light to fill it.
        {
          const why = e.feeder ? 'A feeder is empty. Fill it before night.' : 'A pen has no food for the night.';
          this.hud.note(why, 4);
          this.queuePage('Dusk', [{ text: why, done: false, fresh: false, plain: true }]);
        }
        this.cue('ranch.deny', undefined, undefined, undefined, 0.5);
        break;
      case 'unlured':
        // Its fed window ran out (the ring over it empties first): say so, so the next step is plain.
        if (e.near) this.hud.note('It finished eating. Lure it again.', 2.8);
        break;
      case 'escape':
        // It broke free: say so plainly (a brook into the pond, the rest off and away; left slack after a pull back, what to do).
        this.hud.note(e.dove ? 'It slipped into the water.' : e.slack ? 'It got away. Pull again once it stops.' : 'It got away.', e.slack ? 2.4 : 1.8);
        break;
      case 'tell':
        // It puffs up to pull back: a soft intake of breath (it swells, and the ring goes pale gold).
        this.cue('ranch.suck', e.x, e.y, e.z, 0.35, CHIRP_PITCH[e.kind] * 1.4);
        break;
      case 'pullback':
        // It pulls back: a low squeak and, on a phone, a buzz (the ring goes warm too).
        this.cue('ranch.squeak', e.x, e.y, e.z, 1, CHIRP_PITCH[e.kind] * 0.7);
        if (this.isTouch()) buzz(18);
        break;
      case 'eased':
        // You let go through its pull: a soft chirp, it is still yours to bring in.
        if (e.eased) this.cue('ranch.chirp', e.x, e.y, e.z, 0.45, CHIRP_PITCH[e.kind] * 1.15);
        break;
      case 'slip':
        // Held on through its pull: it slipped free, a few metres off. Not lost.
        this.cue('ranch.boing', e.x, e.y, e.z, 0.8, CHIRP_PITCH[e.kind]);
        this.hud.note('It slipped free. Let go when it pulls.', 2.4);
        break;
      case 'order': {
        if (e.state === 'filled') {
          const y = heightAt(e.x, e.z) + 1.2;
          this.cue('ranch.goal');
          this.cue('ranch.coins', e.x, y, e.z, 1);
          this.fx.coinPop(e.x, y, e.z, 6);
          this.lastSale = e.bonus;
          // While a lesson is up, the page belongs to it: this page waits for it to tick and go.
          const word = e.rare ? `${RARE_NAME[e.kind].replace(/^./, (c) => c.toUpperCase())} downy` : `${KIND[e.kind].name.replace(' downy', '').replace(/^./, (c) => c.toUpperCase())} ${e.live ? 'downies' : 'fluff'}`;
          // The rare one stays: say what it does for its pen, as news, not a task.
          this.queuePage(`Earned ${fmtCoins(e.bonus)} coins`, [{ text: `${word}, ${e.n} of ${e.n}.`, done: true, fresh: true }, ...(e.rare ? [{ text: 'It stays. Its pen sheds more.', done: false, fresh: false, plain: true }] : [])]);
        } else if (e.state === 'missed') this.hud.note('Dusk. The order went unfilled.', 3);
        break;
      }
      case 'deliver':
        // A downy for today's live order: into the crate, with coins.
        this.cue('ranch.sell', e.x, e.y, e.z);
        this.cue('ranch.coins', e.x, e.y, e.z, 1);
        this.cue('ranch.chirp', e.x, e.y, e.z, 0.8, CHIRP_PITCH[e.kind]);
        this.fx.burst(e.x, e.y + 0.3, e.z, KIND[e.kind].body, 18, 1.4);
        this.fx.coinPop(e.x, e.y, e.z, 5);
        this.lastSale = e.coins;
        break;
      case 'feeder':
        // Into the hopper: how much it holds now; bounced off: why.
        if (e.why) {
          this.cue('ranch.deny');
          this.hud.note(e.why);
        } else this.hud.note(`Feeder: ${e.n}`, 1.2);
        break;
      case 'air':
        break;
    }
  }

  /** A goal just done, struck, for a moment; then the journal goes back to the next one (see lessonTick). */
  private showGoals(done: GoalId): void {
    const g = GOALS.find((q) => q.id === done)!;
    this.queuePage(`Earned ${g.reward} coins`, [{ text: g.text, done: true, fresh: true }]);
  }

  /**
   * A page of something just done ("Earned 100 coins" over the struck goal or
   * the filled order), queued for the journal (see pageTick).
   */
  private queuePage(title: string, lines: PageLine[]): void {
    this.pages.add({ title, lines });
  }

  /**
   * Round 9: a page of something done goes up between one lesson and the next (the next waits for it), or over a line
   * that has stayed up 6 s (see Pages), and has the journal for its few seconds; the lesson's line comes back after.
   * It used to wait for the lesson line to go and was dropped after 6 s (the ninth playtest's first order, gold
   * clover and trip all filled under lines that stayed up, with only the coins to say so).
   */
  private pageTick(dt: number, v: { line: string; done: boolean }): void {
    const page = this.pages.update(dt, v, this.tutor.lineAge, this.tutor.cutting, this.paused);
    if (!page) return;
    this.goalHidden = false;
    this.hud.el.querySelector('.rh-page')?.classList.remove('note');
    this.hud.showPage(page.title, page.lines, Pages.SECS);
    // It stays its few seconds: no new lesson takes the page meanwhile (the first order's went to dusk at once).
    this.tutor.hold = Pages.SECS;
  }

  private readonly pages = new Pages();

  /** The calm page with no lesson up: the day's orders (news with no box), then the next goal. */
  private goalRows(goal: string, orders: string[]): { text: string; done: boolean; plain?: boolean }[] {
    return [...orders.map((text) => ({ text, done: false, plain: NEWS.has(text) })), ...(goal ? [{ text: goal, done: false }] : [])];
  }

  /** For checks (round 10): the next journal goal as the page words it (some count: "Sell 20 fluff, 7 so far."). */
  journalGoal(): string {
    return this.goalLine();
  }

  /** The next journal goal, shown calmly whenever no lesson is up, so the page is never blank while there is something to do (a gate's goal counts the coins towards it). */
  private goalLine(): string {
    const g = this.sim.openGoals(1)[0];
    return g ? goalText(g.id, this.sim.s) : '';
  }

  /** Turn to face the yard (the crate and the pens), level, as you wake. */
  private faceYard(): void {
    const p = this.sim.s.player;
    const tx = (EXCHANGE.x + PADS[1].x) / 2;
    const tz = (EXCHANGE.z + PADS[1].z) / 2;
    p.yaw = Math.atan2(-(tx - p.x), -(tz - p.z));
    p.pitch = -0.06;
    this.turn = null;
  }

  // ------------------------------------------------------------ lessons

  private lessonTick(dt: number): void {
    const s = this.sim.s;
    const say = this.say;
    const dev = this.device();
    say.dev = dev === 'touch' ? 'touch' : dev === 'pad' ? 'pad' : 'mouse';
    say.locked = this.input.locked;
    say.lockAvailable = this.input.lockAvailable;
    // (A page of something done waiting: the next lesson waits for it, so it goes between the two.)
    this.tutor.pageWaiting = this.pages.waiting > 0 && !this.paused;
    const v = this.tutor.update(s, dt, say, this.floor);
    for (const w of this.tutor.fresh) {
      // Coins arrive with the first sale, counting up from before it.
      if (w === 'coins') this.hud.snapCoins(s.coins - this.lastSale);
    }
    if (v.done && this.prevLessonDone !== v.id) {
      this.prevLessonDone = v.id;
      this.cue('ranch.slot', undefined, undefined, undefined, 0.7, 1.3);
    }
    // A page of something just done has the journal for its few seconds (over a lesson line too), then hands back.
    this.pageTick(dt, v);
    if (this.pages.showing) {
      // The lesson's arrow stays in the world meanwhile; the page has the journal. What takes the page after it is kept
      // fresh, so it hands straight over (it went down for a frame on a stale goal, and once showed the goal just done).
      this.hud.setGoal(v.line || this.goalHidden ? [] : this.goalRows(this.goalLine(), orderLines(s, say)));
      return;
    }
    // An open order's tally stays on the page under any lesson line (the sixth playtest's first order lost the page
    // to the garden and dusk lessons within a second of being taken). The stray line goes under an order or hunt in
    // hand rather than over it, and the arrow stays on the order's spot (the playtest's hid the hunt's step).
    const tally = v.line ? orderTally(s, say, v.line) : [];
    const lead = v.id === 'stray' && !v.done && tally.length > 0;
    this.hud.setLesson(v.line, v.done, lead ? [] : tally, lead ? tally : []);
    if (lead) {
      if (orderSpot(s, this.tutor.mark, this.floor)) this.tutor.mark.on = true;
      else if (zoneAt(s.player.x, s.player.z) !== 'ranch') this.tutor.mark.on = false;
    }
    // No lesson up: the day's orders with their tally, then the next journal goal, calmly, on the same page
    // (J hides them until something changes).
    const goal = v.line ? '' : this.goalLine();
    const orders = v.line ? [] : orderLines(s, say);
    const key = [...orders, goal].join('|');
    if (key !== this.goalShown) {
      // A new goal, or the rare order's next step: its edge chevron shows again for a few seconds.
      const ok = (orders[0] ?? '').split(' ').slice(0, 1).join(' ');
      if (goal.split(',')[0] !== this.goalKey || ok !== this.orderKey) this.goalSpotT = 0;
      this.orderKey = ok;
      this.goalKey = goal.split(',')[0];
      // A tally ticking up does not bring a hidden page back; a new goal or order does.
      if (key.replace(/\d+/g, '#') !== this.goalShown.replace(/\d+/g, '#')) this.goalHidden = false;
      this.goalShown = key;
    }
    // The day's orders all filled, or offers waiting at the board: news, a line with no box (round 8: "Order filled.
    // New ones come at dawn." got a box and a strike); an order's tally keeps its box.
    this.hud.setGoal(this.goalHidden ? [] : this.goalRows(goal, orders));
    // The rare order (where it was seen, the downy, then the crate), or a goal with a place (a gate): an arrow over it, as a lesson would.
    const g = !v.line && !this.goalHidden && goal ? this.sim.openGoals(1)[0] : undefined;
    // (Round 9: a goal on the page that can be done brings in what it needs, the gate's price board or the Feeder tag,
    // whatever the hour: the ninth playtest's "Open the gate to Ember Ridge." sent it to a gate with no Gate button.)
    if (g) this.tutor.goalShown(s, g.id);
    if (!v.line && !this.goalHidden && !this.tutor.mark.on && orderSpot(s, this.tutor.mark, this.floor)) {
      this.tutor.mark.on = true;
      this.goalSpotT += dt;
    } else if (g && !this.tutor.mark.on && goalSpot(g.id, s, this.tutor.mark, this.floor)) {
      this.tutor.mark.on = true;
      this.goalSpotT += dt;
    } else if (!g) this.goalSpotT = 0;
  }

  /** Is the arrow on screen a journal goal's (not a lesson's)? */
  private get goalMarked(): boolean {
    return this.tutor.mark.on && !this.tutor.line && this.tutor.current === '';
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

  /**
   * Step to the next window in a direction that holds something, skipping
   * empty ones (the third playtest's Q stepped through empty windows, and a
   * Blow mid-step sent clover heads at the crate). Nothing aboard: no change.
   */
  stepSlot(dir: number): void {
    this.selectSlot(this.sim.stepWindow(dir));
  }

  /** Tip a whole window out on the ground in front of you. */
  emptySlot(i: number): void {
    if (this.menu || !this.sim.knows('slots')) return;
    if (this.sim.empty(i, this.aim) > 0) {
      this.tutor.add(this.sim.s, 'empty');
      this.handleEvents();
    }
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

  private railFor(it: Interactable, n: number): Rail {
    const p = this.sim.phys;
    if (it.kind === 'pad' || it.kind === 'silo') {
      const sp = padSpots(it.id as number);
      const y = heightAt(sp.post.x, sp.post.z) + 2.13;
      return sp.ls > 0 ? { x: sp.post.x + 0.22, y, z: sp.post.z + 0.09, ax: 1, az: 0, ry: 0 } : { x: sp.post.x + 3.42, y, z: sp.post.z - 0.09, ax: -1, az: 0, ry: Math.PI };
    }
    if (it.kind === 'bench') {
      // The tags hang just in front of the bench and turn to face you, wherever along the lane you stand.
      const pl = this.sim.s.player;
      let dx = pl.x - WORKBENCH.x;
      let dz = pl.z - WORKBENCH.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const ry = Math.atan2(dx, dz);
      const ax = Math.cos(ry);
      const az = -Math.sin(ry);
      const half = ((n - 1) * 0.37) / 2 + 0.4;
      const cx = WORKBENCH.x + dx * 0.7;
      const cz = WORKBENCH.z + dz * 0.7;
      return { x: cx - ax * half, y: this.props.tagRails.bench.y - 0.05, z: cz - az * half, ax, az, ry };
    }
    if (it.kind === 'board') return { x: BOARD.x, y: p.floor(BOARD.x, BOARD.z) + 2.3, z: BOARD.z - 0.4, ax: 0, az: 0, ry: Math.PI };
    if (it.kind === 'door') {
      const y = p.floor((PORCH.x0 + PORCH.x1) / 2, (PORCH.z0 + PORCH.z1) / 2) + 2.35;
      return { x: DOOR.x - 0.3, y, z: PORCH.z0 + 0.25, ax: 0, az: 0, ry: Math.PI };
    }
    const g = GATES[it.id as GateId];
    const side = it.id === 'ridge' ? 1 : -1;
    return { x: g.x + side * 0.55, y: heightAt(g.x, g.z) + 2.25, z: g.z + 0.3, ax: 0, az: 0, ry: (side * Math.PI) / 2 };
  }

  private pickDev(): PickDev {
    const d = this.device();
    return d === 'touch' ? 'touch' : d === 'pad' ? 'pad' : 'mouse';
  }

  /**
   * Tags hang as a near grid: a bar in front of your eyes, between you and
   * where the tags would hang on the post, the bench, the porch or the gate,
   * turned to face you; two columns on a tall phone, three on a wide screen.
   * However close you stand, they look as big as they would at their reading
   * distance (1.8 m on a phone, 1.7 m on a wide screen, so notes read at 12 px
   * or more; desktop notes were about 10 px on the posts' rails), and never
   * wider than the screen: hung nearer, they are made smaller to match (the
   * third playtest's ran off the phone's edges up close to a post at an angle).
   */
  private nearRail(it: Interactable, n: number, cols: number): { rail: Rail; scale: number } {
    const base = this.railFor(it, n);
    const along = base.ax === 0 && base.az === 0 ? 0 : 0.4 + ((n - 1) * 0.56 * 0.66) / 2;
    const cx = base.x + base.ax * along;
    const cz = base.z + base.az * along;
    const e = this.eye;
    let dx = cx - e.x;
    let dz = cz - e.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    let D = clamp(l - 0.3, 1.0, 1.8);
    const ry = Math.atan2(-dx, -dz);
    // The distance they should look to be at: the reading distance, or further if the grid would not fit the width.
    const tanW = Math.tan(((this.camera.fov / 2) * Math.PI) / 180) * (this.w / this.h);
    const half = (Math.min(cols, n) * (0.56 + 0.05) - 0.05) / 2;
    const look = Math.max(this.h > this.w * 1.15 ? 1.8 : 1.7, half / (0.94 * tanW));
    // Never behind their own post: hung nearer than the post's pole (and its brace) wherever it stands in front
    // of the grid (the fifth playtest's tags hung 1.83 m off at every distance, so walking up the lane put the
    // post over a column, twice over the very tag the lesson had chosen).
    if (!this.oldRail && (it.kind === 'pad' || it.kind === 'silo')) {
      const sp = padSpots(it.id as number).post;
      for (const px of [sp.x, sp.x + 0.3, sp.x + 0.6]) {
        const ox = px - e.x;
        const oz = sp.z - e.z;
        const depth = ox * dx + oz * dz;
        const side = Math.abs(ox * dz - oz * dx);
        if (depth > 0.2 && side < depth * (half / look) + 0.25) D = Math.min(D, Math.max(0.45, depth - 0.32));
      }
    }
    // The price board's offers hang low, under its chalked prices (they hung over them).
    const drop = it.kind === 'board' && !this.oldRail ? 0.5 : 0;
    return { rail: { x: e.x + dx * D, y: e.y + (0.24 - drop) * (D / look), z: e.z + dz * D, ax: Math.cos(ry), az: -Math.sin(ry), ry }, scale: D / look };
  }
  /** For the tags check's control: hang the grid the old way (at its reading distance, behind the post if need be). */
  oldRail = false;

  /**
   * For checks: each hanging tag on screen (CSS px corners) with the share of
   * nine points across its face that the open post's pole, brace or arm hides
   * from the eye (0 for a menu that is not a post's).
   */
  tagCover(): { x0: number; y0: number; x1: number; y1: number; covered: number; id: string }[] {
    const out: { x0: number; y0: number; x1: number; y1: number; covered: number; id: string }[] = [];
    if (!this.menu) return out;
    const it = this.menu.it;
    const post = it.kind === 'pad' || it.kind === 'silo' ? padSpots(it.id as number).post : null;
    const y0 = post ? heightAt(post.x, post.z) : 0;
    // The post as boxes (see props.ts): the pole, the brace, the arm and its end.
    const boxes = post
      ? [
          [post.x - 0.1, y0, post.z - 0.1, post.x + 0.1, y0 + 2.25, post.z + 0.1],
          [post.x, y0 + 1.55, post.z - 0.06, post.x + 0.62, y0 + 2.25, post.z + 0.06],
          [post.x - 0.1, y0 + 2.13, post.z - 0.07, post.x + 3.5, y0 + 2.27, post.z + 0.07],
          [post.x + 3.44, y0 + 2.07, post.z - 0.06, post.x + 3.56, y0 + 2.33, post.z + 0.06],
        ]
      : [];
    const e = this.eye;
    const hits = (x: number, y: number, z: number) =>
      boxes.some(([ax, ay, az, bx, by, bz]) => {
        // The segment from the eye to the point against the box (slabs).
        let t0 = 0;
        let t1 = 0.999;
        const o = [e.x, e.y, e.z];
        const d = [x - e.x, y - e.y, z - e.z];
        const lo = [ax, ay, az];
        const hi = [bx, by, bz];
        for (let k = 0; k < 3; k++) {
          if (Math.abs(d[k]) < 1e-9) {
            if (o[k] < lo[k] || o[k] > hi[k]) return false;
            continue;
          }
          let ta = (lo[k] - o[k]) / d[k];
          let tb = (hi[k] - o[k]) / d[k];
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta);
          t1 = Math.min(t1, tb);
          if (t0 > t1) return false;
        }
        return true;
      });
    const tags = (this.tags as unknown as { tags: { face: Mesh; pivot: Object3D; opt: { id: string } | null; gone: number }[] }).tags;
    for (const t of tags) {
      if (!t.opt || t.gone > 0 || !t.pivot.visible) continue;
      t.face.updateWorldMatrix(true, false);
      const m = t.face.matrixWorld.elements;
      const pt = (u: number, v: number) => [m[0] * u + m[4] * v + m[12], m[1] * u + m[5] * v + m[13], m[2] * u + m[6] * v + m[14]];
      let blocked = 0;
      let n = 0;
      for (const u of [-0.24, 0, 0.24]) for (const v of [-0.11, 0, 0.11]) {
        const [x, y, z] = pt(u, v);
        n++;
        if (hits(x, y, z)) blocked++;
      }
      const corners = [pt(-0.28, -0.14), pt(0.28, -0.14), pt(0.28, 0.14), pt(-0.28, 0.14)].map(([x, y, z]) => this.project(x, y, z)).filter((q): q is { x: number; y: number } => !!q);
      if (!corners.length) continue;
      out.push({ x0: Math.min(...corners.map((q) => q.x)), y0: Math.min(...corners.map((q) => q.y)), x1: Math.max(...corners.map((q) => q.x)), y1: Math.max(...corners.map((q) => q.y)), covered: blocked / n, id: t.opt.id });
    }
    return out;
  }

  private openMenu(it: Interactable): void {
    const opts = this.sim.menu(it);
    this.doneHint('use');
    if (!opts.length) return;
    // A pen post's tags read (its count tag hangs there): the pen limit's line has been seen to.
    if (it.kind === 'pad' && this.sim.s.pads[it.id as number].kind === 'pen') this.tutor.add(this.sim.s, 'crowd:post');
    // The tags hang as a near grid in front of you, all on screen and large enough to read.
    const cols = this.h > this.w * 1.15 ? 2 : 3;
    const { rail, scale } = this.nearRail(it, opts.length, cols);
    this.tags.show(rail, opts, true, cols, scale);
    // Nothing is chosen as the tags come down, unless the lesson on screen teaches one of them.
    this.choice.open(this.tags.opts, this.pickDev(), this.tutor.tag);
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
    this.tags.setHot(this.choice.hot);
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
    // Choose by looking (the crosshair, once you have looked about yourself; never on touch), by tapping
    // or clicking a tag (on touch the first tap chooses and a second takes it), or by number.
    const ch = this.choice;
    ch.setDev(this.pickDev());
    const a = this.aim;
    ch.aim(this.tags.pick(a.ex, a.ey, a.ez, a.dx, a.dy, a.dz), f.looked ? Math.abs(f.lookX) + Math.abs(f.lookY) : 0);
    if (f.tapped) {
      const ray = this.screenRay(f.tapX, f.tapY);
      const hit = this.tags.pick(this.eye.x, this.eye.y, this.eye.z, ray.x, ray.y, ray.z);
      if (hit >= 0) {
        const take = ch.tap(hit);
        this.tags.setHot(ch.hot);
        if (take) this.confirm(hit);
        else this.cue('ranch.slot', undefined, undefined, undefined, 0.5, 1.15);
        return;
      }
      // A tap on the view away from the tags puts them away (touch).
      if (this.isTouch()) {
        this.closeMenu();
        return;
      }
    }
    if (f.slotDirect >= 0 && f.slotDirect < this.tags.opts.length) {
      ch.hot = f.slotDirect;
      this.tags.setHot(ch.hot);
      this.confirm(ch.hot);
      return;
    }
    this.tags.setHot(ch.hot);
    if (f.interact || f.confirm || (f.puffPressed && this.input.locked)) {
      const what = ch.press(this.tags.opts);
      if (what === 'take') this.confirm(ch.hot);
      else if (what === 'close') this.closeMenu();
      else this.tags.nudge();
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
    this.hud.showPause(when, s.goals, this.tutor.line || (this.tutor.busy ? '' : this.goalLine()), this.tutor.notes(s), this.controlsLine());
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
      if (k('slots')) out.push('Tap a window to switch what you blow, hold one to empty it.');
      if (k('jump')) out.push('Jump hops.');
      if (k('pads')) out.push('The hand uses what is in front of you.');
    } else if (dev === 'pad') {
      out.push('Left stick walks, right stick looks.');
      if (k('draw')) out.push(k('puff') ? 'LT pulls, RT blows.' : 'LT pulls.');
      if (k('slots')) out.push('LB and RB switch kinds; hold one to empty the chosen window.');
      out.push('A jumps.');
      if (k('pads')) out.push('X uses what is in front of you.');
    } else {
      out.push('WASD walks, the mouse looks, Shift runs.');
      if (k('draw')) out.push(k('puff') ? 'Hold right click to pull, click to blow.' : 'Hold right click to pull.');
      if (k('slots')) out.push('Q or the wheel switch kinds; hold Q to empty the chosen window.');
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
    // While tags hang: on touch no crosshair at all (a tap chooses); with a mouse or a pad a pin-prick ring
    // that never covers a tag's words (the 14 px box read "Sleep till▢norning").
    if (this.menu) hud.setCross(touch ? 'none' : 'tag');
    else hud.setCross(this.crossTarget ?? 'idle');
    const slot = s.slots[s.sel];
    // While tags hang, the count by the crosshair steps aside (it lay over a tag's words).
    const counted = slot.t && !this.menu;
    hud.setCount(counted ? slot.n : 0, counted ? slotName(slot) : '', slotCap(s, slot));
    // (Round 8: off the crate's plate whatever is chosen, not only with the sell mark up: "S1ll fluff" with clover heads chosen.)
    if (counted) this.countOffSign();
    else hud.keepCountOff(0, 0, 0, 0);
    hud.setCoins(s.coins, dt);
    hud.setHour(s.hour);
    // Use prompt: the key glyph shows until you have used something once.
    const keyGlyph = this.sim.s.hints.includes('use') ? null : touch ? null : this.device() === 'pad' ? 'X' : 'E';
    if (this.menu) {
      const o = this.choice.hot >= 0 ? this.tags.opts[this.choice.hot] : null;
      const verb = this.choice.label(this.tags.opts);
      hud.setPrompt(verb, o && !touch ? (this.device() === 'pad' ? 'X' : 'E') : null);
      this.input.setAct(verb);
    } else if (near) {
      hud.setPrompt(near.label, keyGlyph);
      this.input.setAct(near.kind === 'door' ? 'Door' : near.kind === 'bench' ? 'Bench' : near.kind === 'gate' ? 'Gate' : near.kind === 'chute' ? 'Box' : near.kind === 'board' ? 'Board' : 'Post');
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
    // The tap targets hold still where the windows sit at rest (round 8: turning slid them under the resting stick).
    for (let i = 0; i < 5; i++) this.restOuts[i] = i < s.slots.length ? this.restVecs[i] : null;
    this.vm.windowsAtRest(this.restOuts);
    for (let i = 0; i < 5; i++) {
      const v = this.restOuts[i];
      if (v) {
        this.restObjs[i].x = v.x * this.w;
        this.restObjs[i].y = v.y * this.h;
        this.restSpots[i] = this.restObjs[i];
      } else this.restSpots[i] = null;
    }
    const bb = this.vm.bodyBox(this.box, true);
    bb.x0 *= this.w;
    bb.x1 *= this.w;
    bb.y0 *= this.h;
    bb.y1 *= this.h;
    hud.placeSlots(this.restSpots, showSlots && !this.paused, bb, this.paused || this.menu ? -1 : this.tutor.mark.slot, this.spots);
    // The chosen window's ring and what each window holds, wherever the windows are on screen.
    for (let i = 0; i < 5; i++) {
      const t = s.slots[i]?.t ?? null;
      this.icons[i] = !t ? null : isDowny(t) ? 'downy' : t === 'cloverhead' ? 'clover' : t === 'sweetroot' ? 'root' : t === 'dewberry' ? 'berry' : 'fluff';
    }
    hud.markSlots(this.spots, knows('slots') && this.vm.windowsShown && this.vm.raised > 0.9 && !this.paused, s.sel, this.vm.windowRadius() * this.w, this.icons);
    this.placeAct(touch);
    hud.tuckPage(!!this.menu && this.menu.it.kind === 'board');
    // J puts the goal line away (or back), unless a lesson has the page.
    if (f.journal && !hud.lessonUp) this.goalHidden = !this.goalHidden;
    // A wild downy digging in: the crosshair fills as it tires, and for a brook (or a thistle) an outer ring shows the time left.
    // It pulls back now and then: the ring goes warm (and stays up while you let go through it), shaking if you hold on.
    let tug = 0;
    let left = -1;
    let back = false;
    let strain = 0;
    let tell = false;
    let feint = false;
    for (const d of s.downies) {
      if (d.gone || !(d.held || (!d.tame && !d.keep && (d.back > 0 || d.tell > 0 || d.feint > 0 || d.easeT > 0 || d.slackT >= 0)))) continue;
      const k = d.tug / Math.max(0.01, this.sim.tugNeed(d));
      if (k >= tug) {
        tug = k;
        left = this.sim.tugLeft(d);
        back = d.back > 0;
        tell = d.tell > 0;
        feint = d.feint > 0;
        strain = back && d.held ? d.backHeld / this.sim.backGrace(d) : 0;
      }
    }
    hud.setTug(tug, left, back, strain, tell, feint);
    // The rare one's fed window: a ring over it, emptying as its calm runs out, while it is lured and in sight.
    const rare = this.sim.rareWild();
    const fed = rare ? rareFed(rare) : -1;
    // Beside it at its own height (round 8: it sat over it, stacked with the arrow, about 15 px across).
    const fp = fed >= 0 && rare && Math.hypot(rare.x - s.player.x, rare.z - s.player.z) < 40 && !this.menu ? this.project(rare.x, rare.y + 0.3, rare.z) : null;
    const side = fp && rare ? this.project(rare.x + Math.cos(s.player.yaw) * 0.32, rare.y + 0.3, rare.z - Math.sin(s.player.yaw) * 0.32) : null;
    hud.setFed((fp?.x ?? 0) + (side && fp ? Math.max(30, side.x - fp.x + 22) : 0), fp?.y ?? 0, fp ? fed : -1);
    hud.update(dt);
  }

  /**
   * While tags hang, the Use button moves off them: just under the tags if
   * there is room above the bellows and buttons, else just over them, else to
   * the side. Otherwise it sits in its usual place.
   */
  private placeAct(touch: boolean): void {
    // With a mouse or a pad, the use prompt moves just under the tags (or over them) so it never covers their words.
    const deskBox = !touch && this.menu ? this.tags.screenBox(this.camera, this.w, this.h, this.tagBox) : null;
    this.hud.placePrompt(!deskBox ? null : deskBox.y1 + 34 <= this.h - 40 ? deskBox.y1 + 12 : Math.max(70, deskBox.y0 - 34));
    const box = touch && this.menu ? this.tags.screenBox(this.camera, this.w, this.h, this.tagBox) : null;
    // At home by the thumb buttons, above Jump, unless a tag hangs over that spot (with its word under it, and
    // room for a phone's home bar): the seventh playtest's "Tap a tag" sat in the view's middle, on the board's chalk.
    const R = 32;
    const home = { x0: this.w - 22 - 2 * R - 10, x1: this.w - 12, y0: this.h - 214 - 2 * R - 44, y1: this.h - 214 + 26 };
    if (!box) {
      this.input.placeAct(null);
      this.input.tuckJump(false);
      return;
    }
    // Round 9: against each tag, not the box round them all (shot 110: a lone tag in the bottom row put the box over
    // the Use button's place, and it jumped to the top middle, far from the thumb). Covered, it moves to the nearest
    // free spot up or to the left of its place, by the thumb, before trying round the tags.
    const n = this.tags.screenRects(this.camera, this.w, this.h, this.tagRects);
    // (And never over the bellows, whose body takes taps.)
    const bb = this.vm.bodyBox(this.actBox, true);
    const bx0 = bb.x0 * this.w;
    const bx1 = bb.x1 * this.w;
    const by0 = bb.y0 * this.h;
    const by1 = bb.y1 * this.h;
    const hits = (x0: number, y0: number, x1: number, y1: number) => {
      for (let i = 0; i < n; i++) {
        const t = this.tagRects[i];
        if (!(t.x1 + 6 < x0 || t.x0 - 6 > x1 || t.y1 + 6 < y0 || t.y0 - 6 > y1)) return true;
      }
      return x1 > bx0 && x0 < bx1 && y1 > by0 && y0 < by1;
    };
    if (!hits(home.x0, home.y0, home.x1, home.y1)) {
      this.input.placeAct(null);
      this.input.tuckJump(false);
      return;
    }
    const hx = (home.x0 + home.x1) / 2;
    const hy = this.h - 214 - R;
    let bestX = -1;
    let bestY = -1;
    let bd = 1e9;
    for (const dy of [0, -64, -128, -192, -256, -320]) {
      for (const dx of [0, -76, -152]) {
        const x = hx + dx;
        const y = hy + dy;
        if (y - R < 130) continue;
        if (hits(x - R - 5, y - R - 5, x + R + 5, y + R + 22)) continue;
        const d = Math.hypot(dx, dy * 0.8);
        if (d < bd) {
          bd = d;
          bestX = x;
          bestY = y;
        }
      }
    }
    if (bestX >= 0) {
      this.input.placeAct(bestX, bestY);
      this.input.tuckJump(false);
      return;
    }
    // Round 10: six tags (three rows) cover its place and everything up and to the left of it, and it jumped to the
    // top middle (y about 230), out of the thumb's reach. Jump's place, just below, is free of them: it takes that
    // while the tags hang, and Jump steps aside (nothing there wants a jump).
    const j = this.input.jumpSpot();
    if (j && !hits(j.x - R - 5, j.y - R - 5, j.x + R + 5, j.y + R + 22)) {
      this.input.placeAct(j.x, j.y);
      this.input.tuckJump(true);
      return;
    }
    this.input.tuckJump(false);
    // The button with its word under it: 32 px up, 32 + 22 px down from its centre.
    const floor = this.h * 0.7;
    const top = 120;
    const x = clamp((box.x0 + box.x1) / 2, R + 12, this.w - R - 12);
    if (box.y1 + 12 + 2 * R + 22 <= floor) this.input.placeAct(x, box.y1 + 12 + R);
    else if (box.y0 - 12 - R - 22 - R >= top - R) this.input.placeAct(x, box.y0 - 12 - 22 - R);
    else this.input.placeAct(box.x1 + 12 + R <= this.w - 8 ? box.x1 + 12 + R : Math.max(R + 8, box.x0 - 12 - R), clamp((box.y0 + box.y1) / 2, top, floor - R - 22));
  }

  /** When the lesson's spot is out of view, a chevron on the edge of the screen points the way (a journal goal's, only for its first few seconds). */
  private edgePointer(): void {
    const m = this.tutor.mark;
    if (!m.on || this.menu || this.paused || (this.goalMarked && this.goalSpotT > 6)) {
      this.hud.setEdge(null);
      return;
    }
    const e = edgeSpot(this.camera, m.x, m.y, m.z, this.w, this.h, this.tmp, this.edgeOut);
    if (!e) this.hud.setEdge(null);
    else this.hud.setEdge(e.x, e.y, e.angle);
  }
  private edgeOut: EdgeSpot = { x: 0, y: 0, angle: 0 };
  private tagRects: { x0: number; y0: number; x1: number; y1: number }[] = [];
  private actBox = { x0: 0, y0: 0, x1: 0, y1: 0 };

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

  /** For checks: how a tag's words would be set on its 320 by 160 face. */
  tagLayout(title: string, price: number | null, note: string): TagLayout {
    const g = (this.tagProbe ??= document.createElement('canvas').getContext('2d')!);
    return layoutTag(g, 320, title, price, note);
  }
  private tagProbe: CanvasRenderingContext2D | undefined;

  /** Where a tag is on screen (CSS px), for tapping it in checks. */
  tagScreen(i: number): { x: number; y: number } | null {
    const t = (this.tags as unknown as { tags: { face: Mesh; opt: unknown }[] }).tags[i];
    if (!t || !t.opt) return null;
    t.face.updateWorldMatrix(true, false);
    const v = this.tmp.setFromMatrixPosition(t.face.matrixWorld).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.w, y: ((1 - v.y) / 2) * this.h };
  }

  /** A window's tap target on screen (where it sits with the bellows at rest), CSS px. */
  slotScreen(i: number): { x: number; y: number } | null {
    const v = this.restSpots[i];
    return v ? { x: v.x, y: v.y } : null;
  }

  /** A window where it is drawn now (it sways with the bellows as you turn), CSS px. */
  slotDrawn(i: number): { x: number; y: number } | null {
    const v = this.vm.windowScreen(i, this.tmp);
    return v ? { x: v.x * this.w, y: v.y * this.h } : null;
  }

  /** The count by the crosshair steps off the sell crate's "Sell fluff" plate (it read "Sell fl2ff"); the plate as props.ts sets it. */
  private countOffSign(): void {
    // The nearer crate's plate (round 8: there are two).
    const p = this.sim.s.player;
    let C = CRATES[0];
    for (const c of CRATES) if (Math.hypot(c.x - p.x, c.z - p.z) < Math.hypot(C.x - p.x, C.z - p.z)) C = c;
    if (Math.hypot(C.x - p.x, C.z - p.z) > 14) return this.hud.keepCountOff(0, 0, 0, 0);
    const y = heightAt(C.x, C.z) + 0.62;
    let t = Infinity;
    let b = -Infinity;
    let l = Infinity;
    let r = -Infinity;
    for (let k = 0; k < 4; k++) {
      const v = this.tmp.set(C.x + (k & 1 ? 0.5 : -0.5), y + (k & 2 ? 0.125 : -0.125), C.z - 0.775).project(this.camera);
      if (v.z > 1) return this.hud.keepCountOff(0, 0, 0, 0);
      const sx = (v.x * this.w) / 2;
      const sy = (-v.y * this.h) / 2;
      t = Math.min(t, sy);
      b = Math.max(b, sy);
      l = Math.min(l, sx);
      r = Math.max(r, sx);
    }
    this.hud.keepCountOff(t, b, l, r);
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
  seen(): { lesson: string; done: boolean; line: string; bellows: number; windows: boolean; marker: string | null; ring: boolean; gateTags: boolean; goalSpot: boolean } {
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
      goalSpot: this.goalMarked,
    };
  }

  /**
   * For checks: every lesson line for this device, each set on the journal page as it would show (a lesson's
   * page, at this screen's size), with how many lines it takes and how wide its last line is against its first.
   */
  lessonFit(): { line: string; lines: number; last: number }[] {
    const say = this.say;
    const page = document.createElement('div');
    page.className = 'rh-page lesson up';
    page.style.visibility = 'hidden';
    page.style.transform = 'none';
    const ul = document.createElement('ul');
    page.append(ul);
    this.hud.el.append(page);
    const out: { line: string; lines: number; last: number }[] = [];
    const seen = new Set<string>();
    for (const { line } of allLines()) {
      if (seen.has(line) || !this.forDevice(line, say.dev)) continue;
      seen.add(line);
      ul.innerHTML = `<li><svg class="box" viewBox="0 0 18 18"></svg><span>${line}</span></li>`;
      const span = ul.querySelector('span')!;
      const range = document.createRange();
      range.selectNodeContents(span);
      const rows = new Map<number, number>();
      for (const r of range.getClientRects()) rows.set(Math.round(r.top), (rows.get(Math.round(r.top)) ?? 0) + r.width);
      const widths = [...rows.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
      out.push({ line, lines: widths.length, last: widths.length > 1 ? widths[widths.length - 1] / widths[0] : 1 });
    }
    page.remove();
    return out;
  }

  /** Is a lesson line worded for this device (no key names on touch, no touch words on keys or a pad)? */
  private forDevice(line: string, dev: string): boolean {
    const touchy = /\b(Tap|tap|thumb|stick|Drag)\b/.test(line) || /\bPull\b|\bBlow\b/.test(line);
    const keys = /\b(WASD|Space|Shift|right click|Click|click|Press|wheel|Q\b|E\b|LT|RT|LB|RB|A to)\b/.test(line);
    return dev === 'touch' ? !keys : !touchy;
  }

  /** For checks: the tag chosen now (-1 for none) and what the act button says. */
  tagChoice(): { hot: number; label: string } {
    return { hot: this.choice.hot, label: this.menu ? this.choice.label(this.tags.opts) : '' };
  }

  thing(t: Thing): string {
    return thingName(t);
  }
}
