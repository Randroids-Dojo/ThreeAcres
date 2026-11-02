// The night and the scoring cascade. Each harvest is chips times mult: chips
// start at the crop's base value plus flat bonuses, mult starts at 1, gains
// additive bonuses, then any times multipliers. Every bonus a crop gets from
// another crop is about what stands next to it, so the board shows it.

import { baseChips, CARDS, SEEDS } from './cards';
import { around, bySeason, engineNum, guarded, immune, isEmpty, isRipe, isTall, neighbours, newTally, pageOn, perennial, picksOf, twistOn, TUNING } from './board';
import { pick, rand } from './rng';
import type { Crop, Ev, Harvest, NightGrowth, ObjectId, RunState, SeedId, Step } from './types';

/** The board as the harvest starts: neighbour rules read this, not the emptying board. */
export interface Snapshot {
  crops: (Crop | null)[];
  objs: (ObjectId | null)[];
}

export function snapshot(s: RunState): Snapshot {
  return { crops: s.plots.map((p) => (p.crop ? { ...p.crop } : null)), objs: s.plots.map((p) => p.obj) };
}

export interface ScoreOpts {
  suns: number;
  shears: boolean;
  /** Roll the clover. False for previews, which must not touch the rng. */
  roll: boolean;
  /** Nights from tonight the harvest falls on (previews): pests still on the crop then halve its pay. */
  night?: number;
  /** Its place in that night's harvests, from 1 (previews: Market Day doubles every fifth). The night itself counts as it goes. */
  n?: number;
}

/** Scoops a harvest puts back: one when the crop is pulled up, and every pick of a strawberry. */
export function scoopsBack(kind: SeedId, leaves: boolean): number {
  if (kind === 'strawberry') return TUNING.scoopBack;
  if (!leaves || TUNING.scoopFrom === 'none') return 0;
  if (TUNING.scoopFrom === 'paid' && CARDS[kind].cost < 1) return 0;
  return TUNING.scoopBack;
}

