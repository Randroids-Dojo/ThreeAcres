import { Tutor } from '../src/games/homestead/lessons';
import { sowing } from '../src/sim/actions';
import { wellsFrom } from '../src/sim/actors';
import { botCommands, newBot } from '../src/sim/bot';
import type { Command } from '../src/sim/commands';
import { DAY_MINUTES } from '../src/sim/constants';
import { CROP_IDS, CROPS, stageOf } from '../src/sim/crops';
import { canMeet, isTaken, lastSowOf, offered, stillToSow } from '../src/sim/goals';
import { PRESETS, type PresetId } from '../src/sim/presets';
import { step } from '../src/sim/step';
import { createWorld, walkable } from '../src/sim/world';
import type { CropId, Order, Rules, SimEvent, ToolId, WorldState } from '../src/sim/types';

export function world(rules: Rules | PresetId, seed = 42): WorldState {
  return createWorld(seed, typeof rules === 'string' ? PRESETS[rules].rules : rules);
}

/** Things that must hold after every step under any mix. */
export function invariants(s: WorldState): string[] {
  const bad: string[] = [];
  const f = s.actors[0];
  if (!Number.isFinite(f.x) || !Number.isFinite(f.y)) bad.push('farmer position not finite');
  for (const a of s.actors) {
    if (a.away) continue;
    if (!walkable(s, Math.floor(a.x), Math.floor(a.y))) bad.push(`${a.name} stands on a blocked tile ${a.x.toFixed(2)},${a.y.toFixed(2)}`);
  }
  if (s.ap < 0 || s.ap > s.apMax) bad.push(`ap ${s.ap}`);
  if (s.stamina < 0 || s.stamina > s.staminaMax) bad.push(`stamina ${s.stamina}`);
  if (s.minute < 0 || s.minute > DAY_MINUTES) bad.push(`minute ${s.minute}`);
  if (s.coins < 0 || !Number.isFinite(s.coins)) bad.push(`coins ${s.coins}`);
  for (const j of s.jobs) {
    if (j.claimedBy !== null) {
      const a = s.actors.find((o) => o.id === j.claimedBy);
      if (!a) bad.push(`job ${j.id} claimed by nobody`);
      else if (a.away) bad.push(`job ${j.id} claimed by ${a.name} who is away`);
    }
  }
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (!c) continue;
    if (s.tiles[i] !== 'field') bad.push(`crop off the field at ${i}`);
    if (!c.dead && c.stage !== stageOf(c.kind, c.age)) bad.push(`${c.kind} at ${i} stage ${c.stage} age ${c.age}`);
    if (c.age > CROPS[c.kind].days + 0.001) bad.push(`${c.kind} overgrown`);
  }
  for (const k of Object.keys(s.stock) as (keyof typeof s.stock)[]) if (s.stock[k].some((n) => n < 0)) bad.push(`negative stock ${k}`);
  return bad;
}

export interface RunResult {
  events: SimEvent[];
  steps: number;
  problems: string[];
}

/** Play with the bot until `days` have passed (or a step cap), checking invariants. */
export function play(
  s: WorldState,
  days: number,
  opts: { dt?: number; maxSteps?: number; pace?: number; each?: (s: WorldState, i: number) => Command[]; after?: (s: WorldState, ev: SimEvent[]) => void } = {},
): RunResult {
  const bot = newBot(opts.pace);
  const dt = opts.dt ?? 1 / 30;
  const target = s.day + days;
  const max = opts.maxSteps ?? 400000;
  const events: SimEvent[] = [];
  const problems: string[] = [];
  let i = 0;
  for (; i < max && s.day < target; i++) {
    const cmds = [...(opts.each?.(s, i) ?? []), ...botCommands(s, bot, dt)];
    const ev = step(s, dt, cmds);
    opts.after?.(s, ev);
    for (const e of ev) events.push(e);
    const bad = invariants(s);
    if (bad.length) {
      problems.push(`day ${s.day} step ${i}: ${bad.join('; ')}`);
      if (problems.length > 5) break;
    }
  }
  return { events, steps: i, problems };
}

