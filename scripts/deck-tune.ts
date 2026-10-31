// Seedbound quota fitting: plays runs with every quota at 1 (so every run sees
// every season), then prints, per season, the take a target share of runs
// reaches. Set the quotas from these, then confirm with deck-balance.ts.
// npx tsx scripts/deck-tune.ts [runs] [noise]
import { playRun } from '../src/games/deck/bot';
import { SEASON_NAMES, TUNING } from '../src/games/deck/rules';

const runs = Number(process.argv[2] ?? 120);
const noise = Number(process.argv[3] ?? 0.15);
TUNING.quotas = [0.01, 0.01, 0.01, 0.01];
// The pass rate the shipped game aims for in each season of years 1 to 3 (decent bot).
const target = [1.0, 0.96, 0.93, 0.94, 0.94, 0.91, 0.9, 0.78, 0.85, 0.7, 0.59, 0.33];
const takes: number[][] = Array.from({ length: 12 }, () => []);
for (let i = 0; i < runs; i++) {
  const r = playRun(1000 + i * 7919, null, { noise, seed: 77 + i }, 12);
  for (const s of r.seasons) {
    const k = (s.year - 1) * 4 + s.season;
    if (k < 12) takes[k].push(s.earned);
  }
}
console.log('season            p50   take that the target share reaches');
for (let k = 0; k < 12; k++) {
  const t = takes[k].sort((a, b) => a - b);
  const q = (f: number) => t[Math.min(t.length - 1, Math.max(0, Math.floor(t.length * f)))];
  console.log(`year ${Math.floor(k / 4) + 1} ${SEASON_NAMES[k % 4].padEnd(7)} ${String(q(0.5)).padStart(6)}   ${Math.round(target[k] * 100)}%: ${q(1 - target[k])}`);
}
