// Everything that lies over the table for a while: the almanac (pause and
// settings), a card held up close, the seed tin's contents, the seed
// merchant's stall between seasons, and the almanac's entry for the run.
// Each is its own material: a book page, a merchant's tray and cork board,
// a ruled entry. None of them is a box of equal buttons.

import type { GameContext } from '../../shell/types';
import {
  allCards,
  buyCard,
  buyPage,
  buyScoop,
  buySlot,
  canBuyScoop,
  canRemove,
  canUpgrade,
  CARDS,
  cardText,
  costOf,
  leaveShop,
  maxPages,
  PAGES,
  removeCard,
  removePrice,
  reroll,
  scoopPrice,
  SEASON_NAMES,
  SEEDS,
  slotOnSale,
  slotPrice,
  TUNING,
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
    page.append(el('p', 'sb-sub', `${cap(SEASON_NAMES[s.season])}, year ${s.year}. ${s.phase === 'day' ? `Day ${s.day} of ${TUNING.days}.` : s.phase === 'shop' ? 'At the stall.' : ''}`));
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
    row('Give up this run', '', () => {
      if (!this.giveUpArmed) {
        this.giveUpArmed = true;
        const last = toc.lastElementChild as HTMLElement;
        last.querySelector('span')!.textContent = `Give up this run: ${this.touch ? 'tap' : 'click'} again`;
        return;
      }
      this.giveUpArmed = false;
      this.close();
      this.t.fresh(null, false);
    });
    this.giveUpArmed = false;
    page.append(toc);
    const best = m.best;
    const kinds = s.stats.bestKind ? lower(s.stats.bestKind) : '';
    page.append(
      el(
        'p',
        'sb-foot',
        `${m.runs ? `Runs finished: ${m.runs}. Most seasons: ${best.seasons}. Best harvest: ${best.harvest}.` : 'No runs finished yet.'}${s.stats.bestHarvest ? ` This run's best: ${kinds} for ${s.stats.bestHarvest}.` : ''}`,
      ),
    );
    // Keys only for a keyboard: a phone has none.
    if (keys) page.append(el('p', 'sb-keys', 'Keys: 1 to 7 take up a card (Shift for one you cannot pay for), arrows pick a plot, Enter plays, I reads, E ends the day, X tosses, D opens the tin, Esc puts down.'));
    this.show('menu', page);
  }
  private giveUpArmed = false;

  rules(): void {
    const page = el('div', 'sb-book-page');
    page.append(el('i', 'sb-ribbon'));
    page.append(el('h2', '', 'The rules in brief'));
    const lines = [
      'A season is six days. Each day you draw up to five cards and fill three seed scoops. A card costs the scoops printed in its corner.',
      'Sow seeds on bare plots. Every crop grows a night each night; the moons on a packet are the nights it needs. Beans and strawberries stay and pick night after night. The watering can and rain add a night.',
      'At night every ripe crop is pulled. Each harvest pays yield × bloom: yield (the basket) is what the crop is worth, bloom (the red flower) multiplies it.',
      'Bonuses come from what stands next to a crop on the night it is pulled. A radish pulled tonight gives nothing to a carrot that ripens tomorrow. Hold a card to see what it would do; a greyed bonus is one the night will not pay.',
      'Fill the pegboard to the brass hole by the sixth night, or the run ends. Coins carry over and buy cards at the stall between seasons.',
      'The plot carries over too: whatever stands at a season\'s last dusk is there at the next dawn, so a late sowing is picked next season and counts for its quota.',
      'From summer, pests settle on crops: a pested crop does not grow or get picked for the nights shown on it. From autumn, a crow may sit on the bed at dawn; that night it takes a ripe crop no scarecrow guards.',
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
    if (!card.up && this.t.tutor.n('improve') > 0) notes.append(el('p', 'sb-quiet', `Improved: ${lowerFirst(upgradeNote(card.id))}`));
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
      const read = el('p', 'sb-sub sb-pickline', pick === 'remove' ? 'Tap a card to see it, then tap it again to throw it out.' : 'Tap a card to see what improving does, then tap it again.');
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
                ? `Throw out this ${esc(lower(c.id))}? <b>Tap it again.</b>`
                : `${esc(CARDS[c.id].name)}: ${esc(lowerFirst(upgradeNote(c.id)))} <b>Tap it again to improve it.</b>`;
            this.ctx.audio.cue('deck.pick');
            return;
          }
          const ev = pick === 'remove' ? removeCard(s, c.uid) : upgradeCard(s, c.uid);
          if (ev) {
            this.t.tutor.count('service');
            if (pick === 'upgrade') this.t.tutor.count('improve');
            this.ctx.audio.cue(pick === 'remove' ? 'deck.remove' : 'deck.buy');
            this.done = pick === 'remove' ? `The ${lower(c.id)} is thrown out.` : `${CARDS[c.id].name} improved. ${upgradeNote(c.id)}`;
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
  }
  private doneCard: Card | null = null;

  // ---------------------------------------------------------------- the seed merchant

  /** An almanac page as a pinned sheet. Price null shows it as kept. */
  pageEl(id: PageId, price: number | null, sold = false): HTMLElement {
    const p = PAGES[id];
    const tilt = ((id.charCodeAt(0) * 7 + id.length * 3) % 7) - 3;
    const d = el('div', `sb-pagesheet${sold ? ' sold' : ''}`);
    d.style.setProperty('--tilt', `${tilt * 0.6}deg`);
    d.innerHTML = `<img class="sb-pinimg" src="${pinUrl()}" alt=""><b>${esc(p.name)}</b><span>${esc(p.text)}</span>${price !== null ? `<em class="sb-pencil">${sold ? 'taken' : `${price} coins`}</em>` : ''}`;
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
    if (last) head.append(el('p', 'sb-closed', `${cap(SEASON_NAMES[last.season])} is in. You took ${last.earned} of ${last.quota}.`));
    head.append(el('p', 'sb-purse-line', `You have <b>${s.coins}</b> coins.`));
    head.append(btn('sb-stall-book', '<span>Almanac</span>', () => this.menu()));
    wrap.append(head);
    const body = el('div', 'sb-stall-body');

    // Pages pinned on the back board, once the almanac pages have been brought in.
    const cork = el('div', 'sb-cork');
    const room = maxPages(s);
    const full = s.pages.length >= room;
    cork.append(el('h3', '', full ? `Almanac pages. Yours is full: a new page takes a kept one's place.` : `Almanac pages. You keep up to ${room}.`));
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
        const k = btn(`sb-keptpage${this.picked === key ? ' lifted' : ''}`, esc(PAGES[p].name), () => {
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
      cork.append(b);
    }
    if (this.t.seen('pages')) body.append(cork);

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
        b.innerHTML = `<img src="${faceUrl(o.card, false)}" alt="${esc(def.name)}"><span class="sb-pricetag">${o.price}</span>`;
        if (this.picked === key) read = `<b>${esc(def.name)}</b>, ${esc(cardWords(o.card, false))} ${ask(o.price)}`;
        b.setAttribute('aria-label', `${def.name}, ${o.price} coins. ${def.text}`);
      }
      b.onclick = () =>
        this.lift(key, () => {
          if (buyCard(s, i)) this.bought('buy', `The ${lower(o.card)} goes in your tin.`);
          else this.ctx.audio.cue('deck.deny');
          this.stall();
        });
      b.oncontextmenu = (e) => {
        e.preventDefault();
        this.detail({ uid: -1, id: o.card, up: false });
      };
      goods.append(b);
    });
    tray.append(goods);
    // Services on the tray's lip: throw a card out, improve one, fresh stock, and a scoop from year 2.
    const lip = el('div', 'sb-lip');
    const thing = (key: string, url: string, label: string, price: number, ok: boolean, words: string, verb: string, why: string, go: () => void) => {
      const b = btn(`sb-thing${this.picked === key ? ' lifted' : ''}`, `<img src="${url}" alt=""><span>${label}</span><em>${price} coins</em>`, () =>
        this.lift(key, () => {
          if (!ok) {
            this.ctx.audio.cue('deck.deny');
            return;
          }
          this.picked = null;
          go();
        }),
      );
      if (this.picked === key) read = `${words} ${ok ? `<em>${tap} again to ${verb}.</em>` : s.coins < price ? `<em>Short ${price - s.coins} coins.</em>` : `<em>${why}</em>`}`;
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
      thing('scoop', scoopUrl(true), 'A scoop', scoopPrice(s), canBuyScoop(s), 'One more seed scoop on the bench every day, for good.', 'buy it', '', () => {
        if (buyScoop(s)) this.bought('service', 'A new scoop for the bench, for good.');
        this.stall();
      });
    }
    if (this.t.seen('services')) tray.append(lip);
    body.append(tray);
    wrap.append(body);

    // The slip's own place: what the lifted thing is, else what was just done, else the stall's lesson.
    const foot = el('div', 'sb-stall-foot');
    const spot = el('div', 'sb-slipspot');
    if (read) spot.append(this.readSlip(read));
    else if (this.done) {
      const d = el('div', 'sb-done');
      if (this.doneCard) d.append(Object.assign(el('img'), { src: faceUrl(this.doneCard.id, true), alt: '' }));
      d.append(el('p', '', esc(this.done)));
      spot.append(d);
    } else if (this.t.stallLine) spot.append(this.lessonEl);
    foot.append(spot);
    const next = s.season === 3 ? `On to spring, year ${s.year + 1}` : `On to ${SEASON_NAMES[s.season + 1]}`;
    foot.append(
      btn('sb-signpost', `<span>${next}</span>`, () => {
        const ev = leaveShop(s);
        if (!ev) return;
        this.t.save();
        this.close();
        this.t.syncAll();
        this.t.relayout();
        this.ctx.audio.cue('deck.shuffle');
      }),
    );
    wrap.append(foot);
    const scroll = this.el.querySelector('.sb-stall-body')?.scrollTop ?? 0;
    // Keep the keyboard where it was: on the lifted thing, or on what was focused before.
    const was = document.activeElement?.closest('.sb-stall') ? [...this.el.querySelectorAll('button')].indexOf(document.activeElement as HTMLButtonElement) : -1;
    this.show('stall', wrap, this.picked ? '.lifted' : undefined);
    if (!this.picked && was >= 0 && this.ctx.device() === 'key') (wrap.querySelectorAll('button')[was] as HTMLButtonElement | undefined)?.focus({ preventScroll: true });
    body.scrollTop = scroll;
  }
  private swapFor: number | null = null;

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
    if (!line) this.lessonEl.remove();
    else if (!spot.querySelector('.sb-read, .sb-done') && !spot.contains(this.lessonEl)) spot.append(this.lessonEl);
  }

  // ---------------------------------------------------------------- the almanac entry at the end

  entry(): void {
    const s = this.t.run;
    const m = this.t.meta;
    // The account scrolls if a long run fills it; the way on stays in sight below it.
    const sheet = el('div', 'sb-entry');
    const page = el('div', 'sb-entry-body');
    sheet.append(page);
    page.append(el('h2', '', `The almanac, year ${s.year}`));
    page.append(el('p', 'sb-sub', 'An account of the kitchen plot.'));
    const list = el('ol', 'sb-entries');
    for (const l of s.stats.log) {
      const li = el('li');
      li.innerHTML = `<b>${cap(SEASON_NAMES[l.season])}, year ${l.year}.</b> Took ${l.earned} against a quota of ${l.quota}. ${l.cleared ? 'Met.' : `Short by ${l.quota - l.earned}. The run ends here.`}`;
      list.append(li);
    }
    page.append(list);
    const bits: string[] = [];
    if (s.stats.bestKind) bits.push(`Best single harvest: ${lower(s.stats.bestKind)}, for ${s.stats.bestHarvest}.`);
    bits.push(`Coins taken in all: ${s.stats.totalEarned}. Harvests: ${s.stats.harvests}.`);
    bits.push(`Seasons met: ${s.stats.seasonsCleared}. Your most: ${m.best.seasons}.`);
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
    } else page.append(el('p', 'sb-quiet', 'The catalogue holds nothing new. Meet more seasons in a run to add to it.'));
    sheet.append(btn('sb-plain big', 'Turn to a fresh page', () => this.t.fresh(null, false)));
    this.show('entry', sheet);
    this.ctx.audio.cue('deck.fail');
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
