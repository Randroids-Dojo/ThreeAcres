// What a tool does to a tile, and doing it. resolve() is pure and is also used
// by the UI for the highlight; perform() changes the farm and reports events.

import { BUILD_COST, CAN_WATER, DAYS_PER_SEASON, SEASON_PREVIEW_DAYS, STAMINA_COST } from './constants';
import { CROPS, inSeason, QUALITY_MULT, stageOf } from './crops';
import { propAt } from './map';
import { feedAround, needsWater, qualityAt, soak } from './soil';
import { buildAt, dayOfSeason, idx, inMap, isField, owned, plots, season, SEASON_NAMES } from './world';
import type { Actor, BuildKind, CropId, SimEvent, ToolId, Verb, WorldState } from './types';

export interface Resolved {
  verb: Verb | null;
  ok: boolean;
  /** Why not, in a few words. 'unowned' means the field is for sale. */
  reason: string;
  crop?: CropId;
  build?: BuildKind;
}

const NONE = (reason: string): Resolved => ({ verb: null, ok: false, reason });
const NO = (verb: Verb, reason: string): Resolved => ({ verb, ok: false, reason });

export function crowAt(s: WorldState, x: number, y: number) {
  return s.crows.find((c) => c.x === x && c.y === y && (c.phase === 'peck' || c.phase === 'in')) ?? null;
}

/** Sunup's homestead rules: seasonal crops, a can that runs dry, town requests. */
export function homestead(s: WorldState): boolean {
  return s.rules.goal === 'market' && s.rules.tools === 'kit';
}

/** Sunup's sowing calendar for a crop today. */
export interface Sowing {
  /** It can go in today. */
  ok: boolean;
  /** It is next season's crop, offered early in the last days of this one. */
  next: boolean;
  /** It grows now but would not ripen before the turn, which would take it. */
  late: boolean;
  reason: string;
}

/** Nights left before the season turns, tonight included. */
export function nightsToTurn(day: number): number {
  return DAYS_PER_SEASON - dayOfSeason(day) + 1;
}

/**
 * Can a crop go in today under Sunup's seasons? What grows now can, unless
 * it would still be green when the season turns and does not grow in the
 * next one. In the last days of a season the next season's crops can go in
 * early: they grow on and are in season when it turns.
 */
export function sowing(day: number, crop: CropId): Sowing {
  const now = season(day);
  const next = ((now + 1) % 4) as 0 | 1 | 2 | 3;
  const left = nightsToTurn(day);
  const name = CROPS[crop].name;
  if (!inSeason(crop, now)) {
    if (inSeason(crop, next) && left <= SEASON_PREVIEW_DAYS) return { ok: true, next: true, late: false, reason: '' };
    return { ok: false, next: false, late: false, reason: `${name} won\u2019t grow in ${SEASON_NAMES[now].toLowerCase()}` };
  }
  if (!inSeason(crop, next) && CROPS[crop].days > left) return { ok: false, next: false, late: true, reason: `Too late. ${name} won\u2019t ripen before ${SEASON_NAMES[next].toLowerCase()}` };
  return { ok: true, next: false, late: false, reason: '' };
}

/** Would watering soak this plot? Owned, hoed, nothing built on it, and not already wet. */
function soakable(s: WorldState, x: number, y: number): boolean {
  if (!owned(s, x, y) || buildAt(s, x, y)) return false;
  const p = plots(s, x, y);
  return p.tilled && !(s.rules.growth === 'classic' ? p.wet : p.moisture >= 3);
}

/** Would the hoe turn this plot? Owned meadow with nothing on it. */
function tillable(s: WorldState, x: number, y: number): boolean {
  if (!owned(s, x, y) || buildAt(s, x, y)) return false;
  const p = plots(s, x, y);
  return !p.tilled && !p.crop;
}

/** The plots the farmer's tool would work from here: the upgraded can and hoe reach past the aimed one. */
function toolArea(s: WorldState, x: number, y: number, level: number): { x: number; y: number }[] {
  return homestead(s) && level > 0 ? area(s.actors[0], x, y, level) : [{ x, y }];
}

