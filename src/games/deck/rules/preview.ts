// What a play would do, for the board to show while a card is held. The play
// runs on a copy of the run, and each crop is scored for the night it will
// next be pulled, against the plot as it will stand that night: a bonus only
// counts if the crop giving it is still there when the other is pulled. A
// radish held beside a carrot that ripens tomorrow shows the +2 the carrot
// gives it tonight, and the carrot's +1 bloom greyed out, because the radish
// will be gone by then. Nothing here touches the real run or its rng.

import { CARDS, isSeed } from './cards';
import { crowReach, forecast, isFinal, isRipe, pageOn, type Fate } from './board';
import { scoreHarvest, snapshot, type Snapshot } from './night';
import { cloneRun, playCard } from './run';
import type { CardId, Harvest, RunState, SeedId } from './types';

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

/**
 * Round 9: bonuses tonight's pay counts that come from a ripe crop no scarecrow guards, while a crow is about: the crow
 * takes one such crop before the harvest, so they may not come. The ninth playtest's corn previewed 252; the crow took
 * the sunflower beside it first and the night paid about 50 less.
 */
export interface Risk {
  yield: number;
  bloom: number;
  times: number;
  /** The plot of the crop the crow may take, for the reason. */
  from: number;
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
  /** Round 9: what it gains from a crop a crow about tonight may take first (part of the gains above). */
  risk?: Risk;
  /**
   * A crop already standing whose pay the play changes: what its next pick pays after the play, on the night it is
   * pulled. The sixth playtest saw a held radish's own "4" and only "+1" on the carrot beside it; the carrot's new
   * total (36) showed only when the plot was tapped.
   */
  total?: number;
}

