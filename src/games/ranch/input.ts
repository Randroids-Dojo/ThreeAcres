// Every way to play Thistledown: keys and mouse (pointer lock, or right-drag
// to look when there is none), a gamepad, and touch. Touch follows the shell's
// conventions: a floating stick on the left that follows a drifting thumb,
// look by dragging on the right, and buttons that each track their own
// pointer, so you can walk, look, draw and puff at once.

import { clamp } from './noise';

export interface Frame {
  moveX: number;
  moveZ: number;
  sprint: boolean;
  jump: boolean;
  jumpPressed: boolean;
  draw: boolean;
  puff: boolean;
  puffPressed: boolean;
  interact: boolean;
  slotDelta: number;
  slotDirect: number;
  /** A window to tip out (the switch key held): its index, -2 for the chosen one, -1 for none. */
  empty: number;
  pause: boolean;
  journal: boolean;
  confirm: boolean;
  lookX: number;
  lookY: number;
  /** A tap or unlocked click at these CSS px (relative to the root), or null. */
  tapX: number;
  tapY: number;
  tapped: boolean;
  /** Which input moved the view last: for hints. */
  looked: boolean;
}

const STICK_R = 52;
const DEAD = 0.16;
/** Seconds the switch key must be held to tip a window out; a shorter press switches. */
const HOLD_EMPTY = 0.55;

function buzz(ms: number): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Not allowed or not supported.
  }
}

function capture(e: HTMLElement, id: number): void {
  try {
    e.setPointerCapture(id);
  } catch {
    // Synthetic or released pointers.
  }
}

const ICONS = {
  draw: `<svg viewBox="-50 -50 100 100" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 -12 L40 -24 L40 24 L8 12 Z"/><path d="M-44 -26 Q-20 -24 0 -6"/><path d="M-44 0 L0 0"/><path d="M-44 26 Q-20 24 0 6"/><path d="M-8 -8 L2 0 L-8 8"/></svg>`,
  puff: `<svg viewBox="-50 -50 100 100" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M-8 -12 L-40 -24 L-40 24 L-8 12 Z"/><path d="M8 -10 L36 -26"/><path d="M10 0 L42 0"/><path d="M8 10 L36 26"/></svg>`,
  jump: `<svg viewBox="-50 -50 100 100" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M-24 10 L0 -16 L24 10"/><path d="M-24 30 L24 30"/></svg>`,
  hand: `<svg viewBox="-50 -50 100 100" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M-14 30 Q-30 10 -28 -4 Q-26 -12 -18 -6 L-12 2 L-12 -30 Q-12 -38 -4 -38 Q4 -38 4 -30 L4 -6 L4 -24 Q4 -32 12 -32 Q20 -32 20 -24 L20 -2 L20 -16 Q20 -22 26 -22 Q32 -22 32 -14 L32 10 Q32 30 14 34 Z"/></svg>`,
  pause: `<svg viewBox="-50 -50 100 100" fill="currentColor"><rect x="-22" y="-26" width="14" height="52" rx="4"/><rect x="8" y="-26" width="14" height="52" rx="4"/></svg>`,
};

export { ICONS };

