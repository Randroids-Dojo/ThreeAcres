// One tick of the farm. Applies the player's commands, moves the clock by the
// current clock rule, runs people and crows, and returns what happened.

import { canAfford, resolve } from './actions';
import { dropJobsOf, facingTile, farmer, hands, startAction, tickActors, tileOf, walkFarmer, walkTo } from './actors';
import type { Command } from './commands';
import { CROW_FLY_SECONDS, CROW_PECK_MINUTES, CROW_SCARE_RANGE, DAY_MINUTES, DAY_SECONDS, FLOW_SECONDS, FLOW_SPEEDS, HAND_HIRE, HAND_NAMES, HANDS_MAX, NIGHT_SECONDS } from './constants';
import { CROPS } from './crops';
import { crowTarget, nightfall, turnsMinute } from './day';
import { checkMilestones, deliver, draft, fillOrders, joinAlmanac, sellCrop, updateGoals } from './goals';
import { BUNK } from './map';
import { matchPreset, AXES } from './presets';
import { rand } from './rng';
import { refreshQuality } from './soil';
import { calmed } from './weather';
import { idx, inMap } from './world';
import type { Actor, Axis, Rules, SimEvent, WorldState } from './types';

export function step(s: WorldState, dt: number, commands: Command[] = []): SimEvent[] {
  const ev: SimEvent[] = [];
  dt = Math.max(0, Math.min(0.1, dt));
  s.time += dt;
  countPlaytime(s, dt);

  let move = { x: 0, y: 0 };
  for (const c of commands) {
    if (c.type === 'move') move = c;
    else command(s, c, ev);
  }

  // The night transition: everything waits, the day turns over in the dark.
  if (s.turnover >= 0) {
    const before = s.turnover;
    s.turnover += dt / NIGHT_SECONDS[s.rules.clock];
    if (before < 0.5 && s.turnover >= 0.5) nightfall(s, ev);
    if (s.turnover >= 1) {
      s.turnover = -1;
      s.night = 0;
    } else s.night = Math.sin(Math.PI * s.turnover);
    return ev;
  }

  // The clock.
  const minutesBefore = s.minute;
  switch (s.rules.clock) {
    case 'day':
      s.minute += (dt * DAY_MINUTES) / DAY_SECONDS;
      break;
    case 'flow':
      s.minute += (dt * s.speed * DAY_MINUTES) / FLOW_SECONDS;
      break;
    case 'turns':
      s.minute = turnsMinute(s);
      break;
  }
  const gameMinutes = Math.max(0, s.minute - minutesBefore);

  // A paused flow clock holds everyone still; jobs can still be painted.
  const frozen = s.rules.clock === 'flow' && s.speed === 0;
  if (!frozen) {
    if (s.rules.control === 'walk') walkFarmer(s, move.x, move.y, dt, ev);
    tickActors(s, dt, ev);
    tickCrows(s, dt, gameMinutes, ev);
  } else for (const a of s.actors) a.moving = false;

  if (s.rules.growth === 'synergy') refreshQuality(s);
  if (s.rules.goal === 'almanac') {
    if (!s.almanac.goals.length) joinAlmanac(s);
    updateGoals(s, ev);
  }
  if (s.rules.goal === 'orders' && !s.orders.length) fillOrders(s);
  if (s.rules.crew === 'crew' && !s.actors.some((a) => a.role === 'hand')) hire(s, ev, true);
  checkMilestones(s, ev);

  if ((s.rules.clock === 'day' || s.rules.clock === 'flow') && s.minute >= DAY_MINUTES) {
    s.minute = DAY_MINUTES;
    beginNight(s, ev);
  }
  return ev;
}

function beginNight(s: WorldState, ev: SimEvent[]): void {
  if (s.turnover >= 0) return;
  s.turnover = 0;
  s.night = 0;
  for (const a of s.actors) {
    a.moving = false;
    a.hop = 0;
  }
  ev.push({ type: 'night' });
}

