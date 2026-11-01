// On-screen controls for phones and tablets, shown while the last input was a
// touch (or on a coarse pointer before anything has been touched). Under walk
// control: a floating thumbstick that appears where the left thumb lands and
// follows a thumb that drifts, a big act button that repeats while held, and a
// tool button. Each control tracks its own pointer, so walking and acting work
// together. Under point control the farm itself is the control: one finger
// paints jobs, two fingers pan and pinch; a clear button drops queued jobs.

import type { Input } from '../game/input';
import type { Verb, WorldState } from '../sim/types';
import { VERB_NAMES } from './describe';
import { el, setHtml, setText, toggle } from './dom';
import { icon, type IconId } from './icons';

export interface TouchHost {
  input: Input;
  state(): WorldState;
  /** What the act button would do right now. */
  aimVerb(): { verb: Verb | null; ok: boolean; label?: string; icon?: IconId } | null;
  /** The can's water while it is in hand, for the gauge on the act button. */
  water(): { frac: number; empty: boolean; low: boolean } | null;
  cycleTool(): void;
  toolIcon(): IconId;
  toolName(): string;
  clearJobs(): void;
}

const VERB_ICON: Record<Verb, IconId> = { till: 'hoe', water: 'can', plant: 'seeds', harvest: 'hands', tend: 'hands', clear: 'hoe', build: 'build', scare: 'hands', refill: 'can' };
const STICK_R = 50;
const DEAD = 0.16;
/** A touch on the stick zone that moves less than this and lifts sooner is a tap on the farm. */
const TAP_SLOP = 10;
const TAP_MS = 350;

export class TouchControls {
  readonly el = el('div', 'touch');
  private zone = el('div', 'ts-zone');
  private base = el('div', 'ts-base', '<span class="ts-ring"></span>');
  private knob = el('div', 'ts-knob');
  private act = el('button', 'tb tb-act', '<span class="ic"></span><span class="tb-t"></span><span class="tb-water"><i></i></span>');
  private tool = el('button', 'tb tb-tool', '<span class="ic"></span><span class="tb-t"></span>');
  private clear = el('button', 'tb tb-clear', '<span class="tb-t">Clear jobs</span>');
  private stickId: number | null = null;
  private origin = { x: 0, y: 0 };
  /** Where and when the stick's touch began, to tell a tap from a push. */
  private press = { x: 0, y: 0, t: 0, far: false };
  private held = new Map<HTMLElement, number>();
  /** Lab hook (?touch): show the controls whatever the device. */
  forced = false;
  shown = false;

