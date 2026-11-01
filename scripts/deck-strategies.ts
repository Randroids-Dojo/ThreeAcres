// Seedbound's strategy table: the balance bot plays every day and only the
// stall policy changes, with the whole catalogue unlocked. This is the fourth
// playtest's simulation (/tmp/playtest4/deck/sim.mts) brought into the repo,
// with the win rate (every season of years 1 to 3 met) and per-year clears.
// It uses only the bot and the rules' public calls, so the same file runs
// against an older build (copy it into a `git archive` of the commit).
// npx tsx scripts/deck-strategies.ts [runs] [policy...] [--seasons]
import { botDay, Dice } from '../src/games/deck/bot';
import { newMeta, newRun } from '../src/games/deck/rules';
import { ALL, o, POL } from './deck-policies';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const runs = Number(args[0] ?? 30);
const policies = args.slice(1);
const perSeason = process.argv.includes('--seasons');

const med = (a: number[]) => {
  const b = [...a].sort((x, y) => x - y);
  return b[b.length >> 1] ?? 0;
};

for (const name of policies.length ? policies : Object.keys(POL)) {
  const shop = POL[name];
  if (!shop) throw new Error(`no policy ${name}`);
  const cleared: number[] = [];
  const unspent: number[] = [];
  const ratio: number[][] = [[], [], []];
  const dawn: number[] = [];
  const played = new Array(12).fill(0);
  const met = new Array(12).fill(0);
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) {
    const meta = newMeta();
    meta.unlocked = [...ALL];
    const seed = 9000 + i * 7919;
    const { s } = newRun(seed, meta, false);
    const dice = new Dice((131 + i) ^ seed);
    let lastLog = 0;
    for (let g = 0; g < 2000 && s.phase !== 'over'; g++) {
      if ((s.year - 1) * 4 + s.season >= 12) break;
      if (s.phase === 'shop') shop(s, dice);
      else {
        dawn.push(s.plots.filter((p) => p.crop).length);
        botDay(s, o, dice);
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
    `${name.padEnd(13)} clear Y1 ${y(4)}  Y2 ${y(8)}  Y3 ${y(12)}  wins ${y(12)}  take/quota median Y1 ${med(ratio[0]).toFixed(2)} Y2 ${med(ratio[1]).toFixed(2)} Y3 ${med(ratio[2]).toFixed(2)}  crops@dawn ${(dawn.reduce((a, b) => a + b, 0) / dawn.length).toFixed(1)}  coins left ${med(unspent)}  (${runs} runs, ${((performance.now() - t0) / runs / 1000).toFixed(1)} s a run)`,
  );
  if (perSeason) console.log(`${''.padEnd(13)} per season: ${played.map((p, k) => (p ? `${Math.round((met[k] / p) * 100)}%` : '-')).join(' ')}`);
}
