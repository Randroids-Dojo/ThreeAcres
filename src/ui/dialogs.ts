// Modal cards: the notice board (fields, seeds, builds, crew, market,
// milestones), the end of an almanac season, and a for-sale field.
// The farm pauses while one is open.

import { cropArt } from './crops-art';
import type { UiCue } from '../contract';
import { fieldPrice, fieldRep, homestead, marketPrice, priceOf } from '../sim/actions';
import type { Command } from '../sim/commands';
import { BUILD_COST, CAN_WATER, HAND_HIRE, HAND_WAGE, HANDS_MAX, SPRINKLER_MORNINGS, TOOL_UPGRADES } from '../sim/constants';
import { CROP_IDS, CROPS, inSeason } from '../sim/crops';
import { clashOf, clearOf, fairChances, fairNow, forFair, isShort, lastSowOf, MILESTONES, offered, plantedFor, requestHave, requestProgress, shortClear, slackOf, sowByOf, stillToSow, stockCount, tradeOf, whyNot } from '../sim/goals';
import { dayOfSeason, season, SEASON_NAMES } from '../sim/world';
import type { BuildKind, CropId, FairResult, LossCause, Order, RequestFail, WorldState } from '../sim/types';
import { clock, el, esc, fmt, toggle } from './dom';
import { repShare, townName } from './describe';
import { icon } from './icons';

