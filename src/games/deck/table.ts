// The card table: the plate in the middle, the hand along the bottom, the
// ledger and pegboard on top, seed scoops for what cards cost and the lantern
// for End day. It reads the run, sends plays to the rules, and animates what
// the rules report. The rules never wait for an animation: a skipped or
// reloaded night shows exactly what a watched one would.
//
// Pieces of the table arrive one lesson at a time (see lessons.ts); until a
// lesson brings one in, it is not on the table. While a card is held the
// plot previews what it would do, and the night draws each bonus as it lands.

import type { GameContext } from '../../shell/types';
import { PRESETS } from '../../sim/presets';
import {
  CARDS,
  costOf,
  endDay,
  energyMax,
  giveUp,
  isFinal,
  marketTonight,
  maxPages,
  moveTargets,
  newMeta,
  newRun,
  nextPick,
  PAGES,
  levelName,
  levelText,
  pageLevel,
  playCard,
  previewPlay,
  recordRun,
  RETIRED,
  ripeTonight,
  SEASON_NAMES,
  SEEDS,
  targetsFor,
  toss,
  TUNING,
  twistText,
  UNLOCK_ORDER,
  whyNot,
  type Card,
  type CardId,
  type Ev,
  type Harvest,
  type Meta,
  type Plot,
  type RunState,
  type Step,
} from './rules';
import { earnTable, learnedAll, newLearn, PIECES, REFRESH, Tutor, type Learn, type Line, type Piece } from './lessons';
import { ease, Seq } from './view/anim';
import { lanternUrl, pegboardUrl, scoopUrl, tinUrl, woodUrl } from './view/art';
import { Board, type PreviewMark } from './view/board';
import { costBoxes, faceBonus, faceBoxes, faceUrl } from './view/faces';
import { iconUrl, twistUrl } from './view/icons';
import { Sheets } from './sheets';

export interface Prefs {
  fast: boolean;
}

export interface SaveData {
  v: 1;
  run: RunState;
  meta: Meta;
  prefs: Prefs;
  /** The lessons done and the table's pieces brought in, kept with the meta unlocks. */
  learn?: Learn;
  /** Older saves: how many of the old first-day lessons were done. */
  taught?: number;
}

interface Held {
  uid: number;
  /** Trowel: the crop picked to move. */
  from: number | null;
}

interface Press {
  uid: number;
  id: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  dragging: boolean;
  long: boolean;
  timer: number;
}

interface CardEl {
  el: HTMLDivElement;
  img: HTMLImageElement;
  cost: HTMLDivElement;
  key: string;
}

const PENTA = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];

/** In a fanned phone hand, the share of each card's width left showing: its name and its rule's pictures sit inside it. */
const SHOWN = 0.87;

