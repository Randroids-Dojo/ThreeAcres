// The night: crews finish up, crops grow or go thirsty, stock sells, the
// season may turn, and a new morning brings weather, sprinklers, bugs, crows
// and orders.

import { choreNow, hands } from './actors';
import { AP_MAX, CROW_PECK_MINUTES, DAY_MINUTES, DAYS_PER_SEASON, HAND_NIGHT_JOBS, HAND_WAGE, SCARECROW_RADIUS } from './constants';
import { CROP_IDS, stageOf } from './crops';
import { endRound, fillOrders, ordersOvernight, sellCrop, startRound, updateGoals } from './goals';
import { HOME } from './map';
import { rand, randInt } from './rng';
import { refreshQuality, soak, wateredForTonight } from './soil';
import { calmed, rollWeather } from './weather';
import { idx, inMap, isField, owned, season } from './world';
import type { DayReport, SimEvent, WorldState } from './types';

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** In turns the clock shows how much of the day the moves have used: 6:00 with all moves, 20:00 with none. */
export function turnsMinute(s: WorldState): number {
  return Math.round(((s.apMax - s.ap) / s.apMax) * 840);
}

export function nightfall(s: WorldState, ev: SimEvent[]): void {
  const report: DayReport = { day: s.day, sold: [], wages: 0, grew: 0, withered: 0, eaten: 0, crewWork: 0, income: 0 };
  const coinsBefore = s.coins;

  // Under turns the hands do their day's work now.
  if (s.rules.clock === 'turns' && s.rules.crew === 'crew') {
    for (const h of hands(s)) {
      for (let k = 0; k < HAND_NIGHT_JOBS; k++) {
        if (!choreNow(s, h, ev)) break;
        report.crewWork++;
      }
    }
  }

  // Crows still pecking at nightfall get their meal.
  for (const c of s.crows) {
    if (c.phase !== 'peck' && c.phase !== 'in') continue;
    const p = s.plots[idx(c.x, c.y)];
    if (p.crop && c.phase === 'peck') {
      ev.push({ type: 'crowEat', id: c.id, x: c.x, y: c.y });
      p.crop = null;
      report.eaten++;
      s.almanac.withered++;
    }
  }
  s.crows = [];

  // Growth.
  const heat = s.weather === 'heat';
  for (let y = 0; y < s.H; y++) {
    for (let x = 0; x < s.W; x++) {
      if (!isField(s, x, y)) continue;
      const p = s.plots[idx(x, y)];
      const c = p.crop;
      if (c && !c.dead && c.stage < 4) {
        if (c.bugs > 0) {
          c.bugs++;
          if (c.bugs >= 4) {
            c.dead = true;
            report.withered++;
            s.almanac.withered++;
            ev.push({ type: 'wither', x, y, crop: c.kind });
          }
        } else if (wateredForTonight(s, p)) {
          c.age += 1;
          c.dry = 0;
          const st = stageOf(c.kind, c.age);
          if (st !== c.stage) {
            c.stage = st;
            report.grew++;
            ev.push({ type: 'grow', x, y, crop: c.kind, stage: st });
          }
        } else {
          c.dry += heat && s.rules.growth === 'classic' ? 2 : 1;
          if (s.rules.growth === 'synergy') c.parched = true;
          if (c.dry >= 3) {
            c.dead = true;
            report.withered++;
            s.almanac.withered++;
            ev.push({ type: 'wither', x, y, crop: c.kind });
          }
        }
      }
      // Soil overnight. Both measures are kept so the soil rule can switch freely.
      p.wet = false;
      p.moisture = Math.max(0, p.moisture - (heat ? 2 : 1));
      if (!p.crop && p.tilled) p.nutrient = Math.min(3, p.nutrient + 0.25);
    }
  }

  // Selling and wages.
  if (s.rules.goal !== 'orders') for (const crop of CROP_IDS) sellCrop(s, crop, ev, report);
  const crew = hands(s);
  if (crew.length) {
    report.wages = Math.min(s.coins, crew.length * HAND_WAGE);
    s.coins -= report.wages;
  }
  report.income = s.coins - coinsBefore;

  // A new day.
  s.day += 1;
  s.stats.days += 1;
  if (s.rules.goal === 'orders') ordersOvernight(s, ev);
  if (s.rules.goal === 'almanac') updateGoals(s, ev);
  if ((s.day - 1) % DAYS_PER_SEASON === 0) {
    if (s.rules.goal === 'almanac') {
      endRound(s);
      startRound(s);
    }
    ev.push({ type: 'season', season: season(s.day), round: Math.floor((s.day - 1) / DAYS_PER_SEASON) });
  }
  s.report = report;
  morning(s, ev);
}

