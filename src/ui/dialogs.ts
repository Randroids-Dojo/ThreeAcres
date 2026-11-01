// Modal cards: the notice board (fields, seeds, builds, crew, market,
// milestones), the end of an almanac season, and a for-sale field.
// The farm pauses while one is open.

import { cropArt } from './crops-art';
import type { UiCue } from '../contract';
import { fieldRep, homestead, priceOf } from '../sim/actions';
import type { Command } from '../sim/commands';
import { BUILD_COST, CAN_WATER, HAND_HIRE, HAND_WAGE, HANDS_MAX, SPRINKLER_MORNINGS, TOOL_UPGRADES } from '../sim/constants';
import { CROP_IDS, CROPS, inSeason } from '../sim/crops';
import { begun, MILESTONES, plantedFor, requestHave, sowByOf, stockCount } from '../sim/goals';
import { dayOfSeason, season, SEASON_NAMES } from '../sim/world';
import type { BuildKind, CropId, Order, WorldState } from '../sim/types';
import { clock, el, esc, fmt, toggle } from './dom';
import { townName } from './describe';
import { icon } from './icons';

export interface DialogHost {
  state(): WorldState;
  send(c: Command): void;
  cue(c: UiCue): void;
  onChange(open: boolean): void;
  pickBuild(kind: BuildKind): void;
  /** Is the keyboard what the player last used? Then an opened card takes the keyboard's focus. */
  keyboard?(): boolean;
}

type Tab = 'requests' | 'fields' | 'seeds' | 'tools' | 'builds' | 'crew' | 'market' | 'milestones';

export class Dialogs {
  readonly root = el('div', 'dialog cork');
  readonly scrim = el('div', 'scrim');
  private title = el('h2');
  private body = el('div', 'body');
  open = false;
  /** Season cards must be answered; they cannot be closed by tapping outside. */
  private sticky = false;
  private pressedScrim = false;
  private kind = '';
  private tab: Tab = 'fields';
  /** What Enter does while a question is open: its main button. */
  private yes: (() => void) | null = null;

