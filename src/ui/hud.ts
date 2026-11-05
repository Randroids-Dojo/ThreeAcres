// The heads-up display: day card, coins, the goal panel for whichever goal
// rule is on, the info line, the toolbar, touch controls, toasts and
// floating numbers. Rebuilt pieces only when the rules change; text is
// refreshed every frame through setText.

import { cropArt } from './crops-art';
import type { UiCue } from '../contract';
import type { Input } from '../game/input';
import { canAfford, doomedAtTurn, homestead, justInTime, nightsToTurn, resolve, sowing } from '../sim/actions';
import type { Command } from '../sim/commands';
import { BUILD_COST, DAYS_PER_SEASON, FLOW_SPEEDS, HAND_NAMES, TOOL_UPGRADES } from '../sim/constants';
import { CROP_IDS, CROPS, cropWord, QUALITY_NAME } from '../sim/crops';
import { canDeliver, isTaken, lastSowOf, MILESTONES, newRequests, requestHave, stockCount, whyNot } from '../sim/goals';
import { WEATHER_NAMES } from '../sim/weather';
import { dayOfSeason, season, SEASON_NAMES } from '../sim/world';
import { CRATE, propAt } from '../sim/map';
import type { BuildKind, CropId, RequestFail, SimEvent, ToolId, Verb, Weather, WorldState } from '../sim/types';
import { brief, canLevel, describe, denyText, repShare, seedNote, sentence, townName } from './describe';
import { clock, el, esc, fmt, setHtml, setText, toggle } from './dom';
import { icon, type IconId } from './icons';
import { buzz, TouchControls } from './touch';
import { scarecrowWords, sprinklerWords } from './dialogs';


export interface HudHost {
  state(): WorldState;
  send(c: Command): void;
  cue(c: UiCue): void;
  openBoard(tab?: string): void;
  offerParcel(id: number): void;
  project(x: number, y: number, h?: number): { x: number; y: number } | null;
  /** Sleep from the button (asks first before noon). */
  sleep(): void;
  /** Close up or the whole farm (C). */
  toggleCamera(): void;
  /** A tap on the lesson pointer's edge arrow (the chevron over its target takes no taps: the plot under it does its own job). */
  pointerTap(): void;
  input: Input;
}

/** Round 11: taps waiting before the Stop button comes (a tap on the farmer mostly missed him: 0 of 8 at a walk). */
export const STOP_TAPS = 3;

/**
 * Round 11: is the Stop button up? From `STOP_TAPS` taps waiting, and, once up, until they have all gone, so it never
 * slips out from under a thumb on its way to it.
 */
export function stopShown(s: WorldState, was = false): boolean {
  const n = s.taps?.length ?? 0;
  return homestead(s) && (n >= STOP_TAPS || (was && n > 0));
}

/** The most clauses the morning card says (the fourth playtest read four or more, and stopped reading). */
export const MORNING_CLAUSES = 3;

/**
 * Why a request the player took went, in a few words, for the morning card
 * (round 6: "Old Tamsin found lettuces elsewhere" said nothing of the crows
 * that ate them).
 */
export function failWords(why: RequestFail | undefined, lost = 0): string {
  switch (why) {
    case 'crows':
      return `crows ate ${lost}`;
    case 'bugs':
      return `bugs killed ${lost}`;
    case 'dry':
      return `${lost} dried out`;
    case 'heat':
      return `${lost} wilted in the heat`;
    case 'turn':
      return `the turn took ${lost}`;
    case 'late':
      return 'too few planted in time';
    case 'behind':
      // Round 11: all were planted, and a dry night or bugs held them back ("too few planted in time" was wrong).
      return 'not ripe in time';
    case 'soil':
      return 'no room to plant them';
    case 'coins':
      return 'no coins for the seed';
    case 'due':
      return 'not picked in time';
    default:
      return '';
  }
}

/**
 * The morning card's news from the night's report, as one sentence with a
 * capital at its start only ("Old Tamsin paid 145, sold 8 for 340, 6 ripe to
 * pick."). At most three clauses, the most pressing first chosen (what was
 * lost, a request that went, what was paid and sold, what the turn will take,
 * what is ripe, what the crate keeps), then said in reading order. `room`
 * leaves space for a clause said before it ("Summer begins."). Empty when
 * nothing happened worth a card.
 */
export function morningNews(s: WorldState, room = MORNING_CLAUSES, ripeNow?: number): string {
  const r0 = s.report;
  if (!r0) return '';
  // Round 8: the card pinned on the board counts what is ripe now (it said "4 ripe to pick" after they were picked).
  const r = ripeNow === undefined ? r0 : { ...r0, ripe: ripeNow };
  const sold = r.sold.reduce((a, x) => a + x.n, 0);
  const value = r.sold.reduce((a, x) => a + x.value, 0);
  // [priority, reading order, words]: lower priority numbers are kept first.
  const bits: [number, number, string][] = [];
  const filled = r.filled ?? [];
  // Round 7: one short of its count is paid for what it got ("paid 285 for 14 of 15").
  // Round 11: the figure its note said: what it came to in all.
  if (filled.length === 1) bits.push([3, 0, `${esc(townName(filled[0].who))} paid ${fmt(filled[0].clear ?? filled[0].reward)} in all${filled[0].of ? ` for ${filled[0].got} of ${filled[0].of}` : ''}`]);
  else if (filled.length > 1) bits.push([3, 0, `${filled.length} requests paid ${fmt(filled.reduce((a, f) => a + (f.clear ?? f.reward), 0))} in all`]);
  // Round 9: the crate paid as each crop went in, so this is yesterday's ("Sold 4 for 220" read as money still to come).
  if (sold) bits.push([4, -0.5, `yesterday you sold ${sold} for ${fmt(value)}`]);
  // Round 9: the season's fair, judged last night: first of all.
  if (r.fair) bits.push([0.5, -1, r.fair.won ? 'the fair gave you a ribbon' : `no ribbon at the fair, ${r.fair.got} of ${r.fair.want} requests`]);
  // Round 9: new requests on the board say so (the eighth playtest's came with only a badge).
  if (r.offered) bits.push([2.5, 9, r.offered >= 2 ? 'two new requests on the board' : 'a new request on the board']);
  // What was lost, in one clause.
  const lost: string[] = [];
  if (r.eaten) lost.push(`crows ate ${r.eaten}`);
  if (r.withered) lost.push(`${r.withered} withered`);
  if (r.turned) lost.push(`the turn took ${r.turned} green ${r.turned === 1 ? 'crop' : 'crops'}`);
  if (lost.length) bits.push([1, 2, lost.join(' and ')]);
  // A request that ran out of time says so, rather than vanishing from the board; so does one that can no longer be met,
  // each with its cause (round 6).
  // Round 7: a cause the card already names among the losses is not said again ("Crows ate 1, Pell's pickles found
  // sunflowers elsewhere (crows ate 1)").
  const said = (why?: RequestFail) => (why === 'crows' && !!r.eaten) || ((why === 'bugs' || why === 'dry' || why === 'heat') && !!r.withered) || (why === 'turn' && !!r.turned);
  const because = (g: { why?: RequestFail; lost?: number }) => (failWords(g.why, g.lost) && !said(g.why) ? ` (${failWords(g.why, g.lost)})` : '');
  const went = [...(r.lapsed ?? []), ...(r.withdrawn ?? [])];
  const gone = [...(r.lapsed ?? []).map((l) => `${esc(townName(l.who))} gave up on the ${cropWord(l.crop, l.n)}${because(l)}`), ...(r.withdrawn ?? []).map((w) => `${esc(townName(w.who))} found ${cropWord(w.crop, w.n)} elsewhere${because(w)}`)];
  if (gone.length === 1) bits.push([2, 3, gone[0]]);
  else if (gone.length > 1) {
    // Several: one cause for all, when they share one.
    const whys = [...new Set(went.map((g) => g.why))];
    const one = whys.length === 1 && !said(whys[0]) ? failWords(whys[0], went.reduce((a, g) => a + (g.lost ?? 0), 0)) : '';
    bits.push([2, 3, `${gone.length} requests went elsewhere${one ? ` (${one})` : ''}`]);
  }
  // Bugs left on crops overnight spread to their neighbours: the card says how far.
  if (r.spread) bits.push([2, 3.5, `bugs spread to ${r.spread} ${r.spread === 1 ? 'crop' : 'crops'}`]);
  if (r.gift) bits.push([1, 4, `a neighbour left ${fmt(r.gift)} coins for seed`]);
  if (r.worn) bits.push([2, 5, r.worn === 1 ? 'a sprinkler wore out' : `${r.worn} sprinklers wore out`]);
  // The last two mornings of a season: what the turn will take, while there is still time to plan for it. It comes
  // first of all (the fifth playtest's full cards left it out, and the turn took seven beans unannounced).
  if (homestead(s) && nightsToTurn(s.day) <= 2) {
    const doomed = s.plots.filter((p, i) => p.crop && doomedAtTurn(s, i)).length;
    if (doomed) bits.push([0, 6, `${doomed} green ${doomed === 1 ? 'crop' : 'crops'} won\u2019t ripen before ${SEASON_NAMES[(season(s.day) + 1) % 4].toLowerCase()}`]);
  }
  // A flock day says so while there is still the day to watch for them.
  if (r.flock) bits.push([1, 7, 'crows are about today']);
  // A wet morning is planting weather: rain waters what goes in today (round 6: rain days had 6 to 10 seconds of work).
  // (Round 7: only when there is bare soil and the coins for a seed: it came with 0 coins and every plot sown.)
  if (homestead(s) && (s.weather === 'rain' || s.weather === 'storm') && s.learn.includes('seeds') && canPlantNow(s)) bits.push([4.5, 6.5, 'what you plant today needs no water']);
  // What is ripe to pick this morning (Sunup), or, elsewhere, how many crops grew a stage.
  if (r.ripe) bits.push([5, 7, `${r.ripe} ripe to pick`]);
  else if (!homestead(s) && r.grew) bits.push([5, 7, `${r.grew} grew`]);
  for (const k of homestead(s) ? [] : (r.kept ?? [])) bits.push([6, 8, `${k.n} ${cropWord(k.crop, k.n)} kept for a request`]);
  if (r.crewWork) bits.push([6, 9, `the crew did ${r.crewWork} jobs overnight`]);
  if (r.wages) bits.push([6, 10, `wages ${r.wages}`]);
  const kept = bits.map((b, i) => ({ b, i })).sort((x, y) => x.b[0] - y.b[0] || x.i - y.i).slice(0, Math.max(0, room));
  return sentence(kept.sort((x, y) => x.b[1] - y.b[1] || x.i - y.i).map((x) => x.b[2]));
}

