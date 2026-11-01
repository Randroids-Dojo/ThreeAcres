// Seedbound quota fitting: plays runs with every quota at 1 (so every run sees
// every season), then prints, per season, the take a target share of runs
// reaches. Set the quotas from these, then confirm with deck-seasons.ts.
// npx tsx scripts/deck-tune.ts [runs] [noise] [--guided]
import { playRun } from '../src/games/deck/bot';
import { SEASON_NAMES, TUNING } from '../src/games/deck/rules';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const runs = Number(args[0] ?? 120);
const noise = Number(args[1] ?? 0.15);
const guided = process.argv.includes('--guided');
TUNING.quotas = [0.01, 0.01, 0.01, 0.01];
TUNING.quotas2 = [0.01, 0.01, 0.01, 0.01];
TUNING.quotas3 = [0.01, 0.01, 0.01, 0.01];
TUNING.guidedQuota = 0.01;
// The pass rate the shipped game aims for in each season of years 1 to 3 (decent bot). A person who plans
// the plot a few days ahead does better than the bot, so these sit a little under what a player should feel.
const target = [0.95, 0.92, 0.9, 0.9, 0.9, 0.88, 0.86, 0.86, 0.85, 0.8, 0.75, 0.7];
const takes: number[][] = Array.from({ length: 12 }, () => []);
for (let i = 0; i < runs; i++) {
  const r = playRun(1000 + i * 7919, null, { noise, seed: 77 + i, guided }, 12);
  for (const s of r.seasons) {
    const k = (s.year - 1) * 4 + s.season;
    if (k < 12) takes[k].push(s.earned);
  }
}
console.log(`${runs} runs, noise ${noise}${guided ? ', guided first run' : ''}, quotas free`);
console.log('season            p50   take that the target share reaches');
for (let k = 0; k < 12; k++) {
  const t = takes[k].sort((a, b) => a - b);
  const q = (f: number) => t[Math.min(t.length - 1, Math.max(0, Math.floor(t.length * f)))];
  console.log(`year ${Math.floor(k / 4) + 1} ${SEASON_NAMES[k % 4].padEnd(7)} ${String(q(0.5)).padStart(6)}   ${Math.round(target[k] * 100)}%: ${q(1 - target[k])}`);
}
