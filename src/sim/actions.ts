// What a tool does to a tile, and doing it. resolve() is pure and is also used
// by the UI for the highlight; perform() changes the farm and reports events.

import { BUILD_COST, CAN_MOISTURE, CAN_WATER, DAY_SECONDS, DAYS_PER_SEASON, FIELD_REP, SEASON_PREVIEW_DAYS, SPRINKLER_MORNINGS, STAMINA_COST, SUNUP_DAY_SECONDS } from './constants';
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

/**
 * Real seconds from 6:00 to midnight under the day clock. Sunup's day grows
 * with the farm: a minute on one field, two on five or six.
 */
export function daySeconds(s: WorldState): number {
  if (!homestead(s)) return DAY_SECONDS;
  const fields = s.parcels.filter((p) => p.owned).length;
  return SUNUP_DAY_SECONDS[Math.max(0, Math.min(SUNUP_DAY_SECONDS.length - 1, fields - 1))];
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
  // Round 7: the word names the crop as the picker shows it ("Carrots won't ripen before summer"; a tap on a seed
  // marked "Too late" closed the picker with no word).
  if (!inSeason(crop, next) && CROPS[crop].days > left) return { ok: false, next: false, late: true, reason: `${plural(crop)} won\u2019t ripen before ${SEASON_NAMES[next].toLowerCase()}` };
  return { ok: true, next: false, late: false, reason: '' };
}

/** A crop's plural with a capital: "Carrots", "Corn". */
function plural(crop: CropId): string {
  const p = CROPS[crop].plural;
  return `${p[0].toUpperCase()}${p.slice(1)}`;
}

/**
 * Sunup: a crop that can go in today but only just ripens before the turn,
 * which takes it: watered every night from tonight, it is ripe on the turn's
 * morning; one dry night and the turn takes it (round 7: nine lettuces
 * planted at 6 pm were lost at the turn). The picker warns before it goes in.
 */
export function justInTime(day: number, crop: CropId): boolean {
  const now = season(day);
  const next = ((now + 1) % 4) as 0 | 1 | 2 | 3;
  return inSeason(crop, now) && !inSeason(crop, next) && CROPS[crop].days === nightsToTurn(day);
}

/**
 * Sunup: will the season's turn take this plot's crop? It does not grow in
 * the next season and would still be green on the last night, even watered
 * every night (ripe crops survive the turn to be picked).
 */
export function doomedAtTurn(s: WorldState, i: number): boolean {
  const c = s.plots[i]?.crop;
  if (!c || c.dead || c.stage === 4 || !homestead(s)) return false;
  const next = ((season(s.day) + 1) % 4) as 0 | 1 | 2 | 3;
  if (inSeason(c.kind, next)) return false;
  return CROPS[c.kind].days - c.age > nightsToTurn(s.day);
}

/**
 * Would watering soak this plot? Owned, hoed, nothing built on it, and not
 * already wet. Sunup's can waters crops, not bare soil: only a plot with a
 * crop still growing.
 */
function soakable(s: WorldState, x: number, y: number): boolean {
  if (!owned(s, x, y) || buildAt(s, x, y)) return false;
  const p = plots(s, x, y);
  if (homestead(s) && (!p.crop || p.crop.dead || p.crop.stage === 4)) return false;
  return p.tilled && !(s.rules.growth === 'classic' ? p.wet : p.moisture >= 3);
}

/** Would the hoe turn this plot? Owned meadow with nothing on it. */
function tillable(s: WorldState, x: number, y: number): boolean {
  if (!owned(s, x, y) || buildAt(s, x, y)) return false;
  const p = plots(s, x, y);
  return !p.tilled && !p.crop;
}

/** Would the farmer's watering or hoeing work this plot (one of an upgraded tool's reach)? For the reach marks. */
export function worksOn(s: WorldState, verb: 'water' | 'till', x: number, y: number): boolean {
  return verb === 'water' ? soakable(s, x, y) : tillable(s, x, y);
}

