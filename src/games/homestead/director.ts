// Sunup's director: input to commands, one simulation step, events out to the
// 3D view, the audio and the HUD, the camera, and the save. The farm runs
// under one fixed set of rules (the homestead); the shell hosts it.

import type { CameraIntent, FrameView, Renderer, UiCue } from '../../contract';
import { resolve } from '../../sim/actions';
import { facingTile, farmer } from '../../sim/actors';
import { botCommands, newBot, type Bot } from '../../sim/bot';
import type { Command } from '../../sim/commands';
import { CROP_IDS } from '../../sim/crops';
import { step } from '../../sim/step';
import { daylightOf, hourOf, inMap, season, SEASON_NAMES, dayOfSeason } from '../../sim/world';
import { propAt } from '../../sim/map';
import type { BuildKind, SimEvent, WorldState } from '../../sim/types';
import { Dialogs } from '../../ui/dialogs';
import { el } from '../../ui/dom';
import { Hud } from '../../ui/hud';
import { Input } from '../../game/input';
import { Tutor } from './lessons';
import type { GameContext } from '../../shell/types';

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
      input: this.input,
    });
    this.dialogs = new Dialogs({
      ...host,
      onChange: () => undefined,
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

  private camera(): CameraIntent {
    const mode = this.state.rules.camera;
    const c = this.cams[mode];
    const f = farmer(this.state);
    return { mode, focusX: f.x, focusY: f.y, zoom: c.zoom, panX: mode === 'wide' ? c.panX : 0, panY: mode === 'wide' ? c.panY : 0 };
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

  private hotkey(code: string, shift: boolean): boolean {
    if (!this.running) return false;
    if (code === 'Escape') {
      if (this.dialogs.open) this.dialogs.close();
      else this.ctx.openSwitcher();
      return true;
    }
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
        this.input.push({ type: 'sleep' });
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

  // ------------------------------------------------------------ frame

  private aim(): { x: number; y: number } | null {
    const s = this.state;
    if (this.walkAim && this.t - this.walkAim.t < 1.2) return this.walkAim;
    const t = facingTile(farmer(s));
    return inMap(t.x, t.y) ? t : null;
  }

  view(dt: number): FrameView {
    const s = this.state;
    const aim = this.aim();
    let highlight: FrameView['highlight'] = null;
    if (aim) {
      const r = resolve(s, s.tool, aim.x, aim.y);
      // Only what the tool can do is marked. A refusal explains itself when you try.
      if (r.verb && r.ok) highlight = { x: aim.x, y: aim.y, verb: r.verb, ok: true };
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
    // The notice board is in the yard: face it and act to read it.
    const front = facingTile(farmer(s));
    const atBoard = (x: number, y: number) => propAt(x, y)?.kind === 'board';
    if (cmds.some((c) => (c.type === 'act' && atBoard(front.x, front.y)) || (c.type === 'actAt' && atBoard(c.x, c.y)))) {
      cmds = cmds.filter((c) => c.type !== 'act' && c.type !== 'actAt');
      this.dialogs.board();
      this.tutor.board(s);
    }
    // One lesson at a time: it may bring a tool or a system onto the farm.
    const lesson = this.tutor.update(s, dt, this.hud.touch.shown);
    cmds.push(...lesson.cmds);
    this.hud.setLesson(lesson.line);
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
