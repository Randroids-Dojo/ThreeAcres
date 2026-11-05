// Sunup's director: input to commands, one simulation step, events out to the
// 3D view, the audio and the HUD, the camera, and the save. The farm runs
// under one fixed set of rules (the homestead); the shell hosts it.

import type { CameraIntent, FrameView, Renderer, UiCue } from '../../contract';
import { canAfford, homestead, resolve, sleepAsk } from '../../sim/actions';
import { facingTile, farmer, snapAim } from '../../sim/actors';
import { botCommands, newBot, type Bot } from '../../sim/bot';
import { fillRequests, owedToday } from '../../sim/goals';
import { guardedSure } from '../../sim/day';
import type { Command } from '../../sim/commands';
import { CROP_IDS } from '../../sim/crops';
import { step } from '../../sim/step';
import { daylightOf, hourOf, inMap, season, SEASON_NAMES, dayOfSeason } from '../../sim/world';
import { PROPS, propAt } from '../../sim/map';
import type { BuildKind, FairResult, SimEvent, WorldState } from '../../sim/types';
import { Dialogs } from '../../ui/dialogs';
import { el } from '../../ui/dom';
import { Hud, pinnedNews } from '../../ui/hud';
import { Input } from '../../game/input';
import { Tutor } from './lessons';
import { pointerTap, type PointerTap } from './pointer';
import type { GameContext } from '../../shell/types';

/** How tall the well and the notice board are drawn, in tiles, for taps on them. */
const PROP_HEIGHT: Record<string, number> = { well: 1.3, board: 1.6 };
/**
 * A wide screen's close camera looks this many tiles south of the farmer. Round 10: 2.2 (it was 1.4): from the yard
 * above the first field, the field and the well below it were never on screen together at 1280x800.
 */
const CLOSE_LEAD = 2.2;
/** Round 9: the furthest south of a field's top row a wide screen's close camera looks, so that row clears the day card. */
const FIELD_TOP_CLEAR = 3.5;

/** Round 10: how long after a card or a picker closes Escape is ignored (ms). */
export const ESCAPE_QUIET = 500;

/** Round 10: is Escape still quiet, `now` ms after a card or a picker closed at `closedAt`? */
export function escapeQuiet(closedAt: number, now: number): boolean {
  return now - closedAt < ESCAPE_QUIET;
}

/**
 * Round 10: does an act command open the notice board? Only a fresh press with the board in reach, never a repeat
 * from a held key or button (holding Space along the yard path popped the board up mid-walk).
 */
export function boardAct(c: { type: 'act'; held?: boolean }, atBoard: boolean): boolean {
  return atBoard && !c.held;
}

/**
 * Round 10: is a tap at (px, py) on the farmer, drawn from `feet` to `head` (screen px), half a tile being the
 * distance from `feet` to `side`? A finger's width at least (44 px across, or nine tenths of a tile), from a little
 * over the hat down to just above the feet: a tap at the feet is a tap on the plot the farmer stands on (the queue's
 * next job, as often as not). On a phone the farmer is drawn about 20 px tall, and walks while taps wait, so the
 * body alone (24 px across) was missed by a real tap more often than not.
 */