/** The plots the farmer's tool would work from here: the upgraded can and hoe reach past the aimed one. */
function toolArea(s: WorldState, x: number, y: number, level: number): { x: number; y: number }[] {
  return homestead(s) && level > 0 ? area(s, x, y, level) : [{ x, y }];
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

/**
 * What building one `kind` at (x, y) would do, whatever is in hand (the
 * lesson pointer's one-off build): owned, hoed or meadow field with nothing on
 * it, and the coins for it.
 */
export function resolveBuild(s: WorldState, kind: BuildKind, x: number, y: number): Resolved {
  if (!isField(s, x, y)) return NONE('');
  if (!owned(s, x, y)) return NONE('unowned');
  if (buildAt(s, x, y) || plots(s, x, y).crop) return NO('build', 'Clear it first');
  return buildCheck(s, kind);
}

/**
 * What `tool` would do at (x, y), and whether it can. `seed` is the seed the
 * seeds would plant: the one in hand, or (round 8) the one a waiting tap was
 * tapped with.
 */
export function resolve(s: WorldState, tool: ToolId, x: number, y: number, seed: CropId = s.seed): Resolved {
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
      return plantCheck(s, seed);
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
        if (homestead(s) && (!crop || crop.dead)) return NO('water', 'Nothing growing here');
        if (homestead(s) && crop?.stage === 4) return NO('water', 'Ripe, it needs no water');
        return NO('water', 'Already watered');
      }
      if (homestead(s) && s.water <= 0) return NO('water', 'The can is empty. Fill the can at the well');
      return { verb: 'water', ok: true, reason: '' };
    case 'seeds':
      if (build) return NO('plant', 'Something is built here');
      if (!plot.tilled) return NO('plant', 'Hoe this plot first');
      if (crop) return NO('plant', 'Already planted');
      return plantCheck(s, seed);
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
      const tiles = isFarmer && homestead(s) ? area(s, x, y, s.tools.hoe) : [{ x, y }];
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
      const tiles = limited ? area(s, x, y, s.tools.can) : [{ x, y }];
      let n = 0;
      let picked = 0;
      // Round 8: Sunup's can picks the bugs off what it waters, and off the plot it was aimed at, in the same tap (the
      // can used to pick the bugs instead of watering, and on a heat wave four bugged crops were left dry unsaid).
      const pick = (tx: number, ty: number) => {
        const c = plots(s, tx, ty).crop;
        if (!limited || !c || c.dead || c.bugs === 0) return;
        c.bugs = 0;
        ev.push({ type: 'tend', x: tx, y: ty, by });
        picked++;
      };
      for (const t of tiles) {
        if (limited && s.water <= 0) break;
        if (!owned(s, t.x, t.y)) continue;
        const p = plots(s, t.x, t.y);
        if (!p.tilled || buildAt(s, t.x, t.y)) continue;
        // A hand watering one plot soaks it; the farmer's can skips plots that are wet already, so no water is wasted.
        if ((limited || t !== tiles[0]) && !soakable(s, t.x, t.y)) continue;
        // Sunup's can wets a plot for tonight; rain soaks it for two nights.
        soak(p, limited && s.rules.growth === 'classic' ? CAN_MOISTURE : 3);
        if (limited) s.water -= 1;
        ev.push({ type: 'water', x: t.x, y: t.y, by });
        pick(t.x, t.y);
        n++;
      }
      if (!n) return false;
      pick(x, y);
      // Round 8: the upgraded can charges half a watering for each plot past the first (30 plots cost 60 of 100
      // stamina with the old can), and a picking for each crop it took bugs off.
      extra = (limited ? Math.ceil((n - 1) / 2) : n - 1) + picked * STAMINA_COST.tend;
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
      // Sunup: a crop sown for a request the player took counts in the crate for that request (round 6: only those count).
      const forReq = c.for !== undefined ? s.orders.find((r) => r.id === c.for && r.taken !== false) : undefined;
      // Round 7: every crop is paid for at market the moment it goes into the crate, so a harvest can be planted again
      // the same day (the seventh playtest picked eleven crops on Summer 5 and still had nothing to plant with); a
      // request adds its gain when it is filled.
      if (homestead(s)) payAtCrate(s, c.kind, q, ev);
      else s.stock[c.kind][q] += 1;
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
      if (forReq) forReq.got = (forReq.got ?? 0) + 1;
      ev.push({ type: 'harvest', x, y, crop: c.kind, quality: q, by, req: forReq?.id });
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
      // Sunup's sprinkler waters for a season, then wears out.
      s.builds.push(kind === 'sprinkler' && homestead(s) ? { id: s.nextId++, kind, x, y, left: SPRINKLER_MORNINGS } : { id: s.nextId++, kind, x, y });
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
 * Plots an upgraded tool works, all in the aimed plot's own field (never the
 * path or the next field). Round 8: level 1 works the whole row of the field
 * (east to west, the way the crops are sown), the aimed plot first; level 2
 * that row and the one beside it (the one below, or above on the field's
 * last row). It was three in a row and a three by three square: a four-wide
 * row still took two taps, and the gold square covered no more of a field in
 * four taps than the copper rows.
 */
export function area(s: WorldState, x: number, y: number, level: number): { x: number; y: number }[] {
  if (level <= 0) return [{ x, y }];
  if (!homestead(s)) return level >= 2 ? square(x, y) : three(s, x, y);
  const field = inMap(x, y) ? s.parcelOf[idx(x, y)] : -1;
  const p = field >= 0 && s.tiles[idx(x, y)] === 'field' ? s.parcels[field] : null;
  if (!p) return [{ x, y }];
  const rows = level >= 2 ? [y, y + 1 < p.y + p.h ? y + 1 : y - 1] : [y];
  const out = [{ x, y }];
  for (const ry of rows) for (let tx = p.x; tx < p.x + p.w; tx++) if (tx !== x || ry !== y) out.push({ x: tx, y: ry });
  return out;
}