/** Score the crop at plot i as if it were harvested now, without changing anything except the clover roll. */
export function scoreHarvest(s: RunState, i: number, snap: Snapshot, o: ScoreOpts): Harvest {
  const crop = s.plots[i].crop!;
  const kind = crop.kind;
  const base = baseChips(kind, crop.up);
  const chips: Step[] = [];
  const mult: Step[] = [];
  const nb = neighbours(s, i);
  // This season's twist, if the harvest falls within the season (a preview of next season's pick leaves it out).
  const tw = twistOn(s, o.night ?? 0);

  const near = (k: string) => nb.filter((j) => snap.crops[j]?.kind === k);
  // A page at work on the night it is pulled (a twist may rest one for the season).
  const page = (id: Parameters<typeof pageOn>[1]) => pageOn(s, id, o.night ?? 0);
  if (kind === 'radish') {
    const c = near('carrot')[0];
    if (c !== undefined) chips.push({ label: 'next to a carrot', icon: 'carrot', op: '+', v: 2, from: c });
  }
  if (kind === 'lettuce') {
    const t = nb.find((j) => !!snap.crops[j] && isTall(snap.crops[j]!.kind));
    if (t !== undefined) chips.push({ label: 'next to a tall crop', icon: snap.crops[t]!.kind, op: '+', v: 4, from: t });
  }
  if (kind === 'wheat') for (const j of near('wheat')) chips.push({ label: 'wheat next to it', icon: 'wheat', op: '+', v: 2, from: j });
  for (const j of near('beans')) chips.push({ label: 'beans next to it', icon: 'beans', op: '+', v: 2, from: j });
  if (crop.compost > 0) chips.push({ label: crop.compost > 1 ? `compost x${crop.compost}` : 'compost', icon: 'compost', op: '+', v: 6 * crop.compost });
  if (crop.rot && page('rotation')) chips.push({ label: 'crop rotation', icon: 'rotation', op: '+', v: 4 });
  if ((kind === 'radish' || kind === 'carrot') && TUNING.cellarYield && page('cellar')) chips.push({ label: 'root cellar', icon: 'cellar', op: '+', v: TUNING.cellarYield });
  if (o.suns > 0) chips.push({ label: o.suns > 1 ? `sun x${o.suns}` : 'sun', icon: 'sun', op: '+', v: 3 * o.suns });
  // Good company: +1 yield for each crop beside it.
  if (tw?.id === 'company') {
    const n = nb.filter((j) => snap.crops[j]).length;
    if (n) chips.push({ label: 'good company', icon: 'company', op: '+', v: n });
  }
  if (o.shears) chips.push({ label: 'shears', icon: 'shears', op: 'x', v: 2 });

  if (kind === 'carrot') for (const j of near('radish')) mult.push({ label: 'a radish next to it', icon: 'radish', op: '+', v: 1, from: j });
  // The Root Cellar pairs the roots: a radish beside a carrot (or a carrot beside a radish) gets +1 bloom for each, up to +2.
  // It used to count every root beside a root, uncapped, and a carrot ringed by radishes on a bare plot won every run.
  if ((kind === 'radish' || kind === 'carrot') && page('cellar')) {
    for (const j of near(kind === 'radish' ? 'carrot' : 'radish').slice(0, TUNING.cellarCap)) mult.push({ label: 'root cellar', icon: 'cellar', op: '+', v: 1, from: j });
  }
  // A sunflower faces the crop below it (the plate's foot, where the sun is) and blooms it. A season's twist may turn
  // the sunflowers up (they bloom the crop above them) or all round (every crop beside them).
  let bees = 0;
  const giver = (j: number) => j >= 0 && j < snap.crops.length && snap.crops[j]?.kind === 'sunflower';
  const suns = tw?.id === 'sunall' ? nb.filter(giver) : [tw?.id === 'sunup' ? i + s.cols : i - s.cols].filter(giver);
  for (const j of suns) {
    // All round, the crop it faces gets its usual bloom and the others beside it +1 (at +2 each, sunflower decks ran away with the season).
    const v = tw?.id === 'sunall' && j !== i - s.cols ? TUNING.sunAll : TUNING.sunBloom;
    mult.push({ label: j === i - s.cols ? 'sunflower above it' : j === i + s.cols ? 'sunflower below it' : 'sunflower beside it', icon: 'sunflower', op: '+', v, from: j });
    if (TUNING.beesSun) bees++;
  }
  // Beehives bloom the 3 by 3 around them; a crop takes the bloom of `hiveCap` hives at most (round 7: hives stacked
  // without end, and a plot ringed by them paid 150 to 320 a night in the seventh playtest).
  let hives = 0;
  for (const j of around(s, i)) {
    if (snap.objs[j] !== 'beehive' || hives >= TUNING.hiveCap) continue;
    mult.push({ label: 'beehive', icon: 'beehive', op: '+', v: 1, from: j });
    hives++;
    bees++;
  }
  // Busy Bees: one multiplier for a crop a beehive blooms, however many there are (it used to double every bee); its
  // level (round 8) sets how much.
  if (bees && page('bees')) mult.push({ label: 'busy bees', icon: 'bees', op: 'x', v: engineNum(s, 'bees') });
  // Trellis (round 7): beans and strawberries bloom each crop beside them.
  if (page('vines') && (TUNING.vinesSelf || (kind !== 'beans' && kind !== 'strawberry'))) {
    const vines = nb.filter((j) => snap.crops[j]?.kind === 'beans' || (TUNING.vinesBerry && snap.crops[j]?.kind === 'strawberry')).slice(0, TUNING.vinesCap);
    for (const j of vines) mult.push({ label: `${snap.crops[j]!.kind === 'beans' ? 'beans' : 'a strawberry'} beside it`, icon: 'vines', op: '+', v: engineNum(s, 'vines'), from: j });
  }
  // Tall Rows (round 7): corn and sunflowers bloom for each crop beside them.
  if ((kind === 'corn' || kind === 'sunflower') && page('tall')) {
    for (const j of nb) if (snap.crops[j]) mult.push({ label: 'a crop beside it', icon: 'tall', op: '+', v: engineNum(s, 'tall'), from: j });
  }
  if (kind === 'corn') {
    const b = near('beans')[0];
    if (b !== undefined) mult.push({ label: 'next to beans', icon: 'beans', op: 'x', v: 1.5, from: b });
  }
  if (kind === 'pumpkin' && nb.every((j) => !snap.crops[j] && !snap.objs[j])) mult.push({ label: 'room to sprawl', icon: 'alone', op: 'x', v: 2 });
  for (const j of near('chili')) mult.push({ label: 'chili next to it', icon: 'chili', op: 'x', v: 1.5, from: j });
  // A buyer pays double for one crop this season; a glut halves another's pay.
  if (tw?.id === 'buyer' && tw.crop === kind) mult.push({ label: 'a buyer', icon: 'buyer', op: 'x', v: TUNING.buyerTimes });
  if (tw?.id === 'glut' && tw.crop === kind) mult.push({ label: 'a glut', icon: 'glut', op: 'x', v: TUNING.glutTimes });
  // Pests still on the crop the night it is pulled halve its pay.
  if (crop.pest > (o.night ?? 0)) mult.push({ label: 'pests', icon: 'pest', op: 'x', v: TUNING.pestPay });
  const n = o.n ?? s.dayHarvests + 1;
  if (page('market') && n % 5 === 0) mult.push({ label: 'market day', icon: 'market', op: 'x', v: 2 });
  let golden = false;
  if (o.roll && page('clover') && rand(s) < 1 / 8) {
    golden = true;
    mult.push({ label: 'four-leaf clover', icon: 'clover', op: 'x', v: 3 });
  }

  let ch = base;
  for (const st of chips) ch = st.op === '+' ? ch + st.v : ch * st.v;
  let m = 1;
  for (const st of mult) if (st.op === '+') m += st.v;
  for (const st of mult) if (st.op === 'x') m *= st.v;
  const leaves = crop.picks + 1 >= picksOf(s, kind, o.night ?? 0);
  return {
    plot: i,
    uid: crop.uid,
    kind,
    up: crop.up,
    base,
    chips,
    mult,
    chipsTotal: ch,
    multTotal: m,
    score: Math.round(ch * m),
    n,
    golden,
    shears: o.shears,
    leaves,
    scoops: scoopsBack(kind, leaves),
  };
}

