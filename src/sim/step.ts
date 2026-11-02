// One tick of the farm. Applies the player's commands, moves the clock by the
// current clock rule, runs people and crows, and returns what happened.

import { canAfford, daySeconds, fieldRep, homestead, resolve, resolveBuild } from './actions';
import { dropJobsOf, facingTile, farmer, hands, queueTap, snapAim, startAction, tapTool, tickActors, tileOf, walkFarmer, walkTo, wellTap } from './actors';
import type { Command } from './commands';
import { CAN_WATER, CROW_FLY_SECONDS, CROW_PECK_MINUTES, CROW_SCARE_RANGE, DAY_MINUTES, FLOW_SECONDS, FLOW_SPEEDS, HAND_HIRE, HAND_NAMES, HANDS_MAX, MIDDAY_MINUTE, NIGHT_SECONDS, SUNUP_CROW_PECK_SECONDS, TOOL_UPGRADES } from './constants';
import { CROPS } from './crops';
import { crowTarget, landBugs, nightfall, turnsMinute } from './day';
import { acceptRequest, checkMilestones, claimCrops, deliver, draft, dropLost, fillOrders, fillRequests, joinAlmanac, lostFor, readRequests, sellCrop, updateGoals } from './goals';
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
  // Sunup's new save holds the clock until the farmer first does something (a lesson's unlock is not the farmer).
  if (s.held && commands.some((c) => (c.type === 'move' ? Math.hypot(c.x, c.y) >= 0.15 : c.type !== 'unlock' && c.type !== 'rules' && c.type !== 'speed'))) s.held = false;
  for (const c of commands) {
    if (c.type === 'move') move = c;
    else command(s, c, ev);
  }
  // Pushing the stick takes over: taps still waiting are dropped.
  if (s.taps?.length && Math.hypot(move.x, move.y) >= 0.15 && s.rules.control === 'walk') s.taps = [];

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
      if (!s.held) s.minute += (dt * DAY_MINUTES) / daySeconds(s);
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
  // Storms rumble through the day, not just at dawn: about every twelve seconds.
  if (s.weather === 'storm' && !frozen && rand(s) < dt * 0.08) ev.push({ type: 'thunder' });

  if (s.rules.growth === 'synergy') refreshQuality(s);
  if (s.rules.goal === 'almanac') {
    if (!s.almanac.goals.length) joinAlmanac(s);
    updateGoals(s, ev);
  }
  if (s.rules.goal === 'orders' && !s.orders.length) fillOrders(s);
  // The first request comes as soon as the board brings requests in; the rest come with the mornings.
  if (homestead(s) && s.learn.includes('requests') && !s.requested && !s.orders.length) fillRequests(s);
  // Sunup: at 13:00 bugs land again, as they do at dawn, so the afternoon has a look worth taking.
  if (homestead(s) && s.rules.clock === 'day' && minutesBefore < MIDDAY_MINUTE && s.minute >= MIDDAY_MINUTE && s.midday !== s.day && s.learn.includes('pests') && s.rules.weather === 'wild') {
    s.midday = s.day;
    landBugs(s, ev);
  }
  if (s.rules.crew === 'crew' && !s.actors.some((a) => a.role === 'hand')) hire(s, ev, true);
  // Sunup: seed sown for a request the player took is marked as its own (round 6: only that counts towards it).
  if (homestead(s) && s.orders.length && (ev.some((e) => e.type === 'plant') || commands.some((c) => c.type === 'accept'))) claimCrops(s);
  // Round 7: a crop sown for a request lost by day can leave the request nothing to come: it is lost there and then.
  if (homestead(s) && s.orders.length && s.turnover < 0 && ev.some((e) => e.type === 'crowEat')) dropLost(s, ev);
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
  s.taps = [];
  for (const a of s.actors) {
    a.moving = false;
    a.hop = 0;
  }
  ev.push({ type: 'night' });
}

// ---------------------------------------------------------------- crows