// ---------------------------------------------------------------- crows

function tickCrows(s: WorldState, dt: number, gameMinutes: number, ev: SimEvent[]): void {
  while (s.crowPlan.length && s.minute >= s.crowPlan[0]) {
    s.crowPlan.shift();
    const t = crowTarget(s);
    if (!t) continue;
    const side = rand(s) < 0.5;
    const id = s.nextId++;
    s.crows.push({ id, x: t.x, y: t.y, fromX: side ? -3 : s.W + 3, fromY: 1 + rand(s) * (s.H - 2), phase: 'in', t: 0 });
    ev.push({ type: 'crowIn', id, x: t.x, y: t.y });
  }
  for (const c of s.crows) {
    switch (c.phase) {
      case 'in':
        c.t += dt;
        if (c.t >= CROW_FLY_SECONDS) {
          c.phase = 'peck';
          c.t = 0;
        }
        break;
      case 'peck': {
        const p = s.plots[idx(c.x, c.y)];
        if (!p.crop || p.crop.dead) {
          c.phase = 'flee';
          c.t = 0;
          break;
        }
        if (s.rules.clock !== 'turns') c.t += gameMinutes;
        if (c.t >= CROW_PECK_MINUTES) {
          p.crop = null;
          s.almanac.withered++;
          ev.push({ type: 'crowEat', id: c.id, x: c.x, y: c.y });
          c.phase = 'flee';
          c.t = 0;
        }
        break;
      }
      case 'flee':
        c.t += dt;
        if (c.t >= CROW_FLY_SECONDS) c.phase = 'gone';
        break;
      case 'gone':
        break;
    }
    // Anyone walking close sends it off.
    if (c.phase === 'peck' || (c.phase === 'in' && c.t > CROW_FLY_SECONDS * 0.6)) {
      for (const a of s.actors) {
        if (a.away) continue;
        if (Math.hypot(a.x - (c.x + 0.5), a.y - (c.y + 0.5)) <= CROW_SCARE_RANGE) {
          c.phase = 'flee';
          c.t = 0;
          ev.push({ type: 'crowScared', id: c.id, x: c.x, y: c.y });
          break;
        }
      }
    }
  }
  if (s.crows.some((c) => c.phase === 'gone')) s.crows = s.crows.filter((c) => c.phase !== 'gone');
}

// ---------------------------------------------------------------- commands