/** The older rule sets' upgraded tools: three in a row, slid to stay in the field. */
function three(s: WorldState, x: number, y: number): { x: number; y: number }[] {
  const field = inMap(x, y) ? s.parcelOf[idx(x, y)] : -1;
  const inField = (tx: number) => field >= 0 && inMap(tx, y) && s.tiles[idx(tx, y)] === 'field' && s.parcelOf[idx(tx, y)] === field;
  if (!inField(x)) return [{ x, y }];
  const from = !inField(x - 1) ? x : !inField(x + 1) ? x - 2 : x - 1;
  return [from, from + 1, from + 2].filter(inField).map((tx) => ({ x: tx, y }));
}

/** The older rule sets' gold tools: the three by three square around the aimed plot. */
function square(x: number, y: number): { x: number; y: number }[] {
  const out = [{ x, y }];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) out.push({ x: x + dx, y: y + dy });
  return out.filter((t) => inMap(t.x, t.y));
}

/**
 * Sunup: what on the farm still wants doing today: ripe crops, thirsty ones,
 * bugs and crows. (Bare soil is a choice, not a chore.) The sleep question
 * asks only when something does.
 */
export function workLeft(s: WorldState): { ripe: number; thirsty: number; bugs: number; crows: number } {
  const out = { ripe: 0, thirsty: 0, bugs: 0, crows: 0 };
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (!c || c.dead || s.parcelOf[i] < 0 || !s.parcels[s.parcelOf[i]].owned) continue;
    if (c.stage === 4) out.ripe++;
    else if (c.bugs > 0) out.bugs++;
    else if (s.rules.growth === 'classic' ? !s.plots[i].wet : s.plots[i].moisture <= CROPS[c.kind].thirst) out.thirsty++;
  }
  out.crows = s.crows.filter((c) => c.phase === 'in' || c.phase === 'peck').length;
  return out;
}

/**
 * Sunup, round 7: a crop paid for as it goes into the crate, at market price.
 * The coins count at once (a small rise of coins at the crate says so) and
 * the day's sales are kept for the morning card ("sold 8 for 340").
 */
export function payAtCrate(s: WorldState, crop: CropId, quality: number, ev: SimEvent[]): void {
  const value = priceOf(s, crop, quality);
  s.coins += value;
  s.stats.earned += value;
  s.almanac.earned += value;
  const today = (s.soldToday ??= []);
  const row = today.find((r) => r.crop === crop);
  if (row) {
    row.n += 1;
    row.value += value;
  } else today.push({ crop, n: 1, value });
  ev.push({ type: 'coins', amount: value, crate: true });
}

/**
 * Sunup: what the sleep question has to say. Before evening it always asks
 * (round 7: Space on a focused Sleep button put the farmer to bed at 3:27
 * pm, twice); at any hour it asks while something on the farm would be lost
 * overnight or a request still wants planting today on its last day for it.
 * `urgent` is the one thing it names, most pressing first. Never while the
 * first lesson teaches sleep, nor with no stamina left for any job.
 */
export function sleepAsk(s: WorldState, opts: { teaching: boolean; flock: boolean; owedToday: number }): { ask: boolean; left: ReturnType<typeof workLeft> } {
  const left = workLeft(s);
  if (opts.teaching) return { ask: false, left };
  const pests = (left.bugs > 0 && s.stamina >= STAMINA_COST.tend) || left.crows > 0;
  const tired = s.stamina < Math.min(STAMINA_COST.tend, STAMINA_COST.plant, STAMINA_COST.water);
  const early = s.minute < SLEEP_ASK_BEFORE && !tired;
  return { ask: early || opts.flock || pests || (opts.owedToday > 0 && s.stamina >= STAMINA_COST.plant), left };
}

/** Sunup: before this game minute (6 pm), sleep always asks first. */
export const SLEEP_ASK_BEFORE = 720;

/** Sunup: the reputation the land agent wants before he sells a field (0 under other rules, or when it is owned). */
export function fieldRep(s: WorldState, id: number): number {
  const p = s.parcels[id];
  if (!p || p.owned || !homestead(s)) return 0;
  return FIELD_REP[id] ?? 0;
}

/** Sale value of one crop at a quality, with the market's mood under orders. */
export function priceOf(s: WorldState, crop: CropId, quality: number): number {
  const demand = s.rules.goal === 'orders' ? s.market.demand[crop] : 1;
  return Math.round(CROPS[crop].price * QUALITY_MULT[quality] * demand);
}