/**
 * Round 9: the fair as the day card says it, one quiet line: "Fair Spring 10:
 * 1 of 4" (a ribbon won says so). Empty before there is a fair.
 */
export function fairShort(s: WorldState): string {
  const f = s.fair;
  if (!f) return '';
  const day = `${SEASON_NAMES[season(f.day)]} ${dayOfSeason(f.day)}`;
  if (s.day < f.start) return `Fair ${day}: ${f.want} requests`;
  return f.got >= f.want ? `Fair ${day}: ribbon won` : `Fair ${day}: ${f.got} of ${f.want}`;
}

/** Sunup: crops ripe on the farm right now, to pick. */
export function ripeNow(s: WorldState): number {
  let n = 0;
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (c && !c.dead && c.stage === 4 && s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned) n++;
  }
  return n;
}

/**
 * The morning card as the board keeps it pinned (round 7), read again now:
 * the new season first, if it began today, and what is ripe counted as it is
 * now. Empty when there is nothing left to say.
 */
export function pinnedNews(s: WorldState): string {
  const turn = homestead(s) && dayOfSeason(s.day) === 1 && s.day > 1 ? `${SEASON_NAMES[season(s.day)]} begins.` : '';
  let news = morningNews(s, turn ? MORNING_CLAUSES - 1 : MORNING_CLAUSES, homestead(s) ? ripeNow(s) : undefined);
  if (turn) news = news ? `${turn} ${news}` : turn;
  return news;
}

/**
 * Round 7: what a crop lost by day means for the request it was sown for, in
 * a few words after the loss ("A crow took a sunflower. 14 of 15 can come."):
 * still met in full (a day to replant), short (paid for what comes), or lost.
 */
export function requestAfterLoss(s: WorldState, req: number | undefined): string {
  const o = req !== undefined ? s.orders.find((q) => q.id === req && isTaken(q)) : undefined;
  if (!o) return '';
  const it = o.items[0];
  const have = requestHave(s, o);
  if (have >= it.n) return '';
  if (!whyNot(s, o)) {
    const last = lastSowOf(o);
    return ` Plant ${it.n - have} more ${last <= s.day ? 'today' : last === s.day + 1 ? 'by tomorrow' : `by ${SEASON_NAMES[season(last)]} ${dayOfSeason(last)}`}.`;
  }
  return have > 0 ? ` ${have} of ${it.n} can come.` : '';
}

/** Sunup: is there bare soil and the coins for a seed that can go in today (so a wet morning is planting weather)? */
export function canPlantNow(s: WorldState): boolean {
  const seeds = CROP_IDS.filter((c) => sowing(s.day, c).ok).map((c) => CROPS[c].seed);
  if (!seeds.length || s.coins < Math.min(...seeds)) return false;
  for (let i = 0; i < s.plots.length; i++) {
    const p = s.plots[i];
    if (s.tiles[i] !== 'field' || s.parcelOf[i] < 0 || !s.parcels[s.parcelOf[i]].owned || p.crop || !p.tilled) continue;
    if (!s.builds.some((b) => b.y * s.W + b.x === i)) return true;
  }
  return false;
}

/**
 * Round 7: what a tap on a seed card does. A seed that cannot go in says why
 * in the picker, which stays open, and the seed in hand is kept (a tap on a
 * "Too late" carrot closed the picker with no word, and the next eleven plot
 * taps planted nothing). One that only just ripens before the turn is chosen,
 * with a warning to water it every night.
 */
export function seedTap(s: WorldState, crop: CropId): { ok: boolean; word: string } {
  const d = CROPS[crop];
  if (!homestead(s)) return { ok: true, word: '' };
  const sw = sowing(s.day, crop);
  if (!sw.ok) return { ok: false, word: sw.late ? `${sw.reason}.` : `${d.plural[0].toUpperCase()}${d.plural.slice(1)} grow in ${d.seasons.map((n) => SEASON_NAMES[n].toLowerCase()).join(' and ')}.` };
  if (justInTime(s.day, crop)) return { ok: true, word: `${d.plural[0].toUpperCase()}${d.plural.slice(1)} ripen just before ${SEASON_NAMES[(season(s.day) + 1) % 4].toLowerCase()}. Water every night.` };
  return { ok: true, word: '' };
}

/**
 * The keyboard in a picker: where an arrow key moves the choice among the
 * cards that can be chosen (in reading order, with their places on screen),
 * or which card a number key names. Null when the key does not move it.
 */
export function pickerStep(cards: { id: string; ok: boolean; x: number; y: number }[], current: string, code: string): string | null {
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  if (digit) return cards[Number(digit[1]) - 1]?.id ?? null;
  const ok = cards.filter((c) => c.ok);
  if (!ok.length) return null;
  const at = ok.findIndex((c) => c.id === current);
  if (code === 'ArrowRight' || code === 'ArrowLeft') {
    if (at < 0) return ok[0].id;
    return ok[(at + (code === 'ArrowRight' ? 1 : ok.length - 1)) % ok.length].id;
  }
  if (code === 'ArrowUp' || code === 'ArrowDown') {
    const me = cards.find((c) => c.id === current) ?? ok[0];
    const down = code === 'ArrowDown';
    // The nearest card on the next row up or down, else round to the other end.
    const rows = ok.filter((c) => (down ? c.y > me.y + 4 : c.y < me.y - 4));
    const pool = rows.length ? rows : ok.filter((c) => (down ? c.y < me.y - 4 : c.y > me.y + 4));
    if (!pool.length) return null;
    const rowY = down === !!rows.length ? Math.min(...pool.map((c) => c.y)) : Math.max(...pool.map((c) => c.y));
    const row = pool.filter((c) => Math.abs(c.y - rowY) <= 4);
    return row.reduce((a, b) => (Math.abs(b.x - me.x) < Math.abs(a.x - me.x) ? b : a)).id;
  }
  return null;
}

/**
 * Round 10: the rack's places, in order: each tool keeps its own from the
 * first morning (a peg until its lesson brings it), so a tool that arrives
 * never moves another (Hoe moved into Seeds' place when Build arrived).
 */