/**
 * Bank a harvest: coins, the day's counters, the scoops it puts back, and the
 * crop leaves or stays. At night the scoops go on the next morning's bench; a
 * crop pulled in the day (the shears) puts them on today's.
 */
export function applyHarvest(s: RunState, h: Harvest, ev: Ev[], now = false, beside = 0): void {
  const p = s.plots[h.plot];
  const crop = p.crop!;
  const before = s.earned;
  tallyHarvest(s, h, beside);
  s.dayHarvests++;
  s.coins += h.score;
  s.earned += h.score;
  s.stats.totalEarned += h.score;
  s.stats.harvests++;
  s.stats.byKind ??= {};
  s.stats.byKind[h.kind] = (s.stats.byKind[h.kind] ?? 0) + h.score;
  if (h.score > s.stats.bestHarvest) {
    s.stats.bestHarvest = h.score;
    s.stats.bestKind = h.kind;
  }
  crop.picks++;
  if (h.leaves) {
    p.crop = null;
    p.last = h.kind;
  }
  // The event carries the scoops that really went back: none past tonight's cap.
  if (h.scoops) {
    if (now) {
      s.energy += h.scoops;
      s.bench += h.scoops;
    } else {
      const room = Math.max(0, TUNING.scoopCap - s.saved);
      h.scoops = Math.min(h.scoops, room);
      s.saved += h.scoops;
    }
  }
  ev.push({ t: 'harvest', h });
  if (before < s.quota && s.earned >= s.quota) ev.push({ t: 'quota', earned: s.earned, quota: s.quota });
}

