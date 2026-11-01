// Sunup's director: input to commands, one simulation step, events out to the
// 3D view, the audio and the HUD, the camera, and the save. The farm runs
// under one fixed set of rules (the homestead); the shell hosts it.

import type { CameraIntent, FrameView, Renderer, UiCue } from '../../contract';
import { resolve, workLeft } from '../../sim/actions';
import { facingTile, farmer, snapAim } from '../../sim/actors';
import { botCommands, newBot, type Bot } from '../../sim/bot';
import type { Command } from '../../sim/commands';
import { CROP_IDS } from '../../sim/crops';
import { step } from '../../sim/step';
import { daylightOf, hourOf, inMap, season, SEASON_NAMES, dayOfSeason } from '../../sim/world';
import { PROPS, propAt } from '../../sim/map';
import type { BuildKind, SimEvent, WorldState } from '../../sim/types';
import { Dialogs } from '../../ui/dialogs';
import { el } from '../../ui/dom';
import { Hud } from '../../ui/hud';
import { Input } from '../../game/input';
import { Tutor } from './lessons';
import type { GameContext } from '../../shell/types';

/** How tall the well and the notice board are drawn, in tiles, for taps on them. */
const PROP_HEIGHT: Record<string, number> = { well: 1.3, board: 1.6 };
/** A wide screen's close camera looks this many tiles south of the farmer. */
const CLOSE_LEAD = 1.4;

export class Director {
  state: WorldState;
  readonly stage = el('div', 'stage');
  readonly input: Input;
  readonly hud: Hud;
  readonly dialogs: Dialogs;
  private r3d!: Renderer;
  private cams: Record<'close' | 'wide', { zoom: number; panX: number; panY: number }> = {
    close: { zoom: 1, panX: 0, panY: 0 },
    wide: { zoom: 1, panX: 0, panY: 0 },
  };
  private soilOverlay = false;
  private daylight = 1;
  private hour = 6;
  private last = performance.now();
  private t = 0;
  private raf = 0;
  private running = false;
  private bot: Bot | null = null;
  private lastSave = 0;
  private walkAim: { x: number; y: number; t: number } | null = null;
  readonly tutor = new Tutor();
  frames = 0;
  events: SimEvent[] = [];

  constructor(state: WorldState, private ctx: GameContext) {
    this.state = state;
    const params = new URLSearchParams(location.search);
    this.input = new Input(this.stage, {
      rules: () => this.state.rules,
      pick: (px, py) => this.r3d?.pick(px, py) ?? null,
      pickTap: (px, py) => this.pickTap(px, py),
      picking: () => this.hud?.picking ?? false,
      canPaint: (x, y) => {
        const r = resolve(this.state, this.state.tool, x, y);
        return !!(r.verb && r.ok);
      },
      hasJob: (x, y) => this.state.jobs.some((j) => j.x === x && j.y === y),
      pan: (dx, dy) => this.pan(dx, dy),
      zoom: (f) => this.zoom(f),
      hotkey: (k, shift) => this.hotkey(k, shift),
      blocked: () => !this.running || this.dialogs.open,
    });
    const host = {
      state: () => this.state,
      send: (c: Command) => this.input.push(c),
      cue: (c: UiCue) => ctx.audio.ui(c),
    };
    this.hud = new Hud({
      ...host,
      openBoard: (tab) => {
        this.dialogs.board(tab as never);
        this.tutor.board(this.state);
      },
      offerParcel: (id) => this.dialogs.parcel(id),
      project: (x, y, h) => this.r3d?.project(x, y, h) ?? null,
      sleep: () => this.sleep(),
      toggleCamera: () => this.toggleCamera(),
      input: this.input,
    });
    this.dialogs = new Dialogs({
      ...host,
      onChange: () => undefined,
      keyboard: () => this.input.lastKind === 'key',
      pickBuild: (k: BuildKind) => {
        this.input.push({ type: 'buildKind', kind: k });
        this.input.push({ type: 'tool', tool: 'build' });
      },
    });
    ctx.root.append(this.stage, this.hud.root, this.dialogs.scrim, this.dialogs.root);
    if (params.has('autoplay')) this.bot = newBot();
    if (params.has('touch')) this.hud.touch.forced = true;
    window.addEventListener('resize', () => this.resize());
  }