  constructor(private host: TouchHost) {
    this.base.append(this.knob);
    this.zone.append(this.base);
    this.act.setAttribute('aria-label', 'Use the tool on the plot in front. Hold to keep going');
    this.tool.setAttribute('aria-label', 'Next tool');
    this.clear.setAttribute('aria-label', 'Clear queued jobs');
    this.el.append(this.zone, this.tool, this.act, this.clear);

    this.zone.addEventListener('pointerdown', (e) => this.stickStart(e));
    this.zone.addEventListener('pointermove', (e) => this.stickMove(e));
    this.zone.addEventListener('pointerup', (e) => this.stickEnd(e));
    this.zone.addEventListener('pointercancel', (e) => this.stickEnd(e));
    this.zone.addEventListener('lostpointercapture', (e) => this.stickEnd(e));

    this.hold(
      this.act,
      () => {
        host.input.act();
        host.input.setActHeld(true);
        buzz(8);
      },
      () => host.input.setActHeld(false),
    );
    this.hold(this.tool, () => {
      host.cycleTool();
      buzz(6);
    });
    this.hold(this.clear, () => {
      host.clearJobs();
      buzz(10);
    });

    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });
  }

  /** Once per frame. */
  update(): void {
    const s = this.host.state();
    const input = this.host.input;
    const touchy = input.deviceKnown ? input.lastKind === 'touch' : matchMedia('(pointer: coarse)').matches;
    const show = this.forced || touchy;
    if (show !== this.shown) {
      this.shown = show;
      if (!show) this.reset();
    }
    const walk = s.rules.control === 'walk';
    toggle(this.el, 'show', show);
    toggle(this.el, 'walk', walk);
    toggle(this.clear, 'on', show && !walk && s.jobs.length > 0);
    if (!show || !walk) return;
    const aim = this.host.aimVerb();
    const verb = aim?.verb ?? null;
    const water = this.host.water();
    // With nothing to do, the button wears the tool in hand (a can, not a hand, while the can is held).
    setHtml(this.act.querySelector('.ic')!, icon(aim?.icon ?? (verb ? VERB_ICON[verb] : this.host.toolIcon())));
    // A verb on the button, always: Pick for the bugs, Shoo for a crow. An empty can says so.
    const word = aim?.label ?? (verb ? actWord(verb) : '');
    setText(this.act.querySelector('.tb-t')!, water?.empty && !(aim && aim.ok) ? 'Empty' : word);
    toggle(this.act, 'no', !(aim && aim.ok));
    // With the can in hand the button carries its water gauge.
    toggle(this.act, 'can', !!water);
    toggle(this.act, 'empty', !!water?.empty);
    toggle(this.act, 'low', !!water?.low && !water.empty);
    if (water) (this.act.querySelector('.tb-water > i') as HTMLElement).style.width = `${Math.round(water.frac * 100)}%`;
    setHtml(this.tool.firstElementChild!, icon(this.host.toolIcon()));
    setText(this.tool.lastElementChild!, this.host.toolName());
  }

  private hold(b: HTMLElement, down: () => void, up?: () => void): void {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.held.has(b)) return;
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
    if (this.stickId !== null) return;
    e.preventDefault();
    this.stickId = e.pointerId;
    capture(this.zone, e.pointerId);
    this.origin = { x: e.clientX, y: e.clientY };
    this.press = { x: e.clientX, y: e.clientY, t: performance.now(), far: false };
    this.place();
    this.base.classList.add('active');
    this.knob.style.transform = '';
  }

  private stickMove(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    if (Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > TAP_SLOP) this.press.far = true;
    let dx = e.clientX - this.origin.x;
    let dy = e.clientY - this.origin.y;
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
      // Rescale past the dead zone so a small push is a slow walk.
      const k = (m - DEAD) / (1 - DEAD) / m;
      nx *= k;
      ny *= k;
    }
    this.host.input.setStick(nx, ny);
  }

  private stickEnd(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    // A quick tap that never pushed the stick was meant for the farm under it: walk there and act,
    // and the stick goes back to rest rather than staying where the tap landed.
    if (e.type === 'pointerup' && !this.press.far && performance.now() - this.press.t < TAP_MS) {
      this.host.input.tapScreen(e.clientX, e.clientY);
      this.base.style.left = '';
      this.base.style.top = '';
    }
    this.stickId = null;
    this.base.classList.remove('active');
    this.knob.style.transform = '';
    this.host.input.setStick(0, 0);
  }

  private place(): void {
    const z = this.zone.getBoundingClientRect();
    this.base.style.left = `${this.origin.x - z.left}px`;
    this.base.style.top = `${this.origin.y - z.top}px`;
  }

  private reset(): void {
    this.stickId = null;
    this.base.classList.remove('active');
    this.knob.style.transform = '';
    this.host.input.setStick(0, 0);
    this.host.input.setActHeld(false);
    for (const b of this.held.keys()) b.classList.remove('down');
    this.held.clear();
  }
}

/** The word on the act button for a verb: short, and always a verb. */
export function actWord(verb: Verb): string {
  return verb === 'tend' ? 'Pick' : verb === 'scare' ? 'Shoo' : VERB_NAMES[verb];
}

/** A short buzz on phones that have one. */
export function buzz(ms: number | number[]): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Not allowed before a gesture, or not supported.
  }
}

function capture(e: HTMLElement, id: number): void {
  try {
    e.setPointerCapture(id);
  } catch {
    // Synthetic or already released pointers.
  }
}
