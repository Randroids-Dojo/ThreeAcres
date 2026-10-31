// Seedbound: a roguelike deckbuilder about seasons and a small plot. A seed tin
// of cards, a four by four plot painted as an almanac plate, and a season's
// quota to meet on the pegboard.

import type { GameModule } from '../../shell/types';
import './deck.css';
import { buyCard, buyPage, CARD_IDS, CARDS, leaveShop, reroll, type RunState } from './rules';
import { bestPlay, type Play } from './bot';
import { Table, type SaveData } from './table';
import { faceUrl, fontsReady } from './view/faces';

export interface DeckDebug {
  table: Table;
  state(): RunState;
  /** Start a fresh run from a seed (no teaching hand unless asked). */
  seed(n: number, teach?: boolean): void;
  /** Take up hand card i and play it on a plot (and a second plot for the trowel). */
  play(i: number, plot: number | null, to?: number): boolean;
  endDay(): void;
  skip(): void;
  busy(): boolean;
  fast(on: boolean): void;
  /** Screen rects for scripted taps. */
  rects(): { cards: DOMRect[]; plots: DOMRect[]; lantern: DOMRect; heap: DOMRect; book: DOMRect };
  tally(): string;
  shownScores(): number[];
  frames(): number;
  frameMs(): number[];
  shop: { buy(i: number): boolean; page(i: number): boolean; reroll(): boolean; leave(): boolean };
  /** What the balance bot would play now (null: end the day). */
  suggest(): Play | null;
  /** Harvest scores the rules reported this session, in order. */
  ruleScores(): number[];
}

declare global {
  interface Window {
    deck?: DeckDebug;
  }
}

export const game: GameModule = {
  id: 'deck',
  async start(ctx) {
    await fontsReady();
    if (new URLSearchParams(location.search).has('deckart')) {
      ctx.root.style.cssText = 'background:#6b4a2e;overflow:auto;padding:70px 10px;display:flex;flex-wrap:wrap;gap:10px;align-content:flex-start;touch-action:pan-y';
      for (const id of CARD_IDS) {
        for (const up of [false, true]) {
          const img = document.createElement('img');
          img.src = faceUrl(id, up);
          img.alt = CARDS[id].name;
          img.style.cssText = 'width:150px;height:210px;filter:drop-shadow(0 3px 3px rgba(0,0,0,.4))';
          ctx.root.append(img);
        }
      }
      return { pause() {}, resume() {}, save() {}, reset() {} };
    }
    const t = new Table(ctx);
    t.load(ctx.load<SaveData>());
    t.start();
    const after = () => {
      t.save();
      t.sheets.stall();
    };
    window.deck = {
      table: t,
      state: () => t.run,
      seed: (n, teach = false) => t.fresh(n, teach),
      play: (i, plot, to) => {
        const c = t.run.hand[i];
        if (!c || t.busy) return false;
        t.pickUp(c.uid);
        if (CARDS[c.id].target === 'move') {
          if (!t.tryPlay(plot)) return false;
          return t.tryPlay(to ?? null);
        }
        const ok = t.tryPlay(plot);
        if (!ok) t.putDown(true);
        return ok;
      },
      endDay: () => t.endDay(),
      skip: () => t.skip(),
      busy: () => t.busy,
      fast: (on) => {
        t.prefs.fast = on;
        t.save();
      },
      rects: () => {
        const br = t.board.canvas.getBoundingClientRect();
        const plots = t.run.plots.map((_, i) => {
          const c = t.board.centre(i);
          return new DOMRect(br.left + c.x - t.board.T / 2, br.top + c.y - t.board.T / 2, t.board.T, t.board.T);
        });
        const cards = t.run.hand.map((c) => t.handEls.get(c.uid)?.el.getBoundingClientRect() ?? new DOMRect());
        return {
          cards,
          plots,
          lantern: t.lanternEl.getBoundingClientRect(),
          heap: (t.el.querySelector('.sb-heap') as HTMLElement).getBoundingClientRect(),
          book: (t.el.querySelector('.sb-book') as HTMLElement).getBoundingClientRect(),
        };
      },
      tally: () => t.tallyText,
      shownScores: () => t.shownScores,
      ruleScores: () => t.ruleScores,
      suggest: () => (t.run.phase === 'day' ? bestPlay(t.run, t.run.day + t.run.season * 7) : null),
      frames: () => t.board.frames,
      frameMs: () => t.frameMs,
      shop: {
        buy: (i) => {
          const ok = !!buyCard(t.run, i);
          after();
          return ok;
        },
        page: (i) => {
          const ok = !!buyPage(t.run, i);
          after();
          return ok;
        },
        reroll: () => {
          const ok = !!reroll(t.run);
          after();
          return ok;
        },
        leave: () => {
          const ok = !!leaveShop(t.run);
          if (ok) {
            t.save();
            t.sheets.close();
            t.syncAll();
          }
          return ok;
        },
      },
    };
    return {
      pause: () => t.stop(),
      resume: () => {
        t.relayout();
        t.start();
      },
      save: () => t.save(),
      reset: () => {
        t.meta = { v: 1, unlocked: [], runs: 0, best: { seasons: 0, harvest: 0, coins: 0, year: 1, season: 0 } };
        t.taught = 0;
        t.fresh(null, true);
      },
    };
  },
};