  async start(): Promise<void> {
    const m = await import('../../render3d');
    this.r3d = await m.createRenderer3D();
    this.stage.append(this.r3d.canvas);
    this.resize();
    this.r3d.snap(this.view(0));
    this.resume();
  }

  pause(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input.setStick(0, 0);
    this.input.setActHeld(false);
  }

  resume(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.resize();
    this.raf = requestAnimationFrame(this.tick);
  }

  private resize(): void {
    if (!this.r3d) return;
    const w = this.stage.clientWidth || window.innerWidth;
    const h = this.stage.clientHeight || window.innerHeight;
    this.r3d.resize(w, h, Math.min(window.devicePixelRatio || 1, 2));
  }

  // ------------------------------------------------------------ camera

  /** Where the lesson pointer is aimed, so a wide screen's close camera can keep it clear of the rack and line. */
  private lessonPoint: { x: number; y: number } | null = null;

  private camera(): CameraIntent {
    const mode = this.state.rules.camera;
    const c = this.cams[mode];
    const f = farmer(this.state);
    let fx = f.x;
    let fy = f.y;
    // A wide screen's close view keeps the tool rack and the lesson line along its bottom: it looks a little ahead
    // (south) of the farmer, and leans towards what a lesson points at, so neither covers the crops being taught.
    const wideScreen = this.stage.clientWidth > this.stage.clientHeight;
    if (mode === 'close' && wideScreen) {
      fy += CLOSE_LEAD;
      const p = this.lessonPoint;
      if (p && Math.abs(p.x - f.x) < 7 && Math.abs(p.y - f.y) < 6) {
        fx += (p.x - f.x) * 0.35;
        fy += Math.max(0, p.y - f.y) * 0.35;
      }
    }
    return { mode, focusX: fx, focusY: fy, zoom: c.zoom, panX: mode === 'wide' ? c.panX : 0, panY: mode === 'wide' ? c.panY : 0 };
  }

  private pxPerTile(): number {
    const cam = this.camera();
    const cx = cam.mode === 'wide' ? 10 + cam.panX : cam.focusX;
    const cy = cam.mode === 'wide' ? 9 + cam.panY : cam.focusY;
    const a = this.r3d.project(cx, cy);
    const b = this.r3d.project(cx + 1, cy);
    return a && b ? Math.max(4, Math.hypot(b.x - a.x, b.y - a.y)) : 40;
  }

  private pan(dx: number, dy: number): void {
    if (this.state.rules.camera !== 'wide') return;
    const k = this.pxPerTile();
    const c = this.cams.wide;
    c.panX = Math.max(-8, Math.min(8, c.panX - dx / k));
    c.panY = Math.max(-6, Math.min(6, c.panY - dy / k));
  }

  private zoom(f: number): void {
    const c = this.cams[this.state.rules.camera];
    c.zoom = Math.max(0.6, Math.min(2.5, c.zoom * f));
  }

  toggleCamera(): void {
    this.input.push({ type: 'rules', patch: { camera: this.state.rules.camera === 'close' ? 'wide' : 'close' } });
    this.ctx.audio.ui('toggle');
  }

