// Seedbound's strategy table: the balance bot plays every day and only the
// stall policy changes, with the whole catalogue unlocked. This is the fourth
// playtest's simulation (/tmp/playtest4/deck/sim.mts) brought into the repo,
// with the win rate (every season of years 1 to 3 met) and per-year clears.
//
// Round 5 adds how often the best play pattern changes between seasons: for
// each season, the crop that took the most coins and the recipe of its best
// harvest (the crop and the bonuses it had, e.g. carrot with radish, sunflower
// and chili), and the share of seasons in years 2 and 3 where those differ
// from the season before. --noTwists plays without the seasons' twists.
//
// Round 6 adds whether the twist is a real choice: at each stall with twists,
// which of the two the policy picked (a help or a hitch), by the hitch on
// offer, how many kinds of pair were picked both ways across runs (a pick
// that depends on the deck, not on the pair), and two picks that should follow
// the plot: crows with a scarecrow standing against without, and a glut of a
// crop that took a third or more of the run's coins against less. And whether
// bought scoops are used: the scoops left on the bench and the cards left in
// hand at dusk, by scoops bought for good (and by scoops above the usual three
// a morning, Green Thumb and the Long Furrow too).
//
// Round 8 adds the engine page's level when each run ends (II or more, III), the
// coins left at the end, stalls offering a twist aimed as the stall before did,
// and (with --seasons) the median take over quota season by season: the curve.
// --tune=key:value plays any TUNING number; a value in brackets or braces is
// read as JSON (--tune=quotas2:[700,900,1080,1220]).
//
// Round 9 adds the snowball measures: the most any season's median take over quota reached, the median single
// harvest of year 2 (set it against the other engines'), and the coins a won run ends with.
//
// Round 11 adds the greedy preview-following player (deck-players.ts, the eleventh playtest's own script) beside the
// decent bot: policies gBees, gHot, gVines and gTall play every day and stall as that player, and the table at the end
// sets each policy's wins, its year 2 take over quota season by season, the most any season's median reached, the night
// year 2's quota was met and the hitch's share of its picks side by side. Hot Beds' harvests hit 257 and 347 in year 2
// and its takes ran 2.4 and 2.6 times the quotas, while the bot's seasons ran 1.4 to 1.5.
//
// It uses only the bot and the rules' public calls, so the same file runs
// against an older build (copy it into a `git archive` of the commit).
// npx tsx scripts/deck-strategies.ts [runs] [policy...] [--seasons] [--noTwists] [--first=n] [--read]
import { botDay, Dice } from '../src/games/deck/bot';
import * as R from '../src/games/deck/rules';
import { costOf, energyMax, newMeta, newRun, type Ev, type Harvest } from '../src/games/deck/rules';
import { ALL, o, POL } from './deck-policies';
import { GREEDY, readerDay, readerShop, type Reader } from './deck-players';

/**
 * Round 12: a season's take over its quota, as the take less the quota asked over the plain quota (the hitch's cut taken
 * back out): a hitch's cut now takes off the help's whole worth with its cost, and the take over the quota asked counted
 * the cut many times over. It reads the same on older builds, so before and after compare.
 */
function plainRatio(earned: number, quota: number, tw: R.Twist | null | undefined): number {
  const plain = quota / Math.max(0.1, 1 - R.twistEase(tw ?? null));
  return 1 + (earned - quota) / plain;
}