function command(s: WorldState, c: Command, ev: SimEvent[]): void {
  const f = farmer(s);
  const awake = s.turnover < 0;
  switch (c.type) {
    case 'move':
      break;
    case 'act': {
      if (!awake || s.rules.control !== 'walk' || f.task) return;
      const t = facingTile(f);
      if (!inMap(t.x, t.y)) return;
      const r = resolve(s, s.tool, t.x, t.y);
      if (r.verb && r.ok) startAction(s, f, r, t.x, t.y, ev);
      else if (r.reason) ev.push({ type: 'deny', x: t.x, y: t.y, reason: r.reason });
      break;
    }
    case 'actAt': {
      if (!awake || s.rules.control !== 'walk' || f.task) return;
      if (!inMap(c.x, c.y)) return;
      const t = tileOf(f);
      const near = Math.max(Math.abs(t.x - c.x), Math.abs(t.y - c.y)) <= 1;
      const r = resolve(s, s.tool, c.x, c.y);
      if (near) {
        if (r.verb && r.ok) startAction(s, f, r, c.x, c.y, ev);
        else if (r.reason) ev.push({ type: 'deny', x: c.x, y: c.y, reason: r.reason });
      } else {
        walkTo(s, f, c.x, c.y, !!(r.verb && r.ok));
      }
      break;
    }
    case 'paint': {
      if (!awake || s.rules.control !== 'point') return;
      if (!inMap(c.x, c.y)) return;
      if (s.jobs.some((j) => j.x === c.x && j.y === c.y)) return;
      if (s.actors.some((a) => a.task && a.task.x === c.x && a.task.y === c.y)) return;
      const r = resolve(s, s.tool, c.x, c.y);
      if (!r.verb || !r.ok) {
        if (r.reason) ev.push({ type: 'deny', x: c.x, y: c.y, reason: r.reason });
        return;
      }
      // Moves and stamina are spent when the job is done; under turns a job also reserves its move.
      const reserved = s.rules.clock === 'turns' ? s.jobs.length : 0;
      const why = canAfford(s, r.verb, reserved);
      if (why) {
        ev.push({ type: 'deny', x: c.x, y: c.y, reason: why });
        return;
      }
      s.jobs.push({ id: s.nextId++, verb: r.verb, x: c.x, y: c.y, crop: r.crop, build: r.build, claimedBy: null });
      break;
    }
    case 'unpaint': {
      const j = s.jobs.find((o) => o.x === c.x && o.y === c.y);
      if (!j) return;
      s.jobs = s.jobs.filter((o) => o !== j);
      for (const a of s.actors) if (a.job === j.id) dropJobsOf(s, a);
      break;
    }
    case 'cancelJobs':
      s.jobs = [];
      for (const a of s.actors) if (a.job !== null) dropJobsOf(s, a);
      break;
    case 'tool':
      if (c.tool === 'smart' && s.rules.tools !== 'smart') return;
      s.tool = c.tool;
      if (c.tool !== 'smart') s.kitTool = c.tool;
      break;
    case 'seed':
      s.seed = c.crop;
      break;
    case 'buildKind':
      s.buildKind = c.kind;
      break;
    case 'sleep':
      if (awake) beginNight(s, ev);
      break;
    case 'buyParcel': {
      const p = s.parcels[c.id];
      if (!p || p.owned || s.coins < p.price) return;
      s.coins -= p.price;
      p.owned = true;
      ev.push({ type: 'buy', item: `field:${p.id}`, cost: p.price });
      break;
    }
    case 'hire':
      hire(s, ev, false);
      break;
    case 'deliver':
      deliver(s, c.id, ev);
      break;
    case 'sell': {
      const v = sellCrop(s, c.crop, ev);
      if (v) ev.push({ type: 'coins', amount: v });
      break;
    }
    case 'draft':
      if (draft(s, c.crop)) ev.push({ type: 'goal', id: `draft-${c.crop}` });
      break;
    case 'speed':
      if ((FLOW_SPEEDS as readonly number[]).includes(c.speed)) s.speed = c.speed;
      break;
    case 'rules':
      applyRules(s, c.patch, ev);
      break;
  }
}

export function hire(s: WorldState, ev: SimEvent[], free: boolean): Actor | null {
  const all = s.actors.filter((a) => a.role === 'hand');
  if (all.length >= HANDS_MAX) return null;
  if (!free && s.coins < HAND_HIRE) return null;
  if (!free) s.coins -= HAND_HIRE;
  const n = all.length;
  const a: Actor = {
    id: s.nextId++,
    role: 'hand',
    name: HAND_NAMES[n],
    x: BUNK.x + 0.5,
    y: BUNK.y + 0.5,
    facing: 's',
    angle: Math.PI / 2,
    moving: false,
    walked: 0,
    task: null,
    path: [],
    job: null,
    hop: 0,
    tint: n,
    away: s.rules.crew !== 'crew',
    aim: null,
  };
  s.actors.push(a);
  ev.push({ type: 'hire', id: a.id });
  if (!free) ev.push({ type: 'buy', item: 'hand', cost: HAND_HIRE });
  return a;
}

// ---------------------------------------------------------------- switching