  constructor(private host: DialogHost) {
    const head = el('header');
    const close = el('button', 'btn closebtn', `<span class="ic">${icon('close')}</span><span class="tlbl">Close</span>`);
    close.title = 'Close (Esc)';
    close.setAttribute('aria-label', 'Close');
    close.onclick = () => this.close();
    head.append(this.title, close);
    this.root.append(head, this.body);
    // Close on a press that began on the backdrop. A tap that opened the board
    // (on the act button) ends with a click over the new backdrop; that one must not close it.
    this.scrim.onpointerdown = () => (this.pressedScrim = true);
    this.scrim.onclick = () => {
      const began = this.pressedScrim;
      this.pressedScrim = false;
      if (began && !this.sticky) this.close();
    };
    // While a card is open, Tab and Shift+Tab go round its own buttons only, never the HUD behind it.
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.open || e.key !== 'Tab') return;
        e.preventDefault();
        const all = this.focusables();
        if (!all.length) return;
        const at = all.indexOf(document.activeElement as HTMLElement);
        const next = at < 0 ? (e.shiftKey ? all.length - 1 : 0) : (at + (e.shiftKey ? all.length - 1 : 1)) % all.length;
        all[next].focus();
      },
      true,
    );
  }

  /** The buttons on the open card a keyboard can reach, in order. */
  private focusables(): HTMLElement[] {
    return [...this.root.querySelectorAll<HTMLElement>('button')].filter((b) => !(b as HTMLButtonElement).disabled && b.offsetParent !== null && getComputedStyle(b).visibility !== 'hidden');
  }

  /**
   * Put the keyboard on the card when a keyboard is in use (B opened the
   * board): on `prefer` if given, else its first button. A tap or a click
   * leaves focus alone; the first Tab still lands on the card.
   */
  private focusIn(prefer?: HTMLElement | null): void {
    if (!(this.host.keyboard?.() ?? document.getElementById('app')?.dataset.device === 'key')) return;
    const target = prefer && this.root.contains(prefer) ? prefer : this.focusables()[0];
    target?.focus({ preventScroll: true });
  }

  private show(title: string, kind: string, sticky = false): void {
    this.title.textContent = title;
    this.kind = kind;
    this.yes = null;
    this.root.dataset.kind = kind;
    this.sticky = sticky;
    this.pressedScrim = false;
    this.open = true;
    toggle(this.root, 'on', true);
    toggle(this.scrim, 'on', true);
    (this.root.querySelector('header .btn') as HTMLElement).style.display = sticky ? 'none' : '';
    this.host.onChange(true);
    this.host.cue('open');
  }

  close(force = false): void {
    if (!this.open || (this.sticky && !force)) return;
    this.open = false;
    // The keyboard goes back to the farm.
    if (this.root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    toggle(this.root, 'on', false);
    toggle(this.scrim, 'on', false);
    this.host.onChange(false);
    this.host.cue('close');
  }

  /** Enter pressed while a dialog is open: take its main button, if it has one. */
  accept(): boolean {
    if (!this.open || !this.yes) return false;
    this.yes();
    return true;
  }

  /**
   * A question with two answers: the main one (stamped, primary) and "Not
   * now". Used before spending a lot and before sleeping away a morning.
   */
  private ask(title: string, kind: string, text: string, yesLabel: string, onYes: () => void, back?: () => void): void {
    this.show(title, kind);
    this.body.innerHTML = '';
    this.body.append(el('p', '', text));
    const row = el('div', 'row ask');
    const yes = el('button', 'btn primary', esc(yesLabel));
    const go = () => {
      this.close();
      onYes();
    };
    yes.onclick = go;
    const no = el('button', 'btn', 'Not now');
    no.onclick = () => (back ? back() : this.close());
    row.append(yes, no);
    this.body.append(row);
    this.yes = go;
    this.focusIn(yes);
  }

  /** Sleeping before noon, with work still waiting, asks first and says what waits. */
  confirmSleep(minute: number, onYes: () => void, left?: { ripe: number; thirsty: number; bugs: number; crows: number }): void {
    const bits: string[] = [];
    if (left?.ripe) bits.push(`${left.ripe} ripe ${left.ripe === 1 ? 'crop' : 'crops'}`);
    if (left?.thirsty) bits.push(`${left.thirsty} thirsty ${left.thirsty === 1 ? 'crop' : 'crops'}`);
    if (left?.bugs) bits.push(`bugs on ${left.bugs} ${left.bugs === 1 ? 'crop' : 'crops'}`);
    if (left?.crows) bits.push(left.crows === 1 ? 'a crow' : `${left.crows} crows`);
    const list = bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}` : (bits[0] ?? '');
    const what = list ? ` ${list[0].toUpperCase()}${list.slice(1)} still ${bits.length === 1 && /^(a crow|1 )/.test(list) ? 'waits' : 'wait'}.` : '';
    this.ask('Sleep now?', 'sleep', `It is only ${clock(minute)}.${what} Crops grow and the crate ships overnight.`, 'Sleep', onYes);
  }

  /** Re-render the open dialog after the farm changed (a purchase, a delivery). */
  refresh(): void {
    if (!this.open) return;
    if (this.kind === 'board') this.renderBoard();
  }

  // ------------------------------------------------------------ board

  board(tab?: Tab): void {
    const s = this.host.state();
    this.tab = tab ?? (s.rules.goal === 'orders' ? 'market' : homestead(s) && s.learn.includes('requests') ? 'requests' : this.tab);
    this.show('Notice board', 'board');
    this.renderBoard();
    // The keyboard comes onto the board (B opened it): on the tab it shows.
    this.focusIn(this.body.querySelector<HTMLElement>('.tabs button.on'));
  }

  private renderBoard(): void {
    const s = this.host.state();
    // A re-render (a tab chosen, a purchase) keeps the keyboard on the board.
    const hadFocus = this.root.contains(document.activeElement);
    // Sunup shows only what its lessons have brought in.
    const knows = (what: string) => !homestead(s) || s.learn.includes(what);
    const tabs: [Tab, string][] = [];
    if (homestead(s) && knows('requests')) tabs.push(['requests', 'Requests']);
    tabs.push(['fields', 'Fields'], ['seeds', 'Seeds']);
    if (knows('smith')) tabs.push(['tools', 'Smith']);
    if (knows('build')) tabs.push(['builds', 'Builds']);
    if (s.rules.crew === 'crew') tabs.push(['crew', 'Crew']);
    if (s.rules.goal === 'orders') tabs.push(['market', 'Market']);
    if (!homestead(s)) tabs.push(['milestones', s.rules.goal === 'almanac' ? 'Almanac' : 'Milestones']);
    if (!tabs.some(([t]) => t === this.tab)) this.tab = tabs[0][0];
    const bar = el('div', 'tabs');
    for (const [t, label] of tabs) {
      const b = el('button', t === this.tab ? 'on' : '', label);
      b.onclick = () => {
        this.tab = t;
        this.host.cue('page');
        this.renderBoard();
      };
      bar.append(b);
    }
    const list = el('div', 'list');
    switch (this.tab) {
      case 'requests': {
        list.append(el('p', 'legend', smithLine(s)));
        if (!s.orders.length) list.append(el('p', 'legend', 'More requests come with the mornings.'));
        // A pair still to choose between hangs together, "or" between them: only one of the two can be met.
        const shown = new Set<number>();
        let paired = false;
        for (const o of s.orders) {
          if (shown.has(o.id)) continue;
          shown.add(o.id);
          const mate = o.pair !== undefined && !begun(s, o) ? s.orders.find((q) => q !== o && q.pair === o.pair && !begun(s, q) && !shown.has(q.id)) : undefined;
          if (mate) {
            shown.add(mate.id);
            paired = true;
            const pair = el('div', 'pair');
            pair.append(this.requestNote(s, o), el('div', 'or', 'or'), this.requestNote(s, mate));
            list.append(pair);
          } else list.append(this.requestNote(s, o));
        }
        list.append(el('p', 'legend', paired ? 'Plant for one of a pair.' : 'The crate keeps what requests need.'));
        break;
      }
      case 'fields':
        for (const p of s.parcels) {
          // The price is on the stamp only; a field the land agent will not sell yet says the reputation it wants.
          const rep = fieldRep(s, p.id);
          // A field that wants more reputation shows its price in its words (the stamp shows the reputation).
          const it = el('div', `item ${p.owned ? 'done' : ''}`, `<span class="ic">${icon('leaf')}</span><span class="tx"><b>Field ${p.id + 1}</b><span>${p.owned ? 'Yours' : s.rep < rep ? `Four by four, meadow, ${fmt(p.price)} coins. Sold at reputation ${rep}` : 'Four by four, meadow'}</span></span>`);
          if (!p.owned) {
            const short = s.coins < p.price || s.rep < rep;
            const b = el('button', 'btn primary', s.rep < rep ? `Reputation ${rep}` : short ? `Need ${fmt(p.price)}` : `Buy for ${fmt(p.price)}`);
            b.disabled = short;
            // A field is a big spend: the card asks before it buys.
            b.onclick = () => this.parcel(p.id, () => this.board('fields'));
            it.append(b);
          }
          list.append(it);
        }
        break;
      case 'seeds':
        for (const c of CROP_IDS) {
          const d = CROPS[c];
          const off = !inSeason(c, season(s.day));
          const locked = (s.rules.goal === 'almanac' && !s.almanac.unlocked.includes(c)) || off;
          const it = el('div', `item ${locked ? 'done' : ''}`, `<span class="blob">${cropArt(d.id)}</span><span class="tx"><b>${d.name}</b><span>Seeds ${d.seed}, ripe in ${d.days} days${d.regrow ? `, again every ${d.regrow}` : ''}, sells for ${d.price}. Grows in ${d.seasons.map((n) => SEASON_NAMES[n].toLowerCase()).join(' and ')}${off ? ', not now' : ''}</span></span>`);
          if (!locked) {
            const b = el('button', `btn ${s.seed === c ? 'primary' : ''}`, s.seed === c ? 'In hand' : 'Use');
            b.onclick = () => {
              this.host.send({ type: 'seed', crop: c });
              if (s.rules.tools === 'kit') this.host.send({ type: 'tool', tool: 'seeds' });
              this.host.cue('tool');
              this.close();
            };
            it.append(b);
          }
          list.append(it);
        }
        break;
      case 'tools': {
        list.append(el('p', 'legend', `Tools cost coins and reputation. Yours is ${s.rep}.`));
        for (const t of ['can', 'hoe'] as const) {
          const level = s.tools[t];
          const now = level === 0 ? (t === 'can' ? 'Watering can' : 'Hoe') : TOOL_UPGRADES[t][level - 1].name;
          const next = TOOL_UPGRADES[t][level];
          const what = (l: number) => (l === 1 ? 'three plots in a row' : 'a three by three square');
          const it = el('div', `item ${next ? '' : 'done'}`, `<span class="ic">${icon(t)}</span><span class="tx"><b>${next ? esc(next.name) : `${esc(now)}, the best there is`}</b><span>${next ? `Works ${what(level + 1)}${t === 'can' ? `, holds ${CAN_WATER[level + 1]}` : ''}. ${fmt(next.cost)} coins, reputation ${next.rep}` : `Works ${what(level)}`}</span></span>`);
          if (next) {
            const b = el('button', 'btn primary', 'Buy');
            b.disabled = s.coins < next.cost || s.rep < next.rep;
            if (s.rep < next.rep) b.textContent = `Reputation ${next.rep}`;
            else if (s.coins < next.cost) b.textContent = `Need ${fmt(next.cost)}`;
            b.onclick = () =>
              this.ask(
                `${next.name}?`,
                'buy',
                `${fmt(next.cost)} coins. It works ${what(level + 1)}${t === 'can' ? ` and holds ${CAN_WATER[level + 1]}` : ''}. You have ${fmt(s.coins)}.`,
                `Buy for ${fmt(next.cost)}`,
                () => {
                  this.host.send({ type: 'upgrade', tool: t });
                  this.host.cue('buy');
                  setTimeout(() => this.board('tools'), 0);
                },
                () => this.board('tools'),
              );
            it.append(b);
          }
          list.append(it);
        }
        break;
      }
      case 'builds':
        // Only what a lesson has brought in: the sprinkler comes after the scarecrow.
        for (const k of (['scarecrow', 'sprinkler'] as BuildKind[]).filter((b) => b === 'scarecrow' || knows('sprinkler'))) {
          const it = el('div', 'item', `<span class="ic">${icon(k)}</span><span class="tx"><b>${k === 'sprinkler' ? 'Sprinkler' : 'Scarecrow'}</b><span>${k === 'sprinkler' ? sprinklerWords(s) : scarecrowWords(s)}. ${BUILD_COST[k]} coins, on bare soil</span></span>`);
          const b = el('button', 'btn primary', 'Place');
          b.onclick = () => {
            this.host.pickBuild(k);
            this.close();
          };
          it.append(b);
          list.append(it);
        }
        break;
      case 'crew': {
        const crew = s.actors.filter((a) => a.role === 'hand');
        for (const h of crew) list.append(el('div', 'item', `<span class="ic">${icon('person')}</span><span class="tx"><b>${esc(h.name)}</b><span>Harvests, replants, waters, picks bugs and shoos crows. ${HAND_WAGE} coins a day</span></span>`));
        if (crew.length < HANDS_MAX) {
          const it = el('div', 'item', `<span class="ic">${icon('person')}</span><span class="tx"><b>Hire a hand</b><span>${HAND_HIRE} coins now, ${HAND_WAGE} a day after</span></span>`);
          const b = el('button', 'btn primary', 'Hire');
          b.disabled = s.coins < HAND_HIRE;
          b.onclick = () => {
            this.host.send({ type: 'hire' });
            this.host.cue('buy');
            setTimeout(() => this.refresh(), 0);
          };
          it.append(b);
          list.append(it);
        }
        list.append(el('p', 'legend', 'Paint jobs with the tools and the crew takes them first. Under turns, they work through the night.'));
        break;
      }
      case 'market':
        list.append(el('p', 'legend', 'Stock waits here until you deliver or sell it. Selling a lot of one crop lowers its price; it recovers over a few days.'));
        for (const c of CROP_IDS) {
          const n = stockCount(s, c);
          const d = s.market.demand[c];
          const trend = d > 1.04 ? '<span class="trend up">up</span>' : d < 0.96 ? '<span class="trend down">down</span>' : 'steady';
          const it = el('div', `item ${n ? '' : 'done'}`, `<span class="blob">${cropArt(c)}</span><span class="tx"><b>${CROPS[c].name} &middot; ${n} in stock</b><span>${priceOf(s, c, 0)} each, ${trend}</span></span>`);
          if (n) {
            const b = el('button', 'btn', 'Sell all');
            b.onclick = () => {
              this.host.send({ type: 'sell', crop: c });
              this.host.cue('buy');
              setTimeout(() => this.refresh(), 0);
            };
            it.append(b);
          }
          list.append(it);
        }
        break;
      case 'milestones':
        if (s.rules.goal === 'almanac') {
          const a = s.almanac;
          list.append(el('p', 'legend', `Ten days to a season, three goals each. A star for every goal met, and a new seed to choose when the season ends. ${a.stars} stars so far.`));
          a.history.forEach((st, i) => list.append(el('div', 'item', `<span class="tx"><b>${SEASON_NAMES[i % 4]}, year ${Math.floor(i / 4) + 1}</b></span><span class="stars">${stars(st)}</span>`)));
          list.append(el('div', 'item', `<span class="tx"><b>In your almanac</b><span>${a.unlocked.map((c) => CROPS[c].name).join(', ')}</span></span>`));
        } else {
          for (const m of MILESTONES) list.append(el('div', `item ${s.milestones[m.id] ? '' : 'done'}`, `<span class="ic">${icon(s.milestones[m.id] ? 'starFill' : 'star')}</span><span class="tx"><b>${esc(m.text)}</b></span>`));
        }
        break;
    }
    this.body.innerHTML = '';
    this.body.append(bar, list);
    pinNotes(list);
    for (const [i, b] of [...bar.children].entries()) (b as HTMLElement).style.setProperty('--tilt', `${((i * 53) % 5) - 2}deg`);
    if (hadFocus) this.focusIn(bar.querySelector<HTMLElement>('button.on'));
  }

  /**
   * One request's note: what it needs and when, what it pays and against
   * what. An offer reads "Sow 8 by Spring 6, seed 120" and "Pays 660, 440 at
   * market"; once the seed is in, how far it has got and when it is wanted.
   */
  private requestNote(s: WorldState, o: Order): HTMLElement {
    const it = o.items[0];
    const d = CROPS[it.crop];
    const name = it.n === 1 ? d.name.toLowerCase() : d.plural;
    const inCrate = Math.min(stockCount(s, it.crop), it.n);
    const toSow = Math.max(0, it.n - requestHave(s, o));
    const sowBy = sowByOf(o);
    const more = plantedFor(s, o) > 0 ? ' more' : '';
    const need =
      toSow > 0 && s.day <= sowBy
        ? `Sow ${toSow}${more} ${sowBy <= s.day ? 'today' : `by ${dayName(s, sowBy)}`}, seed ${fmt(toSow * d.seed)}`
        : `${inCrate} of ${it.n} in the crate, wanted by ${dayName(s, o.due)}`;
    // When it will be ready and when it is wanted, so the two of a pair can be weighed at a glance.
    const when = toSow > 0 && s.day <= sowBy ? `Ripe in ${d.days} days, due ${dayName(s, o.due)}` : '';
    const note = el('div', 'item req', `<span class="blob">${cropArt(it.crop)}</span><span class="tx"><b>${it.n} ${name}</b><span>For ${esc(townName(o.who))}</span><span class="need">${need}</span>${when ? `<span class="when">${when}</span>` : ''}<span class="pay">Pays ${fmt(o.reward)}, ${fmt(d.price * it.n)} at market</span></span>`);
    note.dataset.crop = it.crop;
    if (inCrate >= it.n) {
      const b = el('button', 'btn primary', 'Deliver');
      b.onclick = () => {
        this.host.send({ type: 'deliver', id: o.id });
        this.host.cue('order');
        setTimeout(() => this.refresh(), 0);
      };
      note.append(b);
    }
    return note;
  }

  // ------------------------------------------------------------ season

  season(): void {
    const s = this.host.state();
    const a = s.almanac;
    const st = a.history[a.history.length - 1] ?? 0;
    const prev = SEASON_NAMES[(a.round + 3) % 4];
    this.show(`${prev} is over`, 'season', !!a.draft);
    this.body.innerHTML = '';
    this.body.append(el('div', 'bigstars', stars(st, true)));
    this.body.append(el('p', '', st === 3 ? 'Every goal met. A fine season.' : st === 0 ? 'No goals met this time. The almanac turns the page anyway.' : `${st} of 3 goals met.`));
    if (a.draft) {
      this.body.append(el('p', '', '<b>Add a seed to your almanac</b>'));
      const row = el('div', 'drafts');
      for (const c of a.draft) {
        const d = CROPS[c];
        const b = el('button', 'draft', `<span class="blob">${cropArt(d.id)}</span><b>${d.name}</b><span>${d.days} days, sells ${d.price}</span><span>${esc(d.likes)}</span>`);
        b.onclick = () => {
          this.host.send({ type: 'draft', crop: c as CropId });
          this.host.cue('star');
          this.close(true);
        };
        row.append(b);
      }
      this.body.append(row);
    } else {
      const ok = el('button', 'btn primary', 'On to the next season');
      ok.onclick = () => this.close(true);
      this.body.append(ok);
    }
    this.body.append(el('p', 'legend', `New goals for ${SEASON_NAMES[a.round % 4].toLowerCase()}: ${a.goals.map((g) => g.text.toLowerCase()).join('; ')}.`));
  }

  // ------------------------------------------------------------ parcel

  /** A field for sale: what it is, its price, and a confirm. `back` returns to wherever it was asked from. */
  parcel(id: number, back?: () => void): void {
    const s = this.host.state();
    const p = s.parcels[id];
    if (!p || p.owned) return;
    this.show(`Field ${id + 1} is for sale`, 'parcel');
    this.body.innerHTML = '';
    // The price is on the stamp; the words say what it is and what you have.
    const rep = fieldRep(s, id);
    const known = s.rep < rep ? ` The land agent sells it to farmers with reputation ${rep}. Yours is ${s.rep}.` : ` You have ${fmt(s.coins)} coins.`;
    this.body.append(el('p', '', `${homestead(s) ? 'Four by four, meadow now. Hoe it to plant.' : 'Four by four, meadow now. Rich soil that has not been farmed.'}${known}`));
    const row = el('div', 'row ask');
    const short = s.coins < p.price || s.rep < rep;
    const buy = el('button', 'btn primary', s.rep < rep ? `Reputation ${rep}` : short ? `Need ${fmt(p.price)}` : `Buy for ${fmt(p.price)}`);
    buy.disabled = short;
    const go = () => {
      this.host.send({ type: 'buyParcel', id });
      this.host.cue('buy');
      this.close();
    };
    buy.onclick = go;
    const no = el('button', 'btn', 'Not now');
    no.onclick = () => (back ? back() : this.close());
    row.append(buy, no);
    this.body.append(row);
    this.yes = short ? null : go;
    this.focusIn(short ? no : buy);
  }
}

/** A day as the day card names it ("Spring 6"), or "tomorrow". */
function dayName(s: WorldState, day: number): string {
  if (day === s.day + 1) return 'tomorrow';
  return `${SEASON_NAMES[season(day)]} ${dayOfSeason(day)}`;
}

/** What a scarecrow watches over, in the farm's words. */
export function scarecrowWords(s: WorldState): string {
  return homestead(s) ? 'Keeps crows off the plots around it. Crows still try the edges' : 'Keeps crows off everything within three plots';
}

/** What a sprinkler does, in the farm's words. */
export function sprinklerWords(s: WorldState): string {
  return homestead(s) ? `Waters the plots around it for ${SPRINKLER_MORNINGS} mornings` : 'Waters the nine plots around it every morning';
}

/**
 * Requests and the smith: the reputation requests have earned, and, once the
 * smith has been met, what the next points of it bring (only for a tool the
 * farm has: no copper hoe before the hoe). Short: a footnote, not a letter.
 */
export function smithLine(s: WorldState): string {
  const has = (t: 'can' | 'hoe') => !homestead(s) || s.learn.includes(t);
  const next = (['hoe', 'can'] as const)
    .filter(has)
    .map((t) => ({ t, u: TOOL_UPGRADES[t][s.tools[t]] }))
    .filter((x) => x.u && x.u.rep > s.rep)
    .sort((a, b) => a.u!.rep - b.u!.rep)[0];
  const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  const n = (k: number) => words[k] ?? String(k);
  // The smith is not named before his lesson.
  if (homestead(s) && !s.learn.includes('smith')) return `Reputation ${s.rep}. Each request filled adds one.`;
  if (!next) return `Reputation ${s.rep}. The smith will make anything.`;
  const left = next.u!.rep - s.rep;
  return `Reputation ${s.rep}. ${n(left)} more for a ${next.u!.name.toLowerCase()}.`;
}

/** Notes on a corkboard never hang quite straight. */
function pinNotes(list: HTMLElement): void {
  [...list.children].forEach((n, i) => (n as HTMLElement).style.setProperty('--tilt', `${(((i * 37) % 7) - 3) * 0.45}deg`));
}

function stars(n: number, big = false): string {
  let h = '';
  for (let i = 0; i < 3; i++) h += `<span class="ic ${i < n ? '' : 'off'}">${icon(i < n ? 'starFill' : 'star')}</span>`;
  return big ? h : `<span class="stars">${h}</span>`;
}
