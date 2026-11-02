// The night: crews finish up, crops grow or go thirsty, stock sells, the
// season may turn, and a new morning brings weather, sprinklers, bugs, crows
// and orders.

import { choreNow, hands } from './actors';
import { AP_MAX, BUG_CHANCE, BUG_SPREAD, CROW_EDGE, CROW_EDGE_FULL, CROW_FIRST, CROW_PECK_MINUTES, DAY_MINUTES, DAYS_PER_SEASON, FLOCK_CHANCE, FLOCK_HOURS, HAND_NIGHT_JOBS, HAND_WAGE, HEAT_DRY, CROW_PER_FIELD, SCARECROW_RADIUS, SPRINKLER_MORNINGS, SUNUP_SCARECROW_RADIUS, SUNUP_SCARECROW_SURE } from './constants';
import { CROP_IDS, stageOf } from './crops';
import { claimCrops, endRound, fillOrders, fillRequests, lostFor, ordersOvernight, sellCrop, settleRequests, startRound, stockCount, updateGoals, wanted, withdrawRequests } from './goals';
import { homestead, sowing } from './actions';
import { CROPS, inSeason } from './crops';
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
  // Crops crows took by day count with the night's (round 6: the card said nothing of them).
  const report: DayReport = { day: s.day, sold: [], wages: 0, grew: 0, withered: 0, eaten: s.eatenToday ?? 0, crewWork: 0, income: 0 };
  s.eatenToday = 0;
  // Round 7: what the crate paid for by day is yesterday's sales on the morning card, with what sells overnight; and a
  // request lost by day is told there too.
  for (const r of s.soldToday ?? []) report.sold.push({ ...r });
  s.soldToday = [];
  if (s.goneToday?.length) report.withdrawn = [...s.goneToday];
  s.goneToday = [];
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

  // Crows still pecking at nightfall get their meal. In Sunup, until the crow
  // lesson has been seen, a crow takes nothing in the hours sleep skips: the
  // first crop a crow takes is one the farmer watched it go for.
  const crowsEat = !homestead(s) || s.learn.includes('lesson:pests');
  // Sunup, a flock day: the crows still to come when the farmer goes to bed come anyway, and each takes a crop no
  // scarecrow watches over (the morning card said crows were about; the sleep question says so too).
  if (homestead(s) && s.flock && crowsEat) {
    for (const _m of s.crowPlan) {
      const t = crowTarget(s);
      if (!t) break;
      lostFor(s, s.plots[idx(t.x, t.y)].crop!, 'crows');
      s.plots[idx(t.x, t.y)].crop = null;
      ev.push({ type: 'crowEat', id: s.nextId++, x: t.x, y: t.y });
      report.eaten++;
      s.almanac.withered++;
    }
  }
  s.crowPlan = [];
  s.flock = false;
  for (const c of s.crows) {
    if (c.phase !== 'peck' && c.phase !== 'in') continue;
    const p = s.plots[idx(c.x, c.y)];
    if (p.crop && c.phase === 'peck' && crowsEat) {
      ev.push({ type: 'crowEat', id: c.id, x: c.x, y: c.y });
      lostFor(s, p.crop, 'crows');
      p.crop = null;
      report.eaten++;
      s.almanac.withered++;
    }
  }
  s.crows = [];

  // Growth.
  const heat = s.weather === 'heat';
  const sunup = homestead(s);
  // Sunup's soil holds a full watering for two days (one in a heat wave).
  const holdsWater = sunup && s.rules.growth === 'classic';
  for (let y = 0; y < s.H; y++) {
    for (let x = 0; x < s.W; x++) {
      if (!isField(s, x, y)) continue;
      const p = s.plots[idx(x, y)];
      // Sunup: a crop that withered on an earlier night has gone back into the soil by now.
      if (sunup && p.crop?.dead) p.crop = null;
      const c = p.crop;
      if (c && !c.dead && c.stage < 4) {
        if (c.bugs > 0) {
          c.bugs++;
          if (c.bugs >= 4) {
            c.dead = true;
            lostFor(s, c, 'bugs');
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
          // A heat wave is hard on a dry crop: Sunup's withers that night, elsewhere it counts double.
          c.dry += heat && s.rules.growth === 'classic' ? (sunup ? HEAT_DRY : 2) : 1;
          if (s.rules.growth === 'synergy') c.parched = true;
          if (c.dry >= 3) {
            c.dead = true;
            lostFor(s, c, heat ? 'heat' : 'dry');
            report.withered++;
            s.almanac.withered++;
            ev.push({ type: 'wither', x, y, crop: c.kind });
          }
        }
      }
      // Soil overnight. Both measures are kept so the soil rule can switch freely.
      p.moisture = Math.max(0, p.moisture - (heat ? 2 : 1));
      p.wet = holdsWater ? p.wet && p.moisture >= 2 : false;
      if (!p.crop && p.tilled) p.nutrient = Math.min(3, p.nutrient + 0.25);
    }
  }

  // Requests take their share of the crate first, then the rest ships. What
  // an open request still needs stays in the crate for it.
  const hold: Partial<Record<string, number>> = {};
  if (sunup) {
    claimCrops(s);
    settleRequests(s, ev, report);
    const want = wanted(s);
    for (const crop of CROP_IDS) {
      const n = Math.min(want[crop] ?? 0, stockCount(s, crop));
      if (n > 0) {
        hold[crop] = n;
        (report.kept ??= []).push({ crop, n });
      }
    }
  }
  if (s.rules.goal !== 'orders') for (const crop of CROP_IDS) sellCrop(s, crop, ev, report, hold[crop] ?? 0);
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
    // The turn of the season takes what does not grow in the new one and is
    // still green. Ripe crops wait to be picked, and what it takes is simply
    // gone by morning: nothing withered to clear.
    if (sunup) {
      const now = season(s.day);
      let turned = 0;
      for (let i = 0; i < s.plots.length; i++) {
        const p = s.plots[i];
        const c = p.crop;
        if (!c) continue;
        // A crop that withered tonight stays a day, like any other, and clears for free.
        if (c.dead || inSeason(c.kind, now) || c.stage === 4) continue;
        lostFor(s, c, 'turn');
        p.crop = null;
        turned++;
      }
      if (turned) report.turned = turned;
      // A request for a crop out of season now goes quietly (only older saves can have one).
      s.orders = s.orders.filter((o) => o.items.every((it) => inSeason(it.crop, now) || Math.min(o.got ?? 0, it.n) >= it.n));
    }
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
  s.taps = [];
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
  for (const b of s.builds.slice()) {
    if (b.kind !== 'sprinkler') continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isField(s, b.x + dx, b.y + dy)) soak(s.plots[idx(b.x + dx, b.y + dy)]);
    ev.push({ type: 'sprinkle', x: b.x, y: b.y });
    // Sunup's sprinkler waters for a season, then wears out (its last watering still counts today).
    if (homestead(s)) {
      b.left = (b.left ?? SPRINKLER_MORNINGS) - 1;
      if (b.left <= 0) {
        s.builds = s.builds.filter((o) => o !== b);
        ev.push({ type: 'unbuild', x: b.x, y: b.y, kind: b.kind });
        if (s.report) s.report.worn = (s.report.worn ?? 0) + 1;
      }
    }
  }

  // Pests wait until Sunup has introduced them.
  const pests = wild && (!homestead(s) || s.learn.includes('pests'));
  // Bugs: a few new, the rest spread to the same crop next door. In Sunup, bugs left on a crop spread for real: to
  // every growing neighbour of the same kind, and to half of the others.
  if (pests) {
    const sunup = homestead(s);
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
            if (!n || n.dead || n.bugs !== 0 || n.stage >= 4) continue;
            const chance = sunup ? (n.kind === c.kind ? BUG_SPREAD.same : BUG_SPREAD.other) : n.kind === c.kind ? 0.5 : 0;
            if (chance > 0 && rand(s) < chance) spread.push(idx(nx, ny));
          }
        } else if (!sunup && c.stage >= 1 && c.stage < 4 && rand(s) < 0.03) spread.push(idx(x, y));
      }
    }
    // Sunup's morning card says how far bugs left overnight spread (round 6: two to eight more, unexplained).
    if (sunup && s.report) s.report.spread = new Set(spread).size;
    if (sunup) landBugs(s, ev, spread);
    for (const i of spread) {
      const c = s.plots[i].crop!;
      if (c.bugs === 0) {
        c.bugs = 1;
        ev.push({ type: 'bugs', x: i % s.W, y: Math.floor(i / s.W) });
      }
    }
  }

  // Crows plan their visits on dry days. Until Sunup's crow lesson has been
  // seen, one crow comes, early in the morning, while the farmer is surely
  // still out: never in hours an early night would skip.
  s.crowPlan = [];
  if (pests && s.weather !== 'rain' && s.weather !== 'storm') {
    let growing = 0;
    for (const p of s.plots) if (p.crop && !p.crop.dead && p.crop.stage >= 1) growing++;
    if (growing > 0) {
      if (homestead(s) && !s.learn.includes('lesson:pests')) s.crowPlan.push(s.rules.clock === 'turns' ? 0 : randInt(s, CROW_FIRST[0], CROW_FIRST[1]));
      else {
        // Sunup: a crow for most fields a scarecrow does not watch over (so where it stands matters), and now and then
        // one for the edge of a field it does watch; a field watched over sure, edges and all, draws none.
        const n = homestead(s) ? s.parcels.filter((p) => p.owned && rand(s) < crowChance(s, p)).length : 1 + (rand(s) < 0.4 ? 1 : 0) + (growing > 24 ? 1 : 0);
        for (let k = 0; k < n; k++) s.crowPlan.push(s.rules.clock === 'turns' ? 0 : randInt(s, 60, DAY_MINUTES - CROW_PECK_MINUTES - 120));
        // Some days demand attention: now and then, once scarecrows are known, crows are about (told on the morning
        // card): one more for each field with a growing crop, through the late morning and the afternoon.
        if (homestead(s) && s.rules.clock === 'day' && s.learn.includes('lesson:scarecrow') && rand(s) < FLOCK_CHANCE) {
          s.flock = true;
          if (s.report) s.report.flock = true;
          for (const p of s.parcels) if (p.owned && fieldOpen(s, p)) s.crowPlan.push(randInt(s, FLOCK_HOURS[0], FLOCK_HOURS[1]));
        }
        s.crowPlan.sort((a, b) => a - b);
      }
    }
  }

  if (s.rules.goal === 'orders') fillOrders(s);
  if (homestead(s)) {
    const gift = rescue(s);
    if (gift && s.report) s.report.gift = gift;
  }
  // Requests that can no longer be met are withdrawn, with a word on the morning card; then new ones may come.
  if (homestead(s) && s.learn.includes('requests')) {
    withdrawRequests(s, ev, s.report);
    fillRequests(s, true);
    claimCrops(s);
  }
  if (s.weather === 'storm') ev.push({ type: 'thunder' });
  refreshQuality(s);
  // Sunup's morning card says what is ripe to pick (not how many crops changed their look overnight).
  if (homestead(s) && s.report) {
    let ripe = 0;
    for (let i = 0; i < s.plots.length; i++) {
      const c = s.plots[i].crop;
      if (c && !c.dead && c.stage === 4 && s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned) ripe++;
    }
    s.report.ripe = ripe;
  }
  ev.push({ type: 'dawn', day: s.day, weather: s.weather, season: season(s.day) });
}