function plantCheck(s: WorldState, crop: CropId): Resolved {
  if (homestead(s)) {
    const sw = sowing(s.day, crop);
    if (!sw.ok) return NO('plant', sw.reason);
  }
  if (s.rules.goal === 'almanac' && !s.almanac.unlocked.includes(crop)) return NO('plant', `${CROPS[crop].name} is not in your almanac yet`);
  if (s.coins < CROPS[crop].seed) return NO('plant', `${CROPS[crop].name} seeds cost ${CROPS[crop].seed}`);
  return { verb: 'plant', ok: true, reason: '', crop };
}

function buildCheck(s: WorldState, kind: BuildKind): Resolved {
  if (s.coins < BUILD_COST[kind]) return NO('build', `A ${kind} costs ${BUILD_COST[kind]}`);
  return { verb: 'build', ok: true, reason: '', build: kind };
}

/** What `tool` would do at (x, y), and whether it can. */
export function resolve(s: WorldState, tool: ToolId, x: number, y: number): Resolved {
  // The can fills at the well or from the pond: with the can in hand, or in
  // Sunup with anything in hand once the can is yours (it is on your belt).
  const canInHand = tool === 'can' || (homestead(s) && (s.learn ?? []).includes('can'));
  if (canInHand && inMap(x, y) && (s.tiles[idx(x, y)] === 'water' || propAt(x, y)?.kind === 'well')) {
    if (s.water >= CAN_WATER[s.tools.can]) return NO('refill', 'The can is full');
    return { verb: 'refill', ok: true, reason: '' };
  }
  if (!isField(s, x, y)) return NONE('');
  if (!owned(s, x, y)) return NONE('unowned');
  const plot = plots(s, x, y);
  const crop = plot.crop;
  const build = buildAt(s, x, y);
  const crow = crowAt(s, x, y);

  switch (tool) {
    case 'smart': {
      if (crow) return { verb: 'scare', ok: true, reason: '' };
      if (build) return NONE(build.kind === 'sprinkler' ? 'A sprinkler' : 'A scarecrow');
      if (crop) {
        if (crop.dead) return { verb: 'clear', ok: true, reason: '' };
        if (crop.stage === 4) return { verb: 'harvest', ok: true, reason: '' };
        if (crop.bugs > 0) return { verb: 'tend', ok: true, reason: '' };
        if (needsWater(s, plot)) return { verb: 'water', ok: true, reason: '' };
        return NONE('Growing');
      }
      if (!plot.tilled) return { verb: 'till', ok: true, reason: '' };
      return plantCheck(s, s.seed);
    }
    case 'hoe':
      if (build) return { verb: 'clear', ok: true, reason: '', build: build.kind };
      if (crop?.dead) return { verb: 'clear', ok: true, reason: '' };
      // The upgraded hoe works its whole row or square, so it can still turn meadow beside a hoed plot.
      if (toolArea(s, x, y, s.tools.hoe).some((t) => tillable(s, t.x, t.y))) return { verb: 'till', ok: true, reason: '' };
      return NO('till', crop ? 'Something is growing here' : 'Already hoed');
    case 'can':
      // The same for the upgraded can: aimed at a wet plot, it still waters the dry ones in its reach.
      if (!toolArea(s, x, y, s.tools.can).some((t) => soakable(s, t.x, t.y))) {
        if (build) return NO('water', 'Nothing to water');
        if (!plot.tilled) return NO('water', 'Hoe this plot first');
        return NO('water', 'Already watered');
      }
      if (homestead(s) && s.water <= 0) return NO('water', 'The can is empty. Fill the can at the well');
      return { verb: 'water', ok: true, reason: '' };
    case 'seeds':
      if (build) return NO('plant', 'Something is built here');
      if (!plot.tilled) return NO('plant', 'Hoe this plot first');
      if (crop) return NO('plant', 'Already planted');
      return plantCheck(s, s.seed);
    case 'hands':
      if (crow) return { verb: 'scare', ok: true, reason: '' };
      if (!crop) return NO('harvest', 'Nothing to pick');
      if (crop.dead) return { verb: 'clear', ok: true, reason: '' };
      if (crop.stage === 4) return { verb: 'harvest', ok: true, reason: '' };
      if (crop.bugs > 0) return { verb: 'tend', ok: true, reason: '' };
      return NO('harvest', 'Not ripe yet');
    case 'build':
      if (build || crop) return NO('build', 'Clear it first');
      return buildCheck(s, s.buildKind);
  }
}

