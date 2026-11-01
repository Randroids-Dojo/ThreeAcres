// Keyboard, mouse, touch and gamepad, turned into commands for the farm and
// camera moves for the director. One finger paints in point control and taps
// in walk control; two fingers pan and pinch; the mouse wheel zooms.

import type { Command } from '../sim/commands';
import type { Rules } from '../sim/types';

export interface InputHost {
  rules(): Rules;
  /** CSS px on the stage to the tile under it. */
  pick(px: number, py: number): { x: number; y: number } | null;
  /** A tap to a tile: like pick, but a tap on a building drawn up off the ground is a tap on it. Defaults to pick. */
  pickTap?(px: number, py: number): { x: number; y: number } | null;
  /** Is a picker (seeds, builds) open? Then the arrow keys choose in it instead of walking. */
  picking?(): boolean;
  /** Can the current tool do something at this tile? Used to keep drags quiet. */
  canPaint(x: number, y: number): boolean;
  hasJob(x: number, y: number): boolean;
  /** Pan the camera by screen pixels, zoom by a factor around a point. */
  pan(dx: number, dy: number): void;
  zoom(factor: number): void;
  /** Keys and buttons that are not farm commands. */
  hotkey(key: string, shift: boolean): boolean;
  /** Is a dialog open? Then the farm gets no input. */
  blocked(): boolean;
}

interface Touch {
  id: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  t: number;
  /** Last position used for a one-finger pan. */
  px?: number;
  py?: number;
}

const TAP_SLOP = 10;

export class Input {
  /** The tile under the mouse or last finger, for the highlight in point control. */
  aim: { x: number; y: number } | null = null;
  /** Last input kind, so the HUD can show touch controls only when touch is used. */
  lastKind: 'mouse' | 'touch' | 'key' | 'pad' = 'mouse';
  /** False until the player has pressed, clicked or touched anything. */
  deviceKnown = false;

  private keys = new Set<string>();
  private queue: Command[] = [];
  private stick = { x: 0, y: 0 };
  private touches = new Map<number, Touch>();
  private stroke: { mode: 'paint' | 'erase'; tiles: Set<string>; committed: boolean; first: { x: number; y: number } } | null = null;
  private pinch: { d: number; mx: number; my: number } | null = null;
  private mouseDrag: { x: number; y: number; button: number } | null = null;
  private actHeld = 0;
  private touchActHeld = false;
  private padPrev: boolean[] = [];
  private padCursorT = 0;