/** Sunup: mark lessons finished and the features they bring in, as if the farm had been taught them. */
export function teach(s: WorldState, lessons: string[], features: string[] = []): WorldState {
  // (Round 11: the sweep lesson is told apart from the lessons a test is about: a farm taught anything has had it. A test of
  // the sweep lesson takes it off again.)
  if (!s.learn.includes('lesson:sweep')) s.learn.push('lesson:sweep');
  for (const id of lessons) if (!s.learn.includes(`lesson:${id}`)) s.learn.push(`lesson:${id}`);
  for (const f of features) if (!s.learn.includes(f)) s.learn.push(f);
  return s;
}

/** Sunup's lessons in order up to the requests, with what they bring in. */
export const EARLY = ['pull', 'water', 'well', 'sleep', 'broke', 'plant'];
export const EARLY_FEATURES = ['can', 'sleep', 'coins', 'seeds', 'stamina'];

/** Stand the farmer on a tile, facing a way, idle. */
export function stand(s: WorldState, x: number, y: number, facing: 'n' | 'e' | 's' | 'w'): void {
  const f = s.actors[0];
  f.x = x + 0.5;
  f.y = y + 0.5;
  f.facing = facing;
  f.angle = { n: -Math.PI / 2, s: Math.PI / 2, e: 0, w: Math.PI }[facing];
  f.task = null;
  f.path = [];
  f.aim = null;
}

/**
 * Round 10: a player who follows Sunup's lessons, in the simulation. The real
 * lesson tutor runs beside the farm (it brings each tool and system in, as the
 * game does), and the player does what a person reading its line would: picks
 * what is ripe, waters what is thirsty (filling the can at the nearer well),
 * shoos crows, picks bugs, clears withered crops, hoes new meadow, reads the
 * board when the line says so or a note is new, accepts one side of each pair
 * (`pick`), buys the field and builds when a line says to, plants for its
 * requests, plants when a line says "Plant", and goes to bed once nothing is
 * left. `greedy` also fills every bare plot with the cheapest seed that can go
 * in (the tenth playtest's tester sowed all sixteen plots on Spring 2); without
 * it the player plants only what a line or a request asks. One action every
 * `pace` seconds, and a pause to read each new line. It reads the farm through
 * the simulation and the tutor only, so it runs on older code as well.
 */
export interface Follower {
  /** Which side of a pair it takes: the bigger clear (the tester), the smaller, the one in time for the fair while it still wants requests, the bold or the safe sort. */
  pick: 'clear' | 'small' | 'fair' | 'bold' | 'safe';
  greedy: boolean;
  pace: number;
}

export interface FollowResult {
  fairs: { day: number; got: number; want: number; won: boolean }[];
  events: SimEvent[];
  problems: string[];
  /** Offers it took, as pinned: the day, the crop, how many, and whether it was due by the season's fair. */
  taken: { day: number; crop: string; n: number; due: number; fairDay: number | null }[];
  /** Mornings the board held fewer than two offers it could accept, with the day. */
  singles: number[];
  lines: string[];
  /**
   * Each morning's offers as pinned at dawn (after the first request): how many, whether the fair still wanted
   * requests, and how many sides of a pair were due by it (a pair with one side due by the fair and the other after
   * it is one whose days matter to it), and why the board says there is one or none.
   */
  mornings: { day: number; offers: number; wants: boolean; inTime: number; why: string; apart: boolean }[];
}