/**
 * Sunup must always leave a way to earn. A farm with nothing growing, nothing
 * in the crate and too few coins for any seed that can go in today would be
 * stuck for good, so a neighbour leaves enough for four packets of the
 * cheapest. Returns the coins given (0 when the farm is not stuck).
 */
export function rescue(s: WorldState): number {
  let living = false;
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (c && !c.dead && s.parcelOf[i] >= 0 && s.parcels[s.parcelOf[i]].owned) {
      living = true;
      break;
    }
  }
  if (living) return 0;
  if (CROP_IDS.some((c) => stockCount(s, c) > 0)) return 0;
  const seeds = CROP_IDS.filter((c) => sowing(s.day, c).ok).map((c) => CROPS[c].seed);
  if (!seeds.length) return 0;
  const cheapest = Math.min(...seeds);
  if (s.coins >= cheapest) return 0;
  const gift = cheapest * 4 - s.coins;
  s.coins += gift;
  return gift;
}

/** Does a field have a crop up and growing that no scarecrow watches over for sure (a crow's dinner)? */
function fieldOpen(s: WorldState, p: { x: number; y: number; w: number; h: number }): boolean {
  for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
    const c = s.plots[idx(x, y)].crop;
    if (c && !c.dead && c.stage >= 1 && c.stage < 4 && !guardedSure(s, x, y)) return true;
  }
  return false;
}