export function toolSlots(s: WorldState): ToolId[] {
  const all: ToolId[] = ['hands', 'can', 'seeds', 'hoe', 'build'];
  return homestead(s) ? all : all.filter((t) => t !== 'smart');
}

/**
 * Which pickers are still open after a frame. A picker belongs to its tool:
 * when the tool in hand is not the one it picks for (a tap on a thirsty crop
 * took the can) it is closed, not merely hidden. The sixth playtest's picker
 * hid but stayed open, and an open picker hides the lesson pointer, so the
 * chevron and the edge arrow were gone until Escape, which a phone has not.
 */
export function pickersAfter(open: { seed: boolean; build: boolean }, tool: ToolId, smart: boolean): { seed: boolean; build: boolean } {
  return { seed: open.seed && (smart || tool === 'seeds'), build: open.build && tool === 'build' };
}

/** The lesson pointer aims this high over its tile (a crop's top), and its middle sits this many px above that. */
const POINT_HEIGHT = 0.4;
const POINT_LIFT = 17;
/** Round 11: ms after Stop comes up in which a press on it does nothing (it may have come up under a finger tapping plots). */
const STOP_GRACE = 250;

const WEATHER_ICON: Record<Weather, IconId> = { sun: 'sun', cloud: 'cloud', rain: 'rain', storm: 'storm', heat: 'heat' };
/** One short word for each day of the forecast. */
const FORECAST_WORD: Record<Weather, string> = { sun: 'Sun', cloud: 'Cloud', rain: 'Rain', storm: 'Storm', heat: 'Heat' };
const TOOL_ICON: Record<ToolId, IconId> = { hands: 'hands', hoe: 'hoe', can: 'can', seeds: 'seeds', build: 'build', smart: 'smart' };
const TOOL_NAME: Record<ToolId, string> = { hands: 'Hands', hoe: 'Hoe', can: 'Can', seeds: 'Seeds', build: 'Build', smart: 'Smart' };

export class Hud {
  readonly root = el('div', 'hud');
  private day = el('div', 'daycard');
  private date = el('span', 'date');
  private clockEl = el('span', 'clock');
  private sky = el('div', 'sky');
  private meterRow = el('div');
  /** Round 9: the requests taken, as last seen (a request handed over at its last pick has left the farm by then). */
  private takenSeen = new Map<number, { n: number; crop: CropId; got: number }>();
  /** Round 9: the season's fair, one quiet line under the stamina bar ("Fair Spring 10: 1 of 4"). */
  private fairRow = el('div', 'fairrow');
  private coins = el('div', 'coins');
  private coinsNum = el('span', 'num');
  private goals = el('div', 'goals');
  private info = el('div', 'info empty');
  private toolbar = el('div', 'toolbar');
  private seedbar = el('div', 'seedbar hidden');
  /** A word in the seed picker itself (round 7: "Carrots won't ripen before summer."), so it is never behind it. */
  private pickMsg = el('div', 'pickmsg');
  private pickMsgUntil = 0;
  private buildbar = el('div', 'buildbar hidden');
  private toasts = el('div', 'toasts');
  private boardBtn = el('button', 'btn iconbtn');
  private viewBtn = el('button', 'btn iconbtn viewbtn');
  private fresh = '';
  /** Round 11: Stop, in a fixed slot in the thumb's reach, while taps wait. */
  private stopBtn = el('button', 'btn stopbtn gone', `<span class="ic">${icon('close')}</span><span class="tlbl">Stop</span><span class="kcap">X</span>`);
  /** When Stop last came up: a press in its first moments was meant for the plot under it. */
  private stopSince = 0;
  private topBtns = el('div', 'topbtns');
  private topRight = el('div', 'topright');
  /** Round 11: on touch Board and View stand low, in the thumb's reach (the top right is the hardest reach on a phone). */
  private btnsLow = false;
  private hintEl = el('div', 'hint');
  readonly touch: TouchControls;
  private floaters = el('div', 'floaters');
  /** The lesson's pointer: a cream chevron over what the line is about, or at the screen's edge when it is out of view. */
  // Over a target it is a bobbing chevron; at the screen's edge it sits on a dark disc, so it reads as an arrow and not a figure.
  private pointer = el('div', 'tpoint', '<svg viewBox="-16 -16 32 32"><circle class="disc" r="14.5"/><path d="M-7 -11 L7 0 L-7 11" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  private pointAt: { x: number; y: number } | null = null;
  /** Until when the forecast wears its arrival lift (it came with its lesson). */
  private forecastNew = 0;
  private toolsKey = '';
  private goalsKey = '';
  private meterKey = '';
  private lastCoins = -1;
  private seedOpen = false;
  private buildOpen = false;
  /** A picker is open and on screen (the lesson line steps aside for it). */
  picking = false;
  private lastDeny = { text: '', t: 0 };
  private foldedGoals = false;
  private lastAim: { x: number; y: number } | null = null;
  /** What acting would do now: a verb from the tool, or a word of its own (the notice board). */
  private aimVerb: { verb: Verb | null; ok: boolean; label?: string; icon?: IconId } | null = null;

  constructor(private host: HudHost) {
    this.touch = new TouchControls({
      input: host.input,
      state: host.state,
      aimVerb: () => this.aimVerb,
      water: () => (host.state().tool === 'can' ? canLevel(host.state()) : null),
      cycleTool: () => this.cycleTool(false),
      toolIcon: () => TOOL_ICON[host.state().tool],
      toolName: () => TOOL_NAME[host.state().tool],
      clearJobs: () => {
        host.send({ type: 'cancelJobs' });
        host.cue('close');
      },
    });
    const top = el('div', 'topbar');
    const when = el('div', 'when');
    when.append(this.date, this.clockEl);
    this.day.append(when, this.sky, this.meterRow, this.fairRow);
    this.coins.append(el('span', 'ic', icon('coin')), this.coinsNum);
    const board = this.boardBtn;
    board.innerHTML = `<span class="ic">${icon('board')}</span><span class="tlbl">Board</span><span class="badge"></span><span class="kcap">B</span>`;
    board.title = 'Notice board (B)';
    board.setAttribute('aria-label', 'Notice board');
    board.onclick = () => host.openBoard();
    // The whole farm or close up: C on a keyboard, this button with a mouse.
    const view = this.viewBtn;
    view.innerHTML = `<span class="ic">${icon('view')}</span><span class="tlbl">View</span><span class="kcap">C</span>`;
    view.title = 'Whole farm or close up (C)';
    view.setAttribute('aria-label', 'Whole farm or close up');
    view.onclick = () => host.toggleCamera();
    const stop = this.stopBtn;
    stop.title = 'Stop (X)';
    stop.setAttribute('aria-label', 'Stop: let the waiting taps go');
    stop.addEventListener('pointerdown', (e) => e.stopPropagation());
    stop.onclick = () => {
      if (performance.now() - this.stopSince < STOP_GRACE) return;
      host.send({ type: 'cancelTaps' });
      host.cue('close');
    };
    const btns = this.topBtns;
    btns.append(board, view);
    const right = this.topRight;
    right.append(this.coins, btns);
    top.append(this.day, el('div', 'spacer'), right);

    this.goals.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const deliver = t.closest('[data-deliver]') as HTMLElement | null;
      if (deliver) {
        host.send({ type: 'deliver', id: Number(deliver.dataset.deliver) });
        host.cue('order');
        return;
      }
      if (t.closest('[data-sellspare]')) {
        const st = host.state();
        for (const c of CROP_IDS) if (stockCount(st, c) > 0 && !st.orders.some((o) => o.items.some((it) => it.crop === c))) host.send({ type: 'sell', crop: c });
        host.cue('buy');
        return;
      }
      if (t.closest('h3')) {
        this.foldedGoals = !this.foldedGoals;
        toggle(this.goals, 'folded', this.foldedGoals);
        host.cue('tap');
      }
    });
    toggle(this.goals, 'folded', this.foldedGoals);