export function follow(s: WorldState, days: number, opts: Partial<Follower> = {}, more: { each?: (s: WorldState, i: number) => Command[]; after?: (s: WorldState, ev: SimEvent[]) => void } = {}): FollowResult {
  const o: Follower = { pick: opts.pick ?? 'clear', greedy: opts.greedy ?? true, pace: opts.pace ?? 0.9 };
  const tutor = new Tutor();
  const dt = 0.1;
  const target = s.day + days;
  const events: SimEvent[] = [];
  const problems: string[] = [];
  const fairs: FollowResult['fairs'] = [];
  const taken: FollowResult['taken'] = [];
  const singles: number[] = [];
  const mornings: FollowResult['mornings'] = [];
  const lines = new Set<string>();
  let wait = 0;
  let lastLine = '';
  let seenReport: unknown = null;
  let lastBoardDay = -1;
  const owned = (i: number) => s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned && s.tiles[i] === 'field' && !s.builds.some((b) => b.y * s.W + b.x === i);
  const nearestOf = (test: (i: number) => boolean): { x: number; y: number } | null => {
    const f = s.actors[0];
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (let i = 0; i < s.plots.length; i++) {
      if (!owned(i) || !test(i)) continue;
      const x = i % s.W;
      const y = Math.floor(i / s.W);
      const d = Math.abs(x + 0.5 - f.x) + Math.abs(y + 0.5 - f.y);
      if (d < bd) {
        bd = d;
        best = { x, y };
      }
    }
    return best;
  };
  const sowable = (c: CropId) => sowing(s.day, c).ok;
  const cheapest = (): CropId | null => {
    const ok = CROP_IDS.filter((c) => sowable(c) && CROPS[c].regrow === 0 && CROPS[c].seed <= s.coins).sort((a, b) => CROPS[a].seed - CROPS[b].seed);
    return ok[0] ?? null;
  };
  const choose = (offers: Order[]): Order | null => {
    if (!offers.length) return null;
    const clear = (q: Order) => q.reward - q.items[0].n * CROPS[q.items[0].crop].seed;
    const big = offers.reduce((a, b) => (clear(b) > clear(a) ? b : a));
    const small = offers.reduce((a, b) => (clear(b) < clear(a) ? b : a));
    if (o.pick === 'clear') return big;
    if (o.pick === 'small') return small;
    if (o.pick === 'fair') {
      const f = s.fair;
      const inTime = offers.filter((q) => !!f && q.due <= f.day && q.due >= f.start);
      const coming = s.orders.filter((q) => isTaken(q) && !!f && q.due <= f.day && q.due >= f.start).length;
      if (f && s.day <= f.day && f.got + coming < f.want && inTime.length) return inTime.reduce((a, b) => (clear(b) > clear(a) ? b : a));
      return big;
    }
    const bold = new Set(['rush', 'long', 'big']);
    return offers.find((q) => (o.pick === 'bold') === bold.has(q.kind ?? 'single')) ?? offers[0];
  };
  for (let i = 0; i < 400000 && s.day < target; i++) {
    const cmds: Command[] = [...(more.each?.(s, i) ?? [])];
    const lesson = tutor.update(s, dt, true, true);
    cmds.push(...lesson.cmds);
    if (lesson.line && lesson.line !== lastLine) {
      lastLine = lesson.line;
      lines.add(lesson.line);
      wait = Math.max(wait, 2);
    }
    if (s.report && s.report !== seenReport) {
      seenReport = s.report;
      if (s.report.fair) fairs.push({ day: s.report.day, ...s.report.fair });
    }
    const f = s.actors[0];
    const busy = !!(f.task || f.path.length || f.aim || s.taps?.length);
    wait -= dt;
    if (s.turnover < 0 && !busy && wait <= 0) {
      wait = o.pace;
      const line = lesson.line;
      const learnt = (w: string) => s.learn.includes(w);
      const crow = s.crows.find((c) => c.phase === 'in' || c.phase === 'peck');
      const at = (t: { x: number; y: number }) => cmds.push({ type: 'actAt', x: t.x, y: t.y });
      const tool = (t: ToolId) => s.tool !== t && cmds.push({ type: 'tool', tool: t });
      const crop = (i: number) => s.plots[i].crop;
      const ripe = nearestOf((i) => !!crop(i) && !crop(i)!.dead && crop(i)!.stage === 4);
      const bugs = nearestOf((i) => !!crop(i) && !crop(i)!.dead && crop(i)!.bugs > 0 && crop(i)!.stage < 4);
      const dead = nearestOf((i) => !!crop(i) && crop(i)!.dead);
      const thirsty = learnt('can') ? nearestOf((i) => !!crop(i) && !crop(i)!.dead && crop(i)!.stage < 4 && !s.plots[i].wet) : null;
      const meadow = learnt('hoe') ? nearestOf((i) => !s.plots[i].tilled && !crop(i)) : null;
      const bare = nearestOf((i) => s.plots[i].tilled && !crop(i));
      const newNotes = s.orders.some((q) => q.seen === false);
      // A request it took that still wants seed, the one to sow soonest first.
      const owe = s.orders.filter((q) => isTaken(q) && s.day <= lastSowOf(q) && stillToSow(s, q) > 0 && sowable(q.items[0].crop) && CROPS[q.items[0].crop].seed <= s.coins).sort((a, b) => lastSowOf(a) - lastSowOf(b))[0];
      if (crow) at({ x: crow.x, y: crow.y });
      else if (bugs) {
        tool('hands');
        at(bugs);
      }
      // The morning card says when new requests are on the board: it is read first, as the tester did.
      else if (learnt('board') && (/board/i.test(line) || /smith/i.test(line) || (newNotes && lastBoardDay !== s.day) || (newNotes && /request/i.test(line)))) {
        // Read the board: offers that no longer fit are made again (as its tab renders), then one side of a pair.
        lastBoardDay = s.day;
        for (const e of step(s, 0, [{ type: 'freshen' }, { type: 'readBoard' }])) events.push(e);
        tutor.board(s);
        const offers = s.orders.filter((q) => offered(q) && canMeet(s, q));
        if (offers.length < 2) singles.push(s.day);
        const pick = choose(offers);
        if (pick) {
          cmds.push({ type: 'accept', id: pick.id });
          taken.push({ day: s.day, crop: pick.items[0].crop, n: pick.items[0].n, due: pick.due, fairDay: s.fair ? s.fair.day : null });
        }
      } else if (ripe) {
        // (A ripe crop tapped with Seeds in hand is picked and its plot sown again with the seed in hand: a player
        // with a request still wanting seed picks that seed first.)
        if (s.tool === 'seeds' && owe && s.seed !== owe.items[0].crop) cmds.push({ type: 'seed', crop: owe.items[0].crop });
        at(ripe);
      }
      else if (dead) at(dead);
      else if (thirsty && s.water <= 0) {
        const w = wellsFrom(f.x, f.y)[0];
        tool('can');
        at(w);
      } else if (thirsty) {
        tool('can');
        at(thirsty);
      } else if (/Buy a second field/.test(line) && !s.parcels[1].owned) cmds.push({ type: 'buyParcel', id: 1 });
      else if (lesson.build && lesson.point && s.coins >= (lesson.build === 'sprinkler' ? 200 : 40)) cmds.push({ type: 'buildAt', x: Math.floor(lesson.point.x), y: Math.floor(lesson.point.y), kind: lesson.build });
      else if (/whole farm/.test(line)) cmds.push({ type: 'rules', patch: { camera: s.rules.camera === 'wide' ? 'close' : 'wide' } });
      else if (meadow) {
        tool('hoe');
        at(meadow);
      } else if (owe && bare) {
        tool('seeds');
        if (s.seed !== owe.items[0].crop) cmds.push({ type: 'seed', crop: owe.items[0].crop });
        at(bare);
      } else if (bare && learnt('seeds') && (o.greedy || /^Plant/.test(line)) && cheapest()) {
        // The turn line asks for next season's seed; otherwise the cheapest that can go in.
        const next = /ends soon/.test(line) ? CROP_IDS.find((c) => sowing(s.day, c).next && CROPS[c].seed <= s.coins && CROPS[c].regrow === 0) : undefined;
        const c = next ?? cheapest()!;
        tool('seeds');
        if (s.seed !== c) cmds.push({ type: 'seed', crop: c });
        at(bare);
      } else if (!/Watch|forecast|fair|Fill|smith|View|Press C|Drag|Hold Space/.test(line) || s.minute > 600) cmds.push({ type: 'sleep' });
    }
    const ev = step(s, dt, cmds);
    for (const e of ev) {
      tutor.onEvent(s, e);
      events.push(e);
    }
    if (ev.some((e) => e.type === 'dawn') && s.fair !== undefined) {
      const offers = s.orders.filter(offered);
      const f = s.fair;
      const filled = f ? f.got + s.orders.filter((q) => isTaken(q) && q.due >= f.start && q.due <= f.day).length : 0;
      // (`apart`: a pair whose two sides are due in different seasons, so they count for different fairs.)
      const seasonOf = (day: number) => Math.floor((day - 1) / 10);
      mornings.push({ day: s.day, offers: offers.length, wants: !!f && s.day >= f.start && s.day <= f.day && filled < f.want, inTime: f ? offers.filter((q) => q.due >= f.start && q.due <= f.day).length : 0, why: s.offerWhy ?? '', apart: offers.length === 2 && seasonOf(offers[0].due) !== seasonOf(offers[1].due) });
    }
    more.after?.(s, ev);
    const bad = invariants(s);
    if (bad.length) {
      problems.push(`day ${s.day} step ${i}: ${bad.join('; ')}`);
      if (problems.length > 5) break;
    }
  }
  return { fairs, events, problems, taken, singles, lines: [...lines], mornings };
}
