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
  canRemove,
  canUpgrade,
  CARDS,
  cardText,
  costOf,
  leaveShop,
  MAX_PAGES,
  PAGES,
  removeCard,
  removePrice,
  reroll,
  SEASON_NAMES,
  TUNING,
  upgradeCard,
  upgradeNote,
  type Card,
  type CardId,
  type Ev,
  type PageId,
} from './rules';
import type { Line } from './lessons';
import type { Table } from './table';
import { pinUrl, thingUrl } from './view/art';
import { faceUrl, VARIETY } from './view/faces';
import { paintBell, paintGlyph, paintStamp } from './view/glyphs';
import { PALETTES } from '../../render2d/palette';

type Kind = 'menu' | 'rules' | 'deck' | 'stall' | 'entry';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function btn(cls: string, html: string, on: () => void): HTMLButtonElement {
  const b = el('button', cls, html);
  b.onclick = (e) => {
    e.stopPropagation();
    on();
  };
  return b;
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
  }

  // ---------------------------------------------------------------- the almanac (pause)

  menu(): void {
    const s = this.t.run;
    const m = this.t.meta;
    const page = el('div', 'sb-book-page');
    page.append(el('i', 'sb-ribbon'));
    page.append(el('h2', '', 'The almanac'));
    page.append(el('p', 'sb-sub', `Year ${s.year}, ${s.season === 0 ? 'spring' : SEASON_NAMES[s.season]}. ${s.phase === 'day' ? `Day ${s.day} of ${TUNING.days}.` : ''}`));
    const toc = el('div', 'sb-toc');
    const row = (label: string, hint: string, on: () => void) => toc.append(btn('sb-toc-row', `<span>${label}</span><i></i><em>${hint}</em>`, on));
    row('Carry on', 'Esc', () => this.close());
    row('Harvest pace', this.t.prefs.fast ? 'fast' : 'easy', () => {
      this.t.prefs.fast = !this.t.prefs.fast;
      this.t.save();
      this.menu();
    });
    row('The rules in brief', '', () => this.rules());
    if (this.t.seen('tin')) row('Your seed tin', 'D', () => this.deck('tin'));
    row('Other games', '`', () => {
      this.close();
      this.ctx.openSwitcher();
    });
    row('Give up this run', '', () => {
      if (!this.giveUpArmed) {
        this.giveUpArmed = true;
        const last = toc.lastElementChild as HTMLElement;
        last.querySelector('span')!.textContent = 'Give up this run: tap again';
        return;
      }
      this.giveUpArmed = false;
      this.close();
      this.t.fresh(null, false);
    });
    this.giveUpArmed = false;
    page.append(toc);
    const best = m.best;
    const kinds = s.stats.bestKind ? CARDS[s.stats.bestKind].name.toLowerCase() : '';
    page.append(
      el(
        'p',
        'sb-foot',
        `${m.runs ? `Runs finished: ${m.runs}. Most seasons: ${best.seasons}. Best harvest: ${best.harvest}.` : 'No runs finished yet.'}${s.stats.bestHarvest ? ` This run's best: ${kinds} for ${s.stats.bestHarvest}.` : ''}`,
      ),
    );
    page.append(el('p', 'sb-keys', 'Keys: 1 to 7 take up a card (Shift for one you cannot pay for), arrows pick a plot, Enter plays, I reads, E ends the day, X tosses, D opens the tin, Esc puts down.'));
    this.show('menu', page);
  }
  private giveUpArmed = false;

  rules(): void {
    const page = el('div', 'sb-book-page');
    page.append(el('i', 'sb-ribbon'));
    page.append(el('h2', '', 'The rules in brief'));
    const lines = [
      'A season is six days. Each day you draw up to five cards and fill three seed scoops. A card costs the scoops printed in its corner.',
      'Sow seeds on bare plots. Every crop grows a night each night; the moons on a packet are the nights it needs. The watering can and rain add a night.',
      'At night every ripe crop is pulled. Each harvest pays yield × bloom: yield (the basket) is what the crop is worth, bloom (the red flower) multiplies it.',
      'Bonuses come from what stands next to a crop: a carrot gives the radish beside it +2 yield, each radish beside a carrot gives it +1 bloom. Hold a card to see what it would do on each plot.',
      'Fill the pegboard to the brass hole by the sixth night, or the run ends. Coins carry over and buy seed at the market between seasons.',
      'From summer, pests stop crops growing. From autumn, crows take a ripe crop that no scarecrow guards.',
      'Cards you keep stay in hand. Once a day you may toss one on the spent heap for a fresh one.',
    ];
    for (const l of lines) page.append(el('p', '', l));
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
    notes.append(el('p', '', `<b>${esc(def.name)}</b>${variety}${card.up ? ', select' : ''}. ${cost === 0 ? 'Free to play.' : `Costs ${cost} ${cost === 1 ? 'scoop' : 'scoops'}.`}`));
    notes.append(el('p', '', esc(cardText(card.id, card.up))));
    if (def.type === 'weather') notes.append(el('p', 'sb-quiet', 'Weather cards take effect tonight, before anything grows.'));
    if (def.type === 'object') notes.append(el('p', 'sb-quiet', 'It stands on its plot until the season ends, then comes back to the tin.'));
    if (!card.up) notes.append(el('p', 'sb-quiet', `Stamped select: ${upgradeNote(card.id)}`));
    if (!hover) notes.append(el('p', 'sb-quiet', 'Tap to put it back.'));
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

  deck(which: 'tin' | 'spent' | 'all', pick: 'remove' | 'upgrade' | null = null): void {
    const s = this.t.run;
    if (which === 'tin' && !pick) this.t.tutor.count('tin');
    const wrap = el('div', 'sb-tinview');
    this.pickUid = null;
    let cards: Card[];
    let title: string;
    if (pick) {
      cards = [...s.draw];
      title = pick === 'remove' ? `Compost a card for ${removePrice(s)} coins` : `Stamp a card select for ${this.upgradeCost()} coins`;
    } else if (which === 'spent') {
      cards = [...s.discard];
      title = 'Spent this season';
    } else {
      cards = s.phase === 'day' ? [...s.draw] : allCards(s);
      title = s.phase === 'day' ? 'Still in the tin' : 'Your seed tin';
    }
    wrap.append(el('h2', '', title));
    if (pick) wrap.append(el('p', 'sb-sub', pick === 'remove' ? 'Tap a card, then tap it again to compost it.' : 'Tap a card, then tap it again to stamp it.'));
    else if (s.phase === 'day') wrap.append(el('p', 'sb-sub', `${s.draw.length} in the tin, ${s.hand.length} in hand, ${s.discard.length} spent, ${s.placed.length} out on the plot.`));
    const order: Record<string, number> = { seed: 0, tool: 1, weather: 2, object: 3 };
    cards.sort((a, b) => order[CARDS[a.id].type] - order[CARDS[b.id].type] || a.id.localeCompare(b.id) || Number(b.up) - Number(a.up));
    const grid = el('div', 'sb-tingrid');
    for (const c of cards) {
      const disabled = pick === 'upgrade' && c.up;
      const b = btn(`sb-tincard${disabled ? ' off' : ''}`, `<img src="${faceUrl(c.id, c.up)}" alt="${esc(CARDS[c.id].name)}${c.up ? ', select' : ''}">`, () => {
        if (!pick) {
          this.detail(c);
          return;
        }
        if (disabled) return;
        if (this.pickUid !== c.uid) {
          this.pickUid = c.uid;
          grid.querySelectorAll('.sb-tincard').forEach((x) => x.classList.remove('lifted'));
          b.classList.add('lifted');
          this.ctx.audio.cue('deck.pick');
          return;
        }
        const ev = pick === 'remove' ? removeCard(s, c.uid) : upgradeCard(s, c.uid);
        if (ev) {
          this.t.tutor.count('service');
          this.ctx.audio.cue(pick === 'remove' ? 'deck.remove' : 'deck.buy');
          this.t.save();
        } else this.ctx.audio.cue('deck.deny');
        this.stall();
      });
      grid.append(b);
    }
    if (!cards.length) grid.append(el('p', 'sb-sub', 'Nothing here.'));
    wrap.append(grid);
    wrap.append(btn('sb-plain', pick ? 'Not now' : 'Close the tin', () => this.back()));
    this.show('deck', wrap);
  }

  private upgradeCost(): number {
    const sh = this.t.run.shop;
    return TUNING.upgradePrice + TUNING.serviceStep * (sh?.upgraded ?? 0);
  }

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

  stall(end?: Extract<Ev, { t: 'seasonEnd' }>): void {
    const s = this.t.run;
    const sh = s.shop;
    if (!sh) return;
    void end;
    const wrap = el('div', 'sb-stall');
    // Ledger line for the season just closed.
    const last = s.stats.log[s.stats.log.length - 1];
    const head = el('div', 'sb-stall-head');
    head.append(el('div', 'sb-sign', '<span>Seed merchant</span>'));
    if (last) head.append(el('p', 'sb-closed', `${cap(SEASON_NAMES[last.season])} is in: ${last.earned} against a quota of ${last.quota}.`));
    head.append(el('p', 'sb-purse-line', `You have <b>${s.coins}</b> coins.`));
    wrap.append(head);

    if (this.t.stallLine) wrap.append(this.lessonEl);
    // Pages pinned on the back board, once the almanac pages have been brought in.
    const cork = el('div', 'sb-cork');
    cork.append(el('h3', '', `Almanac pages. You keep up to ${MAX_PAGES}.`));
    const pins = el('div', 'sb-pins');
    sh.pages.forEach((o, i) => {
      const key = `page${i}`;
      const pageEl = this.pageEl(o.page, o.price, o.sold);
      const full = s.pages.length >= MAX_PAGES;
      const b = el('button', `sb-pagebtn${this.picked === key ? ' lifted' : ''}`);
      b.append(pageEl);
      if (!o.sold && this.picked === key) {
        const tag = el('span', 'sb-ask', full ? 'Almanac full' : s.coins < o.price ? `Short ${o.price - s.coins}` : 'Tap to buy');
        b.append(tag);
      }
      b.disabled = o.sold;
      b.onclick = () => {
        if (this.picked !== key) {
          this.picked = key;
          this.ctx.audio.cue('deck.pick');
          this.stall();
          return;
        }
        if (buyPage(s, i)) {
          this.t.tutor.count('page');
          this.ctx.audio.cue('deck.page');
          this.picked = null;
          this.t.save();
        } else this.ctx.audio.cue('deck.deny');
        this.stall();
      };
      pins.append(b);
    });
    if (!sh.pages.length) pins.append(el('p', 'sb-sub', 'No pages left to sell.'));
    if (s.pages.length) {
      const kept = el('div', 'sb-kept');
      kept.append(el('span', '', 'Kept:'));
      for (const p of s.pages) kept.append(el('i', '', esc(PAGES[p].name)));
      cork.append(pins, kept);
    } else cork.append(pins);
    if (this.t.seen('pages')) wrap.append(cork);

    // The tray of seed and tools, rarer stock laid out larger.
    const tray = el('div', 'sb-tray');
    const goods = el('div', 'sb-goods');
    sh.cards.forEach((o, i) => {
      const key = `card${i}`;
      const def = CARDS[o.card];
      const size = def.rarity === 'rare' ? 'l' : def.rarity === 'uncommon' ? 'm' : 's';
      const b = el('button', `sb-good ${size}${o.sold ? ' sold' : ''}${this.picked === key ? ' lifted' : ''}`);
      b.style.setProperty('--tilt', `${[-5, 3, -2][i]}deg`);
      if (o.sold) {
        b.innerHTML = '<span class="sb-chalk">sold</span>';
        b.disabled = true;
      } else {
        b.innerHTML = `<img src="${faceUrl(o.card, false)}" alt="${esc(def.name)}"><span class="sb-pricetag">${o.price}</span>`;
        if (this.picked === key) b.append(el('span', 'sb-ask', s.coins < o.price ? `Short ${o.price - s.coins}` : 'Tap to buy'));
        b.setAttribute('aria-label', `${def.name}, ${o.price} coins. ${def.text}`);
      }
      b.onclick = () => {
        if (this.picked !== key) {
          this.picked = key;
          this.ctx.audio.cue('deck.pick');
          this.stall();
          return;
        }
        if (buyCard(s, i)) {
          this.t.tutor.count('buy');
          this.ctx.audio.cue('deck.buy');
          this.picked = null;
          this.t.save();
        } else this.ctx.audio.cue('deck.deny');
        this.stall();
      };
      b.oncontextmenu = (e) => {
        e.preventDefault();
        this.detail({ uid: -1, id: o.card, up: false });
      };
      goods.append(b);
    });
    tray.append(goods);
    // Services on the tray's lip.
    const lip = el('div', 'sb-lip');
    const pal = PALETTES[1];
    const thing = (kind: 'stamp' | 'bell' | 'compost', label: string, price: number, ok: boolean, on: () => void) => {
      const url = thingUrl(kind, 44, (g, px) => {
        if (kind === 'stamp') paintStamp(g, px, '#2a1a0a');
        else if (kind === 'bell') paintBell(g, px, '#2a1a0a');
        else paintGlyph(g, 'compost', px, '#2a1a0a', pal);
      });
      const b = btn('sb-thing', `<img src="${url}" alt=""><span>${label}</span><em>${price} coins</em>`, on);
      b.disabled = !ok;
      lip.append(b);
    };
    thing('compost', 'Compost', removePrice(s), canRemove(s), () => this.deck('all', 'remove'));
    thing('stamp', 'Stamp', this.upgradeCost(), canUpgrade(s), () => this.deck('all', 'upgrade'));
    thing('bell', 'Fresh stock', sh.reroll, s.coins >= sh.reroll, () => {
      if (reroll(s)) {
        this.t.tutor.count('service');
        this.ctx.audio.cue('deck.reroll');
        this.picked = null;
        this.t.save();
      }
      this.stall();
    });
    if (this.t.seen('services')) tray.append(lip);
    wrap.append(tray);
    const next = s.season === 3 ? `On to spring, year ${s.year + 1}` : `On to ${SEASON_NAMES[s.season + 1]}`;
    wrap.append(
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
    const scroll = this.el.querySelector('.sb-stall')?.scrollTop ?? 0;
    // Keep the keyboard where it was: on the lifted thing, or on what was focused before.
    const was = document.activeElement?.closest('.sb-stall') ? [...this.el.querySelectorAll('button')].indexOf(document.activeElement as HTMLButtonElement) : -1;
    this.show('stall', wrap, this.picked ? '.lifted' : undefined);
    if (!this.picked && was >= 0 && this.ctx.device() === 'key') (wrap.querySelectorAll('button')[was] as HTMLButtonElement | undefined)?.focus({ preventScroll: true });
    wrap.scrollTop = scroll;
  }

  /** Pin the stall's lesson line at its head (or take it down). */
  lesson(line: Line | null): void {
    this.lessonEl.textContent = line?.text ?? '';
    this.lessonEl.dataset.lesson = line?.id ?? '';
    if (this.kind !== 'stall') return;
    const wrap = this.el.querySelector('.sb-stall');
    if (!wrap) return;
    if (line && !wrap.contains(this.lessonEl)) wrap.insertBefore(this.lessonEl, wrap.children[1] ?? null);
    else if (!line) this.lessonEl.remove();
  }

  // ---------------------------------------------------------------- the almanac entry at the end

  entry(): void {
    const s = this.t.run;
    const m = this.t.meta;
    const page = el('div', 'sb-entry');
    page.append(el('h2', '', `The almanac, year ${s.year}`));
    page.append(el('p', 'sb-sub', 'An account of the kitchen plot.'));
    const list = el('ol', 'sb-entries');
    for (const l of s.stats.log) {
      const li = el('li');
      const when = `${cap(SEASON_NAMES[l.season])}${s.stats.log.some((x) => x.year !== 1) ? `, year ${l.year}` : ''}.`;
      li.innerHTML = `<b>${when}</b> ${l.earned} pulled against ${l.quota}. ${l.cleared ? 'Met.' : `Short by ${l.quota - l.earned}. The run ends here.`}`;
      list.append(li);
    }
    page.append(list);
    const bits: string[] = [];
    if (s.stats.bestKind) bits.push(`Best single harvest: ${CARDS[s.stats.bestKind].name.toLowerCase()}, for ${s.stats.bestHarvest}.`);
    bits.push(`Coins pulled in all: ${s.stats.totalEarned}. Harvests: ${s.stats.harvests}.`);
    bits.push(`Seasons met: ${s.stats.seasonsCleared}. Your most: ${m.best.seasons}.`);
    for (const b of bits) page.append(el('p', '', b));
    const fresh: CardId[] = s.end?.unlocked ?? [];
    if (fresh.length) {
      page.append(el('p', '', `New in the merchant's catalogue: ${fresh.map((c) => CARDS[c].name).join(' and ')}.`));
      const row = el('div', 'sb-new');
      for (const c of fresh) {
        const img = el('img');
        img.src = faceUrl(c, false);
        img.alt = CARDS[c].name;
        row.append(img);
      }
      page.append(row);
    } else page.append(el('p', 'sb-quiet', 'The catalogue holds nothing new.'));
    page.append(btn('sb-plain big', 'Turn to a fresh page', () => this.t.fresh(null, false)));
    this.show('entry', page);
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
