// A simple farmer that plays any mix through commands only, the same way a
// person would. Used by the tests and by ?autoplay in the browser.

import { resolve, sowing } from './actions';
import { farmer } from './actors';
import type { Command } from './commands';
import { CROP_IDS, CROPS } from './crops';
import { homestead } from './actions';
import { TOOL_UPGRADES } from './constants';
import { canDeliver } from './goals';
import { owned } from './world';
import type { CropId, ToolId, WorldState } from './types';

const KIT: ToolId[] = ['hands', 'can', 'seeds', 'hoe'];

export interface Bot {
  idle: number;
  wait: number;
  /** Seconds between actions under walk control. 0.05 is the quick bot; about a second plays at a person's pace. */
  pace: number;
}

export function newBot(pace = 0.05): Bot {
  return { idle: 0, wait: 0, pace };
}

function inGround(s: WorldState, c: CropId): number {
  let n = 0;
  for (const p of s.plots) if (p.crop && !p.crop.dead && p.crop.kind === c) n++;
  return n;
}

function bestSeed(s: WorldState): CropId {
  let allowed = s.rules.goal === 'almanac' ? s.almanac.unlocked : CROP_IDS;
  if (homestead(s)) {
    // What the sowing calendar allows today: in season and ripe before the turn, or next season's near the end.
    const ok = allowed.filter((c) => sowing(s.day, c).ok);
    allowed = ok.length ? ok : ['radish'];
  }
  // Orders and requests first: whatever one still needs and can be grown in time.
  if (homestead(s)) {
    for (const o of s.orders) {
      for (const it of o.items) {
        const have = s.stock[it.crop].reduce((a, b) => a + b, 0) + inGround(s, it.crop);
        if (have < it.n && allowed.includes(it.crop) && CROPS[it.crop].seed <= s.coins && s.day + CROPS[it.crop].days <= o.due) return it.crop;
      }
    }
  }
  if (s.rules.goal === 'orders') {
    for (const o of s.orders) {
      for (const it of o.items) {
        const have = s.stock[it.crop].reduce((a, b) => a + b, 0) + inGround(s, it.crop);
        if (have < it.n && CROPS[it.crop].seed <= s.coins) return it.crop;
      }
    }
  }
  // The almanac likes variety: plant the kind with the fewest in the ground.
  if (s.rules.goal === 'almanac') {
    const affordable = allowed.filter((c) => CROPS[c].seed <= s.coins);
    if (affordable.length) return affordable.reduce((a, b) => (inGround(s, b) < inGround(s, a) ? b : a));
  }
  let best: CropId = allowed[0];
  let bv = -Infinity;
  // Like a person, it spreads the farm over a few crops so they do not all ripen on the same day.
  const total = Math.max(1, CROP_IDS.reduce((a, c) => a + inGround(s, c), 0));
  for (const c of allowed) {
    const d = CROPS[c];
    if (d.seed > s.coins * 0.25 && c !== allowed[0]) continue;
    const v = ((d.price - d.seed) / d.days) * (homestead(s) ? 1 - 0.8 * (inGround(s, c) / total) : 1);
    if (v > bv) {
      bv = v;
      best = c;
    }
  }
  return best;
}

/** Tiles with something to do, most urgent first, and the tool for each. */
function chores(s: WorldState): { x: number; y: number; tool: ToolId }[] {
  const out: { x: number; y: number; tool: ToolId; rank: number }[] = [];
  for (let y = 0; y < s.H; y++) {
    for (let x = 0; x < s.W; x++) {
      if (!owned(s, x, y)) continue;
      if (s.jobs.some((j) => j.x === x && j.y === y)) continue;
      const tools: ToolId[] = s.rules.tools === 'smart' ? ['smart'] : KIT;
      for (const tool of tools) {
        const r = resolve(s, tool, x, y);
        if (!r.verb || !r.ok) continue;
        // A person waters crops, not bare soil.
        if (r.verb === 'water' && !s.plots[y * s.W + x].crop) continue;
        const rank = { scare: 0, harvest: 1, clear: 2, tend: 2, water: 3, plant: 4, till: 5, build: 9, refill: 6 }[r.verb];
        out.push({ x, y, tool, rank });
        break;
      }
    }
  }
  const f = farmer(s);
  out.sort((a, b) => a.rank - b.rank || Math.abs(a.x - f.x) + Math.abs(a.y - f.y) - (Math.abs(b.x - f.x) + Math.abs(b.y - f.y)));
  return out;
}