  constructor(private stage: HTMLElement, private host: InputHost) {
    // Any press anywhere (HUD included) says which device is in use.
    window.addEventListener(
      'pointerdown',
      (e) => this.saw(e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'mouse'),
      { capture: true, passive: true },
    );
    // No page zoom or callouts from stray gestures on iOS.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // A button clicked with a mouse or a finger does not keep the keyboard: Space and Enter go back to the farm.
    window.addEventListener(
      'click',
      (e) => {
        const b = document.activeElement as HTMLElement | null;
        if (e.detail > 0 && b?.tagName === 'BUTTON') b.blur();
      },
      true,
    );
    window.addEventListener('blur', () => this.keys.clear());
    stage.addEventListener('pointerdown', this.onDown);
    stage.addEventListener('pointermove', this.onMove);
    stage.addEventListener('pointerup', this.onUp);
    stage.addEventListener('pointercancel', this.onCancel);
    stage.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.mouseDrag) this.aim = null;
    });
    stage.addEventListener('wheel', this.onWheel, { passive: false });
    stage.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  push(c: Command): void {
    this.queue.push(c);
  }

  /** Touch controls feed the stick and the act button through these. */
  setStick(x: number, y: number): void {
    this.stick = { x, y };
  }

  act(): void {
    this.queue.push({ type: 'act' });
  }

  /**
   * A tap at a point on the screen (client px), from a control that lies over
   * the farm: the walk stick's capture zone forwards quick taps here, so a
   * tap on a plot works wherever on the screen the plot is.
   */
  tapScreen(clientX: number, clientY: number): void {
    if (this.host.blocked() || this.host.rules().control !== 'walk') return;
    const r = this.stage.getBoundingClientRect();
    this.tapAt(clientX - r.left, clientY - r.top);
  }

  /** The touch act button is held: repeat like a held Space bar. */
  setActHeld(on: boolean): void {
    this.touchActHeld = on;
    if (!on) this.actHeld = 0;
  }

  private saw(kind: Input['lastKind']): void {
    this.lastKind = kind;
    this.deviceKnown = true;
  }

  /** Called once per frame: everything the farm should hear this step. */
  collect(dt: number): Command[] {
    this.pollPad(dt);
    const out = this.queue;
    this.queue = [];
    if (this.host.blocked()) {
      this.stroke = null;
      return out.filter((c) => c.type !== 'act' && c.type !== 'actAt' && c.type !== 'paint');
    }
    let mx = this.stick.x;
    let my = this.stick.y;
    // Arrow keys held from before a picker opened stop walking while it is open.
    const arrows = !this.host.picking?.();
    if (this.keys.has('KeyA') || (arrows && this.keys.has('ArrowLeft'))) mx -= 1;
    if (this.keys.has('KeyD') || (arrows && this.keys.has('ArrowRight'))) mx += 1;
    if (this.keys.has('KeyW') || (arrows && this.keys.has('ArrowUp'))) my -= 1;
    if (this.keys.has('KeyS') || (arrows && this.keys.has('ArrowDown'))) my += 1;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    out.unshift({ type: 'move', x: mx, y: my });
    // Holding the act key repeats, so walking down a row works each plot ahead in turn. A repeat is marked held: it
    // works what the farmer walks past at the side, never a plot already behind.
    if (this.keys.has('Space') || this.keys.has('KeyE') || this.touchActHeld) {
      this.actHeld += dt;
      if (this.actHeld > 0.22) {
        this.actHeld = 0.1;
        out.push({ type: 'act', held: true });
      }
    } else this.actHeld = 0;
    return out;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
    this.saw('key');
    // A button reached with Tab takes Enter and Space itself, as buttons do. (A clicked button gives up its
    // focus straight away, so Space after a click still harvests.)
    if (t && t.tagName === 'BUTTON' && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')) return;
    // While a picker is open the arrow keys choose in it, so they never walk the farmer (WASD still do).
    const picking = !!this.host.picking?.();
    if (picking && e.code.startsWith('Arrow')) {
      e.preventDefault();
      this.host.hotkey(e.code, e.shiftKey);
      return;
    }
    if (this.host.hotkey(e.code, e.shiftKey)) {
      e.preventDefault();
      return;
    }
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    if (!e.repeat && (e.code === 'Space' || e.code === 'KeyE') && !this.host.blocked()) this.queue.push({ type: 'act' });
    this.keys.add(e.code);
  };

  // ------------------------------------------------------------ pointers

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent) => {
    if (this.host.blocked()) return;
    const p = this.local(e);
    try {
      this.stage.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events in tests have no capture target.
    }
    if (e.pointerType === 'mouse') {
      this.mouseDrag = { x: p.x, y: p.y, button: e.button };
      if (e.button === 0) this.beginStroke(p.x, p.y);
      return;
    }
    this.touches.set(e.pointerId, { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now() });
    if (this.touches.size === 2) {
      // A second finger: this is a pan or a pinch. Paint already laid stays.
      this.stroke = null;
      const [a, b] = [...this.touches.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    } else if (this.touches.size === 1) {
      this.aim = this.host.pick(p.x, p.y);
      if (this.host.rules().control === 'point') this.beginStroke(p.x, p.y, true);
    }
  };

  private onMove = (e: PointerEvent) => {
    const p = this.local(e);
    if (e.pointerType === 'mouse') {
      this.aim = this.host.pick(p.x, p.y);
      const d = this.mouseDrag;
      if (!d) return;
      if (d.button === 1 || d.button === 2) {
        this.host.pan(p.x - d.x, p.y - d.y);
        d.x = p.x;
        d.y = p.y;
      } else if (d.button === 0) this.continueStroke(p.x, p.y);
      return;
    }
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    t.x = p.x;
    t.y = p.y;
    if (this.touches.size >= 2 && this.pinch) {
      const [a, b] = [...this.touches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      this.host.pan(mx - this.pinch.mx, my - this.pinch.my);
      if (this.pinch.d > 20) this.host.zoom(d / this.pinch.d);
      this.pinch = { d, mx, my };
      return;
    }
    const moved = Math.hypot(t.x - t.sx, t.y - t.sy) > TAP_SLOP;
    if (this.host.rules().control === 'point') {
      this.aim = this.host.pick(p.x, p.y);
      if (moved) this.continueStroke(p.x, p.y);
    } else if (moved && this.host.rules().camera === 'wide') {
      // Walk control: one finger drags the wide view around.
      this.host.pan(p.x - (t.px ?? t.sx), p.y - (t.py ?? t.sy));
      t.px = p.x;
      t.py = p.y;
    }
  };

  private onUp = (e: PointerEvent) => {
    const p = this.local(e);
    if (e.pointerType === 'mouse') {
      const d = this.mouseDrag;
      this.mouseDrag = null;
      if (d && d.button === 0) {
        if (this.host.rules().control === 'walk' && Math.hypot(p.x - d.x, p.y - d.y) <= TAP_SLOP) this.tapAt(p.x, p.y);
        this.endStroke();
      }
      return;
    }
    const t = this.touches.get(e.pointerId);
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinch = null;
    if (!t) return;
    const tap = Math.hypot(p.x - t.sx, p.y - t.sy) <= TAP_SLOP && performance.now() - t.t < 600;
    if (this.host.rules().control === 'point') {
      if (tap && this.stroke && !this.stroke.committed) this.commitStroke();
      this.endStroke();
    } else if (tap && this.touches.size === 0) this.tapAt(p.x, p.y);
  };

  private onCancel = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinch = null;
    this.stroke = null;
    this.mouseDrag = null;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.host.zoom(Math.exp(-e.deltaY * 0.0015));
  };

  private tapAt(px: number, py: number) {
    const tile = this.host.pickTap ? this.host.pickTap(px, py) : this.host.pick(px, py);
    if (tile) this.queue.push({ type: 'actAt', x: tile.x, y: tile.y });
  }

  // A stroke paints (or erases, if it starts on a job) every tile it crosses.
  // Touch strokes wait until the finger moves or lifts, so a pinch never paints.
  private beginStroke(px: number, py: number, deferred = false) {
    if (this.host.rules().control !== 'point') return;
    const tile = this.host.pick(px, py);
    if (!tile) return;
    this.stroke = { mode: this.host.hasJob(tile.x, tile.y) ? 'erase' : 'paint', tiles: new Set(), committed: false, first: tile };
    if (!deferred) this.commitStroke();
  }

  private commitStroke() {
    const s = this.stroke;
    if (!s || s.committed) return;
    s.committed = true;
    this.strokeTile(s.first.x, s.first.y, true);
  }

  private continueStroke(px: number, py: number) {
    const s = this.stroke;
    if (!s) return;
    if (!s.committed) this.commitStroke();
    const tile = this.host.pick(px, py);
    if (tile) this.strokeTile(tile.x, tile.y, false);
  }

  private strokeTile(x: number, y: number, first: boolean) {
    const s = this.stroke!;
    const key = `${x},${y}`;
    if (s.tiles.has(key)) return;
    s.tiles.add(key);
    if (s.mode === 'erase') {
      if (this.host.hasJob(x, y)) this.queue.push({ type: 'unpaint', x, y });
    } else if (first || this.host.canPaint(x, y)) this.queue.push({ type: 'paint', x, y });
  }

  private endStroke() {
    this.stroke = null;
  }

  // ------------------------------------------------------------ gamepad

  private pollPad(dt: number) {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = [...pads].find((p) => p && p.connected);
    if (!pad) return;
    const ax = Math.abs(pad.axes[0]) > 0.2 ? pad.axes[0] : 0;
    const ay = Math.abs(pad.axes[1]) > 0.2 ? pad.axes[1] : 0;
    const pressed = pad.buttons.map((b) => b.pressed);
    const edge = (i: number) => pressed[i] && !this.padPrev[i];
    if (ax || ay || pressed.some(Boolean)) this.saw('pad');
    const rules = this.host.rules();
    if (rules.control === 'walk') {
      if (this.lastKind === 'pad') this.stick = { x: ax, y: ay };
      if (edge(0)) this.queue.push({ type: 'act' });
    } else {
      // Point control: the stick moves a tile cursor.
      this.padCursorT -= dt;
      if ((ax || ay) && this.padCursorT <= 0) {
        const a = this.aim ?? { x: 4, y: 7 };
        this.aim = { x: Math.max(0, Math.min(19, a.x + Math.sign(Math.round(ax)))), y: Math.max(0, Math.min(14, a.y + Math.sign(Math.round(ay)))) };
        this.padCursorT = 0.14;
      }
      if (edge(0) && this.aim) this.queue.push(this.host.hasJob(this.aim.x, this.aim.y) ? { type: 'unpaint', ...this.aim } : { type: 'paint', ...this.aim });
    }
    if (edge(1)) this.host.hotkey('Escape', false);
    if (edge(2) || edge(5)) this.host.hotkey('KeyQ', false);
    if (edge(4)) this.host.hotkey('KeyQ', true);
    if (edge(3)) this.host.hotkey('KeyB', false);
    if (edge(9)) this.host.hotkey('KeyM', false);
    if (edge(8)) this.host.hotkey('Enter', false);
    this.padPrev = pressed;
  }
}