export interface Preview {
  plot: number | null;
  /**
   * A seed: what it would score on that plot, on the night it is pulled. late: that night is next season (the plot
   * carries over). never: that night falls after the run's last winter, so it is never pulled.
   */
  harvest: { yield: number; bloom: number; score: number; late: boolean; never?: boolean } | null;
  /** Crops (and the new seed) whose harvest or growth the play changes. */
  marks: Mark[];
  /** Plots whose crop the play brings in tonight (the can, rain, the fertiliser): each gets tonight's moon. */
  tonight: number[];
  /** With Market Day kept: the plots whose harvest tonight would be a fifth (tenth, fifteenth), after the play. */
  market: number[];
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

/** Is the crop with this fate picked on night n? A perennial picks every night from its first pick to its last. */
function pickedOn(f: Fate | null, n: number): boolean {
  return !!f && f.ripeIn <= n && n <= f.leave;
}

/**
 * The crop's place in night n's harvests, from 1: the crops picked that night before it in reading order, and
 * tonight any the shears already pulled today. Market Day doubles every fifth, so the previews must know it.
 */
export function harvestIndex(s: RunState, fates: readonly (Fate | null)[], i: number, n: number): number {
  let k = n === 0 ? s.dayHarvests : 0;
  for (let j = 0; j < i; j++) if (pickedOn(fates[j], n)) k++;
  return k + 1;
}

/** With Market Day kept, the plots whose harvest tonight is a fifth (or tenth, or fifteenth): they pay x2. */
export function marketTonight(s: RunState, fates: readonly (Fate | null)[] = forecast(s)): number[] {
  if (!pageOn(s, 'market')) return [];
  const out: number[] = [];
  s.plots.forEach((_, i) => {
    if (pickedOn(fates[i], 0) && harvestIndex(s, fates, i, 0) % 5 === 0) out.push(i);
  });
  return out;
}

/** Score a crop for its next pick: against the plot that night (timed), or against the plot as it stands now. */
function scoreFor(s: RunState, i: number, fates: readonly (Fate | null)[], timed: boolean): Harvest {
  const pull = fates[i]?.pull ?? Infinity;
  const snap = timed ? plotOnNight(s, fates, pull) : snapshot(s);
  const night = Number.isFinite(pull) ? pull : 0;
  // The sun only reaches crops pulled tonight; pests only bite if they are still on the crop that night; Market Day
  // doubles the crop that night's harvests reach fifth.
  return scoreHarvest(s, i, snap, { suns: pull === 0 ? suns(s) : 0, shears: false, roll: false, night, n: harvestIndex(s, fates, i, night) });
}

/**
 * A harvest's bloom, added and multiplied. Market Day is left out: which crop is fifth tonight is not a bonus
 * from the plot a card is aimed at, so it is shown as the stamp moving, not as a x2 or x0.5 on a neighbour.
 */
function parts(h: Harvest): { add: number; times: number } {
  let add = 0;
  let times = 1;
  for (const st of h.mult) {
    if (st.icon === 'market') continue;
    if (st.op === '+') add += st.v;
    else times *= st.v;
  }
  return { add, times };
}

/**
 * The first bonus the plot seems to give that the timed plot does not: where it comes from. Round 9: one from the
 * plot the card is aimed at first, so a reason names the crop the play is about (the ninth playtest's radish over B4
 * said "The other corn is pulled before this one ripens.", a corn's bonus lost long before the radish came).
 */
function missingFrom(seen: Harvest, paid: Harvest, prefer: number | null = null): number | null {
  const has = (st: { icon: string; from?: number }) => [...paid.chips, ...paid.mult].some((p) => p.icon === st.icon && p.from === st.from);
  const gone = [...seen.chips, ...seen.mult].filter((x) => x.from !== undefined && !has(x));
  return (gone.find((x) => x.from === prefer) ?? gone[0])?.from ?? null;
}

/** The harvest again with these plots' crops gone from the plot (a crow may take one of them first). */
function without(s: RunState, i: number, fates: readonly (Fate | null)[], gone: readonly number[]): Harvest {
  const snap = plotOnNight(s, fates, 0);
  for (const j of gone) snap.crops[j] = null;
  return scoreHarvest(s, i, snap, { suns: suns(s), shears: false, roll: false, night: 0, n: harvestIndex(s, fates, i, 0) });
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
  const final = isFinal(s);
  const marks: Mark[] = [];
  let harvest: Preview['harvest'] = null;
  const pulled = ev.find((e): e is Extract<typeof e, { t: 'harvest' }> => e.t === 'harvest');
  if (pulled) harvest = { yield: pulled.h.chipsTotal, bloom: pulled.h.multTotal, score: pulled.h.score, late: false };
  const gains = (h: Harvest, from: { chips: number; add: number; times: number }) => {
    const q = parts(h);
    return { yield: h.chipsTotal - from.chips, bloom: q.add - from.add, times: q.times / from.times };
  };
  const tonight: number[] = [];
  const totals = (h: Harvest) => ({ chips: h.chipsTotal, ...parts(h) });
  // A crow about tonight takes one ripe crop no scarecrow guards before the harvest, as the plot stands after the play.
  const reach0 = s.crow ? crowReach(s) : [];
  const reach1 = c.crow ? crowReach(c) : [];
  c.plots.forEach((p, i) => {
    const crop = p.crop;
    if (!crop) return;
    const j = s.plots.findIndex((q) => q.crop?.uid === crop.uid);
    const late1 = f1[i]!.late;
    if (f1[i]!.ripeIn === 0 && j >= 0 && f0[j]!.ripeIn !== 0) tonight.push(i);
    // In the run's last winter a crop that ripens after the last night is never pulled: it gains nothing.
    if (final && late1 && j >= 0) return;
    const paid1 = scoreFor(c, i, f1, true);
    const seen1 = scoreFor(c, i, f1, false);
    // Before the play: the new seed starts from its bare base; a standing crop from what it would get anyway.
    // The Root Cellar is printed on the card's face, so it is part of the bare base, not a bonus from this plot.
    const cellar = paid1.chips.filter((st) => st.icon === 'cellar').reduce((a, st) => a + st.v, 0);
    // So is a buyer's or a glut's multiplier (a season's twist): it is the crop's, wherever it goes, not a bonus from the plot.
    const market = paid1.mult.filter((st) => st.icon === 'buyer' || st.icon === 'glut').reduce((a, st) => a * st.v, 1);
    const bare = { chips: paid1.base + cellar, add: 0, times: market };
    const paid0 = j < 0 ? bare : totals(scoreFor(s, j, f0, true));
    const seen0 = j < 0 ? bare : totals(scoreFor(s, j, f0, false));
    const shown = gains(seen1, seen0);
    // What pays, on the night it is pulled: this season or, the plot carrying over, next.
    const pay = gains(paid1, paid0);
    if (j < 0) harvest = final && late1 ? { yield: paid1.chipsTotal, bloom: paid1.multTotal, score: 0, late: true, never: true } : { yield: paid1.chipsTotal, bloom: paid1.multTotal, score: paid1.score, late: late1 };
    if (j < 0 && final && late1) return;
    const nights = isRipe(crop) || j < 0 ? 0 : Math.max(0, Math.min(f0[j]!.ripeIn, 40) - Math.min(f1[i]!.ripeIn, 40));
    const m: Mark = { plot: i, yield: pay.yield, bloom: pay.bloom, times: pay.times, nights };
    // A crop the play brings in tonight (the can, the fertiliser) shows what it will pay tonight too: the seventh
    // playtest watered a carrot that then paid 21 and saw only "+1 moon".
    const comes = f1[i]!.ripeIn === 0 && j >= 0 && f0[j]!.ripeIn !== 0;
    if (j >= 0 && (pay.yield || pay.bloom || !near(pay.times, 1) || comes)) m.total = paid1.score;
    const lost = { yield: shown.yield - pay.yield, bloom: shown.bloom - pay.bloom, times: shown.times / pay.times };
    if (lost.yield > 0 || lost.bloom > 0 || lost.times > 1 + 1e-6) m.lost = { ...lost, why: 'gone', from: missingFrom(seen1, paid1, plot) };
    // Pulled tonight with a crow about: the part of what the play adds that comes from a crop the crow may take first.
    if (f1[i]!.pull === 0 && reach1.length) {
      const givers = (h: Harvest, reach: readonly number[]) => [...new Set([...h.chips, ...h.mult].map((st) => st.from).filter((f): f is number => f !== undefined && f !== i && reach.includes(f)))];
      const g1 = givers(paid1, reach1);
      if (g1.length) {
        const safe1 = totals(without(c, i, f1, g1));
        const g0 = j < 0 ? [] : givers(scoreFor(s, j, f0, true), reach0);
        const safe0 = j < 0 ? bare : f0[j]!.pull === 0 ? totals(without(s, j, f0, g0)) : paid0;
        const safe = { yield: safe1.chips - safe0.chips, bloom: safe1.add - safe0.add, times: safe1.times / safe0.times };
        const risk = { yield: pay.yield - safe.yield, bloom: pay.bloom - safe.bloom, times: pay.times / safe.times };
        if (risk.yield > 1e-6 || risk.bloom > 1e-6 || risk.times > 1 + 1e-6) m.risk = { ...risk, from: g1.find((g) => g === plot) ?? g1[0] };
      }
    }
    if (m.yield || m.bloom || !near(m.times, 1) || m.nights || m.lost) marks.push(m);
  });
  return { plot, harvest: isSeed(card.id) || pulled ? harvest : null, marks, tonight, market: marketTonight(c, f1) };
}

/** Crops said as many in a reason line ("The beans are pulled..."). */
const MANY: readonly CardId[] = ['beans'];

/**
 * Why a greyed bonus won't pay, in one plain line under the aimed plot, or null: "The radish is pulled before the
 * carrot ripens." Round 9: only from a mark that involves the aimed plot (its own bonus, or one it gives); otherwise no
 * line. The ninth playtest's radish over B4 said "The other corn is pulled before this one ripens." and a carrot over B4
 * "The radish is pulled before the sunflower ripens.", from the first lost mark found anywhere on the plot. With a crow
 * about, a bonus from a crop it may take says so: "The crow may take the sunflower first." `seed` stands in for the
 * held seed, not on the plot yet.
 */
export function previewReason(s: RunState, p: Preview, aim: number, seed: SeedId | null): string | null {
  if (p.harvest?.never) return 'Too late to ripen before the end.';
  const kind = (i: number | null) => (i === null ? null : (s.plots[i]?.crop?.kind ?? (i === aim ? seed : null)));
  const name = (k: SeedId) => CARDS[k].name.toLowerCase();
  const many = (k: SeedId) => MANY.includes(k);
  // The aimed plot's own bonus first, then one it gives.
  const mine = <T>(f: (m: Mark) => T | undefined) => p.marks.filter((m) => m.plot === aim && f(m)).concat(p.marks.filter((m) => m.plot !== aim && f(m)));
  const l = mine((m) => (m.lost && (m.plot === aim || m.lost.from === aim) ? m : undefined))[0];
  if (l?.lost) {
    const taker = kind(l.plot);
    const giver = kind(l.lost.from);
    if (!taker || !giver) return 'Its neighbour is pulled first.';
    // Two of a kind side by side: "The other beans are pulled before these ripen." (it said "the beans ... the beans").
    if (taker === giver) return many(giver) ? `The other ${name(giver)} are pulled before these ripen.` : `The other ${name(giver)} is pulled before this one ripens.`;
    return `The ${name(giver)} ${many(giver) ? 'are' : 'is'} pulled before the ${name(taker)} ${many(taker) ? 'ripen' : 'ripens'}.`;
  }
  const r = mine((m) => (m.risk && (m.plot === aim || m.risk.from === aim) ? m : undefined))[0];
  if (r?.risk) {
    const giver = kind(r.risk.from);
    if (r.risk.from === aim) return 'The crow may take it before the harvest.';
    return giver ? `The crow may take the ${name(giver)} first.` : 'The crow may take its neighbour first.';
  }
  if (p.harvest?.late) return 'Ripens next season.';
  return null;
}

/**
 * What the crop on plot i will pay at its next pick, on the night it is pulled and against the plot as it will
 * stand then. never: in the run's last winter, it ripens after the last night.
 */
export function nextPick(s: RunState, i: number): { score: number; ripeIn: number; late: boolean; never: boolean } | null {
  if (!s.plots[i]?.crop) return null;
  const fates = forecast(s);
  const f = fates[i];
  if (!f || !Number.isFinite(f.pull)) return null;
  const never = f.late && isFinal(s);
  return { score: never ? 0 : scoreFor(s, i, fates, true).score, ripeIn: f.ripeIn, late: f.late, never };
}
