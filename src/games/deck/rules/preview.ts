// What a play would do, for the board to show while a card is held. The play
// runs on a copy of the run, and each crop is scored for the night it will
// next be pulled, against the plot as it will stand that night: a bonus only
// counts if the crop giving it is still there when the other is pulled. A
// radish held beside a carrot that ripens tomorrow shows the +2 the carrot
// gives it tonight, and the carrot's +1 bloom greyed out, because the radish
// will be gone by then. Nothing here touches the real run or its rng.

import { CARDS, isSeed } from './cards';
import { forecast, isRipe, type Fate } from './board';
import { scoreHarvest, snapshot, type Snapshot } from './night';
import { cloneRun, playCard } from './run';
import type { Harvest, RunState } from './types';

/** Bonuses the board would seem to give but the night will not pay. */
export interface Lost {
  yield: number;
  bloom: number;
  times: number;
  /** gone: the crop giving it is pulled first. */
  why: 'gone';
  /** The plot of the crop that will be gone, for the reason. */
  from: number | null;
}

export interface Mark {
  plot: number;
  /** Yield this crop's harvest gains. */
  yield: number;
  /** Bloom it gains, added. */
  bloom: number;
  /** Bloom multiplier it gains (1.5 for a chili), 1 for none. */
  times: number;
  /** Nights sooner it ripens. */
  nights: number;
  /** What the plot would seem to give but won't pay, greyed on the board with its reason. */
  lost?: Lost;
}

export interface Preview {
  plot: number | null;
  /** A seed: what it would score on that plot, on the night it is pulled. late: that night is next season (the plot carries over). */
  harvest: { yield: number; bloom: number; score: number; late: boolean } | null;
  /** Crops (and the new seed) whose harvest or growth the play changes. */
  marks: Mark[];
}

function suns(s: RunState): number {
  return s.tonight.filter((w) => w === 'sun').length;
}

/** The plot as it will stand on night n: every crop that leaves before then is gone. */
export function plotOnNight(s: RunState, fates: readonly (Fate | null)[], n: number): Snapshot {
  const snap = snapshot(s);
  snap.crops = snap.crops.map((c, i) => (c && (fates[i]?.leave ?? Infinity) >= n ? c : null));
  return snap;
}

/** Score a crop for its next pick: against the plot that night (timed), or against the plot as it stands now. */
function scoreFor(s: RunState, i: number, fates: readonly (Fate | null)[], timed: boolean): Harvest {
  const pull = fates[i]?.pull ?? Infinity;
  const snap = timed ? plotOnNight(s, fates, pull) : snapshot(s);
  // The sun only reaches crops pulled tonight.
  return scoreHarvest(s, i, snap, { suns: pull === 0 ? suns(s) : 0, shears: false, roll: false });
}

function parts(h: Harvest): { add: number; times: number } {
  let add = 0;
  let times = 1;
  for (const st of h.mult) {
    if (st.op === '+') add += st.v;
    else times *= st.v;
  }
  return { add, times };
}

/** The first bonus the plot seems to give that the timed plot does not: where it comes from. */
function missingFrom(seen: Harvest, paid: Harvest): number | null {
  const has = (st: { icon: string; from?: number }) => [...paid.chips, ...paid.mult].some((p) => p.icon === st.icon && p.from === st.from);
  const st = [...seen.chips, ...seen.mult].find((x) => x.from !== undefined && !has(x));
  return st?.from ?? null;
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** Preview playing hand card h on a plot (null for whole-board cards). Null if the play is not allowed. */
export function previewPlay(s: RunState, h: number, plot: number | null, to?: number): Preview | null {
  const card = s.hand[h];
  if (!card) return null;
  const def = CARDS[card.id];
  if (def.target === 'move' && to === undefined) return null;
  const c = cloneRun(s);
  // The preview ignores cost: a card the scoops cannot pay for still shows what it would do.
  c.energy = 99;
  const ev = playCard(c, h, def.target === 'board' ? null : plot, to);
  if (!ev) return null;
  const f0 = forecast(s);
  const f1 = forecast(c);
  const marks: Mark[] = [];
  let harvest: Preview['harvest'] = null;
  const pulled = ev.find((e): e is Extract<typeof e, { t: 'harvest' }> => e.t === 'harvest');
  if (pulled) harvest = { yield: pulled.h.chipsTotal, bloom: pulled.h.multTotal, score: pulled.h.score, late: false };
  const gains = (h: Harvest, from: { chips: number; add: number; times: number }) => {
    const q = parts(h);
    return { yield: h.chipsTotal - from.chips, bloom: q.add - from.add, times: q.times / from.times };
  };
  const totals = (h: Harvest) => ({ chips: h.chipsTotal, ...parts(h) });
  c.plots.forEach((p, i) => {
    const crop = p.crop;
    if (!crop) return;
    const j = s.plots.findIndex((q) => q.crop?.uid === crop.uid);
    const late1 = f1[i]!.late;
    const paid1 = scoreFor(c, i, f1, true);
    const seen1 = scoreFor(c, i, f1, false);
    // Before the play: the new seed starts from its bare base; a standing crop from what it would get anyway.
    // The Root Cellar is printed on the card's face, so it is part of the bare base, not a bonus from this plot.
    const cellar = paid1.chips.filter((st) => st.icon === 'cellar').reduce((a, st) => a + st.v, 0);
    const bare = { chips: paid1.base + cellar, add: 0, times: 1 };
    const paid0 = j < 0 ? bare : totals(scoreFor(s, j, f0, true));
    const seen0 = j < 0 ? bare : totals(scoreFor(s, j, f0, false));
    const shown = gains(seen1, seen0);
    // What pays, on the night it is pulled: this season or, the plot carrying over, next.
    const pay = gains(paid1, paid0);
    if (j < 0) harvest = { yield: paid1.chipsTotal, bloom: paid1.multTotal, score: paid1.score, late: late1 };
    const nights = isRipe(crop) || j < 0 ? 0 : Math.max(0, Math.min(f0[j]!.ripeIn, 40) - Math.min(f1[i]!.ripeIn, 40));
    const m: Mark = { plot: i, yield: pay.yield, bloom: pay.bloom, times: pay.times, nights };
    const lost = { yield: shown.yield - pay.yield, bloom: shown.bloom - pay.bloom, times: shown.times / pay.times };
    if (lost.yield > 0 || lost.bloom > 0 || lost.times > 1 + 1e-6) m.lost = { ...lost, why: 'gone', from: missingFrom(seen1, paid1) };
    if (m.yield || m.bloom || !near(m.times, 1) || m.nights || m.lost) marks.push(m);
  });
  return { plot, harvest: isSeed(card.id) || pulled ? harvest : null, marks };
}