export function farmerHit(feet: { x: number; y: number } | null, head: { x: number; y: number } | null, side: { x: number; y: number } | null, px: number, py: number): boolean {
  if (!feet || !head || !side) return false;
  const half = Math.max(22, Math.abs(side.x - feet.x) * 0.45);
  const tall = Math.max(0, feet.y - head.y);
  return Math.abs(px - (feet.x + head.x) / 2) <= half && py >= head.y - 14 && py <= feet.y - Math.max(3, tall * 0.15);
}

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
  /** Round 9: the board is making stale offers again (it steps the farm once, with no time passing). */
  private freshening = false;
  /**
   * Round 10: when a card or a picker last closed (ms). Escape is ignored for `ESCAPE_QUIET` after it: the tenth
   * playtest's Escape, just after a card closed, opened the game switcher, and the next click went to Thistledown.
   */
  private closedAt = -Infinity;
  private wasPicking = false;
  /**
   * Round 10: the fair judged in the night, its card to show once the morning is light (it opened mid-night, the
   * clock stopped under it, and the dark stayed until it was closed).
   */
  private fairDue: FairResult | null = null;

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
      stopAt: (px, py) => this.onFarmer(px, py),
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
      pointerTap: () => this.onPointer(pointerTap(this.state, this.lessonTarget.point, this.lessonTarget.build, null)),
      input: this.input,
    });
    this.dialogs = new Dialogs({
      ...host,
      // Round 10: when a card closes, Escape waits a moment before it opens the game switcher.
      onChange: (open) => {
        if (!open) this.closedAt = performance.now();
      },
      keyboard: () => this.input.lastKind === 'key',
      // The last morning card, pinned on the board; after a reload, yesterday's report says it again. Round 8: read
      // again as the farm is now (it still said "4 ripe to pick" after they were picked).
      lastCard: () => {
        const s = this.state;
        if (!s.report || s.report.day !== s.day - 1) return null;
        const news = pinnedNews(s);
        const title = this.hud.lastCard?.day === s.day ? this.hud.lastCard.title : `${SEASON_NAMES[season(s.day)]} ${dayOfSeason(s.day)}`;
        return news ? { title, news } : null;
      },
      pickBuild: (k: BuildKind) => {
        this.input.push({ type: 'buildKind', kind: k });
        this.input.push({ type: 'tool', tool: 'build' });
      },
      // Round 9: the board is being read: offers that no longer fit the farm are made again at once, before it shows.
      freshen: () => {
        if (this.freshening) return;
        this.freshening = true;
        try {
          for (const e of step(this.state, 0, [{ type: 'freshen' }])) this.dispatch(e);
        } finally {
          this.freshening = false;
        }
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
  /** The pointer's target and what it builds, for taps on it. */
  private lessonTarget: { point: { x: number; y: number } | null; build?: BuildKind } = { point: null };

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
      // Round 7: from further away too, and far enough that the target comes into view (from the house the well sat at
      // x 1,287 on a 1,280 px screen); the farmer stays well inside the frame (at most four tiles of lean).
      if (p && Math.abs(p.x - f.x) < 13 && Math.abs(p.y - f.y) < 6) {
        fx += Math.max(-4, Math.min(4, (p.x - f.x) * 0.45));
        fy += Math.max(0, p.y - f.y) * 0.35;
      }
      // Round 9: standing in a field (or beside it), its top row stays clear of the day card: the look ahead stops
      // short of hiding it (from field 1's lower rows its top row sat under the date).
      const t = { x: Math.floor(f.x), y: Math.floor(f.y) };
      const field = this.state.parcels.find((q) => t.x >= q.x - 1 && t.x <= q.x + q.w && t.y >= q.y - 1 && t.y <= q.y + q.h);
      if (field && !(p && p.y > field.y + field.h)) fy = Math.min(fy, Math.max(f.y, field.y + FIELD_TOP_CLEAR));
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
    const ground = this.r3d.pick(px, py);
    // Round 8: a plot behind the field well, where its drawing overlaps the plot, is still the plot (a tap on the
    // second field's corner plot fetched water instead of watering it).
    const plot = !!ground && this.state.tiles[ground.y * this.state.W + ground.x] === 'field';
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
      if (!plot && px >= x0 && px <= x1 && py >= y0 && py <= y1) return { x: p.x, y: p.y };
    }
    return ground;
  }

  private hotkey(code: string, shift: boolean): boolean {
    if (!this.running) return false;
    // An open picker answers first: arrows and numbers choose, Enter and Escape close it (Escape never reaches
    // the game switcher while a picker is open).
    if (!this.dialogs.open && this.hud.pickerKey(code)) {
      if (code === 'Escape' || /Enter$/.test(code)) this.closedAt = performance.now();
      return true;
    }
    if (code === 'Escape') {
      if (this.dialogs.open) this.dialogs.close();
      // Round 10: not in the moment after a card or a picker closed (a second Escape meant for it).
      else if (!escapeQuiet(this.closedAt, performance.now())) this.ctx.openSwitcher();
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
      case 'KeyX':
        // Round 10: X stops the farmer: the taps waiting are let go.
        this.input.push({ type: 'cancelTaps' });
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
   * Sleep from the button or Enter. Round 7: before evening it always asks
   * first (Space on a Sleep button that kept the keyboard put the farmer to
   * bed at 3:27 pm, twice), and at any hour while bugs, a crow or a flock day
   * would cost crops tonight, or a request still wants planting today on its
   * last day for it. Never while the first lesson teaches sleep, nor with no
   * stamina left for any job (`sleepAsk` in src/sim/actions.ts).
   */
  sleep(): void {
    const s = this.state;
    if (s.turnover >= 0) return;
    const teaching = !s.learn.includes('lesson:sleep');
    // A flock day: crows still to come take a crop each from a farm left early, so the question asks at any hour.
    const flock = this.crowsDue();
    const owed = owedToday(s).reduce((a, x) => a + x.n, 0);
    const q = sleepAsk(s, { teaching, flock, owedToday: owed });
    if (q.ask) {
      this.dialogs.confirmSleep(s.minute, () => this.input.push({ type: 'sleep' }), { ...q.left, flock, owed });
      return;
    }
    this.input.push({ type: 'sleep' });
  }

  /** Is it a flock day with crows still to come and a growing crop no scarecrow watches over for sure? */
  private crowsDue(): boolean {
    const s = this.state;
    if (!homestead(s) || !s.flock || !s.crowPlan.length) return false;
    for (let i = 0; i < s.plots.length; i++) {
      const c = s.plots[i].crop;
      if (!c || c.dead || c.stage < 1 || c.stage >= 4 || s.parcelOf[i] < 0 || !s.parcels[s.parcelOf[i]].owned) continue;
      if (!guardedSure(s, i % s.W, Math.floor(i / s.W))) return true;
    }
    return false;
  }

  /**
   * Round 10: does a tap at this point (stage px) land on the farmer while taps wait, or the farmer walks to one? Then
   * it stops them. A finger's width over the farmer's body (`farmerHit`), never the plots beside or the farmer's feet,
   * so a quick run of taps on the plots around the farmer still queues.
   */
  private onFarmer(px: number, py: number): boolean {
    const s = this.state;
    const f = s.actors[0];
    if (!homestead(s) || !this.r3d || (!s.taps?.length && !f.aim)) return false;
    return farmerHit(this.r3d.project(f.x, f.y, 0), this.r3d.project(f.x, f.y, 1.15), this.r3d.project(f.x + 0.5, f.y, 0), px, py);
  }

  /** Do what a tap on the lesson pointer means: walk there and act, ask before building, or say why not. */
  private onPointer(t: PointerTap | null): void {
    if (!t) return;
    if (t.do === 'act') this.input.push({ type: 'actAt', x: t.x, y: t.y });
    else if (t.do === 'refuse') {
      this.hud.toast(t.text, 'deny');
      this.ctx.audio.ui('deny');
    } else {
      const { build, x, y } = t;
      this.dialogs.confirmBuild(build, this.state.coins, () => this.input.push({ type: 'buildAt', x, y, kind: build }));
    }
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
    // Too tired for the job, acting there would do nothing: the cursor and the button say so by staying dim.
    const ok = (x: number, y: number) => {
      const r = resolve(s, s.tool, x, y);
      return !!(r.verb && r.ok) && !(homestead(s) && canAfford(s, r.verb));
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
    // A tap inside the lesson pointer's target tile is a tap on the pointer: for a lesson that builds, it asks first
    // (or says it cannot be paid for) instead of doing the plot's own job. A tap anywhere else does its own job.
    cmds = cmds.filter((c) => {
      if (c.type !== 'actAt' || this.dialogs.open) return true;
      const t = pointerTap(s, this.lessonTarget.point, this.lessonTarget.build, { x: c.x, y: c.y });
      if (!t) return true;
      this.onPointer(t);
      return false;
    });
    // The notice board is in the yard: act beside it, from any side, or tap it, to read it.
    const aimed = this.aimAt();
    const atBoard = (x: number, y: number) => propAt(x, y)?.kind === 'board';
    // Round 10: only a fresh press opens it, never a held key or button walking past (it popped up mid-walk).
    if (cmds.some((c) => (c.type === 'act' && boardAct(c, !!aimed && aimed.useful && atBoard(aimed.x, aimed.y))) || (c.type === 'actAt' && atBoard(c.x, c.y)))) {
      cmds = cmds.filter((c) => c.type !== 'act' && c.type !== 'actAt');
      this.dialogs.board();
      this.tutor.board(s);
    }
    // One lesson at a time: it may bring a tool or a system onto the farm.
    // The line counts as seen only while it can be: no board or picker over it.
    if (this.wasPicking && !this.hud.picking) this.closedAt = performance.now();
    this.wasPicking = this.hud.picking;
    const lesson = this.tutor.update(s, dt, this.hud.touch.shown, !this.dialogs.open && !this.hud.picking);
    cmds.push(...lesson.cmds);
    this.hud.setLesson(lesson.line);
    this.hud.setPoint(lesson.point);
    this.lessonPoint = lesson.line ? lesson.point : null;
    this.lessonTarget = { point: lesson.point, build: lesson.build };
    if (this.bot && !this.dialogs.open) cmds.push(...botCommands(s, this.bot, dt));
    for (const c of cmds) if (c.type === 'actAt') this.walkAim = { x: c.x, y: c.y, t: this.t };
    const ev = step(s, this.dialogs.open ? 0 : dt, cmds);
    for (const e of ev) this.dispatch(e);
    // Round 10: the fair's card, once the night is over and nothing else is open.
    if (this.fairDue && s.turnover < 0 && !this.dialogs.open && !this.hud.picking) {
      this.dialogs.fair(this.fairDue);
      this.fairDue = null;
    }

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
        // Round 10: the morning after the season's fair, its card: the ribbon or the miss, and why (the tenth playtest's
        // only sign was one clause in the morning card). Shown once the night is over; not for the bot.
        this.fairDue = s.report?.fair && s.learn.includes('fair') && !this.bot ? s.report.fair : null;
        break;
      case 'buy':
      case 'sell':
      case 'order':
        this.dialogs.refresh();
        break;
    }
  }

  /** For checks: pin requests as a morning would (works on any build, unlike importing the sim from the page). */
  pinRequests(): void {
    fillRequests(this.state, true);
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