/** Is the player able to pay for one more action right now? Hands never pay. */
export function canAfford(s: WorldState, verb: Verb, reserved = 0): string | null {
  if (s.rules.clock === 'day' && s.stamina < STAMINA_COST[verb]) return 'Too tired. Sleep to start a new day';
  if (s.rules.clock === 'turns' && s.ap - reserved < 1) return 'No moves left today. End the day';
  return null;
}

function charge(s: WorldState, verb: Verb): void {
  if (s.rules.clock === 'day') s.stamina = Math.max(0, s.stamina - STAMINA_COST[verb]);
  else if (s.rules.clock === 'turns') s.ap = Math.max(0, s.ap - 1);
}

/**
 * Do `verb` at (x, y) as `actor`. Re-checks the tile first, because a job may
 * have been queued before someone else got there. Returns false if nothing happened.
 */
export function perform(s: WorldState, actor: Actor, r: Resolved, x: number, y: number, ev: SimEvent[]): boolean {
  if (!r.verb || !r.ok) return false;
  const by = actor.id;
  const isFarmer = actor.role === 'farmer';
  const plot = plots(s, x, y);
  const verb = r.verb;

  if (isFarmer) {
    const why = canAfford(s, verb);
    if (why) {
      ev.push({ type: 'deny', x, y, reason: why });
      if (s.rules.clock === 'day') ev.push({ type: 'tired' });
      return false;
    }
  }

  let extra = 0;
  switch (verb) {
    case 'till': {
      const tiles = isFarmer && homestead(s) ? area(actor, x, y, s.tools.hoe) : [{ x, y }];
      let n = 0;
      for (const t of tiles) {
        if (!owned(s, t.x, t.y)) continue;
        const p = plots(s, t.x, t.y);
        if (p.tilled || p.crop || buildAt(s, t.x, t.y)) continue;
        p.tilled = true;
        ev.push({ type: 'till', x: t.x, y: t.y, by });
        n++;
      }
      if (!n) return false;
      extra = (n - 1) * 2;
      break;
    }
    case 'water': {
      const limited = isFarmer && homestead(s);
      const tiles = limited ? area(actor, x, y, s.tools.can) : [{ x, y }];
      let n = 0;
      for (const t of tiles) {
        if (limited && s.water <= 0) break;
        if (!owned(s, t.x, t.y)) continue;
        const p = plots(s, t.x, t.y);
        if (!p.tilled || buildAt(s, t.x, t.y)) continue;
        // A hand watering one plot soaks it; the farmer's can skips plots that are wet already, so no water is wasted.
        if ((limited || t !== tiles[0]) && !soakable(s, t.x, t.y)) continue;
        soak(p);
        if (limited) s.water -= 1;
        ev.push({ type: 'water', x: t.x, y: t.y, by });
        n++;
      }
      if (!n) return false;
      extra = n - 1;
      break;
    }
    case 'refill':
      s.water = CAN_WATER[s.tools.can];
      ev.push({ type: 'refill', x, y, by });
      break;
    case 'plant': {
      const kind = r.crop ?? s.seed;
      if (plot.crop || !plot.tilled || s.coins < CROPS[kind].seed) return false;
      s.coins -= CROPS[kind].seed;
      plot.crop = { id: s.nextId++, kind, age: 0, stage: 0, dry: 0, dead: false, bugs: 0, quality: 0, picks: 0, parched: false, planted: s.day };
      ev.push({ type: 'plant', x, y, crop: kind, by });
      break;
    }
    case 'harvest': {
      const c = plot.crop;
      if (!c || c.dead || c.stage !== 4) return false;
      const def = CROPS[c.kind];
      const q = s.rules.growth === 'synergy' ? qualityAt(s, x, y).quality : 0;
      s.stock[c.kind][q] += 1;
      s.stats.harvested[c.kind] += 1;
      s.almanac.harvested += 1;
      if (!s.almanac.kinds.includes(c.kind)) s.almanac.kinds.push(c.kind);
      if (q >= 2) s.almanac.fine += 1;
      if (q >= 2 && !s.milestones.gold) {
        s.milestones.gold = true;
        ev.push({ type: 'milestone', id: 'gold' });
      }
      plot.nutrient = Math.max(0, plot.nutrient - def.feed);
      if (c.kind === 'beans') feedAround(s, x, y);
      ev.push({ type: 'harvest', x, y, crop: c.kind, quality: q, by });
      // Sunup: a regrowing crop kept past its season for its last ripe pick is done after it.
      if (def.regrow > 0 && !(homestead(s) && !inSeason(c.kind, season(s.day)))) {
        c.picks += 1;
        c.age = def.days - def.regrow;
        c.stage = stageOf(c.kind, c.age);
        c.parched = false;
      } else {
        plot.crop = null;
      }
      break;
    }
    case 'tend':
      if (!plot.crop || plot.crop.bugs === 0) return false;
      plot.crop.bugs = 0;
      ev.push({ type: 'tend', x, y, by });
      break;
    case 'clear': {
      const b = buildAt(s, x, y);
      if (b) {
        s.builds = s.builds.filter((o) => o !== b);
        const refund = Math.floor(BUILD_COST[b.kind] / 2);
        s.coins += refund;
        ev.push({ type: 'unbuild', x, y, kind: b.kind });
        ev.push({ type: 'coins', amount: refund, x, y });
      } else if (plot.crop?.dead) {
        plot.crop = null;
        ev.push({ type: 'clear', x, y, by });
      } else return false;
      break;
    }
    case 'build': {
      const kind = r.build ?? s.buildKind;
      if (plot.crop || buildAt(s, x, y) || s.coins < BUILD_COST[kind]) return false;
      s.coins -= BUILD_COST[kind];
      plot.tilled = true;
      s.builds.push({ id: s.nextId++, kind, x, y });
      ev.push({ type: 'build', x, y, kind, by });
      break;
    }
    case 'scare': {
      const crow = crowAt(s, x, y);
      if (!crow) return false;
      crow.phase = 'flee';
      crow.t = 0;
      ev.push({ type: 'crowScared', id: crow.id, x, y });
      break;
    }
  }
  if (isFarmer) {
    charge(s, verb);
    if (extra && s.rules.clock === 'day') s.stamina = Math.max(0, s.stamina - extra);
  }
  return true;
}