export function botCommands(s: WorldState, bot: Bot, dt: number): Command[] {
  const out: Command[] = [];
  if (s.turnover >= 0) return out;
  if (homestead(s)) for (const what of ['requests', 'pests']) if (!s.learn.includes(what)) out.push({ type: 'unlock', what });
  const f = farmer(s);

  // Spend money now and then.
  const next = s.parcels.find((p) => !p.owned);
  if (next && s.coins > next.price + 150) out.push({ type: 'buyParcel', id: next.id });
  if (s.rules.crew === 'crew' && s.coins > 600 && s.actors.filter((a) => a.role === 'hand').length < 3) out.push({ type: 'hire' });
  for (const o of s.orders) if (canDeliver(s, o)) out.push({ type: 'deliver', id: o.id });
  if (s.rules.goal === 'orders') for (const c of CROP_IDS) if (s.stock[c].some((n) => n > 0) && !s.orders.some((o) => o.items.some((it) => it.crop === c))) out.push({ type: 'sell', crop: c });
  if (s.almanac.draft) out.push({ type: 'draft', crop: s.almanac.draft[0] });
  if (s.rules.clock === 'flow' && s.speed !== 4) out.push({ type: 'speed', speed: 4 });
  const seed = bestSeed(s);
  if (s.seed !== seed) out.push({ type: 'seed', crop: seed });

  // An empty can sends the farmer to the well.
  if (homestead(s) && s.water <= 1 && s.rules.control === 'walk' && !f.task && !f.path.length && !f.aim) {
    const thirsty = s.plots.some((p) => p.crop && !p.crop.dead && p.crop.stage < 4 && !p.wet);
    if (thirsty) {
      if (s.tool !== 'can') out.push({ type: 'tool', tool: 'can' });
      out.push({ type: 'actAt', x: 11, y: 2 });
      return out;
    }
  }
  if (homestead(s)) {
    for (const t of ['can', 'hoe'] as const) {
      const next = TOOL_UPGRADES[t][s.tools[t]];
      if (next && s.rep >= next.rep && s.coins > next.cost + 300) out.push({ type: 'upgrade', tool: t });
    }
  }

  const todo = chores(s);
  const outOfMoves = (s.rules.clock === 'turns' && s.ap - s.jobs.length <= 0) || (s.rules.clock === 'day' && s.stamina < 4);

  if (s.rules.control === 'point') {
    if (!outOfMoves && s.jobs.length < 3) {
      for (const c of todo.slice(0, 3)) {
        if (s.rules.tools === 'kit' && s.tool !== c.tool) {
          if (s.jobs.length) break;
          out.push({ type: 'tool', tool: c.tool });
        }
        out.push({ type: 'paint', x: c.x, y: c.y });
        if (s.rules.tools === 'kit') break;
      }
    }
  } else {
    bot.wait -= dt;
    if (!f.task && !f.path.length && !f.aim && bot.wait <= 0 && !outOfMoves && todo.length) {
      const c = todo[0];
      if (s.tool !== c.tool) out.push({ type: 'tool', tool: c.tool });
      out.push({ type: 'actAt', x: c.x, y: c.y });
      bot.wait = bot.pace ?? 0.05;
    }
  }

  const busy = s.jobs.length > 0 || f.task || f.path.length || f.aim;
  if (!busy && (outOfMoves || !todo.length || (s.rules.clock === 'day' && s.minute > 900))) bot.idle += dt;
  else bot.idle = 0;
  if (s.rules.clock !== 'flow' && bot.idle > 0.5) {
    out.push({ type: 'sleep' });
    bot.idle = 0;
  }
  return out;
}