export class Input {
  private keys = new Set<string>();
  private f: Frame = {
    moveX: 0,
    moveZ: 0,
    sprint: false,
    jump: false,
    jumpPressed: false,
    draw: false,
    puff: false,
    puffPressed: false,
    interact: false,
    slotDelta: 0,
    slotDirect: -1,
    empty: -1,
    pause: false,
    journal: false,
    confirm: false,
    lookX: 0,
    lookY: 0,
    tapX: 0,
    tapY: 0,
    tapped: false,
    looked: false,
  };
  private ev = { jump: false, puff: false, interact: false, slot: 0, direct: -1, empty: -1, pause: false, journal: false, confirm: false, lookX: 0, lookY: 0, tapped: false, tapX: 0, tapY: 0, looked: false };
  /**
   * Switch keys held down. A number key picks its window at once and tips it
   * out if held; Q and R (and LB and RB) switch when let go quickly, and tip
   * the chosen window out if held.
   */
  private holds = new Map<string, { t0: number; slot: number; dir: number; fired: boolean }>();
  private mouseL = false;
  private mouseR = false;
  private mouseM = false;
  private lastMX = 0;
  private lastMY = 0;
  locked = false;
  lockAvailable: boolean;
  enabled = false;
  /** Called when pointer lock is lost while playing (Esc): the game pauses. */
  onLockLost: () => void = () => {};
  /** Is the pause menu or a dialog up? Clicks then do not capture. */
  menuUp: () => boolean = () => false;
  sens = 0.0022;
  // Touch state.
  readonly touch: HTMLElement;
  private stickZone: HTMLElement;
  private lookZone: HTMLElement;
  private base: HTMLElement;
  private knob: HTMLElement;
  private stickId: number | null = null;
  private origin = { x: 0, y: 0 };
  private stick = { x: 0, y: 0, rim: false };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private lookStart = { x: 0, y: 0, t: 0, moved: 0 };
  private held = new Map<HTMLElement, number>();
  private tDraw = false;
  private tPuff = false;
  private tJump = false;
  readonly btn: { draw: HTMLElement; puff: HTMLElement; jump: HTMLElement; act: HTMLElement; pause: HTMLElement };
  touchShown = false;
  // Gamepad.
  private padPrev: boolean[] = [];
  padActive = false;