/**
 * Plots an upgraded tool works: level 1 three in a row away from the farmer,
 * level 2 the three by three square around the aimed plot.
 */
export function area(actor: Actor, x: number, y: number, level: number): { x: number; y: number }[] {
  if (level <= 0) return [{ x, y }];
  if (level >= 2) {
    const out = [{ x, y }];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) out.push({ x: x + dx, y: y + dy });
    return out.filter((t) => inMap(t.x, t.y));
  }
  let dx = Math.sign(x - Math.floor(actor.x));
  let dy = Math.sign(y - Math.floor(actor.y));
  if (dx && dy) dy = 0;
  if (!dx && !dy) {
    dx = actor.facing === 'e' ? 1 : actor.facing === 'w' ? -1 : 0;
    dy = actor.facing === 's' ? 1 : actor.facing === 'n' ? -1 : 0;
  }
  return [0, 1, 2].map((k) => ({ x: x + dx * k, y: y + dy * k })).filter((t) => inMap(t.x, t.y));
}

/** Sale value of one crop at a quality, with the market's mood under orders. */
export function priceOf(s: WorldState, crop: CropId, quality: number): number {
  const demand = s.rules.goal === 'orders' ? s.market.demand[crop] : 1;
  return Math.round(CROPS[crop].price * QUALITY_MULT[quality] * demand);
}