/** Change rules mid-game. Never loses progress: see "Switching" in docs/DESIGN.md. */
export function applyRules(s: WorldState, patch: Partial<Rules>, ev: SimEvent[]): void {
  const prev = { ...s.rules };
  const changed: Axis[] = [];
  for (const a of AXES) {
    const v = patch[a];
    if (v !== undefined && v !== prev[a]) {
      (s.rules as unknown as Record<string, string>)[a] = v;
      changed.push(a);
    }
  }
  if (!changed.length) return;
  const r = s.rules;
  const f = farmer(s);

  if (changed.includes('clock')) {
    const left = 1 - Math.min(1, s.minute / DAY_MINUTES);
    if (r.clock === 'turns') {
      const share = prev.clock === 'day' ? Math.min(left, s.stamina / s.staminaMax) : left;
      s.ap = Math.max(1, Math.min(s.apMax, Math.ceil(s.apMax * share)));
      s.jobs = s.jobs.slice(0, s.ap);
      s.minute = turnsMinute(s);
    } else if (prev.clock === 'turns') {
      s.minute = turnsMinute(s);
      if (r.clock === 'day') s.stamina = Math.max(s.stamina > 0 ? 1 : 0, Math.round((s.staminaMax * s.ap) / s.apMax));
    }
    if (r.clock === 'flow' && s.speed === 0) s.speed = 1;
    // Crows that were waiting for a turns morning come in at once.
    if (prev.clock === 'turns') s.crowPlan = s.crowPlan.map((m) => Math.max(m, s.minute));
  }

  if (changed.includes('control')) {
    if (r.control === 'walk') {
      dropJobsOf(s, f);
      f.task = null;
      if (r.crew !== 'crew') s.jobs = [];
    } else {
      f.aim = null;
      f.path = [];
    }
  }

  if (changed.includes('crew')) {
    if (r.crew === 'crew') {
      if (!s.actors.some((a) => a.role === 'hand')) hire(s, ev, true);
      for (const h of s.actors) {
        if (h.role !== 'hand') continue;
        if (h.away) {
          h.x = BUNK.x + 0.5;
          h.y = BUNK.y + 0.5;
        }
        h.away = false;
      }
    } else {
      for (const h of s.actors) {
        if (h.role !== 'hand') continue;
        dropJobsOf(s, h);
        h.task = null;
        h.away = true;
        h.moving = false;
      }
      if (r.control === 'walk') s.jobs = [];
    }
  }

  if (changed.includes('weather') && r.weather === 'calm') {
    for (const c of s.crows) if (c.phase !== 'gone') c.phase = 'flee';
    for (const c of s.crows) c.t = 0;
    s.crowPlan = [];
    for (const p of s.plots) if (p.crop) p.crop.bugs = 0;
    s.weather = calmed(s.weather);
    s.forecast = s.forecast.map(calmed);
  }

  if (changed.includes('tools')) {
    if (r.tools === 'smart') {
      if (s.tool !== 'smart') s.kitTool = s.tool;
      s.tool = 'smart';
    } else {
      s.tool = s.kitTool === 'smart' ? 'hands' : s.kitTool;
    }
  }

  if (changed.includes('goal')) {
    if (r.goal === 'almanac') joinAlmanac(s);
    if (r.goal === 'orders') fillOrders(s);
  }

  if (changed.includes('growth')) refreshQuality(s);
  ev.push({ type: 'rules', rules: { ...r }, changed });
}

function countPlaytime(s: WorldState, dt: number): void {
  const p = s.stats.playtime;
  for (const a of AXES) {
    const k = `${a}:${s.rules[a]}`;
    p[k] = (p[k] ?? 0) + dt;
  }
  const k = `preset:${matchPreset(s.rules) ?? 'custom'}`;
  p[k] = (p[k] ?? 0) + dt;
}

/** Re-exported for the UI: how many crops of a kind are in the ground. */
export function planted(s: WorldState, kind: keyof typeof CROPS): number {
  let n = 0;
  for (const p of s.plots) if (p.crop && !p.crop.dead && p.crop.kind === kind) n++;
  return n;
}

export { hands };
