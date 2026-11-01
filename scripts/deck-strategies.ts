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
// It uses only the bot and the rules' public calls, so the same file runs
// against an older build (copy it into a `git archive` of the commit).
// npx tsx scripts/deck-strategies.ts [runs] [policy...] [--seasons] [--noTwists] [--first=n]
import { botDay, Dice } from '../src/games/deck/bot';
import * as R from '../src/games/deck/rules';
import { newMeta, newRun, type Ev, type Harvest } from '../src/games/deck/rules';
import { ALL, o, POL } from './deck-policies';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const runs = Number(args[0] ?? 30);
const first = Number(process.argv.find((a) => a.startsWith('--first='))?.split('=')[1] ?? 0);
const policies = args.slice(1);
const perSeason = process.argv.includes('--seasons');
const tuning = R.TUNING as typeof R.TUNING & { twists?: boolean };
if (process.argv.includes('--noTwists')) tuning.twists = false;

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

for (const name of policies.length ? policies : Object.keys(POL)) {
  const shop = POL[name];
  if (!shop) throw new Error(`no policy ${name}`);
  const cleared: number[] = [];
  const unspent: number[] = [];
  const ratio: number[][] = [[], [], []];
  const dawn: number[] = [];
  const played = new Array(12).fill(0);
  const met = new Array(12).fill(0);
  // Pattern changes, years 2 and 3: season pairs compared, and how many changed top crop and best recipe.
  let pairs = 0;
  let kindChanged = 0;
  let recipeChanged = 0;
  const kinds = new Map<string, number>();
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
    const tally = (ev: Ev[]) => {
      for (const e of ev) {
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
      if (s.phase === 'shop') shop(s, dice);
      else {
        dawn.push(s.plots.filter((p) => p.crop).length);
        tally(botDay(s, o, dice));
      }
      while (s.stats.log.length > lastLog) {
        const l = s.stats.log[lastLog++];
        const k = (l.year - 1) * 4 + l.season;
        if (k < 12) {
          played[k]++;
          if (l.cleared) met[k]++;
          ratio[l.year - 1].push(l.earned / l.quota);
        }
      }
    }
    cleared.push(s.stats.seasonsCleared);
    unspent.push(s.coins);
  }
  const y = (n: number) => `${((cleared.filter((c) => c >= n).length / runs) * 100).toFixed(0)}%`.padStart(4);
  console.log(
    `${name.padEnd(17)} clear Y1 ${y(4)}  Y2 ${y(8)}  Y3 ${y(12)}  wins ${y(12)}  take/quota median Y1 ${med(ratio[0]).toFixed(2)} Y2 ${med(ratio[1]).toFixed(2)} Y3 ${med(ratio[2]).toFixed(2)}  crops@dawn ${(dawn.reduce((a, b) => a + b, 0) / dawn.length).toFixed(1)}  coins left ${med(unspent)}  pattern changes Y2-3: top crop ${pct(kindChanged, pairs)}, best recipe ${pct(recipeChanged, pairs)} (${pairs} pairs)  (${runs} runs, ${((performance.now() - t0) / runs / 1000).toFixed(1)} s a run)`,
  );
  if (perSeason) {
    console.log(`${''.padEnd(17)} per season: ${played.map((p, k) => (p ? `${Math.round((met[k] / p) * 100)}%` : '-')).join(' ')}`);
    console.log(`${''.padEnd(17)} top crops of the seasons met in years 2 and 3: ${[...kinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  }
}