/**
 * Sunup: bugs land on a few growing crops, each with `BUG_CHANCE` (at dawn,
 * and again at 13:00). `also` adds plots the night's spreading reached.
 */
export function landBugs(s: WorldState, ev: SimEvent[], also: number[] = []): void {
  const hit = also.slice();
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (!c || c.dead || c.bugs > 0 || c.stage < 1 || c.stage >= 4 || s.tiles[i] !== 'field') continue;
    if (rand(s) < BUG_CHANCE) hit.push(i);
  }
  for (const i of hit) {
    const c = s.plots[i].crop;
    if (c && c.bugs === 0) {
      c.bugs = 1;
      ev.push({ type: 'bugs', x: i % s.W, y: Math.floor(i / s.W) });
    }
  }
}

/**
 * The chance a crow comes for a field on a dry morning: most mornings for a
 * field with a growing crop no scarecrow watches, now and then for one whose
 * only open crops are at the edge of a scarecrow's watch, never for one
 * watched over sure.
 */
function crowChance(s: WorldState, p: { x: number; y: number; w: number; h: number }): number {
  let edge = 0;
  for (let y = p.y; y < p.y + p.h; y++) {
    for (let x = p.x; x < p.x + p.w; x++) {
      const c = s.plots[idx(x, y)].crop;
      if (!c || c.dead || c.stage < 1) continue;
      if (!guarded(s, x, y)) return CROW_PER_FIELD;
      if (!guardedSure(s, x, y)) edge++;
    }
  }
  // A second scarecrow that brings most of the edge under its sure watch makes a crow rarer still.
  return CROW_EDGE * Math.min(1, edge / CROW_EDGE_FULL);
}

