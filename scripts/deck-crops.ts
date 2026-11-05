// Seedbound, round 10: does each engine change what you plant? For each engine policy (the strategy table's, whole
// catalogue, all four engines on offer) this plays whole runs and reads every season's harvests from year 1 summer (the
// first season with an engine) to the end:
//   - the share of each season's take by crop (the median over seasons, and the crops' share of the run's coins);
//   - the share from radishes and carrots (the root ring every engine used to multiply);
//   - the share from the engine's own crops: its own cards' crops (chilies, beans and strawberries, corn) and any other
//     crop but a radish or a carrot its page touched (its bonus on the slip: Busy Bees, Trellis, Tall Rows, a chili's
//     bloom with Hot Beds kept); and the share its bonus took on radishes and carrots (the root ring, multiplied);
//   - the share of seasons whose top crop is the engine's: the engine's own crop, or a crop other than a radish or a
//     carrot that took most of its coins with the engine's bonus on it (the bees' crops are whatever stands by a hive);
//   - the top crop's spread over seasons (is it the same crop every season?);
//   - the biggest single harvest's share of its season (feast or famine), and the share of seasons the engine's own
//     crop took under a tenth of the take, or came in once or not at all (famine);
//   - year 1 summer, the engine's first season: its take over quota, the engine's crops' share, and its best harvest
//     (the tenth playtest's Hot Beds previewed a carrot at 8 and a strawberry at 10 and missed by 1).
//   - round 11, feast or famine: each night's pay over what a night of its season has to take (its quota over six), per
//     year: the low, the median and the high (10th and 90th percentiles), and the share of nights under a third of it.
//     The eleventh playtest's Tall Rows paid a 144 corn on its first summer night, 173 of 410 in all, and its autumn nights
//     were 28, 70, 109, 65, 135, 14. gBees, gHot, gVines and gTall play the same as the greedy preview-following player.
// It uses only the bot and the rules' harvest events, so it runs on an older build too (copy it into a `git archive`).
// npx tsx scripts/deck-crops.ts [runs] [policy...] [--first=n] [--tune=key:value]
import { botDay, Dice } from '../src/games/deck/bot';
import * as R from '../src/games/deck/rules';
import { newMeta, newRun, type Harvest } from '../src/games/deck/rules';
import { ALL, o, POL } from './deck-policies';
import { GREEDY, readerDay, readerShop, type Reader } from './deck-players';

