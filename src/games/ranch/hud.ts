// The little that sits on the glass: a crosshair that changes when something
// can be drawn, a count beside it, coins in plain type, a sun-and-moon notch
// for the hour, a use prompt, one hint at a time for the current device, and
// the field journal: a torn page that slides up when a goal is done. The
// canister's contents live on the bellows and prices on the Exchange's board.

import { GOALS, fmtCoins, type GoalId } from './defs';
import { hash2 } from './noise';

type CrossState = 'idle' | 'target' | 'prickly' | 'tag';

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
  readonly el = el('div', 'rh');
  private cross = el('div', 'rh-cross');
  private count = el('div', 'rh-count');
  private coins = el('div', 'rh-coins');
  private arc = el('div', 'rh-arc');
  private arcDot: SVGCircleElement;
  private arcMoon: SVGPathElement;
  private prompt = el('div', 'rh-prompt');
  private say = el('div', 'rh-say');
  private hint = el('div', 'rh-hint');
  private zone = el('div', 'rh-zone');
  private page = el('div', 'rh-page');
  private pageBody = el('div', 'rh-page-body');
  private pause = el('div', 'rh-pause');
  private pauseBody = el('div', 'rh-pause-body');
  private click = el('div', 'rh-click');
  private fade = el('div', 'rh-fade');
  readonly slotBtns: HTMLButtonElement[] = [];
  private bellowsBtn = el('button', 'rh-bellows');
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
  onResume: () => void = () => {};
  onGames: () => void = () => {};
  onSlot: (i: number) => void = () => {};
  onCycle: () => void = () => {};

  constructor() {
    this.cross.innerHTML = `<svg viewBox="-20 -20 40 40"><g class="x-idle"><circle r="2.2" fill="currentColor"/></g><g class="x-target" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M-12 -6 L-7 0 L-12 6"/><path d="M12 -6 L7 0 L12 6"/><circle r="2" fill="currentColor" stroke="none"/></g><g class="x-prickly" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M-6 -6 L6 6 M6 -6 L-6 6"/></g><g class="x-tag" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="-7" y="-5" width="14" height="10" rx="1.5"/></g></svg>`;
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
      b.setAttribute('aria-label', `Slot ${i + 1}`);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onSlot(i);
      });
      this.slotBtns.push(b);
    }
    this.bellowsBtn.setAttribute('aria-label', 'Next slot');
    this.bellowsBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onCycle();
    });
    this.el.append(this.cross, this.count, this.coins, this.arc, this.prompt, this.say, this.hint, this.zone, this.page, this.click, this.bellowsBtn, ...this.slotBtns, this.pause, this.fade);
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

  setHint(text: string | null): void {
    if (!text) {
      this.hint.classList.remove('on');
      return;
    }
    setText(this.hint, text);
    this.hint.classList.add('on');
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
          `<li class="${l.done ? 'done' : ''} ${l.fresh ? 'fresh' : ''}"><svg class="box" viewBox="0 0 20 20"><path d="M3 4 Q10 2.6 17 3.6 Q17.6 10 16.6 17 Q9 17.6 3.4 16.8 Q2.6 10 3 4 Z" fill="none" stroke="currentColor" stroke-width="1.4"/><path class="tick" d="M5 10 L9 14.5 L17 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${l.text}</span></li>`,
      )
      .join('');
    this.pageBody.innerHTML = `<h4>${title}</h4><ul>${rows}</ul>`;
    this.page.classList.remove('up');
    void this.page.offsetWidth;
    this.page.classList.add('up');
    this.pageUp = true;
    this.pageT = secs;
  }

  hidePage(): void {
    this.page.classList.remove('up');
    this.pageUp = false;
    this.pageT = 0;
  }

  showPause(when: string, goals: GoalId[], device: 'touch' | 'mouse' | 'key' | 'pad'): void {
    this.pauseOpen = true;
    this.pauseFocus = 0;
    const open = GOALS.filter((g) => !goals.includes(g.id)).slice(0, 3);
    const done = goals.length;
    const goalRows = open.map((g) => `<li>${g.text}</li>`).join('') || '<li>Nothing left on the list. Enjoy the valley.</li>';
    const keys =
      device === 'touch'
        ? 'Left thumb walks, right side looks. Hold Draw, tap Puff. Tap the bellows to switch slots.'
        : device === 'pad'
          ? 'Left stick walks, right stick looks. LT draws, RT puffs, LB and RB pick a slot, X uses.'
          : 'WASD walks, the mouse looks. Hold right mouse to draw, click to puff. Q, E or the wheel pick a slot; E uses what is in front of you.';
    this.pauseBody.innerHTML = `<div class="when">${when}</div><h4>To do</h4><ol>${goalRows}</ol><div class="tally">${done} of ${GOALS.length} done</div><p class="keys">${keys}</p><div class="acts"><button data-act="resume" class="focus">Back to the ranch</button><button data-act="games">Games and settings</button></div>`;
    this.pause.classList.add('on');
  }

  hidePause(): void {
    this.pauseOpen = false;
    this.pause.classList.remove('on');
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
  placeSlots(spots: ({ x: number; y: number } | null)[], show: boolean, body: { x0: number; y0: number; x1: number; y1: number } | null): void {
    const a = spots[0];
    const b2 = spots[1];
    const pitch = a && b2 ? Math.hypot(b2.x - a.x, b2.y - a.y) : 44;
    const size = Math.max(16, Math.min(44, pitch));
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
    if (this.sayT > 0) {
      this.sayT -= dt;
      if (this.sayT <= 0) this.say.classList.remove('on');
    }
    if (this.pageT > 0) {
      this.pageT -= dt;
      if (this.pageT <= 0) this.hidePage();
    }
    if (this.zoneT > 0) {
      this.zoneT -= dt;
      if (this.zoneT <= 0) this.zone.classList.remove('on');
    }
    if (this.countT > 0) this.countT -= dt;
  }
}
