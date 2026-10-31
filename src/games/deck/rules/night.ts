// The night and the scoring cascade. Each harvest is chips times mult: chips
// start at the crop's base value plus flat bonuses, mult starts at 1, gains
// additive bonuses, then any times multipliers. Every bonus a crop gets from
// another crop is about what stands next to it, so the board shows it.

import { baseChips, SEEDS } from './cards';
import { around, byYear, crowsOn, guarded, immune, isEmpty, isRipe, isTall, neighbours, pestsOn, TUNING } from './board';
import { pick, rand } from './rng';
import type { Crop, Ev, Harvest, NightGrowth, ObjectId, RunState, Step } from './types';

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
}

/** Score the crop at plot i as if it were harvested now, without changing anything except the clover roll. */
export function scoreHarvest(s: RunState, i: number, snap: Snapshot, o: ScoreOpts): Harvest {
  const crop = s.plots[i].crop!;
  const kind = crop.kind;
  const base = baseChips(kind, crop.up);
  const chips: Step[] = [];
  const mult: Step[] = [];
  const nb = neighbours(s, i);
  const bee = s.pages.includes('bees') ? 2 : 1;

  const near = (k: string) => nb.filter((j) => snap.crops[j]?.kind === k);
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
  if (crop.rot) chips.push({ label: 'crop rotation', icon: 'rotation', op: '+', v: 4 });
  if ((kind === 'radish' || kind === 'carrot') && s.pages.includes('cellar')) chips.push({ label: 'root cellar', icon: 'cellar', op: '+', v: 3 });
  if (o.suns > 0) chips.push({ label: o.suns > 1 ? `sun x${o.suns}` : 'sun', icon: 'sun', op: '+', v: 3 * o.suns });
  if (o.shears) chips.push({ label: 'shears', icon: 'shears', op: 'x', v: 2 });

  if (kind === 'carrot') for (const j of near('radish')) mult.push({ label: 'a radish next to it', icon: 'radish', op: '+', v: 1, from: j });
  for (const j of near('sunflower')) mult.push({ label: 'sunflower next to it', icon: 'sunflower', op: '+', v: bee, from: j });
  for (const j of around(s, i)) if (snap.objs[j] === 'beehive') mult.push({ label: 'beehive', icon: 'beehive', op: '+', v: bee, from: j });
  if (kind === 'corn') {
    const b = near('beans')[0];
    if (b !== undefined) mult.push({ label: 'next to beans', icon: 'beans', op: 'x', v: 1.5, from: b });
  }
  if (kind === 'pumpkin' && nb.every((j) => !snap.crops[j] && !snap.objs[j])) mult.push({ label: 'room to sprawl', icon: 'alone', op: 'x', v: 2 });
  for (const j of near('chili')) mult.push({ label: 'chili next to it', icon: 'chili', op: 'x', v: 1.5, from: j });
  const n = s.dayHarvests + 1;
  if (s.pages.includes('market') && n % 5 === 0) mult.push({ label: 'market day', icon: 'market', op: 'x', v: 2 });
  let golden = false;
  if (o.roll && s.pages.includes('clover') && rand(s) < 1 / 8) {
    golden = true;
    mult.push({ label: 'four-leaf clover', icon: 'clover', op: 'x', v: 3 });
  }

  let ch = base;
  for (const st of chips) ch = st.op === '+' ? ch + st.v : ch * st.v;
  let m = 1;
  for (const st of mult) if (st.op === '+') m += st.v;
  for (const st of mult) if (st.op === 'x') m *= st.v;
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
    leaves: crop.picks + 1 >= SEEDS[kind].picks,
  };
}

/** Bank a harvest: coins, the day's counters, and the crop leaves or stays. */
export function applyHarvest(s: RunState, h: Harvest, ev: Ev[]): void {
  const p = s.plots[h.plot];
  const crop = p.crop!;
  const before = s.earned;
  s.dayHarvests++;
  s.coins += h.score;
  s.earned += h.score;
  s.stats.totalEarned += h.score;
  s.stats.harvests++;
  if (h.score > s.stats.bestHarvest) {
    s.stats.bestHarvest = h.score;
    s.stats.bestKind = h.kind;
  }
  crop.picks++;
  if (h.leaves) {
    p.crop = null;
    p.last = h.kind;
  }
  ev.push({ t: 'harvest', h });
  if (before < s.quota && s.earned >= s.quota) ev.push({ t: 'quota', earned: s.earned, quota: s.quota });
}