/** How far a scarecrow's watch reaches: two plots each way in Sunup (a five by five square), three elsewhere. */
export function scarecrowRadius(s: WorldState): number {
  return homestead(s) ? SUNUP_SCARECROW_RADIUS : SCARECROW_RADIUS;
}

/** Is (x, y) within a scarecrow's watch (in Sunup, its edge included)? */
export function guarded(s: WorldState, x: number, y: number): boolean {
  const r = scarecrowRadius(s);
  return s.builds.some((b) => b.kind === 'scarecrow' && Math.max(Math.abs(b.x - x), Math.abs(b.y - y)) <= r);
}

/** Is (x, y) watched for sure? In Sunup only the plots right beside a scarecrow; its outer ring is its edge, where crows still try. */
export function guardedSure(s: WorldState, x: number, y: number): boolean {
  const r = homestead(s) ? SUNUP_SCARECROW_SURE : SCARECROW_RADIUS;
  return s.builds.some((b) => b.kind === 'scarecrow' && Math.max(Math.abs(b.x - x), Math.abs(b.y - y)) <= r);
}

/**
 * Pick a crop for a crow: growing, not already someone's dinner, and open: no
 * scarecrow watching it, or (when every growing crop is watched) one at the
 * edge of a scarecrow's watch, never one right beside a scarecrow.
 */
export function crowTarget(s: WorldState): { x: number; y: number } | null {
  const open: { x: number; y: number }[] = [];
  const edge: { x: number; y: number }[] = [];
  for (let y = 0; y < s.H; y++) {
    for (let x = 0; x < s.W; x++) {
      if (!owned(s, x, y)) continue;
      const c = s.plots[idx(x, y)].crop;
      if (!c || c.dead || c.stage < 1) continue;
      if (guardedSure(s, x, y)) continue;
      if (s.crows.some((k) => k.x === x && k.y === y && k.phase !== 'gone')) continue;
      (guarded(s, x, y) ? edge : open).push({ x, y });
    }
  }
  const options = open.length ? open : edge;
  if (!options.length) return null;
  return options[Math.floor(rand(s) * options.length)];
}
