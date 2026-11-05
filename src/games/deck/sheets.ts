// Everything that lies over the table for a while: the almanac (pause and
// settings), a card held up close, the seed tin's contents, the seed
// merchant's stall between seasons, and the almanac's entry for the run.
// Each is its own material: a book page, a merchant's tray and cork board,
// a ruled entry. None of them is a box of equal buttons.

import type { GameContext } from '../../shell/types';
import {
  allCards,
  buyCard,
  buyLevel,
  buyPage,
  buyScoop,
  buySlot,
  canBuyScoop,
  levelChange,
  levelName,
  pageLevel,
  levelText,
  twistNote,
  canRemove,
  scoopOnSale,
  scoopsIdle,
  canUpgrade,
  CARDS,
  cardText,
  chooseEngine,
  chooseTwist,
  ENGINES,
  engineText,
  costOf,
  isFinal,
  leaveShop,
  maxPages,
  nextCarry,
  nextQuota,
  nextSeason,
  PAGES,
  PLURALS,
  removeCard,
  removePrice,
  reroll,
  scoopPrice,
  SEASON_NAMES,
  seasonsToNext,
  SEEDS,
  slotOnSale,
  slotPrice,
  topCrops,
  TUNING,
  twistEase,
  twistQuota,
  twistText,
  upgradeCard,
  upgradeNote,
  upgradePrice,
  type Card,
  type CardId,
  type Ev,
  type PageId,
  type SeedId,
} from './rules';
import type { Line } from './lessons';
import type { Table } from './table';
import { pinUrl, scoopUrl, thingUrl } from './view/art';
import { faceUrl, VARIETY } from './view/faces';
import { paintBell, paintStamp } from './view/glyphs';
import { twistUrl } from './view/icons';

/** Phone stall goods: the most they grow, and the gaps of two rows of two (a row of price tags between the rows). */
const GOODS_MAX = 1.8;
const TWO_COLS = 26;
const TWO_ROWS = 34;

const NUMS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

type Kind = 'menu' | 'rules' | 'deck' | 'stall' | 'entry';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const scoops = (n: number) => (n === 0 ? 'free' : `${n} ${n === 1 ? 'scoop' : 'scoops'}`);
const lower = (id: CardId) => CARDS[id].name.toLowerCase();
const lowerFirst = (s: string) => s[0].toLowerCase() + s.slice(1);
/** Cards whose name is a plural: "The beans go in your tin." (round 7: "The ladybirds goes"). */
const plural = (id: CardId) => /s$/.test(CARDS[id].name) && id !== 'compost';
/** "pumpkin, shears and mint": a list said the way a person would. */
export const listOf = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function btn(cls: string, html: string, on: () => void): HTMLButtonElement {
  const b = el('button', cls, html);
  b.onclick = (e) => {
    e.stopPropagation();
    on();
  };
  return b;
}

/** A card said in plain words: its cost, when a seed ripens, and its rule. */
export function cardWords(id: CardId, up: boolean): string {
  const d = CARDS[id];
  const bits = [`${scoops(costOf(id, up))}.`];
  if (d.type === 'seed') {
    const sd = SEEDS[id as SeedId];
    bits.push(`Ripe in ${sd.days} ${sd.days === 1 ? 'night' : 'nights'}.`);
  }
  bits.push(cardText(id, up));
  return bits.join(' ');
}

/** A tin bucket, for throwing a card out. Not the compost heap: compost is a card. */
function paintBucket(g: CanvasRenderingContext2D, px: number): void {
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(-0.3, -0.18);
  g.lineTo(0.3, -0.18);
  g.lineTo(0.23, 0.32);
  g.lineTo(-0.23, 0.32);
  g.closePath();
  g.fillStyle = '#8f969a';
  g.fill();
  g.strokeStyle = '#2a1a0a';
  g.lineWidth = Math.max(px * 1.5, 0.03);
  g.stroke();
  g.beginPath();
  g.ellipse(0, -0.18, 0.3, 0.07, 0, 0, Math.PI * 2);
  g.fillStyle = '#5a5f62';
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(0, -0.2, 0.26, Math.PI * 1.05, Math.PI * 1.95);
  g.stroke();
  g.beginPath();
  for (const y of [0.0, 0.16]) {
    g.moveTo(-0.27 + y * 0.12, y);
    g.lineTo(0.27 - y * 0.12, y);
  }
  g.lineWidth = Math.max(px, 0.018);
  g.stroke();
}

export class Sheets {
  readonly el = el('div', 'sb-sheets');
  private detailEl = el('div', 'sb-detail');
  open = false;
  kind: Kind | null = null;
  private detailHover = false;
  /** Stall: the item lifted for a second tap. */
  private picked: string | null = null;
  private pickUid: number | null = null;
  /** The stall's lesson line, pinned at its head. */
  private lessonEl = el('div', 'sb-stall-lesson');
  /** What the stall last did, said once on the reading slip ("Carrot improved: basket 8."). */
  private done: string | null = null;