// The greedy player, one policy per engine. --read has it read the two clippings for its twist, not play them ahead.
const twistBy: Reader['twist'] = process.argv.includes('--read') ? 'read' : 'play';
const READERS: Record<string, Reader> = {
  gBees: { ...GREEDY, engine: 'bees', twist: twistBy },
  gHot: { ...GREEDY, engine: 'hot', twist: twistBy },
  gVines: { ...GREEDY, engine: 'vines', twist: twistBy },
  gTall: { ...GREEDY, engine: 'tall', twist: twistBy },
};
const SUMMARY: string[] = [];

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const runs = Number(args[0] ?? 30);
const first = Number(process.argv.find((a) => a.startsWith('--first='))?.split('=')[1] ?? 0);
const policies = args.slice(1);
const perSeason = process.argv.includes('--seasons');
const tuning = R.TUNING as typeof R.TUNING & { twists?: boolean; engineChoices?: number; engines?: boolean };
if (process.argv.includes('--noTwists')) tuning.twists = false;
// Round 7: the run's first stall offers all four engines here, so a policy committed to one can always take it.
if (tuning.engineChoices !== undefined) tuning.engineChoices = 4;
if (process.argv.includes('--noEngines')) tuning.engines = false;
// --tune=key:value plays any TUNING number; a value in brackets or braces is read as JSON (rows of quotas, levels).
for (const a of process.argv.filter((x) => x.startsWith('--tune='))) {
  const at = a.indexOf(':');
  const k = a.slice(7, at);
  const v = a.slice(at + 1);
  (tuning as unknown as Record<string, unknown>)[k] = /^[[{]/.test(v) ? JSON.parse(v) : Number(v);
}

const med = (a: number[]) => {
  const b = [...a].sort((x, y) => x - y);
  return b[b.length >> 1] ?? 0;
};
const pct = (n: number, d: number) => `${d ? Math.round((n / d) * 100) : 0}%`;

/**
 * The best harvest's recipe: its crop and where its bonuses came from (a sunflower by which side it stands on). The
 * twists' own bonuses (a buyer, a glut, good company) and the luck of the night (Market Day, the clover, pests, sun)
 * are left out, so a recipe changes only when the layout that pays best does.
 */
function recipe(h: Harvest): string {
  const skip = ['market', 'clover', 'pest', 'sun', 'company', 'buyer', 'glut'];
  const from = [...new Set([...h.chips, ...h.mult].filter((st) => !skip.includes(st.icon)).map((st) => (st.icon === 'sunflower' ? st.label : st.icon)))].sort();
  return `${h.kind}<${from.join(',')}>`;
}

/** What one bonus on a harvest added to its pay: a + to yield or bloom, or a x. */
function stepCoins(h: Harvest, st: Harvest['mult'][number], yieldStep: boolean): number {
  if (yieldStep) return st.op === '+' ? st.v * h.multTotal : 0;
  if (st.op === 'x') return h.score * (1 - 1 / st.v);
  const times = h.mult.filter((x) => x.op === 'x').reduce((a, x) => a * x.v, 1);
  return h.chipsTotal * st.v * times;
}

/**
 * Round 7: how hard a hitch on offer would hit the season just played, as a share of its take, read from that
 * season's harvests alone (so it runs on any build): a glut on its crop's coins (half of them), frost on the coins of
 * crops pulled up on the frosted row (they were sown there), sunflowers facing up on what the sunflowers' bloom added,
 * a page resting on what its bonuses added, and crows on the share of the take a scarecrow did not guard. A hitch
 * under 5% misses the build: a free quota cut.
 */
function hitchHit(t: { id: string; crop?: string; row?: number; page?: string }, season: Harvest[], s: R.RunState): number {
  const take = season.reduce((a, h) => a + h.score, 0) || 1;
  const sum = (f: (h: Harvest) => number) => season.reduce((a, h) => a + f(h), 0) / take;
  const steps = (icon: string) => sum((h) => h.mult.filter((st) => st.icon === icon).reduce((a, st) => a + stepCoins(h, st, false), 0) + h.chips.filter((st) => st.icon === icon).reduce((a, st) => a + stepCoins(h, st, true), 0));
  switch (t.id) {
    case 'glut':
      return 0.5 * sum((h) => (h.kind === t.crop ? h.score : 0));
    case 'frost': {
      const row = t.row ?? s.rows - 1;
      return sum((h) => (h.leaves && Math.floor(h.plot / s.cols) === row ? h.score : 0));
    }
    case 'sunup':
      return steps('sunflower');
    case 'rest':
      return steps(t.page ?? '');
    case 'crows': {
      // The extra crows a season of them brings, each taking one ripe crop no scarecrow guards: the mean of those.
      const open = season.filter((h) => !R.guarded(s, h.plot));
      if (!open.length) return 0;
      const n = R.nextSeason(s);
      const p = R.bySeason(R.TUNING.crowChance, n);
      const tune = R.TUNING as unknown as { crowTimes?: number; crowEvery?: number };
      const extra = R.TUNING.days * (Math.min(0.9, tune.crowEvery ?? p * (tune.crowTimes ?? 2)) - p);
      return (extra * (open.reduce((a, h) => a + h.score, 0) / open.length)) / take;
    }
  }
  return 1;
}

for (const name of policies.length ? policies : Object.keys(POL)) {
  const reader = READERS[name];
  const shop = reader ? (s: R.RunState, d: Dice) => readerShop(s, reader, d) : POL[name];
  if (!shop) throw new Error(`no policy ${name}`);
  const playDay = (s: R.RunState, d: Dice): Ev[] => (reader ? readerDay(s, reader, d) : botDay(s, o, d));
  // Round 11: the night each season of year 2 met its quota, and each night's pay in year 2.
  const y2Met: number[] = [];
  const y2Night: number[] = [];
  // Round 11: the cards a run plays on its first day, as a set (all four of the eleventh playtest's later runs opened
  // with the same move: carrot, radishes beside it, can).
  const openings = new Map<string, number>();
  const cleared: number[] = [];
  const unspent: number[] = [];
  // Round 8: take over quota by season, and the engine page's level when the run ends (runs at II or more, at III).
  const byK: number[][] = Array.from({ length: 12 }, () => []);
  const levels = [0, 0, 0];
  // Of the runs that reached year 3: the engine page at II or more, at III, and the coins left at the end of those lost.
  const late = { runs: 0, two: 0, three: 0, lost: [] as number[] };
  // Round 8: hitches aimed the same way as the stall before offered (the same twist on the same crop, row or page).
  let aimRepeats = 0;
  let aimRepeats2 = 0;
  let aimStalls = 0;
  let maxAim = 0;
  const ratio: number[][] = [[], [], []];
  const dawn: number[] = [];
  const played = new Array(12).fill(0);
  const met = new Array(12).fill(0);
  // Pattern changes, years 2 and 3: season pairs compared, and how many changed top crop and best recipe.
  let pairs = 0;
  let kindChanged = 0;
  let recipeChanged = 0;
  const kinds = new Map<string, number>();
  // Twists: stalls offering two, hitches picked, and per hitch on offer; per pair of twists, [offered, hitch picked].
  let stalls = 0;
  let hitches = 0;
  const byHitch = new Map<string, [number, number]>();
  const byPair = new Map<string, [number, number]>();
  // Crows on offer with a scarecrow standing, and without; a glut of a crop with a third of the run's coins, and less.
  const cond = { crowsGuarded: [0, 0], crowsBare: [0, 0], glutLean: [0, 0], glutLight: [0, 0] } as Record<string, [number, number]>;
  const bought = new Map<number, [number, number, number, number]>();
  // Scoops and cards left at dusk, by scoops above the usual refill: [days, scoops idle, cards left, days with 2 or more idle].
  const idle = new Map<number, [number, number, number, number]>();
  // Round 7: seasons after a hitch and after a help, [played, met]; hitches offered that miss the build, by hitch.
  const after = { hitch: [0, 0], boon: [0, 0] };
  const miss = new Map<string, [number, number]>();
  // Round 9: every single harvest of year 2 (its median, set against the other engines: does one snowball?), and the
  // coins a won run ends with.
  const y2h: number[] = [];
  const bestY2: number[] = [];
  const wonCoins: number[] = [];
  const t0 = performance.now();
  for (let i = first; i < first + runs; i++) {
    const meta = newMeta();
    meta.unlocked = [...ALL];
    const seed = 9000 + i * 7919;
    const { s } = newRun(seed, meta, false);
    const dice = new Dice((131 + i) ^ seed);
    let lastLog = 0;
    let coins: Record<string, number> = {};
    let best: Harvest | null = null;
    let prev: { kind: string; recipe: string } | null = null;
    let season: Harvest[] = [];
    let lastSeason: Harvest[] = [];
    let prevOffer: { id: string; crop?: string; row?: number; page?: string }[] = [];
    let prevOffer2: { id: string; crop?: string; row?: number; page?: string }[] = [];
    const aimCount = new Map<string, number>();
    let seasonBest = 0;
    const aimKey = (t: { id: string; crop?: string; row?: number; page?: string }) => `${t.id}:${t.crop ?? ''}:${t.row ?? ''}:${t.page ?? ''}`;
    const tally = (ev: Ev[]) => {
      for (const e of ev) {
        if (e.t === 'harvest') season.push(e.h);
        if (e.t === 'seasonEnd') {
          lastSeason = season;
          season = [];
        }
        if (e.t === 'harvest') {
          coins[e.h.kind] = (coins[e.h.kind] ?? 0) + e.h.score;
          if (!best || e.h.score > best.score) best = e.h;
        }
        if (e.t === 'seasonEnd') {
          const k = (e.year - 1) * 4 + e.season;
          const top = Object.entries(coins).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-';
          const now = { kind: top, recipe: best ? recipe(best) : '-' };
          if (k >= 4 && k < 12 && e.cleared) kinds.set(top, (kinds.get(top) ?? 0) + 1);
          if (prev && k >= 5 && k < 12) {
            pairs++;
            if (now.kind !== prev.kind) kindChanged++;
            if (now.recipe !== prev.recipe) recipeChanged++;
          }
          prev = now;
          coins = {};
          best = null;
        }
      }
    };
    for (let g = 0; g < 2000 && s.phase !== 'over'; g++) {
      if ((s.year - 1) * 4 + s.season >= 12) break;
      if (s.phase === 'shop') {
        const offer = s.shop?.twists?.map((t) => t.id) ?? [];
        const guarded = s.plots.some((p) => p.obj === 'scarecrow');
        const glutCrop = s.shop?.twists?.find((t) => t.id === 'glut')?.crop;
        const by = s.stats.byKind ?? {};
        const all = Object.values(by).reduce((a, b) => a + (b ?? 0), 0);
        const lean = !!glutCrop && (by[glutCrop] ?? 0) >= all / 3;
        const hitchOn = s.shop?.twists?.find((t) => !(R.BOONS as readonly string[]).includes(t.id));
        if (s.shop?.twists?.length) {
          aimStalls++;
          const now = s.shop.twists;
          const crop = (t: { id: string; crop?: string }) => (t.id === 'glut' || t.id === 'buyer' ? t.crop : undefined);
          if (now.some((t) => prevOffer.some((b) => aimKey(b) === aimKey(t) || (!!crop(t) && crop(t) === crop(b))))) aimRepeats++;
          // Round 9: a hitch aimed as the one two stalls back (frost on the same crop's row counts, whichever row).
          const same = (a: { id: string; crop?: string }, b: { id: string; crop?: string }) => aimKey(a) === aimKey(b) || (a.id === 'frost' && b.id === 'frost' && !!a.crop && a.crop === b.crop);
          if (now.some((t) => !(R.BOONS as readonly string[]).includes(t.id) && prevOffer2.some((b) => !(R.BOONS as readonly string[]).includes(b.id) && same(b, t)))) aimRepeats2++;
          for (const t of now) if (!(R.BOONS as readonly string[]).includes(t.id)) aimCount.set(aimKey(t), (aimCount.get(aimKey(t)) ?? 0) + 1);
          prevOffer2 = prevOffer;
          prevOffer = now.map((t) => ({ ...t }));
        }
        if (hitchOn && lastSeason.length) {
          const m = miss.get(hitchOn.id) ?? [0, 0];
          miss.set(hitchOn.id, [m[0] + 1, m[1] + (hitchHit(hitchOn, lastSeason, s) < 0.05 ? 1 : 0)]);
        }
        shop(s, dice);
        if (offer.length === 2 && s.twist) {
          const boon = offer.find((id) => (R.BOONS as readonly string[]).includes(id))!;
          const hitch = offer.find((id) => id !== boon)!;
          const took = s.twist.id === hitch ? 1 : 0;
          stalls++;
          hitches += took;
          const h = byHitch.get(hitch) ?? [0, 0];
          byHitch.set(hitch, [h[0] + 1, h[1] + took]);
          const p = byPair.get(`${boon}/${hitch}`) ?? [0, 0];
          byPair.set(`${boon}/${hitch}`, [p[0] + 1, p[1] + took]);
          const c = hitch === 'crows' ? cond[guarded ? 'crowsGuarded' : 'crowsBare'] : hitch === 'glut' ? cond[lean ? 'glutLean' : 'glutLight'] : null;
          if (c) {
            c[0]++;
            c[1] += took;
          }
        }
      } else {
        dawn.push(s.plots.filter((p) => p.crop).length);
        const bench = s.bench;
        const held = s.hand.length;
        // Scoops above the usual three each morning: Green Thumb, the Long Furrow and scoops bought for good.
        const extra = energyMax(s) - R.TUNING.energy;
        const kNow = (s.year - 1) * 4 + s.season;
        const dayNow = s.day;
        const ev = playDay(s, dice);
        if (kNow === 0 && dayNow === 1) {
          const set = ev.filter((e): e is Extract<Ev, { t: 'play' }> => e.t === 'play').map((e) => e.card.id).sort().join(' ');
          openings.set(set, (openings.get(set) ?? 0) + 1);
        }
        if (kNow >= 4 && kNow < 8) {
          y2Night.push(ev.reduce((a, e) => a + (e.t === 'harvest' ? e.h.score : 0), 0));
          for (const e of ev) {
            if (e.t === 'quota') y2Met.push(dayNow);
            if (e.t === 'harvest') {
              y2h.push(e.h.score);
              seasonBest = Math.max(seasonBest, e.h.score);
            }
            if (e.t === 'seasonEnd') {
              bestY2.push(seasonBest);
              seasonBest = 0;
            }
          }
        }
        // Up to dusk: scoops spent on plays (the shears put theirs back at once), cards played, drawn and tossed.
        let spent = 0;
        let left = held;
        for (const e of ev) {
          if (e.t === 'dusk') break;
          if (e.t === 'play') {
            spent += costOf(e.card.id, e.card.up);
            left--;
          }
          if (e.t === 'draw') left++;
          if (e.t === 'toss') left--;
          if (e.t === 'harvest' && e.h.shears) spent -= e.h.scoops;
        }
        const add = (m: Map<number, [number, number, number, number]>, k: number) => {
          const d = m.get(k) ?? [0, 0, 0, 0];
          m.set(k, [d[0] + 1, d[1] + (bench - spent), d[2] + left, d[3] + (bench - spent >= 2 ? 1 : 0)]);
        };
        add(idle, Math.min(extra, 3));
        add(bought, Math.min(s.scoops ?? 0, 2));
        tally(ev);
      }
      while (s.stats.log.length > lastLog) {
        const l = s.stats.log[lastLog++];
        const k = (l.year - 1) * 4 + l.season;
        if (k < 12) {
          played[k]++;
          if (l.cleared) met[k]++;
          if (l.twist) {
            const a = after[(R.BOONS as readonly string[]).includes(l.twist.id) ? 'boon' : 'hitch'];
            a[0]++;
            if (l.cleared) a[1]++;
          }
          ratio[l.year - 1].push(plainRatio(l.earned, l.quota, l.twist));
          byK[k].push(plainRatio(l.earned, l.quota, l.twist));
        }
      }
    }
    cleared.push(s.stats.seasonsCleared);
    unspent.push(s.coins);
    if (s.end?.won) wonCoins.push(s.coins);
    maxAim = Math.max(maxAim, ...aimCount.values(), 0);
    const st = s as R.RunState & { levels?: Record<string, number>; engine?: string | null };
    const lv = Math.max(0, ...Object.values(st.levels ?? {}));
    if (lv >= 2) levels[0]++;
    if (lv >= 3) levels[1]++;
    if (lv >= 4) levels[2]++;
    if (s.stats.seasonsCleared >= 8) {
      late.runs++;
      if (lv >= 2) late.two++;
      if (lv >= 3) late.three++;
      if (s.stats.seasonsCleared < 12) late.lost.push(s.coins);
    }
  }
  const y = (n: number) => `${((cleared.filter((c) => c >= n).length / runs) * 100).toFixed(0)}%`.padStart(4);
  console.log(
    `${name.padEnd(17)} clear Y1 ${y(4)}  Y2 ${y(8)}  Y3 ${y(12)}  wins ${y(12)}  take/quota median Y1 ${med(ratio[0]).toFixed(2)} Y2 ${med(ratio[1]).toFixed(2)} Y3 ${med(ratio[2]).toFixed(2)}  crops@dawn ${(dawn.reduce((a, b) => a + b, 0) / dawn.length).toFixed(1)}  coins left ${med(unspent)}  pattern changes Y2-3: top crop ${pct(kindChanged, pairs)}, best recipe ${pct(recipeChanged, pairs)} (${pairs} pairs)  (${runs} runs, ${((performance.now() - t0) / runs / 1000).toFixed(1)} s a run)`,
  );
  {
    const mixed = [...byPair.values()].filter(([n, h]) => n >= 4 && h / n >= 0.1 && h / n <= 0.9).length;
    const often = [...byPair.values()].filter(([n]) => n >= 4).length;
    const hs = [...byHitch.entries()].sort().map(([id, [n, h]]) => `${id} ${pct(h, n)}`).join(', ');
    const cp = (k: string) => `${pct(cond[k][1], cond[k][0])} of ${cond[k][0]}`;
    const ms = [...miss.entries()].sort().map(([id, [n, m]]) => `${id} ${pct(m, n)} of ${n}`).join(', ');
    const mAll = [...miss.values()].reduce((a, [n, m]) => [a[0] + n, a[1] + m], [0, 0]);
    console.log(`${''.padEnd(17)} round 7: seasons met after the hitch ${pct(after.hitch[1], after.hitch[0])} of ${after.hitch[0]}, after the help ${pct(after.boon[1], after.boon[0])} of ${after.boon[0]}; hitches offered that miss the build (under 5% of last season's take) ${pct(mAll[1], mAll[0])} of ${mAll[0]} (${ms})`);
    console.log(`${''.padEnd(17)} twists: the hitch picked at ${pct(hitches, stalls)} of ${stalls} stalls (${hs}); pairs picked both ways ${mixed} of ${often} seen 4+ times; crows with a scarecrow standing ${cp('crowsGuarded')}, without ${cp('crowsBare')}; a glut of a crop with a third of the coins ${cp('glutLean')}, less ${cp('glutLight')}`);
    const days = (m: Map<number, [number, number, number, number]>, k: number) => {
      const d = m.get(k);
      return d ? `${(d[1] / d[0]).toFixed(1)} scoops idle, ${pct(d[3], d[0])} of days 2+, ${(d[2] / d[0]).toFixed(1)} cards left (${d[0]} days)` : '-';
    };
    console.log(`${''.padEnd(17)} at dusk, by scoops bought for good: none ${days(bought, 0)}; one ${days(bought, 1)}; two or more ${days(bought, 2)}`);
    console.log(`${''.padEnd(17)} at dusk, by scoops above the usual three a morning: none ${days(idle, 0)}; one ${days(idle, 1)}; two ${days(idle, 2)}; three or more ${days(idle, 3)}`);
  }
  console.log(`${''.padEnd(17)} round 8: of the runs that reached year 3 (${late.runs}), the engine page at II or more ${pct(late.two, late.runs)}, at III ${pct(late.three, late.runs)}; coins left when one of those was lost: median ${med(late.lost)} (${late.lost.length} runs)`);
  console.log(`${''.padEnd(17)} round 8: the engine page at II or more when the run ends ${pct(levels[0], runs)}, at III ${pct(levels[1], runs)}, at IV ${pct(levels[2], runs)}; coins left at the end median ${med(unspent)}, p90 ${[...unspent].sort((a, b) => a - b)[Math.floor(runs * 0.9)] ?? 0}; stalls offering a twist aimed as the stall before ${pct(aimRepeats, aimStalls)} of ${aimStalls}, a hitch aimed as the one two stalls back ${pct(aimRepeats2, aimStalls)}; the most one hitch was offered in a run ${maxAim}`);
  {
    const meds = byK.map((a) => (a.length ? med(a) : 0));
    const top = Math.max(...meds);
    const p90 = [...y2h].sort((a, b) => a - b)[Math.floor(y2h.length * 0.9)] ?? 0;
    console.log(`${''.padEnd(17)} round 9: the most a season's median take over quota reached ${top.toFixed(2)} (season ${meds.indexOf(top) + 1}); a single harvest in year 2: median ${med(y2h)}, p90 ${p90} (${y2h.length} harvests), a season's best median ${med(bestY2)}; coins at the end of a won run: median ${med(wonCoins)} (${wonCoins.length} runs), of every run ${med(unspent)}`);
  }
  {
    const meds = byK.map((a) => (a.length ? med(a) : 0));
    const top = Math.max(...meds);
    const sorted = [...y2h].sort((a, b) => a - b);
    const nights = [...y2Night].sort((a, b) => a - b);
    const early = y2Met.filter((d) => d <= 2).length;
    const open = [...openings.entries()].sort((a, b) => b[1] - a[1]);
    const openTop = open[0] ? `${Math.round((open[0][1] / runs) * 100)}% ${open[0][0]}` : '-';
    SUMMARY.push(`${name.padEnd(8)} ${y(4)} ${y(8)} ${y(12)}   ${meds.slice(4, 8).map((v) => v.toFixed(2)).join(' ')}   ${top.toFixed(2)} (season ${meds.indexOf(top) + 1})   ${String(med(y2Met) || '-').padStart(5)} ${pct(early, y2Met.length).padStart(4)}   ${pct(hitches, stalls).padStart(4)}   ${String(sorted[Math.floor(sorted.length * 0.5)] ?? 0).padStart(4)} ${String(sorted[sorted.length - 1] ?? 0).padStart(5)}   ${String(nights[nights.length - 1] ?? 0).padStart(5)}   ${String(med(unspent)).padStart(6)}   ${open.length} openings, most ${openTop}`);
  }
  if (perSeason) {
    console.log(`${''.padEnd(17)} per season: ${played.map((p, k) => (p ? `${Math.round((met[k] / p) * 100)}%` : '-')).join(' ')}`);
    console.log(`${''.padEnd(17)} take/quota median by season: ${byK.map((a) => (a.length ? med(a).toFixed(2) : '-')).join(' ')}`);
    console.log(`${''.padEnd(17)} top crops of the seasons met in years 2 and 3: ${[...kinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  }
}
console.log('\npolicy     Y1   Y2 wins   year 2 take/quota by season   top median         met on, by night 2  hitch   y2 harvest med, max   y2 best night   coins left   first days');
for (const l of SUMMARY) console.log(l);
