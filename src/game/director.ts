// The director owns the frame: input to commands, one simulation step, events
// out to the renderers, audio and HUD, the camera intent, and the crossfade
// between the 2D and 3D views. It also saves the farm.

import type { AudioEngine, CameraIntent, FrameView, Renderer, UiCue } from '../contract';
import { createAudio } from '../audio';
import { createRenderer2D } from '../render2d';
import { resolve } from '../sim/actions';
import { facingTile, farmer } from '../sim/actors';
import { botCommands, newBot, type Bot } from '../sim/bot';
import type { Command } from '../sim/commands';
import { FLOW_SPEEDS } from '../sim/constants';
import { PRESET_IDS, PRESETS } from '../sim/presets';
import { step } from '../sim/step';
import { daylightOf, hourOf, inMap, season } from '../sim/world';
import type { BuildKind, Rules, SimEvent, WorldState } from '../sim/types';
import { Dialogs } from '../ui/dialogs';
import { el } from '../ui/dom';
import { Hud } from '../ui/hud';
import { Mixer } from '../ui/mixer';
import { AXIS_INFO } from '../sim/presets';
import { Input } from './input';
import { loadNotes, loadSettings, saveFarm, saveNotes, saveSettings, type Settings } from './save';

export interface DirectorOptions {
  autoplay?: boolean;
  /** Show the touch controls on any device (?touch), for testing. */
  forceTouch?: boolean;
  onNewFarm(): void;
}

export class Director {
  state: WorldState;
  readonly stage = el('div', 'stage');
  readonly input: Input;
  readonly hud: Hud;
  readonly mixer: Mixer;
  readonly dialogs: Dialogs;
  readonly audio: AudioEngine;
  private r2d: Renderer;
  private r3d: Renderer | null = null;
  private loading3d: Promise<Renderer> | null = null;
  private visible: '2d' | '3d' = '2d';
  private fadeUntil = 0;
  private cams: Record<'close' | 'wide', { zoom: number; panX: number; panY: number }> = {
    close: { zoom: 1, panX: 0, panY: 0 },
    wide: { zoom: 1, panX: 0, panY: 0 },
  };
  private settings: Settings = loadSettings();
  private notes = loadNotes();
  private daylight = 1;
  private hour = 6;
  private last = performance.now();
  private t = 0;
  private raf = 0;
  /** Title screen up: the farm is drawn but does not run. */
  title = true;
  private bot: Bot | null = null;
  private lastSave = 0;
  private lastSpeed = 1;
  private seasonPending = false;
  private walkAim: { x: number; y: number; t: number } | null = null;
  frames = 0;
  events: SimEvent[] = [];

  private appRoot: HTMLElement;