/** What one bonus added to a harvest's pay: a + to yield or bloom, or a x. */
export function stepCoins(h: Harvest, st: Step, yieldStep: boolean): number {
  if (yieldStep) return st.op === '+' ? st.v * h.multTotal : 0;
  if (st.op === 'x') return h.score * (1 - 1 / st.v);
  const times = h.mult.filter((x) => x.op === 'x').reduce((a, x) => a * x.v, 1);
  return h.chipsTotal * st.v * times;
}

/**
 * Keep the season's tally (round 7): coins by crop, by the row a sown crop was pulled from, what each bonus added,
 * what pests took, what good company and one more pick would have added. The stall aims its twists with it.
 */
function tallyHarvest(s: RunState, h: Harvest, beside: number): void {
  const t = (s.tally ??= newTally(s.rows));
  t.take += h.score;
  t.harvests++;
  t.kinds[h.kind] = (t.kinds[h.kind] ?? 0) + h.score;
  if (h.leaves) {
    const r = Math.floor(h.plot / s.cols);
    t.rows[r] = (t.rows[r] ?? 0) + h.score;
    t.rowKinds[r] ??= {};
    t.rowKinds[r][h.kind] = (t.rowKinds[r][h.kind] ?? 0) + h.score;
    if (perennial(h.kind)) t.last += h.score;
  }
  for (const st of h.chips) t.from[st.icon] = (t.from[st.icon] ?? 0) + stepCoins(h, st, true);
  for (const st of h.mult) {
    if (st.icon === 'pest') t.pests += h.score;
    else t.from[st.icon] = (t.from[st.icon] ?? 0) + stepCoins(h, st, false);
  }
  if (beside && !h.chips.some((st) => st.icon === 'company')) t.company += beside * h.multTotal;
}

/**
 * Resolve the night: weather, growth, the crow (if one was about at dawn),
 * the harvest cascade, then pests and mint. Pests on a crop at dusk halve its
 * pay if it is pulled tonight, then count down; pests that land or spread
 * tonight start biting tomorrow. So the nights shown on a pested crop are
 * exactly the nights it pays half, and what the board previews in the day is
 * what the night pays, unless a storm or a crow comes. Every crop pulled up
 * puts a scoop back on the next morning's bench.
 */
