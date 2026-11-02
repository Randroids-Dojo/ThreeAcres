// Modal cards: the notice board (fields, seeds, builds, crew, market,
// milestones), the end of an almanac season, and a for-sale field.
// The farm pauses while one is open.

import { cropArt } from './crops-art';
import type { UiCue } from '../contract';
import { fieldRep, homestead, priceOf } from '../sim/actions';
import type { Command } from '../sim/commands';
import { BUILD_COST, CAN_WATER, HAND_HIRE, HAND_WAGE, HANDS_MAX, SPRINKLER_MORNINGS, TOOL_UPGRADES } from '../sim/constants';
import { CROP_IDS, CROPS, inSeason } from '../sim/crops';
import { canDeliver, clashOf, gainOf, isShort, isTaken, lastSowOf, MILESTONES, offered, partPay, plantedFor, requestHave, requestProgress, slackOf, sowByOf, stillToSow, stockCount, whyNot } from '../sim/goals';
import { dayOfSeason, season, SEASON_NAMES } from '../sim/world';
import type { BuildKind, CropId, LossCause, Order, WorldState } from '../sim/types';
import { clock, el, esc, fmt, toggle } from './dom';
import { repShare, townName } from './describe';
import { icon } from './icons';

export interface DialogHost {
  state(): WorldState;
  send(c: Command): void;
  cue(c: UiCue): void;
  onChange(open: boolean): void;
  pickBuild(kind: BuildKind): void;
  /** Is the keyboard what the player last used? Then an opened card takes the keyboard's focus. */
  keyboard?(): boolean;
  /** Sunup: the last morning card, to pin on the board (round 7: it showed for a few seconds and was gone). */
  lastCard?(): { title: string; news: string } | null;
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
    // The board's notes scroll inside it; a fade at the foot says there is more below until the end is reached.
    const atEnd = () => toggle(this.body, 'end', this.body.scrollTop + this.body.clientHeight >= this.body.scrollHeight - 4);
    this.body.addEventListener('scroll', atEnd, { passive: true });
    new ResizeObserver(atEnd).observe(this.body);
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

  /**
   * The lesson pointer asks before it builds: what it costs, what it does,
   * and the coins in hand. One build, once, on yes.
   */
  confirmBuild(kind: BuildKind, coins: number, onYes: () => void): void {
    const s = this.host.state();
    const name = kind === 'sprinkler' ? 'sprinkler' : 'scarecrow';
    const does = kind === 'sprinkler' ? sprinklerWords(s) : scarecrowWords(s);
    this.ask(`Build a ${name}?`, 'build', `${BUILD_COST[kind]} coins. ${does}. You have ${fmt(coins)}.`, `Build for ${BUILD_COST[kind]}`, onYes);
  }

