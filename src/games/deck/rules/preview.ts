// What a play would do, for the board to show while a card is held. The play
// runs on a copy of the run and every crop is scored as if it were pulled now,
// before and after, so a radish held next to a carrot shows the +2 it would
// get, and the carrot shows the bloom it would gain. Nothing here touches the
// real run or its rng.

import { CARDS, isSeed } from './cards';
import { isRipe, nightsLeft, ripeTonight } from './board';
import { scoreHarvest, snapshot, type Snapshot } from './night';
import { cloneRun, playCard } from './run';
import type { Harvest, RunState } from './types';

export interface Mark {
  plot: number;
  /** Yield this crop's harvest gains. */
  yield: number;
  /** Bloom it gains, added. */
  bloom: number;
  /** Bloom multiplier it gains (1.5 for a chili), 1 for none. */
  times: number;
  /** Extra nights of growth tonight. */
  nights: number;
}

export interface Preview {
  plot: number | null;
  /** A seed: what it would score on that plot as things stand. */
  harvest: { yield: number; bloom: number; score: number } | null;
  /** Crops (and the new seed) whose harvest or growth the play changes. */
  marks: Mark[];
}

function suns(s: RunState): number {
  return s.tonight.filter((w) => w === 'sun').length;
}

function scoreAt(s: RunState, i: number, snap: Snapshot): Harvest {
  return scoreHarvest(s, i, snap, { suns: suns(s), shears: false, roll: false });
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
  const snap0 = snapshot(s);
  const snap1 = snapshot(c);
  const sunsAdded = suns(c) - suns(s);
  const marks: Mark[] = [];
  let harvest: Preview['harvest'] = null;
  const pulled = ev.find((e): e is Extract<typeof e, { t: 'harvest' }> => e.t === 'harvest');
  if (pulled) harvest = { yield: pulled.h.chipsTotal, bloom: pulled.h.multTotal, score: pulled.h.score };
  c.plots.forEach((p, i) => {
    const crop = p.crop;
    if (!crop) return;
    const before = s.plots.find((q) => q.crop?.uid === crop.uid);
    const h1 = scoreAt(c, i, snap1);
    const m1 = parts(h1);
    if (!before) {
      // The new seed: its own bonuses, and what it would score.
      const base = h1.base;
      harvest = { yield: h1.chipsTotal, bloom: h1.multTotal, score: h1.score };
      const m: Mark = { plot: i, yield: h1.chipsTotal - base, bloom: m1.add, times: m1.times, nights: 0 };
      if (m.yield || m.bloom || m.times !== 1) marks.push(m);
      return;
    }
    const j = s.plots.indexOf(before);
    const h0 = scoreAt(s, j, snap0);
    const m0 = parts(h0);
    let dy = h1.chipsTotal - h0.chipsTotal;
    // The sun only reaches crops pulled tonight.
    if (sunsAdded > 0 && !ripeTonight(c, i)) dy -= 3 * sunsAdded;
    const nights = isRipe(crop) ? 0 : nightsLeft(s, j) - nightsLeft(c, i);
    const m: Mark = { plot: i, yield: dy, bloom: m1.add - m0.add, times: m1.times / m0.times, nights: Math.max(0, nights) };
    if (m.yield || m.bloom || Math.abs(m.times - 1) > 1e-6 || m.nights) marks.push(m);
  });
  return { plot, harvest: isSeed(card.id) || pulled ? harvest : null, marks };
}