export function night(s: RunState, ev: Ev[]): void {
  const weather = s.tonight;
  s.tonight = [];
  ev.push({ t: 'dusk', weather: [...weather] });
  for (const p of s.plots) p.last = null;
  const startEarned = s.earned;
  const crow = s.crow;
  s.crow = false;

  // 1. Weather.
  const rains = weather.filter((w) => w === 'rain').length;
  const storms = weather.filter((w) => w === 'storm').length;
  const suns = weather.filter((w) => w === 'sun').length;
  if (rains + storms > 0) ev.push({ t: 'rain', plots: s.plots.map((_, i) => i) });
  for (let k = 0; k < storms; k++) {
    const crops = s.plots.map((p, i) => (p.crop ? i : -1)).filter((i) => i >= 0);
    if (!crops.length) break;
    const i = pick(s, crops);
    const c = s.plots[i].crop!;
    s.plots[i].crop = null;
    ev.push({ t: 'flatten', plot: i, kind: c.kind, uid: c.uid });
  }

  // 2. Every crop grows a night, plus any boost from the can or the weather.
  const extra = rains + storms * 2;
  const growth: NightGrowth[] = [];
  const pestedAtDusk = s.plots.map((p, i) => (p.crop?.pest ? i : -1)).filter((i) => i >= 0);
  s.plots.forEach((p, i) => {
    const c = p.crop;
    const boost = p.boost;
    p.boost = 0;
    if (!c || isRipe(c)) return;
    const from = c.age;
    c.age = Math.min(c.days, c.age + 1 + extra + boost);
    growth.push({ plot: i, uid: c.uid, from, to: c.age });
  });
  if (growth.length) ev.push({ t: 'grow', growth });

  // 3. A crow, if one sat on the plate at dawn, takes one unguarded ripe crop: tonight's pick of a perennial too (it
  // used to use up a later pick and let tonight's pay in full).
  let crowed = -1;
  if (crow) {
    const opts = s.plots.map((p, i) => (p.crop && isRipe(p.crop) && !guarded(s, i) ? i : -1)).filter((i) => i >= 0);
    if (opts.length) {
      const i = pick(s, opts);
      const c = s.plots[i].crop!;
      ev.push({ t: 'crow', plot: i, kind: c.kind, uid: c.uid });
      c.picks++;
      if (c.picks >= picksOf(s, c.kind)) s.plots[i].crop = null;
      else crowed = i;
    }
  }

  // 4. The harvest, in reading order. Neighbour rules read the board as it starts.
  const snap = snapshot(s);
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (!c || !isRipe(c) || i === crowed) continue;
    const beside = neighbours(s, i).filter((j) => snap.crops[j]).length;
    applyHarvest(s, scoreHarvest(s, i, snap, { suns, shears: false, roll: true }), ev, false, beside);
  }

  // 5. Pests count down, may spread, and new ones may land on a growing crop (from summer of year 1, more each season).
  // A calm season (a twist) brings no new pests and none spread; those already on a crop count down.
  const calm = twistOn(s)?.id === 'calm';
  {
    const gone: number[] = [];
    const still = pestedAtDusk.filter((i) => s.plots[i].crop?.pest);
    for (const i of still) {
      const c = s.plots[i].crop!;
      c.pest--;
      if (!c.pest) gone.push(i);
    }
    if (gone.length) ev.push({ t: 'pestGone', plots: gone });
    for (const i of still) {
      if (calm || rand(s) >= TUNING.pestSpread) continue;
      const opts = neighbours(s, i).filter((j) => s.plots[j].crop && !s.plots[j].crop!.pest && !immune(s, j));
      if (!opts.length) continue;
      const j = pick(s, opts);
      s.plots[j].crop!.pest = TUNING.pestNights;
      s.stats.pests++;
      ev.push({ t: 'pest', plot: j, from: i });
    }
    const chance = calm ? 0 : bySeason(TUNING.pestChance, s);
    if (chance > 0 && rand(s) < chance) {
      const opts = s.plots.map((p, i) => (p.crop && !isRipe(p.crop) && !p.crop.pest && !immune(s, i) ? i : -1)).filter((i) => i >= 0);
      if (opts.length) {
        const j = pick(s, opts);
        s.plots[j].crop!.pest = TUNING.pestNights;
        s.stats.pests++;
        ev.push({ t: 'pest', plot: j, from: null });
      }
    }
  }

  // 6. Mint creeps into an empty neighbour.
  const mints = s.plots.map((p, i) => (p.crop?.kind === 'mint' ? i : -1)).filter((i) => i >= 0);
  for (const i of mints) {
    const opts = neighbours(s, i).filter((j) => isEmpty(s.plots[j]));
    if (!opts.length) continue;
    const j = pick(s, opts);
    const uid = s.nextUid++;
    s.plots[j].crop = { uid, kind: 'mint', age: 0, days: SEEDS.mint.days, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: true };
    ev.push({ t: 'mint', from: i, to: j, uid });
  }
  s.stats.bestDay = Math.max(s.stats.bestDay, s.earned - startEarned);
}