  /**
   * The sleep question (round 7: before evening it always asks; at any hour while the night would cost something).
   * Short: the hour, and the one thing most at stake (it ran 18 words over three sentences).
   */
  confirmSleep(minute: number, onYes: () => void, why: SleepWhy = {}): void {
    this.ask('Sleep now?', 'sleep', sleepText(minute, why), 'Sleep', onYes);
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
    // Sunup: the Fields tab comes with the field lesson (or a field bought by tapping it), the Seeds tab with the first
    // turn of a season: nothing on the board before its lesson.
    if (knows('fields') || (homestead(s) && s.parcels.filter((p) => p.owned).length > 1)) tabs.push(['fields', 'Fields']);
    if (knows('seedtab')) tabs.push(['seeds', 'Seeds']);
    if (knows('smith')) tabs.push(['tools', 'Smith']);
    if (knows('build')) tabs.push(['builds', 'Builds']);
    if (s.rules.crew === 'crew') tabs.push(['crew', 'Crew']);
    if (s.rules.goal === 'orders') tabs.push(['market', 'Market']);
    if (!homestead(s)) tabs.push(['milestones', s.rules.goal === 'almanac' ? 'Almanac' : 'Milestones']);
    if (!tabs.length) tabs.push(['fields', 'Fields']);
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
        // What is on the board now has been read: the badge counts only notes pinned after this.
        if (homestead(s) && s.orders.some((o) => o.seen === false)) this.host.send({ type: 'readBoard' });
        // Round 8: what is on offer comes first, the pair and what makes it a choice at the top (on a phone the
        // clash line sat below the fold, under the requests already taken); then the last morning card, pinned here
        // to read again (round 7), the reputation, and the requests taken.
        const shown = new Set<number>();
        let paired = false;
        const offers = s.orders.filter(offered);
        for (const o of offers) {
          if (shown.has(o.id)) continue;
          shown.add(o.id);
          const mate = o.pair !== undefined ? offers.find((q) => q !== o && q.pair === o.pair && !shown.has(q.id)) : undefined;
          if (mate) {
            shown.add(mate.id);
            paired = true;
            const pair = el('div', 'pair');
            pair.append(this.requestNote(s, o), el('div', 'or', 'or'), this.requestNote(s, mate));
            list.append(pair);
            // Round 7: what makes them a choice, plainly ("Both need 20 plots. You have 14.").
            const clash = clashOf(s, o, mate);
            if (clash) list.append(el('p', 'clash', clashWords(clash)));
          } else list.append(this.requestNote(s, o));
        }
        if (offers.length) list.append(el('p', 'legend', paired ? 'Accept one of a pair.' : 'Accept a request to take it on.'));
        const card = this.host.lastCard?.();
        if (card) list.append(el('div', 'morning', `<b>${esc(card.title)}</b>${esc(card.news)}`));
        list.append(el('p', 'legend', smithLine(s)));
        if (!s.orders.length) list.append(el('p', 'legend', 'More requests come with the mornings.'));
        const taken = s.orders.filter((o) => !offered(o));
        for (const o of taken) list.append(this.requestNote(s, o));
        // (Round 8: it said "The crate keeps what requests need", but every crop pays at the crate at once.)
        if (taken.length && !offers.length) list.append(el('p', 'legend', 'A request pays its gain once filled.'));
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
        list.append(el('p', 'legend', `Tools cost coins and reputation. Yours is ${repText(s)}.`));
        for (const t of ['can', 'hoe'] as const) {
          const level = s.tools[t];
          const now = level === 0 ? (t === 'can' ? 'Watering can' : 'Hoe') : TOOL_UPGRADES[t][level - 1].name;
          const next = TOOL_UPGRADES[t][level];
          // Round 8: a whole row of a field, then two rows (they were three plots in a row and a three by three square).
          const what = (l: number) => (l === 1 ? 'a whole row' : 'two rows');
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
   * One request's note. An offer headlines its gain over market ("+195"),
   * then what it wants and for whom, what to sow and by when ("Sow 6 today,
   * seed 270"), and when it is ripe and due, with the days to spare ("Ripe in
   * 7 days, due Summer 7, no day to spare"), and an Accept stamp (dashed, with
   * what it needs, when it cannot be met now). A taken note says what is
   * growing for it and in the crate, and when it is wanted.
   */
  private requestNote(s: WorldState, o: Order): HTMLElement {
    const it = o.items[0];
    const d = CROPS[it.crop];
    const toSow = stillToSow(s, o);
    const t = noteText(s, o);
    const lines = `<b${offered(o) ? ' class="gain"' : ''}>${keepWhole(t.head)}</b>${t.lines.map((l, i) => `<span${i === 1 && t.need ? ' class="need"' : i === t.lines.length - 1 ? ' class="when"' : ''}>${keepWhole(l)}</span>`).join('')}`;
    const note = el('div', `item req${offered(o) ? ' offer' : ' taken'}${isShort(s, o) ? ' short' : ''}`, `<span class="blob">${cropArt(it.crop)}</span><span class="tx">${lines}</span>`);
    note.dataset.crop = it.crop;
    note.dataset.id = String(o.id);
    if (offered(o)) {
      const why = whyNot(s, o);
      const b = el('button', 'btn primary accept', why === 'coins' ? `Need ${fmt(toSow * d.seed)}` : why === 'soil' ? 'No room' : why === 'late' ? 'Too late' : 'Accept');
      b.disabled = !!why;
      b.onclick = () => {
        this.host.send({ type: 'accept', id: o.id });
        this.host.cue('order');
        setTimeout(() => this.refresh(), 0);
      };
      note.append(b);
    } else if (isTaken(o) && canDeliver(s, o)) {
      const b = el('button', 'btn primary', 'Deliver');
      b.dataset.deliver = String(o.id);
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
    // Buying it should leave coins to sow it: the card says when it would not.
    const left = s.coins - p.price;
    const seed = homestead(s) && left >= 0 && left < 150 ? ` That leaves ${fmt(left)} for seed.` : '';
    const known = s.rep < rep ? ` The land agent sells it to farmers with reputation ${rep}. Yours is ${repText(s)}.` : ` You have ${fmt(s.coins)} coins.${seed}`;
    // Round 8: the second field comes with the copper can, and its card says so.
    const can = homestead(s) && s.tools.can < 1 && s.parcels.filter((q) => q.owned).length === 1 ? ' A copper can comes with it: it waters a whole row.' : '';
    this.body.append(el('p', '', `${homestead(s) ? 'Four by four, meadow now. Hoe it to plant.' : 'Four by four, meadow now. Rich soil that has not been farmed.'}${can}${known}`));
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

/**
 * The words on a request's note. An offer headlines its gain over market
 * ("+195 over market"), then what it wants and for whom, what to sow and by
 * when ("Sow 6 today, seed 270"), and when it is ripe and due, with its days
 * to spare ("Ripe in 7 days, due Summer 7, no day to spare"). A taken one
 * says what is growing for it and in the crate, and when it is wanted.
 */
export function noteText(s: WorldState, o: Order): { head: string; lines: string[]; need: boolean } {
  const it = o.items[0];
  const d = CROPS[it.crop];
  const name = it.n === 1 ? d.name.toLowerCase() : d.plural;
  const gain = gainOf(o);
  const toSow = stillToSow(s, o);
  const sowBy = sowByOf(o);
  const who = townName(o.who);
  const spare = slackOf(o);
  const slack = spare <= 0 ? 'no day to spare' : spare === 1 ? 'a day to spare' : `${spare} days to spare`;
  const when = sowBy <= s.day ? 'today' : `by ${dayName(s, sowBy)}`;
  if (offered(o)) {
    // (Round 7: what is already planted for it since it was pinned says so: "15 sunflowers... Plant 9" did not.)
    const sown = it.n - toSow;
    const need = toSow > 0 ? `${sown > 0 ? `${sown} planted, plant ${toSow} more` : `Plant ${toSow}`} ${when}, seed ${fmt(toSow * d.seed)}` : `Wanted by ${dayName(s, o.due)}`;
    return { head: `+${fmt(gain)} over market`, lines: [`${it.n} ${name} for ${who}`, need, `Ripe in ${d.days} days, due ${dayName(s, o.due)}, ${slack}`], need: toSow > 0 };
  }
  // Taken: what is growing for it and in the crate (the fifth playtest's note said "0 of 9 in the crate" while nine
  // were growing for it), or what is still to sow.
  // Round 6: only crops sown for it count, so these are its own, and what took any of them says so.
  const p = requestProgress(s, o);
  const more = plantedFor(s, o) > 0 ? ' more' : '';
  // Round 7: a taken request can be planted (or replanted after a loss) until its last day for it; one that can no
  // longer be met in full says what can still come and what it will pay for it.
  const last = lastSowOf(o);
  const lastWhen = last <= s.day ? 'today' : `by ${dayName(s, last)}`;
  const short = isShort(s, o);
  const coming = requestHave(s, o);
  const need = short ? `${coming} of ${it.n} can come, pays ${fmt(partPay(o, coming))}` : toSow > 0 && s.day <= last ? `Plant ${toSow}${more} ${s.day <= sowBy ? when : lastWhen}, seed ${fmt(toSow * d.seed)}` : '';
  const lost = (Object.entries(o.lost ?? {}) as [LossCause, number][]).filter(([, n]) => n > 0).map(([c, n]) => `${n} lost to ${LOSS_WORD[c]}`);
  const have = [p.growing ? `${p.growing} growing` : '', p.crate ? `${p.crate} in the crate` : '', ...lost].filter(Boolean).join(', ');
  const wanted = have ? `${have[0].toUpperCase()}${have.slice(1)}, wanted by ${dayName(s, o.due)}` : `Wanted by ${dayName(s, o.due)}`;
  return { head: `${it.n} ${name}`, lines: [`For ${who}, +${fmt(gain)} over market`, ...(need ? [need] : []), wanted], need: !!need && !short };
}

/** What makes a pair a choice, in eight words or fewer ("Both need 20 plots. You have 14."). */
export function clashWords(c: { kind: 'soil' | 'coins'; need: number; have: number }): string {
  return c.kind === 'soil' ? `Both need ${c.need} plots. You have ${c.have}.` : `Both need ${fmt(c.need)} of seed. You have ${fmt(c.have)}.`;
}

/** What the sleep question can name: what is left on the farm, a flock day, and planting a request still needs today. */
export interface SleepWhy {
  ripe?: number;
  thirsty?: number;
  bugs?: number;
  crows?: number;
  flock?: boolean;
  owed?: number;
}

/**
 * The sleep question's words: the hour, and the one thing most at stake, in
 * ten words or fewer ("It is 3:27 pm. Bugs left on crops spread tonight.").
 */
export function sleepText(minute: number, why: SleepWhy = {}): string {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const at = `It is ${clock(minute)}.`;
  if (why.flock) return `${at} Crows still to come will take crops.`;
  if (why.crows) return `${at} ${why.crows === 1 ? 'A crow will take its crop.' : 'Crows will take their crops.'}`;
  if (why.bugs) return `${at} Bugs left on crops spread tonight.`;
  if (why.owed) return `${at} A request needs ${why.owed} more planted today.`;
  if (why.thirsty) return `${at} ${n(why.thirsty, 'crop is', 'crops are')} still thirsty.`;
  if (why.ripe) return `${at} ${n(why.ripe, 'crop is', 'crops are')} ripe to pick.`;
  return at;
}

/** What took a crop, after "lost to". */
const LOSS_WORD: Record<LossCause, string> = { crows: 'crows', bugs: 'bugs', dry: 'a dry night', heat: 'the heat', turn: 'the turn' };

/**
 * A note's line as HTML, its phrases kept whole: a narrow note breaks between
 * them, never inside one ("no / day to spare", "4 days to / go").
 */
export function keepWhole(line: string): string {
  return esc(line).replace(/(\+[\d,]+ over market|[Pp]lant \d+(?: more)? (?:today|by tomorrow|by [A-Z][a-z]+ \d+)|\d+ of \d+ can come|pays [\d,]+|Sow \d+(?: more)? (?:today|by tomorrow|by [A-Z][a-z]+ \d+)|seed [\d,]+|Ripe in \d+ days?|[Dd]ue (?:tomorrow|[A-Z][a-z]+ \d+)|(?:no|a|\d+) days? to spare|[Ww]anted by (?:tomorrow|[A-Z][a-z]+ \d+)|\d+ (?:growing|in the crate|lost to (?:crows|bugs|a dry night|the heat|the turn)))/g, '<span class="nw">$1</span>');
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
  // Round 7: every tool still to come counts, not only the next of each ("Reputation 3. The smith will make anything."
  // was wrong: the gold ones want 6 and 8).
  const next = (['hoe', 'can'] as const)
    .filter(has)
    .flatMap((t) => TOOL_UPGRADES[t].slice(s.tools[t]).map((u) => ({ t, u })))
    .filter((x) => x.u.rep > s.rep)
    .sort((a, b) => a.u.rep - b.u.rep)[0];
  const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  const n = (k: number) => words[k] ?? String(k);
  // The smith is not named before his lesson.
  if (homestead(s) && !s.learn.includes('smith')) return `Reputation ${repText(s)}. Each request filled adds one.`;
  if (!next) return `Reputation ${repText(s)}. The smith will make anything.`;
  // Round 8: requests still to fill: a share of a point earned counts towards the next.
  const left = Math.max(1, Math.ceil(next.u!.rep - s.rep - (s.repPart ?? 0) - 1e-9));
  return `Reputation ${repText(s)}. ${n(left)} more for a ${next.u!.name.toLowerCase()}.`;
}

/** Round 8: the farm's reputation as the board says it, a share of a point in quarters ("2¾"). */
export function repText(s: WorldState): string {
  return `${s.rep}${repShare(s.repPart ?? 0)}`;
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
