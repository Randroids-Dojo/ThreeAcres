// The little that sits on the glass: a crosshair that changes when something
// can be drawn, a count beside it, coins in plain type, a sun-and-moon notch
// for the hour, a use prompt, and the field journal: a torn page holding the
// one thing to do now (the current lesson), or a goal just done. Each piece
// shows only once a lesson has brought it in. The canister's contents live on
// the bellows and prices on the Exchange's board; the pause page holds the
// whole journal, notes and controls.

import { GOALS, fmtCoins, type GoalId } from './defs';

const BOX = `<svg class="box" viewBox="0 0 20 20"><path d="M3 4 Q10 2.6 17 3.6 Q17.6 10 16.6 17 Q9 17.6 3.4 16.8 Q2.6 10 3 4 Z" fill="none" stroke="currentColor" stroke-width="1.4"/><path class="tick" d="M5 10 L9 14.5 L17 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
import { hash2 } from './noise';

type CrossState = 'idle' | 'target' | 'prickly' | 'tag' | 'sell';

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
  readonly slotBtns: HTMLButtonElement[] = [];
  private bellowsBtn = el('button', 'rh-bellows');
  /** A cream chevron over the slot window a lesson points at, like the markers in the world. */
  private slotPoint = el('div', 'rh-slotpoint');
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
  /** With no lesson up, the next goal sits on the page instead; what it is, and what is showing. */
  private goalWant = '';
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
    this.cross.innerHTML = `<svg viewBox="-20 -20 40 40"><g class="x-idle"><circle r="2.2" fill="currentColor"/></g><g class="x-target" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M-12 -6 L-7 0 L-12 6"/><path d="M12 -6 L7 0 L12 6"/><circle r="2" fill="currentColor" stroke="none"/></g><g class="x-prickly" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M-6 -6 L6 6 M6 -6 L-6 6"/></g><g class="x-tag" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="-7" y="-5" width="14" height="10" rx="1.5"/></g><g class="x-sell" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M-12 -2 L-5 8 L5 8 L12 -2"/><circle cy="-6" r="2.4" fill="currentColor" stroke="none"/></g><circle class="x-tug" r="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="81.7" stroke-dashoffset="81.7" transform="rotate(-90)"/></svg>`;
    this.tugRing = this.cross.querySelector('.x-tug')!;
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
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          b.setPointerCapture(e.pointerId);
        } catch {
          // Synthetic pointers.
        }
        this.onSlot(i);
        // Held on: after a moment the window tips out (the ring fills while you hold).
        this.slotHold = { i, id: e.pointerId, t: 0, fired: false, x: e.clientX, y: e.clientY };
        b.classList.add('holding');
      });
      // A thumb that lands on a window and moves meant to walk (or look): hand it over, and tip nothing out.
      b.addEventListener('pointermove', (e) => {
        const h = this.slotHold;
        if (!h || h.id !== e.pointerId || h.fired || Math.hypot(e.clientX - h.x, e.clientY - h.y) < 10) return;
        this.slotHold = null;
        b.classList.remove('holding');
        this.onSlotDrag(e.pointerId, h.x, h.y);
      });
      const release = (e: PointerEvent) => {
        if (this.slotHold?.id !== e.pointerId) return;
        this.slotHold = null;
        b.classList.remove('holding');
      };
      b.addEventListener('pointerup', release);
      b.addEventListener('pointercancel', release);
      b.addEventListener('lostpointercapture', release);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      this.slotBtns.push(b);
    }
    this.bellowsBtn.setAttribute('aria-label', 'Next window');
    this.bellowsBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onCycle();
    });
    this.el.append(this.cross, this.count, this.coins, this.arc, this.prompt, this.say, this.zone, this.edge, this.page, this.click, this.bellowsBtn, ...this.slotBtns, this.slotPoint, this.pause, this.fade);
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

  /** The current lesson on the journal page: one line that stays until done, then ticks. '' takes it down. */
  setLesson(line: string, done: boolean): void {
    if (!line) {
      if (this.lessonLine) {
        this.lessonLine = '';
        this.hidePage();
        this.showGoal();
      }
      return;
    }
    this.goalShown = '';
    if (line !== this.lessonLine) {
      // A new lesson slides in as a new page; the same lesson reworded (another device) just changes.
      const fresh = !this.lessonLine || this.lessonDone || !this.pageUp;
      this.lessonLine = line;
      this.lessonDone = done;
      this.pageBody.innerHTML = `<ul><li class="${done ? 'done now' : ''}">${BOX}<span>${line}</span></li></ul>`;
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
      const li = this.pageBody.querySelector('li');
      li?.classList.toggle('done', done);
      li?.classList.toggle('now', done);
    }
  }

  get lessonUp(): boolean {
    return !!this.lessonLine;
  }

  /**
   * With no lesson up, the next goal sits on the journal page: one calm line,
   * the same page. A goal just done (a timed page) has the page first. '' puts it away.
   */
  setGoal(line: string): void {
    this.goalWant = line;
    if (this.lessonLine || this.pageT > 0) return;
    this.showGoal();
  }

  private showGoal(): void {
    const line = this.goalWant;
    if (this.lessonLine || this.pageT > 0) return;
    if (!line) {
      if (this.goalShown) {
        this.goalShown = '';
        this.hidePage();
      }
      return;
    }
    if (line === this.goalShown && this.pageUp) return;
    const fresh = !this.pageUp;
    this.goalShown = line;
    this.pageBody.innerHTML = `<ul><li>${BOX}<span>${line}</span></li></ul>`;
    this.page.classList.add('lesson', 'goal');
    this.page.classList.remove('note');
    if (fresh) {
      this.page.classList.remove('up');
      void this.page.offsetWidth;
    }
    this.page.classList.add('up');
    this.pageUp = true;
  }

  /** A wild downy digging in against the pull: a ring round the crosshair fills as it tires (0 hides it). */
  setTug(k: number): void {
    const v = k > 0.02 ? Math.min(1, k) : 0;
    if (Math.abs(v - this.tugShown) < 0.01) return;
    this.tugShown = v;
    this.cross.classList.toggle('tug', v > 0);
    this.tugRing.style.strokeDashoffset = `${(1 - v) * 81.7}`;
  }
  private tugShown = 0;
  private tugRing!: SVGCircleElement;

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
          `<li class="${l.done ? 'done' : ''} ${l.fresh ? 'fresh' : ''}">${BOX}<span>${l.text}</span></li>`,
      )
      .join('');
    this.pageBody.innerHTML = `<h4>${title}</h4><ul>${rows}</ul>`;
    this.lessonLine = '';
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

  /** The pause page: the whole journal (done goals struck), what the lessons taught so far, and the controls learned. */
  showPause(when: string, goals: GoalId[], now: string, notes: string[], keys: string): void {
    this.pauseOpen = true;
    this.pauseFocus = 0;
    const goalRows = GOALS.map((g) => `<li class="${goals.includes(g.id) ? 'done' : ''}">${g.text}</li>`).join('');
    const nowRow = now ? `<p class="now">${now}</p>` : '';
    const noteRows = notes.length ? `<h4>Notes</h4><ul class="notes">${notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : '';
    this.pauseBody.innerHTML = `<div class="when">${when}</div>${nowRow}<h4>Journal, ${goals.length} of ${GOALS.length} done</h4><ol>${goalRows}</ol>${noteRows}<p class="keys">${keys}</p><div class="acts"><button data-act="resume" class="focus">Back to the ranch</button><button data-act="games">Games and settings</button></div>`;
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

  /** Tap targets over the bellows: one per slot window, sized to their spacing, and the body behind them. */
  placeSlots(spots: ({ x: number; y: number } | null)[], show: boolean, body: { x0: number; y0: number; x1: number; y1: number } | null, point = -1): void {
    // The pointed window shows on every device: keys and pads switch slots too.
    const ps = point >= 0 ? spots[point] : null;
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
        if (this.goalWant) {
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