    // The edge arrow takes a tap: it walks to what it points at and does the job there (a tap on the ground behind
    // the arrow would walk somewhere else). The chevron over a target in view takes none: a tap there lands on the
    // farm, so only a tap inside the target tile is a tap on the pointer (the fifth playtest's chevron, drawn half a
    // tile up, took taps meant for the plot behind it).
    this.pointer.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.pointAt || !this.pointer.classList.contains('on') || this.pointer.classList.contains('over')) return;
      host.pointerTap();
      host.cue('tap');
    });
    this.pointer.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.append(top, this.goals, this.info, this.seedbar, this.buildbar, this.toolbar, this.hintEl, this.touch.el, this.stopBtn, this.pointer, this.toasts, this.floaters);
  }

  // ------------------------------------------------------------ per frame

  update(aim: { x: number; y: number } | null): void {
    const s = this.host.state();
    this.updateDay(s);
    this.updateCoins(s);
    this.updateGoals(s);
    this.updateTools(s);
    // Round 11: a run of taps can be let go with Stop, while they wait (the tenth playtest's 31 planting taps hoed
    // instead, with no way to cancel them; tapping the farmer, at a walk, mostly missed).
    const was = !this.stopBtn.classList.contains('gone');
    const up = stopShown(s, was);
    if (up && !was) this.stopSince = performance.now();
    if (up !== was) toggle(this.stopBtn, 'gone', !up);
    this.updateInfo(s, aim);
    this.updatePointer();
    this.touch.update();
    if (homestead(s) && this.touch.shown !== this.btnsLow) {
      this.btnsLow = this.touch.shown;
      (this.btnsLow ? this.root : this.topRight).append(this.topBtns);
    }
    setText(this.hintEl, this.lessonLine);
    toggle(this.hintEl, 'on', !!this.lessonLine);
    toggle(this.info, 'quiet', !!this.lessonLine);
  }

  private updateDay(s: WorldState): void {
    const sn = season(s.day);
    // Round 7: the season's length is on screen ("Spring 7 of 10"; nine lettuces planted at 6 pm were lost at the turn).
    setHtml(this.date, homestead(s) ? `${SEASON_NAMES[sn]} ${dayOfSeason(s.day)} <span class="of">of ${DAYS_PER_SEASON}</span>` : `${SEASON_NAMES[sn]} ${dayOfSeason(s.day)}`);
    setText(this.clockEl, s.rules.clock === 'turns' ? `${s.ap} of ${s.apMax} moves` : clock(s.minute));
    const wild = s.rules.weather === 'wild';
    // The next three days, read as a sentence: "Sunny, then rain, sun, cloud".
    // Each day of the forecast wears its word under its picture.
    const fc = wild && this.knows(s, 'forecast') ? `<span class="fc${this.forecastNew > performance.now() ? ' new' : ''}" title="The next three days: ${s.forecast.map((w) => WEATHER_NAMES[w].toLowerCase()).join(', ')}"><span class="then">then</span>${s.forecast.map((w) => `<span class="fd"><span class="ic">${icon(WEATHER_ICON[w])}</span><span class="fl">${FORECAST_WORD[w]}</span></span>`).join('')}</span>` : '';
    setHtml(this.sky, `<span class="ic">${icon(WEATHER_ICON[s.weather])}</span><span>${WEATHER_NAMES[s.weather]}</span>${fc}`);

    const key = s.rules.clock;
    if (key !== this.meterKey) {
      this.meterKey = key;
      this.meterRow.innerHTML = '';
      if (key === 'day') {
        // Labelled, so the bar says what it is: the work left in you today.
        this.meterRow.classList.add('stamina');
        this.meterRow.title = 'Stamina: every job uses a little. Sleep to fill it.';
        this.meterRow.append(el('span', 'mlbl', 'Stamina'), el('div', 'meter', '<i></i>'));
      }
      else if (key === 'turns') this.meterRow.append(el('div', 'pips'));
      else {
        const sp = el('div', 'speed');
        for (const v of FLOW_SPEEDS) {
          const b = el('button', '', v === 0 ? `<span class="ic">${icon('pause')}</span>` : `${v}x`);
          b.dataset.speed = String(v);
          b.title = v === 0 ? 'Pause (P)' : `${v}x speed`;
          b.onclick = () => {
            this.host.send({ type: 'speed', speed: v });
            this.host.cue('toggle');
          };
          sp.append(b);
        }
        this.meterRow.append(sp);
      }
    }
    toggle(this.meterRow, 'gone', key === 'day' && !this.knows(s, 'stamina'));
    for (const o of s.orders) if (isTaken(o)) this.takenSeen.set(o.id, { n: o.items[0].n, crop: o.items[0].crop, got: o.got ?? 0 });
    // Round 9: the fair's line arrives with its lesson.
    const fair = homestead(s) && this.knows(s, 'fair') ? fairShort(s) : '';
    toggle(this.fairRow, 'gone', !fair);
    setHtml(this.fairRow, fair ? `<span class="ic">${icon('starFill')}</span><span>${esc(fair)}</span>` : '');
    if (key === 'day') {
      const m = this.meterRow.querySelector('.meter') as HTMLElement;
      const f = s.stamina / s.staminaMax;
      (m.firstElementChild as HTMLElement).style.width = `${Math.round(f * 100)}%`;
      toggle(m, 'low', f < 0.2);
    } else if (key === 'turns') {
      const reserved = s.jobs.length;
      let h = '';
      for (let i = 0; i < s.apMax; i++) h += i < s.ap - reserved ? '<i></i>' : i < s.ap ? '<i class="held"></i>' : '<i class="used"></i>';
      setHtml(this.meterRow.firstElementChild!, h);
    } else {
      for (const b of this.meterRow.querySelectorAll<HTMLElement>('button')) toggle(b, 'on', Number(b.dataset.speed) === s.speed);
    }
  }

  private updateCoins(s: WorldState): void {
    toggle(this.coins, 'gone', !this.knows(s, 'coins'));
    toggle(this.boardBtn, 'gone', !this.knows(s, 'board'));
    // The whole farm or close up, once its lesson has come: C on a keyboard, the View button for a mouse or a finger
    // (a phone's close view sees about two fields, so a crow in the first can hide off screen).
    toggle(this.viewBtn, 'gone', !this.knows(s, 'wide'));
    toggle(this.viewBtn, 'on', s.rules.camera === 'wide');
    // Only new notes: requests pinned since the board was last read (it counted every open note, read or not).
    const fresh = homestead(s) ? newRequests(s) : 0;
    setText(this.boardBtn.querySelector('.badge')!, fresh ? String(fresh) : '');
    setText(this.coinsNum, fmt(s.coins));
    if (this.lastCoins >= 0 && s.coins > this.lastCoins) {
      this.coins.classList.remove('bump');
      void this.coins.offsetWidth;
      this.coins.classList.add('bump');
    }
    this.lastCoins = s.coins;
  }

  private updateGoals(s: WorldState): void {
    const g = s.rules.goal;
    let html = '';
    if (g === 'almanac') {
      const a = s.almanac;
      const left = DAYS_PER_SEASON - dayOfSeason(s.day) + 1;
      html += `<h3><span class="stars"><span class="ic">${icon('starFill')}</span></span>${SEASON_NAMES[season(s.day)]} almanac<span class="sub">${left} day${left === 1 ? '' : 's'} left <span class="toggle">${this.foldedGoals ? '+' : ''}</span></span></h3>`;
      for (const goal of a.goals) {
        const needs = goal.needs?.growth && goal.needs.growth !== s.rules.growth;
        const pct = goal.kind === 'nowither' ? (a.withered ? 0 : 100) : Math.min(100, (goal.progress / goal.target) * 100);
        const nums = goal.kind === 'nowither' ? (a.withered ? `${a.withered} lost` : 'so far') : `${fmt(Math.min(goal.progress, goal.target))}/${fmt(goal.target)}`;
        html += `<div class="goal ${goal.done ? 'done' : ''} ${goal.kind === 'nowither' && a.withered ? 'warn' : ''}"><div class="row"><span>${esc(goal.text)}${needs ? ' <em>(needs Synergy soil)</em>' : ''}</span><span class="num">${nums}</span></div><div class="meter"><i style="width:${pct}%"></i></div></div>`;
      }
      if (a.history.length) html += `<div class="legend">${a.stars} star${a.stars === 1 ? '' : 's'} over ${a.history.length} season${a.history.length === 1 ? '' : 's'}</div>`;
    } else if (g === 'orders') {
      html += `<h3><span class="ic" style="width:16px;height:16px">${icon('board')}</span>Orders<span class="sub">reputation ${s.rep} <span class="toggle">${this.foldedGoals ? '+' : ''}</span></span></h3>`;
      const spare = CROP_IDS.filter((c) => stockCount(s, c) > 0 && !s.orders.some((o) => o.items.some((it) => it.crop === c)));
      for (const o of s.orders) {
        const days = o.due - s.day;
        const items = o.items
          .map((it) => {
            const have = stockCount(s, it.crop);
            return `<span><i class="crop">${cropArt(it.crop)}</i>${CROPS[it.crop].name} <b class="${have >= it.n ? 'have' : ''}">${Math.min(have, it.n)}/${it.n}</b></span>`;
          })
          .join('');
        const ready = canDeliver(s, o);
        html += `<div class="order"><div class="who"><span>${esc(o.who)}</span><span class="due ${days <= 1 ? 'late' : ''}">${days <= 0 ? 'due today' : days === 1 ? 'due tomorrow' : `${days} days`}</span></div><div class="items">${items}</div><div class="foot"><span class="num">${fmt(o.reward)} coins</span><button class="btn ${ready ? 'primary' : ''}" data-deliver="${o.id}" ${ready ? '' : 'disabled'}>Deliver</button></div></div>`;
      }
      if (spare.length) {
        const n = spare.reduce((a, c) => a + stockCount(s, c), 0);
        html += `<div class="order"><div class="foot"><span>${n} spare in stock</span><button class="btn" data-sellspare="1">Sell at market</button></div></div>`;
      }
    } else {
      // Sunup keeps the farm clear: requests live on the notice board.
    }
    const key = html + this.foldedGoals;
    if (key !== this.goalsKey) {
      this.goalsKey = key;
      this.goals.innerHTML = html;
    }
  }

  private updateTools(s: WorldState): void {
    const r = s.rules;
    const kit = this.kit(s);
    const slots = this.slots(s);
    const act = r.clock === 'day' ? (this.knows(s, 'sleep') ? 'Sleep' : '') : r.clock === 'turns' ? 'End day' : '';
    const key = `${kit.join()}|${slots.join()}|${act}|${this.knows(s, 'sprinkler')}`;
    if (key !== this.toolsKey) {
      this.toolsKey = key;
      this.toolbar.innerHTML = '';
      // Round 10: each tool has its own place on the rack from the start, a faint peg until its lesson brings it
      // (the tenth playtest's Hoe moved into Seeds' old place when Build arrived, and 31 planting taps hoed).
      slots.forEach((t, i) => {
        if (!kit.includes(t)) {
          const peg = el('div', 'tool slot');
          peg.setAttribute('aria-hidden', 'true');
          this.toolbar.append(peg);
          return;
        }
        const b = el('button', 'tool', `<span class="ic">${icon(TOOL_ICON[t])}</span><span class="lbl">${TOOL_NAME[t]}</span><span class="key">${i + 1}</span>`);
        b.dataset.tool = t;
        if (t === 'seeds') b.append(el('span', 'seedchip'));
        if (t === 'can') b.append(el('span', 'watermeter', '<i></i>'));
        b.onclick = () => this.pickTool(t);
        this.toolbar.append(b);
      });
      if (act) {
        this.toolbar.append(el('div', 'sep'));
        const b = el('button', 'tool act', `<span class="ic">${icon('moon')}</span><span class="lbl">${act}</span><span class="key">Enter</span>`);
        b.title = `${act} (Enter)`;
        b.onclick = () => {
          this.host.sleep();
          this.host.cue('tap');
        };
        this.toolbar.append(b);
      } else if (homestead(s) && r.clock === 'day') {
        // Round 10: Sleep's place is kept too, so the rack (centred on the screen) never grows when it comes.
        const peg = el('div', 'tool slot');
        peg.setAttribute('aria-hidden', 'true');
        this.toolbar.append(el('div', 'sep'), peg);
      }
      this.renderSeedbar(s);
      this.renderBuildbar();
      // A tool a lesson just brought in arrives with a little lift.
      const arrived = this.toolbar.querySelector<HTMLElement>(`.tool[data-tool="${this.fresh}"]`) ?? (this.fresh === 'sleep' ? this.toolbar.querySelector<HTMLElement>('.tool.act') : null);
      if (arrived) {
        arrived.classList.add('new');
        setTimeout(() => arrived.classList.remove('new'), 1600);
      }
      this.fresh = '';
    }
    for (const b of this.toolbar.querySelectorAll<HTMLElement>('.tool[data-tool]')) {
      const t = b.dataset.tool as ToolId;
      const on = t === 'seeds' ? (r.tools === 'kit' ? s.tool === 'seeds' : this.seedOpen) : s.tool === t;
      toggle(b, 'on', on);
    }
    // The can always shows its water: a gauge on the tool, and "Empty" in place of its name when it is.
    const canBtn = this.toolbar.querySelector<HTMLElement>('.tool[data-tool="can"]');
    const lvl = canLevel(s);
    if (canBtn && lvl) {
      const bar = canBtn.querySelector<HTMLElement>('.watermeter > i')!;
      bar.style.setProperty('--level', `${Math.round(lvl.frac * 100)}%`);
      toggle(canBtn, 'low', lvl.low && !lvl.empty);
      toggle(canBtn, 'empty', lvl.empty);
      setText(canBtn.querySelector('.lbl')!, lvl.empty ? 'Empty' : 'Can');
      canBtn.title = lvl.empty ? 'The can is empty. Fill the can at the well or the pond' : `Can: ${lvl.left} of ${lvl.max} left`;
    }
    const chip = this.toolbar.querySelector<HTMLElement>('.seedchip');
    // The chosen seed sits on the Seeds tool as its little plate.
    if (chip && chip.dataset.crop !== s.seed) {
      chip.dataset.crop = s.seed;
      chip.innerHTML = cropArt(s.seed);
    }
    const actBtn = this.toolbar.querySelector<HTMLElement>('.tool.act');
    if (actBtn) toggle(actBtn, 'ready', (r.clock === 'turns' && s.ap - s.jobs.length <= 0) || (r.clock === 'day' && (s.stamina < 4 || s.minute > 960)));
    // Seed bar shows prices, locks and the selection. Sunup offers what grows
    // now, next season's crops in the last days of a season (marked), and
    // marks what is too late to ripen before the turn.
    let k = 0;
    for (const b of this.seedbar.querySelectorAll<HTMLElement>('.seed')) {
      const c = b.dataset.crop as CropId;
      const note = seedNote(s, c);
      toggle(b, 'on', s.seed === c);
      toggle(b, 'locked', (r.goal === 'almanac' && !s.almanac.unlocked.includes(c)) || note.state === 'late');
      toggle(b, 'next', note.state === 'next');
      const gone = homestead(s) && note.state === 'off';
      toggle(b, 'gone', gone);
      // Seed the purse cannot pay for looks it: faded, its price in red, a dashed edge.
      toggle(b, 'poor', homestead(s) && !gone && note.state !== 'late' && s.coins < CROPS[c].seed);
      setText(b.querySelector('.pr .prt')!, note.price);
      setText(b.querySelector('.wh')!, note.when);
      // Number keys pick a card: each shown card wears its number while a keyboard or mouse is in use.
      setText(b.querySelector('.key')!, gone ? '' : String(++k));
    }
    for (const b of this.buildbar.querySelectorAll<HTMLElement>('.seed')) toggle(b, 'on', s.buildKind === b.dataset.kind);
    if (this.pickMsgUntil && performance.now() > this.pickMsgUntil) this.pickWord('', false);
    // A picker whose tool has left the hand is closed for good (it only hid, and kept the pointer hidden).
    const kept = pickersAfter({ seed: this.seedOpen, build: this.buildOpen }, s.tool, r.tools === 'smart');
    this.seedOpen = kept.seed;
    this.buildOpen = kept.build;
    const seedVisible = this.seedOpen;
    const buildVisible = this.buildOpen;
    toggle(this.seedbar, 'hidden', !seedVisible);
    toggle(this.buildbar, 'hidden', !buildVisible);
    // A picker opens away from the plot being worked: up top when that plot is low on the screen.
    let below = '';
    if (seedVisible || buildVisible) {
      const up = this.workLow();
      toggle(this.seedbar, 'up', up);
      toggle(this.buildbar, 'up', up);
      // Toasts (a "too late" note from a tap on a seed, say) then show just under the picker, not behind it.
      if (up) below = `${Math.round((seedVisible ? this.seedbar : this.buildbar).getBoundingClientRect().bottom - this.root.getBoundingClientRect().top + 8)}px`;
    }
    // With a dialog open, toasts show just under it when there is room (else at the foot of the screen).
    const host = this.root.parentElement;
    if (!below && host?.classList.contains('dialog-open')) {
      const d = host.querySelector('.dialog.on')?.getBoundingClientRect();
      const top = this.root.getBoundingClientRect().top;
      if (d && this.root.clientHeight - (d.bottom - top) > 150) below = `${Math.round(d.bottom - top + 10)}px`;
    }
    if (this.toasts.style.top !== below) this.toasts.style.top = below;
    // An open picker has the player's attention: the lesson line and caption step aside.
    this.picking = seedVisible || buildVisible;
    toggle(this.root, 'picking', this.picking);
  }

  /** Is the plot being worked (the aim) in the lower part of the screen, where a picker would cover it? */
  private workLow(): boolean {
    const a = this.lastAim;
    if (!a) return false;
    const p = this.host.project(a.x + 0.5, a.y + 0.5, 0);
    return !!p && p.y > this.root.clientHeight * 0.52;
  }

  private renderSeedbar(s: WorldState): void {
    this.seedbar.innerHTML = '';
    this.seedbar.append(this.pickMsg);
    for (const c of CROP_IDS) {
      const d = CROPS[c];
      // Round 8: the price wears the coin, as the coins box does.
      const b = el('button', 'seed', `<span class="blob">${cropArt(c)}</span><span class="nm">${d.name}</span><span class="pr"><span class="ic cm">${icon('coin')}</span><span class="prt"></span></span><span class="wh"></span><span class="key"></span>`);
      b.dataset.crop = c;
      b.title = `${d.name}: seeds ${d.seed}, ripe in ${d.days} days${d.regrow ? `, then every ${d.regrow}` : ''}, sells for ${d.price}. Grows in ${d.seasons.map((n) => SEASON_NAMES[n].toLowerCase()).join(' and ')}. ${d.likes}.`;
      b.onclick = () => {
        const st = this.host.state();
        const tap = seedTap(st, c);
        if (!tap.ok) {
          // Round 7: the word shows in the picker, which stays open, and the seed in hand stays as it was (the sixth
          // round closed the picker and put the hands in hand, and the seventh playtest saw no word at all).
          this.pickWord(tap.word, true);
          this.host.cue('deny');
          this.seedOpen = true;
          return;
        }
        if (st.rules.goal === 'almanac' && !st.almanac.unlocked.includes(c)) {
          this.toast(`${d.name} is not in your almanac yet. New seeds come at the end of each season.`, 'deny');
          this.host.cue('deny');
          return;
        }
        this.host.send({ type: 'seed', crop: c });
        if (st.rules.tools === 'kit') this.host.send({ type: 'tool', tool: 'seeds' });
        this.host.cue('tool');
        // A crop that only just ripens before the turn is warned of before it goes in; the picker stays open to read it.
        if (tap.word) this.pickWord(tap.word, false);
        else {
          this.pickWord('', false);
          if (window.innerWidth < 640) this.seedOpen = false;
        }
      };
      this.seedbar.append(b);
    }
    void s;
  }

  /** A word in the seed picker (a refusal, or a warning), for a few seconds. */
  private pickWord(text: string, deny: boolean): void {
    setText(this.pickMsg, text);
    toggle(this.pickMsg, 'on', !!text);
    toggle(this.pickMsg, 'deny', deny);
    this.pickMsgUntil = text ? performance.now() + 3200 : 0;
  }

  private renderBuildbar(): void {
    this.buildbar.innerHTML = '';
    // Only what a lesson has brought in: the sprinkler comes after the scarecrow, with its own line.
    const kinds = (['scarecrow', 'sprinkler'] as BuildKind[]).filter((k) => k === 'scarecrow' || this.knows(this.host.state(), 'sprinkler'));
    kinds.forEach((k, i) => {
      const b = el('button', 'seed', `<span class="ic" style="width:24px;height:24px">${icon(k)}</span><span class="nm">${k === 'scarecrow' ? 'Scarecrow' : 'Sprinkler'}</span><span class="pr"><span class="ic cm">${icon('coin')}</span>${BUILD_COST[k]}</span><span class="key">${i + 1}</span>`);
      b.dataset.kind = k;
      b.title = k === 'scarecrow' ? `${scarecrowWords(this.host.state())}.` : `${sprinklerWords(this.host.state())}.`;
      b.onclick = () => {
        this.host.send({ type: 'buildKind', kind: k });
        this.host.cue('tool');
        if (window.innerWidth < 640) this.buildOpen = false;
      };
      this.buildbar.append(b);
    });
  }

  pickTool(t: ToolId): void {
    const s = this.host.state();
    if (t === 'seeds') {
      if (s.rules.tools === 'kit') {
        this.seedOpen = s.tool === 'seeds' ? !this.seedOpen : true;
        this.host.send({ type: 'tool', tool: 'seeds' });
      } else this.seedOpen = !this.seedOpen;
      this.buildOpen = false;
    } else if (t === 'build') {
      this.buildOpen = s.tool === 'build' ? !this.buildOpen : true;
      this.seedOpen = false;
      this.host.send({ type: 'tool', tool: 'build' });
    } else {
      this.seedOpen = false;
      this.buildOpen = false;
      this.host.send({ type: 'tool', tool: t });
    }
    this.host.cue('tool');
  }

  /** Close an open picker (Enter or Escape). False when none is open. */
  closePicker(): boolean {
    if (!this.picking) return false;
    this.seedOpen = false;
    this.buildOpen = false;
    this.picking = false;
    this.host.cue('close');
    return true;
  }

  /**
   * A key while a picker is open: the arrows move the choice among the cards
   * that can be chosen, a number picks that card (as a tap would), Enter and
   * Escape close the picker. True when the picker took the key.
   */
  pickerKey(code: string): boolean {
    if (!this.picking) return false;
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Escape') return this.closePicker();
    const s = this.host.state();
    const seeds = !this.seedbar.classList.contains('hidden');
    const bar = seeds ? this.seedbar : this.buildbar;
    const shown = [...bar.querySelectorAll<HTMLElement>('.seed')].filter((b) => !b.classList.contains('gone'));
    const cards = shown.map((b) => {
      const r = b.getBoundingClientRect();
      return { id: (seeds ? b.dataset.crop : b.dataset.kind)!, ok: !b.classList.contains('locked'), x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const id = pickerStep(cards, seeds ? s.seed : s.buildKind, code);
    if (id === null) return /^Arrow/.test(code) || /^(?:Digit|Numpad)[1-9]$/.test(code);
    // The same as a tap on the card: a seed that cannot go in says why.
    const card = shown[cards.findIndex((c) => c.id === id)];
    card?.click();
    // The arrows keep the picker open to move on; a number picks and closes it (round 8: it stayed open on a desktop),
    // unless the picker has something to say (a seed too late to go in, or one only just in time).
    const number = /^(?:Digit|Numpad)[1-9]$/.test(code);
    const word = this.pickMsg.classList.contains('on');
    const keep = !number || word;
    if (seeds) this.seedOpen = keep;
    else this.buildOpen = keep;
    if (!keep) this.picking = false;
    return true;
  }

  /** Q cycles through the toolbar. */
  cycleTool(back: boolean): void {
    const s = this.host.state();
    const kit = this.kit(s).filter((t) => t !== 'seeds' || s.rules.tools === 'kit');
    const i = kit.indexOf(s.tool);
    this.pickTool(kit[(i + (back ? kit.length - 1 : 1)) % kit.length]);
  }

  toolByNumber(n: number): void {
    const s = this.host.state();
    // Round 10: the number is the tool's own place on the rack.
    const t = this.slots(s)[n - 1];
    if (t && this.kit(s).includes(t)) this.pickTool(t);
  }

  private updateInfo(s: WorldState, aim: { x: number; y: number } | null): void {
    this.lastAim = aim;
    if (!aim) {
      toggle(this.info, 'empty', true);
      this.aimVerb = null;
      return;
    }
    const r = resolve(s, s.tool, aim.x, aim.y);
    const prop = propAt(aim.x, aim.y)?.kind;
    const inCrate = CROP_IDS.reduce((a, c) => a + stockCount(s, c), 0);
    const html =
      prop === 'board'
        ? '<b>Notice board</b>'
        : prop === 'well'
          ? '<b>Well</b>'
          : prop === 'crate'
            ? `<b>Crate</b>${inCrate ? ` <span class="why">${inCrate} inside</span>` : ''}`
            : homestead(s)
              ? brief(s, aim.x, aim.y)
              : describe(s, aim.x, aim.y, r);
    toggle(this.info, 'empty', !html || this.picking);
    if (html) setHtml(this.info, html);
    // Acting at the notice board opens it, so the button says so.
    if (prop === 'board' && this.knows(s, 'board')) this.aimVerb = { verb: null, ok: true, label: 'Read', icon: 'board' };
    // Too tired for it, the button is dim and wordless, like anywhere acting would do nothing (it stayed lit with Water).
    else this.aimVerb = { verb: r.verb, ok: !!(r.verb && r.ok) && !(homestead(s) && r.verb && canAfford(s, r.verb)) };
  }

  // ------------------------------------------------------------ events

  onEvent(e: SimEvent): void {
    const s = this.host.state();
    switch (e.type) {
      case 'deny': {
        if (e.reason === 'unowned') {
          const id = s.parcelOf[e.y * s.W + e.x];
          if (id >= 0) this.host.offerParcel(id);
          return;
        }
        const now = performance.now();
        if (this.lastDeny.text === e.reason && now - this.lastDeny.t < 1200) return;
        this.lastDeny = { text: e.reason, t: now };
        // One refusal on screen at a time: a new one takes the place of the last (two drew over each other).
        for (const f of this.floaters.querySelectorAll('.floater.no')) f.remove();
        this.float(e.x + 0.5, e.y + 0.5, denyText(e.reason), true);
        break;
      }
      case 'coins':
        if (e.x !== undefined && e.y !== undefined) this.float(e.x + 0.5, e.y + 0.5, `+${fmt(e.amount)}`);
        // Round 7: a crop paid for as it goes into the crate: a small rise of coins at the crate, once the crop lands.
        else if (e.crate && this.knows(s, 'coins')) this.crateCoins(e.amount);
        break;
      case 'night':
        // Words of the day go with it: a let-go note stayed up through the night onto the morning card.
        for (const n of [...this.toasts.children]) n.remove();
        break;
      case 'harvest': {
        if (e.by === s.actors[0].id && this.touch.shown) buzz(12);
        // A crop sown for a request says how far along the request is, right where it was picked.
        // Short, so it fits over the plot: the crop names the request. (Round 6: only what was sown for it counts.)
        const o = homestead(s) && e.req !== undefined ? s.orders.find((q) => q.id === e.req && isTaken(q)) : null;
        // Round 9: the last of a request's crops hands it over in the same moment: its chip says it is all in.
        const gone = !o && e.req !== undefined ? this.takenSeen.get(e.req) : undefined;
        if (gone && e.by === s.actors[0].id) {
          // (One short of its count, after a crow, it says how many it got.)
          const got = Math.min(gone.n, gone.got + 1);
          this.requestChip(e.req!, e.x + 0.5, e.y + 0.5, got >= gone.n ? `All ${gone.n} ${cropWord(gone.crop, gone.n)} in` : `${got} of ${gone.n} ${cropWord(gone.crop, gone.n)}`);
          break;
        }
        if (o && e.by === s.actors[0].id) {
          const it = o.items[0];
          const have = Math.min(o.got ?? 0, it.n);
          // Round 8: one chip a request, its count updated in place over the plot just picked ("3 of 10", "4 of 10",
          // "5 of 10" and "6 of 10 sunflowers" stacked over the field).
          this.requestChip(o.id, e.x + 0.5, e.y + 0.5, have >= it.n ? `${it.n} ${cropWord(it.crop, it.n)} ready` : `${have} of ${it.n} ${cropWord(it.crop, it.n)}`);
          break;
        }
        if (e.quality > 0 && e.by === s.actors[0].id) this.float(e.x + 0.5, e.y + 0.5, `${QUALITY_NAME[e.quality]} ${CROPS[e.crop].name.toLowerCase()}`);
        // Round 11: a crop of a request's kind that was not planted for it says so as it is picked (ripe market carrots
        // picked under "Harvest 4 carrots" did nothing for the request, which read as a bug).
        else if (homestead(s) && e.by === s.actors[0].id && e.req === undefined && s.orders.some((q) => isTaken(q) && q.items[0].crop === e.crop && (q.got ?? 0) < q.items[0].n)) this.float(e.x + 0.5, e.y + 0.5, 'Sold. Not for the request');
        break;
      }
      case 'crowEat':
        // A crop a crow takes by day says so (round 6: losses came from pests the player never saw), and, when it was
        // sown for a request, what that means for the request (round 7: one crow voided a whole request without a word).
        if (homestead(s) && s.turnover < 0 && e.crop) this.toast(`A crow took ${e.crop === 'corn' || e.crop === 'beans' ? 'some' : 'a'} ${CROPS[e.crop].name.toLowerCase()}.${requestAfterLoss(s, e.req)}`, '', 3200);
        break;
      case 'milestone': {
        // A milestone reads as something won, not a task: "Your first harvest is in".
        const m = MILESTONES.find((x) => x.id === e.id);
        // Round 8: the second field comes with the copper can, and says so.
        if (m && homestead(s) && e.id === 'field2' && s.tools.can >= 1) this.toast(`<b>${esc(m.done)}</b><br>A copper can comes with it. It waters a whole row.`, 'big', 4200);
        else if (m && s.rules.goal === 'market') this.toast(`<b>${esc(m.done)}</b>`, 'big');
        break;
      }
      case 'goal':
        if (e.id.startsWith('draft-')) break;
        if (s.rules.goal === 'almanac') {
          const g = s.almanac.goals.find((x) => x.id === e.id);
          if (g) this.toast(`<b>Goal met</b><br>${esc(g.text)}`, 'big');
        }
        break;
      case 'order':
        if (!e.done) this.toast('An order lapsed. Reputation dips.', 'deny');
        else this.toast('<b>Order filled</b>', 'big');
        break;
      case 'request':
        // Requests filled or gone overnight are on the morning card; this is one handed over by day, or the other of
        // a pair let go because seed went in for this one.
        // Round 8: one short earns its share of a reputation point ("+¾ reputation"). Round 11: one figure for one payment:
        // what its note says it comes to in all (the note said "+180 in all", this "+90 coins").
        if (e.done && s.turnover < 0) this.toast(e.of ? `<b>${esc(e.who)}</b> took ${e.got} of ${e.of}. +${fmt(e.clear ?? e.reward)} in all${e.rep && repShare(e.rep) ? `, +${repShare(e.rep)} reputation` : ''}.` : `<b>${esc(e.who)}</b> took the crops. +${fmt(e.clear ?? e.reward)} in all, +1 reputation.`, 'big', 3200);
        // Lost by day, with its cause (round 7), or the other of a pair let go.
        else if (!e.done && s.turnover < 0 && e.crop && e.why) this.toast(`${esc(e.who)} gave up on the ${CROPS[e.crop].plural}${failWords(e.why, e.lost) ? ` (${failWords(e.why, e.lost)})` : ''}.`, 'deny', 3200);
        else if (!e.done && s.turnover < 0 && e.crop) this.toast(`${esc(e.who)} will find ${CROPS[e.crop].plural} elsewhere.`, '', 2800);
        break;
      case 'upgrade': {
        // (The copper can that comes with the second field is told with the field.)
        if (e.withField) break;
        const u = TOOL_UPGRADES[e.tool][e.level - 1];
        this.toast(`<b>${esc(u.name)}</b><br>${e.level === 1 ? 'Works a whole row.' : 'Works two rows.'}`, 'big', 3200);
        break;
      }
      case 'hire': {
        const a = s.actors.find((x) => x.id === e.id);
        if (a) this.toast(`${esc(a.name)} joins the crew`, '');
        break;
      }
      case 'season':
        // Sunup says so on the morning card, so the two never stack.
        if (s.rules.goal !== 'almanac' && !homestead(s)) this.toast(`<b>${SEASON_NAMES[e.season]}</b> begins`, 'big');
        break;
      case 'dawn':
        this.morning(s);
        break;
      case 'buy': {
        // One toast for one field: the second field (and the last) say so as a milestone instead.
        // (The milestone has already been ticked by the time the purchase is shown, in the same step.)
        const owned = s.parcels.filter((p) => p.owned).length;
        const milestone = owned === 2 || owned === s.parcels.length;
        if (e.item.startsWith('field:') && !(milestone && s.rules.goal === 'market')) this.toast('The field is yours.', '');
        break;
      }
      case 'sell':
        break;
      case 'rules':
        break;
      case 'unlock':
        this.fresh = e.what;
        if (e.what === 'forecast') this.forecastNew = performance.now() + 2400;
        break;
    }
  }

  /** The lesson line from Sunup's tutor. Empty when there is nothing to teach. */
  private lessonLine = '';

  setLesson(line: string): void {
    this.lessonLine = line;
  }

  /** A tile for the lesson to point at, or null. */
  setPoint(p: { x: number; y: number } | null): void {
    this.pointAt = p;
  }

  /** Over the tile when it is in view, else on the edge of the clear band, turned towards it. */
  private updatePointer(): void {
    const t = this.pointAt;
    // Aimed at the top of a crop (half a tile up), so the chevron sits just over its target, not a tile above it.
    const pp = t && !this.picking ? this.host.project(t.x, t.y, POINT_HEIGHT) : null;
    toggle(this.pointer, 'on', !!pp);
    if (!pp) return;
    const W = this.root.clientWidth;
    const H = this.root.clientHeight;
    // The clear band: below the day card and coins, above the tool rack (and, on a phone, above the act button,
    // so the arrow never lies over it).
    const x0 = 22;
    const x1 = W - 22;
    const y0 = 150;
    const y1 = H - (this.touch.shown ? 200 : 150);
    const inside = pp.x > x0 && pp.x < x1 && pp.y > y0 && pp.y < y1;
    toggle(this.pointer, 'over', inside);
    if (inside) {
      // The chevron's tip is 7 px below its middle once turned down.
      this.pointer.style.transform = `translate(${pp.x.toFixed(0)}px, ${(pp.y - POINT_LIFT).toFixed(0)}px) rotate(90deg)`;
      return;
    }
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const dx = pp.x - cx;
    const dy = pp.y - cy;
    const k = Math.min((x1 - cx) / Math.max(Math.abs(dx), 1e-3), (y1 - cy) / Math.max(Math.abs(dy), 1e-3));
    this.pointer.style.transform = `translate(${(cx + dx * k).toFixed(0)}px, ${(cy + dy * k).toFixed(0)}px) rotate(${Math.atan2(dy, dx).toFixed(3)}rad)`;
  }

  /** Round 10: the rack's places, one per tool, the same from the first morning (`kit` says which hold their tool). */
  private slots(s: WorldState): ToolId[] {
    if (s.rules.tools === 'smart') return ['smart', 'seeds', 'build'];
    return toolSlots(s);
  }

  /** Tools on the rack: only the ones a lesson has brought in (Sunup), or the full kit. */
  private kit(s: WorldState): ToolId[] {
    if (s.rules.tools === 'smart') return ['smart', 'seeds', 'build'];
    const all: ToolId[] = ['hands', 'can', 'seeds', 'hoe', 'build'];
    if (!homestead(s)) return all;
    return all.filter((t) => t === 'hands' || s.learn.includes(t));
  }

  private knows(s: WorldState, what: string): boolean {
    return !homestead(s) || s.learn.includes(what);
  }

  private morning(s: WorldState): void {
    if (s.rules.clock === 'flow' && s.speed > 1) return;
    // A new season is news on its own, on the same card (a toast of its own would hide behind it), and counts as one
    // of the card's clauses.
    const turn = homestead(s) && dayOfSeason(s.day) === 1 && s.day > 1 ? `${SEASON_NAMES[season(s.day)]} begins.` : '';
    let news = morningNews(s, turn ? MORNING_CLAUSES - 1 : MORNING_CLAUSES);
    if (turn) news = news ? `${turn} ${news}` : turn;
    // Only news earns a morning card.
    if (!news) return;
    const weather = WEATHER_NAMES[s.weather].toLowerCase();
    // Round 7: the board keeps the last card to read again (it showed for a few seconds, and was gone).
    this.lastCard = { day: s.day, title: `${SEASON_NAMES[season(s.day)]} ${dayOfSeason(s.day)}, ${weather}`, news };
    this.toast(`<b>${SEASON_NAMES[season(s.day)]} ${dayOfSeason(s.day)}</b>, ${weather}<br>${news}`, 'big', 3800);
  }

  /** The last morning card, for the board (null before the first). */
  lastCard: { day: number; title: string; news: string } | null = null;

  /** The rise of coins at the crate: one at a time, a quick run of picks adding up on the same one. */
  private crateRise: { el: HTMLElement | null; amount: number; t: number } | null = null;

  private crateCoins(amount: number): void {
    const now = performance.now();
    const r = this.crateRise;
    if (r && now - r.t < 900) {
      r.amount += amount;
      r.t = now;
      if (r.el) {
        r.el.textContent = `+${fmt(r.amount)}`;
        r.el.classList.remove('rise');
        void r.el.offsetWidth;
        r.el.classList.add('rise');
      }
      return;
    }
    const rise: { el: HTMLElement | null; amount: number; t: number } = { el: null, amount, t: now };
    this.crateRise = rise;
    // After the crop's arc has landed in the crate (about 0.8 s), over the crate when it is on screen (the coin box
    // counts it at once either way).
    setTimeout(() => {
      const p = this.host.project(CRATE.x + 0.5, CRATE.y - 0.5, 0.9);
      const W = this.root.clientWidth;
      const H = this.root.clientHeight;
      if (!p || p.x < 20 || p.x > W - 20 || p.y < 40 || p.y > H - 40) return;
      const f = el('div', 'floater coin rise');
      f.textContent = `+${fmt(rise.amount)}`;
      f.style.left = `${p.x}px`;
      f.style.top = `${p.y}px`;
      this.floaters.append(f);
      rise.el = f;
      setTimeout(() => f.remove(), 1600);
    }, 750);
  }

  toast(html: string, kind: string, ms = 2400): void {
    const t = el('div', `toast ${kind}`, html);
    this.toasts.append(t);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild!.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 320);
    }, ms);
  }

  /** Request chips on screen, one a request, by its id. */
  private chips = new Map<number, { el: HTMLElement; timer: ReturnType<typeof setTimeout> }>();

  /**
   * Round 8: a request's count over the plot just picked, on one chip for the
   * request: a quick run of picks moves and updates it, never a stack of
   * chips over the field.
   */
  requestChip(id: number, x: number, y: number, text: string): void {
    const p = this.host.project(x, y, 0.8);
    if (!p) return;
    let c = this.chips.get(id);
    if (!c || !c.el.isConnected) {
      const f = el('div', 'floater req');
      this.floaters.append(f);
      c = { el: f, timer: setTimeout(() => undefined, 0) };
      this.chips.set(id, c);
    }
    const f = c.el;
    f.textContent = text;
    f.style.left = `${p.x}px`;
    f.style.top = `${p.y}px`;
    const W = this.root.clientWidth;
    const half = f.offsetWidth / 2;
    if (W > 0 && half > 0) f.style.left = `${Math.max(half + 6, Math.min(W - half - 6, p.x))}px`;
    // Its rise starts again with each pick, so the count stays up to be read.
    f.style.animation = 'none';
    void f.offsetWidth;
    f.style.animation = '';
    clearTimeout(c.timer);
    const chip = c;
    c.timer = setTimeout(() => {
      chip.el.remove();
      if (this.chips.get(id) === chip) this.chips.delete(id);
    }, 2250);
  }

  float(x: number, y: number, text: string, deny = false): void {
    const p = this.host.project(x, y, 0.8);
    if (!p) return;
    const f = el('div', `floater ${deny ? 'no' : ''}`);
    f.textContent = text;
    f.style.left = `${p.x}px`;
    f.style.top = `${p.y}px`;
    this.floaters.append(f);
    // Kept whole on the screen: a plot at its edge ("Already watered") must not cut the words off.
    const W = this.root.clientWidth;
    const half = f.offsetWidth / 2;
    if (W > 0 && half > 0) f.style.left = `${Math.max(half + 6, Math.min(W - half - 6, p.x))}px`;
    // Up long enough to read (it went in 1.1 s).
    setTimeout(() => f.remove(), 2250);
  }

  /** The names of the hands, for the board. */
  static handName(n: number): string {
    return HAND_NAMES[n] ?? 'A hand';
  }
}