  constructor(
    private t: Table,
    private ctx: GameContext,
  ) {
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el && this.kind !== 'stall' && this.kind !== 'entry') this.back();
    });
    this.detailEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.closeDetail();
    });
  }

  private show(kind: Kind, body: HTMLElement, focus = 'button:not([disabled])'): void {
    this.closeDetail();
    this.el.innerHTML = '';
    this.el.append(body);
    this.el.dataset.kind = kind;
    this.el.dataset.phase = this.t.run.phase;
    this.el.classList.add('on');
    this.open = true;
    this.kind = kind;
    this.t.putDown(true);
    if (this.ctx.device() === 'key') {
      const f = (this.el.querySelector(focus) ?? this.el.querySelector('button:not([disabled])')) as HTMLButtonElement | null;
      f?.focus({ preventScroll: true });
    }
  }

  /** Leave the current sheet for whatever the run needs under it: the stall, the entry, or the table. */
  back(): void {
    const phase = this.t.run.phase;
    if (phase === 'shop') this.stall();
    else if (phase === 'over') this.entry();
    else this.close();
  }

  close(): void {
    this.el.classList.remove('on');
    this.el.innerHTML = '';
    this.open = false;
    this.kind = null;
    this.picked = null;
    this.done = null;
    this.needTwist = false;
    this.needEngine = false;
  }

  private get touch(): boolean {
    return this.ctx.device() === 'touch';
  }

  // ---------------------------------------------------------------- the almanac (pause)

  menu(): void {
    const s = this.t.run;
    const m = this.t.meta;
    const keys = !this.touch;
    const page = el('div', 'sb-book-page');
    page.append(el('i', 'sb-ribbon'));
    page.append(el('h2', '', 'The almanac'));
    // Where the run stands, against its end: the last winter is the finish line.
    const k = (s.year - 1) * 4 + s.season + 1;
    const of = s.phase === 'over' || k > TUNING.years * 4 ? '' : ` Season ${k} of ${TUNING.years * 4}.`;
    page.append(el('p', 'sb-sub', `${cap(SEASON_NAMES[s.season])}, year ${s.year}. ${s.phase === 'day' ? `Day ${s.day} of ${TUNING.days}.` : s.phase === 'shop' ? 'At the stall.' : ''}${of}`));
    const toc = el('div', 'sb-toc');
    const row = (label: string, hint: string, on: () => void) => toc.append(btn('sb-toc-row', `<span>${label}</span><i></i><em>${hint}</em>`, on));
    row(s.phase === 'shop' ? 'Back to the stall' : 'Carry on', keys ? 'Esc' : '', () => this.back());
    row('Harvest pace', this.t.prefs.fast ? 'fast' : 'easy', () => {
      this.t.prefs.fast = !this.t.prefs.fast;
      this.t.save();
      this.menu();
    });
    row('The rules in brief', '', () => this.rules());
    if (this.t.seen('tin')) row('Your seed tin', keys ? 'D' : '', () => this.deck('tin'));
    row('Other games', keys ? '`' : '', () => {
      this.close();
      this.ctx.openSwitcher();
    });
    if (s.phase !== 'over') row('Give up this run', '', () => {
      if (!this.giveUpArmed) {
        this.giveUpArmed = true;
        const last = toc.lastElementChild as HTMLElement;
        last.querySelector('span')!.textContent = `Give up this run: ${this.touch ? 'tap' : 'click'} again`;
        return;
      }
      this.giveUpArmed = false;
      this.close();
      this.t.giveUp();
    });
    this.giveUpArmed = false;
    page.append(toc);
    const best = m.best;
    const kinds = s.stats.bestKind ? lower(s.stats.bestKind) : '';
    page.append(
      el(
        'p',
        'sb-foot',
        `${m.runs ? `Runs finished: ${m.runs}. Runs won: ${m.wins ?? 0}. Most seasons: ${best.seasons}. Best harvest: ${best.harvest}.` : 'No runs finished yet.'}${s.stats.bestHarvest ? ` This run's best: ${kinds} for ${s.stats.bestHarvest}.` : ''}`,
      ),
    );
    // Keys only for a keyboard: a phone has none.
    if (s.twist && s.phase === 'day') page.append(el('p', 'sb-foot', `<b>This season.</b> ${esc(twistText(s.twist))}`));
    if (keys) page.append(el('p', 'sb-keys', 'Keys: 1 to 7 take up a card (Shift for one you cannot pay for), arrows pick a plot, Enter plays, I reads, E ends the day, X tosses, D opens the tin, Esc puts down.'));
    this.show('menu', page);
  }
  private giveUpArmed = false;

  rules(): void {
    const page = el('div', 'sb-book-page');
    page.append(el('i', 'sb-ribbon'));
    page.append(el('h2', '', 'The rules in brief'));
    const lines = [
      'A run is three years of four seasons. Meet the last winter to win; the run ends the night you do.',
      'A season is six days. Each day you draw up to five cards and fill three seed scoops. A card costs the scoops printed in its corner: a radish is free, corn and the pumpkin take three.',
      'Every crop pulled up puts a scoop back on the next morning\'s bench, two at most a night. A strawberry puts one back with every pick.',
      'Plant seeds on bare plots. Every crop grows a night each night; the moons on a packet are the nights it needs. Beans and strawberries stay and pick night after night. The watering can and rain add a night.',
      'At night every ripe crop is pulled. Each harvest pays yield × bloom: yield (the basket) is what the crop is worth, bloom (the red flower) multiplies it.',
      'Bonuses come from what stands next to a crop on the night it is pulled. A radish pulled tonight gives nothing to a carrot that ripens tomorrow. Hold a card to see what it would do; a greyed bonus is one the night will not pay.',
      'Fill the pegboard by the sixth night, or the run ends. Coins carry over and buy cards at the stall between seasons.',
      'A quarter of what you take over the quota carries into the next season, so a strong season helps the next one.',
      'At a run\'s first stall you take an engine home, free: a card and the almanac page that makes it pay, such as a beehive and Busy Bees. The stall keeps its cards in stock from then on. An engine\'s page never works on radishes and carrots: each engine wants its own crops.',
      'From year 2 the stall sells your engine\'s page at its next level, such as Busy Bees II, then III. Each level makes it pay more, and the quotas climb to match.',
      'From year 2, the stall offers two twists for the season ahead, both about your own plot: one that helps, such as a buyer for one of your crops, and one that gets in the way, such as frost on the row you plant most. Each says about how many coins it would bring or cost you. The one that gets in the way asks a smaller quota, by about what it would cost you and a little more. Pick one; it holds all season.',
      'Each season asks more than the one before, and the quotas are the same for every run: what you earn never raises them.',
      'From year 2 the stall sells seed scoops for good, but not while scoops sit unused on your bench at dusk.',
      'The plot carries over too: whatever stands at a season\'s last dusk is there at the next dawn, so a late sowing is picked next season and counts for its quota.',
      'From summer, pests settle on crops: a pested crop pays half for the nights shown on it. From autumn, a crow may sit on the bed at dawn; that night it takes a ripe crop no scarecrow guards.',
      'Cards you keep stay in hand. Once a day you may toss one on the spent heap for a fresh one.',
    ];
    for (const l of lines) page.append(el('p', '', l));
    // Every card the player may meet: what it costs and what it does, in words.
    page.append(el('h3', 'sb-cards-head', 'The cards'));
    const ids = new Set<CardId>([...allCards(this.t.run).map((c) => c.id), ...this.t.run.pool]);
    const order: Record<string, number> = { seed: 0, tool: 1, weather: 2, object: 3 };
    const list = el('div', 'sb-cardlist');
    for (const id of [...ids].sort((a, b) => order[CARDS[a].type] - order[CARDS[b].type] || CARDS[a].name.localeCompare(CARDS[b].name))) {
      const row = el('div', 'sb-cardrow');
      row.innerHTML = `<img src="${faceUrl(id, false)}" alt=""><p><b>${esc(CARDS[id].name)}</b> ${esc(cardWords(id, false))}</p>`;
      list.append(row);
    }
    page.append(list);
    page.append(btn('sb-plain', 'Back to the almanac', () => this.menu()));
    this.show('rules', page);
  }

  // ---------------------------------------------------------------- a card up close

  detail(card: Card, hover = false): void {
    const d = this.detailEl;
    const def = CARDS[card.id];
    d.innerHTML = '';
    const img = el('img');
    img.src = faceUrl(card.id, card.up);
    img.alt = def.name;
    d.append(img);
    const notes = el('div', 'sb-detail-notes');
    const cost = costOf(card.id, card.up);
    const variety = def.type === 'seed' ? `, <i>${esc(VARIETY[card.id as keyof typeof VARIETY])}</i>` : '';
    notes.append(el('p', '', `<b>${esc(def.name)}</b>${variety}${card.up ? ', improved' : ''}. ${cost === 0 ? 'Free to play.' : `Costs ${cost} ${cost === 1 ? 'scoop' : 'scoops'}.`}`));
    if (def.type === 'seed') {
      const sd = SEEDS[card.id as SeedId];
      notes.append(el('p', '', `Ripe in ${sd.days} ${sd.days === 1 ? 'night' : 'nights'}. ${esc(cardText(card.id, card.up))}`));
    } else notes.append(el('p', '', esc(cardText(card.id, card.up))));
    if (def.type === 'weather') notes.append(el('p', 'sb-quiet', 'Weather cards take effect tonight, before anything grows.'));
    if (def.type === 'object') notes.append(el('p', 'sb-quiet', 'It stands on its plot from season to season, for the rest of the run.'));
    // What improving would do, only once the player has improved a card at the stall.
    if (!card.up && this.t.tutor.n('improve') > 0) notes.append(el('p', 'sb-quiet', `Improved: ${lowerFirst(upgradeNote(card.id, this.t.run.pages))}`));
    if (!hover) notes.append(el('p', 'sb-quiet', `${this.touch ? 'Tap' : 'Click'} to put it back.`));
    d.append(notes);
    d.classList.toggle('hover', hover);
    d.classList.add('on');
    this.detailHover = hover;
    this.t.tutor.count('detail');
    if (!d.parentElement) this.t.el.append(d);
  }

  closeDetail(hover = false): void {
    if (hover && !this.detailHover) return;
    if (!this.detailEl.classList.contains('on')) return;
    this.detailEl.classList.remove('on');
  }

  get detailOpen(): boolean {
    return this.detailEl.classList.contains('on') && !this.detailHover;
  }

  // ---------------------------------------------------------------- the seed tin

  /**
   * The seed tin: every card the player owns, in where it is now (the tin, the
   * hand, the spent heap, out on the plot). At the stall, the same cards to
   * pick one to throw out or improve, the first tap saying what it would do.
   */
  deck(which: 'tin' | 'spent' | 'all', pick: 'remove' | 'upgrade' | null = null): void {
    const s = this.t.run;
    if (which === 'tin' && !pick) this.t.tutor.count('tin');
    const wrap = el('div', 'sb-tinview');
    this.pickUid = null;
    const order: Record<string, number> = { seed: 0, tool: 1, weather: 2, object: 3 };
    const sort = (cards: Card[]) => [...cards].sort((a, b) => order[CARDS[a.id].type] - order[CARDS[b.id].type] || a.id.localeCompare(b.id) || Number(b.up) - Number(a.up));
    let groups: { head: string | null; cards: Card[]; mark: string }[];
    if (pick) {
      wrap.append(el('h2', '', pick === 'remove' ? `Throw out a card, ${removePrice(s)} coins` : `Improve a card, ${upgradePrice(s)} coins`));
      const tp = this.touch ? 'Tap' : 'Click';
      const read = el('p', 'sb-sub sb-pickline', pick === 'remove' ? `${tp} a card to see it, then ${tp.toLowerCase()} it again to throw it out.` : `${tp} a card to see what improving does, then ${tp.toLowerCase()} it again.`);
      wrap.append(read);
      groups = [{ head: null, cards: sort(s.draw), mark: '' }];
    } else if (which === 'spent') {
      wrap.append(el('h2', '', 'Spent this season'));
      groups = [{ head: null, cards: sort(s.discard), mark: '' }];
    } else {
      const all = allCards(s);
      wrap.append(el('h2', '', 'Your seed tin'));
      if (s.phase === 'day') {
        wrap.append(el('p', 'sb-sub', `${all.length} cards: ${s.draw.length} in the tin, ${s.hand.length} in hand, ${s.discard.length} spent${s.placed.length ? `, ${s.placed.length} out on the plot` : ''}.`));
        groups = [
          { head: 'In the tin', cards: sort(s.draw), mark: '' },
          { head: 'In your hand', cards: sort(s.hand), mark: 'hand' },
          { head: 'Spent', cards: sort(s.discard), mark: 'spent' },
          { head: 'Out on the plot', cards: sort(s.placed), mark: 'out' },
        ];
      } else {
        wrap.append(el('p', 'sb-sub', `${all.length} cards.`));
        groups = [{ head: null, cards: sort(all), mark: '' }];
      }
    }
    for (const g of groups) {
      if (!g.cards.length && g.head) continue;
      if (g.head) wrap.append(el('h3', 'sb-tinhead', `${g.head} <span>${g.cards.length}</span>`));
      const grid = el('div', 'sb-tingrid');
      for (const c of g.cards) {
        const disabled = pick === 'upgrade' && c.up;
        const b = btn(`sb-tincard${disabled ? ' off' : ''}${g.mark ? ` ${g.mark}` : ''}`, `<img src="${faceUrl(c.id, c.up)}" alt="${esc(CARDS[c.id].name)}${c.up ? ', improved' : ''}">`, () => {
          if (!pick) {
            this.detail(c);
            return;
          }
          if (disabled) return;
          if (this.pickUid !== c.uid) {
            this.pickUid = c.uid;
            wrap.querySelectorAll('.sb-tincard').forEach((x) => x.classList.remove('lifted'));
            b.classList.add('lifted');
            const line = wrap.querySelector('.sb-pickline') as HTMLElement;
            line.innerHTML =
              pick === 'remove'
                ? `Throw out ${plural(c.id) ? 'these' : 'this'} ${esc(lower(c.id))}? <b>${this.touch ? 'Tap' : 'Click'} again.</b>`
                : `${esc(CARDS[c.id].name)}: ${esc(lowerFirst(upgradeNote(c.id, s.pages)))} <b>${this.touch ? 'Tap' : 'Click'} again to improve it.</b>`;
            this.ctx.audio.cue('deck.pick');
            return;
          }
          const ev = pick === 'remove' ? removeCard(s, c.uid) : upgradeCard(s, c.uid);
          if (ev) {
            this.t.tutor.count('service');
            if (pick === 'upgrade') this.t.tutor.count('improve');
            this.ctx.audio.cue(pick === 'remove' ? 'deck.remove' : 'deck.buy');
            this.done = pick === 'remove' ? `The ${lower(c.id)} ${plural(c.id) ? 'are' : 'is'} thrown out.` : `${CARDS[c.id].name} improved. ${upgradeNote(c.id, s.pages)}`;
            this.doneCard = pick === 'upgrade' ? c : null;
            this.t.save();
            this.t.syncPurse();
          } else this.ctx.audio.cue('deck.deny');
          this.stall();
        });
        grid.append(b);
      }
      if (!g.cards.length) grid.append(el('p', 'sb-sub', 'Nothing here.'));
      wrap.append(grid);
    }
    wrap.append(btn('sb-plain', pick ? 'Not now' : 'Close the tin', () => this.back()));
    this.show('deck', wrap);
    // Round 10: a tin that scrolls says so (the tenth playtest's improve and throw-out sheets cut off their last row, the
    // watering cans and the compost, at the screen's foot with no sign; the sheet scrolled 76 px).
    this.shadeMore(wrap);
  }
  private doneCard: Card | null = null;

  // ---------------------------------------------------------------- the seed merchant

  /** An almanac page as a pinned sheet. Price null shows it as kept. */
  pageEl(id: PageId, price: number | null, sold = false): HTMLElement {
    const p = PAGES[id];
    const tilt = ((id.charCodeAt(0) * 7 + id.length * 3) % 7) - 3;
    const d = el('div', `sb-pagesheet${sold ? ' sold' : ''}`);
    d.style.setProperty('--tilt', `${tilt * 0.6}deg`);
    const pencil = price !== null ? `<em class="sb-pencil">${sold ? 'taken' : `${price} coins`}</em>` : '';
    d.innerHTML = `<img class="sb-pinimg" src="${pinUrl()}" alt=""><b>${pencil}${esc(p.name)}</b><span>${esc(p.text)}</span>`;
    return d;
  }

  /** The slip that says what a lifted thing is, before the second tap buys it. */
  private readSlip(html: string): HTMLElement {
    const p = el('p', 'sb-read', html);
    p.setAttribute('role', 'status');
    return p;
  }

  /** Lift a thing for a second tap, or buy it on the second. */
  private lift(key: string, buy: () => void): void {
    if (this.picked !== key) {
      this.picked = key;
      this.done = null;
      this.ctx.audio.cue('deck.pick');
      this.stall();
      return;
    }
    buy();
  }

  /**
   * The seed merchant's stall. The goods, the pages and the services sit in a
   * body that scrolls only if it must; under it, in a place of its own that is
   * always there, one slip says what the lifted thing is (or what was just
   * bought, or the stall's lesson), and the signpost on to the next season is
   * pinned below it. Nothing on the tray moves when a slip comes or goes, so a
   * second tap lands where the first did.
   */
  stall(end?: Extract<Ev, { t: 'seasonEnd' }>): void {
    const s = this.t.run;
    const sh = s.shop;
    if (!sh) return;
    void end;
    this.t.syncPurse();
    const wrap = el('div', 'sb-stall');
    const tap = this.touch ? 'Tap' : 'Click';
    const ask = (price: number, verb = 'buy') => (s.coins < price ? `<em>Short ${price - s.coins} coins.</em>` : `<em>${tap} again to ${verb}, ${price} coins.</em>`);
    let read: string | null = null;
    // The head: the sign, the season just closed, the purse, and the almanac.
    const last = s.stats.log[s.stats.log.length - 1];
    const head = el('div', 'sb-stall-head');
    head.append(el('div', 'sb-sign', '<span>Seed merchant</span>'));
    // The season just closed, and the share of its surplus that carries into the next one.
    const carry = nextCarry(s);
    // What carries over is said as where the next season starts: "Summer starts with 8." ("8 carries over" was never explained.)
    // Round 9: each sentence keeps to one line, so the head never wraps "54." onto a line of its own.
    if (last) head.append(el('p', 'sb-closed', `<span>${cap(SEASON_NAMES[last.season])}: ${last.earned} of ${last.quota}.</span>${carry ? ` <span>${cap(SEASON_NAMES[nextSeason(s).season])} starts with ${carry}.</span>` : ''}`));
    const coming = nextSeason(s);
    head.append(el('p', 'sb-purse-line', `<span class="sb-say">You have <b>${s.coins}</b> coins.</span> <span class="sb-say">${cap(SEASON_NAMES[coming.season])} asks ${nextQuota(s)}.</span>`));
    // Each new year the merchant brings new stock for this run, laid on the year's first tray: said at that stall (round
    // 9: the one after winter, which opens the year; it was said a stall late).
    if (s.season === 3 && s.stockYear === s.year + 1 && s.stock?.length) {
      const plain = s.stock.filter((o) => !o.up).map((o) => lower(o.card));
      const up = s.stock.filter((o) => o.up).map((o) => lower(o.card));
      const words = plain.length && up.length ? `${listOf(plain)}, and improved ${listOf(up)}` : up.length ? `improved ${listOf(up)}` : listOf(plain);
      head.append(el('p', 'sb-purse-line sb-stock', `New stock this year: ${words}.`));
    }
    head.append(btn('sb-stall-book', '<span>Almanac</span>', () => this.menu()));
    wrap.append(head);
    // A run's first stall: an engine to take home, free (a card and the page that multiplies it). Pick one; it can be
    // changed until the stall is left. Round 8: until one is picked the stall shows only the three, large enough to
    // read, under a line that says to pick one and that it is free (the eighth playtest's later runs said neither, the
    // cards were 50 px, and the desktop tray sold a beehive beside the free one). Once picked, they sit small above
    // the stall, where the pick can still be changed.
    const choosing = !!sh.engines?.length && sh.engine === undefined;
    if (sh.engines?.length) {
      if (choosing) wrap.append(el('p', 'sb-engines-head', 'Pick one to take home, free.'));
      const row = el('div', `sb-engines${choosing ? ' big' : ''}${this.needEngine ? ' ask' : ''}`);
      row.setAttribute('role', 'radiogroup');
      row.setAttribute('aria-label', 'Pick one to take home, free');
      sh.engines.forEach((id, i) => {
        const on = sh.engine === i;
        const e = ENGINES[id];
        // Two of a card wear a "x2" on the face.
        const two = e.gift.length > 1 ? `<i class="sb-twice">x${e.gift.length}</i>` : '';
        const b = btn(
          `sb-enginecard${on ? ' picked' : sh.engine !== undefined ? ' other' : ''}`,
          `<span class="sb-engface"><img src="${faceUrl(e.gift[0], false)}" alt="">${two}</span><span><b>${esc(engineText(id).replace(/\.$/, ''))}</b> ${esc(PAGES[e.page].text)}</span>${on ? `<img class="sb-pinimg" src="${pinUrl()}" alt="">` : ''}`,
          () => {
            if (!chooseEngine(s, i)) return;
            this.t.tutor.count('engine');
            this.needEngine = false;
            this.ctx.audio.cue('deck.page', { gain: 0.6 });
            this.t.save();
            this.stall();
          },
        );
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(on));
        row.append(b);
      });
      wrap.append(row);
    }
    // The season ahead: two twists, pick one. It holds all season; it can be changed until the stall is left.
    if (sh.twists?.length) {
      const row = el('div', `sb-twists${this.needTwist ? ' ask' : ''}`);
      row.setAttribute('role', 'radiogroup');
      row.setAttribute('aria-label', `${cap(SEASON_NAMES[coming.season])} brings one of these`);
      sh.twists.forEach((tw, i) => {
        const on = sh.twist === i;
        // A hitch is a trade: it says what it takes off the season's quota ("Summer asks 510, not 600.").
        const trade = twistEase(tw) ? `<em class="sb-trade">${cap(SEASON_NAMES[coming.season])} asks ${twistQuota(s, tw)}, not ${twistQuota(s, null)}.</em>` : '';
        // Round 8: both say what they would do to the season's take, in coins, from the shares the rules priced them by
        // ("Your carrots would pay about 320 more."): the eighth playtest's help showed no number beside the hitch's.
        const note = twistNote(s, tw);
        const worth = note ? `<em class="sb-worth">${esc(note).replace(/(\d+)/, '<b>$1</b>')}</em>` : '';
        const b = btn(`sb-twistcard${on ? ' picked' : sh.twist !== undefined ? ' other' : ''}`, `<img src="${twistUrl(tw, 26)}" alt=""><span>${esc(twistText(tw))}</span>${worth}${trade}${on ? `<img class="sb-pinimg" src="${pinUrl()}" alt="">` : ''}`, () => {
          if (!chooseTwist(s, i)) return;
          this.t.tutor.count('twist');
          this.needTwist = false;
          this.ctx.audio.cue('deck.page', { gain: 0.6 });
          this.t.save();
          this.stall();
        });
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(on));
        row.append(b);
      });
      wrap.append(row);
    }
    const body = el('div', 'sb-stall-body');

    // Pages pinned on the back board, once the almanac pages have been brought in.
    const cork = el('div', 'sb-cork');
    const room = maxPages(s);
    const full = s.pages.length >= room;
    cork.append(el('h3', '', full ? 'Almanac pages. Yours is full.' : `Almanac pages. You keep up to ${room}.`));
    const pins = el('div', 'sb-pins');
    const pickedPage = this.picked?.startsWith('page') ? Number(this.picked.slice(4)) : -1;
    sh.pages.forEach((o, i) => {
      const key = `page${i}`;
      const b = el('button', `sb-pagebtn${this.picked === key ? ' lifted' : ''}`);
      b.append(this.pageEl(o.page, o.price, o.sold));
      b.disabled = o.sold;
      b.setAttribute('aria-label', `${PAGES[o.page].name}, ${o.price} coins. ${PAGES[o.page].text}`);
      if (!o.sold && this.picked === key) {
        read = full ? `<b>${esc(PAGES[o.page].name)}</b>. ${esc(PAGES[o.page].text)} <em>Your almanac is full: ${tap.toLowerCase()} a kept page to swap it out.</em>` : `<b>${esc(PAGES[o.page].name)}</b>. ${esc(PAGES[o.page].text)} ${ask(o.price, 'pin it')}`;
      }
      b.onclick = () =>
        this.lift(key, () => {
          if (full) return;
          if (buyPage(s, i)) this.bought('page', `${PAGES[o.page].name} is pinned in your almanac.`);
          else this.ctx.audio.cue('deck.deny');
          this.stall();
        });
      pins.append(b);
    });
    if (!sh.pages.length) pins.append(el('p', 'sb-sub', 'No pages left to sell.'));
    cork.append(pins);
    if (s.pages.length) {
      const kept = el('div', 'sb-kept');
      kept.append(el('span', '', 'Kept:'));
      for (const p of s.pages) {
        const key = `kept:${p}`;
        // With the almanac full and a new page lifted, a kept page can be swapped out: two taps, like everything here.
        const swap = full && pickedPage >= 0 && !sh.pages[pickedPage].sold;
        const k = btn(`sb-keptpage${this.picked === key ? ' lifted' : ''}`, esc(levelName(PAGES[p].name, pageLevel(s, p))), () => {
          if (!swap && !this.picked?.startsWith('kept:')) return;
          const o = sh.pages[this.swapFor ?? pickedPage];
          if (this.picked !== key) {
            this.swapFor = pickedPage >= 0 ? pickedPage : this.swapFor;
            this.picked = key;
            this.ctx.audio.cue('deck.pick');
            this.stall();
            return;
          }
          if (o && buyPage(s, this.swapFor ?? pickedPage, p)) this.bought('page', `${PAGES[o.page].name} takes the place of ${PAGES[p].name}.`);
          else this.ctx.audio.cue('deck.deny');
          this.swapFor = null;
          this.stall();
        });
        k.disabled = !swap && !this.picked?.startsWith('kept:');
        kept.append(k);
      }
      cork.append(kept);
      if (this.picked?.startsWith('kept:') && this.swapFor !== null) {
        const o = sh.pages[this.swapFor];
        const out = this.picked.slice(5) as PageId;
        read = `Tear out <b>${esc(PAGES[out].name)}</b> for <b>${esc(PAGES[o.page].name)}</b>? ${ask(o.price, 'swap')}`;
      }
    }
    // Round 8: the run's engine page at its next level, said in the page's own words: the late use for coins the
    // eighth playtest asked for (every run died with 1,979 to 5,711 coins unspent).
    const buys = el('div', 'sb-cork-buys');
    const lv = sh.level;
    if (lv && s.pages.includes(lv.page)) {
      const name = levelName(PAGES[lv.page].name, lv.to);
      const b = btn(`sb-levelup${this.picked === 'level' ? ' lifted' : ''}${lv.sold ? ' sold' : ''}`, `<span>${esc(name)}</span><em>${lv.sold ? 'taken' : `${lv.price} coins`}</em>`, () =>
        this.lift('level', () => {
          if (buyLevel(s)) this.bought('page', `${PAGES[lv.page].name} is now ${name}.`);
          else this.ctx.audio.cue('deck.deny');
          this.stall();
        }),
      );
      b.disabled = lv.sold;
      b.setAttribute('aria-label', `${name}, ${lv.price} coins. ${levelText(lv.page, lv.to) ?? ''}`);
      if (this.picked === 'level' && !lv.sold) read = `<b>${esc(name)}</b>. ${esc(levelChange(lv.page, lv.to) ?? '')} ${ask(lv.price)}`;
      buys.append(b);
    }
    // Room for one more page: a late use for coins, sold once the almanac is full.
    if (slotOnSale(s)) {
      const price = slotPrice(s);
      const b = btn(`sb-slot${this.picked === 'slot' ? ' lifted' : ''}`, `<span>Room for one more page</span><em>${price} coins</em>`, () =>
        this.lift('slot', () => {
          if (buySlot(s)) this.bought('service', `Your almanac keeps ${maxPages(s)} pages now.`);
          else this.ctx.audio.cue('deck.deny');
          this.stall();
        }),
      );
      if (this.picked === 'slot') read = `Room for one more almanac page, for good. ${ask(price)}`;
      buys.append(b);
    }
    if (buys.childElementCount) cork.append(buys);
    if (this.t.seen('pages') && !choosing) body.append(cork);

    // The tray of seed and tools, rarer stock laid out a little larger.
    const tray = el('div', 'sb-tray');
    const goods = el('div', 'sb-goods');
    sh.cards.forEach((o, i) => {
      const key = `card${i}`;
      const def = CARDS[o.card];
      const size = def.rarity === 'rare' ? 'l' : def.rarity === 'uncommon' ? 'm' : 's';
      const b = el('button', `sb-good ${size}${o.sold ? ' sold' : ''}${this.picked === key ? ' lifted' : ''}`);
      b.style.setProperty('--tilt', `${[-5, 3, -2, 4][i % 4]}deg`);
      if (o.sold) {
        b.innerHTML = '<span class="sb-chalk">sold</span>';
        b.disabled = true;
      } else {
        b.innerHTML = `<img src="${faceUrl(o.card, !!o.up)}" alt="${esc(def.name)}${o.up ? ', improved' : ''}"><span class="sb-pricetag">${o.price}</span>`;
        if (this.picked === key) read = `<b>${o.up ? 'Improved ' : ''}${esc(o.up ? lower(o.card) : def.name)}</b>, ${esc(cardWords(o.card, !!o.up))} ${ask(o.price)}`;
        b.setAttribute('aria-label', `${o.up ? 'Improved ' : ''}${def.name}, ${o.price} coins. ${cardText(o.card, !!o.up)}`);
      }
      b.onclick = () =>
        this.lift(key, () => {
          if (buyCard(s, i)) this.bought('buy', `The ${o.up ? 'improved ' : ''}${lower(o.card)} ${plural(o.card) ? 'go' : 'goes'} in your tin.`);
          else this.ctx.audio.cue('deck.deny');
          this.stall();
        });
      b.oncontextmenu = (e) => {
        e.preventDefault();
        this.detail({ uid: -1, id: o.card, up: !!o.up });
      };
      goods.append(b);
    });
    tray.append(goods);
    // Services on the tray's lip: throw a card out, improve one, fresh stock, and a scoop from year 2.
    const lip = el('div', 'sb-lip');
    const thing = (key: string, url: string, label: string, price: number, ok: boolean, words: string, verb: string, why: string, go: () => void, stop = '') => {
      // Round 9: a thing not sold today says so where its price would be (the scoop showed "300 coins" when refused).
      const b = btn(`sb-thing${this.picked === key ? ' lifted' : ''}${stop ? ' refused' : ''}`, `<img src="${url}" alt=""><span>${label}</span><em>${stop ? 'Not now' : `${price} coins`}</em>`, () =>
        this.lift(key, () => {
          if (!ok) {
            this.ctx.audio.cue('deck.deny');
            return;
          }
          this.picked = null;
          go();
        }),
      );
      // A thing bought outright says its price, like the goods (round 8: the scoop said only "Tap again to buy it.").
      const again = verb === 'buy' ? ask(price) : `<em>${tap} again to ${verb}.</em>`;
      if (this.picked === key) read = `${words} ${ok ? again : stop ? `<em>${stop}</em>` : s.coins < price ? `<em>Short ${price - s.coins} coins.</em>` : `<em>${why}</em>`}`;
      lip.append(b);
    };
    const bucket = thingUrl('compost', 44, (g, px) => paintBucket(g, px));
    const stampArt = thingUrl('stamp', 44, (g, px) => paintStamp(g, px, '#2a1a0a'));
    const bell = thingUrl('bell', 44, (g, px) => paintBell(g, px, '#2a1a0a'));
    thing('remove', bucket, 'Throw out', removePrice(s), canRemove(s), 'Throw out a card you would rather not draw.', 'choose one', `Your tin keeps at least ${TUNING.minDeck} cards.`, () => this.deck('all', 'remove'));
    thing('upgrade', stampArt, 'Improve', upgradePrice(s), canUpgrade(s), 'Improve a card: a seed fills a bigger basket, a tool costs a scoop less.', 'choose one', 'Every card is improved.', () => this.deck('all', 'upgrade'));
    thing('bell', bell, 'Fresh stock', sh.reroll, s.coins >= sh.reroll, 'New cards on the tray.', 'ring for them', '', () => {
      if (reroll(s)) {
        this.t.tutor.count('service');
        this.ctx.audio.cue('deck.reroll');
        this.picked = null;
        this.done = null;
        this.t.save();
        this.t.syncPurse();
      }
      this.stall();
    });
    if (s.year >= 2 && s.scoops < TUNING.maxScoops) {
      // Said before it is bought: how many scoops a day sat unused last season; with scoops to spare, none is sold
      // (the sixth playtest's 3,200-coin scoop sat unused with 3 to 6 others most days).
      const idle = Math.round(scoopsIdle(s));
      const unused = scoopsIdle(s) >= 1 ? ` Last season ${idle} ${idle === 1 ? 'scoop' : 'scoops'} a day sat unused.` : '';
      thing('scoop', scoopUrl(true), 'A scoop', scoopPrice(s), canBuyScoop(s), `One more seed scoop on the bench every day, for good.${unused}`, 'buy', '', () => {
        if (buyScoop(s)) this.bought('service', 'A new scoop for the bench, for good.');
        this.stall();
      }, scoopOnSale(s) ? '' : 'You have scoops to spare.');
    }
    if (this.t.seen('services')) tray.append(lip);
    if (!choosing) body.append(tray);
    wrap.append(body);

    // The slip's own place: what the lifted thing is, else what was just done, else the stall's lesson.
    const foot = el('div', 'sb-stall-foot');
    const spot = el('div', 'sb-slipspot');
    if (!read && this.needEngine && sh.engines?.length && sh.engine === undefined) read = '<em>Pick one to take home first.</em>';
    if (!read && this.needTwist && sh.twists?.length && sh.twist === undefined) read = `<em>Pick one of the two for ${SEASON_NAMES[coming.season]} first.</em>`;
    if (read) spot.append(this.readSlip(read));
    else if (this.done) {
      const d = el('div', 'sb-done');
      if (this.doneCard) d.append(Object.assign(el('img'), { src: faceUrl(this.doneCard.id, true), alt: '' }));
      d.append(el('p', '', esc(this.done)));
      spot.append(d);
    } else if (this.t.stallLine && !(choosing && this.t.stallLine.id === 'engine')) spot.append(this.lessonEl);
    foot.append(spot);
    const next = s.season === 3 ? `On to spring, year ${s.year + 1}` : isFinal(nextSeason(s)) ? 'On to the last winter' : `On to ${SEASON_NAMES[s.season + 1]}`;
    foot.append(
      btn('sb-signpost', `<span>${next}</span>`, () => {
        // The run's engine is a choice: the way on asks for one first.
        if (sh.engines?.length && sh.engine === undefined) {
          this.needEngine = true;
          this.picked = null;
          this.done = null;
          this.ctx.audio.cue('deck.deny');
          this.stall();
          return;
        }
        // The season's twist is a choice: the way on asks for one first.
        if (sh.twists?.length && sh.twist === undefined) {
          this.needTwist = true;
          this.picked = null;
          this.done = null;
          this.ctx.audio.cue('deck.deny');
          this.stall();
          return;
        }
        const ev = leaveShop(s);
        if (!ev) return;
        this.t.save();
        this.close();
        this.t.syncAll();
        this.t.relayout();
        this.ctx.audio.cue('deck.shuffle');
        this.t.seasonStart();
      }),
    );
    wrap.append(foot);
    const scroll = this.el.querySelector('.sb-stall-body')?.scrollTop ?? 0;
    // Keep the keyboard where it was: on the lifted thing, or on what was focused before.
    const was = document.activeElement?.closest('.sb-stall') ? [...this.el.querySelectorAll('button')].indexOf(document.activeElement as HTMLButtonElement) : -1;
    this.show('stall', wrap, this.picked ? '.lifted' : this.needEngine ? '.sb-enginecard' : this.needTwist ? '.sb-twistcard' : undefined);
    this.fitGoods(wrap);
    if (!this.picked && !this.needTwist && !this.needEngine && was >= 0 && this.ctx.device() === 'key') (wrap.querySelectorAll('button')[was] as HTMLButtonElement | undefined)?.focus({ preventScroll: true });
    body.scrollTop = scroll;
    // A body that scrolls says so: a soft shade at its foot while there is more below (it scrolled 16 px with no sign).
    const more = () => body.classList.toggle('more', body.scrollHeight - body.clientHeight - body.scrollTop > 2);
    body.addEventListener('scroll', more, { passive: true });
    requestAnimationFrame(more);
  }
  private swapFor: number | null = null;

  /**
   * On the phone the goods grow into the stall's free height: one row as wide as the tray allows, or two rows of two
   * when the screen has the room (a year 1 stall). They were about 70 px wide with their rule pictures about 10 px,
   * and the bottom of the screen bare. Measured at their plain size on every render, so the same stall always lays out
   * the same way and nothing moves between a first tap and a second.
   */
  private fitGoods(wrap: HTMLElement): void {
    const goods = wrap.querySelector('.sb-goods') as HTMLElement | null;
    if (!goods) return;
    goods.style.removeProperty('--sbg');
    goods.classList.remove('two');
    const items = [...goods.children] as HTMLElement[];
    if (this.t.layout !== 'phone' || items.length < 2) return;
    const kids = [...wrap.children] as HTMLElement[];
    const gap = parseFloat(getComputedStyle(wrap).rowGap) || 0;
    const free = Math.max(0, wrap.clientHeight - kids.reduce((a, k) => a + k.offsetHeight, 0) - gap * (kids.length - 1) - 6);
    const room = goods.clientWidth - 8;
    const tallest = Math.max(...items.map((e) => e.offsetHeight));
    const wide = (row: HTMLElement[]) => row.reduce((a, e) => a + e.offsetWidth, 0);
    const high = (row: HTMLElement[]) => Math.max(...row.map((e) => e.offsetHeight));
    const colGap = parseFloat(getComputedStyle(goods).columnGap) || 0;
    const one = Math.min(GOODS_MAX, (room - colGap * (items.length - 1)) / wide(items), 1 + free / tallest);
    const rows = [items.slice(0, 2), items.slice(2)];
    const two = items.length > 2 ? Math.min(GOODS_MAX, (room - TWO_COLS) / Math.max(...rows.map(wide)), (tallest + free - TWO_ROWS) / (high(rows[0]) + high(rows[1]))) : 0;
    // Two rows only when they grow the goods clearly more than one row does: they take a row of price tags too.
    const k = two > one + 0.15 ? two : one;
    if (k === two) goods.classList.add('two');
    goods.style.setProperty('--sbg', Math.max(1, k).toFixed(3));
  }
  /** The way on was tried with no twist picked: the slip asks for one and the two clippings call for a tap. */
  private needTwist = false;
  /** The same for the engine at a run's first stall. */
  private needEngine = false;

  /** After a purchase: count it for the lessons, voice it, save, and tick the purse down. */
  private bought(kind: 'buy' | 'page' | 'service', words: string): void {
    this.t.tutor.count(kind);
    this.ctx.audio.cue(kind === 'page' ? 'deck.page' : 'deck.buy');
    this.picked = null;
    this.done = words;
    this.doneCard = null;
    this.t.save();
    this.t.syncPurse();
  }

  /** The stall's lesson line goes in the slip's place, when no slip is there (or comes down). */
  lesson(line: Line | null): void {
    this.lessonEl.textContent = line?.text ?? '';
    this.lessonEl.dataset.lesson = line?.id ?? '';
    if (this.kind !== 'stall') return;
    const spot = this.el.querySelector('.sb-slipspot');
    if (!spot) return;
    // The engine's lesson is the line over the three engines while they are chosen: not said twice.
    const said = line?.id === 'engine' && !!this.el.querySelector('.sb-engines-head');
    if (!line || said) this.lessonEl.remove();
    else if (!spot.querySelector('.sb-read, .sb-done') && !spot.contains(this.lessonEl)) spot.append(this.lessonEl);
  }

  // ---------------------------------------------------------------- the almanac entry at the end

  entry(): void {
    if (this.t.run.end?.won) {
      this.winPage();
      return;
    }
    const s = this.t.run;
    const m = this.t.meta;
    const end = s.end;
    // The account scrolls if a long run fills it; the way on stays in sight below it.
    const sheet = el('div', `sb-entry${end?.won ? ' won' : ''}`);
    const page = el('div', 'sb-entry-body');
    sheet.append(page);
    page.append(el('h2', '', `The almanac, year ${s.year}`));
    // A won run: every season to the last winter met. Its own line, and the count of runs won.
    page.append(el('p', 'sb-sub', end?.won ? `${cap(NUMS[TUNING.years] ?? String(TUNING.years))} years on the kitchen plot, every quota met. The run is won.` : 'An account of the kitchen plot.'));
    const list = el('ol', 'sb-entries');
    s.stats.log.forEach((l, k) => {
      const li = el('li');
      const last = k === s.stats.log.length - 1;
      const how = l.cleared ? 'Met.' : last && end?.gaveUp ? `Given up${end.day ? ` on day ${end.day}` : ''}.` : `Short by ${l.quota - l.earned}. The run ends here.`;
      // Round 8: each season's twist, as the won page lists them.
      li.innerHTML = `<b>${cap(SEASON_NAMES[l.season])}, year ${l.year}.</b> Took ${l.earned}${l.carried ? `, ${l.carried} of it carried in,` : ''} against a quota of ${l.quota}. ${how}${l.twist ? ` ${esc(twistText(l.twist))}` : ''}`;
      list.append(li);
    });
    // Given up at the stall, between seasons: the run ends before the next one starts.
    if (end?.gaveUp && !end.day) list.append(el('li', '', 'Given up at the stall.'));
    page.append(list);
    const bits: string[] = [];
    if (s.stats.bestKind) bits.push(`Best single harvest: ${lower(s.stats.bestKind)}, for ${s.stats.bestHarvest}.`);
    bits.push(`Coins taken in all: ${s.stats.totalEarned}. Harvests: ${s.stats.harvests}.`);
    bits.push(`Seasons met: ${s.stats.seasonsCleared} of ${TUNING.years * 4}. Your most: ${m.best.seasons}.`);
    if (end?.won || (m.wins ?? 0) > 0) bits.push(`Runs won: ${m.wins ?? 0}.${end?.won && m.bestWin === s.stats.totalEarned && (m.wins ?? 0) > 1 ? ' Your best yet.' : ''}`);
    for (const b of bits) page.append(el('p', '', b));
    const fresh: CardId[] = s.end?.unlocked ?? [];
    if (fresh.length) {
      page.append(el('p', '', `New in the merchant's catalogue: ${listOf(fresh.map((c) => lower(c)))}.`));
      const row = el('div', 'sb-new');
      for (const c of fresh) {
        const img = el('img');
        img.src = faceUrl(c, false);
        img.alt = CARDS[c].name;
        row.append(img);
      }
      page.append(row);
    } else {
      // Seasons count across runs, so say how many more add to the catalogue.
      const more = seasonsToNext(m);
      page.append(el('p', 'sb-quiet', more ? `The catalogue holds nothing new yet. Meet ${NUMS[more] ?? more} more ${more === 1 ? 'season' : 'seasons'}, in any run, to add to it.` : 'The catalogue holds every card.'));
    }
    // The way on, and for a won run a red wax seal beside it (kept off the ruled account).
    const foot = el('div', 'sb-entry-foot');
    foot.append(btn('sb-plain big', 'Turn to a fresh page', () => this.t.fresh(null, false)));
    if (end?.won) foot.append(el('div', 'sb-seal', '<span>Won</span>'));
    sheet.append(foot);
    this.show('entry', sheet);
    this.shadeMore(page);
    this.ctx.audio.cue(end?.won ? 'deck.big' : 'deck.fail');
  }

  /** A body that scrolls says so: a soft shade at its foot while there is more below. */
  private shadeMore(body: HTMLElement): void {
    const more = () => body.classList.toggle('more', body.scrollHeight - body.clientHeight - body.scrollTop > 2);
    body.addEventListener('scroll', more, { passive: true });
    more();
    requestAnimationFrame(more);
    // Card faces load after the first layout: measure again once they have.
    for (const img of body.querySelectorAll('img')) if (!img.complete) img.addEventListener('load', more, { once: true });
  }

  /**
   * A won run's own page, not the loss ledger with a seal: the seal and the summary at the top, the best harvest with
   * its card, the build that won (the crops that took the most and the pages kept), and the record of wins. The season
   * by season account follows, below the fold if it must be.
   */
  private winPage(): void {
    const s = this.t.run;
    const m = this.t.meta;
    const end = s.end!;
    const sheet = el('div', 'sb-entry won');
    const page = el('div', 'sb-entry-body');
    sheet.append(page);
    const top = el('div', 'sb-win-top');
    top.append(el('div', 'sb-seal', '<span>Won</span>'));
    const title = el('div', 'sb-win-title');
    title.append(el('h2', '', 'The run is won'));
    const day = end.metDay && end.metDay < TUNING.days ? ` The last winter was met on day ${end.metDay}.` : '';
    title.append(el('p', 'sb-sub', `${cap(NUMS[TUNING.years] ?? String(TUNING.years))} years on the kitchen plot, every quota met.${day}`));
    top.append(title);
    page.append(top);
    // The summary: three numbers.
    const sum = el('div', 'sb-win-sum');
    const stat = (n: string, label: string) => sum.append(el('div', 'sb-win-stat', `<b>${n}</b><span>${label}</span>`));
    stat(s.stats.totalEarned.toLocaleString('en-GB'), 'coins in all');
    stat(`${s.stats.seasonsCleared} of ${TUNING.years * 4}`, 'seasons met');
    stat(String(s.stats.harvests), 'harvests');
    page.append(sum);
    // The best harvest, with its card.
    if (s.stats.bestKind) {
      const best = el('div', 'sb-win-best');
      best.append(Object.assign(el('img'), { src: faceUrl(s.stats.bestKind, false), alt: CARDS[s.stats.bestKind].name }));
      best.append(el('p', '', `<b>Best harvest</b>${esc(cap(lower(s.stats.bestKind)))}, for ${s.stats.bestHarvest}.`));
      page.append(best);
    }
    // The build that won: the crops that took the most, and the pages kept.
    const by = s.stats.byKind ?? {};
    const total = Math.max(1, Object.values(by).reduce((a, v) => a + (v ?? 0), 0));
    const crops = topCrops(s);
    if (crops.length) {
      const build = el('div', 'sb-win-build');
      build.append(el('h3', '', 'The build that won'));
      const row = el('div', 'sb-win-crops');
      for (const k of crops) {
        const c = el('div', 'sb-win-crop');
        c.append(Object.assign(el('img'), { src: faceUrl(k, false), alt: '' }));
        c.append(el('span', '', `${cap(PLURALS[k])} ${Math.round(((by[k] ?? 0) / total) * 100)}%`));
        row.append(c);
      }
      build.append(row);
      if (s.pages.length) build.append(el('p', 'sb-win-pages', `Pages kept: ${listOf(s.pages.map((p) => levelName(PAGES[p].name, pageLevel(s, p))))}.`));
      page.append(build);
    }
    // The record of wins.
    const rec = el('div', 'sb-win-record');
    rec.append(el('h3', '', 'Runs won'));
    const wins = m.wins ?? 0;
    rec.append(el('p', '', `${wins} of ${m.runs} ${m.runs === 1 ? 'run' : 'runs'}.${m.bestWin === s.stats.totalEarned && wins > 1 ? ' This one took the most.' : m.bestWin ? ` The most a won run took: ${m.bestWin.toLocaleString('en-GB')}.` : ''}`));
    const log = [...(m.winLog ?? [])].reverse();
    if (log.length) {
      const ol = el('ol', 'sb-win-log');
      for (const w of log) ol.append(el('li', '', `Run ${w.run}: ${w.coins.toLocaleString('en-GB')} coins, ${listOf(w.top.slice(0, 2).map((k) => PLURALS[k]))}.`));
      rec.append(ol);
    }
    page.append(rec);
    // The account, season by season.
    page.append(el('h3', 'sb-win-head', 'Season by season'));
    const list = el('ol', 'sb-entries');
    for (const l of s.stats.log) list.append(el('li', '', `<b>${cap(SEASON_NAMES[l.season])}, year ${l.year}.</b> ${l.earned} of ${l.quota}${l.twist ? `. ${esc(twistText(l.twist))}` : '.'}`));
    page.append(list);
    const fresh: CardId[] = end.unlocked ?? [];
    if (fresh.length) page.append(el('p', '', `New in the merchant's catalogue: ${listOf(fresh.map((c) => lower(c)))}.`));
    const foot = el('div', 'sb-entry-foot');
    foot.append(btn('sb-plain big', 'Turn to a fresh page', () => this.t.fresh(null, false)));
    sheet.append(foot);
    this.show('entry', sheet);
    this.shadeMore(page);
    this.ctx.audio.cue('deck.big');
  }

  // ---------------------------------------------------------------- keys

  /** Keys while a sheet is up. Returns true if used. */
  key(e: KeyboardEvent): boolean {
    if (e.code === 'Escape') {
      if (this.detailEl.classList.contains('on')) this.closeDetail();
      else if (this.kind === 'rules') this.menu();
      else if (this.kind === 'menu' || this.kind === 'deck') this.back();
      else if (this.kind === 'stall') {
        if (this.picked) {
          this.picked = null;
          this.stall();
        }
      }
      return true;
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
      const items = [...this.el.querySelectorAll('button:not([disabled])')] as HTMLButtonElement[];
      if (!items.length) return false;
      const cur = items.indexOf(document.activeElement as HTMLButtonElement);
      const fwd = e.code === 'ArrowRight' || e.code === 'ArrowDown';
      const next = cur < 0 ? 0 : (cur + (fwd ? 1 : -1) + items.length) % items.length;
      items[next].focus();
      items[next].scrollIntoView({ block: 'nearest' });
      return true;
    }
    if (e.code === 'KeyD' && this.kind === 'deck') {
      this.back();
      return true;
    }
    return false;
  }
}