const READERS: Record<string, Reader> = {
  gBees: { ...GREEDY, engine: 'bees' },
  gHot: { ...GREEDY, engine: 'hot' },
  gVines: { ...GREEDY, engine: 'vines' },
  gTall: { ...GREEDY, engine: 'tall' },
};

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const runs = Number(args[0] ?? 40);
const first = Number(process.argv.find((a) => a.startsWith('--first='))?.split('=')[1] ?? 0);
const policies = args.slice(1);
const tuning = R.TUNING as typeof R.TUNING & { engineChoices?: number };
if (tuning.engineChoices !== undefined) tuning.engineChoices = 4;
for (const a of process.argv.filter((x) => x.startsWith('--tune='))) {
  const at = a.indexOf(':');
  const k = a.slice(7, at);
  const v = a.slice(at + 1);
  const t = tuning as unknown as Record<string, unknown>;
  const val = /^[[{]|^(true|false)$/.test(v) ? JSON.parse(v) : Number(v);
  // An object merges into the one there ({"bees":[1.6,1.9,2.2]} sets the bees' levels only).
  t[k] = val && typeof val === 'object' && !Array.isArray(val) ? { ...(t[k] as object), ...val } : val;
}

/** Each engine policy's page, the icon its bonus shows on a slip, and its own cards' crops. */
const ENGINE: Record<string, { page: string; icons: string[]; own: string[] }> = {
  eBees: { page: 'bees', icons: ['bees'], own: [] },
  eHot: { page: 'hot', icons: ['hot'], own: ['chili'] },
  eVines: { page: 'vines', icons: ['vines'], own: ['beans', 'strawberry'] },
  eTall: { page: 'tall', icons: ['tall'], own: ['corn'] },
  gBees: { page: 'bees', icons: ['bees'], own: [] },
  gHot: { page: 'hot', icons: ['hot'], own: ['chili'] },
  gVines: { page: 'vines', icons: ['vines'], own: ['beans', 'strawberry'] },
  gTall: { page: 'tall', icons: ['tall'], own: ['corn'] },
};
const ROOTS = ['radish', 'carrot'];

const med = (a: number[]) => {
  const b = [...a].sort((x, y) => x - y);
  return b[b.length >> 1] ?? 0;
};
const pct = (v: number) => `${Math.round(v * 100)}%`;

for (const name of policies.length ? policies : Object.keys(ENGINE).filter((n) => !READERS[n])) {
  const reader = READERS[name];
  const shop = reader ? (st: R.RunState, d: Dice) => readerShop(st, reader, d) : POL[name];
  if (!shop) throw new Error(`no policy ${name}`);
  const eng = ENGINE[name] ?? { page: '', icons: [], own: [] };
  // Is this harvest the engine's: its page's bonus is on the slip, or (Hot Beds) a chili's bloom with the page kept.
  const touched = (h: Harvest, pages: readonly string[]) =>
    [...h.chips, ...h.mult].some((st) => eng.icons.includes(st.icon) || (eng.page === 'hot' && st.icon === 'chili' && pages.includes('hot'))) || (eng.page === 'hot' && h.kind === 'chili' && pages.includes('hot'));
  const shareRoots: number[] = [];
  const shareOnRoots: number[] = [];
  const shareEngine: number[] = [];
  const shareOwn: number[] = [];
  const topKinds = new Map<string, number>();
  let seasons = 0;
  let led = 0;
  let famine = 0;
  let scarce = 0;
  // Year 1 from summer: seasons, and those whose own crop came in once or not at all (the tenth playtest's autumn corn).
  let y1Seasons = 0;
  let y1Scarce = 0;
  const opening = { ratio: [] as number[], own: [] as number[], best: [] as number[], ownBest: [] as number[] };
  const bigShare: number[] = [];
  // Round 11: each night's pay over what a night of its season has to take, by year.
  const nights: number[][] = [[], [], []];
  const runKinds = new Map<string, number>();
  let runCoins = 0;
  let wins = 0;
  let y1 = 0;
  const t0 = performance.now();
  for (let i = first; i < first + runs; i++) {
    const meta = newMeta();
    meta.unlocked = [...ALL];
    const seed = 9000 + i * 7919;
    const { s } = newRun(seed, meta, false);
    const dice = new Dice((131 + i) ^ seed);
    let season: Harvest[] = [];
    let touchedCoins = 0;
    for (let g = 0; g < 2000 && s.phase !== 'over'; g++) {
      if ((s.year - 1) * 4 + s.season >= 12) break;
      if (s.phase === 'shop') {
        shop(s, dice);
        continue;
      }
      const k = (s.year - 1) * 4 + s.season;
      const pages = [...s.pages];
      const need = s.quota / R.TUNING.days;
      const ev = reader ? readerDay(s, reader, dice) : botDay(s, o, dice);
      if (k >= 1) nights[Math.floor(k / 4)].push(ev.reduce((a, e) => a + (e.t === 'harvest' ? e.h.score : 0), 0) / Math.max(1, need));
      for (const e of ev) {
        if (e.t === 'harvest') {
          season.push(e.h);
          if (touched(e.h, pages)) touchedCoins += e.h.score;
        }
        if (e.t === 'seasonEnd') {
          if (k >= 1) {
            const take = season.reduce((a, h) => a + h.score, 0);
            if (take > 0) {
              seasons++;
              const by = new Map<string, number>();
              const byT = new Map<string, number>();
              for (const h of season) {
                by.set(h.kind, (by.get(h.kind) ?? 0) + h.score);
                if (touched(h, pages)) byT.set(h.kind, (byT.get(h.kind) ?? 0) + h.score);
                runKinds.set(h.kind, (runKinds.get(h.kind) ?? 0) + h.score);
                runCoins += h.score;
              }
              const roots = ROOTS.reduce((a, r) => a + (by.get(r) ?? 0), 0);
              shareRoots.push(roots / take);
              shareEngine.push(touchedCoins / take);
              const own = season.filter((h) => eng.own.includes(h.kind) || (!ROOTS.includes(h.kind) && touched(h, pages))).reduce((a, h) => a + h.score, 0);
              shareOwn.push(own / take);
              shareOnRoots.push(season.filter((h) => ROOTS.includes(h.kind) && touched(h, pages)).reduce((a, h) => a + h.score, 0) / take);
              const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0][0];
              topKinds.set(top, (topKinds.get(top) ?? 0) + 1);
              // The top crop is the engine's: its own crop, or a crop (not a root) that took most of its coins with the engine's bonus.
              if (eng.own.includes(top) || (!ROOTS.includes(top) && (byT.get(top) ?? 0) >= 0.5 * (by.get(top) ?? 0))) led++;
              if (eng.own.length && eng.own.reduce((a, c) => a + (by.get(c) ?? 0), 0) < 0.1 * take) famine++;
              if (eng.own.length && season.filter((h) => eng.own.includes(h.kind)).length <= 1) scarce++;
              if (k < 4) {
                y1Seasons++;
                if (eng.own.length && season.filter((h) => eng.own.includes(h.kind)).length <= 1) y1Scarce++;
              }
              if (k === 1) {
                const l = s.stats.log[s.stats.log.length - 1];
                if (l) opening.ratio.push(l.earned / l.quota);
                opening.own.push(own / take);
                opening.best.push(Math.max(...season.map((h) => h.score)));
                const mine = season.filter((h) => eng.own.includes(h.kind) || (!ROOTS.includes(h.kind) && touched(h, pages)));
                opening.ownBest.push(mine.length ? Math.max(...mine.map((h) => h.score)) : 0);
              }
              bigShare.push(Math.max(...season.map((h) => h.score)) / take);
            }
          }
          season = [];
          touchedCoins = 0;
        }
      }
    }
    if (s.stats.seasonsCleared >= 4) y1++;
    if (s.end?.won) wins++;
  }
  const tops = [...topKinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${pct(n / seasons)}`).join(', ');
  const kinds = [...runKinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ${pct(n / runCoins)}`).join(', ');
  const p90 = [...bigShare].sort((a, b) => a - b)[Math.floor(bigShare.length * 0.9)] ?? 0;
  console.log(`${name.padEnd(7)} ${runs} runs (${((performance.now() - t0) / runs / 1000).toFixed(1)} s a run), ${seasons} seasons from year 1 summer; Y1 ${pct(y1 / runs)}, wins ${pct(wins / runs)}`);
  console.log(`        the engine's crops top the season ${pct(led / Math.max(1, seasons))}; a season's take, median share: the engine's crops ${pct(med(shareOwn))}, radishes and carrots ${pct(med(shareRoots))}, the engine's bonus on them ${pct(med(shareOnRoots))} (its bonus on any slip ${pct(med(shareEngine))})`);
  console.log(`        top crop by season: ${tops}`);
  console.log(`        share of all coins: ${kinds}`);
  console.log(`        the biggest harvest's share of its season: median ${pct(med(bigShare))}, p90 ${pct(p90)}${eng.own.length ? `; seasons the engine's own crop took under a tenth ${pct(famine / Math.max(1, seasons))}, came in once or not at all ${pct(scarce / Math.max(1, seasons))} (year 1 ${pct(y1Scarce / Math.max(1, y1Seasons))})` : ''}`);
  console.log(`        year 1 summer: take over quota median ${med(opening.ratio).toFixed(2)}, the engine's crops ${pct(med(opening.own))} of it, best harvest median ${med(opening.best)} (the engine's crops' best ${med(opening.ownBest)})`);
  const at = (a: number[], q: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * q)] ?? 0;
  console.log(`        each night's pay over a night's share of the quota: ${nights.map((a, y) => `year ${y + 1} low ${at(a, 0.1).toFixed(2)} median ${at(a, 0.5).toFixed(2)} high ${at(a, 0.9).toFixed(2)}, under a third ${pct(a.filter((v) => v < 1 / 3).length / Math.max(1, a.length))}`).join('; ')}`);
}