/** What the second tap does, said on the first: "Tap again to water." */
const AIM_VERB: Partial<Record<CardId, string>> = { can: 'water', compost: 'lay it', fertiliser: 'feed it', shears: 'cut it', scarecrow: 'set it up', beehive: 'set it up' };
/** Seeds whose name is a plural: "The beans are pulled before the sunflower ripens." */
const PLURAL: readonly CardId[] = ['beans'];
/** "Tap again to plant it." shows for this many aims, then the player knows. */
const AIM_NOTES = 3;
/** The hand closes its gaps this long after the last play, once it rests. */
const SETTLE_MS = 1400;
export function ladder(n: number): number {
  return PENTA[n % 5] * Math.pow(2, Math.floor(n / 5) * 0.5);
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

const clonePlots = (p: readonly Plot[]): Plot[] => p.map((x) => ({ ...x, crop: x.crop ? { ...x.crop } : null }));

/** Bring a run saved before the rules changed up to date: no wet soil, no hose or mulch. */
function migrateRun(r: RunState): void {
  const old = r as RunState & { radishesToday?: number; chiliNext?: boolean };
  delete old.radishesToday;
  delete old.chiliNext;
  r.script ??= [];
  r.crow ??= false;
  r.scoops ??= 0;
  r.slots ??= 0;
  r.saved ??= 0;
  r.bench ??= Math.max(r.energy, energyMax(r));
  r.guided ??= false;
  r.stats.pests ??= 0;
  r.stats.crows ??= 0;
  r.stats.byKind ??= {};
  r.twist ??= null;
  r.carry ??= 0;
  r.carried ??= 0;
  r.stock ??= [];
  r.select ??= [];
  for (const p of r.plots as (Plot & { wet?: boolean; mulch?: number })[]) {
    delete p.wet;
    delete p.mulch;
    p.boost ??= 0;
  }
  const fix = (c: Card) => {
    if (c.id in RETIRED) c.id = RETIRED[c.id];
  };
  [...r.draw, ...r.hand, ...r.discard, ...r.placed].forEach(fix);
  r.pool = [...new Set(r.pool.map((c) => (RETIRED[c] ?? c) as CardId))];
  if (r.shop) for (const o of r.shop.cards) o.card = (RETIRED[o.card] ?? o.card) as CardId;
}

export class Table {
  readonly el = el('div', 'sb');
  private tableEl = el('div', 'sb-table');
  private ledger = el('div', 'sb-ledger');
  private ledSeason = el('b', 'sb-led-season');
  private ledDay = el('span', 'sb-led-day');
  private ledTally = el('span', 'sb-led-tally');
  private purse = el('div', 'sb-purse');
  private book = el('button', 'sb-book');
  private peg = el('div', 'sb-peg');
  private pegImg = el('img', 'sb-peg-wood');
  private pegBack = el('i', 'sb-pin back');
  private pegFront = el('i', 'sb-pin front');
  private pegXs: number[] = [];
  private boardWrap = el('div', 'sb-boardwrap');
  readonly board = new Board();
  private bench = el('div', 'sb-bench');
  private scoops = el('div', 'sb-scoops');
  private tonightEl = el('div', 'sb-tonight');
  private tin = el('button', 'sb-tin');
  private tinCount = el('span', 'sb-count');
  private heap = el('button', 'sb-heap');
  private heapCount = el('span', 'sb-count');
  private lantern = el('button', 'sb-lantern');
  private flame = el('i', 'sb-flame');
  private pages = el('div', 'sb-pages');
  private handEl = el('div', 'sb-hand');
  private fx = el('div', 'sb-fx');
  private hint = el('div', 'sb-hint');
  /** This season's twist, in the lesson strip whenever no lesson is up: its picture and its one line. */
  private twistEl = el('div', 'sb-twist');
  private note = el('div', 'sb-note');
  private dark = el('div', 'sb-night');
  readonly sheets: Sheets;

  run!: RunState;
  meta: Meta = newMeta();
  prefs: Prefs = { fast: false };
  tutor = new Tutor(newLearn());
  /** The lesson line on screen (table or stall). */
  line: Line | null = null;
  /** What the board shows: the plots as of the last thing animated. */
  shown: Plot[] = [];
  shownEarned = 0;
  shownCoins = 0;
  shownDay = 1;
  /** Scoops shown full: the night keeps the old day's count until dawn refills them. */
  shownEnergy = 0;
  /** Scoops laid out on the bench: the night keeps the old day's bench until dawn. */
  shownBench = 3;
  /** The hand as shown (the old hand stays up through the night). */
  handShown: Card[] = [];
  held: Held | null = null;
  cursor = 5;
  private hover: number | null = null;
  private press: Press | null = null;
  private cards = new Map<number, CardEl>();
  /** The night, or a card in flight: input waits while it runs. */
  seq: Seq | null = null;
  private small: Seq[] = [];
  private intensity = 0;
  private hot = 0;
  private raf = 0;
  private last = 0;
  private running = false;
  layout: 'phone' | 'wide' = 'phone';
  private W = 0;
  private cardW = 110;
  private cardH = 154;
  private handRect = { x: 0, y: 0, w: 0, h: 0 };
  /** The width the hand's cards are drawn at now (a full phone hand shrinks). */
  handCardW = 110;
  /** Touch: the plot a held tool is aimed at, waiting for a second tap to play. */
  private aimed: number | null = null;
  private hintBox = { x: 0, y: 0, w: 0, h: 0 };
  private hoverCard: number | null = null;
  private hoverTimer = 0;
  frames = 0;
  frameMs: number[] = [];
  /** Scores shown on screen this session, in order, for checks. */
  shownScores: number[] = [];
  /** Harvest scores the rules reported, in order, to check the screen against. */
  ruleScores: number[] = [];
  private shakeT = 0;
  private shakeAmp = 0;
  private ro: ResizeObserver;
  private doneCount = 0;
  private lastPhase = 'day';

  constructor(private ctx: GameContext) {
    this.sheets = new Sheets(this, ctx);
    const t = this.tableEl;
    t.style.backgroundImage = `url(${woodUrl()})`;
    this.ledger.append(this.ledSeason, this.ledDay, this.ledTally);
    this.book.innerHTML = '<span class="sb-book-spine"></span><span class="sb-book-title">Almanac</span>';
    this.book.setAttribute('aria-label', 'Almanac: pause and settings');
    this.pegImg.alt = '';
    this.peg.append(this.pegImg, this.pegBack, this.pegFront);
    this.boardWrap.append(this.board.canvas);
    const lanternImg = el('img');
    lanternImg.src = lanternUrl();
    lanternImg.alt = '';
    this.lantern.append(lanternImg, this.flame, el('span', 'sb-label', 'End day'));
    this.lantern.setAttribute('aria-label', 'End day: blow out the lantern (E)');
    const tinImg = el('img');
    tinImg.src = tinUrl();
    tinImg.alt = '';
    this.tin.append(tinImg, this.tinCount, el('span', 'sb-label', 'Seed tin'));
    this.tin.setAttribute('aria-label', 'Seed tin: your deck (D)');
    this.heap.append(el('span', 'sb-heap-pile'), el('i', 'sb-heap-done'), this.heapCount, el('span', 'sb-label', 'Spent'));
    this.heap.setAttribute('aria-label', 'Spent cards. Drop a card here to toss it, once a day.');
    this.scoops.setAttribute('role', 'img');
    this.hint.setAttribute('role', 'status');
    this.hint.setAttribute('aria-live', 'polite');
    this.bench.append(this.scoops, this.tonightEl, this.tin, this.heap, this.lantern);
    this.twistEl.setAttribute('role', 'note');
    t.append(this.ledger, this.purse, this.book, this.peg, this.boardWrap, this.pages, this.bench, this.handEl, this.dark, this.fx, this.twistEl, this.hint, this.note);
    this.el.append(t, this.sheets.el);
    ctx.root.append(this.el);

    this.book.onclick = () => this.sheets.menu();
    this.lantern.onclick = () => this.endDay();
    this.tin.onclick = () => this.sheets.deck('tin');
    this.heap.onclick = () => {
      if (this.held) this.tossHeld();
      else this.sheets.deck('spent');
    };
    this.bindBoard();
    this.ro = new ResizeObserver(() => this.relayout());
    this.ro.observe(ctx.root);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  // ---------------------------------------------------------------- run lifecycle

  load(data: SaveData | null): void {
    if (data && data.v === 1 && data.run && data.meta) {
      this.run = data.run;
      migrateRun(this.run);
      this.meta = data.meta;
      this.prefs = { ...{ fast: false }, ...data.prefs };
      // A save from before the lessons: everything is already on the table; the can and the weather get a refresher.
      this.tutor = new Tutor(data.learn ?? learnedAll(REFRESH));
      // A returning player's table has every piece (round 8: a second run after the guided one had no spent heap).
      earnTable(this.tutor.learn, this.meta.runs);
    } else {
      this.meta = data?.meta ?? newMeta();
      this.tutor = new Tutor(data?.learn ?? (this.meta.runs > 0 ? learnedAll() : newLearn()));
      this.fresh(null);
      return;
    }
    this.doneCount = this.tutor.learn.done.length;
    this.syncAll();
    this.afterSync();
  }

  /** A new player's first run is the guided first season: set hands, one idea a day. */
  get guidedNext(): boolean {
    return this.meta.runs === 0 && !this.tutor.learn.done.includes('scoops');
  }

  /** Start a new run. */
  fresh(seed: number | null, guided = this.guidedNext): void {
    const s = seed ?? ((Date.now() ^ (Math.random() * 0x7fffffff)) | 0);
    this.run = newRun(s, this.meta, guided).s;
    this.tutor.drop();
    // Every piece of the table a finished run has earned is there from the new run's first dawn.
    earnTable(this.tutor.learn, this.meta.runs);
    this.held = null;
    this.seq?.finish();
    this.seq = null;
    this.sheets.close();
    this.setLine(null);
    this.syncAll();
    this.save();
    this.afterSync();
  }

  /**
   * Give the run up: it ends the way a missed quota does, so its seasons count for the catalogue and its best
   * harvest and coins for the record, and the almanac's entry for it follows. (It used to start a new run and
   * record nothing.)
   */
  giveUp(): void {
    if (this.run.phase === 'over') return;
    this.seq?.finish();
    this.seq = null;
    this.settle();
    this.held = null;
    this.aimed = null;
    if (!giveUp(this.run)) return;
    recordRun(this.meta, this.run, UNLOCK_ORDER);
    this.save();
    this.syncAll();
    this.sheets.entry();
  }

  /** Bring every piece in and mark every lesson done: a returning player's table. */
  learnAll(): void {
    this.tutor = new Tutor(learnedAll());
    this.doneCount = this.tutor.learn.done.length;
    this.setLine(null);
    this.applyPieces();
    this.renderAll();
    this.save();
  }

  private afterSync(): void {
    if (this.run.phase === 'shop') this.sheets.stall();
    else if (this.run.phase === 'over') this.sheets.entry();
  }

  saveData(): SaveData {
    return { v: 1, run: this.run, meta: this.meta, prefs: this.prefs, learn: this.tutor.learn };
  }

  save(): void {
    const s = this.run;
    const where = s.phase === 'shop' ? `${SEASON_NAMES[s.season]} market` : s.phase === 'over' ? `${SEASON_NAMES[s.season]}, run over` : `${SEASON_NAMES[s.season]}, day ${s.day}`;
    this.ctx.save(this.saveData(), `Year ${s.year} ${where}, ${s.coins} coins`);
  }

  /** Put the display back in step with the rules. */
  syncAll(): void {
    this.resetSlots();
    this.shown = clonePlots(this.run.plots);
    this.shownEarned = this.run.earned;
    this.shownCoins = this.run.coins;
    this.shownDay = this.run.day;
    this.shownEnergy = this.run.energy;
    this.shownBench = this.run.bench;
    this.handShown = [...this.run.hand];
    this.board.anims.clear();
    this.board.night = 0;
    this.flame.classList.remove('out');
    this.applyPieces();
    this.relayout();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.cancelPress();
    clearTimeout(this.hoverTimer);
  }

  dispose(): void {
    this.stop();
    this.ro.disconnect();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
  }

  get busy(): boolean {
    return !!this.seq && !this.seq.done;
  }

  get speed(): number {
    return this.prefs.fast ? 2.2 : 1;
  }

  seen(p: Piece): boolean {
    return this.tutor.seen(p);
  }

  // ---------------------------------------------------------------- pieces and lessons

  private pieceEls(p: Piece): HTMLElement[] {
    switch (p) {
      case 'lantern':
        return [this.lantern];
      case 'peg':
        return [this.ledger, this.peg];
      case 'scoops':
        return [this.scoops];
      case 'coins':
        return [this.purse];
      case 'tin':
        return [this.tin];
      case 'spent':
        return [this.heap];
      case 'tonight':
        return [this.tonightEl];
      case 'pages':
        return [this.pages];
      default:
        return [];
    }
  }

  /** Show the pieces brought in so far, and only those. New ones arrive with a small settle. */
  applyPieces(arrive: Piece[] = []): void {
    for (const p of PIECES) {
      let on = this.seen(p);
      if (p === 'tonight') on = on || this.run.tonight.length > 0;
      // Kept pages have a panel on the desktop only; on a phone they live in the almanac. Once pages are brought in it
      // shows the room left too, as empty leaves.
      if (p === 'pages') on = on && this.layout === 'wide';
      for (const e of this.pieceEls(p)) {
        e.classList.toggle('sb-off', !on);
        if (arrive.includes(p)) {
          e.classList.remove('sb-arrive');
          void e.offsetWidth;
          e.classList.add('sb-arrive');
        }
      }
    }
    this.el.toggleAttribute('data-bloom', this.seen('bloom'));
  }

  private device(): 'touch' | 'mouse' | 'key' {
    const d = this.ctx.device();
    return d === 'touch' ? 'touch' : d === 'mouse' ? 'mouse' : 'key';
  }

  /** Once a frame: the tutor finishes and starts lessons; the line goes up by what it means. */
  private teach(dt: number): void {
    // Leaving the stall, however it happens, finishes the stall's lesson.
    if (this.lastPhase === 'shop' && this.run.phase !== 'shop') this.tutor.count('leave');
    this.lastPhase = this.run.phase;
    const sheet = this.sheets.open && this.sheets.kind !== 'stall';
    const quiet = this.busy || sheet || this.sheets.detailOpen || (this.sheets.open && this.sheets.kind === 'stall');
    const held = this.held ? (this.cardOf(this.held.uid) ?? null) : null;
    const { line, unlocked } = this.tutor.update(this.run, this.device(), held, dt, quiet, this.aimed !== null);
    if (unlocked.length) {
      this.applyPieces(unlocked);
      this.renderAll();
      this.updateHighlight();
      if (this.sheets.kind === 'stall' && unlocked.some((p) => p === 'pages' || p === 'services')) this.sheets.stall();
      this.ctx.audio.cue('deck.page', { gain: 0.5 });
    }
    if (this.tutor.learn.done.length !== this.doneCount) {
      this.doneCount = this.tutor.learn.done.length;
      this.save();
    }
    this.setLine(sheet && line?.where !== 'stall' ? null : line);
  }

  /** Put a lesson line up (or take it down). Table lines sit in their strip; stall lines go on the stall. */
  setLine(line: Line | null): void {
    const was = this.line;
    if (was?.id === line?.id && was?.text === line?.text && was?.point === line?.point) return;
    this.line = line;
    const h = this.hint;
    const table = line && line.where === 'table' ? line : null;
    if (table) {
      h.textContent = table.text;
      h.dataset.lesson = table.id;
      h.classList.add('on');
    } else {
      h.classList.remove('on');
      delete h.dataset.lesson;
    }
    this.sheets.lesson(line && line.where === 'stall' ? line : null);
    this.placeHint();
    this.renderTwist();
    this.cue();
  }

  /** The season's twist in the lesson strip, while no lesson is up: its picture and "Crows come twice as often." */
  private renderTwist(): void {
    const s = this.run;
    const tw = s?.phase === 'day' ? (s.twist ?? null) : null;
    const on = !!tw && !this.hint.classList.contains('on');
    const key = tw ? `${tw.id}:${tw.crop ?? ''}:${tw.row ?? ''}:${tw.page ?? ''}:${s.season}` : '';
    if (this.twistEl.dataset.k !== key) {
      this.twistEl.dataset.k = key;
      this.twistEl.innerHTML = tw ? `<img src="${twistUrl(tw, 24)}" alt=""><span>${twistText(tw)}</span>` : '';
    }
    this.twistEl.classList.toggle('on', on);
  }

  /** The words the twist line shows, for checks. */
  get twistLine(): string {
    return this.twistEl.classList.contains('on') ? (this.twistEl.textContent ?? '') : '';
  }

  /** The thing a lesson is about glows softly. */
  private cue(): void {
    const l = this.line && this.line.where === 'table' ? this.line : null;
    for (const e of [this.lantern, this.peg, this.scoops, this.tin, this.heap]) e.classList.remove('sb-cue');
    const target = l ? { lantern: this.lantern, peg: this.peg, scoops: this.scoops, tin: this.tin, heap: this.heap }[l.point as string] : null;
    target?.classList.add('sb-cue');
    const want = new Set(l?.point === 'hand' ? this.cueCards(l.id) : []);
    for (const [uid, c] of this.cards) c.el.classList.toggle('sb-cue', want.has(uid));
  }

  private cueCards(lesson: string): number[] {
    const s = this.run;
    const pick = (f: (c: Card) => boolean) => s.hand.filter(f).map((c) => c.uid);
    switch (lesson) {
      case 'sow':
        return pick((c) => CARDS[c.id].type === 'seed' && costOf(c.id, c.up) <= s.energy);
      case 'companion':
        return s.plots.some((p) => p.crop?.kind === 'carrot') ? pick((c) => c.id === 'radish') : pick((c) => c.id === 'carrot');
      case 'bloom':
        return pick((c) => c.id === 'radish');
      case 'can':
        return pick((c) => c.id === 'can');
      case 'weather':
        return pick((c) => CARDS[c.id].type === 'weather');
      case 'newcard':
        return pick((c) => !this.tutor.learn.cards.includes(c.id));
      default:
        return [];
    }
  }

  private placeHint(): void {
    const b = this.hintBox;
    for (const h of [this.hint, this.twistEl]) {
      h.style.left = `${b.x}px`;
      h.style.top = `${b.y}px`;
      h.style.width = `${b.w}px`;
      h.style.minHeight = `${b.h}px`;
    }
  }

  /** The stall's lesson line, for the sheets. */
  get stallLine(): Line | null {
    return this.line && this.line.where === 'stall' ? this.line : null;
  }

  // ---------------------------------------------------------------- layout

  relayout(): void {
    const r = this.ctx.root.getBoundingClientRect();
    const W = Math.round(r.width) || window.innerWidth;
    const H = Math.round(r.height) || window.innerHeight;
    this.W = W;
    const wide = W >= 820 && W > H * 1.05;
    this.layout = wide ? 'wide' : 'phone';
    this.el.dataset.layout = this.layout;
    this.el.toggleAttribute('data-narrow', W < 400);
    this.el.toggleAttribute('data-short', H < 600);
    const safeT = parseFloat(getComputedStyle(this.el).getPropertyValue('--sbsafe-t')) || 0;
    const safeB = parseFloat(getComputedStyle(this.el).getPropertyValue('--sbsafe-b')) || 0;
    const place = (e: HTMLElement, x: number, y: number, w: number, h: number) => {
      e.style.left = `${Math.round(x)}px`;
      e.style.top = `${Math.round(y)}px`;
      e.style.width = `${Math.round(w)}px`;
      e.style.height = `${Math.round(h)}px`;
    };
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let boardBox: { x: number; y: number; w: number; h: number };
    const P = Math.round(Math.max(300, Math.min(380, W * 0.28)));
    if (!wide) {
      const top = safeT + 8;
      this.cardW = Math.round(Math.min(112, Math.max(84, Math.min(W * 0.255, H * 0.118))));
      this.cardH = Math.round(this.cardW * 1.4);
      const handH = this.cardH + 26;
      place(this.ledger, 64, top, W - 64 - 112, 50);
      place(this.purse, W - 106, top + 2, 46, 46);
      place(this.book, W - 52, top, 44, 50);
      place(this.peg, 10, top + 58, W - 20, 26);
      const benchH = 78;
      const handY = H - safeB - handH;
      const benchY = handY - benchH;
      // A strip between the plot and the bench for the lesson line, so it never covers either.
      const strip = 40;
      boardBox = { x: 0, y: top + 86, w: W, h: benchY - strip - (top + 86) };
      this.hintBox = { x: 14, y: benchY - strip + 3, w: W - 28, h: strip - 8 };
      place(this.bench, 6, benchY, W - 12, benchH);
      this.handRect = { x: 0, y: handY, w: W, h: handH + safeB };
    } else {
      const sx = W - P - 18;
      this.cardW = Math.round(Math.min(150, Math.max(76, H * 0.16)));
      this.cardH = Math.round(this.cardW * 1.4);
      const handH = Math.round(Math.max(this.cardH + 30, Math.min(250, H * 0.28)));
      place(this.ledger, sx, 12, P - 66, 94);
      place(this.purse, sx + P - 56, 16, 56, 56);
      // Round 8: wide enough for its word (it spilled past the book's edge).
      place(this.book, sx + P - 64, 80, 64, 44);
      place(this.peg, sx, 116, P - 66, 32);
      // The bench is the desktop's controls: it takes the side panel's lower half at a size a mouse
      // finds at once (it was 200 px tall, its labels 11.5 px, with 500 px of bare table above it).
      const benchH = Math.round(Math.max(260, Math.min(380, H * 0.45)));
      const benchY = H - benchH - 10;
      // The lesson strip (and the season's twist) right under the pegboard, the pages kept under it, the bench at the
      // foot: the fifth playtest found about 330 px of bare table between the pegboard and the scoops.
      this.hintBox = { x: sx, y: 158, w: P, h: 52 };
      place(this.pages, sx, 220, P, Math.max(60, benchY - 10 - 220));
      place(this.bench, sx, benchY, P, benchH);
      boardBox = { x: 66, y: 10, w: sx - 66 - 16, h: H - handH - 14 };
      this.handRect = { x: 66, y: H - handH, w: sx - 66, h: handH };
    }
    place(this.boardWrap, boardBox.x, boardBox.y, boardBox.w, boardBox.h);
    place(this.handEl, this.handRect.x, this.handRect.y, this.handRect.w, this.handRect.h);
    this.placeHint();
    this.board.layout(boardBox.w, boardBox.h, dpr, this.run?.cols ?? 4, this.run?.rows ?? 4, !wide || H < 600);
    // The desktop stall's goods: as large as the screen's height lets every stall state fit (1.45 at 800 px).
    this.el.style.setProperty('--sbk', String(Math.max(1, Math.min(1.7, 1 + (H - 700) / 220))));
    if (wide) {
      // A card's close-up under the pointer goes in the bare table right of the plate, clear of the scoops (it used
      // to stand over them); with no room there, at the top of the side panel, above the lesson strip.
      const right = boardBox.x + this.board.px0 + this.board.pw + 10;
      const room = W - P - 18 - 10 - right;
      const pagesTop = this.hintBox.y + this.hintBox.h + 8;
      const box = room >= 150 ? { x: right, y: 12, w: Math.min(230, room), h: this.handRect.y - 20 } : { x: W - P - 18, y: pagesTop, w: P, h: (parseFloat(this.bench.style.top) || H) - pagesTop - 10 };
      const st = this.el.style;
      st.setProperty('--sb-dx', `${Math.round(box.x)}px`);
      st.setProperty('--sb-dy', `${Math.round(box.y)}px`);
      st.setProperty('--sb-dw', `${Math.round(box.w)}px`);
      st.setProperty('--sb-dh', `${Math.round(box.h)}px`);
      this.detailBox = box;
    }
    if (this.run) this.board.setSeason(this.run.season, (this.run.year - 1) * 4 + this.run.season + 1);
    const pr = this.peg.getBoundingClientRect();
    const pw = Math.round(pr.width || W - 20);
    const ph = Math.round(pr.height || 26);
    const pegArt = pegboardUrl(pw, ph, 31);
    this.pegImg.src = pegArt.url;
    this.pegXs = pegArt.xs;
    if (this.run) {
      this.applyPieces();
      this.renderAll();
    }
  }

  // ---------------------------------------------------------------- rendering the table

  renderAll(): void {
    this.renderLedger();
    this.renderBench();
    this.renderPages();
    this.renderHand();
    this.renderTwist();
  }

  private renderLedger(): void {
    const s = this.run;
    const season = SEASON_NAMES[s.season];
    this.ledSeason.textContent = `${season[0].toUpperCase()}${season.slice(1)}, year ${s.year}`;
    // The season's last night still reads as its sixth day while it plays (it used to say "At the stall" over the harvest).
    this.ledDay.textContent = s.phase === 'day' || this.busy ? `Day ${this.shownDay} of ${TUNING.days}` : s.phase === 'shop' ? 'At the stall' : s.end?.won ? 'Run won' : 'Run over';
    const take = Math.round(this.shownEarned);
    // Four-digit takes and quotas stack the take over "of 1550" (the phone's purse covered the last digit: "1239 of 15").
    this.ledger.classList.toggle('big', Math.max(String(take).length, String(s.quota).length) >= 4);
    // Over the last two days, what is still to go (the seventh playtest's last day read only "286 of 350").
    const left = s.quota - take;
    const late = (s.phase === 'day' || this.busy) && this.shownDay >= TUNING.days - 1 && left > 0;
    this.ledTally.innerHTML = `<b>${take}</b> <span>of ${s.quota}</span>${late ? `<i>${left} to go</i>` : ''}`;
    this.purse.classList.toggle('big', String(Math.round(this.shownCoins)).length >= 5);
    this.purse.innerHTML = `<b>${Math.round(this.shownCoins)}</b><span>coins</span>`;
    this.placePegs();
  }

  /** The purse shows the coins the rules hold: after every purchase in the stall it ticks down to match. */
  syncPurse(): void {
    if (this.shownCoins === this.run.coins) return;
    this.shownCoins = this.run.coins;
    this.renderLedger();
    this.purse.classList.remove('tick');
    void this.purse.offsetWidth;
    this.purse.classList.add('tick');
  }

  /** The coins the purse shows, for checks. */
  get purseText(): string {
    return this.purse.querySelector('b')?.textContent ?? '';
  }

  private placePegs(): void {
    const xs = this.pegXs;
    if (!xs.length) return;
    const k = Math.max(0, Math.min(1, this.shownEarned / Math.max(1, this.run.quota)));
    const hole = (v: number) => xs[Math.round(v * (xs.length - 1))];
    const front = hole(k);
    const back = (this.pegBackK ?? 0) <= k ? hole(this.pegBackK ?? 0) : hole(0);
    this.pegFront.style.transform = `translate(${front}px, 0)`;
    this.pegBack.style.transform = `translate(${back}px, 0)`;
    this.peg.classList.toggle('met', this.shownEarned >= this.run.quota && this.run.quota > 0);
  }
  private pegBackK = 0;

  /** The scoops: full or empty at a glance; the ones a held card would use lift; the ones it lacks show red. */
  private renderBench(): void {
    const s = this.run;
    // The day's scoops: the refill and any a pulled crop put back (the night keeps the old day's until dawn).
    const max = Math.max(1, this.busy ? this.shownBench : s.bench);
    while (this.scoops.children.length < max) {
      const i = el('img');
      i.alt = '';
      this.scoops.append(i);
    }
    while (this.scoops.children.length > max) this.scoops.lastElementChild!.remove();
    this.layoutScoops(max);
    const energy = this.busy ? this.shownEnergy : s.energy;
    const card = this.held ? this.cardOf(this.held.uid) : undefined;
    const cost = card ? costOf(card.id, card.up) : 0;
    [...this.scoops.children].forEach((c, i) => {
      const full = i < energy;
      const img = c as HTMLImageElement;
      const src = scoopUrl(full);
      if (img.getAttribute('src') !== src) img.src = src;
      img.classList.toggle('empty', !full);
      img.classList.toggle('use', !!card && full && i >= energy - cost && cost <= energy);
      img.classList.toggle('short', !!card && !full && cost > energy && i < cost);
    });
    this.scoops.setAttribute('aria-label', `${energy} of ${max} scoops full`);
    this.tinCount.textContent = String(s.draw.length);
    this.heapCount.textContent = String(s.discard.length);
    this.heap.classList.toggle('can-toss', !!this.held && !s.tossed && s.phase === 'day');
    this.heap.classList.toggle('tossed', s.tossed);
    const wx = s.tonight.map((w) => `<img src="${faceUrl(w, false)}" alt="${CARDS[w].name} tonight">`).join('');
    if (this.tonightEl.dataset.w !== s.tonight.join()) {
      this.tonightEl.innerHTML = wx;
      this.tonightEl.dataset.w = s.tonight.join();
      this.applyPieces();
    }
    this.lantern.disabled = s.phase !== 'day';
  }

  /**
   * Size the scoops to the room the bench leaves them, so any number fits: one
   * row while they keep a good size, two rows past that. The tin, the spent
   * heap and the lantern never shrink (five scoops once squeezed the lantern to
   * 8 px and ran "Spent" into "End day").
   */
  private layoutScoops(n: number): void {
    const key = `${n}|${this.layout}|${this.bench.style.width}|${this.run.tonight.length}`;
    if (this.scoops.dataset.k === key) return;
    this.scoops.dataset.k = key;
    const benchW = parseFloat(this.bench.style.width) || 0;
    const wide = this.layout === 'wide';
    const gap = 3;
    const max = wide ? 84 : 48;
    let room: number;
    let tall: number;
    if (wide) {
      // Two of the bench's three columns, the top row of its two.
      room = ((benchW - 8) * 2) / 3 - 6;
      // The lantern (144 px) holds the bottom row; the scoops get what is left above it.
      tall = parseFloat(this.bench.style.height) - 6 - 144 - 14;
    } else {
      // Beside the tin (66), the spent heap (54) and the lantern (64), with the bench's gaps and room for tonight's weather.
      const weather = Math.max(1, this.run.tonight.length);
      room = benchW - 66 - 54 - 64 - 4 * 5 - (36 + 24 * (weather - 1));
      tall = 58;
    }
    let best = { rows: 1, w: 0 };
    for (const rows of [1, 2]) {
      const per = Math.ceil(n / rows);
      const byWidth = Math.floor((room - (per - 1) * gap) / per);
      const byHeight = Math.floor(((tall - (rows - 1) * 2) / rows) / 0.75);
      const w = Math.max(14, Math.min(max, byWidth, byHeight));
      // A second row only when it buys a clearly bigger scoop.
      if (w > best.w + (rows > 1 ? 3 : 0)) best = { rows, w };
    }
    const per = Math.ceil(n / best.rows);
    const st = this.scoops.style;
    st.setProperty('--sw', `${best.w}px`);
    st.setProperty('--sh', `${Math.round(best.w * 0.75)}px`);
    st.gridTemplateColumns = `repeat(${per}, ${best.w}px)`;
    st.width = `${per * best.w + (per - 1) * gap}px`;
    this.scoops.classList.toggle('two', best.rows > 1);
  }

  /** Dawn: the scoops refill one after another. */
  private refill(from: number): void {
    const imgs = [...this.scoops.children] as HTMLElement[];
    imgs.forEach((img, i) => {
      if (i < from) return;
      img.classList.remove('refill');
      img.style.animationDelay = `${(i - from) * 90}ms`;
      void img.offsetWidth;
      img.classList.add('refill');
    });
  }

  private renderPages(): void {
    const room = maxPages(this.run);
    const key = `${this.run.pages.map((p) => `${p}${pageLevel(this.run, p)}`).join()}|${room}`;
    if (this.pages.dataset.k === key) return;
    this.pages.dataset.k = key;
    this.pages.innerHTML = '';
    this.pages.append(el('h4', '', 'Almanac pages kept'));
    // Round 7: one line a page, its name (its rule on hover and in the almanac), so a full almanac fits the panel: the
    // seventh playtest's desktop showed half of Big Basket and hid two more pages.
    const list = el('ul', 'sb-keptlist');
    for (const p of this.run.pages) {
      // An engine page bought up a level says so: "Busy Bees II".
      const lv = pageLevel(this.run, p);
      const li = el('li', 'sb-keptline', `<b>${levelName(PAGES[p].name, lv)}</b>`);
      li.title = (lv > 1 && levelText(p, lv)) || PAGES[p].text;
      list.append(li);
    }
    // The room left, a dashed line for each page more it keeps: the stall sells pages to fill them.
    for (let k = this.run.pages.length; k < room; k++) list.append(el('li', 'sb-keptline empty', 'Room for a page'));
    // A long almanac (page slots bought) lists in two columns, so ten pages still fit.
    list.classList.toggle('two', list.children.length > 6);
    this.pages.append(list);
    this.applyPieces();
  }

  /**
   * Each card keeps its place in the fan through the day: a card played leaves a gap and the rest stay where they were,
   * so a second tap lands on the card that was there (the fan re-centred after every play, and a tap at the old spot
   * missed twice). A card drawn in the day (a toss) takes the first gap. The fan closes up at dawn.
   */
  private slots = new Map<number, number>();
  private slotN = 0;
  /**
   * Round 7: when the gaps close. A second tap soon after a play still lands where the card was; once the hand has
   * rested a moment (no card held, no pointer on the hand) the fan closes up, keeping its order (the seventh playtest's
   * hand kept a gap in the middle all day).
   */
  private settleAt = 0;
  resetSlots(): void {
    this.slots.clear();
    this.slotN = 0;
  }

  /** Close the hand's gaps, keeping each card's order, if the hand has rested since the last play. */
  private closeGaps(now: number): void {
    if (!this.settleAt || now < this.settleAt) return;
    if (this.held || this.hoverCard !== null || this.busy || this.press) return;
    this.settleAt = 0;
    const order = [...this.handShown].sort((a, b) => (this.slots.get(a.uid) ?? 0) - (this.slots.get(b.uid) ?? 0));
    if (order.every((c, k) => this.slots.get(c.uid) === k) && this.slotN === order.length) return;
    this.slots.clear();
    order.forEach((c, k) => this.slots.set(c.uid, k));
    this.slotN = order.length;
    this.renderHand();
  }

  /** Gaps left in the hand by plays today, for checks. */
  get handGaps(): number {
    return Math.max(0, this.slotN - this.handShown.length);
  }

  /** Fan the hand. */
  renderHand(): void {
    const hand = this.handShown;
    const live = new Set(hand.map((c) => c.uid));
    for (const [uid, c] of this.cards) {
      if (!live.has(uid) && !c.el.classList.contains('flying')) {
        c.el.remove();
        this.cards.delete(uid);
      }
    }
    for (const uid of [...this.slots.keys()]) if (!live.has(uid)) this.slots.delete(uid);
    const used = new Set(this.slots.values());
    for (const c of hand) {
      if (this.slots.has(c.uid)) continue;
      let k = 0;
      while (used.has(k)) k++;
      this.slots.set(c.uid, k);
      used.add(k);
    }
    if (!hand.length) this.slotN = 0;
    this.slotN = Math.max(this.slotN, hand.length, ...[...used].map((k) => k + 1));
    const n = this.slotN;
    let { cardW: cw, cardH: ch } = this;
    const R = this.handRect;
    // On the desktop the bench stands right of the hand: leave room for the outer cards' tilt.
    const avail = R.w - (this.layout === 'phone' ? 12 : n > 5 ? 56 : 24);
    // A full hand shrinks to fit, so every card keeps its name and its rule in sight
    // (the next card may cover no more than the strip at its right edge).
    if (n > 1) {
      const fit = Math.floor(avail / (1 + (n - 1) * SHOWN));
      if (fit < cw) {
        cw = fit;
        ch = Math.round(cw * 1.4);
      }
    }
    this.handCardW = cw;
    const gap = n > 1 ? Math.min(cw * 0.92, (avail - cw) / (n - 1)) : 0;
    const total = cw + gap * (n - 1);
    const x0 = (R.w - total) / 2;
    const showCost = this.seen('scoops');
    const day = this.run.phase === 'day';
    hand.forEach((card, i) => {
      let c = this.cards.get(card.uid);
      const bonus = faceBonus(card.id, this.run.pages, this.run.levels);
      const key = `${card.id}${card.up ? '+' : ''}${showCost ? '' : '-'}${bonus ? `~${bonus.yield}${bonus.bees ? `b${bonus.times ?? ''}` : ''}` : ''}`;
      if (!c) {
        const d = el('div', 'sb-card');
        const img = el('img');
        img.draggable = false;
        img.alt = '';
        const cost = el('div', 'sb-cost');
        d.append(img, cost);
        d.dataset.uid = String(card.uid);
        d.dataset.type = CARDS[card.id].type;
        d.addEventListener('pointerdown', (e) => this.onCardDown(e, card.uid));
        d.addEventListener('pointerenter', (e) => this.onCardEnter(e, card.uid));
        d.addEventListener('pointerleave', () => this.onCardLeave(card.uid));
        d.addEventListener('contextmenu', (e) => e.preventDefault());
        // New cards come out of the tin.
        const tr = this.tin.getBoundingClientRect();
        const hr = this.handEl.getBoundingClientRect();
        d.style.transition = 'none';
        d.style.transform = `translate(${tr.left - hr.left}px, ${tr.top - hr.top}px) scale(0.3) rotate(-20deg)`;
        d.style.opacity = '0';
        this.handEl.append(d);
        c = { el: d, img, cost, key: '' };
        this.cards.set(card.uid, c);
        void d.offsetWidth;
        d.style.transition = '';
        d.style.opacity = '';
      }
      if (c.key !== key) {
        c.img.src = faceUrl(card.id, card.up, showCost, bonus);
        c.el.dataset.name = CARDS[card.id].name;
        const fb = faceBoxes(card.id, card.up, showCost, bonus);
        if (fb.name) c.el.dataset.namebox = [fb.name.x, fb.name.y, fb.name.w, fb.name.h, fb.name.size ?? fb.name.h].map((v) => v.toFixed(1)).join(',');
        if (fb.rule) c.el.dataset.rulebox = [fb.rule.x, fb.rule.y, fb.rule.w, fb.rule.h].map((v) => v.toFixed(1)).join(',');
        c.key = key;
        const n = costOf(card.id, card.up);
        c.el.setAttribute('aria-label', `${CARDS[card.id].name}${card.up ? ', select' : ''}, ${n === 0 ? 'free' : `${n} ${n === 1 ? 'scoop' : 'scoops'}`}`);
        // One mark over each printed scoop, to show the ones the scoops on the bench cannot pay for.
        c.cost.innerHTML = '';
        if (showCost) {
          for (const b of costBoxes(card.id, card.up)) {
            const m = el('i');
            m.style.left = `${b.x}%`;
            m.style.top = `${(b.y / 140) * 100}%`;
            m.style.width = `${b.w}%`;
            m.style.height = `${(b.h / 140) * 100}%`;
            c.cost.append(m);
          }
        }
      }
      const cost = costOf(card.id, card.up);
      const afford = !day || cost <= this.run.energy;
      [...c.cost.children].forEach((m, k) => m.classList.toggle('lack', day && k >= this.run.energy));
      c.el.style.width = `${cw}px`;
      c.el.style.height = `${ch}px`;
      const mid = (n - 1) / 2;
      const slot = this.slots.get(card.uid) ?? i;
      const off = slot - mid;
      const held = this.held?.uid === card.uid;
      const hov = this.hoverCard === card.uid && !this.held;
      let x = x0 + slot * gap;
      // A full hand fans flatter, so the outer cards' tilt neither hides a neighbour's name nor reaches the bench.
      // On the desktop the fan keeps clear of the screen's foot, tilted corners and all (it ran off the bottom edge).
      let y = R.h - ch - (this.layout === 'phone' ? 12 : 30) + off * off * (n > 4 ? 1.2 : 2.2);
      let rot = off * (n > 4 ? 1.8 : 3.2);
      let sc = 1;
      if (held) {
        const rest = y;
        // On a phone the bench sits right above the hand: lift a little, so the scoops stay in sight.
        y -= this.layout === 'phone' ? ch * 0.06 : ch * 0.3;
        rot = 0;
        sc = this.layout === 'phone' ? 1.04 : 1.1;
        // On the desktop the lifted card stops under the plate's caption (it used to cover it).
        if (this.layout === 'wide') y = Math.min(rest - 6, Math.max(y, this.captionFloor() - R.y + ch * (sc - 1)));
      } else if (hov) {
        y -= ch * 0.14;
        rot *= 0.4;
      }
      if (!c.el.classList.contains('dragging')) c.el.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${sc})`;
      c.el.style.zIndex = String(held ? 50 : hov ? 40 : 10 + slot);
      c.el.classList.toggle('held', held);
      c.el.classList.toggle('dear', !afford && showCost);
      c.el.dataset.key = String(i + 1);
    });
    this.cue();
  }

  /** Where a card's close-up under the pointer goes on the desktop, in table coordinates (for checks). */
  detailBox = { x: 0, y: 0, w: 0, h: 0 };

  /** The lowest point of the plate's caption, in table coordinates, with a little air under it. */
  private captionFloor(): number {
    const cap = this.board.captionBox();
    return (parseFloat(this.boardWrap.style.top) || 0) + cap.y + cap.h + 4;
  }

  // ---------------------------------------------------------------- frame

  private frame = (now: number) => {
    if (!this.running) return;
    const t0 = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.frames++;
    if (this.seq && !this.seq.done) this.seq.update(dt * this.speed);
    for (const s of this.small) s.update(dt * this.speed);
    this.small = this.small.filter((s) => !s.done);
    this.teach(dt);
    this.closeGaps(performance.now());
    // Music lifts during a harvest run, then settles.
    const target = this.hot > 0 ? 1 : 0;
    this.hot = Math.max(0, this.hot - dt);
    this.intensity += (target - this.intensity) * Math.min(1, dt * (target > this.intensity ? 6 : 0.9));
    this.ctx.audio.mood({
      game: 'deck',
      intensity: this.intensity,
      hour: 12,
      season: this.run.season,
      weather: 'sun',
      scene: this.sheets.open && this.sheets.kind === 'menu' ? 'menu' : 'farm',
      night: 0,
      speed: 1,
      tired: false,
      rules: PRESETS.sunup.rules,
    });
    // Table shake on big harvests.
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const a = this.shakeAmp * (this.shakeT / 0.4);
      this.tableEl.style.transform = `translate(${Math.sin(now * 0.09) * a}px, ${Math.cos(now * 0.13) * a * 0.6}px)`;
      if (this.shakeT === 0) this.tableEl.style.transform = '';
    }
    this.board.tonight = this.busy ? [] : this.shown.map((_, i) => ripeTonight(this.run, i));
    this.board.market = this.busy || this.run.phase !== 'day' ? [] : marketTonight(this.run);
    this.board.boost = this.busy ? [] : this.run.plots.map((p) => p.boost);
    this.board.crow = !this.busy && this.run.phase === 'day' && this.run.crow;
    this.board.twist = this.run.phase === 'day' || this.busy ? (this.run.twist ?? null) : null;
    const nk = this.board.night.toFixed(3);
    if (this.dark.dataset.k !== nk) {
      this.dark.dataset.k = nk;
      this.dark.style.opacity = nk;
    }
    this.board.draw(this.shown, dt);
    this.frameMs.push(performance.now() - t0);
    if (this.frameMs.length > 600) this.frameMs.splice(0, 300);
    this.raf = requestAnimationFrame(this.frame);
  };

  // ---------------------------------------------------------------- the board

  private bindBoard(): void {
    const c = this.board.canvas;
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    c.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || this.press?.dragging) return;
      const p = pos(e);
      const i = this.board.pick(p.x, p.y);
      if (i !== this.hover) {
        this.hover = i;
        this.updateHighlight();
      }
    });
    // Only a mouse leaving clears the hover. A finger leaves the canvas right after every tap (pointerleave
    // follows pointerup on touch), which used to wipe the plot a tool had just been aimed at.
    c.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse' || this.aimed !== null) return;
      this.hover = null;
      this.updateHighlight();
    });
    c.addEventListener('pointerup', (e) => {
      if (this.press) return;
      if (this.busy) {
        this.skip();
        return;
      }
      const p = pos(e);
      const i = this.board.pick(p.x, p.y);
      if (this.held) {
        const card = this.cardOf(this.held.uid)!;
        const t = CARDS[card.id].target;
        if (t === 'board' && this.board.onPlate(p.x, p.y)) this.tryPlay(null);
        else if (i !== null && e.pointerType !== 'mouse' && this.aimFirst(card) && this.aimed !== i && targetsFor(this.run, this.heldIndex()).includes(i)) {
          // A finger has no hover: the first tap on a plot shows what a tool would do there, the second plays it.
          this.aimed = i;
          this.hover = i;
          this.updateHighlight();
          this.ctx.audio.cue('deck.hover', { gain: 0.6 });
          // The first lesson says what the second tap does itself; otherwise, for the first few aims, a note in the
          // lesson strip (it showed on every play forever, over the aimed plot's bonus chip on the top row).
          // Never with a lesson up: the lesson says what to do, and the strip holds one line at a time.
          if (this.line?.where !== 'table' && this.tutor.n('aimNote') < AIM_NOTES) {
            this.tutor.count('aimNote');
            this.say(`Tap again to ${CARDS[card.id].type === 'seed' ? 'plant it' : (AIM_VERB[card.id] ?? 'play it')}.`, null);
            this.aimNote = true;
          }
        } else if (i !== null) this.tryPlay(i);
      } else if (i !== null) {
        this.cursor = i;
        this.inspect(i);
      }
    });
    // A tap anywhere skips a running night.
    this.tableEl.addEventListener('pointerdown', (e) => {
      if (this.busy && this.seq && !(e.target as HTMLElement).closest('.sb-book')) this.skip();
    });
  }

  /**
   * Seeds, tools and objects that go on one plot: on touch they aim on the first tap and play on the second, so a
   * finger sees what a mouse resting on the plot sees (the seed's score there, its neighbours' gains) before it
   * commits. Seeds used to plant on the first tap, and their preview showed only while dragged.
   */
  private aimFirst(card: Card): boolean {
    const t = CARDS[card.id].target;
    return t !== 'board' && t !== 'move';
  }

  private cardOf(uid: number): Card | undefined {
    return this.run.hand.find((c) => c.uid === uid);
  }

  private heldIndex(): number {
    return this.held ? this.run.hand.findIndex((c) => c.uid === this.held!.uid) : -1;
  }

  /** The plot the held card is aimed at: on touch the plot a tool was tapped on, else the pointer's or the keyboard cursor's. */
  private aimAt(): number | null {
    return this.aimed ?? this.hover ?? (this.ctx.device() === 'key' ? this.cursor : null);
  }

  updateHighlight(): void {
    const h = this.board.hl;
    h.valid = [];
    h.area = [];
    h.all = false;
    h.water = false;
    h.deny = false;
    h.hover = null;
    h.cursor = this.ctx.device() === 'key' && this.run.phase === 'day' && !this.busy ? this.cursor : null;
    const idx = this.heldIndex();
    if (idx >= 0 && !this.busy) {
      const card = this.run.hand[idx];
      const def = CARDS[card.id];
      const aim = this.aimAt();
      h.water = card.id === 'can' || card.id === 'rain' || card.id === 'storm';
      if (def.target === 'board') {
        h.all = true;
      } else if (def.target === 'move' && this.held!.from !== null) {
        h.valid = moveTargets(this.run, idx, this.held!.from);
        h.area = [this.held!.from];
        h.hover = aim;
        h.deny = aim !== null && !h.valid.includes(aim);
      } else {
        h.valid = targetsFor(this.run, idx);
        h.hover = aim;
        h.deny = aim !== null && !h.valid.includes(aim);
        if (aim !== null && !h.deny) h.area = this.areaOf(card, aim);
      }
    }
    this.previewNow();
  }

  /**
   * While a card is held, the plot shows what it would do. A seed marks every
   * plot where a neighbour would give it a bonus; the plot under the finger,
   * pointer or cursor also shows what the seed would score there and what its
   * neighbours would gain. Tools and weather mark the crops they would touch.
   */
  private previewNow(): void {
    const b = this.board;
    b.preview = null;
    const idx = this.heldIndex();
    if (idx < 0 || this.busy || this.run.phase !== 'day') return;
    const s = this.run;
    const card = s.hand[idx];
    const def = CARDS[card.id];
    const aim = this.aimAt();
    const marks: PreviewMark[] = [];
    let total: { plot: number; yield: number; bloom: number; score: number; late?: boolean; never?: boolean } | null = null;
    if (def.target === 'board') {
      // Weather touches every crop: chips only, no new totals all over the plot.
      marks.push(...(previewPlay(s, idx, null)?.marks ?? []).map(({ total: _, ...m }) => m));
    } else if (def.target === 'move') {
      const from = this.held!.from;
      if (from !== null && aim !== null && moveTargets(s, idx, from).includes(aim)) marks.push(...(previewPlay(s, idx, from, aim)?.marks ?? []));
    } else {
      const valid = targetsFor(s, idx);
      if (aim !== null && valid.includes(aim)) {
        const p = previewPlay(s, idx, aim);
        if (p) {
          marks.push(...p.marks);
          if (p.harvest && def.type === 'seed') total = { plot: aim, ...p.harvest };
          else if (p.harvest) total = { plot: aim, ...p.harvest };
        }
      } else if (def.type === 'seed') {
        // Each plot the seed could go on shows what sowing it there gains: its own bonus, or, for a seed that gives
        // to its neighbours (beans, chili, a sunflower), what they would gain, added up. Beans used to show nothing.
        for (const i of valid) {
          const ms = previewPlay(s, idx, i)?.marks ?? [];
          const own = ms.find((m) => m.plot === i && (m.yield || m.bloom || Math.abs(m.times - 1) > 1e-6 || m.lost));
          if (own) {
            marks.push(own);
            continue;
          }
          const sum: PreviewMark = { plot: i, yield: 0, bloom: 0, times: 1, nights: 0 };
          for (const m of ms) {
            if (m.plot === i) continue;
            sum.yield += m.yield;
            sum.bloom += m.bloom;
            sum.times = Math.max(sum.times, m.times);
          }
          if (sum.yield || sum.bloom || sum.times > 1 + 1e-6) marks.push(sum);
        }
      }
    }
    const valid = def.target === 'board' || (aim !== null && (def.target === 'move' ? this.held!.from !== null && moveTargets(s, idx, this.held!.from).includes(aim) : targetsFor(s, idx).includes(aim)));
    // Why a greyed bonus won't pay, said only under a plot the card can go on; and a plain word when a card would do nothing.
    let reason: { plot: number; text: string } | null = null;
    if (aim !== null && valid) {
      const l = marks.find((m) => m.lost);
      if (total?.never) reason = { plot: aim, text: 'Too late to ripen before the end.' };
      else if (l?.lost) reason = { plot: aim, text: this.lostWhy(l.plot, l.lost.why, l.lost.from) };
      else if (total?.late) reason = { plot: aim, text: 'Ripens next season.' };
    }
    let none: { plot: number | null; text: string } | null = null;
    // An object stands for the rest of the run: a scarecrow set out before the crows come is not wasted.
    const later = card.id === 'scarecrow' ? 'Keeps crows off from now on.' : card.id === 'beehive' ? 'Blooms crops around it from now on.' : 'No effect now.';
    if (!marks.length && !total && (def.target === 'board' || (aim !== null && def.type !== 'seed' && targetsFor(s, idx).includes(aim)))) none = { plot: def.target === 'board' ? null : aim, text: later };
    // What the play would change about tonight: crops it brings in get tonight's moon, and Market Day's stamp moves.
    const after = def.target === 'board' ? previewPlay(s, idx, null) : valid && aim !== null ? (def.target === 'move' ? previewPlay(s, idx, this.held!.from!, aim) : previewPlay(s, idx, aim)) : null;
    b.preview = { marks, total, bloom: this.seen('bloom'), reason, none, tonight: after?.tonight ?? [], market: after ? after.market : marketTonight(s) };
  }

  /** "The radish is pulled before the carrot ripens." The held seed stands in for whichever of the two is not on the plot yet. */
  private lostWhy(plot: number, _why: 'gone', from: number | null): string {
    const s = this.run;
    const held = this.held ? this.cardOf(this.held.uid) : undefined;
    const seed = held && CARDS[held.id].type === 'seed' ? held.id : null;
    const kind = (i: number | null) => (i === null ? null : (s.plots[i].crop?.kind ?? seed));
    const taker = kind(plot);
    const giver = kind(from);
    if (!taker || !giver) return 'Its neighbour is pulled first.';
    // Two of a kind side by side: "The other beans are pulled before these ripen." (it said "the beans ... the beans").
    if (taker === giver) return PLURAL.includes(giver) ? `The other ${CARDS[giver].name.toLowerCase()} are pulled before these ripen.` : `The other ${CARDS[giver].name.toLowerCase()} is pulled before this one ripens.`;
    return `The ${CARDS[giver].name.toLowerCase()} ${PLURAL.includes(giver) ? 'are' : 'is'} pulled before the ${CARDS[taker].name.toLowerCase()} ${PLURAL.includes(taker) ? 'ripen' : 'ripens'}.`;
  }

  private areaOf(card: Card, i: number): number[] {
    const s = this.run;
    const r = Math.floor(i / s.cols);
    const c = i % s.cols;
    if (card.id === 'can') return s.plots.map((_, j) => j).filter((j) => Math.floor(j / s.cols) === r);
    if (card.id === 'beehive' || card.id === 'scarecrow') {
      const out: number[] = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < s.rows && cc >= 0 && cc < s.cols) out.push(rr * s.cols + cc);
      }
      return out;
    }
    return [i];
  }

  // ---------------------------------------------------------------- cards: touch and mouse

  private affordable(uid: number): boolean {
    const c = this.cardOf(uid);
    return !!c && costOf(c.id, c.up) <= this.run.energy;
  }

  /** A card the scoops cannot pay for shakes, and the scoops it lacks flash red. No note. */
  nope(uid: number): void {
    const c = this.cards.get(uid);
    this.ctx.audio.cue('deck.deny');
    if (c) {
      c.el.classList.remove('nope');
      void c.el.offsetWidth;
      c.el.classList.add('nope');
    }
    const card = this.cardOf(uid);
    if (!card || !this.seen('scoops')) return;
    const need = costOf(card.id, card.up);
    [...this.scoops.children].forEach((img, i) => {
      if (i < this.run.energy || i >= need) return;
      img.classList.remove('flash');
      void (img as HTMLElement).offsetWidth;
      img.classList.add('flash');
      img.addEventListener('animationend', () => img.classList.remove('flash'), { once: true });
    });
  }

  private onCardDown(e: PointerEvent, uid: number): void {
    if (e.button > 0) return;
    e.preventDefault();
    if (this.busy) {
      this.skip();
      return;
    }
    if (this.run.phase !== 'day') return;
    this.cancelPress();
    const p: Press = { uid, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, dragging: false, long: false, timer: 0 };
    p.timer = window.setTimeout(() => {
      if (this.press !== p || p.dragging) return;
      p.long = true;
      this.ctx.audio.cue('deck.hover');
      const c = this.cardOf(uid);
      if (c) this.sheets.detail(c);
    }, 460);
    this.press = p;
  }

  private onMove = (e: PointerEvent) => {
    const p = this.press;
    if (!p || e.pointerId !== p.id) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (!p.dragging && !p.long && Math.hypot(p.x - p.x0, p.y - p.y0) > 9) {
      clearTimeout(p.timer);
      const card = this.cardOf(p.uid);
      if (!card) return;
      p.dragging = true;
      if (this.held?.uid !== p.uid) {
        this.held = { uid: p.uid, from: null };
        this.tutor.count('pick');
        this.ctx.audio.cue('deck.pick');
        this.renderBench();
      }
      const c = this.cards.get(p.uid)!;
      c.el.classList.add('dragging');
      this.sheets.closeDetail();
    }
    if (p.dragging) {
      e.preventDefault();
      const c = this.cards.get(p.uid);
      const hr = this.handEl.getBoundingClientRect();
      const br = this.board.canvas.getBoundingClientRect();
      // Over the plot the card shrinks above the finger and goes see-through, so the preview under it shows.
      const aiming = this.board.onPlate(p.x - br.left, p.y - br.top);
      if (c) {
        c.el.classList.toggle('aiming', aiming);
        const lift = aiming ? this.cardH + 14 : this.cardH * 0.75;
        c.el.style.transform = `translate(${p.x - hr.left - this.cardW / 2}px, ${p.y - hr.top - lift}px) rotate(-2deg) scale(${aiming ? 0.6 : 0.86})`;
      }
      const i = this.board.pick(p.x - br.left, p.y - br.top);
      if (i !== this.hover) {
        this.hover = i;
        this.updateHighlight();
      }
      const over = this.heapHit(p.x, p.y);
      this.heap.classList.toggle('over', over);
    }
  };

  private onUp = (e: PointerEvent) => {
    const p = this.press;
    if (!p || e.pointerId !== p.id) return;
    clearTimeout(p.timer);
    this.press = null;
    const c = this.cards.get(p.uid);
    if (p.dragging) {
      c?.el.classList.remove('dragging', 'aiming');
      this.heap.classList.remove('over');
      const br = this.board.canvas.getBoundingClientRect();
      const bx = p.x - br.left;
      const by = p.y - br.top;
      const card = this.cardOf(p.uid);
      if (card && this.heapHit(p.x, p.y)) {
        this.tossHeld();
      } else if (card && CARDS[card.id].target === 'board' && this.board.onPlate(bx, by)) {
        if (!this.tryPlay(null)) this.putDown(true);
      } else if (card) {
        const i = this.board.pick(bx, by);
        if (i !== null) {
          if (!this.tryPlay(i) && CARDS[card.id].target !== 'move') this.putDown(true);
        } else this.putDown();
      }
      this.hover = null;
      this.updateHighlight();
      this.renderHand();
      return;
    }
    // A long press leaves the card up close until the next tap.
    if (p.long) return;
    // A tap: pick up, or put down. A card the scoops cannot pay for only shakes.
    if (this.held?.uid === p.uid) this.putDown();
    else if (!this.affordable(p.uid)) this.nope(p.uid);
    else this.pickUp(p.uid);
  };

  private cancelPress(): void {
    if (!this.press) return;
    clearTimeout(this.press.timer);
    this.cards.get(this.press.uid)?.el.classList.remove('dragging');
    this.press = null;
  }

  private heapHit(x: number, y: number): boolean {
    if (!this.seen('spent')) return false;
    const r = this.heap.getBoundingClientRect();
    return x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8;
  }

  private onCardEnter(e: PointerEvent, uid: number): void {
    if (e.pointerType !== 'mouse' || this.press) return;
    this.hoverCard = uid;
    this.ctx.audio.cue('deck.hover', { gain: 0.5 });
    this.renderHand();
    clearTimeout(this.hoverTimer);
    this.hoverTimer = window.setTimeout(() => {
      const c = this.cardOf(uid);
      if (c && this.hoverCard === uid && !this.held) this.sheets.detail(c, true);
    }, 420);
  }

  private onCardLeave(uid: number): void {
    if (this.hoverCard !== uid) return;
    this.hoverCard = null;
    clearTimeout(this.hoverTimer);
    this.sheets.closeDetail(true);
    this.renderHand();
  }

  pickUp(uid: number): void {
    if (this.busy || this.run.phase !== 'day') return;
    const card = this.cardOf(uid);
    if (!card) return;
    this.sheets.closeDetail();
    this.held = { uid, from: null };
    this.aimed = null;
    this.hover = null;
    this.tutor.count('pick');
    this.ctx.audio.cue('deck.pick');
    this.updateHighlight();
    this.renderHand();
    this.renderBench();
  }

  putDown(quiet = false): void {
    if (!this.held) return;
    this.held = null;
    if (this.aimed !== null) {
      this.aimed = null;
      this.hover = null;
    }
    if (!quiet) this.ctx.audio.cue('deck.drop');
    this.updateHighlight();
    this.renderHand();
    this.renderBench();
  }

  // ---------------------------------------------------------------- playing

  /** Play the held card on a plot (or the board). Returns false if refused. */
  tryPlay(plot: number | null): boolean {
    if (this.busy || !this.held) return false;
    const idx = this.heldIndex();
    if (idx < 0) return false;
    const card = this.run.hand[idx];
    const def = CARDS[card.id];
    if (costOf(card.id, card.up) > this.run.energy) {
      this.nope(card.uid);
      if (plot !== null) this.board.shake(plot);
      return false;
    }
    if (def.target === 'move') {
      if (plot === null) return false;
      if (this.held.from === null) {
        const why = whyNot(this.run, idx, plot, moveTargets(this.run, idx, plot)[0]);
        if (why || !targetsFor(this.run, idx).includes(plot)) {
          this.deny(plot, why ?? 'Needs a crop with room to move.');
          return false;
        }
        this.held.from = plot;
        this.ctx.audio.cue('deck.pick', { pitch: 1.2 });
        this.say('Now pick where it goes.', plot);
        this.updateHighlight();
        return true;
      }
      return this.commit(idx, this.held.from, plot);
    }
    return this.commit(idx, def.target === 'board' ? null : plot);
  }

  private commit(idx: number, plot: number | null, to?: number): boolean {
    const why = whyNot(this.run, idx, plot, to);
    if (why) {
      this.deny(plot, why);
      return false;
    }
    const card = this.run.hand[idx];
    const cEl = this.cards.get(card.uid);
    const from = cEl?.el.getBoundingClientRect();
    const before = clonePlots(this.run.plots);
    const ev = playCard(this.run, idx, plot, to)!;
    this.settleAt = performance.now() + SETTLE_MS;
    for (const e of ev) if (e.t === 'harvest') this.ruleScores.push(e.h.score);
    // "Tap again to plant it." is done with once it is planted.
    if (this.aimNote) {
      this.aimNote = false;
      this.hideNote();
    }
    this.held = null;
    if (this.aimed !== null) {
      this.aimed = null;
      this.hover = null;
    }
    this.handShown = [...this.run.hand];
    this.ctx.audio.cue('deck.play');
    this.tutor.count('play');
    if (ev.some((e) => e.t === 'plant')) this.tutor.count('plant');
    if (costOf(card.id, card.up) >= 2) this.tutor.count('dear');
    if (card.id === 'can') this.tutor.count('can');
    if (CARDS[card.id].type === 'weather') this.tutor.count('weather');
    this.shownEnergy = this.run.energy;
    this.shownBench = this.run.bench;
    this.flyCard(card, cEl, from, plot ?? null, () => this.landPlay(ev, before));
    this.save();
    this.updateHighlight();
    this.renderHand();
    this.renderBench();
    this.renderLedger();
    return true;
  }

  /** The card arcs to its plot (or the middle of the plate) and is gone. */
  private flyCard(card: Card, c: CardEl | undefined, from: DOMRect | undefined, plot: number | null, land: () => void): void {
    if (!c || !from) {
      land();
      return;
    }
    this.cards.delete(card.uid);
    const d = c.el;
    d.classList.add('flying');
    d.classList.remove('held', 'dragging', 'sb-cue');
    const hr = this.handEl.getBoundingClientRect();
    const br = this.board.canvas.getBoundingClientRect();
    const target = plot !== null ? this.board.centre(plot) : { x: this.board.bx + (this.board.T * this.board.cols) / 2, y: this.board.by + (this.board.T * this.board.rows) / 2 };
    const x0 = from.left - hr.left;
    const y0 = from.top - hr.top;
    const x1 = br.left - hr.left + target.x - this.cardW * 0.5;
    const y1 = br.top - hr.top + target.y - this.cardH * 0.5;
    d.style.transition = 'none';
    const reduced = this.ctx.settings().reducedMotion;
    const s = new Seq();
    const dur = reduced ? 0.12 : 0.34;
    s.tween(0, dur, (k) => {
      const e = ease.inOut(k);
      const x = x0 + (x1 - x0) * e;
      const y = y0 + (y1 - y0) * e - Math.sin(Math.PI * e) * (reduced ? 0 : 90);
      const sc = 1 - e * 0.62;
      d.style.transform = `translate(${x}px, ${y}px) rotate(${(1 - e) * -6 + e * 14}deg) scale(${sc})`;
      d.style.opacity = String(k > 0.8 ? 1 - (k - 0.8) * 5 : 1);
    });
    s.at(dur, () => {
      d.remove();
      land();
    });
    this.small.push(s);
  }

  /** What a played card did, shown on the board as it lands. */
  private landPlay(ev: Ev[], before: Plot[]): void {
    const b = this.board;
    const reduced = this.ctx.settings().reducedMotion;
    for (const e of ev) {
      switch (e.t) {
        case 'plant': {
          const c = b.centre(e.plot);
          b.emit('dust', c.x, c.y + b.T * 0.2, reduced ? 3 : 8, { col: '#7a5a3a', spread: 50, up: 40, size: 4 });
          this.bounce(e.uid);
          this.ctx.audio.cue('deck.plant', { pan: this.pan(e.plot) });
          break;
        }
        case 'water':
          for (const i of e.plots) {
            b.splash[i] = 1;
            const c = b.centre(i);
            b.emit('drop', c.x, c.y - b.T * 0.25, reduced ? 1 : 4, { col: '#6aa0d0', spread: 30, up: 50, size: 5, life: 0.5 });
            const crop = this.run.plots[i].crop;
            if (crop) this.bounce(crop.uid);
          }
          this.ctx.audio.cue('deck.water', { gain: Math.min(1, 0.4 + e.plots.length * 0.05) });
          break;
        case 'grow':
          for (const g of e.growth) this.bounce(g.uid);
          this.ctx.audio.cue('deck.grow');
          break;
        case 'compost': {
          const c = b.centre(e.plot);
          b.emit('dust', c.x, c.y, 8, { col: '#4a3424', spread: 40, up: 30 });
          break;
        }
        case 'move':
          this.ctx.audio.cue('deck.plant');
          break;
        case 'clear':
          for (const i of e.plots) {
            const c = b.centre(i);
            b.emit('spark', c.x, c.y - b.T * 0.3, 5, { col: '#c8352a', spread: 60, up: 60, size: 3 });
          }
          break;
        case 'object': {
          const c = b.centre(e.plot);
          b.emit('dust', c.x, c.y + b.T * 0.2, 10, { col: '#8a6a48', spread: 50, up: 30 });
          this.ctx.audio.cue('deck.plant', { pitch: 0.8 });
          break;
        }
        case 'weather':
          this.ctx.audio.cue('deck.weather');
          break;
        case 'harvest':
          this.harvestNow(e.h);
          break;
        case 'quota':
          this.ctx.audio.cue('deck.quota');
          break;
        case 'draw':
          this.ctx.audio.cue('deck.draw');
          break;
        default:
          break;
      }
    }
    this.shown = clonePlots(this.run.plots);
    // A crop cut by the shears stays up until its harvest has popped.
    for (const e of ev) if (e.t === 'harvest') this.shown[e.h.plot].crop = before[e.h.plot].crop;
    this.handShown = [...this.run.hand];
    this.renderAll();
    this.updateHighlight();
  }

  /** Shears: one harvest, scored on the spot. */
  private harvestNow(h: Harvest): void {
    const s = new Seq();
    this.scoreHarvest(s, 0, h, 0, 1);
    s.then(() => {
      this.shown = clonePlots(this.run.plots);
      this.shownEarned = this.run.earned;
      this.shownCoins = this.run.coins;
      this.renderLedger();
    });
    this.small.push(s);
  }

  private bounce(uid: number): void {
    const a = { lift: 0, scale: 1, tilt: 0, alpha: 1, stage: null, glow: 0 };
    this.board.anims.set(uid, a);
    const s = new Seq();
    s.tween(0, 0.32, (k) => {
      a.scale = 1 + ease.pop(k) * 0.16;
      a.lift = ease.pop(k) * 0.06;
    });
    s.at(0.33, () => this.board.anims.delete(uid));
    this.small.push(s);
  }

  private deny(plot: number | null, why: string): void {
    this.ctx.audio.cue('deck.deny');
    if (plot !== null) this.board.shake(plot);
    this.say(why, plot);
  }

  private pan(plot: number): number {
    const c = plot % this.run.cols;
    return ((c + 0.5) / this.run.cols) * 1.2 - 0.6;
  }

  tossHeld(): void {
    const idx = this.heldIndex();
    if (idx < 0 || this.busy || !this.seen('spent')) return;
    if (this.run.tossed) {
      this.say('One toss a day.', null);
      this.ctx.audio.cue('deck.deny');
      return;
    }
    const card = this.run.hand[idx];
    const ev = toss(this.run, idx);
    if (!ev) return;
    this.settleAt = performance.now() + SETTLE_MS;
    this.held = null;
    this.tutor.count('toss');
    const c = this.cards.get(card.uid);
    if (c) {
      this.cards.delete(card.uid);
      c.el.classList.add('flying');
      const hr = this.handEl.getBoundingClientRect();
      const r = this.heap.getBoundingClientRect();
      c.el.style.transform = `translate(${r.left - hr.left}px, ${r.top - hr.top - 20}px) rotate(30deg) scale(0.3)`;
      c.el.style.opacity = '0';
      setTimeout(() => c.el.remove(), 320);
    }
    this.ctx.audio.cue('deck.remove');
    for (const e of ev) if (e.t === 'draw') this.ctx.audio.cue('deck.draw');
    this.handShown = [...this.run.hand];
    this.save();
    this.updateHighlight();
    this.renderAll();
  }

  // ---------------------------------------------------------------- notes and inspecting

  /**
   * A short ink note on the table, gone after a moment. Not a stack: one at a
   * time. A note about a plot sits over that plot, kept inside the bed so it
   * never covers the key letters or numbers (it used to stand above a first-row
   * plot, over its letter). A note about the whole table ("Quota met.") sits in
   * the lesson strip, in front of the lesson or the twist while it shows.
   */
  say(text: string, plot: number | null): void {
    const n = this.note;
    this.aimNote = false;
    n.textContent = text;
    // Measured from the table's left edge, so its width is its own, not what was left of the screen where it last stood
    // (a note last by the right edge wrapped, measured twice as tall, and hung below the strip). Round 8: then held at
    // that width, so it cannot wrap again where it goes: a note about C1 on the phone measured one line at the left
    // edge, wrapped to two by the right one, and its top rose over the column letters.
    n.style.width = '';
    n.style.left = '0px';
    const br = this.boardWrap.getBoundingClientRect();
    const tr = this.tableEl.getBoundingClientRect();
    const b = this.board;
    const ox = br.left - tr.left;
    const oy = br.top - tr.top;
    const w = n.offsetWidth || 160;
    const h = n.offsetHeight || 26;
    if (n.offsetWidth) n.style.width = `${w + 1}px`;
    const bedL = ox + b.bx;
    const bedR = ox + b.bx + b.T * b.cols;
    let x = ox + b.bx + (b.T * b.cols) / 2;
    // The note hangs from its top-centre point upward (translate -50%, -100%): `y` is its bottom edge.
    // A note about the whole table goes in the lesson strip (it used to sit on the plate's caption, whose words showed
    // round it in pieces). With a lesson or the season's twist in the strip, they step aside while the note shows:
    // the note used to go just inside the bed's top edge, over row 1 of the plot, all season from year 2.
    const strip = this.hintBox;
    let y = strip.y + strip.h / 2 + h / 2;
    if (plot === null) x = strip.x + strip.w / 2;
    this.hint.classList.toggle('hush', plot === null);
    this.twistEl.classList.toggle('hush', plot === null);
    if (plot !== null) {
      const c = b.centre(plot);
      x = ox + c.x;
      y = Math.max(oy + c.y - b.T * 0.7, oy + b.by + h + 4);
    }
    // Inside the bed's width where it fits, so the numbers down the side stay clear too.
    if (w <= bedR - bedL && plot !== null) x = Math.max(bedL + w / 2, Math.min(bedR - w / 2, x));
    x = Math.max(w / 2 + 4, Math.min(this.W - w / 2 - 4, x));
    n.style.left = `${Math.round(x)}px`;
    n.style.top = `${Math.round(Math.max(60 + h, y))}px`;
    n.classList.remove('on');
    void n.offsetWidth;
    n.classList.add('on');
    clearTimeout(this.noteTimer);
    this.noteTimer = window.setTimeout(() => this.hideNote(), 2200);
  }

  /** The note goes, and the lesson or the twist it stood in front of comes back. */
  private hideNote(): void {
    this.note.classList.remove('on');
    this.hint.classList.remove('hush');
    this.twistEl.classList.remove('hush');
  }
  private noteTimer = 0;
  /** The note on screen is "Tap again to plant it.": it goes when the card is played. */
  private aimNote = false;

  /** A season has begun from the stall: say what carried over, or that this is the last winter. */
  seasonStart(): void {
    const s = this.run;
    const last = s.stats.log[s.stats.log.length - 1];
    if (isFinal(s)) this.say('The last winter: meet it to win.', null);
    else if (s.carried && last) this.say(`${s.carried} carried over from ${SEASON_NAMES[last.season]}.`, null);
  }

  /**
   * Read a plot: what stands there, what it will pay and when ("C4: carrot pays 15 in 2 nights."), in eight words
   * at most, scored like the previews (Market Day too). It names the plot only where the plate shows its row
   * numbers: the phone's plate has the letters alone, and the note sits by the plot anyway.
   */
  plotLine(i: number): string {
    const p = this.run.plots[i];
    const numbered = this.board.keyBoxes().some((b) => /\d/.test(b.text));
    const at = numbered ? `${'ABCDE'[i % this.run.cols]}${Math.floor(i / this.run.cols) + 1}: ` : '';
    const say = (rest: string) => (at ? `${at}${rest}` : `${rest[0].toUpperCase()}${rest.slice(1)}`);
    if (p.crop) {
      const c = p.crop;
      const name = CARDS[c.kind].name.toLowerCase();
      const next = nextPick(this.run, i);
      if (!next) return say(`${name}.`);
      if (next.never) return say(`${name}, too late to ripen.`);
      const n = next.ripeIn;
      const when = next.late ? 'next season' : n <= 0 ? 'tonight' : n === 1 ? 'tomorrow night' : `in ${n} nights`;
      return say(`${name}${c.pest ? ', pests,' : ''} pays ${next.score} ${when}.`);
    }
    if (p.obj) return say(`${CARDS[p.obj].name.toLowerCase()}.`);
    return say('bare soil.');
  }

  private inspect(i: number): void {
    this.say(this.plotLine(i), i);
  }

  // ---------------------------------------------------------------- end of day, the night, the cascade

  endDay(): void {
    if (this.busy || this.run.phase !== 'day') return;
    // A card still in flight lands first: its landing shows the board as the play left it, and must not
    // run during the night, where it would show the morning's board and tomorrow's hand.
    this.settle();
    this.putDown(true);
    this.sheets.closeDetail();
    const before = clonePlots(this.run.plots);
    const handBefore = [...this.run.hand];
    const energyBefore = this.run.energy;
    const benchBefore = this.run.bench;
    const ev = endDay(this.run);
    for (const e of ev) if (e.t === 'harvest') this.ruleScores.push(e.h.score);
    if ((this.run.phase as string) === 'over') recordRun(this.meta, this.run, UNLOCK_ORDER);
    // What the night teaches by showing: the pegboard comes for the first harvest, bloom for the first bloom.
    const harvests = ev.filter((e): e is Extract<Ev, { t: 'harvest' }> => e.t === 'harvest');
    const arrive: Piece[] = [];
    if (harvests.length && this.tutor.unlock('peg')) arrive.push('peg');
    if (harvests.some((e) => e.h.mult.length > 0) && this.tutor.unlock('bloom')) arrive.push('bloom');
    if (ev.some((e) => e.t === 'seasonEnd') && this.tutor.unlock('coins')) arrive.push('coins');
    if (arrive.length) this.applyPieces(arrive);
    this.tutor.count('night');
    this.tutor.count('harvest', harvests.length);
    this.tutor.count('crow', ev.filter((e) => e.t === 'crow').length);
    if (ev.some((e) => e.t === 'shop')) this.tutor.count('stall');
    this.save();
    this.ctx.audio.cue('deck.endday');
    this.shown = before;
    this.shownEnergy = energyBefore;
    this.shownBench = benchBefore;
    this.handShown = handBefore.filter((c) => !ev.some((e) => e.t === 'discardExcess' && e.cards.some((x) => x.uid === c.uid)));
    this.setLine(null);
    this.night(ev);
  }

  /** Dawn: the rules' state is the truth from here. */
  private dawn(): void {
    const from = this.shownEnergy;
    this.resetSlots();
    this.shown = clonePlots(this.run.plots);
    this.shownEarned = this.run.earned;
    this.shownCoins = this.run.coins;
    this.shownDay = this.run.day;
    this.handShown = [...this.run.hand];
    this.board.anims.clear();
    this.board.night = 0;
    this.shownEnergy = this.run.energy;
    this.shownBench = this.run.bench;
    if (this.run.phase === 'day' && this.run.energy > from) {
      this.renderBench();
      this.refill(from);
    }
    // A crow on the bed's corner at dawn: once its lesson has had its say, a short note each time.
    if (this.run.phase === 'day' && this.run.crow) {
      this.ctx.audio.cue('deck.crow', { gain: 0.45, pitch: 1.1 });
      if (this.tutor.learn.done.includes('crows')) this.say('A crow is about tonight.', null);
    }
  }

  /** Build and run the night from the rules' report. */
  private night(ev: Ev[]): void {
    const b = this.board;
    const s = new Seq();
    const reduced = this.ctx.settings().reducedMotion;
    const lanternOut = () => {
      this.flame.classList.add('out');
      const lr = this.lantern.getBoundingClientRect();
      const br = b.canvas.getBoundingClientRect();
      b.emit('smoke', lr.left - br.left + lr.width / 2, lr.top - br.top + lr.height * 0.35, reduced ? 2 : 6, { col: 'rgba(200,200,200,0.5)', spread: 12, up: 30, size: 8, life: 1.2 });
    };
    s.at(0, lanternOut);
    s.tween(0, 0.4, (k) => (b.night = ease.out(k) * 0.62));
    let t = 0.4;
    const harvests = ev.filter((e): e is Extract<Ev, { t: 'harvest' }> => e.t === 'harvest').map((e) => e.h);
    const n = harvests.length;
    let hi = 0;
    const plotsOf = (i: number) => this.shown[i];
    const anim = (uid: number) => {
      let a = b.anims.get(uid);
      if (!a) {
        a = { lift: 0, scale: 1, tilt: 0, alpha: 1, stage: null, glow: 0 };
        b.anims.set(uid, a);
      }
      return a;
    };
    let seasonEnd: Extract<Ev, { t: 'seasonEnd' }> | null = null;
    let dawnAt = -1;
    for (const e of ev) {
      switch (e.t) {
        case 'rain': {
          const at = t;
          s.at(at, () => this.ctx.audio.cue('deck.water', { gain: 1 }));
          s.tween(at, 0.7, () => {
            if (reduced) return;
            for (let k = 0; k < 3; k++) b.emit('drop', b.bx + Math.random() * b.T * b.cols, b.by - b.T * 0.5, 1, { col: '#7aa8d8', spread: 10, up: -200, size: 5, life: 0.5 });
          });
          t += 0.6;
          break;
        }
        case 'flatten': {
          const at = t;
          s.at(at, () => {
            this.ctx.audio.cue('deck.crow', { pitch: 0.7 });
            const c = b.centre(e.plot);
            b.emit('leaf', c.x, c.y, 10, { col: '#5d8a3a', spread: 80, up: 50, size: 5 });
          });
          s.tween(at, 0.4, (k) => {
            const a = anim(e.uid);
            a.tilt = ease.out(k) * 1.3;
            a.alpha = 1 - k;
          });
          s.at(at + 0.4, () => {
            plotsOf(e.plot).crop = null;
            b.anims.delete(e.uid);
          });
          t += 0.45;
          break;
        }
        case 'grow': {
          const at = t;
          s.at(at, () => this.ctx.audio.cue('deck.grow'));
          for (const g of e.growth) {
            s.at(at, () => {
              const crop = plotsOf(g.plot).crop;
              if (crop) crop.age = g.to;
              plotsOf(g.plot).boost = 0;
              const c = b.centre(g.plot);
              if (!reduced) b.emit('spark', c.x, c.y - b.T * 0.2, 2, { col: '#b8e08a', spread: 30, up: 40, size: 3 });
            });
            s.tween(at, 0.3, (k) => {
              const a = anim(g.uid);
              a.scale = 1 + ease.pop(k) * 0.14;
            });
          }
          t += 0.38;
          break;
        }
        case 'pest': {
          const at = t;
          s.at(at, () => {
            const crop = plotsOf(e.plot).crop;
            if (crop) crop.pest = 2;
            this.ctx.audio.cue('deck.pest', { pan: this.pan(e.plot) });
            const c = b.centre(e.plot);
            b.emit('dust', c.x, c.y - b.T * 0.2, 6, { col: '#3e4a2a', spread: 30, up: 20, size: 3 });
          });
          t += 0.18;
          break;
        }
        case 'pestGone':
          s.at(t, () => {
            for (const i of e.plots) {
              const crop = plotsOf(i).crop;
              if (crop) crop.pest = 0;
            }
          });
          break;
        case 'mint': {
          s.at(t, () => {
            plotsOf(e.to).crop = { uid: e.uid, kind: 'mint', age: 0, days: 2, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: true };
            this.bounce(e.uid);
          });
          t += 0.15;
          break;
        }
        case 'crow': {
          const at = t;
          s.at(at, () => {
            this.ctx.audio.cue('deck.crow', { pan: this.pan(e.plot) });
            const c = b.centre(e.plot);
            b.emit('feather', c.x, c.y - b.T * 0.4, 8, { col: '#2a2830', spread: 70, up: 40, size: 6, life: 1.2 });
            this.say('A crow took one.', e.plot);
          });
          s.tween(at, 0.45, (k) => {
            const a = anim(e.uid);
            a.lift = ease.out(k) * 1.4;
            a.alpha = 1 - k;
          });
          s.at(at + 0.46, () => {
            b.anims.delete(e.uid);
            const crop = plotsOf(e.plot).crop;
            if (crop) {
              crop.picks++;
              if (crop.picks >= SEEDS[crop.kind].picks) plotsOf(e.plot).crop = null;
            }
          });
          t += 0.55;
          break;
        }
        case 'harvest': {
          const h = e.h;
          const d = this.harvestSpan(h, n);
          this.scoreHarvest(s, t, h, hi, n);
          hi++;
          t += d;
          break;
        }
        case 'seasonEnd':
          seasonEnd = e;
          break;
        case 'dawn':
          if (dawnAt < 0) dawnAt = t + 0.6;
          break;
        default:
          break;
      }
    }
    const end = Math.max(t + 0.65, dawnAt);
    s.tween(end - 0.1, 0.5, (k) => (b.night = 0.62 * (1 - ease.inOut(k))));
    s.at(end, () => {
      this.flame.classList.remove('out');
      this.ctx.audio.cue('deck.draw');
    });
    s.at(end + 0.4, () => {
      this.dawn();
      this.pegBackK = this.run.quota ? this.run.earned / this.run.quota : 0;
      if (ev.some((x) => x.t === 'shuffle')) this.ctx.audio.cue('deck.shuffle');
      this.renderAll();
      this.updateHighlight();
    });
    s.then(() => {
      // Make sure a skipped night lands in the same place.
      if (this.shownDay !== this.run.day || this.shownEnergy !== this.run.energy || this.shownBench !== this.run.bench) this.dawn();
      this.shown = clonePlots(this.run.plots);
      this.shownEarned = this.run.earned;
      this.shownCoins = this.run.coins;
      this.handShown = [...this.run.hand];
      b.anims.clear();
      b.night = 0;
      this.flame.classList.remove('out');
      this.fx.querySelectorAll('.sb-slip, .sb-arc, .sb-flyscoop').forEach((x) => x.remove());
      this.seq = null;
      if (seasonEnd) {
        this.sheets.close();
        // A season met opens the stall; the last winter met, or a season missed, ends the run with its entry.
        if (this.run.phase === 'shop') this.sheets.stall(seasonEnd);
        else this.sheets.entry();
      }
      this.renderAll();
      this.updateHighlight();
    });
    this.seq = s;
    this.renderBench();
  }

  /** How a harvest's steps are paced: each bonus travels from where it came from, one after another. */
  /** A night with many harvests runs quicker, so a full plot stays brisk; a first night with two radishes takes its time. */
  private squeeze(n: number): number {
    return n > 5 ? Math.max(0.3, 5 / n) : 1;
  }

  private stepTimes(h: Harvest, n: number): { gap: number; fly: number; lead: number } {
    const k = this.squeeze(n);
    const steps = h.chips.length + h.mult.length;
    const many = steps > 4 ? 4 / steps : 1;
    return { gap: 0.17 * k * many, fly: 0.24 * Math.max(0.6, k), lead: 0.14 * k };
  }

  /** How long a harvest holds the stage, before speed. Big ones get a beat more. */
  private harvestSpan(h: Harvest, n: number): number {
    const { gap, fly, lead } = this.stepTimes(h, n);
    const k = this.squeeze(n);
    const steps = h.chips.length + h.mult.length;
    let d = lead + (steps ? (steps - 1) * gap + fly : 0) + 0.3 * k;
    if (this.run.quota > 0 && h.score >= this.run.quota / 4) d += 0.3 * Math.max(0.5, k);
    return Math.max(0.3, d);
  }

  /**
   * Schedule one harvest's scoring at time t. The crop lifts and a slip shows
   * its yield by a basket (and, once bloom has been met, × its bloom by a red
   * flower). Each bonus flies in from the crop that gave it, a small "+2" or
   * "+1" that lands on the slip and leaves its picture there. Then the slip
   * becomes the total and flies onto the pegboard.
   */
  private scoreHarvest(s: Seq, t: number, h: Harvest, index: number, n: number): void {
    const b = this.board;
    const big = this.run.quota > 0 && h.score >= this.run.quota / 4;
    const mid = this.run.quota > 0 && h.score >= this.run.quota / 10;
    const reduced = this.ctx.settings().reducedMotion;
    const d = this.harvestSpan(h, n);
    const { gap, fly, lead } = this.stepTimes(h, n);
    const showBloom = this.seen('bloom') || h.mult.length > 0;
    const a = { lift: 0, scale: 1, tilt: 0, alpha: 1, stage: null as number | null, glow: 0 };
    let slip: HTMLDivElement | null = null;
    let yv: HTMLElement;
    let bv: HTMLElement;
    let row: HTMLElement;
    const at = (plot: number) => {
      const br = b.canvas.getBoundingClientRect();
      const tr = this.tableEl.getBoundingClientRect();
      const c = b.base(plot);
      return { x: br.left - tr.left + c.x, y: br.top - tr.top + c.y - b.T * 0.95 };
    };
    s.at(t, () => {
      b.anims.set(h.uid, a);
      this.hot = 1.2;
      this.ctx.audio.cue('deck.harvest', { pitch: ladder(index), pan: this.pan(h.plot) });
      slip = el('div', `sb-slip${big ? ' big' : mid ? ' mid' : ''}${h.golden ? ' golden' : ''}`);
      const sum = el('span', 'sb-sum');
      yv = el('b', 'y', String(h.base));
      sum.append(yv, iconImg('basket', 'sb-ic'));
      bv = el('b', 'm', '1');
      if (showBloom) sum.append(el('span', 'x', '×'), bv, iconImg('bloom', 'sb-ic'));
      row = el('span', 'sb-steps');
      slip.append(sum, row);
      const p = at(h.plot);
      slip.style.left = `${p.x}px`;
      slip.style.top = `${p.y}px`;
      this.fx.append(slip);
    });
    s.tween(t, Math.min(0.3, d * 0.3), (k) => {
      a.glow = k;
      a.lift = ease.back(k) * 0.14;
      a.scale = 1 + ease.out(k) * 0.12;
    });
    // Yield steps, then bloom steps, each arriving from where it came from.
    const steps = [...h.chips.map((st) => ({ st, kind: 'y' as const })), ...h.mult.map((st) => ({ st, kind: 'm' as const }))];
    let yval = h.base;
    let mAdd = 1;
    let mX = 1;
    steps.forEach(({ st, kind }, j) => {
      const go = t + lead + j * gap;
      const lands = go + (st.from !== undefined ? fly : 0);
      // The bonus's picture takes its place on the slip as it sets off (hidden until it lands), so the
      // arc flies to its own place and never lands on a bonus already there; chips wrap to a second line.
      let chip: HTMLElement | null = null;
      s.at(go, () => {
        chip = el('span', `sb-chip ${kind} waiting`);
        chip.append(iconImg(st.icon, ''), document.createTextNode(`${st.op === '+' ? '+' : '×'}${fmtNum(st.v)}`));
        row.append(chip);
      });
      if (st.from !== undefined) this.arc(s, go, fly, st, kind, h.plot, () => chip);
      s.at(lands, () => {
        if (kind === 'y') {
          yval = st.op === '+' ? yval + st.v : yval * st.v;
          yv.textContent = fmtNum(yval);
          yv.classList.remove('tick');
          void yv.offsetWidth;
          yv.classList.add('tick');
          this.ctx.audio.cue('deck.chip', { pitch: ladder(index + j + 1), gain: 0.6 });
        } else {
          if (st.op === '+') mAdd += st.v;
          else mX *= st.v;
          bv.textContent = fmtNum(mAdd * mX);
          bv.classList.remove('tick');
          void bv.offsetWidth;
          bv.classList.add('tick');
          this.ctx.audio.cue('deck.mult', { pitch: Math.min(2, 0.9 + mAdd * mX * 0.08), gain: Math.min(1, 0.5 + mAdd * mX * 0.08) });
        }
        // The bonus leaves its picture on the slip: a carrot and +2, a radish and +1.
        chip?.classList.remove('waiting');
      });
    });
    // The total.
    const totalAt = t + d - Math.min(0.3, d * 0.3);
    s.at(totalAt, () => {
      if (!slip) return;
      slip.classList.add('total');
      slip.innerHTML = '';
      slip.append(el('b', 'sum', String(h.score)));
      this.shownScores.push(h.score);
      const c = b.base(h.plot);
      if (big && !reduced) {
        b.emit('spark', c.x, c.y - b.T * 0.5, 18, { col: '#f2c64a', spread: 120, up: 120, size: 5, life: 0.9 });
        this.shakeT = 0.4;
        this.shakeAmp = 5;
        this.ctx.audio.cue('deck.big');
      } else if (mid && !reduced) b.emit('spark', c.x, c.y - b.T * 0.5, 7, { col: '#f2d27a', spread: 70, up: 70, size: 4 });
      if (h.golden) b.emit('spark', c.x, c.y - b.T * 0.5, 12, { col: '#ffe08a', spread: 90, up: 90, size: 5 });
    });
    // A crop pulled up (or a strawberry's pick) puts a scoop back: it flies to the bench for the morning.
    if (h.scoops > 0 && this.seen('scoops')) this.flyScoop(s, totalAt, h.plot);
    const tail = Math.min(0.3, d * 0.3);
    s.tween(totalAt, tail, (k) => {
      if (h.leaves) {
        a.alpha = 1 - k;
        a.lift = 0.14 + k * 0.5;
      } else {
        a.glow = 1 - k;
        a.lift = 0.14 * (1 - k);
        a.scale = 1 + 0.12 * (1 - k);
      }
    });
    s.at(totalAt + tail, () => {
      b.anims.delete(h.uid);
      const p = this.shown[h.plot];
      if (p.crop && p.crop.uid === h.uid) {
        p.crop.picks++;
        if (h.leaves) p.crop = null;
      }
    });
    // Fly the total into the pegboard.
    const flyAt = totalAt + Math.min(0.22, d * 0.25);
    const flyDur = reduced ? 0.15 : 0.42;
    let fromX = 0;
    let fromY = 0;
    let toX = 0;
    let toY = 0;
    s.at(flyAt, () => {
      if (!slip) return;
      const tr = this.tableEl.getBoundingClientRect();
      const pr = this.peg.getBoundingClientRect();
      const p = at(h.plot);
      fromX = p.x;
      fromY = p.y;
      const k = Math.min(1, (this.shownEarned + h.score) / Math.max(1, this.run.quota));
      toX = pr.left - tr.left + this.pegXs[Math.round(k * (this.pegXs.length - 1))];
      toY = pr.top - tr.top + pr.height / 2;
      slip.classList.add('fly');
    });
    s.tween(flyAt, flyDur, (k) => {
      if (!slip) return;
      const e = ease.inOut(k);
      const x = fromX + (toX - fromX) * e;
      const y = fromY + (toY - fromY) * e - Math.sin(Math.PI * e) * 50;
      slip.style.left = `${x}px`;
      slip.style.top = `${y}px`;
      slip.style.transform = `translate(-50%, -50%) scale(${1 - e * 0.55})`;
    });
    s.at(flyAt + flyDur, () => {
      slip?.remove();
      const before = this.shownEarned;
      this.shownEarned += h.score;
      this.shownCoins += h.score;
      this.renderLedger();
      this.peg.classList.remove('tick');
      void this.peg.offsetWidth;
      this.peg.classList.add('tick');
      if (before < this.run.quota && this.shownEarned >= this.run.quota && this.run.quota > 0) {
        // The quota is met: the peg drops into the brass hole, gilds, and the table says so.
        this.ctx.audio.cue('deck.quota');
        this.peg.classList.add('met');
        this.peg.classList.remove('home');
        void this.peg.offsetWidth;
        this.peg.classList.add('home');
        if (this.seen('peg')) this.say('Quota met.', null);
      }
    });
  }

  /** A scoop put back by a pulled crop, flying from its plot to the end of the bench. */
  private flyScoop(s: Seq, at: number, plot: number): void {
    const b = this.board;
    let img: HTMLImageElement | null = null;
    let p0 = { x: 0, y: 0 };
    let p1 = { x: 0, y: 0 };
    const dur = this.ctx.settings().reducedMotion ? 0.15 : 0.5;
    s.at(at, () => {
      const tr = this.tableEl.getBoundingClientRect();
      const br = b.canvas.getBoundingClientRect();
      const sr = this.scoops.getBoundingClientRect();
      const c = b.centre(plot);
      p0 = { x: br.left - tr.left + c.x, y: br.top - tr.top + c.y };
      p1 = { x: sr.right - tr.left + 10, y: sr.top - tr.top + sr.height / 2 };
      img = el('img', 'sb-flyscoop');
      img.src = scoopUrl(true);
      img.alt = '';
      img.style.left = `${p0.x}px`;
      img.style.top = `${p0.y}px`;
      this.fx.append(img);
      this.ctx.audio.cue('deck.draw', { gain: 0.35, pitch: 1.3 });
    });
    s.tween(at, dur, (k) => {
      if (!img) return;
      const e = ease.inOut(k);
      img.style.left = `${p0.x + (p1.x - p0.x) * e}px`;
      img.style.top = `${p0.y + (p1.y - p0.y) * e - Math.sin(Math.PI * e) * 60}px`;
      img.style.opacity = String(k > 0.85 ? (1 - k) / 0.15 : 1);
    });
    s.at(at + dur, () => {
      img?.remove();
      img = null;
      this.scoops.classList.remove('gain');
      void this.scoops.offsetWidth;
      this.scoops.classList.add('gain');
    });
  }

  /** A bonus travelling from the crop that gave it to its own place on the slip: its picture and "+1", on an arc. */
  private arc(s: Seq, go: number, dur: number, st: Step, kind: 'y' | 'm', to: number, slot: () => HTMLElement | null): void {
    const b = this.board;
    let badge: HTMLElement | null = null;
    let p0 = { x: 0, y: 0 };
    let p1 = { x: 0, y: 0 };
    s.at(go, () => {
      const br = b.canvas.getBoundingClientRect();
      const tr = this.tableEl.getBoundingClientRect();
      const ox = br.left - tr.left;
      const oy = br.top - tr.top;
      const a = b.base(st.from!);
      const c = b.base(to);
      p0 = { x: ox + a.x, y: oy + a.y - b.T * 0.45 };
      p1 = { x: ox + c.x, y: oy + c.y - b.T * 1.0 };
      badge = el('span', `sb-arc ${kind}`);
      badge.append(iconImg(kind === 'y' ? 'basket' : 'bloom', ''), document.createTextNode(`${st.op === '+' ? '+' : '×'}${fmtNum(st.v)}`));
      badge.style.left = `${p0.x}px`;
      badge.style.top = `${p0.y}px`;
      this.fx.append(badge);
      // The giver nods as it sends the bonus.
      const giver = this.shown[st.from!]?.crop;
      if (giver && !b.anims.has(giver.uid)) this.bounce(giver.uid);
    });
    s.tween(go, dur, (k) => {
      if (!badge) return;
      // Home in on the bonus's place on the slip, which may move as the slip grows.
      const place = slot();
      if (place) {
        const r = place.getBoundingClientRect();
        const tr = this.tableEl.getBoundingClientRect();
        p1 = { x: r.left - tr.left + r.width / 2, y: r.top - tr.top + r.height / 2 };
      }
      const e = ease.inOut(k);
      const lift = Math.max(30, Math.hypot(p1.x - p0.x, p1.y - p0.y) * 0.5);
      const x = p0.x + (p1.x - p0.x) * e;
      const y = p0.y + (p1.y - p0.y) * e - Math.sin(Math.PI * e) * lift;
      badge.style.left = `${x}px`;
      badge.style.top = `${y}px`;
      // It shrinks to the size of its place on the slip as it lands, so it never overhangs the bonuses beside it.
      const land = Math.max(0, Math.min(1, (k - 0.45) / 0.35));
      badge.style.transform = `translate(-50%, -50%) scale(${1 - 0.32 * land * land * (3 - 2 * land)})`;
      badge.style.opacity = String(k > 0.8 ? (1 - k) / 0.2 : 1);
    });
    s.at(go + dur, () => {
      badge?.remove();
      badge = null;
    });
  }

  skip(): void {
    if (!this.seq) return;
    this.seq.finish();
    this.settle();
  }

  /** Finish every small animation now (a card in flight, a bounce, a shears harvest), including any they start. */
  private settle(): void {
    for (let guard = 0; guard < 8 && this.small.length; guard++) {
      const list = this.small;
      this.small = [];
      for (const s of list) s.finish();
    }
    this.small = [];
  }

  /** Small animations still running, for checks. */
  get inFlight(): number {
    return this.small.filter((s) => !s.done).length;
  }

  // ---------------------------------------------------------------- keyboard

  private onKey = (e: KeyboardEvent) => {
    if (!this.running || e.defaultPrevented) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === 'Backquote') return;
    if (this.sheets.open) {
      if (this.sheets.key(e)) e.preventDefault();
      return;
    }
    if (this.busy) {
      if (!e.repeat && !['ShiftLeft', 'ShiftRight', 'MetaLeft', 'AltLeft', 'ControlLeft'].includes(e.code)) {
        e.preventDefault();
        this.skip();
      }
      return;
    }
    const s = this.run;
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (digit) {
      const i = Number(digit[1]) - 1;
      const c = s.hand[i];
      if (c) {
        e.preventDefault();
        // Shift takes up a card the scoops cannot pay for, so it can still be tossed.
        if (this.held?.uid === c.uid) this.putDown();
        else if (!this.affordable(c.uid) && !e.shiftKey) this.nope(c.uid);
        else this.pickUp(c.uid);
      }
      return;
    }
    const move = (dc: number, dr: number) => {
      e.preventDefault();
      const c = Math.max(0, Math.min(s.cols - 1, (this.cursor % s.cols) + dc));
      const r = Math.max(0, Math.min(s.rows - 1, Math.floor(this.cursor / s.cols) + dr));
      this.cursor = r * s.cols + c;
      this.hover = null;
      this.updateHighlight();
    };
    switch (e.code) {
      case 'ArrowLeft':
        return move(-1, 0);
      case 'ArrowRight':
        return move(1, 0);
      case 'ArrowUp':
        return move(0, -1);
      case 'ArrowDown':
        return move(0, 1);
      case 'Enter':
      case 'Space':
      case 'NumpadEnter':
        e.preventDefault();
        if (this.held) this.tryPlay(this.cursor);
        else this.inspect(this.cursor);
        return;
      case 'KeyE':
        if (!this.seen('lantern')) return;
        e.preventDefault();
        this.endDay();
        return;
      case 'KeyX':
      case 'Delete':
      case 'Backspace':
        if (this.held && this.seen('spent')) {
          e.preventDefault();
          this.tossHeld();
        }
        return;
      case 'KeyD':
        if (!this.seen('tin')) return;
        e.preventDefault();
        this.sheets.deck('tin');
        return;
      case 'KeyI':
        if (this.held) {
          const c = this.cardOf(this.held.uid);
          if (c) this.sheets.detail(c);
        }
        return;
      case 'KeyF':
        this.prefs.fast = !this.prefs.fast;
        this.say(this.prefs.fast ? 'Fast harvests.' : 'Easy harvests.', null);
        this.save();
        return;
      case 'Escape':
        e.preventDefault();
        if (this.held) this.putDown();
        else this.sheets.menu();
        return;
    }
  };

  // ---------------------------------------------------------------- debug

  /** Seconds of night left, for checks. */
  remaining(): number {
    return this.seq ? Math.max(0, this.seq.end - this.seq.t) : 0;
  }

  get handEls(): Map<number, CardEl> {
    return this.cards;
  }

  get lanternEl(): HTMLElement {
    return this.lantern;
  }

  get tallyText(): string {
    return this.ledTally.textContent ?? '';
  }

  /** What the ledger says is still to go over the last two days ("64 to go"), or empty. */
  get toGoText(): string {
    return this.ledTally.querySelector('i')?.textContent ?? '';
  }
}

function iconImg(key: string, cls: string): HTMLImageElement {
  const i = el('img', cls);
  i.src = iconUrl(key);
  i.alt = '';
  return i;
}

export function fmtNum(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
}