/** Game minutes a crow pecks before it eats. Sunup's crow is as patient in real seconds whatever the day's length. */
export function peckMinutes(s: WorldState): number {
  return homestead(s) && s.rules.clock === 'day' ? (SUNUP_CROW_PECK_SECONDS * DAY_MINUTES) / daySeconds(s) : CROW_PECK_MINUTES;
}

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
        if (c.t >= peckMinutes(s)) {
          lostFor(s, p.crop, 'crows');
          const kind = p.crop.kind;
          const req = p.crop.for;
          p.crop = null;
          s.almanac.withered++;
          // Counted for the morning card with the night's (round 6: crops taken by day went unreported).
          s.eatenToday = (s.eatenToday ?? 0) + 1;
          ev.push({ type: 'crowEat', id: c.id, x: c.x, y: c.y, crop: kind, ...(req !== undefined ? { req } : {}) });
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
      // Sunup snaps to the nearest useful plot in reach when the one in front has nothing to do.
      const useful = (x: number, y: number) => {
        const r = resolve(s, s.tool, x, y);
        return !!(r.verb && r.ok);
      };
      const t = (homestead(s) ? snapAim(f, useful, !!c.held) : null) ?? facingTile(f);
      if (!inMap(t.x, t.y)) return;
      const r = resolve(s, s.tool, t.x, t.y);
      // Too tired, a held key says it once (the press), not again with every repeat.
      if (r.verb && r.ok && c.held && canAfford(s, r.verb)) return;
      if (r.verb && r.ok) startAction(s, f, r, t.x, t.y, ev);
      // A held key walking past nothing to do says nothing; a press says why not.
      else if (r.reason && !c.held) ev.push({ type: 'deny', x: t.x, y: t.y, reason: r.reason });
      break;
    }
    case 'actAt': {
      if (!awake || s.rules.control !== 'walk') return;
      if (!inMap(c.x, c.y)) return;
      const r = resolve(s, s.tool, c.x, c.y);
      // A tap on a field for sale offers it, from wherever the farmer stands.
      if (r.reason === 'unowned') {
        ev.push({ type: 'deny', x: c.x, y: c.y, reason: r.reason });
        break;
      }
      if (homestead(s)) {
        // Sunup: a tap beside a well means the well, and a tap is for the job on its plot, with the tool for it.
        // Taps made while the farmer is busy wait their turn, so quick taps on three radishes harvest three. Round 8:
        // each keeps the tool and seed it was tapped with, and the hand takes that tool now, as it is tapped (it used
        // to change when the tap's turn came, under a player who had picked another tool since).
        const t = wellTap(s, c.x, c.y) ?? { x: c.x, y: c.y };
        const tool = tapTool(s, s.tool, t.x, t.y);
        if (tool !== s.tool) {
          s.tool = tool;
          s.kitTool = tool;
        }
        queueTap(s, f, { x: t.x, y: t.y, tool, ...(tool === 'seeds' ? { seed: s.seed } : {}) }, ev);
        break;
      }
      if (f.task) return;
      const t = tileOf(f);
      const near = Math.max(Math.abs(t.x - c.x), Math.abs(t.y - c.y)) <= 1;
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
      if (!p || p.owned || s.coins < p.price || s.rep < fieldRep(s, c.id)) return;
      s.coins -= p.price;
      p.owned = true;
      ev.push({ type: 'buy', item: `field:${p.id}`, cost: p.price });
      // A field is bought as meadow: however it was bought, the hoe comes with it.
      if (homestead(s) && !s.learn.includes('hoe')) {
        s.learn.push('hoe');
        ev.push({ type: 'unlock', what: 'hoe' });
      }
      // Round 8: the second field comes with the copper can, which waters a whole row a tap (the eighth playtest's
      // daily loop was thirty identical watering taps; two fields overflowed the day while spring was slack).
      if (homestead(s) && s.tools.can < 1 && s.parcels.filter((q) => q.owned).length >= 2) {
        s.tools.can = 1;
        s.water = CAN_WATER[1];
        ev.push({ type: 'upgrade', tool: 'can', level: 1, withField: true });
      }
      break;
    }
    case 'hire':
      hire(s, ev, false);
      break;
    case 'unlock':
      if (!s.learn.includes(c.what)) {
        s.learn.push(c.what);
        ev.push({ type: 'unlock', what: c.what });
      }
      break;
    case 'upgrade': {
      const level = s.tools[c.tool];
      const next = TOOL_UPGRADES[c.tool][level];
      if (!next || s.rep < next.rep || s.coins < next.cost) return;
      s.coins -= next.cost;
      s.tools[c.tool] = level + 1;
      if (c.tool === 'can') s.water = CAN_WATER[s.tools.can];
      ev.push({ type: 'upgrade', tool: c.tool, level: level + 1 });
      ev.push({ type: 'buy', item: `${c.tool}:${level + 1}`, cost: next.cost });
      break;
    }
    case 'deliver':
      deliver(s, c.id, ev);
      break;
    case 'accept':
      if (homestead(s)) acceptRequest(s, c.id, ev);
      break;
    case 'readBoard':
      if (homestead(s)) readRequests(s);
      break;
    case 'buildAt': {
      // Sunup: one build on one plot, from the lesson's pointer once the player has said yes. The tool in hand stays
      // in hand, so the taps after it do their own jobs (the fifth playtest's pointer took the Build tool, and five
      // later taps built five scarecrows).
      if (!awake || s.rules.control !== 'walk' || !homestead(s) || !inMap(c.x, c.y)) return;
      const r = resolveBuild(s, c.kind, c.x, c.y);
      if (!r.ok) {
        if (r.reason) ev.push({ type: 'deny', x: c.x, y: c.y, reason: r.reason });
        return;
      }
      queueTap(s, f, { x: c.x, y: c.y, tool: s.tool, build: c.kind }, ev);
      break;
    }
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
