// The heads-up display: day card, coins, the goal panel for whichever goal
// rule is on, the info line, the toolbar, touch controls, toasts and
// floating numbers. Rebuilt pieces only when the rules change; text is
// refreshed every frame through setText.

import type { UiCue } from '../contract';
import type { Input } from '../game/input';
import { resolve } from '../sim/actions';
import type { Command } from '../sim/commands';
import { BUILD_COST, DAYS_PER_SEASON, FLOW_SPEEDS, HAND_NAMES } from '../sim/constants';
import { CROP_IDS, CROPS, QUALITY_NAME } from '../sim/crops';
import { canDeliver, MILESTONES, stockCount } from '../sim/goals';
import { PRESETS, type PresetId } from '../sim/presets';
import { WEATHER_NAMES } from '../sim/weather';
import { dayOfSeason, season, SEASON_NAMES } from '../sim/world';
import type { BuildKind, CropId, SimEvent, ToolId, Verb, Weather, WorldState } from '../sim/types';
import { describe, denyText } from './describe';
import { clock, el, esc, fmt, setHtml, setText, toggle } from './dom';
import { icon, type IconId } from './icons';
import { buzz, TouchControls } from './touch';

export interface HudHost {
  state(): WorldState;
  send(c: Command): void;
  cue(c: UiCue): void;
  openBoard(tab?: string): void;
  offerParcel(id: number): void;
  project(x: number, y: number, h?: number): { x: number; y: number } | null;
  input: Input;
}

const WEATHER_ICON: Record<Weather, IconId> = { sun: 'sun', cloud: 'cloud', rain: 'rain', storm: 'storm', heat: 'heat' };
const TOOL_ICON: Record<ToolId, IconId> = { hands: 'hands', hoe: 'hoe', can: 'can', seeds: 'seeds', build: 'build', smart: 'smart' };
const TOOL_NAME: Record<ToolId, string> = { hands: 'Hands', hoe: 'Hoe', can: 'Can', seeds: 'Seeds', build: 'Build', smart: 'Smart' };

export class Hud {
  readonly root = el('div', 'hud');
  private day = el('div', 'card daycard');
  private date = el('span', 'date');
  private clockEl = el('span', 'clock');
  private sky = el('div', 'sky');
  private meterRow = el('div');
  private coins = el('div', 'card coins');
  private coinsNum = el('span', 'num');
  private goals = el('div', 'card goals');
  private info = el('div', 'card info empty');
  private toolbar = el('div', 'card toolbar');
  private seedbar = el('div', 'card seedbar hidden');
  private buildbar = el('div', 'card buildbar hidden');
  private toasts = el('div', 'toasts');
  readonly touch: TouchControls;
  private floaters = el('div', 'floaters');
  private toolsKey = '';
  private goalsKey = '';
  private meterKey = '';
  private lastCoins = -1;
  private seedOpen = false;
  private buildOpen = false;
  private lastDeny = { text: '', t: 0 };
  private foldedGoals = window.innerWidth < 640;
  private aimVerb: { verb: Verb | null; ok: boolean } | null = null;