  /**
   * A tap on the screen to a tile. The well and the notice board stand up off
   * the ground, so a tap on their drawing (which the ground pick would put on
   * the tile behind them) is a tap on them.
   */
  private pickTap(px: number, py: number): { x: number; y: number } | null {
    if (!this.r3d) return null;
    for (const p of PROPS) {
      if (p.kind !== 'well' && p.kind !== 'board') continue;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const [x, y] of [[p.x, p.y], [p.x + p.w, p.y], [p.x, p.y + p.h], [p.x + p.w, p.y + p.h]]) {
        for (const h of [0, PROP_HEIGHT[p.kind]]) {
          const q = this.r3d.project(x, y, h);
          if (!q) continue;
          x0 = Math.min(x0, q.x);
          x1 = Math.max(x1, q.x);
          y0 = Math.min(y0, q.y);
          y1 = Math.max(y1, q.y);
        }
      }
      if (px >= x0 && px <= x1 && py >= y0 && py <= y1) return { x: p.x, y: p.y };
    }
    return this.r3d.pick(px, py);
  }

  private hotkey(code: string, shift: boolean): boolean {
    if (!this.running) return false;
    // An open picker answers first: arrows and numbers choose, Enter and Escape close it (Escape never reaches
    // the game switcher while a picker is open).
    if (!this.dialogs.open && this.hud.pickerKey(code)) return true;
    if (code === 'Escape') {
      if (this.dialogs.open) this.dialogs.close();
      else this.ctx.openSwitcher();
      return true;
    }
    // Enter answers an open question (sleep now?, buy this?) with its main button.
    if (code === 'Enter' && this.dialogs.open) return this.dialogs.accept();
    if (this.dialogs.open) return false;
    if (/^Digit[1-5]$/.test(code)) {
      this.hud.toolByNumber(Number(code[5]));
      return true;
    }
    switch (code) {
      case 'KeyB':
        if (!this.state.learn.includes('board')) return false;
        this.dialogs.board();
        this.tutor.board(this.state);
        return true;
      case 'Enter':
        this.sleep();
        return true;
      case 'KeyQ':
        this.hud.cycleTool(shift);
        return true;
      case 'KeyC':
        this.toggleCamera();
        return true;
      case 'KeyO':
        this.soilOverlay = !this.soilOverlay;
        return true;
      case 'Equal':
        this.zoom(1.15);
        return true;
      case 'Minus':
        this.zoom(1 / 1.15);
        return true;
    }
    return false;
  }

  /**
   * Sleep from the button or Enter. Before noon it asks first, so a stray tap
   * does not throw away a morning, but only when something on the farm still
   * wants doing (ripe or thirsty crops, bugs, a crow), and never while the
   * first lesson teaches it or when there is no stamina left to spend.
   */
  sleep(): void {
    const s = this.state;
    if (s.turnover >= 0) return;
    const teaching = !s.learn.includes('lesson:sleep');
    const left = workLeft(s);
    if (s.minute < 360 && !teaching && s.stamina >= 10 && left.ripe + left.thirsty + left.bugs + left.crows > 0) {
      this.dialogs.confirmSleep(s.minute, () => this.input.push({ type: 'sleep' }), left);
      return;
    }
    this.input.push({ type: 'sleep' });
  }

  // ------------------------------------------------------------ frame

  private atBoard(x: number, y: number): boolean {
    return propAt(x, y)?.kind === 'board' && this.state.learn.includes('board');
  }

  /**
   * The tile acting would work on, and whether acting there does anything: a
   * tapped tile for a moment, else the plot in front, else (when that has
   * nothing to do) the nearest useful one in reach, the notice board included.
   * The same choice the simulation makes for the act command.
   */
  private aimAt(): { x: number; y: number; useful: boolean } | null {
    const s = this.state;
    const ok = (x: number, y: number) => {
      const r = resolve(s, s.tool, x, y);
      return !!(r.verb && r.ok);
    };
    if (this.walkAim && this.t - this.walkAim.t < 1.2) return { ...this.walkAim, useful: this.atBoard(this.walkAim.x, this.walkAim.y) || ok(this.walkAim.x, this.walkAim.y) };
    const f = farmer(s);
    const t = facingTile(f);
    // Facing the board reads it. Otherwise the simulation's own choice comes first (so the button never
    // promises what acting would not do), and the board only when nothing else in reach is useful.
    if (inMap(t.x, t.y) && this.atBoard(t.x, t.y)) return { ...t, useful: true };
    const snapped = snapAim(f, ok) ?? snapAim(f, (x, y) => this.atBoard(x, y));
    if (snapped) return { ...snapped, useful: true };
    return inMap(t.x, t.y) ? { ...t, useful: false } : null;
  }

  private aim(): { x: number; y: number } | null {
    const a = this.aimAt();
    return a ? { x: a.x, y: a.y } : null;
  }

  view(dt: number): FrameView {
    const s = this.state;
    const aim = this.aimAt();
    let highlight: FrameView['highlight'] = null;
    if (aim && s.turnover < 0) {
      const r = resolve(s, s.tool, aim.x, aim.y);
      // What acting would do is marked brightly; otherwise a faint cursor shows the plot in front.
      // (A refusal explains itself when you try.)
      if (aim.useful) highlight = { x: aim.x, y: aim.y, verb: this.atBoard(aim.x, aim.y) ? null : r.verb, ok: true };
      else highlight = { x: aim.x, y: aim.y, verb: null, ok: false };
    }
    return {
      state: s,
      rules: s.rules,
      t: this.t,
      dt,
      camera: this.camera(),
      highlight,
      hour: this.hour,
      daylight: this.daylight,
      night: s.night,
      season: season(s.day),
      soilOverlay: this.soilOverlay,
      showQuality: false,
      reducedMotion: this.ctx.settings().reducedMotion,
      quality: this.ctx.quality(),
    };
  }

  private tick = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.t += dt;
    this.frames++;
    const s = this.state;

    let cmds = this.input.collect(dt);
    // The notice board is in the yard: act beside it, from any side, or tap it, to read it.
    const aimed = this.aimAt();
    const atBoard = (x: number, y: number) => propAt(x, y)?.kind === 'board';
    if (cmds.some((c) => (c.type === 'act' && aimed && aimed.useful && atBoard(aimed.x, aimed.y)) || (c.type === 'actAt' && atBoard(c.x, c.y)))) {
      cmds = cmds.filter((c) => c.type !== 'act' && c.type !== 'actAt');
      this.dialogs.board();
      this.tutor.board(s);
    }
    // One lesson at a time: it may bring a tool or a system onto the farm.
    // The line counts as seen only while it can be: no board or picker over it.
    const lesson = this.tutor.update(s, dt, this.hud.touch.shown, !this.dialogs.open && !this.hud.picking);
    cmds.push(...lesson.cmds);
    this.hud.setLesson(lesson.line);
    this.hud.setPoint(lesson.point);
    this.lessonPoint = lesson.line ? lesson.point : null;
    if (this.bot && !this.dialogs.open) cmds.push(...botCommands(s, this.bot, dt));
    for (const c of cmds) if (c.type === 'actAt') this.walkAim = { x: c.x, y: c.y, t: this.t };
    const ev = step(s, this.dialogs.open ? 0 : dt, cmds);
    for (const e of ev) this.dispatch(e);

    this.hour += (hourOf(s.minute) - this.hour) * Math.min(1, dt * 3);
    this.daylight += (daylightOf(s.minute) - this.daylight) * Math.min(1, dt * 3);
    this.r3d.frame(this.view(dt));
    this.ctx.audio.mood({
      game: 'homestead',
      intensity: 0,
      rules: s.rules,
      hour: this.hour,
      season: season(s.day),
      weather: s.weather,
      scene: this.dialogs.open ? 'menu' : 'farm',
      night: s.night,
      speed: 1,
      tired: s.stamina < 15,
    });
    const open = this.dialogs.open;
    if (this.ctx.root.classList.contains('dialog-open') !== open) this.ctx.root.classList.toggle('dialog-open', open);
    const touchOn = this.hud.touch.shown;
    if (this.ctx.root.classList.contains('touch-on') !== touchOn) this.ctx.root.classList.toggle('touch-on', touchOn);
    this.hud.update(this.aim());
    if (s.time - this.lastSave > 30) {
      this.lastSave = s.time;
      this.save();
    }
  };

  private dispatch(e: SimEvent): void {
    const s = this.state;
    if (this.events.length < 5000) this.events.push(e);
    this.tutor.onEvent(s, e);
    if (e.type === 'unlock' && !e.what.startsWith('lesson:')) this.ctx.audio.ui('star');
    this.r3d.onEvent(e, s);
    this.ctx.audio.event(e, s);
    this.hud.onEvent(e);
    switch (e.type) {
      case 'rules':
        if (e.changed.includes('camera')) this.cams[s.rules.camera].panX = this.cams[s.rules.camera].panY = 0;
        break;
      case 'dawn':
        this.hour = 6;
        this.save();
        this.dialogs.refresh();
        break;
      case 'buy':
      case 'sell':
      case 'order':
        this.dialogs.refresh();
        break;
    }
  }

  save(): void {
    const s = this.state;
    const harvested = CROP_IDS.reduce((a, c) => a + s.stats.harvested[c], 0);
    this.ctx.save(s, `${SEASON_NAMES[season(s.day)]} ${dayOfSeason(s.day)}, year ${Math.floor((s.day - 1) / 40) + 1}, ${s.coins.toLocaleString('en-US')} coins${harvested ? '' : ''}`);
  }

  replace(state: WorldState): void {
    this.state = state;
    this.events = [];
    this.cams.wide = { zoom: 1, panX: 0, panY: 0 };
    this.cams.close = { zoom: 1, panX: 0, panY: 0 };
    this.r3d.snap(this.view(0));
  }
}