function morning(s: WorldState, ev: SimEvent[]): void {
  const wild = s.rules.weather === 'wild';
  s.weather = s.forecast.shift() ?? 'sun';
  if (!wild) s.weather = calmed(s.weather);
  s.forecast.push(rollWeather(s, s.day + 3));
  s.minute = 0;
  s.stamina = s.staminaMax;
  s.apMax = AP_MAX;
  s.ap = s.apMax;
  if (s.rules.clock === 'day') {
    const f = s.actors[0];
    f.x = HOME.x + 0.5;
    f.y = HOME.y + 0.5;
    f.facing = 's';
    f.angle = Math.PI / 2;
  }
  for (const a of s.actors) {
    a.path = [];
    a.task = null;
    a.aim = null;
    a.job = null;
    a.moving = false;
    a.hop = 0;
  }
  for (const j of s.jobs) j.claimedBy = null;
  if (s.rules.clock === 'turns') s.jobs = [];

  // Rain and sprinklers.
  if (s.weather === 'rain' || s.weather === 'storm') {
    for (let i = 0; i < s.plots.length; i++) if (s.tiles[i] === 'field') soak(s.plots[i]);
  }
  for (const b of s.builds) {
    if (b.kind !== 'sprinkler') continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isField(s, b.x + dx, b.y + dy)) soak(s.plots[idx(b.x + dx, b.y + dy)]);
    ev.push({ type: 'sprinkle', x: b.x, y: b.y });
  }

  // Bugs: a few new, the rest spread to the same crop next door.
  if (wild) {
    const spread: number[] = [];
    for (let y = 0; y < s.H; y++) {
      for (let x = 0; x < s.W; x++) {
        const c = s.plots[idx(x, y)].crop;
        if (!c || c.dead) continue;
        if (c.bugs > 0) {
          for (const [dx, dy] of N4) {
            const nx = x + dx;
            const ny = y + dy;
            if (!inMap(nx, ny)) continue;
            const n = s.plots[idx(nx, ny)].crop;
            if (n && !n.dead && n.kind === c.kind && n.bugs === 0 && n.stage < 4 && rand(s) < 0.5) spread.push(idx(nx, ny));
          }
        } else if (c.stage >= 1 && c.stage < 4 && rand(s) < 0.03) spread.push(idx(x, y));
      }
    }
    for (const i of spread) {
      const c = s.plots[i].crop!;
      if (c.bugs === 0) {
        c.bugs = 1;
        ev.push({ type: 'bugs', x: i % s.W, y: Math.floor(i / s.W) });
      }
    }
  }

  // Crows plan their visits on dry days.
  s.crowPlan = [];
  if (wild && s.weather !== 'rain' && s.weather !== 'storm') {
    let growing = 0;
    for (const p of s.plots) if (p.crop && !p.crop.dead) growing++;
    if (growing > 0) {
      const n = 1 + (rand(s) < 0.4 ? 1 : 0) + (growing > 24 ? 1 : 0);
      for (let k = 0; k < n; k++) s.crowPlan.push(s.rules.clock === 'turns' ? 0 : randInt(s, 60, DAY_MINUTES - CROW_PECK_MINUTES - 120));
      s.crowPlan.sort((a, b) => a - b);
    }
  }

  if (s.rules.goal === 'orders') fillOrders(s);
  if (s.weather === 'storm') ev.push({ type: 'thunder' });
  refreshQuality(s);
  ev.push({ type: 'dawn', day: s.day, weather: s.weather, season: season(s.day) });
}

/** Is (x, y) within a scarecrow's watch? */
export function guarded(s: WorldState, x: number, y: number): boolean {
  return s.builds.some((b) => b.kind === 'scarecrow' && Math.max(Math.abs(b.x - x), Math.abs(b.y - y)) <= SCARECROW_RADIUS);
}

/** Pick a crop for a crow: growing, unguarded, not already someone's dinner. */
export function crowTarget(s: WorldState): { x: number; y: number } | null {
  const options: { x: number; y: number }[] = [];
  for (let y = 0; y < s.H; y++) {
    for (let x = 0; x < s.W; x++) {
      if (!owned(s, x, y)) continue;
      const c = s.plots[idx(x, y)].crop;
      if (!c || c.dead || c.stage < 1) continue;
      if (guarded(s, x, y)) continue;
      if (s.crows.some((k) => k.x === x && k.y === y && k.phase !== 'gone')) continue;
      options.push({ x, y });
    }
  }
  if (!options.length) return null;
  return options[Math.floor(rand(s) * options.length)];
}