export { shortClear };

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
  /** Sunup, round 9: the board is being read: offers that no longer fit the farm are made again to fit it, at once. */
  freshen?(): void;
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

  /** Round 10: the fair's card, the morning after it: the ribbon or the miss, and why. */
  fair(r: FairResult): void {
    const s = this.host.state();
    const c = fairCard(s, r);
    this.show(c.title, 'fair');
    this.body.innerHTML = '';
    if (r.won) this.body.append(el('div', 'ribbon', `<span class="ic">${icon('starFill')}</span>`));
    // One note, the result first in bold, then why, then what the next fair wants.
    this.body.append(el('p', 'fairp', c.lines.map((l, i) => (i ? esc(l) : `<b>${esc(l)}</b>`)).join('<br>')));
    const row = el('div', 'row ask');
    const ok = el('button', 'btn primary', esc(c.button));
    const go = () => this.close();
    ok.onclick = go;
    row.append(ok);
    this.body.append(row);
    this.yes = go;
    this.focusIn(ok);
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
        // Round 9: an offer that no longer fits the farm (seed sown since, coins spent on a field) is made again to fit
        // it before the board shows it, so no side is ever stamped "No room" or "Need 60".
        if (homestead(s)) this.host.freshen?.();
        // What is on the board now has been read: the badge counts only notes pinned after this.
        if (homestead(s) && s.orders.some((o) => o.seen === false)) this.host.send({ type: 'readBoard' });
        // Round 8: what is on offer comes first, the pair and what makes it a choice at the top (on a phone the
        // clash line sat below the fold, under the requests already taken); then the last morning card, pinned here
        // to read again (round 7), the reputation, and the requests taken.
        const shown = new Set<number>();
        const offers = s.orders.filter(offered);
        for (const o of offers) {
          if (shown.has(o.id)) continue;
          shown.add(o.id);
          const mate = o.pair !== undefined ? offers.find((q) => q !== o && q.pair === o.pair && !shown.has(q.id)) : undefined;
          if (mate) {
            shown.add(mate.id);
            const pair = el('div', 'pair');
            pair.append(this.requestNote(s, o), el('div', 'or', 'or'), this.requestNote(s, mate));
            list.append(pair);
            // Round 7: what makes them a choice, plainly ("Both need 20 plots. You have 14.").
            const clash = clashOf(s, o, mate);
            if (clash) list.append(el('p', 'clash', clashWords(clash)));
          } else list.append(this.requestNote(s, o));
        }
        // Round 10: one request alone says why; and any offer can be let go with Pass, a fresh pair coming tomorrow
        // (the tenth playtest's untaken Summer 1 offer blocked the board for four days).
        const why = offerWhyWords(s);
        if (why) list.append(el('p', 'legend', esc(why)));
        // (Not on the first pair: Accept is taught first, and Pass comes once a request has been taken.)
        if (offers.length && s.fair !== undefined) {
          const row = el('div', 'row passrow');
          const pass = el('button', 'btn pass', 'Pass');
          pass.title = 'Let these go. New requests come tomorrow';
          pass.onclick = () => {
            this.host.send({ type: 'pass' });
            this.host.cue('close');
            setTimeout(() => this.refresh(), 0);
          };
          row.append(el('span', 'legend', offers.length > 1 ? 'Accept one, or pass.' : 'Accept it, or pass.'), pass);
          list.append(row);
        }
        // Round 9: the season's fair. Round 10: in one line (the board stacked six notes around one request: the
        // fair, its prize, the morning card again, reputation and the crate's rule).
        const fl = fairLines(s)[0];
        if (fl) list.append(el('p', 'legend fairline', esc(fl)));
        const taken = s.orders.filter((o) => !offered(o));
        for (const o of taken) list.append(this.requestNote(s, o));
        // Until the first is filled: which crops count (round 11: a crop planted before Accept does not, and picking one
        // under the deliver line looked like a bug), and how a request is handed over (no stamp to find).
        if (taken.length && s.rep === 0 && !(s.repPart ?? 0)) {
          list.append(el('p', 'legend', 'Only what you plant after Accept counts.'));
          if (!offers.length) list.append(el('p', 'legend', 'The crate ships a request when it is all in.'));
        }
        break;
      }
      case 'fields':
        for (const p of s.parcels) {
          // The price is on the stamp only; a field the land agent will not sell yet says the reputation it wants.
          const rep = fieldRep(s, p.id);
          // A field that wants more reputation shows its price in its words (the stamp shows the reputation).
          // Round 9: a fair's prize takes a fifth off the next field, and its card says so.
          const price = fieldPrice(s, p.id);
          const off = price < p.price && s.parcels.find((q) => !q.owned) === p ? '. The fair’s prize: a fifth off' : '';
          const it = el('div', `item ${p.owned ? 'done' : ''}`, `<span class="ic">${icon('leaf')}</span><span class="tx"><b>Field ${p.id + 1}</b><span>${p.owned ? 'Yours' : s.rep < rep ? `Four by four, meadow, ${fmt(price)} coins. Sold at reputation ${rep}` : `Four by four, meadow${off}`}</span></span>`);
          if (!p.owned) {
            const short = s.coins < price || s.rep < rep;
            const b = el('button', 'btn primary', s.rep < rep ? `Reputation ${rep}` : short ? `Need ${fmt(price)}` : `Buy for ${fmt(price)}`);
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
          const it = el('div', `item ${locked ? 'done' : ''}`, `<span class="blob">${cropArt(d.id)}</span><span class="tx"><b>${d.name}</b><span>Seeds ${d.seed}, ripe in ${d.days} days${d.regrow ? `, again every ${d.regrow}` : ''}, sells for ${marketPrice(s, c)}. Grows in ${d.seasons.map((n) => SEASON_NAMES[n].toLowerCase()).join(' and ')}${off ? ', not now' : ''}</span></span>`);
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
    // Round 9: an offer's lines each have their place, the same on both notes of a pair: what it clears, its plots and
    // days, what and for whom, what to plant, when it is due (and whether that is in time for the fair).
    const cls = (i: number) => (t.cls ? t.cls[i] ?? '' : i === 1 && t.need ? 'need' : i === t.lines.length - 1 ? 'when' : '');
    // Round 11: the headline figure wears the coin, as the coin box does (the first board's "+120" had no mark); a taken
    // request that can still count for the fair wears the fair's star.
    const mark = offered(o) ? `<span class="ic cm">${icon('coin')}</span>` : forFair(s, o) ? `<span class="ic fairmark" title="Counts for the fair">${icon('starFill')}</span>` : '';
    const lines = `<b${offered(o) ? ' class="gain"' : ''}>${mark}${keepWhole(t.head)}</b>${t.lines.map((l, i) => `<span${cls(i) ? ` class="${cls(i)}"` : ''}>${keepWhole(l)}</span>`).join('')}`;
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
    }
    // (Round 9: no Deliver stamp: the crate hands a request over the moment all of it is in.)
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
    const price = fieldPrice(s, id);
    const left = s.coins - price;
    const seed = homestead(s) && left >= 0 && left < 150 ? ` That leaves ${fmt(left)} for seed.` : '';
    const known = s.rep < rep ? ` The land agent sells it to farmers with reputation ${rep}. Yours is ${repText(s)}.` : ` You have ${fmt(s.coins)} coins.${seed}`;
    // Round 8: the second field comes with the copper can, and its card says so.
    const can = homestead(s) && s.tools.can < 1 && s.parcels.filter((q) => q.owned).length === 1 ? ' A copper can comes with it: it waters a whole row.' : '';
    // Round 11: a farm of five or six fills the market: the card says so before it is bought.
    const owned = s.parcels.filter((q) => q.owned).length;
    const full = homestead(s) && owned >= 4 ? ` With ${owned === 4 ? 'five' : 'six'} fields the crate pays ${owned === 4 ? 'a tenth' : 'a fifth'} less for what is not for a request.` : '';
    this.body.append(el('p', '', `${homestead(s) ? 'Four by four, meadow now. Hoe it to plant.' : 'Four by four, meadow now. Rich soil that has not been farmed.'}${can}${full}${known}`));
    const row = el('div', 'row ask');
    const short = s.coins < price || s.rep < rep;
    const buy = el('button', 'btn primary', s.rep < rep ? `Reputation ${rep}` : short ? `Need ${fmt(price)}` : `Buy for ${fmt(price)}`);
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
export function noteText(s: WorldState, o: Order): { head: string; lines: string[]; need: boolean; cls?: string[] } {
  const it = o.items[0];
  const d = CROPS[it.crop];
  const name = it.n === 1 ? d.name.toLowerCase() : d.plural;
  const toSow = stillToSow(s, o);
  const sowBy = sowByOf(o);
  const who = townName(o.who);
  const spare = slackOf(o);
  const slack = spare <= 0 ? 'no day to spare' : spare === 1 ? 'a day to spare' : `${spare} days to spare`;
  const when = sowBy <= s.day ? 'today' : `by ${dayName(s, sowBy)}`;
  if (offered(o)) {
    // Round 9: what it clears in all (pay less seed), and the plots and days it ties up, so the two of a pair read as a
    // trade at a glance ("+415 over market" put the bigger number on the bold side nearly every time). Nothing planted
    // before Accept counts, so there is no "16 planted" any more.
    const tr = tradeOf(o);
    // (Round 11: beans and strawberries pick again: the note says so. Round 12: and that they hold their plots to the
    // season's end, which "for 4 plots, 5 days, picks again" never said.)
    const plotWord = `${tr.plots} ${tr.plots === 1 ? 'plot' : 'plots'}`;
    const lines = [d.regrow ? `for ${plotWord} all season, picks again` : `for ${plotWord}, ${tr.days} ${tr.days === 1 ? 'day' : 'days'}`, `${it.n} ${name} for ${who}`, `Plant ${when}, seed ${fmt(toSow * d.seed)}`, `Due ${dayName(s, o.due)}, ${slack}`];
    const cls = ['trade', 'what', 'need', 'when'];
    // While the season's fair still wants requests, each offer says whether it can count for it.
    const label = fairLabel(s, o);
    if (label) {
      lines.push(label.text);
      cls.push(label.now ? 'fair' : 'fair late');
    }
    return { head: `+${fmt(tr.clear)}`, lines, need: true, cls };
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
  // Round 10: short, it says what can come, and the figure in all is what that brings (the tenth playtest read "+1,615
  // in all" beside "16 of 18 can come, pays 395" as a loss of 1,220).
  const need = short ? `${coming} of ${it.n} can come` : toSow > 0 && s.day <= last ? `Plant ${toSow}${more} ${s.day <= sowBy ? when : lastWhen}, seed ${fmt(toSow * d.seed)}` : '';
  // Round 10: losses never count past the request's own count ("1 growing, 5 lost to the heat" on a request for 5).
  let room = Math.max(0, it.n - p.growing - p.crate);
  const lost = (Object.entries(o.lost ?? {}) as [LossCause, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => {
      const k = Math.min(n, room);
      room -= k;
      return k > 0 ? `${k} lost to ${LOSS_WORD[c]}` : '';
    });
  const have = [p.growing ? `${p.growing} growing` : '', p.crate ? `${p.crate} in the crate` : '', ...lost].filter(Boolean).join(', ');
  const wanted = have ? `${have[0].toUpperCase()}${have.slice(1)}, wanted by ${dayName(s, o.due)}` : `Wanted by ${dayName(s, o.due)}`;
  // Round 9: the same figure the offer was read by: what it clears in all.
  return { head: `${it.n} ${name}`, lines: [`For ${who}, +${fmt(short ? shortClear(o, coming) : clearOf(o))} in all`, ...(need ? [need] : []), wanted], need: !!need && !short };
}

/**
 * Round 9: the season's fair on the board. Round 10: in one line. Round 11: with what it wants in it: a fair counts only
 * requests taken in its season and filled in full. Round 12: what it counts, in eight words at most ("Fair Autumn 10: 1
 * of 5 filled."; "1 of 5 taken this season, in full." ran to ten words, and its count was of requests filled, not
 * taken). None before the first Accept.
 */
export function fairLines(s: WorldState): string[] {
  const f = s.fair;
  if (!f || !homestead(s)) return [];
  const when = `${SEASON_NAMES[season(f.day)]} ${dayOfSeason(f.day)}`;
  if (s.day < f.start) return [`Fair ${when}: ${f.want} filled, taken in ${SEASON_NAMES[season(f.day)].toLowerCase()}.`];
  if (f.got >= f.want) return [`Fair ${when}: the ribbon is yours.`];
  return [`Fair ${when}: ${f.got} of ${f.want} filled.`];
}

/**
 * Round 10: whether an offer counts for the fair, as its note says it. Round 11: "In time for the fair" while seed sown
 * on the first day it can go in would ripen by its day (round 12: "Plant today for the fair" when only seed sown
 * sooner than its plant-by day would), and "Too late for the fair" beside one that can; null once its ribbon is won, or no crop
 * can ripen by it any more. A request counts only for the fair of the season it is taken in, so there is no "For the
 * autumn fair".
 */
export function fairLabel(s: WorldState, o: Order): { text: string; now: boolean } | null {
  const f = fairNow(s);
  if (!f || !offered(o) || f.got >= f.want) return null;
  if (forFair(s, o)) {
    // Round 12: in time only if planted before its plant-by day, it says by when ("Plant by tomorrow" beside "In time for
    // the fair" was in time only if planted today, and the soil was not free until tomorrow).
    const latest = f.day - CROPS[o.items[0].crop].days;
    if (latest < sowByOf(o)) return { text: latest <= s.day ? 'Plant today for the fair' : `Plant by ${dayName(s, latest)} for the fair`, now: true };
    return { text: 'In time for the fair', now: true };
  }
  return fairChances(s) > 0 ? { text: 'Too late for the fair', now: false } : null;
}

/** Round 10: why the board offers one request today, not a pair, or what comes after a Pass. Empty otherwise. */
export function offerWhyWords(s: WorldState): string {
  const offers = s.orders.filter(offered);
  if (!offers.length) {
    if (s.offerWhy === 'pass') return 'New requests come tomorrow.';
    if (s.offerWhy === 'full') return `${s.orders.length} requests on the go. More come as they are filled.`;
    if (s.offerWhy === 'soil') return 'No free soil for a request today.';
    if (s.offerWhy === 'coins') return 'No seed money for a request today.';
    if (s.offerWhy === 'none') return 'No request fits the farm today. More tomorrow.';
    return s.orders.length ? '' : 'New requests come with the mornings.';
  }
  if (offers.length > 1) return '';
  const c = offers[0].items[0].crop;
  if (s.offerWhy === 'crop') return `One today: only ${CROPS[c].plural} can go in now.`;
  if (s.offerWhy === 'fair') return `One today: only ${CROPS[c].plural} can ripen for the fair.`;
  if (s.offerWhy === 'coins') return 'One today: seed for two costs more than you have.';
  if (s.offerWhy === 'room') return 'One today: no room for two.';
  return '';
}

/** Round 10: the season names in lower case, for the fair's card ("On to summer"). */
const seasonWord = (day: number) => SEASON_NAMES[season(day)].toLowerCase();

/** Round 10: how a request due by the fair was lost, after "1 request was". */
const FAIR_LOSS: Record<RequestFail, string> = { crows: 'lost to crows', bugs: 'lost to bugs', dry: 'lost to dry nights', heat: 'lost to the heat', turn: 'lost at the turn', late: 'planted too late', behind: 'not ripe in time', soil: 'short of room to plant', coins: 'short of seed money', due: 'not picked in time' };

/**
 * Round 10: the fair's night, on a card the next morning: the ribbon or the miss, how many it got, why it fell short,
 * and what the next fair wants, in a few plain lines (the tenth playtest's only sign of a missed fair was one clause
 * of the morning card). `day` is the morning after the fair.
 */
export function fairCard(s: WorldState, r: FairResult, day = s.day): { title: string; lines: string[]; button: string } {
  const held = day - 1;
  const title = `The ${seasonWord(held)} fair`;
  const lines: string[] = [];
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  if (r.won) {
    lines.push('A ribbon for the house.');
    // (Round 11: "4 of 3 requests filled" read oddly.)
    lines.push(r.got > r.want ? `${r.got} requests filled in full. It wanted ${r.want}.` : `All ${r.want} requests filled in full.`);
    // Round 11: with no field to discount, a prize that lasts (the eleventh playtest's ribbons were only decoration).
    if (r.prize === 'pay') lines.push('Its prize: requests pay a tenth more.');
    else if (r.prize === 'field' || (s.fieldOff ?? 0) > 0) lines.push('Its prize: a fifth off the next field.');
  } else {
    lines.push('No ribbon this time.');
    lines.push(`${r.got} of ${r.want} requests filled in full.`);
    // Why, three reasons at most: requests lost, those that came up short, mornings the board had nothing for want of
    // free soil (a farm sown edge to edge), too few taken this season, and those not ready by its day.
    const why: string[] = [];
    if (r.lost) why.push(`${n(r.lost, 'request was', 'requests were')} ${FAIR_LOSS[r.why ?? 'due']}.`);
    if (r.short) why.push(`${n(r.short, 'request', 'requests')} came up short.`);
    if (r.noRoom) why.push(`${n(r.noRoom, 'morning', 'mornings')} had no free soil for a request.`);
    const taken = r.taken ?? 0;
    if (taken < r.want) why.push(`Only ${n(taken, 'request was', 'requests were')} taken this season.`);
    if (r.late) why.push(`${r.late} more ${r.late === 1 ? 'was' : 'were'} not ready by its day.`);
    lines.push(...why.slice(0, 3));
  }
  const f = s.fair;
  if (f && f.day > held) lines.push(`The ${seasonWord(f.day)} fair wants ${f.want}, taken from today.`);
  return { title, lines, button: `On to ${seasonWord(day)}` };
}

/**
 * What makes a pair a choice ("Both need 20 plots. You have 14."). Round 9:
 * the coins as the coin box shows them, and what is ripe beside them ("You
 * have 255, plus 265 ripe."; it said "You have 520" with 255 in the box).
 */
export function clashWords(c: { kind: 'soil' | 'coins'; need: number; have: number; coins?: number; ripe?: number; owed?: number }): string {
  if (c.kind === 'soil') return `Both need ${c.need} plots. You have ${c.have}.`;
  // (Round 11: "Both need 255 of seed" said no coins.)
  if (c.coins === undefined) return `Both need ${fmt(c.need)} coins. You have ${fmt(c.have)}.`;
  return `Both need ${fmt(c.need)} coins. You have ${fmt(c.coins)}${c.ripe ? `, plus ${fmt(c.ripe)} ripe` : ''}${c.owed ? `, ${fmt(c.owed)} owed` : ''}.`;
}

/** What the sleep question can name: what is left on the farm, a flock day, and planting a request still needs today. */
export interface SleepWhy {
  ripe?: number;
  thirsty?: number;
  bugs?: number;
  crows?: number;
  flock?: boolean;
  /** Round 12: about how many crops crows would take tonight (`crowsTonight`): the question gave no size. */
  crowCrops?: number;
  owed?: number;
  /** Round 11: new notes on the board nobody has read: offers go at the next dawn. */
  unread?: number;
}

/**
 * The sleep question's words: the hour, and the one thing most at stake, in
 * ten words or fewer ("It is 3:27 pm. Bugs left on crops spread tonight.").
 */
export function sleepText(minute: number, why: SleepWhy = {}): string {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const at = `It is ${clock(minute)}.`;
  // Round 12: with the size of it ("Crows may take about 7 crops."; a flock night cost 7 crops once, 2 another time).
  if (why.flock) return `${at} ${why.crowCrops === undefined ? 'Crows still to come will take crops.' : why.crowCrops <= 1 ? 'A crow may take a crop.' : `Crows may take about ${why.crowCrops} crops.`}`;
  if (why.crows) return `${at} ${why.crows === 1 ? 'A crow will take its crop.' : `${why.crows} crows will take their crops.`}`;
  if (why.bugs) return `${at} Bugs left on crops spread tonight.`;
  if (why.owed) return `${at} A request needs ${why.owed} more planted today.`;
  if (why.thirsty) return `${at} ${n(why.thirsty, 'crop is', 'crops are')} still thirsty.`;
  if (why.ripe) return `${at} ${n(why.ripe, 'crop is', 'crops are')} ripe to pick.`;
  if (why.unread) return `${at} New requests on the board go at dawn.`;
  return at;
}

/** What took a crop, after "lost to". */
const LOSS_WORD: Record<LossCause, string> = { crows: 'crows', bugs: 'bugs', dry: 'a dry night', heat: 'the heat', turn: 'the turn' };

/**
 * A note's line as HTML, its phrases kept whole: a narrow note breaks between
 * them, never inside one ("no / day to spare", "4 days to / go").
 */
export function keepWhole(line: string): string {
  return esc(line).replace(/(\+[\d,]+ over market|\+[\d,]+ in all|\d+ plots? all season,|\d+ plots?,|\d+ days?$|[Pp]lant (?:\d+(?: more)? )?(?:today|by tomorrow|by [A-Z][a-z]+ \d+)|\d+ of \d+ can come|pays [\d,]+|Sow \d+(?: more)? (?:today|by tomorrow|by [A-Z][a-z]+ \d+)|seed [\d,]+|Ripe in \d+ days?|[Dd]ue (?:tomorrow|[A-Z][a-z]+ \d+)|(?:no|a|\d+) days? to spare|[Ww]anted by (?:tomorrow|[A-Z][a-z]+ \d+)|\d+ (?:growing|in the crate|lost to (?:crows|bugs|a dry night|the heat|the turn)))/g, '<span class="nw">$1</span>');
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