/** Resolve the night: weather, growth, pests and mint, crows, then the harvest cascade. */
export function night(s: RunState, ev: Ev[]): void {
  const weather = s.tonight;
  s.tonight = [];
  ev.push({ t: 'dusk', weather: [...weather] });
  for (const p of s.plots) p.last = null;
  const startEarned = s.earned;

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

  // 2. Every crop grows a night, plus any boost from the can or the weather. Pests stop it.
  const extra = rains + storms * 2;
  const growth: NightGrowth[] = [];
  s.plots.forEach((p, i) => {
    const c = p.crop;
    const boost = p.boost;
    p.boost = 0;
    if (!c || c.pest || isRipe(c)) return;
    const from = c.age;
    c.age = Math.min(c.days, c.age + 1 + extra + boost);
    growth.push({ plot: i, uid: c.uid, from, to: c.age });
  });
  if (growth.length) ev.push({ t: 'grow', growth });

  // 3. Pests spread and appear; mint spreads.
  if (pestsOn(s)) {
    const pested = s.plots.map((p, i) => (p.crop?.pest ? i : -1)).filter((i) => i >= 0);
    const gone: number[] = [];
    for (const i of pested) {
      const c = s.plots[i].crop!;
      c.pest--;
      if (!c.pest) gone.push(i);
    }
    if (gone.length) ev.push({ t: 'pestGone', plots: gone });
    for (const i of pested) {
      if (rand(s) >= TUNING.pestSpread) continue;
      const opts = neighbours(s, i).filter((j) => s.plots[j].crop && !s.plots[j].crop!.pest && !immune(s, j));
      if (!opts.length) continue;
      const j = pick(s, opts);
      s.plots[j].crop!.pest = TUNING.pestNights;
      ev.push({ t: 'pest', plot: j, from: i });
    }
    if (rand(s) < byYear(TUNING.pestChance, s.year)) {
      const opts = s.plots.map((p, i) => (p.crop && !isRipe(p.crop) && !p.crop.pest && !immune(s, i) ? i : -1)).filter((i) => i >= 0);
      if (opts.length) {
        const j = pick(s, opts);
        s.plots[j].crop!.pest = TUNING.pestNights;
        ev.push({ t: 'pest', plot: j, from: null });
      }
    }
  }
  const mints = s.plots.map((p, i) => (p.crop?.kind === 'mint' && !p.crop.pest ? i : -1)).filter((i) => i >= 0);
  for (const i of mints) {
    const opts = neighbours(s, i).filter((j) => isEmpty(s.plots[j]));
    if (!opts.length) continue;
    const j = pick(s, opts);
    const uid = s.nextUid++;
    s.plots[j].crop = { uid, kind: 'mint', age: 0, days: SEEDS.mint.days, up: false, compost: 0, rot: false, picks: 0, pest: 0, sprout: true };
    ev.push({ t: 'mint', from: i, to: j, uid });
  }

  // 4. A crow may take one unguarded ripe crop, then the harvest runs in reading order.
  if (crowsOn(s) && rand(s) < byYear(TUNING.crowChance, s.year)) {
    const opts = s.plots.map((p, i) => (p.crop && isRipe(p.crop) && !p.crop.pest && !guarded(s, i) ? i : -1)).filter((i) => i >= 0);
    if (opts.length) {
      const i = pick(s, opts);
      const c = s.plots[i].crop!;
      ev.push({ t: 'crow', plot: i, kind: c.kind, uid: c.uid });
      c.picks++;
      if (c.picks >= SEEDS[c.kind].picks) s.plots[i].crop = null;
    }
  }
  const snap = snapshot(s);
  for (let i = 0; i < s.plots.length; i++) {
    const c = s.plots[i].crop;
    if (!c || c.pest || !isRipe(c)) continue;
    applyHarvest(s, scoreHarvest(s, i, snap, { suns, shears: false, roll: true }), ev);
  }
  s.stats.bestDay = Math.max(s.stats.bestDay, s.earned - startEarned);
}
