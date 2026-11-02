// The little that sits on the glass: a crosshair that changes when something
// can be drawn, a count beside it, coins in plain type, a sun-and-moon notch
// for the hour, a use prompt, and the field journal: a torn page holding the
// one thing to do now (the current lesson), or a goal just done. Each piece
// shows only once a lesson has brought it in. The canister's contents live on
// the bellows and prices on the Exchange's board; the pause page holds the
// whole journal, notes and controls.

import { GOALS, fmtCoins, journalGoals, type GoalId } from './defs';

const BOX = `<svg class="box" viewBox="0 0 20 20"><path d="M3 4 Q10 2.6 17 3.6 Q17.6 10 16.6 17 Q9 17.6 3.4 16.8 Q2.6 10 3 4 Z" fill="none" stroke="currentColor" stroke-width="1.4"/><path class="tick" d="M5 10 L9 14.5 L17 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
import { hash2 } from './noise';

/** tag: tags hang and you choose by looking (a pin-prick ring, so it never covers a tag's words); none: tags hang on touch, chosen by tapping. */
type CrossState = 'idle' | 'target' | 'prickly' | 'tag' | 'none' | 'sell' | 'pen' | 'feeder';

/** What a window holds, as a small icon drawn in it: a downy, one of the three foods, or fluff. */
export type SlotIcon = 'downy' | 'clover' | 'root' | 'berry' | 'fluff';

const ICON: Record<SlotIcon, string> = {
  downy: `<circle cx="0" cy="1" r="7.5"/><circle cx="-2.6" cy="0" r="1.3" class="f"/><circle cx="2.6" cy="0" r="1.3" class="f"/>`,
  clover: `<circle cx="0" cy="-3.6" r="3.4"/><circle cx="-3.4" cy="1.6" r="3.4"/><circle cx="3.4" cy="1.6" r="3.4"/><path d="M0 2 L0 8.5"/>`,
  root: `<path d="M-6 -6 Q0 -4 6 -6 L1 8 Q0 9.5 -1 8 Z"/><path d="M-2 -7.5 L-3.5 -10.5 M2 -7.5 L3.5 -10.5"/>`,
  berry: `<circle cx="-3" cy="1.5" r="3.3"/><circle cx="3" cy="1.5" r="3.3"/><circle cx="0" cy="-3.6" r="3.3"/>`,
  fluff: `<path d="M0 9 L0 -1"/><path d="M0 -1 L-6 -6 M0 -1 L6 -6 M0 -1 L0 -8.5 M0 -1 L-7.5 0 M0 -1 L7.5 0"/>`,
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function setText(e: HTMLElement, t: string): void {
  if (e.textContent !== t) e.textContent = t;
}

/** A jagged torn top edge as a CSS polygon. */
function tornClip(seed: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= 28; i++) {
    const x = (i / 28) * 100;
    const y = 1.2 + hash2(i, seed) * 3.6;
    pts.push(`${x.toFixed(1)}% ${y.toFixed(1)}%`);
  }
  pts.push('100% 100%', '0% 100%');
  return `polygon(${pts.join(',')})`;
}

export interface PageLine {
  text: string;
  done: boolean;
  /** Draw the strike and tick now (it was just done). */
  fresh: boolean;
  /** A plain line of news, with no box to tick (a fact is not a task). */
  plain?: boolean;
}

/**
 * A press on a small target (a slot window, the bellows' body): a tap only if it lifts without having dragged; a
 * drag (10 px or more) is handed on to the stick or the look, and lifting after it chooses nothing (round 8: a
 * window was chosen the moment a thumb landed, so walks to the crate switched fluff to clover heads).
 */
export class Press {
  static readonly DRAG = 10;
  id = -1;
  x = 0;
  y = 0;
  private dragged = false;
  down(id: number, x: number, y: number): void {
    this.id = id;
    this.x = x;
    this.y = y;
    this.dragged = false;
  }
  /** True the moment the press becomes a drag. */
  move(id: number, x: number, y: number): boolean {
    if (id !== this.id || this.dragged || Math.hypot(x - this.x, y - this.y) < Press.DRAG) return false;
    this.dragged = true;
    return true;
  }
  /** Lifted: a tap if it never dragged. */
  up(id: number): boolean {
    if (id !== this.id) return false;
    this.id = -1;
    return !this.dragged;
  }
  cancel(id: number): void {
    if (id === this.id) this.id = -1;
  }
}

export class Hud {
  /** Seconds a window must be held to tip it out. */
  static readonly HOLD_EMPTY = 0.55;
  readonly el = el('div', 'rh');
  private cross = el('div', 'rh-cross');
  private count = el('div', 'rh-count');
  private coins = el('div', 'rh-coins');
  private arc = el('div', 'rh-arc');
  private arcDot: SVGCircleElement;
  private arcMoon: SVGPathElement;
  private prompt = el('div', 'rh-prompt');
  private say = el('div', 'rh-say');
  private zone = el('div', 'rh-zone');
  /** Points along the screen's edge at a lesson's spot when it is out of view. */
  private edge = el('div', 'rh-edge', `<svg viewBox="-16 -16 32 32"><path d="M-7 -11 L7 0 L-7 11" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
  private edgeOn = false;
  private page = el('div', 'rh-page');
  private pageBody = el('div', 'rh-page-body');
  private pause = el('div', 'rh-pause');
  private pauseBody = el('div', 'rh-pause-body');
  private click = el('div', 'rh-click');
  private fade = el('div', 'rh-fade');
  /** The rare one's fed window: a small ring over it that empties as its calm runs out (the seventh playtest's ran out unseen). */
  private fed = el('div', 'rh-fed', `<svg viewBox="-12 -12 24 24"><circle r="8" fill="none" stroke-width="4.4" class="f-ink"/><circle r="8" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="50.3" stroke-dashoffset="0" transform="rotate(-90)" class="f-arc"/></svg>`);
  private fedShown = -1;
  readonly slotBtns: HTMLButtonElement[] = [];
  private bellowsBtn = el('button', 'rh-bellows');
  /** A cream chevron over the slot window a lesson points at, like the markers in the world. */
  private slotPoint = el('div', 'rh-slotpoint');
  /** A cream ring round the chosen window, on every device, so the choice reads at a glance. */
  private slotSel = el('div', 'rh-slotsel');
  /** A small icon in each window saying what it holds. */
  private slotIcons: { el: HTMLElement; key: string }[] = [];
  private crossState: CrossState | '' = '';
  private shownCoins = -1;
  private coinTarget = 0;
  private coinVal = 0;
  private sayT = 0;
  private pageT = 0;
  private zoneT = 0;
  private countT = 0;
  private countKey = '';
  pauseOpen = false;
  private pauseFocus = 0;
  pageUp = false;
  /** The lesson line on the page, if one is up. */
  private lessonLine = '';
  private lessonDone = false;
  /** With no lesson up, the day's orders and the next goal sit on the page instead; what they are, and what is showing. */
  private goalWant: { text: string; done: boolean; plain?: boolean }[] = [];
  private goalShown = '';
  /** A window held down: which, since when (a long press tips it out). */
  private slotHold: { i: number; id: number; t: number; fired: boolean; x: number; y: number } | null = null;
  onResume: () => void = () => {};
  onGames: () => void = () => {};
  onSlot: (i: number) => void = () => {};
  /** A long press on a window: tip it out. */
  onEmpty: (i: number) => void = () => {};
  /** A press on a window that turned into a drag: walk or look with it instead (pointer id, where it began). */
  onSlotDrag: (id: number, x: number, y: number) => void = () => {};
  onCycle: () => void = () => {};

  constructor() {
    this.cross.innerHTML = `<svg viewBox="-24 -24 48 48"><g class="x-idle"><circle r="2.2" fill="currentColor"/></g><g class="x-target" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M-12 -6 L-7 0 L-12 6"/><path d="M12 -6 L7 0 L12 6"/><circle r="2" fill="currentColor" stroke="none"/></g><g class="x-prickly" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M-6 -6 L6 6 M6 -6 L-6 6"/></g><g class="x-tag" fill="none" stroke="currentColor" stroke-width="1.1"><circle r="1.7"/></g><g class="x-sell" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M-12 -2 L-5 8 L5 8 L12 -2"/><circle cy="-6" r="2.4" fill="currentColor" stroke="none"/></g><g class="x-pen" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M-12 9 L-12 1 M-4 9 L-4 -1 M4 9 L4 -1 M12 9 L12 1 M-13 4 Q0 -1 13 4"/><circle cy="-8" r="2.4" fill="currentColor" stroke="none"/></g><g class="x-feeder" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M-10 -2 L10 -2 L3 7 L-3 7 Z"/><path d="M0 7 L0 12"/><circle cy="-8" r="2.4" fill="currentColor" stroke="none"/></g><circle class="x-tug" r="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="81.7" stroke-dashoffset="81.7" transform="rotate(-90)"/><circle class="x-ink" r="20" fill="none" stroke-width="5.4"/><circle class="x-left" r="20" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="125.7" stroke-dashoffset="0" transform="rotate(-90)"/></svg>`;
    this.tugRing = this.cross.querySelector('.x-tug')!;
    this.leftRing = this.cross.querySelector('.x-left')!;
    this.arc.innerHTML = `<svg viewBox="0 0 84 30"><path d="M4 27 A38 24 0 0 1 80 27" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 3" opacity="0.7"/><line x1="2" y1="27" x2="82" y2="27" stroke="currentColor" stroke-width="1.4" opacity="0.7"/><circle class="sun" r="3.6" fill="currentColor"/><path class="moon" d="M0 -4 A4 4 0 1 0 0 4 A3 3 0 1 1 0 -4 Z" fill="currentColor"/></svg>`;
    this.arcDot = this.arc.querySelector('.sun')!;
    this.arcMoon = this.arc.querySelector('.moon')!;
    this.page.style.clipPath = tornClip(3);
    this.page.append(this.pageBody);
    this.pause.append(this.pauseBody);
    this.pause.style.clipPath = tornClip(8);
    this.click.textContent = 'Click to look around';
    for (let i = 0; i < 5; i++) {
      const b = el('button', 'rh-slotbtn');
      b.setAttribute('aria-label', `Window ${i + 1}. Tap to choose, hold to empty`);
      const press = new Press();
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          b.setPointerCapture(e.pointerId);
        } catch {
          // Synthetic pointers.
        }
        // Nothing is chosen yet: a window is chosen only when the finger lifts without dragging (round 8: a
        // walking thumb that landed on a window switched fluff to clover heads, and Blow sent food at the crate).
        // Held on, after a moment the window tips out (the ring fills while you hold).
        press.down(e.pointerId, e.clientX, e.clientY);
        this.slotHold = { i, id: e.pointerId, t: 0, fired: false, x: e.clientX, y: e.clientY };
        b.classList.add('holding');
      });
      // A thumb that lands on a window and moves meant to walk (or look): hand it over, and tip nothing out.
      b.addEventListener('pointermove', (e) => {
        const h = this.slotHold;
        if (!h || h.id !== e.pointerId || h.fired || !press.move(e.pointerId, e.clientX, e.clientY)) return;
        this.slotHold = null;
        b.classList.remove('holding');
        this.onSlotDrag(e.pointerId, h.x, h.y);
      });
      const release = (e: PointerEvent) => {
        press.cancel(e.pointerId);
        if (this.slotHold?.id !== e.pointerId) return;
        this.slotHold = null;
        b.classList.remove('holding');
      };
      // Lifted without dragging (and not held long enough to tip it out): that window is chosen.
      b.addEventListener('pointerup', (e) => {
        const h = this.slotHold;
        const tap = press.up(e.pointerId);
        release(e);
        if (tap && h && h.id === e.pointerId && !h.fired) this.onSlot(i);
      });
      b.addEventListener('pointercancel', release);
      b.addEventListener('lostpointercapture', release);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      this.slotBtns.push(b);
    }
    for (let i = 0; i < 5; i++) this.slotIcons.push({ el: el('div', 'rh-slotico'), key: '' });
    this.bellowsBtn.setAttribute('aria-label', 'Next window');
    // The bellows' body flicks to the next window, also only on a lift without a drag (a drag hands over to the look or the stick).
    const body = new Press();
    this.bellowsBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        this.bellowsBtn.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic pointers.
      }
      body.down(e.pointerId, e.clientX, e.clientY);
    });
    this.bellowsBtn.addEventListener('pointermove', (e) => {
      if (body.move(e.pointerId, e.clientX, e.clientY)) this.onSlotDrag(e.pointerId, body.x, body.y);
    });
    this.bellowsBtn.addEventListener('pointerup', (e) => {
      if (body.up(e.pointerId)) this.onCycle();
    });
    this.bellowsBtn.addEventListener('pointercancel', (e) => body.cancel(e.pointerId));
    this.el.append(this.fed, this.cross, this.count, this.coins, this.arc, this.prompt, this.say, this.zone, this.edge, this.page, this.click, ...this.slotIcons.map((q) => q.el), this.slotSel, this.bellowsBtn, ...this.slotBtns, this.slotPoint, this.pause, this.fade);
    this.pause.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!t) return;
      if (t.dataset.act === 'resume') this.onResume();
      if (t.dataset.act === 'games') this.onGames();
    });
  }

  setCross(s: CrossState): void {
    if (s === this.crossState) return;
    this.crossState = s;
    this.cross.dataset.s = s;
  }

  /**
   * Keep the count off world words under the crosshair (the sell crate's sign read "Sell fl2ff"): their box in
   * CSS px from the crosshair's middle (all 0 for none). The count goes above the crosshair, or above or below
   * the words, whichever is nearest its usual place and clear of them.
   */
  keepCountOff(top: number, bottom: number, left: number, right: number): void {
    const w = (this.count.textContent?.length ?? 0) * 8 + 14;
    // Clear sideways (or no words at all): its usual place. Else above the crosshair, else above the words, else below.
    let dy = 10;
    if (bottom > top && right > 16 && left < 16 + w && 7 < bottom && 31 > top) dy = -34 > bottom || -10 < top ? -31 : top - 24 >= -150 ? top - 24 : bottom + 4;
    dy = Math.round(dy);
    if (dy === this.countDy) return;
    this.countDy = dy;
    this.count.style.top = dy === 10 ? '' : `calc(50% + ${dy}px)`;
  }
  private countDy = 10;

  /** The count beside the crosshair: a number, with the kind's name briefly after it changes. */
  setCount(n: number, name: string, cap: number): void {
    const key = `${n}|${name}`;
    if (key !== this.countKey) {
      const kindChanged = !this.countKey.endsWith(`|${name}`);
      this.countKey = key;
      if (kindChanged) this.countT = 2.2;
      if (n <= 0) {
        setText(this.count, '');
        this.count.classList.remove('named');
        return;
      }
    }
    if (n <= 0) return;
    const named = this.countT > 0;
    setText(this.count, named ? `${n} ${name}` : `${n}`);
    this.count.classList.toggle('named', named);
    this.count.classList.toggle('full', n >= cap);
  }

  setCoins(v: number, dt: number): void {
    this.coinTarget = v;
    // Tick towards the real number so sales read as arriving.
    const d = this.coinTarget - this.coinVal;
    this.coinVal = Math.abs(d) < 1 ? this.coinTarget : this.coinVal + d * Math.min(1, dt * 8);
    const shown = Math.round(this.coinVal);
    if (shown !== this.shownCoins) {
      this.shownCoins = shown;
      this.coins.innerHTML = `<i></i>${fmtCoins(shown)}`;
    }
  }

  snapCoins(v: number): void {
    this.coinVal = this.coinTarget = v;
    this.shownCoins = -1;
  }

  /** The hour on a little arc: the sun rides it by day, the moon by night. */
  setHour(h: number): void {
    const day = h >= 5.5 && h < 19.5;
    const t = day ? (h - 5.5) / 14 : ((h - 19.5 + 24) % 24) / 10;
    const a = Math.PI * (1 - t);
    const x = 42 + Math.cos(a) * 38;
    const y = 27 - Math.sin(a) * 24;
    this.arcDot.setAttribute('cx', x.toFixed(1));
    this.arcDot.setAttribute('cy', y.toFixed(1));
    this.arcDot.style.display = day ? '' : 'none';
    this.arcMoon.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    this.arcMoon.style.display = day ? 'none' : '';
  }

  setPrompt(text: string | null, key: string | null): void {
    if (!text) {
      this.prompt.classList.remove('on');
      return;
    }
    const html = key ? `<kbd>${key}</kbd>${text}` : text;
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
    this.prompt.classList.add('on');
  }

  /** Where the use prompt sits: just under the hanging tags while they are down (y in CSS px), or its usual place (null). */
  placePrompt(y: number | null): void {
    const top = y === null ? '' : `${Math.round(y)}px`;
    if (this.prompt.style.top !== top) this.prompt.style.top = top;
  }

  /** A short plain line under the crosshair: why something did not happen. */
  note(text: string, secs = 2.2): void {
    setText(this.say, text);
    this.say.classList.add('on');
    this.sayT = secs;
  }

  /** Show only what the lessons have brought in: the crosshair and count (with the bellows), coins, the hour. */
  setKnown(cross: boolean, coins: boolean, clock: boolean): void {
    this.cross.classList.toggle('gone', !cross);
    this.count.classList.toggle('gone', !cross);
    this.coins.classList.toggle('gone', !coins);
    this.arc.classList.toggle('gone', !clock);
  }

  /** The edge pointer at (x, y) CSS px, turned to angle a (radians, 0 points right); null hides it. */
  setEdge(x: number | null, y = 0, a = 0): void {
    const on = x !== null;
    if (on !== this.edgeOn) {
      this.edgeOn = on;
      this.edge.classList.toggle('on', on);
    }
    if (on) this.edge.style.transform = `translate(${x!.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${a.toFixed(3)}rad)`;
  }

  /**
   * The current lesson on the journal page: one line that stays until done,
   * then ticks. '' takes it down. under: calm lines kept under it (an open
   * order's tally: the sixth playtest's first order lost the page to two
   * lessons in a second); over: calm lines that lead it (an order or hunt in
   * hand over the stray line, which hid the hunt's step).
   */
  setLesson(line: string, done: boolean, under: string[] = [], over: string[] = []): void {
    if (!line) {
      if (this.lessonLine) {
        this.lessonLine = '';
        this.lessonExtra = '';
        this.hidePage();
        this.showGoal();
      }
      return;
    }
    this.goalShown = '';
    const extra = `${over.join('|')}#${under.join('|')}`;
    if (line !== this.lessonLine || extra !== this.lessonExtra) {
      // A new lesson slides in as a new page; the same lesson reworded (another device), or its order lines moving, just changes.
      const fresh = line !== this.lessonLine && (!this.lessonLine || this.lessonDone || !this.pageUp);
      this.lessonLine = line;
      this.lessonDone = done;
      this.lessonExtra = extra;
      const calm = (t: string) => `<li class="calm">${BOX}<span>${t}</span></li>`;
      this.pageBody.innerHTML = `<ul>${over.map(calm).join('')}<li class="lesson-line ${done ? 'done now' : ''}">${BOX}<span>${line}</span></li>${under.map(calm).join('')}</ul>`;
      this.page.classList.add('lesson');
      this.page.classList.remove('note');
      if (fresh) {
        this.page.classList.remove('up');
        void this.page.offsetWidth;
      }
      this.page.classList.add('up');
      this.pageUp = true;
      this.pageT = 0;
      return;
    }
    if (done !== this.lessonDone) {
      this.lessonDone = done;
      const li = this.pageBody.querySelector('li.lesson-line');
      li?.classList.toggle('done', done);
      li?.classList.toggle('now', done);
    }
  }
  private lessonExtra = '';

  /** Take a note down early if it still says this (it no longer applies: something came aboard). */
  clearNote(text: string): void {
    if (this.sayT > 0 && this.say.textContent === text) {
      this.sayT = 0;
      this.say.classList.remove('on');
    }
  }

  get lessonUp(): boolean {
    return !!this.lessonLine;
  }

  /**
   * With no lesson up, the day's orders (with their tally) and the next goal
   * sit on the journal page: a few calm lines, the same page. A goal just done
   * (a timed page) has the page first. An empty list puts it away.
   */
  setGoal(lines: { text: string; done: boolean; plain?: boolean }[]): void {
    this.goalWant = lines;
    if (this.lessonLine || this.pageT > 0) return;
    this.showGoal();
  }

  private showGoal(): void {
    const lines = this.goalWant;
    if (this.lessonLine || this.pageT > 0) return;
    if (!lines.length) {
      if (this.goalShown) {
        this.goalShown = '';
        this.hidePage();
      }
      return;
    }
    const line = lines.map((l) => `${l.done ? '+' : ''}${l.plain ? '~' : ''}${l.text}`).join('|');
    if (line === this.goalShown && this.pageUp) return;
    const fresh = !this.pageUp;
    this.goalShown = line;
    // A line of news ("Order filled. New ones come at dawn.") has no box to tick: a fact is not a task.
    this.pageBody.innerHTML = `<ul>${lines.map((l) => `<li class="${l.done ? 'done' : ''} ${l.plain ? 'plain' : ''}">${l.plain ? '' : BOX}<span>${l.text}</span></li>`).join('')}</ul>`;
    this.page.classList.add('lesson', 'goal');
    this.page.classList.remove('note');
    if (fresh) {
      this.page.classList.remove('up');
      void this.page.offsetWidth;
    }
    this.page.classList.add('up');
    this.pageUp = true;
  }

  /**
   * A wild downy digging in against the pull: a ring round the crosshair fills
   * as it tires (0 hides it). left: for one that breaks free if you are slow (a
   * brook diving for the pond, a thistle), the share of its time left, shown
   * as an outer ring that shrinks (-1: no limit, no outer ring). The fifth
   * playtest's brooks dove after about 3 s with nothing to say so. back: it is
   * pulling back now (the ring warm and pulsing: let go); strain: you are
   * holding on through it (the ring shakes: it is about to slip free).
   */
  setTug(k: number, left = -1, back = false, strain = 0, tell = false): void {
    const v = k > 0.02 || back || tell ? Math.max(0.03, Math.min(1, k)) : 0;
    const l = v > 0 && left >= 0 ? Math.min(1, left) : -1;
    const b = v > 0 && back;
    const st = b && strain > 0.02;
    const tl = v > 0 && tell && !b;
    if (Math.abs(v - this.tugShown) < 0.01 && Math.abs(l - this.leftShown) < 0.01 && b === this.backShown && st === this.strainShown && tl === this.tellShown) return;
    this.tugShown = v;
    this.leftShown = l;
    this.backShown = b;
    this.strainShown = st;
    this.tellShown = tl;
    // It puffs up to pull back (the tell): the ring swells, pale gold, just before it turns warm.
    this.cross.classList.toggle('tell', tl);
    this.cross.classList.toggle('tug', v > 0);
    this.cross.classList.toggle('timed', l >= 0);
    this.cross.classList.toggle('late', l >= 0 && l < 0.35);
    // It pulls back: the ring turns warm and pulses; held on through it, it shakes.
    this.cross.classList.toggle('back', b);
    this.cross.classList.toggle('strain', st);
    this.tugRing.style.strokeDashoffset = `${(1 - v) * 81.7}`;
    if (l >= 0) this.leftRing.style.strokeDashoffset = `${(1 - l) * 125.7}`;
  }
  private tugShown = 0;
  private leftShown = -1;
  private backShown = false;
  private strainShown = false;
  private tellShown = false;
  private tugRing!: SVGCircleElement;
  private leftRing!: SVGCircleElement;
  /** For checks: the tug ring's fill, the time-left ring's share (-1 hidden), and whether it shows a pull back (and you straining against it). */
  tugState(): { tug: number; left: number; back: boolean; strain: boolean; tell: boolean } {
    return { tug: this.tugShown, left: this.leftShown, back: this.backShown, strain: this.strainShown, tell: this.tellShown };
  }

  /** The rare one's fed window over it at (x, y) CSS px, its share left 0..1; share < 0 hides it. */
  setFed(x: number, y: number, share: number): void {
    const on = share >= 0;
    this.fed.classList.toggle('on', on);
    if (!on) {
      this.fedShown = -1;
      return;
    }
    this.fed.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    if (Math.abs(share - this.fedShown) < 0.01) return;
    this.fedShown = share;
    (this.fed.querySelector('.f-arc') as SVGCircleElement).style.strokeDashoffset = `${((1 - share) * 50.3).toFixed(2)}`;
    this.fed.classList.toggle('low', share < 0.3);
  }

  /** For checks: the fed window's share left (-1 hidden). */
  fedState(): number {
    return this.fedShown;
  }

  showZone(name: string): void {
    setText(this.zone, name);
    this.zone.classList.add('on');
    this.zoneT = 3.2;
  }

  setClick(on: boolean): void {
    this.click.classList.toggle('on', on);
  }

  /** Slide the journal page up with these lines, for a few seconds. */
  showPage(title: string, lines: PageLine[], secs = 6): void {
    const rows = lines
      .map(
        (l) =>
          `<li class="${l.done ? 'done' : ''} ${l.fresh ? 'fresh' : ''} ${l.plain ? 'plain' : ''}">${l.plain ? '' : BOX}<span>${l.text}</span></li>`,
      )
      .join('');
    this.pageBody.innerHTML = `<h4>${title}</h4><ul>${rows}</ul>`;
    this.lessonLine = '';
    this.lessonExtra = '';
    this.goalShown = '';
    this.page.classList.remove('up', 'lesson', 'goal');
    void this.page.offsetWidth;
    this.page.classList.add('up');
    this.pageUp = true;
    this.pageT = secs;
  }

  hidePage(): void {
    this.page.classList.remove('up');
    this.pageUp = false;
    this.pageT = 0;
    this.goalShown = '';
  }

  /**
   * The pause page: the journal so far (done goals struck, and the one you are
   * on; the ones to come stay hidden, as the third playtest found all eleven on
   * day 1), what the lessons taught so far, and the controls learned.
   */
  showPause(when: string, goals: GoalId[], now: string, notes: string[], keys: string): void {
    this.pauseOpen = true;
    this.pauseFocus = 0;
    // Struck goals in the order you did them, then the one you are on, last.
    const goalRows = journalGoals(goals)
      .map((g) => `<li class="${g.done ? 'done' : ''}">${g.text}</li>`)
      .join('');
    const done = GOALS.filter((g) => goals.includes(g.id)).length;
    const nowRow = now ? `<p class="now">${now}</p>` : '';
    const noteRows = notes.length ? `<h4>Notes</h4><ul class="notes">${notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : '';
    this.pauseBody.innerHTML = `<div class="when">${when}</div>${nowRow}<h4>Journal, ${done} done</h4><ol>${goalRows}</ol>${noteRows}<p class="keys">${keys}</p><div class="acts"><button data-act="resume" class="focus">Back to the ranch</button><button data-act="games">Games and settings</button></div>`;
    this.pause.classList.add('on');
    this.el.classList.add('paused');
  }

  hidePause(): void {
    this.pauseOpen = false;
    this.pause.classList.remove('on');
    this.el.classList.remove('paused');
  }

  /** Arrow keys and Enter drive the pause page. */
  pauseKey(dir: number, confirm: boolean): void {
    const btns = Array.from(this.pause.querySelectorAll<HTMLButtonElement>('button'));
    if (dir) {
      this.pauseFocus = (this.pauseFocus + dir + btns.length) % btns.length;
      btns.forEach((b, i) => b.classList.toggle('focus', i === this.pauseFocus));
    }
    if (confirm) btns[this.pauseFocus]?.click();
  }

  /** Sleep: the view dims to dark and comes back. */
  dim(): void {
    this.fade.classList.remove('go');
    void this.fade.offsetWidth;
    this.fade.classList.add('go');
  }

  /**
   * The chosen window's ring and each window's icon (seen: the windows are on
   * screen; r: a window's radius in CSS px; icons: what each holds).
   */
  markSlots(spots: ({ x: number; y: number } | null)[], seen: boolean, sel: number, r: number, icons: (SlotIcon | null)[]): void {
    const at = seen ? spots[sel] : null;
    this.slotSel.classList.toggle('on', !!at);
    if (at) {
      const d = Math.round(2 * r + 9);
      this.slotSel.style.width = this.slotSel.style.height = `${d}px`;
      this.slotSel.style.transform = `translate(${(at.x - d / 2).toFixed(0)}px, ${(at.y - d / 2).toFixed(0)}px)`;
    }
    // Icons only where a window is big enough to carry one.
    const big = r >= 10;
    this.slotIcons.forEach((q, i) => {
      const s = spots[i];
      const key = seen && big && s ? (icons[i] ?? '') : '';
      if (key !== q.key) {
        q.key = key;
        q.el.innerHTML = key ? `<svg viewBox="-12 -12 24 24">${ICON[key as SlotIcon]}</svg>` : '';
        q.el.classList.toggle('on', !!key);
      }
      if (key && s) {
        const d = Math.round(r * 1.25);
        q.el.style.width = q.el.style.height = `${d}px`;
        q.el.style.transform = `translate(${(s.x - d / 2).toFixed(0)}px, ${(s.y - d / 2).toFixed(0)}px)`;
      }
    });
  }

  /** Tap targets over the bellows: one per slot window, sized to their spacing, and the body behind them. */
  placeSlots(spots: ({ x: number; y: number } | null)[], show: boolean, body: { x0: number; y0: number; x1: number; y1: number } | null, point = -1, drawn = spots): void {
    // The pointed window shows on every device: keys and pads switch slots too (over the window as it is drawn).
    const ps = point >= 0 ? drawn[point] : null;
    this.slotPoint.classList.toggle('on', !!ps);
    if (ps) this.slotPoint.style.transform = `translate(${ps.x.toFixed(0)}px, ${ps.y.toFixed(0)}px)`;
    // Each window's target is as big as the spacing allows, never under 44 px on a spread layout
    // (the bellows spreads its windows at least 48 px apart under touch).
    let pitch = 1e9;
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const p = spots[i];
        const q = spots[j];
        if (p && q) pitch = Math.min(pitch, Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)));
      }
    }
    if (pitch === 1e9) pitch = 44;
    const size = Math.max(16, Math.min(52, pitch - 2));
    this.slotBtns.forEach((b, i) => {
      const s = spots[i];
      if (!s || !show) {
        b.style.display = 'none';
        return;
      }
      b.style.display = 'block';
      b.style.width = b.style.height = `${size.toFixed(0)}px`;
      b.style.transform = `translate(${(s.x - size / 2).toFixed(0)}px, ${(s.y - size / 2).toFixed(0)}px)`;
    });
    if (!body || !show) {
      this.bellowsBtn.style.display = 'none';
      return;
    }
    this.bellowsBtn.style.display = 'block';
    this.bellowsBtn.style.width = `${(body.x1 - body.x0).toFixed(0)}px`;
    this.bellowsBtn.style.height = `${(body.y1 - body.y0).toFixed(0)}px`;
    this.bellowsBtn.style.transform = `translate(${body.x0.toFixed(0)}px, ${body.y0.toFixed(0)}px)`;
  }

  update(dt: number): void {
    // A window held long enough tips out, once per press.
    const h = this.slotHold;
    if (h && !h.fired) {
      h.t += dt;
      if (h.t >= Hud.HOLD_EMPTY) {
        h.fired = true;
        this.slotBtns[h.i]?.classList.remove('holding');
        this.onEmpty(h.i);
      }
    }
    if (this.sayT > 0) {
      this.sayT -= dt;
      if (this.sayT <= 0) this.say.classList.remove('on');
    }
    if (this.pageT > 0 && !this.lessonLine) {
      this.pageT -= dt;
      if (this.pageT <= 0) {
        // A goal waiting takes the page straight over; otherwise it goes down.
        this.pageT = 0;
        if (this.goalWant.length) {
          this.goalShown = '';
          this.showGoal();
        } else this.hidePage();
      }
    }
    if (this.zoneT > 0) {
      this.zoneT -= dt;
      if (this.zoneT <= 0) this.zone.classList.remove('on');
    }
    if (this.countT > 0) this.countT -= dt;
  }
}