  constructor(private host: HudHost) {
    this.touch = new TouchControls({
      input: host.input,
      state: host.state,
      aimVerb: () => this.aimVerb,
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
    this.day.append(when, this.sky, this.meterRow);
    this.coins.append(el('span', 'ic', icon('coin')), this.coinsNum);
    const board = el('button', 'btn iconbtn', `<span class="ic">${icon('board')}</span>`);
    board.title = 'Notice board (B)';
    board.onclick = () => host.openBoard();
    const btns = el('div', 'topbtns');
    btns.append(board);
    const right = el('div', 'topright');
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


    this.root.append(top, this.goals, this.info, this.seedbar, this.buildbar, this.toolbar, this.touch.el, this.toasts, this.floaters);
  }

  // ------------------------------------------------------------ per frame

  update(aim: { x: number; y: number } | null): void {
    const s = this.host.state();
    this.updateDay(s);
    this.updateCoins(s);
    this.updateGoals(s);
    this.updateTools(s);
    this.updateInfo(s, aim);
    this.touch.update();
  }

  private updateDay(s: WorldState): void {
    const sn = season(s.day);
    setText(this.date, `${SEASON_NAMES[sn]} ${dayOfSeason(s.day)}`);
    setText(this.clockEl, s.rules.clock === 'turns' ? `${s.ap} of ${s.apMax} moves` : clock(s.minute));
    const wild = s.rules.weather === 'wild';
    const fc = wild ? `<span class="fc">${s.forecast.map((w) => `<span class="ic" title="${WEATHER_NAMES[w]}">${icon(WEATHER_ICON[w])}</span>`).join('')}</span>` : '';
    setHtml(this.sky, `<span class="ic">${icon(WEATHER_ICON[s.weather])}</span><span>${WEATHER_NAMES[s.weather]}</span>${fc}`);

    const key = s.rules.clock;
    if (key !== this.meterKey) {
      this.meterKey = key;
      this.meterRow.innerHTML = '';
      if (key === 'day') this.meterRow.append(el('div', 'meter', '<i></i>'));
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
    if (key === 'day') {
      const m = this.meterRow.firstElementChild as HTMLElement;
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
            return `<span><i style="background:${CROPS[it.crop].color}"></i>${CROPS[it.crop].name} <b class="${have >= it.n ? 'have' : ''}">${Math.min(have, it.n)}/${it.n}</b></span>`;
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
      const done = MILESTONES.filter((m) => s.milestones[m.id]).length;
      const next = MILESTONES.find((m) => !s.milestones[m.id]);
      html += `<h3><span class="ic" style="width:16px;height:16px">${icon('leaf')}</span>Milestones<span class="sub">${done} of ${MILESTONES.length} <span class="toggle">${this.foldedGoals ? '+' : ''}</span></span></h3>`;
      if (next) html += `<div class="goal"><div class="row"><span>Next: ${esc(next.text)}</span></div></div>`;
      const stock = CROP_IDS.reduce((a, c) => a + stockCount(s, c), 0);
      if (stock) html += `<div class="legend">${stock} in the crate, sold overnight</div>`;
    }
    const key = html + this.foldedGoals;
    if (key !== this.goalsKey) {
      this.goalsKey = key;
      this.goals.innerHTML = html;
    }
  }

  private updateTools(s: WorldState): void {
    const r = s.rules;
    const kit: ToolId[] = r.tools === 'smart' ? ['smart', 'seeds', 'build'] : ['hands', 'hoe', 'can', 'seeds', 'build'];
    const act = r.clock === 'day' ? 'Sleep' : r.clock === 'turns' ? 'End day' : '';
    const key = `${kit.join()}|${act}`;
    if (key !== this.toolsKey) {
      this.toolsKey = key;
      this.toolbar.innerHTML = '';
      kit.forEach((t, i) => {
        const b = el('button', 'tool', `<span class="ic">${icon(TOOL_ICON[t])}</span><span class="lbl">${TOOL_NAME[t]}</span><span class="key">${i + 1}</span>`);
        b.dataset.tool = t;
        if (t === 'seeds') b.append(el('span', 'seedchip'));
        b.onclick = () => this.pickTool(t);
        this.toolbar.append(b);
      });
      if (act) {
        this.toolbar.append(el('div', 'sep'));
        const b = el('button', 'tool act', `<span class="ic">${icon('moon')}</span><span class="lbl">${act}</span>`);
        b.title = `${act} (Enter)`;
        b.onclick = () => {
          this.host.send({ type: 'sleep' });
          this.host.cue('tap');
        };
        this.toolbar.append(b);
      }
      this.renderSeedbar(s);
      this.renderBuildbar();
    }
    for (const b of this.toolbar.querySelectorAll<HTMLElement>('.tool[data-tool]')) {
      const t = b.dataset.tool as ToolId;
      const on = t === 'seeds' ? (r.tools === 'kit' ? s.tool === 'seeds' : this.seedOpen) : s.tool === t;
      toggle(b, 'on', on);
    }
    const chip = this.toolbar.querySelector<HTMLElement>('.seedchip');
    if (chip) chip.style.background = CROPS[s.seed].color;
    const actBtn = this.toolbar.querySelector<HTMLElement>('.tool.act');
    if (actBtn) toggle(actBtn, 'ready', (r.clock === 'turns' && s.ap - s.jobs.length <= 0) || (r.clock === 'day' && (s.stamina < 4 || s.minute > 960)));
    // Seed bar shows prices, locks and the selection.
    for (const b of this.seedbar.querySelectorAll<HTMLElement>('.seed')) {
      const c = b.dataset.crop as CropId;
      toggle(b, 'on', s.seed === c);
      toggle(b, 'locked', r.goal === 'almanac' && !s.almanac.unlocked.includes(c));
    }
    for (const b of this.buildbar.querySelectorAll<HTMLElement>('.seed')) toggle(b, 'on', s.buildKind === b.dataset.kind);
    const seedVisible = this.seedOpen && (r.tools === 'smart' || s.tool === 'seeds');
    toggle(this.seedbar, 'hidden', !seedVisible);
    toggle(this.buildbar, 'hidden', !(this.buildOpen && s.tool === 'build'));
  }

  private renderSeedbar(s: WorldState): void {
    this.seedbar.innerHTML = '';
    for (const c of CROP_IDS) {
      const d = CROPS[c];
      const b = el('button', 'seed', `<span class="blob" style="background:${d.color}"></span><span class="nm">${d.name}</span><span class="pr">${d.seed} &middot; ${d.days}d</span>`);
      b.dataset.crop = c;
      b.title = `${d.name}: seeds ${d.seed}, ripe in ${d.days} days${d.regrow ? `, then every ${d.regrow}` : ''}, sells for ${d.price}. ${d.likes}.`;
      b.onclick = () => {
        const st = this.host.state();
        if (st.rules.goal === 'almanac' && !st.almanac.unlocked.includes(c)) {
          this.toast(`${d.name} is not in your almanac yet. New seeds come at the end of each season.`, 'deny');
          this.host.cue('deny');
          return;
        }
        this.host.send({ type: 'seed', crop: c });
        if (st.rules.tools === 'kit') this.host.send({ type: 'tool', tool: 'seeds' });
        this.host.cue('tool');
        if (window.innerWidth < 640) this.seedOpen = false;
      };
      this.seedbar.append(b);
    }
    void s;
  }

  private renderBuildbar(): void {
    this.buildbar.innerHTML = '';
    for (const k of ['scarecrow', 'sprinkler'] as BuildKind[]) {
      const b = el('button', 'seed', `<span class="ic" style="width:24px;height:24px">${icon(k)}</span><span class="nm">${k === 'scarecrow' ? 'Scarecrow' : 'Sprinkler'}</span><span class="pr">${BUILD_COST[k]}</span>`);
      b.dataset.kind = k;
      b.title = k === 'scarecrow' ? 'Keeps crows off everything within three plots' : 'Waters the nine plots around it every morning';
      b.onclick = () => {
        this.host.send({ type: 'buildKind', kind: k });
        this.host.cue('tool');
      };
      this.buildbar.append(b);
    }
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

  /** Q cycles through the toolbar. */
  cycleTool(back: boolean): void {
    const s = this.host.state();
    const kit: ToolId[] = s.rules.tools === 'smart' ? ['smart', 'build'] : ['hands', 'hoe', 'can', 'seeds', 'build'];
    const i = kit.indexOf(s.tool);
    this.pickTool(kit[(i + (back ? kit.length - 1 : 1)) % kit.length]);
  }

  toolByNumber(n: number): void {
    const s = this.host.state();
    const kit: ToolId[] = s.rules.tools === 'smart' ? ['smart', 'seeds', 'build'] : ['hands', 'hoe', 'can', 'seeds', 'build'];
    if (kit[n - 1]) this.pickTool(kit[n - 1]);
  }

  private updateInfo(s: WorldState, aim: { x: number; y: number } | null): void {
    if (!aim) {
      toggle(this.info, 'empty', true);
      this.aimVerb = null;
      return;
    }
    const r = resolve(s, s.tool, aim.x, aim.y);
    const html = describe(s, aim.x, aim.y, r);
    toggle(this.info, 'empty', !html || this.seedOpen || this.buildOpen);
    if (html) setHtml(this.info, html);
    this.aimVerb = { verb: r.verb, ok: !!(r.verb && r.ok) };
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
        this.float(e.x + 0.5, e.y + 0.5, denyText(e.reason), true);
        break;
      }
      case 'coins':
        if (e.x !== undefined && e.y !== undefined) this.float(e.x + 0.5, e.y + 0.5, `+${fmt(e.amount)}`);
        break;
      case 'harvest':
        if (e.by === s.actors[0].id && this.touch.shown) buzz(12);
        if (e.quality > 0 && e.by === s.actors[0].id) this.float(e.x + 0.5, e.y + 0.5, `${QUALITY_NAME[e.quality]} ${CROPS[e.crop].name.toLowerCase()}`);
        break;
      case 'milestone': {
        const m = MILESTONES.find((x) => x.id === e.id);
        if (m && s.rules.goal === 'market') this.toast(`<b>Milestone</b><br>${esc(m.text)}`, 'big');
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
      case 'hire': {
        const a = s.actors.find((x) => x.id === e.id);
        if (a) this.toast(`${esc(a.name)} joins the crew`, '');
        break;
      }
      case 'season':
        if (s.rules.goal !== 'almanac') this.toast(`<b>${SEASON_NAMES[e.season]}</b> begins`, 'big');
        break;
      case 'dawn':
        this.morning(s);
        break;
      case 'buy':
        if (e.item.startsWith('field:')) this.toast('The field is yours. Till it to plant.', '');
        break;
      case 'sell':
        break;
      case 'rules':
        break;
    }
  }

  /** First time in each game: how to play it, in two lines. */
  intro(p: PresetId): void {
    const key = 'threeacres:v1:intro';
    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem(key) ?? '[]');
    } catch {
      seen = [];
    }
    if (seen.includes(p)) return;
    seen.push(p);
    try {
      localStorage.setItem(key, JSON.stringify(seen));
    } catch {
      // No storage: the intro just shows again next time.
    }
    const touch = matchMedia('(pointer: coarse)').matches;
    const text: Record<PresetId, string> = {
      sunup: touch
        ? 'Drag on the left of the screen to walk and tap the round button to use your tool. Pull the radishes, water the carrots, then sleep.'
        : 'Walk with WASD, face a plot and press Space. Number keys change tools. Pull the radishes, water the carrots, then press Enter to sleep.',
      patchwork: 'Tap plots to plant, water and harvest. Each costs a move. The line above the tools shows what neighbours do for quality. End the day when your moves are spent.',
      bushel: `${touch ? 'Drag' : 'Click and drag'} across plots to queue jobs. Your hand harvests, waters and replants on their own. Fill orders from the panel, then speed time up.`,
    };
    setTimeout(() => this.toast(`<b>How to play ${esc(PRESETS[p].name)}</b><br>${text[p]}`, 'big', 9000), 900);
  }

  private morning(s: WorldState): void {
    const r = s.report;
    if (!r) return;
    if (s.rules.clock === 'flow' && s.speed > 1) return;
    const sold = r.sold.reduce((a, x) => a + x.n, 0);
    const value = r.sold.reduce((a, x) => a + x.value, 0);
    const bits: string[] = [];
    if (sold) bits.push(`Sold ${sold} for ${fmt(value)}`);
    if (r.grew) bits.push(`${r.grew} grew`);
    if (r.crewWork) bits.push(`the crew did ${r.crewWork} jobs overnight`);
    if (r.wages) bits.push(`wages ${r.wages}`);
    if (r.withered) bits.push(`${r.withered} withered`);
    if (r.eaten) bits.push(`crows ate ${r.eaten}`);
    const weather = WEATHER_NAMES[s.weather].toLowerCase();
    this.toast(`<b>${SEASON_NAMES[season(s.day)]} ${dayOfSeason(s.day)}</b>, ${weather}<br>${bits.length ? bits.join(', ') : 'A quiet night'}.`, 'big', 3800);
  }

  toast(html: string, kind: string, ms = 2400): void {
    const t = el('div', `card toast ${kind}`, html);
    this.toasts.append(t);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild!.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 320);
    }, ms);
  }

  float(x: number, y: number, text: string, deny = false): void {
    const p = this.host.project(x, y, 0.8);
    if (!p) return;
    const f = el('div', `floater ${deny ? 'no' : ''}`);
    f.textContent = text;
    f.style.left = `${p.x}px`;
    f.style.top = `${p.y}px`;
    this.floaters.append(f);
    setTimeout(() => f.remove(), 1150);
  }

  /** The names of the hands, for the board. */
  static handName(n: number): string {
    return HAND_NAMES[n] ?? 'A hand';
  }
}