  constructor(state: WorldState, root: HTMLElement, private opts: DirectorOptions) {
    this.state = state;
    this.appRoot = root;
    this.audio = createAudio();
    this.r2d = createRenderer2D();
    this.r2d.canvas.classList.add('hidden');
    this.stage.append(this.r2d.canvas);

    this.input = new Input(this.stage, {
      rules: () => this.state.rules,
      pick: (px, py) => this.active().pick(px, py),
      canPaint: (x, y) => {
        const r = resolve(this.state, this.state.tool, x, y);
        return !!(r.verb && r.ok);
      },
      hasJob: (x, y) => this.state.jobs.some((j) => j.x === x && j.y === y),
      pan: (dx, dy) => this.pan(dx, dy),
      zoom: (f) => this.zoom(f),
      hotkey: (k, shift) => this.hotkey(k, shift),
      blocked: () => this.title || this.dialogs.open,
    });

    const host = {
      state: () => this.state,
      send: (c: Command) => this.input.push(c),
      cue: (c: UiCue) => this.audio.ui(c),
    };
    this.hud = new Hud({
      ...host,
      openMixer: () => this.toggleMixer(true),
      openBoard: (tab) => this.dialogs.board(tab as never),
      openSettings: () => this.dialogs.settings(),
      offerParcel: (id) => this.dialogs.parcel(id),
      project: (x, y, h) => this.active().project(x, y, h),
      input: this.input,
    });
    this.mixer = new Mixer({
      ...host,
      setRules: (patch) => this.setRules(patch),
      notes: () => this.notes,
      saveNotes: (n) => {
        this.notes = n;
        saveNotes(n);
      },
      onClose: () => undefined,
    });
    this.dialogs = new Dialogs({
      ...host,
      settings: () => this.settings,
      setSettings: (p) => {
        this.settings = { ...this.settings, ...p };
        saveSettings(this.settings);
        this.applyVolumes();
      },
      newFarm: () => this.opts.onNewFarm(),
      onChange: () => undefined,
      pickBuild: (k: BuildKind) => {
        this.input.push({ type: 'buildKind', kind: k });
        this.input.push({ type: 'tool', tool: 'build' });
      },
    });

    root.append(this.stage, this.hud.root, this.mixer.scrim, this.mixer.root, this.dialogs.scrim, this.dialogs.root);
    this.applyVolumes();
    if (opts.autoplay) this.bot = newBot();
    if (opts.forceTouch) this.hud.touch.forced = true;

    const unlock = () => this.audio.unlock();
    for (const e of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(e, unlock, { passive: true });
    document.addEventListener('visibilitychange', () => {
      const hidden = document.visibilityState !== 'visible';
      this.audio.suspend(hidden);
      if (hidden) saveFarm(this.state);
    });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pagehide', () => saveFarm(this.state));
  }

  /** Bring up the first view, then preload the other. */
  async start(): Promise<void> {
    this.resize();
    this.visible = this.state.rules.view;
    if (this.visible === '3d') await this.ensure3d();
    const r = this.active();
    r.canvas.classList.remove('hidden');
    r.snap(this.view(0));
    this.raf = requestAnimationFrame(this.tick);
    if (this.visible === '2d') setTimeout(() => void this.ensure3d(), 400);
  }

  private ensure3d(): Promise<Renderer> {
    if (this.r3d) return Promise.resolve(this.r3d);
    if (!this.loading3d) {
      this.loading3d = import('../render3d').then(async (m) => {
        const r = await m.createRenderer3D();
        r.canvas.classList.add('hidden');
        this.stage.append(r.canvas);
        this.r3d = r;
        this.resize();
        return r;
      });
    }
    return this.loading3d;
  }

  active(): Renderer {
    return this.visible === '3d' && this.r3d ? this.r3d : this.r2d;
  }

  private quality(): 'low' | 'high' {
    if (this.settings.quality !== 'auto') return this.settings.quality;
    const phone = /Android|iPhone|iPad/i.test(navigator.userAgent) || Math.min(window.innerWidth, window.innerHeight) < 600;
    return phone ? 'low' : 'high';
  }

  private resize(): void {
    const w = this.stage.clientWidth || window.innerWidth;
    const h = this.stage.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.r2d.resize(w, h, dpr);
    this.r3d?.resize(w, h, dpr);
  }

  private applyVolumes(): void {
    this.audio.setVolumes({ master: this.settings.master, music: this.settings.music, sfx: this.settings.sfx });
  }

  // ------------------------------------------------------------ camera

  private camera(): CameraIntent {
    const mode = this.state.rules.camera;
    const c = this.cams[mode];
    const f = farmer(this.state);
    return { mode, focusX: f.x, focusY: f.y, zoom: c.zoom, panX: mode === 'wide' ? c.panX : 0, panY: mode === 'wide' ? c.panY : 0 };
  }

  private pxPerTile(): number {
    const r = this.active();
    const cam = this.camera();
    const cx = cam.mode === 'wide' ? 10 + cam.panX : cam.focusX;
    const cy = cam.mode === 'wide' ? 9 + cam.panY : cam.focusY;
    const a = r.project(cx, cy);
    const b = r.project(cx + 1, cy);
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

  // ------------------------------------------------------------ rules and keys

  setRules(patch: Partial<Rules>): void {
    this.input.push({ type: 'rules', patch });
  }

  toggleMixer(open?: boolean): void {
    const want = open ?? !this.mixer.open;
    if (want) this.mixer.show();
    else this.mixer.close();
  }

  private hotkey(code: string, shift: boolean): boolean {
    if (this.title) return false;
    const s = this.state;
    if (code === 'Escape') {
      if (this.dialogs.open) this.dialogs.close();
      else if (this.mixer.open) this.mixer.close();
      return true;
    }
    if (this.dialogs.open) return false;
    if (shift && /^Digit[1-3]$/.test(code)) {
      this.setRules({ ...PRESETS[PRESET_IDS[Number(code[5]) - 1]].rules });
      this.audio.ui('preset');
      return true;
    }
    if (/^Digit[1-5]$/.test(code)) {
      this.hud.toolByNumber(Number(code[5]));
      return true;
    }
    const flip = <K extends keyof Rules>(axis: K) => {
      const opts = AXIS_INFO[axis].options.map((o) => o.value);
      const next = opts[(opts.indexOf(s.rules[axis]) + 1) % opts.length] as Rules[K];
      this.setRules({ [axis]: next } as Partial<Rules>);
      this.audio.ui('toggle');
      return true;
    };
    switch (code) {
      case 'KeyM':
      case 'Tab':
        this.toggleMixer();
        return true;
      case 'KeyB':
        this.dialogs.board();
        return true;
      case 'Enter':
        if (s.rules.clock !== 'flow') this.input.push({ type: 'sleep' });
        return true;
      case 'KeyQ':
        this.hud.cycleTool(shift);
        return true;
      case 'KeyV':
        return flip('view');
      case 'KeyC':
        return flip('camera');
      case 'KeyO':
        this.settings = { ...this.settings, soilOverlay: !this.settings.soilOverlay };
        saveSettings(this.settings);
        this.audio.ui('toggle');
        return true;
      case 'KeyP':
        if (s.rules.clock !== 'flow') return false;
        if (s.speed) this.lastSpeed = s.speed;
        this.input.push({ type: 'speed', speed: s.speed ? 0 : this.lastSpeed });
        return true;
      case 'Backspace':
      case 'KeyX':
        this.input.push({ type: 'cancelJobs' });
        return true;
      case 'BracketLeft':
      case 'BracketRight': {
        if (s.rules.clock !== 'flow') return false;
        const i = FLOW_SPEEDS.indexOf(s.speed as (typeof FLOW_SPEEDS)[number]);
        const j = Math.max(0, Math.min(FLOW_SPEEDS.length - 1, i + (code === 'BracketRight' ? 1 : -1)));
        this.input.push({ type: 'speed', speed: FLOW_SPEEDS[j] });
        return true;
      }
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
    if (s.rules.control === 'walk') {
      if (this.walkAim && this.t - this.walkAim.t < 1.2) return this.walkAim;
      const t = facingTile(farmer(s));
      return inMap(t.x, t.y) ? t : null;
    }
    return this.input.aim;
  }

  view(dt: number): FrameView {
    const s = this.state;
    const aim = this.aim();
    let highlight: FrameView['highlight'] = null;
    if (aim) {
      const r = resolve(s, s.tool, aim.x, aim.y);
      highlight = { x: aim.x, y: aim.y, verb: r.verb, ok: !!(r.verb && r.ok) };
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
      soilOverlay: this.settings.soilOverlay,
      showQuality: s.rules.growth === 'synergy',
      reducedMotion: this.settings.reducedMotion,
      quality: this.quality(),
    };
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.t += dt;
    this.frames++;
    const s = this.state;

    const cmds = this.input.collect(dt);
    if (this.bot && !this.title && !this.dialogs.open) cmds.push(...botCommands(s, this.bot, dt));
    for (const c of cmds) if (c.type === 'actAt') this.walkAim = { x: c.x, y: c.y, t: this.t };
    const paused = this.title || this.dialogs.open;
    const ev = step(s, paused ? 0 : dt, cmds);
    for (const e of ev) this.dispatch(e);

    // Light follows the clock, smoothed so moves under turns ease the sun along.
    const targetHour = hourOf(s.minute);
    this.hour += (targetHour - this.hour) * Math.min(1, dt * 3);
    const targetLight = daylightOf(s.minute);
    this.daylight += (targetLight - this.daylight) * Math.min(1, dt * 3);

    if (s.rules.view !== this.visible) this.switchView(s.rules.view);
    const v = this.view(dt);
    const a = this.active();
    a.frame(v);
    if (this.t < this.fadeUntil) {
      const other = a === this.r2d ? this.r3d : this.r2d;
      other?.frame(v);
    }
    this.audio.mood({
      rules: s.rules,
      hour: this.hour,
      season: season(s.day),
      weather: s.weather,
      scene: this.title ? 'title' : this.dialogs.open || this.mixer.open ? 'menu' : 'farm',
      night: s.night,
      speed: s.rules.clock === 'flow' ? s.speed : 1,
      tired: (s.rules.clock === 'day' && s.stamina < 15) || (s.rules.clock === 'turns' && s.ap <= 1),
    });
    this.hud.root.style.visibility = this.title ? 'hidden' : '';
    const device = this.input.deviceKnown ? this.input.lastKind : matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
    if (this.appRoot.dataset.device !== device) this.appRoot.dataset.device = device;
    const touchOn = this.hud.touch.shown && s.rules.control === 'walk';
    if (this.appRoot.classList.contains('touch-on') !== touchOn) this.appRoot.classList.toggle('touch-on', touchOn);
    if (!this.title) {
      this.hud.update(this.aim());
      this.mixer.update();
    }
    if (this.seasonPending && s.turnover < 0 && !this.dialogs.open) {
      this.seasonPending = false;
      this.dialogs.season();
    }
    if (!this.title && s.time - this.lastSave > 30) {
      this.lastSave = s.time;
      saveFarm(s);
    }
  };

  private dispatch(e: SimEvent): void {
    const s = this.state;
    if (this.events.length < 5000) this.events.push(e);
    this.r2d.onEvent(e, s);
    this.r3d?.onEvent(e, s);
    this.audio.event(e, s);
    this.hud.onEvent(e);
    switch (e.type) {
      case 'rules':
        saveFarm(s);
        if (e.changed.includes('camera')) this.cams[s.rules.camera].panX = this.cams[s.rules.camera].panY = 0;
        this.dialogs.refresh();
        break;
      case 'dawn':
        this.hour = 6;
        saveFarm(s);
        this.dialogs.refresh();
        break;
      case 'season':
        if (s.rules.goal === 'almanac' && !this.bot) this.seasonPending = true;
        break;
      case 'buy':
      case 'sell':
      case 'order':
      case 'hire':
        this.dialogs.refresh();
        break;
    }
  }

  private switchView(to: '2d' | '3d'): void {
    if (to === '3d' && !this.r3d) {
      void this.ensure3d().then(() => {
        if (this.state.rules.view === '3d') this.switchView('3d');
      });
      return;
    }
    const from = this.active();
    this.visible = to;
    const into = this.active();
    if (from === into) return;
    into.snap(this.view(0));
    into.canvas.classList.remove('hidden');
    from.canvas.classList.add('hidden');
    this.fadeUntil = this.t + 0.5;
  }

  /** Swap in a new farm (new game). */
  replace(state: WorldState): void {
    this.state = state;
    this.events = [];
    this.cams.wide = { zoom: 1, panX: 0, panY: 0 };
    this.cams.close = { zoom: 1, panX: 0, panY: 0 };
    this.active().snap(this.view(0));
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
  }
}