  constructor(private root: HTMLElement, private canvasEl: HTMLElement, opts: { noLock: boolean }) {
    this.lockAvailable = !opts.noLock && 'requestPointerLock' in canvasEl;
    // ---- keys
    window.addEventListener('keydown', this.onKey, { capture: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });
    // ---- mouse
    canvasEl.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    canvasEl.addEventListener('wheel', this.onWheel, { passive: false });
    // A touch that lands on the view itself (between the stick and the look
    // side, or above the stick) is a tap on what is under it. Its compatibility
    // mouse events must not count as a mouse: they would ask for pointer lock,
    // and once locked every touch after it reads as 0,0.
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.lastTouchT = performance.now();
    }, true);
    canvasEl.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || !this.enabled) return;
      this.viewTap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    });
    canvasEl.addEventListener('pointerup', (e) => {
      const v = this.viewTap;
      if (!v || v.id !== e.pointerId) return;
      this.viewTap = null;
      if (Math.hypot(e.clientX - v.x, e.clientY - v.y) < 12 && performance.now() - v.t < 350) this.tap(v.x, v.y);
    });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', () => {
      this.locked = false;
    });
    // ---- touch
    this.touch = document.createElement('div');
    this.touch.className = 'rt';
    this.stickZone = document.createElement('div');
    this.stickZone.className = 'rt-stick';
    this.lookZone = document.createElement('div');
    this.lookZone.className = 'rt-look';
    this.base = document.createElement('div');
    this.base.className = 'rt-base';
    this.knob = document.createElement('div');
    this.knob.className = 'rt-knob';
    this.base.append(this.knob);
    this.stickZone.append(this.base);
    const mk = (cls: string, icon: string, label: string, aria: string) => {
      const b = document.createElement('button');
      b.className = `rt-btn ${cls}`;
      b.innerHTML = `<span class="ic">${icon}</span>${label ? `<span class="lb">${label}</span>` : ''}`;
      b.setAttribute('aria-label', aria);
      return b;
    };
    this.btn = {
      draw: mk('rt-draw', ICONS.draw, 'Pull', 'Pull. Hold to bring things in'),
      puff: mk('rt-puff', ICONS.puff, 'Blow', 'Blow. Tap or hold to send things out'),
      jump: mk('rt-jump', ICONS.jump, 'Jump', 'Jump'),
      act: mk('rt-act', ICONS.hand, '', 'Use'),
      pause: mk('rt-pause', ICONS.pause, '', 'Pause'),
    };
    this.touch.append(this.lookZone, this.stickZone, this.btn.jump, this.btn.puff, this.btn.draw, this.btn.act, this.btn.pause);
    this.stickZone.addEventListener('pointerdown', (e) => this.stickStart(e));
    this.stickZone.addEventListener('pointermove', (e) => this.stickMove(e));
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) this.stickZone.addEventListener(ev, (e) => this.stickEnd(e as PointerEvent));
    this.lookZone.addEventListener('pointerdown', (e) => this.lookStartEv(e));
    this.lookZone.addEventListener('pointermove', (e) => this.lookMove(e));
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) this.lookZone.addEventListener(ev, (e) => this.lookEnd(e as PointerEvent));
    this.hold(this.btn.draw, () => ((this.tDraw = true), buzz(8)), () => (this.tDraw = false));
    this.hold(this.btn.puff, () => ((this.tPuff = true), (this.ev.puff = true), buzz(10)), () => (this.tPuff = false));
    this.hold(this.btn.jump, () => ((this.tJump = true), (this.ev.jump = true), buzz(6)), () => (this.tJump = false));
    this.hold(this.btn.act, () => ((this.ev.interact = true), buzz(8)));
    this.hold(this.btn.pause, () => ((this.ev.pause = true), buzz(6)));
  }

  // ------------------------------------------------------------ keys

  private onKey = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const c = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(c)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(c);
    if (c === 'Space') this.ev.jump = true;
    if (c === 'KeyE') this.ev.interact = true;
    if (c === 'KeyQ' || c === 'KeyR') this.holds.set(c, { t0: performance.now(), slot: -2, dir: c === 'KeyQ' ? -1 : 1, fired: false });
    if (c.startsWith('Digit')) {
      const n = Number(c.slice(5));
      if (n >= 1 && n <= 6) {
        this.ev.direct = n - 1;
        this.holds.set(c, { t0: performance.now(), slot: n - 1, dir: 0, fired: false });
      }
    }
    if (c === 'Escape' || c === 'KeyP') this.ev.pause = true;
    if (c === 'KeyJ') this.ev.journal = true;
    if (c === 'Enter') this.ev.confirm = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    this.letGo(e.code);
  };

  /** A switch key let go: a quick press of Q or R switches (a long one already tipped the window out). */
  private letGo(code: string): void {
    const h = this.holds.get(code);
    if (!h) return;
    this.holds.delete(code);
    if (!h.fired && h.dir !== 0) this.ev.slot += h.dir;
  }

  /** Any switch key held long enough tips its window out, once per press. */
  private checkHolds(f: Frame): void {
    const now = performance.now();
    for (const h of this.holds.values()) {
      if (h.fired || now - h.t0 < HOLD_EMPTY * 1000) continue;
      h.fired = true;
      f.empty = h.slot;
    }
  }

  // ------------------------------------------------------------ mouse

  private lastTouchT = -1e9;
  private viewTap: { id: number; x: number; y: number; t: number } | null = null;

  private onMouseDown = (e: MouseEvent) => {
    if (!this.enabled) return;
    // Mouse events a touch made: the touch handlers have it.
    if (performance.now() - this.lastTouchT < 800) return;
    this.lastMX = e.clientX;
    this.lastMY = e.clientY;
    if (e.button === 0) {
      if (this.lockAvailable && !this.locked && !this.menuUp()) {
        this.requestLock();
        // An unlocked click also counts as a tap (for picking tags with the mouse).
        this.tap(e.clientX, e.clientY);
        return;
      }
      if (!this.locked) this.tap(e.clientX, e.clientY);
      this.mouseL = true;
      this.ev.puff = true;
    } else if (e.button === 2) {
      this.mouseR = true;
    } else if (e.button === 1) {
      this.mouseM = true;
      e.preventDefault();
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseL = false;
    if (e.button === 2) this.mouseR = false;
    if (e.button === 1) this.mouseM = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.enabled) return;
    if (this.locked) {
      this.ev.lookX += e.movementX * this.sens;
      this.ev.lookY += e.movementY * this.sens;
      if (e.movementX || e.movementY) this.ev.looked = true;
    } else if (this.mouseR || this.mouseM) {
      // No pointer lock: right-drag (or middle-drag) looks.
      const dx = e.clientX - this.lastMX;
      const dy = e.clientY - this.lastMY;
      this.ev.lookX += dx * 0.0042;
      this.ev.lookY += dy * 0.0042;
      if (dx || dy) this.ev.looked = true;
    }
    this.lastMX = e.clientX;
    this.lastMY = e.clientY;
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    if (Math.abs(e.deltaY) > 2) this.ev.slot += e.deltaY > 0 ? 1 : -1;
  };

  requestLock(): void {
    if (!this.lockAvailable) return;
    try {
      const p = (this.canvasEl as HTMLElement & { requestPointerLock(o?: unknown): Promise<void> | void }).requestPointerLock();
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => (this.locked = false));
    } catch {
      this.locked = false;
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement) {
      this.releasing = true;
      document.exitPointerLock();
    }
  }

  private releasing = false;

  private onLockChange = () => {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.canvasEl;
    if (was && !this.locked) {
      this.mouseL = this.mouseR = this.mouseM = false;
      if (!this.releasing && this.enabled) this.onLockLost();
    }
    this.releasing = false;
  };

  private tap(cx: number, cy: number): void {
    const r = this.root.getBoundingClientRect();
    this.ev.tapped = true;
    this.ev.tapX = cx - r.left;
    this.ev.tapY = cy - r.top;
  }

  // ------------------------------------------------------------ touch

  private hold(b: HTMLElement, down: () => void, up?: () => void): void {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.enabled || this.held.has(b)) return;
      this.held.set(b, e.pointerId);
      capture(b, e.pointerId);
      b.classList.add('down');
      down();
    });
    const release = (e: PointerEvent) => {
      if (this.held.get(b) !== e.pointerId) return;
      this.held.delete(b);
      b.classList.remove('down');
      up?.();
    };
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private stickStart(e: PointerEvent): void {
    if (this.stickId !== null || !this.enabled) return;
    e.preventDefault();
    this.stickId = e.pointerId;
    capture(this.stickZone, e.pointerId);
    this.origin = { x: e.clientX, y: e.clientY };
    this.stickTap = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    this.place();
    this.base.classList.add('on');
    this.knob.style.transform = '';
  }

  private stickMove(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    let dx = e.clientX - this.origin.x;
    let dy = e.clientY - this.origin.y;
    this.stickTap.moved = Math.max(this.stickTap.moved, Math.hypot(e.clientX - this.stickTap.x, e.clientY - this.stickTap.y));
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {
      // The stick follows a thumb that drifts past the rim.
      this.origin.x += (dx / d) * (d - STICK_R);
      this.origin.y += (dy / d) * (d - STICK_R);
      this.place();
      dx = (dx / d) * STICK_R;
      dy = (dy / d) * STICK_R;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    let nx = dx / STICK_R;
    let ny = dy / STICK_R;
    const m = Math.hypot(nx, ny);
    if (m < DEAD) nx = ny = 0;
    else {
      const k = (m - DEAD) / (1 - DEAD) / m;
      nx *= k;
      ny *= k;
    }
    this.stick.x = nx;
    this.stick.y = ny;
    this.stick.rim = m > 0.94;
    this.base.classList.toggle('rim', this.stick.rim);
  }

  private stickEnd(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    this.stickId = null;
    this.base.classList.remove('on', 'rim');
    this.knob.style.transform = '';
    this.stick.x = this.stick.y = 0;
    this.stick.rim = false;
    this.base.style.left = '';
    this.base.style.top = '';
    // A quick touch that barely moved is a tap (a tag hanging on the left).
    if (this.stickTap.moved < 12 && performance.now() - this.stickTap.t < 350) this.tap(this.stickTap.x, this.stickTap.y);
  }

  private stickTap = { x: 0, y: 0, t: 0, moved: 0 };

  /**
   * A press that began on something small (a slot window) and turned into a
   * drag: the stick takes it if it began on the stick's side, the look area if
   * on the look side, as if the thumb had landed there.
   */
  adoptDrag(id: number, x: number, y: number): void {
    if (!this.enabled) return;
    const inside = (e: HTMLElement) => {
      const r = e.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    if (inside(this.stickZone) && this.stickId === null) {
      this.stickId = id;
      capture(this.stickZone, id);
      this.origin = { x, y };
      this.stickTap = { x, y, t: 0, moved: 99 };
      this.place();
      this.base.classList.add('on');
      this.knob.style.transform = '';
    } else if (inside(this.lookZone) && this.lookId === null) {
      this.lookId = id;
      capture(this.lookZone, id);
      this.lookLast = { x, y };
      this.lookStart = { x, y, t: 0, moved: 99 };
    }
  }

  private place(): void {
    const z = this.stickZone.getBoundingClientRect();
    this.base.style.left = `${this.origin.x - z.left}px`;
    this.base.style.top = `${this.origin.y - z.top}px`;
  }

  private lookStartEv(e: PointerEvent): void {
    if (this.lookId !== null || !this.enabled) return;
    e.preventDefault();
    this.lookId = e.pointerId;
    capture(this.lookZone, e.pointerId);
    this.lookLast = { x: e.clientX, y: e.clientY };
    this.lookStart = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
  }

  private lookMove(e: PointerEvent): void {
    if (e.pointerId !== this.lookId) return;
    const dx = e.clientX - this.lookLast.x;
    const dy = e.clientY - this.lookLast.y;
    this.lookLast = { x: e.clientX, y: e.clientY };
    this.lookStart.moved += Math.abs(dx) + Math.abs(dy);
    this.ev.lookX += dx * 0.0062;
    this.ev.lookY += dy * 0.0062;
    if (dx || dy) this.ev.looked = true;
  }

  private lookEnd(e: PointerEvent): void {
    if (e.pointerId !== this.lookId) return;
    this.lookId = null;
    // A short touch that barely moved is a tap: picks a tag or a slot window.
    if (this.lookStart.moved < 12 && performance.now() - this.lookStart.t < 350) this.tap(this.lookStart.x, this.lookStart.y);
  }

  /** Show or hide the touch controls. */
  showTouch(on: boolean): void {
    if (on === this.touchShown) return;
    this.touchShown = on;
    this.touch.classList.toggle('on', on);
    if (!on) this.resetTouch();
  }

  /** Buttons a lesson has not brought in yet are not there at all. */
  setKnown(draw: boolean, puff: boolean, jump: boolean, pause: boolean): void {
    const k = this.known;
    if (k[0] === draw && k[1] === puff && k[2] === jump && k[3] === pause) return;
    k[0] = draw;
    k[1] = puff;
    k[2] = jump;
    k[3] = pause;
    const set = (b: HTMLElement, on: boolean) => {
      b.classList.toggle('gone', !on);
      // A button that leaves mid-press lets go.
      if (!on && this.held.has(b)) {
        this.held.delete(b);
        b.classList.remove('down');
        if (b === this.btn.draw) this.tDraw = false;
        if (b === this.btn.puff) this.tPuff = false;
        if (b === this.btn.jump) this.tJump = false;
      }
    };
    set(this.btn.draw, draw);
    set(this.btn.puff, puff);
    set(this.btn.jump, jump);
    set(this.btn.pause, pause);
  }

  private known = [true, true, true, true];

  setAct(label: string | null): void {
    this.btn.act.classList.toggle('show', !!label);
    const lb = this.btn.act.querySelector('.lb');
    if (label) {
      if (!lb) this.btn.act.insertAdjacentHTML('beforeend', `<span class="lb"></span>`);
      const el = this.btn.act.querySelector('.lb')!;
      if (el.textContent !== label) el.textContent = label;
    }
  }

  private resetTouch(): void {
    this.stickId = null;
    this.lookId = null;
    this.stick.x = this.stick.y = 0;
    this.stick.rim = false;
    this.base.classList.remove('on', 'rim');
    this.knob.style.transform = '';
    this.tDraw = this.tPuff = this.tJump = false;
    for (const b of this.held.keys()) b.classList.remove('down');
    this.held.clear();
  }

  // ------------------------------------------------------------ gamepad

  private pollPad(f: Frame): void {
    const pads = navigator.getGamepads?.();
    if (!pads) return;
    const gp = Array.from(pads).find((p) => p && p.connected);
    if (!gp) return;
    const b = (i: number) => !!gp.buttons[i]?.pressed;
    const edge = (i: number) => b(i) && !this.padPrev[i];
    const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    const lx = dz(gp.axes[0] ?? 0);
    const ly = dz(gp.axes[1] ?? 0);
    const rx = dz(gp.axes[2] ?? 0);
    const ry = dz(gp.axes[3] ?? 0);
    const any = lx || ly || rx || ry || gp.buttons.some((q) => q.pressed);
    if (any) this.padActive = true;
    if (!this.padActive) return;
    if (lx || ly) {
      f.moveX = lx;
      f.moveZ = -ly;
    }
    const look = 2.8 / 60;
    if (rx || ry) {
      f.lookX += rx * Math.abs(rx) * look;
      f.lookY += ry * Math.abs(ry) * look;
      f.looked = true;
    }
    if (b(10)) f.sprint = true;
    if (b(0)) f.jump = true;
    if (edge(0)) f.jumpPressed = true;
    if ((gp.buttons[6]?.value ?? 0) > 0.3) f.draw = true;
    if ((gp.buttons[7]?.value ?? 0) > 0.3) f.puff = true;
    if ((gp.buttons[7]?.value ?? 0) > 0.3 && !this.padPrev[7]) f.puffPressed = true;
    if (edge(2)) f.interact = true;
    // LB and RB: a quick press switches, a long one tips the chosen window out.
    for (const [i, dir] of [
      [4, -1],
      [5, 1],
    ] as const) {
      const key = `Pad${i}`;
      if (edge(i)) this.holds.set(key, { t0: performance.now(), slot: -2, dir, fired: false });
      if (!b(i) && this.padPrev[i]) {
        const h = this.holds.get(key);
        this.holds.delete(key);
        if (h && !h.fired) f.slotDelta += dir;
      }
    }
    if (edge(9)) f.pause = true;
    if (edge(8)) f.journal = true;
    for (let i = 0; i < gp.buttons.length; i++) this.padPrev[i] = i === 7 ? (gp.buttons[7]?.value ?? 0) > 0.3 : b(i);
  }

  // ------------------------------------------------------------ the frame

  /** Read this frame's input and clear the one-shot events. */
  frame(): Frame {
    const f = this.f;
    const k = this.keys;
    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let mz = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (this.stick.x || this.stick.y) {
      mx = this.stick.x;
      mz = -this.stick.y;
    }
    f.moveX = mx;
    f.moveZ = mz;
    f.sprint = k.has('ShiftLeft') || k.has('ShiftRight') || this.stick.rim;
    f.jump = k.has('Space') || this.tJump;
    f.jumpPressed = this.ev.jump;
    f.draw = this.mouseR || this.tDraw || k.has('KeyF');
    f.puff = this.mouseL || this.tPuff;
    f.puffPressed = this.ev.puff;
    f.interact = this.ev.interact;
    f.slotDelta = this.ev.slot;
    f.slotDirect = this.ev.direct;
    f.empty = this.ev.empty;
    f.pause = this.ev.pause;
    f.journal = this.ev.journal;
    f.confirm = this.ev.confirm;
    f.lookX = this.ev.lookX;
    f.lookY = this.ev.lookY;
    f.tapped = this.ev.tapped;
    f.tapX = this.ev.tapX;
    f.tapY = this.ev.tapY;
    f.looked = this.ev.looked;
    this.pollPad(f);
    this.checkHolds(f);
    f.moveX = clamp(f.moveX, -1, 1);
    f.moveZ = clamp(f.moveZ, -1, 1);
    const e = this.ev;
    e.jump = e.puff = e.interact = e.pause = e.journal = e.confirm = e.tapped = e.looked = false;
    e.slot = 0;
    e.direct = -1;
    e.empty = -1;
    e.lookX = e.lookY = 0;
    return f;
  }

  /** Let go of everything (pause, blur, switching games): no stuck input. */
  reset(): void {
    this.keys.clear();
    this.holds.clear();
    this.mouseL = this.mouseR = this.mouseM = false;
    this.resetTouch();
    const e = this.ev;
    e.jump = e.puff = e.interact = e.pause = e.journal = e.confirm = e.tapped = e.looked = false;
    e.slot = 0;
    e.direct = -1;
    e.empty = -1;
    e.lookX = e.lookY = 0;
  }

  /** Any held input right now (for the stuck-input check). */
  anyHeld(): boolean {
    return this.keys.size > 0 || this.mouseL || this.mouseR || this.mouseM || this.tDraw || this.tPuff || this.tJump || this.stickId !== null || this.lookId !== null;
  }
}
