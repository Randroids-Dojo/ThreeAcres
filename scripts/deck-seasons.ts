// Seedbound, season by season: the bot plays whole runs and this reports, for
// each season of years 1 to 3, the share of runs that met it (of those that
// got there), the crops standing at its first dawn, what its first two nights
// took, and how many coins the runs ended with unspent. It runs the decent bot
// (noise 0.15), the strict bot (0) and the guided first run side by side, so a
// change to the rules reads against all three at once. It only uses the bot
// and the rules' public calls, so the same file runs against an older build.
// npx tsx scripts/deck-seasons.ts [runs] [--only=decent|strict|guided]
import { botDay, botShop, Dice } from '../src/games/deck/bot';
import { newRun, SEASON_NAMES } from '../src/games/deck/rules';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const runs = Number(args[0] ?? 200);
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
const K = 12;

interface Tally {
  played: number[];
  cleared: number[];
  dawn: number[][];
  night1: number[][];
  night2: number[][];
  unspent: number[];
  ratio: number[][];
  take: number[][];
  quota: number[];
  slots: number[];
  pages: number[];
  kept: number[];
}

function play(noise: number, guided: boolean): Tally {
  const t: Tally = {
    played: new Array(K).fill(0),
    cleared: new Array(K).fill(0),
    dawn: Array.from({ length: K }, () => []),
    night1: Array.from({ length: K }, () => []),
    night2: Array.from({ length: K }, () => []),
    unspent: [],
    ratio: Array.from({ length: K }, () => []),
    take: Array.from({ length: K }, () => []),
    quota: new Array(K).fill(0),
    slots: [],
    pages: [],
    kept: [],
  };
  for (let i = 0; i < runs; i++) {
    const seed = 1000 + i * 7919;
    const o = { noise, seed: 77 + i, guided };
    const { s } = newRun(seed, null, guided);
    const dice = new Dice(o.seed ^ seed);
    for (let guard = 0; guard < 800 && s.phase !== 'over'; guard++) {
      const k = (s.year - 1) * 4 + s.season;
      if (k >= K) break;
      if (s.phase === 'shop') {
        botShop(s, o, dice);
        // Coins left in the purse on leaving the stall that opens year 2 summer and later: what found no use.
        if (k >= 5) t.kept.push(s.coins);
        continue;
      }
      if (s.day === 1) t.dawn[k].push(s.plots.filter((p) => p.crop).length);
      const day = s.day;
      const before = s.earned;
      const ev = botDay(s, o, dice);
      const end = ev.find((e) => e.t === 'seasonEnd');
      const took = end && end.t === 'seasonEnd' ? end.earned - before : s.earned - before;
      if (day === 1) t.night1[k].push(took);
      if (day === 2) t.night2[k].push(took);
      if (end && end.t === 'seasonEnd') {
        t.played[k]++;
        if (end.cleared) t.cleared[k]++;
        t.ratio[k].push(end.earned / end.quota);
        t.take[k].push(end.earned);
        t.quota[k] = end.quota;
      }
    }
    t.unspent.push(s.coins);
    t.slots.push((s as { slots?: number }).slots ?? 0);
    t.pages.push(s.pages.length);
  }
  return t;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const med = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

const bots: [string, number, boolean][] = [
  ['decent', 0.15, false],
  ['strict', 0, false],
  ['guided', 0.15, true],
];
for (const [name, noise, guided] of bots) {
  if (only && only !== name) continue;
  const t0 = performance.now();
  const t = play(noise, guided);
  console.log(`\n${name} bot (noise ${noise}${guided ? ', guided first run' : ''}), ${runs} runs, ${((performance.now() - t0) / runs).toFixed(0)} ms a run`);
  console.log('season            played  pass  quota  median take  earned/quota  crops at first dawn  night 1  night 2');
  for (let k = 0; k < K; k++) {
    if (!t.played[k]) continue;
    const label = `year ${Math.floor(k / 4) + 1} ${SEASON_NAMES[k % 4]}`.padEnd(17);
    console.log(
      `${label} ${String(t.played[k]).padStart(6)}  ${((t.cleared[k] / t.played[k]) * 100).toFixed(0).padStart(3)}%  ${String(t.quota[k]).padStart(5)}  ${String(med(t.take[k])).padStart(11)}  ${med(t.ratio[k]).toFixed(2).padStart(12)}  ${mean(t.dawn[k]).toFixed(1).padStart(19)}  ${med(t.night1[k]).toFixed(0).padStart(7)}  ${med(t.night2[k]).toFixed(0).padStart(7)}`,
    );
  }
  for (const y of [1, 2, 3]) {
    const n = t.played[y * 4 - 1] ? t.cleared[y * 4 - 1] : 0;
    console.log(`cleared year ${y}: ${((n / runs) * 100).toFixed(0)}%`);
  }
  console.log(`coins unspent when the run ends: median ${med(t.unspent)}, mean ${mean(t.unspent).toFixed(0)}, max ${Math.max(...t.unspent)}`);
  console.log(`coins left on leaving a stall from year 2 summer on: median ${med(t.kept)}, p90 ${[...t.kept].sort((a, b) => a - b)[Math.floor(t.kept.length * 0.9)] ?? 0}`);
  console.log(`pages kept at the end: mean ${mean(t.pages).toFixed(1)}, max ${Math.max(...t.pages)}; page slots bought: ${t.slots.filter((n) => n > 0).length} runs, max ${Math.max(...t.slots)}`);
}
